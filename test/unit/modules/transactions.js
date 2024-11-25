'use strict';

const { expect } = require('chai');

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

describe('transactions', function () {
  /**
   * @type {Transactions}
   */
  let transactions;
  let modules;

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

      modulesLoader.initAllModules(
        (err, __modules) => {
          if (err) {
            return done(err);
          }

          modules = __modules;
          transactions = __modules.transactions;

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
          recipientIds: [testAccount.address, genesisAccount.address],
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
        const body = { toHeight: 100, 'and:fromHeight': 2 };

        transactions.shared.getTransactions({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response).to.have.all.keys(getTransactionsKeys);

          expect(response.transactions).not.to.be.empty;
          response.transactions.forEach((transaction) => {
            expect(transaction.height).to.be.within(2, 100);
          });

          done();
        });
      });

      it('should ignore "or" from the first parameter', (done) => {
        const body = { 'or:fromHeight': 2, 'and:toHeight': 100 };

        transactions.shared.getTransactions({ body }, (err, response) => {
          expect(err).not.to.exist;
          expect(response).to.have.all.keys(getTransactionsKeys);

          expect(response.transactions).not.to.be.empty;
          response.transactions.forEach((transaction) => {
            expect(transaction.height).to.be.within(2, 100);
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
