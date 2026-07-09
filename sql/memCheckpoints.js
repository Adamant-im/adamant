'use strict';

/**
 * SQL helpers for persisted mem-table checkpoint storage and recovery.
 * @module sql/memCheckpoints
 */

var MemCheckpointsSql = {
  getLatestComplete: 'SELECT * FROM mem_state_checkpoint_meta WHERE "status" = \'complete\' ORDER BY "height" DESC LIMIT 1',

  getMetaBySlot: 'SELECT * FROM mem_state_checkpoint_meta WHERE "slot" = (${slot})::int',

  upsertMetaWriting: 'INSERT INTO mem_state_checkpoint_meta ("slot", "schemaVersion", "height", "blockId", "round", "nethash", "createdAt", "status", "digest") VALUES (${slot}, ${schemaVersion}, ${height}, ${blockId}, ${round}, ${nethash}, ${createdAt}, \'writing\', NULL) ON CONFLICT ("slot") DO UPDATE SET "schemaVersion" = EXCLUDED."schemaVersion", "height" = EXCLUDED."height", "blockId" = EXCLUDED."blockId", "round" = EXCLUDED."round", "nethash" = EXCLUDED."nethash", "createdAt" = EXCLUDED."createdAt", "status" = \'writing\', "digest" = NULL',

  markMetaComplete: 'UPDATE mem_state_checkpoint_meta SET "status" = \'complete\', "digest" = ${digest} WHERE "slot" = (${slot})::int AND "status" = \'writing\'',

  blockExists: 'SELECT "id", "height" FROM blocks WHERE "id" = ${blockId} AND "height" = (${height})::bigint LIMIT 1',

  countMemAccountsAtBlock: 'SELECT COUNT(*)::int AS count FROM mem_accounts WHERE "blockId" = ${blockId}',

  getMemRounds: 'SELECT "round" FROM mem_round GROUP BY "round"',

  getOrphanedMemAccounts: 'SELECT a."blockId", b."id" FROM mem_accounts a LEFT OUTER JOIN blocks b ON b."id" = a."blockId" WHERE a."blockId" IS NOT NULL AND a."blockId" != \'0\' AND b."id" IS NULL LIMIT 1',

  getDelegates: 'SELECT ENCODE("publicKey", \'hex\') FROM mem_accounts WHERE "isDelegate" = 1 LIMIT 1',

  canonicalAccounts: 'SELECT "address" AS sort_key, "address" || E\'\\x1f\' || COALESCE("username", \'\') || E\'\\x1f\' || COALESCE("isDelegate"::text, \'0\') || E\'\\x1f\' || COALESCE("u_isDelegate"::text, \'0\') || E\'\\x1f\' || COALESCE("secondSignature"::text, \'0\') || E\'\\x1f\' || COALESCE("u_secondSignature"::text, \'0\') || E\'\\x1f\' || COALESCE("u_username", \'\') || E\'\\x1f\' || COALESCE(ENCODE("publicKey", \'hex\'), \'\') || E\'\\x1f\' || COALESCE(ENCODE("secondPublicKey", \'hex\'), \'\') || E\'\\x1f\' || COALESCE("balance"::text, \'0\') || E\'\\x1f\' || COALESCE("u_balance"::text, \'0\') || E\'\\x1f\' || COALESCE("vote"::text, \'0\') || E\'\\x1f\' || COALESCE("rate"::text, \'0\') || E\'\\x1f\' || COALESCE("delegates", \'\') || E\'\\x1f\' || COALESCE("u_delegates", \'\') || E\'\\x1f\' || COALESCE("multisignatures", \'\') || E\'\\x1f\' || COALESCE("u_multisignatures", \'\') || E\'\\x1f\' || COALESCE("multimin"::text, \'0\') || E\'\\x1f\' || COALESCE("u_multimin"::text, \'0\') || E\'\\x1f\' || COALESCE("multilifetime"::text, \'0\') || E\'\\x1f\' || COALESCE("u_multilifetime"::text, \'0\') || E\'\\x1f\' || COALESCE("blockId", \'\') || E\'\\x1f\' || COALESCE("nameexist"::text, \'0\') || E\'\\x1f\' || COALESCE("u_nameexist"::text, \'0\') || E\'\\x1f\' || COALESCE("producedblocks"::text, \'0\') || E\'\\x1f\' || COALESCE("missedblocks"::text, \'0\') || E\'\\x1f\' || COALESCE("fees"::text, \'0\') || E\'\\x1f\' || COALESCE("rewards"::text, \'0\') || E\'\\x1f\' || COALESCE("virgin"::text, \'0\') || E\'\\x1f\' || COALESCE("votesWeight"::text, \'0\') AS line FROM ${tableName~} ORDER BY "address"',

  canonicalRound: 'SELECT COALESCE("address", \'\') || E\'\\x1f\' || COALESCE("round"::text, \'\') || E\'\\x1f\' || COALESCE("delegate", \'\') AS sort_key, COALESCE("address", \'\') || E\'\\x1f\' || COALESCE("amount"::text, \'0\') || E\'\\x1f\' || COALESCE("delegate", \'\') || E\'\\x1f\' || COALESCE("blockId", \'\') || E\'\\x1f\' || COALESCE("round"::text, \'\') AS line FROM ${tableName~} ORDER BY "address", "delegate", "round"',

  canonicalAccountDelegates: 'SELECT "accountId" || E\'\\x1f\' || "dependentId" AS sort_key, "accountId" || E\'\\x1f\' || "dependentId" AS line FROM ${tableName~} ORDER BY "accountId", "dependentId"',

  compareTableSchemas: 'SELECT l."column_name" AS live_column, c."column_name" AS ckpt_column, l."data_type" AS live_type, c."data_type" AS ckpt_type FROM (SELECT "ordinal_position", "column_name", "data_type" FROM information_schema.columns WHERE "table_schema" = current_schema() AND "table_name" = ${liveTable}) l FULL OUTER JOIN (SELECT "ordinal_position", "column_name", "data_type" FROM information_schema.columns WHERE "table_schema" = current_schema() AND "table_name" = ${slotTable}) c USING ("ordinal_position") WHERE l."column_name" IS DISTINCT FROM c."column_name" OR l."data_type" IS DISTINCT FROM c."data_type" LIMIT 1',

  resetUnconfirmedState: [
    'UPDATE mem_accounts SET "u_isDelegate" = "isDelegate", "u_secondSignature" = "secondSignature", "u_username" = "username", "u_balance" = "balance", "u_delegates" = "delegates", "u_multisignatures" = "multisignatures", "u_multimin" = "multimin", "u_multilifetime" = "multilifetime", "u_nameexist" = "nameexist" WHERE "u_isDelegate" <> "isDelegate" OR "u_secondSignature" <> "secondSignature" OR "u_username" IS DISTINCT FROM "username" OR "u_balance" <> "balance" OR "u_delegates" IS DISTINCT FROM "delegates" OR "u_multisignatures" IS DISTINCT FROM "multisignatures" OR "u_multimin" <> "multimin" OR "u_multilifetime" <> "multilifetime" OR "u_nameexist" <> "nameexist";',
    'DELETE FROM "mem_accounts2u_delegates";',
    'INSERT INTO "mem_accounts2u_delegates" ("accountId", "dependentId") SELECT "accountId", "dependentId" FROM "mem_accounts2delegates";',
    'DELETE FROM "mem_accounts2u_multisignatures";',
    'INSERT INTO "mem_accounts2u_multisignatures" ("accountId", "dependentId") SELECT "accountId", "dependentId" FROM "mem_accounts2multisignatures";'
  ].join('')
};

/** @type {number} Rotating checkpoint slot count; keep in sync with migration and {@link logic/memCheckpoint}. */
var CHECKPOINT_SLOT_COUNT = 3;

/**
 * Live mem_* table names keyed by the same logical keys as {@link slotTableNames}.
 * @type {object}
 */
MemCheckpointsSql.liveTableNames = {
  accounts: 'mem_accounts',
  round: 'mem_round',
  accounts2delegates: 'mem_accounts2delegates',
  accounts2u_delegates: 'mem_accounts2u_delegates',
  accounts2multisignatures: 'mem_accounts2multisignatures',
  accounts2u_multisignatures: 'mem_accounts2u_multisignatures'
};

MemCheckpointsSql.clearLiveTables = [
  'DELETE FROM "mem_accounts2u_delegates";',
  'DELETE FROM "mem_accounts2u_multisignatures";',
  'DELETE FROM "mem_accounts2delegates";',
  'DELETE FROM "mem_accounts2multisignatures";',
  'DELETE FROM "mem_round";',
  'DELETE FROM "mem_accounts";'
].join('');

/**
 * Physical checkpoint table names for a rotating slot index.
 * @param {number} slot Slot index from 0 to 2 (three rotating slots).
 * @return {object} Map of logical table keys to checkpoint table names.
 */
MemCheckpointsSql.slotTableNames = function (slot) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= CHECKPOINT_SLOT_COUNT) {
    throw new Error('Invalid checkpoint slot: ' + slot);
  }

  var prefix = 'mem_ckpt_' + slot + '_';
  return {
    accounts: prefix + 'accounts',
    round: prefix + 'round',
    accounts2delegates: prefix + 'accounts2delegates',
    accounts2u_delegates: prefix + 'accounts2u_delegates',
    accounts2multisignatures: prefix + 'accounts2multisignatures',
    accounts2u_multisignatures: prefix + 'accounts2u_multisignatures'
  };
};

/**
 * Delete all rows from one checkpoint slot, respecting FK-dependent table order.
 * @param {number} slot Slot index.
 * @return {string}
 */
MemCheckpointsSql.clearSlotTables = function (slot) {
  var tables = MemCheckpointsSql.slotTableNames(slot);
  return [
    'DELETE FROM "' + tables.accounts2u_delegates + '";',
    'DELETE FROM "' + tables.accounts2u_multisignatures + '";',
    'DELETE FROM "' + tables.accounts2delegates + '";',
    'DELETE FROM "' + tables.accounts2multisignatures + '";',
    'DELETE FROM "' + tables.round + '";',
    'DELETE FROM "' + tables.accounts + '";'
  ].join('');
};

/**
 * Copy live mem_* tables into one checkpoint slot.
 * @param {number} slot Slot index.
 * @return {string}
 */
MemCheckpointsSql.copyLiveToSlot = function (slot) {
  var tables = MemCheckpointsSql.slotTableNames(slot);
  return [
    'INSERT INTO "' + tables.accounts + '" SELECT * FROM "mem_accounts";',
    'INSERT INTO "' + tables.accounts2delegates + '" SELECT * FROM "mem_accounts2delegates";',
    'INSERT INTO "' + tables.accounts2u_delegates + '" SELECT * FROM "mem_accounts2u_delegates";',
    'INSERT INTO "' + tables.accounts2multisignatures + '" SELECT * FROM "mem_accounts2multisignatures";',
    'INSERT INTO "' + tables.accounts2u_multisignatures + '" SELECT * FROM "mem_accounts2u_multisignatures";',
    'INSERT INTO "' + tables.round + '" SELECT * FROM "mem_round";'
  ].join('');
};

/**
 * Highest block height referenced by accounts copied into one checkpoint slot.
 * Used to detect a copy that captured state ahead of the checkpoint block.
 * @param {number} slot Slot index.
 * @return {string}
 */
MemCheckpointsSql.getSlotAccountsMaxBlockHeight = function (slot) {
  var tables = MemCheckpointsSql.slotTableNames(slot);
  return 'SELECT MAX(b."height")::bigint AS height FROM "' + tables.accounts + '" a JOIN blocks b ON b."id" = a."blockId"';
};

/**
 * Restore live mem_* tables from one checkpoint slot.
 * @param {number} slot Slot index.
 * @return {string}
 */
MemCheckpointsSql.copySlotToLive = function (slot) {
  var tables = MemCheckpointsSql.slotTableNames(slot);
  return [
    'INSERT INTO "mem_accounts" SELECT * FROM "' + tables.accounts + '";',
    'INSERT INTO "mem_accounts2delegates" SELECT * FROM "' + tables.accounts2delegates + '";',
    'INSERT INTO "mem_accounts2u_delegates" SELECT * FROM "' + tables.accounts2u_delegates + '";',
    'INSERT INTO "mem_accounts2multisignatures" SELECT * FROM "' + tables.accounts2multisignatures + '";',
    'INSERT INTO "mem_accounts2u_multisignatures" SELECT * FROM "' + tables.accounts2u_multisignatures + '";',
    'INSERT INTO "mem_round" SELECT * FROM "' + tables.round + '";'
  ].join('');
};

module.exports = MemCheckpointsSql;
