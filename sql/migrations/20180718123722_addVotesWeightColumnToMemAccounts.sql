/* Add votesWeight Column to Mem Accounts
 *
 */

BEGIN;

ALTER TABLE "mem_accounts" ADD COLUMN IF NOT EXISTS "votesWeight" BIGINT NOT NULL DEFAULT 0;

-- Set votesWeight for existing accounts
UPDATE "mem_accounts" AS m SET "votesWeight" = 0;

UPDATE "mem_accounts" AS m SET "votesWeight" = COALESCE(vote_weight,0) FROM ( SELECT ma."address",  SUM("total_balance"::bigint) * (CASE WHEN ma.producedblocks + ma.missedblocks < 200 THEN 100.00 ELSE ROUND(100 - (ma.missedblocks::numeric / (ma.producedblocks + ma.missedblocks + 1) * 100), 2) END)::float/100 AS vote_weight FROM mem_accounts ma LEFT JOIN mem_accounts2delegates ma2d ON ENCODE(ma."publicKey", 'hex')=ma2d."dependentId" LEFT JOIN (SELECT  ma_group.divider, floor("balance"::bigint/ ma_group.divider) AS total_balance,   ma2."address" AS address FROM mem_accounts ma2 LEFT JOIN (SELECT COUNT("accountId") as divider, "accountId" FROM mem_accounts2delegates ma2d  GROUP BY "accountId" ) as ma_group ON ma_group."accountId"=ma2."address" WHERE ma_group.divider>0) ma3 ON ma2d."accountId"=ma3."address" WHERE ma."isDelegate"=1 GROUP BY ma."address") as vv WHERE vv."address"=m."address" AND m."isDelegate"=1;

COMMIT;
