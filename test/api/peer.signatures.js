'use strict';

var node = require('./../node.js');
var packageJSON = require('./../../package.json');

var owner = node.randomAccount();
var coSigner1 = node.randomAccount();
var coSigner2 = node.randomAccount();

function postTransaction (transaction, done) {
  node.post('/peer/transactions', {
    transaction: transaction
  }, done);
}

function postTransactions (transactions, done) {
  node.post('/peer/transactions', {
    transactions: transactions
  }, done);
}

function postSignature (transaction, signature, done) {
  node.post('/peer/signatures', {
    signature: {
      transaction: transaction.id,
      signature: signature
    }
  }, done);
}

describe('GET /peer/signatures', function () {
  it('using incorrect nethash in headers should fail', function (done) {
    node.get('/peer/signatures')
        .set('nethash', 'incorrect')
        .end(function (err, res) {
          node.debug('> Response:'.grey, JSON.stringify(res.body));
          node.expect(res.body).to.have.property('success').to.be.false;
          node.expect(res.body.expected).to.equal(node.config.nethash);
          done();
        });
  });

  it('using incompatible version in headers should fail', function (done) {
    node.get('/peer/signatures')
        .set('version', '0.1.0')
        .end(function (err, res) {
          node.debug('> Response:'.grey, JSON.stringify(res.body));
          node.expect(res.body).to.have.property('success').to.be.false;
          node.expect(res.body).to.have.property('message').to.eql('Request is made from incompatible version');
          node.expect(res.body).to.have.property('expected').to.eql(packageJSON.config.minVersion);
          node.expect(res.body).to.have.property('received').to.eql('0.1.0');
          done();
        });
  });

  it('using valid headers should be ok', function (done) {
    node.get('/peer/signatures')
        .end(function (err, res) {
          node.debug('> Response:'.grey, JSON.stringify(res.body));
          node.expect(res.body).to.have.property('success').to.be.true;
          node.expect(res.body).to.have.property('signatures').that.is.an('array');
          done();
        });
  });
});

describe('POST /peer/signatures', function () {
  var validParams;

  var randomAccount = node.randomAccount();
  var transaction = node.createSendTransaction({
    keyPair: node.iAccount.keypair,
    amount: 1,
    recipientId: randomAccount.address
  });

  beforeEach(function (done) {
    validParams = {
      signature: {
        signature: transaction.signature,
        transaction: transaction.id
      }
    };
    done();
  });

  it('using incorrect nethash in headers should fail', function (done) {
    node.post('/peer/signatures')
        .set('nethash', 'incorrect')
        .end(function (err, res) {
          node.debug('> Response:'.grey, JSON.stringify(res.body));
          node.expect(res.body).to.have.property('success').to.be.false;
          node.expect(res.body.expected).to.equal(node.config.nethash);
          done();
        });
  });

  it('using incompatible version in headers should fail', function (done) {
    node.post('/peer/signatures')
        .set('version', '0.1.0')
        .end(function (err, res) {
          node.debug('> Response:'.grey, JSON.stringify(res.body));
          node.expect(res.body).to.have.property('success').to.be.false;
          node.expect(res.body).to.have.property('message').to.eql('Request is made from incompatible version');
          node.expect(res.body).to.have.property('expected').to.eql(packageJSON.config.minVersion);
          node.expect(res.body).to.have.property('received').to.eql('0.1.0');
          done();
        });
  });

  it('using invalid signature schema should fail', function (done) {
    delete validParams.signature.transaction;

    node.post('/peer/signatures', validParams)
        .end(function (err, res) {
          node.debug('> Response:'.grey, JSON.stringify(res.body));
          node.expect(res.body).to.have.property('success').to.be.false;
          node.expect(res.body).to.have.property('message').to.equal('Invalid signature body');
          done();
        });
  });

  it('using unprocessable signature should fail', function (done) {
    validParams.signature.transaction = '1';

    node.post('/peer/signatures', validParams)
        .end(function (err, res) {
          node.debug('> Response:'.grey, JSON.stringify(res.body));
          node.expect(res.body).to.have.property('success').to.be.false;
          node.expect(res.body).to.have.property('message').to.equal('Error processing signature: Transaction not found');
          done();
        });
  });

  // Don't check /peer/signatures
  // it('using processable signature should be ok', function (done) {
  //   postTransaction(transaction, function (err, res) {
  //     node.expect(res.body).to.have.property('success').to.be.true;
  //     node.onNewBlock(function (err) {
  //       node.post('/peer/signatures', validParams)
  //       .end(function (err, res) {
  //         node.debug('> Response:'.grey, JSON.stringify(res.body));
  //         node.expect(res.body).to.have.property('success').to.be.true;
  //         done();
  //       });
  //     });
  //   });
  // });

  // Multisignatures tests are disabled currently

  /*
  describe('creating a new multisignature account', function () {

    var transaction;

    // Fund accounts
    before(function (done) {
      var transactions = [];

      node.async.eachSeries([owner, coSigner1, coSigner2], function (account, eachSeriesCb) {
        transactions.push(
          node.createSendTransaction({
            keyPair: node.gAccount.keypair,
            amount: 1,
            recipientId: account.address
          })
        );
        eachSeriesCb();
      }, function (err) {
        postTransactions(transactions, function (err, res) {
          node.expect(res.body).to.have.property('success').to.be.true;
          node.onNewBlock(function (err) {
            done();
          });
        });
      });
    });

    // Create multisignature group
    before(function (done) {
      var keysgroup = ['+' + coSigner1.publicKey, '+' + coSigner2.publicKey];
      var lifetime = 72;
      var min = 2;

      transaction = node.lisk.multisignature.createMultisignature(owner.password, null, keysgroup, lifetime, min);

      postTransactions([transaction], function (err, res) {
        node.expect(res.body).to.have.property('success').to.be.true;
        node.onNewBlock(function (err) {
          done();
        });
      });
    });

    it('using processable signature for owner should fail', function (done) {
      var signature = node.lisk.multisignature.signTransaction(transaction, owner.password);

      postSignature(transaction, signature, function (err, res) {
        node.expect(res.body).to.have.property('success').to.be.false;
        node.expect(res.body).to.have.property('message').to.equal('Error processing signature: Failed to verify signature');
        done();
      });
    });

    it('using processable signature for coSigner1 should be ok', function (done) {
      var signature = node.lisk.multisignature.signTransaction(transaction, coSigner1.password);

      postSignature(transaction, signature, function (err, res) {
        node.expect(res.body).to.have.property('success').to.be.true;
        done();
      });
    });

    it('using processable signature for coSigner1 should not confirm the transaction', function (done) {
      node.onNewBlock(function (err) {
        node.onNewBlock(function (err) {
          node.get('/api/transactions/get?id=' + transaction.id, function (err, res) {
            node.expect(res.body).to.have.property('success').to.be.false;
            done();
          });
        });
      });
    });

    it('using processable signature for coSigner2 should be ok', function (done) {
      var signature = node.lisk.multisignature.signTransaction(transaction, coSigner2.password);

      postSignature(transaction, signature, function (err, res) {
        node.expect(res.body).to.have.property('success').to.be.true;
        done();
      });
    });

    it('using processable signature for coSigner2 should confirm the transaction', function (done) {
      node.onNewBlock(function (err) {
        node.get('/api/transactions/get?id=' + transaction.id, function (err, res) {
          node.expect(res.body).to.have.property('success').to.be.true;
          node.expect(res.body).to.have.property('transaction');
          node.expect(res.body.transaction).to.have.property('id').to.equal(transaction.id);
          done();
        });
      });
    });
  });

  describe('sending transaction from multisignature account', function () {

    var transaction;

    before(function (done) {
      node.onNewBlock(done);
    });

    // Send transaction
    before(function (done) {
      transaction = node.lisk.multisignature.createTransaction('1L', 1, owner.password);

      postTransaction(transaction, function (err, res) {
        node.expect(res.body).to.have.property('success').to.be.true;
        node.onNewBlock(function (err) {
          done();
        });
      });
    });

    it('using processable signature for coSigner1 should be ok', function (done) {
      var signature = node.lisk.multisignature.signTransaction(transaction, coSigner1.password);

      postSignature(transaction, signature, function (err, res) {
        node.expect(res.body).to.have.property('success').to.be.true;
        done();
      });
    });

    it('using processable signature for coSigner1 should not confirm the transaction', function (done) {
      node.onNewBlock(function (err) {
        node.onNewBlock(function (err) {
          node.get('/api/transactions/get?id=' + transaction.id, function (err, res) {
            node.expect(res.body).to.have.property('success').to.be.false;
            done();
          });
        });
      });
    });

    it('using processable signature for coSigner2 should be ok', function (done) {
      var signature = node.lisk.multisignature.signTransaction(transaction, coSigner2.password);

      postSignature(transaction, signature, function (err, res) {
        node.expect(res.body).to.have.property('success').to.be.true;
        done();
      });
    });

    it('using processable signature for coSigner2 should confirm the transaction', function (done) {
      node.onNewBlock(function (err) {
        node.get('/api/transactions/get?id=' + transaction.id, function (err, res) {
          node.expect(res.body).to.have.property('success').to.be.true;
          node.expect(res.body).to.have.property('transaction');
          node.expect(res.body.transaction).to.have.property('id').to.equal(transaction.id);
          done();
        });
      });
    });
  });

  describe('using multiple signatures', function () {
    it('with unprocessable signature should fail');

    it('with processable signature should be ok');
  });
  */
});
