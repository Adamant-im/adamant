CREATE TABLE IF NOT EXISTS "states"(
  "stored_value" TEXT,
  "stored_key" VARCHAR(20),
  "type" INT NOT NULL,
  "transactionId" VARCHAR(20) NOT NULL,
  FOREIGN KEY("transactionId") REFERENCES "trs"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "states_trs_id" ON "states"("transactionId");