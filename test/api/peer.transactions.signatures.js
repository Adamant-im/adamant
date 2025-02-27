'use strict';

var crypto = require('crypto');
var node = require('./../node.js');

var account = node.randomAccount();
var account2 = node.randomAccount();

function postTransaction (transaction, done) {
  node.post('/peer/transactions', {
    transaction: transaction
  }, function (err, res) {
    done(err, res);
  });
}

function postSignatureTransaction (transaction, done) {
  node.put('/api/signatures', transaction, function (err, res) {
    done(err, res);
  });
}

function sendADM (params, done) {
  var transaction = node.createSendTransaction({
    keyPair: node.createKeypairFromPassphrase(params.secret),
    amount: params.amount,
    recipientId: params.recipientId
  });

  postTransaction(transaction, function (err, res) {
    node.expect(res.body).to.have.property('success').to.be.true;
    node.onNewBlock(function (err) {
      done(err, res);
    });
  });
}

describe('POST /peer/transactions', function () {
  describe('enabling second signature', function () {
    it('using undefined transaction', function (done) {
      postTransaction(undefined, function (err, res) {
        node.expect(res.body).to.have.property('success').to.be.false;
        node.expect(res.body).to.have.property('message').to.contain('Invalid transaction body');
        done();
      });
    });

    // createSignatureTransaction doesn't work as ADAMANT doesn't use second signatures
    // it('using undefined transaction.asset', function (done) {
    //   var transaction = node.lisk.signature.createSignature(node.randomAccount().password, node.randomAccount().password);

    //   delete transaction.asset;

    //   postTransaction(transaction, function (err, res) {
    //     node.expect(res.body).to.have.property('success').to.be.false;
    //     node.expect(res.body).to.have.property('message').to.contain('Invalid transaction body');
    //     done();
    //   });
    // });

    describe('when account has no funds', function () {
      it('should fail', function (done) {
        var transaction = {
          secret: account.password,
          secondSecret: account.secondPassword
        };

        postSignatureTransaction(transaction, function (err, res) {
          node.expect(res.body).to.have.property('success').to.be.false;
          node.expect(res.body).to.have.property('error').to.match(/Account does not have enough ADM: U[0-9]+ balance: 0/);
          done();
        });
      });
    });

    describe('when account has funds', function () {
      before(function (done) {
        sendADM({
          secret: node.iAccount.password,
          amount: node.fees.secondPasswordFee + 100000000,
          recipientId: account.address
        }, done);
      });

      it('should be ok', function (done) {
        // var transaction = node.createSignatureTransaction({
        //   keyPair: account.keypair,
        //   secondKeypair: account2.keypair,
        //   secret: account.secondPassword,
        //   secondSecret: account.secondPassword
        // });
        var transaction = {
          secret: account.password,
          secondSecret: account.secondPassword
        };

        postSignatureTransaction(transaction, function (err, res) {
          node.expect(res.body).to.have.property('success').to.be.true;
          // node.expect(res.body).to.have.property('transactionId').to.equal(transaction.id);
          done();
        });
      });
    });
  });
});
