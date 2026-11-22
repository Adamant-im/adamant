'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
var _ = require('lodash');
var constants = require('../../../helpers/constants.js');
var Rounds = require('../../../modules/rounds.js');
var Round = require('../../../logic/round.js');
var sql = require('../../../sql/rounds.js');
var modulesLoader = require('../../common/initModule').modulesLoader;

describe('rounds', function () {
  var rounds;

  before(function (done) {
    modulesLoader.initModuleWithDb(Rounds, function (err, __rounds) {
      if (err) {
        return done(err);
      }
      rounds = __rounds;
      done();
    });
  });

  describe('calc', function () {
    it('should calculate round number from given block height', function () {
      expect(rounds.calc(100)).equal(1);
      expect(rounds.calc(200)).equal(2);
      expect(rounds.calc(303)).equal(3);
      expect(rounds.calc(304)).equal(4);
    });

    it('should calculate round number from Number.MAX_VALUE', function () {
      var res = rounds.calc(Number.MAX_VALUE);
      expect(_.isNumber(res)).to.be.true;
      expect(res).to.be.below(Number.MAX_VALUE);
    });
  });

  describe('balance notifications', function () {
    var accounts;
    var clientWs;
    var db;
    var testRounds;

    beforeEach(function (done) {
      accounts = {
        generateAddressByPublicKey: sinon.stub().returns('U123456'),
        getAccount: sinon.spy()
      };
      clientWs = { emitBalanceChange: sinon.spy() };
      db = {
        query: sinon.stub().resolves([{
          fees: 0,
          rewards: [0],
          delegates: ['a'.repeat(64)]
        }]),
        tx: sinon.stub().callsFake(function (handler) {
          return Promise.resolve(handler({}));
        })
      };

      sinon.stub(Round.prototype, 'mergeBlockGenerator').resolves();
      sinon.stub(Round.prototype, 'land').resolves();
      sinon.stub(Round.prototype, 'truncateBlocks').resolves();

      new Rounds(function (err, instance) {
        if (err) {
          return done(err);
        }

        testRounds = instance;
        testRounds.onBind({
          accounts: accounts,
          blocks: {},
          delegates: {}
        });
        done();
      }, {
        bus: { message: sinon.spy() },
        clientWs: clientWs,
        config: { loading: { snapshot: 0 } },
        db: db,
        logger: {
          debug: sinon.spy(),
          error: sinon.spy(),
          trace: sinon.spy()
        },
        network: { wsServer: { emit: sinon.spy() } }
      });
    });

    afterEach(function () {
      sinon.restore();
    });

    it('should not publish delegate balances on an intermediate block', function (done) {
      testRounds.tick({ id: 'intermediate-block', height: 2 }, function (err) {
        expect(err).not.to.exist;
        expect(clientWs.emitBalanceChange.called).to.equal(false);
        done();
      });
    });

    it('should publish delegate balances after completing a round', function (done) {
      testRounds.tick({ id: 'round-block', height: 1 }, function (err) {
        expect(err).not.to.exist;
        expect(clientWs.emitBalanceChange.calledOnce).to.equal(true);
        expect(clientWs.emitBalanceChange.firstCall.args[0]).to.equal('U123456');
        expect(clientWs.emitBalanceChange.firstCall.args[1]).to.deep.equal([
          'balance',
          'u_balance'
        ]);
        expect(clientWs.emitBalanceChange.firstCall.args[2]).to.be.a('function');
        done();
      });
    });

    it('should not publish delegate balances when a snapshot finishes', function (done) {
      testRounds.setSnapshotRounds(1);

      testRounds.tick({ id: 'snapshot-block', height: 1 }, function (err) {
        expect(err).to.equal('Snapshot finished');
        expect(clientWs.emitBalanceChange.called).to.equal(false);
        done();
      });
    });
  });

  describe('sumRound height bounds', function () {
    var accounts;
    var db;
    var delegates;
    var testRounds;

    beforeEach(function (done) {
      accounts = {
        generateAddressByPublicKey: sinon.stub().callsFake(function (pk) {
          return 'U' + pk.slice(0, 10);
        }),
        getAccount: sinon.spy()
      };
      delegates = {
        generateDelegateList: sinon.stub().callsArgWith(1, null, ['a'.repeat(64)])
      };
      db = {
        query: sinon.stub().resolves([{
          fees: '50000000',
          rewards: ['10000000'],
          delegates: ['a'.repeat(64)]
        }]),
        tx: sinon.stub().callsFake(function (handler) {
          return Promise.resolve(handler({
            none: sinon.stub().resolves()
          }));
        })
      };

      sinon.stub(Round.prototype, 'mergeBlockGenerator').resolves();
      sinon.stub(Round.prototype, 'land').resolves();
      sinon.stub(Round.prototype, 'backwardLand').resolves();
      sinon.stub(Round.prototype, 'markBlockId').resolves();
      sinon.stub(Round.prototype, 'truncateBlocks').resolves();

      new Rounds(function (err, instance) {
        if (err) {
          return done(err);
        }

        testRounds = instance;
        testRounds.onBind({
          accounts: accounts,
          blocks: {},
          delegates: delegates
        });
        done();
      }, {
        bus: { message: sinon.spy() },
        clientWs: null,
        config: { loading: { snapshot: 0 } },
        db: db,
        logger: {
          debug: sinon.spy(),
          error: sinon.spy(),
          trace: sinon.spy()
        },
        network: { wsServer: { emit: sinon.spy() } }
      });
    });

    afterEach(function () {
      sinon.restore();
    });

    it('should bound summedRound by height 1 during genesis tick', function (done) {
      testRounds.tick({ id: 'genesis', height: 1 }, function (err) {
        expect(err).not.to.exist;
        expect(db.query.calledOnce).to.equal(true);
        expect(db.query.firstCall.args).to.deep.equal([
          sql.summedRound,
          {
            round: 1,
            activeDelegates: constants.activeDelegates,
            height: 1
          }
        ]);
        expect(delegates.generateDelegateList.called).to.equal(false);
        expect(Round.prototype.land.calledOnce).to.equal(true);
        done();
      });
    });

    it('should skip summedRound on intermediate forward ticks', function (done) {
      testRounds.tick({ id: 'block-2', height: 2 }, function (err) {
        expect(err).not.to.exist;
        expect(db.query.called).to.equal(false);
        expect(Round.prototype.land.called).to.equal(false);

        testRounds.tick({ id: 'block-100', height: 100 }, function (err2) {
          expect(err2).not.to.exist;
          expect(db.query.called).to.equal(false);
          expect(Round.prototype.land.called).to.equal(false);
          done();
        });
      });
    });

    it('should bound summedRound by round-end heights 101 and 202 during forward tick', function (done) {
      testRounds.tick({ id: 'block-101', height: 101 }, function (err) {
        expect(err).not.to.exist;
        expect(db.query.calledOnce).to.equal(true);
        expect(db.query.firstCall.args).to.deep.equal([
          sql.summedRound,
          {
            round: 1,
            activeDelegates: constants.activeDelegates,
            height: 101
          }
        ]);
        expect(delegates.generateDelegateList.calledOnceWith(101)).to.equal(true);

        testRounds.tick({ id: 'block-202', height: 202 }, function (err2) {
          expect(err2).not.to.exist;
          expect(db.query.calledTwice).to.equal(true);
          expect(db.query.secondCall.args).to.deep.equal([
            sql.summedRound,
            {
              round: 2,
              activeDelegates: constants.activeDelegates,
              height: 202
            }
          ]);
          expect(delegates.generateDelegateList.calledTwice).to.equal(true);
          expect(delegates.generateDelegateList.secondCall.args[0]).to.equal(202);
          done();
        });
      });
    });

    it('should bound summedRound inclusively by block height during backwardTick at round boundaries', function (done) {
      testRounds.backwardTick({ id: 'block-101', height: 101 }, { id: 'block-100', height: 100 }, function (err) {
        expect(err).not.to.exist;
        expect(db.query.calledOnce).to.equal(true);
        expect(db.query.firstCall.args).to.deep.equal([
          sql.summedRound,
          {
            round: 1,
            activeDelegates: constants.activeDelegates,
            height: 101
          }
        ]);
        expect(Round.prototype.backwardLand.calledOnce).to.equal(true);

        testRounds.backwardTick({ id: 'block-202', height: 202 }, { id: 'block-201', height: 201 }, function (err2) {
          expect(err2).not.to.exist;
          expect(db.query.calledTwice).to.equal(true);
          expect(db.query.secondCall.args).to.deep.equal([
            sql.summedRound,
            {
              round: 2,
              activeDelegates: constants.activeDelegates,
              height: 202
            }
          ]);
          expect(Round.prototype.backwardLand.calledTwice).to.equal(true);
          done();
        });
      });
    });

    it('should skip summedRound on intermediate backward ticks', function (done) {
      testRounds.backwardTick({ id: 'block-100', height: 100 }, { id: 'block-99', height: 99 }, function (err) {
        expect(err).not.to.exist;
        expect(db.query.called).to.equal(false);
        expect(Round.prototype.backwardLand.called).to.equal(false);
        done();
      });
    });
  });
});
