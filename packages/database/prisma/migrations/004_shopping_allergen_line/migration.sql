-- D-30 (Track S, shopping data) + Q2 Option A (analysis-time persistence):
-- the shopping-list print snapshot carries the FROZEN View-8 allergen line,
-- persisted at generation from the analysis's own View-8 output. Print/PDF
-- must never re-derive it from the current effective-dated mapping (ADR §7
-- amendment 2026-09-11; SCAFFOLD §7 Q2 RESOLVED).
ALTER TABLE shopping_list_generation ADD COLUMN allergen_line VARCHAR(512);
