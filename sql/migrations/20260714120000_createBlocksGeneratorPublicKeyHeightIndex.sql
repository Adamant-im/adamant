/*
 * Support generatorPublicKey filtering together with the default height order.
 */

BEGIN;

CREATE INDEX IF NOT EXISTS "blocks_generator_public_key_height"
ON "blocks" ("text_generatorPublicKey", "height" DESC);

DROP INDEX IF EXISTS "blocks_b_generator_public_key";

COMMIT;
