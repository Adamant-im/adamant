'use strict';

var node = require('./../node.js');

function postTransaction (transaction, done) {
	node.post('/peer/transactions', {
		transaction: transaction
	}, function (err, res) {
		done(err, res);
	});
}

function sendADM (params, done) {
    node.put('/api/transactions/', params, function (err, res) {
        done(err, res);
    });
}

describe('POST /peer/transactions', function () {

	describe('registering a delegate', function () {

		it('using undefined transaction', function (done) {
			postTransaction(undefined, function (err, res) {
				node.expect(res.body).to.have.property('success').to.be.not.ok;
				node.expect(res.body).to.have.property('message').to.contain('Invalid transaction body');
				done();
			});
		});

		it('using undefined transaction.asset', function (done) {
            const account = node.randomAccount();
            let transaction = node.createDelegateTransaction({
				username: node.randomDelegateName(),
				keyPair: account.keypair
			});
			transaction.fee = node.fees.delegateRegistrationFee;

			delete transaction.asset;

			postTransaction(transaction, function (err, res) {
				node.expect(res.body).to.have.property('success').to.be.not.ok;
				node.expect(res.body).to.have.property('message').to.contain('Invalid transaction body');
				done();
			});
		});

		describe('when account has no funds', function () {

			it('should fail', function (done) {
                const account = node.randomAccount();
                let transaction = node.createDelegateTransaction({
                    username: node.randomDelegateName(),
                    keyPair: account.keypair
                });
                transaction.fee = node.fees.delegateRegistrationFee;

				postTransaction(transaction, function (err, res) {
					node.expect(res.body).to.have.property('success').to.be.not.ok;
					node.expect(res.body).to.have.property('message').to.match(/Account does not have enough ADM/);
					done();
				});
			});
		});

		describe('when account has funds', function () {

            let account = node.randomAccount();
            account.username = node.randomDelegateName();

			before(function (done) {
                sendADM({
                    secret: node.gAccount.password,
                    amount: node.fees.delegateRegistrationFee,
                    recipientId: account.address
                }, function (err, res) {
                    node.expect(res.body).to.have.property('success').to.be.ok;
                    node.expect(res.body).to.have.property('transactionId');
                    node.expect(res.body.transactionId).to.be.not.empty;
                    done();
                });
			});


			before(function (done) {
				node.onNewBlock(function () {
					done();
                });
            });

			it('using invalid username should fail', function (done) {
                let transaction = node.createDelegateTransaction({
                    username: '%',
                    keyPair: account.keypair
                });
                transaction.fee = node.fees.delegateRegistrationFee;

				postTransaction(transaction, function (err, res) {
					node.expect(res.body).to.have.property('success').to.be.not.ok;
					done();
				});
			});

			it('using uppercase username should fail', function (done) {
                let transaction = node.createDelegateTransaction({
                    username: 'UPPER_DELEGATE',
                    keyPair: account.keypair
                });
                transaction.fee = node.fees.delegateRegistrationFee;

				postTransaction(transaction, function (err, res) {
					node.expect(res.body).to.have.property('success').to.be.not.ok;
					done();
				});
			});

			describe('when lowercased username already registered', function () {
				it('using uppercase username should fail', function (done) {
                    let transaction = node.createDelegateTransaction({
                        username: account.username.toUpperCase(),
                        keyPair: account.keypair
                    });
                    transaction.fee = node.fees.delegateRegistrationFee;

					postTransaction(transaction, function (err, res) {
						node.expect(res.body).to.have.property('success').to.be.not.ok;
						done();
					});
				});
			});

			it('using lowercase username should be ok', function (done) {
				account.username = node.randomDelegateName().toLowerCase();
                let transaction = node.createDelegateTransaction({
                    username: account.username,
                    keyPair: account.keypair
                });
                transaction.fee = node.fees.delegateRegistrationFee;

				postTransaction(transaction, function (err, res) {
					node.expect(res.body).to.have.property('success').to.be.ok;
					done();
				});
			});
		});

		describe('twice for the same account', function () {

			let account = node.randomAccount();

			before(function (done) {
				sendADM({
					secret: node.gAccount.password,
					amount: (node.fees.delegateRegistrationFee * 2),
					recipientId: account.address
				}, done);
			});

			before(function (done) {
                node.onNewBlock(function () {
                    done();
                });
            });

			it('should fail', function (done) {
				account.username = node.randomDelegateName().toLowerCase();
                let transaction = node.createDelegateTransaction({
                    username: account.username,
                    keyPair: account.keypair
                });
                transaction.fee = node.fees.delegateRegistrationFee;

				account.username = node.randomDelegateName().toLowerCase();
                let transaction2 = node.createDelegateTransaction({
                    username: account.username,
                    keyPair: account.keypair
                });
                transaction2.fee = node.fees.delegateRegistrationFee;
                // var transaction2 = node.lisk.delegate.createDelegate(account2.password, account2.username);

				postTransaction(transaction, function (err, res) {
					node.expect(res.body).to.have.property('success').to.be.ok;

					node.onNewBlock(function () {
						postTransaction(transaction2, function (err, res) {
							node.expect(res.body).to.have.property('success').to.be.not.ok;
							done();
						});
					});
				});
			});
		});
	});
});
