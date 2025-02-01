'use strict'; /* eslint*/

const async = require('async');
const { expect } = require('chai');
const _ = require('lodash');

const constants = require('../../../helpers/constants.js');
const bignum = require('../../../helpers/bignum.js');

const transactionTypes = require('../../../helpers/transactionTypes');
const slots = require('../../../helpers/slots');

const { modulesLoader } = require('../../common/initModule');
const Transaction = require('../../../logic/transaction.js');
const Rounds = require('../../../modules/rounds.js');
const AccountLogic = require('../../../logic/account.js');
const AccountModule = require('../../../modules/accounts.js');

const Vote = require('../../../logic/vote.js');
const Transfer = require('../../../logic/transfer.js');
const Delegate = require('../../../logic/delegate.js');
const Signature = require('../../../logic/signature.js');
const Multisignature = require('../../../logic/multisignature.js');
const InTransfer = require('../../../logic/inTransfer.js');
const OutTransfer = require('../../../logic/outTransfer.js');
const Chat = require('../../../logic/chat.js');
const State = require('../../../logic/state.js');

const { dummyBlock } = require('../../common/stubs/blocks.js');
const { senderDefault } = require('../../common/stubs/transactions/common.js');
const {
  validTransaction,
  validUnconfirmedTransaction,
  rawValidTransaction,
  validTransactionData,
} = require('../../common/stubs/transactions/transfer.js');
const {
  testAccountKeypair,
  delegateAccount,
  genesisAccount,
  delegateAccountKeypair,
  genesisKeypair,
} = require('../../common/stubs/account.js');

const validKeypair = testAccountKeypair;

const testSender = {
  ...senderDefault,
  ...delegateAccount,
};
const testSenderKeypair = delegateAccountKeypair;

const genesis = {
  ...senderDefault,
  ...genesisAccount,
};

describe('transaction', () => {
  let transaction;
  let accountModule;

  function attachTransferAsset(transaction, accountLogic, rounds, done) {
    modulesLoader.initModuleWithDb(
      AccountModule,
      (err, __accountModule) => {
        const transfer = new Transfer();
        transfer.bind(__accountModule, rounds);
        transaction.attachAssetType(transactionTypes.SEND, transfer);
        accountModule = __accountModule;
        done();
      },
      {
        logic: {
          account: accountLogic,
          transaction: transaction,
        },
      }
    );
  };

  before((done) => {
    async.auto(
      {
        rounds(cb) {
          modulesLoader.initModule(Rounds, modulesLoader.scope, cb);
        },
        accountLogic(cb) {
          modulesLoader.initLogicWithDb(AccountLogic, cb);
        },
        transaction: [
          'accountLogic',
          (result, cb) => {
            modulesLoader.initLogicWithDb(Transaction, cb, {
              ed: require('../../../helpers/ed'),
              account: result.accountLogic,
            });
          },
        ],
      },
      (err, result) => {
        transaction = result.transaction;
        transaction.bindModules(result);
        attachTransferAsset(
          transaction,
          result.accountLogic,
          result.rounds,
          done
        );
      }
    );
  });

  before(() => {

  });

  describe('create()', () => {
    it('should throw an error with no param', () => {
      expect(transaction.create).to.throw();
    });

    it('should throw an error when sender is not set', () => {
      const trsData = _.cloneDeep(validTransactionData);
      delete trsData.sender;
      expect(() => {
        transaction.create(transaction, trsData);
      }).to.throw();
    });

    it('should throw an error when keypair is not set', () => {
      const trsData = _.cloneDeep(validTransactionData);
      delete trsData.keypair;
      expect(() => {
        transaction.create(transaction, trsData);
      }).to.throw();
    });

    it('should return transaction fee based on trs type', () => {
      expect(transaction.create(validTransactionData).fee).to.equal(50000000);
    });
  });

  describe('attachAssetType()', () => {
    it('should attach all transaction types', () => {
      let appliedLogic;
      appliedLogic = transaction.attachAssetType(
        transactionTypes.VOTE,
        new Vote()
      );
      expect(appliedLogic).to.be.an.instanceof(Vote);
      appliedLogic = transaction.attachAssetType(
        transactionTypes.SEND,
        new Transfer()
      );
      expect(appliedLogic).to.be.an.instanceof(Transfer);
      appliedLogic = transaction.attachAssetType(
        transactionTypes.DELEGATE,
        new Delegate()
      );
      expect(appliedLogic).to.be.an.instanceof(Delegate);
      appliedLogic = transaction.attachAssetType(
        transactionTypes.SIGNATURE,
        new Signature()
      );
      expect(appliedLogic).to.be.an.instanceof(Signature);
      appliedLogic = transaction.attachAssetType(
        transactionTypes.MULTI,
        new Multisignature()
      );
      expect(appliedLogic).to.be.an.instanceof(Multisignature);
      appliedLogic = transaction.attachAssetType(
        transactionTypes.IN_TRANSFER,
        new InTransfer()
      );
      expect(appliedLogic).to.be.an.instanceof(InTransfer);
      appliedLogic = transaction.attachAssetType(
        transactionTypes.OUT_TRANSFER,
        new OutTransfer()
      );
      expect(appliedLogic).to.be.an.instanceof(OutTransfer);
      appliedLogic = transaction.attachAssetType(
        transactionTypes.CHAT_MESSAGE,
        new Chat()
      );
      expect(appliedLogic).to.be.an.instanceof(Chat);
      appliedLogic = transaction.attachAssetType(
        transactionTypes.STATE,
        new State()
      );
      expect(appliedLogic).to.be.an.instanceof(State);
      return transaction;
    });

    it('should throw an error on invalid asset', () => {
      expect(() => {
        const invalidAsset = {};
        transaction.attachAssetType(-1, invalidAsset);
      }).to.throw('Invalid instance interface');
    });

    it('should throw an error with no param', () => {
      expect(transaction.attachAssetType).to.throw();
    });
  });

  describe('sign()', () => {
    it('should throw an error with no param', () => {
      expect(transaction.sign).to.throw();
    });

    it('should sign transaction', () => {
      const notSignedTx = _.cloneDeep(validTransaction);
      delete notSignedTx.signature;
      expect(transaction.sign(genesisKeypair, notSignedTx))
        .to.be.a('string')
        .which.is.equal(validTransaction.signature);
    });
  });

  // Multisignatures tests are disabled currently

  /*
  describe('multisign', () => {

    it('should throw an error with no param', () => {
      expect(transaction.multisign).to.throw();
    });

    it('should multisign the transaction', () => {
      expect(transaction.multisign(testSenderKeypair, validTransaction)).to.equal(validTransaction.signature);
    });
  });
  */

  describe('getId()', () => {
    it('should throw an error with no param', () => {
      expect(transaction.getId).to.throw();
    });

    it('should generate the id of the trs', () => {
      expect(transaction.getId(validTransaction))
        .to.be.a('string')
        .which.is.equal(validTransaction.id);
    });

    it('should update id if a field in trs value changes', () => {
      const id = validTransaction.id;
      const trs = _.cloneDeep(validTransaction);
      trs.amount = 4000;
      expect(transaction.getId(trs)).to.not.equal(id);
    });
  });

  describe('getHash()', () => {
    it('should throw an error with no param', () => {
      expect(transaction.getHash).to.throw();
    });

    it('should return hash for trs', () => {
      const trs = _.cloneDeep(validTransaction);
      const expectedHash =
        '8d847c2495f790ee1f203c572f998b02376c37be57a8853bbbdcbc882d07b639';
      expect(transaction.getHash(trs).toString('hex'))
        .to.be.a('string')
        .which.is.equal(expectedHash);
    });

    it('should update hash if a field is trs value changes', () => {
      const originalTrsHash =
        '8d847c2495f790ee1f203c572f998b02376c37be57a8853bbbdcbc882d07b639';
      const trs = _.cloneDeep(validTransaction);
      trs.amount = 4000;
      expect(transaction.getHash(trs).toString('hex')).to.not.equal(
        originalTrsHash
      );
    });
  });

  describe('getBytes()', () => {
    it('should throw an error with no param', () => {
      expect(transaction.getBytes).to.throw();
    });

    it('should return same result when called multiple times', () => {
      const firstCalculation = transaction.getBytes(validTransaction);
      const secondCalculation = transaction.getBytes(validTransaction);
      expect(firstCalculation.equals(secondCalculation)).to.be.true;
    });

    it('should skip signature, second signature for getting bytes', () => {
      const trsBytes = transaction.getBytes(validTransaction, true);
      expect(trsBytes.length).to.equal(53);
    });
  });

  describe('ready()', () => {
    it('should throw an error with no param', () => {
      expect(transaction.ready).to.throw();
    });

    it('should throw error when trs type is invalid', () => {
      const trs = _.cloneDeep(validTransaction);
      const invalidTrsType = -1;
      trs.type = invalidTrsType;
      expect(() => {
        transaction.ready(trs, senderDefault);
      }).to.throw('Unknown transaction type ' + invalidTrsType);
    });

    it('should return false when sender not provided', () => {
      const trs = _.cloneDeep(validTransaction);
      expect(transaction.ready(trs)).to.be.false;
    });

    it('should return true for valid trs and sender', () => {
      const trs = _.cloneDeep(validTransaction);
      expect(transaction.ready(trs, senderDefault)).to.be.true;
    });
  });

  describe('countById()', () => {
    it('should throw an error with no param', () => {
      expect(transaction.countById).to.throw();
    });

    it('should return count of trs in db with trs id', (done) => {
      transaction.countById(validTransaction, function (err, count) {
        expect(err).to.not.exist;
        expect(count).to.be.equal(1);
        done();
      });
    });

    it('should return 1 for transaction from genesis block', (done) => {
      transaction.countById(validTransaction, function (err, count) {
        expect(err).to.not.exist;
        expect(count).to.be.equal(1);
        done();
      });
    });
  });

  describe('checkConfirmed()', () => {
    it('should throw an error with no param', () => {
      expect(transaction.checkConfirmed).to.throw();
    });

    it('should not return error when trs is not confirmed', (done) => {
      const trs = transaction.create(validTransactionData);
      transaction.checkConfirmed(trs, (err) => {
        expect(err).to.not.exist;
        done();
      });
    });

    it('should return error for transaction which is already confirmed', (done) => {
      const dummyConfirmedTrs = {
        id: '17190511997607511181',
      };
      transaction.checkConfirmed(dummyConfirmedTrs, (err) => {
        expect(err || []).to.include('Transaction is already confirmed');
        done();
      });
    });
  });

  describe('checkBalance()', () => {
    it('should throw an error with no param', () => {
      expect(transaction.checkBalance).to.throw();
    });

    it('should return error when sender has insufficient balance', () => {
      const amount = '49000000000000000000000';
      const balanceKey = 'balance';
      let sender = _.cloneDeep(testSender);
      sender.balance = 0;
      const res = transaction.checkBalance(
        amount,
        balanceKey,
        validUnconfirmedTransaction,
        sender
      );
      expect(res.exceeded).to.be.true;
      expect(res.error).to.include('Account does not have enough ADM:');
    });

    it('should be okay if insufficient balance from genesis account', () => {
      const amount = '999823366072900';
      const balanceKey = 'balance';
      let sender = _.cloneDeep(genesis);
      sender.balance = 0;
      const res = transaction.checkBalance(
        amount,
        balanceKey,
        validTransaction,
        sender
      );
      expect(res.exceeded).to.be.false;
      expect(res.error).to.not.exist;
    });

    it('should be okay if sender has sufficient balance', () => {
      const balanceKey = 'balance';
      let sender = _.cloneDeep(senderDefault);
      sender.balance = 100000001;
      const res = transaction.checkBalance(
        validTransaction.amount,
        balanceKey,
        validTransaction,
        sender
      );
      expect(res.exceeded).to.be.false;
      expect(res.error).to.not.exist;
    });
  });

  describe('process()', () => {
    it('should throw an error with no param', () => {
      expect(transaction.process).to.throw();
    });

    it('should return error sender is not supplied', (done) => {
      transaction.process(validTransaction, null, function (err, res) {
        expect(err).to.be.equal('Missing sender');
        done();
      });
    });

    it('should return error if generated id is different from id supplied of trs', (done) => {
      const trs = _.cloneDeep(validTransaction);
      trs.id = 'invalid trs id';
      transaction.process(trs, senderDefault, function (err, res) {
        expect(err).to.equal('Invalid transaction id');
        done();
      });
    });

    it('should return error when failed to generate id', (done) => {
      const trs = {
        type: 0,
      };
      transaction.process(trs, senderDefault, function (err, res) {
        expect(err).to.equal('Failed to get transaction id');
        done();
      });
    });

    it('should process the transaction', (done) => {
      transaction.process(validTransaction, genesis, function (err, res) {
        expect(err).to.not.be.ok;
        expect(res).to.be.an('object');
        expect(res.senderId).to.be.a('string').which.is.equal(genesis.address);
        done();
      });
    });
  });

  describe('verify()', () => {
    function createAndProcess(trsData, sender, cb) {
      const trs = transaction.create(trsData);
      transaction.process(trs, sender, (err, __trs) => {
        expect(err).to.not.exist;
        expect(__trs).to.be.an('object');
        cb(__trs);
        trs.senderId = sender.address;
      });
    }

    it('should return error when sender is missing', (done) => {
      transaction.verify(validTransaction, null, {}, (err) => {
        expect(err).to.equal('Missing sender');
        done();
      });
    });

    it('should return error with invalid trs type', (done) => {
      const trs = _.cloneDeep(validTransaction);
      trs.type = -1;

      transaction.verify(trs, senderDefault, {}, (err) => {
        expect(err).to.include('Unknown transaction type');
        done();
      });
    });

    // Second signature tests are disabled currently

    // it('should return error when missing sender second signature', (done) => {
    //   const trs = _.cloneDeep(validUnconfirmedTransaction);
    //   trs.signSignature = [transaction.sign(testSenderKeypair, trs)];
    //   const vs = _.cloneDeep(testSender);
    //   vs.secondSignature = '839eba0f811554b9f935e39a68b3078f90bea22c5424d3ad16630f027a48362f78349ddc3948360045d6460404f5bc8e25b662d4fd09e60c89453776962df40d';

    //   transaction.verify(trs, vs, {}, (err) => {
    //     expect(err).to.include('Missing sender second signature');
    //     done();
    //   });
    // });

    it('should return error when sender does not have a second signature', (done) => {
      const trs = _.cloneDeep(validTransaction);
      trs.signSignature = [transaction.sign(validKeypair, trs)];

      transaction.verify(trs, senderDefault, {}, (err) => {
        expect(err).to.include('Sender does not have a second signature');
        done();
      });
    });

    it('should return error when requester does not have a second signature', (done) => {
      const trs = _.cloneDeep(validTransaction);
      const dummyRequester = {
        secondSignature:
          'c094ebee7ec0c50ebee32918655e089f6e1a604b83bcaa760293c61e0f18ab6f',
      };
      trs.requesterPublicKey =
        '839eba0f811554b9f935e39a68b3078f90bea22c5424d3ad16630f027a48362f78349ddc3948360045d6460404f5bc8e25b662d4fd09e60c89453776962df40d';

      transaction.verify(trs, senderDefault, dummyRequester, (err) => {
        expect(err).to.include('Missing requester second signature');
        done();
      });
    });

    it('should return error when trs sender publicKey and sender public key are different', (done) => {
      const trs = _.cloneDeep(validTransaction);
      const invalidPublicKey =
        '01389197bbaf1afb0acd47bbfeabb34aca80fb372a8f694a1c0716b3398db746';
      trs.senderPublicKey = invalidPublicKey;

      transaction.verify(trs, genesis, {}, (err) => {
        expect(err).to.include(
          [
            'Invalid sender public key:',
            invalidPublicKey,
            'expected:',
            senderDefault.publicKey,
          ].join(' ')
        );
        done();
      });
    });

    it('should be impossible to send the money from genesis account', (done) => {
      const trs = transaction.create(validTransactionData);
      trs.senderId = 'U15365455923155964650';
      trs.senderPublicKey =
        'b80bb6459608dcdeb9a98d1f2b0111b2bf11e53ef2933e6769bb0198e3a97aae';
      const vs = _.cloneDeep(senderDefault);
      vs.publicKey =
        'b80bb6459608dcdeb9a98d1f2b0111b2bf11e53ef2933e6769bb0198e3a97aae';
      vs.address = 'U15365455923155964650';
      transaction.verify(trs, vs, {}, (err) => {
        expect(err).to.include(
          'Invalid sender. Can not send from genesis account'
        );
        done();
      });
    });

    it('should return error on different sender address in trs and sender', (done) => {
      const trs = _.cloneDeep(validTransaction);
      trs.senderId = 'U2581762640681118072';

      transaction.verify(trs, genesis, {}, (err) => {
        expect(err).to.include('Invalid sender address');
        done();
      });
    });

    // Multisignatures tests are disabled currently

    /*
    it('should return error when Account does not belong to multisignature group', (done) => {
      const trs = _.cloneDeep(validTransaction);
      const vs = _.cloneDeep(senderDefault);
      // Different publicKey for multisignature account
      vs.multisignatures = [node.eAccount.publicKey];
      trs.requesterPublicKey = validKeypair.publicKey.toString('hex');
      delete trs.signature;
      trs.signature = transaction.sign(validKeypair, trs);
      transaction.verify(trs, vs, {}, (err) => {
        expect(err).to.equal('Account does not belong to multisignature group');
        done();
      });
    });
    */

    it('should return error when signature is not correct', (done) => {
      const trs = _.cloneDeep(validTransaction);
      // testSenderKeypair is for a different account
      trs.signature = transaction.sign(testSenderKeypair, trs);
      transaction.verify(trs, genesis, {}, (err) => {
        expect(err).to.include('Failed to verify signature');
        done();
      });
    });

    // Multisignatures tests are disabled currently

    /*
    it('should return error when duplicate signature in transaction', (done) => {
      const trs = _.cloneDeep(validTransaction);
      const vs = _.cloneDeep(senderDefault);
      vs.multisignatures = [validKeypair.publicKey.toString('hex')];
      delete trs.signature;
      trs.signatures = Array.apply(null, Array(2)).map(() => { return transaction.sign(validKeypair, trs); });
      trs.signature = transaction.sign(testSenderKeypair, trs);
      transaction.verify(trs, vs, {}, (err) => {
        expect(err).to.equal('Encountered duplicate signature in transaction');
        done();
      });
    });

    it('should return error when failed to verify multisignature', (done) => {
      const trs = _.cloneDeep(validTransaction);
      const vs = _.cloneDeep(senderDefault);
      vs.multisignatures = [validKeypair.publicKey.toString('hex')];
      trs.requesterPublicKey = validKeypair.publicKey.toString('hex');
      delete trs.signature;
      // using validKeypair as opposed to testSenderKeypair
      trs.signatures = [transaction.sign(validKeypair, trs)];
      trs.signature = transaction.sign(validKeypair, trs);
      transaction.verify(trs, vs, {}, (err) => {
        expect(err).to.equal('Failed to verify multisignature');
        done();
      });
    });

    it('should be okay with valid multisignature', (done) => {
      const trs = _.cloneDeep(validTransaction);
      const vs = _.cloneDeep(senderDefault);
      vs.multisignatures = [validKeypair.publicKey.toString('hex')];
      delete trs.signature;
      trs.signature = transaction.sign(testSenderKeypair, trs);
      trs.signatures = [transaction.multisign(validKeypair, trs)];
      transaction.verify(trs, vs, {}, (err) => {
        expect(err).to.not.exist;
        done();
      });
    });
    */

    it('should return error when second signature is invalid', (done) => {
      const vs = _.cloneDeep(senderDefault);
      vs.secondPublicKey = validKeypair.publicKey.toString('hex');
      vs.secondSignature = 1;

      const trsData = _.cloneDeep(validTransactionData);
      createAndProcess(trsData, senderDefault, function (trs) {
        trs.signSignature =
          '7af5f0ee2c4d4c83d6980a46efe31befca41f7aa8cda5f7b4c2850e4942d923af058561a6a3312005ddee566244346bdbccf004bc8e2c84e653f9825c20be008';
        transaction.verify(trs, vs, (err) => {
          expect(err).to.equal('Failed to verify second signature');
          done();
        });
      });
    });

    it('should be okay for valid second signature', (done) => {
      const sender = _.cloneDeep(testSender);
      sender.secondPublicKey = validKeypair.publicKey.toString('hex');
      sender.secondSignature = 1;

      const trsData = _.cloneDeep(validTransactionData);
      trsData.sender = sender;
      trsData.secondKeypair = validKeypair;
      createAndProcess(trsData, testSender, function (trs) {
        transaction.verify(trs, testSender, {}, (err) => {
          transaction.verify(trs, sender, (err) => {
            expect(err).to.not.exist;
            done();
          });
        });
      });
    });

    it('should throw return error transaction fee is incorrect', (done) => {
      const trs = _.cloneDeep(validTransaction);
      trs.fee = -100;
      transaction.verify(trs, genesis, {}, (err) => {
        expect(err).to.include('Invalid transaction fee');
        done();
      });
    });

    it('should verify transaction with correct fee (without data field)', (done) => {
      let trs = _.cloneDeep(validUnconfirmedTransaction);

      trs.timestamp = slots.getTime();
      trs.timestampMs = slots.getTimeMs();

      trs.signature = transaction.sign(testSenderKeypair, trs);

      transaction.verify(trs, testSender, {}, (err) => {
        expect(err).to.not.exist;
        done();
      });
    });

    it('should return error when transaction amount is invalid', (done) => {
      const trsData = _.cloneDeep(validUnconfirmedTransaction);
      trsData.amount = constants.totalAmount + 10;
      trsData.signature = transaction.sign(testSenderKeypair, trsData);
      transaction.verify(trsData, testSender, {}, (err) => {
        expect(err).to.include('Invalid transaction amount');
        done();
      });
    });

    it('should return error when account balance is less than transaction amount', (done) => {
      const trsData = _.cloneDeep(validUnconfirmedTransaction);
      trsData.amount = constants.totalAmount;
      trsData.signature = transaction.sign(testSenderKeypair, trsData);
      transaction.verify(trsData, testSender, {}, (err) => {
        expect(err).to.include('Account does not have enough ADM:');
        done();
      });
    });

    it('should return error on timestamp smaller than the int32 range', (done) => {
      const trs = _.cloneDeep(validUnconfirmedTransaction);
      trs.timestamp = -2147483648 - 1;
      delete trs.signature;
      trs.signature = transaction.sign(testSenderKeypair, trs);
      transaction.verify(trs, testSender, {}, (err) => {
        expect(err).to.include('Invalid transaction timestamp');
        done();
      });
    });

    it('should return error on timestamp bigger than the int32 range', (done) => {
      const trs = _.cloneDeep(validUnconfirmedTransaction);
      trs.timestamp = 2147483647 + 1;
      delete trs.signature;
      trs.signature = transaction.sign(testSenderKeypair, trs);
      transaction.verify(trs, testSender, {}, (err) => {
        expect(err).to.include('Invalid transaction timestamp');
        done();
      });
    });

    it('should return error when timestampMs is less than timestamp by a second', (done) => {
      const trs = _.cloneDeep(validUnconfirmedTransaction);

      trs.timestamp = slots.getTime();
      const timestampMs = trs.timestamp * 1000;
      trs.timestampMs = timestampMs - 1000;

      delete trs.signature;
      trs.signature = transaction.sign(testSenderKeypair, trs);

      transaction.verify(trs, testSender, {}, (err) => {
        expect(err).to.equal('Invalid transaction timestamp. The difference between timestamp and timestampMs is greater than 1000ms');
        done();
      });
    });

    it('should return error when timestampMs is greater than timestamp by a second', (done) => {
      const trs = _.cloneDeep(validUnconfirmedTransaction);

      trs.timestamp = slots.getTime();
      const timestampMs = trs.timestamp * 1000;
      trs.timestampMs = timestampMs + 1000;

      delete trs.signature;
      trs.signature = transaction.sign(testSenderKeypair, trs);

      transaction.verify(trs, testSender, {}, (err) => {
        expect(err).to.equal('Invalid transaction timestamp. The difference between timestamp and timestampMs is greater than 1000ms');
        done();
      });
    });

    it('should verify proper transaction with proper sender', (done) => {
      let trs = _.cloneDeep(validUnconfirmedTransaction);

      trs.timestamp = slots.getTime();
      trs.timestampMs = slots.getTimeMs();

      trs.signature = transaction.sign(testSenderKeypair, trs);
      transaction.verify(trs, testSender, {}, (err) => {
        expect(err).to.not.be.ok;
        done();
      });
    });

    it('should throw an error with no param', () => {
      expect(transaction.verify).to.throw();
    });
  });

  describe('verifyTimestamp()', () => {
    it('should return error on future timestamp', () => {
      const trs = _.cloneDeep(validUnconfirmedTransaction);
      trs.timestamp = slots.getTime() + 100;
      trs.timestampMs = trs.timestamp * 1000;
      delete trs.signature;
      trs.signature = transaction.sign(testSenderKeypair, trs);
      const error = transaction.verifyTimestamp(trs);
      expect(error).to.equal('Transaction timestamp is in the future');
    });

    it('should return error on timestamp that is 16 seconds in the past', () => {
      const trs = _.cloneDeep(validUnconfirmedTransaction);
      trs.timestamp = slots.getTime() - 100;
      trs.timestampMs = trs.timestamp * 1000;
      delete trs.signature;
      trs.signature = transaction.sign(testSenderKeypair, trs);
      const error = transaction.verifyTimestamp(trs);
      expect(error).to.equal('Transaction timestamp is more than 15 seconds in the past');
    });
  });

  describe('verifySignature()', () => {
    it('should throw an error with no param', () => {
      expect(transaction.verifySignature).to.throw();
    });

    it('should return false if trs is changed', () => {
      const trs = _.cloneDeep(validTransactionData);
      trs.amount = 1001;
      expect(
        transaction.verifySignature(trs, testSender.publicKey, trs.signature)
      ).to.be.false;
    });

    it('should return false if signature not provided', () => {
      const trs = _.cloneDeep(validTransaction);
      expect(
        transaction.verifySignature(trs, senderDefault.publicKey, null)
      ).to.be.false;
    });

    it('should return valid signature for correct trs', () => {
      const trs = _.cloneDeep(validTransaction);
      expect(
        transaction.verifySignature(trs, genesis.publicKey, trs.signature)
      ).to.be.true;
    });

    it('should throw if public key is invalid', () => {
      const trs = _.cloneDeep(validTransaction);
      const invalidPublicKey = '123123123';
      expect(() => {
        transaction.verifySignature(trs, invalidPublicKey, trs.signature);
      }).to.throw();
    });
  });

  describe('verifySecondSignature()', () => {
    it('should throw an error with no param', () => {
      expect(transaction.verifySecondSignature).to.throw();
    });

    it('should verify the second signature correctly', () => {
      const signature = transaction.sign(validKeypair, validTransaction);
      expect(
        transaction.verifySecondSignature(
          validTransaction,
          validKeypair.publicKey.toString('hex'),
          signature
        )
      ).to.be.true;
    });
  });

  describe('verifyBytes()', () => {
    it('should throw an error with no param', () => {
      expect(transaction.verifyBytes).to.throw();
    });

    it('should return when sender public is different', () => {
      const trsBytes = transaction.getBytes(validTransaction);
      const invalidPublicKey =
        'addb0e15a44b0fdc6ff291be28d8c98f5551d0cd9218d749e30ddb87c6e31ca9';
      expect(
        transaction.verifyBytes(
          trsBytes,
          invalidPublicKey,
          validTransaction.signature
        )
      ).to.be.false;
    });

    it('should throw when public key is not in the right format', () => {
      const trsBytes = transaction.getBytes(validTransaction);
      const invalidPublicKey =
        'iddb0e15a44b0fdc6ff291be28d8c98f5551d0cd9218d749e30ddb87c6e31ca9';
      expect(() => {
        transaction.verifyBytes(
          trsBytes,
          invalidPublicKey,
          validTransaction.signature
        );
      }).to.throw();
    });

    it('should be okay for valid bytes', () => {
      const trsBytes = transaction.getBytes(validTransaction, true, true);
      const res = transaction.verifyBytes(
        trsBytes,
        validTransaction.senderPublicKey,
        validTransaction.signature
      );
      expect(res).to.be.true;
    });
  });

  describe('apply()', () => {
    function undoTransaction(trs, sender, done) {
      transaction.undo(trs, dummyBlock, sender, done);
    }

    it('should throw an error with no param', () => {
      expect(() => {
        transaction.apply();
      }).to.throw();
    });

    it('should be okay with valid params', (done) => {
      const trs = _.cloneDeep(validTransaction);
      transaction.apply(trs, dummyBlock, genesis, done);
    });

    it('should return error on if balance is low', (done) => {
      const trs = _.cloneDeep(validTransactionData);
      trs.amount = '9850458911801908';
      let sender = _.cloneDeep(testSender);
      sender.balance = 0;
      transaction.apply(trs, dummyBlock, sender, (err) => {
        expect(err).to.include('Account does not have enough ');
        done();
      });
    });

    it('should subtract balance from sender account on valid transaction', (done) => {
      accountModule.getAccount(
        { publicKey: validUnconfirmedTransaction.senderPublicKey },
        function (err, accountBefore) {
          const amount = new bignum(
            validUnconfirmedTransaction.amount.toString()
          ).plus(validUnconfirmedTransaction.fee.toString());
          const balanceBefore = new bignum(accountBefore.balance.toString());

          transaction.apply(
            validUnconfirmedTransaction,
            dummyBlock,
            testSender,
            (err) => {
              accountModule.getAccount(
                { publicKey: validUnconfirmedTransaction.senderPublicKey },
                function (err, accountAfter) {
                  expect(err).to.not.exist;
                  const balanceAfter = new bignum(
                    accountAfter.balance.toString()
                  );
                  expect(balanceAfter.plus(amount).toString()).to.equal(
                    balanceBefore.toString()
                  );
                  undoTransaction(
                    validUnconfirmedTransaction,
                    testSender,
                    done
                  );
                }
              );
            }
          );
        }
      );
    });
  });

  describe('undo()', () => {
    function applyTransaction(trs, sender, done) {
      transaction.apply(trs, dummyBlock, sender, done);
    }

    it('should throw an error with no param', () => {
      expect(transaction.undo).to.throw();
    });

    it('should not update sender balance when transaction is invalid', (done) => {
      const trs = _.cloneDeep(validUnconfirmedTransaction);
      const amount = new bignum(trs.amount.toString()).plus(trs.fee.toString());
      delete trs.recipientId;

      accountModule.getAccount(
        { publicKey: trs.senderPublicKey },
        function (err, accountBefore) {
          const balanceBefore = new bignum(accountBefore.balance.toString());

          transaction.undo(trs, dummyBlock, testSender, (err) => {
            accountModule.getAccount(
              { publicKey: trs.senderPublicKey },
              function (err, accountAfter) {
                const balanceAfter = new bignum(accountAfter.balance.toString());

                expect(
                  balanceBefore.plus(amount.multipliedBy(2)).toString()
                ).to.not.equal(balanceAfter.toString());
                expect(balanceBefore.toString()).to.equal(
                  balanceAfter.toString()
                );
                done();
              }
            );
          });
        }
      );
    });

    it('should be okay with valid params', (done) => {
      const trs = validUnconfirmedTransaction;
      const amount = new bignum(trs.amount.toString()).plus(trs.fee.toString());

      accountModule.getAccount(
        { publicKey: trs.senderPublicKey },
        function (err, accountBefore) {
          const balanceBefore = new bignum(accountBefore.balance.toString());

          transaction.undo(trs, dummyBlock, testSender, (err) => {
            accountModule.getAccount(
              { publicKey: trs.senderPublicKey },
              function (err, accountAfter) {
                expect(err).to.not.exist;

                const balanceAfter = new bignum(accountAfter.balance.toString());
                expect(balanceBefore.plus(amount).toString()).to.equal(
                  balanceAfter.toString()
                );
                applyTransaction(trs, testSender, done);
              }
            );
          });
        }
      );
    });
  });

  describe('applyUnconfirmed()', () => {
    function undoUnconfirmedTransaction(trs, sender, done) {
      transaction.undoUnconfirmed(trs, sender, done);
    }

    it('should throw an error with no param', () => {
      expect(() => {
        transaction.applyUnconfirmed();
      }).to.throw();
    });

    it('should be okay with valid params', (done) => {
      const trs = _.cloneDeep(validUnconfirmedTransaction);
      transaction.applyUnconfirmed(trs, testSender, done);
    });

    it('should return error on if balance is low', (done) => {
      const trs = _.cloneDeep(validUnconfirmedTransaction);
      trs.amount = '985045891180190800000000000000';

      transaction.applyUnconfirmed(trs, testSender, (err) => {
        expect(err).to.include('Account does not have enough ADM');
        done();
      });
    });

    it('should okay for valid params', (done) => {
      transaction.applyUnconfirmed(
        validUnconfirmedTransaction,
        testSender,
        (err) => {
          expect(err).to.not.exist;
          undoUnconfirmedTransaction(
            validUnconfirmedTransaction,
            testSender,
            done
          );
        }
      );
    });
  });

  describe('undoUnconfirmed()', () => {
    function applyUnconfirmedTransaction(trs, sender, done) {
      transaction.applyUnconfirmed(trs, sender, done);
    }

    it('should throw an error with no param', () => {
      expect(transaction.undoUnconfirmed).to.throw();
    });

    it('should be okay with valid params', (done) => {
      transaction.undoUnconfirmed(
        validUnconfirmedTransaction,
        testSender,
        (err) => {
          expect(err).to.not.exist;
          applyUnconfirmedTransaction(
            validUnconfirmedTransaction,
            testSender,
            done
          );
        }
      );
    });
  });

  describe('dbSave()', () => {
    it('should throw an error with no param', () => {
      expect(transaction.dbSave).to.throw();
    });

    it('should throw an error when type is not specified', () => {
      const trs = _.cloneDeep(validTransaction);
      delete trs.type;
      expect(() => {
        transaction.dbSave(trs);
      }).to.throw();
    });

    it('should create comma separated trs signatures', () => {
      const trs = _.cloneDeep(validTransaction);
      const vs = _.cloneDeep(senderDefault);
      vs.multisignatures = [validKeypair.publicKey.toString('hex')];
      delete trs.signature;
      trs.signature = transaction.sign(testSenderKeypair, trs);
      trs.signatures = [transaction.multisign(validKeypair, trs)];
      const saveQuery = transaction.dbSave(trs);
      expect(saveQuery).to.be.an('array');
      expect(saveQuery).to.have.length(1);
      const trsValues = saveQuery[0].values;
      expect(trsValues)
        .to.have.property('signatures')
        .which.is.equal(trs.signatures.join(','));
    });

    it('should return query object for valid parameters', () => {
      const saveQuery = transaction.dbSave(validTransaction);
      const keys = ['table', 'fields', 'values'];
      const valuesKeys = [
        'id',
        'blockId',
        'type',
        'timestamp',
        'timestampMs',
        'senderPublicKey',
        'requesterPublicKey',
        'senderId',
        'recipientId',
        'amount',
        'fee',
        'signature',
        'signSignature',
        'signatures',
      ];
      expect(saveQuery).to.be.an('array');
      expect(saveQuery).to.have.length(1);
      expect(saveQuery[0]).to.have.keys(keys);
      expect(saveQuery[0].values).to.have.keys(valuesKeys);
    });
  });

  describe('afterSave()', () => {
    it('should throw an error with no param', () => {
      expect(transaction.afterSave).to.throw();
    });

    it('should invoke the passed callback', (done) => {
      transaction.afterSave(validTransaction, done);
    });
  });

  describe('objectNormalize()', () => {
    it('should throw an error with no param', () => {
      expect(transaction.objectNormalize).to.throw();
    });

    it('should remove keys with null or undefined attribute', () => {
      const trs = _.cloneDeep(validTransaction);
      trs.amount = null;
      expect(_.keys(transaction.objectNormalize(trs))).to.not.include('amount');
    });

    it('should not remove any keys with valid entries', () => {
      expect(
        _.keys(transaction.objectNormalize(validTransaction))
      ).to.have.length(12);
    });

    it('should throw error for invalid schema types', () => {
      const trs = _.cloneDeep(validTransaction);
      trs.amount = 'Invalid value';
      expect(() => {
        transaction.objectNormalize(trs);
      }).to.throw();
    });
  });

  describe('dbRead()', () => {
    it('should throw an error with no param', () => {
      expect(transaction.dbRead).to.throw();
    });

    it('should return null if id field is not present', () => {
      const rawTrs = _.cloneDeep(rawValidTransaction);
      delete rawTrs.t_id;
      const trs = transaction.dbRead(rawTrs);
      expect(trs).to.be.null;
    });

    it('should return transaction object with correct fields', () => {
      const rawTrs = _.cloneDeep(rawValidTransaction);
      const trs = transaction.dbRead(rawTrs);
      const expectedKeys = [
        'id',
        'height',
        'blockId',
        'block_timestamp',
        'type',
        'timestamp',
        'timestampMs',
        'senderPublicKey',
        'requesterPublicKey',
        'senderId',
        'recipientId',
        'recipientPublicKey',
        'amount',
        'fee',
        'signature',
        'signSignature',
        'signatures',
        'confirmations',
        'asset',
      ];
      expect(trs).to.be.an('object');
      expect(trs).to.have.keys(expectedKeys);
    });
  });
});
