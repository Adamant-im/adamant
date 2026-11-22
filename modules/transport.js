'use strict';

var _ = require('lodash');
var async = require('async');
var Broadcaster = require('../logic/broadcaster.js');
var Peer = require('../logic/peer.js');
var requestLimiter = require('../helpers/request-limiter.js');
var constants = require('../helpers/constants.js');
var ip = require('neoip');
var axios = require('axios').default;
var schema = require('../schema/transport.js');
var sql = require('../sql/transport.js');
var zlib = require('zlib');

// Private fields
var modules, library, self, __private = {};

const DEFAULT_RATE_LIMIT_RETRY_MS = 1000;
const MAX_RATE_LIMIT_RETRY_MS = 60000;
const MAX_PEER_REQUEST_BODY_BYTES = 2 * 1024 * 1024;
const MAX_PEER_SMALL_RESPONSE_BYTES = 64 * 1024;
const MAX_PEER_LIST_RESPONSE_BYTES = 256 * 1024;
const MAX_PEER_SIGNATURES_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_PEER_TRANSACTIONS_RESPONSE_BYTES = 32 * 1024 * 1024;
const MAX_PEER_BLOCKS_RESPONSE_BYTES = 256 * 1024 * 1024;
const SYNC_ABSOLUTE_TIMEOUT_MS = 60000;

__private.headers = {};
__private.loaded = false;

/**
 * Initializes library with scope content and generates a Broadcaster instance.
 * @memberof module:transport
 * @constructor
 * @classdesc Main Transport methods.
 * @param {function} cb - Callback function.
 * @param {scope} scope - App instance.
 * @return {setImmediateCallback} Callback function with `self` as data.
 */
// Constructor
function Transport (cb, scope) {
  library = {
    logger: scope.logger,
    db: scope.db,
    bus: scope.bus,
    schema: scope.schema,
    network: scope.network,
    balancesSequence: scope.balancesSequence,
    logic: {
      block: scope.logic.block,
      transaction: scope.logic.transaction,
      peers: scope.logic.peers
    },
    config: {
      peers: {
        options: scope.config.peers.options
      }
    }
  };
  self = this;

  __private.broadcaster = new Broadcaster(
      scope.config.broadcasts,
      scope.config.forging.force,
      scope.logic.peers,
      scope.logic.transaction,
      scope.logger
  );

  setImmediate(cb, null, self);
}

// Private methods
/**
 * Removes a peer based on ip and port.
 * @private
 * @implements {modules.peers.remove}
 * @param {object} options - Contains code and peer
 * @param {string} extraMessage
 */
__private.removePeer = function (options, extraMessage) {
  library.logger.debug('peers', [options.code, 'Removing peer', options.peer.string, extraMessage].join(' '));
  modules.peers.remove(options.peer.ip, options.peer.port);
};

/**
 * Updates the request success rate for the peer.
 * Provide the error if the request has been failed.
 * @implements modules.peers.recordRequest
 * @param {{peer: {ip: string, port: number}, error?: string}} options
 * @return {boolean} Returns `true` if peer has been updated
 */
__private.recordRequest = function (options) {
  return modules.peers.recordRequest(
      options.peer.ip,
      options.peer.port,
      options.error
  );
};

/**
 * Validates signatures body and for each signature calls receiveSignature.
 * @private
 * @implements {library.schema.validate}
 * @implements {__private.receiveSignature}
 * @param {object} query
 * @param {function} cb
 * @return {setImmediateCallback} cb, err
 */
__private.receiveSignatures = function (query, cb) {
  var signatures;

  async.series({
    validateSchema: function (seriesCb) {
      library.schema.validate(query, schema.signatures, function (err) {
        if (err) {
          return setImmediate(seriesCb, 'Invalid signatures body');
        } else {
          return setImmediate(seriesCb);
        }
      });
    },
    receiveSignatures: function (seriesCb) {
      signatures = query.signatures;

      async.eachSeries(signatures, function (signature, eachSeriesCb) {
        __private.receiveSignature(signature, function (err) {
          if (err) {
            library.logger.debug('transport', `Failed to verify signature ${signature}: ${err?.message || err}`, err.stack);
          }

          return setImmediate(eachSeriesCb);
        });
      }, seriesCb);
    }
  }, function (err) {
    return setImmediate(cb, err);
  });
};

/**
 * Validates signature with schema and calls processSignature.
 * @private
 * @implements {library.schema.validate}
 * @implements {modules.multisignatures.processSignature}
 * @param {signature} signature
 * @return {setImmediateCallback} cb | error messages
 */
__private.receiveSignature = function (signature, cb) {
  library.schema.validate({ signature: signature }, schema.signature, function (err) {
    if (err) {
      return setImmediate(cb, 'Invalid signature body');
    }

    modules.multisignatures.processSignature(signature, function (err) {
      if (err) {
        return setImmediate(cb, 'Error processing signature: ' + err);
      } else {
        return setImmediate(cb);
      }
    });
  });
};

/**
 * Validates transactions with schema and calls receiveTransaction for each
 * transaction.
 * @private
 * @implements {library.schema.validate}
 * @implements {__private.receiveTransaction}
 * @param {object} query - Contains transactions
 * @param {peer} peer
 * @param {string} extraLogMessage
 * @param {function} cb
 * @return {setImmediateCallback} cb, err
 */
__private.receiveTransactions = function (query, peer, extraLogMessage, cb) {
  var transactions;

  async.series({
    validateSchema: function (seriesCb) {
      library.schema.validate(query, schema.transactions, function (err) {
        if (err) {
          return setImmediate(seriesCb, 'Invalid transactions body');
        } else {
          return setImmediate(seriesCb);
        }
      });
    },
    receiveTransactions: function (seriesCb) {
      transactions = query.transactions;

      async.eachSeries(transactions, function (transaction, eachSeriesCb) {
        transaction.bundled = true;

        __private.receiveTransaction(transaction, peer, extraLogMessage, function (err) {
          if (err) {
            library.logger.debug('transactions', err, transaction);
          }

          return setImmediate(eachSeriesCb);
        });
      }, seriesCb);
    }
  }, function (err) {
    return setImmediate(cb, err);
  });
};

/**
 * Normalizes transaction and remove peer if it fails.
 * Calls balancesSequence.add to receive transaction and
 * processUnconfirmedTransaction to confirm it.
 * @private
 * @implements {library.logic.transaction.objectNormalize}
 * @implements {__private.removePeer}
 * @implements {library.balancesSequence.add}
 * @implements {modules.transactions.processUnconfirmedTransaction}
 * @param {transaction} transaction
 * @param {peer} peer
 * @param {string} extraLogMessage
 * @param {function} cb
 * @return {setImmediateCallback} cb, error message
 */
__private.receiveTransaction = function (transaction, peer, extraLogMessage, cb) {
  var id = (transaction ? transaction.id : 'null');

  try {
    transaction = library.logic.transaction.objectNormalize(transaction);
  } catch (e) {
    library.logger.debug('transport', 'Transaction normalization failed', { id: id, err: e.toString(), module: 'transport', tx: transaction });

    __private.removePeer({ peer: peer, code: 'ETRANSACTION' }, extraLogMessage);

    return setImmediate(cb, 'Invalid transaction body - ' + e.toString());
  }

  // Real-time admission grace, mirroring the Public API's `publish()` boundary.
  // This is a wall-clock spam/pool-poisoning guard, not a consensus rule, so it
  // belongs here - the boundary where a transaction first enters the network from a
  // peer - and not inside `transaction.verify()`, which also replays historical,
  // already-confirmed transactions during block processing and sync. See AGENTS.md
  // "Current Activation Switches" for why wall-clock checks must stay out of verify().
  var timestampWindowError = library.logic.transaction.checkFutureTimestamp(transaction) ||
      library.logic.transaction.checkPastTimestampWindow(transaction);

  if (timestampWindowError) {
    library.logger.debug('transactions', 'Rejected transaction ' + transaction.id + ' from peer ' + peer.string, timestampWindowError);

    return setImmediate(cb, timestampWindowError);
  }

  library.balancesSequence.add(function (cb) {
    library.logger.debug('transactions', 'Received transaction ' + transaction.id + ' from peer ' + peer.string);
    modules.transactions.processUnconfirmedTransaction(transaction, true, function (err) {
      if (err) {
        library.logger.debug('transactions', ['Transaction', id].join(' '), err.toString());
        if (transaction) { library.logger.debug('transport', 'Transaction', transaction); }

        return setImmediate(cb, err.toString());
      } else {
        return setImmediate(cb, null, transaction.id);
      }
    });
  }, cb);
};

// Public methods
/**
 * Sets or gets headers
 * @param {object} [headers]
 * @return {object} private variable with headers
 */
Transport.prototype.headers = function (headers) {
  if (headers) {
    __private.headers = headers;
  }

  return __private.headers;
};

/**
 * Gets consensus
 * @return {number} broadcaster consensus
 */
Transport.prototype.consensus = function () {
  return __private.broadcaster.consensus;
};

/**
 * Returns true if broadcaster consensus is less than minBroadhashConsensus.
 * Returns false if consensus is undefined.
 * @return {boolean}
 */
Transport.prototype.poorConsensus = function () {
  if (__private.broadcaster.consensus === undefined) {
    return false;
  } else {
    return (__private.broadcaster.consensus < constants.minBroadhashConsensus);
  }
};

/**
 * Calls getPeers method from Broadcaster class.
 * @implements {Broadcaster.getPeers}
 * @param {object} params
 * @param {function} cb
 * @return {Broadcaster.getPeers} calls getPeers
 */
Transport.prototype.getPeers = function (params, cb) {
  return __private.broadcaster.getPeers(params, cb);
};

/**
 * Calls peers.list based on config options to get peers, calls getFromPeer
 * with first peer from list.
 * @implements {modules.peers.list}
 * @implements {getFromPeer}
 * @param {object} config
 * @param {function|Object} options
 * @param {function} cb
 * @return {setImmediateCallback|getFromPeer} error | calls getFromPeer
 */
Transport.prototype.getFromRandomPeer = function (config, options, cb) {
  if (typeof options === 'function') {
    cb = options;
    options = config;
    config = {};
  }
  config.limit = 1;
  config.allowedStates = [Peer.STATE.DISCONNECTED, Peer.STATE.CONNECTED];
  modules.peers.list(config, function (err, peers) {
    if (!err && peers.length) {
      return self.getFromPeer(peers[0], options, cb);
    } else {
      return setImmediate(cb, err || 'No acceptable peers found');
    }
  });
};

/**
 * Requests information from peer(ip, port, url) and validates response:
 * - status 200
 * - headers valid schema
 * - same network (response headers nethash)
 * - compatible version (response headers version)
 * Removes peer if error, updates peer otherwise
 * @requires {axios}
 * @implements {library.logic.peers.create}
 * @implements {library.schema.validate}
 * @implements {modules.system.networkCompatible}
 * @implements {modules.system.versionCompatible}
 * @implements {modules.peers.update}
 * @implements {__private.removePeer}
 * @param {peer} peer
 * @param {object} options
 * @param {function} cb
 * @return {setImmediateCallback | object} error message | {body, peer}
 * @todo implements secure http request with https
 */
Transport.prototype.getFromPeer = function (peer, options, cb) {
  var url;

  if (options.api) {
    url = '/peer' + options.api;
  } else if (typeof options.url === 'string' && options.url.charAt(0) === '/') {
    url = options.url;
  } else {
    return setImmediate(cb, 'Invalid peer request path');
  }

  var candidate = library.logic.peers.create(peer);
  peer = new Peer(candidate.object());

  if (_.isEmpty(modules.peers.acceptable([peer]))) {
    return setImmediate(cb, 'Peer is not acceptable for outbound requests: ' + peer.string);
  }

  var trackedPeer = library.logic.peers.get(peer);

  if (trackedPeer && trackedPeer.state === Peer.STATE.BANNED) {
    return setImmediate(cb, 'Peer is banned: ' + peer.string);
  }

  var requestScope = requestLimiter.classifyPeerRequest({
    method: options.method,
    originalUrl: url
  }) || 'all';

  if (modules.peers.isBackedOff(peer, requestScope)) {
    return setImmediate(cb, 'Peer outbound request is still in backoff: ' + peer.string);
  }

  var host = ip.isV6Format(peer.ip) ? '[' + peer.ip + ']' : peer.ip;
  var configuredTimeout = library.config.peers.options.timeout;
  var hasExplicitTimeout = Number.isFinite(options.timeout) && options.timeout > 0;
  var requestTimeout = hasExplicitTimeout ?
    Math.min(options.timeout, configuredTimeout) :
    configuredTimeout;
  var absoluteTimeout = (!hasExplicitTimeout && requestScope === 'sync') ?
    Math.max(configuredTimeout, SYNC_ABSOLUTE_TIMEOUT_MS) :
    requestTimeout;
  var maxContentLength = __private.maxResponseBytes(options.method, url);

  var req = {
    url: 'http://' + host + ':' + peer.port + url,
    method: options.method,
    headers: Object.assign({}, __private.headers, {
      [requestLimiter.peerRateLimitHeader]: requestLimiter.peerRateLimitVersion
    }),
    timeout: requestTimeout,
    proxy: false,
    maxRedirects: 0,
    maxBodyLength: MAX_PEER_REQUEST_BODY_BYTES,
    maxContentLength: maxContentLength,
    validateStatus: function () { return true; }
  };
  var controller = new AbortController();
  var absoluteTimeoutId = setTimeout(function () {
    controller.abort();
  }, absoluteTimeout);

  req.signal = controller.signal;

  if (options.data) {
    req.data = options.data;
  }

  function maybeRecordRequest (errorCode) {
    if (options.recordRequest === false) {
      return;
    }

    __private.recordRequest({
      peer: peer,
      error: errorCode
    });
  }

  axios(req)
      .then((res) => {
        clearTimeout(absoluteTimeoutId);
        if (res.status === 429) {
          var retryAfterMs = __private.retryAfterMs(res.headers['retry-after']);
          var limitedScope = String(
              res.headers['ratelimit-scope'] ||
              requestScope
          ).trim().toLowerCase();

          modules.peers.deferRequest(
              peer.ip,
              peer.port,
              limitedScope,
              retryAfterMs
          );
          return setImmediate(
              cb,
              'ERATELIMIT 429 ' + limitedScope + ' ' + req.method + ' ' + req.url +
                ' retry in ' + retryAfterMs + 'ms'
          );
        }

        if (res.status !== 200) {
          maybeRecordRequest('ERESPONSE');
          // Remove peer
          __private.removePeer({ peer: peer, code: 'ERESPONSE ' + res.status }, req.method + ' ' + req.url);

          return setImmediate(cb, ['Received bad response code', res.status, req.method, req.url].join(' '));
        } else {
          var headers = peer.applyHeaders(res.headers);

          var report = library.schema.validate(headers, schema.headers);
          if (!report) {
            maybeRecordRequest('EHEADERS');
            // Remove peer
            __private.removePeer({ peer: peer, code: 'EHEADERS' }, req.method + ' ' + req.url);

            return setImmediate(cb, ['Invalid response headers', JSON.stringify(headers), req.method, req.url].join(' '));
          }

          if (!modules.system.networkCompatible(headers.nethash)) {
            maybeRecordRequest('ENETHASH');
            // Remove peer
            __private.removePeer({ peer: peer, code: 'ENETHASH' }, req.method + ' ' + req.url);

            return setImmediate(cb, ['Peer is not on the same network', headers.nethash, req.method, req.url].join(' '));
          }

          if (!modules.system.versionCompatible(headers.version)) {
            maybeRecordRequest('EVERSION');
            // Remove peer
            __private.removePeer({ peer: peer, code: 'EVERSION:' + headers.version }, req.method + ' ' + req.url);

            return setImmediate(cb, ['Peer is using incompatible version', headers.version, req.method, req.url].join(' '));
          }

          var live = library.logic.peers.get(peer);

          if (live && live.state === Peer.STATE.BANNED) {
            return setImmediate(cb, 'Peer is banned: ' + peer.string);
          }

          modules.peers.update(peer, true);
          maybeRecordRequest();

          return setImmediate(cb, null, { body: res.data, peer: peer });
        }
      })
      .catch((err) => {
        clearTimeout(absoluteTimeoutId);

        var errorCode = err && err.code;

        if (controller.signal.aborted && (!errorCode || errorCode === 'ERR_CANCELED')) {
          errorCode = 'ETIMEDOUT';
        } else if (errorCode === 'ERR_BAD_RESPONSE' && /stream has been aborted/i.test(err.message)) {
          errorCode = 'ECONNRESET';
        }

        if (peer) {
          maybeRecordRequest(errorCode || 'EUNKNOWN');
        }

        if (
          requestScope !== 'sync' &&
          errorCode === 'ERR_BAD_RESPONSE' &&
          /maxContentLength.*exceeded/i.test(err.message)
        ) {
          __private.removePeer({ peer: peer, code: 'ERESPONSE' }, req.method + ' ' + req.url);
        }

        return setImmediate(cb, [errorCode || err.code, 'Request failed', req.method, req.url].join(' '));
      });
};

/**
 * Returns the maximum allowed decompressed response size for a peer request.
 * Sync caps are derived from the JSON-serialized protocol worst case: because
 * consensus does not currently enforce hex on chat `message`/`own_message`
 * (or state `value`), each 20,480-char field can expand up to 6x in JSON when
 * control characters are escaped (`\u000x`), yielding ~248 KiB per row:
 * - /peer/blocks: 34 blocks x 25 txs x ~248 KiB ~= 201 MiB -> 256 MiB cap
 * - /peer/transactions: maxSharedTxs (100) x ~248 KiB ~= 24 MiB -> 32 MiB cap
 * - /peer/signatures: maxSharedTxs (100) hex-validated sig sets -> 2 MiB cap
 * Status and broadcast ack responses stay tightly bounded.
 * @private
 * @param {string} method - HTTP method.
 * @param {string} url - Peer request path (may include query string).
 * @return {number} Maximum response byte length.
 */
__private.maxResponseBytes = function (method, url) {
  var normalizedMethod = String(method || 'GET').toUpperCase();

  if (normalizedMethod !== 'GET') {
    return MAX_PEER_SMALL_RESPONSE_BYTES;
  }

  var path = String(url || '').split('?')[0].toLowerCase();

  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1);
  }

  if (path === '/peer/blocks') {
    return MAX_PEER_BLOCKS_RESPONSE_BYTES;
  }

  if (path === '/peer/transactions') {
    return MAX_PEER_TRANSACTIONS_RESPONSE_BYTES;
  }

  if (path === '/peer/signatures') {
    return MAX_PEER_SIGNATURES_RESPONSE_BYTES;
  }

  if (path === '/peer/list') {
    return MAX_PEER_LIST_RESPONSE_BYTES;
  }

  return MAX_PEER_SMALL_RESPONSE_BYTES;
};

/**
 * Parses Retry-After as either delay seconds or an HTTP date.
 * Invalid values use a short default and remote values are capped.
 * @param {string|string[]} value - Retry-After response header.
 * @return {number} Bounded delay in milliseconds.
 */
__private.retryAfterMs = function (value) {
  var header = Array.isArray(value) ? value[0] : value;
  var delay;

  if (typeof header === 'string' && /^\d+$/.test(header.trim())) {
    delay = parseInt(header, 10) * 1000;
  } else if (typeof header === 'string') {
    var retryAt = Date.parse(header);
    delay = Number.isFinite(retryAt) ? Math.max(0, retryAt - Date.now()) : DEFAULT_RATE_LIMIT_RETRY_MS;
  } else {
    delay = DEFAULT_RATE_LIMIT_RETRY_MS;
  }

  return Math.min(MAX_RATE_LIMIT_RETRY_MS, Math.max(0, delay));
};

// Events
/**
 * Bounds scope to private broadcaster and initialize headers.
 * @implements {modules.system.headers}
 * @implements {broadcaster.bind}
 * @param {modules} scope - Loaded modules.
 */
Transport.prototype.onBind = function (scope) {
  modules = {
    blocks: scope.blocks,
    peers: scope.peers,
    multisignatures: scope.multisignatures,
    transactions: scope.transactions,
    system: scope.system
  };

  __private.headers = modules.system.headers();
  __private.broadcaster.bind(
      scope.peers,
      scope.transport,
      scope.transactions
  );
};

/**
 * Sets private variable loaded to true
 */
Transport.prototype.onBlockchainReady = function () {
  __private.loaded = true;
};

/**
 * Calls enqueue signatures and emits a 'signature/change' socket message.
 * @implements {Broadcaster.maxRelays}
 * @implements {Broadcaster.enqueue}
 * @implements {library.network.wsServer.emit}
 * @param {signature} signature
 * @param {object} broadcast
 * @emits signature/change
 */
Transport.prototype.onSignature = function (signature, broadcast) {
  if (broadcast && !__private.broadcaster.maxRelays(signature)) {
    __private.broadcaster.enqueue({}, { api: '/signatures', data: { signature: signature }, method: 'POST' });
    library.network.wsServer.emit('signature/change', signature);
  }
};

/**
 * Calls enqueue transactions and emits a 'transactions/change' socket message.
 * @implements {Broadcaster.maxRelays}
 * @implements {Broadcaster.enqueue}
 * @implements {library.network.wsServer.emit}
 * @param {transaction} transaction
 * @param {object} broadcast
 * @emits transactions/change
 */
Transport.prototype.onUnconfirmedTransaction = function (transaction, broadcast) {
  if (broadcast && !__private.broadcaster.maxRelays(transaction)) {
    __private.broadcaster.enqueue({}, { api: '/transactions', data: { transaction: transaction }, method: 'POST' });
    library.network.wsServer.emit('transactions/change', transaction);
  }
};

/**
 * Calls broadcast blocks and emits a 'blocks/change' socket message.
 * @implements {modules.system.getBroadhash}
 * @implements {Broadcaster.maxRelays}
 * @implements {Broadcaster.broadcast}
 * @implements {library.network.wsServer.emit}
 * @param {block} block
 * @param {object} broadcast
 * @emits blocks/change
 */
Transport.prototype.onNewBlock = function (block, broadcast) {
  if (broadcast) {
    var broadhash = modules.system.getBroadhash();

    modules.system.update(function () {
      if (!__private.broadcaster.maxRelays(block)) {
        __private.broadcaster.broadcast({ limit: constants.maxPeers, broadhash: broadhash }, { api: '/blocks', data: { block: block }, method: 'POST', immediate: true });
      }
      library.network.wsServer.emit('blocks/change', block);
    });
  }
};

/**
 * Sets loaded to false.
 * @param {function} cb
 * @return {setImmediateCallback} cb
 */
Transport.prototype.cleanup = function (cb) {
  __private.loaded = false;
  return setImmediate(cb);
};

/**
 * Returns true if modules are loaded and private variable loaded is true.
 * @return {boolean}
 */
Transport.prototype.isLoaded = function () {
  return modules && __private.loaded;
};

// Internal API
/**
 * @todo implement API comments with apidoc.
 * @see {@link http://apidocjs.com/}
 */
Transport.prototype.internal = {
  blocksCommon: function (ids, peer, extraLogMessage, cb) {
    var escapedIds = ids
    // Remove quotes
        .replace(/['"]+/g, '')
    // Separate by comma into an array
        .split(',')
    // Reject any non-numeric values
        .filter(function (id) {
          return /^[0-9]+$/.test(id);
        });

    if (!escapedIds.length) {
      library.logger.debug('transport', 'Common block request validation failed', { err: 'ESCAPE', req: ids });

      __private.removePeer({ peer: peer, code: 'ECOMMON' }, extraLogMessage);

      return setImmediate(cb, 'Invalid block id sequence');
    }

    library.db.query(sql.getCommonBlock, escapedIds).then(function (rows) {
      return setImmediate(cb, null, { success: true, common: rows[0] || null });
    }).catch(function (err) {
      library.logger.error('api-transport', `Failed to get common block: ${err?.message || err}`, err.stack);
      return setImmediate(cb, 'Failed to get common block');
    });
  },

  blocks: function (query, cb) {
    // Get 34 blocks with all data (joins) from provided block id
    // According to maximum payload of 58150 bytes per block with every transaction being a vote
    // Discounting maximum compression setting used in middleware
    // Maximum transport payload = 2000000 bytes
    modules.blocks.utils.loadBlocksData({
      limit: 34, // 1977100 bytes
      lastId: query.lastBlockId
    }, function (err, data) {
      if (err) {
        return setImmediate(cb, null, { blocks: [] });
      }

      return setImmediate(cb, null, { blocks: data });
    });
  },

  postBlock: function (block, peer, extraLogMessage, cb) {
    try {
      block = library.logic.block.objectNormalize(block);
    } catch (e) {
      library.logger.debug('api-transport', 'Block normalization failed', { err: e.toString(), module: 'transport', block: block });

      __private.removePeer({ peer: peer, code: 'EBLOCK' }, extraLogMessage);

      return setImmediate(cb, null, { success: false, error: e.toString() });
    }

    library.bus.message('receiveBlock', block);

    return setImmediate(cb, null, { success: true, blockId: block.id });
  },

  list: function (req, cb) {
    modules.peers.list({ limit: constants.maxPeers }, function (err, peers) {
      peers = (!err ? peers : []);
      return setImmediate(cb, null, { success: !err, peers: peers });
    });
  },

  height: function (req, cb) {
    return setImmediate(cb, null, { success: true, height: modules.blocks.lastBlock.get().height });
  },

  ping: function (req, cb) {
    return setImmediate(cb, null, { success: true });
  },

  postSignatures: function (query, cb) {
    if (query.signatures) {
      __private.receiveSignatures(query, function (err) {
        if (err) {
          return setImmediate(cb, null, { success: false, message: err });
        } else {
          return setImmediate(cb, null, { success: true });
        }
      });
    } else {
      __private.receiveSignature(query.signature, function (err, id) {
        if (err) {
          return setImmediate(cb, null, { success: false, message: err });
        } else {
          return setImmediate(cb, null, { success: true });
        }
      });
    }
  },

  getSignatures: function (req, cb) {
    var transactions = modules.transactions.getMultisignatureTransactionList(true, constants.maxSharedTxs);
    var signatures = [];

    async.eachSeries(transactions, function (trs, __cb) {
      if (trs.signatures && trs.signatures.length) {
        signatures.push({
          transaction: trs.id,
          signatures: trs.signatures
        });
      }

      return setImmediate(__cb);
    }, function () {
      return setImmediate(cb, null, { success: true, signatures: signatures });
    });
  },

  getTransactions: function (req, cb) {
    var transactions = modules.transactions.getMergedTransactionList(true, constants.maxSharedTxs);

    return setImmediate(cb, null, { success: true, transactions: transactions });
  },

  postTransactions: function (query, peer, extraLogMessage, cb) {
    if (query.transactions) {
      __private.receiveTransactions(query, peer, extraLogMessage, function (err) {
        if (err) {
          return setImmediate(cb, null, { success: false, message: err });
        } else {
          return setImmediate(cb, null, { success: true });
        }
      });
    } else {
      __private.receiveTransaction(query.transaction, peer, extraLogMessage, function (err, id) {
        if (err) {
          return setImmediate(cb, null, { success: false, message: err });
        } else {
          return setImmediate(cb, null, { success: true, transactionId: id });
        }
      });
    }
  },

  handshake: function (ip, port, headers, validateHeaders, cb) {
    var peer = library.logic.peers.create(
        {
          ip: ip,
          port: port
        }
    );

    var headers = peer.applyHeaders(headers);

    validateHeaders(headers, function (error, extraMessage) {
      if (error) {
        // Remove peer
        __private.removePeer({ peer: peer, code: 'EHEADERS' }, extraMessage);

        return setImmediate(cb, { success: false, error: error });
      }

      if (!modules.system.networkCompatible(headers.nethash)) {
        // Remove peer
        __private.removePeer({ peer: peer, code: 'ENETHASH' }, extraMessage);

        return setImmediate(cb, {
          success: false,
          message: 'Request is made on the wrong network',
          expected: modules.system.getNethash(),
          received: headers.nethash
        });
      }

      if (!modules.system.versionCompatible(headers.version)) {
        // Remove peer
        __private.removePeer({
          peer: peer,
          code: 'EVERSION:' + headers.version
        }, extraMessage);

        return setImmediate(cb, {
          success: false,
          message: 'Request is made from incompatible version',
          expected: modules.system.getMinVersion(),
          received: headers.version
        });
      }

      modules.peers.recordInboundPeer(peer);

      return setImmediate(cb, null, peer);
    });
  }
};

// Export
module.exports = Transport;
