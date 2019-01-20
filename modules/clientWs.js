class ClientWs {
    constructor (config, logger, cb) {
        if (!config || !config.enabled) {
            return false;
        }
        const port = config.portWS;
        const io = require('socket.io')(port);
        this.describes = {};
        this.logger = logger;
        io.sockets.on('connection', (socket) => {
            try {
                let address = '';
                let aId = '';
                socket.on('address', a => {
                    address = a;
                    aId = address + '_' + socket.id;
                    this.describes[aId] = socket;
                });
                socket.on('disconnect', () => {
                    delete this.describes[aId];
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
            const subs = findSubs(t.recipientId, t.senderId, this.describes);
            subs.forEach(s => {
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

function findSubs (address1, address2, subs) {
    const filterred = [];
    for (let aId in subs) {
        if (aId.startsWith(address1) || aId.startsWith(address2)) {
            filterred.push(subs[aId]);
        }
    }
    return filterred;
}

module.exports = ClientWs;