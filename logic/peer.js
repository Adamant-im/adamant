'use strict';

var _ = require('lodash');
var ip = require('neoip');

const SUCCESS_RATE_POOL_SIZE = 25;

/**
 * Creates a peer.
 * @memberof module:peers
 * @constructor
 * @classdesc Main peer logic.
 * @implements {Peer.accept}
 * @param {peer} peer
 * @return {Peer} Result of the accept method.
 */
// Constructor
function Peer (peer) {
  return this.accept(peer || {});
}

/**
 * @typedef {object} peer
 * @property {string} ip
 * @property {number} port - Between 1 and 65535
 * @property {number} state - Between 0 and 2. (banned = 0, unbanned = 1, active = 2)
 * @property {string} os - Between 1 and 64 chars
 * @property {string} version - Between 5 and 12 chars
 * @property {string} dappid
 * @property {hash} broadhash
 * @property {number} height - Minimum 1
 * @property {Date} clock
 * @property {Date} updated
 * @property {string} nonce - Check this!
 * @property {string} string
 */
// Public properties
Peer.prototype.properties = [
  'ip',
  'port',
  'state',
  'os',
  'version',
  'dappid',
  'broadhash',
  'height',
  'clock',
  'updated',
  'nonce',
  'isBroadcastingViaSocket',
  'syncProtocol'
];

Peer.prototype.immutable = [
  'ip',
  'port',
  'string',
  'isBroadcastingViaSocket',
  'syncProtocol'
];

Peer.prototype.headers = [
  'os',
  'version',
  'dappid',
  'broadhash',
  'height',
  'nonce'
];

Peer.prototype.nullable = [
  'os',
  'version',
  'dappid',
  'broadhash',
  'height',
  'clock',
  'updated'
];

Peer.prototype.defaultValues = {
  isBroadcastingViaSocket: false,
  syncProtocol: 'http'
};

/**
 * Amount of success requests for the last 25 tries
 */
Peer.prototype.successRequestCount = SUCCESS_RATE_POOL_SIZE;

Peer.STATE = {
  BANNED: 0,
  DISCONNECTED: 1,
  CONNECTED: 2
};

/**
 * Socket and DNS failures. HTTP and protocol failures stay on the existing
 * remove path so a bad nethash or version does not look like an unreachable host.
 */
Peer.NETWORK_ERROR_CODES = {
  ECONNREFUSED: true,
  ECONNRESET: true,
  ECONNABORTED: true,
  ETIMEDOUT: true,
  EHOSTUNREACH: true,
  EHOSTDOWN: true,
  ENETUNREACH: true,
  ENETDOWN: true,
  ENOTFOUND: true,
  EAI_AGAIN: true,
  EADDRNOTAVAIL: true,
  EPIPE: true,
  ERR_NETWORK: true
};

/**
 * True when a request failed before an HTTP response (refused, timeout, unreachable).
 * @param {string|Error|null|undefined} error
 * @return {boolean}
 */
Peer.isNetworkError = function (error) {
  if (!error) {
    return false;
  }

  var text = typeof error === 'string' ? error : (error.code || error.message || '');
  var code = String(text).trim().split(/[\s:]/)[0];

  return !!Peer.NETWORK_ERROR_CODES[code];
};

/**
 * Exponential delay for consecutive network failures, capped by options.
 * @param {number} failures - Consecutive failure count, starting at 1
 * @param {{unreachableBackoffInitialMs: number, unreachableBackoffMaxMs: number}} options
 * @return {number} Delay in milliseconds, without jitter
 */
Peer.networkBackoffMs = function (failures, options) {
  var count = Math.max(1, failures || 1);
  var exponent = Math.min(count - 1, 16);
  var delay = options.unreachableBackoffInitialMs * Math.pow(2, exponent);

  if (delay > options.unreachableBackoffMaxMs) {
    return options.unreachableBackoffMaxMs;
  }

  return delay;
};

/**
 * Shuffles a copy's source array in place.
 * @param {Array} list
 * @param {function(): number} [rng]
 * @return {Array}
 */
function shufflePeers (list, rng) {
  var random = typeof rng === 'function' ? rng : Math.random;
  var m = list.length;

  while (m) {
    var i = Math.floor(random() * m--);
    var swap = list[m];
    list[m] = list[i];
    list[i] = swap;
  }

  return list;
}

/**
 * Picks a bounded set of peers to dial on one health-check cycle.
 * Banned peers, freshly updated peers, and peers still in backoff are skipped.
 * Peers that have answered an outbound request fill the budget first.
 * Peers that have never answered, including disconnected gossip and inbound
 * handshakes, use only a reserved sample so one cycle cannot dial every known address.
 * @param {object[]} peers
 * @param {object} options
 * @param {number} now
 * @return {object[]}
 */
Peer.selectProbeTargets = function (peers, options, now) {
  var dueVerified = [];
  var dueUnverified = [];
  var minUpdateAgeMs = options.minUpdateAgeMs || 0;

  for (var index = 0; index < peers.length; index++) {
    var peer = peers[index];

    if (!peer || !(peer.state > 0)) {
      continue;
    }

    if (peer.updated && (now - peer.updated) <= minUpdateAgeMs) {
      continue;
    }

    if (peer.nextAttemptAt && now < peer.nextAttemptAt) {
      continue;
    }

    if (peer.lastOutboundSuccessAt) {
      dueVerified.push(peer);
    } else {
      dueUnverified.push(peer);
    }
  }

  dueVerified.sort(function (a, b) {
    var aUpdated = a.updated || 0;
    var bUpdated = b.updated || 0;

    if (aUpdated !== bUpdated) {
      return aUpdated - bUpdated;
    }

    var aString = a.string || '';
    var bString = b.string || '';

    if (aString < bString) {
      return -1;
    }

    if (aString > bString) {
      return 1;
    }

    return 0;
  });

  shufflePeers(dueUnverified, options.rng);

  var maxTargets = options.maxProbeTargets;
  var unverifiedLimit = options.unverifiedProbeLimit;

  if (unverifiedLimit > maxTargets) {
    unverifiedLimit = maxTargets;
  }

  var unverified = dueUnverified.slice(0, unverifiedLimit);
  var verifiedBudget = maxTargets - unverified.length;

  if (verifiedBudget < 0) {
    verifiedBudget = 0;
  }

  return dueVerified.slice(0, verifiedBudget).concat(unverified);
};

// Public methods
/**
 * Calculates requests success rate
 * @return {number} Success percentage
 */
Peer.prototype.calcSuccessRate = function () {
  const successRate = (this.successRequestCount / SUCCESS_RATE_POOL_SIZE) * 100;
  return Math.round(successRate * 100) / 100;
};

/**
 * Updates success request count and state when more than 80% requests have failed
 * @param {string?} error Provide error if a request failed
 */
Peer.prototype.recordRequest = function (error) {
  if (error) {
    this.successRequestCount = Math.max(
        this.successRequestCount - 1,
        0
    );
  } else {
    this.successRequestCount = Math.min(
        this.successRequestCount + 1,
        SUCCESS_RATE_POOL_SIZE
    );
  }

  if (this.state === Peer.STATE.CONNECTED && this.calcSuccessRate() < 80) {
    this.state = Peer.STATE.DISCONNECTED;
  }
};

/**
 * Records one unreachable dial and sets the next time this peer may be probed.
 * Jitter spreads retries so failed peers do not become due on the same tick.
 * @param {number} now
 * @param {{unreachableBackoffInitialMs: number, unreachableBackoffMaxMs: number}} options
 * @return {number} Consecutive network failures after this attempt
 */
Peer.prototype.recordNetworkFailure = function (now, options) {
  var failures = (this.consecutiveNetworkFailures || 0) + 1;
  var delay = Peer.networkBackoffMs(failures, options);
  var jitterWindow = Math.floor(delay * 0.25);
  var jitter = jitterWindow > 0 ? Math.floor(Math.random() * (jitterWindow + 1)) : 0;

  this.consecutiveNetworkFailures = failures;
  this.nextAttemptAt = now + delay + jitter;

  return failures;
};

/**
 * Clears unreachable-peer backoff after an outbound request succeeds.
 * @param {number} now
 */
Peer.prototype.clearNetworkFailures = function (now) {
  this.consecutiveNetworkFailures = 0;
  this.nextAttemptAt = 0;
  this.lastOutboundSuccessAt = now;
};

/**
 * Checks peer properties and adjusts according rules.
 * @param {peer} peer
 * @return {object} this
 */
Peer.prototype.accept = function (peer) {
  // Normalize peer data
  peer = this.normalize(peer);

  // Accept only supported and defined properties
  _.each(this.properties, function (key) {
    if (peer[key] !== null && peer[key] !== undefined) {
      this[key] = peer[key];
    }
  }.bind(this));

  // Adjust properties according to rules
  if (/^[0-9]+$/.test(this.ip)) {
    this.ip = ip.fromLong(this.ip);
  }

  if (this.ip && this.port) {
    this.string = this.ip + ':' + this.port;
  }

  return this;
};

/**
 * Normalizes peer data.
 * @param {peer} peer
 * @return {peer}
 */
Peer.prototype.normalize = function (peer) {
  if (peer.dappid && !Array.isArray(peer.dappid)) {
    var dappid = peer.dappid;
    peer.dappid = [];
    peer.dappid.push(dappid);
  }

  if (peer.height) {
    peer.height = this.parseInt(peer.height, 1);
  }

  peer.port = this.parseInt(peer.port, 0);
  peer.state = this.parseInt(peer.state, Peer.STATE.DISCONNECTED);

  return peer;
};

/**
 * Checks number or assigns default value from parameter.
 * @param {number} integer
 * @param {number} [fallback]
 * @return {number} if not integer returns fallback
 */
Peer.prototype.parseInt = function (integer, fallback) {
  integer = parseInt(integer);
  integer = isNaN(integer) ? fallback : integer;

  return integer;
};

/**
 * Normalizes headers
 * @param {object} headers
 * @return {object} headers normalized
 */
Peer.prototype.applyHeaders = function (headers) {
  headers = headers || {};
  headers = this.normalize(headers);
  this.update(headers);
  return headers;
};

/**
 * Updates peer values if mutable.
 * @param {peer} peer
 * @return {object} this
 */
Peer.prototype.update = function (peer) {
  peer = this.normalize(peer);

  // Accept only supported properties
  _.each(this.properties, function (key) {
    // Change value only when is defined
    if (peer[key] !== null && peer[key] !== undefined && !_.includes(this.immutable, key)) {
      this[key] = peer[key];
    }
  }.bind(this));

  return this;
};

/**
 * @return {peer} clones current peer
 */
Peer.prototype.object = function () {
  var copy = {};

  _.each(this.properties, function (key) {
    const defaultValue = this.defaultValues[key];
    copy[key] = this[key] ?? defaultValue;
  }.bind(this));

  _.each(this.nullable, function (key) {
    if (!copy[key]) {
      copy[key] = null;
    }
  });

  return copy;
};

// Export
module.exports = Peer;
