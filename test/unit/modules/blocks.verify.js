'use strict';

const { expect } = require('chai');
const sinon = require('sinon');

const Verify = require('../../../modules/blocks/verify.js');

// Focused tests for the `shouldStop` gate added to processBlock(): an aborted
// sync run must verify but never apply a block, so a run the loader watchdog
// abandons can never mutate chain state when it resumes.
describe('blocks verify - processBlock shouldStop gate', function () {
  let verify;
  let logger;
  let db;
  let blockLogic;
  let applyBlock;
  let delegates;

  beforeEach(function () {
    logger = { trace: sinon.spy(), debug: sinon.spy(), error: sinon.spy(), info: sinon.spy() };
    db = { query: sinon.stub().resolves([]) }; // checkExists: block id not in db
    blockLogic = { objectNormalize: (block) => block };
    applyBlock = sinon.spy();
    delegates = {
      validateBlockSlot: sinon.stub().callsArgWith(1, null),
      fork: sinon.spy()
    };

    verify = new Verify(logger, blockLogic, {}, db);
    // Bypass the heavy sanity-check pipeline; we only care about the apply gate.
    sinon.stub(verify, 'verifyBlock').returns({ verified: true, errors: [] });

    verify.onBind({
      accounts: {},
      blocks: {
        isCleaning: { get: () => false },
        chain: { applyBlock }
      },
      delegates,
      transactions: {}
    });
  });

  function process (shouldStop, cb) {
    verify.processBlock({ id: '2', height: 2, transactions: [] }, false, cb, true, shouldStop);
  }

  it('does not apply the block when shouldStop() returns true', function (done) {
    process(() => true, function (err) {
      expect(err).to.equal('Sync aborted before applying block');
      expect(applyBlock.called).to.equal(false);
      done();
    });
  });

  it('applies the block when shouldStop() returns false', function (done) {
    applyBlock = sinon.spy(function (block, broadcast, cb) {
      return cb(null);
    });
    verify.onBind({
      accounts: {},
      blocks: { isCleaning: { get: () => false }, chain: { applyBlock } },
      delegates,
      transactions: {}
    });

    process(() => false, function (err) {
      expect(err).to.equal(null);
      expect(applyBlock.calledOnce).to.equal(true);
      done();
    });
  });

  it('applies the block when no shouldStop predicate is supplied (live/forge path)', function (done) {
    applyBlock = sinon.spy(function (block, broadcast, cb) {
      return cb(null);
    });
    verify.onBind({
      accounts: {},
      blocks: { isCleaning: { get: () => false }, chain: { applyBlock } },
      delegates,
      transactions: {}
    });

    verify.processBlock({ id: '2', height: 2, transactions: [] }, false, function (err) {
      expect(err).to.equal(null);
      expect(applyBlock.calledOnce).to.equal(true);
      done();
    }, true);
  });
});
