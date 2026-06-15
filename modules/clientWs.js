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
    this.logger = logger;

    if (!this.enabled) {
      return;
    }

    const port = config.portWS;
    const io = new Server(port, {
      allowEIO3: true,
      cors: config.cors
    });

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

    if (lastTransactionsIds[t.id]) {
      return;
    }
    lastTransactionsIds[t.id] = getUTime();
    try {
      const subs = findSubs(t, Object.values(this.describes));
      for (const subscription of subs) {
        subscription.socket.emit('newTrans', t);
      }
    } catch (e) {
      this.logger.debug('ws-client-server', `Socket emit error: ${e?.message || e}`, e.stack);
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
      socket.on('disconnect', this.removeSubscription.bind(this, socket.id));
    } catch (e) {
      this.logger.debug('ws-client-server', `Connection socket error: ${e?.message || e}`, e.stack);
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
      this.describes[socket.id] = describe;
    }
  }

  /**
   * Removes subscription state for a disconnected socket.
   * @param {string} socketId - Socket.IO client identifier.
   * @return {void}
   */
  removeSubscription (socketId) {
    delete this.describes[socketId];
  }
}

const lastTransactionsIds = {};

const cleanupInterval = setInterval(cleanupTransactionsCache, 60 * 1000);
// This housekeeping timer must not keep short-lived scripts and test processes alive.
cleanupInterval.unref();

/**
 * Removes transaction ids after the duplicate-suppression window expires.
 * @return {void}
 */
function cleanupTransactionsCache () {
  for (let id in lastTransactionsIds) {
    if (getUTime() - lastTransactionsIds[id] >= 60) {
      delete lastTransactionsIds[id];
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
 * @param {TransactionSubscription[]} subs - Active subscriptions.
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

module.exports = ClientWs;
