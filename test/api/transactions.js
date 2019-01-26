'use strict';

var node = require('./../node.js');
var modulesLoader = require('./../common/initModule.js').modulesLoader;
var transactionSortFields = require('../../sql/transactions').sortFields;
var Transaction = require('../../logic/transaction.js');
var Rounds = require('../../modules/rounds.js');
var AccountLogic = require('../../logic/account.js');
var AccountModule = require('../../modules/accounts.js');
var Chat = require('../../logic/chat.js');
var State = require('../../logic/state.js');
var transactionTypes = require('../../helpers/transactionTypes');
var async = require('async');

var Transfer = require('../../logic/transfer.js');

const constants = require('../../helpers/constants.js');

var account = node.randomTxAccount();
var account2 = node.randomTxAccount();
var account3 = node.randomTxAccount();

var transactionList = [];
var offsetTimestamp = 0;

function openAccount (params, done) {
	node.post('/api/accounts/open', params, function (err, res) {
		done(err, res);
	});
}

function putTransaction (params, done) {
	// node.post('/api/transactions/process', params, done);
	node.put('/api/transactions', params, done);
}

function postTransaction (params, done) {
    node.post('/api/transactions', params, done);
}

function sendADM (account, amount, done) {
	var expectedFee = node.expectedFee(amount);

	putTransaction({
		// publicKey:
		secret: node.gAccount.password,
		amount: amount,
		recipientId: account.address
	}, function (err, res) {
		node.expect(res.body).to.have.property('success').to.be.ok;
		node.expect(res.body).to.have.property('transactionId').that.is.not.empty;
		transactionList.push({
			'sender': node.gAccount.address,
			'recipient': account.address,
			'grossSent': (amount + expectedFee) / node.normalizer,
			'fee': expectedFee / node.normalizer,
			'netSent': amount / node.normalizer,
			'txId': res.body.transactionId,
			'type': node.txTypes.SEND
		});
		done(err, res);
	});
}

function sendADM2voter (params, done) {
    node.put('/api/transactions/', params, function (err, res) {
        done(err, res);
    });
}

before(function (done) {
	setTimeout(function () {
		sendADM(account, node.randomLISK(), done);
	}, 2000);
});

before(function (done) {
	setTimeout(function () {
		sendADM(account2, node.randomLISK(), done);
	}, 2000);
});

before(function (done) {
	setTimeout(function () {
		// Send 20 LSK
		sendADM(account2, 20*100000000, done);
	}, 2000);
});

before(function (done) {
	setTimeout(function () {
		// Send 100 LSK
		sendADM(account2, 100*100000000, done);
	}, 2000);
});

before(function (done) {
	node.onNewBlock(function (err) {
		done();
	});
});

describe('GET /api/transactions (cache)', function () {
	var cache;

	before(function (done) {
		node.config.cacheEnabled = true;
		done();
	});

	before(function (done) {
		modulesLoader.initCache(function (err, __cache) {
			cache = __cache;
			node.expect(err).to.not.exist;
			node.expect(__cache).to.be.an('object');
			return done(err, __cache);
		});
	});

	after(function (done) {
		cache.quit(done);
	});

	afterEach(function (done) {
		cache.flushDb(function (err, status) {
			node.expect(err).to.not.exist;
			node.expect(status).to.equal('OK');
			done(err, status);
		});
	});

	it('cache transactions by the url and parameters when response is a success', function (done) {
		var url, params;

		url = '/api/transactions?';
		params = [
			'blockId=' + '1',
			'senderId=' + node.gAccount.address,
			'recipientId=' + account.address,
		];

		node.get(url + params.join('&'), function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.ok;
			node.expect(res.body).to.have.property('transactions').that.is.an('array');
			var response = res.body;
			cache.getJsonForKey(url + params.join('&'), function (err, res) {
				node.expect(err).to.not.exist;
				node.expect(res).to.eql(response);
				done(err, res);
			});
		});
	});

	it('should not cache if response is not a success', function (done) {
		var url, params;
		url = '/api/transactions?';
		params = [
			'whatever:senderId=' + node.gAccount.address
		];

		node.get(url + params.join('&'), function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.not.ok;
			node.expect(res.body).to.have.property('error');
			cache.getJsonForKey(url + params, function (err, res) {
				node.expect(err).to.not.exist;
				node.expect(res).to.eql(null);
				done(err, res);
			});
		});
	});
});

describe('GET /api/transactions', function () {

	before(function (done) {
		node.onNewBlock(done);
	});

	it('using valid parameters should be ok', function (done) {
		var limit = 10;
		var offset = 0;
		var orderBy = 'amount:asc';

		var params = [
			'blockId=' + '1',
			'senderId=' + node.gAccount.address,
			'recipientId=' + account.address,
			'limit=' + limit,
			'offset=' + offset,
			'orderBy=' + orderBy
		];

		node.get('/api/transactions?' + params.join('&'), function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.ok;
			node.expect(res.body).to.have.property('transactions').that.is.an('array');
			node.expect(res.body.transactions).to.have.length.within(transactionList.length, limit);
			for (var i = 0; i < res.body.transactions.length; i++) {
				if (res.body.transactions[i + 1]) {
					node.expect(res.body.transactions[i].amount).to.be.at.most(res.body.transactions[i + 1].amount);
				}
			}
			done();
		});
	});

	it('using valid parameters with and/or should be ok', function (done) {
		var limit = 10;
		var offset = 0;
		var orderBy = 'amount:asc';

		var params = [
			'and:blockId=' + '1',
			'or:senderId=' + node.gAccount.address,
			'or:recipientId=' + account.address,
			'limit=' + limit,
			'offset=' + offset,
			'orderBy=' + orderBy
		];

		node.get('/api/transactions?' + params.join('&'), function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.ok;
			node.expect(res.body).to.have.property('transactions').that.is.an('array');
			node.expect(res.body.transactions).to.have.length.within(transactionList.length, limit);
			for (var i = 0; i < res.body.transactions.length; i++) {
				if (res.body.transactions[i + 1]) {
					node.expect(res.body.transactions[i].amount).to.be.at.most(res.body.transactions[i + 1].amount);
				}
			}
			done();
		});
	});

	it('using minAmount with and:maxAmount ordered by amount and limited should be ok', function (done) {
		var limit = 10;
		var offset = 0;
		var orderBy = 'amount:asc';
		var minAmount = 20*100000000;
		var maxAmount = constants.maxAmount/10000000;

		var params = [
			'minAmount=' + minAmount,
			'and:maxAmount=' + maxAmount,
			'limit=' + limit,
			'offset=' + offset,
			'orderBy=' + orderBy
		];

		node.get('/api/transactions?' + params.join('&'), function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.ok;
			node.expect(res.body).to.have.property('transactions').that.is.an('array');
			node.expect(res.body.transactions).to.have.length.within(2, limit);
			node.expect(res.body.transactions[0].amount).to.be.equal(minAmount);
			node.expect(res.body.transactions[res.body.transactions.length-1].amount).to.be.equal(maxAmount);
			for (var i = 0; i < res.body.transactions.length; i++) {
				if (res.body.transactions[i + 1]) {
					node.expect(res.body.transactions[i].amount).to.be.at.most(res.body.transactions[i + 1].amount);
				}
			}
			done();
		});
	});

	it('using minFee with and:maxFee ordered by fee and limited should be ok', function (done) {
		const limit = 10;
		const offset = 0;
		const orderBy = 'fee:asc';
		const minFee = constants.fees.delegate;;
		const maxFee = constants.fees.delegate;

		var params = [
			'minFee=' + minFee,
			'and:maxFee=' + maxFee,
			'limit=' + limit,
			'offset=' + offset,
			'orderBy=' + orderBy
		];

		node.get('/api/transactions?' + params.join('&'), function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.ok;
			node.expect(res.body).to.have.property('transactions').that.is.an('array');
			node.expect(res.body.transactions).to.have.length.within(2, limit);
			node.expect(res.body.transactions[0].fee).to.be.equal(minFee);
			node.expect(res.body.transactions[res.body.transactions.length-1].fee).to.be.equal(maxFee);
			for (var i = 0; i < res.body.transactions.length; i++) {
				if (res.body.transactions[i + 1]) {
					node.expect(res.body.transactions[i].fee).to.be.at.most(res.body.transactions[i + 1].fee);
				}
			}
			done();
		});
	});

	it('using valid parameters with/without and/or should be ok', function (done) {
		var limit = 10;
		var offset = 0;
		var orderBy = 'amount:asc';

		var params = [
			'and:blockId=' + '1',
			'or:senderId=' + node.gAccount.address,
			'or:recipientId=' + account.address,
			'fromHeight=' + 1,
			'toHeight=' + 666,
			'and:fromTimestamp=' + 0,
			'and:minAmount=' + 0,
			'limit=' + limit,
			'offset=' + offset,
			'orderBy=' + orderBy
		];

		node.get('/api/transactions?' + params.join('&'), function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.ok;
			node.expect(res.body).to.have.property('transactions').that.is.an('array');
			node.expect(res.body.transactions).to.have.length.within(transactionList.length, limit);
			for (var i = 0; i < res.body.transactions.length; i++) {
				if (res.body.transactions[i + 1]) {
					node.expect(res.body.transactions[i].amount).to.be.at.most(res.body.transactions[i + 1].amount);
				}
			}
			done();
		});
	});

	it('using valid array-like parameters should be ok', function (done) {
		var limit = 10;
		var offset = 0;
		var orderBy = 'amount:asc';

		var params = [
			'blockId=' + '1',
			'or:senderIds=' + node.gAccount.address + ',' + account.address,
			'or:recipientIds=' + account.address + ',' + account2.address,
			'or:senderPublicKeys=' + node.gAccount.publicKey,
			'or:recipientPublicKeys=' + node.gAccount.publicKey,
			'limit=' + limit,
			'offset=' + offset,
			'orderBy=' + orderBy
		];

		node.get(encodeURI('/api/transactions?' + params.join('&')), function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.ok;
			node.expect(res.body).to.have.property('transactions').that.is.an('array');
			node.expect(res.body.transactions).to.have.length.within(transactionList.length, limit);
			for (var i = 0; i < res.body.transactions.length; i++) {
				if (res.body.transactions[i + 1]) {
					node.expect(res.body.transactions[i].amount).to.be.at.most(res.body.transactions[i + 1].amount);
				}
			}
			done();
		});
	});

	it('using one invalid field name with and/or should fail', function (done) {
		var limit = 10;
		var offset = 0;
		var orderBy = 'amount:asc';

		var params = [
			'and:blockId=' + '1',
			'or:senderId=' + node.gAccount.address,
			'or:whatever=' + account.address,
			'limit=' + limit,
			'offset=' + offset,
			'orderBy=' + orderBy
		];

		node.get('/api/transactions?' + params.join('&'), function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.not.ok;
			node.expect(res.body).to.have.property('error');
			done();
		});
	});

	it('using invalid condition should fail', function (done) {
		var params = [
			'whatever:senderId=' + node.gAccount.address
		];

		node.get('/api/transactions?' + params.join('&'), function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.not.ok;
			node.expect(res.body).to.have.property('error');
			done();
		});
	});

	it('using invalid field name (x:y:z) should fail', function (done) {
		var params = [
			'or:whatever:senderId=' + node.gAccount.address
		];

		node.get('/api/transactions?' + params.join('&'), function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.not.ok;
			node.expect(res.body).to.have.property('error');
			done();
		});
	});

	it('using empty parameter should fail', function (done) {
		var params = [
			'and:publicKey='
		];

		node.get('/api/transactions?' + params.join('&'), function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.not.ok;
			node.expect(res.body).to.have.property('error');
			done();
		});
	});

	it('using type should be ok', function (done) {
		var type = node.txTypes.SEND;
		var params = 'type=' + type;

		node.get('/api/transactions?' + params, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.ok;
			node.expect(res.body).to.have.property('transactions').that.is.an('array');
			for (var i = 0; i < res.body.transactions.length; i++) {
				if (res.body.transactions[i]) {
					node.expect(res.body.transactions[i].type).to.equal(type);
				}
			}
			done();
		});
	});

	it('using array-like types should be ok', function (done) {
		const types = [node.txTypes.VOTE,node.txTypes.DELEGATE];
		const params = 'types=' + types.join(',');

		node.get('/api/transactions?' + params, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.ok;
			node.expect(res.body).to.have.property('transactions').that.is.an('array');
			for (var i = 0; i < res.body.transactions.length; i++) {
				if (res.body.transactions[i]) {
					node.expect(res.body.transactions[i].type).to.be.oneOf(types);
				}
			}
			done();
		});
	});

	it('using noClutter param should be ok', function (done) {
		node.get('/api/transactions?noClutter=1', function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.ok;
			node.expect(res.body).to.have.property('transactions').that.is.an('array');
			for (var i = 0; i < res.body.transactions.length; i++) {
				if (res.body.transactions[i]) {
					try {
						node.expect(res.body.transactions[i].type).to.be.not.equal(8);
					} catch (e) {
						node.expect(res.body.transactions[i].amount).to.be.not.equal(0);
					}
				}
			}
			done();
		});
	});

	it('using no params should be ok', function (done) {
		node.get('/api/transactions', function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.ok;
			node.expect(res.body).to.have.property('transactions').that.is.an('array');
			const transactions = res.body.transactions.sort((x,y) => y.amount - x.amount);
			for (var i = 0; i < transactions.length; i++) {
				if (transactions[i + 1]) {
					node.expect(transactions[i].amount).to.be.at.least(transactions[i + 1].amount);
				}
			}
			done();
		});
	});

	it('using too small fromUnixTime should fail', function (done) {
		var params = 'fromUnixTime=1464109199';

		node.get('/api/transactions?' + params, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.not.ok;
			node.expect(res.body).to.have.property('error');
			done();
		});
	});

	it('using too small toUnixTime should fail', function (done) {
		var params = 'toUnixTime=1464109200';

		node.get('/api/transactions?' + params, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.not.ok;
			node.expect(res.body).to.have.property('error');
			done();
		});
	});

	it('using limit > 1000 should fail', function (done) {
		var limit = 1001;
		var params = 'limit=' + limit;

		node.get('/api/transactions?' + params, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.not.ok;
			node.expect(res.body).to.have.property('error');
			done();
		});
	});

	it('ordered by ascending timestamp should be ok', function (done) {
		var orderBy = 'timestamp:asc';
		var params = 'orderBy=' + orderBy;

		node.get('/api/transactions?' + params, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.ok;
			node.expect(res.body).to.have.property('transactions').that.is.an('array');

			var flag = 0;
			for (var i = 0; i < res.body.transactions.length; i++) {
				if (res.body.transactions[i + 1]) {
					node.expect(res.body.transactions[i].timestamp).to.be.at.most(res.body.transactions[i + 1].timestamp);
					if (flag === 0) {
						offsetTimestamp = res.body.transactions[i + 1].timestamp;
						flag = 1;
					}
				}
			}

			done();
		});
	});

	// it('using offset == 1 should be ok', function (done) {
	// 	var offset = 1;
	// 	var params = 'offset=' + offset;
	//
	// 	node.get('/api/transactions?' + params, function (err, res) {
	// 		node.expect(res.body).to.have.property('success').to.be.ok;
	// 		node.expect(res.body).to.have.property('transactions').that.is.an('array');
	// 		if (res.body.transactions.length > 0) {
	// 			const transactions = res.body.transactions;
	// 			node.expect(transactions[0].timestamp).to.be.equal(offsetTimestamp);
	// 		}
	// 		done();
	// 	});
	// });

	it('using offset == "one" should fail', function (done) {
		var offset = 'one';
		var params = 'offset=' + offset;

		node.get('/api/transactions?' + params, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.not.ok;
			node.expect(res.body).to.have.property('error');
			done();
		 });
	});

	it('using completely invalid fields should fail', function (done) {
		var params = [
			'blockId=invalid',
			'senderId=invalid',
			'recipientId=invalid',
			'limit=invalid',
			'offset=invalid',
			'orderBy=invalid'
		];

		node.get('/api/transactions?' + params.join('&'), function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.not.ok;
			node.expect(res.body).to.have.property('error');
			done();
		});
	});

	it('using partially invalid fields should fail', function (done) {
		var params = [
			'blockId=invalid',
			'senderId=invalid',
			'recipientId=' + account.address,
			'limit=invalid',
			'offset=invalid',
			'orderBy=blockId:asc'
		];

		node.get('/api/transactions?' + params.join('&'), function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.not.ok;
			node.expect(res.body).to.have.property('error');
			done();
		});
	});

	it('using orderBy with any of sort fields should not place NULLs first', function (done) {
		node.async.each(transactionSortFields, function (sortField, cb) {
			node.get('/api/transactions?orderBy=' + sortField, function (err, res) {
				node.expect(res.body).to.have.property('success').to.be.ok;
				node.expect(res.body).to.have.property('transactions').that.is.an('array');

				var dividedIndices = res.body.transactions.reduce(function (memo, peer, index) {
					memo[peer[sortField] === null ? 'nullIndices' : 'notNullIndices'].push(index);
					return memo;
				}, {notNullIndices: [], nullIndices: []});

				if (dividedIndices.nullIndices.length && dividedIndices.notNullIndices.length) {
					var ascOrder = function (a, b) { return a - b; };
					dividedIndices.notNullIndices.sort(ascOrder);
					dividedIndices.nullIndices.sort(ascOrder);

					node.expect(dividedIndices.notNullIndices[dividedIndices.notNullIndices.length - 1])
						.to.be.at.most(dividedIndices.nullIndices[0]);
				}
				cb();
			});
		}, function () {
			done();
		});
	});
});

describe('GET /api/transactions/get?id=', function () {

	it('using valid id should be ok', function (done) {
		var transactionInCheck = transactionList[0];
		var params = 'id=' + transactionInCheck.txId;

		node.get('/api/transactions/get?' + params, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.ok;
			node.expect(res.body).to.have.property('transaction').that.is.an('object');
			node.expect(res.body.transaction.id).to.equal(transactionInCheck.txId);
			node.expect(res.body.transaction.amount / node.normalizer).to.equal(transactionInCheck.netSent);
			node.expect(res.body.transaction.fee / node.normalizer).to.equal(transactionInCheck.fee);
			node.expect(res.body.transaction.recipientId).to.equal(transactionInCheck.recipient);
			node.expect(res.body.transaction.senderId).to.equal(transactionInCheck.sender);
			node.expect(res.body.transaction.type).to.equal(transactionInCheck.type);
			done();
		});
	});

	it('using invalid id should fail', function (done) {
		var params = 'id=invalid';

		node.get('/api/transactions/get?' + params, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.not.ok;
			node.expect(res.body).to.have.property('error');
			done();
		});
	});
});

describe('GET /api/transactions/count', function () {

	it('should be ok', function (done) {
		node.get('/api/transactions/count', function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.ok;
			node.expect(res.body).to.have.property('confirmed').that.is.an('number');
			node.expect(res.body).to.have.property('queued').that.is.an('number');
			node.expect(res.body).to.have.property('multisignature').that.is.an('number');
			node.expect(res.body).to.have.property('unconfirmed').that.is.an('number');
			done();
		});
	});
});

describe('GET /api/transactions/queued/get?id=', function () {

	it('using unknown id should be ok', function (done) {
		var params = 'id=' + '1234';

		node.get('/api/transactions/queued/get?' + params, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.false;
			node.expect(res.body).to.have.property('error').that.is.equal('Transaction not found');
			done();
		});
	});
});

describe('GET /api/transactions/queued', function () {

	it('should be ok', function (done) {
		node.get('/api/transactions/queued', function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.ok;
			node.expect(res.body).to.have.property('transactions').that.is.an('array');
			node.expect(res.body).to.have.property('count').that.is.an('number');
			done();
		});
	});
});

describe('GET /api/transactions/multisignatures/get?id=', function () {

	it('using unknown id should be ok', function (done) {
		var params = 'id=' + '1234';

		node.get('/api/transactions/multisignatures/get?' + params, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.false;
			node.expect(res.body).to.have.property('error').that.is.equal('Transaction not found');
			done();
		});
	});
});

describe('GET /api/transactions/multisignatures', function () {

	it('should be ok', function (done) {
		node.get('/api/transactions/multisignatures', function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.ok;
			node.expect(res.body).to.have.property('transactions').that.is.an('array');
			node.expect(res.body).to.have.property('count').that.is.an('number');
			done();
		});
	});
});

describe('GET /api/transactions/unconfirmed/get?id=', function () {

	it('using valid id should be ok', function (done) {
		var params = 'id=' + transactionList[transactionList.length - 1].txId;

		node.get('/api/transactions/unconfirmed/get?' + params, function (err, res) {
			node.expect(res.body).to.have.property('success');
			if (res.body.success && res.body.transaction != null) {
				node.expect(res.body).to.have.property('transaction').that.is.an('object');
				node.expect(res.body.transaction.id).to.equal(transactionList[transactionList.length - 1].txId);
			} else {
				node.expect(res.body).to.have.property('error');
			}
			done();
		});
	});
});

describe('GET /api/transactions/unconfirmed', function () {

	it('should be ok', function (done) {
		node.get('/api/transactions/unconfirmed', function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.ok;
			node.expect(res.body).to.have.property('transactions').that.is.an('array');
			node.expect(res.body).to.have.property('count').that.is.an('number');
			done();
		});
	});
});

describe('PUT /api/transactions', function () {

	it('using valid parameters should be ok', function (done) {
		var amountToSend = 100000000;
		var expectedFee = node.expectedFee(amountToSend);

		putTransaction({
			secret: account.password,
			amount: amountToSend,
			recipientId: account2.address
		}, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.ok;
			node.expect(res.body).to.have.property('transactionId').that.is.not.empty;
			transactionList.push({
				'sender': account.address,
				'recipient': account2.address,
				'grossSent': (amountToSend + expectedFee) / node.normalizer,
				'fee': expectedFee / node.normalizer,
				'netSent': amountToSend / node.normalizer,
				'txId': res.body.transactionId,
				'type': node.txTypes.SEND
			});
			done();
		});
	});

	it('using negative amount should fail', function (done) {
		var amountToSend = -100000000;

		putTransaction({
			secret: account.password,
			amount: amountToSend,
			recipientId: account2.address
		}, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.not.ok;
			node.expect(res.body).to.have.property('error');
			done();
		});
	});

	it('using float amount should fail', function (done) {
		var amountToSend = 1.2;

		putTransaction({
			secret: account.password,
			amount: amountToSend,
			recipientId: account2.address
		}, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.not.ok;
			node.expect(res.body).to.have.property('error');
			done();
		});
	});

	it('using entire balance should fail', function (done) {
		openAccount({ secret: account.password }, function (err, res) {
			node.expect(res.body).to.have.property('account').that.is.an('object');
			node.expect(res.body.account).to.have.property('balance').that.is.a('string');
			account.balance = res.body.account.balance;

			putTransaction({
				secret: account.password,
				amount: Math.floor(account.balance),
				recipientId: account2.address
			}, function (err, res) {
				node.expect(res.body).to.have.property('success').to.be.not.ok;
				node.expect(res.body).to.have.property('error').to.match(/Account does not have enough ADM: U[0-9]+ balance: [0-9.]+/);
				done();
			});
		});
	});

	it('using zero amount should fail', function (done) {
		putTransaction({
			secret: account.password,
			amount: 0,
			recipientId: account2.address
		}, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.not.ok;
			node.expect(res.body).to.have.property('error');
			done();
		});
	});

	it('using positive overflown amount should fail', function (done) {
		putTransaction({
			secret: account.password,
			amount: 1298231812939123812939123912939123912931823912931823912903182309123912830123981283012931283910231203,
			recipientId: account2.address
		}, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.not.ok;
			node.expect(res.body).to.have.property('error');
			done();
		});
	});

	it('using negative overflown amount should fail', function (done) {
		putTransaction({
			secret: account.password,
			amount: -1298231812939123812939123912939123912931823912931823912903182309123912830123981283012931283910231203,
			recipientId: account2.address
		}, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.not.ok;
			node.expect(res.body).to.have.property('error');
			done();
		});
	});

	it('using small fractional amount should be ok', function (done) {
		putTransaction({
			secret: account.password,
			amount: 1,
			recipientId: account2.address
		}, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.ok;
			node.expect(res.body).to.have.property('transactionId');
			done();
		});
	});

	it('using no passphase should fail', function (done) {
		var amountToSend = 100000000;

		putTransaction({
			amount: amountToSend,
			recipientId: account2.address
		}, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.not.ok;
			node.expect(res.body).to.have.property('error');
			done();
		});
	});

	it('using no recipient should fail', function (done) {
		var amountToSend = 100000000;

		putTransaction({
			secret: account.password,
			amount: amountToSend
		}, function (err, res) {
			node.expect(res.body).to.have.property('success').to.be.not.ok;
			node.expect(res.body).to.have.property('error');
			done();
		});
	});

	describe('to a cold address', function (done) {
		var recipientId = 'U13896491535841206186';

		it('should be ok', function (done) {
			var amountToSend = 110000000;

			putTransaction({
				secret: node.gAccount.password,
				amount: amountToSend,
				recipientId: recipientId
			}, function (err, res) {
				node.expect(res.body).to.have.property('success').to.be.ok;
				done();
			});
		});
	});

	describe('from a cold address', function (done) {
		before(function (done) {
			node.onNewBlock(done);
		});

		it('should be ok', function (done) {
			var amountToSend = 100000000;

			putTransaction({
				secret: node.gAccount.password,
				amount: amountToSend,
				recipientId: account2.address
			}, function (err, res) {
				node.expect(res.body).to.have.property('success').to.be.ok;
				done();
			});
		});
	});
});

describe('POST /api/transactions', function () {

    var account4 = node.randomAccount();
    var transaction;

    var accountModule;

    var attachTransferAsset = function (transaction, accountLogic, rounds, done) {
        modulesLoader.initModuleWithDb(AccountModule, function (err, __accountModule) {
            var transfer = new Transfer();
            transfer.bind(__accountModule, rounds);
            transaction.attachAssetType(transactionTypes.SEND, transfer);
            accountModule = __accountModule;
            done();
        }, {
            logic: {
                account: accountLogic,
                transaction: transaction
            }
        });
    };

    before(function (done) {
        sendADM2voter({
            secret: node.gAccount.password,
            amount: 500000000000,
            recipientId: account4.address
        }, function (err, res) {
            node.expect(res.body).to.have.property('success').to.be.ok;
            node.expect(res.body).to.have.property('transactionId');
            node.expect(res.body.transactionId).to.be.not.empty;
        });
        async.auto({
            rounds: function (cb) {
                modulesLoader.initModule(Rounds, modulesLoader.scope,cb);
            },
            accountLogic: function (cb) {
                modulesLoader.initLogicWithDb(AccountLogic, cb);
            },
            transaction: ['accountLogic', function (result, cb) {
                modulesLoader.initLogicWithDb(Transaction, cb, {
                    ed: require('../../helpers/ed'),
                    account: result.accountLogic
                });
            }]
        }, function (err, result) {
            transaction = result.transaction;
            transaction.bindModules(result);
            attachTransferAsset(transaction, result.accountLogic, result.rounds, done);
            transaction.attachAssetType(transactionTypes.CHAT_MESSAGE, new Chat());
            transaction.attachAssetType(transactionTypes.STATE, new State());
        });
    });

    beforeEach(function (done) {
        node.onNewBlock(function (err) {
            done();
        });
    });

	it('should be OK for a normal transaction', function (done) {
        var amountToSend = 100000000;
        var expectedFee = node.expectedFee(amountToSend);

        postTransaction({
            secret: account.password,
            amount: amountToSend,
            recipientId: account2.address,
			type: node.txTypes.SEND
        }, function (err, res) {
            node.expect(res.body).to.have.property('success').to.be.ok;
            node.expect(res.body).to.have.property('transactionId').that.is.not.empty;
            transactionList.push({
                'sender': account.address,
                'recipient': account2.address,
                'grossSent': (amountToSend + expectedFee) / node.normalizer,
                'fee': expectedFee / node.normalizer,
                'netSent': amountToSend / node.normalizer,
                'txId': res.body.transactionId,
                'type': node.txTypes.SEND
            });
            done();
        });
    });

	it('should be OK for a vote transaction', function (done) {
        postTransaction({
            secret: account4.password,
            delegates: ['+' + node.eAccount.publicKey],
            type: node.txTypes.VOTE,
        }, function (err, res) {
            node.expect(res.body).to.have.property('success').to.be.ok;
            node.expect(res.body).to.have.property('transaction').that.is.an('object');
            node.expect(res.body.transaction.type).to.equal(node.txTypes.VOTE);
            node.expect(res.body.transaction.amount).to.equal(0);
            node.expect(res.body.transaction.senderPublicKey).to.equal(account4.publicKey.toString('hex'));
            node.expect(res.body.transaction.fee).to.equal(node.fees.voteFee);
            done();
        });
    });

	it('should be OK for a register delegate transaction', function (done) {
		account4.username = node.randomDelegateName();

        postTransaction({ username: account4.username, secret: account4.password, type: node.txTypes.DELEGATE}, function (err, res) {
            node.expect(res.body).to.have.property('success').to.be.ok;
            node.expect(res.body).to.have.property('transaction').that.is.an('object');
            node.expect(res.body.transaction.fee).to.equal(node.fees.delegateRegistrationFee);
            node.expect(res.body.transaction).to.have.property('asset').that.is.an('object');
            node.expect(res.body.transaction.asset.delegate.username).to.equal(account4.username.toLowerCase());
            node.expect(res.body.transaction.asset.delegate.publicKey).to.equal(account4.publicKey.toString('hex'));
            node.expect(res.body.transaction.type).to.equal(node.txTypes.DELEGATE);
            node.expect(res.body.transaction.amount).to.equal(0);
            done();
        });
    });

	it('should be OK for chat message transaction', function (done) {
        let recipient = node.randomAccount();
		let trs = {
			recipientId: recipient.address,
			senderPublicKey: account4.publicKey.toString('hex'),
			senderId: account4.address,
			type: node.txTypes.CHAT_MESSAGE,
			amount: 0,
			asset: {
				chat : {
                    message: 'hello, world!',
                    own_message: '',
                    type: 1
				}
			},
			timestamp: Math.floor((Date.now() - constants.epochTime.getTime()) / 1000)
		};
		trs.signature = transaction.sign(account4.keypair, trs);

		postTransaction({ transaction: trs }, function (err, res) {
            node.expect(res.body).to.have.property('success').to.be.ok;
            node.expect(res.body).to.have.property('transactionId');
            done();
        });
    });

	it('should be OK for state transaction', function (done) {
		let recipient = node.randomAccount();
        let trs = {
            recipientId: recipient.address,
            senderPublicKey: account4.publicKey.toString('hex'),
            senderId: account4.address,
            type: node.txTypes.STATE,
            amount: 0,
            asset: {
                state : {
                    key: 'testkey',
                    value: 'testValue',
                    type: 0
                }
            },
            timestamp: Math.floor((Date.now() - constants.epochTime.getTime()) / 1000)
        };
        trs.signature = transaction.sign(account4.keypair, trs);
		postTransaction({ transaction: trs }, function (err, res) {
            node.expect(res.body).to.have.property('success').to.be.ok;
            node.expect(res.body).to.have.property('transactionId');
			done();
        });

    });
});
