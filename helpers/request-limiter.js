'use strict';

var rateLimit = require('express-rate-limit');
var slowDown = require('express-slow-down');

/**
 * Allow all requests through
 * @return {true}
 */
function skip () {
  return true;
}

var defaults = {
  max: 0, // Disabled
  delayMs: 0, // Disabled
  delayAfter: 0, // Disabled
  windowMs: 60000 // 1 minute window
};

/**
 * Normalizes a non-negative integer option.
 * @private
 * @param {*} value - Requested option value.
 * @param {number} fallback - Value used for invalid input.
 * @return {number} Normalized option value.
 */
function normalizeOption (value, fallback) {
  const normalized = Math.floor(Number(value));
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : fallback;
}

/**
 * Returns limits object from input or default values.
 * @private
 * @param {object} [config] - Requested limits.
 * @return {object} max, delayMs, delayAfter, windowMs
 */
function applyLimits (config) {
  const limits = config ?? defaults;

  if (typeof limits === 'object') {
    const delayAfter = normalizeOption(limits.delayAfter, defaults.delayAfter);
    const delayMs = normalizeOption(limits.delayMs, defaults.delayMs);

    return {
      max: normalizeOption(limits.max, defaults.max),
      delayMs: function (used) {
        return (used - delayAfter) * delayMs;
      },
      delayAfter: delayAfter,
      windowMs: normalizeOption(limits.windowMs, defaults.windowMs) || defaults.windowMs
    };
  } else {
    return applyLimits(defaults);
  }
}

/**
 * Returns options supported by express-rate-limit.
 * @private
 * @param {object} limits - Normalized request limits.
 * @return {object} Rate-limit middleware options.
 */
function getRateLimitOptions (limits) {
  const enabled = limits.max > 0;

  return {
    max: enabled ? limits.max : undefined,
    windowMs: limits.windowMs,
    skip: enabled ? undefined : skip
  };
}

/**
 * Returns options supported by express-slow-down.
 * @private
 * @param {object} limits - Normalized request limits.
 * @return {object} Slow-down middleware options.
 */
function getSlowDownOptions (limits) {
  const enabled = limits.delayAfter > 0;

  return {
    delayMs: limits.delayMs,
    delayAfter: limits.delayAfter,
    windowMs: limits.windowMs,
    skip: enabled ? undefined : skip
  };
}

/**
 * Applies limits config to app.
 * @memberof module:helpers
 * @method request-limiter
 * @implements applyLimits
 * @param {object} app - Application instance
 * @param {object} config
 * @return {object} limits per client and peer
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
    client: app.use('/api/', rateLimit(getRateLimitOptions(limits.client)), slowDown(getSlowDownOptions(limits.client))),
    peer: app.use('/peer/', rateLimit(getRateLimitOptions(limits.peer)), slowDown(getSlowDownOptions(limits.peer)))
  };

  return limits;
};
