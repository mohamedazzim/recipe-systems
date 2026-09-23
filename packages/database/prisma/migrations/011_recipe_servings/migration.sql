-- Migration 011 — RS-US servings: persist the resolved serving/yield count on
-- the recipe row. Two columns:
--   servings           INTEGER NULL      the count (stated by the source OR LLM-estimated)
--   servings_estimated BOOLEAN NOT NULL  true when the count is an LLM estimate (never
--                                        presented as a stated fact); defaults false so
--                                        pre-existing rows read as "not an estimate".
ALTER TABLE "recipe" ADD COLUMN "servings" INTEGER;
ALTER TABLE "recipe" ADD COLUMN "servings_estimated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "recipe" ADD CONSTRAINT "chk_recipe_servings_range"
    CHECK ("servings" IS NULL OR ("servings" >= 1 AND "servings" <= 99));
