const { expect } = require('chai');
const node = require('../node.js');

function getStates(senderId, options, done) {
  const params = {
    senderId,
    ...options,
  };

  const args = Object.keys(params).map((key) => `${key}=${params[key]}`);
  node.get(`/api/states/get?${args.join('&')}`, done);
}

function storeState(params, done) {
  node.post('/api/states/store', params, done);
}

function sendADM(params, done) {
  node.put('/api/transactions/', params, done);
}

describe('GET /api/states/get', () => {
  const testAccount = node.randomAccount();

  before((done) => {
    sendADM({
      secret: node.iAccount.password,
      amount: node.fees.stateFee * 2,
      recipientId: testAccount.address,
    }, () => {
      done()
    });
  });

  before(function (done) {
    node.onNewBlock(function () {
      done();
    });
  });

  before((done) => {
    const stateTransaction = node.createStateTransaction({
      key: 'testkey',
      value: 'testvalue',
      keyPair: testAccount.keypair,
    });

    storeState({ transaction: stateTransaction }, (err, res) => {
      expect(err).to.not.exist;
      expect(res.body).to.have.property('success').that.is.true;

      // wait a second for node to process the transaction
      setTimeout(() => done(), 1000);
    });
  });

  it('should NOT return unconfirmed transactions by default', (done) => {
    getStates(testAccount.address, {}, (err, res) => {
      expect(err).to.not.exist;
      expect(res.body).
        to.have.property('transactions').
        that.is.an('array');

      const { transactions } = res.body;
      transactions.forEach((transaction) => {
        expect(transaction).to.have.property('confirmations').that.is.a('number');
      });

      done();
    });
  });

  it('should return unconfirmed transaction with ?returnUnconfirmed=1 flag', (done) => {
    getStates(testAccount.address, { returnUnconfirmed: 1 }, (err, res) => {
      expect(err).to.not.exist;
      expect(res.body).to.have.property('transactions').that.is.an('array').that.is.not.empty
      const includesUnconfirmedTransactions = res.body.transactions.some((transaction) => {
        return !('confirmations' in transaction);
      });

      expect(includesUnconfirmedTransactions).to.be.true;

      node.onNewBlock(() => {
        done();
      });
    });
  });

  it('should only return confirmed transaction with limit 1 and order by timestamp', (done) => {
    const stateTransaction = node.createStateTransaction({
      key: 'anotherkey',
      value: 'testvalue',
      keyPair: testAccount.keypair,
    });

    storeState({ transaction: stateTransaction }, (err, res) => {
      expect(err).to.not.exist;
      expect(res.body).to.have.property('success').that.is.true;

      setTimeout(() => {
        getStates(testAccount.address, { orderBy: 'timestamp:asc', limit: 1, returnUnconfirmed: 1 }, (err, res) => {
          expect(err).to.not.exist;
          expect(res.body).to.have.property('transactions').that.is.an('array').that.has.lengthOf(1);
          expect(res.body.transactions[0]).to.have.property('confirmations');

          done();
        });
      }, 1000);
    });
  });
})
