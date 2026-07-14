'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
var express = require('express');
var _ = require('lodash');
var Rounds = require('../../../modules/rounds.js');
var Round = require('../../../logic/round.js');
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
  });
});
