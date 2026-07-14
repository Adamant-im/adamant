'use strict';

const { expect } = require('chai');
const sinon = require('sinon');

const API = require('../../../modules/blocks/api.js');
const z_schema = require('../../../helpers/z_schema.js');

describe('blocks API', function () {
  let api;
  let db;

  beforeEach(function () {
    db = {
      query: sinon.stub().resolves([])
    };

    api = new API(
        { trace: sinon.spy(), error: sinon.spy() },
        db,
        { dbRead: sinon.spy((row) => row) },
        new z_schema(),
        { add: function (task, cb) { task(cb); } }
    );

    api.onBind({
      blocks: { lastBlock: { get: function () { return { height: 1 }; } } },
      system: {}
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
