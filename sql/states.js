'use strict';

var StatesSql = {
	sortFields: ['type','timestamp'],

	countByTransactionId: 'SELECT COUNT(*)::int AS "count" FROM states WHERE "transactionId" = ${id}',


	search: function (params) {
		return [
			'SELECT "transactionId", "stored_value", "stored_key", "type" ',
			'FROM states WHERE to_tsvector("stored_value" || \' \' || "stored_key" || \' \' ) @@ to_tsquery(${q})',
      '',
			'LIMIT ${limit}'
		].filter(Boolean).join(' ');
	},

	get: 'SELECT "stored_value", "stored_key",  "type", "transactionId" FROM states WHERE "transactionId" = ${id}',

	getByIds: 'SELECT "stored_value", "stored_key",  "type", "transactionId" FROM states WHERE "transactionId" IN ($1:csv)',
    countList: function (params) {
        return [

            'SELECT COUNT(1)  FROM full_blocks_list',
            (params.where.length ? 'WHERE ' + params.where.join(' AND ') : ''),
            (params.sortField ? 'ORDER BY ' + [params.sortField, params.sortMethod].join(' ') : '')
        ].filter(Boolean).join(' ');
    },

  // Need to fix "or" or "and" in query
	list: function (params) {
		return [

			'SELECT *, t_timestamp as timestamp FROM full_blocks_list',
      (params.where.length ? 'WHERE ' + params.where.join(' AND ') : ''),
      (params.sortField ? 'ORDER BY ' + [params.sortField, params.sortMethod].join(' ') : ''),
			'LIMIT ${limit} OFFSET ${offset}'
		].filter(Boolean).join(' ');
	},

	getGenesis: 'SELECT b."height" AS "height", b."id" AS "id", t."senderId" AS "authorId" FROM trs t INNER JOIN blocks b ON t."blockId" = b."id" WHERE t."id" = ${id}'

};

module.exports = StatesSql;
