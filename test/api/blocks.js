'use strict';

var node = require('./../node.js');
var modulesLoader = require('./../common/initModule.js').modulesLoader;
const { expect } = require('chai');

var block = {
  blockHeight: 0,
  id: 0,
  generatorPublicKey: '',
  numberOfTransactions: 0,
  previousBlock: '',
  reward: 0,
  totalAmount: 0,
  totalFee: 0
};

var testBlocksUnder101 = false;

describe('GET /api/blocks/getBroadhash', function () {
  it('should be ok', function (done) {
    node.get('/api/blocks/getBroadhash', function (err, res) {
      node.expect(res.body).to.have.property('broadhash').to.be.a('string');
      done();
    });
  });
});

describe('GET /api/blocks/getEpoch', function () {
  it('should be ok', function (done) {
    node.get('/api/blocks/getEpoch', function (err, res) {
      node.expect(res.body).to.have.property('epoch').to.be.a('string');
      done();
    });
  });
});

describe('GET /api/blocks/getHeight', function () {
  it('should be ok', function (done) {
    node.get('/api/blocks/getHeight', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      if (res.body.success && res.body.height != null) {
        node.expect(res.body).to.have.property('height').to.be.above(0);
        block.blockHeight = res.body.height;

        if (res.body.height > 100) {
          testBlocksUnder101 = true;
        }
      }
      done();
    });
  });
});

describe('GET /api/blocks/getFee', function () {
  it('should be ok', function (done) {
    node.get('/api/blocks/getFee', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('fee');
      node.expect(res.body.fee).to.equal(node.fees.transactionFee);
      done();
    });
  });
});

describe('GET /api/blocks/getfees', function () {
  it('should be ok', function (done) {
    node.get('/api/blocks/getFees', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('fees');
      node.expect(res.body.fees.send).to.equal(node.fees.transactionFee);
      node.expect(res.body.fees.vote).to.equal(node.fees.voteFee);
      node.expect(res.body.fees.dapp).to.equal(node.fees.dappAddFee);
      node.expect(res.body.fees.secondsignature).to.equal(node.fees.secondPasswordFee);
      node.expect(res.body.fees.delegate).to.equal(node.fees.delegateRegistrationFee);
      node.expect(res.body.fees.multisignature).to.equal(node.fees.multisignatureRegistrationFee);
      done();
    });
  });
});

describe('GET /api/blocks/getNethash', function () {
  it('should be ok', function (done) {
    node.get('/api/blocks/getNethash', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('nethash').to.be.a('string');
      node.expect(res.body.nethash).to.equal(node.config.nethash);
      done();
    });
  });
});

describe('GET /api/blocks/getMilestone', function () {
  it('should be ok', function (done) {
    node.get('/api/blocks/getMilestone', function (err, res) {
      node.expect(res.body).to.have.property('milestone').to.be.a('number');
      done();
    });
  });
});

describe('GET /api/blocks/getReward', function () {
  it('should be ok', function (done) {
    node.get('/api/blocks/getReward', function (err, res) {
      node.expect(res.body).to.have.property('reward').to.be.a('number');
      done();
    });
  });
});

describe('GET /api/blocks/getSupply', function () {
  it('should be ok', function (done) {
    node.get('/api/blocks/getSupply', function (err, res) {
      node.expect(res.body).to.have.property('supply').to.be.a('number');
      done();
    });
  });
});

describe('GET /api/blocks/getStatus', function () {
  it('should be ok', function (done) {
    node.get('/api/blocks/getStatus', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('broadhash').to.be.a('string');
      node.expect(res.body).to.have.property('epoch').to.be.a('string');
      node.expect(res.body).to.have.property('height').to.be.a('number');
      node.expect(res.body).to.have.property('fee').to.be.a('number');
      node.expect(res.body).to.have.property('milestone').to.be.a('number');
      node.expect(res.body).to.have.property('nethash').to.be.a('string');
      node.expect(res.body).to.have.property('reward').to.be.a('number');
      node.expect(res.body).to.have.property('supply').to.be.a('number');
      done();
    });
  });
});

describe('GET /blocks (cache)', function () {
  var cache;

  before(function (done) {
    modulesLoader.initCache(function (err, __cache) {
      if (err) {
        return done(err);
      }

      cache = __cache;
      node.expect(__cache).to.be.an('object');
      return done(err, __cache);
    });
  });

  after(function (done) {
    cache.quit(done);
  });

  afterEach(function (done) {
    cache.flushDb(function (err, status) {
      if (err) {
        return done(err);
      }

      node.expect(status).to.equal('OK');
      done(err, status);
    });
  });

  it('cache blocks by the url and parameters when response is a success', function (done) {
    var url, params;
    url = '/api/blocks?';
    params = 'height=' + block.blockHeight;
    node.get(url + params, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('blocks').that.is.an('array');
      var response = res.body;
      cache.getJsonForKey(url + params, function (err, res) {
        if (err) {
          return done(err);
        }
        node.expect(res).to.eql(response);
        done();
      });
    });
  });

  it('should not cache if response is not a success', function (done) {
    var url, params;
    url = '/api/blocks?';
    params = 'height=' + -1000;
    node.get(url + params, function (err, res) {
      node.expect(res.body).to.have.property('success').to.not.be.ok;
      cache.getJsonForKey(url + params, function (err, res) {
        if (err) {
          return done(err);
        }

        node.expect(res).to.be.null;
        done();
      });
    });
  });

  it('should invalidate blocks cache on new block', function (done) {
    var url, params;
    url = '/api/blocks?';
    params = 'height=' + block.blockHeight;
    node.get(url + params, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('blocks').that.is.an('array');
      var response = res.body;
      cache.getJsonForKey(url + params, function (err, cachedResponseBefore) {
        if (err) {
          return done(err);
        }

        node.expect(cachedResponseBefore).to.eql(response);
        // Trigger the cache lifecycle hook directly. Waiting for public testnet
        // blocks makes this cache test depend on external forging and sync timing.
        cache.onNewBlock(null, null, function (err) {
          node.expect(err).to.not.exist;
          cache.getJsonForKey(url + params, function (err, cachedResponseAfter) {
            if (err) {
              return done(err);
            }

            node.expect(cachedResponseAfter).to.be.null;
            done();
          });
        });
      });
    });
  });
});

describe('GET /blocks', function () {
  function getBlocks (params, done) {
    node.get('/api/blocks?' + params, done);
  }

  it('using height should be ok', function (done) {
    getBlocks('height=' + block.blockHeight, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('blocks').that.is.an('array');
      node.expect(res.body.blocks.length).to.equal(1);
      node.expect(res.body.blocks[0]).to.have.property('previousBlock');
      node.expect(res.body.blocks[0]).to.have.property('totalAmount');
      node.expect(res.body.blocks[0]).to.have.property('totalFee');
      node.expect(res.body.blocks[0]).to.have.property('generatorId');
      node.expect(res.body.blocks[0]).to.have.property('confirmations');
      node.expect(res.body.blocks[0]).to.have.property('blockSignature');
      node.expect(res.body.blocks[0]).to.have.property('numberOfTransactions');
      node.expect(res.body.blocks[0].height).to.equal(block.blockHeight);
      block.id = res.body.blocks[0].id;
      block.generatorPublicKey = res.body.blocks[0].generatorPublicKey;
      block.numberOfTransactions = res.body.blocks[0].numberOfTransactions;
      block.previousBlock = res.body.blocks[0].previousBlock;
      block.reward = res.body.blocks[0].reward;
      block.totalAmount = res.body.blocks[0].totalAmount;
      block.totalFee = res.body.blocks[0].totalFee;
      done();
    });
  });

  it('using height < 100 should be ok', function (done) {
    if (!testBlocksUnder101) {
      return this.skip();
    }

    getBlocks('height=' + 10, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('blocks').that.is.an('array');
      node.expect(res.body.blocks.length).to.equal(1);
      node.expect(res.body.blocks[0]).to.have.property('previousBlock');
      node.expect(res.body.blocks[0]).to.have.property('totalAmount');
      node.expect(res.body.blocks[0]).to.have.property('totalFee');
      node.expect(res.body.blocks[0]).to.have.property('generatorId');
      node.expect(res.body.blocks[0]).to.have.property('confirmations');
      node.expect(res.body.blocks[0]).to.have.property('blockSignature');
      node.expect(res.body.blocks[0]).to.have.property('numberOfTransactions');
      node.expect(res.body.blocks[0].height).to.equal(10);
      done();
    });
  });

  it('using generatorPublicKey should be ok', function (done) {
    getBlocks('generatorPublicKey=' + block.generatorPublicKey, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('blocks').that.is.an('array');
      for (var i = 0; i < res.body.blocks.length; i++) {
        node.expect(res.body.blocks[i].generatorPublicKey).to.equal(block.generatorPublicKey);
      }
      done();
    });
  });

  it('using an unknown generatorPublicKey should return an empty list', function (done) {
    const unknownPublicKey = 'aa11111111111111111111111111111111111111111111111111111111111111';

    getBlocks(`generatorPublicKey=${unknownPublicKey}&orderBy=height:desc&limit=1`, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('blocks').that.eql([]);
      done();
    });
  });

  it('using numberOfTransactions == 0 should be ok', function (done) {
    getBlocks('numberOfTransactions=0&orderBy=height:asc&limit=1', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('blocks').that.is.an('array').and.is.not.empty;
      node.expect(res.body.blocks[0].numberOfTransactions).to.equal(0);
      done();
    });
  });

  it('using totalFee should be ok', function (done) {
    getBlocks('totalFee=' + block.totalFee, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('blocks').that.is.an('array');
      for (var i = 0; i < res.body.blocks.length; i++) {
        node.expect(res.body.blocks[i].totalFee).to.equal(block.totalFee);
      }
      done();
    });
  });

  it('using totalAmount should be ok', function (done) {
    getBlocks('totalAmount=' + block.totalAmount, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('blocks').that.is.an('array');
      for (var i = 0; i < res.body.blocks.length; i++) {
        node.expect(res.body.blocks[i].totalAmount).to.equal(block.totalAmount);
      }
      done();
    });
  });

  it('using reward should be ok', function (done) {
    getBlocks('reward=' + block.reward, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('blocks').that.is.an('array');
      for (var i = 0; i < res.body.blocks.length; i++) {
        node.expect(res.body.blocks[i].reward).to.equal(block.reward);
      }
      done();
    });
  });

  it('using limit and offset should be ok', function (done) {
    getBlocks('orderBy=height:asc&limit=2&offset=1', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('blocks').that.has.length(2);
      node.expect(res.body.blocks[0].height).to.equal(2);
      node.expect(res.body.blocks[1].height).to.equal(3);
      done();
    });
  });

  it('using all equality filters together should be ok', function (done) {
    const params = [
      `generatorPublicKey=${block.generatorPublicKey}`,
      `numberOfTransactions=${block.numberOfTransactions}`,
      `previousBlock=${block.previousBlock}`,
      `height=${block.blockHeight}`,
      `totalAmount=${block.totalAmount}`,
      `totalFee=${block.totalFee}`,
      `reward=${block.reward}`
    ].join('&');

    getBlocks(params, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('blocks').that.has.length(1);
      node.expect(res.body.blocks[0].id).to.equal(block.id);
      done();
    });
  });

  it('using previousBlock should be ok', function (done) {
    if (!block.previousBlock) {
      return this.skip();
    }

    getBlocks('previousBlock=' + block.previousBlock, function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('blocks').that.is.an('array');
      node.expect(res.body.blocks).to.have.length(1);
      node.expect(res.body.blocks[0].id).to.equal(block.id);
      node.expect(res.body.blocks[0].previousBlock).to.equal(block.previousBlock);
      done();
    });
  });

  it('using orderBy == "height:asc" should be ok', function (done) {
    getBlocks('orderBy=' + 'height:asc', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('blocks').that.is.an('array');
      for (var i = 0; i < res.body.blocks.length; i++) {
        if (res.body.blocks[i + 1] != null) {
          node.expect(res.body.blocks[i].height).to.be.below(res.body.blocks[i + 1].height);
        }
      }
      done();
    });
  });

  it('using orderBy == "height:desc" should be ok', function (done) {
    getBlocks('orderBy=' + 'height:desc', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('blocks').that.is.an('array');
      for (var i = 0; i < res.body.blocks.length; i++) {
        if (res.body.blocks[i + 1] != null) {
          node.expect(res.body.blocks[i].height).to.be.above(res.body.blocks[i + 1].height);
        }
      }
      done();
    });
  });

  it('should be ordered by "height:desc" by default', function (done) {
    getBlocks('', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('blocks').that.is.an('array');
      for (var i = 0; i < res.body.blocks.length; i++) {
        if (res.body.blocks[i + 1] != null) {
          node.expect(res.body.blocks[i].height).to.be.above(res.body.blocks[i + 1].height);
        }
      }
      done();
    });
  });
});

describe('GET /api/blocks/get?id=', function () {
  function getBlocks (id, done) {
    node.get('/api/blocks/get?id=' + id, done);
  }

  it('using genesisblock id should be ok', function (done) {
    getBlocks('6438017970172540087', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.true;
      node.expect(res.body).to.have.property('block').to.be.an('object');
      node.expect(res.body.block).to.have.property('id').to.be.a('string');
      done();
    });
  });

  it('using unknown id should fail', function (done) {
    getBlocks('9928719876370886655', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error').to.be.a('string');
      done();
    });
  });

  it('using no id should fail', function (done) {
    getBlocks('', function (err, res) {
      node.expect(res.body).to.have.property('success').to.be.false;
      node.expect(res.body).to.have.property('error').to.be.a('string');
      done();
    });
  });
});
