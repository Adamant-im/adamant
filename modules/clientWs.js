class ClientWs {
	constructor (config, cb) {
		if (!config || !config.enabled) {
			return false;
		}

		const port = config.portWS;
		const io = require('socket.io')(36668);

		this.describes = {};

		io.sockets.on('connection', (socket) => {
			try {
				let address = '';
				socket.on('address', a => {
					address = a;
					this.describes[address] = socket;
				});
				socket.on('msg', (msg) => {
					console.info(address || 'new Socket!!', ': ', msg);
				});
				socket.on('disconnect', () => {
					console.log(address + ' disconnect');
					delete this.describes[address];
				});
			} catch (e) {
				console.log('error clientWs: ' + e);
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
			const recip = this.describes[t.recipientId];
			const sender = this.describes[t.senderId];
			if (recip) {
				recip.emit('newTrans', t);
			}
			if (sender) {
				sender.emit('newTrans', t);
			}
		} catch (e) {
			console.log('Socket error emit');
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

module.exports = ClientWs;