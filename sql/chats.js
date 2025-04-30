'use strict';

var ChatsSql = {
  sortFields: ['type', 'timestamp'],
  chatroomsSortDefaults: {
    sortField: 'timestamp',
    sortMethod: 'desc'
  },
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
      'SELECT COUNT(1)::INT FROM full_trs_list',
      (params.where.length ? 'WHERE ' + params.where.join(' AND ') : ''),
      ((params.whereOr && params.whereOr.length) ? 'AND (' + params.whereOr.join(' OR ') + ')' : ''),
      (params.sortField ? 'ORDER BY ' + [params.sortField, params.sortMethod].join(' ') : '')
    ].filter(Boolean).join(' ');
  },

  countChats: function (params) {
    let y = [
      'WITH filtered AS (',
      '  SELECT',
      '    CONCAT(LEAST("t_senderId", "t_recipientId"),',
      '           GREATEST("t_senderId", "t_recipientId")) AS srt',
      '  FROM full_trs_list',
      '  LEFT OUTER JOIN mem_accounts ON address = "t_recipientId"',
           (params.where.length   ? 'WHERE ' + params.where.join(' AND ') : ''),
           (params.whereOr.length ? 'AND (' + params.whereOr.join(' OR ') + ')' : ''),
      ')',
      'SELECT COUNT(DISTINCT srt)::INT FROM filtered'
    ].filter(Boolean).join(' ');
    return y;
  },
  list: function (params) {
    return [
      'SELECT COUNT(1) FROM full_trs_list',
          (params.where.length ? 'WHERE ' + params.where.join(' AND ') : '')
    ].filter(Boolean).join(' ');
  },
  listMessages: function (params) {
    let x = [
      'WITH filtered AS (',
      '  SELECT *, "t_timestamp" AS timestamp',
           (params.where.length   ? '  FROM full_trs_list WHERE ' + params.where.join(' AND ') : '  FROM full_trs_list'),
           (params.whereOr.length ? '  AND (' + params.whereOr.join(' OR ') + ')' : ''),
      ')',
      'SELECT filtered.*, ENCODE("publicKey", \'hex\') AS "m_recipientPublicKey"',
      'FROM filtered',
      'LEFT OUTER JOIN mem_accounts ON address = filtered."t_recipientId"',

      (params.sortField ? 'ORDER BY ' + [params.sortField, params.sortMethod].join(' ') : ''),
      'LIMIT ${limit} OFFSET ${offset}'
    ].filter(Boolean).join(' ');
    return x;
  },
  listChats: function (params) {
    let y = [
      'WITH filtered AS (',
      '  SELECT *, ENCODE("publicKey", \'hex\') AS "m_recipientPublicKey"',
      '  FROM full_trs_list',
      '  LEFT OUTER JOIN mem_accounts ON address = "t_recipientId"',
          (params.where.length   ? 'WHERE ' + params.where.join(' AND ') : ''),
          (params.whereOr.length ? 'AND (' + params.whereOr.join(' OR ') + ')' : ''),
      '),',

      'ranked AS (',
      '  SELECT',
      '    CONCAT(LEAST("t_senderId", "t_recipientId"),',
      '           GREATEST("t_senderId", "t_recipientId"))           AS "srt",',
      '    "t_id",',
      '    "t_senderPublicKey",',
      '    "m_recipientPublicKey",',
      '    "t_senderId",',
      '    "t_recipientId",',
      '    "t_timestamp",',
      '    "t_timestamp"                                            AS "timestamp",',
      '    "b_timestamp"                                            AS "block_timestamp",',
      '    "t_amount",',
      '    "t_fee",',
      '    "c_message",',
      '    "c_own_message",',
      '    "c_type",',
      '    "t_type",',
      '    "b_height",',
      '    "confirmations",',
      '    "b_id",',
      '    ROW_NUMBER() OVER (',
      '      PARTITION BY CONCAT(LEAST("t_senderId","t_recipientId"),',
      '                          GREATEST("t_senderId","t_recipientId"))',
      '      ORDER BY "b_height" DESC, "t_timestamp" DESC',
      '    ) AS rn',
      '  FROM filtered',
      ')',

      'SELECT',
      '  "srt",',
      '  "t_id",',
      '  "t_senderPublicKey",',
      '  "m_recipientPublicKey",',
      '  "t_senderId",',
      '  "t_recipientId",',
      '  "t_timestamp",',
      '  "timestamp",',
      '  "block_timestamp",',
      '  "t_amount",',
      '  "t_fee",',
      '  "c_message",',
      '  "c_own_message",',
      '  "c_type",',
      '  "t_type",',
      '  "b_height",',
      '  "confirmations",',
      '  "b_id"',
      'FROM ranked',
      'WHERE rn = 1',
          (params.sortField ? 'ORDER BY ' + [params.sortField, params.sortMethod].join(' ') : ''),
      'LIMIT ${limit} OFFSET ${offset}'
    ].filter(Boolean).join(' ');
    return y;
  },

  getGenesis: 'SELECT b."height" AS "height", b."id" AS "id", t."senderId" AS "authorId" FROM trs t INNER JOIN blocks b ON t."blockId" = b."id" WHERE t."id" = ${id}'

};

module.exports = ChatsSql;
