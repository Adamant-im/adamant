'use strict';

var chai = require('chai');
var expect = require('chai').expect;

var sql = require('../../sql/blockRewards.js');
var constants = require('../../../helpers/constants.js');
var modulesLoader = require('../../common/initModule').modulesLoader;
var db;

before(function (done) {
	modulesLoader.getDbConnection(function (err, db_handle) {
		if (err) {
			return done(err);
		}
		db = db_handle;
		done();
	});
});

constants.rewards.distance = 6300000;
constants.rewards.offset = 2000000;

function calcBlockReward (height, reward, done) {
	return db.query(sql.calcBlockReward, {height: height}).then(function (rows) {
		expect(rows).to.be.array;
		expect(rows.length).to.equal(1);
		expect(rows[0]).to.be.object;
		if (rows[0].reward == null) {
			expect(rows[0].reward).to.equal(reward);
		} else {
			expect(Number(rows[0].reward)).to.equal(reward);
		}
		done();
	}).catch(function (err) {
		done(err);
	});
};

function calcSupply (height, supply, done) {
	return db.query(sql.calcSupply, {height: height}).then(function (rows) {
		expect(rows).to.be.array;
		expect(rows.length).to.equal(1);
		expect(rows[0]).to.be.object;
		if (rows[0].supply == null) {
			expect(rows[0].supply).to.equal(supply);
		} else {
			expect(Number(rows[0].supply)).to.equal(supply);
		}
		done();
	}).catch(function (err) {
		done(err);
	});
};

function calcSupply_test (height_start, height_end, expected_reward, done) {
	return db.query(sql.calcSupply_test, {height_start: height_start, height_end: height_end, expected_reward: expected_reward}).then(function (rows) {
		expect(rows).to.be.array;
		expect(rows.length).to.equal(1);
		expect(rows[0]).to.be.object;
		expect(rows[0].result).to.equal(true);
		done();
	}).catch(function (err) {
		done(err);
	});
};

function calcSupply_test_fail (height_start, height_end, expected_reward, done) {
	return db.query(sql.calcSupply_test, {height_start: height_start, height_end: height_end, expected_reward: expected_reward}).then(function (rows) {
		expect(rows).to.be.array;
		expect(rows.length).to.equal(1);
		expect(rows[0]).to.be.object;
		expect(rows[0].result).to.equal(false);
		done();
	}).catch(function (err) {
		done(err);
	});
};

function calcBlockReward_test (height_start, height_end, expected_reward, done) {
	return db.query(sql.calcBlockReward_test, {height_start: height_start, height_end: height_end, expected_reward: expected_reward}).then(function (rows) {
		expect(rows).to.be.array;
		expect(rows.length).to.equal(1);
		expect(rows[0]).to.be.object;
		expect(Number(rows[0].result)).to.equal(0);
		done();
	}).catch(function (err) {
		done(err);
	});
};

function milestoneHeight (milestoneNum) {
    return constants.rewards.distance*milestoneNum+constants.rewards.offset;
}

function milestoneSupply (milestoneNum, step) {
    return constants.totalAmount+constants.rewards.milestones[milestoneNum]*step;
}

describe('BlockRewardsSQL', function () {

	describe('checking SQL function getBlockRewards()', function () {

		it('SQL rewards should be equal to those in constants', function (done) {
			db.query(sql.getBlockRewards).then(function (rows) {
				expect(rows).to.be.array;
				expect(rows.length).to.equal(1);
				expect(rows[0]).to.be.object;
				// Checking supply
				expect(Number(rows[0].supply)).to.equal(constants.totalAmount);
				// Checking reward start
				expect(Number(rows[0].start)).to.equal(constants.rewards.offset);
				// Checking distance between milestones
				expect(Number(rows[0].distance)).to.equal(constants.rewards.distance);
				// Checking milestones
				expect(Number(rows[0].milestones[0])).to.equal(constants.rewards.milestones[0]);
				expect(Number(rows[0].milestones[1])).to.equal(constants.rewards.milestones[1]);
				expect(Number(rows[0].milestones[2])).to.equal(constants.rewards.milestones[2]);
				expect(Number(rows[0].milestones[3])).to.equal(constants.rewards.milestones[3]);
				expect(Number(rows[0].milestones[4])).to.equal(constants.rewards.milestones[4]);
				done();
			}).catch(function (err) {
				done(err);
			});
		});
	});

	describe('checking SQL function calcBlockReward(int)', function () {

		it('when height is undefined should return null', function (done) {
			// Height, expected reward, callback
			calcBlockReward(undefined, null, done);
		});

		it('when height == 0 should return null', function (done) {
			calcBlockReward(0, null, done);
		});

		it('when height == 1 should return 0', function (done) {
			calcBlockReward(1, 0, done);
		});

		it('when height == (offset - 1) should return 0', function (done) {
			calcBlockReward(constants.rewards.offset - 1, 0, done);
		});

		it(`when height == (offset) should return ${constants.rewards.milestones[0]}`, function (done) {
			calcBlockReward(constants.rewards.offset, constants.rewards.milestones[0], done);
		});

		it(`when height == (offset + 1) should return ${constants.rewards.milestones[0]}`, function (done) {
			calcBlockReward(constants.rewards.offset + 1, constants.rewards.milestones[0], done);
		});

		it(`when height == (offset + 2) should return ${constants.rewards.milestones[0]}`, function (done) {
			calcBlockReward(constants.rewards.offset + 2, constants.rewards.milestones[0], done);
		});

		it(`when height == (distance) should return ${constants.rewards.milestones[0]}`, function (done) {
			calcBlockReward(constants.rewards.distance, constants.rewards.milestones[0], done);
		});

		it(`when height == (distance + 1) should return ${constants.rewards.milestones[0]}`, function (done) {
			calcBlockReward(constants.rewards.distance+1, constants.rewards.milestones[0], done);
		});

		it(`when height == (distance + 2) should return ${constants.rewards.milestones[0]}`, function (done) {
			calcBlockReward(constants.rewards.distance+2, constants.rewards.milestones[0], done);
		});

		it(`when height == (milestoneOne - 1) should return ${constants.rewards.milestones[0]}`, function (done) {
			calcBlockReward(milestoneHeight(1)-1, constants.rewards.milestones[0], done);
		});

		it(`when height == (milestoneOne) should return ${constants.rewards.milestones[1]}`, function (done) {
			calcBlockReward(milestoneHeight(1), constants.rewards.milestones[1], done);
		});

		it(`when height == (milestoneOne + 1) should return ${constants.rewards.milestones[1]}`, function (done) {
			calcBlockReward(milestoneHeight(1)+1, constants.rewards.milestones[1], done);
		});

		it(`when height == (milestoneTwo - 1) should return ${constants.rewards.milestones[1]}`, function (done) {
			calcBlockReward(milestoneHeight(2)-1, constants.rewards.milestones[1], done);
		});

		it(`when height == (milestoneTwo) should return ${constants.rewards.milestones[2]}`, function (done) {
			calcBlockReward(milestoneHeight(2), constants.rewards.milestones[2], done);
		});

		it(`when height == (milestoneTwo + 1) should return ${constants.rewards.milestones[2]}`, function (done) {
			calcBlockReward(milestoneHeight(2)+1, constants.rewards.milestones[2], done);
		});

		it(`when height == (milestoneThree - 1) should return ${constants.rewards.milestones[2]}`, function (done) {
			calcBlockReward(milestoneHeight(3)-1, constants.rewards.milestones[2], done);
		});

		it(`when height == (milestoneThree) should return ${constants.rewards.milestones[3]}`, function (done) {
			calcBlockReward(milestoneHeight(3), constants.rewards.milestones[3], done);
		});

		it(`when height == (milestoneThree + 1) should return ${constants.rewards.milestones[1]}`, function (done) {
			calcBlockReward(milestoneHeight(3)+1, constants.rewards.milestones[3], done);
		});

		it(`when height == (milestoneFour - 1) should return ${constants.rewards.milestones[3]}`, function (done) {
			calcBlockReward(milestoneHeight(4)-1, constants.rewards.milestones[3], done);
		});

		it(`when height == (milestoneFour) should return ${constants.rewards.milestones[4]}`, function (done) {
			calcBlockReward(milestoneHeight(4), constants.rewards.milestones[4], done);
		});

		it(`when height == (milestoneFour + 1) should return ${constants.rewards.milestones[4]}`, function (done) {
			calcBlockReward(milestoneHeight(4)+1, constants.rewards.milestones[4], done);
		});

        it(`when height == (milestoneFive - 1) should return ${constants.rewards.milestones[4]}`, function (done) {
            calcBlockReward(milestoneHeight(5)-1, constants.rewards.milestones[4], done);
        });

        it(`when height == (milestoneFive) should return ${constants.rewards.milestones[5]}`, function (done) {
            calcBlockReward(milestoneHeight(5), constants.rewards.milestones[5], done);
        });

        it(`when height == (milestoneFive + 1) should return ${constants.rewards.milestones[5]}`, function (done) {
            calcBlockReward(milestoneHeight(5)+1, constants.rewards.milestones[5], done);
        });

        it(`when height == (milestoneSix - 1) should return ${constants.rewards.milestones[5]}`, function (done) {
            calcBlockReward(milestoneHeight(6)-1, constants.rewards.milestones[5], done);
        });

        it(`when height == (milestoneSix) should return ${constants.rewards.milestones[6]}`, function (done) {
            calcBlockReward(milestoneHeight(6), constants.rewards.milestones[6], done);
        });

        it(`when height == (milestoneSix + 1) should return ${constants.rewards.milestones[6]}`, function (done) {
            calcBlockReward(milestoneHeight(6)+1, constants.rewards.milestones[6], done);
        });

        it(`when height == (milestoneSeven - 1) should return ${constants.rewards.milestones[6]}`, function (done) {
            calcBlockReward(milestoneHeight(7)-1, constants.rewards.milestones[6], done);
        });

        it(`when height == (milestoneSeven) should return ${constants.rewards.milestones[7]}`, function (done) {
            calcBlockReward(milestoneHeight(7), constants.rewards.milestones[7], done);
        });

        it(`when height == (milestoneSeven + 1) should return ${constants.rewards.milestones[7]}`, function (done) {
            calcBlockReward(milestoneHeight(7)+1, constants.rewards.milestones[7], done);
        });

        it(`when height == (milestoneEight - 1) should return ${constants.rewards.milestones[7]}`, function (done) {
            calcBlockReward(milestoneHeight(8)-1, constants.rewards.milestones[7], done);
        });

        it(`when height == (milestoneEight) should return ${constants.rewards.milestones[8]}`, function (done) {
            calcBlockReward(milestoneHeight(8), constants.rewards.milestones[8], done);
        });

        it(`when height == (milestoneEight + 1) should return ${constants.rewards.milestones[8]}`, function (done) {
            calcBlockReward(milestoneHeight(8)+1, constants.rewards.milestones[8], done);
        });

        it(`when height == (milestoneEight * 2) should return ${constants.rewards.milestones[8]}`, function (done) {
			calcBlockReward((milestoneHeight(8) * 2), constants.rewards.milestones[8], done);
		});

        it(`when height == (milestoneEight * 10) should return ${constants.rewards.milestones[8]}`, function (done) {
            calcBlockReward((milestoneHeight(8) * 10), constants.rewards.milestones[8], done);
        });

        // Following example expected to fail because height is int and (milestoneEight * 100) is bigint
        // However, it will take 400+ years to reach height of last passing test, so is safe to ignore
        it('when height == (milestoneEight * 100) should overflow int and return error', function (done) {
            db.query(sql.calcBlockReward, {height: (milestoneHeight(8) * 100)}).then(function (rows) {
                done('Should not pass');
            }).catch(function (err) {
                expect(err).to.be.an('error');
                expect(err.message).to.contain('calcblockreward(bigint)');
                done();
            });
        });
	});

	describe('checking SQL function calcSupply(int)', function () {

		it('when height is undefined should return null', function (done) {
			calcSupply(undefined, null, done);
		});

		it('when height == 0 should return null', function (done) {
			calcSupply(0, null, done);
		});

		it(`when height == 1 should return ${constants.totalAmount}`, function (done) {
			calcSupply(1, constants.totalAmount, done);
		});

		it(`when height == (offset - 1) should return ${constants.totalAmount}`, function (done) {
			calcSupply(constants.rewards.offset-1, constants.totalAmount, done);
		});

		it(`when height == (offset) should return ${constants.totalAmount+constants.rewards.milestones[0]}`, function (done) {
			calcSupply(constants.rewards.offset, constants.totalAmount+constants.rewards.milestones[0], done);
		});

		it(`when height == (offset + 1) should return ${constants.totalAmount+constants.rewards.milestones[0]*2}`, function (done) {
			calcSupply(constants.rewards.offset+1, constants.totalAmount+constants.rewards.milestones[0]*2, done);
		});

		it(`when height == (offset + 2) should return ${constants.totalAmount+constants.rewards.milestones[0]*3}`, function (done) {
			calcSupply(constants.rewards.offset+2, constants.totalAmount+constants.rewards.milestones[0]*3, done);
		});

		it(`when height == (distance) should return ${milestoneSupply(0,constants.rewards.distance-constants.rewards.offset+1)}`, function (done) {
			calcSupply(constants.rewards.distance, milestoneSupply(0,constants.rewards.distance-constants.rewards.offset+1), done);
		});

		it(`when height == (distance + 1) should return ${milestoneSupply(0,constants.rewards.distance-constants.rewards.offset+1+1)}`, function (done) {
			calcSupply(constants.rewards.distance+1, milestoneSupply(0,constants.rewards.distance-constants.rewards.offset+1+1), done);
		});

		it(`when height == (distance + 2) should return ${milestoneSupply(0,constants.rewards.distance-constants.rewards.offset+3)}`, function (done) {
			calcSupply(constants.rewards.distance+2, milestoneSupply(0,constants.rewards.distance-constants.rewards.offset+3), done);
		});

		it(`when height == (milestoneOne - 1) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)}`, function (done) {
			calcSupply(milestoneHeight(1)-1, milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset), done);
		});

		it(`when height == (milestoneOne) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)+constants.rewards.milestones[1]}`, function (done) {
			calcSupply(milestoneHeight(1), milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)+constants.rewards.milestones[1], done);
		});

		it(`when height == (milestoneOne + 1) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)+constants.rewards.milestones[1]*2}`, function (done) {
			calcSupply(milestoneHeight(1)+1, milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)+constants.rewards.milestones[1]*2, done);
		});

		it(`when height == (milestoneTwo - 1) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)+(constants.rewards.milestones[1]*constants.rewards.distance)-1}`, function (done) {
			calcSupply(milestoneHeight(2)-1, milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)+(constants.rewards.milestones[1]*constants.rewards.distance)-1, done);
		});

		it(`when height == (milestoneTwo) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
        +(constants.rewards.milestones[1]*constants.rewards.distance)
        +constants.rewards.milestones[2]}`, function (done) {
			calcSupply(milestoneHeight(2), milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
                +(constants.rewards.milestones[1]*constants.rewards.distance)
                +constants.rewards.milestones[2], done);
		});

		it(`when height == (milestoneTwo + 1) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
        +(constants.rewards.milestones[1]*constants.rewards.distance)
        +constants.rewards.milestones[2]*2}`, function (done) {
			calcSupply(milestoneHeight(2)+1, milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
                +(constants.rewards.milestones[1]*constants.rewards.distance)
                +constants.rewards.milestones[2]*2, done);
		});

		it(`when height == (milestoneThree - 1) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
        +(constants.rewards.milestones[1]*constants.rewards.distance)
        +(constants.rewards.milestones[2]*constants.rewards.distance)-1}`, function (done) {
			calcSupply(milestoneHeight(3)-1, milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
                +(constants.rewards.milestones[1]*constants.rewards.distance)
                +(constants.rewards.milestones[2]*constants.rewards.distance)-1, done);
		});

		it(`when height == (milestoneThree) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
        +(constants.rewards.milestones[1]*constants.rewards.distance)
        +(constants.rewards.milestones[2]*constants.rewards.distance)
        +constants.rewards.milestones[3]}`, function (done) {
			calcSupply(milestoneHeight(3), milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
                +(constants.rewards.milestones[1]*constants.rewards.distance)
                +(constants.rewards.milestones[2]*constants.rewards.distance)
                +constants.rewards.milestones[3], done);
		});

		it(`when height == (milestoneThree + 1) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
        +(constants.rewards.milestones[1]*constants.rewards.distance)
        +(constants.rewards.milestones[2]*constants.rewards.distance)
        +constants.rewards.milestones[3]*2}`, function (done) {
			calcSupply(milestoneHeight(3)+1, milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
                +(constants.rewards.milestones[1]*constants.rewards.distance)
                +(constants.rewards.milestones[2]*constants.rewards.distance)
                +constants.rewards.milestones[3]*2, done);
		});

		it(`when height == (milestoneFour - 1) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
        +(constants.rewards.milestones[1]*constants.rewards.distance)
        +(constants.rewards.milestones[2]*constants.rewards.distance)
        +(constants.rewards.milestones[3]*constants.rewards.distance)-1}`, function (done) {
			calcSupply(milestoneHeight(4)-1, milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
                +(constants.rewards.milestones[1]*constants.rewards.distance)
                +(constants.rewards.milestones[2]*constants.rewards.distance)
                +(constants.rewards.milestones[3]*constants.rewards.distance)-1, done);
		});

		it(`when height == (milestoneFour) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
        +(constants.rewards.milestones[1]*constants.rewards.distance)
        +(constants.rewards.milestones[2]*constants.rewards.distance)
        +(constants.rewards.milestones[3]*constants.rewards.distance)
        +constants.rewards.milestones[4]}`, function (done) {
			calcSupply(milestoneHeight(4), milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
                +(constants.rewards.milestones[1]*constants.rewards.distance)
                +(constants.rewards.milestones[2]*constants.rewards.distance)
                +(constants.rewards.milestones[3]*constants.rewards.distance)
                +constants.rewards.milestones[4], done);
		});

		it(`when height == (milestoneFour + 1) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
        +(constants.rewards.milestones[1]*constants.rewards.distance)
        +(constants.rewards.milestones[2]*constants.rewards.distance)
        +(constants.rewards.milestones[3]*constants.rewards.distance)
        +constants.rewards.milestones[4]*2}`, function (done) {
			calcSupply(milestoneHeight(4)+1, milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
                +(constants.rewards.milestones[1]*constants.rewards.distance)
                +(constants.rewards.milestones[2]*constants.rewards.distance)
                +(constants.rewards.milestones[3]*constants.rewards.distance)
                +constants.rewards.milestones[4]*2, done);
		});

        it(`when height == (milestoneFive - 1) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)}`, function (done) {
            calcSupply(milestoneHeight(5)-1, milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
                +(constants.rewards.milestones[1]*constants.rewards.distance)
                +(constants.rewards.milestones[2]*constants.rewards.distance)
                +(constants.rewards.milestones[3]*constants.rewards.distance)
                +(constants.rewards.milestones[4]*constants.rewards.distance-1), done);
        });

        it(`when height == (milestoneFive) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
        +(constants.rewards.milestones[1]*constants.rewards.distance)
        +(constants.rewards.milestones[2]*constants.rewards.distance)
        +(constants.rewards.milestones[3]*constants.rewards.distance)
        +(constants.rewards.milestones[4]*constants.rewards.distance)
        +constants.rewards.milestones[5]}`, function (done) {
            calcSupply(milestoneHeight(5), milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
                +(constants.rewards.milestones[1]*constants.rewards.distance)
                +(constants.rewards.milestones[2]*constants.rewards.distance)
                +(constants.rewards.milestones[3]*constants.rewards.distance)
                +(constants.rewards.milestones[4]*constants.rewards.distance)
                +constants.rewards.milestones[5], done);
        });

        it(`when height == (milestoneFive + 1) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
        +(constants.rewards.milestones[1]*constants.rewards.distance)
        +(constants.rewards.milestones[2]*constants.rewards.distance)
        +(constants.rewards.milestones[3]*constants.rewards.distance)
        +(constants.rewards.milestones[4]*constants.rewards.distance)
        +constants.rewards.milestones[5]*2}`, function (done) {
            calcSupply(milestoneHeight(5)+1, milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
                +(constants.rewards.milestones[1]*constants.rewards.distance)
                +(constants.rewards.milestones[2]*constants.rewards.distance)
                +(constants.rewards.milestones[3]*constants.rewards.distance)
                +(constants.rewards.milestones[4]*constants.rewards.distance)
                +constants.rewards.milestones[5]*2, done);
        });

        it(`when height == (milestoneSix - 1) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
        +(constants.rewards.milestones[1]*constants.rewards.distance)
        +(constants.rewards.milestones[2]*constants.rewards.distance)
        +(constants.rewards.milestones[3]*constants.rewards.distance)
        +(constants.rewards.milestones[4]*constants.rewards.distance)
        +(constants.rewards.milestones[5]*constants.rewards.distance)}`, function (done) {
            calcSupply(milestoneHeight(6)-1, milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
                +(constants.rewards.milestones[1]*constants.rewards.distance)
                +(constants.rewards.milestones[2]*constants.rewards.distance)
                +(constants.rewards.milestones[3]*constants.rewards.distance)
                +(constants.rewards.milestones[4]*constants.rewards.distance)
                +(constants.rewards.milestones[5]*constants.rewards.distance), done);
        });

        it(`when height == (milestoneSix) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
        +(constants.rewards.milestones[1]*constants.rewards.distance)
        +(constants.rewards.milestones[2]*constants.rewards.distance)
        +(constants.rewards.milestones[3]*constants.rewards.distance)
        +(constants.rewards.milestones[4]*constants.rewards.distance)
        +(constants.rewards.milestones[5]*constants.rewards.distance)
        +constants.rewards.milestones[6]}`, function (done) {
            calcSupply(milestoneHeight(6), milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
                +(constants.rewards.milestones[1]*constants.rewards.distance)
                +(constants.rewards.milestones[2]*constants.rewards.distance)
                +(constants.rewards.milestones[3]*constants.rewards.distance)
                +(constants.rewards.milestones[4]*constants.rewards.distance)
                +(constants.rewards.milestones[5]*constants.rewards.distance)
                +constants.rewards.milestones[6], done);
        });

        it(`when height == (milestoneSix + 1) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
        +(constants.rewards.milestones[1]*constants.rewards.distance)
        +(constants.rewards.milestones[2]*constants.rewards.distance)
        +(constants.rewards.milestones[3]*constants.rewards.distance)
        +(constants.rewards.milestones[4]*constants.rewards.distance)
        +(constants.rewards.milestones[5]*constants.rewards.distance)
        +constants.rewards.milestones[6]*2}`, function (done) {
            calcSupply(milestoneHeight(6)+1, milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
                +(constants.rewards.milestones[1]*constants.rewards.distance)
                +(constants.rewards.milestones[2]*constants.rewards.distance)
                +(constants.rewards.milestones[3]*constants.rewards.distance)
                +(constants.rewards.milestones[4]*constants.rewards.distance)
                +(constants.rewards.milestones[5]*constants.rewards.distance)
                +constants.rewards.milestones[6]*2, done);
        });

        it(`when height == (milestoneSeven - 1) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
        +(constants.rewards.milestones[1]*constants.rewards.distance)
        +(constants.rewards.milestones[2]*constants.rewards.distance)
        +(constants.rewards.milestones[3]*constants.rewards.distance)
        +(constants.rewards.milestones[4]*constants.rewards.distance)
        +(constants.rewards.milestones[5]*constants.rewards.distance)
        +(constants.rewards.milestones[6]*constants.rewards.distance)-1}`, function (done) {
            calcSupply(milestoneHeight(7)-1, milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
                +(constants.rewards.milestones[1]*constants.rewards.distance)
                +(constants.rewards.milestones[2]*constants.rewards.distance)
                +(constants.rewards.milestones[3]*constants.rewards.distance)
                +(constants.rewards.milestones[4]*constants.rewards.distance)
                +(constants.rewards.milestones[5]*constants.rewards.distance)
                +(constants.rewards.milestones[6]*constants.rewards.distance)-1, done);
        });

        it(`when height == (milestoneSeven) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
        +(constants.rewards.milestones[1]*constants.rewards.distance)
        +(constants.rewards.milestones[2]*constants.rewards.distance)
        +(constants.rewards.milestones[3]*constants.rewards.distance)
        +(constants.rewards.milestones[4]*constants.rewards.distance)
        +(constants.rewards.milestones[5]*constants.rewards.distance)
        +(constants.rewards.milestones[6]*constants.rewards.distance)
        +constants.rewards.milestones[7]}`, function (done) {
            calcSupply(milestoneHeight(7), milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
                +(constants.rewards.milestones[1]*constants.rewards.distance)
                +(constants.rewards.milestones[2]*constants.rewards.distance)
                +(constants.rewards.milestones[3]*constants.rewards.distance)
                +(constants.rewards.milestones[4]*constants.rewards.distance)
                +(constants.rewards.milestones[5]*constants.rewards.distance)
                +(constants.rewards.milestones[6]*constants.rewards.distance)
                +constants.rewards.milestones[7], done);
        });

        it(`when height == (milestoneSeven + 1) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
        +(constants.rewards.milestones[1]*constants.rewards.distance)
        +(constants.rewards.milestones[2]*constants.rewards.distance)
        +(constants.rewards.milestones[3]*constants.rewards.distance)
        +(constants.rewards.milestones[4]*constants.rewards.distance)
        +(constants.rewards.milestones[5]*constants.rewards.distance)
        +(constants.rewards.milestones[6]*constants.rewards.distance)
        +constants.rewards.milestones[7]*2}`, function (done) {
            calcSupply(milestoneHeight(7)+1, milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
                +(constants.rewards.milestones[1]*constants.rewards.distance)
                +(constants.rewards.milestones[2]*constants.rewards.distance)
                +(constants.rewards.milestones[3]*constants.rewards.distance)
                +(constants.rewards.milestones[4]*constants.rewards.distance)
                +(constants.rewards.milestones[5]*constants.rewards.distance)
                +(constants.rewards.milestones[6]*constants.rewards.distance)
                +constants.rewards.milestones[7]*2, done);
        });

        it(`when height == (milestoneEight - 1) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
        +(constants.rewards.milestones[1]*constants.rewards.distance)
        +(constants.rewards.milestones[2]*constants.rewards.distance)
        +(constants.rewards.milestones[3]*constants.rewards.distance)
        +(constants.rewards.milestones[4]*constants.rewards.distance)
        +(constants.rewards.milestones[5]*constants.rewards.distance)
        +(constants.rewards.milestones[6]*constants.rewards.distance)
        +(constants.rewards.milestones[7]*constants.rewards.distance)-1}`, function (done) {
            calcSupply(milestoneHeight(8)-1, milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
                +(constants.rewards.milestones[1]*constants.rewards.distance)
                +(constants.rewards.milestones[2]*constants.rewards.distance)
                +(constants.rewards.milestones[3]*constants.rewards.distance)
                +(constants.rewards.milestones[4]*constants.rewards.distance)
                +(constants.rewards.milestones[5]*constants.rewards.distance)
                +(constants.rewards.milestones[6]*constants.rewards.distance)
                +(constants.rewards.milestones[7]*constants.rewards.distance)-1, done);
        });

        it(`when height == (milestoneEight) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
        +(constants.rewards.milestones[1]*constants.rewards.distance)
        +(constants.rewards.milestones[2]*constants.rewards.distance)
        +(constants.rewards.milestones[3]*constants.rewards.distance)
        +(constants.rewards.milestones[4]*constants.rewards.distance)
        +(constants.rewards.milestones[5]*constants.rewards.distance)
        +(constants.rewards.milestones[6]*constants.rewards.distance)
        +(constants.rewards.milestones[7]*constants.rewards.distance)
        +(constants.rewards.milestones[8])}`, function (done) {
            calcSupply(milestoneHeight(8), milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
                +(constants.rewards.milestones[1]*constants.rewards.distance)
                +(constants.rewards.milestones[2]*constants.rewards.distance)
                +(constants.rewards.milestones[3]*constants.rewards.distance)
                +(constants.rewards.milestones[4]*constants.rewards.distance)
                +(constants.rewards.milestones[5]*constants.rewards.distance)
                +(constants.rewards.milestones[6]*constants.rewards.distance)
                +(constants.rewards.milestones[7]*constants.rewards.distance)
                +(constants.rewards.milestones[8]), done);
        });

        it(`when height == (milestoneEight + 1) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
        +(constants.rewards.milestones[1]*constants.rewards.distance)
        +(constants.rewards.milestones[2]*constants.rewards.distance)
        +(constants.rewards.milestones[3]*constants.rewards.distance)
        +(constants.rewards.milestones[4]*constants.rewards.distance)
        +(constants.rewards.milestones[5]*constants.rewards.distance)
        +(constants.rewards.milestones[6]*constants.rewards.distance)
        +(constants.rewards.milestones[7]*constants.rewards.distance)
        +(constants.rewards.milestones[8]*2)}`, function (done) {
            calcSupply(milestoneHeight(8)+1, milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
                +(constants.rewards.milestones[1]*constants.rewards.distance)
                +(constants.rewards.milestones[2]*constants.rewards.distance)
                +(constants.rewards.milestones[3]*constants.rewards.distance)
                +(constants.rewards.milestones[4]*constants.rewards.distance)
                +(constants.rewards.milestones[5]*constants.rewards.distance)
                +(constants.rewards.milestones[6]*constants.rewards.distance)
                +(constants.rewards.milestones[7]*constants.rewards.distance)
                +(constants.rewards.milestones[8]*2), done);
        });


		it(`when height == (milestoneEight * 2) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
        +(constants.rewards.milestones[1]*constants.rewards.distance)
        +(constants.rewards.milestones[2]*constants.rewards.distance)
        +(constants.rewards.milestones[3]*constants.rewards.distance)
        +(constants.rewards.milestones[4]*constants.rewards.distance)
        +(constants.rewards.milestones[5]*constants.rewards.distance)
        +(constants.rewards.milestones[6]*constants.rewards.distance)
        +(constants.rewards.milestones[7]*constants.rewards.distance)
        +constants.rewards.milestones[8]*milestoneHeight(8)
        +constants.rewards.milestones[8]}`, function (done) {
			calcSupply(milestoneHeight(8)*2, milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
                +(constants.rewards.milestones[1]*constants.rewards.distance)
                +(constants.rewards.milestones[2]*constants.rewards.distance)
                +(constants.rewards.milestones[3]*constants.rewards.distance)
                +(constants.rewards.milestones[4]*constants.rewards.distance)
                +(constants.rewards.milestones[5]*constants.rewards.distance)
                +(constants.rewards.milestones[6]*constants.rewards.distance)
                +(constants.rewards.milestones[7]*constants.rewards.distance)
                +constants.rewards.milestones[8]*milestoneHeight(8)
                +constants.rewards.milestones[8], done);
		});

		it(`when height == (milestoneEight * 10) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
        +(constants.rewards.milestones[1]*constants.rewards.distance)
        +(constants.rewards.milestones[2]*constants.rewards.distance)
        +(constants.rewards.milestones[3]*constants.rewards.distance)
        +(constants.rewards.milestones[4]*constants.rewards.distance)
        +(constants.rewards.milestones[5]*constants.rewards.distance)
        +(constants.rewards.milestones[6]*constants.rewards.distance)
        +(constants.rewards.milestones[7]*constants.rewards.distance)
        +constants.rewards.milestones[8]*milestoneHeight(8)*9
        +constants.rewards.milestones[8]}`, function (done) {
			calcSupply((milestoneHeight(8) * 10), milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
                +(constants.rewards.milestones[1]*constants.rewards.distance)
                +(constants.rewards.milestones[2]*constants.rewards.distance)
                +(constants.rewards.milestones[3]*constants.rewards.distance)
                +(constants.rewards.milestones[4]*constants.rewards.distance)
                +(constants.rewards.milestones[5]*constants.rewards.distance)
                +(constants.rewards.milestones[6]*constants.rewards.distance)
                +(constants.rewards.milestones[7]*constants.rewards.distance)
                +constants.rewards.milestones[8]*milestoneHeight(8)*9
                +constants.rewards.milestones[8], done);
		});

		// Following example expected to fail because height is int and (milestoneFour * 1000) is bigint
		// However, it will take 400+ years to reach height of last passing test, so is safe to ignore
		it('when height == (milestoneFour * 1000) should overflow int and return error', function (done) {
			db.query(sql.calcSupply, {height: (milestoneHeight(8) * 1000)}).then(function (rows) {
				done('Should not pass');
			}).catch(function (err) {
				expect(err).to.be.an('error');
				expect(err.message).to.contain('calcsupply(bigint)');
				done();
			});
		});
	});

	describe('checking completely SQL functions calcSupply(int) and calcBlockReward(int)', function () {

		describe('check if calcBlockReward_test can fail', function () {

			it('calcBlockReward_test should return 1000 for 1000 not matching block rewards', function (done) {
				db.query(sql.calcBlockReward_test, {height_start: 1, height_end: 1000, expected_reward: 1}).then(function (rows) {
					expect(rows).to.be.array;
					expect(rows.length).to.equal(1);
					expect(rows[0]).to.be.object;
					expect(Number(rows[0].result)).to.equal(1000);
					done();
				}).catch(function (err) {
					done(err);
				});
			});
		});

		describe('before reward offset', function () {

			it('calcBlockReward_test should return 0', function (done) {
				calcBlockReward_test(1, constants.rewards.offset-1, 0, done);
			});

			it('calcSupply_test should return true', function (done) {
				calcSupply_test(1, constants.rewards.offset-1, 0, done);
			});

			it('calcSupply_test_fail should return false', function (done) {
				calcSupply_test_fail(1, constants.rewards.offset-1, 1, done);
			});
		});

		describe('for milestone 0', function () {

			it('calcBlockReward_test should return 0', function (done) {
				calcBlockReward_test(constants.rewards.offset, constants.rewards.offset-1, constants.rewards.milestones[0], done);
			});

			it('calcSupply_test should return true', function (done) {
				calcSupply_test(constants.rewards.offset, constants.rewards.offset-1, constants.rewards.milestones[0], done);
			});

			it('calcSupply_test_fail should return false', function (done) {
				calcSupply_test_fail(constants.rewards.offset, constants.rewards.offset+constants.rewards.distance, 1, done);
			});
		});

		describe('for milestone 1', function () {

			it('calcBlockReward_test should return 0', function (done) {
				calcBlockReward_test(constants.rewards.offset+constants.rewards.distance, constants.rewards.offset+constants.rewards.distance*2-1, constants.rewards.milestones[1], done);
			});

			it('calcSupply_test should return true', function (done) {
				calcSupply_test(constants.rewards.offset+constants.rewards.distance, constants.rewards.offset+constants.rewards.distance*2-1, constants.rewards.milestones[1], done);
			});

			it('calcSupply_test_fail should return false', function (done) {
				calcSupply_test_fail(constants.rewards.offset+constants.rewards.distance, constants.rewards.offset+constants.rewards.distance*2-1, 1, done);
			});
		});

		describe('for milestone 2', function () {

			it('calcBlockReward_test should return 0', function (done) {
				calcBlockReward_test(constants.rewards.offset+constants.rewards.distance*2, constants.rewards.offset+constants.rewards.distance*3-1, constants.rewards.milestones[2], done);
			});

			it('calcSupply_test should return true', function (done) {
				calcSupply_test(constants.rewards.offset+constants.rewards.distance*2, constants.rewards.offset+constants.rewards.distance*3-1, constants.rewards.milestones[2], done);
			});

			it('calcSupply_test_fail should return false', function (done) {
				calcSupply_test_fail(constants.rewards.offset+constants.rewards.distance*2, constants.rewards.offset+constants.rewards.distance*3-1, 1, done);
			});
		});

		describe('for milestone 3', function () {

			it('calcBlockReward_test should return 0', function (done) {
				calcBlockReward_test(constants.rewards.offset+constants.rewards.distance*3, constants.rewards.offset+constants.rewards.distance*4-1, constants.rewards.milestones[3], done);
			});

			it('calcSupply_test should return true', function (done) {
				calcSupply_test(constants.rewards.offset+constants.rewards.distance*3, constants.rewards.offset+constants.rewards.distance*4-1, constants.rewards.milestones[3], done);
			});

			it('calcSupply_test_fail should return false', function (done) {
				calcSupply_test_fail(constants.rewards.offset+constants.rewards.distance*3, constants.rewards.offset+constants.rewards.distance*4-1, 1, done);
			});
		});

        describe('for milestone 4', function () {

            it('calcBlockReward_test should return 0', function (done) {
                calcBlockReward_test(constants.rewards.offset+constants.rewards.distance*4, constants.rewards.offset+constants.rewards.distance*5-1, constants.rewards.milestones[4], done);
            });

            it('calcSupply_test should return true', function (done) {
                calcSupply_test(constants.rewards.offset+constants.rewards.distance*4, constants.rewards.offset+constants.rewards.distance*5-1, constants.rewards.milestones[4], done);
            });

            it('calcSupply_test_fail should return false', function (done) {
                calcSupply_test_fail(constants.rewards.offset+constants.rewards.distance*4, constants.rewards.offset+constants.rewards.distance*5-1, 1, done);
            });
        });

        describe('for milestone 5', function () {

            it('calcBlockReward_test should return 0', function (done) {
                calcBlockReward_test(constants.rewards.offset+constants.rewards.distance*5, constants.rewards.offset+constants.rewards.distance*6-1, constants.rewards.milestones[5], done);
            });

            it('calcSupply_test should return true', function (done) {
                calcSupply_test(constants.rewards.offset+constants.rewards.distance*5, constants.rewards.offset+constants.rewards.distance*6-1, constants.rewards.milestones[5], done);
            });

            it('calcSupply_test_fail should return false', function (done) {
                calcSupply_test_fail(constants.rewards.offset+constants.rewards.distance*5, constants.rewards.offset+constants.rewards.distance*6-1, 1, done);
            });
        });

        describe('for milestone 6', function () {

            it('calcBlockReward_test should return 0', function (done) {
                calcBlockReward_test(constants.rewards.offset+constants.rewards.distance*6, constants.rewards.offset+constants.rewards.distance*7-1, constants.rewards.milestones[6], done);
            });

            it('calcSupply_test should return true', function (done) {
                calcSupply_test(constants.rewards.offset+constants.rewards.distance*6, constants.rewards.offset+constants.rewards.distance*7-1, constants.rewards.milestones[6], done);
            });

            it('calcSupply_test_fail should return false', function (done) {
                calcSupply_test_fail(constants.rewards.offset+constants.rewards.distance*6, constants.rewards.offset+constants.rewards.distance*7-1, 1, done);
            });
        });

        describe('for milestone 7', function () {

            it('calcBlockReward_test should return 0', function (done) {
                calcBlockReward_test(constants.rewards.offset+constants.rewards.distance*7, constants.rewards.offset+constants.rewards.distance*8-1, constants.rewards.milestones[7], done);
            });

            it('calcSupply_test should return true', function (done) {
                calcSupply_test(constants.rewards.offset+constants.rewards.distance*7, constants.rewards.offset+constants.rewards.distance*8-1, constants.rewards.milestones[7], done);
            });

            it('calcSupply_test_fail should return false', function (done) {
                calcSupply_test_fail(constants.rewards.offset+constants.rewards.distance*7, constants.rewards.offset+constants.rewards.distance*8-1, 1, done);
            });
        });

		describe('for milestone 8 and beyond', function () {

			it('calcBlockReward_test should return 0', function (done) {
				calcBlockReward_test(constants.rewards.offset+constants.rewards.distance*8, (constants.rewards.offset+constants.rewards.distance*8 + 100), constants.rewards.milestones[8], done);
			});

			it('calcSupply_test should return true', function (done) {
				calcSupply_test(constants.rewards.offset+constants.rewards.distance*8, (constants.rewards.offset+constants.rewards.distance*8 + 100), constants.rewards.milestones[8], done);
			});

			it('calcSupply_test_fail should return false', function (done) {
				calcSupply_test_fail(constants.rewards.offset+constants.rewards.distance*8, (constants.rewards.offset+constants.rewards.distance*8 + 100), 1, done);
			});
		});
	});
});
