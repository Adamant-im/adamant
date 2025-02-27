'use strict';

var node = require('./../node.js');
var modulesLoader = require('./../common/initModule.js').modulesLoader;
var genesisDelegates = require('../genesisPasses.json');

function openAccount (params, done) {
  node.post('/api/accounts/open', params, function (err, res) {
    done(err, res);
  });
}

function sendADM (params, done) {
  node.put('/api/transactions/', params, function (err, res) {
    done(err, res);
  });
}

function putAccountsDelegates (params, done) {
  node.put('/api/accounts/delegates', params, function (err, res) {
    done(err, res);
  });
}

function putDelegates (params, done) {
  node.put('/api/delegates', params, function (err, res) {
    done(err, res);
  });
}

describe('PUT /api/accounts/delegates without funds', function () {
  var account;

  beforeEach(function (done) {
    account = node.randomAccount();
    done();
  });

  it('when upvoting should fail', function (done) {
    putAccountsDelegates({
      secret: account.password,
      delegates: ['+' + node.eAccount.publicKey]
    }, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error').to.match(/Account does not have enough ADM/);
      done();
    });
  });

  it('when downvoting should fail', function (done) {
    putAccountsDelegates({
      secret: account.password,
      delegates: ['-' + node.eAccount.publicKey]
    }, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error').to.match(/Account does not have enough ADM/);
      done();
    });
  });
});

describe('PUT /api/delegates without funds', function () {
  var account;

  beforeEach(function (done) {
    account = node.randomAccount();
    done();
  });

  it('using valid parameters should fail', function (done) {
    putDelegates({
      secret: account.password,
      username: account.username
    }, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error').to.match(/Account does not have enough ADM/);
      done();
    });
  });
});

describe('PUT /api/accounts/delegates with funds', function () {
  var account = node.randomAccount();

  before(function (done) {
    sendADM({
      secret: node.iAccount.password,
      amount: node.randomADM(),
      recipientId: account.address
    }, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('transactionId');
      node.expect(res.body.transactionId).not.to.be.empty;
      done();
    });
  });

  beforeEach(function (done) {
    node.onNewBlock(function (err) {
      done();
    });
  });

  it('when upvoting same delegate multiple times should fail', function (done) {
    var votedDelegate = Array.apply(null, Array(2)).map(function () { return '+' + node.eAccount.publicKey; });

    putAccountsDelegates({
      secret: account.password,
      delegates: votedDelegate
    }, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error').to.include('Failed to validate vote schema:');
      done();
    });
  });

  it('when downvoting same delegate multiple times should fail', function (done) {
    var votedDelegate = Array.apply(null, Array(2)).map(function () { return '-' + node.eAccount.publicKey; });

    putAccountsDelegates({
      secret: account.password,
      delegates: votedDelegate
    }, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error').to.include('Failed to validate vote schema:');
      done();
    });
  });

  it('when upvoting and downvoting within same request should fail', function (done) {
    var votedDelegate = ['-' + node.eAccount.publicKey, '+' + node.eAccount.publicKey];

    putAccountsDelegates({
      secret: account.password,
      delegates: votedDelegate
    }, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error');
      node.expect(res.body).to.have.property('error').to.equal('Multiple votes for same delegate are not allowed');
      done();
    });
  });

  it('when upvoting should be ok', function (done) {
    putAccountsDelegates({
      secret: account.password,
      delegates: ['+' + node.eAccount.publicKey]
    }, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('transaction').that.is.an('object');
      node.expect(res.body.transaction.type).to.equal(node.txTypes.VOTE);
      node.expect(res.body.transaction.amount).to.equal(0);
      node.expect(res.body.transaction.senderPublicKey).to.equal(account.publicKey.toString('hex'));
      node.expect(res.body.transaction.fee).to.equal(node.fees.voteFee);
      done();
    });
  });

  it('when upvoting again from same account should fail', function (done) {
    putAccountsDelegates({
      secret: account.password,
      delegates: ['+' + node.eAccount.publicKey]
    }, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error');
      node.expect(res.body.error.toLowerCase()).to.contain('already voted');
      done();
    });
  });

  it('when downvoting should be ok', function (done) {
    putAccountsDelegates({
      secret: account.password,
      delegates: ['-' + node.eAccount.publicKey]
    }, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('transaction').that.is.an('object');
      node.expect(res.body.transaction.type).to.equal(node.txTypes.VOTE);
      node.expect(res.body.transaction.amount).to.equal(0);
      node.expect(res.body.transaction.senderPublicKey).to.equal(account.publicKey.toString('hex'));
      node.expect(res.body.transaction.fee).to.equal(node.fees.voteFee);
      done();
    });
  });

  it('when downvoting again from same account should fail', function (done) {
    putAccountsDelegates({
      secret: account.password,
      delegates: ['-' + node.eAccount.publicKey]
    }, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error');
      node.expect(res.body.error.toLowerCase()).to.contain('not voted');
      done();
    });
  });

  it('when upvoting using a blank passphrase should fail', function (done) {
    putAccountsDelegates({
      secret: '',
      delegates: ['+' + node.eAccount.publicKey]
    }, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error').to.include('String is too short ');
      done();
    });
  });

  it('when downvoting using a blank passphrase should fail', function (done) {
    putAccountsDelegates({
      secret: '',
      delegates: ['-' + node.eAccount.publicKey]
    }, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error').to.include('String is too short ');
      done();
    });
  });

  it('when upvoting without any delegates should fail', function (done) {
    putAccountsDelegates({
      secret: account.password,
      delegates: ['+']
    }, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error').to.include('Invalid vote format');
      done();
    });
  });

  it('when downvoting without any delegates should fail', function (done) {
    putAccountsDelegates({
      secret: account.password,
      delegates: ['-']
    }, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error').to.include('Invalid vote format');
      done();
    });
  });

  it('without any delegates should fail', function (done) {
    putAccountsDelegates({
      secret: account.password,
      delegates: ''
    }, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error').to.equal('Failed to validate vote schema: Expected type array but found type string');
      done();
    });
  });
});

describe('PUT /api/delegates with funds', function () {
  var account, validParams;

  beforeEach(function (done) {
    account = node.randomAccount();
    account.username = node.randomDelegateName();
    validParams = {
      secret: account.password,
      username: account.username
    };
    done();
  });

  beforeEach(function (done) {
    sendADM({
      secret: node.iAccount.password,
      amount: node.randomADM(),
      recipientId: account.address
    }, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('transactionId');
      node.expect(res.body.transactionId).not.to.be.empty;
      node.onNewBlock(function (err) {
        done();
      });
    });
  });

  it('using blank passphrase should fail', function (done) {
    validParams.secret = '';

    putDelegates(validParams, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error');
      done();
    });
  });

  it('using invalid passphrase should fail', function (done) {
    validParams.secret = [];

    putDelegates(validParams, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error');
      done();
    });
  });

  it('using invalid username should fail', function (done) {
    validParams.username = '~!@#$%^&*()_+.,?/';

    putDelegates(validParams, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error');
      done();
    });
  });

  it('using username longer than 20 characters should fail', function (done) {
    validParams.username = 'ABCDEFGHIJKLMNOPQRSTU';

    putDelegates(validParams, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error');
      done();
    });
  });

  it('using blank username should fail', function (done) {
    validParams.username = '';

    putDelegates(validParams, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error');
      done();
    });
  });

  it('using uppercase username should be registered in lowercase', function (done) {
    validParams.username = account.username.toUpperCase();

    putDelegates(validParams, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('transaction').that.is.an('object');
      node.expect(res.body.transaction.fee).to.equal(node.fees.delegateRegistrationFee);
      node.expect(res.body.transaction).to.have.property('asset').that.is.an('object');
      node.expect(res.body.transaction.asset.delegate.username).to.equal(account.username.toLowerCase());
      node.expect(res.body.transaction.asset.delegate.publicKey).to.equal(account.publicKey.toString('hex'));
      node.expect(res.body.transaction.type).to.equal(node.txTypes.DELEGATE);
      node.expect(res.body.transaction.amount).to.equal(0);
      done();
    });
  });

  it('using same account twice should fail', function (done) {
    putDelegates(validParams, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('transaction').that.is.an('object');

      node.onNewBlock(function (err) {
        putDelegates(validParams, function (err, res) {
          node.expect(res.body).to.have.property('success').to.be.false;
          node.expect(res.body).to.have.property('error');
          done();
        });
      });
    });
  });

  it('using existing username but different case should fail', function (done) {
    putDelegates(validParams, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('transaction').that.is.an('object');

      node.onNewBlock(function (err) {
        validParams.username = validParams.username.toUpperCase();
        putDelegates(validParams, function (err, res) {
          node.expect(res.body).to.have.property('success').to.be.false;
          node.expect(res.body).to.have.property('error');
          done();
        });
      });
    });
  });
});

describe('GET /api/delegates (cache)', function () {
  var cache;

  before(function (done) {
    node.config.cacheEnabled = true;
    done();
  });

  before(function (done) {
    modulesLoader.initCache(function (err, __cache) {
      cache = __cache;
      node.expect(err).to.not.exist;
      node.expect(__cache).to.be.an('object');
      return done(err, __cache);
    });
  });

  after(function (done) {
    cache.quit(done);
  });

  afterEach(function (done) {
    cache.flushDb(function (err, status) {
      node.expect(err).to.not.exist;
      node.expect(status).to.equal('OK');
      done(err, status);
    });
  });

  it('cache delegates when response is a success', function (done) {
    var url;
    url = '/api/delegates';

    node.get(url, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('delegates').that.is.an('array');
      var response = res.body;
      cache.getJsonForKey(url, function (err, res) {
        node.expect(err).to.not.exist;
        node.expect(res).to.eql(response);
        done(err, res);
      });
    });
  });

  it('should not cache if response is not a success', function (done) {
    var url, orderBy, params;
    url = '/api/delegates?';
    orderBy = 'unknown:asc';
    params = 'orderBy=' + orderBy;

    node.get(url + params, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error').to.equal('Invalid sort field');
      cache.getJsonForKey(url + params, function (err, res) {
        node.expect(err).to.not.exist;
        node.expect(res).to.be.null;
        done(err, res);
      });
    });
  });

  it('should flush cache on the next round', function (done) {
    var url;
    url = '/api/delegates';

    node.get(url, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('delegates').that.is.an('array');
      var response = res.body;
      cache.getJsonForKey(url, function (err, beforeCachedResponse) {
        node.expect(err).to.not.exist;
        node.expect(beforeCachedResponse).to.eql(response);
        node.onNewRound(function (err) {
          node.expect(err).to.not.exist;
          cache.getJsonForKey(url, function (err, afterCachedResponse) {
            node.expect(err).to.not.exist;
            node.expect(afterCachedResponse).to.not.eql(beforeCachedResponse);
            done();
          });
        });
      });
    });
  });
});

describe('GET /api/delegates', function () {
  it('using no params should be ok', function (done) {
    node.get('/api/delegates', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('delegates').that.is.an('array');
      node.expect(res.body.delegates).to.have.lengthOf(101);
      node.expect(res.body.delegates[0]).to.have.property('username');
      node.expect(res.body.delegates[0]).to.have.property('address');
      node.expect(res.body.delegates[0]).to.have.property('publicKey');
      node.expect(res.body.delegates[0]).to.have.property('vote');
      node.expect(res.body.delegates[0]).to.have.property('rank');
      node.expect(res.body.delegates[0]).to.have.property('productivity');
      done();
    });
  });

  it('using orderBy == "unknown:asc" should fail', function (done) {
    var orderBy = 'unknown:asc';
    var params = 'orderBy=' + orderBy;

    node.get('/api/delegates?' + params, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error').to.equal('Invalid sort field');
      done();
    });
  });

  it('using orderBy == "approval:asc" should be ok', function (done) {
    var orderBy = 'approval:asc';
    var params = 'orderBy=' + orderBy;

    node.get('/api/delegates?' + params, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('delegates').that.is.an('array');
      node.expect(res.body.delegates).to.have.lengthOf(101);
      done();
    });
  });

  it('using orderBy == "productivity:asc" should be ok', function (done) {
    var orderBy = 'productivity:asc';
    var params = 'orderBy=' + orderBy;

    node.get('/api/delegates?' + params, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('delegates').that.is.an('array');
      node.expect(res.body.delegates).to.have.lengthOf(101);
      done();
    });
  });

  it('using orderBy == "rank:asc" should be ok', function (done) {
    var orderBy = 'rank:asc';
    var params = 'orderBy=' + orderBy;

    node.get('/api/delegates?' + params, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('delegates').that.is.an('array');
      node.expect(res.body.delegates).to.have.lengthOf(101);
      for (var i = 0; i < res.body.delegates.length; i++) {
        if (res.body.delegates[i + 1] != null) {
          node.expect(res.body.delegates[i].rank).to.be.at.below(res.body.delegates[i + 1].rank);
        }
      }
      done();
    });
  });

  it('using orderBy == "rank:desc" should be ok', function (done) {
    var orderBy = 'rank:desc';
    var params = 'orderBy=' + orderBy;

    node.get('/api/delegates?' + params, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('delegates').that.is.an('array');
      node.expect(res.body.delegates).to.have.lengthOf(101);
      for (var i = 0; i < res.body.delegates.length; i++) {
        if (res.body.delegates[i + 1] != null) {
          node.expect(res.body.delegates[i].rank).to.be.at.above(res.body.delegates[i + 1].rank);
        }
      }
      done();
    });
  });

  it('using orderBy == "vote:asc" should be ok', function (done) {
    var orderBy = 'vote:asc';
    var params = 'orderBy=' + orderBy;

    node.get('/api/delegates?' + params, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('delegates').that.is.an('array');
      node.expect(res.body.delegates).to.have.lengthOf(101);
      for (var i = 0; i < res.body.delegates.length; i++) {
        if (res.body.delegates[i + 1]) {
          node.expect(Number(res.body.delegates[i].vote)).to.be.at.most(Number(res.body.delegates[i + 1].vote));
        }
      }
      done();
    });
  });

  it('using orderBy == "vote:desc" should be ok', function (done) {
    var orderBy = 'vote:desc';
    var params = 'orderBy=' + orderBy;

    node.get('/api/delegates?' + params, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('delegates').that.is.an('array');
      node.expect(res.body.delegates).to.have.lengthOf(101);
      for (var i = 0; i < res.body.delegates.length; i++) {
        if (res.body.delegates[i + 1]) {
          node.expect(Number(res.body.delegates[i].vote)).to.be.at.least(Number(res.body.delegates[i + 1].vote));
        }
      }
      done();
    });
  });

  // Sorting via votesWeight is not yet implemented

  /*
  it('using orderBy == "votesWeight:asc" should be ok', function (done) {
    var orderBy = 'votesWeight:asc';
    var params = 'orderBy=' + orderBy;

    node.get('/api/delegates?' + params, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('delegates').that.is.an('array');
      node.expect(res.body.delegates).to.have.lengthOf(101);
      for (var i = 0; i < res.body.delegates.length; i++) {
        if (res.body.delegates[i + 1]) {
          node.expect(Number(res.body.delegates[i].votesWeight)).to.be.at.most(Number(res.body.delegates[i + 1].votesWeight));
        }
      }
      done();
    });
  });
  */

  it('using orderBy == "username:asc" should be ok', function (done) {
    var orderBy = 'username:asc';
    var params = 'orderBy=' + orderBy;

    node.get('/api/delegates?' + params, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('delegates').that.is.an('array');
      node.expect(res.body.delegates).to.have.lengthOf(101);
      done();
    });
  });

  it('using orderBy == "address:asc" should be ok', function (done) {
    var orderBy = 'address:asc';
    var params = 'orderBy=' + orderBy;

    node.get('/api/delegates?' + params, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('delegates').that.is.an('array');
      node.expect(res.body.delegates).to.have.lengthOf(101);
      done();
    });
  });

  it('using orderBy == "publicKey:asc" should be ok', function (done) {
    var orderBy = 'publicKey:asc';
    var params = 'orderBy=' + orderBy;

    node.get('/api/delegates?' + params, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('delegates').that.is.an('array');
      node.expect(res.body.delegates).to.have.lengthOf(101);
      done();
    });
  });

  it('using string limit should fail', function (done) {
    var limit = 'one';
    var params = 'limit=' + limit;

    node.get('/api/delegates?' + params, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error').to.equal('Expected type integer but found type string');
      done();
    });
  });

  it('using limit == -1 should fail', function (done) {
    var limit = -1;
    var params = 'limit=' + limit;

    node.get('/api/delegates?' + params, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error').to.equal('Value -1 is less than minimum 1');
      done();
    });
  });

  it('using limit == 0 should fail', function (done) {
    var limit = 0;
    var params = 'limit=' + limit;

    node.get('/api/delegates?' + params, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error').to.equal('Value 0 is less than minimum 1');
      done();
    });
  });

  it('using limit == 1 should be ok', function (done) {
    var limit = 1;
    var params = 'limit=' + limit;

    node.get('/api/delegates?' + params, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('delegates').that.is.an('array');
      node.expect(res.body.delegates).to.have.lengthOf(1);
      done();
    });
  });

  it('using limit == 101 should be ok', function (done) {
    var limit = 101;
    var params = 'limit=' + limit;

    node.get('/api/delegates?' + params, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('delegates').that.is.an('array');
      node.expect(res.body.delegates).to.have.lengthOf(101);
      done();
    });
  });

  it('using limit > 101 should fail', function (done) {
    var limit = 102;
    var params = 'limit=' + limit;

    node.get('/api/delegates?' + params, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error').to.equal('Value 102 is greater than maximum 101');
      done();
    });
  });

  it('using string offset should fail', function (done) {
    var limit = 'one';
    var params = 'offset=' + limit;

    node.get('/api/delegates?' + params, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error').to.equal('Expected type integer but found type string');
      done();
    });
  });

  it('using offset == 1 should be ok', function (done) {
    var offset = 1;
    var params = 'offset=' + offset;

    node.get('/api/delegates?' + params, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('delegates').that.is.an('array');
      node.expect(res.body.delegates).to.have.lengthOf(101);
      done();
    });
  });

  it('using offset == -1 should fail', function (done) {
    var offset = -1;
    var params = 'offset=' + offset;

    node.get('/api/delegates?' + params, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error').to.equal('Value -1 is less than minimum 0');
      done();
    });
  });

  it('using orderBy with any of sort fields should not place NULLs first', function (done) {
    var delegatesSortFields = ['approval', 'productivity', 'rank', 'vote'];
    node.async.each(delegatesSortFields, function (sortField, cb) {
      node.get('/api/delegates?orderBy=' + sortField, function (err, res) {
        node.expect(res.body).to.have.property('success').to.be.true;
        node.expect(res.body).to.have.property('delegates').that.is.an('array');

        var dividedIndices = res.body.delegates.reduce(function (memo, peer, index) {
          memo[peer[sortField] === null ? 'nullIndices' : 'notNullIndices'].push(index);
          return memo;
        }, { notNullIndices: [], nullIndices: [] });

        if (dividedIndices.nullIndices.length && dividedIndices.notNullIndices.length) {
          var ascOrder = function (a, b) { return a - b; };
          dividedIndices.notNullIndices.sort(ascOrder);
          dividedIndices.nullIndices.sort(ascOrder);

          node.expect(dividedIndices.notNullIndices[dividedIndices.notNullIndices.length - 1])
              .to.be.at.most(dividedIndices.nullIndices[0]);
        }
        cb();
      });
    }, function () {
      done();
    });
  });
});

describe('GET /api/delegates/count', function () {
  it('should be ok', function (done) {
    node.get('/api/delegates/count', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('count').to.be.at.least(101);
      done();
    });
  });
});

describe('GET /api/delegates/voters', function () {
  var account = node.randomAccount();

  before(function (done) {
    sendADM({
      secret: node.iAccount.password,
      amount: node.randomADM(),
      recipientId: account.address
    }, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('transactionId');
      node.expect(res.body.transactionId).not.to.be.empty;
      node.onNewBlock(function (err) {
        done();
      });
    });
  });

  before(function (done) {
    node.put('/api/accounts/delegates', {
      secret: account.password,
      delegates: ['+' + node.eAccount.publicKey]
    }, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.onNewBlock(function (err) {
        done();
      });
    });
  });

  it('using invalid publicKey should fail', function (done) {
    var params = 'publicKey=' + 'notAPublicKey';

    node.get('/api/delegates/voters?' + params, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error');
      done();
    });
  });

  it('using valid publicKey should be ok', function (done) {
    var params = 'publicKey=' + node.eAccount.publicKey;

    node.onNewBlock(function (err) {
      node.get('/api/delegates/voters?' + params, function (err, res) {
        node.expect(res.body).to.have.property('success').to.be.true;
        node.expect(res.body).to.have.property('accounts').that.is.an('array');
        var flag = 0;
        for (var i = 0; i < res.body.accounts.length; i++) {
          if (res.body.accounts[i].address === account.address) {
            flag = 1;
          }
        }
        node.expect(flag).to.equal(1);
        done();
      });
    });
  });
});

describe('GET /api/delegates/search', function () {
  const accounts = Array.from(Array(101)).map(() => node.randomAccount());

  it('using no criteria should fail', function (done) {
    node.get('/api/delegates/search', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error');
      done();
    });
  });

  it('using blank criteria should fail', function (done) {
    var q = '';

    node.get('/api/delegates/search?q=' + q, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error');
      done();
    });
  });

  it('using wildcard criteria should be ok', function (done) {
    var q = '%'; // 1 character

    node.get('/api/delegates/search?q=' + q, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('delegates').that.is.an('array');
      done();
    });
  });

  it('using criteria with length == 1 should be ok', function (done) {
    var q = 'g'; // 1 character

    node.get('/api/delegates/search?q=' + q, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('delegates').that.is.an('array');
      done();
    });
  });

  it('using criteria with length == 20 should be ok', function (done) {
    var q = 'genesis_123456789012'; // 20 characters

    node.get('/api/delegates/search?q=' + q, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('delegates').that.is.an('array');
      done();
    });
  });

  it('using criteria with length > 20 should fail', function (done) {
    var q = 'genesis_1234567890123'; // 21 characters

    node.get('/api/delegates/search?q=' + q, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error');
      done();
    });
  });

  it('using criteria == "lo" should return 2 delegates', function (done) {
    var q = 'lo';

    node.get('/api/delegates/search?q=' + q, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('delegates').that.is.an('array');
      node.expect(res.body.delegates).to.have.length(2);
      done();
    });
  });

  it('using criteria == "love" should return 1 delegate', function (done) {
    var q = 'love';

    node.get('/api/delegates/search?q=' + q, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('delegates').that.is.an('array');
      node.expect(res.body.delegates).to.have.length(1);
      done();
    });
  });

  it('using criteria == "market" should have all properties', function (done) {
    var q = 'market';

    node.get('/api/delegates/search?q=' + q, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('delegates').that.is.an('array');
      node.expect(res.body.delegates).to.have.length(1);
      node.expect(res.body.delegates[0]).to.have.property('rank').that.is.an('number');
      node.expect(res.body.delegates[0]).to.have.property('username').that.is.an('string');
      node.expect(res.body.delegates[0]).to.have.property('address').that.is.an('string');
      node.expect(res.body.delegates[0]).to.have.property('publicKey').that.is.an('string');
      node.expect(res.body.delegates[0]).to.have.property('vote').that.is.an('string');
      node.expect(res.body.delegates[0]).to.have.property('producedblocks').that.is.an('number');
      node.expect(res.body.delegates[0]).to.have.property('missedblocks').that.is.an('number');
      node.expect(res.body.delegates[0]).to.have.property('approval').that.is.an('number');
      node.expect(res.body.delegates[0]).to.have.property('productivity').that.is.an('number');
      node.expect(res.body.delegates[0]).to.have.property('voters_cnt').that.is.an('number');
      node.expect(res.body.delegates[0]).to.have.property('register_timestamp').that.is.an('number');
      done();
    });
  });

  it('using no limit should be ok', function (done) {
    var q = '%';

    node.get('/api/delegates/search?q=' + q, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('delegates').that.is.an('array');
      node.expect(res.body.delegates).to.have.length(101);
      done();
    });
  });

  it('using string limit should fail', function (done) {
    var q = '%';
    var limit = 'one';

    node.get('/api/delegates/search?q=' + q + '&limit=' + limit, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error');
      done();
    });
  });

  it('using limit == -100 should fail', function (done) {
    var q = '%';
    var limit = -100;

    node.get('/api/delegates/search?q=' + q + '&limit=' + limit, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error');
      done();
    });
  });

  it('using limit == -1 should fail', function (done) {
    var q = '%';
    var limit = -1;

    node.get('/api/delegates/search?q=' + q + '&limit=' + limit, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error');
      done();
    });
  });

  it('using limit == 0 should fail', function (done) {
    var q = '%';
    var limit = 0;

    node.get('/api/delegates/search?q=' + q + '&limit=' + limit, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error');
      done();
    });
  });

  it('using limit == 1 should be ok', function (done) {
    var q = '%';
    var limit = 1;

    node.get('/api/delegates/search?q=' + q + '&limit=' + limit, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('delegates').that.is.an('array');
      node.expect(res.body.delegates).to.have.length(1);
      done();
    });
  });

  it('using limit == 1000 should be ok', function (done) {
    var q = '%';
    var limit = 1000;

    node.get('/api/delegates/search?q=' + q + '&limit=' + limit, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('delegates').that.is.an('array');
      node.expect(res.body.delegates.length).to.be.at.least(101);
      done();
    });
  });

  it('using limit > 1000 should fail', function (done) {
    var q = '%';
    var limit = 1001;

    node.get('/api/delegates/search?q=' + q + '&limit=' + limit, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error');
      done();
    });
  });

  it('using orderBy == "unknown:asc" should fail', function (done) {
    var q = '%';

    node.get('/api/delegates/search?q=' + q + '&orderBy=unknown:asc', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error');
      done();
    });
  });

  it('using no orderBy should be ordered by ascending username', function (done) {
    var q = '%';

    node.get('/api/delegates/search?q=' + q, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('delegates').that.is.an('array');
      node.expect(res.body.delegates).to.have.length(101);
      for (let i = 0; i < res.body.delegates.length - 1; i++) {
        node.expect(res.body.delegates[i].username <= res.body.delegates[i + 1].username).to.be.true;
      }
      done();
    });
  });

  it('using orderBy == "username:asc" should be ordered by ascending username', function (done) {
    var q = '%';

    node.get('/api/delegates/search?q=' + q + '&orderBy=username:asc', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('delegates').that.is.an('array');
      node.expect(res.body.delegates).to.have.length(101);
      for (let i = 0; i < res.body.delegates.length - 1; i++) {
        node.expect(res.body.delegates[i]).to.have.property('username');
        node.expect(res.body.delegates[i].username <= res.body.delegates[i + 1].username).to.be.true;
      }
      done();
    });
  });

  it('using orderBy == "username:desc" should be ordered by descending username', function (done) {
    var q = '%';

    node.get('/api/delegates/search?q=' + q + '&orderBy=username:desc', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('delegates').that.is.an('array');
      node.expect(res.body.delegates).to.have.length(101);
      for (let i = 0; i < res.body.delegates.length - 1; i++) {
        node.expect(res.body.delegates[i]).to.have.property('username');
        node.expect(res.body.delegates[i].username >= res.body.delegates[i + 1].username).to.be.true;
      }
      done();
    });
  });
});

describe('GET /api/delegates/forging/status', function () {
  it('using no params should be ok', function (done) {
    node.get('/api/delegates/forging/status', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('enabled').to.be.true;
      node.expect(res.body).to.have.property('delegates').that.is.an('array');
      done();
    });
  });

  it('using invalid publicKey should fail', function (done) {
    node.get('/api/delegates/forging/status?publicKey=' + 'invalidPublicKey', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error').to.eql('Object didn\'t pass validation for format publicKey: invalidPublicKey');
      done();
    });
  });

  it('using empty publicKey should be ok', function (done) {
    node.get('/api/delegates/forging/status?publicKey=', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('enabled').to.be.true;
      node.expect(res.body).to.have.property('delegates').that.is.an('array');
      done();
    });
  });

  it('using disabled publicKey should be ok', function (done) {
    node.get('/api/delegates/forging/status?publicKey=' + 'c094ebee7ec0c50ebee32918655e089f6e1a604b83bcaa760293c61e0f18ab6f', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('enabled').to.be.false;
      done();
    });
  });

  it('using enabled publicKey should be ok', function (done) {
    node.get('/api/delegates/forging/status?publicKey=' + 'd365e59c9880bd5d97c78475010eb6d96c7a3949140cda7e667f9513218f9089', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('enabled').to.be.true;
      done();
    });
  });
});

describe('POST /api/delegates/forging/disable', function () {
  var testDelegate = genesisDelegates.delegates[0];

  before(function (done) {
    node.get('/api/delegates/forging/status?publicKey=' + testDelegate.publicKey, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('enabled').to.be.a('boolean');
      if (!res.body.enabled) {
        node.post('/api/delegates/forging/enable', {
          publicKey: testDelegate.publicKey,
          secret: testDelegate.secret
        }, function (err, res) {
          node.expect(res.body).to.have.property('success').to.be.true;
          node.expect(res.body).to.have.property('address').equal(testDelegate.address);
          done();
        });
      }
      done();
    });
  });

  it('using no params should fail', function (done) {
    node.post('/api/delegates/forging/disable', {}, function (err, res) {
      node.expect(res.body).to.have.property('success').not.to.be.true;
      node.expect(res.body).to.have.property('error').to.be.a('string').and.to.contain('Missing required property: secret');
      done();
    });
  });

  it('using invalid secret should fail', function (done) {
    node.post('/api/delegates/forging/disable', {
      publicKey: testDelegate.publicKey,
      secret: 'invalid secret'
    }, function (err, res) {
      node.expect(res.body).to.have.property('success').not.to.be.true;
      node.expect(res.body).to.have.property('error').to.be.a('string').and.to.contain('invalid secret');
      done();
    });
  });

  it('using valid params should be ok', function (done) {
    node.post('/api/delegates/forging/disable', {
      publicKey: testDelegate.publicKey,
      secret: testDelegate.secret
    }, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('address').equal(testDelegate.address);
      done();
    });
  });
});

describe('POST /api/delegates/forging/enable', function () {
  var testDelegate = genesisDelegates.delegates[0];

  before(function (done) {
    node.get('/api/delegates/forging/status?publicKey=' + testDelegate.publicKey, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('enabled').to.be.a('boolean');
      if (res.body.enabled) {
        node.post('/api/delegates/forging/disable', {
          publicKey: testDelegate.publicKey,
          secret: testDelegate.secret
        }, function (err, res) {
          node.expect(res.body).to.have.property('success').to.be.true;
          node.expect(res.body).to.have.property('address').equal(testDelegate.address);
          done();
        });
      } else {
        done();
      }
    });
  });

  it('using no params should fail', function (done) {
    node.post('/api/delegates/forging/enable', {}, function (err, res) {
      node.expect(res.body).to.have.property('success').not.to.be.true;
      node.expect(res.body).to.have.property('error').to.be.a('string').and.to.contain('Missing required property: secret');
      done();
    });
  });

  it('using invalid secret should fail', function (done) {
    node.post('/api/delegates/forging/enable', {
      publicKey: testDelegate.publicKey,
      secret: 'invalid secret'
    }, function (err, res) {
      node.expect(res.body).to.have.property('success').not.to.be.true;
      node.expect(res.body).to.have.property('error').to.be.a('string').and.to.contain('invalid secret');
      done();
    });
  });

  it('using valid params should be ok', function (done) {
    node.post('/api/delegates/forging/enable', {
      publicKey: testDelegate.publicKey,
      secret: testDelegate.secret
    }, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('address').equal(testDelegate.address);
      done();
    });
  });
});

describe('GET /api/delegates/forging/getForgedByAccount', function () {
  var validParams;

  beforeEach(function () {
    validParams = {
      generatorPublicKey: 'd365e59c9880bd5d97c78475010eb6d96c7a3949140cda7e667f9513218f9089',
      start: 0,
      end: 0
    };
  });

  function buildParams () {
    return [
      'generatorPublicKey=' + validParams.generatorPublicKey,
      validParams.start !== undefined ? 'start=' + validParams.start : '',
      validParams.end !== undefined ? 'end=' + validParams.end : ''
    ].filter(Boolean).join('&');
  }

  it('using no params should fail', function (done) {
    node.get('/api/delegates/forging/getForgedByAccount', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error').to.eql('Missing required property: generatorPublicKey');
      done();
    });
  });

  it('using valid params should be ok', function (done) {
    delete validParams.start;
    delete validParams.end;

    node.get('/api/delegates/forging/getForgedByAccount?' + buildParams(), function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('fees').that.is.a('string');
      node.expect(res.body).to.have.property('rewards').that.is.a('string');
      node.expect(res.body).to.have.property('forged').that.is.a('string');
      done();
    });
  });

  it('using valid params with borders should be ok', function (done) {
    node.get('/api/delegates/forging/getForgedByAccount?' + buildParams(), function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('fees').that.is.a('string').and.eql('0');
      node.expect(res.body).to.have.property('rewards').that.is.a('string').and.eql('0');
      node.expect(res.body).to.have.property('forged').that.is.a('string').and.eql('0');
      node.expect(res.body).to.have.property('count').that.is.a('string').and.eql('0');
      done();
    });
  });

  it('using unknown generatorPublicKey should fail', function (done) {
    validParams.generatorPublicKey = node.randomAccount().publicKey.toString('hex');
    delete validParams.start;
    delete validParams.end;

    node.get('/api/delegates/forging/getForgedByAccount?' + buildParams(), function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error').to.eql('Account not found');
      done();
    });
  });

  it('using unknown generatorPublicKey with borders should fail', function (done) {
    validParams.generatorPublicKey = node.randomAccount().publicKey.toString('hex');

    node.get(encodeURI('/api/delegates/forging/getForgedByAccount?' + buildParams()), function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error').to.eql('Account not found or is not a delegate');
      done();
    });
  });

  it('using invalid generatorPublicKey should fail', function (done) {
    validParams.generatorPublicKey = 'invalidPublicKey';

    node.get('/api/delegates/forging/getForgedByAccount?' + buildParams(), function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error').to.eql('Object didn\'t pass validation for format publicKey: invalidPublicKey');
      done();
    });
  });

  it('using no start should be ok', function (done) {
    delete validParams.start;

    node.get('/api/delegates/forging/getForgedByAccount?' + buildParams(), function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('fees').that.is.a('string').and.eql('0');
      node.expect(res.body).to.have.property('rewards').that.is.a('string').and.eql('0');
      node.expect(res.body).to.have.property('forged').that.is.a('string').and.eql('0');
      node.expect(res.body).to.have.property('count').that.is.a('string').and.eql('0');
      done();
    });
  });

  it('using no end should be ok', function (done) {
    delete validParams.end;

    node.get('/api/delegates/forging/getForgedByAccount?' + buildParams(), function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('fees').that.is.a('string');
      node.expect(res.body).to.have.property('rewards').that.is.a('string');
      node.expect(res.body).to.have.property('forged').that.is.a('string');
      node.expect(res.body).to.have.property('count').that.is.a('string');
      done();
    });
  });

  it('using string start should fail', function (done) {
    validParams.start = 'one';

    node.get('/api/delegates/forging/getForgedByAccount?' + buildParams(), function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error').to.eql('Expected type integer but found type string');
      done();
    });
  });

  it('using string end should fail', function (done) {
    validParams.end = 'two';

    node.get('/api/delegates/forging/getForgedByAccount?' + buildParams(), function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error').to.eql('Expected type integer but found type string');
      done();
    });
  });
});

describe('GET /api/delegates/getNextForgers', function () {
  it('using no params should be ok', function (done) {
    node.get('/api/delegates/getNextForgers', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('currentBlock').that.is.a('number');
      node.expect(res.body).to.have.property('currentBlockSlot').that.is.a('number');
      node.expect(res.body).to.have.property('currentSlot').that.is.a('number');
      node.expect(res.body).to.have.property('delegates').that.is.an('array');
      node.expect(res.body.delegates).to.have.lengthOf(10);
      done();
    });
  });

  it('using limit === 1 should be ok', function (done) {
    node.get('/api/delegates/getNextForgers?' + 'limit=1', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('currentBlock').that.is.a('number');
      node.expect(res.body).to.have.property('currentBlockSlot').that.is.a('number');
      node.expect(res.body).to.have.property('currentSlot').that.is.a('number');
      node.expect(res.body).to.have.property('delegates').that.is.an('array');
      node.expect(res.body.delegates).to.have.lengthOf(1);
      done();
    });
  });

  it('using limit === 101 should be ok', function (done) {
    node.get('/api/delegates/getNextForgers?' + 'limit=101', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('currentBlock').that.is.a('number');
      node.expect(res.body).to.have.property('currentBlockSlot').that.is.a('number');
      node.expect(res.body).to.have.property('currentSlot').that.is.a('number');
      node.expect(res.body).to.have.property('delegates').that.is.an('array');
      node.expect(res.body.delegates).to.have.lengthOf(101);
      done();
    });
  });
});
