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
 * @return {object} configData
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
    const legacyRateLimits = getLegacyRateLimitAliases(configData);
    const overrideEntries = configOverrides.resolveOverrides(overrideOptions);
    const suppressLegacySnapshot = suppressSnapshotForLegacyDapp(configData, overrideEntries);
    const configEvents = [];

    configOverrides.removeDeprecatedConfig(configData, configEvents, 'config file');
    deepMergeMissing(configData, defaultConfigData);
    applyLegacyLoggingConfig(configData, legacyLoggingConfig);
    preserveLegacyRateLimitAliases(configData, legacyRateLimits);
    configOverrides.applyOverrides(
        configData,
        overrideEntries,
        configSchema.config,
        configEvents
    );
    applyLegacySnapshotCompatibility(
        configData,
        configEvents,
        suppressLegacySnapshot
    );

    Object.defineProperty(configData, '__configEvents', {
      value: configEvents,
      enumerable: false
    });

    assertRateLimitAliases(configData);

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
 * Detects a legacy config state that made the old startup path clear snapshot mode.
 * Explicit --snapshot and --config-set CLI overrides remain authoritative.
 * @param {object} configData - Raw config before deprecated values are removed.
 * @param {Array<object>} entries - Parsed config override entries.
 * @return {boolean} Whether an inherited snapshot must be ignored.
 */
function suppressSnapshotForLegacyDapp (configData, entries) {
  var legacyDapp = {
    masterrequired: true,
    masterpassword: ''
  };

  if (configData.dapp) {
    if (Object.prototype.hasOwnProperty.call(configData.dapp, 'masterrequired')) {
      legacyDapp.masterrequired = configData.dapp.masterrequired;
    }
    if (Object.prototype.hasOwnProperty.call(configData.dapp, 'masterpassword')) {
      legacyDapp.masterpassword = configData.dapp.masterpassword;
    }
  }

  entries.forEach(function (entry) {
    var path = entry.path;

    if (path[0] !== 'dapp') {
      return;
    }

    var value = typeof entry.value === 'function' ?
      entry.value(configData) :
      entry.value;

    if (path.length === 1 && value && typeof value === 'object') {
      if (Object.prototype.hasOwnProperty.call(value, 'masterrequired')) {
        legacyDapp.masterrequired = value.masterrequired;
      }
      if (Object.prototype.hasOwnProperty.call(value, 'masterpassword')) {
        legacyDapp.masterpassword = value.masterpassword;
      }
    } else if (path.length === 2) {
      legacyDapp[path[1]] = value;
    }
  });

  var explicitSnapshot = entries.some(function (entry) {
    var isSnapshotPath = (
      entry.path[0] === 'loading' &&
      entry.path[1] === 'snapshot'
    ) || (
      entry.path.length === 1 &&
      entry.path[0] === 'loading' &&
      entry.value &&
      typeof entry.value === 'object' &&
      Object.prototype.hasOwnProperty.call(entry.value, 'snapshot')
    );

    var explicitCliSource = entry.source === '--snapshot' ||
      entry.source === '--config-set';

    return explicitCliSource && isSnapshotPath;
  });

  return !!legacyDapp.masterrequired &&
    !legacyDapp.masterpassword &&
    !explicitSnapshot;
}

/**
 * Preserves the old implicit snapshot behavior without blocking explicit recovery snapshots.
 * @param {object} configData - Effective config object.
 * @param {Array<object>} events - Config event sink.
 * @param {boolean} suppressLegacySnapshot - Whether compatibility cleanup is required.
 */
function applyLegacySnapshotCompatibility (configData, events, suppressLegacySnapshot) {
  if (
    !suppressLegacySnapshot ||
    !configData.loading ||
    !Object.prototype.hasOwnProperty.call(configData.loading, 'snapshot')
  ) {
    return;
  }

  delete configData.loading.snapshot;
  events.push({
    type: 'migration',
    path: 'loading.snapshot',
    source: 'legacy config'
  });
}

/**
 * Records whether a raw limits block set `limit`, legacy `max`, or route policies.
 * @param {object} configData - User config before default values are merged.
 * @return {object} Presence flags for the API and peer limit blocks.
 */
function getLegacyRateLimitAliases (configData) {
  return {
    api: snapshotLimits(configData.api && configData.api.options && configData.api.options.limits),
    peers: snapshotLimits(configData.peers && configData.peers.options && configData.peers.options.limits)
  };
}

/**
 * @param {object} limits - Raw limits block.
 * @return {object|null} Presence flags, or null when the block was absent.
 */
function snapshotLimits (limits) {
  if (!limits || typeof limits !== 'object' || Array.isArray(limits)) {
    return null;
  }

  return {
    hadLimit: Object.prototype.hasOwnProperty.call(limits, 'limit'),
    hadMax: Object.prototype.hasOwnProperty.call(limits, 'max'),
    hadRoutes: Object.prototype.hasOwnProperty.call(limits, 'routes')
  };
}

/**
 * Keeps an explicit legacy `max` from being replaced by a default `limit` or route policy.
 * Operators inherit the new defaults by deleting the limits block.
 * @param {object} configData - Config after missing defaults were merged.
 * @param {object} snapshot - Presence flags captured before the merge.
 * @return {void}
 */
function preserveLegacyRateLimitAliases (configData, snapshot) {
  preserveOne(
      configData.api && configData.api.options && configData.api.options.limits,
      snapshot.api
  );
  preserveOne(
      configData.peers && configData.peers.options && configData.peers.options.limits,
      snapshot.peers
  );
}

/**
 * @param {object} limits - Merged limits block.
 * @param {object|null} shot - Presence flags for the raw block.
 * @return {void}
 */
function preserveOne (limits, shot) {
  if (!limits || !shot) {
    return;
  }

  if (!shot.hadLimit && shot.hadMax) {
    delete limits.limit;
  }

  if (!shot.hadRoutes) {
    delete limits.routes;
  }
}

/**
 * Rejects a limits block that sets neither `limit` nor legacy `max`.
 * @param {object} configData - Effective config.
 * @return {void}
 */
function assertRateLimitAliases (configData) {
  [
    ['api.options.limits', configData.api && configData.api.options && configData.api.options.limits],
    ['peers.options.limits', configData.peers && configData.peers.options && configData.peers.options.limits]
  ].forEach(function (entry) {
    const label = entry[0];
    const limits = entry[1];

    if (!limits || typeof limits !== 'object') {
      return;
    }

    const hasLimit = Object.prototype.hasOwnProperty.call(limits, 'limit');
    const hasMax = Object.prototype.hasOwnProperty.call(limits, 'max');

    if (!hasLimit && !hasMax) {
      throw new Error(
          label + ' must include "limit" (preferred) or legacy "max". Set the value to 0 to disable that surface.'
      );
    }
  });
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
 * @return {object} Mutated target config.
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
 * @return {object} Legacy logging values and section presence flags.
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
