'use strict';

var node = require('./../node.js');

function postTransaction (transaction, done) {
	node.post('/peer/transactions', {
		transaction: transaction
	}, done);
}

function postTransactions (transactions, done) {
	node.post('/peer/transactions', {
		transactions: transactions
	}, done);
}

function sendADM (params, done) {
    node.put('/api/transactions', params, function (err, res) {
        node.expect(res.body).to.have.property('success').to.be.ok;
        node.onNewBlock(function (err) {
            return done(err, res);
        });
    });
}


describe('POST /peer/transactions', function () {

	describe('sending 1000 bundled transfers to random addresses', function () {

		var transactions = [];
		var maximum = 1000;
		var count = 1;
		const account = node.randomAccount();

		before(function (done) {
			sendADM({
                secret: node.gAccount.password,
                amount: 5000000000*2000,
                recipientId: account.address
			},function () {
                node.async.doUntil(function (next) {
                    var bundled = [];

                    for (var i = 0; i < node.config.broadcasts.releaseLimit; i++) {
                        const recipient = node.randomAccount();
                        let transaction = node.createSendTransaction({
                            keyPair: account.keypair,
                            amount: 100000000,
                            recipientId: recipient.address
                        });
                        transaction.fee = node.fees.transactionFee;

                        transactions.push(transaction);
                        bundled.push(transaction);
                        count++;
                    }

                    postTransactions(bundled, function (err, res) {
                        node.expect(res.body).to.have.property('success').to.be.ok;
                        next();
                    });
                }, function () {
                    return (count >= maximum);
                }, function (err) {
                    done(err);
                });
            });

		});

		it('should confirm all transactions', function (done) {
			var blocksToWait = Math.ceil(maximum / node.constants.maxTxsPerBlock);
			node.waitForBlocks(blocksToWait, function (err) {
				node.async.eachSeries(transactions, function (transaction, eachSeriesCb) {
					node.get('/api/transactions/get?id=' + transaction.id, function (err, res) {
						node.expect(res.body).to.have.property('success').to.be.ok;
						node.expect(res.body).to.have.property('transaction').that.is.an('object');
						return setImmediate(eachSeriesCb);
					});
				}, done);
			});
		}).timeout(500000);
	});

	describe('sending 1000 single transfers to random addresses', function () {

		var transactions = [];
		var maximum = 1000;
		var count = 1;
		const account = node.randomAccount();

		before(function (done) {
			sendADM({
                secret: node.gAccount.password,
                amount: 5000000000*2000,
                recipientId: account.address
			}, function () {
                node.async.doUntil(function (next) {
                    const recipient = node.randomAccount();
                    let transaction = node.createSendTransaction({
                        keyPair: account.keypair,
                        amount: 100000000,
                        recipientId: recipient.address
                    });
                    transaction.fee = node.fees.transactionFee;

                    postTransaction(transaction, function (err, res) {
                        node.expect(res.body).to.have.property('success').to.be.ok;
                        node.expect(res.body).to.have.property('transactionId').to.equal(transaction.id);
                        transactions.push(transaction);
                        count++;
                        next();
                    });
                }, function () {
                    return (count >= maximum);
                }, function (err) {
                    done(err);
                });
            });
		});

		it('should confirm all transactions', function (done) {
			var blocksToWait = Math.ceil(maximum / node.constants.maxTxsPerBlock);
			node.waitForBlocks(blocksToWait, function (err) {
				node.async.eachSeries(transactions, function (transaction, eachSeriesCb) {
					node.get('/api/transactions/get?id=' + transaction.id, function (err, res) {
						node.expect(res.body).to.have.property('success').to.be.ok;
						node.expect(res.body).to.have.property('transaction').that.is.an('object');
						return setImmediate(eachSeriesCb);
					});
				}, done);
			});
		}).timeout(500000);
	});
});
