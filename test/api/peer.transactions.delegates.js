'use strict';

var crypto = require('crypto');
var node = require('./../node.js');
var constants = require('../../helpers/constants.js');

var Transaction = require('../../logic/transaction.js');
var Rounds = require('../../modules/rounds.js');
var AccountLogic = require('../../logic/account.js');
var AccountModule = require('../../modules/accounts.js');

var async = require('async');

var account = node.randomAccount();
var account2 = node.randomAccount();

function postTransaction (transaction, done) {
	node.post('/peer/transactions', {
		transaction: transaction
	}, function (err, res) {
		done(err, res);
	});
}

function sendLISK (params, done) {
	var transaction = node.lisk.transaction.createTransaction(params.recipientId, params.amount, params.secret);

	postTransaction(transaction, function (err, res) {
		node.expect(res.body).to.have.property('success').to.be.ok;
		node.onNewBlock(function (err) {
			done(err, res);
		});
	});
}

describe('POST /peer/transactions', function () {
    var account = node.randomAccount();
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
            recipientId: account.address
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

	describe('registering a delegate', function () {

		it('using undefined transaction', function (done) {
			postTransaction(undefined, function (err, res) {
				node.expect(res.body).to.have.property('success').to.be.not.ok;
				node.expect(res.body).to.have.property('message').to.contain('Invalid transaction body');
				done();
			});
		});

		it('using undefined transaction.asset', function (done) {
            let recipient = node.randomAccount();
            recipient.username = node.randomDelegateName();
            let transaction = {
                recipientId: recipient.address,
                senderPublicKey: recipient.publicKey.toString('hex'),
                senderId: recipient.address,
                type: node.txTypes.DELEGATE,
                amount: 0,
				username: node.randomDelegateName(),
				secret: recipient.password,
                asset: {
                    username: recipient.username
                },
                timestamp: Math.floor((Date.now() - constants.epochTime.getTime()) / 1000)
            };
            transaction.signature = transaction.sign(recipient.keypair, transaction);
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
				var transaction = node.lisk.delegate.createDelegate(node.randomPassword(), node.randomDelegateName().toLowerCase());
				transaction.fee = node.fees.delegateRegistrationFee;

				postTransaction(transaction, function (err, res) {
					node.expect(res.body).to.have.property('success').to.be.not.ok;
					node.expect(res.body).to.have.property('message').to.match(/Account does not have enough ADM: [0-9]+L balance: 0/);
					done();
				});
			});
		});

		describe('when account has funds', function () {

			before(function (done) {
				sendLISK({
					secret: node.gAccount.password,
					amount: node.fees.delegateRegistrationFee,
					recipientId: account.address
				}, done);
			});

			it('using invalid username should fail', function (done) {
				var transaction = node.lisk.delegate.createDelegate(account.password, crypto.randomBytes(64).toString('hex'));
				transaction.fee = node.fees.delegateRegistrationFee;

				postTransaction(transaction, function (err, res) {
					node.expect(res.body).to.have.property('success').to.be.not.ok;
					done();
				});
			});

			it('using uppercase username should fail', function (done) {
				account.username = 'UPPER_DELEGATE';
				var transaction = node.lisk.delegate.createDelegate(account.password, account.username);

				postTransaction(transaction, function (err, res) {
					node.expect(res.body).to.have.property('success').to.be.not.ok;
					done();
				});
			});

			describe('when lowercased username already registered', function () {
				it('using uppercase username should fail', function (done) {
					var transaction = node.lisk.delegate.createDelegate(account2.password, account.username.toUpperCase());

					postTransaction(transaction, function (err, res) {
						node.expect(res.body).to.have.property('success').to.be.not.ok;
						done();
					});
				});
			});

			it('using lowercase username should be ok', function (done) {
				account.username = node.randomDelegateName().toLowerCase();
				var transaction = node.lisk.delegate.createDelegate(account.password, account.username);

				postTransaction(transaction, function (err, res) {
					node.expect(res.body).to.have.property('success').to.be.ok;
					node.expect(res.body).to.have.property('transactionId').to.equal(transaction.id);
					done();
				});
			});
		});

		describe('twice for the same account', function () {

			before(function (done) {
				sendLISK({
					secret: node.gAccount.password,
					amount: (node.fees.delegateRegistrationFee * 2),
					recipientId: account2.address
				}, done);
			});

			it('should fail', function (done) {
				account2.username = node.randomDelegateName().toLowerCase();
				var transaction = node.lisk.delegate.createDelegate(account2.password, account2.username);

				account2.username = node.randomDelegateName().toLowerCase();
				var transaction2 = node.lisk.delegate.createDelegate(account2.password, account2.username);

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
