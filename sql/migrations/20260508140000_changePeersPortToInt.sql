/* Change Peers Port To Int
 *
 */

BEGIN;

ALTER TABLE "peers" ALTER COLUMN "port" TYPE INT;

COMMIT;
