'use strict';

var RoundsSql = {
	flush: 'DELETE FROM mem_round WHERE "round" = (${round})::bigint;',

	reCalcVotes: 'UPDATE "mem_accounts" AS m SET "votesWeight" = vote_weight FROM ( SELECT ma."address", SUM("total_balance"::bigint) as vote_weight, MAX(ma3."divider"),MAX(ma3."total_balance") FROM mem_accounts ma LEFT JOIN mem_accounts2delegates ma2d on ENCODE(ma."publicKey",\'hex\')=ma2d."dependentId" LEFT JOIN (SELECT (SELECT COUNT("accountId") FROM mem_accounts2delegates ma2d WHERE "accountId"=ma2."address") as divider, floor("balance"::bigint/(SELECT COUNT("accountId") FROM mem_accounts2delegates ma2d WHERE "accountId"=ma2."address")) as total_balance, ma2."address" as address  FROM mem_accounts ma2 WHERE (SELECT COUNT("accountId") FROM mem_accounts2delegates ma2d WHERE "accountId"=ma2."address")>0) ma3 ON ma2d."accountId"=ma3."address" WHERE ma."isDelegate"=1 GROUP BY ma."address") as vv WHERE vv."address"=m."address" AND m."isDelegate"=1;',

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
