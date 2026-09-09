-- D-17 (P3-3): declare the analysis_view compound unique for idempotent upserts
-- (INV-11, ADR §14). The constraint already exists in migration 002
-- (uq_analysis_view) — this re-declaration is a no-op on existing databases and
-- keeps fresh deploys consistent when the Prisma schema declares the same
-- constraint. No new column, no behavior change.

CREATE UNIQUE INDEX IF NOT EXISTS uq_analysis_view
    ON analysis_view(analysis_id, view_number);
