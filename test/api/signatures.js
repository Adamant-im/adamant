'use strict';

var node = require('./../node.js');

var account = node.randomTxAccount();
var account2 = node.randomTxAccount();
var account3 = node.randomTxAccount();

function putSignature (params, done) {
  node.put('/api/signatures', params, done);
}

function putTransaction (params, done) {
  node.put('/api/transactions', params, done);
}

function putDelegate (params, done) {
  node.put('/api/delegates', params, done);
}

function sendADM (account, done) {
  var randomADM = node.randomADM();
  var expectedFee = node.expectedFee(randomADM);

  putTransaction({
    secret: node.iAccount.password,
    amount: randomADM,
    recipientId: account.address
  }, function (err, res) {
    node.expect(res.body).to.have.property('success').to.be.true;
    done(err, res);
  });
}

before(function (done) {
  setTimeout(function () {
    sendADM(account, done);
  }, 2000);
});

before(function (done) {
  setTimeout(function () {
    sendADM(account2, done);
  }, 2000);

  describe('PUT /api/transactions from account with second signature enabled', function () {
    before(function (done) {
      node.onNewBlock(done);
    });

    var validParams;

    beforeEach(function (done) {
      validParams = {
        secret: account.password,
        secondSecret: account.password,
        recipientId: account2.address,
        amount: 100000000
      };
      done();
    });

    it('using no second passphase should fail', function (done) {
      delete validParams.secondSecret;

      putTransaction(validParams, function (err, res) {
        node.expect(res.body).to.have.property('success').to.be.false;
        node.expect(res.body).to.have.property('error');
        done();
      });
    });

    it('using second passphase but no primary passphase should fail', function (done) {
      delete validParams.secret;

      putTransaction(validParams, function (err, res) {
        node.expect(res.body).to.have.property('success').to.be.false;
        node.expect(res.body).to.have.property('error');
        done();
      });
    });
  });
});

describe('PUT /api/signatures', function () {
  before(function (done) {
    node.onNewBlock(done);
  });

  var validParams;

  beforeEach(function (done) {
    validParams = {
      secret: account.password,
      secondSecret: account.secondPassword
    };
    done();
  });

  it('when account has no funds should fail', function (done) {
    validParams.secret = account3.password;
    validParams.secondSecret = account3.password;

    putSignature(validParams, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error').to.match(/Account does not have enough ADM: U[0-9]+ balance: 0/);
      done();
    });
  });

  it('using invalid passphrase should fail', function (done) {
    validParams.secret = 'invalid';

    putSignature(validParams, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error').to.match(/API error: Mnemonic string is invalid: invalid/);
      done();
    });
  });

  it('using no second passphrase should fail', function (done) {
    delete validParams.secondSecret;

    putSignature(validParams, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error').to.match(/Missing required property: secondSecret/);
      done();
    });
  });

  it('using valid parameters should be ok', function (done) {
    putSignature(validParams, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('transaction').that.is.an('object');
      node.expect(res.body.transaction).to.have.property('type').to.equal(node.txTypes.SIGNATURE);
      node.expect(res.body.transaction).to.have.property('senderPublicKey').to.equal(account.publicKeyHex);
      node.expect(res.body.transaction).to.have.property('senderId').to.equal(account.address);
      node.expect(res.body.transaction).to.have.property('fee').to.equal(node.fees.secondPasswordFee);
      done();
    });
  });
});

describe('PUT /api/delegates from account with second signature enabled', function () {
  var validParams;

  beforeEach(function (done) {
    validParams = {
      secret: account.password,
      secondSecret: account.password,
      username: account.delegateName
    };
    done();
  });

  it('using no second passphase should fail', function (done) {
    delete validParams.secondSecret;

    putDelegate(validParams, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error');
      done();
    });
  });
});
