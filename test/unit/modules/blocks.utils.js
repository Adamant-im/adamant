'use strict';

const { expect } = require('chai');
const sinon = require('sinon');

const Utils = require('../../../modules/blocks/utils.js');

// Focused test for the missing `.catch` on the inner loadBlocksData query: a
// rejected query must call back with an error instead of stalling the
// dbSequence task that owns it.
describe('blocks utils - loadBlocksData query rejection', function () {
  let utils;
  let logger;
  let db;
  let dbSequence;

  beforeEach(function () {
    logger = { trace: sinon.spy(), debug: sinon.spy(), error: sinon.spy(), info: sinon.spy() };
    db = { query: sinon.stub() };
    // getHeightByLastId resolves, the inner loadBlocksData query rejects.
    db.query.onFirstCall().resolves([{ height: 5 }]);
    db.query.onSecondCall().rejects(new Error('db connection lost'));

    dbSequence = { add: function (task, cb) { task(cb); } };

    utils = new Utils(logger, {}, {}, db, dbSequence, {});
  });

  it('calls back with an error when the blocks-data query rejects', function (done) {
    utils.loadBlocksData({ limit: 1 }, function (err, rows) {
      expect(err).to.equal('Blocks#loadBlockData error');
      expect(rows).to.equal(undefined);
      expect(db.query.calledTwice).to.equal(true);
      done();
    });
  });
});
