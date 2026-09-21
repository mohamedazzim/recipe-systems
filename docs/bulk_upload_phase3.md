# Phase 3 — Source-Faithful Structured Recipe Extraction (decision trace + handoff)

Status: **complete** · Last updated: 2026-09-21

This record captures the decision trace for Phase 3 and the exact resume point
for the next phase. Phase 3 establishes the contract between an uploaded
document and the recipe-review flow: the worker turns a document's stored
`raw_text` into **drafts** (title, ingredients, method steps) that a user can
inspect before anything becomes a real recipe.

## Inspected

- Phase 2 ingestion pipeline (`apps/api/src/modules/ingestion/*`,
  `apps/analysis-worker/src/ingestion/{extract,s3,ingestion-job.handler}.ts`,
  migration 007) — the document already lands as `document_ingestion.raw_text`.
- Existing LLM seam (`packages/llm-adapter/src/index.ts`, `deepseek-adapter.ts`,
  `gemini-adapter.ts`, `StubAdapter`/`PendingAdapter` in
  `apps/analysis-worker/src/adapter.ts`) and its JSON-extraction helpers.
- Existing zod contract style (`packages/schemas/src/*`, e.g. the analysis
  request/response schemas) and the analysis prompt/version conventions
  (`packages/llm-adapter/src/prompts/*`).
- Existing review flows (Ingredient/Method review, `ReviewService`) — reviewed
  in order to decide what Phase 3 must NOT touch.
- Existing worker/queue mechanics (pg-boss `analysis`, `view9-recompute`,
  `document-ingestion`) and API enqueue pattern.
- DB conventions: raw-SQL CHECK constraints in migrations, `DocumentIngestion`
  owner (`account_id` XOR `guest_session_id`), `loadOwned` guard.

## Already implemented (before Phase 3)

- Phase 1 Upload UI (multi-file, `.pdf/.docx/.txt` only).
- Phase 2 document ingestion: `POST /recipes/import/documents`,
  `GET /recipes/import/documents/:id`, storage + `document_ingestion` row,
  `document-ingestion` queue, source-faithful raw-text extraction (no LLM).

## Missing (added in Phase 3)

- A structured-extraction contract (LLM prompt + JSON schema).
- A `document-extraction` queue + handler that converts raw text → drafts.
- Draft persistence (`document_recipe_draft`) with provenance.
- API endpoints to trigger extraction and to read drafts for review.
- A frontend review surface for the drafts.

## Decision + rationale

- **One-shot "source text → extraction only" rule**: the LLM receives *only*
  the document's raw text and must return extracted structure, never inference
  beyond what is written. This is the strongest protection in the pipeline and
  is enforced in the system prompt (verbatim quantities, no invented
  ingredients, no normalization of unit spellings, no method synthesis).
- **Drafts, not recipes**: extraction writes `document_recipe_draft` rows with
  `title`/`title_needs_review`/`ingredients`/`method_steps`/`needs_review`/
  `notes`. No `recipe`/`ingredient`/`method`/`analysis` rows are created.
  Confirming drafts into recipes is explicitly the next phase.
- **Schema first** (`packages/schemas/src/extraction.ts`): zod `.strict()`
  contracts — `ExtractedIngredientSchema`, `ExtractedMethodStepSchema`,
  `RecipeExtractionSchema`, `DocumentExtractionSchema` (`{ recipes: [min 1] }`).
  The LLM JSON is validated against this contract before persistence.
- **Prompt versioning** (`packages/llm-adapter/src/prompts/extraction.ts`):
  `EXTRACTION_PROMPT_VERSION = 'v1'` mirrors the analysis prompt convention so
  prompt changes are traceable.
- **Adapter method** (`extractRecipeText(RecipeExtractionRequest)`): added to
  `LlmAdapter` and implemented by DeepSeek/Gemini via their existing private
  chat helpers + `extractJson`. `parseDocumentExtraction()` validates/normalizes
  the raw JSON. `PendingAdapter.extractRecipeText` throws
  `ProviderPendingError`; `StubAdapter.extractRecipeText` throws (no LLM in
  stub mode).
- **Failure taxonomy**: `NO_RAW_TEXT` (no source text), `INVALID_EXTRACTION`
  (LLM JSON failed schema validation), `EXTRACTION_FAILED` (provider/transport
  error). The handler never rethrows — it transitions to `extraction_failed`.
- **Idempotent handler**: if the record is already `draft_ready`, the job is a
  no-op. The worker is the sole writer of `extracting_structure` /
  `draft_ready` / `extraction_failed`, and it replaces drafts atomically
  (`deleteMany` + `create` in one `$transaction`).
- **Provenance**: every draft line carries a source `source` (the exact raw-text
  line it came from) and `source_index`, so the review UI can render the claim
  next to the text that produced it.
- **Review is read-only** in this phase: `GET /recipes/import/documents/:id/drafts`
  returns drafts; there is no edit/PATCH endpoint (corrections are deferred).

## Changed

### Contracts + prompts
- `packages/schemas/src/extraction.ts` (new) — extraction zod contracts, all
  `.strict()`, exported from `index.ts`.
- `packages/llm-adapter/src/prompts/extraction.ts` (new) —
  `EXTRACTION_PROMPT_VERSION`, `EXTRACTION_SYSTEM_PROMPT`,
  `buildExtractionUserPrompt(sourceText)`.
- `packages/llm-adapter/src/index.ts` — `RecipeExtractionRequest`,
  `ParseDocumentExtractionResult`, `parseDocumentExtraction()`,
  `LlmAdapter.extractRecipeText()`, re-export `EXTRACTION_PROMPT_VERSION`.
- `packages/llm-adapter/src/deepseek-adapter.ts`, `gemini-adapter.ts` —
  `extractRecipeText()` implementations.

### DB
- `packages/database/prisma/schema.prisma` — `DocumentRecipeDraft` model;
  `DocumentIngestion.status` comment extended.
- `packages/database/prisma/migrations/008_document_recipe_draft/migration.sql` —
  drops/re-adds `chk_document_ingestion_status` (adds `extracting_structure`,
  `draft_ready`, `extraction_failed`), creates `document_recipe_draft` + unique
  `(ingestion_id, draft_index)` + FK.

### Worker
- `apps/analysis-worker/src/ingestion/extraction-job.handler.ts` (new) —
  `DOCUMENT_EXTRACTION_QUEUE = 'document-extraction'`,
  `DocumentExtractionJobData = { ingestion_id }`, handler as above.
- `apps/analysis-worker/src/adapter.ts` — `PendingAdapter`/`StubAdapter`
  `extractRecipeText` throw.
- `apps/analysis-worker/src/main.ts` — register `document-extraction` queue.

### API
- `apps/api/src/modules/ingestion/ingestion.service.ts` — status union extended;
  `DocumentDraftWire`; `extractStructure(actor, id)` (ready-only, transition →
  enqueue → revert on queue failure); `getDrafts(actor, id)`; `loadOwned`.
- `apps/api/src/modules/ingestion/ingestion.queue.service.ts` —
  `DOCUMENT_EXTRACTION_QUEUE`, `enqueueExtraction`.
- `apps/api/src/modules/ingestion/ingestion.controller.ts` —
  `POST /recipes/import/documents/:id/extract`,
  `GET /recipes/import/documents/:id/drafts`.

### Web
- `apps/web/lib/types.ts` — `DocumentIngestionResponse.status` extended; new
  `ExtractedIngredientDraft`, `ExtractedMethodStepDraft`, `RecipeDraft`,
  `DocumentDraft`.
- `apps/web/components/app/CreateView.tsx` — `BulkFileItem` statuses +
  `ingestionId?`; `extractOneDocument`; `pollIngestion` target `'ready' |
  'draft_ready'`; per-file Extract recipe / Review / Retry buttons;
  `onOpenDraftReview` prop.
- `apps/web/components/app/DocumentDraftReview.tsx` (new) — read-only review of
  title/ingredients/method with source excerpts + "Needs review" badges.
- `apps/web/components/app/AppShell.tsx` — `AppView` adds `draft-review`.
- `apps/web/app/page.tsx` — render `DocumentDraftReview`, wire
  `onOpenDraftReview`.

## Intentionally NOT changed (Phase 3 boundary)

- **No recipe creation** — drafts are never converted into recipe/ingredient/
  method/analysis rows in this phase.
- No draft edit/PATCH endpoint (corrections deferred to the next phase).
- No OCR — a scanned PDF still fails with `NO_TEXT_EXTRACTED` (Phase 2 rule).
- Ingredient/Method review, shopping, nutrition views, deterministic views —
  untouched.
- Photo/Paste/Structured intake flows — untouched.

## Tests / gates (all green)

- `llm-adapter` full (coverage): **9 suites / 133 tests**, lines **92.77%**
  (floor 75%); `prompts/extraction.ts` at 100%.
- `analysis-worker` full (coverage): **9 suites / 84 tests**; handler covered
  (success, no-op on `draft_ready`, `NO_RAW_TEXT`, `INVALID_EXTRACTION`,
  `EXTRACTION_FAILED`).
- `api` full: **30 suites / 380 tests** pass (incl. `app.module.test.ts`).
- `web` full (coverage): **24 suites / 216 tests** pass (incl.
  `DocumentDraftReview` 4 tests, `CreateView` 18 tests).
- `typecheck` (all workspaces): clean.
- `lint` (all workspaces): clean.
- `build` (all workspaces): clean.
- Integration tests: **26 suites / 162 tests pass** against live Postgres with
  migration 008 applied.
- `scripts/regression-gates.sh`: **PASS** (golden 8/8 invariants, INV-05, DDL,
  provenance, disclaimers, immutability).

## Known limitations

- **Browser verification not performed** (1440/1280/768/390px responsive pass
  deferred) — UI validated via component tests, not a live browser sweep.
- No real LLM key in CI: extraction is exercised via a mocked adapter plus
  prompt/schema contract tests; the DeepSeek/Gemini `extractRecipeText` paths
  are unit-tested with stubbed HTTP.
- Review is read-only inspection; there is no draft-edit endpoint yet.
- Scanned PDFs yield `NO_TEXT_EXTRACTED` (OCR out of scope).
- `__fixtures__/minimal.pdf` is intentionally malformed — it exercises the
  `EXTRACTION_FAILED` path, not a real parseable PDF.

## Exact resume point

Phase 3 complete. Source-faithful structured recipe extraction is implemented:
`document_ingestion.raw_text` → `document-extraction` queue → LLM extraction →
validated `document_recipe_draft` rows → read-only `DocumentDraftReview` UI.

**Next phase: route confirmed drafts through the existing recipe-save flow
after user review** — add the confirm/correct step (accept a draft, apply user
edits, create the `recipe` + `ingredient` + `method` rows) and then hand off to
the existing Ingredient/Method review + analysis pipeline.
