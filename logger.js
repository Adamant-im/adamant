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

function normalizeConsoleSection (section, fallback) {
  section = section || {};
  fallback = fallback || {};

  return {
    enabled: section.enabled !== undefined ? section.enabled : fallback.enabled,
    level: section.level || fallback.level
  };
}

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

function pad (value) {
  return String(value).padStart(2, '0');
}

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

function ensureDir (fileName) {
  fs.mkdirSync(path.dirname(fileName), { recursive: true });
}

function getRotationFileName (fileName, date) {
  var parsed = path.parse(fileName);
  return path.join(parsed.dir, parsed.name + '-' + formatTimestamp(date) + parsed.ext);
}

function readFileSize (fileName) {
  try {
    return fs.statSync(fileName).size;
  } catch (err) {
    return 0;
  }
}

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

  var matches = parts.every(function (part, index) {
    return part === '*' || Number(part) === values[index];
  });

  if (!matches) {
    return false;
  }

  var runKey = values.slice(0, 4).join(':');

  return runKey !== lastRunKey;
}

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

function isObjectLike (value) {
  return value && typeof value === 'object';
}

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

LogSink.prototype.close = function () {
  if (!this.stream) {
    return;
  }

  this.stream.end();
  this.stream = null;
};

LogSink.prototype.shouldWrite = function (logLevel) {
  return this.enabled && this.levels[logLevel] >= this.levels[this.level];
};

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

LogSink.prototype.rotateBySizeIfNeeded = function (nextBytes) {
  if (!this.rotate.enabled) {
    return;
  }

  var maxSize = parseSize(this.rotate.maxSize);

  if (maxSize > 0 && this.currentSize + nextBytes > maxSize && this.currentSize > 0) {
    this.reopenRotated(new Date());
  }
};

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

LogSink.prototype.rotateNow = function (date) {
  var rotatedName = getRotationFileName(this.fileName, date);

  while (fs.existsSync(rotatedName)) {
    rotatedName = getRotationFileName(this.fileName, new Date(date.getTime() + 1000));
    date = new Date(date.getTime() + 1000);
  }

  fs.renameSync(this.fileName, rotatedName);
  this.cleanupRotatedLogs();
};

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

LogSink.prototype.cleanupRotatedLogs = function () {
  var retain = Number(this.rotate.retain);

  if (!Number.isFinite(retain) || retain < 1) {
    return;
  }

  try {
    var parsed = path.parse(this.fileName);
    var prefix = parsed.name + '-';
    var suffix = parsed.ext;
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

Logger.prototype.handleError = function (err) {
  console.error('Logger error:', err && err.message ? err.message : err);
};

Logger.prototype.setLevel = function (errorLevel) {
  this.generalLog.level = errorLevel;
};

Logger.prototype.writeToFiles = function (logLevel, namespace, message, data) {
  var formatted = this.formatFileLog(logLevel, namespace, message, data);

  this.generalLog.write(logLevel, formatted);
  this.debugLog.write(logLevel, formatted);
};

Logger.prototype.logMessage = function (logLevel, namespace, message, data) {
  var args = normalizeLogArgs(namespace, message, data);

  this.writeToFiles(logLevel, args.namespace, args.message, args.data);
  this.print(logLevel, args.namespace, args.message, args.data);
};

Logger.prototype.fatal = function (namespace, message, data) {
  this.logMessage('fatal', namespace, message, data);
};

Logger.prototype.error = function (namespace, message, data) {
  this.logMessage('error', namespace, message, data);
};

Logger.prototype.warn = function (namespace, message, data) {
  this.logMessage('warn', namespace, message, data);
};

Logger.prototype.info = function (namespace, message, data) {
  this.logMessage('info', namespace, message, data);
};

Logger.prototype.log = function (namespace, message, data) {
  this.logMessage('log', namespace, message, data);
};

Logger.prototype.debug = function (namespace, message, data) {
  this.logMessage('debug', namespace, message, data);
};

Logger.prototype.trace = function (namespace, message, data) {
  this.logMessage('trace', namespace, message, data);
};

Logger.prototype.print = function (logLevel, namespace, message, data) {
  if (this.consoleLog.enabled === false || this.levels[logLevel] < this.levels[this.consoleLog.level]) {
    return;
  }

  var consoleMethod = stdErrorLogLevels.has(logLevel) ? 'error' : 'log';
  var consoleArgs = this.formatConsoleLog(logLevel, namespace, message, data);

  console[consoleMethod].apply(console, consoleArgs);
};

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

Logger.prototype.close = function () {
  clearInterval(this.rotationInterval);
  this.generalLog.close();
  this.debugLog.close();
};

module.exports = Logger;
