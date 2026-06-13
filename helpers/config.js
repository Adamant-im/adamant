'use strict';

var fs = require('fs');
var path = require('path');
var z_schema = require('./z_schema.js');
var configSchema = require('../schema/config.js');
var constants = require('../helpers/constants.js');
var configOverrides = require('./configOverrides.js');

/**
 * Loads config.json file
 * @param {string} configPath
 * @param {object} overrideOptions
 *
 * @memberof module:helpers
 * @implements {validateForce}
 * @return {Object} configData
 */
function Config (configPath, overrideOptions) {
  try {
    const configJson = fs.readFileSync(path.resolve(process.cwd(), (configPath || 'config.json')), 'utf8');

    const defaultConfigPath = path.join(__dirname, '../config.default.json');
    const defaultConfigJson = fs.existsSync(defaultConfigPath) ?
      fs.readFileSync(defaultConfigPath, 'utf8') :
      '{}';

    if (!configJson.length) {
      throw 'Failed to read config file';
    }

    const configData = JSON.parse(configJson);
    const defaultConfigData = JSON.parse(defaultConfigJson);
    const legacyLoggingConfig = getLegacyLoggingConfig(configData);
    const configEvents = [];

    deepMergeMissing(configData, defaultConfigData);
    applyLegacyLoggingConfig(configData, legacyLoggingConfig);
    configOverrides.applyOverrides(
        configData,
        configOverrides.resolveOverrides(overrideOptions),
        configSchema.config,
        configEvents
    );

    Object.defineProperty(configData, '__configEvents', {
      value: configEvents,
      enumerable: false
    });

    var validator = new z_schema();
    var valid = validator.validate(configData, configSchema.config);

    if (!valid) {
      throw `Failed to validate config data ${JSON.stringify(validator.getLastErrors(), null, 2)}`;
    }

    validateForce(configData);

    return configData;
  } catch (error) {
    console.error('Error occurred while processing config file:', error);
    process.exit(1);
  }
}

/**
 * Validates nethash value from constants and sets forging force to false if any.
 * @param {object} configData
 * @private
 */
function validateForce (configData) {
  if (configData.forging.force) {
    var index = constants.nethashes.indexOf(configData.nethash);

    if (index !== -1) {
      console.log('Forced forging disabled for nethash', configData.nethash);
      configData.forging.force = false;
    }
  }
}

/**
 * Recursively copies only missing default config keys into a user config.
 * @param {object} target - User config object to mutate.
 * @param {object} source - Default config object.
 * @returns {object} Mutated target config.
 */
function deepMergeMissing (target, source) {
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      if (!(key in target)) {
        target[key] = source[key];
      } else if (
        typeof source[key] === 'object' &&
        source[key] !== null &&
        typeof target[key] === 'object' &&
        target[key] !== null
      ) {
        deepMergeMissing(target[key], source[key]);
      }
    }
  }

  return target;
}

/**
 * Captures legacy flat logging keys before default config merge fills new sections.
 * @param {object} configData - Raw user config before default merge.
 * @returns {object} Legacy logging values and section presence flags.
 */
function getLegacyLoggingConfig (configData) {
  return {
    hasGeneralLog: !!configData.generalLog,
    hasDebugLog: !!configData.debugLog,
    hasConsoleLog: !!configData.consoleLog,
    fileLogLevel: configData.fileLogLevel,
    logFileName: configData.logFileName,
    debugFileName: configData.debugFileName,
    consoleLogLevel: configData.consoleLogLevel
  };
}

/**
 * Applies legacy flat logging keys only when the matching new section was absent.
 * @param {object} configData - Config object after default merge.
 * @param {object} legacyLoggingConfig - Legacy logging values captured before merge.
 */
function applyLegacyLoggingConfig (configData, legacyLoggingConfig) {
  if (!legacyLoggingConfig.hasGeneralLog) {
    if (legacyLoggingConfig.fileLogLevel) {
      configData.generalLog.level = legacyLoggingConfig.fileLogLevel;
    }

    if (legacyLoggingConfig.logFileName) {
      configData.generalLog.fileName = legacyLoggingConfig.logFileName;
    }
  }

  if (!legacyLoggingConfig.hasDebugLog && legacyLoggingConfig.debugFileName) {
    configData.debugLog.enabled = true;
    configData.debugLog.fileName = legacyLoggingConfig.debugFileName;
  }

  if (!legacyLoggingConfig.hasConsoleLog && legacyLoggingConfig.consoleLogLevel) {
    configData.consoleLog.level = legacyLoggingConfig.consoleLogLevel;
  }
}

// Exports
module.exports = Config;
