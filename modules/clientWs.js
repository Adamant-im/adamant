const { Server } = require('socket.io');
const AbuseWindow = require('../helpers/abuse-window');
const normalizeIp = AbuseWindow.normalizeIp;
const TransactionSubscription = require('./clientWs/transactionSubscription');

const LIMIT_DEFAULTS = {
  maxConnections: 1000,
  maxConnectionsPerIp: 30,
  maxAddresses: 100,
  maxTypes: 16,
  maxAssetChatTypes: 8,
  maxSubscriptionEvents: 60,
  windowMs: 10000
};

const CAP_FIELDS = {
  address: { set: 'addresses', limit: 'maxAddresses' },
  types: { set: 'types', limit: 'maxTypes' },
  assetChatTypes: { set: 'assetChatTypes', limit: 'maxAssetChatTypes' }
};

class ClientWs {
  /**
   * Creates a websocket server for client transaction subscriptions.
   * @param {object} config - Client websocket configuration.
   * @param {object} logger - Logger instance.
   * @param {Function} [cb] - Callback invoked with the initialized server.
   */
  constructor (config, logger, cb) {
    this.enabled = Boolean(config && config.enabled);
    this.trustProxy = Boolean(config && config.trustProxy);
    this.limits = normalizeClientLimits(config && config.limits);
    this.connectionCount = 0;
    this.connectionsByIp = new Map();
    this.admitted = new Set();
    this.subscriptionWindows = new Map();
    this.describes = {};
    this.transactionSubscriptions = new Set();
    this.blockSubscriptions = new Set();
    this.balanceSubscriptions = new Map();
    this.balanceBatchDepth = 0;
    this.discardBalanceBatch = false;
    this.pendingBalanceChanges = new Map();
    this.logger = logger;

    if (!this.enabled) {
      return;
    }

    const port = config.portWS;
    const io = new Server(port, {
      allowEIO3: true,
      cors: config.cors
    });
    this.io = io;

    io.sockets.on('connection', this.handleConnection.bind(this));

    if (cb) {
      return setImmediate(cb, null, this);
    }
  }

  /**
   * Emits a transaction to subscribed websocket clients once per transaction id.
   * @param {transaction} t - Transaction to emit.
   * @return {void}
   */
  emit (t) {
    if (!this.enabled) {
      return;
    }

    if (lastTransactionsIds.has(t.id)) {
      return;
    }

    lastTransactionsIds.set(t.id, getUTime());
    try {
      const subs = findSubs(t, this.transactionSubscriptions);
      for (const subscription of subs) {
        this.emitToSocket(subscription, 'newTrans', t);
      }
    } catch (e) {
      this.logError('Socket transaction matching error', e);
    }
  }

  /**
   * Emits a compact public block header to sockets that opted in to blocks.
   * Historical rebuilds are filtered by the caller before reaching this method.
   * This public Socket.IO event is distinct from the internal `newBlock` bus event.
   * @param {block} block - Successfully applied block
   * @return {void}
   */
  emitBlock (block) {
    if (!this.enabled || !block || this.blockSubscriptions.size === 0) {
      return;
    }

    if (lastBlocksIds.has(block.id)) {
      return;
    }

    lastBlocksIds.set(block.id, getUTime());
    const payload = formatBlock(block);

    for (const subscription of this.blockSubscriptions) {
      this.emitToSocket(subscription, 'newBlock', payload);
    }
  }

  /**
   * Fetches and emits changed account balance fields when an address has
   * interested subscribers. The account lookup is skipped otherwise.
   * Account lookups are asynchronous, so delivery order remains best-effort.
   * @param {string} address - Changed account address
   * @param {string[]} changedFields - Changed internal or public field names
   * @param {Function} getAccount - Callback-style current account accessor
   * @return {void}
   */
  emitBalanceChange (address, changedFields, getAccount) {
    if (!this.enabled || typeof address !== 'string') {
      return;
    }

    const normalizedAddress = address.toUpperCase();
    const publicFields = normalizeBalanceFields(changedFields);

    if (!this.hasBalanceSubscribers(normalizedAddress, publicFields)) {
      return;
    }

    if (this.balanceBatchDepth > 0) {
      let pending = this.pendingBalanceChanges.get(normalizedAddress);

      if (!pending) {
        pending = { fields: new Set() };
        this.pendingBalanceChanges.set(normalizedAddress, pending);
      }

      for (const field of publicFields) {
        pending.fields.add(field);
      }
      pending.getAccount = getAccount;
      return;
    }

    try {
      getAccount((err, account) => {
        if (err) {
          this.logError(`Unable to read balance for ${normalizedAddress}`, err);
          return;
        }

        const subscriptions = this.balanceSubscriptions.get(normalizedAddress);
        if (!account || !subscriptions) {
          return;
        }

        for (const subscription of subscriptions) {
          const payload = { address: normalizedAddress };

          for (const field of publicFields) {
            if (subscription.balanceFields.has(field)) {
              const accountField = field === 'unconfirmedBalance' ? 'u_balance' : field;
              payload[field] = String(account[accountField]);
            }
          }

          if (Object.keys(payload).length > 1) {
            this.emitToSocket(subscription, 'balances/change', payload);
          }
        }
      });
    } catch (e) {
      this.logError(`Unable to schedule balance lookup for ${normalizedAddress}`, e);
    }
  }

  /**
   * Defers balance reads while a block apply or rollback mutates transient state.
   * Nested batches are supported because chain operations are explicitly sequenced.
   * @return {void}
   */
  beginBalanceBatch () {
    if (this.balanceBatchDepth === 0) {
      this.discardBalanceBatch = false;
    }

    this.balanceBatchDepth += 1;
  }

  /**
   * Flushes one final balance read per changed address after the outer batch.
   * Suppressing any nested batch discards the complete outer batch.
   * @param {boolean} [emitChanges=true] - Whether to publish or discard the batch
   * @return {void}
   */
  endBalanceBatch (emitChanges = true) {
    if (this.balanceBatchDepth === 0) {
      return;
    }

    if (!emitChanges) {
      this.discardBalanceBatch = true;
    }

    this.balanceBatchDepth -= 1;
    if (this.balanceBatchDepth > 0) {
      return;
    }

    const pendingChanges = this.pendingBalanceChanges;
    this.pendingBalanceChanges = new Map();
    const discardBalanceBatch = this.discardBalanceBatch;
    this.discardBalanceBatch = false;

    if (discardBalanceBatch) {
      return;
    }

    for (const [address, pending] of pendingChanges) {
      this.emitBalanceChange(address, pending.fields, pending.getAccount);
    }
  }

  /**
   * Registers subscription and disconnect handlers for a client socket.
   * @param {object} socket - Connected Socket.IO client.
   * @return {void}
   */
  handleConnection (socket) {
    try {
      if (!this.admitConnection(socket)) {
        this.logLimit(socket);
        if (typeof socket.disconnect === 'function') {
          socket.disconnect(true);
        }
        return;
      }

      const describe = new TransactionSubscription(socket);

      socket.on(
          'address',
          this.subscribe.bind(this, socket, describe, 'address', describe.subscribeToAddresses.bind(describe))
      );
      socket.on(
          'types',
          this.subscribe.bind(this, socket, describe, 'types', describe.subscribeToTypes.bind(describe))
      );
      socket.on(
          'assetChatTypes',
          this.subscribe.bind(this, socket, describe, 'assetChatTypes', describe.subscribeToAssetChatTypes.bind(describe))
      );
      socket.on(
          'balances',
          this.subscribe.bind(this, socket, describe, null, describe.subscribeToBalances.bind(describe))
      );
      socket.on(
          'blocks',
          this.subscribeToBlocks.bind(this, socket, describe)
      );
      socket.on('disconnect', () => {
        this.releaseConnection(socket);
        this.removeSubscription(socket.id);
      });
    } catch (e) {
      this.logError('Connection socket error', e);
    }
  }

  /**
   * Applies one subscription request and retains subscriptions that accepted it.
   * @param {object} socket - Connected Socket.IO client.
   * @param {TransactionSubscription} describe - Subscription state for the socket.
   * @param {string|null} kind - Cap group, or null when only the event rate applies.
   * @param {Function} subscribe - Bound subscription method.
   * @param {string|string[]|number|number[]} value - Requested subscription values.
   * @return {void}
   */
  subscribe (socket, describe, kind, subscribe, value) {
    if (!this.allowSubscriptionEvent(socket)) {
      return;
    }

    const values = Array.isArray(value) ? value : [value];
    const allowed = this.limitSubscriptionValues(describe, kind, values);

    if (!allowed.length) {
      return;
    }

    if (subscribe(...allowed)) {
      this.registerSubscription(socket, describe);
    }
  }

  /**
   * Applies a scalar boolean block subscription request.
   * @param {object} socket - Connected Socket.IO client
   * @param {TransactionSubscription} describe - Subscription state
   * @param {boolean} enabled - Desired block subscription state
   * @return {void}
   */
  subscribeToBlocks (socket, describe, enabled) {
    if (!this.allowSubscriptionEvent(socket)) {
      return;
    }

    if (describe.subscribeToBlocks(enabled)) {
      this.registerSubscription(socket, describe);
    }
  }

  /**
   * Retains a subscription and updates indexes used by high-frequency events.
   * @param {object} socket - Connected Socket.IO client
   * @param {TransactionSubscription} describe - Subscription state
   * @return {void}
   */
  registerSubscription (socket, describe) {
    if (describe.hasSubscriptions()) {
      this.describes[socket.id] = describe;
    } else {
      delete this.describes[socket.id];
    }

    if (describe.blocks) {
      this.blockSubscriptions.add(describe);
    } else {
      this.blockSubscriptions.delete(describe);
    }

    if (
      describe.addresses.size > 0 ||
      describe.types.size > 0 ||
      describe.assetChatTypes.size > 0
    ) {
      this.transactionSubscriptions.add(describe);
    } else {
      this.transactionSubscriptions.delete(describe);
    }

    if (describe.balanceFields.size > 0) {
      for (const address of describe.addresses) {
        let subscriptions = this.balanceSubscriptions.get(address);

        if (!subscriptions) {
          subscriptions = new Set();
          this.balanceSubscriptions.set(address, subscriptions);
        }

        subscriptions.add(describe);
      }
    }
  }

  /**
   * Removes subscription state for a disconnected socket.
   * @param {string} socketId - Socket.IO client identifier.
   * @return {void}
   */
  removeSubscription (socketId) {
    const describe = this.describes[socketId];

    if (!describe) {
      return;
    }

    this.transactionSubscriptions.delete(describe);
    this.blockSubscriptions.delete(describe);

    for (const address of describe.addresses) {
      const subscriptions = this.balanceSubscriptions.get(address);

      if (subscriptions) {
        subscriptions.delete(describe);
        if (subscriptions.size === 0) {
          this.balanceSubscriptions.delete(address);
        }
      }
    }

    delete this.describes[socketId];
  }

  /**
   * Accepts a connection when the global and per-IP caps still have room.
   * A non-positive cap disables that check.
   * @param {object} socket - Connected Socket.IO client.
   * @return {boolean} Whether the socket was admitted.
   */
  admitConnection (socket) {
    const limits = this.limits;
    const ip = resolveClientIp(socket, this.trustProxy);

    if (limits.maxConnections > 0 && this.connectionCount >= limits.maxConnections) {
      return false;
    }

    const current = this.connectionsByIp.get(ip) || 0;

    if (limits.maxConnectionsPerIp > 0 && current >= limits.maxConnectionsPerIp) {
      return false;
    }

    this.admitted.add(socket);
    this.connectionCount += 1;
    this.connectionsByIp.set(ip, current + 1);
    return true;
  }

  /**
   * Releases connection counters for a socket that was admitted.
   * @param {object} socket - Disconnected Socket.IO client.
   * @return {void}
   */
  releaseConnection (socket) {
    if (!this.admitted.has(socket)) {
      return;
    }

    const ip = resolveClientIp(socket, this.trustProxy);
    const current = this.connectionsByIp.get(ip) || 0;

    this.admitted.delete(socket);
    this.subscriptionWindows.delete(socket);
    this.connectionCount = Math.max(0, this.connectionCount - 1);

    if (current <= 1) {
      this.connectionsByIp.delete(ip);
    } else {
      this.connectionsByIp.set(ip, current - 1);
    }
  }

  /**
   * Applies the per-socket subscription mutation budget.
   * @param {object} socket - Connected Socket.IO client.
   * @return {boolean} Whether this mutation is allowed.
   */
  allowSubscriptionEvent (socket) {
    let subscriptionWindow = this.subscriptionWindows.get(socket);

    if (!subscriptionWindow) {
      subscriptionWindow = new AbuseWindow(this.limits.maxSubscriptionEvents, this.limits.windowMs);
      this.subscriptionWindows.set(socket, subscriptionWindow);
    }

    return subscriptionWindow.allow('event');
  }

  /**
   * Trims one subscription request to the remaining per-socket cap.
   * @param {TransactionSubscription} describe - Subscription state.
   * @param {string|null} kind - Cap group.
   * @param {Array} values - Requested values.
   * @return {Array} Values that still fit.
   */
  limitSubscriptionValues (describe, kind, values) {
    const spec = CAP_FIELDS[kind];

    if (!spec) {
      return values;
    }

    const max = this.limits[spec.limit];

    if (!(max > 0)) {
      return values;
    }

    const remaining = max - describe[spec.set].size;

    if (remaining <= 0) {
      return [];
    }

    return values.slice(0, remaining);
  }

  /**
   * Logs a rejected client connection without subscription values or payloads.
   * @param {object} socket - Rejected Socket.IO client.
   * @return {void}
   */
  logLimit (socket) {
    if (this.logger && typeof this.logger.debug === 'function') {
      this.logger.debug(
          'ws-client-server',
          'Rejected client WebSocket connection from ' + resolveClientIp(socket, this.trustProxy)
      );
    }
  }

  /**
   * Stops the client Socket.IO server when an owner or test needs cleanup.
   * @param {Function} [cb] - Completion callback
   * @return {void}
   */
  close (cb) {
    if (!this.io) {
      if (cb) {
        setImmediate(cb);
      }
      return;
    }

    this.io.close(cb);
  }

  /**
   * Checks the address index before performing an account database read.
   * @param {string} address - Normalized account address
   * @param {Set<string>} changedFields - Changed public balance fields
   * @return {boolean} Whether at least one socket needs the update
   */
  hasBalanceSubscribers (address, changedFields) {
    const subscriptions = this.balanceSubscriptions.get(address);

    if (!subscriptions || changedFields.size === 0) {
      return false;
    }

    for (const subscription of subscriptions) {
      for (const field of changedFields) {
        if (subscription.balanceFields.has(field)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Isolates a broken client socket from all other recipients and node logic.
   * @param {TransactionSubscription} subscription - Target subscription
   * @param {string} event - Socket.IO event name
   * @param {object} payload - Event payload
   * @return {void}
   */
  emitToSocket (subscription, event, payload) {
    try {
      subscription.socket.emit(event, payload);
    } catch (e) {
      this.logError(`Socket emit error for ${event}`, e);
    }
  }

  /**
   * Writes client WebSocket diagnostics without assuming a logger is present.
   * @param {string} message - Diagnostic context
   * @param {*} error - Reported error
   * @return {void}
   */
  logError (message, error) {
    if (this.logger && typeof this.logger.debug === 'function') {
      this.logger.debug(
          'ws-client-server',
          `${message}: ${error?.message || error}`,
          error?.stack
      );
    }
  }
}

const lastTransactionsIds = new Map();
const lastBlocksIds = new Map();

const cleanupInterval = setInterval(cleanupRecentIds, 60 * 1000);
// This housekeeping timer must not keep short-lived scripts and test processes alive.
cleanupInterval.unref();

/**
 * Removes transaction and block ids after the duplicate-suppression window expires.
 * @return {void}
 */
function cleanupRecentIds () {
  for (const ids of [lastTransactionsIds, lastBlocksIds]) {
    for (const [id, timestamp] of ids) {
      if (getUTime() - timestamp >= 60) {
        ids.delete(id);
      }
    }
  }
}

/**
 * Returns the current Unix time in seconds.
 * @return {number} Unix time in seconds.
 */
function getUTime () {
  return new Date().getTime() / 1000;
}

/**
 * Finds websocket subscriptions interested in a transaction.
 * @param {transaction} transaction - Transaction to match.
 * @param {Iterable<TransactionSubscription>} subs - Active subscriptions.
 * @return {TransactionSubscription[]} Matching subscriptions.
 */
function findSubs (transaction, subs) {
  const matchedSubscriptions = [];

  for (const subscription of subs) {
    if (subscription.impliesTransaction(transaction)) {
      matchedSubscriptions.push(subscription);
    }
  }

  return matchedSubscriptions;
}

/**
 * Maps internal account fields to their public API names.
 * @param {string[]} fields - Internal or public balance field names
 * @return {Set<string>} Supported public field names
 */
function normalizeBalanceFields (fields) {
  const normalized = new Set();

  for (const field of fields || []) {
    if (field === 'balance') {
      normalized.add('balance');
    } else if (field === 'u_balance' || field === 'unconfirmedBalance') {
      normalized.add('unconfirmedBalance');
    }
  }

  return normalized;
}

/**
 * Selects the stable public header fields exposed by the client API.
 * @param {block} block - Applied block
 * @return {object} Compact public block header
 */
function formatBlock (block) {
  return {
    id: block.id,
    height: block.height,
    timestamp: block.timestamp,
    generatorPublicKey: block.generatorPublicKey,
    numberOfTransactions: block.numberOfTransactions,
    totalAmount: block.totalAmount,
    totalFee: block.totalFee,
    reward: block.reward
  };
}

module.exports = ClientWs;
module.exports.limitDefaults = LIMIT_DEFAULTS;

/**
 * Fills omitted client WebSocket limits from the production defaults.
 * Zero disables the matching cap.
 * @param {object} [limits] - Operator limits.
 * @return {object} Normalized limits.
 */
function normalizeClientLimits (limits) {
  const source = limits && typeof limits === 'object' ? limits : {};
  const normalized = {};

  Object.keys(LIMIT_DEFAULTS).forEach(function (key) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) {
      normalized[key] = LIMIT_DEFAULTS[key];
      return;
    }

    const value = Math.floor(Number(source[key]));
    normalized[key] = Number.isFinite(value) && value >= 0 ? value : LIMIT_DEFAULTS[key];
  });

  if (normalized.windowMs === 0) {
    normalized.windowMs = LIMIT_DEFAULTS.windowMs;
  }

  return normalized;
}

/**
 * Resolves the client address, honoring X-Forwarded-For only when trustProxy is enabled.
 * @param {object} socket - Socket.IO client.
 * @param {boolean} trustProxy - Whether the node sits behind a trusted reverse proxy.
 * @return {string} Client IP.
 */
function resolveClientIp (socket, trustProxy) {
  const handshake = (socket && socket.handshake) || {};
  const headers = handshake.headers || {};

  if (trustProxy) {
    const forwarded = headers['x-forwarded-for'];

    if (typeof forwarded === 'string' && forwarded.trim()) {
      return normalizeIp(forwarded.split(',')[0]);
    }
  }

  const address = handshake.address ||
    (socket && socket.conn && socket.conn.remoteAddress) ||
    (socket && socket.request && socket.request.socket && socket.request.socket.remoteAddress) ||
    'unknown';

  return normalizeIp(address);
}
