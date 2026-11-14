const { expect } = require('chai');
const node = require('../node.js');
const { sendADM } = require('../common/api.js');

function getStates (senderId, options, done) {
  const params = {
    senderId,
    ...options
  };

  const args = Object.keys(params).map((key) => `${key}=${params[key]}`);
  node.get(`/api/states/get?${args.join('&')}`, done);
}

function storeState (params, done) {
  node.post('/api/states/store', params, done);
}

describe('GET /api/states/get', () => {
  const testAccount = node.randomAccount();

  before((done) => {
    sendADM({
      secret: node.iAccount.password,
      amount: node.fees.stateFee * 2,
      recipientId: testAccount.address
    }, () => {
      done();
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
      keyPair: testAccount.keypair
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

  it('should only return confirmed transaction with limit 1 and order by timestamp', (done) => {
    const stateTransaction = node.createStateTransaction({
      key: 'anotherkey',
      value: 'testvalue',
      keyPair: testAccount.keypair
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
});

describe('GET /api/states/get filters', () => {
  const testAccount = node.randomAccount();
  const alphaKey = 'alpha';
  const betaKey = 'beta';
  let confirmed = [];

  function query (params, done) {
    const search = Object.keys(params).map((key) => `${key}=${encodeURIComponent(params[key])}`).join('&');
    node.get(`/api/states/get?${search}`, done);
  }

  function idsOf (body) {
    return body.transactions.map((transaction) => transaction.id).sort();
  }

  before((done) => {
    sendADM({
      secret: node.iAccount.password,
      amount: node.fees.stateFee * 2,
      recipientId: testAccount.address
    }, () => done());
  });

  before((done) => {
    node.onNewBlock(() => done());
  });

  before((done) => {
    const alpha = node.createStateTransaction({
      key: alphaKey,
      value: 'alpha-value',
      keyPair: testAccount.keypair
    });
    const beta = node.createStateTransaction({
      key: betaKey,
      value: 'beta-value',
      keyPair: testAccount.keypair
    });

    storeState({ transaction: alpha }, (err, res) => {
      expect(res.body).to.have.property('success').that.is.true;
      storeState({ transaction: beta }, (betaErr, betaRes) => {
        expect(betaRes.body).to.have.property('success').that.is.true;
        node.onNewBlock(() => done());
      });
    });
  });

  before((done) => {
    query({ senderId: testAccount.address, orderBy: 'timestamp:asc' }, (err, res) => {
      expect(res.body).to.have.property('success').that.is.true;
      confirmed = res.body.transactions;
      expect(confirmed).to.have.lengthOf(2);
      done();
    });
  });

  it('should keep plain senderId and key filters', (done) => {
    query({ senderId: testAccount.address, key: alphaKey }, (err, res) => {
      expect(res.body).to.have.property('success').that.is.true;
      expect(res.body.transactions).to.have.lengthOf(1);
      expect(res.body.count).to.equal(1);
      expect(res.body.transactions[0].asset.state.key).to.equal(alphaKey);
      done();
    });
  });

  it('should apply and: filters to the same rows as plain filters', (done) => {
    query({ senderId: testAccount.address, key: alphaKey }, (err, plain) => {
      query({
        'and:senderId': testAccount.address,
        'and:key': alphaKey
      }, (prefixedErr, prefixed) => {
        expect(prefixed.body).to.have.property('success').that.is.true;
        expect(idsOf(prefixed.body)).to.deep.equal(idsOf(plain.body));
        expect(prefixed.body.count).to.equal(1);
        done();
      });
    });
  });

  it('should accept and: filters on POST /api/states/get', (done) => {
    node.post('/api/states/get', {
      'and:senderId': testAccount.address,
      'and:key': betaKey
    }, (err, res) => {
      expect(res.body).to.have.property('success').that.is.true;
      expect(res.body.transactions).to.have.lengthOf(1);
      expect(res.body.transactions[0].asset.state.key).to.equal(betaKey);
      done();
    });
  });

  it('should filter by keyIds, including keys that are not addresses', (done) => {
    query({
      senderId: testAccount.address,
      keyIds: `eth:address,${alphaKey}`
    }, (err, res) => {
      expect(res.body).to.have.property('success').that.is.true;
      expect(res.body.transactions).to.have.lengthOf(1);
      expect(res.body.transactions[0].asset.state.key).to.equal(alphaKey);
      done();
    });
  });

  it('should apply toHeight and keep fromHeight exclusive of the lower bound', (done) => {
    const heights = confirmed.map((transaction) => transaction.height);
    const minHeight = Math.min(...heights);
    const maxHeight = Math.max(...heights);
    expect(minHeight).to.be.above(1);

    query({
      senderId: testAccount.address,
      toHeight: maxHeight
    }, (err, included) => {
      expect(included.body).to.have.property('success').that.is.true;
      expect(idsOf(included.body)).to.deep.equal(idsOf({ transactions: confirmed }));

      query({
        senderId: testAccount.address,
        'and:toHeight': minHeight - 1
      }, (excludeErr, excluded) => {
        expect(excluded.body).to.have.property('success').that.is.true;
        expect(excluded.body.count).to.equal(0);

        query({
          senderId: testAccount.address,
          fromHeight: maxHeight
        }, (fromErr, fromResponse) => {
          expect(fromResponse.body).to.have.property('success').that.is.true;
          expect(fromResponse.body.count).to.equal(0);
          done();
        });
      });
    });
  });

  it('should reject or:, the old keysIds name, and filters the query ignores', (done) => {
    query({ 'or:senderId': testAccount.address }, (err, orResponse) => {
      expect(orResponse.body).to.have.property('success').that.is.false;
      expect(orResponse.body.error).to.equal('OR filters are not supported');

      query({ keysIds: alphaKey }, (keysErr, keysResponse) => {
        expect(keysResponse.body).to.have.property('success').that.is.false;
        expect(keysResponse.body.error).to.equal('Parameter is not supported: keysIds');

        query({
          senderId: testAccount.address,
          blockId: '1'
        }, (blockErr, blockResponse) => {
          expect(blockResponse.body).to.have.property('success').that.is.false;
          expect(blockResponse.body.error).to.equal('Parameter is not supported: blockId');

          query({
            'and:fromTimestamp': 0,
            senderId: testAccount.address
          }, (timeErr, timeResponse) => {
            expect(timeResponse.body).to.have.property('success').that.is.false;
            expect(timeResponse.body.error).to.equal('Parameter is not supported: fromTimestamp');
            done();
          });
        });
      });
    });
  });

  it('should reject a keyIds entry that is longer than a KVS key', (done) => {
    query({
      senderId: testAccount.address,
      keyIds: 'this-key-is-way-too-long'
    }, (err, res) => {
      expect(res.body).to.have.property('success').that.is.false;
      expect(res.body.error).to.be.a('string');
      done();
    });
  });
});
