-- Migration 007 — Phase 2 document ingestion (bulk upload). One row per
-- uploaded recipe DOCUMENT (pdf/docx/txt). A document is NOT a recipe yet:
-- no recipe/line/method/analysis rows are created from it.

-- CreateTable
CREATE TABLE "document_ingestion" (
    "id" UUID NOT NULL,
    "account_id" UUID,
    "guest_session_id" UUID,
    "original_filename" VARCHAR(255) NOT NULL,
    "file_type" VARCHAR(16) NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "storage_key" VARCHAR(512) NOT NULL,
    "storage_uri" VARCHAR(512) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'queued',
    "raw_text" TEXT,
    "error_code" VARCHAR(64),
    "error_message" VARCHAR(512),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "document_ingestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ix_document_ingestion_account_created" ON "document_ingestion"("account_id", "created_at" DESC);
CREATE INDEX "ix_document_ingestion_guest_created" ON "document_ingestion"("guest_session_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "document_ingestion" ADD CONSTRAINT "document_ingestion_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_ingestion" ADD CONSTRAINT "document_ingestion_guest_session_id_fkey" FOREIGN KEY ("guest_session_id") REFERENCES "guest_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Raw-SQL constructs (Prisma cannot express CHECKs — same convention as migration 002).
ALTER TABLE document_ingestion
    ADD CONSTRAINT chk_document_ingestion_owner_xor
    CHECK (
        (account_id IS NOT NULL AND guest_session_id IS NULL)
        OR
        (account_id IS NULL AND guest_session_id IS NOT NULL)
    );

ALTER TABLE document_ingestion
    ADD CONSTRAINT chk_document_ingestion_file_type
    CHECK (file_type IN ('pdf', 'docx', 'txt'));

ALTER TABLE document_ingestion
    ADD CONSTRAINT chk_document_ingestion_status
    CHECK (status IN ('queued', 'extracting', 'ready', 'failed'));
