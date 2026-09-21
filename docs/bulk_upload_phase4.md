# Phase 4 — Draft Review, User Correction & Recipe Creation (decision trace + handoff)

Status: **complete** · Last updated: 2026-09-21

This record captures the decision trace for Phase 4 and the exact resume point.
Phase 4 turns a Phase 3 draft into a user-correctable, explicitly-confirmed,
**normal** Recipe Systems recipe — never a special parallel recipe type.

## Inspected

- Phase 3 `document_recipe_draft` + `DocumentDraftReview` (read-only).
- `RecipeService.createForIntake` / `attachMethod` / `saveRecipe` / `deleteRecipeInternal`
  (the existing recipe-creation path — `apps/api/src/modules/recipes/recipe.service.ts`).
- `IntakeService.recordFormLines` / `createDraftLinesInTx` (the authoritative
  `recipe_input` + `recipe_ingredient_line` writer — `apps/api/src/modules/intake/intake.service.ts`).
- Intake HTTP surface (`parse-text`, `form`, `upload`) for routing + validation style.
- `recipe_ingredient_line.source_tag` six-value CHECK (CARD/METHOD/INFERRED/ABSENT/UNKNOWN/ASSUMED)
  and the `claim_tag` regression gate (provenance vocabulary is frozen).
- Recipe workspace navigation + `GET /recipes/:id/lines` (the confirmed recipe opens
  exactly like a paste/form recipe).
- Phase 2/3 ingestion service + controller + queue service (ownership `loadOwned`, INV-17).

## Already implemented (before Phase 4)

- Phase 1 Bulk Upload UI; Phase 2 document ingestion/raw text; Phase 3 source-faithful
  structured extraction + read-only `DocumentDraftReview`.

## Missing (added in Phase 4)

- Editable draft (title, ingredients, method steps) with per-row provenance.
- Explicit user confirmation that creates the real recipe through the existing path.
- Draft lifecycle (draft → confirming → confirmed) + recipe linkage + idempotency.

## Decision + rationale

- **User is the final authority** — the model output is only a draft; the confirmed
  recipe carries the user's values, never silently the model's.
- **Reuse the existing creation path** — `confirmDraft` calls `RecipeService.createForIntake`
  → `IntakeService.recordFormLines` → `RecipeService.attachMethod` (paste mode) →
  `RecipeService.saveRecipe`. No recipe/line creation logic is duplicated in the
  ingestion module, and Intake remains the sole `recipe_ingredient_line` writer.
- **Provenance preserved, never overwritten** — `payload` (model extraction) is
  immutable; user edits persist in a new `user_payload` JSONB column. Every editable
  row carries `provenance` (`source` | `user_corrected` | `user_added`); user-added rows
  are forced to `source: null` so a user value can never falsely claim document origin.
- **Draft edit surface** — one `PATCH …/drafts/:draftId` replaces the authoritative
  `user_payload` (validated zod `.strict()`). No per-line endpoints (last-write-wins;
  the phase has no concurrent-editing contract).
- **Confirmation gate** — confirmation is blocked (422 `UNRESOLVED_REVIEW`) while any
  `title_needs_review` / ingredient / method `needs_review` flag remains; editing a
  row resolves its flag. No mandatory fields are invented beyond the existing model.
- **Lifecycle** — per-draft `status` `draft → confirming → confirmed` (+ `recipe_id`,
  `confirmed_at`). The transient `confirming` claim serializes concurrent confirms;
  `reviewing` is represented by the presence of `user_payload` (no extra state);
  `creation_failed` is deliberately NOT persisted because creation is compensated
  atomically (a failed confirm reverts the claim and removes the partial recipe).
- **Transactional + idempotent** — a failed creation fully reverts (`status → draft` +
  `deleteRecipeInternal` of the partial subtree); a repeated confirm returns the
  already-created recipe (`already_confirmed`). No duplicate recipes.
- **Mapping decisions** (recipe model has no `preparation` column): `preparation` is
  folded into the ingredient name (`"onions, thinly sliced"`); quantity → `amount_text`
  (free text, never parsed); method steps joined with `\n\n` → `method_text` tag `METHOD`;
  empty title → the existing `Untitled recipe` placeholder. `source_tag` = `CARD` for
  all bulk lines (same as paste/form — the user is the card author; the six-value
  vocabulary has no document tag, and the detailed provenance lives in the draft).
- **Routing** — the spec's `PATCH …/documents/:id/draft` is adapted to
  `PATCH …/documents/:id/drafts/:draftId` + `POST …/drafts/:draftId/confirm` because a
  document holds multiple drafts (Phase 3 `draft_index`).

## Changed

### Contracts
- `packages/schemas/src/draft.ts` (new) — `DraftProvenance`, `DraftStatus`,
  `DraftIngredientSchema`, `DraftMethodStepSchema`, `DraftEditSchema` (all `.strict()`);
  exported from `index.ts`.

### DB
- `packages/database/prisma/schema.prisma` — `DocumentRecipeDraft` gains `user_payload`,
  `status` (default `draft`), `recipe_id`, `confirmed_at` + `recipe_id` index;
  `DocumentIngestion.status` widened `VarChar(16)` → `VarChar(32)`.
- `packages/database/prisma/migrations/009_document_recipe_draft_edits/migration.sql` —
  columns + `chk_document_recipe_draft_status` (draft/confirming/confirmed) +
  `fk_document_recipe_draft_recipe` (ON DELETE SET NULL) + index.
- `packages/database/prisma/migrations/010_widen_document_ingestion_status/migration.sql` —
  widens `document_ingestion.status` to `VARCHAR(32)` (migration 008 added the 20-char
  `extracting_structure` to the CHECK but the column was still `VARCHAR(16)` → Postgres
  P2000 on live extraction; caught by browser verification).
- `packages/database/src/index.test.ts` — schema-fidelity table list extended to the
  26 materialized tables (24 ERD + document_ingestion + document_recipe_draft).

### API
- `apps/api/src/modules/ingestion/ingestion.service.ts` — `DocumentDraftWire` extended
  (`user_payload`, `status`, `recipe_id`, `confirmed_at`); new `updateDraft`,
  `confirmDraft`, `effectiveDraft`, `assertConfirmable`, `loadOwnedDraft`, `toDraftWire`;
  injects `RecipeService` + `IntakeService`.
- `apps/api/src/modules/ingestion/ingestion.controller.ts` — `PATCH documents/:id/drafts/:draftId`,
  `POST documents/:id/drafts/:draftId/confirm` (GuestOrJwt + Csrf, zod-validated).
- `apps/api/src/modules/ingestion/ingestion.module.ts` — imports `RecipesModule`.

### Web
- `apps/web/lib/types.ts` — `DraftProvenance`, `DraftIngredient`, `DraftMethodStep`,
  `DraftEdit`, `ConfirmDraftResponse`; `DocumentDraft` extended.
- `apps/web/components/app/DocumentDraftReview.tsx` — rewritten: editable title /
  ingredients (name/quantity/unit/preparation + add/delete) / method (edit/add/delete),
  per-row provenance labels, Needs-review resolution, Save changes (PATCH) + Create
  recipe (PATCH-then-confirm), confirmed → "Open recipe".
- `apps/web/app/page.tsx` — `onConfirmed` → normal Recipe Workspace **and** `loadLibrary()`
  so the new recipe appears in the Library immediately (browser verification caught the
  stale-library gap).

## Intentionally NOT changed (Phase 4 boundary)

- Extraction prompt / model extraction behavior (no re-extraction; no LLM during
  edit/save/confirm/create).
- Existing Paste / Structured / Photo flows, analysis pipeline, shopping pipeline,
  Cook workflow, deterministic views.
- `recipe` / `recipe_input` / `recipe_ingredient_line` writers (RecipeService + Intake
  remain the sole writers).
- The six-value `source_tag` / `claim_tag` provenance vocabulary (frozen).
- Method reorder in the draft UI (the existing method surface has no reorder; noted
  limitation).

## Tests / gates (all green)

- API focused: ingestion service **25 tests** (Phase 4 edit/confirm/idempotency/
  compensation/ownership added).
- API full: **30 suites / 387 tests** (incl. `app.module.test.ts` bootstrap with the
  new `IngestionModule` wiring).
- Web focused: `DocumentDraftReview` **7 tests**; web full **24 suites / 219 tests**.
- `llm-adapter` 133, `analysis-worker` 84, `schemas` 112, `database` 3 — all pass.
- Integration: **27 suites / 165 tests** — new `story_bulk_confirm.test.ts` proves the
  full path (draft → edit → confirm → normal recipe with user values + provenance +
  idempotency + review-block + foreign-404 + status-width regression) against live
  Postgres (migrations 009 + 010).
- `typecheck` / `lint` / `build`: clean across all workspaces.
- `scripts/regression-gates.sh`: **PASS**.

## Browser verification (VS Code internal browser, real running app)

Performed against the live stack (Postgres/MinIO/Keycloak, NestJS API :3001, analysis
worker with real DeepSeek, Next web :3000). Account `chef@recipesystems.test`
(password `Password@123`); test document `test-results/bulk_verify_chicken_biryani.txt`.

Workflow | 1440 | 1280 | 768 | 390
--- | --- | --- | --- | ---
Library → Bulk Upload | PASS | PASS | PASS | PASS
Document Upload | PASS | PASS | PASS | PASS
Extraction → Draft | PASS | PASS | PASS | PASS
Draft Review | PASS | PASS | PASS | PASS
Ingredient Editing | PASS | PASS | PASS | PASS
Method Editing | PASS | PASS | PASS | PASS
Save + Reload | PASS | PASS | PASS | PASS
Confirm Recipe | PASS | PASS | PASS | PASS
Library Persistence | PASS | PASS | PASS | PASS

- **Human interactions performed**: Keycloak sign-in, upload a real `.txt`, wait for
  extraction, edit title/ingredient/quantity, add + delete ingredient, edit/add/delete
  method steps, Save (PATCH), reload, re-open, Confirm, open the created recipe, verify
  Library + reopened values.
- **Persistence (Save + Reload)**: edits landed in `document_recipe_draft.user_payload`
  (verified via Postgres: `user_title = "Spicy Chicken Biryani"`, `chicken thighs`,
  added `ginger`, added step `"Garnish with coriander."`) and survive a reload.
- **Confirmed values in the final recipe**: title `My Chicken Biryani`, ingredient
  `chicken thighs · 500 g`, method steps joined and tagged `METHOD` — verified in the
  Recipe Workspace and after reopening from the Library.
- **Issues found & fixed (live)**: (1) `document_ingestion.status` `VARCHAR(16)` too
  narrow for the Phase 3 statuses → migration 010; (2) Library not refreshed after
  draft confirmation → `loadLibrary()` in `onConfirmed`.
- **No horizontal overflow** at any of the four widths on Library, Upload, Draft
  Review, and Recipe Workspace.
- No genuinely unautomatable human intervention was encountered.

## Known limitations

- The draft review is not URL-addressable (no `?draft=` deep link or "my uploads" list):
  after a full page reload the draft is still persisted in the DB, but re-opening that
  specific draft in the UI requires re-navigating through the bulk-upload flow. This
  pre-dates Phase 4 and is recorded as future polish.
- No per-line optimistic locking on drafts (last-write-wins; no concurrent-editing contract).
- No method-step reorder in the draft editor (existing method UI has none).
- `source_tag` on created lines is `CARD` (the only honest six-value tag) — detailed
  document provenance lives in `document_recipe_draft`.
- A crash inside the narrow `confirming` window (after recipe create, before finalize)
  is compensated on retry via the claim revert + partial-recipe delete; the idempotent
  re-confirm returns the existing recipe.

## Exact resume point

Phase 4 complete. Bulk-upload drafts can now be reviewed, corrected, explicitly
confirmed, and converted into normal Recipe Systems recipes (available in the Recipe
Workspace, Library, and the existing ingredient/method/analysis flows).

**Next phase: bulk-upload polish / remaining review integration only if required by
the product specification.**
