-- Migration 009 — Phase 4 draft review, user correction & recipe creation.
-- Extends document_recipe_draft with the user-edited authoritative state and the
-- confirmed-recipe linkage. The original `payload` (model extraction) is NEVER
-- overwritten — user edits land in `user_payload`; provenance is preserved.

ALTER TABLE document_recipe_draft
    ADD COLUMN "user_payload" JSONB,
    ADD COLUMN "status" VARCHAR(16) NOT NULL DEFAULT 'draft',
    ADD COLUMN "recipe_id" UUID,
    ADD COLUMN "confirmed_at" TIMESTAMPTZ(6);

-- Lifecycle: draft → confirming (transient, in-flight) → confirmed.
ALTER TABLE document_recipe_draft
    ADD CONSTRAINT chk_document_recipe_draft_status
    CHECK (status IN ('draft', 'confirming', 'confirmed'));

-- The created recipe — nullable, and NULLed (not cascaded) if the recipe is
-- hard-deleted, so the draft evidence survives a recipe delete.
ALTER TABLE document_recipe_draft
    ADD CONSTRAINT fk_document_recipe_draft_recipe
    FOREIGN KEY (recipe_id) REFERENCES recipe(id) ON DELETE SET NULL;

CREATE INDEX ix_document_recipe_draft_recipe
    ON document_recipe_draft (recipe_id);
