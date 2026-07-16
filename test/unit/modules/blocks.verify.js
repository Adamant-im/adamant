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

  it('fails the series instead of hanging when the checkExists query rejects', function (done) {
    db.query.rejects(new Error('db connection lost'));

    process(() => false, function (err) {
      expect(err).to.equal('Blocks#checkExists error');
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

// The fork-2 branch in checkTransaction() writes to the volatile unconfirmed
// pool (undoUnconfirmed) before the apply gate. When the run is aborted that
// pre-apply write must be skipped too, so the abort boundary is explicit for
// every pre-apply state mutation.
describe('blocks verify - checkTransaction fork-2 shouldStop gate', function () {
  let verify;
  let logger;
  let db;
  let blockLogic;
  let transactionLogic;
  let transactions;
  let delegates;
  let applyBlock;

  const block = { id: '2', height: 2, transactions: [{ id: 't1' }] };

  beforeEach(function () {
    logger = { trace: sinon.spy(), debug: sinon.spy(), error: sinon.spy(), info: sinon.spy() };
    db = { query: sinon.stub().resolves([]) };
    blockLogic = { objectNormalize: (b) => b };
    transactionLogic = {
      getId: sinon.stub().returns('t1'),
      // checkConfirmed errors -> fork-2 path (transaction already confirmed)
      checkConfirmed: sinon.stub().callsArgWith(1, 'Transaction is already confirmed'),
      verify: sinon.stub().callsArgWith(2, null)
    };
    transactions = {
      undoUnconfirmed: sinon.stub().callsArgWith(1, null),
      removeUnconfirmedTransaction: sinon.spy()
    };
    delegates = {
      validateBlockSlot: sinon.stub().callsArgWith(1, null),
      fork: sinon.spy()
    };
    applyBlock = sinon.spy();

    verify = new Verify(logger, blockLogic, transactionLogic, db);
    sinon.stub(verify, 'verifyBlock').returns({ verified: true, errors: [] });
    verify.onBind({
      accounts: { getAccount: sinon.stub().callsArgWith(1, null, {}) },
      blocks: { isCleaning: { get: () => false }, chain: { applyBlock } },
      delegates,
      transactions
    });
  });

  it('skips the unconfirmed undo write when the run is aborted', function (done) {
    verify.processBlock(block, false, function (err) {
      expect(err).to.equal('Transaction is already confirmed');
      expect(delegates.fork.calledWith(block, 2)).to.equal(true);
      expect(transactions.undoUnconfirmed.called).to.equal(false);
      expect(transactions.removeUnconfirmedTransaction.called).to.equal(false);
      expect(applyBlock.called).to.equal(false);
      done();
    }, true, () => true);
  });

  it('performs the unconfirmed undo write when the run is not aborted', function (done) {
    verify.processBlock(block, false, function (err) {
      expect(err).to.equal('Transaction is already confirmed');
      expect(transactions.undoUnconfirmed.calledOnce).to.equal(true);
      expect(transactions.removeUnconfirmedTransaction.calledOnce).to.equal(true);
      expect(applyBlock.called).to.equal(false);
      done();
    }, true, () => false);
  });
});
