'use strict';

const { expect } = require('chai');
const sinon = require('sinon');

const Round = require('../../../logic/round.js');
const constants = require('../../../helpers/constants.js');

/**
 * Builds a minimal Round scope for testing applyRound() in isolation.
 * @param {object} overrides
 * @return {object}
 */
function buildScope (overrides) {
  const mergeAccountAndGet = sinon.stub().callsFake(function (data) {
    return JSON.stringify(data) + ';';
  });

  return Object.assign({
    backwards: false,
    finishRound: true,
    round: 1,
    roundOutsiders: [],
    roundDelegates: [],
    roundFees: 0,
    roundRewards: [],
    library: {
      logger: {
        debug: sinon.spy(),
        trace: sinon.spy()
      }
    },
    modules: {
      accounts: {
        mergeAccountAndGet: mergeAccountAndGet
      }
    },
    block: {
      generatorPublicKey: '0'.repeat(64),
      id: '101',
      height: constants.activeDelegates
    }
  }, overrides);
}

/**
 * Aggregates net per-delegate deltas emitted to mergeAccountAndGet.
 * @param {sinon.SinonStub} stub
 * @return {object}
 */
function aggregateDeltas (stub) {
  const totals = {};

  stub.getCalls().forEach(function (call) {
    const arg = call.args[0];
    if (!totals[arg.publicKey]) {
      totals[arg.publicKey] = { balance: 0, u_balance: 0, fees: 0, rewards: 0 };
    }
    totals[arg.publicKey].balance += arg.balance || 0;
    totals[arg.publicKey].u_balance += arg.u_balance || 0;
    totals[arg.publicKey].fees += arg.fees || 0;
    totals[arg.publicKey].rewards += arg.rewards || 0;
  });

  return totals;
}

describe('Round#applyRound', function () {
  it('pairs each delegate with its own reward on forward and backward settlement for mixed-reward rounds', function () {
    const delegates = Array.from({ length: constants.activeDelegates }, function (_, idx) {
      return idx.toString(16).padStart(64, '0');
    });
    // Simulate a milestone transition mid-round: blocks 1..21 get 50M, blocks 22..101 get 45M.
    const rewards = delegates.map(function (_, idx) {
      return idx < 21 ? 50000000 : 45000000;
    });
    const roundFees = (constants.activeDelegates * 1000) + 37;
    const originalDelegatesOrder = delegates.slice();

    const forwardScope = buildScope({
      backwards: false,
      round: 82179,
      roundDelegates: delegates.slice(),
      roundFees: roundFees,
      roundRewards: rewards.slice()
    });
    const backwardScope = buildScope({
      backwards: true,
      round: 82179,
      roundDelegates: delegates.slice(),
      roundFees: roundFees,
      roundRewards: rewards.slice()
    });
    const fakeTx = { none: sinon.stub().resolves() };

    const forwardRound = new Round(forwardScope, fakeTx);
    const backwardRound = new Round(backwardScope, fakeTx);

    return forwardRound.applyRound().then(function () {
      return backwardRound.applyRound();
    }).then(function () {
      // Scope input array must not be mutated in place on rollback.
      expect(backwardScope.roundDelegates).to.deep.equal(originalDelegatesOrder);

      // Backward calls must visit delegates in reverse order while subtracting each delegate's own reward.
      const backwardCalls = backwardScope.modules.accounts.mergeAccountAndGet.getCalls();
      expect(backwardCalls).to.have.length(constants.activeDelegates + 1);
      expect(backwardCalls[0].args[0].publicKey).to.equal(delegates[constants.activeDelegates - 1]);
      expect(backwardCalls[0].args[0].rewards).to.equal(-45000000);
      expect(backwardCalls[constants.activeDelegates - 1].args[0].publicKey).to.equal(delegates[0]);
      expect(backwardCalls[constants.activeDelegates - 1].args[0].rewards).to.equal(-50000000);

      // Remainder call must still target the last delegate of the round.
      expect(backwardCalls[constants.activeDelegates].args[0]).to.deep.include({
        publicKey: delegates[constants.activeDelegates - 1],
        balance: -37,
        u_balance: -37,
        fees: -37
      });

      // Net forward + backward delta must be exactly zero for every delegate.
      const forwardTotals = aggregateDeltas(forwardScope.modules.accounts.mergeAccountAndGet);
      const backwardTotals = aggregateDeltas(backwardScope.modules.accounts.mergeAccountAndGet);

      delegates.forEach(function (pk, idx) {
        const expectedReward = rewards[idx];
        const expectedFees = 1000 + (idx === constants.activeDelegates - 1 ? 37 : 0);

        expect(forwardTotals[pk]).to.deep.equal({
          balance: expectedFees + expectedReward,
          u_balance: expectedFees + expectedReward,
          fees: expectedFees,
          rewards: expectedReward
        });
        expect(backwardTotals[pk]).to.deep.equal({
          balance: -(expectedFees + expectedReward),
          u_balance: -(expectedFees + expectedReward),
          fees: -expectedFees,
          rewards: -expectedReward
        });
      });
    });
  });

  it('undoes round 1 accurately when block 1 has zero reward and blocks 2..101 have nonzero rewards', function () {
    const delegates = Array.from({ length: constants.activeDelegates }, function (_, idx) {
      return (idx + 1).toString(16).padStart(64, 'a');
    });
    const rewards = delegates.map(function (_, idx) {
      return idx === 0 ? 0 : 50000000;
    });

    const forwardScope = buildScope({
      backwards: false,
      round: 1,
      roundDelegates: delegates.slice(),
      roundFees: 50000000,
      roundRewards: rewards.slice()
    });
    const backwardScope = buildScope({
      backwards: true,
      round: 1,
      roundDelegates: delegates.slice(),
      roundFees: 50000000,
      roundRewards: rewards.slice()
    });
    const fakeTx = { none: sinon.stub().resolves() };

    return new Round(forwardScope, fakeTx).applyRound().then(function () {
      return new Round(backwardScope, fakeTx).applyRound();
    }).then(function () {
      const forwardTotals = aggregateDeltas(forwardScope.modules.accounts.mergeAccountAndGet);
      const backwardTotals = aggregateDeltas(backwardScope.modules.accounts.mergeAccountAndGet);

      delegates.forEach(function (pk) {
        expect(forwardTotals[pk].balance + backwardTotals[pk].balance).to.equal(0);
        expect(forwardTotals[pk].u_balance + backwardTotals[pk].u_balance).to.equal(0);
        expect(forwardTotals[pk].fees + backwardTotals[pk].fees).to.equal(0);
        expect(forwardTotals[pk].rewards + backwardTotals[pk].rewards).to.equal(0);
      });
    });
  });
});
