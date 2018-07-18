/* Add votesWeight Column to Mem Accounts
 *
 */

BEGIN;

ALTER TABLE "mem_accounts" ADD COLUMN IF NOT EXISTS "votesWeight" BIGINT DEFAULT 0;

-- Set votesWeight for existing accounts
UPDATE "mem_accounts" AS m SET "votesWeight" = 0;

UPDATE "mem_accounts" AS m SET "votesWeight" = vote_weight FROM ( SELECT ma."address", SUM("total_balance"::bigint) as vote_weight, MAX(ma3."divider"),MAX(ma3."total_balance") FROM mem_accounts ma LEFT JOIN mem_accounts2delegates ma2d on ENCODE(ma."publicKey",'hex')=ma2d."dependentId" LEFT JOIN (SELECT (SELECT COUNT("accountId") FROM mem_accounts2delegates ma2d WHERE "accountId"=ma2."address") as divider, floor("balance"::bigint/(SELECT COUNT("accountId") FROM mem_accounts2delegates ma2d WHERE "accountId"=ma2."address")) as total_balance, ma2."address" as address  FROM mem_accounts ma2 WHERE (SELECT COUNT("accountId") FROM mem_accounts2delegates ma2d WHERE "accountId"=ma2."address")>0) ma3 ON ma2d."accountId"=ma3."address" WHERE ma."isDelegate"=1 GROUP BY ma."address") as vv WHERE vv."address"=m."address" AND m."isDelegate"=1;

COMMIT;
