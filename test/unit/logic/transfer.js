'use strict';/* eslint*/

const constants = require('../../../helpers/constants.js');
const bignum = require('../../../helpers/bignum.js');
const async = require('async');

const expect = require('chai').expect;
const _ = require('lodash');
const transactionTypes = require('../../../helpers/transactionTypes');

const modulesLoader = require('../../common/initModule').modulesLoader;
const TransactionLogic = require('../../../logic/transaction.js');
const Transfer = require('../../../logic/transfer.js');
const Rounds = require('../../../modules/rounds.js');
const AccountLogic = require('../../../logic/account.js');
const AccountModule = require('../../../modules/accounts.js');

const { dummyBlock } = require('../../common/stubs/blocks.js');
const { senderDefault } = require('../../common/stubs/transactions/common.js');
const {
  validTransaction,
  validUnconfirmedTransaction,
  validTransactionData,
} = require('../../common/stubs/transactions/transfer.js');
const {
  delegateAccount,
} = require('../../common/stubs/account.js');

const validSender = {
  ...senderDefault,
  ...delegateAccount,
};

describe('transfer', () => {
  let transfer;
  let transaction;
  let transferBindings;
  let accountModule;

  before((done) => {
    async.auto({
      rounds(cb) {
        modulesLoader.initModule(Rounds, modulesLoader.scope, cb);
      },
      accountLogic(cb) {
        modulesLoader.initLogicWithDb(AccountLogic, cb, {});
      },
      transactionLogic: ['rounds', 'accountLogic', (result, cb) => {
        modulesLoader.initLogicWithDb(TransactionLogic, (err, __transaction) => {
          __transaction.bindModules(result.rounds);
          cb(err, __transaction);
        }, {
          ed: require('../../../helpers/ed'),
          account: result.account
        });
      }],
      accountModule: ['accountLogic', 'transactionLogic', (result, cb) => {
        modulesLoader.initModuleWithDb(AccountModule, cb, {
          logic: {
            account: result.accountLogic,
            transaction: result.transactionLogic
          }
        });
      }]
    }, (err, result) => {
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

  describe('bind()', () => {
    it('should be okay with correct params', () => {
      expect(() => {
        transfer.bind(transferBindings.account, transferBindings.rounds);
      }).to.not.throw();
    });

    after(() => {
      transfer.bind(transferBindings.account, transferBindings.rounds);
    });
  });

  describe('create()', () => {
    it('should throw with empty parameters', () => {
      expect(() => {
        transfer.create();
      }).to.throw();
    });

    it('should be okay with valid parameters', () => {
      expect(transfer.create(validTransactionData, validTransaction)).to.be.an('object');
    });
  });

  describe('calculateFee()', () => {
    it('should return the correct fee', () => {
      expect(transfer.calculateFee()).to.equal(constants.fees.send);
    });
  });

  describe('verify()', () => {
    it('should return error if recipientId is not set', (done) => {
      const trs = _.cloneDeep(validTransaction);
      delete trs.recipientId;
      transfer.verify(trs, validSender, (err) => {
        expect(err).to.equal('Missing recipient');
        done();
      });
    });

    it('should return error if amount is less than 0', (done) => {
      const trs = _.cloneDeep(validTransaction);
      trs.amount = -10;

      transfer.verify(trs, validSender, (err) => {
        expect(err).to.equal('Invalid transaction amount');
        done();
      });
    });

    it('should verify okay for valid transaction', (done) => {
      transfer.verify(validTransaction, validSender, done);
    });
  });

  describe('process()', () => {
    it('should be okay', (done) => {
      transfer.process(validTransaction, validSender, done);
    });
  });

  describe('getBytes()', () => {
    it('should be okay', () => {
      expect(transfer.getBytes(validTransaction)).to.be.null;
    });
  });

  describe('apply()', () => {
    function undoTransaction (trs, sender, done) {
      transfer.undo.call(transaction, trs, dummyBlock, sender, done);
    }

    it('should return error if recipientId is not set', (done) => {
      const trs = _.cloneDeep(validTransaction);
      delete trs.recipientId;
      transfer.apply.call(transaction, trs, dummyBlock, validSender, (err) => {
        expect(err).to.equal('Missing address or public key');
        done();
      });
    });

    it('should be okay for a valid transaction', (done) => {
      accountModule.getAccount({ address: validUnconfirmedTransaction.recipientId }, (err, accountBefore) => {
        expect(err).to.not.exist;
        expect(accountBefore).to.exist;

        const amount = new bignum(validUnconfirmedTransaction.amount.toString());
        const balanceBefore = new bignum(accountBefore.balance.toString());

        transfer.apply.call(transaction, validUnconfirmedTransaction, dummyBlock, validSender, (err) => {
          expect(err).to.not.exist;

          accountModule.getAccount({ address: validUnconfirmedTransaction.recipientId }, (err, accountAfter) => {
            expect(err).to.not.exist;
            expect(accountAfter).to.exist;

            const balanceAfter = new bignum(accountAfter.balance.toString());
            expect(balanceBefore.plus(amount).toString()).to.equal(balanceAfter.toString());
            undoTransaction(validUnconfirmedTransaction, validSender, done);
          });
        });
      });
    });
  });

  describe('undo()', () => {
    function applyTransaction (trs, sender, done) {
      transfer.apply.call(transaction, trs, dummyBlock, sender, done);
    }

    it('should return error if recipientId is not set', (done) => {
      const trs = _.cloneDeep(validTransaction);
      delete trs.recipientId;
      transfer.undo.call(transaction, trs, dummyBlock, validSender, (err) => {
        expect(err).to.equal('Missing address or public key');
        done();
      });
    });

    it('should be okay for a valid transaction', (done) => {
      accountModule.getAccount({ address: validUnconfirmedTransaction.recipientId }, (err, accountBefore) => {
        expect(err).to.not.exist;

        const amount = new bignum(validUnconfirmedTransaction.amount.toString());
        const balanceBefore = new bignum(accountBefore.balance.toString());

        transfer.undo.call(transaction, validUnconfirmedTransaction, dummyBlock, validSender, (err) => {
          expect(err).to.not.exist;

          accountModule.getAccount({ address: validUnconfirmedTransaction.recipientId }, (err, accountAfter) => {
            expect(err).to.not.exist;

            const balanceAfter = new bignum(accountAfter.balance.toString());
            expect(balanceAfter.plus(amount).toString()).to.equal(balanceBefore.toString());
            applyTransaction(validUnconfirmedTransaction, validSender, done);
          });
        });
      });
    });
  });

  describe('applyUnconfirmed()', () => {
    it('should be okay with valid params', (done) => {
      transfer.applyUnconfirmed.call(transaction, validTransaction, validSender, done);
    });
  });

  describe('undoUnconfirmed()', () => {
    it('should be okay with valid params', (done) => {
      transfer.undoUnconfirmed.call(transaction, validTransaction, validSender, done);
    });
  });

  describe('objectNormalize()', () => {
    it('should remove blockId from trs', () => {
      const trs = _.cloneDeep(validTransaction);
      trs.blockId = '9314232245035524467';
      expect(transfer.objectNormalize(trs)).to.not.have.key('blockId');
    });
  });

  describe('dbRead()', () => {
    it('should be okay', () => {
      expect(transfer.dbRead(validTransaction)).to.be.null;
    });
  });

  describe('dbSave()', () => {
    it('should be okay', () => {
      expect(transfer.dbRead(validTransaction)).to.be.null;
    });
  });

  describe('ready()', () => {
    it('should return true for single signature trs', () => {
      expect(transfer.ready(validTransaction, validSender)).to.be.true;
    });

    // Multisignatures tests are disabled currently

    /*
    it('should return false for multi signature transaction with less signatures', () => {
      const trs = _.cloneDeep(validTransaction);
      const vs = _.cloneDeep(validSender);
      vs.multisignatures = [validKeypair.publicKey.toString('hex')];
      expect(transaction.ready(trs, vs)).to.be.false;
    });

    it('should return true for multi signature transaction with at least min signatures', () => {
      const trs = _.cloneDeep(validTransaction);
      const vs = _.cloneDeep(validSender);
      vs.multisignatures = [validKeypair.publicKey.toString('hex')];
      vs.multimin = 1;
      delete trs.signature;
      trs.signature = transaction.sign(senderKeypair, trs);
      trs.signatures = [transaction.multisign(validKeypair, trs)];
      expect(transaction.ready(trs, vs)).to.be.true;
    });
    */
  });
});
