/*
 * - Recreate blockRewards data type and function getBlockRewards (simplify milestones)
 * - Recreate calcBlockReward function, improved performance
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
start      int        = 2000000; -- Start rewards at block (n)
distance   bigint     = 6300000; -- Distance between each milestone
milestones bigint[] = ARRAY[   -- Milestones
10000000, -- Initial Reward
9500000, -- Milestone 1
9000000, -- Milestone 2
8500000, -- Milestone 3
8000000,  -- Milestone 4
7500000,  -- Milestone 5
7000000,  -- Milestone 6
6500000,  -- Milestone 7
6000000,  -- Milestone 8
5500000,  -- Milestone 9
5000000,  -- Milestone 10
4500000,  -- Milestone 11
4000000,  -- Milestone 12
3500000,  -- Milestone 13
3000000,  -- Milestone 14
2500000,  -- Milestone 15
2000000,  -- Milestone 16
1500000,  -- Milestone 17
1000000,  -- Milestone 18
1000000  -- Milestone 19
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


COMMIT;
