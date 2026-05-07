/*
 * Add `timestampMs` to transaction projection views.
 */

BEGIN;

DROP VIEW IF EXISTS full_blocks_list;

CREATE VIEW full_blocks_list AS

  SELECT b."id" AS "b_id",
         b."version" AS "b_version",
         b."timestamp" AS "b_timestamp",
         b."height" AS "b_height",
         b."previousBlock" AS "b_previousBlock",
         b."numberOfTransactions" AS "b_numberOfTransactions",
      (b."totalAmount")::bigint AS "b_totalAmount",
      (b."totalFee")::bigint AS "b_totalFee",
      (b."reward")::bigint AS "b_reward",
         b."payloadLength" AS "b_payloadLength",
         ENCODE(b."payloadHash", 'hex') AS "b_payloadHash",
         b."text_generatorPublicKey" AS "b_generatorPublicKey",
         ENCODE(b."blockSignature", 'hex') AS "b_blockSignature",
         t."id" AS "t_id",
         t."rowId" AS "t_rowId",
         t."type" AS "t_type",
         t."timestamp" AS "t_timestamp",
         t."timestampMs" AS "t_timestampMs",
         ENCODE(t."senderPublicKey", 'hex') AS "t_senderPublicKey",
         t."senderId" AS "t_senderId",
         t."recipientId" AS "t_recipientId",
    (t."amount")::bigint AS "t_amount",
    (t."fee")::bigint AS "t_fee",
         ENCODE(t."signature", 'hex') AS "t_signature",
         ENCODE(t."signSignature", 'hex') AS "t_signSignature",
         ENCODE(s."publicKey", 'hex') AS "s_publicKey",
         d."username" AS "d_username",
         v."votes" AS "v_votes",
         m."min" AS "m_min",
         m."lifetime" AS "m_lifetime",
         m."keysgroup" AS "m_keysgroup",
         dapp."name" AS "dapp_name",
         dapp."description" AS "dapp_description",
         dapp."tags" AS "dapp_tags",
         dapp."type" AS "dapp_type",
         dapp."link" AS "dapp_link",
         dapp."category" AS "dapp_category",
         dapp."icon" AS "dapp_icon",
         it."dappId" AS "in_dappId",
         ot."dappId" AS "ot_dappId",
         ot."outTransactionId" AS "ot_outTransactionId",
         ENCODE(t."requesterPublicKey", 'hex') AS "t_requesterPublicKey",
         t."signatures" AS "t_signatures",
         c."message" AS "c_message",
         c."own_message" AS "c_own_message",
         c."type" AS "c_type",
         st."type" as "st_type",
         st."stored_value" as "st_stored_value",
         st."stored_key" as "st_stored_key",
        (SELECT MAX("height") + 1 FROM blocks) - b."height" AS "confirmations"

  FROM blocks b

    LEFT OUTER JOIN trs AS t ON t."blockId" = b."id"
    LEFT OUTER JOIN delegates AS d ON d."transactionId" = t."id"
    LEFT OUTER JOIN votes AS v ON v."transactionId" = t."id"
    LEFT OUTER JOIN signatures AS s ON s."transactionId" = t."id"
    LEFT OUTER JOIN multisignatures AS m ON m."transactionId" = t."id"
    LEFT OUTER JOIN dapps AS dapp ON dapp."transactionId" = t."id"
    LEFT OUTER JOIN intransfer AS it ON it."transactionId" = t."id"
    LEFT OUTER JOIN outtransfer AS ot ON ot."transactionId" = t."id"
    LEFT OUTER JOIN chats AS c ON c."transactionId" = t."id"
    LEFT OUTER JOIN states AS st ON st."transactionId" = t."id";

DROP VIEW IF EXISTS full_trs_list;

CREATE VIEW full_trs_list AS

  SELECT t."blockId" AS "b_id",
         t."blockTimestamp" AS "b_timestamp",
         t."height" AS "b_height",
         t."id" AS "t_id",
         t."rowId" AS "t_rowId",
         t."type" AS "t_type",
         t."timestamp" AS "t_timestamp",
         t."timestampMs" AS "t_timestampMs",
         ENCODE(t."senderPublicKey", 'hex') AS "t_senderPublicKey",
         t."senderId" AS "t_senderId",
         t."recipientId" AS "t_recipientId",
    (t."amount")::bigint AS "t_amount",
    (t."fee")::bigint AS "t_fee",
         ENCODE(t."signature", 'hex') AS "t_signature",
         ENCODE(t."signSignature", 'hex') AS "t_signSignature",
         ENCODE(s."publicKey", 'hex') AS "s_publicKey",
         d."username" AS "d_username",
         v."votes" AS "v_votes",
         m."min" AS "m_min",
         m."lifetime" AS "m_lifetime",
         m."keysgroup" AS "m_keysgroup",
         dapp."name" AS "dapp_name",
         dapp."description" AS "dapp_description",
         dapp."tags" AS "dapp_tags",
         dapp."type" AS "dapp_type",
         dapp."link" AS "dapp_link",
         dapp."category" AS "dapp_category",
         dapp."icon" AS "dapp_icon",
         it."dappId" AS "in_dappId",
         ot."dappId" AS "ot_dappId",
         ot."outTransactionId" AS "ot_outTransactionId",
         ENCODE(t."requesterPublicKey", 'hex') AS "t_requesterPublicKey",
         t."signatures" AS "t_signatures",
         c."message" AS "c_message",
         c."own_message" AS "c_own_message",
         c."type" AS "c_type",
         st."type" as "st_type",
         st."stored_value" as "st_stored_value",
         st."stored_key" as "st_stored_key",
        (SELECT MAX("height") + 1 FROM blocks) - t."height" AS "confirmations"

  FROM trs t

    LEFT OUTER JOIN delegates AS d ON d."transactionId" = t."id"
    LEFT OUTER JOIN votes AS v ON v."transactionId" = t."id"
    LEFT OUTER JOIN signatures AS s ON s."transactionId" = t."id"
    LEFT OUTER JOIN multisignatures AS m ON m."transactionId" = t."id"
    LEFT OUTER JOIN dapps AS dapp ON dapp."transactionId" = t."id"
    LEFT OUTER JOIN intransfer AS it ON it."transactionId" = t."id"
    LEFT OUTER JOIN outtransfer AS ot ON ot."transactionId" = t."id"
    LEFT OUTER JOIN chats AS c ON c."transactionId" = t."id"
    LEFT OUTER JOIN states AS st ON st."transactionId" = t."id";

DROP VIEW IF EXISTS trs_list_full;

CREATE VIEW trs_list_full AS

SELECT t."id" AS "t_id",
       b."height" AS "b_height",
       t."blockId" AS "t_blockId",
       t."type" AS "t_type",
       t."timestamp" AS "t_timestamp",
       t."timestampMs" AS "t_timestampMs",
       b."timestamp" AS "b_timestamp",
       t."senderPublicKey" AS "t_senderPublicKey",
       m."publicKey" AS "m_recipientPublicKey",
       UPPER(t."senderId") AS "t_senderId",
       UPPER(t."recipientId") AS "t_recipientId",
       t."amount" AS "t_amount",
       t."fee" AS "t_fee",
       ENCODE(t."signature", 'hex') AS "t_signature",
       ENCODE(t."signSignature", 'hex') AS "t_SignSignature",
       t."signatures" AS "t_signatures",
       (SELECT height + 1 FROM blocks ORDER BY height DESC LIMIT 1) - b."height" AS "confirmations",
       d."username" AS "d_username",
       v."votes" AS "v_votes",
       ms."min" AS "m_min",
       ms."lifetime" AS "m_lifetime",
       ms."keysgroup" AS "m_keysgroup",
       c."message" AS "c_message",
       c."own_message" AS "c_own_message",
       c."type" AS "c_type",
       st."type" as "st_type",
       st."stored_value" as "st_stored_value",
       st."stored_key" as "st_stored_key"
FROM trs t

LEFT JOIN blocks b ON t."blockId" = b."id"
LEFT JOIN mem_accounts m ON t."recipientId" = m."address"
LEFT OUTER JOIN delegates AS d ON d."transactionId" = t."id"
LEFT OUTER JOIN votes AS v ON v."transactionId" = t."id"
LEFT OUTER JOIN signatures AS s ON s."transactionId" = t."id"
LEFT OUTER JOIN multisignatures AS ms ON ms."transactionId" = t."id"
LEFT OUTER JOIN chats AS c ON c."transactionId" = t."id"
LEFT OUTER JOIN states AS st ON st."transactionId" = t."id";

COMMIT;
