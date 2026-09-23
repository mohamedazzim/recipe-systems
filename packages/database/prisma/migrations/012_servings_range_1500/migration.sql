-- Migration 012 — widen the RS-US serving-count ceiling from 99 to 1500 so
-- banquet / large-batch recipes can be scaled. The application bounds are
-- SERVINGS_MIN / SERVINGS_MAX in @recipe-systems/schemas; this CHECK mirrors them.
--
-- Widening is backward-compatible: every existing row satisfies the new range.
ALTER TABLE "recipe" DROP CONSTRAINT IF EXISTS "chk_recipe_servings_range";
ALTER TABLE "recipe" ADD CONSTRAINT "chk_recipe_servings_range"
    CHECK ("servings" IS NULL OR ("servings" >= 1 AND "servings" <= 1500));
