'use strict';

var node = require('./../node.js');

var account = node.randomAccount();

describe('POST /api/accounts/open', function () {
  function openAccount (params, done) {
    node.post('/api/accounts/open', params, done);
  }

  it('using known passphrase should be ok', function (done) {
    openAccount({
      secret: node.iAccount.password
    }, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('account').that.is.an('object');
      node.expect(res.body.account).to.have.property('address').to.equal(node.iAccount.address);
      node.expect(res.body.account).to.have.property('unconfirmedBalance').that.is.a('string');
      node.expect(res.body.account).to.have.property('balance').that.is.a('string');
      node.expect(res.body.account).to.have.property('publicKey').to.equal(node.iAccount.publicKey);
      node.expect(res.body.account).to.have.property('unconfirmedSignature').to.equal(0);
      node.expect(res.body.account).to.have.property('secondSignature').to.equal(0);
      node.expect(res.body.account).to.have.property('secondPublicKey').to.equal(null);
      node.expect(res.body.account).to.have.property('multisignatures').to.equal(null);
      node.expect(res.body.account).to.have.property('u_multisignatures').to.equal(null);
      done();
    });
  });

  it('using unknown passphrase should be ok', function (done) {
    var account = node.randomAccount();

    openAccount({
      secret: account.password
    }, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('account').that.is.an('object');
      node.expect(res.body.account).to.have.property('address').to.equal(account.address);
      node.expect(res.body.account).to.have.property('unconfirmedBalance').that.is.a('string');
      node.expect(res.body.account).to.have.property('balance').that.is.a('string');
      node.expect(res.body.account).to.have.property('publicKey').to.equal(account.publicKey.toString('hex'));
      node.expect(res.body.account).to.have.property('unconfirmedSignature').to.equal(0);
      node.expect(res.body.account).to.have.property('secondSignature').to.equal(0);
      node.expect(res.body.account).to.have.property('secondPublicKey').to.equal(null);
      node.expect(res.body.account).to.have.property('multisignatures').to.equal(null);
      node.expect(res.body.account).to.have.property('u_multisignatures').to.equal(null);
      done();
    });
  });

  it('using empty json should fail', function (done) {
    openAccount({}, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error');
      node.expect(res.body.error).to.contain('Missing required property: secret');
      done();
    });
  });

  it('using invalid json should fail', function (done) {
    openAccount('{\'invalid\'}', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error');
      node.expect(res.body.error).to.contain('Missing required property: secret');
      done();
    });
  });

  it('using empty passphrase should fail', function (done) {
    openAccount({
      secret: ''
    }, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error');
      node.expect(res.body.error).to.contain('String is too short (0 chars), minimum 1');
      done();
    });
  });

  it('when payload is over 2Mb should fail', function (done) {
    var data = 'qs';
    for (var i = 0; i < 20; i++) {
      data += data;
    }
    openAccount({
      secret: data
    }, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error').to.equal('API error: request entity too large');
      done();
    });
  });
});

describe('GET /api/accounts/getBalance?address=', function () {
  function getBalance (address, done) {
    node.get('/api/accounts/getBalance?address=' + address, done);
  }

  it('using known address should be ok', function (done) {
    getBalance(node.gAccount.address, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('balance').that.is.a('string');
      node.expect(res.body).to.have.property('unconfirmedBalance').that.is.a('string');
      done();
    });
  });

  it('using unknown address should be ok', function (done) {
    getBalance(account.address, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('balance').that.is.a('string');
      node.expect(res.body).to.have.property('unconfirmedBalance').that.is.a('string');
      done();
    });
  });

  it('using invalid address should fail', function (done) {
    getBalance('thisIsNOTAnAdamantAddress', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error').to.eql('Object didn\'t pass validation for format address: thisIsNOTAnAdamantAddress');
      done();
    });
  });

  it('using empty address should fail', function (done) {
    getBalance('', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error');
      node.expect(res.body.error).to.contain("Object didn't pass validation for format address");
      done();
    });
  });
});

describe('GET /api/accounts/getPublicKey?address=', function () {
  function getPublicKey (address, done) {
    node.get('/api/accounts/getPublicKey?address=' + address, done);
  }

  it('using known address should be ok', function (done) {
    getPublicKey(node.iAccount.address, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('publicKey').to.equal(node.iAccount.publicKey);
      done();
    });
  });

  it('using unknown address should be ok', function (done) {
    getPublicKey(account.address, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error').to.contain('Account not found');
      done();
    });
  });

  it('using invalid address should fail', function (done) {
    getPublicKey('thisIsNOTAnAdamantAddress', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error').to.contain('Object didn\'t pass validation for format address: thisIsNOTAnAdamantAddress');
      done();
    });
  });

  it('using empty address should fail', function (done) {
    getPublicKey('', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error');
      node.expect(res.body.error).to.contain("Object didn't pass validation for format address");
      done();
    });
  });
});

describe('POST /api/accounts/generatePublicKey', function () {
  function generatePublicKey (params, done) {
    node.post('/api/accounts/generatePublicKey', params, done);
  }

  it('using known passphrase should be ok', function (done) {
    generatePublicKey({
      secret: node.iAccount.password
    }, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('publicKey').to.equal(node.iAccount.publicKey);
      done();
    });
  });

  it('using unknown passphrase should be ok', function (done) {
    generatePublicKey({
      secret: account.password
    }, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('publicKey').to.equal(account.publicKey.toString('hex'));
      done();
    });
  });

  it('using empty json should fail', function (done) {
    generatePublicKey({}, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error');
      node.expect(res.body.error).to.contain('Missing required property: secret');
      done();
    });
  });

  it('using invalid json should fail', function (done) {
    generatePublicKey('{\'invalid\'}', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error');
      node.expect(res.body.error).to.contain('Missing required property: secret');
      done();
    });
  });

  it('using empty passphrase should fail', function (done) {
    generatePublicKey({
      secret: ''
    }, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error');
      node.expect(res.body.error).to.contain('String is too short (0 chars), minimum 1');
      done();
    });
  });
});

describe('GET /accounts', function () {
  function getAccounts (params, done) {
    node.get('/api/accounts?' + params, done);
  }

  it('using known address should be ok', function (done) {
    getAccounts('address=' + node.iAccount.address, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('account').that.is.an('object');
      node.expect(res.body.account).to.have.property('address').to.equal(node.iAccount.address);
      node.expect(res.body.account).to.have.property('unconfirmedBalance').that.is.a('string');
      node.expect(res.body.account).to.have.property('balance').that.is.a('string');
      node.expect(res.body.account).to.have.property('publicKey').to.equal(node.iAccount.publicKey);
      node.expect(res.body.account).to.have.property('unconfirmedSignature').to.equal(0);
      node.expect(res.body.account).to.have.property('secondSignature').to.equal(0);
      node.expect(res.body.account).to.have.property('secondPublicKey').to.equal(null);
      node.expect(res.body.account).to.have.property('multisignatures').to.a('array');
      node.expect(res.body.account).to.have.property('u_multisignatures').to.a('array');
      done();
    });
  });

  it('using known address and empty publicKey should be ok', function (done) {
    getAccounts('address=' + node.iAccount.address + '&publicKey=', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('account').that.is.an('object');
      node.expect(res.body.account).to.have.property('address').to.equal(node.iAccount.address);
      node.expect(res.body.account).to.have.property('unconfirmedBalance').that.is.a('string');
      node.expect(res.body.account).to.have.property('balance').that.is.a('string');
      node.expect(res.body.account).to.have.property('publicKey').to.equal(node.iAccount.publicKey);
      node.expect(res.body.account).to.have.property('unconfirmedSignature').to.equal(0);
      node.expect(res.body.account).to.have.property('secondSignature').to.equal(0);
      node.expect(res.body.account).to.have.property('secondPublicKey').to.equal(null);
      node.expect(res.body.account).to.have.property('multisignatures').to.a('array');
      node.expect(res.body.account).to.have.property('u_multisignatures').to.a('array');
      done();
    });
  });

  it('using known lowercase address should be ok', function (done) {
    getAccounts('address=' + node.iAccount.address.toLowerCase(), function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('account').that.is.an('object');
      node.expect(res.body.account).to.have.property('address').to.equal(node.iAccount.address);
      node.expect(res.body.account).to.have.property('unconfirmedBalance').that.is.a('string');
      node.expect(res.body.account).to.have.property('balance').that.is.a('string');
      node.expect(res.body.account).to.have.property('publicKey').to.equal(node.iAccount.publicKey);
      node.expect(res.body.account).to.have.property('unconfirmedSignature').to.equal(0);
      node.expect(res.body.account).to.have.property('secondSignature').to.equal(0);
      node.expect(res.body.account).to.have.property('secondPublicKey').to.equal(null);
      node.expect(res.body.account).to.have.property('multisignatures').to.a('array');
      node.expect(res.body.account).to.have.property('u_multisignatures').to.a('array');
      done();
    });
  });

  it('using unknown address should fail', function (done) {
    getAccounts('address=' + account.address, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error').to.eql('Account not found');
      done();
    });
  });

  it('using invalid address should fail', function (done) {
    getAccounts('address=' + 'thisIsNOTAnAdamantAddress', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error');
      node.expect(res.body.error).to.contain('Object didn\'t pass validation for format address: thisIsNOTAnAdamantAddress');
      done();
    });
  });

  it('using empty address should fail', function (done) {
    getAccounts('address=', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error');
      node.expect(res.body.error).to.contain("Object didn't pass validation for format address");
      done();
    });
  });

  it('using known publicKey should be ok', function (done) {
    getAccounts('publicKey=' + node.iAccount.publicKey, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('account').that.is.an('object');
      node.expect(res.body.account).to.have.property('address').to.equal(node.iAccount.address);
      node.expect(res.body.account).to.have.property('unconfirmedBalance').that.is.a('string');
      node.expect(res.body.account).to.have.property('balance').that.is.a('string');
      node.expect(res.body.account).to.have.property('publicKey').to.equal(node.iAccount.publicKey);
      node.expect(res.body.account).to.have.property('unconfirmedSignature').to.equal(0);
      node.expect(res.body.account).to.have.property('secondSignature').to.equal(0);
      node.expect(res.body.account).to.have.property('secondPublicKey').to.equal(null);
      node.expect(res.body.account).to.have.property('multisignatures').to.a('array');
      node.expect(res.body.account).to.have.property('u_multisignatures').to.a('array');
      done();
    });
  });

  it('using known publicKey and empty address should fail', function (done) {
    getAccounts('publicKey=' + node.iAccount.publicKey + '&address=', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error').to.contain("Object didn't pass validation for format address");
      done();
    });
  });

  it('using unknown publicKey should fail', function (done) {
    getAccounts('publicKey=' + account.publicKey.toString('hex'), function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error').to.eql('Account not found');
      done();
    });
  });

  it('using invalid publicKey should fail', function (done) {
    getAccounts('publicKey=' + 'thisIsNOTAnAdamantAccountPublicKey', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error');
      node.expect(res.body.error).to.contain('Object didn\'t pass validation for format publicKey: thisIsNOTAnAdamantAccountPublicKey');
      done();
    });
  });

  it('using invalid publicKey (integer) should fail', function (done) {
    getAccounts('publicKey=' + '123', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error');
      node.expect(res.body.error).to.contain('Expected type string but found type integer');
      done();
    });
  });

  it('using empty publicKey should fail', function (done) {
    getAccounts('publicKey=', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error');
      node.expect(res.body.error).to.contain('Missing required property: address or publicKey');
      done();
    });
  });

  it('using empty publicKey and address should fail', function (done) {
    getAccounts('publicKey=&address=', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error');
      node.expect(res.body.error).to.contain("Object didn't pass validation for format address");
      done();
    });
  });

  it('using known address and matching publicKey should be ok', function (done) {
    getAccounts('address=' + node.iAccount.address + '&publicKey=' + node.iAccount.publicKey, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('account').that.is.an('object');
      node.expect(res.body.account).to.have.property('address').to.equal(node.iAccount.address);
      node.expect(res.body.account).to.have.property('unconfirmedBalance').that.is.a('string');
      node.expect(res.body.account).to.have.property('balance').that.is.a('string');
      node.expect(res.body.account).to.have.property('publicKey').to.equal(node.iAccount.publicKey);
      node.expect(res.body.account).to.have.property('unconfirmedSignature').to.equal(0);
      node.expect(res.body.account).to.have.property('secondSignature').to.equal(0);
      node.expect(res.body.account).to.have.property('secondPublicKey').to.equal(null);
      node.expect(res.body.account).to.have.property('multisignatures').to.a('array');
      node.expect(res.body.account).to.have.property('u_multisignatures').to.a('array');
      done();
    });
  });

  it('using known address and not matching publicKey should fail', function (done) {
    getAccounts('address=' + node.iAccount.address + '&publicKey=' + account.publicKey.toString('hex'), function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error');
      node.expect(res.body.error).to.contain('Account publicKey does not match address');
      done();
    });
  });
});
