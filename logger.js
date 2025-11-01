const fs = require('fs');
const path = require('path');
const util = require('util');

const colors = require('colors/safe');

const DEFAULT_LOG_PATH = path.join(__dirname, 'logs.log');
const DEFAULT_FILE_LOG_LEVEL = 'log';

// minimize debug file size
const debugNamespaces = new Set(['delegates', 'rounds', 'transactions', 'blocks']);

/**
 * Console log levels that should print to `stderr` instead of `stdout`.
 *
 * @link https://docs.adamant.im/own-node/configuration.html#logging
 */
const stdErrorLogLevels = new Set(['warn', 'error', 'fatal']);

const logColors = {
  none: 'bgGray',
  trace: 'bgWhite',
  debug: 'bgCyan',
  log: 'bgBlue',
  info: 'bgBlue',
  warn: 'bgYellow',
  error: 'bgRed',
  fatal: 'bgMagenta',
};

const namespaceColors = [
  'black',
  'red',
  'yellow',
  'blue',
  'green',
  'magenta',
  'cyan',
  'white',
  'brightGreen',
  'gray',
  'brightRed',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite',
];

const defaultLogLevels = {
  none: 99,
  trace: 0,
  debug: 1,
  log: 2,
  info: 3,
  warn: 4,
  error: 5,
  fatal: 6,
};

const defaultLogAbbr = {
  trace: 'trc',
  debug: 'dbg',
  log: 'log',
  info: 'inf',
  warn: 'WRN',
  error: 'ERR',
  fatal: 'FTL',
};

class Logger {
  constructor(options) {
    this.levels = options.levels ?? defaultLogLevels;
    this.levelAbbr = options.level_abbr ?? defaultLogAbbr;

    this.filename = options.filename ?? DEFAULT_LOG_PATH;
    this.debugFilename = options.debugFilename;
    this.isDebugFileEnabled = !!this.debugFilename;

    this.fileLogLevel = options.errorLevel ?? DEFAULT_FILE_LOG_LEVEL;
    this.logLevel = options.consoleLogLevel;

    this.namespaceColorMap = {};

    this.initWriteStreams();

    if (this.isDebugFileEnabled) {
      const oneDay = 24 * 60 * 60 * 1000;
      setInterval(() => this.rotateDebugLogs(), oneDay);
      this.rotateDebugLogs();
    }
  }

  initWriteStreams() {
    this.loggerWriteStream = fs.createWriteStream(this.filename, { flags: 'a' });
    this.debugWriteStream = this.isDebugFileEnabled
      ? fs.createWriteStream(this.debugFilename, { flags: 'a' })
      : null;
  }

  writeToFiles(logLevel, namespace, message, data) {
    const timestamp = new Date().toISOString();
    const formatted = this.#formatLog({
      symbol: this.levelAbbr[logLevel],
      timestamp,
      message: `${namespace} | ${message}`,
      data: data ? JSON.stringify(this.#hideSecret({ ...data })) : null,
    });

    if (this.levels[logLevel] >= this.levels[this.fileLogLevel]) {
      this.loggerWriteStream.write(formatted + '\n');
    }

    if (this.debugWriteStream && debugNamespaces.has(namespace)) {
      this.debugWriteStream.write(formatted + '\n');
    }
  }

  logMessage(logLevel, namespace, message, data) {
    this.writeToFiles(logLevel, namespace, message, data);
    this.print(logLevel, namespace, message, data);
  }

  fatal(namespace, message, data) {
    this.logMessage('fatal', namespace, message, data);
  }

  error(namespace, message, data) {
    this.logMessage('error', namespace, message, data);
  }

  warn(namespace, message, data) {
    this.logMessage('warn', namespace, message, data);
  }

  info(namespace, message, data) {
    this.logMessage('info', namespace, message, data);
  }

  log(namespace, message, data) {
    this.logMessage('info', namespace, message, data);
  }

  debug(namespace, message, data) {
    this.logMessage('debug', namespace, message, data);
  }

  trace(namespace, message, data) {
    this.logMessage('trace', namespace, message, data);
  }

  print(logLevel, namespace, message, data) {
    if (this.levels[logLevel] < this.levels[this.logLevel]) {
      return;
    }

    const consoleMethod = stdErrorLogLevels.has(logLevel) ?
      'error' : 'log';

    const consoleArgs = this.#formatConsoleLog(
      logLevel,
      namespace,
      message,
      data,
    );

    console[consoleMethod](...consoleArgs);
  }

  async rotateDebugLogs() {
    if (!this.debugWriteStream) {
      return;
    }

    await new Promise((resolve) => this.debugWriteStream.end(resolve));

    await this.cleanupOldLogs();
    this.initWriteStreams();
  }

  async cleanupOldLogs() {
    try {
      const retentionDays = 7;
      const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

      if (!fs.existsSync(this.debugFilename)) {
        return;
      }

      const fd = fs.openSync(this.debugFilename, 'r');
      const buffer = Buffer.alloc(8192);
      let bytesRead;
      let offset = 0;
      let foundOffset = 0;
      let stop = false;

      while (!stop && (bytesRead = fs.readSync(fd, buffer, 0, buffer.length, offset)) > 0) {
        const chunk = buffer.toString('utf8', 0, bytesRead);
        const lines = chunk.split('\n');

        for (const line of lines) {
          const match = line.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/);
          if (!match) {
            offset += line.length + 1;
            continue;
          }

          const timestamp = new Date(match[1]).getTime();
          if (timestamp >= cutoff) {
            foundOffset = offset;
            stop = true;
            break;
          }
          offset += line.length + 1;
        }
      }

      fs.closeSync(fd);

      const tempFile = `${this.debugFilename}.tmp`;

      const readStream = fs.createReadStream(this.debugFilename, { start: foundOffset });
      const writeStream = fs.createWriteStream(tempFile, { flags: 'w' });

      await new Promise((resolve, reject) => {
        readStream.pipe(writeStream);
        readStream.on('error', reject);
        writeStream.on('error', reject);
        writeStream.on('close', resolve);
      });

      fs.renameSync(tempFile, this.debugFilename);
    } catch (error) {
      console.error('cleanupOldLogs failed:', error);
    }
  }

  #pickColor(namespace) {
    if (!this.namespaceColorMap[namespace]) {
      let hash = 0;

      for (let i = 0; i < namespace.length; i++) {
        hash = ((hash << 5) - hash) + namespace.charCodeAt(i);
        hash |= 0; // Convert to 32bit integer
      }

      this.namespaceColorMap[namespace] = namespaceColors[Math.abs(hash) % namespaceColors.length];
    }

		return this.namespaceColorMap[namespace];
  }

  #formatConsoleLog(logLevel, namespace, message, data) {
    const symbol = this.levelAbbr[logLevel];
    const symbolColor = logColors[logLevel];

    const namespaceColor = this.#pickColor(namespace);

    const args = [
      `[${colors[symbolColor](symbol)}]`,
      colors[namespaceColor](namespace),
      message,
    ];

    if (data) {
      args.push(this.#hideSecret(data));
    }

    return args;
  }

  #formatLog(log) {
    const base = util.format('[%s] %s | %s', log.symbol, log.timestamp, log.message);
    return log.data ? `${base} - ${log.data}` : base;
  }

  #hideSecret(data) {
    for (const key in data) {
      if (key.includes('secret')) {
        data[key] = 'XXXXXXXXXX';
      }
    }
    return data;
  }
}

module.exports = Logger;
