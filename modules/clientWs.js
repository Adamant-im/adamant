const { Server } = require('socket.io');
const TransactionSubscription = require('./clientWs/transactionSubscription');

class ClientWs {
  /**
   * Creates a websocket server for client transaction subscriptions.
   * @param {object} config - Client websocket configuration.
   * @param {object} logger - Logger instance.
   * @param {Function} cb - Callback function.
   */
  constructor (config, logger, cb) {
    if (!config || !config.enabled) {
      return false;
    }
    const port = config.portWS;
    const io = new Server(port, {
      allowEIO3: true,
      cors: config.cors
    });

    this.describes = {};
    this.logger = logger;
    io.sockets.on('connection', (socket) => {
      try {
        const describe = new TransactionSubscription(socket);

        socket.on('address', (address) => {
          const addresses = Array.isArray(address) ? address : [address];
          const subscribed = describe.subscribeToAddresses(...addresses);

          if (subscribed) {
            this.describes[socket.id] = describe;
          }
        });

        socket.on('types', (type) => {
          const types = Array.isArray(type) ? type : [type];
          const subscribed = describe.subscribeToTypes(...types);

          if (subscribed) {
            this.describes[socket.id] = describe;
          }
        });

        socket.on('assetChatTypes', (type) => {
          const types = Array.isArray(type) ? type : [type];
          const subscribed = describe.subscribeToAssetChatTypes(...types);

          if (subscribed) {
            this.describes[socket.id] = describe;
          }
        });

        socket.on('disconnect', () => {
          delete this.describes[socket.id];
        });
      } catch (e) {
        this.logger.debug('ws-client-server', `Connection socket error: ${e?.message || e}`, e.stack);
      }
    });

    if (cb) {
      return setImmediate(cb, null, this);
    }
  }

  /**
   * Emits a transaction to subscribed websocket clients once per transaction id.
   * @param {transaction} t - Transaction to emit.
   */
  emit (t) {
    if (lastTransactionsIds[t.id]) {
      return;
    }
    lastTransactionsIds[t.id] = getUTime();
    try {
      const subs = findSubs(t, Object.values(this.describes));
      subs.forEach((s) => {
        s.socket.emit('newTrans', t);
      });
    } catch (e) {
      this.logger.debug('ws-client-server', `Socket emit error: ${e?.message || e}`, e.stack);
    }
  }
}

const lastTransactionsIds = {};

setInterval(() => {
  for (let id in lastTransactionsIds) {
    if (getUTime() - lastTransactionsIds[id] >= 60) {
      delete lastTransactionsIds[id];
    }
  }
}, 60 * 1000);

/**
 * Returns the current Unix time in seconds.
 * @returns {number} Unix time in seconds.
 */
function getUTime () {
  return new Date().getTime() / 1000;
}

/**
 * Finds websocket subscriptions interested in a transaction.
 * @param {transaction} transaction - Transaction to match.
 * @param {TransactionSubscription[]} subs - Active subscriptions.
 * @returns {TransactionSubscription[]} Matching subscriptions.
 */
function findSubs (transaction, subs) {
  return subs.filter((sub) =>
    sub.impliesTransaction(transaction)
  );
}

module.exports = ClientWs;
