'use strict';

const { expect } = require('chai');
const sinon = require('sinon');

const Transactions = require('../../../modules/transactions.js');
const Transaction = require('../../../logic/transaction.js');

const Vote = require('../../../logic/vote.js');
const Transfer = require('../../../logic/transfer.js');
const Delegate = require('../../../logic/delegate.js');
const Signature = require('../../../logic/signature.js');
const Multisignature = require('../../../logic/multisignature.js');
const InTransfer = require('../../../logic/inTransfer.js');
const OutTransfer = require('../../../logic/outTransfer.js');
const Chat = require('../../../logic/chat.js');
const State = require('../../../logic/state.js');

const { modulesLoader } = require('../../common/initModule.js');
const transactionTypes = require('../../../helpers/transactionTypes.js');
const { testUnconfirmedTransactions } = require('../../common/stubs/transactions.js');

const {
  testAccount,
  genesisAccount,
  nonExistingAddress,
} = require('../../common/stubs/account.js');
const {
  unconfirmedTransaction,
  nonExistingTransactionId,
  unconfirmedTransactionId,
  existingTransaction,
  existingTransactionWithAsset,
} = require('../../common/stubs/transactions.js');
const { genesisBlockId } = require('../../common/stubs/blocks.js');

const test = it;

describe('transactions', function () {
  /**
   * @type {Transactions}
   */
  let transactions;
  let modules;

  before(() => {
    delete require.cache[require.resolve('../../../modules/transactions.js')];
  });

  before(function (done) {
    modulesLoader.initLogicWithDb(Transaction, (err, transaction) => {
      if (err) {
        throw err;
      }

      transaction.attachAssetType(transactionTypes.VOTE, new Vote());
      transaction.attachAssetType(transactionTypes.SEND, new Transfer());
      transaction.attachAssetType(transactionTypes.DELEGATE, new Delegate());
      transaction.attachAssetType(transactionTypes.SIGNATURE, new Signature());
      transaction.attachAssetType(transactionTypes.MULTI, new Multisignature());
      transaction.attachAssetType(
        transactionTypes.IN_TRANSFER,
        new InTransfer()
      );
      transaction.attachAssetType(
        transactionTypes.OUT_TRANSFER,
        new OutTransfer()
      );
      transaction.attachAssetType(transactionTypes.CHAT_MESSAGE, new Chat());
      transaction.attachAssetType(transactionTypes.STATE, new State());

      transaction.checkBalance = sinon.fake.returns({
        exceeded: false,
        error: null
      })

      modulesLoader.initAllModules(
        (err, __modules) => {
          if (err) {
            return done(err);
          }

          modules = __modules;
          transactions = __modules.transactions;

          transactions.getUnconfirmedTransactionList = sinon.fake.returns(testUnconfirmedTransactions);

          done();
        },
        { logic: { transaction } }
      );
    });
  });

  describe('isLoaded', () => {
    it('should return false before transactions.onBind() was called', () => {
      expect(transactions.isLoaded()).to.be.false;
    });
  });

  describe('onBind()', () => {
    it('should initialize modules', () => {
      transactions.onBind(modules);
      expect(transactions.isLoaded()).to.be.true;
    });
  });

  describe('shared', () => {
    describe('getTransactions', () => {
      const getTransactionsKeys = ['transactions', 'count'];

      it('should find the transactions matching the block id', (done) => {
        const body = { blockId: genesisBlockId };

        transactions.shared.getTransactions({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response).to.have.all.keys(getTransactionsKeys);

          response.transactions.forEach((transaction) =>
            expect(transaction.blockId).to.equal(body.blockId)
          );

          done();
        });
      });

      it('should return error for invalid "blockId" type', (done) => {
        const body = { blockId: 'abc' };

        transactions.shared.getTransactions({ body }, (err, response) => {
          expect(err).to.include("Object didn't pass validation for format id");
          expect(response).not.to.exist;

          done();
        });
      });

      it('should find transactions matching the "fromHeight" and "toHeight" parameters', (done) => {
        const body = { fromHeight: 1, 'and:toHeight': 100 };

        transactions.shared.getTransactions({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response).to.have.all.keys(getTransactionsKeys);

          expect(response.transactions).not.to.be.empty;
          response.transactions.forEach((transaction) =>
            expect(transaction.height).to.be.within(
              body.fromHeight,
              body['and:toHeight']
            )
          );

          done();
        });
      });

      it('should find transactions matching the "minAmount" and "maxAmount" parameters', (done) => {
        const minAmount = 490000000000000;
        const maxAmount = 2000000000000000;
        const body = { minAmount, 'and:maxAmount': maxAmount };

        transactions.shared.getTransactions({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response).to.have.all.keys(getTransactionsKeys);

          expect(response.transactions).length.to.be.greaterThanOrEqual(2);
          response.transactions.forEach((transaction) =>
            expect(transaction.amount).to.be.within(minAmount, maxAmount)
          );

          done();
        });
      });

      it('should find transactions matching the "senderId"', (done) => {
        const body = { senderId: genesisAccount.address };

        transactions.shared.getTransactions({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response).to.have.all.keys(getTransactionsKeys);

          expect(response.transactions).length.to.be.greaterThanOrEqual(3);
          response.transactions.forEach((transaction) =>
            expect(transaction.senderId).to.equal(body.senderId)
          );

          done();
        });
      });

      it('should find transactions matching one of the "senderIds"', (done) => {
        const body = {
          senderIds: [testAccount.address, genesisAccount.address],
        };

        transactions.shared.getTransactions({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response).to.have.all.keys(getTransactionsKeys);

          response.transactions.forEach((transaction) =>
            expect(body.senderIds).to.include(transaction.senderId)
          );

          done();
        });
      });

      it('should find transactions matching the "recipientId"', (done) => {
        const body = { recipientId: testAccount.address };

        transactions.shared.getTransactions({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response).to.have.all.keys(getTransactionsKeys);

          expect(response.transactions).not.to.be.empty;
          response.transactions.forEach((transaction) =>
            expect(transaction.recipientId).to.equal(body.recipientId)
          );

          done();
        });
      });

      it('should find transactions matching one of the "recipientIds"', (done) => {
        const body = {
          recipientIds: [testAccount.address, 'U9781760580710719871'],
        };

        transactions.shared.getTransactions({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response).to.have.all.keys(getTransactionsKeys);

          expect(response.transactions).length.to.be.greaterThanOrEqual(2);
          response.transactions.forEach((transaction) =>
            expect(body.recipientIds).to.include(transaction.recipientId)
          );

          done();
        });
      });

      it('should find transactions matching the "senderPublicKey"', (done) => {
        const body = { senderPublicKey: genesisAccount.publicKey };

        transactions.shared.getTransactions({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response).to.have.all.keys(getTransactionsKeys);

          expect(response.transactions).not.to.be.empty;
          response.transactions.forEach((transaction) =>
            expect(transaction.senderPublicKey).to.equal(body.senderPublicKey)
          );

          done();
        });
      });

      it('should find transactions matching the "recipientPublicKey"', (done) => {
        const body = { recipientPublicKey: testAccount.publicKey };

        transactions.shared.getTransactions({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response).to.have.all.keys(getTransactionsKeys);

          expect(response.transactions).not.to.be.empty;
          response.transactions.forEach((transaction) =>
            expect(transaction.recipientPublicKey).to.equal(
              body.recipientPublicKey
            )
          );

          done();
        });
      });

      it('should find transactions matching the "type"', (done) => {
        const body = { type: transactionTypes.VOTE };

        transactions.shared.getTransactions({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response).to.have.all.keys(getTransactionsKeys);

          expect(response.transactions).not.to.be.empty;
          response.transactions.forEach((transaction) =>
            expect(transaction.type).to.equal(body.type)
          );

          done();
        });
      });

      it('should find transactions matching one of the "types"', (done) => {
        const types = [transactionTypes.CHAT_MESSAGE, transactionTypes.VOTE];

        const body = {
          types: types.join(','),
        };

        transactions.shared.getTransactions({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response).to.have.all.keys(getTransactionsKeys);

          response.transactions.forEach((transaction) =>
            expect(types.map(Number)).to.include(transaction.type)
          );

          done();
        });
      });

      it('should return an empty result for non-existing address as senderId', (done) => {
        const body = { senderId: nonExistingAddress };

        transactions.shared.getTransactions({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response).to.have.all.keys(getTransactionsKeys);
          expect(response.transactions).to.be.an('array').that.is.empty;

          done();
        });
      });

      it('should return error for invalid parameters', (done) => {
        const body = { minAmount: 'invalid' };

        transactions.shared.getTransactions({ body }, (err, response) => {
          expect(err).to.include('Expected type integer');
          expect(response).not.to.exist;

          done();
        });
      });

      it('should return empty result for conflicting filters', (done) => {
        const body = { fromHeight: 100, 'and:toHeight': 1 };

        transactions.shared.getTransactions({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response).to.have.all.keys(getTransactionsKeys);
          expect(response.transactions).to.be.empty;

          done();
        });
      });

      it('should support pagination', (done) => {
        const body = { senderId: testAccount.address, limit: 10, offset: 5 };

        transactions.shared.getTransactions({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response).to.have.all.keys(getTransactionsKeys);
          expect(response.transactions).length.to.be.at.most(5);

          done();
        });
      });

      it('should find transactions with OR logic by default (blockId OR senderId)', (done) => {
        const body = { blockId: genesisBlockId, senderId: testAccount.address };

        transactions.shared.getTransactions({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response).to.have.all.keys(getTransactionsKeys);

          expect(response.transactions).not.to.be.empty;
          response.transactions.forEach(
            (transaction) =>
              expect(
                transaction.blockId === body.blockId ||
                  transaction.senderId === body.senderId
              ).to.be.true
          );

          done();
        });
      });

      it('should find transactions with AND logic (blockId AND senderId)', (done) => {
        const body = {
          blockId: genesisBlockId,
          'and:senderId': testAccount.address,
        };

        transactions.shared.getTransactions({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response).to.have.all.keys(getTransactionsKeys);

          expect(response.transactions).not.to.be.empty;
          response.transactions.forEach((transaction) => {
            expect(transaction.blockId).to.equal(body.blockId);
            expect(transaction.senderId).to.equal(testAccount.address);
          });

          done();
        });
      });

      it('should find transactions with OR logic across ranges (toHeight OR minAmount)', (done) => {
        const body = { toHeight: 1, minAmount: 1000000 };

        transactions.shared.getTransactions({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response).to.have.all.keys(getTransactionsKeys);

          expect(response.transactions).not.to.be.empty;
          response.transactions.forEach(
            (transaction) =>
              expect(
                transaction.height <= body.toHeight ||
                  transaction.amount >= body.minAmount
              ).to.be.true
          );

          done();
        });
      });

      it('should find transactions with AND logic across ranges (fromHeight AND toHeight)', (done) => {
        const body = { toHeight: 100, 'and:fromHeight': 1 };

        transactions.shared.getTransactions({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response).to.have.all.keys(getTransactionsKeys);

          expect(response.transactions).not.to.be.empty;
          response.transactions.forEach((transaction) => {
            expect(transaction.height).to.be.within(1, 100);
          });

          done();
        });
      });

      it('should ignore "or" from the first parameter', (done) => {
        const body = { 'or:fromHeight': 1, 'and:toHeight': 100 };

        transactions.shared.getTransactions({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response).to.have.all.keys(getTransactionsKeys);

          expect(response.transactions).not.to.be.empty;
          response.transactions.forEach((transaction) => {
            expect(transaction.height).to.be.within(1, 100);
          });

          done();
        });
      });

      it('should return error for an invalid prefix', (done) => {
        const body = { 'not:fromHeight': 2, 'nor:toHeight': 100 };

        transactions.shared.getTransactions({ body }, (err, response) => {
          expect(err).to.include('Incorrect condition');
          expect(response).not.to.exist;

          done();
        });
      });

      it('should return error for multiple prefixes', (done) => {
        const body = { 'and:or:fromHeight': 2, toHeight: 100 };

        transactions.shared.getTransactions({ body }, (err, response) => {
          expect(err).to.include('Invalid parameter supplied');
          expect(response).not.to.exist;

          done();
        });
      });

      it('should return error for non existing parameter', (done) => {
        const body = { maxAura: 100 };

        transactions.shared.getTransactions({ body }, (err, response) => {
          expect(err).to.include('Parameter is not supported');
          expect(response).not.to.exist;

          done();
        });
      });

      it('should combine senderId AND recipientId with OR for type', (done) => {
        const body = {
          senderId: testAccount.address,
          'and:recipientId': testAccount.address,
          type: transactionTypes.VOTE,
        };

        transactions.shared.getTransactions({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response).to.have.all.keys(getTransactionsKeys);

          expect(response.transactions).not.to.be.empty;
          response.transactions.forEach((transaction) => {
            expect(
              (transaction.senderId === body.senderId &&
                transaction.recipientId === body['and:recipientId']) ||
                transaction.type === body.type
            ).to.be.true;
          });

          done();
        });
      });

      it('should handle complex combinations (minAmount AND maxAmount AND type)', (done) => {
        const body = {
          minAmount: 100000000,
          'and:maxAmount': 500000000000000,
          'and:type': transactionTypes.SEND,
        };

        transactions.shared.getTransactions({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response).to.have.all.keys(getTransactionsKeys);

          expect(response.transactions).not.to.be.empty;
          response.transactions.forEach((transaction) => {
            expect(
              (transaction.amount >= body.minAmount &&
                transaction.amount <= body['and:maxAmount']) ||
                transaction.type === body.type
            ).to.be.true;
          });

          done();
        });
      });

      it('should handle nested AND conditions with recipientPublicKey', (done) => {
        const body = {
          recipientPublicKey: testAccount.publicKey,
          'and:toHeight': 100,
          'and:fromHeight': 1,
        };

        transactions.shared.getTransactions({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response).to.have.all.keys(getTransactionsKeys);

          expect(response.transactions).not.to.be.empty;
          response.transactions.forEach((transaction) => {
            expect(transaction.recipientPublicKey).to.equal(
              body.recipientPublicKey
            );
            expect(transaction.height).to.be.within(1, 100);
          });

          done();
        });
      });

      it('should find transactions with OR logic for multiple recipientIds', (done) => {
        const body = {
          recipientIds: [testAccount.address, genesisAccount.address],
          minAmount: 50000000,
        };

        transactions.shared.getTransactions({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response).to.have.all.keys(getTransactionsKeys);

          expect(response.transactions).not.to.be.empty;
          response.transactions.forEach((transaction) => {
            expect(
              body.recipientIds.includes(transaction.recipientId) ||
                transaction.amount >= body.minAmount
            ).to.be.true;
          });

          done();
        });
      });

      it('should return empty response when no transaction matches complex filters', (done) => {
        const body = {
          blockId: genesisBlockId,
          'and:senderId': nonExistingAddress,
          'and:type': transactionTypes.VOTE,
        };

        transactions.shared.getTransactions({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response).to.have.all.keys(getTransactionsKeys);
          expect(response.transactions).to.be.an('array').that.is.empty;

          done();
        });
      });

      it('should sort transactions by height in descending order', (done) => {
        const body = { orderBy: 'height:desc' };

        transactions.shared.getTransactions({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response).to.have.all.keys(getTransactionsKeys);
          expect(response.transactions).not.to.be.empty;

          const heights = response.transactions.map(
            (transaction) => transaction.height
          );
          expect(heights).to.eql([...heights].sort((a, b) => b - a));

          done();
        });
      });

      it('should sort transactions by height in ascending order', (done) => {
        const body = { orderBy: 'height:asc' };

        transactions.shared.getTransactions({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response).to.have.all.keys(getTransactionsKeys);
          expect(response.transactions).not.to.be.empty;

          const heights = response.transactions.map(
            (transaction) => transaction.height
          );
          expect(heights).to.eql([...heights].sort((a, b) => a - b));

          done();
        });
      });

      it('should sort transactions by amount in descending order', (done) => {
        const body = { orderBy: 'amount:desc' };

        transactions.shared.getTransactions({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response).to.have.all.keys(getTransactionsKeys);
          expect(response.transactions).not.to.be.empty;

          const amounts = response.transactions.map(
            (transaction) => transaction.amount
          );
          expect(amounts).to.eql([...amounts].sort((a, b) => b - a));

          done();
        });
      });

      it('should sort transactions by amount in ascending order', (done) => {
        const body = { orderBy: 'amount:asc' };

        transactions.shared.getTransactions({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response).to.have.all.keys(getTransactionsKeys);
          expect(response.transactions).not.to.be.empty;

          const amounts = response.transactions.map(
            (transaction) => transaction.amount
          );
          expect(amounts).to.eql([...amounts].sort((a, b) => a - b));

          done();
        });
      });

      it('should sort transactions by type in ascending order', (done) => {
        const body = { orderBy: 'type:asc' };

        transactions.shared.getTransactions({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response).to.have.all.keys(getTransactionsKeys);
          expect(response.transactions).not.to.be.empty;

          const types = response.transactions.map(
            (transaction) => transaction.type
          );
          expect(types).to.eql([...types].sort((a, b) => a - b));

          done();
        });
      });

      it('should handle invalid sort field gracefully', (done) => {
        const body = { orderBy: 'nonexistentField:asc' };

        transactions.shared.getTransactions({ body }, (err, response) => {
          expect(err).to.include('Invalid sort field');
          expect(response).not.to.exist;

          done();
        });
      });

      it('should sort transactions with filters (height desc with minAmount)', (done) => {
        const body = { orderBy: 'height:desc', minAmount: 100 };

        transactions.shared.getTransactions({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response).to.have.all.keys(getTransactionsKeys);
          expect(response.transactions).not.to.be.empty;

          response.transactions.forEach((transaction) =>
            expect(transaction.amount).to.be.at.least(100)
          );

          const heights = response.transactions.map(
            (transaction) => transaction.height
          );
          expect(heights).to.eql([...heights].sort((a, b) => b - a));

          done();
        });
      });

      it('should sort transactions with pagination (amount asc, limit 5, offset 10)', (done) => {
        const body = { orderBy: 'amount:asc', limit: 5, offset: 10 };

        transactions.shared.getTransactions({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response).to.have.all.keys(getTransactionsKeys);
          expect(response.transactions).length.to.be.at.most(5);

          const amounts = response.transactions.map(
            (transaction) => transaction.amount
          );
          expect(amounts).to.eql([...amounts].sort((a, b) => a - b));

          done();
        });
      });
    });

    describe('getTransaction', () => {
      it('should return error with no parameters', (done) => {
        const body = {};
        transactions.shared.getTransaction({ body }, (err, response) => {
          expect(err).to.equal('Missing required property: id');
          expect(response).not.to.exist;
          done();
        });
      });

      it('should return transaction without asset by id', (done) => {
        const body = { id: existingTransactionWithAsset.id };
        transactions.shared.getTransaction({ body }, (err, response) => {
          expect(err).not.to.exist;

          expect(response.transaction).to.deep.include(existingTransaction);
          done();
        });
      });

      it('should return transaction with asset by id', (done) => {
        const body = { id: existingTransactionWithAsset.id, returnAsset: 1 };
        transactions.shared.getTransaction({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response.transaction).to.deep.include(
            existingTransactionWithAsset
          );
          done();
        });
      });

      it('should return error for non-existing transaction id', (done) => {
        const body = { id: nonExistingTransactionId };
        transactions.shared.getTransaction({ body }, (err, response) => {
          expect(err).to.equal('Transaction not found');
          expect(response).not.to.exist;
          done();
        });
      });
    });

    describe('getUnconfirmedTransactions()', () => {
      it('should throw when filter is not provided', () => {
        expect(transactions.getUnconfirmedTransactions.bind(transactions)).to.throw('filter should be of type "object"');
      });

      describe('should throw when filter is not an object', () => {
        const invalidTypes = [
          123,
          'string',
          [],
          null,
        ];

        invalidTypes.forEach((value) => {
          test(JSON.stringify(value), () => {
            expect(() => transactions.getUnconfirmedTransactions(value)).to.throw('filter should be of type "object"');
          });
        });
      });

      it('should return all transactions when filter is empty', () => {
        const unconfirmedTransactions = transactions.getUnconfirmedTransactions({});

        expect(unconfirmedTransactions).to.eql(unconfirmedTransactions);
      });

      it('should return transactions with type 8', () => {
        const unconfirmedTransactions = transactions.getUnconfirmedTransactions({ type: 8 });

        expect(unconfirmedTransactions).to.be.an('array').that.is.not.empty;
        unconfirmedTransactions.forEach((transaction) => expect(transaction.type).to.equal(8));
      });

      it('should return empty list when query transactions with type 1', () => {
        const unconfirmedTransactions = transactions.getUnconfirmedTransactions({ type: 1 });

        expect(unconfirmedTransactions).to.be.an('array').that.is.empty;
      });

      it('should filter transactions by minimum amount', () => {
        const unconfirmedTransactions = transactions.getUnconfirmedTransactions({ minAmount: 10000000 });
        expect(unconfirmedTransactions).to.be.an('array').that.is.not.empty;
        unconfirmedTransactions.forEach((transaction) => expect(transaction.amount).to.be.at.least(9000000));
      });

      it('should filter transactions by maximum amount', () => {
        const unconfirmedTransactions = transactions.getUnconfirmedTransactions({ maxAmount: 10000000 });
        expect(unconfirmedTransactions).to.be.an('array').that.is.not.empty;
        unconfirmedTransactions.forEach((transaction) => expect(transaction.amount).to.be.at.most(10000000));
      });

      it('should filter transactions by sender ID', () => {
        const unconfirmedTransactions = transactions.getUnconfirmedTransactions({ senderId: 'U3716604363012166999' });
        expect(unconfirmedTransactions).to.be.an('array').that.is.not.empty;
        unconfirmedTransactions.forEach((transaction) => expect(transaction.senderId).to.equal('U3716604363012166999'));
      });

      it('should filter transactions by recipient ID', () => {
        const unconfirmedTransactions = transactions.getUnconfirmedTransactions({ recipientId: 'U2185870976635709603' });
        expect(unconfirmedTransactions).to.be.an('array').that.is.not.empty;
        unconfirmedTransactions.forEach((transaction) => expect(transaction.recipientId).to.equal('U2185870976635709603'));
      });

      it('should filter transactions by sender public key', () => {
        const unconfirmedTransactions = transactions.getUnconfirmedTransactions({ senderPublicKey: '1ed651ec1c686c23249dadb2cb656edd5f8e7d35076815d8a81c395c3eed1a85' });
        expect(unconfirmedTransactions).to.be.an('array').that.is.not.empty;
        unconfirmedTransactions.forEach((transaction) => expect(transaction.senderPublicKey).to.equal('1ed651ec1c686c23249dadb2cb656edd5f8e7d35076815d8a81c395c3eed1a85'));
      });

      it('should filter transactions by recipient public key', () => {
        const unconfirmedTransactions = transactions.getUnconfirmedTransactions({ recipientPublicKey: '88133402279c1882e2d2945253154f82eba01f547d5f57a228d814365817daa5' });
        expect(unconfirmedTransactions).to.be.an('array').that.is.not.empty;
        unconfirmedTransactions.forEach((transaction) => expect(transaction.recipientId).to.equal('U2185870976635709603'));
      });

      it('should filter transactions by from timestamp', () => {
        const unconfirmedTransactions = transactions.getUnconfirmedTransactions({ fromTimestamp: 231352260 });
        expect(unconfirmedTransactions).to.be.an('array').that.is.not.empty;
        unconfirmedTransactions.forEach((transaction) => expect(transaction.timestamp).to.be.at.least(231352260));
      });

      it('should filter transactions by to timestamp', () => {
        const unconfirmedTransactions = transactions.getUnconfirmedTransactions({ toTimestamp: 58880317 });
        expect(unconfirmedTransactions).to.be.an('array').that.is.not.empty;
        unconfirmedTransactions.forEach((transaction) => expect(transaction.timestamp).to.be.at.most(58880317));
      });

      it('should filter transactions by multiple types', () => {
        const unconfirmedTransactions = transactions.getUnconfirmedTransactions({ types: [0, 8] });
        expect(unconfirmedTransactions).to.be.an('array').that.is.not.empty;
        unconfirmedTransactions.forEach((transaction) => expect([0, 8]).to.include(transaction.type));
      });

      it('should filter transactions by multiple sender IDs', () => {
        const unconfirmedTransactions = transactions.getUnconfirmedTransactions({ senderIds: ['U3716604363012166999', 'U17569530934631988492'] });
        expect(unconfirmedTransactions).to.be.an('array').that.is.not.empty;
        unconfirmedTransactions.forEach((transaction) => expect(['U3716604363012166999', 'U17569530934631988492']).to.include(transaction.senderId));
      });

      it('should filter transactions by multiple recipient IDs', () => {
        const unconfirmedTransactions = transactions.getUnconfirmedTransactions({ recipientIds: ['U2185870976635709603', 'U1747430300387568664'] });
        expect(unconfirmedTransactions).to.be.an('array').that.is.not.empty;
        unconfirmedTransactions.forEach((transaction) => expect(['U2185870976635709603', 'U1747430300387568664']).to.include(transaction.recipientId));
      });

      it('should filter transactions by multiple sender public keys', () => {
        const unconfirmedTransactions = transactions.getUnconfirmedTransactions({
          senderPublicKeys: [
            'b87f9fe005c3533152230fdcbd7bf87a0cea83592c591f7e71be5b7a48bb6e44',
            '1ed651ec1c686c23249dadb2cb656edd5f8e7d35076815d8a81c395c3eed1a85',
          ],
        });
        expect(unconfirmedTransactions).to.be.an('array').that.is.not.empty;
        unconfirmedTransactions.forEach(
          (transaction) =>
            expect([
              'b87f9fe005c3533152230fdcbd7bf87a0cea83592c591f7e71be5b7a48bb6e44',
              '1ed651ec1c686c23249dadb2cb656edd5f8e7d35076815d8a81c395c3eed1a85',
            ]).to.include(transaction.senderPublicKey)
        );
      });

      it('should filter transactions by multiple recipient public keys', () => {
        const unconfirmedTransactions = transactions.getUnconfirmedTransactions({
          recipientPublicKeys: [
            '88133402279c1882e2d2945253154f82eba01f547d5f57a228d814365817daa5',
            '9627e198a1ed10994340f1e60b334b824b0573bab20190494f90663bfaa92eac',
          ],
        });
        expect(unconfirmedTransactions).to.be.an('array').that.is.not.empty;
        unconfirmedTransactions.forEach((transaction) => expect(['U5885317311990438076', 'U2185870976635709603']).to.include(transaction.recipientId));
      });

      it('should filter transactions using AND condition by default', () => {
        const unconfirmedTransactions = transactions.getUnconfirmedTransactions({ minAmount: 10000000, senderId: 'U3716604363012166999' });
        expect(unconfirmedTransactions).to.be.an('array').that.is.not.empty;
        unconfirmedTransactions.forEach((transaction) => {
          expect(transaction.amount).to.be.at.least(10000000);
          expect(transaction.senderId).to.equal('U3716604363012166999');
        });
      });

      it('should filter transactions using OR condition by default', () => {
        const unconfirmedTransactions = transactions.getUnconfirmedTransactions({
          minAmount: 10000000,
          senderId: 'U3716604363012166999',
        }, 'OR');
        expect(unconfirmedTransactions).to.be.an('array').that.is.not.empty;
        unconfirmedTransactions.forEach((transaction) => {
          expect(transaction.amount >= 10000000 || transaction.senderId === 'U3716604363012166999').to.be.true;
        });
      });

      it('should filter transactions using OR condition with uppercase prefixes', () => {
        const unconfirmedTransactions = transactions.getUnconfirmedTransactions({ 'OR:minAmount': 100000000, 'OR:senderId': 'U3716604363012166999' });
        expect(unconfirmedTransactions).to.be.an('array').that.is.not.empty;
        unconfirmedTransactions.forEach((transaction) => {
          expect(
            transaction.amount >= 100000000 || transaction.senderId === 'U3716604363012166999'
          ).to.be.true;
        });
      });

      it('should filter transactions using OR condition with lowercase prefixes', () => {
        const unconfirmedTransactions = transactions.getUnconfirmedTransactions({ 'or:minAmount': 100000000, 'or:senderId': 'U3716604363012166999' });
        expect(unconfirmedTransactions).to.be.an('array').that.is.not.empty;
        unconfirmedTransactions.forEach((transaction) => {
          expect(
            transaction.amount >= 100000000 || transaction.senderId === 'U3716604363012166999'
          ).to.be.true;
        });
      });

      it('should filter transactions by minAmount AND maxAmount with lowercase prefix', () => {
        const unconfirmedTransactions = transactions.getUnconfirmedTransactions({ minAmount: 9000000, 'and:maxAmount': 10000000 });
        expect(unconfirmedTransactions).to.be.an('array').that.is.not.empty;
        unconfirmedTransactions.forEach((transaction) => {
          expect(transaction.amount).to.be.at.least(9000000);
          expect(transaction.amount).to.not.be.above(10000000);
        });
      });

      it('should filter transactions by fromTimestamp OR toTimestamp with uppercase prefix', () => {
        const unconfirmedTransactions = transactions.getUnconfirmedTransactions({ fromTimestamp: 231352261, 'OR:toTimestamp': 58880317 });
        expect(unconfirmedTransactions).to.be.an('array').that.is.not.empty;
        unconfirmedTransactions.forEach((transaction) => {
          expect(
            transaction.timestamp <= 58880317 || transaction.timestamp >= 231352261
          ).to.be.true;
        });
      });

      it('should ignore first prefix', () => {
        const unconfirmedTransactions = transactions.getUnconfirmedTransactions({ 'OR:fromTimestamp': 58880317, toTimestamp: 231352261 });
        expect(unconfirmedTransactions).to.be.an('array').that.is.not.empty;
        unconfirmedTransactions.forEach((transaction) => {
          expect(
            transaction.timestamp <= 231352261 && transaction.timestamp >= 58880317
          ).to.be.true;
        });
      });

      it('should return empty array for contradictory conditions', () => {
        const unconfirmedTransactions = transactions.getUnconfirmedTransactions({ fromTimestamp: 231352261, toTimestamp: 58880317 });
        expect(unconfirmedTransactions).to.be.an('array').to.be.empty;
      });

      it('should ignore unrelated filters', () => {
        const unconfirmedTransactions = transactions.getUnconfirmedTransactions({ senderId: 'U3716604363012166999', returnUnconfirmed: 1 });
        expect(unconfirmedTransactions).to.be.an('array').that.is.not.empty;
        unconfirmedTransactions.forEach((transaction) => expect(transaction.senderId).to.equal('U3716604363012166999'));
      });

      describe('should return empty list if blockchain related filters are used', () => {
        it('blockId', () => {
          const unconfirmedTransactions = transactions.getUnconfirmedTransactions({ blockId: '8505659485551877884' });
          expect(unconfirmedTransactions).to.be.an('array').that.is.empty;
        });

        it('blockId + senderId', () => {
          const unconfirmedTransactions = transactions.getUnconfirmedTransactions({ senderId: 'U3716604363012166999', blockId: '8505659485551877884' });
          expect(unconfirmedTransactions).to.be.an('array').that.is.empty;
        });

        it('fromHeight', () => {
          const unconfirmedTransactions = transactions.getUnconfirmedTransactions({ fromHeight: 0 });
          expect(unconfirmedTransactions).to.be.an('array').that.is.empty;
        });

        it('minAmount + and:fromHeight', () => {
          const unconfirmedTransactions = transactions.getUnconfirmedTransactions({ minAmount: 9000000, 'and:fromHeight': 0 });
          expect(unconfirmedTransactions).to.be.an('array').that.is.empty;
        });

        it('toHeight', () => {
          const unconfirmedTransactions = transactions.getUnconfirmedTransactions({ toHeight: 99999999999999 });
          expect(unconfirmedTransactions).to.be.an('array').that.is.empty;
        });

        it('toHeight + fromTimestamp', () => {
          const unconfirmedTransactions = transactions.getUnconfirmedTransactions({ fromTimestamp: 0, toHeight: 99999999999999 });
          expect(unconfirmedTransactions).to.be.an('array').that.is.empty;
        });

        it('fromHeight + and:toHeight', () => {
          const unconfirmedTransactions = transactions.getUnconfirmedTransactions({ fromHeight: 0, 'and:toHeight': 99999999999999 });
          expect(unconfirmedTransactions).to.be.an('array').that.is.empty;
        });
      });
    });

    describe('mergeUnconfirmedTransactions()', () => {
      const txs = [
        {
          id: '9175562912139726777',
          height: 10288885,
          blockId: '10475460465898092643',
          type: 8,
          block_timestamp: 58773245,
          timestamp: 58773228,
          senderPublicKey: '2ac5eef60303003c90f662d89e60570d8661c8ba569e667296f5c7c97a0413ee',
          senderId: 'U8916295525136600565',
          recipientPublicKey: '5a3c1da429ae925422892e69dc4f0ab6d7ac00cef229d2d992242dcfeca27b91',
          recipientId: 'U2707535059340134112',
          fee: 100000,
          signature: '287dc2554025d8074d674d50ec785d530588e2b828f2d3f29687a4f05c8afc623e185896abc739ea2af8db199ec6e31c57426937343ff5ec154341cee8f72f0a',
          signatures: [],
          confirmations: 32801518,
          asset: {},
        },
      ];

      const unconfirmedTxs = [
        {
          id: '2521078418148431420',
          type: 8,
          amount: 9000000,
          senderId: 'U11987698782411545765',
          senderPublicKey: 'b87f9fe005c3533152230fdcbd7bf87a0cea83592c591f7e71be5b7a48bb6e44',
          asset: {},
          recipientId: 'U5885317311990438076',
          timestamp: 58880317,
          signature: '5ee972df476703492a667616eef428ed127e13fe5de8ba873b6579a806ddbd9fbd34147cf0321823d72e0d234466fc3dc89ebe7341e0b4a91a56b32d3bdb6a00',
          fee: 50000000,
          relays: 1,
          receivedAt: '2019-07-16T04:38:38.492Z',
        },
      ];

      let orderBy;

      beforeEach(() => {
        orderBy = {
          sortField: undefined,
          sortMethod: undefined,
        };
      });

      it('should throw an error when parameters are not provided', () => {
        expect(() => transactions.mergeUnconfirmedTransactions()).to.throw();
      });

      it('should merge transactions without orderBy and limit', () => {
        const mergedTxs = transactions.mergeUnconfirmedTransactions(txs, unconfirmedTxs, orderBy);

        expect(mergedTxs).to.eql([...txs, ...unconfirmedTxs]);
      });

      it('should merge and sort by timestamp in DESC order without limit', () => {
        orderBy = { sortField: 'timestamp', sortMethod: 'DESC' };

        const mergedTxs = transactions.mergeUnconfirmedTransactions(txs, unconfirmedTxs, orderBy);

        expect(mergedTxs).to.eql([...unconfirmedTxs, ...txs]);
      });

      it('should return only the latest transaction when sorted by timestamp and limited to 1', () => {
        orderBy = { sortField: 'timestamp', sortMethod: 'DESC' };
        const limit = 1;

        const mergedTxs = transactions.mergeUnconfirmedTransactions(txs, unconfirmedTxs, orderBy, limit);

        expect(mergedTxs).to.eql([unconfirmedTxs[0]]);
      });

      it('should return only the second transaction when sorted by timestamp, limited to 1 and set offset to 1', () => {
        orderBy = { sortField: 'timestamp', sortMethod: 'DESC' };
        const limit = 1;
        const offset = 1;

        const mergedTxs = transactions.mergeUnconfirmedTransactions(txs, unconfirmedTxs, orderBy, limit, offset);

        expect(mergedTxs).to.eql([txs[0]]);
      });

      it('should return only the second transaction when sorted by timestamp and set offset to 1 when limit option is skipped', () => {
        orderBy = { sortField: 'timestamp', sortMethod: 'DESC' };
        const limit = undefined;
        const offset = 1;

        const mergedTxs = transactions.mergeUnconfirmedTransactions(txs, unconfirmedTxs, orderBy, limit, offset);

        expect(mergedTxs).to.eql([txs[0]]);
      });

      it('should merge and sort by fee in ASC order', () => {
        orderBy = { sortField: 'fee', sortMethod: 'ASC' };

        const mergedTxs = transactions.mergeUnconfirmedTransactions(txs, unconfirmedTxs, orderBy);

        expect(mergedTxs).to.eql([txs[0], unconfirmedTxs[0]]);
      });

      it('should handle an empty list of transactions', () => {
        const mergedTxs = transactions.mergeUnconfirmedTransactions([], [], orderBy);

        expect(mergedTxs).to.eql([]);
      });
    });

    describe('getTransactionsCount', () => {
      const getTransactionsCountKeys = [
        'confirmed',
        'multisignature',
        'unconfirmed',
        'queued',
      ];

      it('should return valid object', (done) => {
        transactions.shared.getTransactionsCount({}, (err, response) => {
          expect(err).not.to.exist;
          expect(response).to.have.all.keys(getTransactionsCountKeys);
          expect(response.confirmed).to.be.above(0);
          expect(response.multisignature).to.equal(0);
          expect(response.unconfirmed).to.be.a('number');
          expect(response.queued).to.be.a('number');

          done();
        });
      });
    });

    describe('transactions in pool', () => {
      beforeEach((done) => {
        transactions.receiveTransactions([unconfirmedTransaction], true, done);
      });

      afterEach(() => {
        transactions.removeUnconfirmedTransaction(unconfirmedTransactionId);
        expect(transactions.transactionInPool(unconfirmedTransactionId)).to.be
          .false;
      });

      describe('queued transactions', () => {
        describe('getQueuedTransactions', () => {
          const getQueuedTransactionsKeys = ['transactions', 'count'];

          it('should return queued transactions', (done) => {
            transactions.shared.getQueuedTransactions(
              { body: {} },
              (err, response) => {
                expect(err).not.to.exist;
                expect(response).to.have.all.keys(getQueuedTransactionsKeys);
                expect(response.count).to.be.a('number');
                expect(response.transactions).to.be.an('array');
                expect(response.transactions).not.to.be.empty;

                response.transactions.forEach((transaction) => {
                  expect(transaction.id).to.be.a.string;
                  expect(transaction.receivedAt).to.be.a.string;
                  expect(transaction.blockId).not.to.exist;
                  expect(transaction.height).not.to.exist;
                });

                done();
              }
            );
          });
        });

        describe('getQueuedTransactions', () => {
          it('should return error with no "id" parameter', (done) => {
            transactions.shared.getQueuedTransaction(
              { body: {} },
              (err, response) => {
                expect(err).to.equal('Missing required property: id');
                expect(response).not.to.exist;

                done();
              }
            );
          });

          it('should return queued transaction', (done) => {
            const body = { id: unconfirmedTransactionId };
            transactions.shared.getQueuedTransaction(
              { body },
              (err, response) => {
                expect(err).not.to.exist;
                expect(response.transaction).to.eql(unconfirmedTransaction);

                done();
              }
            );
          });
        });
      });

      describe('unconfirmed transactions', () => {
        beforeEach((done) => {
          transactions.fillPool(done);
        });

        describe('getUnconfirmedTransactions', () => {
          const getUnconfirmedTransactionsKeys = ['transactions', 'count'];

          it('should return unconfirmed transactions', (done) => {
            transactions.shared.getUnconfirmedTransactions(
              { body: {} },
              (err, response) => {
                expect(err).not.to.exist;
                expect(response).to.have.all.keys(
                  getUnconfirmedTransactionsKeys
                );
                expect(response.count).to.be.a('number');
                expect(response.transactions).to.be.an('array');
                expect(response.transactions).not.to.be.empty;

                response.transactions.forEach((transaction) => {
                  expect(transaction.id).to.be.a.string;
                  expect(transaction.receivedAt).to.be.a.string;
                  expect(transaction.blockId).not.to.exist;
                  expect(transaction.height).not.to.exist;
                });

                done();
              }
            );
          });
        });

        describe('getUnconfirmedTransaction', () => {
          it('should return error with no "id" parameter', (done) => {
            transactions.shared.getUnconfirmedTransaction(
              { body: {} },
              (err, response) => {
                expect(err).to.equal('Missing required property: id');
                expect(response).not.to.exist;

                done();
              }
            );
          });

          it('should return unconfirmed transaction', (done) => {
            const body = { id: unconfirmedTransactionId };
            transactions.shared.getUnconfirmedTransaction(
              { body },
              (err, response) => {
                expect(err).not.to.exist;
                expect(response.transaction).to.eql(unconfirmedTransaction);

                done();
              }
            );
          });
        });
      });
    });
  });
});
