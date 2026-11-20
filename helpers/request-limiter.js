'use strict';

const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const AbuseWindow = require('./abuse-window.js');

const API_CLASSES = ['status', 'read', 'publish'];
const PEER_CLASSES = ['status', 'sync', 'broadcast'];

const API_STATUS_PATHS = new Set([
  '/api/loader/status',
  '/api/loader/status/sync',
  '/api/loader/status/ping',
  '/api/node/status',
  '/api/blocks/getheight',
  '/api/blocks/getepoch',
  '/api/blocks/getnethash',
  '/api/blocks/getbroadhash',
  '/api/blocks/getfee',
  '/api/blocks/getfees',
  '/api/blocks/getmilestone',
  '/api/blocks/getreward',
  '/api/blocks/getsupply',
  '/api/blocks/getstatus',
  '/api/peers/version'
]);

const API_PUBLISH_PATHS = new Set([
  '/api/transactions',
  '/api/transactions/process',
  '/api/accounts/new',
  '/api/accounts/delegates',
  '/api/delegates',
  '/api/delegates/forging/enable',
  '/api/delegates/forging/disable',
  '/api/chats/process',
  '/api/states/store',
  '/api/signatures',
  '/api/multisignatures',
  '/api/multisignatures/sign',
  '/api/dapps',
  '/api/dapps/launch',
  '/api/dapps/install',
  '/api/dapps/uninstall',
  '/api/dapps/stop',
  '/api/dapps/transaction',
  '/api/dapps/withdrawal'
]);

const HEADER_DEFAULTS = {
  standardHeaders: true,
  legacyHeaders: false,
  statusCode: 429,
  message: 'Too many requests, please try again later.',
  requestPropertyName: 'rateLimit',
  windowMs: 60000
};

/**
 * Production HTTP limits. `limit` 0 disables a whole surface, including routes.
 * Peer caps stay high so honest sync and relay do not receive 429 responses.
 */
const defaults = {
  api: Object.assign({}, HEADER_DEFAULTS, {
    limit: 3000,
    delayMs: 25,
    delayAfter: 1000,
    maxDelayMs: 1000,
    routes: {
      status: {
        limit: 12000,
        delayMs: 0,
        delayAfter: 0,
        maxDelayMs: 0
      },
      read: {
        limit: 3000,
        delayMs: 25,
        delayAfter: 1000,
        maxDelayMs: 1000
      },
      publish: {
        limit: 300,
        delayMs: 50,
        delayAfter: 120,
        maxDelayMs: 1500
      }
    }
  }),
  peer: Object.assign({}, HEADER_DEFAULTS, {
    limit: 12000,
    delayMs: 5,
    delayAfter: 6000,
    maxDelayMs: 200,
    routes: {
      status: {
        limit: 20000,
        delayMs: 0,
        delayAfter: 0,
        maxDelayMs: 0
      },
      sync: {
        limit: 12000,
        delayMs: 5,
        delayAfter: 8000,
        maxDelayMs: 200
      },
      broadcast: {
        limit: 12000,
        delayMs: 5,
        delayAfter: 6000,
        maxDelayMs: 200
      }
    }
  })
};

const limitLogWindow = new AbuseWindow(1, 60000);

/**
 * Normalizes a non-negative integer option.
 * @param {*} value - Requested option value.
 * @param {number} fallback - Value used for invalid input.
 * @return {number} Normalized option value.
 */
function normalizeOption (value, fallback) {
  const normalized = Math.floor(Number(value));
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : fallback;
}

/**
 * Reads a numeric field when the operator set it.
 * @param {object} source - Config object.
 * @param {string} key - Field name.
 * @param {number} fallback - Value used when the field is absent or invalid.
 * @return {number} Normalized value.
 */
function readNumber (source, key, fallback) {
  if (!source || !Object.prototype.hasOwnProperty.call(source, key)) {
    return fallback;
  }

  return normalizeOption(source[key], fallback);
}

/**
 * Resolves the hard cap. `limit` wins when present, including zero. Legacy `max` is the alias.
 * @param {object} source - Config object.
 * @param {number} fallback - Value used when neither field is present.
 * @return {number} Hard request cap.
 */
function resolveLimit (source, fallback) {
  if (source && Object.prototype.hasOwnProperty.call(source, 'limit')) {
    return normalizeOption(source.limit, fallback);
  }

  if (source && Object.prototype.hasOwnProperty.call(source, 'max')) {
    return normalizeOption(source.max, fallback);
  }

  return fallback;
}

/**
 * Returns the request path without a query string or trailing slash.
 * @param {object} req - Express request.
 * @return {string} Request path.
 */
function requestPath (req) {
  const raw = (req && (req.originalUrl || req.url)) || '';
  const path = String(raw).split('?')[0];

  if (path.length > 1 && path.endsWith('/')) {
    return path.slice(0, -1);
  }

  return path;
}

/**
 * @param {object} req - Express request.
 * @return {string} Upper-case HTTP method.
 */
function requestMethod (req) {
  return String((req && req.method) || 'GET').toUpperCase();
}

/**
 * Classifies a public REST request. OPTIONS is skipped so CORS preflight is not billed.
 * @param {object} req - Express request.
 * @return {string|null} `status`, `read`, `publish`, or null when the request is not billed.
 */
function classifyApiRequest (req) {
  const method = requestMethod(req);

  if (method === 'OPTIONS') {
    return null;
  }

  const path = requestPath(req).toLowerCase();

  if (method === 'GET' && API_STATUS_PATHS.has(path)) {
    return 'status';
  }

  if ((method === 'POST' || method === 'PUT') && API_PUBLISH_PATHS.has(path)) {
    return 'publish';
  }

  return 'read';
}

/**
 * Classifies a peer HTTP request. Unknown peer routes use the broadcast bucket.
 * @param {object} req - Express request.
 * @return {string|null} `status`, `sync`, `broadcast`, or null when the request is not billed.
 */
function classifyPeerRequest (req) {
  const method = requestMethod(req);

  if (method === 'OPTIONS') {
    return null;
  }

  const path = requestPath(req).toLowerCase();

  if (method === 'GET' && (path === '/peer/ping' || path === '/peer/height' || path === '/peer/list')) {
    return 'status';
  }

  if (method === 'GET' && (
    path === '/peer/blocks' ||
    path === '/peer/blocks/common' ||
    path === '/peer/transactions' ||
    path === '/peer/signatures'
  )) {
    return 'sync';
  }

  return 'broadcast';
}

/**
 * Builds the delay function express-slow-down expects.
 * `used` is the total hit count in the window.
 * @param {number} delayAfter - Hits allowed before delay starts.
 * @param {number} delayStep - Extra delay, in milliseconds, for each hit over delayAfter.
 * @return {function(number): number} Delay for the current hit.
 */
function createDelay (delayAfter, delayStep) {
  return function (used) {
    return Math.max(0, (used - delayAfter) * delayStep);
  };
}

/**
 * Normalizes header and window fields shared by a surface.
 * @param {object} source - Operator config.
 * @param {object} fallback - Default policy.
 * @return {object} Header fields and window.
 */
function normalizeHeaders (source, fallback) {
  const requestPropertyName = typeof source.requestPropertyName === 'string' ?
    source.requestPropertyName.trim() :
    '';
  const unsafeName = requestPropertyName === '__proto__' ||
    requestPropertyName === 'prototype' ||
    requestPropertyName === 'constructor';
  let windowMs = readNumber(source, 'windowMs', fallback.windowMs);

  if (windowMs === 0) {
    windowMs = fallback.windowMs;
  }

  return {
    windowMs: windowMs,
    standardHeaders: typeof source.standardHeaders === 'boolean' ?
      source.standardHeaders :
      fallback.standardHeaders,
    legacyHeaders: typeof source.legacyHeaders === 'boolean' ?
      source.legacyHeaders :
      fallback.legacyHeaders,
    statusCode: normalizeStatusCode(readNumber(source, 'statusCode', fallback.statusCode), fallback.statusCode),
    message: typeof source.message === 'string' && source.message.trim() ?
      source.message :
      fallback.message,
    requestPropertyName: requestPropertyName && !unsafeName ?
      requestPropertyName :
      fallback.requestPropertyName
  };
}

/**
 * Keeps the HTTP status used for hard limits inside the client-error range.
 * @param {number} statusCode - Requested status code.
 * @param {number} fallback - Default status code.
 * @return {number} Status code.
 */
function normalizeStatusCode (statusCode, fallback) {
  if (statusCode >= 400 && statusCode <= 599) {
    return statusCode;
  }

  return fallback;
}

/**
 * Normalizes one numeric policy.
 * @param {object} source - Operator policy.
 * @param {object} fallback - Parent or default policy.
 * @return {object} Normalized policy.
 */
function normalizePolicy (source, fallback) {
  const limit = resolveLimit(source, fallback.limit);
  const delayAfter = readNumber(source, 'delayAfter', fallback.delayAfter);
  const delayStep = readNumber(source, 'delayMs', fallback.delayMs);
  const maxDelayMs = readNumber(source, 'maxDelayMs', fallback.maxDelayMs);
  let windowMs = readNumber(source, 'windowMs', fallback.windowMs);

  if (windowMs === 0) {
    windowMs = fallback.windowMs;
  }

  return {
    limit: limit,
    max: limit,
    delayAfter: delayAfter,
    delayStep: delayStep,
    maxDelayMs: maxDelayMs,
    windowMs: windowMs,
    delayMs: createDelay(delayAfter, delayStep)
  };
}

/**
 * Normalizes a public API or peer surface, including optional route classes.
 * @param {object} source - Operator limits.
 * @param {object} fallback - Built-in defaults for the surface.
 * @param {string[]} classNames - Class names for this surface.
 * @return {object} Normalized surface.
 */
function normalizeSurface (source, fallback, classNames) {
  const config = source && typeof source === 'object' ? source : fallback;
  const headers = normalizeHeaders(config, fallback);
  const policy = normalizePolicy(config, Object.assign({}, fallback, headers));
  const routes = {};
  let hasRoutes = false;

  classNames.forEach(function (className) {
    const routeSource = config.routes && config.routes[className];

    if (routeSource && typeof routeSource === 'object') {
      hasRoutes = true;
      routes[className] = normalizePolicy(routeSource, policy);
      return;
    }

    routes[className] = normalizePolicy(null, policy);
  });

  return Object.assign({}, headers, policy, {
    enabled: policy.limit > 0,
    hasRoutes: hasRoutes,
    routes: hasRoutes ? routes : undefined
  });
}

/**
 * @param {string|null} className - Mounted class, or null for one shared bucket.
 * @param {function(object): (string|null)} classify - Request classifier.
 * @param {object} req - Express request.
 * @return {boolean} True when this middleware should ignore the request.
 */
function shouldSkip (className, classify, req) {
  const requestClass = classify(req);

  if (!requestClass) {
    return true;
  }

  if (!className) {
    return false;
  }

  return requestClass !== className;
}

/**
 * Logs the first hard-limit event for an IP and class in the current minute.
 * @param {object} logger - Node logger.
 * @param {object} req - Express request.
 * @param {string} bucket - Limit class name.
 * @return {void}
 */
function logLimited (logger, req, bucket) {
  if (!logger || typeof logger.warn !== 'function') {
    return;
  }

  const ip = req.ip || 'unknown';

  if (!limitLogWindow.allow(ip + ' ' + bucket)) {
    return;
  }

  logger.warn('limits', 'Request limit exceeded for ' + bucket + ' from ' + ip, {
    method: req.method,
    path: requestPath(req)
  });
}

/**
 * Builds the 429 handler. Headers, including Retry-After, are already set by express-rate-limit.
 * @param {object} logger - Node logger.
 * @param {string|null} className - Mounted class.
 * @param {function(object): (string|null)} classify - Request classifier.
 * @return {function} Express rate-limit handler.
 */
function createHandler (logger, className, classify) {
  return function (request, response, _next, options) {
    const bucket = className || classify(request) || 'all';

    logLimited(logger, request, bucket);
    response.status(options.statusCode);

    if (!response.writableEnded) {
      response.send(options.message);
    }
  };
}

/**
 * @param {object} policy - Normalized policy.
 * @param {object} headers - Surface header settings.
 * @param {string|null} className - Mounted class.
 * @param {function(object): (string|null)} classify - Request classifier.
 * @param {object} logger - Node logger.
 * @return {object} express-rate-limit options.
 */
function rateOptions (policy, headers, className, classify, logger) {
  return {
    windowMs: policy.windowMs,
    limit: policy.limit,
    standardHeaders: headers.standardHeaders,
    legacyHeaders: headers.legacyHeaders,
    statusCode: headers.statusCode,
    message: {
      success: false,
      error: headers.message
    },
    requestPropertyName: headers.requestPropertyName,
    skip: function (req) {
      return policy.limit <= 0 || shouldSkip(className, classify, req);
    },
    handler: createHandler(logger, className, classify)
  };
}

/**
 * @param {object} policy - Normalized policy.
 * @param {string|null} className - Mounted class.
 * @param {function(object): (string|null)} classify - Request classifier.
 * @return {object} express-slow-down options.
 */
function slowOptions (policy, className, classify) {
  const options = {
    windowMs: policy.windowMs,
    delayAfter: policy.delayAfter,
    delayMs: policy.delayMs,
    standardHeaders: false,
    legacyHeaders: false,
    requestPropertyName: 'slowDown',
    skip: function (req) {
      return shouldSkip(className, classify, req);
    }
  };

  if (policy.maxDelayMs > 0) {
    options.maxDelayMs = policy.maxDelayMs;
  }

  return options;
}

/**
 * Mounts rate-limit and slow-down middleware for one surface.
 * A top-level limit of 0 disables the surface, including route policies.
 * Route policies use separate buckets. A legacy config without routes keeps one shared bucket.
 * @param {object} app - Express application.
 * @param {string} prefix - Mount path.
 * @param {object} surface - Normalized surface.
 * @param {string[]} classNames - Class names.
 * @param {function(object): (string|null)} classify - Request classifier.
 * @param {object} logger - Node logger.
 * @param {string} disabledMessage - Warning used when the surface is off.
 * @return {void}
 */
function mountSurface (app, prefix, surface, classNames, classify, logger, disabledMessage) {
  if (!surface.enabled) {
    if (logger && typeof logger.warn === 'function') {
      logger.warn('limits', disabledMessage);
    }

    app.use(prefix, function (req, res, next) {
      next();
    });
    return;
  }

  const mounted = surface.hasRoutes ? classNames : [null];

  mounted.forEach(function (className) {
    const policy = className ? surface.routes[className] : surface;

    if (policy.limit > 0) {
      app.use(prefix, rateLimit(rateOptions(policy, surface, className, classify, logger)));
    }

    if (policy.delayAfter > 0 && policy.delayStep > 0 && policy.maxDelayMs !== 0) {
      app.use(prefix, slowDown(slowOptions(policy, className, classify)));
    }
  });
}

/**
 * Applies limits config to app.
 * @memberof module:helpers
 * @param {object} app - Application instance.
 * @param {object} config - Node config.
 * @param {object} [logger] - Optional logger. Limit events are logged at most once per IP and class per minute.
 * @return {object} Normalized client and peer limits.
 */
function requestLimiter (app, config, logger) {
  config = config || {};

  if (config.trustProxy) {
    app.set('trust proxy', 1);
  }

  config.api = config.api || {};
  config.api.options = config.api.options || {};
  config.peers = config.peers || {};
  config.peers.options = config.peers.options || {};

  const limits = {
    client: normalizeSurface(config.api.options.limits, defaults.api, API_CLASSES),
    peer: normalizeSurface(config.peers.options.limits, defaults.peer, PEER_CLASSES)
  };

  mountSurface(
      app,
      '/api/',
      limits.client,
      API_CLASSES,
      classifyApiRequest,
      logger,
      'Public API request limits are disabled. Set api.options.limits.limit above 0, or remove the limits block to inherit defaults.'
  );
  mountSurface(
      app,
      '/peer/',
      limits.peer,
      PEER_CLASSES,
      classifyPeerRequest,
      logger,
      'Peer HTTP request limits are disabled. Set peers.options.limits.limit above 0, or remove the limits block to inherit defaults.'
  );

  limits.middleware = {
    client: app,
    peer: app
  };

  return limits;
}

/**
 * Freezes the default policy so callers cannot change production numbers.
 * @param {object} value - Value to freeze.
 * @return {object} The same value.
 */
function freeze (value) {
  if (!value || typeof value !== 'object') {
    return value;
  }

  Object.keys(value).forEach(function (key) {
    freeze(value[key]);
  });
  Object.freeze(value);
  return value;
}

freeze(defaults);

module.exports = requestLimiter;
module.exports.defaults = defaults;
module.exports.classifyApiRequest = classifyApiRequest;
module.exports.classifyPeerRequest = classifyPeerRequest;

