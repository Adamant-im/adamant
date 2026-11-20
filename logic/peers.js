'use strict';

var _ = require('lodash');
var async = require('async');
var net = require('node:net');
var ip = require('neoip');
var Peer = require('../logic/peer.js');
var schema = require('../schema/peers.js');

// Private fields
var __private = {};
var self;
var library;
var modules;
/**
 * Initializes library.
 * @memberof module:peers
 * @constructor
 * @classdesc Main peers logic.
 * @param {object} logger
 * @param {function} cb - Callback function.
 * @return {setImmediateCallback} Callback function with `this` as data.
 */
// Constructor
function Peers (logger, cb) {
  library = {
    logger: logger
  };
  self = this;
  __private.peers = {};
  __private.maxPeers = 0;
  __private.admissionPolicy = {
    maxPeersPerIp: 0,
    maxPeersPerSubnet: 0,
    subnetMaskIpv4: 24,
    subnetMaskIpv6: 64
  };
  return setImmediate(cb, null, this);
}

/**
 * Caps how many peers may be kept in memory. Zero disables the cap.
 * @param {number} maxPeers
 */
Peers.prototype.setMaxPeers = function (maxPeers) {
  var parsed = parseInt(maxPeers, 10);

  __private.maxPeers = (isFinite(parsed) && parsed > 0) ? parsed : 0;
};

/**
 * Caps peer admission by source IP/subnet to reduce slot poisoning.
 * Zero disables a cap.
 * @param {{
 * maxPeersPerIp?: number,
 * maxPeersPerSubnet?: number,
 * subnetMaskIpv4?: number,
 * subnetMaskIpv6?: number
 * }} policy
 */
Peers.prototype.setAdmissionPolicy = function (policy) {
  policy = policy || {};

  function positiveOrZero (value, fallback) {
    var parsed = parseInt(value, 10);
    return (isFinite(parsed) && parsed >= 0) ? parsed : fallback;
  }

  function boundedMask (value, fallback, min, max) {
    var parsed = parseInt(value, 10);

    if (!isFinite(parsed)) {
      return fallback;
    }

    if (parsed < min) {
      return min;
    }

    if (parsed > max) {
      return max;
    }

    return parsed;
  }

  __private.admissionPolicy = {
    maxPeersPerIp: positiveOrZero(policy.maxPeersPerIp, 0),
    maxPeersPerSubnet: positiveOrZero(policy.maxPeersPerSubnet, 0),
    subnetMaskIpv4: boundedMask(policy.subnetMaskIpv4, 24, 0, 32),
    subnetMaskIpv6: boundedMask(policy.subnetMaskIpv6, 64, 0, 128)
  };
};

/**
 * @param {string} ipAddress
 * @param {number} mask
 * @return {string|null}
 */
function subnetKey (ipAddress, mask) {
  var normalized = Peer.canonicalIp(ipAddress);
  var family = net.isIP(normalized);

  if (!family || !normalized) {
    return null;
  }

  var fallbackMask = family === 4 ? 24 : 64;
  var parsedMask = parseInt(mask, 10);
  var normalizedMask = Math.max(
      0,
      Math.min(family === 4 ? 32 : 128, isFinite(parsedMask) ? parsedMask : fallbackMask)
  );

  try {
    var bytes = ip.toUInt8Array(normalized);
    var remaining = normalizedMask;
    var network = new Uint8Array(bytes.length);

    bytes.forEach(function (value, index) {
      var bits = Math.max(0, Math.min(8, remaining));

      if (bits === 8) {
        network[index] = value;
      } else if (bits > 0) {
        network[index] = value & (0xFF << (8 - bits));
      }

      remaining -= bits;
    });

    return family + ':' + ip.toString(network) + '/' + normalizedMask;
  } catch (err) {
    return null;
  }
}

function isFrozenPeer (peer) {
  if (!modules || !modules.peers || typeof modules.peers.isFrozen !== 'function') {
    return false;
  }

  return !!modules.peers.isFrozen(peer.ip, peer.port);
}

function removePeerEntry (peer) {
  if (modules && modules.peers && typeof modules.peers.remove === 'function') {
    return !!modules.peers.remove(peer.ip, peer.port);
  }

  return self.remove(peer);
}

function countPeers (predicate) {
  return Object.keys(__private.peers).reduce(function (count, key) {
    var peer = __private.peers[key];
    return predicate(peer) ? count + 1 : count;
  }, 0);
}

function chooseUnverifiedEvictionCandidate (predicate) {
  return Object.keys(__private.peers).map(function (key) {
    return __private.peers[key];
  }).filter(function (peer) {
    return !!peer &&
      peer.state !== Peer.STATE.BANNED &&
      !peer.lastOutboundSuccessAt &&
      !isFrozenPeer(peer) &&
      predicate(peer);
  }).sort(function (a, b) {
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
  })[0];
}

function tryEvictUnverifiedPeer (predicate, reason, incomingPeer) {
  var candidate = chooseUnverifiedEvictionCandidate(predicate);

  if (!candidate) {
    return false;
  }

  if (!removePeerEntry(candidate)) {
    return false;
  }

  library.logger.info('peers', 'Evicted unverified peer to admit incoming peer', {
    reason: reason,
    evicted: candidate.string,
    incoming: incomingPeer.string
  });

  return true;
}

/**
 * Finds the peer by nonce
 * @param {string} nonce
 */
Peers.prototype.getByNonce = function (nonce) {
  return Object.values(__private.peers).find((peer) => peer.nonce === nonce);
};

/**
 * Returns a peer instance.
 * @param {peer} peer
 * @return {peer} peer instance
 */
Peers.prototype.create = function (peer) {
  if (!(peer instanceof Peer)) {
    return new Peer(peer);
  } else {
    return peer;
  }
};

/**
 * Checks if peer is in peers list.
 * @param {Peer} peer
 * @return {boolean} True if peer is in peers list
 */
Peers.prototype.exists = function (peer) {
  return !!self.get(peer);
};

/**
 * Gets a peer from peers or creates a new one and returns it.
 * @param {peer} peer
 * @return {peer} peer new or peer from peers
 */
Peers.prototype.get = function (peer) {
  if (typeof peer === 'string') {
    var separator = peer.lastIndexOf(':');
    var address = peer.slice(0, separator);
    var port = peer.slice(separator + 1);
    var canonicalAddress = Peer.canonicalIp(address.replace(/^\[|\]$/g, ''));
    var key = canonicalAddress ? canonicalAddress + ':' + parseInt(port, 10) : peer;

    return __private.peers[key];
  } else {
    peer = self.create(peer);
    return __private.peers[peer.string];
  }
};

/**
 * Inserts or updates a peer
 * @param {peer} peer
 * @param {boolean} insertOnly - true to only insert.
 * @param {{touchUpdated?: boolean}} [options]
 * @return {boolean} True if operation is success.
 */
Peers.prototype.upsert = function (peer, insertOnly, options) {
  options = options || {};

  // Insert new peer
  var insert = function (peer) {
    var policy = __private.admissionPolicy || {};
    var incomingIp = Peer.canonicalIp(peer.ip);
    var incomingSubnet = subnetKey(peer.ip, net.isIP(peer.ip) === 4 ? policy.subnetMaskIpv4 : policy.subnetMaskIpv6);
    var skipSourceCaps = isFrozenPeer(peer);
    var verifiedAdmission = skipSourceCaps || !!peer.lastOutboundSuccessAt;

    if (!incomingIp || _.isEmpty(modules.peers.acceptable([peer]))) {
      library.logger.debug('peers', 'Rejecting unacceptable peer', peer.string);
      return false;
    }

    if (!skipSourceCaps && policy.maxPeersPerIp > 0) {
      var sameIp = countPeers(function (item) {
        return !!item && Peer.canonicalIp(item.ip) === incomingIp;
      });

      if (sameIp >= policy.maxPeersPerIp) {
        if (verifiedAdmission && tryEvictUnverifiedPeer(function (item) {
          return Peer.canonicalIp(item.ip) === incomingIp;
        }, 'per-ip-cap', peer)) {
          sameIp--;
        }
      }

      if (sameIp >= policy.maxPeersPerIp) {
        library.logger.debug('peers', 'Rejecting peer because per-IP cap is reached', {
          peer: peer.string,
          maxPeersPerIp: policy.maxPeersPerIp
        });
        return false;
      }
    }

    if (!skipSourceCaps && policy.maxPeersPerSubnet > 0 && incomingSubnet) {
      var sameSubnet = countPeers(function (item) {
        if (!item) {
          return false;
        }

        var itemSubnet = subnetKey(item.ip, net.isIP(item.ip) === 4 ? policy.subnetMaskIpv4 : policy.subnetMaskIpv6);
        return itemSubnet && itemSubnet === incomingSubnet;
      });

      if (sameSubnet >= policy.maxPeersPerSubnet) {
        if (verifiedAdmission && tryEvictUnverifiedPeer(function (item) {
          var itemSubnet = subnetKey(item.ip, net.isIP(item.ip) === 4 ? policy.subnetMaskIpv4 : policy.subnetMaskIpv6);
          return itemSubnet && itemSubnet === incomingSubnet;
        }, 'per-subnet-cap', peer)) {
          sameSubnet--;
        }
      }

      if (sameSubnet >= policy.maxPeersPerSubnet) {
        library.logger.debug('peers', 'Rejecting peer because per-subnet cap is reached', {
          peer: peer.string,
          maxPeersPerSubnet: policy.maxPeersPerSubnet,
          subnet: incomingSubnet
        });
        return false;
      }
    }

    if (__private.maxPeers && Object.keys(__private.peers).length >= __private.maxPeers) {
      var admitted = tryEvictUnverifiedPeer(function (item) {
        return verifiedAdmission || !!item.consecutiveNetworkFailures;
      }, 'peer-table-full', peer);

      if (!admitted) {
        library.logger.debug('peers', 'Rejecting peer because the peer table is full', peer.string);
        return false;
      }
    }

    peer.updated = Date.now();
    __private.peers[peer.string] = peer;
    library.logger.info('peers', 'Added new peer', peer.string);
    return true;
  };

  // Update existing peer
  var update = function (peer) {
    if (options.touchUpdated !== false) {
      peer.updated = Date.now();
    } else {
      delete peer.updated;
    }

    const existingPeer = __private.peers[peer.string];

    var diff = {};
    _.each(peer, function (value, key) {
      const isImmutableProperty = existingPeer.immutable.includes(key);
      if (key !== 'updated' && !isImmutableProperty && existingPeer[key] !== value) {
        diff[key] = value;
      }
    });

    __private.peers[peer.string].update(peer);

    if (Object.keys(diff).length) {
      library.logger.debug('peers', 'Updated peer ' + peer.string, diff);
    } else {
      library.logger.trace('peers', 'Peer not changed', peer.string);
    }
  };

  peer = self.create(peer);

  if (!peer.string) {
    library.logger.warn('peers', 'Upsert invalid peer rejected', { peer: peer });
    return false;
  }

  // Performing insert or update
  if (self.exists(peer)) {
    // Skip update if insert-only is forced
    if (!insertOnly) {
      update(peer);
    } else {
      return false;
    }
  } else if (!insert(peer)) {
    return false;
  }

  // Stats for tracking changes
  var cnt_total = 0;
  var cnt_active = 0;
  var cnt_empty_height = 0;
  var cnt_empty_broadhash = 0;

  _.each(__private.peers, function (peer, index) {
    ++cnt_total;
    if (peer.state === 2) {
      ++cnt_active;
    }
    if (!peer.height) {
      ++cnt_empty_height;
    }
    if (!peer.broadhash) {
      ++cnt_empty_broadhash;
    }
  });

  library.logger.trace('peers', 'Peer stats', { total: cnt_total, alive: cnt_active, empty_height: cnt_empty_height, empty_broadhash: cnt_empty_broadhash });

  return true;
};

/**
 * Deletes peer from peers list.
 * @param {peer} peer
 * @return {boolean} True if peer exists
 */
Peers.prototype.remove = function (peer) {
  peer = self.create(peer);
  // Remove peer if exists
  if (self.exists(peer)) {
    library.logger.info('peers', 'Removed peer', peer.string);
    library.logger.debug('peers', 'Removed peer', { peer: __private.peers[peer.string] });
    __private.peers[peer.string] = null; // Possible memory leak prevention
    delete __private.peers[peer.string];
    return true;
  } else {
    library.logger.debug('peers', 'Failed to remove peer', { err: 'AREMOVED', peer: peer });
    return false;
  }
};

/**
 * Finds the peer and updates the request success rate.
 * @param {Peer | {ip: string, port: number}} data Peer's IP and port
 * @param {string?} error Provide error of a request failed
 * @return {boolean} `true` if peer is successfully updated
 */
Peers.prototype.recordRequest = function (data, error) {
  if (!self.exists(data)) {
    library.logger.debug('peers', 'Failed to update request success rate for peer', {
      peer: data,
      err: error
    });
    return false;
  }

  const peer = self.get(data);
  peer.recordRequest(error);

  return true;
};

/**
 * Returns private list of peers
 * @param {boolean} [normalize] - If true transform list to object
 * @return {peer[]} list of peers
 */
Peers.prototype.list = function (normalize) {
  if (normalize) {
    return Object.keys(__private.peers).map(function (key) { return __private.peers[key].object(); });
  } else {
    return Object.keys(__private.peers).map(function (key) { return __private.peers[key]; });
  }
};

/**
 * Returns amount of peers that are connected via socket
 * @return {number}
 */
Peers.prototype.getSocketCount = function () {
  return Object.values(__private.peers).reduce((acc, peer) => acc + (peer.isBroadcastingViaSocket ? 1 : 0), 0);
};

// Public methods
/**
 * Modules are not required in this file.
 * @param {object} __modules - Peers module.
 */
Peers.prototype.bindModules = function (__modules) {
  modules = {
    peers: __modules.peers
  };
};

// Export
module.exports = Peers;
