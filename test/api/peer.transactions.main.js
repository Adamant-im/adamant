'use strict';

var crypto = require('crypto');
var node = require('./../node.js');

var genesisblock = require('../../test/genesisBlock.json'); // use testnet genesisBlock

function postTransaction (transaction, done) {
  node.post('/peer/transactions', {
    transaction: transaction
  }, done);
}

function getAddress (address, done) {
  node.get('/api/accounts?address=' + address, done);
}

describe('GET /peer/transactions', function () {
  it('using incorrect nethash in headers should fail', function (done) {
    node.get('/peer/transactions')
        .set('nethash', 'incorrect')
        .end(function (err, res) {
          node.debug('> Response:'.grey, JSON.stringify(res.body));
          node.expect(res.body).to.have.property('success').to.be.false;
          node.expect(res.body.expected).to.equal(node.config.nethash);
          done();
        });
  });

  it('using incompatible version in headers should fail', function (done) {
    node.get('/peer/transactions')
        .set('version', '0.1.0')
        .end(function (err, res) {
          node.debug('> Response:'.grey, JSON.stringify(res.body));
          node.expect(res.body).to.have.property('success').to.be.false;
          node.expect(res.body).to.have.property('message').to.eql('Request is made from incompatible version');
          node.expect(res.body).to.have.property('expected').to.eql('>=0.6.0');
          node.expect(res.body).to.have.property('received').to.eql('0.1.0');
          done();
        });
  });

  it('using valid headers should be ok', function (done) {
    node.get('/peer/transactions')
        .end(function (err, res) {
          node.expect(res.body).to.have.property('success').to.be.true;
          node.expect(res.body).to.have.property('transactions').to.be.an('array');
          done();
        });
  });
});

describe('POST /peer/transactions', function () {
  it('using incorrect nethash in headers should fail', function (done) {
    node.post('/peer/transactions')
        .set('nethash', 'incorrect')
        .end(function (err, res) {
          node.debug('> Response:'.grey, JSON.stringify(res.body));
          node.expect(res.body).to.have.property('success').to.be.false;
          node.expect(res.body.expected).to.equal(node.config.nethash);
          done();
        });
  });

  it('using incompatible version in headers should fail', function (done) {
    node.post('/peer/transactions')
        .set('version', '0.1.0')
        .end(function (err, res) {
          node.debug('> Response:'.grey, JSON.stringify(res.body));
          node.expect(res.body).to.have.property('success').to.be.false;
          node.expect(res.body).to.have.property('message').to.eql('Request is made from incompatible version');
          node.expect(res.body).to.have.property('expected').to.eql('>=0.6.0');
          node.expect(res.body).to.have.property('received').to.eql('0.1.0');
          done();
        });
  });

  it('using valid headers should be ok', function (done) {
    var account = node.randomAccount();
    // let transaction = node.createSignatureTransaction({
    //   keyPair: account.keypair
    // });
    var transaction = node.createSendTransaction({
      keyPair: node.iAccount.keypair,
      amount: 1,
      recipientId: account.address
    });

    postTransaction(transaction, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('transactionId').to.equal(transaction.id);
      done();
    });
  });

  it('using already processed transaction should fail', function (done) {
    var account = node.randomAccount();
    var transaction = node.createSendTransaction({
      keyPair: node.iAccount.keypair,
      amount: 1,
      recipientId: account.address
    });

    postTransaction(transaction, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('transactionId').to.equal(transaction.id);

      postTransaction(transaction, function (err, res) {
        node.expect(res.body).to.have.property('success').to.be.false;
        node.expect(res.body).to.have.property('message').to.match(/Transaction is already processed: [0-9]+/);
        done();
      });
    });
  });

  it('using already confirmed transaction should fail', function (done) {
    var account = node.randomAccount();
    var transaction = node.createSendTransaction({
      keyPair: node.iAccount.keypair,
      amount: 1,
      recipientId: account.address
    });

    postTransaction(transaction, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('transactionId').to.equal(transaction.id);

      node.onNewBlock(function (err) {
        postTransaction(transaction, function (err, res) {
          node.expect(res.body).to.have.property('success').to.be.false;
          node.expect(res.body).to.have.property('message').to.match(/Transaction is already /);
          done();
        });
      });
    });
  });

  it('using varying recipientId casing should go to same address', function (done) {
    var account = node.randomAccount();
    var transaction = node.createSendTransaction({
      keyPair: node.iAccount.keypair,
      amount: 100000000,
      recipientId: account.address.toUpperCase()
    });
    postTransaction(transaction, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;

      node.onNewBlock(function (err) {
        var transaction2 = node.createSendTransaction({
          keyPair: node.iAccount.keypair,
          amount: 100000000,
          recipientId: account.address.toLowerCase()
        });
        postTransaction(transaction2, function (err, res) {
          node.expect(res.body).to.have.property('success').to.be.true;

          node.onNewBlock(function (err) {
            getAddress(account.address, function (err, res) {
              node.expect(res.body).to.have.property('success').to.be.true;
              node.expect(res.body).to.have.property('account').that.is.an('object');
              node.expect(res.body.account).to.have.property('balance').to.equal('200000000');
              done();
            });
          });
        });
      });
    });
  });

  it('using transaction with undefined recipientId should fail', function (done) {
    var transaction = node.createSendTransaction({
      keyPair: node.iAccount.keypair,
      amount: 1,
      recipientId: undefined
    });

    postTransaction(transaction, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('message').to.eql('Missing recipient');
      done();
    });
  });

  it('using transaction with invalid recipientId should fail', function (done) {
    var transaction = node.createSendTransaction({
      keyPair: node.iAccount.keypair,
      amount: 1,
      recipientId: 'U0123456789001234567890'
    });

    postTransaction(transaction, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('message').to.contain('Invalid transaction body');
      done();
    });
  });

  it('using transaction with negative amount should fail', function (done) {
    var account = node.randomAccount();
    var transaction = node.createSendTransaction({
      keyPair: node.iAccount.keypair,
      amount: -1,
      recipientId: account.address
    });

    postTransaction(transaction, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('message');
      done();
    });
  });

  it('using invalid passphrase should fail', function (done) {
    var transaction = node.createSendTransaction({
      keyPair: node.iAccount.keypair,
      amount: 1,
      recipientId: 'U123'
    });
    transaction.recipientId = 'U1234';
    transaction.id = node.getId(transaction);

    postTransaction(transaction, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('message');
      done();
    });
  });

  it('when sender has no funds should fail', function (done) {
    var account = node.randomAccount();
    var transaction = node.createSendTransaction({
      keyPair: account.keypair,
      amount: 1,
      recipientId: node.randomAccount().address
    });

    postTransaction(transaction, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('message').to.match(/Account does not have enough ADM: U[0-9]+ balance: 0/);
      done();
    });
  });

  it('when sender does not have enough funds should always fail', function (done) {
    var account = node.randomAccount();
    var transaction = node.createSendTransaction({
      keyPair: node.iAccount.keypair,
      amount: 1,
      recipientId: account.address
    });

    postTransaction(transaction, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('transactionId').to.equal(transaction.id);

      node.onNewBlock(function () {
        var count = 1;
        var transaction2 = node.createSendTransaction({
          keyPair: account.keypair,
          amount: 2,
          recipientId: node.iAccount.address
        });

        node.async.doUntil(function (next) {
          postTransaction(transaction2, function (err, res) {
            node.expect(res.body).to.have.property('success').to.be.false;
            node.expect(res.body).to.have.property('message').to.match(/Account does not have enough ADM/);
            count++;
            return next();
          });
        }, function (testCb) {
          return testCb(null, count === 10);
        }, function () {
          return done();
        });
      });
    });
  });

  it('using fake signature should fail', function (done) {
    var account = node.randomAccount();
    var transaction = node.createSendTransaction({
      keyPair: node.iAccount.keypair,
      amount: 1,
      recipientId: account.address
    });
    transaction.signature = crypto.randomBytes(64).toString('hex');
    transaction.id = node.getId(transaction);

    postTransaction(transaction, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('message');
      done();
    });
  });

  it('using invalid publicKey should fail', function (done) {
    var account = node.randomAccount();
    var transaction = node.createSendTransaction({
      keyPair: node.iAccount.keypair,
      amount: 1,
      recipientId: account.address
    });
    transaction.senderPublicKey = node.randomAccount().publicKeyHex;

    postTransaction(transaction, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('message');
      done();
    });
  });

  it('using invalid signature should fail', function (done) {
    var account = node.randomAccount();
    var transaction = node.createSendTransaction({
      keyPair: node.iAccount.keypair,
      amount: 1,
      recipientId: account.address
    });
    transaction.signature = node.randomAccount().password;

    postTransaction(transaction, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('message');
      done();
    });
  });

  it('using very large amount and genesis block id should fail', function (done) {
    var account = node.randomAccount();
    var transaction = node.createSendTransaction({
      keyPair: node.iAccount.keypair,
      amount: 10000000000000000,
      recipientId: account.address
    });
    transaction.blockId = genesisblock.id;

    postTransaction(transaction, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('message');
      done();
    });
  });

  it('using overflown amount should fail', function (done) {
    var account = node.randomAccount();
    var transaction = node.createSendTransaction({
      keyPair: node.iAccount.keypair,
      amount: 184819291270000000012910218291201281920128129,
      recipientId: account.address
    });

    postTransaction(transaction, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('message');
      done();
    });
  });

  it('using float amount should fail', function (done) {
    var account = node.randomAccount();
    var transaction = node.createSendTransaction({
      keyPair: node.iAccount.keypair,
      amount: 1.3,
      recipientId: account.address
    });

    postTransaction(transaction, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('message');
      done();
    });
  });

  describe('from the genesis account', function () {
    var account = node.randomAccount();
    var transaction = node.createSendTransaction({
      keyPair: node.gAccount.keypair,
      amount: 1000,
      recipientId: account.address
    });

    it('should fail', function (done) {
      postTransaction(transaction, function (err, res) {
        node.expect(res.body).to.have.property('success').to.be.false;
        node.expect(res.body).to.have.property('message').equals('Invalid sender. Can not send from genesis account');
        done();
      });
    });
  });

  // describe('using multiple transactions', function () {
  //   it('with invalid transaction should fail');

  //   it('with valid transaction should be ok');
  // });
});
