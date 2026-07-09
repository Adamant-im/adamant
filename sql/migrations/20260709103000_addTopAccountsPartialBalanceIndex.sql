BEGIN;

CREATE INDEX IF NOT EXISTS "mem_accounts_top_balance"
  ON "mem_accounts" ("balance" DESC, "address")
  WHERE "balance" > 0;

COMMIT;