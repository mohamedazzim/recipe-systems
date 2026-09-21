-- Migration 010 — widen document_ingestion.status.
-- Phase 3 (migration 008) added 'extracting_structure' (20 chars) and
-- 'extraction_failed' (17 chars) to the status CHECK, but the column was still
-- the Phase 2 VARCHAR(16) — those writes fail with Postgres P2000
-- "value too long". Widen to VARCHAR(32) to match the extended lifecycle.

ALTER TABLE document_ingestion ALTER COLUMN status TYPE VARCHAR(32);
