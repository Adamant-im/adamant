'use strict';

const { expect } = require('chai');
const sinon = require('sinon');

const API = require('../../../modules/blocks/api.js');
const z_schema = require('../../../helpers/z_schema.js');

describe('blocks API', function () {
  let api;
  let db;
  let blockHeight;
  let consensus;

  beforeEach(function () {
    db = {
      query: sinon.stub().resolves([])
    };
    blockHeight = 1;
    consensus = {
      getActiveCodeName: sinon.stub().callsFake((height) => height >= 2 ? 'fairSystem' : null)
    };

    api = new API(
        { trace: sinon.spy(), error: sinon.spy() },
        db,
        { dbRead: sinon.spy((row) => row), calculateFee: sinon.stub().returns(50000000) },
        new z_schema(),
        { add: function (task, cb) { task(cb); } },
        consensus
    );

    api.onBind({
      blocks: { lastBlock: { get: function () { return { height: blockHeight }; } } },
      system: {
        getBroadhash: sinon.stub().returns('broadhash'),
        getNethash: sinon.stub().returns('nethash')
      }
    });
  });

  it('returns the consensus code name for the applied block height', function (done) {
    blockHeight = 2;

    api.getStatus({}, function (err, data) {
      expect(err).to.not.exist;
      expect(data.consensusCodeName).to.equal('fairSystem');
      expect(consensus.getActiveCodeName.calledOnceWithExactly(blockHeight)).to.equal(true);
      done();
    });
  });

  it('applies numberOfTransactions when it is zero', function (done) {
    api.getBlocks({ body: { numberOfTransactions: 0 } }, function (err, data) {
      expect(err).to.not.exist;
      expect(data.blocks).to.eql([]);
      expect(db.query.calledOnce).to.equal(true);

      const [query, params] = db.query.firstCall.args;
      expect(query).to.include('"b_numberOfTransactions" = ${numberOfTransactions}');
      expect(params.numberOfTransactions).to.equal(0);
      done();
    });
  });

  it('rejects a negative numberOfTransactions', function (done) {
    api.getBlocks({ body: { numberOfTransactions: -1 } }, function (err) {
      expect(err).to.equal('Value -1 is less than minimum 0');
      expect(db.query.called).to.equal(false);
      done();
    });
  });

  [
    'id',
    'timestamp',
    'height',
    'previousBlock',
    'totalAmount',
    'totalFee',
    'reward',
    'numberOfTransactions',
    'generatorPublicKey'
  ].forEach(function (field) {
    it(`orders by ${field}`, function (done) {
      api.getBlocks({ body: { orderBy: `${field}:desc` } }, function (err) {
        expect(err).to.not.exist;
        expect(db.query.calledOnce).to.equal(true);
        expect(db.query.firstCall.args[0]).to.include(`ORDER BY \"b_${field}\" DESC`);
        done();
      });
    });
  });
});
