CREATE TABLE IF NOT EXISTS "chats"(
  "message" TEXT,
  "own_message" TEXT,
  "type" INT NOT NULL,
  "transactionId" VARCHAR(20) NOT NULL,
  FOREIGN KEY("transactionId") REFERENCES "trs"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "chats_trs_id" ON "chats"("transactionId");