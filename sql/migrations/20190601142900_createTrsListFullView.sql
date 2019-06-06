/*
 * create 'trs_list_full' view, normalize addresses, add indexes
 */

BEGIN;

DROP VIEW IF EXISTS trs_list_full;

CREATE VIEW trs_list_full AS

SELECT t."id" AS "t_id",
       b."height" AS "b_height",
       t."blockId" AS "t_blockId",
       t."type" AS "t_type",
       t."timestamp" AS "t_timestamp",
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
