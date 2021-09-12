'use strict';/* eslint*/

var node = require('./../../node.js');
var ed = require('../../../helpers/ed');
var bignum = require('../../../helpers/bignum.js');
var crypto = require('crypto');
var async = require('async');

var chai = require('chai');
var expect = require('chai').expect;
var _ = require('lodash');
var transactionTypes = require('../../../helpers/transactionTypes');

var modulesLoader = require('../../common/initModule').modulesLoader;
var TransactionLogic = require('../../../logic/transaction.js');
var Transfer = require('../../../logic/transfer.js');
var Rounds = require('../../../modules/rounds.js');
var AccountLogic = require('../../../logic/account.js');
var AccountModule = require('../../../modules/accounts.js');
var DelegateModule = require('../../../modules/delegates.js');

// valid keypair sample (market delegate's passphrase)
var validPassword = 'rally clean ladder crane gadget century timber jealous shine scorpion beauty salon';
var validHash = ed.createPassPhraseHash(validPassword);
var validKeypair = ed.makeKeypair(validHash);

// stub for a valid sender
let validSender = {
  username: null,
  isDelegate: 0,
  secondSignature: 0,
  secondPublicKey: null,
  vote: 0,
  multisignatures: null,
  multimin: 0,
  multilifetime: 0,
  nameexist: 0,
  producedblocks: 0,
  missedblocks: 0,
  fees: 0,
  rewards: 0,
  virgin: 0
};

// valid sender to test transactions (kind delegate)
validSender = _.defaults({
  address: 'U12559234133690317086',
  publicKey: 'd365e59c9880bd5d97c78475010eb6d96c7a3949140cda7e667f9513218f9089',
  secret: 'weather play vibrant large edge clean notable april fire smoke drift hidden',
  u_balance: 10000000000000,
  balance: 100000000000000
}, validSender);

// valid sender to test transactions (kind delegate)
var testSender = _.defaults({
  address: 'U12559234133690317086',
  publicKey: 'd365e59c9880bd5d97c78475010eb6d96c7a3949140cda7e667f9513218f9089',
  secret: 'weather play vibrant large edge clean notable april fire smoke drift hidden',
  u_balance: 10000000000000,
  balance: 100000000000000
}, validSender);
const testSenderHash = node.accounts.createPassPhraseHash(testSender.secret);
const testSenderKeypair = node.accounts.makeKeypair(testSenderHash);

// valid new tx sample from a test sender
var validUnconfirmedTrs = {
  type: 0,
  amount: 100,
  senderId: testSender.address,
  senderPublicKey: testSender.publicKey,
  recipientId: 'U7771441689362721578',
  fee: 50000000,
  timestamp: 1000,
  asset: {}
};

// valid new tx sample from a test sender, but with keypair
var validTransactionData = {
  type: 0,
  amount: 8067474861277,
  keypair: testSenderKeypair,
  sender: testSender,
  senderId: testSender.address,
  senderPublicKey: testSender.publicKey,
  recipientId: 'U7771441689362721578',
  fee: 50000000,
  timestamp: 1000
};

// valid tx sample, got from api endpoint (from genesis to devs)
var validTransaction = {
  id: '17190511997607511181',
  blockId: '6438017970172540087',
  type: 0,
  block_timestamp: null,
  timestamp: 0,
  senderPublicKey: 'b80bb6459608dcdeb9a98d1f2b0111b2bf11e53ef2933e6769bb0198e3a97aae',
  senderId: 'U15365455923155964650',
  recipientId: 'U9781760580710719871',
  amount: 490000000000000,
  fee: 0,
  signature: '85dc703a2b82698193ecbd86fd7aff1b057dfeb86e2a390ef42c1998bf1e9269c0048f42285e208a1e14a63843defbabece1bc96730f317f0cc16e23bb1b4d01',
  signatures: [],
  asset: {}
};


describe('transfer', function () {
  var transfer;
  var transaction;
  var transferBindings;
  var accountModule;

  before(function (done) {
    async.auto({
      rounds: function (cb) {
        modulesLoader.initModule(Rounds, modulesLoader.scope, cb);
      },
      accountLogic: function (cb) {
        modulesLoader.initLogicWithDb(AccountLogic, cb, {});
      },
      transactionLogic: ['rounds', 'accountLogic', function (result, cb) {
        modulesLoader.initLogicWithDb(TransactionLogic, function (err, __transaction) {
          __transaction.bindModules(result.rounds);
          cb(err, __transaction);
        }, {
          ed: require('../../../helpers/ed'),
          account: result.account
        });
      }],
      accountModule: ['accountLogic', 'transactionLogic', function (result, cb) {
        modulesLoader.initModuleWithDb(AccountModule, cb, {
          logic: {
            account: result.accountLogic,
            transaction: result.transactionLogic
          }
        });
      }]
    }, function (err, result) {
      expect(err).to.not.exist;
      transfer = new Transfer();
      transferBindings = {
        account: result.accountModule,
        rounds: result.rounds
      };
      transfer.bind(result.accountModule, result.rounds);
      transaction = result.transactionLogic;
      transaction.attachAssetType(transactionTypes.SEND, transfer);
      accountModule = result.accountModule;

      done();
    });
  });

  describe('bind', function () {
    it('should be okay with correct params', function () {
      expect(function () {
        transfer.bind(transferBindings.account, transferBindings.rounds);
      }).to.not.throw();
    });

    after(function () {
      transfer.bind(transferBindings.account, transferBindings.rounds);
    });
  });

  describe('create', function () {
    it('should throw with empty parameters', function () {
      expect(function () {
        transfer.create();
      }).to.throw();
    });

    it('should be okay with valid parameters', function () {
      expect(transfer.create(validTransactionData, validTransaction)).to.be.an('object');
    });
  });

  describe('calculateFee', function () {
    it('should return the correct fee', function () {
      expect(transfer.calculateFee()).to.equal(node.constants.fees.send);
    });
  });

  describe('verify', function () {
    it('should return error if recipientId is not set', function (done) {
      var trs = _.cloneDeep(validTransaction);
      delete trs.recipientId;
      transfer.verify(trs, validSender, function (err) {
        expect(err).to.equal('Missing recipient');
        done();
      });
    });

    it('should return error if amount is less than 0', function (done) {
      var trs = _.cloneDeep(validTransaction);
      trs.amount = -10;

      transfer.verify(trs, validSender, function (err) {
        expect(err).to.equal('Invalid transaction amount');
        done();
      });
    });

    it('should verify okay for valid transaction', function (done) {
      transfer.verify(validTransaction, validSender, done);
    });
  });

  describe('process', function () {
    it('should be okay', function (done) {
      transfer.process(validTransaction, validSender, done);
    });
  });

  describe('getBytes', function () {
    it('should be okay', function () {
      expect(transfer.getBytes(validTransaction)).to.eql(null);
    });
  });

  describe('apply', function () {
    var dummyBlock = {
      id: '9314232245035524467',
      height: 1
    };

    function undoTransaction (trs, sender, done) {
      transfer.undo.call(transaction, trs, dummyBlock, sender, done);
    }

    it('should return error if recipientId is not set', function (done) {
      var trs = _.cloneDeep(validTransaction);
      delete trs.recipientId;
      transfer.apply.call(transaction, trs, dummyBlock, validSender, function (err) {
        expect(err).to.equal('Invalid public key');
        done();
      });
    });

    it('should be okay for a valid transaction', function (done) {
      accountModule.getAccount({ address: validUnconfirmedTrs.recipientId }, function (err, accountBefore) {
        expect(err).to.not.exist;
        expect(accountBefore).to.exist;

        var amount = new bignum(validUnconfirmedTrs.amount.toString());
        var balanceBefore = new bignum(accountBefore.balance.toString());

        transfer.apply.call(transaction, validUnconfirmedTrs, dummyBlock, testSender, function (err) {
          expect(err).to.not.exist;

          accountModule.getAccount({ address: validUnconfirmedTrs.recipientId }, function (err, accountAfter) {
            expect(err).to.not.exist;
            expect(accountAfter).to.exist;

            var balanceAfter = new bignum(accountAfter.balance.toString());
            expect(balanceBefore.plus(amount).toString()).to.equal(balanceAfter.toString());
            undoTransaction(validUnconfirmedTrs, testSender, done);
          });
        });
      });
    });
  });

  describe('undo', function () {
    var dummyBlock = {
      id: '9314232245035524467',
      height: 1
    };

    function applyTransaction (trs, sender, done) {
      transfer.apply.call(transaction, trs, dummyBlock, sender, done);
    }

    it('should return error if recipientId is not set', function (done) {
      var trs = _.cloneDeep(validTransaction);
      delete trs.recipientId;
      transfer.undo.call(transaction, trs, dummyBlock, validSender, function (err) {
        expect(err).to.equal('Invalid public key');
        done();
      });
    });

    it('should be okay for a valid transaction', function (done) {
      accountModule.getAccount({ address: validUnconfirmedTrs.recipientId }, function (err, accountBefore) {
        expect(err).to.not.exist;

        var amount = new bignum(validUnconfirmedTrs.amount.toString());
        var balanceBefore = new bignum(accountBefore.balance.toString());

        transfer.undo.call(transaction, validUnconfirmedTrs, dummyBlock, testSender, function (err) {
          expect(err).to.not.exist;

          accountModule.getAccount({ address: validUnconfirmedTrs.recipientId }, function (err, accountAfter) {
            expect(err).to.not.exist;

            var balanceAfter = new bignum(accountAfter.balance.toString());
            expect(balanceAfter.plus(amount).toString()).to.equal(balanceBefore.toString());
            applyTransaction(validUnconfirmedTrs, testSender, done);
          });
        });
      });
    });
  });

  describe('applyUnconfirmed', function () {
    it('should be okay with valid params', function (done) {
      transfer.applyUnconfirmed.call(transaction, validTransaction, validSender, done);
    });
  });

  describe('undoUnconfirmed', function () {
    it('should be okay with valid params', function (done) {
      transfer.undoUnconfirmed.call(transaction, validTransaction, validSender, done);
    });
  });

  describe('objectNormalize', function () {
    it('should remove blockId from trs', function () {
      var trs = _.cloneDeep(validTransaction);
      trs.blockId = '9314232245035524467';
      expect(transfer.objectNormalize(trs)).to.not.have.key('blockId');
    });
  });

  describe('dbRead', function () {
    it('should be okay', function () {
      expect(transfer.dbRead(validTransaction)).to.eql(null);
    });
  });

  describe('dbSave', function () {
    it('should be okay', function () {
      expect(transfer.dbRead(validTransaction)).to.eql(null);
    });
  });

  describe('ready', function () {
    it('should return true for single signature trs', function () {
      expect(transfer.ready(validTransaction, validSender)).to.equal(true);
    });

    // Multisignatures tests are disabled currently

    /*
		it('should return false for multi signature transaction with less signatures', function () {
			var trs = _.cloneDeep(validTransaction);
			var vs = _.cloneDeep(validSender);
			vs.multisignatures = [validKeypair.publicKey.toString('hex')];
			expect(transaction.ready(trs, vs)).to.equal(false);
		});

		it('should return true for multi signature transaction with at least min signatures', function () {
			var trs = _.cloneDeep(validTransaction);
			var vs = _.cloneDeep(validSender);
			vs.multisignatures = [validKeypair.publicKey.toString('hex')];
			vs.multimin = 1;
			delete trs.signature;
			trs.signature = transaction.sign(senderKeypair, trs);
			trs.signatures = [transaction.multisign(validKeypair, trs)];
			expect(transaction.ready(trs, vs)).to.equal(true);
		});
		*/
  });
});
