'use strict';

var ChatsSql = {
	sortFields: ['type','timestamp'],

	countByTransactionId: 'SELECT COUNT(*)::int AS "count" FROM chats WHERE "transactionId" = ${id}',


	search: function (params) {
		return [
			'SELECT "transactionId", "message", "own_message","senderId","recipientId", "type" ',
			'FROM chats WHERE to_tsvector("message" || \' \' || "own_message" || \' \' ) @@ to_tsquery(${q})',
      '',
			'LIMIT ${limit}'
		].filter(Boolean).join(' ');
	},

	get: 'SELECT "message", "own_message",  "type", "senderId","recipientId", "transactionId" FROM chats WHERE "transactionId" = ${id}',

	getByIds: 'SELECT "message", "own_message",  "type", "senderId","recipientId", "transactionId" FROM chats WHERE "transactionId" IN ($1:csv)',

    countList: function (params) {
        return [
            'SELECT COUNT(1) FROM full_blocks_list',
            (params.where.length ? 'WHERE ' + params.where.join(' AND ') : ''),
            ((params.whereOr && params.whereOr.length) ? 'AND (' + params.whereOr.join(' OR ') + ')': ''),
            (params.sortField ? 'ORDER BY ' + [params.sortField, params.sortMethod].join(' ') : '')
        ].filter(Boolean).join(' ');
    },

    countChats: function (params) {
        let y = [
            'SELECT COUNT(1) FROM',
            '(SELECT',
            'CONCAT(LEAST("t_senderId", "t_recipientId"), GREATEST("t_senderId", "t_recipientId")) as "srt",',
            'first("t_id") as "t_id",',
            'first("t_senderPublicKey") as "t_senderPublicKey",',
            'first("m_recipientPublicKey") as "m_recipientPublicKey",',
            'first("t_senderId") as "t_senderId",',
            'first("t_recipientId") as "t_recipientId",',
            'first("t_timestamp") as "timestamp",',
            'first("t_type") as "t_type"',
            'FROM ( SELECT *, t_timestamp as timestamp, ENCODE("publicKey", \'hex\') as "m_recipientPublicKey"',
            'FROM full_blocks_list',
            'LEFT OUTER JOIN mem_accounts ON address = "t_recipientId"',

            (params.where.length ? 'WHERE ' + params.where.join(' AND ') : ''),
            (params.whereOr.length ? 'AND (' + params.whereOr.join(' OR ') + ')': ''),
            ') as foo GROUP by srt',
            (params.sortField ? 'ORDER BY ' + [params.sortField, params.sortMethod].join(' ') : ''),
            ') as bar'
            //
            //
            // 'WHERE "t_type" = 8',
            // 'AND ("t_senderId" = \'U1283640763437948723\'',
            // 'OR "t_recipientId" = \'U1020291227689695733\')',
            // 'ORDER BY "t_timestamp" DESC) as foo GROUP by srt'
        ].filter(Boolean).join(' ');
        return y;
        // return [
        //     'SELECT COUNT(DISTINCT "t_recipientId") FROM full_blocks_list',
        //     (params.where.length ? 'WHERE ' + params.where.join(' AND ') : ''),
        //     (params.whereOr.length ? 'AND (' + params.whereOr.join(' OR ') + ')': ''),
        //     (params.sortField ? 'ORDER BY ' + [params.sortField, params.sortMethod].join(' ') : '')
        // ].filter(Boolean).join(' ');
    },
    list: function (params) {
        return [

            'SELECT *, t_timestamp as timestamp FROM full_blocks_list',
            (params.where.length ? 'WHERE ' + params.where.join(' AND ') : ''),
            (params.sortField ? 'ORDER BY ' + [params.sortField, params.sortMethod].join(' ') : ''),
            'LIMIT ${limit} OFFSET ${offset}'
        ].filter(Boolean).join(' ');
    },
    listMessages: function (params) {
        let x = [
            'SELECT *, t_timestamp as timestamp, ENCODE("publicKey", \'hex\') as "m_recipientPublicKey" FROM full_blocks_list',
            'LEFT OUTER JOIN mem_accounts ON address = "t_recipientId"',
            (params.where.length ? 'WHERE ' + params.where.join(' AND ') : ''),
            (params.whereOr.length ? 'AND (' + params.whereOr.join(' OR ') + ')': ''),
            (params.sortField ? 'ORDER BY ' + [params.sortField, params.sortMethod].join(' ') : ''),
            'LIMIT ${limit} OFFSET ${offset}'
        ].filter(Boolean).join(' ');
        return x;
    },
    listChats: function (params) {

	    let y = [
            'SELECT',
            'CONCAT(LEAST("t_senderId", "t_recipientId"), GREATEST("t_senderId", "t_recipientId")) as "srt",',
            'first("t_id") as "t_id",',
            'first("t_senderPublicKey") as "t_senderPublicKey",',
            'first("m_recipientPublicKey") as "m_recipientPublicKey",',
            'first("t_senderId") as "t_senderId",',
            'first("t_recipientId") as "t_recipientId",',
            'first("t_timestamp") as "t_timestamp",',
            'first("t_timestamp") as "timestamp",',
            'first("t_amount") as "t_amount",',
            'first("t_fee") as "t_fee",',
            'first("c_message") as "c_message",',
            'first("c_own_message") as "c_own_message",',
            'first("c_type") as "c_type",',
            'first("t_type") as "t_type",',
            'max("b_height") as "b_height",',
            'max("b_id") as "b_id"',
            'FROM ( SELECT *, t_timestamp as timestamp, ENCODE("publicKey", \'hex\') as "m_recipientPublicKey"',
            'FROM full_blocks_list',
            'LEFT OUTER JOIN mem_accounts ON address = "t_recipientId"',

            (params.where.length ? 'WHERE ' + params.where.join(' AND ') : ''),
            (params.whereOr.length ? 'AND (' + params.whereOr.join(' OR ') + ')': ''),
            ') as foo GROUP by srt',
            (params.sortField ? 'ORDER BY ' + [params.sortField, params.sortMethod].join(' ') : ''),
            'LIMIT ${limit} OFFSET ${offset}'
            //
            //
            // 'WHERE "t_type" = 8',
            // 'AND ("t_senderId" = \'U1283640763437948723\'',
            // 'OR "t_recipientId" = \'U1020291227689695733\')',
            // 'ORDER BY "t_timestamp" DESC) as foo GROUP by srt'
        ].filter(Boolean).join(' ');
	    return y;
    },

	getGenesis: 'SELECT b."height" AS "height", b."id" AS "id", t."senderId" AS "authorId" FROM trs t INNER JOIN blocks b ON t."blockId" = b."id" WHERE t."id" = ${id}'

};

module.exports = ChatsSql;
