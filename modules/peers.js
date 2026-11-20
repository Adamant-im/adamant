'use strict';

const EventEmitter = require('node:events');

var _ = require('lodash');
var async = require('async');
var constants = require('../helpers/constants.js');
var jobsQueue = require('../helpers/jobsQueue.js');
var extend = require('extend');
var fs = require('fs');
var ip = require('neoip');
var path = require('path');
var pgp = require('pg-promise')(); // We also initialize library here
var sandboxHelper = require('../helpers/sandbox.js');
var schema = require('../schema/peers.js');
var Peer = require('../logic/peer.js');
var sql = require('../sql/peers.js');
var util = require('util');

// Private fields
var modules, library, self, __private = {}, shared = {};

/**
 * Initializes library with scope content.
 * @param {Function} cb - Callback function.
 * @param {scope} scope - App instance.
 * @memberof module:peers
 * @constructor
 * @classdesc Main peers methods.
 * @return {setImmediateCallback} Callback function with `self` as data.
 */
// Constructor
function Peers (cb, scope) {
  library = {
    logger: scope.logger,
    db: scope.db,
    schema: scope.schema,
    bus: scope.bus,
    nonce: scope.nonce,
    build: scope.build,
    lastCommit: scope.lastCommit,
    logic: {
      peers: scope.logic.peers
    },
    config: {
      peers: scope.config.peers,
      version: scope.packageJson.version
    }
  };
  self = this;

  self.events = new EventEmitter();
  __private.outboundRequestState = new Map();

  var options = __private.probeOptions();

  library.logic.peers.setMaxPeers(options.maxPeers);
  library.logic.peers.setAdmissionPolicy({
    maxPeersPerIp: options.maxPeersPerIp,
    maxPeersPerSubnet: options.maxPeersPerSubnet,
    subnetMaskIpv4: options.subnetMaskIpv4,
    subnetMaskIpv6: options.subnetMaskIpv6
  });

  setImmediate(cb, null, self);
}

// Private methods
/**
 * Returns peers length after get them by filter.
 * @param {object} filter
 * @param {Function} cb - Callback function.
 *
 * @private
 * @return {setImmediateCallback} peers length
 */
__private.countByFilter = function (filter, cb) {
  __private.getByFilter(filter, function (err, peers) {
    return setImmediate(cb, null, peers.length);
  });
};

/**
 * Gets randomly ordered list of peers by filter.
 * @param {object} filter
 * @param {Function} cb - Callback function.
 *
 * @private
 * @return {setImmediateCallback} peers
 */
__private.getByFilter = function (filter, cb) {
  var allowedFields = ['ip', 'port', 'state', 'os', 'version', 'broadhash', 'height', 'nonce'];
  var limit = filter.limit ? Math.abs(filter.limit) : null;
  var offset = filter.offset ? Math.abs(filter.offset) : 0;

  // Sorting peers
  var sortPeers = function (field, asc) {
    return function (a, b) {
      var sort_res =
        // Nulls last
        a[field] === b[field] ? 0 :
          a[field] === null ? 1 :
            b[field] === null ? -1 :
              // Ascending
              asc ? (a[field] < b[field] ? -1 : 1) :
                // Descending
                (a[field] < b[field] ? 1 : -1);
      return sort_res;
    };
  };

  // Randomizing peers (using Fisher-Yates-Durstenfeld shuffle algorithm)
  var shuffle = function (array) {
    var m = array.length, t, i;
    // While there remain elements to shuffle
    while (m) {
      // Pick a remaining element
      i = Math.floor(Math.random() * m--);
      // And swap it with the current element
      t = array[m];
      array[m] = array[i];
      array[i] = t;
    }
    return array;
  };

  // Apply filters (by AND)
  var peers = library.logic.peers.list(true);

  peers = peers.filter(function (peer) {
    // var peer = __private.peers[index];
    var passed = true;
    _.each(filter, function (value, key) {
      // Special case for dapp peers
      if (key === 'dappid' && (peer[key] === null || (Array.isArray(peer[key]) && !_.includes(peer[key], String(value))))) {
        passed = false;
        return false;
      }
      // Every filter field need to be in allowed fields, exists and match value
      if (_.includes(allowedFields, key) && !(peer[key] !== undefined && peer[key] === value)) {
        passed = false;
        return false;
      }
    });
    return passed;
  });

  // Sorting
  if (filter.orderBy) {
    var sort_arr = String(filter.orderBy).split(':');
    var sort_field = sort_arr[0] ? (_.includes(allowedFields, sort_arr[0]) ? sort_arr[0] : null) : null;
    var sort_method = (sort_arr.length === 2) ? (sort_arr[1] === 'desc' ? false : true) : true;
    if (sort_field) {
      peers.sort(sortPeers(sort_field, sort_method));
    }
  } else {
    // Sort randomly by default
    peers = shuffle(peers);
  }

  // Apply limit if supplied
  if (limit) {
    peers = peers.slice(offset, (offset + limit));
  } else if (offset) {
    peers = peers.slice(offset);
  }

  return setImmediate(cb, null, peers);
};

/**
 * Inserts configured seed peers before importing the capped persisted peer table.
 * @param {Function} cb - Callback function.
 * @private
 * @return {setImmediateCallback} cb
 */
__private.insertSeeds = function (cb) {
  var seeds = [];
  var configured = library.config.peers.list || [];

  library.logger.trace('peers', 'Peers->insertSeeds');
  configured.forEach(function (seed) {
    var peer = library.logic.peers.create(seed);

    if (!library.logic.peers.exists(peer)) {
      peer.state = Peer.STATE.DISCONNECTED;
      library.logic.peers.upsert(peer, true);
    }

    var live = library.logic.peers.get(peer);

    if (live) {
      seeds.push(live);
    }
  });

  library.logger.trace('peers', 'Peers->insertSeeds - inserted seeds', { total: seeds.length });
  return setImmediate(cb);
};

/**
 * Probes configured seeds after persisted bans have been restored.
 * @param {Function} cb
 * @private
 */
__private.probeSeeds = function (cb) {
  var seeds = (library.config.peers.list || []).map(function (seed) {
    return library.logic.peers.get(seed);
  }).filter(function (peer) {
    return peer && peer.state !== Peer.STATE.BANNED;
  });

  library.logger.trace('peers', 'Peers->probeSeeds', { total: seeds.length });
  __private.probePeers(seeds, __private.probeOptions(), function () {
    return setImmediate(cb);
  });
};

/**
 * Loads peers from the database into memory without dialing them.
 * Startup used to open one outbound connection per stored row, including dead
 * addresses. Those peers are marked disconnected and left for the bounded
 * update cycle. runtime.sql already resets non-banned rows to disconnected.
 * @param {Function} cb - Callback function.
 * @implements library.db
 * @private
 * @return {setImmediateCallback} cb
 */
__private.dbLoad = function (cb) {
  library.logger.trace('peers', 'Importing peers from database');
  library.db.any(sql.getAll).then(function (rows) {
    var imported = 0;

    rows.forEach(function (row) {
      var peer = library.logic.peers.create(row);
      var existing = library.logic.peers.get(peer);

      if (existing) {
        if (peer.state === Peer.STATE.BANNED) {
          existing.state = Peer.STATE.BANNED;
        }
        return;
      }

      if (peer.state !== Peer.STATE.BANNED) {
        peer.state = Peer.STATE.DISCONNECTED;
      }

      if (library.logic.peers.upsert(peer, true)) {
        imported++;
      }
    });

    library.logger.info('peers', 'Imported peers from database', { count: imported, rows: rows.length });
    return setImmediate(cb);
  }).catch(function (err) {
    library.logger.error('peers', 'Import peers from database failed', { error: err.message || err });
    return setImmediate(cb);
  });
};

/**
 * Inserts list of peers into `peers` table and inserts dapps peers
 * into `peers_dapp` table.
 * @param {Function} cb - Callback function.
 * @implements library.db
 * @private
 * @return {setImmediateCallback} cb
 */
__private.dbSave = function (cb) {
  var peers = library.logic.peers.list(true);

  // Do nothing when peers list is empty
  if (!peers.length) {
    library.logger.debug('peers', 'Export peers to database failed: Peers list empty');
    return setImmediate(cb);
  }

  // Creating set of columns
  var cs = new pgp.helpers.ColumnSet([
    'ip', 'port', 'state', 'height', 'os', 'version', 'clock',
    {
      name: 'broadhash', init: function (col) {
        return col.value ? Buffer.from(col.value, 'hex') : null;
      }
    }
  ], { table: 'peers' });

  // Wrap sql queries in transaction and execute
  library.db.tx(function (t) {
    // Generating insert query
    var insert_peers = pgp.helpers.insert(peers, cs);

    var queries = [
      // Clear peers table
      t.none(sql.clear),
      // Insert all peers
      t.none(insert_peers)
    ];

    // Inserting dapps peers
    _.each(peers, function (peer) {
      if (peer.dappid) {
        // If there are dapps on peer - push separately for every dapp
        _.each(peer.dappid, function (dappid) {
          var dapp_peer = peer;
          dapp_peer.dappid = dappid;
          queries.push(t.none(sql.addDapp, peer));
        });
      }
    });

    return t.batch(queries);
  }).then(function (data) {
    library.logger.info('peers', 'Peers exported to database');
    return setImmediate(cb);
  }).catch(function (err) {
    library.logger.error('peers', 'Export peers to database failed', { error: err.message || err });
    return setImmediate(cb);
  });
};

// Public methods
/**
 * Calls helpers.sandbox.callMethod().
 * @param {Function} call - Method to call.
 * @param {*} args - List of arguments.
 * @param {Function} cb - Callback function.
 *
 * @implements module:helpers#callMethod
 */
Peers.prototype.sandboxApi = function (call, args, cb) {
  sandboxHelper.callMethod(Peers.prototype.shared, call, args, cb);
};

/**
 * Sets peer state to active (2).
 * @param {peer} peer
 * @param {boolean} [outboundVerified] - Whether an outbound request verified the peer.
 * @todo rename this function to activePeer or similar
 *
 * @return {Function} Calls peers.upsert
 */
Peers.prototype.update = function (peer, outboundVerified) {
  var existing = library.logic.peers.get(peer);

  if (existing && existing.state === Peer.STATE.BANNED) {
    library.logger.debug('peers', 'Keeping banned peer state', peer.string || (peer.ip + ':' + peer.port));
    return false;
  }

  peer.state = Peer.STATE.CONNECTED;

  if (outboundVerified) {
    peer.lastOutboundSuccessAt = Date.now();
  }

  return library.logic.peers.upsert(peer);
};

/**
 * Tracks inbound handshake data without marking the peer outbound-verified.
 * @param {peer} peer
 * @return {boolean}
 */
Peers.prototype.recordInboundPeer = function (peer) {
  var existing = library.logic.peers.get(peer);

  peer.state = existing ? existing.state : Peer.STATE.DISCONNECTED;

  return library.logic.peers.upsert(peer, false, {
    touchUpdated: !existing
  });
};

/**
 * Changes the connection type to ws
 * @param {Peer} peer
 */
Peers.prototype.switchToWs = function (peer) {
  const existingPeer = library.logic.peers.get(peer);
  if (existingPeer) {
    existingPeer.syncProtocol = 'ws';
  }
};

/**
 * Changes the connection type to http
 * @param {Peer} peer
 */
Peers.prototype.switchToHttp = function (peer) {
  const existingPeer = library.logic.peers.get(peer);
  if (existingPeer) {
    existingPeer.syncProtocol = 'http';
  }
};

/**
 * Returns whether the peer is in config peers list
 * @param {string} ip
 * @param {number} port
 * @return {boolean}
 */
Peers.prototype.isFrozen = function (ip, port) {
  const peers = library.config.peers.list;
  const canonicalIp = Peer.canonicalIp(ip);

  const isFrozen = peers.some(function (peer) {
    return Peer.canonicalIp(peer.ip) === canonicalIp && parseInt(peer.port, 10) === parseInt(port, 10);
  });

  return isFrozen;
};

/**
 * Removes peer from peers list if it is not a peer from config file list.
 * @param {string} pip - Peer ip
 * @param {number} port
 *
 * @implements logic.peers.remove
 * @return {function} Calls peers.remove
 */
Peers.prototype.remove = function (pip, port) {
  var live = library.logic.peers.get({ ip: pip, port: port });

  if (live && live.state === Peer.STATE.BANNED) {
    library.logger.debug('peers', 'Cannot remove banned peer', pip + ':' + port);
    return false;
  }

  if (self.isFrozen(pip, port)) {
    // FIXME: Keeping peer frozen is bad idea at all
    library.logger.debug('peers', 'Cannot remove frozen peer', pip + ':' + port);
    return;
  }

  var removed = library.logic.peers.remove({ ip: pip, port: port });

  if (removed && library.db) {
    library.db.none(sql.removeByAddress, { ip: pip, port: port }).catch(function (err) {
      library.logger.debug('peers', 'Failed to delete peer from database', {
        error: err.message || err,
        ip: pip,
        port: port
      });
    });
  }

  return removed;
};

/**
 * Updates the request success rate for the peer.
 * @param {string} ip
 * @param {number} port
 * @param {string?} error Provide the error in case of failed request
 *
 * @implements logic.peers.recordRequest
 * @return {boolean} Returns `true` if peer has been updated
 */
Peers.prototype.recordRequest = function (ip, port, error) {
  var peer = library.logic.peers.get({ ip: ip, port: port });
  var options = __private.probeOptions();
  var now = Date.now();

  if (peer && peer.state === Peer.STATE.BANNED) {
    return true;
  }

  if (!peer) {
    if (error && Peer.isNetworkError(error)) {
      __private.recordUntrackedNetworkFailure({ ip: ip, port: port }, options, now);
    } else if (!error) {
      __private.outboundRequestState.delete(library.logic.peers.create({ ip: ip, port: port }).string);
    }

    return false;
  }

  library.logic.peers.recordRequest({ ip: ip, port: port }, error);

  if (!error) {
    __private.outboundRequestState.delete(peer.string);
    peer.clearNetworkFailures(now);
    return true;
  }

  if (!Peer.isNetworkError(error)) {
    return true;
  }

  var failures = peer.recordNetworkFailure(now, options);
  __private.copyTrackedNetworkFailure(peer, options, now);
  var neverReachable = !peer.lastOutboundSuccessAt;
  var unreachableLongEnough = neverReachable ||
    (now - peer.lastOutboundSuccessAt) >= options.unreachableEvictAfterMs;

  if (failures < options.unreachableEvictAfter || !unreachableLongEnough) {
    return true;
  }

  if (!peer.ip || !peer.port || self.isFrozen(peer.ip, peer.port)) {
    library.logger.debug('peers', 'Keeping unreachable seed peer', peer.string);
    return true;
  }

  if (!neverReachable && __private.countVerifiedConnected() < options.minConnectedPeers) {
    library.logger.debug('peers', 'Keeping previously verified unreachable peer because too few verified peers are connected', peer.string);
    return true;
  }

  library.logger.info('peers', 'Removing unreachable peer', peer.string);
  self.remove(peer.ip, peer.port);
  return true;
};

/**
 * Returns true while a tracked or untracked endpoint is in outbound backoff.
 * @param {peer} peer
 * @return {boolean}
 */
Peers.prototype.isBackedOff = function (peer) {
  var live = library.logic.peers.get(peer);
  var now = Date.now();

  if (live && live.nextAttemptAt && now < live.nextAttemptAt) {
    return true;
  }

  var endpoint = library.logic.peers.create(peer);
  var state = __private.outboundRequestState.get(endpoint.string);

  return !!(state && state.nextAttemptAt && now < state.nextAttemptAt);
};

/**
 * Pings peer.
 * @param {peer} peer - List of arguments.
 * @param {Function} cb - Callback function.
 * @implements transport.getFromPeer
 * @return {setImmediateCallback} cb | error when ping peer fails
 */
Peers.prototype.ping = function (peer, cb) {
  library.logger.trace('peers', 'Pinging peer: ' + peer.string);
  modules.transport.getFromPeer(peer, {
    api: '/height',
    method: 'GET',
    recordRequest: false
  }, function (err, res) {
    if (err) {
      library.logger.trace('peers', 'Ping peer failed: ' + peer.string, err);
      return setImmediate(cb, err);
    } else {
      return setImmediate(cb);
    }
  });
};

/**
 * Discovers peers by getting list and validates them.
 * @param {Function} cb - Callback function.
 *
 * @return {setImmediateCallback} cb | error
 */
Peers.prototype.discover = function (cb) {
  library.logger.trace('peers', 'Peers->discover');
  function getFromRandomPeer (waterCb) {
    modules.transport.getFromRandomPeer({
      api: '/list',
      method: 'GET'
    }, function (err, res) {
      return setImmediate(waterCb, err, res);
    });
  }

  function validatePeersList (res, waterCb) {
    library.schema.validate(res.body, schema.discover.peers, function (err) {
      return setImmediate(waterCb, err, res.body.peers);
    });
  }

  function pickPeers (peers, waterCb) {
    var picked = self.acceptable(peers);
    library.logger.debug('peers', ['Picked', picked.length, 'of', peers.length, 'peers'].join(' '));
    return setImmediate(waterCb, null, picked);
  }

  function updatePeers (peers, waterCb) {
    var updated = 0;
    async.each(peers, function (peer, eachCb) {
      peer = library.logic.peers.create(peer);

      library.schema.validate(peer, schema.discover.peer, function (err) {
        if (err) {
          library.logger.warn('peers', ['Rejecting invalid peer:', peer.string].join(' '), { err: err });
          return setImmediate(eachCb);
        }

        // Set peer state to disconnected
        peer.state = Peer.STATE.DISCONNECTED;
        // We rely on data from other peers only when new peer is discovered for the first time
        library.logic.peers.upsert(peer, true);
        return setImmediate(eachCb);
      });
    }, function (err) {
      library.logger.trace('peers', 'Peers discovered', peers.length);
      return setImmediate(waterCb);
    });
  }

  async.waterfall([
    getFromRandomPeer,
    validatePeersList,
    pickPeers,
    updatePeers
  ], function (err) {
    return setImmediate(cb, err);
  });
};

/**
 * Filters peers with private address or with the same nonce.
 * @param {peer[]} peers
 */
Peers.prototype.acceptable = function (peers) {
  const allowPrivatePeers = !!(library.config.peers.options && library.config.peers.options.allowPrivatePeers);

  return _(peers)
      .uniqWith(function (a, b) {
      // Removing non-unique peers
        return (a.ip + a.port) === (b.ip + b.port);
      })
      .filter(function (peer) {
        const isValidIp = ip.isV4Format(peer.ip) || ip.isV6Format(peer.ip);
        const isValidPort = Number.isInteger(peer.port) && peer.port >= 1 && peer.port <= 65535;

        if (!isValidIp || !isValidPort) {
          return false;
        }

        // Removing peers with private address or nonce equal to self
        const isJsAPI = peer.os === 'adm-js-api' || peer.os === 'lisk-js-api';
        const isPrivatePeerAllowed = allowPrivatePeers || !ip.isPrivate(peer.ip);

        if ((process.env['NODE_ENV'] || '').toUpperCase() === 'TEST') {
          return peer.nonce !== modules.system.getNonce() && !isJsAPI;
        }

        return isPrivatePeerAllowed && peer.nonce !== modules.system.getNonce() && !isJsAPI;
      }).value();
};

/**
 * Returns true if the peer's state is banned
 * @param {Peer} peer
 */
Peers.prototype.isBanned = function (peer) {
  var live = library.logic.peers.get(peer);
  return !live || live.state === Peer.STATE.BANNED;
};

/**
 * Gets peers list and calculated consensus.
 * @param {object} options - Contains limit, broadhash.
 * @param {Function} cb - Callback function.
 * @return {setImmediateCallback} error | peers, consensus
 */
Peers.prototype.list = function (options, cb) {
  options.limit = options.limit || constants.maxPeers;
  options.broadhash = options.broadhash || modules.system.getBroadhash();
  options.allowedStates = options.allowedStates || [Peer.STATE.CONNECTED];
  options.attempts = ['matched broadhash', 'unmatched broadhash'];
  options.attempt = 0;
  options.matched = 0;

  function randomList (options, peers, cb) {
    var now = Date.now();

    var peersList = _.shuffle(library.logic.peers.list());
    var accepted, found, matched, picked;

    found = peersList.length;
    // Apply filters
    peersList = peersList.filter(function (peer) {
      if (peer.nextAttemptAt && now < peer.nextAttemptAt) {
        return false;
      }

      if (options.syncProtocol && peer.syncProtocol !== options.syncProtocol) {
        return false;
      }

      if (options.broadhash) {
        // Skip banned and disconnected peers (state 0 and 1)
        return options.allowedStates.indexOf(peer.state) !== -1 && (
          // Matched broadhash when attempt 0
          options.attempt === 0 ? (peer.broadhash === options.broadhash) :
            // Unmatched broadhash when attempt 1
            options.attempt === 1 ? (peer.broadhash !== options.broadhash) : false
        );
      } else {
        // Skip banned and disconnected peers (state 0 and 1)
        return options.allowedStates.indexOf(peer.state) !== -1;
      }
    });

    if (peersList.length) {
      var verified = [];
      var unverified = [];

      peersList.forEach(function (peer) {
        if (peer.lastOutboundSuccessAt) {
          verified.push(peer);
        } else {
          unverified.push(peer);
        }
      });

      peersList = _.shuffle(verified).concat(_.shuffle(unverified));
    }

    matched = peersList.length;
    // Apply limit
    peersList = peersList.slice(0, options.limit);
    picked = peersList.length;
    accepted = self.acceptable(peers.concat(peersList));
    library.logger.debug('peers', 'Listing peers', { attempt: options.attempts[options.attempt], found: found, matched: matched, picked: picked, accepted: accepted.length });
    return setImmediate(cb, null, accepted);
  }

  async.waterfall([
    function (waterCb) {
      // Matched broadhash
      return randomList(options, [], waterCb);
    },
    function (peers, waterCb) {
      options.matched = peers.length;
      options.limit -= peers.length;
      ++options.attempt;
      if (options.limit > 0) {
        // Unmatched broadhash
        return randomList(options, peers, waterCb);
      } else {
        return setImmediate(waterCb, null, peers);
      }
    }
  ], function (err, peers) {
    // Calculate consensus
    var consensus = Math.round(options.matched / peers.length * 100 * 1e2) / 1e2;
    consensus = isNaN(consensus) ? 0 : consensus;

    library.logger.debug('peers', ['Listing', peers.length, 'total peers'].join(' '));
    var normalizedPeers = peers.map(function (peer) {
      return peer instanceof Peer ? peer.object() : peer;
    });

    return setImmediate(cb, err, normalizedPeers, consensus);
  });
};

/**
 * Reads a non-negative integer config value, or returns the fallback.
 * @param {*} value
 * @param {number} fallback
 * @return {number}
 * @private
 */
__private.nonNegativeInt = function (value, fallback) {
  var parsed = parseInt(value, 10);

  if (!isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
};

/**
 * Keeps per-endpoint backoff for direct requests that are not in the peer table.
 * @param {peer} peer
 * @param {object} options
 * @param {number} now
 * @private
 */
__private.recordUntrackedNetworkFailure = function (peer, options, now) {
  var endpoint = library.logic.peers.create(peer);
  var state = __private.outboundRequestState.get(endpoint.string) || endpoint;

  state.recordNetworkFailure(now, options);
  state.lastOutboundFailureAt = now;
  __private.outboundRequestState.delete(endpoint.string);
  __private.outboundRequestState.set(endpoint.string, state);

  var maxEntries = Math.max(100, options.maxPeers * 2);

  while (__private.outboundRequestState.size > maxEntries) {
    var oldest = __private.outboundRequestState.keys().next().value;
    __private.outboundRequestState.delete(oldest);
  }
};

/**
 * Copies tracked failure backoff into the bounded cache so eviction cannot
 * make an endpoint immediately retryable through a direct request.
 * @param {Peer} peer
 * @param {object} options
 * @param {number} now
 * @private
 */
__private.copyTrackedNetworkFailure = function (peer, options, now) {
  var state = library.logic.peers.create({
    ip: peer.ip,
    port: peer.port
  });

  state.consecutiveNetworkFailures = peer.consecutiveNetworkFailures;
  state.nextAttemptAt = peer.nextAttemptAt;
  state.lastOutboundFailureAt = now;

  __private.outboundRequestState.delete(state.string);
  __private.outboundRequestState.set(state.string, state);

  var maxEntries = Math.max(100, options.maxPeers * 2);

  while (__private.outboundRequestState.size > maxEntries) {
    var oldest = __private.outboundRequestState.keys().next().value;
    __private.outboundRequestState.delete(oldest);
  }
};

/**
 * Outbound health-check limits. Missing config keeps the safe defaults so an
 * older config.json still bounds peer-update dials.
 * @return {object}
 * @private
 */
__private.probeOptions = function () {
  var options = (library.config.peers && library.config.peers.options) || {};
  var resolved = {
    updateConcurrency: Math.max(1, __private.nonNegativeInt(options.updateConcurrency, 8)),
    probeSpacingMs: __private.nonNegativeInt(options.probeSpacingMs, 50),
    maxProbeTargets: Math.max(1, __private.nonNegativeInt(options.maxProbeTargets, 20)),
    unverifiedProbeLimit: __private.nonNegativeInt(options.unverifiedProbeLimit, 5),
    minUpdateAgeMs: __private.nonNegativeInt(options.minUpdateAgeMs, 3000),
    unreachableBackoffInitialMs: __private.nonNegativeInt(options.unreachableBackoffInitialMs, 30000),
    unreachableBackoffMaxMs: __private.nonNegativeInt(options.unreachableBackoffMaxMs, 60 * 60 * 1000),
    unreachableEvictAfter: Math.max(1, __private.nonNegativeInt(options.unreachableEvictAfter, 6)),
    unreachableEvictAfterMs: __private.nonNegativeInt(options.unreachableEvictAfterMs, 24 * 60 * 60 * 1000),
    minConnectedPeers: __private.nonNegativeInt(options.minConnectedPeers, 10),
    maxPeers: Math.max(1, __private.nonNegativeInt(options.maxPeers, 500)),
    maxPeersPerIp: __private.nonNegativeInt(options.maxPeersPerIp, 6),
    maxPeersPerSubnet: __private.nonNegativeInt(options.maxPeersPerSubnet, 64),
    subnetMaskIpv4: Math.max(0, Math.min(32, __private.nonNegativeInt(options.subnetMaskIpv4, 24))),
    subnetMaskIpv6: Math.max(0, Math.min(128, __private.nonNegativeInt(options.subnetMaskIpv6, 64)))
  };

  if (resolved.unreachableBackoffMaxMs < resolved.unreachableBackoffInitialMs) {
    resolved.unreachableBackoffMaxMs = resolved.unreachableBackoffInitialMs;
  }

  if (resolved.unverifiedProbeLimit > resolved.maxProbeTargets) {
    resolved.unverifiedProbeLimit = resolved.maxProbeTargets;
  }

  return resolved;
};

/**
 * Counts peers that have answered us and are still connected.
 * Eviction stops while this count is below the configured floor.
 * @return {number}
 * @private
 */
__private.countVerifiedConnected = function () {
  return library.logic.peers.list().reduce(function (count, peer) {
    if (peer && peer.state === Peer.STATE.CONNECTED && peer.lastOutboundSuccessAt) {
      return count + 1;
    }

    return count;
  }, 0);
};

/**
 * Dials peers with a concurrency cap and a minimum gap between new attempts.
 * The gap keeps a failed burst from opening many distinct connections in the
 * same few milliseconds.
 * @param {object[]} targets
 * @param {object} options
 * @param {Function} cb
 * @private
 */
__private.probePeers = function (targets, options, cb) {
  var updated = 0;
  var spacing = options.probeSpacingMs;
  var lastStart = Date.now() - spacing;

  function startNext (peer, eachCb) {
    var wait = 0;

    if (spacing > 0) {
      var now = Date.now();
      var earliest = lastStart + spacing;

      wait = Math.max(0, earliest - now);
      lastStart = now + wait;
    }

    setTimeout(function () {
      library.logger.trace('peers', 'Updating peer', peer.string);
      self.ping(peer, function (err) {
        updated++;
        self.recordRequest(peer.ip, peer.port, err);
        return setImmediate(eachCb);
      });
    }, wait);
  }

  async.eachLimit(targets, options.updateConcurrency, startNext, function () {
    library.logger.trace('peers', 'Peers updated', { updated: updated, total: targets.length });

    if (options.notify && updated) {
      self.events.emit('peers:update');
    }

    return setImmediate(cb);
  });
};

/**
 * Probes one bounded sample of due peers.
 * @param {Function} cb
 */
Peers.prototype.runPeerUpdate = function (cb) {
  var options = __private.probeOptions();
  var peers = library.logic.peers.list();
  var targets = Peer.selectProbeTargets(peers, options, Date.now());

  options.notify = true;
  library.logger.trace('peers', 'Updating peers', { count: peers.length, probing: targets.length });
  __private.probePeers(targets, options, cb);
};

// Events
/**
 * assigns scope to modules variable
 * @param {modules} scope
 */
Peers.prototype.onBind = function (scope) {
  modules = {
    transport: scope.transport,
    system: scope.system
  };
};

/**
 * Triggers onPeersReady after:
 * - Insert and probe configured seed peers.
 * - Load stored peers into memory without dialing them.
 * - Discover peers by getting list and validates them.
 */
Peers.prototype.onBlockchainReady = function () {
  async.series({
    insertSeeds: function (seriesCb) {
      __private.insertSeeds(function (err) {
        return setImmediate(seriesCb);
      });
    },
    importFromDatabase: function (seriesCb) {
      __private.dbLoad(function (err) {
        return setImmediate(seriesCb);
      });
    },
    probeSeeds: function (seriesCb) {
      __private.probeSeeds(function () {
        return setImmediate(seriesCb);
      });
    },
    discoverNew: function (seriesCb) {
      self.discover(function (err) {
        return setImmediate(seriesCb);
      });
    }
  }, function (err) {
    library.bus.message('peersReady');
  });
};

/**
 * Discovers peers and probes a bounded sample on a 5 second interval.
 * The job waits until the sample finishes, so a large dead peer table cannot
 * start another full dial wave while the previous one is still opening sockets.
 */
Peers.prototype.onPeersReady = function () {
  library.logger.trace('peers', 'Peers ready');
  function peersDiscoveryAndUpdate (cb) {
    async.series({
      discoverPeers: function (seriesCb) {
        library.logger.trace('peers', 'Discovering new peers…');
        self.discover(function (err) {
          if (err) {
            library.logger.error('peers', 'Discovering new peers failed.', err);
          }
          return setImmediate(seriesCb);
        });
      },
      updatePeers: function (seriesCb) {
        self.runPeerUpdate(seriesCb);
      }
    }, function () {
      return setImmediate(cb);
    });
  }
  jobsQueue.register('peersDiscoveryAndUpdate', peersDiscoveryAndUpdate, 5000);
};

/**
 * Export peers to database.
 * @param {Function} cb - Callback function.
 */
Peers.prototype.cleanup = function (cb) {
  // Save peers on exit
  __private.dbSave(function () {
    return setImmediate(cb);
  });
};

/**
 * Checks if `modules` is loaded.
 * @return {boolean} True if `modules` is loaded.
 */
Peers.prototype.isLoaded = function () {
  return !!modules;
};

// Shared API
/**
 * @see {@link http://apidocjs.com/}
 * @todo implement API comments with apidoc.
 */
Peers.prototype.shared = {
  count: function (req, cb) {
    async.series({
      connected: function (cb) {
        __private.countByFilter({ state: Peer.STATE.CONNECTED }, cb);
      },
      disconnected: function (cb) {
        __private.countByFilter({ state: Peer.STATE.DISCONNECTED }, cb);
      },
      banned: function (cb) {
        __private.countByFilter({ state: Peer.STATE.BANNED }, cb);
      }
    }, function (err, res) {
      if (err) {
        return setImmediate(cb, 'Failed to get peer count');
      }

      return setImmediate(cb, null, res);
    });
  },

  getPeers: function (req, cb) {
    library.schema.validate(req.body, schema.getPeers, function (err) {
      if (err) {
        return setImmediate(cb, err[0].message);
      }

      if (req.body.limit < 0 || req.body.limit > 100) {
        return setImmediate(cb, 'Invalid limit. Maximum is 100');
      }

      __private.getByFilter(req.body, function (err, peers) {
        if (err) {
          return setImmediate(cb, 'Failed to get peers');
        }

        return setImmediate(cb, null, { peers: peers });
      });
    });
  },

  getPeer: function (req, cb) {
    library.schema.validate(req.body, schema.getPeer, function (err) {
      if (err) {
        return setImmediate(cb, err[0].message);
      }

      __private.getByFilter({
        ip: req.body.ip,
        port: req.body.port
      }, function (err, peers) {
        if (err) {
          return setImmediate(cb, 'Failed to get peer');
        }

        if (peers.length) {
          return setImmediate(cb, null, { success: true, peer: peers[0] });
        } else {
          return setImmediate(cb, 'Peer not found');
        }
      });
    });
  },

  /*
   * Returns information about version
   *
   * @public
   * @async
   * @method version
   * @param  {Object}   req HTTP request object
   * @param  {Function} cb Callback function
   * @return {Function} cb Callback function from params (through setImmediate)
   * @return {Object}   cb.err Always return `null` here
   * @return {Object}   cb.obj Anonymous object with version info
   * @return {String}   cb.obj.build Build information (if available, otherwise '')
   * @return {String}   cb.obj.commit Hash of last git commit (if available, otherwise '')
   * @return {String}   cb.obj.version ADAMANT version from config file
   */
  version: function (req, cb) {
    return setImmediate(cb, null, {
      build: library.build,
      commit: library.lastCommit,
      version: library.config.version
    });
  }
};

// Export
module.exports = Peers;
