const { expect } = require('chai');
const sinon = require('sinon');

const TransactionPool = require('../../../modules/transactionPool.js');
const { unconfirmedTransactions } = require('../../common/stubs/transactions.js');

describe('TransactionPool', () => {
  /**
   * @type {TransactionPool}
   */
  let transactionPool;

  const scope = {
    logic: {
      transactionPool: {
        getUnconfirmedTransactionList: sinon.fake.returns(unconfirmedTransactions)
      }
    }
  }

  before((done) => {
    new TransactionPool((error, instance) => {
      expect(error).not.to.exist;
      transactionPool = instance;

      done();
    }, scope);
  });

  describe('list()', () => {
    it('should return all transactions when filter is empty', () => {
      const transactions = transactionPool.list({});

      expect(transactions).to.eql(unconfirmedTransactions);
    });

    it('should return transactions with type 8', () => {
      const transactions = transactionPool.list({ type: 8 });

      expect(transactions).to.be.an('array').that.is.not.empty;
      transactions.forEach((transaction) => expect(transaction.type).to.equal(8));
    });

    it('should return transactions with type 1', () => {
      const transactions = transactionPool.list({ type: 1 });

      expect(transactions).to.be.an('array').that.is.not.empty;
      transactions.forEach((transaction) => expect(transaction.type).to.equal(8));
    });
  });
});
