'use strict';

var ChatsSql = {
	sortFields: ['type'],

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

  // Need to fix "or" or "and" in query
	list: function (params) {
		return [

			'SELECT "t_id", "b_height", "b_id", "t_type", "t_timestamp", "t_senderId", "t_recipientId", "t_amount", "t_fee", "t_signature", "t_signSignature", "t_signatures", "c_message", "c_own_message", "c_type", "t_senderId" as "senderId", "t_recipientId" as "recipientId", "t_id" as "transactionId" FROM full_blocks_list',
      (params.where.length ? 'WHERE ' + params.where.join(' OR ') : ''),
      (params.sortField ? 'ORDER BY ' + [params.sortField, params.sortMethod].join(' ') : ''),
			'LIMIT ${limit} OFFSET ${offset}'
		].filter(Boolean).join(' ');
	},

	getGenesis: 'SELECT b."height" AS "height", b."id" AS "id", t."senderId" AS "authorId" FROM trs t INNER JOIN blocks b ON t."blockId" = b."id" WHERE t."id" = ${id}'

};

module.exports = ChatsSql;
