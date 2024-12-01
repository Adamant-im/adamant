'use strict';

var node = require('./../node.js');
var constants = require('../../helpers/constants.js');

var account = node.randomAccount();

var delegate;
var delegates = [];
var votedDelegates = [];

function getDelegates (done) {
  node.get('/api/delegates', function (err, res) {
    node.expect(res.body).to.have.property('success').to.be.true;
    node.expect(res.body).to.have.property('delegates').that.is.an('array');
    return done(err, res);
  });
}

function getVotes (address, done) {
  node.get('/api/accounts/delegates/?address=' + address, function (err, res) {
    node.expect(res.body).to.have.property('success').to.be.true;
    node.expect(res.body).to.have.property('delegates').that.is.an('array');
    return done(err, res);
  });
}

function postVotes (params, done) {
  var count = 0;
  var blocksToWait = Math.ceil(params.delegates.length / node.constants.maxTxsPerBlock) + 12;

  node.async.eachSeries(params.delegates, function (delegate, eachCb) {
    let transaction = node.createVoteTransaction({
      keyPair: account.keypair,
      votes: [params.action + delegate]
    });

    // Don't sent requests too often — a node can miss some of them
    node.waitMilliSeconds(600, function () {
      postVote(transaction, function (err, res) {
        params.voteCb(err, res);
        return eachCb();
      });
    });
  }, function (err) {
    node.waitForBlocks(blocksToWait, function (err) {
      return done(err);
    });
  });
}

function postVote (transaction, done) {
  node.post('/peer/transactions', { transaction: transaction }, function (err, res) {
    return done(err, res);
  });
}

function sendADM (params, done) {
  node.put('/api/transactions', params, function (err, res) {
    node.expect(res.body).to.have.property('success').to.be.true;
    node.onNewBlock(function (err) {
      return done(err, res);
    });
  });
}

function registerDelegate (account, done) {
  account.username = node.randomDelegateName().toLowerCase();
  let transaction = node.createDelegateTransaction({
    username: account.username,
    keyPair: account.keypair
  });

  node.post('/peer/transactions', { transaction: transaction }, function (err, res) {
    node.expect(res.body).to.have.property('success').to.be.true;
    node.onNewBlock(function (err) {
      return done(err, res);
    });
  });
}

describe('POST /peer/transactions', function () {
  before(function (done) {
    sendADM({
      secret: node.iAccount.password,
      amount: 2000000000000, // 20k ADM
      recipientId: account.address
    }, done);
  });

  beforeEach(function (done) {
    getDelegates(function (err, res) {
      delegates = res.body.delegates.map(function (delegate) {
        return delegate.publicKey;
      }).slice(0, 101);

      delegate = res.body.delegates[0].publicKey;

      done();
    });
  });

  beforeEach(function (done) {
    getVotes(account.address, function (err, res) {
      votedDelegates = res.body.delegates.map(function (delegate) {
        return delegate.publicKey;
      });

      done();
    });
  });

  before(function (done) {
    postVotes({
      delegates: votedDelegates,
      passphrase: account.password,
      action: '-',
      voteCb: function (err, res) {
        node.expect(res.body).to.have.property('success').to.be.true;
      }
    }, done);
  });

  it('using undefined transaction', function (done) {
    postVote(undefined, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('message').to.contain('Invalid transaction body');
      done();
    });
  });

  it('using undefined transaction.asset', function (done) {
    let transaction = node.createVoteTransaction({
      keyPair: account.keypair,
      votes: [`+${delegate}`]
    });

    delete transaction.asset;

    postVote(transaction, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('message').to.contain('Invalid transaction body');
      done();
    });
  });

  it('using transaction.asset.votes containing invalid vote type', function (done) {
    let transaction = node.createVoteTransaction({
      keyPair: account.keypair,
      votes: [0]
    });

    postVote(transaction, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('message').to.equal('Invalid vote at index 0 - Invalid vote type');
      done();
    });
  });

  it('using transaction.asset.votes containing invalid vote format', function (done) {
    let transaction = node.createVoteTransaction({
      keyPair: account.keypair,
      votes: [`@${delegate}`]
    });

    postVote(transaction, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('message').to.equal('Invalid vote at index 0 - Invalid vote format');
      done();
    });
  });

  it('using transaction.asset.votes containing invalid vote length', function (done) {
    let transaction = node.createVoteTransaction({
      keyPair: account.keypair,
      votes: [`+${delegate}z`]
    });

    postVote(transaction, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('message').to.equal('Invalid vote at index 0 - Invalid vote length');
      done();
    });
  });

  it('using transaction.asset.votes containing manipulated vote', function (done) {
    let transaction = node.createVoteTransaction({
      keyPair: account.keypair,
      votes: ['+8a6d629685b18e17e5f534065bad4984a8aa6b499c5783c3e65f61779e6da06czz']
    });

    postVote(transaction, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('message').to.equal('Invalid vote at index 0 - Invalid vote length');
      done();
    });
  });

  it('voting twice for a delegate should fail', function (done) {
    node.async.series([
      function (seriesCb) {
        let transaction = node.createVoteTransaction({
          keyPair: account.keypair,
          votes: [`+${delegate}`]
        });
        postVote(transaction, function (err, res) {
          node.expect(res.body).to.have.property('success').to.be.true;
          return seriesCb();
        });
      },
      function (seriesCb) {
        setTimeout(seriesCb, 1000);
      },
      function (seriesCb) {
        let transaction2 = node.createVoteTransaction({
          keyPair: account.keypair,
          votes: [`+${delegate}`]
        });
        postVote(transaction2, function (err, res) {
          node.expect(res.body).to.have.property('success').to.be.true;
          return seriesCb();
        });
      },
      function (seriesCb) {
        return node.onNewBlock(seriesCb);
      },
      function (seriesCb) {
        let transaction2 = node.createVoteTransaction({
          keyPair: account.keypair,
          votes: [`+${delegate}`]
        });
        postVote(transaction2, function (err, res) {
          node.expect(res.body).to.have.property('success').to.be.false;
          return seriesCb();
        });
      },
      function (seriesCb) {
        getVotes(account.address, function (err, res) {
          node.expect(res.body).to.have.property('delegates').that.has.lengthOf(1);
          return seriesCb(err);
        });
      }
    ], function (err) {
      return done(err);
    });
  });

  it('removing votes from a delegate should be ok', function (done) {
    let transaction = node.createVoteTransaction({
      keyPair: account.keypair,
      votes: [`-${delegate}`]
    });
    postVote(transaction, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('transactionId').to.equal(transaction.id);
      node.onNewBlock(function (err) {
        getVotes(account.address, function (err, res) {
          node.expect(res.body).to.have.property('delegates').that.has.lengthOf(0);
        });
        return done(err);
      });
    });
  });

  it(['voting for', constants.maxVotesPerTransaction, 'delegates at once should be ok'].join(' '), function (done) {
    let transaction = node.createVoteTransaction({
      keyPair: account.keypair,
      votes: delegates.slice(0, constants.maxVotesPerTransaction).map((x) => `+${x}`)
    });

    postVote(transaction, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('transactionId').to.equal(transaction.id);
      node.onNewBlock(function (err) {
        getVotes(account.address, function (err, res) {
          node.expect(res.body).to.have.property('delegates').that.has.lengthOf(constants.maxVotesPerTransaction);
        });
        return done(err);
      });
    });
  });

  it(['removing votes from', constants.maxVotesPerTransaction, 'delegates at once should be ok'].join(' '), function (done) {
    let transaction = node.createVoteTransaction({
      keyPair: account.keypair,
      votes: delegates.slice(0, constants.maxVotesPerTransaction).map((x) => `-${x}`)
    });

    postVote(transaction, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('transactionId').to.equal(transaction.id);
      node.onNewBlock(function (err) {
        getVotes(account.address, function (err, res) {
          node.expect(res.body).to.have.property('delegates').that.has.lengthOf(0);
        });
        return done(err);
      });
    });
  });

  it(['voting for', constants.maxVotesPerTransaction + 1, 'delegates at once should fail'].join(' '), function (done) {
    let transaction = node.createVoteTransaction({
      keyPair: account.keypair,
      votes: delegates.slice(0, constants.maxVotesPerTransaction + 1).map((x) => `+${x}`)
    });

    postVote(transaction, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('message').to.equal(['Invalid transaction body - Failed to validate vote schema: Array is too long (', constants.maxVotesPerTransaction + 1, '), maximum ', constants.maxVotesPerTransaction].join(''));
      node.onNewBlock(function (err) {
        return done(err);
      });
    });
  });

  it('voting for 101 delegates separately should be ok', function (done) {
    postVotes({
      delegates: delegates,
      passphrase: account.password,
      action: '+',
      voteCb: function (err, res) {
        node.expect(res.body).to.have.property('success').to.be.true;
        node.expect(res.body).to.have.property('transactionId').that.is.a('string');
      }
    }, done);
  });

  it('votes count must be 101 now', function (done) {
    getVotes(account.address, function (err, res) {
      node.expect(res.body).to.have.property('delegates').that.has.lengthOf(101);
      done();
    });
  });

  it(['removing votes from', constants.maxVotesPerTransaction + 1, 'delegates at once should fail'].join(' '), function (done) {
    let transaction = node.createVoteTransaction({
      keyPair: account.keypair,
      votes: delegates.slice(0, constants.maxVotesPerTransaction + 1).map((x) => `-${x}`)
    });

    postVote(transaction, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('message').to.equal(['Invalid transaction body - Failed to validate vote schema: Array is too long (', constants.maxVotesPerTransaction + 1, '), maximum ', constants.maxVotesPerTransaction].join(''));
      node.onNewBlock(function (err) {
        return done(err);
      });
    });
  });

  it('removing votes from 101 delegates separately should be ok', function (done) {
    postVotes({
      delegates: delegates,
      passphrase: account.password,
      action: '-',
      voteCb: function (err, res) {
        node.expect(res.body).to.have.property('success').to.be.true;
        node.expect(res.body).to.have.property('transactionId').that.is.a('string');
      }
    }, done);
  });

  it('votes count must be 0 now', function (done) {
    getVotes(account.address, function (err, res) {
      node.expect(res.body).to.have.property('delegates').that.has.lengthOf(0);
      done();
    });
  });
});

describe('POST /peer/transactions after registering a new delegate', function () {
  before(function (done) {
    getDelegates(function (err, res) {
      delegates = res.body.delegates.map(function (delegate) {
        return delegate.publicKey;
      }).slice(0, 101);

      done();
    });
  });

  before(function (done) {
    sendADM({
      secret: node.iAccount.password,
      amount: 1500000000000, // 15k ADM
      recipientId: account.address
    }, done);
  });

  before(function (done) {
    registerDelegate(account, done);
  });

  it('voting for self should be ok', function (done) {
    let transaction = node.createVoteTransaction({
      keyPair: account.keypair,
      votes: [`+${account.publicKey.toString('hex')}`]
    });

    postVote(transaction, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('transactionId').to.equal(transaction.id);
      node.onNewBlock(function (err) {
        return done(err);
      });
    });
  });

  it('exceeding maximum of 101 votes should fail', function (done) {
    node.async.series([
      function (seriesCb) {
        getVotes(account.address, function (err, res) {
          node.expect(res.body).to.have.property('delegates').that.has.lengthOf(1);
          seriesCb(err);
        });
      },
      function (seriesCb) {
        var slicedDelegates = delegates.slice(0, 76);
        node.expect(slicedDelegates).to.have.lengthOf(76);

        postVotes({
          delegates: slicedDelegates,
          passphrase: account.password,
          action: '+',
          voteCb: function (err, res) {
            node.expect(res.body).to.have.property('success').to.be.true;
          }
        }, seriesCb);
      },
      function (seriesCb) {
        return node.onNewBlock(seriesCb);
      },
      function (seriesCb) {
        getVotes(account.address, function (err, res) {
          node.expect(res.body).to.have.property('delegates').that.has.lengthOf(77);
          seriesCb(err);
        });
      },
      function (seriesCb) {
        var slicedDelegates = delegates.slice(-25);
        node.expect(slicedDelegates).to.have.lengthOf(25);

        let transaction = node.createVoteTransaction({
          keyPair: account.keypair,
          votes: slicedDelegates.map((x) => `+${x}`)
        });

        postVote(transaction, function (err, res) {
          node.expect(res.body).to.have.property('success').to.be.false;
          node.expect(res.body).to.have.property('message').to.equal('Maximum number of 101 votes exceeded (1 too many)');
          seriesCb();
        });
      },
      function (seriesCb) {
        getVotes(account.address, function (err, res) {
          node.expect(res.body).to.have.property('delegates').that.has.lengthOf(77);
          seriesCb(err);
        });
      }
    ], function (err) {
      return done(err);
    });
  });

  it('removing vote from self should be ok', function (done) {
    let transaction = node.createVoteTransaction({
      keyPair: account.keypair,
      votes: [`-${account.publicKey.toString('hex')}`]
    });

    postVote(transaction, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('transactionId').to.equal(transaction.id);
      node.onNewBlock(function (err) {
        return done(err);
      });
    });
  });
});
