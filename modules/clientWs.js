const { Server } = require('socket.io');

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
        const describe = {
          address: '',
          /**
           * Flags for subscribing to transaction types.
           * Each bit represents a transaction type. For example:
           *
           * 0b100000001
           *   │       └ transfer transaction (type - 0)
           *   │
           *   └─ message transaction (type - 8)
           */
          types: 0,
        };

        socket.on('address', (address) => {
          if (typeof a === 'string') {
            describe.address = address;
            this.describes[socket.id] = describe;
          }
        });

        socket.on('types', (transactionTypes) => {
          if (Array.isArray(transactionTypes)) {
            transactionTypes.forEach((type) => (describe.types |= 1 << type));
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
      const subs = findSubs(t.recipientId, t.senderId, t.type, this.describes);
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

function findSubs (address1, address2, type, subs) {
  const filterred = [];
  for (let aId in subs) {
    const sub = subs[aId];
    const {address, types, socket} = sub;
    const isTypeAllowed = !types || types & (1 << type)

    if (
      ([address1, address2].includes(address) && isTypeAllowed) ||
      isTypeAllowed
    ) {
      filterred.push(socket);
    }
  }
  return filterred;
}

module.exports = ClientWs;
