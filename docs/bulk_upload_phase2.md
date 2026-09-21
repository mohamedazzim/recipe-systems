# Phase 2 — Bulk Recipe Document Ingestion (decision trace + handoff)

Status: **complete** · Last updated: 2026-09-21

This record captures the decision trace for Phase 2 and the exact resume point
for Phase 3. It is the canonical reference for reviewers and the next agent.

## Inspected

- Phase 1 Bulk Upload UI (`apps/web/components/app/CreateView.tsx` Upload tab,
  `LibraryView` entry point, `page.tsx` `?mode=upload` deep link).
- Existing intake APIs (`apps/api/src/modules/intake/*` — `POST /recipes/upload`
  photo→OCR flow, `parse-text`, `form`).
- Existing object storage (`StorageService`, `@aws-sdk/client-s3`, MinIO/S3).
- Existing DB conventions (`packages/database/prisma/schema.prisma`, migration
  002's raw-SQL CHECK/FK/index patterns).
- Existing worker/queue infra (`pg-boss`, `apps/analysis-worker`, the analysis
  + `view9-recompute` queues).
- Existing auth (`GuestOrJwtGuard`, `CsrfGuard`, `Actor`).
- Existing extraction libraries: **none present** (no pdf/docx/txt extractor
  was already installed).

## Already implemented (before Phase 2)

- Phase 1 Upload UI: multi-file selection, list, remove; `mode=upload` entry;
  document-format `accept` (`.pdf,.docx,.txt`) and client-side validation.

## Missing (added in Phase 2)

- Backend document-ingestion endpoint + record + storage + extraction.

## Decision + rationale

- **Storage**: reuse the existing `StorageService` (same S3/MinIO system, same
  `@aws-sdk/client-s3`). Added `uploadDocument` — server-generated key
  `documents/<uuid>.<ext>` (never the raw filename → path-traversal safe),
  original filename kept as S3 `Metadata.original-filename` and in the DB.
- **Persistence**: one `document_ingestion` row per uploaded document. A
  document is NOT a recipe — no recipe/line/method/analysis rows are created.
  Owner follows the existing `account_id` XOR `guest_session_id` pattern.
- **Extraction location**: the **analysis worker** (existing pg-boss mechanism,
  a NEW `document-ingestion` queue), kept logically separate from recipe
  analysis. The API stores + creates the `queued` record + enqueues; the worker
  transitions `queued → extracting → ready/failed`.
- **Extraction libraries**: `mammoth` (DOCX) and `pdf-parse` (PDF) were added —
  both pure-JS, no native deps, no LLM. TXT is decoded directly (UTF-8 + BOM
  strip). No new storage abstraction or worker mechanism was introduced.
- **Source-faithful rule**: extraction returns the library's text verbatim; the
  only post-processing is a trimmed-empty check → `NO_TEXT_EXTRACTED` failure.
  No inference, no summarization, no LLM/DeepSeek, no correction.
- **Route**: `POST /recipes/import/documents` + `GET /recipes/import/documents/:id`
  under `@Controller('recipes/import')` (the spec's suggested path; fits the
  existing `recipes/*` intake namespace).

## Changed

### DB
- `packages/database/prisma/schema.prisma` — new `DocumentIngestion` model
  (`document_ingestion`), back-relations on `Account`/`GuestSession`.
- `packages/database/prisma/migrations/007_document_ingestion/migration.sql` —
  table + indexes + FKs + `chk_document_ingestion_owner_xor` /
  `chk_document_ingestion_file_type` / `chk_document_ingestion_status`.

### API
- `apps/api/src/modules/ingestion/ingestion.module.ts` (new)
- `apps/api/src/modules/ingestion/ingestion.controller.ts` (new)
- `apps/api/src/modules/ingestion/ingestion.service.ts` (new)
- `apps/api/src/modules/ingestion/ingestion.queue.service.ts` (new)
- `apps/api/src/modules/intake/storage.service.ts` — `uploadDocument` +
  document file-type constants + `documentFileTypeOf`.
- `apps/api/src/app.module.ts` — register `IngestionModule`.

### Worker
- `apps/analysis-worker/src/ingestion/extract.ts` (new) — TXT/DOCX/PDF
  extraction dispatcher + `DocumentExtractionError`.
- `apps/analysis-worker/src/ingestion/s3.ts` (new) — S3 `GetObject` read.
- `apps/analysis-worker/src/ingestion/ingestion-job.handler.ts` (new) — the
  `document-ingestion` handler (sole writer of lifecycle transitions).
- `apps/analysis-worker/src/extraction.d.ts` (new) — ambient types for
  `mammoth`/`pdf-parse`.
- `apps/analysis-worker/src/main.ts` — register the `document-ingestion` queue.
- `apps/analysis-worker/package.json` — deps: `mammoth`, `pdf-parse`,
  `@aws-sdk/client-s3`.

### Web
- `apps/web/lib/types.ts` — `DocumentIngestionResponse`.
- `apps/web/components/app/CreateView.tsx` — per-file lifecycle
  (pending/uploading/extracting/ready/failed), upload + poll + retry, footer
  action "Upload documents".

## Intentionally NOT changed (Phase 2 boundary)

- Recipe creation — no `recipe` row is created from a document.
- Ingredient extraction/classification, method extraction/classification.
- LLM / DeepSeek calls (none added; none made).
- OCR (the Photo flow is untouched).
- Recipe analysis, ingredient review, method review, shopping generation.
- The existing Photo/Paste/Structured intake flows.

## Tests / gates (all green)

- Worker focused: extract + ingestion handler + s3 — 13 tests pass.
- Worker full (coverage): **8 suites / 79 tests**, statements **94.26%** (floor 80%).
- API focused: ingestion service + storage — 25 tests pass.
- API full: **30 suites / 375 tests** pass (incl. `app.module.test.ts` bootstrap).
- Web focused: CreateView — 16 tests pass.
- Web full (coverage): **23 suites / 210 tests** pass.
- `typecheck`: database, api, worker, web — clean.
- `lint`: database, api, worker, web — clean.
- `build`: database, worker (`dist`), api (`dist`), web (Next production) — clean.
- Integration tests: **26 suites / 162 tests pass** against the live dev Postgres
  (migration 007 applied). Note: on this Windows machine the gate suite requires
  Git Bash on PATH (`bash` resolves to a broken WSL shim otherwise — see repo
  memory), which is an environment gotcha, not a code failure.

## Known limitations

- DOCX/PDF extraction correctness is delegated to `mammoth` / `pdf-parse`
  (upstream). Our unit tests verify the dispatcher + empty/failure handling and
  real DOCX/TXT extraction; a real parseable PDF fixture is not checked in (the
  hand-crafted PDF in `__fixtures__/minimal.pdf` is intentionally malformed and
  is used to exercise the `EXTRACTION_FAILED` path).
- A scanned/image-only PDF yields `NO_TEXT_EXTRACTED` (failed) — no OCR is
  performed in Phase 2, by design.
- There is no listing endpoint for a user's ingestions yet (not required by
  Phase 2; the GET is per-id status polling).
- `npm audit` reports pre-existing high/critical advisories in build tooling
  (`@nestjs/cli`, `next`, `multer`, `sharp`, etc.); the newly added
  `mammoth`/`pdf-parse`/`jszip` are not flagged.

## Exact resume point

Phase 2 complete.
**Next phase: source-faithful structured recipe extraction** — parse the stored
`document_ingestion.raw_text` into recipe structure (ingredients/method), still
without LLM inference, then create recipe records + route to the existing
Ingredient/Method review flows.
