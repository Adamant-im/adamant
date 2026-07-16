'use strict';

var node = require('./../node.js');

var account = node.randomAccount();

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
      node.expect(res.body.error).to.contain('Object didn\'t pass validation for format address');
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
      node.expect(res.body.error).to.contain('Object didn\'t pass validation for format address');
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
      node.expect(res.body.error).to.contain('Object didn\'t pass validation for format address');
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
      node.expect(res.body).to.have.property('error').to.contain('Object didn\'t pass validation for format address');
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
      node.expect(res.body.error).to.contain('Object didn\'t pass validation for format address');
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

/**
 * Calls the top accounts endpoint with optional query parameters.
 * @param {string} params - URL query string without the leading question mark.
 * @param {function} done - Mocha callback.
 * @return {object} Supertest request.
 */
function getTopAccounts (params, done) {
  return node.get('/api/accounts/top' + (params ? '?' + params : ''), done);
}

/**
 * Asserts common top accounts pagination response fields.
 * @param {object} body - Parsed API response body.
 * @param {number} limit - Expected normalized limit.
 * @param {number} offset - Expected normalized offset.
 * @return {void}
 */
function expectTopPagination (body, limit, offset) {
  node.expect(body).to.have.property('success').to.be.true;
  node.expect(body).to.have.property('accounts').that.is.an('array');
  node.expect(body).to.have.property('count').that.is.a('number');
  node.expect(body).to.have.property('limit').to.equal(limit);
  node.expect(body).to.have.property('offset').to.equal(offset);
  node.expect(body.accounts.length).to.be.at.most(limit);
  node.expect(body.count).to.be.at.least(body.accounts.length);
}

/**
 * Asserts that each top account exposes the explorer/client-facing fields.
 * @param {Array<object>} accounts - Accounts returned by `/api/accounts/top`.
 * @return {void}
 */
function expectTopAccountFields (accounts) {
  accounts.forEach(function (account) {
    node.expect(account).to.have.property('address').that.is.a('string');
    node.expect(account).to.have.property('balance').that.is.a('string');
    node.expect(account).to.have.property('publicKey');
    node.expect(account).to.have.property('username');
    node.expect(account).to.have.property('isDelegate').that.is.a('number');
  });
}

/**
 * Asserts deterministic top-account ordering by balance and address.
 * @param {Array<object>} accounts - Accounts returned by `/api/accounts/top`.
 * @return {void}
 */
function expectTopAccountsSorted (accounts) {
  for (var index = 1; index < accounts.length; index++) {
    var previous = accounts[index - 1];
    var current = accounts[index];
    var previousBalance = BigInt(previous.balance);
    var currentBalance = BigInt(current.balance);

    node.expect(previousBalance >= currentBalance).to.equal(true);

    if (previousBalance === currentBalance) {
      node.expect(previous.address <= current.address).to.equal(true);
    }
  }
}

describe('GET /api/accounts/top', function () {
  it('should return default paginated top accounts', function (done) {
    getTopAccounts('', function (err, res) {
      expectTopPagination(res.body, 100, 0);
      expectTopAccountFields(res.body.accounts);
      expectTopAccountsSorted(res.body.accounts);
      done();
    });
  });

  it('should support limit and offset pagination', function (done) {
    getTopAccounts('limit=2&offset=1', function (err, res) {
      expectTopPagination(res.body, 2, 1);
      expectTopAccountFields(res.body.accounts);
      expectTopAccountsSorted(res.body.accounts);
      done();
    });
  });

  it('should support count-only pagination', function (done) {
    getTopAccounts('limit=0', function (err, res) {
      expectTopPagination(res.body, 0, 0);
      node.expect(res.body.accounts).to.eql([]);
      done();
    });
  });

  it('should filter delegate accounts', function (done) {
    getTopAccounts('limit=5&isDelegate=1', function (err, res) {
      expectTopPagination(res.body, 5, 0);
      expectTopAccountFields(res.body.accounts);
      expectTopAccountsSorted(res.body.accounts);
      res.body.accounts.forEach(function (account) {
        node.expect(account.isDelegate).to.equal(1);
      });
      done();
    });
  });

  it('should filter non-delegate accounts', function (done) {
    getTopAccounts('limit=5&isDelegate=0', function (err, res) {
      expectTopPagination(res.body, 5, 0);
      expectTopAccountFields(res.body.accounts);
      expectTopAccountsSorted(res.body.accounts);
      res.body.accounts.forEach(function (account) {
        node.expect(account.isDelegate).to.equal(0);
      });
      done();
    });
  });

  it('should reject limits above the public maximum', function (done) {
    getTopAccounts('limit=101', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error');
      node.expect(res.body.error).to.contain('Invalid limit: value must be at most 100');
      done();
    });
  });

  it('should reject invalid delegate filters', function (done) {
    getTopAccounts('isDelegate=2', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error');
      node.expect(res.body.error).to.contain('Invalid isDelegate: value must be at most 1');
      done();
    });
  });
});
