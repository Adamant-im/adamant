/*
 * - Recreate blockRewards data type and function getBlockRewards (simplify milestones)
 * - Recreate calcBlockReward function, improved performance
 * - Create calcSupply_test function - for testing calcSupply
 * - Recreate calcSupply, improved performance, change type to IMMUTABLE
 */

BEGIN;

-- Drop old functions and data type
DROP FUNCTION IF EXISTS getBlockRewards();
DROP FUNCTION IF EXISTS calcBlockReward(int);
DROP FUNCTION If EXISTS calcSupply(int);
DROP TYPE IF EXISTS blockRewards;

-- Create new data type which will store block rewards info
CREATE TYPE blockRewards AS (supply bigint, start int, distance bigint, milestones bigint[]);

-- Create function that returns blocks rewards data
-- @IMMUTABLE - always returns the same result
CREATE FUNCTION getBlockRewards() RETURNS blockRewards LANGUAGE PLPGSQL IMMUTABLE AS $$
	DECLARE
		res        blockRewards;
		supply     bigint     = 9800000000000000; -- Initial supply
		start      int        = 1500000; -- Start rewards at block (n)
		distance   bigint     = 6300000; -- Distance between each milestone
		milestones bigint[] = ARRAY[   -- Milestones
			100000000, -- Initial Reward
			 95000000, -- Milestone 1
			 90000000, -- Milestone 2
			 85000000, -- Milestone 3
			 80000000,  -- Milestone 4
			 75000000,  -- Milestone 5
			 70000000,  -- Milestone 6
			 65000000,  -- Milestone 7
			 60000000,  -- Milestone 8
			 55000000,  -- Milestone 9
			 50000000,  -- Milestone 10
			 45000000,  -- Milestone 11
			 40000000,  -- Milestone 12
			 35000000,  -- Milestone 13
			 30000000,  -- Milestone 14
			 25000000,  -- Milestone 15
			 20000000,  -- Milestone 16
			 15000000,  -- Milestone 17
			 10000000,  -- Milestone 18
			 10000000  -- Milestone 19
		];
	BEGIN
		res.supply     = supply;
		res.start      = start;
		res.distance   = distance;
		res.milestones = milestones;
	RETURN res;
END $$;

-- Create function that returns blocks rewards data
-- @IMMUTABLE - always returns the same result for the same argument
CREATE FUNCTION calcBlockReward(block_height int) RETURNS bigint LANGUAGE PLPGSQL IMMUTABLE AS $$
	DECLARE
		r blockRewards;
		mile int;
	BEGIN
		-- Return NULL if supplied height is invalid
		IF block_height IS NULL OR block_height <= 0 THEN RETURN NULL; END IF;

		-- Get blocks rewards data
		SELECT * FROM getBlockRewards() INTO r;

		-- If height is below rewards start - return 0
		IF block_height < r.start THEN
			RETURN 0;
		END IF;

		-- Calculate milestone for height (we use +1 here because array indexes by default begins from 1 in postgres)
		mile := FLOOR((block_height-r.start)/r.distance)+1;

		-- If calculated milestone exceeds last milestone
		IF mile > array_length(r.milestones, 1) THEN
			-- Use last milestone
			mile := array_length(r.milestones, 1);
		END IF;

		-- Return calculated reward
		RETURN r.milestones[mile];
END $$;

-- Create function that calculate current supply
-- @IMMUTABLE - always returns the same result for the same argument
CREATE FUNCTION calcSupply(block_height int) RETURNS bigint LANGUAGE PLPGSQL IMMUTABLE AS $$
	DECLARE
		r blockRewards;
		mile   int;
	BEGIN
		-- Return NULL if supplied height is invalid
		IF block_height IS NULL OR block_height <= 0 THEN RETURN NULL; END IF;

		-- Get blocks rewards data
		SELECT * FROM getBlockRewards() INTO r;

		-- If height is below rewards start - return initial supply
		IF block_height < r.start THEN
			RETURN r.supply;
		END IF;

		-- Calculate milestone for height (we use +1 here because array indexes by default begins from 1 in postgres)
		mile := FLOOR((block_height-r.start)/r.distance)+1;

		-- If calculated milestone exceeds last milestone
		IF mile > array_length(r.milestones, 1) THEN
			-- Use last milestone
			mile := array_length(r.milestones, 1);
		END IF;

		-- Iterate over milestones
		FOR m IN 1..mile LOOP
			IF m = mile THEN
				-- Not completed milestone
				-- Calculate amount of blocks in milestone, calculate rewards and add to supply
				r.supply := r.supply + (block_height-r.start+1-r.distance*(m-1))*r.milestones[m];
			ELSE
				-- Completed milestone
				-- Use distance for calculate rewards for blocks in milestone and add to supply
				r.supply := r.supply + r.distance*r.milestones[m];
			END IF;
		END LOOP;

	-- Return calculated supply
	RETURN r.supply;
END $$;

-- Create function for testing calcSupply(int) function
-- @IMMUTABLE - always returns the same result for the same arguments
CREATE FUNCTION calcSupply_test(height_start int, height_end int, expected_reward bigint) RETURNS boolean LANGUAGE PLPGSQL IMMUTABLE AS $$
	DECLARE
		supply bigint;
		prev_supply bigint;
	BEGIN
		-- Calculate supply for previous height
		SELECT calcSupply(height_start-1) INTO prev_supply;

		-- Iteratating over heights
		FOR height IN height_start..height_end LOOP
			-- Calculate supply for current height
			SELECT calcSupply(height) INTO supply;

			-- If supply for previous height + expected block reward is different than supply for current height
			IF (prev_supply+expected_reward) <> supply THEN
				-- Break and retun false
				RETURN false;
			END IF;

			-- Update supply for previous height
			prev_supply := supply;
		END LOOP;

		-- All tests passed - return true
		RETURN true;
END $$;

COMMIT;
