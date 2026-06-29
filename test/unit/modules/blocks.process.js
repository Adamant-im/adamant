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
  let loader;
  let rounds;
  let sequence;
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
    loader = {
      getBlocksToSync: sinon.stub().returns(4),
      isReadyToSync: sinon.stub().returns(true),
      syncing: sinon.stub().returns(false)
    };
    rounds = {
      ticking: sinon.stub().returns(false)
    };
    sequence = {
      add: sinon.spy()
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
        sequence,
        { block: { id: '1' } }
    );
    process.onBind({
      blocks,
      loader,
      rounds,
      transport
    });
  });

  it('should not queue live blocks while syncing', function () {
    loader.syncing.returns(true);

    process.onReceiveBlock({ id: '2' });

    expect(sequence.add.called).to.equal(false);
    expect(logger.debug.calledWith(
        'loader',
        'Client not yet ready to receive block',
        '2'
    )).to.equal(true);
  });

  it('should queue live blocks when ready', function () {
    process.onReceiveBlock({ id: '2' });

    expect(sequence.add.calledOnce).to.equal(true);
  });

  it('should not queue live blocks before the node is ready to sync', function () {
    loader.isReadyToSync.returns(false);

    process.onReceiveBlock({ id: '2' });

    expect(sequence.add.called).to.equal(false);
    expect(logger.debug.calledWith(
        'loader',
        'Client not yet ready to receive block',
        '2'
    )).to.equal(true);
  });

  it('should not queue live blocks while a round is ticking', function () {
    rounds.ticking.returns(true);

    process.onReceiveBlock({ id: '2' });

    expect(sequence.add.called).to.equal(false);
    expect(logger.debug.calledWith(
        'loader',
        'Client not yet ready to receive block',
        '2'
    )).to.equal(true);
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

  it('should log sync target and progress for loaded peer blocks', function (done) {
    blocks.verify.processBlock = sinon.stub().callsArgWith(2, null);

    process.loadBlocksFromPeer({ ip: '127.0.0.1', port: 36667 }, function (err, result) {
      expect(err).to.equal(null);
      expect(result).to.eql({ id: '2', height: 2 });
      expect(logger.info.calledWith(
          'loader',
          'Block 2 loaded from: 127.0.0.1:36667',
          'target: 4 height: 2 (50.00%)'
      )).to.equal(true);
      done();
    });
  });
});
