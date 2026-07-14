const { Server } = require('socket.io');
const TransactionSubscription = require('./clientWs/transactionSubscription');

class ClientWs {
  /**
   * Creates a websocket server for client transaction subscriptions.
   * @param {object} config - Client websocket configuration.
   * @param {object} logger - Logger instance.
   * @param {Function} [cb] - Callback invoked with the initialized server.
   */
  constructor (config, logger, cb) {
    this.enabled = Boolean(config && config.enabled);
    this.describes = {};
    this.transactionSubscriptions = new Set();
    this.blockSubscriptions = new Set();
    this.balanceSubscriptions = new Map();
    this.balanceBatchDepth = 0;
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
        pending = { fields: new Set(), getAccount: getAccount };
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
    this.balanceBatchDepth += 1;
  }

  /**
   * Flushes one final balance read per changed address after the outer batch.
   * @param {boolean} [emitChanges=true] - Whether to publish or discard the batch
   * @return {void}
   */
  endBalanceBatch (emitChanges = true) {
    if (this.balanceBatchDepth === 0) {
      return;
    }

    this.balanceBatchDepth -= 1;
    if (this.balanceBatchDepth > 0) {
      return;
    }

    const pendingChanges = this.pendingBalanceChanges;
    this.pendingBalanceChanges = new Map();

    if (!emitChanges) {
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
      const describe = new TransactionSubscription(socket);

      socket.on(
          'address',
          this.subscribe.bind(this, socket, describe, describe.subscribeToAddresses.bind(describe))
      );
      socket.on(
          'types',
          this.subscribe.bind(this, socket, describe, describe.subscribeToTypes.bind(describe))
      );
      socket.on(
          'assetChatTypes',
          this.subscribe.bind(this, socket, describe, describe.subscribeToAssetChatTypes.bind(describe))
      );
      socket.on(
          'balances',
          this.subscribe.bind(this, socket, describe, describe.subscribeToBalances.bind(describe))
      );
      socket.on(
          'blocks',
          this.subscribeToBlocks.bind(this, socket, describe)
      );
      socket.on('disconnect', this.removeSubscription.bind(this, socket.id));
    } catch (e) {
      this.logError('Connection socket error', e);
    }
  }

  /**
   * Applies one subscription request and retains subscriptions that accepted it.
   * @param {object} socket - Connected Socket.IO client.
   * @param {TransactionSubscription} describe - Subscription state for the socket.
   * @param {Function} subscribe - Bound subscription method.
   * @param {string|string[]|number|number[]} value - Requested subscription values.
   * @return {void}
   */
  subscribe (socket, describe, subscribe, value) {
    const values = Array.isArray(value) ? value : [value];

    if (subscribe(...values)) {
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
