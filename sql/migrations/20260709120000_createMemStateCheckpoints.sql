/* Persisted mem-table checkpoint storage for crash recovery (#227)
 *
 */

BEGIN;

CREATE TABLE IF NOT EXISTS "mem_state_checkpoint_meta"(
  "slot" SMALLINT NOT NULL PRIMARY KEY,
  "schemaVersion" INTEGER NOT NULL,
  "height" BIGINT NOT NULL,
  "blockId" VARCHAR(20) NOT NULL,
  "round" BIGINT NOT NULL,
  "nethash" VARCHAR(64) NOT NULL,
  "createdAt" BIGINT NOT NULL,
  "status" VARCHAR(16) NOT NULL,
  "digest" VARCHAR(64)
);

CREATE INDEX IF NOT EXISTS "mem_state_checkpoint_meta_status_height"
  ON "mem_state_checkpoint_meta"("status", "height" DESC);

-- Slot 0
CREATE TABLE IF NOT EXISTS "mem_ckpt_0_accounts" (LIKE "mem_accounts" INCLUDING DEFAULTS EXCLUDING CONSTRAINTS);
CREATE TABLE IF NOT EXISTS "mem_ckpt_0_round" (LIKE "mem_round" INCLUDING DEFAULTS EXCLUDING CONSTRAINTS);
CREATE TABLE IF NOT EXISTS "mem_ckpt_0_accounts2delegates" (LIKE "mem_accounts2delegates" INCLUDING DEFAULTS EXCLUDING CONSTRAINTS);
CREATE TABLE IF NOT EXISTS "mem_ckpt_0_accounts2u_delegates" (LIKE "mem_accounts2u_delegates" INCLUDING DEFAULTS EXCLUDING CONSTRAINTS);
CREATE TABLE IF NOT EXISTS "mem_ckpt_0_accounts2multisignatures" (LIKE "mem_accounts2multisignatures" INCLUDING DEFAULTS EXCLUDING CONSTRAINTS);
CREATE TABLE IF NOT EXISTS "mem_ckpt_0_accounts2u_multisignatures" (LIKE "mem_accounts2u_multisignatures" INCLUDING DEFAULTS EXCLUDING CONSTRAINTS);

-- Slot 1
CREATE TABLE IF NOT EXISTS "mem_ckpt_1_accounts" (LIKE "mem_accounts" INCLUDING DEFAULTS EXCLUDING CONSTRAINTS);
CREATE TABLE IF NOT EXISTS "mem_ckpt_1_round" (LIKE "mem_round" INCLUDING DEFAULTS EXCLUDING CONSTRAINTS);
CREATE TABLE IF NOT EXISTS "mem_ckpt_1_accounts2delegates" (LIKE "mem_accounts2delegates" INCLUDING DEFAULTS EXCLUDING CONSTRAINTS);
CREATE TABLE IF NOT EXISTS "mem_ckpt_1_accounts2u_delegates" (LIKE "mem_accounts2u_delegates" INCLUDING DEFAULTS EXCLUDING CONSTRAINTS);
CREATE TABLE IF NOT EXISTS "mem_ckpt_1_accounts2multisignatures" (LIKE "mem_accounts2multisignatures" INCLUDING DEFAULTS EXCLUDING CONSTRAINTS);
CREATE TABLE IF NOT EXISTS "mem_ckpt_1_accounts2u_multisignatures" (LIKE "mem_accounts2u_multisignatures" INCLUDING DEFAULTS EXCLUDING CONSTRAINTS);

-- Slot 2
CREATE TABLE IF NOT EXISTS "mem_ckpt_2_accounts" (LIKE "mem_accounts" INCLUDING DEFAULTS EXCLUDING CONSTRAINTS);
CREATE TABLE IF NOT EXISTS "mem_ckpt_2_round" (LIKE "mem_round" INCLUDING DEFAULTS EXCLUDING CONSTRAINTS);
CREATE TABLE IF NOT EXISTS "mem_ckpt_2_accounts2delegates" (LIKE "mem_accounts2delegates" INCLUDING DEFAULTS EXCLUDING CONSTRAINTS);
CREATE TABLE IF NOT EXISTS "mem_ckpt_2_accounts2u_delegates" (LIKE "mem_accounts2u_delegates" INCLUDING DEFAULTS EXCLUDING CONSTRAINTS);
CREATE TABLE IF NOT EXISTS "mem_ckpt_2_accounts2multisignatures" (LIKE "mem_accounts2multisignatures" INCLUDING DEFAULTS EXCLUDING CONSTRAINTS);
CREATE TABLE IF NOT EXISTS "mem_ckpt_2_accounts2u_multisignatures" (LIKE "mem_accounts2u_multisignatures" INCLUDING DEFAULTS EXCLUDING CONSTRAINTS);

COMMIT;
