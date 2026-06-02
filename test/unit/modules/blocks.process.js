'use strict';

const { expect } = require('chai');
const sinon = require('sinon');

const Process = require('../../../modules/blocks/process.js');

describe('blocks process', function () {
  let process;
  let db;
  let dbSequence;
  let logger;
  let logicPeers;
  let schema;
  let blocks;
  let transport;
  let lastBlock;

  beforeEach(function () {
    lastBlock = { id: '1', height: 1 };

    logger = {
      debug: sinon.spy(),
      error: sinon.spy(),
      info: sinon.spy(),
      trace: sinon.spy()
    };
    db = {
      query: sinon.stub().resolves([])
    };
    dbSequence = {
      add: function (task, cb) {
        task(cb);
      }
    };
    logicPeers = {
      create: function (peer) {
        return Object.assign({ string: '127.0.0.1:36667' }, peer);
      }
    };
    schema = {
      validate: sinon.stub().returns(true)
    };
    blocks = {
      chain: {
        applyBlock: sinon.spy(),
        applyGenesisBlock: sinon.spy()
      },
      isCleaning: {
        get: sinon.stub().returns(false)
      },
      lastBlock: {
        get: sinon.stub().returns(lastBlock),
        set: sinon.spy()
      },
      utils: {
        readDbRows: sinon.stub().returns([{ id: '2', height: 2 }])
      },
      verify: {
        processBlock: sinon.spy()
      }
    };
    transport = {
      getFromPeer: sinon.stub().callsArgWith(2, null, { body: { blocks: [{}] } })
    };

    process = new Process(
        logger,
        {},
        logicPeers,
        {},
        schema,
        db,
        dbSequence,
        {},
        { block: { id: '1' } }
    );
    process.onBind({
      blocks,
      transport
    });
  });

  it('should stop loadBlocksOffset before applying the next block', function (done) {
    process.loadBlocksOffset(1, 0, true, function (err, result) {
      expect(err).to.equal(null);
      expect(result).to.equal(lastBlock);
      expect(blocks.chain.applyBlock.called).to.equal(false);
      expect(blocks.chain.applyGenesisBlock.called).to.equal(false);
      expect(blocks.lastBlock.set.called).to.equal(false);
      done();
    }, function () {
      return true;
    });
  });

  it('should stop loadBlocksFromPeer before processing the next block', function (done) {
    process.loadBlocksFromPeer({ ip: '127.0.0.1', port: 36667 }, function (err, result) {
      expect(err).to.equal(null);
      expect(result).to.equal(lastBlock);
      expect(blocks.verify.processBlock.called).to.equal(false);
      done();
    }, function () {
      return true;
    });
  });
});
