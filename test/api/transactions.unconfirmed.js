const node = require('../node.js');
const { modulesLoader } = require('../common/initModule.js');
const { sendADM, sendADMasync } = require('../common/api');

// Cache should be disabled for testing unconfirmed transactions
let cache;

before(function (done) {
  modulesLoader.initCache(function (err, __cache) {
    cache = __cache;

    return done(err, __cache);
  });
});

beforeEach(function (done) {
  cache.flushDb(function (err, status) {
    done(err, status);
  });
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const recipient = node.randomAccount();

describe('GET /api/transactions?returnUnconfirmed=1', () => {
  let lastUnconfirmedTransactionId;

  const assertNoUnconfirmedTxs = (transactions) => {
    transactions.forEach((tx, idx) => {
      if (tx.confirmations < 1) {
        throw new Error(`Unconfirmed transaction found at index ${idx}`);
      }
    });
  };

  const getTransactions = (query, callback) => {
    node.get(`/api/transactions?${query}`, callback);
  };

  before((done) => {
    sendADM({
      secret: node.iAccount.password,
      recipientId: recipient.address,
      amount: node.fees.transactionFee,
    }, (err, res) => {
      if (err) return done(err);
      lastUnconfirmedTransactionId = res.body.transactionId;
      setTimeout(done, 1000); // wait for unconfirmed tx to propagate
    });
  });

  it('should return unconfirmed transaction first by default', (done) => {
    getTransactions('returnUnconfirmed=1', (err, res) => {
      try {
        node.expect(err).to.not.exist;
        const { transactions } = res.body;

        node.expect(transactions).to.be.an('array');
        node.expect(transactions[0].id).to.equal(lastUnconfirmedTransactionId);

        done();
      } catch (err) {
        done(err);
      }
    });
  });

  it('should exclude unconfirmed txs when offset=1 is used', (done) => {
    getTransactions('returnUnconfirmed=1&offset=1', (err, res) => {
      try {
        node.expect(err).to.not.exist;
        assertNoUnconfirmedTxs(res.body.transactions);
        done();
      } catch (err) {
        done(err);
      }
    });
  });

  it('should exclude unconfirmed txs when recipientId does not match', (done) => {
    getTransactions(`returnUnconfirmed=1&recipientId=${node.iAccount.address}`, (err, res) => {
      try {
        node.expect(err).to.not.exist;
        assertNoUnconfirmedTxs(res.body.transactions);
        done();
      } catch (err) {
        done(err);
      }
    });
  });

  it('should include unconfirmed tx with matching senderId', (done) => {
    getTransactions(`returnUnconfirmed=1&senderId=${node.iAccount.address}`, (err, res) => {
      try {
        node.expect(err).to.not.exist;
        const { transactions } = res.body;
        node.expect(transactions[0].id).to.equal(lastUnconfirmedTransactionId);
        done();
      } catch (err) {
        done(err);
      }
    });
  });

  it('should exclude unconfirmed txs when sorted by height:asc', (done) => {
    getTransactions('returnUnconfirmed=1&orderBy=height:asc', (err, res) => {
      try {
        node.expect(err).to.not.exist;
        assertNoUnconfirmedTxs(res.body.transactions);
        done();
      } catch (err) {
        done(err);
      }
    });
  });

  it('should return unconfirmed tx first when sorted by height:desc', (done) => {
    getTransactions('returnUnconfirmed=1&orderBy=height:desc', (err, res) => {
      try {
        node.expect(err).to.not.exist;
        node.expect(res.body.transactions[0].id).to.equal(lastUnconfirmedTransactionId);
        done();
      } catch (err) {
        done(err);
      }
    });
  });

  it('should return unconfirmed tx first when sorted by height:desc and filtered by senderId', (done) => {
    getTransactions(`returnUnconfirmed=1&orderBy=height:desc&senderId=${node.iAccount.address}`, (err, res) => {
      try {
        node.expect(err).to.not.exist;
        node.expect(res.body.transactions[0].id).to.equal(lastUnconfirmedTransactionId);
        done();
      } catch (err) {
        done(err);
      }
    });
  });

  it('should sort all txs by timestamp desc by default', (done) => {
    node.onNewBlock(async () => {
      const txData = {
        secret: node.iAccount.password,
        recipientId: recipient.address,
        amount: node.fees.transactionFee + 1,
      };

      try {
        await sendADMasync(txData);

        txData.amount = txData.amount + 1;
        const res = await sendADMasync(txData);

        lastUnconfirmedTransactionId = res.body.transactionId;

        await delay(1000);

        getTransactions(`returnUnconfirmed=1&recipientId=${recipient.address}`, (err, res) => {
          if (err) return done(err);
          const actual = res.body.transactions;
          const expected = [...actual].sort((a, b) => b.timestamp - a.timestamp);
          node.expect(actual).to.eql(expected);
          done();
        });
      } catch (err) {
        done(err);
      }
    });
  });

  it('should sort all txs by timestamp asc when requested', (done) => {
    getTransactions(`returnUnconfirmed=1&recipientId=${recipient.address}&orderBy=timestamp:asc`, (err, res) => {
      if (err) return done(err);
      const actual = res.body.transactions;
      const expected = [...actual].sort((a, b) => a.timestamp - b.timestamp);
      node.expect(actual).to.eql(expected);
      done();
    });
  });

  it('should sort all txs by timestamp asc when requested', (done) => {
    getTransactions(`returnUnconfirmed=1&recipientId=${recipient.address}&orderBy=timestamp:asc`, (err, res) => {
      if (err) return done(err);
      const actual = res.body.transactions;
      const expected = [...actual].sort((a, b) => a.timestamp - b.timestamp);
      node.expect(actual).to.eql(expected);
      done();
    });
  });

  it('should apply limit=1 and offset=2 correctly with orderBy=amount:desc (should return a confirmed tx)', (done) => {
    const query = `returnUnconfirmed=1&recipientId=${recipient.address}&orderBy=amount:desc&limit=1&offset=2`;

    getTransactions(query, (err, res) => {
      try {
        node.expect(err).to.not.exist;

        const { transactions } = res.body;
        node.expect(transactions).to.be.an('array').with.lengthOf(1);

        node.expect(transactions[0].confirmations).to.be.greaterThan(0);

        done();
      } catch (err) {
        done(err);
      }
    });
  });

  it('should apply limit=1 and offset=2 correctly with orderBy=amount:asc (should return the latest sent tx)', (done) => {
    const query = `returnUnconfirmed=1&recipientId=${recipient.address}&orderBy=amount:asc&limit=1&offset=2`;

    getTransactions(query, (err, res) => {
      try {
        node.expect(err).to.not.exist;

        const { transactions } = res.body;
        node.expect(transactions).to.be.an('array').with.lengthOf(1);

        node.expect(transactions[0].id).to.equal(lastUnconfirmedTransactionId);

        done();
      } catch (err) {
        done(err);
      }
    });
  });

  it('should return null for blockId and height, and 0 confirmations for unconfirmed transactions', (done) => {
    getTransactions('returnUnconfirmed=1', (err, res) => {
      try {
        node.expect(err).to.not.exist;

        const { transactions } = res.body;
        node.expect(transactions).to.be.an('array').that.is.not.empty;

        const hasUnconfirmedTx = transactions.some((tx) =>
          tx.blockId === null &&
          tx.height === null &&
          tx.confirmations === 0
        );

        node.expect(hasUnconfirmedTx).to.be.true;

        done();
      } catch (err) {
        done(err);
      }
    });
  });
});

describe('GET /api/transactions/unconfirmed', () => {
  let unconfirmedTransactionId;

  before(async () => {
    const data = {
      secret: node.iAccount.password,
      recipientId: recipient.address,
      amount: node.fees.transactionFee,
    };

    const res = await sendADMasync(data);
    unconfirmedTransactionId = res.body.transactionId;
    await delay(1000);
  });

  it('should return null for blockId and height, and 0 confirmations for all transactions', (done) => {
    node.get('/api/transactions/unconfirmed', (err, res) => {
      if (err) {
        return done(err);
      }

      try {
        const { transactions } = res.body;

        node.expect(transactions).to.be.an('array').that.is.not.empty;
        const allUnconfirmed = transactions.every(tx =>
          tx.blockId === null &&
          tx.height === null &&
          tx.confirmations === 0
        );

        node.expect(allUnconfirmed).to.be.true;

        done();
      } catch (err) {
        done(err);
      }
    });
  });

  it('/get should return unconfirmed transaction with null for blockId and height, and 0 confirmations properties', (done) => {
    node.get(`/api/transactions/unconfirmed/get?id=${unconfirmedTransactionId}`, (err, res) => {
      if (err) {
        return done(err);
      }

      try {
        const { transaction } = res.body;

        node.expect(transaction.id).to.equal(unconfirmedTransactionId);
        node.expect(transaction.blockId).to.be.null;
        node.expect(transaction.height).to.be.null;
        node.expect(transaction.confirmations).to.equal(0);

        done();
      } catch (err) {
        done(err);
      }
    });
  });
});
