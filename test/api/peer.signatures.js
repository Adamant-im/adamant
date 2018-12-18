'use strict';

var node = require('./../node.js');
var packageJSON = require('./../../package.json');

describe('GET /peer/signatures', function () {

	it('using incorrect nethash in headers should fail', function (done) {
		node.get('/peer/signatures')
			.set('nethash', 'incorrect')
			.end(function (err, res) {
				node.debug('> Response:'.grey, JSON.stringify(res.body));
				node.expect(res.body).to.have.property('success').to.be.not.ok;
				node.expect(res.body.expected).to.equal(node.config.nethash);
				done();
			});
	});

	it('using incompatible version in headers should fail', function (done) {
		node.get('/peer/signatures')
			.set('version', '0.1.0a')
			.end(function (err, res) {
				node.debug('> Response:'.grey, JSON.stringify(res.body));
				node.expect(res.body).to.have.property('success').to.be.not.ok;
				node.expect(res.body).to.have.property('message').to.eql('Request is made from incompatible version');
				node.expect(res.body).to.have.property('expected').to.eql(packageJSON.config.minVersion);
				node.expect(res.body).to.have.property('received').to.eql('0.1.0a');
				done();
			});
	});

	it('using valid headers should be ok', function (done) {
		node.get('/peer/signatures')
			.end(function (err, res) {
				node.debug('> Response:'.grey, JSON.stringify(res.body));
				node.expect(res.body).to.have.property('success').to.be.ok;
				node.expect(res.body).to.have.property('signatures').that.is.an('array');
				done();
			});
	});
});

describe('POST /peer/signatures', function () {

	var validParams;

	// var transaction = node.lisk.transaction.createTransaction('1L', 1, node.gAccount.password);

    var transaction = {
        t_id: '17190511997607511181',
        b_height: 981,
        t_blockId: '6438017970172540087',
        t_type: 0,
        t_timestamp: 33363661,
        t_senderPublicKey: 'c094ebee7ec0c50ebee32918655e089f6e1a604b83bcaa760293c61e0f18ab6f',
        m_recipientPublicKey: null,
        t_senderId: 'U810656636599221322',
        t_recipientId: 'U7771441689362721578',
        t_amount: 490000000000000,
        t_fee: 10000000,
        t_signature: '85dc703a2b82698193ecbd86fd7aff1b057dfeb86e2a390ef42c1998bf1e9269c0048f42285e208a1e14a63843defbabece1bc96730f317f0cc16e23bb1b4d01',
        confirmations: 8343
    };

	beforeEach(function (done) {
		validParams = {
			signature: {
				signature: transaction.t_signature,
				transaction: transaction.t_id
			}
		};
		done();
	});

	it('using incorrect nethash in headers should fail', function (done) {
		node.post('/peer/signatures')
			.set('nethash', 'incorrect')
			.end(function (err, res) {
				node.debug('> Response:'.grey, JSON.stringify(res.body));
				node.expect(res.body).to.have.property('success').to.be.not.ok;
				node.expect(res.body.expected).to.equal(node.config.nethash);
				done();
			});
	});

	it('using incompatible version in headers should fail', function (done) {
		node.post('/peer/signatures')
			.set('version', '0.1.0a')
			.end(function (err, res) {
				node.debug('> Response:'.grey, JSON.stringify(res.body));
				node.expect(res.body).to.have.property('success').to.be.not.ok;
				node.expect(res.body).to.have.property('message').to.eql('Request is made from incompatible version');
				node.expect(res.body).to.have.property('expected').to.eql(packageJSON.config.minVersion);
				node.expect(res.body).to.have.property('received').to.eql('0.1.0a');
				done();
			});
	});

	it('using invalid signature schema should fail', function (done) {
		delete validParams.signature.transaction;

		node.post('/peer/signatures', validParams)
			.end(function (err, res) {
				node.debug('> Response:'.grey, JSON.stringify(res.body));
				node.expect(res.body).to.have.property('success').to.be.not.ok;
				node.expect(res.body).to.have.property('message').to.equal('Invalid signature body');
				done();
			});
	});

    it('using unprocessable signature should fail', function (done) {
        // validParams.signature.id = '1';

        node.post('/peer/signatures', validParams)
            .end(function (err, res) {
                node.debug('> Response:'.grey, JSON.stringify(res.body));
                node.expect(res.body).to.have.property('success').to.be.not.ok;
                node.expect(res.body).to.have.property('message').to.equal('Error processing signature: Transaction not found');
                done();
            });
    });

	it('using processable signature should be ok');

	// describe('creating a new multisignature account', function () {
	//
	// 	var transaction;
	//
	// 	// Fund accounts
	// 	before(function (done) {
	// 		var transactions = [];
	//
	// 		node.async.eachSeries([owner, coSigner1, coSigner2], function (account, eachSeriesCb) {
	// 			transactions.push(
	// 				node.lisk.transaction.createTransaction(account.address, 100000000000, node.gAccount.password)
	// 			);
	// 			eachSeriesCb();
	// 		}, function (err) {
	// 			postTransactions(transactions, function (err, res) {
	// 				node.expect(res.body).to.have.property('success').to.be.ok;
	// 				node.onNewBlock(function (err) {
	// 					done();
	// 				});
	// 			});
	// 		});
	// 	});
	//
	// 	// Create multisignature group
	// 	before(function (done) {
	// 		var keysgroup = ['+' + coSigner1.publicKey, '+' + coSigner2.publicKey];
	// 		var lifetime = 72;
	// 		var min = 2;
	//
	// 		transaction = node.lisk.multisignature.createMultisignature(owner.password, null, keysgroup, lifetime, min);
	//
	// 		postTransactions([transaction], function (err, res) {
	// 			node.expect(res.body).to.have.property('success').to.be.ok;
	// 			node.onNewBlock(function (err) {
	// 				done();
	// 			});
	// 		});
	// 	});
	//
	// 	it('using processable signature for owner should fail', function (done) {
	// 		var signature = node.lisk.multisignature.signTransaction(transaction, owner.password);
	//
	// 		postSignature(transaction, signature, function (err, res) {
	// 			node.expect(res.body).to.have.property('success').to.be.not.ok;
	// 			node.expect(res.body).to.have.property('message').to.equal('Error processing signature: Failed to verify signature');
	// 			done();
	// 		});
	// 	});
	//
	// 	it('using processable signature for coSigner1 should be ok', function (done) {
	// 		var signature = node.lisk.multisignature.signTransaction(transaction, coSigner1.password);
	//
	// 		postSignature(transaction, signature, function (err, res) {
	// 			node.expect(res.body).to.have.property('success').to.be.ok;
	// 			done();
	// 		});
	// 	});
	//
	// 	it('using processable signature for coSigner1 should not confirm the transaction', function (done) {
	// 		node.onNewBlock(function (err) {
	// 			node.onNewBlock(function (err) {
	// 				node.get('/api/transactions/get?id=' + transaction.id, function (err, res) {
	// 					node.expect(res.body).to.have.property('success').to.be.not.ok;
	// 					done();
	// 				});
	// 			});
	// 		});
	// 	});
	//
	// 	it('using processable signature for coSigner2 should be ok', function (done) {
	// 		var signature = node.lisk.multisignature.signTransaction(transaction, coSigner2.password);
	//
	// 		postSignature(transaction, signature, function (err, res) {
	// 			node.expect(res.body).to.have.property('success').to.be.ok;
	// 			done();
	// 		});
	// 	});
	//
	// 	it('using processable signature for coSigner2 should confirm the transaction', function (done) {
	// 		node.onNewBlock(function (err) {
	// 			node.get('/api/transactions/get?id=' + transaction.id, function (err, res) {
	// 				node.expect(res.body).to.have.property('success').to.be.ok;
	// 				node.expect(res.body).to.have.property('transaction');
	// 				node.expect(res.body.transaction).to.have.property('id').to.equal(transaction.id);
	// 				done();
	// 			});
	// 		});
	// 	});
	// });
	//
	// describe('sending transaction from multisignature account', function () {
	//
	// 	var transaction;
	//
	// 	before(function (done) {
	// 		node.onNewBlock(done);
	// 	});
	//
	// 	// Send transaction
	// 	before(function (done) {
	// 		transaction = node.lisk.multisignature.createTransaction('1L', 1, owner.password);
	//
	// 		postTransaction(transaction, function (err, res) {
	// 			node.expect(res.body).to.have.property('success').to.be.ok;
	// 			node.onNewBlock(function (err) {
	// 				done();
	// 			});
	// 		});
	// 	});
	//
	// 	it('using processable signature for coSigner1 should be ok', function (done) {
	// 		var signature = node.lisk.multisignature.signTransaction(transaction, coSigner1.password);
	//
	// 		postSignature(transaction, signature, function (err, res) {
	// 			node.expect(res.body).to.have.property('success').to.be.ok;
	// 			done();
	// 		});
	// 	});
	//
	// 	it('using processable signature for coSigner1 should not confirm the transaction', function (done) {
	// 		node.onNewBlock(function (err) {
	// 			node.onNewBlock(function (err) {
	// 				node.get('/api/transactions/get?id=' + transaction.id, function (err, res) {
	// 					node.expect(res.body).to.have.property('success').to.be.not.ok;
	// 					done();
	// 				});
	// 			});
	// 		});
	// 	});
	//
	// 	it('using processable signature for coSigner2 should be ok', function (done) {
	// 		var signature = node.lisk.multisignature.signTransaction(transaction, coSigner2.password);
	//
	// 		postSignature(transaction, signature, function (err, res) {
	// 			node.expect(res.body).to.have.property('success').to.be.ok;
	// 			done();
	// 		});
	// 	});
	//
	// 	it('using processable signature for coSigner2 should confirm the transaction', function (done) {
	// 		node.onNewBlock(function (err) {
	// 			node.get('/api/transactions/get?id=' + transaction.id, function (err, res) {
	// 				node.expect(res.body).to.have.property('success').to.be.ok;
	// 				node.expect(res.body).to.have.property('transaction');
	// 				node.expect(res.body.transaction).to.have.property('id').to.equal(transaction.id);
	// 				done();
	// 			});
	// 		});
	// 	});
	// });
	//
	// describe('using multiple signatures', function () {
	// 	it('with unprocessable signature should fail');
	//
	// 	it('with processable signature should be ok');
	// });
});
