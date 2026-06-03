'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { expect } = require('chai');

const Logger = require('../../logger.js');

function createTempDir () {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'adamant-logger-'));
}

function waitForStreams () {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

function readIfExists (fileName) {
  return fs.existsSync(fileName) ? fs.readFileSync(fileName, 'utf8') : '';
}

function createLogger (dir, overrides) {
  overrides = overrides || {};

  return new Logger({
    generalLog: {
      enabled: true,
      fileName: path.join(dir, 'general.log'),
      level: overrides.generalLevel || 'warn',
      rotate: {
        enabled: true,
        maxSize: overrides.maxSize || '500M',
        retain: 5,
        rotateInterval: '0 0 0 1 *',
        rotateOnRestart: overrides.rotateOnRestart !== undefined ? overrides.rotateOnRestart : true
      }
    },
    debugLog: {
      enabled: overrides.debugEnabled !== false,
      fileName: path.join(dir, 'debug.log'),
      level: overrides.debugLevel || 'debug',
      rotate: {
        enabled: true,
        maxSize: overrides.maxSize || '500M',
        retain: 5,
        rotateInterval: '0 0 0 1 *',
        rotateOnRestart: overrides.rotateOnRestart !== undefined ? overrides.rotateOnRestart : true
      }
    },
    consoleLog: {
      enabled: false,
      level: 'trace'
    },
    rotationCheckInterval: 1000000
  });
}

describe('logger', () => {
  it('writes debug logs by level without namespace filtering and redacts nested secrets', async () => {
    const dir = createTempDir();
    const logger = createLogger(dir);

    logger.debug('cache', 'Cache debug payload', {
      password: 'plain-password',
      nested: {
        token: 'plain-token'
      },
      list: [
        { privateKey: 'plain-private-key' }
      ]
    });
    logger.info('cache', 'Ignored by general warn level');
    logger.warn('runtime', 'General warning');
    logger.close();

    await waitForStreams();

    const generalLog = readIfExists(path.join(dir, 'general.log'));
    const debugLog = readIfExists(path.join(dir, 'debug.log'));

    expect(generalLog).to.include('runtime | General warning');
    expect(generalLog).not.to.include('Ignored by general warn level');
    expect(debugLog).to.include('cache | Cache debug payload');
    expect(debugLog).to.include('"password":"XXXXXXXXXX"');
    expect(debugLog).to.include('"token":"XXXXXXXXXX"');
    expect(debugLog).to.include('"privateKey":"XXXXXXXXXX"');
    expect(debugLog).not.to.include('plain-password');
    expect(debugLog).not.to.include('plain-token');
    expect(debugLog).not.to.include('plain-private-key');
  });

  it('preserves log level filtering separately from info', async () => {
    const dir = createTempDir();
    const logger = createLogger(dir, {
      generalLevel: 'info',
      debugEnabled: false
    });

    logger.log('runtime', 'Plain log entry');
    logger.info('runtime', 'Info entry');
    logger.close();

    await waitForStreams();

    const generalLog = readIfExists(path.join(dir, 'general.log'));

    expect(generalLog).not.to.include('Plain log entry');
    expect(generalLog).to.include('Info entry');
  });

  it('rotates the active file on startup by default', async () => {
    const dir = createTempDir();
    const generalFile = path.join(dir, 'general.log');

    fs.writeFileSync(generalFile, 'previous run\n');

    const logger = createLogger(dir, {
      debugEnabled: false
    });

    logger.warn('runtime', 'current run');
    logger.close();

    await waitForStreams();

    const files = fs.readdirSync(dir);
    const rotatedFiles = files.filter((fileName) => fileName.startsWith('general-') && fileName.endsWith('.log'));

    expect(rotatedFiles).to.have.length(1);
    expect(readIfExists(path.join(dir, rotatedFiles[0]))).to.equal('previous run\n');
    expect(readIfExists(generalFile)).to.include('current run');
  });
});
