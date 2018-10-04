'use strict';

var RoundsSql = {
	flush: 'DELETE FROM mem_round WHERE "round" = (${round})::bigint;',

	reCalcVotes: 'UPDATE "mem_accounts" AS m SET "votesWeight" = COALESCE(vote_weight,0) FROM ( SELECT ma."address",  SUM("total_balance"::bigint) * (CASE WHEN ma.producedblocks + ma.missedblocks < 200 THEN 100.00 ELSE ROUND(100 - (ma.missedblocks::numeric / (ma.producedblocks + ma.missedblocks + 1) * 100), 2) END)::float/100 AS vote_weight FROM mem_accounts ma LEFT JOIN mem_accounts2delegates ma2d ON ENCODE(ma."publicKey", \'hex\')=ma2d."dependentId" LEFT JOIN (SELECT  ma_group.divider, floor("balance"::bigint/ ma_group.divider) AS total_balance,   ma2."address" AS address FROM mem_accounts ma2 LEFT JOIN (SELECT COUNT("accountId") as divider, "accountId" FROM mem_accounts2delegates ma2d  GROUP BY "accountId" ) as ma_group ON ma_group."accountId"=ma2."address" WHERE ma_group.divider>0) ma3 ON ma2d."accountId"=ma3."address" WHERE ma."isDelegate"=1 GROUP BY ma."address") as vv WHERE vv."address"=m."address" AND m."isDelegate"=1;',

	truncateBlocks: 'DELETE FROM blocks WHERE "height" > (${height})::bigint;',

	updateMissedBlocks: function (backwards) {
		return [
			'UPDATE mem_accounts SET "missedblocks" = "missedblocks"',
			(backwards ? '- 1' : '+ 1'),
			'WHERE "address" IN ($1:csv);'
		].join(' ');
	},

	getVotes: 'SELECT d."delegate", d."amount" FROM (SELECT m."delegate", SUM(m."amount") AS "amount", "round" FROM mem_round m GROUP BY m."delegate", m."round") AS d WHERE "round" = (${round})::bigint',

	updateVotes: 'UPDATE mem_accounts SET "vote" = "vote" + (${amount})::bigint WHERE "address" = ${address};',

	updateBlockId: 'UPDATE mem_accounts SET "blockId" = ${newId} WHERE "blockId" = ${oldId};',

	summedRound: 'SELECT SUM(r.fee)::bigint AS "fees", ARRAY_AGG(r.reward) AS rewards, ARRAY_AGG(r.pk) AS delegates FROM (SELECT b."totalFee" AS fee, b.reward, ENCODE(b."generatorPublicKey", \'hex\') AS pk FROM blocks b WHERE CEIL(b.height / ${activeDelegates}::float)::int = ${round} ORDER BY b.height ASC) r;',

	clearRoundSnapshot: 'DROP TABLE IF EXISTS mem_round_snapshot',

	performRoundSnapshot: 'CREATE TABLE mem_round_snapshot AS TABLE mem_round',

	restoreRoundSnapshot: 'INSERT INTO mem_round SELECT * FROM mem_round_snapshot',

	clearVotesSnapshot: 'DROP TABLE IF EXISTS mem_votes_snapshot',

	performVotesSnapshot: 'CREATE TABLE mem_votes_snapshot AS SELECT address, vote FROM mem_accounts WHERE "isDelegate" = 1',

	restoreVotesSnapshot: 'UPDATE mem_accounts m SET vote = b.vote FROM mem_votes_snapshot b WHERE m.address = b.address'
};

module.exports = RoundsSql;
