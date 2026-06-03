'use strict';

var fs = require('fs');
var path = require('path');
var util = require('util');

var colors = require('colors/safe');

var DEFAULT_LOG_PATH = path.join(__dirname, 'logs-mainnet', 'adamant.log');
var DEFAULT_FILE_LOG_LEVEL = 'log';
var DEFAULT_CONSOLE_LOG_LEVEL = 'info';
var DEFAULT_MAX_SIZE = '500M';
var DEFAULT_RETAIN = 5;
var DEFAULT_ROTATE_INTERVAL = '0 0 0 1 *';
var DEFAULT_ROTATION_CHECK_INTERVAL = 60000;
var DEFAULT_NAMESPACE = 'runtime';

var secretKeyPattern = /(secret|password|passphrase|privatekey|private_key|token|apikey|api_key|authorization|auth)/i;

var stdErrorLogLevels = new Set(['warn', 'error', 'fatal']);

var logColors = {
  none: 'bgGray',
  trace: 'bgWhite',
  debug: 'bgCyan',
  log: 'bgBlue',
  info: 'bgBlue',
  warn: 'bgYellow',
  error: 'bgRed',
  fatal: 'bgMagenta'
};

var namespaceColors = [
  'black',
  'yellow',
  'blue',
  'green',
  'magenta',
  'cyan',
  'white',
  'brightGreen',
  'gray',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite',
  'grey',
  'brightGreen',
  'brightBlue',
  'brightCyan'
];

var defaultLogLevels = {
  none: 99,
  trace: 0,
  debug: 1,
  log: 2,
  info: 3,
  warn: 4,
  error: 5,
  fatal: 6
};

var defaultLogAbbr = {
  trace: 'trc',
  debug: 'dbg',
  log: 'log',
  info: 'inf',
  warn: 'WRN',
  error: 'ERR',
  fatal: 'FTL'
};

/**
 * Normalizes file log configuration and preserves legacy key aliases.
 * @param {object} section - File log section from config.
 * @param {object} fallback - Backward-compatible fallback values.
 * @returns {object} Normalized file log section.
 */
function normalizeLogSection (section, fallback) {
  section = section || {};
  fallback = fallback || {};

  return {
    enabled: section.enabled !== undefined ? section.enabled : fallback.enabled,
    fileName: section.fileName || section.filename || fallback.fileName || fallback.filename,
    level: section.level || fallback.level,
    rotate: normalizeRotation(section.rotate || section.logRotate || fallback.rotate || fallback.logRotate)
  };
}

/**
 * Normalizes console log configuration.
 * @param {object} section - Console log section from config.
 * @param {object} fallback - Backward-compatible fallback values.
 * @returns {object} Normalized console log section.
 */
function normalizeConsoleSection (section, fallback) {
  section = section || {};
  fallback = fallback || {};

  return {
    enabled: section.enabled !== undefined ? section.enabled : fallback.enabled,
    level: section.level || fallback.level
  };
}

/**
 * Normalizes log rotation configuration.
 * @param {object} rotate - Rotation configuration from a log section.
 * @returns {object} Normalized rotation configuration.
 */
function normalizeRotation (rotate) {
  rotate = rotate || {};

  return {
    enabled: rotate.enabled !== undefined ? rotate.enabled : true,
    maxSize: rotate.maxSize || DEFAULT_MAX_SIZE,
    retain: rotate.retain !== undefined ? rotate.retain : DEFAULT_RETAIN,
    rotateInterval: rotate.rotateInterval || DEFAULT_ROTATE_INTERVAL,
    rotateOnRestart: rotate.rotateOnRestart !== undefined ? rotate.rotateOnRestart : true
  };
}

/**
 * Normalizes logger options from new sections and legacy flat keys.
 * @param {object} options - Logger options.
 * @returns {object} Normalized logger options.
 */
function normalizeOptions (options) {
  options = options || {};

  var generalLog = normalizeLogSection(options.generalLog, {
    enabled: true,
    fileName: options.filename || options.logFileName || DEFAULT_LOG_PATH,
    level: options.errorLevel || options.fileLogLevel || DEFAULT_FILE_LOG_LEVEL,
    rotate: options.logRotate
  });

  var debugLog = normalizeLogSection(options.debugLog, {
    enabled: !!(options.debugFilename || options.debugFileName),
    fileName: options.debugFilename || options.debugFileName,
    level: 'debug',
    rotate: options.logRotate
  });

  var consoleLog = normalizeConsoleSection(options.consoleLog, {
    enabled: options.echo !== null,
    level: options.consoleLogLevel || options.echo || DEFAULT_CONSOLE_LOG_LEVEL
  });

  return {
    levels: options.levels || defaultLogLevels,
    levelAbbr: options.level_abbr || options.levelAbbr || defaultLogAbbr,
    generalLog: generalLog,
    debugLog: debugLog,
    consoleLog: consoleLog,
    rotationCheckInterval: options.rotationCheckInterval || DEFAULT_ROTATION_CHECK_INTERVAL
  };
}

/**
 * Converts pm2-logrotate-style size strings to bytes.
 * @param {string|number} value - Size value such as `500M`, `1G` or bytes.
 * @returns {number} Size in bytes.
 */
function parseSize (value) {
  if (typeof value === 'number') {
    return value;
  }

  var match = String(value || '').trim().match(/^(\d+(?:\.\d+)?)\s*([KMG])?B?$/i);

  if (!match) {
    return parseSize(DEFAULT_MAX_SIZE);
  }

  var size = parseFloat(match[1]);
  var unit = (match[2] || '').toUpperCase();

  if (unit === 'G') {
    return Math.floor(size * 1024 * 1024 * 1024);
  }

  if (unit === 'M') {
    return Math.floor(size * 1024 * 1024);
  }

  if (unit === 'K') {
    return Math.floor(size * 1024);
  }

  return Math.floor(size);
}

/**
 * Pads date parts for stable log rotation file names.
 * @param {number} value - Date part to pad.
 * @returns {string} Two-character date part.
 */
function pad (value) {
  return String(value).padStart(2, '0');
}

/**
 * Formats a UTC timestamp for rotated log file names.
 * @param {Date} date - Rotation timestamp.
 * @returns {string} UTC timestamp safe for file names.
 */
function formatTimestamp (date) {
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate())
  ].join('-') + '-' + [
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds())
  ].join('-');
}

/**
 * Ensures the directory for a log file exists.
 * @param {string} fileName - Log file path.
 */
function ensureDir (fileName) {
  fs.mkdirSync(path.dirname(fileName), { recursive: true });
}

/**
 * Builds a rotated file name from the active log file path.
 * @param {string} fileName - Active log file path.
 * @param {Date} date - Rotation timestamp.
 * @returns {string} Rotated file path.
 */
function getRotationFileName (fileName, date) {
  var parsed = path.parse(fileName);
  return path.join(parsed.dir, parsed.name + '-' + formatTimestamp(date) + parsed.ext);
}

/**
 * Reads a file size and treats missing files as empty.
 * @param {string} fileName - File path.
 * @returns {number} File size in bytes.
 */
function readFileSize (fileName) {
  try {
    return fs.statSync(fileName).size;
  } catch (err) {
    return 0;
  }
}

/**
 * Checks whether a simplified cron expression should run for a date.
 * @param {string} expression - Five-field cron expression with numbers or `*`.
 * @param {Date} date - Date to test.
 * @param {string|null} lastRunKey - Last run key used to avoid duplicate runs.
 * @returns {boolean} True when rotation should run now.
 */
function shouldRunCron (expression, date, lastRunKey) {
  var parts = String(expression || '').trim().split(/\s+/);

  if (parts.length !== 5) {
    return false;
  }

  var values = [
    date.getUTCMinutes(),
    date.getUTCHours(),
    date.getUTCDate(),
    date.getUTCMonth() + 1,
    date.getUTCDay()
  ];

  // Keep rotation intentionally small: pm2-logrotate-style exact values and `*`,
  // without ranges or step syntax, are enough for the current node config.
  var matches = parts.every(function (part, index) {
    return part === '*' || Number(part) === values[index];
  });

  if (!matches) {
    return false;
  }

  var runKey = values.slice(0, 4).join(':');

  return runKey !== lastRunKey;
}

/**
 * Assigns a stable console color to a log namespace.
 * @param {string} namespace - Log namespace.
 * @param {object} namespaceColorMap - Mutable namespace-to-color cache.
 * @returns {string} Color name supported by `colors/safe`.
 */
function getNamespaceColor (namespace, namespaceColorMap) {
  if (!namespaceColorMap[namespace]) {
    var hash = 0;

    for (var i = 0; i < namespace.length; i++) {
      hash = ((hash << 5) - hash) + namespace.charCodeAt(i);
      hash |= 0;
    }

    namespaceColorMap[namespace] = namespaceColors[Math.abs(hash) % namespaceColors.length];
  }

  return namespaceColorMap[namespace];
}

/**
 * Checks whether a value can contain nested properties.
 * @param {*} value - Value to check.
 * @returns {boolean} True for non-null objects.
 */
function isObjectLike (value) {
  return value && typeof value === 'object';
}

/**
 * Redacts secret-looking keys from nested log data.
 * @param {*} value - Value to redact.
 * @param {WeakSet<object>} seen - Circular reference tracker.
 * @returns {*} Redacted value safe for logs.
 */
function redactValue (value, seen) {
  if (!isObjectLike(value)) {
    return value;
  }

  if (value instanceof Error) {
    return {
      message: value.message,
      stack: value.stack
    };
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  seen.add(value);

  if (Array.isArray(value)) {
    var redactedArray = value.map(function (item) {
      return redactValue(item, seen);
    });

    seen.delete(value);
    return redactedArray;
  }

  var redacted = {};

  Object.keys(value).forEach(function (key) {
    if (secretKeyPattern.test(key)) {
      redacted[key] = 'XXXXXXXXXX';
    } else {
      redacted[key] = redactValue(value[key], seen);
    }
  });

  seen.delete(value);
  return redacted;
}

/**
 * Formats structured log data for file output.
 * @param {*} data - Log data.
 * @returns {string|undefined} Formatted data or undefined when absent.
 */
function formatData (data) {
  if (data === undefined) {
    return undefined;
  }

  var redacted = redactValue(data, new WeakSet());

  if (typeof redacted === 'string') {
    return redacted;
  }

  if (!isObjectLike(redacted)) {
    return String(redacted);
  }

  return JSON.stringify(redacted);
}

/**
 * Normalizes logger arguments and preserves legacy calls without a namespace.
 * @param {string|*} namespace - Namespace or message in legacy calls.
 * @param {*} message - Log message or data in legacy calls.
 * @param {*} data - Optional structured data.
 * @returns {{namespace: string, message: *, data: *}} Normalized log arguments.
 */
function normalizeLogArgs (namespace, message, data) {
  if (typeof namespace !== 'string') {
    return {
      namespace: DEFAULT_NAMESPACE,
      message: namespace,
      data: message
    };
  }

  return {
    namespace: namespace,
    message: message,
    data: data
  };
}

/**
 * Formats log messages for console and file output.
 * @param {*} message - Message or error to format.
 * @returns {string} Formatted message.
 */
function formatMessage (message) {
  if (message instanceof Error) {
    return message.stack || message.message;
  }

  if (message === undefined) {
    return '';
  }

  if (typeof message === 'string') {
    return message;
  }

  return util.inspect(redactValue(message, new WeakSet()), { depth: null, breakLength: Infinity });
}

/**
 * Creates a writable log sink with optional rotation.
 * @param {object} section - Normalized file log section.
 * @param {object} levels - Log level priority map.
 * @param {Function} onError - Error handler.
 * @constructor
 */
function LogSink (section, levels, onError) {
  this.enabled = section.enabled !== false && !!section.fileName;
  this.fileName = section.fileName;
  this.level = section.level || DEFAULT_FILE_LOG_LEVEL;
  this.rotate = normalizeRotation(section.rotate);
  this.levels = levels;
  this.onError = onError;
  this.stream = null;
  this.currentSize = 0;
  this.lastScheduledRotationKey = null;

  if (this.enabled) {
    this.open(true);
  }
}

/**
 * Opens the active log file stream and optionally rotates it on startup.
 * @param {boolean} isStartup - True when called during logger construction.
 */
LogSink.prototype.open = function (isStartup) {
  try {
    ensureDir(this.fileName);

    if (isStartup && this.rotate.enabled && this.rotate.rotateOnRestart && readFileSize(this.fileName) > 0) {
      this.rotateNow(new Date());
    }

    this.currentSize = readFileSize(this.fileName);
    this.stream = fs.createWriteStream(this.fileName, { flags: 'a' });
    this.stream.on('error', this.onError);
  } catch (err) {
    this.onError(err);
    this.enabled = false;
  }
};

/**
 * Closes the active file stream.
 */
LogSink.prototype.close = function () {
  if (!this.stream) {
    return;
  }

  this.stream.end();
  this.stream = null;
};

/**
 * Checks whether a log level should be written to this sink.
 * @param {string} logLevel - Log level name.
 * @returns {boolean} True when this sink accepts the level.
 */
LogSink.prototype.shouldWrite = function (logLevel) {
  return this.enabled && this.levels[logLevel] >= this.levels[this.level];
};

/**
 * Writes a formatted line to the sink, rotating by size before append.
 * @param {string} logLevel - Log level name.
 * @param {string} line - Formatted log line without trailing newline.
 */
LogSink.prototype.write = function (logLevel, line) {
  if (!this.shouldWrite(logLevel)) {
    return;
  }

  try {
    var output = line + '\n';

    this.rotateBySizeIfNeeded(Buffer.byteLength(output));

    if (!this.stream) {
      this.open(false);
    }

    if (this.stream) {
      this.stream.write(output);
      this.currentSize += Buffer.byteLength(output);
    }
  } catch (err) {
    this.onError(err);
  }
};

/**
 * Rotates the sink when appending the next line would exceed max size.
 * @param {number} nextBytes - Number of bytes about to be appended.
 */
LogSink.prototype.rotateBySizeIfNeeded = function (nextBytes) {
  if (!this.rotate.enabled) {
    return;
  }

  var maxSize = parseSize(this.rotate.maxSize);

  if (maxSize > 0 && this.currentSize + nextBytes > maxSize && this.currentSize > 0) {
    this.reopenRotated(new Date());
  }
};

/**
 * Rotates the sink when the configured schedule matches the current date.
 * @param {Date} date - Date used for schedule matching and file naming.
 */
LogSink.prototype.rotateByScheduleIfNeeded = function (date) {
  if (!this.enabled || !this.rotate.enabled || !this.rotate.rotateInterval) {
    return;
  }

  if (shouldRunCron(this.rotate.rotateInterval, date, this.lastScheduledRotationKey)) {
    this.lastScheduledRotationKey = [
      date.getUTCMinutes(),
      date.getUTCHours(),
      date.getUTCDate(),
      date.getUTCMonth() + 1
    ].join(':');

    if (this.currentSize > 0) {
      this.reopenRotated(date);
    }
  }
};

/**
 * Renames the active log file to a rotated file and trims old rotations.
 * @param {Date} date - Rotation timestamp.
 */
LogSink.prototype.rotateNow = function (date) {
  var rotatedName = getRotationFileName(this.fileName, date);

  // Multiple sinks or rapid rotations can target the same second; move forward
  // deterministically until the rotated file name is free.
  while (fs.existsSync(rotatedName)) {
    rotatedName = getRotationFileName(this.fileName, new Date(date.getTime() + 1000));
    date = new Date(date.getTime() + 1000);
  }

  fs.renameSync(this.fileName, rotatedName);
  this.cleanupRotatedLogs();
};

/**
 * Reopens the sink around a rotation operation.
 * @param {Date} date - Rotation timestamp.
 */
LogSink.prototype.reopenRotated = function (date) {
  this.close();

  try {
    if (readFileSize(this.fileName) > 0) {
      this.rotateNow(date);
    }
  } catch (err) {
    this.onError(err);
  }

  this.open(false);
};

/**
 * Removes rotated files exceeding the configured retain count.
 */
LogSink.prototype.cleanupRotatedLogs = function () {
  var retain = Number(this.rotate.retain);

  if (!Number.isFinite(retain) || retain < 1) {
    return;
  }

  try {
    var parsed = path.parse(this.fileName);
    var prefix = parsed.name + '-';
    var suffix = parsed.ext;
    // Retention is based on mtime so manually copied historical files do not
    // outrank newer rotations with equivalent names.
    var files = fs.readdirSync(parsed.dir)
        .filter(function (fileName) {
          return fileName.indexOf(prefix) === 0 && fileName.endsWith(suffix);
        })
        .map(function (fileName) {
          var fullPath = path.join(parsed.dir, fileName);
          return {
            path: fullPath,
            mtimeMs: fs.statSync(fullPath).mtimeMs
          };
        })
        .sort(function (a, b) {
          return b.mtimeMs - a.mtimeMs;
        });

    files.slice(retain).forEach(function (file) {
      fs.unlinkSync(file.path);
    });
  } catch (err) {
    this.onError(err);
  }
};

/**
 * Creates the ADAMANT logger with file, debug file and console sinks.
 * @param {object} options - Logger configuration.
 * @constructor
 */
function Logger (options) {
  var normalized = normalizeOptions(options);

  this.levels = normalized.levels;
  this.levelAbbr = normalized.levelAbbr;
  this.consoleLog = normalized.consoleLog;
  this.namespaceColorMap = {};

  this.generalLog = new LogSink(normalized.generalLog, this.levels, this.handleError.bind(this));
  this.debugLog = new LogSink(normalized.debugLog, this.levels, this.handleError.bind(this));

  this.rotationInterval = setInterval(function () {
    var now = new Date();
    this.generalLog.rotateByScheduleIfNeeded(now);
    this.debugLog.rotateByScheduleIfNeeded(now);
  }.bind(this), normalized.rotationCheckInterval);

  if (this.rotationInterval.unref) {
    this.rotationInterval.unref();
  }
}

/**
 * Reports logger sink errors without throwing from logging code.
 * @param {Error|string} err - Sink error.
 */
Logger.prototype.handleError = function (err) {
  console.error('Logger error:', err && err.message ? err.message : err);
};

/**
 * Updates the general file log level for backward compatibility.
 * @param {string} errorLevel - Minimum level for the general log sink.
 */
Logger.prototype.setLevel = function (errorLevel) {
  this.generalLog.level = errorLevel;
};

/**
 * Writes a log message to configured file sinks.
 * @param {string} logLevel - Log level name.
 * @param {string} namespace - Log namespace.
 * @param {*} message - Log message.
 * @param {*} data - Optional structured data.
 */
Logger.prototype.writeToFiles = function (logLevel, namespace, message, data) {
  var formatted = this.formatFileLog(logLevel, namespace, message, data);

  this.generalLog.write(logLevel, formatted);
  this.debugLog.write(logLevel, formatted);
};

/**
 * Normalizes and writes a log message to all configured sinks.
 * @param {string} logLevel - Log level name.
 * @param {string|*} namespace - Namespace or message in legacy calls.
 * @param {*} message - Log message or data in legacy calls.
 * @param {*} data - Optional structured data.
 */
Logger.prototype.logMessage = function (logLevel, namespace, message, data) {
  var args = normalizeLogArgs(namespace, message, data);

  this.writeToFiles(logLevel, args.namespace, args.message, args.data);
  this.print(logLevel, args.namespace, args.message, args.data);
};

/**
 * Writes a fatal log message.
 * @param {string|*} namespace - Namespace or message in legacy calls.
 * @param {*} message - Log message or data in legacy calls.
 * @param {*} data - Optional structured data.
 */
Logger.prototype.fatal = function (namespace, message, data) {
  this.logMessage('fatal', namespace, message, data);
};

/**
 * Writes an error log message.
 * @param {string|*} namespace - Namespace or message in legacy calls.
 * @param {*} message - Log message or data in legacy calls.
 * @param {*} data - Optional structured data.
 */
Logger.prototype.error = function (namespace, message, data) {
  this.logMessage('error', namespace, message, data);
};

/**
 * Writes a warning log message.
 * @param {string|*} namespace - Namespace or message in legacy calls.
 * @param {*} message - Log message or data in legacy calls.
 * @param {*} data - Optional structured data.
 */
Logger.prototype.warn = function (namespace, message, data) {
  this.logMessage('warn', namespace, message, data);
};

/**
 * Writes an info log message.
 * @param {string|*} namespace - Namespace or message in legacy calls.
 * @param {*} message - Log message or data in legacy calls.
 * @param {*} data - Optional structured data.
 */
Logger.prototype.info = function (namespace, message, data) {
  this.logMessage('info', namespace, message, data);
};

/**
 * Writes a regular log message.
 * @param {string|*} namespace - Namespace or message in legacy calls.
 * @param {*} message - Log message or data in legacy calls.
 * @param {*} data - Optional structured data.
 */
Logger.prototype.log = function (namespace, message, data) {
  this.logMessage('log', namespace, message, data);
};

/**
 * Writes a debug log message.
 * @param {string|*} namespace - Namespace or message in legacy calls.
 * @param {*} message - Log message or data in legacy calls.
 * @param {*} data - Optional structured data.
 */
Logger.prototype.debug = function (namespace, message, data) {
  this.logMessage('debug', namespace, message, data);
};

/**
 * Writes a trace log message.
 * @param {string|*} namespace - Namespace or message in legacy calls.
 * @param {*} message - Log message or data in legacy calls.
 * @param {*} data - Optional structured data.
 */
Logger.prototype.trace = function (namespace, message, data) {
  this.logMessage('trace', namespace, message, data);
};

/**
 * Prints a log message to the console sink.
 * @param {string} logLevel - Log level name.
 * @param {string} namespace - Log namespace.
 * @param {*} message - Log message.
 * @param {*} data - Optional structured data.
 */
Logger.prototype.print = function (logLevel, namespace, message, data) {
  if (this.consoleLog.enabled === false || this.levels[logLevel] < this.levels[this.consoleLog.level]) {
    return;
  }

  var consoleMethod = stdErrorLogLevels.has(logLevel) ? 'error' : 'log';
  var consoleArgs = this.formatConsoleLog(logLevel, namespace, message, data);

  console[consoleMethod].apply(console, consoleArgs);
};

/**
 * Formats console log arguments with colored level and namespace labels.
 * @param {string} logLevel - Log level name.
 * @param {string} namespace - Log namespace.
 * @param {*} message - Log message.
 * @param {*} data - Optional structured data.
 * @returns {Array} Console arguments.
 */
Logger.prototype.formatConsoleLog = function (logLevel, namespace, message, data) {
  var symbol = this.levelAbbr[logLevel];
  var symbolColor = logColors[logLevel];
  var namespaceColor = getNamespaceColor(namespace, this.namespaceColorMap);
  var args = [
    '[' + colors[symbolColor](symbol) + ']',
    colors[namespaceColor](namespace),
    formatMessage(message)
  ];

  if (data !== undefined) {
    args.push(redactValue(data, new WeakSet()));
  }

  return args;
};

/**
 * Formats a file log line with ISO timestamp, namespace and structured data.
 * @param {string} logLevel - Log level name.
 * @param {string} namespace - Log namespace.
 * @param {*} message - Log message.
 * @param {*} data - Optional structured data.
 * @returns {string} Formatted file log line.
 */
Logger.prototype.formatFileLog = function (logLevel, namespace, message, data) {
  var base = util.format(
      '[%s] %s | %s | %s',
      this.levelAbbr[logLevel],
      new Date().toISOString(),
      namespace,
      formatMessage(message)
  );
  var formattedData = formatData(data);

  return formattedData !== undefined ? base + ' - ' + formattedData : base;
};

/**
 * Stops rotation timers and closes file streams.
 */
Logger.prototype.close = function () {
  clearInterval(this.rotationInterval);
  this.generalLog.close();
  this.debugLog.close();
};

module.exports = Logger;
