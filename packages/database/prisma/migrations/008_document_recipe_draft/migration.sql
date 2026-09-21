-- Migration 008 — Phase 3 structured recipe extraction.
-- Extends the ingestion lifecycle with the structured-extraction states and adds
-- the document_recipe_draft table (source-faithful drafts, NOT confirmed recipes).

-- Extend the status lifecycle: ready → extracting_structure → draft_ready, or
-- extracting_structure → extraction_failed.
ALTER TABLE document_ingestion DROP CONSTRAINT chk_document_ingestion_status;
ALTER TABLE document_ingestion
    ADD CONSTRAINT chk_document_ingestion_status
    CHECK (status IN ('queued', 'extracting', 'ready', 'extracting_structure', 'draft_ready', 'extraction_failed'));

-- CreateTable
CREATE TABLE "document_recipe_draft" (
    "id" UUID NOT NULL,
    "ingestion_id" UUID NOT NULL,
    "draft_index" INTEGER NOT NULL,
    "title" VARCHAR(255),
    "title_needs_review" BOOLEAN NOT NULL DEFAULT false,
    "needs_review" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "document_recipe_draft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_document_recipe_draft_ingestion_index" ON "document_recipe_draft"("ingestion_id", "draft_index");

-- AddForeignKey
ALTER TABLE "document_recipe_draft" ADD CONSTRAINT "document_recipe_draft_ingestion_id_fkey" FOREIGN KEY ("ingestion_id") REFERENCES "document_ingestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
