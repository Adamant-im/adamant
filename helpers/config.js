'use strict';

var fs = require('fs');
var path = require('path');
var z_schema = require('./z_schema.js');
var configSchema = require('../schema/config.js');
var constants = require('../helpers/constants.js');

/**
 * Loads config.json file
 * @memberof module:helpers
 * @implements {validateForce}
 * @param {string} configPath
 * @return {Object} configData
 */
function Config (configPath) {
  try {
    const configJson = fs.readFileSync(path.resolve(process.cwd(), (configPath || 'config.json')), 'utf8');

    const defaultConfigPath = path.join(__dirname, '../config.default.json');
    const defaultConfigJson = fs.existsSync(defaultConfigPath)
      ? fs.readFileSync(defaultConfigPath, 'utf8')
      : '{}';

    if (!configJson.length) {
      throw 'Failed to read config file';
    }

    const configData = JSON.parse(configJson);
    const defatultConfigData = JSON.parse(defaultConfigJson);

    deepMergeMissing(configData, defatultConfigData);

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
 * @private
 * @param {Object} configData
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

function deepMergeMissing(target, source) {
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

// Exports
module.exports = Config;
