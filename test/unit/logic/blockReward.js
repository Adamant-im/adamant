'use strict';

var chai = require('chai');
var expect = require('chai').expect;

var BlockReward = require('../../../logic/blockReward.js');
var constants = require('../../../helpers/constants.js');

constants.rewards.distance = 3000000;
constants.rewards.offset = 1451520;

const milestones = [
    50000000, // Initial Reward
    45000000, // Milestone 1
    40000000, // Milestone 2
    35000000, // Milestone 3
    30000000,  // Milestone 4
    25000000,  // Milestone 5
    20000000,  // Milestone 6
    15000000,  // Milestone 7
    10000000  // Milestone 8
];

describe('BlockReward', function () {

	var blockReward = new BlockReward();

	describe('returning calcMilestone', function () {

		it('when height is undefined should throw an error', function () {
			expect(blockReward.calcMilestone).to.throw(/Invalid block height/);
		});

		it('when height == 0 should return 0', function () {
			expect(blockReward.calcMilestone(0)).to.equal(0);
		});

		it('when height == 1 should return 0', function () {
			expect(blockReward.calcMilestone(1)).to.equal(0);
		});

		it('when height == (offset - 1) should return 0', function () {
			expect(blockReward.calcMilestone(1451519)).to.equal(0);
		});

		it('when height == (offset) should return 0', function () {
			expect(blockReward.calcMilestone(1451520)).to.equal(0);
		});

		it('when height == (offset + 1) should return 0', function () {
			expect(blockReward.calcMilestone(1451521)).to.equal(0);
		});

		it('when height == (offset + 2) should return 0', function () {
			expect(blockReward.calcMilestone(1451522)).to.equal(0);
		});

		it('when height == (distance) should return 0', function () {
			expect(blockReward.calcMilestone(3000000)).to.equal(0);
		});

		it('when height == (distance + 1) should return 0', function () {
			expect(blockReward.calcMilestone(3000001)).to.equal(0);
		});

		it('when height == (distance + 2) should return 0', function () {
			expect(blockReward.calcMilestone(3000002)).to.equal(0);
		});

		it('when height == (milestoneOne - 1) should return 0', function () {
			expect(blockReward.calcMilestone(4451519)).to.equal(0);
		});

		it('when height == (milestoneOne) should return 1', function () {
			expect(blockReward.calcMilestone(4451520)).to.equal(1);
		});

		it('when height == (milestoneOne + 1) should return 1', function () {
			expect(blockReward.calcMilestone(4451521)).to.equal(1);
		});

		it('when height == (milestoneTwo - 1) should return 1', function () {
			expect(blockReward.calcMilestone(7451519)).to.equal(1);
		});

		it('when height == (milestoneTwo) should return 2', function () {
			expect(blockReward.calcMilestone(7451520)).to.equal(2);
		});

		it('when height == (milestoneTwo + 1) should return 2', function () {
			expect(blockReward.calcMilestone(7451521)).to.equal(2);
		});

		it('when height == (milestoneThree - 1) should return 2', function () {
			expect(blockReward.calcMilestone(10451519)).to.equal(2);
		});

		it('when height == (milestoneThree) should return 3', function () {
			expect(blockReward.calcMilestone(10451520)).to.equal(3);
		});

		it('when height == (milestoneThree + 1) should return 3', function () {
			expect(blockReward.calcMilestone(10451521)).to.equal(3);
		});

		it('when height == (milestoneFour - 1) should return 3', function () {
			expect(blockReward.calcMilestone(13451519)).to.equal(3);
		});

		it('when height == (milestoneFour) should return 4', function () {
			expect(blockReward.calcMilestone(13451520)).to.equal(4);
		});

		it('when height == (milestoneFour + 1) should return 4', function () {
			expect(blockReward.calcMilestone(13451521)).to.equal(4);
		});

		it('when height == (milestoneFour * 2) should return 8', function () {
			expect(blockReward.calcMilestone(13451520 * 2)).to.equal(8);
		});

		it('when height == (milestoneFour * 10) should return 8', function () {
			expect(blockReward.calcMilestone(13451520 * 10)).to.equal(8);
		});

		it('when height == (milestoneFour * 100) should return 8', function () {
			expect(blockReward.calcMilestone(13451520 * 100)).to.equal(8);
		});

		it('when height == (milestoneFour * 1000) should return 8', function () {
			expect(blockReward.calcMilestone(13451520 * 1000)).to.equal(8);
		});

		it('when height == (milestoneFour * 10000) should return 8', function () {
			expect(blockReward.calcMilestone(13451520 * 10000)).to.equal(8);
		});

		it('when height == (milestoneFour * 100000) should return 8', function () {
			expect(blockReward.calcMilestone(13451520 * 100000)).to.equal(8);
		});
	});

	describe('returning calcReward', function () {

		it('when height is undefined should throw an error', function () {
			expect(blockReward.calcReward).to.throw(/Invalid block height/);
		});

		it('when height == 0 should return 0', function () {
			expect(blockReward.calcReward(0)).to.equal(0);
		});

		it('when height == 1 should return 0', function () {
			expect(blockReward.calcReward(1)).to.equal(0);
		});

		it('when height == (offset - 1) should return 0', function () {
			expect(blockReward.calcReward(1451519)).to.equal(0);
		});

		it(`when height == (offset) should return ${milestones[0]}`, function () {
            expect(blockReward.calcReward(1451520)).to.equal(milestones[0]);
		});

		it(`when height == (offset + 1) should return ${milestones[0]}`, function () {
			expect(blockReward.calcReward(1451521)).to.equal(milestones[0]);
		});

		it(`when height == (offset + 2) should return ${milestones[0]}`, function () {
			expect(blockReward.calcReward(1451522)).to.equal(milestones[0]);
		});

		it(`when height == (distance) should return ${milestones[0]}`, function () {
			expect(blockReward.calcReward(3000000)).to.equal(milestones[0]);
		});

		it(`when height == (distance + 1) should return ${milestones[0]}`, function () {
			expect(blockReward.calcReward(3000001)).to.equal(milestones[0]);
		});

		it(`when height == (distance + 2) should return ${milestones[0]}`, function () {
			expect(blockReward.calcReward(3000002)).to.equal(milestones[0]);
		});

		it(`when height == (milestoneOne - 1) should return ${milestones[0]}`, function () {
			expect(blockReward.calcReward(4451519)).to.equal(milestones[0]);
		});

		it(`when height == (milestoneOne) should return ${milestones[1]}`, function () {
			expect(blockReward.calcReward(4451520)).to.equal(milestones[1]);
		});

		it(`when height == (milestoneOne + 1) should return ${milestones[1]}`, function () {
			expect(blockReward.calcReward(4451521)).to.equal(milestones[1]);
		});

		it(`when height == (milestoneTwo - 1) should return ${milestones[1]}`, function () {
			expect(blockReward.calcReward(4451521)).to.equal(milestones[1]);
		});

		it(`when height == (milestoneTwo) should return ${milestones[2]}`, function () {
			expect(blockReward.calcReward(7451521)).to.equal(milestones[2]);
		});

		it(`when height == (milestoneTwo + 1) should return ${milestones[2]}`, function () {
			expect(blockReward.calcReward(7451522)).to.equal(milestones[2]);
		});

		it(`when height == (milestoneThree - 1) should return ${milestones[2]}`, function () {
			expect(blockReward.calcReward(10451519)).to.equal(milestones[2]);
		});

		it(`when height == (milestoneThree) should return ${milestones[3]}`, function () {
			expect(blockReward.calcReward(10451520)).to.equal(milestones[3]);
		});

		it(`when height == (milestoneThree + 1) should return ${milestones[3]}`, function () {
			expect(blockReward.calcReward(10451521)).to.equal(milestones[3]);
		});

		it(`when height == (milestoneFour - 1) should return ${milestones[3]}`, function () {
			expect(blockReward.calcReward(13451519)).to.equal(milestones[3]);
		});

		it(`when height == (milestoneFour) should return ${milestones[4]}`, function () {
			expect(blockReward.calcReward(13451520)).to.equal(milestones[4]);
		});

		it(`when height == (milestoneFour + 1) should return ${milestones[4]}`, function () {
			expect(blockReward.calcReward(13451521)).to.equal(milestones[4]);
		});

		it(`when height == (milestoneFour * 2) should return ${milestones[8]}`, function () {
			expect(blockReward.calcReward(13451520 * 2)).to.equal(milestones[8]);
		});

		it(`when height == (milestoneFour * 10) should return ${milestones[8]}`, function () {
			expect(blockReward.calcReward(13451520 * 10)).to.equal(milestones[8]);
		});

		it(`when height == (milestoneFour * 100) should return ${milestones[8]}`, function () {
			expect(blockReward.calcReward(13451520 * 100)).to.equal(milestones[8]);
		});

		it(`when height == (milestoneFour * 1000) should return ${milestones[8]}`, function () {
			expect(blockReward.calcReward(13451520 * 1000)).to.equal(milestones[8]);
		});

		it(`when height == (milestoneFour * 10000) should return ${milestones[8]}`, function () {
			expect(blockReward.calcReward(13451520 * 10000)).to.equal(milestones[8]);
		});

		it(`when height == (milestoneFour * 100000) should return ${milestones[8]}`, function () {
			expect(blockReward.calcReward(13451520 * 100000)).to.equal(milestones[8]);
		});
	});

	describe('returning calcSupply', function () {

		it('when height is undefined should throw an error', function () {
			expect(blockReward.calcSupply).to.throw(/Invalid block height/);
		});

		it('when height == 0 should return 9800000000000000', function () {
			expect(blockReward.calcSupply(0)).to.equal(9800000000000000);
		});

		it('when height == 1 should return 9800000000000000', function () {
			expect(blockReward.calcSupply(1)).to.equal(9800000000000000);
		});

		it('when height == (offset - 1) should return 9800000000000000', function () {
			expect(blockReward.calcSupply(1451519)).to.equal(9800000000000000);
		});

		it('when height == (offset) should return 9800000050000000', function () {
			expect(blockReward.calcSupply(1451520)).to.equal(9800000050000000);
		});

		it('when height == (offset + 1) should return 9800000100000000', function () {
			expect(blockReward.calcSupply(1451521)).to.equal(9800000100000000);
		});

		it('when height == (offset + 2) should return 9800000150000000', function () {
			expect(blockReward.calcSupply(1451522)).to.equal(9800000150000000);
		});

		it('when height == (distance) should return 9877424050000000', function () {
			expect(blockReward.calcSupply(3000000)).to.equal(9877424050000000);
		});

		it('when height == (distance + 1) should return 9877424100000000', function () {
			expect(blockReward.calcSupply(3000001)).to.equal(9877424100000000);
		});

		it('when height == (distance + 2) should return 9877424150000000', function () {
			expect(blockReward.calcSupply(3000002)).to.equal(9877424150000000);
		});

		it('when height == (milestoneOne - 1) should return 10775484800000000', function () {
			expect(blockReward.calcSupply(milestones[1] - 1)).to.equal(10775484800000000);
		});

		it('when height == (milestoneOne) should return 10775484810000000', function () {
			expect(blockReward.calcSupply(milestones[1])).to.equal(10775484810000000);
		});

		it('when height == (milestoneOne + 1) should return 10775484820000000', function () {
			expect(blockReward.calcSupply(milestones[1] + 1)).to.equal(10775484820000000);
		});

		it('when height == (milestoneTwo - 1) should return 10725484800000000', function () {
			expect(blockReward.calcSupply(milestones[2] - 1)).to.equal(10725484800000000);
		});

		it('when height == (milestoneTwo) should return 10725484810000000', function () {
			expect(blockReward.calcSupply(milestones[2])).to.equal(10725484810000000);
		});

		it('when height == (milestoneTwo + 1) should return 10725484820000000', function () {
			expect(blockReward.calcSupply(milestones[2] + 1)).to.equal(10725484820000000);
		});

		it('when height == (milestoneThree - 1) should return 10675484800000000', function () {
			expect(blockReward.calcSupply(milestones[3] - 1)).to.equal(10675484800000000);
		});

		it('when height == (milestoneThree) should return 10675484810000000', function () {
			expect(blockReward.calcSupply(milestones[3])).to.equal(10675484810000000);
		});

		it('when height == (milestoneThree + 1) should return 10675484820000000', function () {
			expect(blockReward.calcSupply(milestones[3] + 1)).to.equal(10675484820000000);
		});

		it('when height == (milestoneFour - 1) should return 10625484800000000', function () {
			expect(blockReward.calcSupply(milestones[4] - 1)).to.equal(10625484800000000);
		});

		it('when height == (milestoneFour) should return 10625484810000000', function () {
			expect(blockReward.calcSupply(milestones[4])).to.equal(10625484810000000);
		});

		it('when height == (milestoneFour + 1) should return 10625484820000000', function () {
			expect(blockReward.calcSupply(milestones[4] + 1)).to.equal(10625484820000000);
		});

		it('when height == (milestoneFour * 2) should return 10925484810000000', function () {
			expect(blockReward.calcSupply(milestones[4] * 2)).to.equal(10925484810000000);
		});

		it('when height == (milestoneFour * 10) should return 13325484810000000', function () {
			expect(blockReward.calcSupply(milestones[4] * 10)).to.equal(13325484810000000);
		});

		it('when height == (milestoneFour * 100) should return 40325484810000000', function () {
			expect(blockReward.calcSupply(milestones[4] * 100)).to.equal(40325484810000000);
		});

		it('when height == (milestoneFour * 1000) should return 310325484810000000', function () {
			expect(blockReward.calcSupply(milestones[4] * 1000)).to.equal(310325484810000000);
		});

		it('when height == (milestoneFour * 10000) should return 3010325484810000000', function () {
			expect(blockReward.calcSupply(milestones[4] * 10000)).to.equal(3010325484810000000);
		});

		it('when height == (milestoneFour * 100000) should return 30010325484810000000', function () {
			expect(blockReward.calcSupply(milestones[4] * 100000)).to.equal(30010325484810000000);
		});

		describe('completely', function () {

			describe('before reward offset', function () {

				it('should be ok', function () {
					var supply = blockReward.calcSupply(1);
					var prev = supply;

					for (var i = 1; i < 1451520; i++) {
						supply = blockReward.calcSupply(i);
						expect(supply).to.equal(constants.totalAmount);
						prev = supply;
					}
				});
			});

			describe('for milestone 0', function () {

				it('should be ok', function () {
					var supply = blockReward.calcSupply(1451519);
					var prev = supply;

					for (var i = 1451520; i < 4451520; i++) {
						supply = blockReward.calcSupply(i);
						expect(supply).to.equal(prev + constants.rewards.milestones[0]);
						prev = supply;
					}
				});
			});

			describe('for milestone 1', function () {

				it('should be ok', function () {
					var supply = blockReward.calcSupply(4451519);
					var prev = supply;

					for (var i = 4451520; i < 7451520; i++) {
						supply = blockReward.calcSupply(i);
						expect(supply).to.equal(prev + constants.rewards.milestones[1]);
						prev = supply;
					}
				});
			});

			describe('for milestone 2', function () {

				it('should be ok', function () {
					var supply = blockReward.calcSupply(7451519);
					var prev = supply;

					for (var i = 7451520; i < 10451520; i++) {
						supply = blockReward.calcSupply(i);
						expect(supply).to.equal(prev + constants.rewards.milestones[2]);
						prev = supply;
					}
				});
			});

			describe('for milestone 3', function () {

				it('should be ok', function () {
					var supply = blockReward.calcSupply(10451519);
					var prev = supply;

					for (var i = 10451520; i < 13451520; i++) {
						supply = blockReward.calcSupply(i);
						expect(supply).to.equal(prev + constants.rewards.milestones[3]);
						prev = supply;
					}
				});
			});

			describe('for milestone 4 and beyond', function () {

				it('should be ok', function () {
					var supply = blockReward.calcSupply(13451519);
					var prev = supply;

					for (var i = 13451520; i < (13451520 + 100); i++) {
						supply = blockReward.calcSupply(i);
						expect(supply).to.equal(prev + constants.rewards.milestones[4]);
						prev = supply;
					}
				});
			});
		});
	});
});
