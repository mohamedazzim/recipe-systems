-- Migration 014 — restore 'failed' to the document_ingestion status CHECK.
--
-- Migration 008 re-added the constraint WITHOUT 'failed' (it added
-- 'extracting_structure' and 'extraction_failed' instead), but the extraction
-- worker still writes status = 'failed' from markFailed(). On a real database that
-- UPDATE violates the constraint: the row stays stuck at 'extracting',
-- error_code/error_message are never recorded, and pg-boss burns every retry
-- (the document becomes unrecoverable). The worker's unit test mocks Prisma, so
-- only a real CHECK could catch it — and no integration test writes this path.
--
-- Widening only: every existing row already satisfies the new set.
ALTER TABLE document_ingestion DROP CONSTRAINT chk_document_ingestion_status;

ALTER TABLE document_ingestion
    ADD CONSTRAINT chk_document_ingestion_status
    CHECK (
        status IN (
            'queued',
            'extracting',
            'ready',
            'extracting_structure',
            'draft_ready',
            'extraction_failed',
            'failed'
        )
    );
