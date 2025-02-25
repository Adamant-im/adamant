'use strict';

var rateLimit = require('express-rate-limit');
var slowDown = require('express-slow-down');

/**
 * Allow all requests through
 * @returns {true}
 */
function skip() {
  return true;
}

var defaults = {
  skip: skip, // Disabled
  delayMs: 0, // Disabled
  delayAfter: 0, // Disabled
  windowMs: 60000 // 1 minute window
};

/**
 * Returns limits object from input or default values.
 * @private
 * @param {Object} [limits]
 * @return {Object} max, delayMs, delayAfter, windowMs
 */
function applyLimits(config) {
  const limits = config ?? defaults;

  if (typeof limits === 'object') {
    const settings = {
      max: Math.floor(limits.max) || defaults.max,
      delayMs: function(used) {
        return (used - this.delayAfter) * (Math.floor(limits.delayMs) || defaults.delayMs);
      },
      delayAfter: Math.floor(limits.delayAfter) || defaults.delayAfter,
      windowMs: Math.floor(limits.windowMs) || defaults.windowMs
    };

    if (!limits.delayAfter) {
      settings.skip = skip;
    }

    return settings;
  } else {
    return defaults;
  }
}

/**
 * Applies limits config to app.
 * @memberof module:helpers
 * @function request-limiter
 * @implements applyLimits
 * @param {Object} app - Application instance
 * @param {Object} config
 * @return {Object} limits per client and peer
 */
module.exports = function (app, config) {
  if (config.trustProxy) {
    app.enable('trust proxy');
  }

  config.api = config.api || {};
  config.api.options = config.api.options || {};

  config.peers = config.peers || {};
  config.peers.options = config.peers.options || {};

  var limits = {
    client: applyLimits(config.api.options.limits),
    peer: applyLimits(config.peers.options.limits)
  };

  limits.middleware = {
    client: app.use('/api/', rateLimit(limits.client), slowDown(limits.client)),
    peer: app.use('/peer/', rateLimit(limits.peer), slowDown(limits.peer))
  };

  return limits;
};
