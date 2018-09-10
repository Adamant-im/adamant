'use strict';

var chai = require('chai');
var expect = require('chai').expect;

var BlockReward = require('../../../logic/blockReward.js');
var constants = require('../../../helpers/constants.js');

function milestoneHeight (milestoneNum) {
    return constants.rewards.distance*milestoneNum+constants.rewards.offset;
}

function milestoneSupply (milestoneNum, step) {
    return constants.totalAmount+constants.rewards.milestones[milestoneNum]*step;
}

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
			expect(blockReward.calcMilestone(constants.rewards.offset-1)).to.equal(0);
		});

		it('when height == (offset) should return 0', function () {
			expect(blockReward.calcMilestone(constants.rewards.offset)).to.equal(0);
		});

		it('when height == (offset + 1) should return 0', function () {
			expect(blockReward.calcMilestone(constants.rewards.offset+1)).to.equal(0);
		});

		it('when height == (offset + 2) should return 0', function () {
			expect(blockReward.calcMilestone(constants.rewards.offset+2)).to.equal(0);
		});

		it('when height == (distance) should return 0', function () {
			expect(blockReward.calcMilestone(constants.rewards.distance)).to.equal(0);
		});

		it('when height == (distance + 1) should return 0', function () {
			expect(blockReward.calcMilestone(constants.rewards.distance+1)).to.equal(0);
		});

		it('when height == (distance + 2) should return 0', function () {
			expect(blockReward.calcMilestone(constants.rewards.distance+2)).to.equal(0);
		});

		it('when height == (milestoneOne - 1) should return 0', function () {
			expect(blockReward.calcMilestone(milestoneHeight(1) - 1)).to.equal(0);
		});

		it('when height == (milestoneOne) should return 1', function () {
			expect(blockReward.calcMilestone(milestoneHeight(1))).to.equal(1);
		});

		it('when height == (milestoneOne + 1) should return 1', function () {
			expect(blockReward.calcMilestone(milestoneHeight(1) + 1)).to.equal(1);
		});

		it('when height == (milestoneTwo - 1) should return 1', function () {
			expect(blockReward.calcMilestone(milestoneHeight(2) - 1)).to.equal(1);
		});

		it('when height == (milestoneTwo) should return 2', function () {
			expect(blockReward.calcMilestone(milestoneHeight(2))).to.equal(2);
		});

		it('when height == (milestoneTwo + 1) should return 2', function () {
			expect(blockReward.calcMilestone(milestoneHeight(2) + 1)).to.equal(2);
		});

		it('when height == (milestoneThree - 1) should return 2', function () {
			expect(blockReward.calcMilestone(milestoneHeight(3) - 1)).to.equal(2);
		});

		it('when height == (milestoneThree) should return 3', function () {
			expect(blockReward.calcMilestone(milestoneHeight(3))).to.equal(3);
		});

		it('when height == (milestoneThree + 1) should return 3', function () {
			expect(blockReward.calcMilestone(milestoneHeight(3)+1)).to.equal(3);
		});

		it('when height == (milestoneFour - 1) should return 3', function () {
			expect(blockReward.calcMilestone(milestoneHeight(4)-1)).to.equal(3);
		});

		it('when height == (milestoneFour) should return 4', function () {
			expect(blockReward.calcMilestone(milestoneHeight(4))).to.equal(4);
		});

		it('when height == (milestoneFour + 1) should return 4', function () {
			expect(blockReward.calcMilestone(milestoneHeight(4)+1)).to.equal(4);
		});

        it('when height == (milestoneFive - 1) should return 4', function () {
            expect(blockReward.calcMilestone(milestoneHeight(5)-1)).to.equal(4);
        });

        it('when height == (milestoneFive) should return 5', function () {
            expect(blockReward.calcMilestone(milestoneHeight(5))).to.equal(5);
        });

        it('when height == (milestoneFive + 1) should return 5', function () {
            expect(blockReward.calcMilestone(milestoneHeight(5)+1)).to.equal(5);
        });

        it('when height == (milestoneSix - 1) should return 5', function () {
            expect(blockReward.calcMilestone(milestoneHeight(6)-1)).to.equal(5);
        });

        it('when height == (milestoneSix) should return 6', function () {
            expect(blockReward.calcMilestone(milestoneHeight(6))).to.equal(6);
        });

        it('when height == (milestoneSix + 1) should return 6', function () {
            expect(blockReward.calcMilestone(milestoneHeight(6)+1)).to.equal(6);
        });

        it('when height == (milestoneSeven - 1) should return 6', function () {
            expect(blockReward.calcMilestone(milestoneHeight(7)-1)).to.equal(6);
        });

        it('when height == (milestoneSeven) should return 7', function () {
            expect(blockReward.calcMilestone(milestoneHeight(7))).to.equal(7);
        });

        it('when height == (milestoneSeven + 1) should return 7', function () {
            expect(blockReward.calcMilestone(milestoneHeight(7)+1)).to.equal(7);
        });

        it('when height == (milestoneEight - 1) should return 7', function () {
            expect(blockReward.calcMilestone(milestoneHeight(8)-1)).to.equal(7);
        });

        it('when height == (milestoneEight) should return 8', function () {
            expect(blockReward.calcMilestone(milestoneHeight(8))).to.equal(8);
        });

        it('when height == (milestoneEight + 1) should return 8', function () {
            expect(blockReward.calcMilestone(milestoneHeight(8)+1)).to.equal(8);
        });

        it('when height == (milestoneEight * 2) should return 8', function () {
            expect(blockReward.calcMilestone(milestoneHeight(8)*2)).to.equal(8);
        });

        it('when height == (milestoneEight * 10) should return 8', function () {
            expect(blockReward.calcMilestone(milestoneHeight(8)*10)).to.equal(8);
        });

        it('when height == (milestoneEight * 100) should return 8', function () {
            expect(blockReward.calcMilestone(milestoneHeight(8)*100)).to.equal(8);
        });

        it('when height == (milestoneEight * 1000) should return 8', function () {
            expect(blockReward.calcMilestone(milestoneHeight(8)*1000)).to.equal(8);
        });

        it('when height == (milestoneEight * 10000) should return 8', function () {
            expect(blockReward.calcMilestone(milestoneHeight(8)*10000)).to.equal(8);
        });

        it('when height == (milestoneEight * 100000) should return 8', function () {
            expect(blockReward.calcMilestone(milestoneHeight(8)*100000)).to.equal(8);
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
			expect(blockReward.calcReward(constants.rewards.offset-1)).to.equal(0);
		});

		it(`when height == (offset) should return ${constants.rewards.milestones[0]}`, function () {
            expect(blockReward.calcReward(constants.rewards.offset)).to.equal(constants.rewards.milestones[0]);
		});

		it(`when height == (offset + 1) should return ${constants.rewards.milestones[0]}`, function () {
			expect(blockReward.calcReward(constants.rewards.offset+1)).to.equal(constants.rewards.milestones[0]);
		});

		it(`when height == (offset + 2) should return ${constants.rewards.milestones[0]}`, function () {
			expect(blockReward.calcReward(constants.rewards.offset+2)).to.equal(constants.rewards.milestones[0]);
		});

		it(`when height == (distance) should return ${constants.rewards.milestones[0]}`, function () {
			expect(blockReward.calcReward(constants.rewards.distance)).to.equal(constants.rewards.milestones[0]);
		});

		it(`when height == (distance + 1) should return ${constants.rewards.milestones[0]}`, function () {
			expect(blockReward.calcReward(constants.rewards.distance+1)).to.equal(constants.rewards.milestones[0]);
		});

		it(`when height == (distance + 2) should return ${constants.rewards.milestones[0]}`, function () {
			expect(blockReward.calcReward(constants.rewards.distance+2)).to.equal(constants.rewards.milestones[0]);
		});

		it(`when height == (milestoneOne - 1) should return ${constants.rewards.milestones[0]}`, function () {
			expect(blockReward.calcReward(milestoneHeight(1) - 1)).to.equal(constants.rewards.milestones[0]);
		});

		it(`when height == (milestoneOne) should return ${constants.rewards.milestones[1]}`, function () {
			expect(blockReward.calcReward(milestoneHeight(1))).to.equal(constants.rewards.milestones[1]);
		});

		it(`when height == (milestoneOne + 1) should return ${constants.rewards.milestones[1]}`, function () {
			expect(blockReward.calcReward(milestoneHeight(1)+1)).to.equal(constants.rewards.milestones[1]);
		});

		it(`when height == (milestoneTwo - 1) should return ${constants.rewards.milestones[1]}`, function () {
			expect(blockReward.calcReward(milestoneHeight(2)-1)).to.equal(constants.rewards.milestones[1]);
		});

		it(`when height == (milestoneTwo) should return ${constants.rewards.milestones[2]}`, function () {
			expect(blockReward.calcReward(milestoneHeight(2))).to.equal(constants.rewards.milestones[2]);
		});

		it(`when height == (milestoneTwo + 1) should return ${constants.rewards.milestones[2]}`, function () {
			expect(blockReward.calcReward(milestoneHeight(2)+1)).to.equal(constants.rewards.milestones[2]);
		});

		it(`when height == (milestoneThree - 1) should return ${constants.rewards.milestones[2]}`, function () {
			expect(blockReward.calcReward(milestoneHeight(3)-1)).to.equal(constants.rewards.milestones[2]);
		});

		it(`when height == (milestoneThree) should return ${constants.rewards.milestones[3]}`, function () {
			expect(blockReward.calcReward(milestoneHeight(3))).to.equal(constants.rewards.milestones[3]);
		});

		it(`when height == (milestoneThree + 1) should return ${constants.rewards.milestones[3]}`, function () {
			expect(blockReward.calcReward(milestoneHeight(3)+1)).to.equal(constants.rewards.milestones[3]);
		});

		it(`when height == (milestoneFour - 1) should return ${constants.rewards.milestones[3]}`, function () {
			expect(blockReward.calcReward(milestoneHeight(4)-1)).to.equal(constants.rewards.milestones[3]);
		});

		it(`when height == (milestoneFour) should return ${constants.rewards.milestones[4]}`, function () {
			expect(blockReward.calcReward(milestoneHeight(4))).to.equal(constants.rewards.milestones[4]);
		});

		it(`when height == (milestoneFour + 1) should return ${constants.rewards.milestones[4]}`, function () {
			expect(blockReward.calcReward(milestoneHeight(4)+1)).to.equal(constants.rewards.milestones[4]);
		});

        it(`when height == (milestoneFive - 1) should return ${constants.rewards.milestones[4]}`, function () {
            expect(blockReward.calcReward(milestoneHeight(5)-1)).to.equal(constants.rewards.milestones[4]);
        });

        it(`when height == (milestoneFive) should return ${constants.rewards.milestones[5]}`, function () {
            expect(blockReward.calcReward(milestoneHeight(5))).to.equal(constants.rewards.milestones[5]);
        });

        it(`when height == (milestoneFive + 1) should return ${constants.rewards.milestones[5]}`, function () {
            expect(blockReward.calcReward(milestoneHeight(5)+1)).to.equal(constants.rewards.milestones[5]);
        });

        it(`when height == (milestoneSix - 1) should return ${constants.rewards.milestones[5]}`, function () {
            expect(blockReward.calcReward(milestoneHeight(6)-1)).to.equal(constants.rewards.milestones[5]);
        });

        it(`when height == (milestoneSix) should return ${constants.rewards.milestones[6]}`, function () {
            expect(blockReward.calcReward(milestoneHeight(6))).to.equal(constants.rewards.milestones[6]);
        });

        it(`when height == (milestoneSix + 1) should return ${constants.rewards.milestones[6]}`, function () {
            expect(blockReward.calcReward(milestoneHeight(6)+1)).to.equal(constants.rewards.milestones[6]);
        });

        it(`when height == (milestoneSeven - 1) should return ${constants.rewards.milestones[6]}`, function () {
            expect(blockReward.calcReward(milestoneHeight(7)-1)).to.equal(constants.rewards.milestones[6]);
        });

        it(`when height == (milestoneSeven) should return ${constants.rewards.milestones[7]}`, function () {
            expect(blockReward.calcReward(milestoneHeight(7))).to.equal(constants.rewards.milestones[7]);
        });

        it(`when height == (milestoneSeven + 1) should return ${constants.rewards.milestones[7]}`, function () {
            expect(blockReward.calcReward(milestoneHeight(7)+1)).to.equal(constants.rewards.milestones[7]);
        });

        it(`when height == (milestoneEight - 1) should return ${constants.rewards.milestones[7]}`, function () {
            expect(blockReward.calcReward(milestoneHeight(8)-1)).to.equal(constants.rewards.milestones[7]);
        });

        it(`when height == (milestoneEight) should return ${constants.rewards.milestones[8]}`, function () {
            expect(blockReward.calcReward(milestoneHeight(8))).to.equal(constants.rewards.milestones[8]);
        });

        it(`when height == (milestoneEight + 1) should return ${constants.rewards.milestones[8]}`, function () {
            expect(blockReward.calcReward(milestoneHeight(8)+1)).to.equal(constants.rewards.milestones[8]);
        });

		it(`when height == (milestoneEight * 2) should return ${constants.rewards.milestones[8]}`, function () {
			expect(blockReward.calcReward(milestoneHeight(8) * 2)).to.equal(constants.rewards.milestones[8]);
		});

		it(`when height == (milestoneEight * 10) should return ${constants.rewards.milestones[8]}`, function () {
			expect(blockReward.calcReward(milestoneHeight(8) * 10)).to.equal(constants.rewards.milestones[8]);
		});

		it(`when height == (milestoneEight * 100) should return ${constants.rewards.milestones[8]}`, function () {
			expect(blockReward.calcReward(milestoneHeight(8) * 100)).to.equal(constants.rewards.milestones[8]);
		});

		it(`when height == (milestoneEight * 1000) should return ${constants.rewards.milestones[8]}`, function () {
			expect(blockReward.calcReward(milestoneHeight(8) * 1000)).to.equal(constants.rewards.milestones[8]);
		});

		it(`when height == (milestoneEight * 10000) should return ${constants.rewards.milestones[8]}`, function () {
			expect(blockReward.calcReward(milestoneHeight(8) * 10000)).to.equal(constants.rewards.milestones[8]);
		});

		it(`when height == (milestoneEight * 100000) should return ${constants.rewards.milestones[8]}`, function () {
			expect(blockReward.calcReward(milestoneHeight(8) * 100000)).to.equal(constants.rewards.milestones[8]);
		});
	});

	describe('returning calcSupply', function () {

		it('when height is undefined should throw an error', function () {
			expect(blockReward.calcSupply).to.throw(/Invalid block height/);
		});

		it(`when height == 0 should return ${constants.totalAmount}`, function () {
			expect(blockReward.calcSupply(0)).to.equal(constants.totalAmount);
		});

		it(`when height == 1 should return ${constants.totalAmount}`, function () {
			expect(blockReward.calcSupply(1)).to.equal(constants.totalAmount);
		});

		it(`when height == (offset - 1) should return ${constants.totalAmount}`, function () {
			expect(blockReward.calcSupply(constants.rewards.offset-1)).to.equal(constants.totalAmount);
		});

		it(`when height == (offset) should return ${milestoneSupply(0,1)}`, function () {
			expect(blockReward.calcSupply(constants.rewards.offset)).to.equal(milestoneSupply(0,1));
		});

		it(`when height == (offset + 1) should return ${milestoneSupply(0,2)}`, function () {
			expect(blockReward.calcSupply(constants.rewards.offset+1)).to.equal(milestoneSupply(0,2));
		});

		it(`when height == (offset + 2) should return ${milestoneSupply(0,3)}`, function () {
			expect(blockReward.calcSupply(constants.rewards.offset+2)).to.equal(milestoneSupply(0,3));
		});

		it(`when height == (distance) should return ${milestoneSupply(0,constants.rewards.distance-constants.rewards.offset+1)}`, function () {
			expect(blockReward.calcSupply(constants.rewards.distance)).to
				.equal(milestoneSupply(0,constants.rewards.distance-constants.rewards.offset+1));
		});

		it(`when height == (distance + 1) should return ${milestoneSupply(0,constants.rewards.distance-constants.rewards.offset+1+1)}`, function () {
			expect(blockReward.calcSupply(constants.rewards.distance+1)).to
				.equal(milestoneSupply(0,constants.rewards.distance-constants.rewards.offset+1+1));
		});

		it(`when height == (distance + 2) should return ${milestoneSupply(0,constants.rewards.distance-constants.rewards.offset+3)}`, function () {
			expect(blockReward.calcSupply(constants.rewards.distance+2)).to.equal(milestoneSupply(0,constants.rewards.distance-constants.rewards.offset+3));
		});

		it(`when height == (milestoneOne - 1) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)}`, function () {
			expect(blockReward.calcSupply(milestoneHeight(1)-1)).to
				.equal(milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset));
		});

		it(`when height == (milestoneOne) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)+constants.rewards.milestones[1]}`,
			function () {
				expect(blockReward.calcSupply(milestoneHeight(1))).to
					.equal(milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)+constants.rewards.milestones[1]);
			}
		);

		it(`when height == (milestoneOne + 1) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)+constants.rewards.milestones[1]*2}`,
			function () {
				expect(blockReward.calcSupply(milestoneHeight(1)+1)).to
					.equal(milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)+constants.rewards.milestones[1]*2);
			}
		);

		it(`when height == (milestoneTwo - 1) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)+(constants.rewards.milestones[1]*constants.rewards.distance)-1}`,
			function () {
				expect(blockReward.calcSupply(milestoneHeight(2)-1)).to
					.equal(milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)+(constants.rewards.milestones[1]*constants.rewards.distance)-1);
			}
		);

		it(`when height == (milestoneTwo) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
            +(constants.rewards.milestones[1]*constants.rewards.distance)
            +constants.rewards.milestones[2]}`,
			function () {
				expect(blockReward.calcSupply(milestoneHeight(2))).to
					.equal(milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
						+(constants.rewards.milestones[1]*constants.rewards.distance)
						+constants.rewards.milestones[2]);
			}
		);

		it(`when height == (milestoneTwo + 1) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
        +(constants.rewards.milestones[1]*constants.rewards.distance)
        +constants.rewards.milestones[2]*2}`,
			function () {
				expect(blockReward.calcSupply(milestoneHeight(2)+1)).to
					.equal(milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
                    	+(constants.rewards.milestones[1]*constants.rewards.distance)
                    	+constants.rewards.milestones[2]*2);
			}
		);

		it(`when height == (milestoneThree - 1) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
            +(constants.rewards.milestones[1]*constants.rewards.distance)
            +(constants.rewards.milestones[2]*constants.rewards.distance)-1}`,
			function () {
				expect(blockReward.calcSupply(milestoneHeight(3)-1)).to
					.equal(milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
						+(constants.rewards.milestones[1]*constants.rewards.distance)
						+(constants.rewards.milestones[2]*constants.rewards.distance)-1);
			}
		);

		it(`when height == (milestoneThree) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
            +(constants.rewards.milestones[1]*constants.rewards.distance)
            +(constants.rewards.milestones[2]*constants.rewards.distance)
            +constants.rewards.milestones[3]}`,
			function () {
				expect(blockReward.calcSupply(milestoneHeight(3))).to
					.equal(milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
						+(constants.rewards.milestones[1]*constants.rewards.distance)
						+(constants.rewards.milestones[2]*constants.rewards.distance)
						+constants.rewards.milestones[3]);
			}
		);

		it(`when height == (milestoneThree + 1) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
        +(constants.rewards.milestones[1]*constants.rewards.distance)
        +(constants.rewards.milestones[2]*constants.rewards.distance)
        +constants.rewards.milestones[3]}`,
			function () {
				expect(blockReward.calcSupply(milestoneHeight(3)+1)).to
					.equal(milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
						+(constants.rewards.milestones[1]*constants.rewards.distance)
						+(constants.rewards.milestones[2]*constants.rewards.distance)
						+constants.rewards.milestones[3]*2);
			}
		);

		it(`when height == (milestoneFour - 1) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
            +(constants.rewards.milestones[1]*constants.rewards.distance)
            +(constants.rewards.milestones[2]*constants.rewards.distance)
            +(constants.rewards.milestones[3]*constants.rewards.distance)-1}`,
			function () {
				expect(blockReward.calcSupply(milestoneHeight(4)-1)).to
					.equal(milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
                        +(constants.rewards.milestones[1]*constants.rewards.distance)
                        +(constants.rewards.milestones[2]*constants.rewards.distance)
                        +(constants.rewards.milestones[3]*constants.rewards.distance)-1);
			}
		);

		it(`when height == (milestoneFour) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
            +(constants.rewards.milestones[1]*constants.rewards.distance)
            +(constants.rewards.milestones[2]*constants.rewards.distance)
            +(constants.rewards.milestones[3]*constants.rewards.distance)
            +constants.rewards.milestones[4]}`,
			function () {
				expect(blockReward.calcSupply(milestoneHeight(4))).to
					.equal(milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
                        +(constants.rewards.milestones[1]*constants.rewards.distance)
                        +(constants.rewards.milestones[2]*constants.rewards.distance)
                        +(constants.rewards.milestones[3]*constants.rewards.distance)
						+constants.rewards.milestones[4]);
			}
		);

		it(`when height == (milestoneFour + 1) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
            +(constants.rewards.milestones[1]*constants.rewards.distance)
            +(constants.rewards.milestones[2]*constants.rewards.distance)
            +(constants.rewards.milestones[3]*constants.rewards.distance)
            +constants.rewards.milestones[4]*2}`,
			function () {
				expect(blockReward.calcSupply(milestoneHeight(4)+1)).to
					.equal(milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
                        +(constants.rewards.milestones[1]*constants.rewards.distance)
                        +(constants.rewards.milestones[2]*constants.rewards.distance)
                        +(constants.rewards.milestones[3]*constants.rewards.distance)
                        +constants.rewards.milestones[4]*2);
			}
		);

        it(`when height == (milestoneFive - 1) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
            +(constants.rewards.milestones[1]*constants.rewards.distance)
            +(constants.rewards.milestones[2]*constants.rewards.distance)
            +(constants.rewards.milestones[3]*constants.rewards.distance)
            +(constants.rewards.milestones[4]*constants.rewards.distance)-1}`,
            function () {
                expect(blockReward.calcSupply(milestoneHeight(5)-1)).to
                    .equal(milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
                        +(constants.rewards.milestones[1]*constants.rewards.distance)
                        +(constants.rewards.milestones[2]*constants.rewards.distance)
                        +(constants.rewards.milestones[3]*constants.rewards.distance)
                        +(constants.rewards.milestones[4]*constants.rewards.distance-1));
            }
        );

        it(`when height == (milestoneFive) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
            +(constants.rewards.milestones[1]*constants.rewards.distance)
            +(constants.rewards.milestones[2]*constants.rewards.distance)
            +(constants.rewards.milestones[3]*constants.rewards.distance)
            +(constants.rewards.milestones[4]*constants.rewards.distance)
            +constants.rewards.milestones[5]}`,
            function () {
                expect(blockReward.calcSupply(milestoneHeight(5))).to
                    .equal(milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
                        +(constants.rewards.milestones[1]*constants.rewards.distance)
                        +(constants.rewards.milestones[2]*constants.rewards.distance)
                        +(constants.rewards.milestones[3]*constants.rewards.distance)
                        +(constants.rewards.milestones[4]*constants.rewards.distance)
                        +constants.rewards.milestones[5]);
            }
        );

        it(`when height == (milestoneFive + 1) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
            +(constants.rewards.milestones[1]*constants.rewards.distance)
            +(constants.rewards.milestones[2]*constants.rewards.distance)
            +(constants.rewards.milestones[3]*constants.rewards.distance)
            +(constants.rewards.milestones[4]*constants.rewards.distance)
            +constants.rewards.milestones[5]*2}`,
            function () {
                expect(blockReward.calcSupply(milestoneHeight(5)+1)).to
                    .equal(milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
                        +(constants.rewards.milestones[1]*constants.rewards.distance)
                        +(constants.rewards.milestones[2]*constants.rewards.distance)
                        +(constants.rewards.milestones[3]*constants.rewards.distance)
                        +(constants.rewards.milestones[4]*constants.rewards.distance)
                        +constants.rewards.milestones[5]*2);
            }
        );

        it(`when height == (milestoneSix - 1) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
            +(constants.rewards.milestones[1]*constants.rewards.distance)
            +(constants.rewards.milestones[2]*constants.rewards.distance)
            +(constants.rewards.milestones[3]*constants.rewards.distance)
            +(constants.rewards.milestones[4]*constants.rewards.distance)
            +(constants.rewards.milestones[5]*constants.rewards.distance)-1}`,
            function () {
                expect(blockReward.calcSupply(milestoneHeight(6)-1)).to
                    .equal(milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
                        +(constants.rewards.milestones[1]*constants.rewards.distance)
                        +(constants.rewards.milestones[2]*constants.rewards.distance)
                        +(constants.rewards.milestones[3]*constants.rewards.distance)
                        +(constants.rewards.milestones[4]*constants.rewards.distance)
                        +(constants.rewards.milestones[5]*constants.rewards.distance));
            }
        );

        it(`when height == (milestoneSix) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
            +(constants.rewards.milestones[1]*constants.rewards.distance)
            +(constants.rewards.milestones[2]*constants.rewards.distance)
            +(constants.rewards.milestones[3]*constants.rewards.distance)
            +(constants.rewards.milestones[4]*constants.rewards.distance)
            +(constants.rewards.milestones[5]*constants.rewards.distance)
            +constants.rewards.milestones[6]}`,
            function () {
                expect(blockReward.calcSupply(milestoneHeight(6))).to
                    .equal(milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
                        +(constants.rewards.milestones[1]*constants.rewards.distance)
                        +(constants.rewards.milestones[2]*constants.rewards.distance)
                        +(constants.rewards.milestones[3]*constants.rewards.distance)
                        +(constants.rewards.milestones[4]*constants.rewards.distance)
                        +(constants.rewards.milestones[5]*constants.rewards.distance)
                        +constants.rewards.milestones[6]);
            }
        );

        it(`when height == (milestoneSix + 1) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
            +(constants.rewards.milestones[1]*constants.rewards.distance)
            +(constants.rewards.milestones[2]*constants.rewards.distance)
            +(constants.rewards.milestones[3]*constants.rewards.distance)
            +(constants.rewards.milestones[4]*constants.rewards.distance)
            +(constants.rewards.milestones[5]*constants.rewards.distance)
            +constants.rewards.milestones[6]*2}`,
            function () {
                expect(blockReward.calcSupply(milestoneHeight(6)+1)).to
                    .equal(milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
                        +(constants.rewards.milestones[1]*constants.rewards.distance)
                        +(constants.rewards.milestones[2]*constants.rewards.distance)
                        +(constants.rewards.milestones[3]*constants.rewards.distance)
                        +(constants.rewards.milestones[4]*constants.rewards.distance)
                        +(constants.rewards.milestones[5]*constants.rewards.distance)
                        +constants.rewards.milestones[6]*2);
            }
        );

        it(`when height == (milestoneSeven - 1) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
            +(constants.rewards.milestones[1]*constants.rewards.distance)
            +(constants.rewards.milestones[2]*constants.rewards.distance)
            +(constants.rewards.milestones[3]*constants.rewards.distance)
            +(constants.rewards.milestones[4]*constants.rewards.distance)
            +(constants.rewards.milestones[5]*constants.rewards.distance)
            +(constants.rewards.milestones[6]*constants.rewards.distance)-1}`,
            function () {
                expect(blockReward.calcSupply(milestoneHeight(7)-1)).to
                    .equal(milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
                        +(constants.rewards.milestones[1]*constants.rewards.distance)
                        +(constants.rewards.milestones[2]*constants.rewards.distance)
                        +(constants.rewards.milestones[3]*constants.rewards.distance)
                        +(constants.rewards.milestones[4]*constants.rewards.distance)
                        +(constants.rewards.milestones[5]*constants.rewards.distance)
                        +(constants.rewards.milestones[6]*constants.rewards.distance)-1);
            }
        );

        it(`when height == (milestoneSeven) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
            +(constants.rewards.milestones[1]*constants.rewards.distance)
            +(constants.rewards.milestones[2]*constants.rewards.distance)
            +(constants.rewards.milestones[3]*constants.rewards.distance)
            +(constants.rewards.milestones[4]*constants.rewards.distance)
            +(constants.rewards.milestones[5]*constants.rewards.distance)
            +(constants.rewards.milestones[6]*constants.rewards.distance)
            +constants.rewards.milestones[7]}`,
            function () {
                expect(blockReward.calcSupply(milestoneHeight(7))).to
                    .equal(milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
                        +(constants.rewards.milestones[1]*constants.rewards.distance)
                        +(constants.rewards.milestones[2]*constants.rewards.distance)
                        +(constants.rewards.milestones[3]*constants.rewards.distance)
                        +(constants.rewards.milestones[4]*constants.rewards.distance)
                        +(constants.rewards.milestones[5]*constants.rewards.distance)
                        +(constants.rewards.milestones[6]*constants.rewards.distance)
                        +constants.rewards.milestones[7]);
            }
        );

        it(`when height == (milestoneSeven + 1) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
            +(constants.rewards.milestones[1]*constants.rewards.distance)
            +(constants.rewards.milestones[2]*constants.rewards.distance)
            +(constants.rewards.milestones[3]*constants.rewards.distance)
            +(constants.rewards.milestones[4]*constants.rewards.distance)
            +(constants.rewards.milestones[5]*constants.rewards.distance)
            +(constants.rewards.milestones[6]*constants.rewards.distance)
            +constants.rewards.milestones[7]*2}`,
            function () {
                expect(blockReward.calcSupply(milestoneHeight(7)+1)).to
                    .equal(milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
                        +(constants.rewards.milestones[1]*constants.rewards.distance)
                        +(constants.rewards.milestones[2]*constants.rewards.distance)
                        +(constants.rewards.milestones[3]*constants.rewards.distance)
                        +(constants.rewards.milestones[4]*constants.rewards.distance)
                        +(constants.rewards.milestones[5]*constants.rewards.distance)
                        +(constants.rewards.milestones[6]*constants.rewards.distance)
                        +constants.rewards.milestones[7]*2);
            }
        );

		it(`when height == (milestoneEight - 1) should return ${
			milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
            +(constants.rewards.milestones[1]*constants.rewards.distance)
            +(constants.rewards.milestones[2]*constants.rewards.distance)
            +(constants.rewards.milestones[3]*constants.rewards.distance)
            +(constants.rewards.milestones[4]*constants.rewards.distance)
            +(constants.rewards.milestones[5]*constants.rewards.distance)
            +(constants.rewards.milestones[6]*constants.rewards.distance)
            +(constants.rewards.milestones[7]*constants.rewards.distance)-1}`,
			function () {
				expect(blockReward.calcSupply(milestoneHeight(8)-1)).to
					.equal(milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
                        +(constants.rewards.milestones[1]*constants.rewards.distance)
                        +(constants.rewards.milestones[2]*constants.rewards.distance)
                        +(constants.rewards.milestones[3]*constants.rewards.distance)
                        +(constants.rewards.milestones[4]*constants.rewards.distance)
                        +(constants.rewards.milestones[5]*constants.rewards.distance)
                        +(constants.rewards.milestones[6]*constants.rewards.distance)
                        +(constants.rewards.milestones[7]*constants.rewards.distance)-1);
            }
		);

        it(`when height == (milestoneEight) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
            +(constants.rewards.milestones[1]*constants.rewards.distance)
            +(constants.rewards.milestones[2]*constants.rewards.distance)
            +(constants.rewards.milestones[3]*constants.rewards.distance)
            +(constants.rewards.milestones[4]*constants.rewards.distance)
            +(constants.rewards.milestones[5]*constants.rewards.distance)
            +(constants.rewards.milestones[6]*constants.rewards.distance)
            +(constants.rewards.milestones[7]*constants.rewards.distance)
            +(constants.rewards.milestones[8])}`,
            function () {
                expect(blockReward.calcSupply(milestoneHeight(8))).to
                    .equal(milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
                        +(constants.rewards.milestones[1]*constants.rewards.distance)
                        +(constants.rewards.milestones[2]*constants.rewards.distance)
                        +(constants.rewards.milestones[3]*constants.rewards.distance)
                        +(constants.rewards.milestones[4]*constants.rewards.distance)
                        +(constants.rewards.milestones[5]*constants.rewards.distance)
                        +(constants.rewards.milestones[6]*constants.rewards.distance)
                        +(constants.rewards.milestones[7]*constants.rewards.distance)
                        +(constants.rewards.milestones[8]));
            }
        );

        it(`when height == (milestoneEight + 1) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
            +(constants.rewards.milestones[1]*constants.rewards.distance)
            +(constants.rewards.milestones[2]*constants.rewards.distance)
            +(constants.rewards.milestones[3]*constants.rewards.distance)
            +(constants.rewards.milestones[4]*constants.rewards.distance)
            +(constants.rewards.milestones[5]*constants.rewards.distance)
            +(constants.rewards.milestones[6]*constants.rewards.distance)
            +(constants.rewards.milestones[7]*constants.rewards.distance)
            +(constants.rewards.milestones[8]*2)}`,
            function () {
                expect(blockReward.calcSupply(milestoneHeight(8)+1)).to
                    .equal(milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
                        +(constants.rewards.milestones[1]*constants.rewards.distance)
                        +(constants.rewards.milestones[2]*constants.rewards.distance)
                        +(constants.rewards.milestones[3]*constants.rewards.distance)
                        +(constants.rewards.milestones[4]*constants.rewards.distance)
                        +(constants.rewards.milestones[5]*constants.rewards.distance)
                        +(constants.rewards.milestones[6]*constants.rewards.distance)
                        +(constants.rewards.milestones[7]*constants.rewards.distance)
                        +(constants.rewards.milestones[8]*2));
            }
        );

        it(`when height == (milestoneEight * 2) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
            +(constants.rewards.milestones[1]*constants.rewards.distance)
            +(constants.rewards.milestones[2]*constants.rewards.distance)
            +(constants.rewards.milestones[3]*constants.rewards.distance)
            +(constants.rewards.milestones[4]*constants.rewards.distance)
            +(constants.rewards.milestones[5]*constants.rewards.distance)
            +(constants.rewards.milestones[6]*constants.rewards.distance)
            +(constants.rewards.milestones[7]*constants.rewards.distance)
            +constants.rewards.milestones[8]*milestoneHeight(8)
            +constants.rewards.milestones[8]}`,
            function () {
                expect(blockReward.calcSupply(milestoneHeight(8)*2)).to
                    .equal(milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
                        +(constants.rewards.milestones[1]*constants.rewards.distance)
                        +(constants.rewards.milestones[2]*constants.rewards.distance)
                        +(constants.rewards.milestones[3]*constants.rewards.distance)
                        +(constants.rewards.milestones[4]*constants.rewards.distance)
                        +(constants.rewards.milestones[5]*constants.rewards.distance)
                        +(constants.rewards.milestones[6]*constants.rewards.distance)
                        +(constants.rewards.milestones[7]*constants.rewards.distance)
             	   		+constants.rewards.milestones[8]*milestoneHeight(8)
						+constants.rewards.milestones[8]);
            }
        );

        it(`when height == (milestoneEight * 10) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
            +(constants.rewards.milestones[1]*constants.rewards.distance)
            +(constants.rewards.milestones[2]*constants.rewards.distance)
            +(constants.rewards.milestones[3]*constants.rewards.distance)
            +(constants.rewards.milestones[4]*constants.rewards.distance)
            +(constants.rewards.milestones[5]*constants.rewards.distance)
            +(constants.rewards.milestones[6]*constants.rewards.distance)
            +(constants.rewards.milestones[7]*constants.rewards.distance)
            +constants.rewards.milestones[8]*milestoneHeight(8)*9
            +constants.rewards.milestones[8]}`,
            function () {
                expect(blockReward.calcSupply(milestoneHeight(8)*10)).to
                    .equal(milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
                        +(constants.rewards.milestones[1]*constants.rewards.distance)
                        +(constants.rewards.milestones[2]*constants.rewards.distance)
                        +(constants.rewards.milestones[3]*constants.rewards.distance)
                        +(constants.rewards.milestones[4]*constants.rewards.distance)
                        +(constants.rewards.milestones[5]*constants.rewards.distance)
                        +(constants.rewards.milestones[6]*constants.rewards.distance)
                        +(constants.rewards.milestones[7]*constants.rewards.distance)
                        +constants.rewards.milestones[8]*milestoneHeight(8)*9
                        +constants.rewards.milestones[8]);
            }
        );

        it(`when height == (milestoneEight * 100) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
            +(constants.rewards.milestones[1]*constants.rewards.distance)
            +(constants.rewards.milestones[2]*constants.rewards.distance)
            +(constants.rewards.milestones[3]*constants.rewards.distance)
            +(constants.rewards.milestones[4]*constants.rewards.distance)
            +(constants.rewards.milestones[5]*constants.rewards.distance)
            +(constants.rewards.milestones[6]*constants.rewards.distance)
            +(constants.rewards.milestones[7]*constants.rewards.distance)
            +constants.rewards.milestones[8]*milestoneHeight(8)*99
            +constants.rewards.milestones[8]}`,
            function () {
                expect(blockReward.calcSupply(milestoneHeight(8)*100)).to
                    .equal(milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
                        +(constants.rewards.milestones[1]*constants.rewards.distance)
                        +(constants.rewards.milestones[2]*constants.rewards.distance)
                        +(constants.rewards.milestones[3]*constants.rewards.distance)
                        +(constants.rewards.milestones[4]*constants.rewards.distance)
                        +(constants.rewards.milestones[5]*constants.rewards.distance)
                        +(constants.rewards.milestones[6]*constants.rewards.distance)
                        +(constants.rewards.milestones[7]*constants.rewards.distance)
                        +constants.rewards.milestones[8]*milestoneHeight(8)*99
                        +constants.rewards.milestones[8]);
            }
        );

        it(`when height == (milestoneEight * 1000) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
            +(constants.rewards.milestones[1]*constants.rewards.distance)
            +(constants.rewards.milestones[2]*constants.rewards.distance)
            +(constants.rewards.milestones[3]*constants.rewards.distance)
            +(constants.rewards.milestones[4]*constants.rewards.distance)
            +(constants.rewards.milestones[5]*constants.rewards.distance)
            +(constants.rewards.milestones[6]*constants.rewards.distance)
            +(constants.rewards.milestones[7]*constants.rewards.distance)
            +constants.rewards.milestones[8]*milestoneHeight(8)*999
            +constants.rewards.milestones[8]}`,
            function () {
                expect(blockReward.calcSupply(milestoneHeight(8)*1000)).to
                    .equal(milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
                        +(constants.rewards.milestones[1]*constants.rewards.distance)
                        +(constants.rewards.milestones[2]*constants.rewards.distance)
                        +(constants.rewards.milestones[3]*constants.rewards.distance)
                        +(constants.rewards.milestones[4]*constants.rewards.distance)
                        +(constants.rewards.milestones[5]*constants.rewards.distance)
                        +(constants.rewards.milestones[6]*constants.rewards.distance)
                        +(constants.rewards.milestones[7]*constants.rewards.distance)
                        +constants.rewards.milestones[8]*milestoneHeight(8)*999
                        +constants.rewards.milestones[8]);
            }
        );

        it(`when height == (milestoneEight * 10000) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
            +(constants.rewards.milestones[1]*constants.rewards.distance)
            +(constants.rewards.milestones[2]*constants.rewards.distance)
            +(constants.rewards.milestones[3]*constants.rewards.distance)
            +(constants.rewards.milestones[4]*constants.rewards.distance)
            +(constants.rewards.milestones[5]*constants.rewards.distance)
            +(constants.rewards.milestones[6]*constants.rewards.distance)
            +(constants.rewards.milestones[7]*constants.rewards.distance)
            +constants.rewards.milestones[8]*milestoneHeight(8)*9999
            +constants.rewards.milestones[8]}`,
            function () {
                expect(blockReward.calcSupply(milestoneHeight(8)*10000)).to
                    .equal(milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
                        +(constants.rewards.milestones[1]*constants.rewards.distance)
                        +(constants.rewards.milestones[2]*constants.rewards.distance)
                        +(constants.rewards.milestones[3]*constants.rewards.distance)
                        +(constants.rewards.milestones[4]*constants.rewards.distance)
                        +(constants.rewards.milestones[5]*constants.rewards.distance)
                        +(constants.rewards.milestones[6]*constants.rewards.distance)
                        +(constants.rewards.milestones[7]*constants.rewards.distance)
                        +constants.rewards.milestones[8]*milestoneHeight(8)*9999
                        +constants.rewards.milestones[8]);
            }
        );

        it(`when height == (milestoneEight * 100000) should return ${milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
            +(constants.rewards.milestones[1]*constants.rewards.distance)
            +(constants.rewards.milestones[2]*constants.rewards.distance)
            +(constants.rewards.milestones[3]*constants.rewards.distance)
            +(constants.rewards.milestones[4]*constants.rewards.distance)
            +(constants.rewards.milestones[5]*constants.rewards.distance)
            +(constants.rewards.milestones[6]*constants.rewards.distance)
            +(constants.rewards.milestones[7]*constants.rewards.distance)
            +constants.rewards.milestones[8]*milestoneHeight(8)*99999
            +constants.rewards.milestones[8]}`,
            function () {
                expect(blockReward.calcSupply(milestoneHeight(8)*100000)).to
                    .equal(milestoneSupply(0,milestoneHeight(1)-constants.rewards.offset)
                        +(constants.rewards.milestones[1]*constants.rewards.distance)
                        +(constants.rewards.milestones[2]*constants.rewards.distance)
                        +(constants.rewards.milestones[3]*constants.rewards.distance)
                        +(constants.rewards.milestones[4]*constants.rewards.distance)
                        +(constants.rewards.milestones[5]*constants.rewards.distance)
                        +(constants.rewards.milestones[6]*constants.rewards.distance)
                        +(constants.rewards.milestones[7]*constants.rewards.distance)
                        +constants.rewards.milestones[8]*milestoneHeight(8)*99999
                        +constants.rewards.milestones[8]);
            }
        );

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
					var supply = blockReward.calcSupply(constants.rewards.offset-1);
					var prev = supply;

					for (var i = constants.rewards.offset; i < constants.rewards.offset+constants.rewards.distance; i++) {
						supply = blockReward.calcSupply(i);
						expect(supply).to.equal(prev + constants.rewards.milestones[0]);
						prev = supply;
					}
				});
			});

			describe('for milestone 1', function () {

				it('should be ok', function () {
					var supply = blockReward.calcSupply(constants.rewards.offset+constants.rewards.distance-1);
					var prev = supply;

					for (var i = constants.rewards.offset+constants.rewards.distance; i < constants.rewards.offset+constants.rewards.distance*2; i++) {
						supply = blockReward.calcSupply(i);
						expect(supply).to.equal(prev + constants.rewards.milestones[1]);
						prev = supply;
					}
				});
			});

			describe('for milestone 2', function () {

				it('should be ok', function () {
					var supply = blockReward.calcSupply(constants.rewards.offset+constants.rewards.distance*2-1);
					var prev = supply;

					for (var i = constants.rewards.offset+constants.rewards.distance*2; i < constants.rewards.offset+constants.rewards.distance*3; i++) {
						supply = blockReward.calcSupply(i);
						expect(supply).to.equal(prev + constants.rewards.milestones[2]);
						prev = supply;
					}
				});
			});

			describe('for milestone 3', function () {

				it('should be ok', function () {
					var supply = blockReward.calcSupply(constants.rewards.offset+constants.rewards.distance*3-1);
					var prev = supply;

					for (var i = constants.rewards.offset+constants.rewards.distance*3; i < constants.rewards.offset+constants.rewards.distance*4; i++) {
						supply = blockReward.calcSupply(i);
						expect(supply).to.equal(prev + constants.rewards.milestones[3]);
						prev = supply;
					}
				});
			});

            describe('for milestone 4', function () {

                it('should be ok', function () {
                    var supply = blockReward.calcSupply(constants.rewards.offset+constants.rewards.distance*4-1);
                    var prev = supply;

                    for (var i = constants.rewards.offset+constants.rewards.distance*4;
						 i < constants.rewards.offset+constants.rewards.distance*5; i++) {
                        supply = blockReward.calcSupply(i);
                        expect(supply).to.equal(prev + constants.rewards.milestones[4]);
                        prev = supply;
                    }
                });
            });

            describe('for milestone 5', function () {

                it('should be ok', function () {
                    var supply = blockReward.calcSupply(constants.rewards.offset+constants.rewards.distance*5-1);
                    var prev = supply;

                    for (var i = constants.rewards.offset+constants.rewards.distance*5;
                         i < constants.rewards.offset+constants.rewards.distance*6; i++) {
                        supply = blockReward.calcSupply(i);
                        expect(supply).to.equal(prev + constants.rewards.milestones[5]);
                        prev = supply;
                    }
                });
            });

            describe('for milestone 6', function () {

                it('should be ok', function () {
                    var supply = blockReward.calcSupply(constants.rewards.offset+constants.rewards.distance*6-1);
                    var prev = supply;

                    for (var i = constants.rewards.offset+constants.rewards.distance*6;
                         i < constants.rewards.offset+constants.rewards.distance*7; i++) {
                        supply = blockReward.calcSupply(i);
                        expect(supply).to.equal(prev + constants.rewards.milestones[6]);
                        prev = supply;
                    }
                });
            });

            describe('for milestone 7', function () {

                it('should be ok', function () {
                    var supply = blockReward.calcSupply(constants.rewards.offset+constants.rewards.distance*7-1);
                    var prev = supply;

                    for (var i = constants.rewards.offset+constants.rewards.distance*7;
                         i < constants.rewards.offset+constants.rewards.distance*8; i++) {
                        supply = blockReward.calcSupply(i);
                        expect(supply).to.equal(prev + constants.rewards.milestones[7]);
                        prev = supply;
                    }
                });
            });

            describe('for milestone 8 and beyond', function () {

                it('should be ok', function () {
                    var supply = blockReward.calcSupply(constants.rewards.offset+constants.rewards.distance*8-1);
                    var prev = supply;

                    for (var i = constants.rewards.offset+constants.rewards.distance*8;
                         i < constants.rewards.offset+constants.rewards.distance*8+100; i++) {
                        supply = blockReward.calcSupply(i);
                        expect(supply).to.equal(prev + constants.rewards.milestones[8]);
                        prev = supply;
                    }
                });
            });
		});
	});
});
