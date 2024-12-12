'use strict';

const { expect } = require('chai');
const _ = require('lodash');

const RoundChanges = require('../../../helpers/RoundChanges.js');

describe('RoundChanges', () => {
  let validScope;

  beforeEach(() => {
    validScope = {
      round: 1,
      roundFees: 500,
      roundRewards: [0, 0, 100, 10],
    };
  });

  describe('constructor()', () => {
    it('should accept valid scope', () => {
      const roundChanges = new RoundChanges(validScope);

      expect(roundChanges.roundFees).to.equal(validScope.roundFees);
      expect(_.isEqual(roundChanges.roundRewards, validScope.roundRewards)).to
        .be.true;
    });

    it('should floor fees value', () => {
      validScope.roundFees = 50.9999999999999; // Float

      const roundChanges = new RoundChanges(validScope);
      expect(roundChanges.roundFees).to.equal(50);
    });

    it('should round up fees after exceeding precision', () => {
      validScope.roundFees = 50.999999999999999; // Exceeded precision

      const roundChanges = new RoundChanges(validScope);
      expect(roundChanges.roundFees).to.equal(51);
    });

    it('should accept `Infinity` fees as expected', () => {
      validScope.roundFees = Infinity;

      const roundChanges = new RoundChanges(validScope);
      expect(roundChanges.roundFees).to.equal(Infinity);
    });
  });

  describe('at()', () => {
    it('should calculate round changes from valid scope', () => {
      const roundChanges = new RoundChanges(validScope);
      const rewardsAt = 2;
      const response = roundChanges.at(rewardsAt);

      expect(response.fees).to.equal(4);
      expect(response.feesRemaining).to.equal(96);
      expect(response.rewards).to.equal(validScope.roundRewards[rewardsAt]); // 100
      expect(response.balance).to.equal(104);
    });

    it('should calculate round changes from `Infinity` fees', () => {
      validScope.roundFees = Infinity;

      const roundChanges = new RoundChanges(validScope);
      const rewardsAt = 2;
      const response = roundChanges.at(rewardsAt);

      expect(response.fees).to.equal(Infinity);
      expect(response.feesRemaining).to.be.NaN;
      expect(response.rewards).to.equal(validScope.roundRewards[rewardsAt]); // 100
      expect(response.balance).to.equal(Infinity);
    });

    it('should calculate round changes from `Number.MAX_VALUE` fees', () => {
      validScope.roundFees = Number.MAX_VALUE; // 1.7976931348623157e+308

      const roundChanges = new RoundChanges(validScope);
      const rewardsAt = 2;
      const response = roundChanges.at(rewardsAt);

      /* eslint-disable max-len */
      const expectedFees = 1779894192932990099009900990099009900990099009900990099009900990099009900990099009900990099009900990099009900990099009900990099009900990099009900990099009900990099009900990099009900990099009900990099009900990099009900990099009900990099009900990099009900990099009900990099009900990099009900990099009900990099; // 1.7976931348623157e+308 / 101 (delegates num)

      expect(response.fees).to.equal(expectedFees);
      expect(response.rewards).to.equal(validScope.roundRewards[rewardsAt]); // 100
      expect(response.feesRemaining).to.equal(1);

      const expectedBalance = 1779894192932990099009900990099009900990099009900990099009900990099009900990099009900990099009900990099009900990099009900990099009900990099009900990099009900990099009900990099009900990099009900990099009900990099009900990099009900990099009900990099009900990099009900990099009900990099009900990099009900990199; // 1.7976931348623157e+308 / 101 (delegates num) + 100
      expect(response.balance).to.equal(expectedBalance);
    });
  });
});
