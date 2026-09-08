-- Migration 001 (owned by D-01): btree_gist extension only (ERD §9 — exclusion constraints).
-- The schema DDL starts at migration 002 (owned by D-02, ERD v13).
CREATE EXTENSION IF NOT EXISTS btree_gist;
