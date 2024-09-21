const { Server } = require('socket.io');
const TransactionSubscription = require('./clientWs/transactionSubscription')

class ClientWs {
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
        const describe = new TransactionSubscription();

        socket.on('address', (address) => {
          const addresses = Array.isArray(address) ? address : [address];
          const subscribed = describe.subscribeToAddresses(...addresses)

          if (subscribed) {
            this.describes[socket.id] = describe;
          }
        });

        socket.on('types', (type) => {
          const types = Array.isArray(type) ? type : [type];
          const subscribed = describe.subscribeToTypes(...types)

          if (subscribed) {
            this.describes[socket.id] = describe;
          }
        })

        socket.on('disconnect', () => {
          delete this.describes[socket.id];
        });
      } catch (e) {
        logger.debug('Error Connection socket: ' + e);
      }
    });

    if (cb) {
      return setImmediate(cb, null, this);
    }
  }

  emit (t) {
    if (lastTransactionsIds[t.id]) {
      return;
    }
    lastTransactionsIds[t.id] = getUTime();
    try {
      const subs = findSubs(t, this.describes);
      subs.forEach((s) => {
        s.emit('newTrans', t);
      });
    } catch (e) {
      this.logger.debug('Socket error emit ' + e);
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

function getUTime () {
  return new Date().getTime() / 1000;
}

function findSubs (transaction, subs) {
  return subs.filter((sub) =>
    sub.impliesTransaction(transaction),
  );
}

module.exports = ClientWs;
