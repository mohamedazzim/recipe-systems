# Recipe Systems — Handoff Evidence

**Status:** v1.2 · 2026-09-07/08 · The evidence ledger proving every dispatch unit is DONE. One entry per unit (H-01…H-31), appended by the builder, re-executed by the paired audit (AUDIT.md). Entries are filled as units complete; empty H-items are future units. v1.2: H-02 completed through A-02 (2026-09-07); H-06…H-09 record the P1 auth work (2026-09-07/08).
**Companions:** [DISPATCH.md](DISPATCH.md) (the tasks) · [AUDIT.md](AUDIT.md) (the verification) · [TEST_PLAN.md](TEST_PLAN.md) (the gates the evidence must satisfy) · [USER_STORIES.md](USER_STORIES.md) (the requirements the evidence traces to)

---

## 0b. Analysis 9-view accordion + fixed two-pane workspace — 2026-09-17 (UI-only restructure)

Scope: presentation only. Backend contracts, DB schema, analysis generation, worker, DeepSeek
integration, persistence, and business logic are **unchanged**.

- **Inspected:** `RecipeWorkspace.tsx` (two-pane grid), `AnalysisPanel.tsx` (status), `AnalysisViews.tsx`
  (the 9 views previously behind `Tabs`), `lib/views.ts` (view payload parsers), `types.ts`,
  `AppShell.tsx` (shell/header), `IngredientReview`/`MethodSection`/`ShoppingSection` (left pane).
- **Existing 9-view mapping (accordion sections):**
  `Identification` (derived from persisted view_5) + `1 · Why it works` (view 1) · `2 · Balance`
  (view 2) · `3 · Process` (view 3) · `4 · Substitutions` (view 4) · `5 · Regional` (view 5) ·
  `6 · Ratios` (view 6) · `7 · Sensory` (view 7) · `8 · Dietary` (view 8) · `9 · Nutrition` (view 9).
  Every view keeps its real `renderViewX` component + persisted payload; none removed, none mocked.
- **Implemented:** new accessible `components/ui/Accordion.tsx` (real `<button>` headers, `aria-expanded`,
  `aria-controls`, unique panel ids, `h3` heading wrapper, chevron, one-open-at-a-time, default-open
  `Identification`); `AnalysisViews` now renders the accordion instead of tabs (+ removed the
  previous/next pager); the workspace is already a fixed-viewport two-pane layout with independent
  pane scroll (prior commits) and on-theme slim scrollbars (`globals.css`).
- **Intentionally unchanged:** `ReadinessPanel` (analysis gating), `AnalysisPanel` (status), the
  one-writer worker/API/schema, all view payload parsers and their real empty/incomplete states.
- **Tests:** new `Accordion.test.tsx` (default-open, open/close, one-at-a-time, aria-expanded/controls,
  Enter/Space keyboard); `AnalysisViews.test.tsx` updated from tab to accordion-button queries (24/24);
  `AnalysisPanel.test.tsx` updated (tablist → buttons). Full web suite **187/187** · typecheck 0 ·
  lint 0.
- **Browser verification:** recipe `Meen Dish` (real DeepSeek analysis) renders 10 accordion sections;
  Identification open by default with real family/architecture/confidence/not_this; clicking a view
  header opens it and collapses the previous; View 1 content shows real persisted jobs.
- **Responsive:** desktop `lg` = 50/50 two panes with independent scroll; below `lg` stacks
  (single-column) — verified via DOM classes; agent browser viewport limited to 601px so desktop
  screenshots were not captured.
- **Known limitations:** `next build` NOT run (dev server live — repo convention forbids build while
  the dev server holds `apps/web/.next`); desktop fixed-height behavior verified via structure/tests,
  not a full 1440px browser screenshot.
- **Resume point:** accordion is shippable; if the brief's full 1440/1280/768/390 screenshot matrix is
  required, do it on a machine with a real desktop viewport and re-check for any per-breakpoint
  accordion width/spacing tweaks.

---

## 0a. E2E defect remediation — 2026-09-16 (D-1/D-2/D-4 fixed · D-3 documented · B2 blocked)

Source of truth: the full E2E product audit (HAS DEFECTS — FIX REQUIRED). Fixes only; no
feature cycle; no full E2E re-run; 0 DeepSeek/OCR calls; D-28 untouched.

- **D-1 (MAJOR) — header/title exclusion.** Root cause: the review UI never exposed the
  existing `PATCH …/lines/:id { is_header: true }` path, and the backend implemented
  "header" as an irreversible soft-delete. Fix: `recipe_ingredient_line.is_header` column
  (migration `006_ingredient_line_is_header`); `IntakeService.markHeader`/`unmarkHeader`
  toggle the flag; `listReviewLines` (review surface, headers included) vs `listDraftLines`
  (ingredients only) so the corrected object, shopping, print, library search and cook swaps
  all exclude headers. Web `IngredientReview`: "Header" action + a distinct "Header lines —
  excluded from ingredients, shopping and print" section with "Restore" (undo). Raw
  `recipe_input` byte-unchanged; headers persist + unmark after reload.
  Evidence: intake service/controller unit tests; web `IngredientReview` header tests; e2e
  `review.spec.ts` header mark→exclude→unmark; integration `story_b3_parse_review` TC-02 (8/8).
- **D-2 (MINOR) — C7 classifier grounding.** Root cause: the deterministic classifier
  consumed View 1/5/6 but not the persisted View 4 consequence. Fix: `classifySubstitution`
  now returns `structural` when the View 4 consequence itself states the dish breaks (same
  `STRUCTURAL_OMISSION` vocabulary). Deterministic; no LLM/network; no invention.
  Evidence: `substitution-preview.test.ts` (structural / modular / identity-shift + the new
  consequence-grounded and like-for-like cases).
- **D-3 (NOTE) — View 9 unmapped lines.** Investigated, NOT changed. Root cause: paste
  intake leaves the amount inside `display_name` (`amount`/`amountText`/`unit` are null) and
  `ingredientMassGrams` reads only `amount_text`/`quantity` — plus missing dictionary rows
  (turmeric, ginger, salt, fresh coriander, small onion/onion, red chillies) and the
  deliberately-unmapped fenugreek powder (no USDA record). A safe deterministic fix requires
  amount parsing (D-12/D-25) and a reviewed reference-data import (D-29) — out of scope for
  a NOTE remediation.
- **D-4 (NOTE) — plate-photo 404 console noise.** Root cause: `CookSection` issued
  `GET /cook-logs/:id/photo` unconditionally; the canonical 404 `PLATE_PHOTO_NOT_FOUND`
  surfaced as a browser console error. Fix: the cook-log wire now carries `has_photo`
  (batched photo-presence lookup in `listCookLogs`); the UI skips the GET when absent and
  renders the empty state. API 404 semantics unchanged.
  Evidence: `cook.service.test.ts` has_photo test; `CookSection.test.tsx` no-404 regression.
- **B2 OCR:** BLOCKED by `OCR_PROVIDER=disabled` — explicitly not addressed (environmental,
  not a product defect).
- **Verification:** API focused 102/102 · web focused 35/35 · integration `story_b3` 8/8 ·
  workspace typecheck 0 · lint 0 · build 0 · migration 006 applied · `git diff --check`
  clean under `core.whitespace=cr-at-eol` (three CRLF-convention files, no trailing spaces).



---

## 0. Session decision trace — 2026-09-11 (Q9 provider switch-back + D-23 preflight)

**Gemini switch-back decision (recorded; history preserved):**
- A Gemini provider was implemented behind the EXISTING `LlmAdapter` seam and unit-tested
  (`packages/llm-adapter/src/gemini-adapter.ts` + shared `errors.ts`/`json.ts`; worker selection
  via `MODEL_PROVIDER=gemini`). One live recipe test ran: views 2/5/4/6/7/1 returned through the
  Gemini adapter with D-05 parse + D-16 grounding `ok` (UI + DB model pin
  `gemini:gemini-3.8-flash`; zero secrets committed).
- CONFIRMED PROVIDER-SIDE BLOCKER: `gemini-3.8-flash` returned 429 quota errors in windows
  lasting minutes — 14 consecutive 429s over ~7 min even for single minimal calls (live probe).
  View 3 of the live analysis could not complete; the job exhausted `retry_limit=3`
  (analysis d533b2f2, job 9db440c5 — rows preserved as evidence). The adapter's bounded
  Retry-After-aware retry profile (default 8, backoff cap 16s + jitter) is in place for when
  provider capacity returns.
- DECISION: dispatcher abandoned Gemini for runtime. The Gemini adapter code is KEPT (available
  via `MODEL_PROVIDER=gemini`) but NOT selected. No further Gemini architecture changes.

**Verified DeepSeek runtime state (restored + sanity-checked):**
- Local `.env` (never committed): `MODEL_PROVIDER=deepseek`, `LLM_PROVIDER=deepseek`,
  `DEEPSEEK_MODEL=deepseek-flash`, `DEEPSEEK_REASONING_EFFORT=low`.
- Worker boot: `analysis-worker: LLM adapter = deepseek (deepseek:deepseek-flash (effort low)
  @ https://api.deepseek.com)` — no configuration error.
- Tiny sanity check: `scripts/verify-deepseek.js` live pass (D-16 garlic plant REJECTED on
  views 1/3/5, D-05 tag-enum REJECTED on view 2, views 4/6/7 COMPLETE; publish 3/7 — the
  planted-violation harness behaving as designed). web/API/worker/Postgres/Keycloak/MinIO all
  listening.

**D-23 PREFLIGHT (read-only; no implementation):**
- Canonical sources read: DISPATCH D-23 (P5-2: E4/E5/H4, depends D-22 + D-30, gate Q2),
  BUILD_PLAN P5-2 + §7.1 (Q2 gates P5 print; decide by week 8), SCAFFOLD §4/§7, ADR §7
  (renderer read-only; permitted sources: `shopping_list_generation` + `shopping_list_item`
  for the list; `analysis_station_card` for the card), Tech Stack §12, TEST_PLAN P5 row,
  Epic E/H, IMPROVEMENT_PLAN P0-6.
- Q2 determination: **OPEN**. Evidence: SCAFFOLD §7 register row has no resolution (vs the
  resolved Q4/Q8/Q9 rows); IMPROVEMENT_PLAN P0-6 "Status: OPEN"; Epic E/H headers
  "Q2 (OPEN DECISION — allergen-line source)"; no resolution record in CHANGE_LOG/HANDOFF;
  ADR §7 names the two print outputs' snapshot tables but does NOT name the allergen line's
  source under the snapshot-only render rule (INV-12).
- Missing decision (exact): which frozen, permitted record supplies the View 8 allergen line
  at print time under INV-12. Candidates: (a) analysis-time persistence of the allergen line
  into the print snapshots (station-card row / shopping-generation row) so the renderer reads
  only the permitted tables; (b) a render-time join of the same analysis's frozen
  `analysis_view` (view 8) + effective-dated `dietary_allergen_mapping` — requires amending the
  ADR §7 permitted-source table. Evidence needed to unblock: a dispatcher decision naming the
  source + ADR §7 amendment + Q2 register row → RESOLVED (same trace as Q4).
- Additional dependency check: D-23 depends on D-30 (DISPATCH header) — D-30 (Track S,
  E1/E2/E3) is NOT delivered (`shopping_list_generation`/`shopping_list_item` exist with 0
  rows; no code writes them).
- **VERDICT: D-23 = STOP** (Q2 OPEN — DISPATCH: "if Q2 is still open at week 9, STOP and raise
  it; do not pick a source silently" — plus the unmet D-30 dependency).
- Resume point: (1) dispatcher resolves Q2 (source named, ADR §7 amended, register flipped);
  (2) D-30 ships Track S data; (3) D-23 then implements P5-2 print templates in
  `packages/rendering` (E4/E5/H4, one A4/Letter page for the golden card, snapshot-only
  INV-12, PDF failure → retryable error) per DISPATCH D-23 deliverables.

**Q2 FORMAL RESOLUTION (dispatcher, 2026-09-11) — Option A (analysis-time persistence):**
- Decision: the View 8 allergen line required by INV-12 for print is written into the print
  snapshot tables at analysis time (station-card row for E5; the shopping-list generation
  snapshot for E4). Print/PDF consumes ONLY the persisted snapshot value and must NOT re-derive
  the allergen line at print time from the current effective-dated `dietary_allergen_mapping`.
- Rationale (recorded as accepted): analysis-time persistence is easier to audit; historical
  print output must remain stable; avoids future drift from effective-dated reference-table
  changes; avoids print-time re-derivation disagreement; the duplicated value is acceptable
  because it is a frozen print snapshot; INV-13 wording/safety constraints still apply.
- Recorded in: SCAFFOLD §7 Q2 row (RESOLVED, dated-resolution pattern) · ADR §7 amended
  (Decision 6) · IMPROVEMENT_PLAN P0-6 RESOLVED · CHANGE_LOG. The historical OPEN Q2 entries
  remain visible in the strikethrough trace.

**D-30 PREFLIGHT (recorded BEFORE code; no implementation this task):**
- Sources read: DISPATCH D-30 · BUILD_PLAN §4 Track S + §6 story map · Epic E stories E1/E2/E3
  (AC + TC + data tables) · Recipe_Systems §12 Epic E · ERD §7 data dictionary + §17 support
  matrix + C-28/C-39 · ADR §7/§10 · TEST_PLAN Track S row · HANDOFF D-22 (D5/D-23 seam) +
  H-03 DDL/trigger evidence · Prisma schema (shopping models) · D-29 reference-data state.
- Scope (DISPATCH D-30, exact): E1 list generation from the structured object (one row per
  ingredient; "to taste"/"for tempering" visible; two fenugreek rows; no headers) · E2 have/need
  state persisting on the saved recipe and surviving list regeneration · E3 market grouping
  (fresh produce, fish/meat, spices, fats/oils, other) · composite FK + C-28 trigger behavior
  verified. NON-GOALS: print rendering (D-23), library UI (D-22 — consumes the state), cook loop.
- Data source: the saved recipe's structured object = active `recipe_ingredient_line` rows
  (deleted_at NULL, card `line_no` order, display_name/amount_text/unit/confirmed_sense/
  category/food_id); distinct `shopping_key`s preserved by C-39 split/merge → the two fenugreek
  rows come for free. Never from prose.
- Writer ownership: API/BFF shopping module (recipe-scoped writes following the D-22
  RecipeService one-writer pattern). The worker writes no shopping tables (A-17 analysis-only
  writer). The renderer stays read-only (ADR §7). No OPEN register row covers these tables → no
  new architecture question.
- Schema readiness: all three tables + `uq_ingredient_shopping_state` composite FK + the C-28
  soft-delete cleanup trigger already exist in the P0 migrations and are gates-verified (H-03).
- Import/review + versioning/effective dating: N/A for shopping state (reviewed import path is
  ADR §7 reference data — D-29 done). Generation snapshots are historical (`generated_at`,
  per-generation rows, latest via `ix_shopping_generation_recipe`); state rows key by
  (recipe_id, shopping_key).
- Q2 Option A consequence: the shopping-list generation snapshot and the station-card row gain
  allergen-line columns (persisted at analysis time) — schema additions under the frozen-ERD
  amendment discipline, landing with D-30 (shopping table) / D-23 (station-card writer).
- Golden: `golden_kanyakumari_card.json` (G1) drives E1 TC-04 (two fenugreek rows) and the
  D-30 done criteria quote the golden object.
- Done criteria (DISPATCH D-30, exact): 4 bullets — golden-object list shape (one row per
  ingredient, two fenugreek rows, no headers, loose quantities visible) · have/need persists
  across regeneration + reopen · E3 five-group grouping · C-28 soft-delete cleans state AND
  state survives regeneration.
- Design points to pin at D-30 dispatch (flagged, not decided): (1) E3 grouping mapping source —
  recommended: derive from the captured line's category/food_id via a fixed five-group mapping,
  persisted into `group_name` at generation; (2) exact placement/timing of the Option A
  allergen-line column on the shopping snapshot.
- **VERDICT: D-30 PREFLIGHT = GO.** Dependencies met (D-14 done; DDL + trigger + golden fixture
  in place; no OPEN register gate; Q2 now resolved and its shopping-side consequence scoped).
- Resume point: dispatch D-30 implementation per DISPATCH deliverables 1–4 + done criteria →
  H-30 entry + audit A-30. D-23 stays blocked until D-30 completes (DISPATCH dependency), then
  ships with the Q2 Option A allergen line.

**D-30 EXECUTION STARTING POINT (2026-09-11, recorded before code — dispatcher authorization):**
- Scope: DISPATCH D-30 deliverables 1–4 exactly (E1/E2/E3 + composite FK + C-28 + golden
  fidelity + Q2 Option A allergen snapshot + INV-17 + canonical shopping UI only, no print).
- D-30A (grouping — D-30-scoped design assumption, preflight-recommended mechanism): the five
  canonical groups are derived by a deterministic keyword mapping over the line's intake
  category (`recipe_ingredient_line.group_name`, free text) then its `display_name`, in the
  priority fish/meat → fats/oils → spices → fresh produce → other; the result is persisted
  into `shopping_list_item.group_name` at generation. `recipe_ingredient_line.group_name` is
  NEVER written by D-30 (Q4: Intake is the line's sole writer).
- D-30B (Q2 Option A, shopping side): `shopping_list_generation.allergen_line` (new column,
  migration 004, ERD §7 amendment) carries the FROZEN allergen line rendered from the recipe's
  CURRENT analysis View-8 payload (D-05-gated) at generation time — never re-derived from
  `dietary_allergen_mapping` at print/render time. Renderer stays read-only.
- D-30C (include_on_list): the dispatcher's E1 rule — one active row per active (non-deleted)
  line — is implemented verbatim. The ERD §15.1 `include_on_list` semantics question stays
  OPEN (not silently decided by D-30).
- D-30D (writer): new API `ShoppingModule` is the sole logical writer of
  `shopping_list_generation`/`shopping_list_item`/`ingredient_shopping_state`; the worker
  writes no shopping tables (A-17); INV-17 404 for missing AND foreign AND malformed ids.
- Endpoints: POST /recipes/:recipeId/shopping-list (generate) · GET …/shopping-list (latest +
  current state) · PATCH …/shopping-state ({shopping_key, state have|need}) — GuestOrJwt +
  Csrf on writes. State upserts key on (recipe_id, shopping_key); C-28 cleans on soft-delete.
- Evidence targets: API unit + web unit + integration story_d30 (real Postgres, golden fixture,
  reference-data bootstrap as story_d22) + new QG2 gates (shopping one-writer; allergen_line
  column presence) + live internal-browser flow + verify-local + CI.

**D-23 EXECUTION STARTING POINT (2026-09-11, recorded before code — dispatcher authorization):**
- Scope: DISPATCH D-23 deliverables 1–4 exactly — E4 shopping print, E5 station-card print,
  H4 allergen line, PDF via Playwright + headless Chromium (Tech Stack §12), INV-12
  snapshot-only, one-page golden fit, retryable PDF failure. No D-24+, no print of anything
  beyond the two canonical templates.
- D-23A (renderer): `packages/rendering` owns the two HTML templates + the PDF engine
  (`renderPdf`, injectable Chromium launcher, bounded 2-attempt retry, render timeout,
  `PdfRenderError` = retryable). `renderAllergenLine` moves here (pure; D-30's shopping
  service and the worker's station-card writer share it). Page size A4; one-page fit proven
  by page-count == 1 on the generated PDF AND a viewport scrollHeight layout assertion.
- D-23B (station-card allergen column): migration 005 adds
  `analysis_station_card.allergen_line` (ERD §6 amendment). The WORKER's station-card upsert
  persists the frozen View-8 line of the SAME analysis (Q2 Option A — analysis time, never
  print time). Existing cards stay NULL and the print honestly omits the line (nothing
  invented).
- D-23C (API print module): `GET /recipes/:id/print/shopping-list` and
  `GET /recipes/:id/print/station-card` (GuestOrJwt; INV-17 404s) return `application/pdf`
  (the HTML of the SAME template is served on `?format=html` — SCAFFOLD §4 preview parity).
  Read-only reads of the persisted snapshots ONLY: the module never touches
  `dietary_allergen_mapping` or live recipe lines (new QG2 gate 2d).
- D-23D (web): print buttons on the ShoppingSection and the station-card surface fetch the
  PDF (credentialed blob) and open it — no print UI redesign, no account chrome in the PDF.
- D-23E (snapshot-only proof): integration story_d23 — after the snapshot is generated,
  (1) a NEW reviewed effective-dated allergen mapping is approved, (2) a recipe line is
  edited live; the re-print output is BYTE-IDENTICAL to the original (INV-12).
- Evidence targets: rendering unit (templates + engine failure cells) · API print unit ·
  web print-button unit · integration story_d23 (real Postgres, real D-30 snapshot, real
  D-20 card, real Q2 value) · QG4 PDF-failure cell · live internal-browser golden print
  journey · suites/gates/contract/lint/typecheck/verify-local/CI.

**D-24 PREFLIGHT (2026-09-14, read-only — recorded BEFORE any D-24 code):**
- Sources read: DISPATCH D-24 (P6-1) · Recipe_Systems §12 F1/F2/F6 + §15 acceptance
  scene · USER_STORIES F1/F2/F6 · Epic-F_After_Cook.md · ERD §8 cook_log tables +
  §17 coverage · BUILD_PLAN P6-1 · ADR (Web API owns cook-loop writes; cook notes
  private) · TEST_PLAN P6 row + §4 time note · AUDIT.md A-24 · HANDOFF ledger ·
  IMPROVEMENT_PLAN.
- D-24A (scope): EXACTLY F1 (log cook: `cooked_at` default today editable, multiple
  logs, library shows last cooked) + F2 (rating 1–5 optional + free-text note,
  private, visible on reopen above the analysis) + F6 (surface last cooked date,
  rating, and the next-time line when present). NON-GOALS: F3 swaps, F4 next-time
  FIELD (write), F5 photos, profiles, D-25+.
- D-24B (schema): `cook_log` already exists (Prisma + ERD §8) with `cooked_at` DATE,
  `rating` SMALLINT (CHECK 1–5), `note` TEXT, `next_time_instruction` TEXT — NO
  migration needed. F6 only SURFACES `next_time_instruction` when a row carries it
  (F4/D-26 will write it). `cook_log_swap` / `cook_log_photo` untouched.
- D-24C (ownership): ADR — the Web API owns cook-loop writes. New API cook module is
  the sole writer of `cook_log` (new QG2 one-writer gate, D-22/D-30 pattern); the
  worker never writes cook tables; the renderer stays read-only. Library
  (GET /recipes) extends the D-22 cook indicator with the last cooked date.
  Ownership via `RecipeService.assertOwned` (INV-17 404s; D-09 cross-account
  privacy suite re-asserted — ratings/notes return nothing across accounts).
- D-24D (surface/UX): canonical §15 cook step — “I cooked this” → rate 4 → note
  “2 green chillies, fenugreek powder off heat” → Sunday reopen shows the note at
  the top, garlic still absent, list printable. The F2 note carries the next-time
  text until the dedicated F4 field lands (labeled working assumption, not a silent
  F4 implementation).
- D-24E (dependencies/register): D-23 DONE (CI run 69 success 2026-09-14,
  `f8af600`); no D-29 dependency. Q1/Q5/Q9/Q10/Q11 untouched; no register changes;
  DeepSeek config untouched; OCR/Q10 untouched.
- **VERDICT: D-24 = GO** (preflight only — no D-24 code this session; HARD STOP after
  this trace).

---

**D-26 PREFLIGHT (2026-09-15, read-only — recorded BEFORE any D-26 code):**
- Canonical sources read: DISPATCH D-26 (P7-2; depends on D-24 ONLY; audit A-26) ·
  BUILD_PLAN P7-2 + §7.8 (I3 defers to the View 9 payload, Q14) · Epic-F F3/F4 ·
  Epic-H H1/H3/H5 · Epic-I I3/I4 · Recipe_Systems §12 · ERD §5
  (`account_restriction_profile/item`) + §8 (`cook_log_swap`) + §15.6/§17 (I3 —
  Q14, honestly open) · ADR (Web API owns account/guest/recipe/tag/restriction/
  cook-loop writes; I3 persistence location = explicit open decision) · TEST_PLAN
  P7 row + QG1/QG4/QG5 · AUDIT.md A-26 · API doc §8/§9/§10 · IMPROVEMENT_PLAN
  P2-1/P2-6 · SCAFFOLD §7 register.
- D-26A (scope): EXACTLY F3 swaps (record; card rewritten ONLY when applied),
  F4 dedicated next-time field (PATCH cook-log extension RS-US-34 + station-card
  print tagged COOK LOG, never CARD), H1 restriction profile (optional; never
  auto-deletes), H3 conflicts-first + unknown-is-not-a-pass highlighting,
  H5 restriction-driven swaps (reuse F3 records), I3 per-bowl band only after
  portions are set (Q14 seam), I4 band tightening (named fish / weighed coconut /
  measured oil — the D-19 RS-US-45 assumptions surface + a web UI + narrowing
  proof). NON-GOALS: G2 veto (D-27), pilot gate (D-28), F5 photos (D-31),
  D-25 items (aliases/tags/edit+re-analyse).
- D-26B (schema): NO migration needed — `account_restriction_profile/item`,
  `cook_log_swap`, and `cook_log.next_time_instruction` all exist (migration 002);
  the frozen `View9PayloadSchema` already carries `per_portion {portions,
  energy_kcal_min, energy_kcal_max} | null` (the labeled Q14 seam). Frozen D-05
  schemas are NOT changed: H3 highlighting is a READ-TIME projection over the
  frozen View 8 payload + profile rows.
- D-26C (writers, ADR §2): new API restriction module is the sole writer of
  `account_restriction_*` (new QG2 one-writer gate + fire proof); swaps stay in
  the cook module (D-24's gate 2e already confines `cookLogSwap` writes);
  `next_time_instruction` joins the cook module's PATCH (gate 2e covers);
  applied-swap card updates route through the INTAKE module's line-edit surface
  (Q4 one-writer preserved — no new line writer); I3/I4 recomputes stay
  worker-owned via the D-19 view9-recompute queue (API queues, never writes
  `analysis_*`).
- D-26D (F4 print integration + ADR §7): the station-card print path currently
  reads the persisted card snapshot only. The next-time line is written AFTER
  analysis (post-cook), so analysis-time persistence cannot carry it. ADR §7's
  permitted-source table gains `cook_log.next_time_instruction` (the LATEST log,
  surfaced on the station card tagged COOK LOG — never CARD) — recorded as an ADR
  amendment in the same trace style as the Q2 Option A amendment (D-23B).
- D-26E (open decisions): Q14 REMAINS OPEN — D-26 builds the per-bowl band to the
  View 9 payload convention behind the labeled seam, ships NO persisted portion
  column, and labels the seam in HANDOFF (A-26 BLOCKER class honored). ERD §15
  open items in D-26's path — diet-pattern vocabulary (H1) and
  restriction-profile label-pack precedence (H3) — are handled as LABELED PILOT
  WORKING ASSUMPTIONS with register references (IMPROVEMENT_PLAN P2-6), never
  silently resolved. Q1/Q5/Q9/Q10/Q11 untouched; Q9 resolved value (DeepSeek)
  untouched.
- D-26F (profile semantics, A-26 BLOCKER class): H3 matches profile allergen
  names against the frozen View 8 `present`/`unknown` NAME strings (the frozen
  payload carries names only — no id join at read time); conflicts render FIRST;
  unknown renders as unknown, never a pass; no recipe is ever auto-deleted.
- D-26G (swap semantics, A-26 BLOCKER class): POST /cook-logs/:cookLogId/swaps
  records skipped/reduced/increased/swapped (API doc §8 body incl. reason
  restriction|pantry|other and applied_to_card). Recording never touches the
  card; `applied_to_card: true` applies via the Intake line-edit path and is
  recorded on the swap row (auditable); H5 rides the same surface with
  reason=restriction.
- D-26H (I3/I4 endpoints): PATCH /analysis/:analysisId/view-9/portions
  {portions: 3|4} (API doc §10, RS-US-46) queues the view-9 recompute with the
  portion count; the worker fills `per_portion` in the recomputed View 9 payload;
  the band WITHOUT portions never shows a per-bowl number (I3 TC-01). PATCH
  view-9/assumptions (RS-US-45, exists) gets the web tightening UI; the
  narrowing direction is proven per input (I4 TC-01).
- D-26I (dependencies/register): D-24 DONE + A-24 PASS (2026-09-15, `6837683`);
  D-23 print templates present (F4 integration target); D-19 recompute seam
  present; NO D-25 dependency (DISPATCH table: D-26 depends on D-24 only).
- **VERDICT: D-26 = GO** (preflight only — no D-26 code this session; HARD STOP
  after this trace).

---

---

## 1. Entry template (mandatory for every unit)

Every dispatch unit appends exactly this block, one line of evidence per done criterion (DISPATCH global rule 6):

```markdown
## H-XX — <dispatch unit title>
- BASE_SHA / COMMIT_SHA:
- Date / agent session:
- Summary (what shipped, in one paragraph):
- Files changed (paths):
- Commands run (with output excerpts or links):
- Test results (suite name → result, e.g. story_a1_create_account.test.ts → green; cumulative suite → green; coverage → floors met per QG1):
- Done-criteria evidence (one line per criterion, quoting the criterion):
- Gate evidence (QG1 floors, QG2 full cumulative + regression-gates.sh, QG3 baselines recorded/asserted, QG4 assigned fault cells demonstrated, QG5 fixture names/seeds):
- OPEN DECISION notes (which register items this unit touched — Q1–Q18 per SCAFFOLD §7 — under which labeled working assumption, with register IDs):
- Deviations from the prompt (and why):
- Open items / follow-up risks:
- Audit result (A-XX verdict, appended after the audit):
```

**Evidence rules:**

1. **Claims are hypotheses until audited** (AUDIT.md contract): the paired audit re-executes the done criteria, never trusts this file.
2. **Every done criterion gets exactly one evidence line.** A criterion without evidence means the unit is not done (TEST_PLAN §5: phase exit requires the BUILD_PLAN §3 exit checks re-run green).
3. **Perf numbers are recorded, not described:** any QG3 metric lands in `.perf-baselines.json` AND is quoted here (photo→first-analysis, job latency, PDF generation, SSE latency, grounding wall time — TEST_PLAN QG3 table).
4. **Golden fixture evidence** cites the CI run (link/run id) and the 8 invariants one by one (ERD §16).
5. **OPEN DECISION discipline:** working assumptions are labeled with their register IDs (SCAFFOLD §7). A unit that shipped an unlabeled assumption fails its audit (DISPATCH global rule 9).

## 2. Evidence-artifact registry (fixed names)

| Artifact | Owned by | Purpose |
|---|---|---|
| `.perf-baselines.json` | every perf-measuring unit (QG3) | Baselines CI asserts against |
| `scripts/regression-gates.sh` | D-01, grown by later units | QG2 static gates between audits |
| `AUDIT_LOG.md` | the audit agents | One verdict block per A-XX |
| `tests/fixtures/golden_kanyakumari_card.json` + `tests/assertions/golden_recipe_assertions.yaml` | D-03 | The 8 golden invariants, CI-blocking |
| `tests/fixtures/corpus/` (50) + `tests/fixtures/messy_20/` | D-04, grown through P7 | QG5 deterministic tiers |
| `tests/integration/story_<id>_*.test.ts` | the phase owning the story | One suite per story ID (SCAFFOLD §6) |

## 3. Story → handoff coverage matrix (50/50)

Every story's done evidence lives in the entry of the unit that owns its phase (BUILD_PLAN §6, unchanged):

| Story set | Handoff entry |
|---|---|
| G1 (fixture in CI) | H-03 scaffold; re-asserted in every later entry's golden evidence |
| A1, A2 | H-06…H-09 |
| B1–B5 | H-10…H-14 |
| C1, C2 (views 1–4), C4 | H-15…H-18 |
| C2 (views 5–9), C3, C5, H2, H6, I1, I2, I6 | H-19…H-21 |
| D1, D2, D6, E4, E5, H4 | H-22, H-23 |
| F1, F2, F6 | H-24 |
| B6, C6, C7, D3, D4, D5, F3, F4, G2, G3, H1, H3, H5, I3, I4 | H-25…H-28 |
| H7, I7 | H-29 |
| E1, E2, E3 | H-30 |
| E6, F5, I5 (conditional per §13) | H-31 |

A story is DONE only when its entry's done-criteria lines cover every acceptance bullet in USER_STORIES.md and its audit verdict is PASS (or PASS-WITH-FINDINGS with no BLOCKER/MAJOR open).

---

## 4. Entries

### H-01 — D-01 Monorepo bootstrap & CI

- BASE_SHA / COMMIT_SHA: **none recorded** — Git not available / not authorized (uncommitted working
  tree; recorded accurately, matching H-02).
- Date / agent session: bootstrap ported during reconciliation (2026-09-07); evidence reconstructed
  and re-verified 2026-09-08 by direct inspection of the current tree.
- Status: **DONE** (implementation + verification); the D-01 git-protocol done-criterion
  (BASE_SHA/COMMIT_SHA recorded; diff contains only declared deliverables) remains **PENDING Git
  authorization** — same disposition as H-02.
- Summary: monorepo per SCAFFOLD §1 — apps/{web,api,analysis-worker}, packages/{domain,schemas,
  database,llm-adapter,ocr-adapter,rendering}, tests/{fixtures,assertions,integration,e2e},
  infra/{docker,keycloak,nginx}, .github/workflows/ci.yml, scripts/, docs/. npm workspaces
  (apps/*, packages/*). packages/database Prisma initialized; migration 001 = `CREATE EXTENSION IF NOT
  EXISTS btree_gist` only (D-01-owned; schema DDL came in D-02). CI order (ci.yml):
  lint → typecheck → unit → golden+grounding gates → contract → migrate (ephemeral Postgres) →
  integration → build + QG3 perf job. scripts/verify-local.sh reproduces the same order locally.
  QG1 coverage floors configured (apps/api jest: 75% lines); scripts/regression-gates.sh implements
  the QG2 static gates (one-writer greps, render read-only, DDL-outside-Prisma, provenance tags,
  disclaimers, golden-test-present + golden invariant evaluation); .perf-baselines.json + QG3
  perf-schema job. Compose (SCAFFOLD §5): default = postgres+minio+nginx (all healthy-checks), identity
  profile = Keycloak, observability reserved; no Redis anywhere in compose (grep: 0 matches).
- Done criteria evidence (real executions 2026-09-08):
  1. **`docker compose up -d` (default profile) brings up postgres/minio/nginx healthy** — verified
     live: postgres (healthy), minio (healthy), nginx (`/healthz` → ok).
  2. **`npx prisma migrate deploy` green on empty Postgres; re-run no-op** — proven at A-02 on a
     fresh database (001+002 applied; second run "No pending migrations to apply"); verify-local
     migrate stage green every run.
  3. **CI workflow passes end-to-end; verify-local reproduces locally** — hosted CI has not run
     (no remote — Git not authorized); the workflow file is present with the canonical stage order
     and every stage is exercised locally by verify-local: **ALL STEPS PASSED (exit 0)** 2026-09-08
     (multiple runs: post-cleanup, post-remediation, post-D-03).
  4. **Each QG2 static gate provably fires** — now AUTOMATED (2026-09-08):
     `tests/integration/qg2_gates.test.ts` (9/9) plants one controlled violation per gate in a
     scratch tree (via the new GATES_SCAN_ROOT override in regression-gates.sh — the canonical tree
     is never touched) and proves each fires: analysis one-writer, dietary/nutrition one-writer,
     render read-only, DDL-outside-Prisma, provenance tags, disclaimer markers, golden-test-present.
     Golden invariant evaluation fire-proof lives in golden_fixture.test.ts (D-03, 8/8). Baseline
     scratch + real-tree pass assertions included. Coverage thresholds and the perf job are
     configured and enforced (perf: schema asserted, no-op while baselines empty — per D-01).
  5. **git protocol** — PENDING (see status line above).
- Deviations: (a) web uses the repository's own design-system primitives (components/ui/*, token
  layer in globals.css + tailwind.config) instead of shadcn/ui — the authoritative design direction
  established its own system; shadcn never installed. (b) Keycloak was started before P1's nominal
  gate (D-06 shipped during reconciliation/EOD auth work — the dependency is now moot; D-06 evidence
  lives in H-06). (c) D-01 deliverable ordering: contract-check runs inside verify-local between
  gates and migrate (a superset of the canonical order; SCAFFOLD §6 order otherwise preserved).
- Audit result: A-01 not yet executed — PENDING.

### H-02 — D-02 ERD v13 migrations

- BASE_SHA / COMMIT_SHA: **none recorded** — git operations were not authorized during the
  reconciliation/audit workflow; the repository remains an uncommitted working tree as of
  2026-09-07. Recorded accurately per A-02; SHAs to be filled when commits resume.
- Date / agent session: 2026-09-07 · reconciliation session (built) + A-02 independent audit (re-executed).
- Done criteria evidence (real executions, re-verified by A-02 on a fresh database):
  1. **Fresh deploy applies all 24 tables + every constraint/index/trigger** — fresh DB
     `recipe_a02` created on the compose Postgres; `prisma migrate deploy` applied 001+002;
     re-run = "No pending migrations to apply." Independent conformance parse (ERD §5–§10 vs
     live information_schema): **24/24 tables, 0 extra, 0 missing, 0 column problems**;
     23 CHECK constraints, 2 exclusion constraints (`excl_allergen_mapping_overlap`,
     `excl_food_composition_version_overlap`), trigger
     `trg_line_soft_delete_cleans_shopping_state`, 59 indexes incl. every §12 partial index
     with verbatim WHERE clauses; `btree_gist` + `plpgsql` extensions present.
  2. **`prisma migrate diff` shows zero drift** — DB→datamodel diff = exactly **3 objects**,
     all SPECIFIED raw-SQL exceptions Prisma cannot express and documented in migration 002's
     header: `fk_analysis_snapshot_same_recipe` and `fk_shopping_state_recipe_line` (composite
     FKs, ERD §12 / C-39) and `uq_analysis_view` (unique INDEX, ERD §12). Zero unintentional drift.
  3. **Every CHECK fires on a violating row; exclusion rejects overlap; trigger cleans shopping
     state** — 8/8 battery on the fresh DB: `chk_recipe_owner_xor` (both-owners AND
     neither-owner rejected; account-only accepted), `chk_ocr_confidence_range`,
     `chk_restriction_item_type_matches_value`, `excl_allergen_mapping_overlap`,
     `chk_analysis_view_status`, `chk_analysis_claim_tag` all fire; trigger probe
     **BEFORE=1 → AFTER=0** shopping-state rows after line soft-delete (C-28).
  4. **CI green on the migration commit; HANDOFF records both SHAs** — no commit exists
     (git operations not authorized), so the hosted-CI half is pending a remote. Local CI
     reproduction (`scripts/verify-local.sh`, SCAFFOLD §6 order) ran end-to-end after the
     A-02 integration-step fix → see line below; regression gates PASS; contract-check OK
     (artifact generated in-repo, matches packages/schemas, exit 0).
- Final verify-local result (post-fix): `ALL STEPS PASSED` — recorded in §verification below.
- NON-GOALS honored: no application code beyond migration files in `packages/database` (src =
  client entry + fidelity tests only); no reference-data seed (D-29); no ERD v14 changes.
- OPEN DECISION register: untouched by D-02 (Q9/Q10/Q11 remain OPEN).
- Audit trail: A-02 verdict was CONDITIONAL (H-02 absent + integration-step failure); both
  conditions cleared 2026-09-07 — this entry and the `--passWithNoTests` integration fix.
  The audit re-executes this evidence before upgrading to PASS.

### H-03 — D-03 Golden fixture scaffold

- BASE_SHA / COMMIT_SHA: **none recorded** — Git not available / not authorized.
- Date / agent session: 2026-09-08 · D-01+D-03 completion session.
- Status: **DONE** (builder); audit A-03 pending.
- Summary: golden Kanyakumari card scaffold per ERD §16 / Recipe_Systems §12 B2, §15. INPUT side =
  the canonical card lines (Fish 500g, Drumstick 1 Nos, Mango 1/2 Nos, Grated Coconut Half Shell,
  Coconut Oil, Chilli 5 Nos, Chilli Powder 2 Tsp, Coriander Powder 1 Tsp, Tamarind A Lemon Size,
  Fenugreek Powder 1/2 Tsp, Fenugreek 1/4 Tsp — exact strings lifted from the worked mockup; no
  invented values). EXPECTED side encodes the 8 invariants grounded in the §15 acceptance scene:
  method CDK 1669 / Mrs. Anitha tagged INFERRED; family "coastal Tamil fish curry" (region
  Kanyakumari/Kumari; not "generic Indian curry"); station card present on inferred method with
  "untasted briefing"; View 8 contains fish/mustard/coconut/fenugreek, species unknown, never
  "safe"; View 9 energy band 1,300–2,200 kcal, sodium Unknown.
- Files added: `tests/fixtures/golden_kanyakumari_card.json`,
  `tests/assertions/golden_recipe_assertions.yaml` (the 8 invariants, one line each),
  `scripts/golden-check.js` (executable validator: completeness cross-check YAML↔code, per-check
  PASS/FAIL output, exit 1 on any failure), `tests/integration/golden_fixture.test.ts`.
- Files modified: `scripts/regression-gates.sh` (new stage 6b: evaluates golden-check.js — CI and
  verify-local both route through regression-gates, so both are covered by this one wiring point).
- Done criteria evidence:
  - **Both fixture files exist with the exact names/paths SCAFFOLD §1 and TEST_PLAN §1 promise** —
    verified on disk (paths above).
  - **All 8 invariants encoded; A-03 may cross-check against ERD §16** — both fenugreeks; no
    ginger/garlic + garlic absent; family not generic (coastal Tamil fish curry); coriander
    under-reporting note in View 2; station card on inferred method; View 8 never "safe"; View 9 a
    band; sodium Unknown. Implemented in golden-check.js + declared in the YAML; validator refuses
    to run on any YAML↔code mismatch.
  - **CI runs the golden job every PR; verify-local includes it** — regression-gates.sh stage 6b
    (CI step "Golden fixture + grounding validation" + verify-local step 27). Hosted CI itself not
    run (no remote); local reproduction green.
- Violation proof: **8/8 fired** — tests/integration/golden_fixture.test.ts plants one controlled
  violation per invariant on a deep copy and proves EXACTLY that check fails (all others stay
  green — independence) then canonical fixture passes again. CLI demo recorded 2026-09-08: planted
  point-kcal (1750) → view9_band FAIL (exit 1, 7/8); restored → 8/8 exit 0. No plants remain; no
  temporary corruption.
- Test results: integration suite 10/10 (1 completeness + 1 canonical-all-pass + 8 violation proofs);
  regression gates PASS (golden stages armed); verify-local **exit 0 · ALL STEPS PASSED**.
- Deviations: none. The §15 acceptance scene (Priya) is documented in the fixture's `source` block
  as the day-in-the-life scenario the assertions scaffold (TEST_PLAN §1 mechanism 3); its full
  automation belongs to later units.
- Audit result: A-03 not yet executed — PENDING.

### H-04 — D-04 50-recipe corpus + reviewers

- BASE_SHA / COMMIT_SHA: **none recorded** — Git not available / not authorized.
- Date / agent session: 2026-09-08 · D-04 dispatch session.
- Status: **DONE** (builder); audit A-04 pending.
- Summary: canonical deterministic fixture corpus + reviewer slots per DISPATCH D-04 / QG5 Volume
  tier / Recipe_Systems §13. `tests/fixtures/corpus/` = **50 fixtures** (rs-001…rs-050), one file
  each, versioned (version:1), seeded with the golden card (rs-001 carries the exact golden lines +
  expected block + CDK 1669 / Mrs. Anitha INFERRED method). `tests/fixtures/messy_20/` = **20 messy
  fixtures** (messy-001…messy-020) as a separate named set — never merged into the corpus count.
  `tests/fixtures/reviewers.json` = the two reviewer SLOTS (tn_kanyakumari, kerala) with
  identity/contact/availability recorded OUTSIDE the repo (no fabricated people — BUILD_PLAN §7.9;
  workflow lands at D-27). All fixtures are `provenance.synthetic: true` — deterministic test data,
  no real-world source claims.
- Coverage (verified): regions tamil-nadu ×20, kerala ×15, other ×15; categories veg ×33, non-veg
  ×17; input types photo/paste/form all present; rs-001 seeded with the golden card. Reviewer
  mapping: every tamil-nadu fixture → tn_kanyakumari slot, every kerala fixture → kerala slot, other
  → null (enforced both directions by the validator).
- Files added: `tests/fixtures/corpus/rs-001…rs-050.json` (50), `tests/fixtures/messy_20/
  messy-001…messy-020.json` (20), `tests/fixtures/reviewers.json`, `scripts/corpus-check.js`
  (executable validator: exact count, id convention rs-NNN/messy-NNN, unique ids, required fields,
  enums, reviewer-slot resolution + region mapping, coverage minimums, golden-seed checks, messy-set
  separation), `tests/integration/corpus_validation.test.ts`.
- Files modified: `scripts/regression-gates.sh` (golden-test-present skip-detection regex tightened
  to word boundaries — the old `xit` pattern false-flagged `result.exit` in the new corpus test as a
  skipped test; gates PASS after the fix).
- Validation results (real executions): `node scripts/corpus-check.js` → OK (50 corpus + 20 messy,
  refs resolve, coverage complete); integration suite **25/25** (count, parse, structure, unique ids,
  reviewer refs, coverage, rs-001==golden seed, D-03 golden 8/8, plus negative proofs).
- Negative proofs (temp copies only; canonical corpus untouched): duplicate id FIRE, missing
  required field FIRE, invalid reviewer reference FIRE, removed kerala coverage FIRE, 49-count FIRE,
  51-count FIRE, malformed JSON FIRE, messy-merged-into-corpus FIRE. No mutations left behind.
- Deviation (recorded): the canonical D-04 done criterion frames the corpus as "the seeded start of
  50 … corpus completion is a P7 gate"; at the dispatcher's explicit direction this session produced
  the complete 50 + 20 now. Content is synthetic fixture data only — no fabricated reviewer
  identities, citations, or real-world claims.
- Regression: D-03 golden fixture + 8 invariants still green (corpus_validation.test re-runs them);
  auth E2E 18/18; unit suites green; lint clean; typecheck 0; regression gates PASS; contract OK;
  verify-local **exit 0 · ALL STEPS PASSED**.
- Audit result: A-04 not yet executed — PENDING.

### H-05 — D-05 nine-view JSON schemas / contract freeze

- BASE_SHA / COMMIT_SHA: **none recorded** — Git not available / not authorized.
- Date / agent session: 2026-09-08 · D-05 dispatch session.
- Status: **DONE** (implementation + functional tests + full verification below).
- Scope discipline: schemas/contracts ONLY — no analysis engine, no OCR/intake, no worker
  business logic, no new UI. All nine view payloads are frozen contracts; future units
  produce the behavior.
- Implementation summary:
  - `packages/schemas` — canonical contract set, Zod (runtime-validated), every schema
    `.strict()`. `SCHEMA_VERSION = 1.0.0`, frozen at P0-5 (D-05), 2026-09-08.
  - Nine view payloads `src/views/view-1..9.ts` keyed as `VIEW_SCHEMAS` (`view_1..view_9`),
    exactly matching the analyse response (`views: { view_1 .. view_9 }`).
  - Identification (`identification.ts`) per API §4 POST /recipes/:recipeId/identify 200:
    family, architecture, confidence high|medium|low, not_this[], absent_on_card[],
    tags{family: INFERRED}.
  - Claims/tags (`shared.ts`): the six canonical tags CARD|METHOD|INFERRED|ABSENT|UNKNOWN|
    ASSUMED (single source of truth) + `ClaimSchema` (claim_text, claim_tag, source_reference,
    allergen_id nullable) per ERD §analysis_claim.
  - Station card (`station-card.ts`) per API §5 GET /analysis/:analysisId/station-card 200:
    station_card_id, analysis_id, mise, sequence, do_nots, control_points,
    product_yield_hold nullable, printable.
  - Shared inputs: `StructuredRecipeInputSchema` (Analysis Prompts §0), `DeterministicViewInputSchema`
    + `View9AssumptionsSchema` (Deterministic Views §1/§3), LabelPack US|EU.
  - Envelope (`envelope.ts`): POST /recipes/:recipeId/analyse 200 — analysis_id, mode home|chef,
    identification, views{view_1..view_9}, claim_tags (record of the six tags → non-negative
    int counts), station_card nullable, is_latest, model_version, prompt_version.
  - Freeze record: `packages/schemas/SCHEMA_FREEZE.md` (version, single active contract,
    versioning convention, documented canonical readings — sodium literal "unknown", claim_tags
    count-map reading, per-view tag subsets, open element types in station-card arrays).
- Files added:
  - `packages/schemas/src/{version,shared,identification,station-card,envelope,fixtures,
    test-helpers}.ts`
  - `packages/schemas/src/views/{index,view-1..view-9}.ts`
  - `packages/schemas/src/{index.test.ts (rewritten), contracts.test.ts,
    fixtures-relationship.test.ts}`
  - `packages/schemas/SCHEMA_FREEZE.md`
- Files modified:
  - `packages/schemas/package.json` — description now frozen-state; `zod ^3.23.8` dependency
  - `scripts/regression-gates.sh` — provenance gate: match quoted value literals only (type
    references like `ClaimTagSchema` no longer match) and exclude `*.test.ts`/`*.spec.ts`
    (negative fixtures intentionally carry non-canonical tags). Fire-proof for planted
    `claim_tag: 'BOGUS'` still verified by tests/integration/qg2_gates.test.ts.
- Tests executed (functional, per dispatch §10–§15):
  - `packages/schemas` unit: **112/112** — every contract has valid-payload acceptance plus
    mutations proving rejection: missing required, wrong types, invalid enums, invalid nested
    structures, nullability behavior, strict unexpected-key rejection; boundary tests
    (View 5 `needs_review=false` rejected; View 9 point-value band rejected; almost-correct
    envelope rejected).
  - Cross-contract consistency proofs: envelope uses the SAME schema instances as VIEW_SCHEMAS;
    identification + View 5 share ONE ConfidenceSchema instance; claim_tags keyed by the same
    canonical tag enum.
  - Fixture relationship: D-04 `rs-001.expected` deep-equals D-03 golden `expected`; golden
    View 9 band 1300–2200 + sodium "unknown" validate against the frozen schemas; golden family
    accepted by IdentificationSchema and not the generic classification; both fenugreek senses
    preserved as separate entries.
  - Coverage: schemas 100/100/100/100 statements/branches/functions/lines on all contract modules
    (index.ts 85% branches); well above the 90% floor.
- E2E: 18/18 (auth/entry unaffected; regression suite re-run).
- Regression results: integration **34/34**; regression gates **PASS**; lint clean; typecheck 0;
  contract-check OK (openapi.json regenerated, no drift); `verify-local.sh` **exit 0 · ALL STEPS
  PASSED**.
- Deviations: none vs. the dispatch. Documented canonical readings (not deviations) recorded in
  SCHEMA_FREEZE.md for the three spec-unspecified spots (sodium literal, claim_tags shape,
  station-card element types).
- Known limitations: V8's no-"safe" wording and V9's band-not-point invariants are semantic
  assertions enforced by golden-check/regression gates, not the JSON schema (word choice cannot
  be schema-enforced). Schemas are not yet consumed by any app code (consumers arrive with the
  analysis units).
- Traceability: P0-5 · BUILD_PLAN §7.4/7.8 · DISPATCH D-05 · SCAFFOLD §1 · TEST_PLAN QG5 ·
  Analysis Prompts v2 · Deterministic Views v2 · API doc §4–§5 · ERD §analysis_claim/
  analysis_station_card · Stories C1, C4, H6, I2, I4, I7.
- Audit result: A-05 not yet executed — PENDING.

### H-06 — D-06 IdP setup (Keycloak)

- BASE_SHA / COMMIT_SHA: **none recorded** — Git not available / not authorized (mentor repo is an
  uncommitted zip export; reconciliation and all follow-on work proceed without commits).
- Date / agent session: 2026-09-07 · EOD signup/signin session.
- Summary: Keycloak 24.0.5 stands as the sole active identity provider. Realm `recipesystems`
  (export at `infra/keycloak/recipe-systems-realm.json`) is imported by the compose `identity`
  profile; confidential BFF client `recipe-systems-bff` (authorization-code, registration,
  post-logout). The OIDC boundary is abstract behind `IdentityProvider`
  (`apps/api/src/modules/auth/identity/identity-provider.interface.ts`); `keycloak.provider.ts` is
  the ONLY file that knows Keycloak endpoints. No alternate IdP exists anywhere (Auth0/ROPC/admin-REST
  removed with the mentor ROPC implementation).
- Files changed: `infra/keycloak/recipe-systems-realm.json`, `infra/docker/docker-compose.yml`
  (identity profile + mount-path fixes), `apps/api/src/modules/auth/identity/{identity-provider.interface,
  identity.module,keycloak.provider,keycloak.provider.test}.ts`, `apps/api/.env` wiring via compose
  env (values in `.env.example`).
- Done criteria evidence:
  - **`docker compose --profile identity up -d` brings up Keycloak with the realm imported** —
    verified live: container healthy, `GET /realms/recipesystems/.well-known/openid-configuration` → 200;
    E2E signup/signin drive the real realm end-to-end (15/15 Playwright suite).
  - **A test user can authenticate; the OIDC boundary issues the claims the adapter consumes** —
    seeded user `chef@recipesystems.test` signs in through the real authorization-code flow; the BFF
    verifies ID-token signature (JWKS), issuer, audience, nonce in `keycloak.provider.ts`
    (unit-tested with a local RS256 fixture, no network in tests).
  - **Adapter seam demonstrable** — app code imports only `IdentityProvider`; swapping the provider is
    a config change in `identity.module.ts` (seam documented in the interface header).
  - **HANDOFF records the Keycloak decision reference** — Q8 RESOLVED 2026-09-07, SCAFFOLD §7
    (this entry + IMPROVEMENT_PLAN v1.2).
- Test results: `keycloak.provider.test.ts` → 8/8; full API suite → 57/57; E2E → 15/15.
- Deviations: none. OPEN DECISION register: Q8 (resolved); Q9/Q10/Q11 remain OPEN (unaffected).
- Audit result: A-06 not yet executed — PENDING.

### H-07 — D-07 OIDC cookies + account creation

- BASE_SHA / COMMIT_SHA: **none recorded** — Git not available / not authorized.
- Date / agent session: 2026-09-07 · EOD signup/signin session (+ entry-page follow-ups 2026-09-08).
- Summary: Complete A1 auth path. BFF-issued HS256 session JWT in `recipe_session` httpOnly cookie
  (Secure per SESSION_SECURE, SameSite=Lax, 15-min TTL, SESSION_COOKIE); CSRF double-submit token
  (`recipe_csrf` cookie + `X-CSRF-Token` header, constant-time compare) on all state-changing routes;
  account created/updated on first sign-in via `upsertForSignIn` (auth_provider `sso`,
  `password_hash` NULL — Keycloak owns credentials; preferred_mode defaults home; idempotent on
  duplicate email — proven live); signup via IdP-hosted registration endpoint with state/nonce cookie;
  logout is RP-initiated (BFF session cleared + Keycloak SSO session killed via `id_token_hint` from
  the session JWT — re-login prompts again, regression-tested). Public entry page (editorial landing,
  Analyze-as-guest / Sign in / Create account hierarchy) implemented with the design-system tokens.
- Files changed (auth): `apps/api/src/modules/auth/{auth.controller,auth.service,session,*.test}.ts`,
  `apps/api/src/modules/account/{account.service,account.service.test}.ts`,
  `apps/api/src/common/guards/{jwt-auth,csrf,guest-or-jwt,guards.test}.ts`,
  `apps/api/src/common/filters/http-exception.filter.ts`. Frontend: `apps/web/app/page.tsx`,
  `apps/web/components/home/LandingPage.tsx`, `apps/web/components/ui/Typography.tsx` (Eyebrow id prop).
  Docs: `docs/Recipe_Systems_API.md` (auth endpoints incl. logout `redirect_to`).
- Test results:
  - Unit (apps/api): **57/57 passed, 7/7 suites**; coverage 88.07% lines (QG1 floor 75%).
  - E2E Playwright (live Keycloak + Postgres): **15/15 passed** — signup 3 (success incl. DB row
    `password_hash IS NULL` probe, duplicate email rejected, invalid input rejected), signin 2
    (success + /auth/me 200, invalid credentials + no session), logout 2 (session cleared + 401,
    SSO session killed so sign-in prompts again), security 3 (401 unauthenticated, forged token 401,
    CSRF 403), entry 5 (hierarchy, sign-in→KC, signup→KC, guest session, auth_error state).
  - Gates: lint clean (--max-warnings=0), typecheck 0 errors, `next build` green, regression-gates
    PASS, contract-check OK, full `scripts/verify-local.sh` → **exit 0 · ALL STEPS PASSED**.
- Done criteria evidence:
  - **Register/sign-in works end-to-end** — deviation: A1 evidence is delivered via Playwright E2E
    (`tests/e2e/signup.spec.ts`, `signin.spec.ts`) + jest unit suites instead of the template's
    `story_a1_create_account.test.ts` integration filename (integration tier intentionally empty at
    this stage; verify-local runs it with `--passWithNoTests` per the A-02 fix).
  - **Cookies carry Secure/HttpOnly/SameSite; CSRF verified on state-changing routes** — cookie
    attributes asserted in `session.test.ts` + `auth.controller.test.ts`; E2E proves logout works
    with the token and 403s without it (`CSRF_MISMATCH`).
  - **Resume-save handoff (D-22 seam) documented** — `claimGuestSession` (D-08 spine) + code comments
    mark the seam; the save flow itself arrives with D-22. TC-02 end-to-end is PENDING the library.
- Known limitations: logout clears BFF + IdP session (no backchannel logout — not required by spec);
  dev-only `SESSION_SECURE=false` for non-browser HTTP clients (browsers accept Secure on localhost).
- Audit result: A-07 not yet executed — PENDING.

### H-08 — D-08 Guest sessions + claim transaction

- BASE_SHA / COMMIT_SHA: **none recorded** — Git not available / not authorized.
- Date / agent session: 2026-09-07 · EOD signup/signin session.
- Summary (IN PROGRESS — spine shipped, P2-dependent halves pending): guest session creation
  (`POST /auth/guest/session` — unguessable UUID, `recipe_guest_session` httpOnly cookie, TTL pilot
  default 86400s labeled per Q11), `guest-or-jwt` guard, and the idempotent claim transaction
  (`POST /auth/guest/claim`, JwtAuthGuard+CsrfGuard): guest row preserved as audit, recipes move
  guest→account inside one transaction respecting `chk_recipe_owner_xor` (updateMany), double-claim
  returns `already`, cross-account claim rejected. Web guest phase ("Create account & claim" /
  Dismiss) implemented.
- Files changed: `apps/api/src/modules/auth/auth.service.ts` (claimGuestSession + createGuestSession),
  `auth.controller.ts`, `apps/api/src/common/guards/guest-or-jwt.guard.ts`, `apps/web/app/page.tsx`,
  tests in `auth.service.test.ts` / `guards.test.ts` / `tests/e2e/entry.spec.ts`.
- Test results: unit 57/57; E2E 15/15 (guest-session flow covered by entry.spec).
- Done criteria evidence:
  - **Guest ingest → analysis pipeline path must exist** — PENDING: intake arrives at D-10; no
    ingest stub shipped (per dispatch, analysis side arrives P2/P3).
  - **Claim: sign-up mid-session → recipe moves; idempotent; XOR holds** — the transaction spine is
    implemented and unit-tested (move, audit preservation, idempotency, cross-account rejection);
    mid-session sign-up→claim E2E wiring is PENDING (web claim button redirects to signup; the
    post-signup claim handoff is documented but not end-to-end exercised).
  - **Expiry cleanup job** — PENDING: TTL default documented; no cleanup job shipped.
- Audit result: A-08 not yet executed — PENDING.

### H-09 — D-09 Ownership enforcement

- BASE_SHA / COMMIT_SHA: **none recorded** — Git not available / not authorized.
- Date / agent session: 2026-09-07 · EOD signup/signin session.
- Summary (P1 surface set complete; resource-surface probes arrive with later units): every P1
  mutating route carries its guard — grep audit 2026-09-08: `POST /auth/logout` (CsrfGuard),
  `PATCH /auth/me/preferences` (JwtAuthGuard+CsrfGuard), `POST /auth/guest/claim`
  (JwtAuthGuard+CsrfGuard), `POST /auth/guest/session` public by design (it CREATES the session);
  reads: `GET /auth/me` (JwtAuthGuard). `chk_recipe_owner_xor` enforced on every write path that
  exists today (claimGuestSession updateMany) and was battery-proven at D-02.
- Test results: `guards.test.ts` + security E2E (401 unauthenticated /auth/me, forged session 401,
  CSRF-less state-change 403); unit 57/57; E2E 15/15.
- Done criteria evidence:
  - **Cross-account / cross-guest access on every P1 surface → not-found/forbidden, no existence
    leaks** — proven for the shipped P1 surfaces (auth/me, logout, preferences, claim); recipe /
    analysis surfaces do not exist yet (D-10+) — their probes are PENDING.
  - **`chk_recipe_owner_xor` holds under every violation shape** — DB battery at D-02 (H-02);
    application write paths respect it (claimGuestSession tests).
  - **No unguarded mutating route** — grep-auditable (route list + guards above); A-09 may re-check.
- Audit result: A-09 not yet executed — PENDING.

## 5. Repository maintenance log (non-dispatch work)

Tasks outside the D-unit numbering are recorded here (no H-number invented). All evidence is real
execution output; Git: not available / not authorized throughout.

- 2026-09-10 — **AUTONOMOUS E2E QA D-01→D-19 (dispatcher directive, QA-only) — STARTING STATE**:
  **DISPATCH:** black-box/full-stack QA of everything implemented through D-19, via the VS Code
  internal browser for ALL user interaction; terminal/API/DB only to verify backend state
  afterward. NO new features (no D-20/D-21/Q1/Q5/Q9/Q10). Fix confirmed defects only, smallest
  correct layer + regression coverage, then full verification + CI.
  **ENVIRONMENT BASELINE (recorded before any interaction):** web :3000 200 OK · API :3001
  health `{"status":"ok","service":"api"}` · Keycloak :8081 realm `recipesystems` OK · Postgres
  :5433 healthy · MinIO :9000 healthy (container up) · pg-boss queue live (56 jobs/121 archived).
  Git HEAD `df1dda0902507732868a3cfe953e247716c49974`, working tree clean, origin/main in sync.
  Reference data counts intact: allergen_defs 17 · dictionary 12 · aliases 6 · mappings 6 ·
  comp_entries 12 · comp_versions 12.
  **ENV NOTE (not a product defect):** the analysis-worker process was DOWN at baseline (the
  `RS_WORKER_WINDOW` cmd window present earlier was gone; no ts-node worker process). Restarted
  it with the start-dev env (`DATABASE_URL`, `ANALYSIS_LLM_STUB=1`) — it now consumes BOTH
  queues (`analysis` + `view9-recompute`). Root cause of the death not established (window/process
  loss between sessions; the worker emits no crash log). Operational follow-up noted, no code change.

- 2026-09-10 — **QA FINDING QA-B1 (P1 MAJOR) — guest session churn: every dashboard entry mints a new `guest_session` row** (recorded before any fix):
  **REPRO (VS Code internal browser, dev stack):** landing → "Analyze a recipe" → paste Test A
  (7 lines, session `beec17bd`, recipe `2b2e885d`) → reload at `/` → "Checking your session" →
  landing → "Analyze a recipe" again → dashboard now says "Guest session `4ee62155`"; one more
  cycle → `894d5d3c`, `0d41cca4` (4 rows in ~4 min; psql confirms each row owns nothing but the
  first). Network capture: every entry fires `POST /api/v1/auth/guest/session` which ALWAYS
  creates a row + overwrites the httpOnly `recipe_guest_session` cookie (no reuse check).
  **IMPACT:** a returning guest's recipes become unopenable — opening the listed recipe fires
  `GET /recipes/:id/analysis` → 404 ×2 (strict-mode double effect) and the review section shows
  "No ingredient lines · 0 lines" although psql shows the 7 lines persist. A2's "one guest
  session" spine + 24h TTL are meaningless as shipped. No data loss in DB (rows persist).
  **ROOT CAUSE:** `AuthService.createGuestSession` mints unconditionally; the controller never
  inspects the existing cookie; the web `startGuest` POSTs on every entry (it cannot read the
  httpOnly cookie itself).
  **FIX (planned, smallest layer):** API reuses an existing valid/unclaimed/unexpired cookie
  session (fresh CSRF, identical wire shape); web stores parsed lines in the session store and
  re-renders them for guests on reopen + honest fallback copy; skip the Bearer-only analysis
  fetch for guests (API §3: guests never fetch Bearer routes). Regression tests for all three.
  **VERIFICATION:** after fix — re-run the guest revisit cycle; unit suites; verify-local; CI.
  **DISPOSITION:** FIXED — see commit recorded below (QA-B1-FIX entry).

- 2026-09-10 — **QA FINDING QA-B2 (P1 MAJOR) — "Create account and claim" never claims (AC-2 broken end-to-end)** (recorded before any fix):
  **REPRO (internal browser):** guest dashboard → "Create account and claim" → Keycloak
  registration (qauserb@example.test) → BFF callback → signed-in home. The just-pasted guest
  recipe ("1 lb ground beef", `2b2e885d`, guest session `beec17bd`) appears under **"Other
  sessions — cannot be opened here"**; "This session" is empty. psql: NO `guest_session` row is
  claimed (all `claimed_at` NULL, incl. the session active at signup `0d41cca4`); the recipe
  still has `guest_session_id=beec17bd`, `account_id=NULL`. The account row was created fine.
  **ROOT CAUSE:** `POST /auth/guest/claim` exists (JwtAuthGuard+CsrfGuard, unit-tested) but
  NOTHING invokes it — no web call site, and the BFF `GET /auth/callback` never claims. H-08
  already flags this as PENDING ("post-signup claim handoff not end-to-end exercised"); the UI
  copy ("claimed automatically") promises behavior that does not happen. Compounded by QA-B1:
  the claim cookie at signup time (`0d41cca4`) held no recipes anyway.
  **FIX (planned, smallest layer):** claim server-side in `GET /auth/callback` after a
  successful login when a valid `recipe_guest_session` cookie exists (non-fatal on already-
  claimed/expired; clear the guest cookie after claim). Covers signup AND sign-in; idempotent.
  **VERIFICATION:** full guest→signup→claim cycle in the browser + psql (recipe XOR move);
  unit tests; verify-local; CI.
  **DISPOSITION:** FIXED — see commit recorded below (QA-B2-FIX entry).

- 2026-09-10 — **QA FINDING QA-B3 (P2 MODERATE) — SSE event stream 403s on every connect (dead in the web app)** (recorded before any fix):
  **REPRO (internal browser):** signed-in as `qauserb`, analyse the golden recipe →
  network capture shows `GET /api/v1/analysis/d8ede1b9-…/events` → **403**; console logs
  "Failed to load resource: 403". The analysis still completes and the UI stays correct —
  the 2s poll (INV-16 reload-from-Postgres) is the durable source, so no wrong data.
  **ROOT CAUSE:** `useAnalysisStatus` opens `new EventSource(url)` WITHOUT
  `{ withCredentials: true }`; the web (:3000) and API (:3001) are cross-origin, so
  EventSource sends NO cookies → `GuestOrJwtGuard` finds no identity → 403. The BFF CORS
  (`origin`, `credentials:true`) and the fetch helper (`credentials:'include'`) are correct —
  only the EventSource call is missing the flag. D-17's shipped SSE integration is therefore
  non-functional in the browser (silent fallback to polling).
  **FIX (planned, smallest layer):** `new EventSource(url, { withCredentials: true })` in
  `useAnalysisStatus`; regression test asserting the EventSource is constructed with
  credentials.
  **VERIFICATION:** re-run analyse with network capture (expect 200 text/event-stream +
  snapshot event); unit suites; verify-local; CI.
  **DISPOSITION:** FIXED — see commit recorded below (QA-B3-FIX entry).

- 2026-09-10 — **QA FINDING QA-B4 (P2 MODERATE) — malformed (non-UUID) recipe ids → 500 INTERNAL_ERROR on the recipe-domain routes** (recorded before any fix):
  **REPRO (internal browser fetch as signed-in `qauserb`):** `GET /recipes/not-a-uuid/lines`
  → **500** `INTERNAL_ERROR`; `GET /recipes/not-a-uuid/method` → **500**. Contrast: the
  analysis routes have the format guard (`GET /analysis/not-a-uuid` → clean 404) and the
  canonical INV-17 semantics is "404 for missing AND foreign" — a malformed id must be a
  clean 404, never a Prisma P2023 → 500. Valid foreign ids behave correctly (404 everywhere:
  lines/method/analysis/views/analyse/assumptions all verified 404; own lines 200).
  **ROOT CAUSE:** `RecipeService.assertOwned` passes the raw id to `prisma.recipe.findUnique`
  without a UUID format check (analysis routes format-guard BEFORE Prisma). All recipe +
  intake read/write routes funnel through `assertOwned`, so one guard fixes the whole domain.
  **FIX (planned, smallest layer):** UUID format guard at the top of `RecipeService.assertOwned`
  → `NotFoundException(RECIPE_NOT_FOUND)` for non-UUID ids; unit test for the guard.
  **VERIFICATION:** re-run the malformed-id battery (expect 404 everywhere); unit suites;
  verify-local; CI.
  **DISPOSITION:** FIXED — see commit recorded below (QA-B4-FIX entry).

- 2026-09-10 — **QA FINDING QA-B6 (P1 MAJOR) — `needs_review` missing from the wire line shape: the D-14 blocker can never be resolved in the UI** (recorded before any fix):
  **REPRO (internal browser + psql):** flagged line 2 of the QA recipe
  (`recipe_ingredient_line.needs_review = true` directly in Postgres — the OCR path that sets
  it is Q10-deferred, so this is the canonical fixture method) → workspace shows "Review
  required · 1 line need your attention" and Analyse is disabled with "Blocked by the lines
  above." — CORRECT. But the flagged line shows NO "Review required" badge and NO "Clear
  review" action in the review list, so the user can never confirm and unblock. The blocked
  recipe is permanently un-analysable from the UI.
  **ROOT CAUSE:** wire-contract mismatch — the API `WireLine` interface + `toWireLine` omit
  `needs_review`, while the web `WireLine` type includes it and `IngredientReview` renders the
  badge + "Clear review" (PATCH `{needs_review:false}`, D-14C) off it. The UI code and unit
  tests exist and pass against mocked lines WITH the field, but the live API never sends it →
  the surface is dead in the browser. IntakeService.updateLine already implements the only
  canonical clearing path — the wire shape just starves it.
  **FIX (planned, smallest layer):** add `needs_review: line.needsReview` to `toWireLine` and
  the `WireLine` interface; API unit test asserting the field in the wire shape; web
  integration coverage (existing `clear review` tests already cover the button).
  **VERIFICATION:** re-flag a line in the browser (badge + Clear review visible) → click Clear
  review → blocker clears → Analyse enabled; unit suites; verify-local; CI.
  **DISPOSITION:** FIXED — see commit recorded below (QA-B6-FIX entry).

- 2026-09-10 — **QA FINDING QA-B5 (P3 MINOR, no code change) — readiness copy says "Ready to
  analyse" while the enqueue 422s until a method (or explicit none) is saved**:
  Evidence: no-method recipe → `enqueue-state` = `{can_enqueue:true, blockers:[]}` → Analyse
  button enabled → POST 422 `METHOD_REQUIRED` → UI alert "Analysis did not start — Add a
  method first." The failure surface is visible and correct (matches the A-19 A7 canonical
  422), so this is copy/polish, not a defect against canonical behavior. Noted for a future
  D-14 polish pass (a METHOD hint in the readiness surface). No code change in this QA run.

- 2026-09-10 — **QA FINDING QA-B7 (P2 MODERATE) — readiness panel never re-fetches: stale
  blockers after review changes** (recorded before any fix):
  **REPRO (internal browser + psql):** recipe with line 2 flagged → readiness shows "Review
  required · 1 line" + disabled Analyse. Clear the flag in the DB (the future Clear-review
  path), then change the method state in the UI — the panel STILL shows "Review required" and
  Analyse stays disabled (only a full page reload re-syncs it). `ReadinessPanel` fetches
  `enqueue-state` only on `[recipeId, signedIn]` — no re-fetch when lines or method change.
  Combined with QA-B6, the canonical Clear-review→Analyse flow cannot complete without a reload.
  **ROOT CAUSE:** missing refresh wiring — `IngredientReview` already re-fetches lines after
  every mutation and reports them upward (`onLinesLoaded`), but `ReadinessPanel` never receives
  them.
  **FIX (planned, smallest layer):** pass `lines` into `ReadinessPanel` and re-fetch
  `enqueue-state` when the lines array identity changes (still the canonical endpoint — no
  client-side readiness calculation). RecipeWorkspace already holds the lines state.
  **VERIFICATION:** flag→clear cycle in the browser WITHOUT reload (badge clears → blocker row
  disappears → Analyse enables); unit suites; verify-local; CI.
  **DISPOSITION:** FIXED — see commit recorded below (QA-B7-FIX entry).

- 2026-09-10 — **QA FIX SET 1 — QA-B1/B2/B3/B4/B6/B7 CORRECTED (smallest-layer fixes, dispatched QA policy)**:
  **Changes (all trace-recorded above):**
  - API `POST /auth/guest/session` REUSES a valid unclaimed unexpired cookie session
    (QA-B1); the callback now claims the pending guest session server-side after ANY
    successful login and redirects with `?claimed=1` when a claim succeeded (QA-B2).
  - Web stores the parse-response lines for guest-created records, re-renders them on
    read-only reopen, shows honest copy when unavailable, and skips the Bearer-only
    analysis fetch for guests (QA-B1); re-tags guest records to the account on the
    `claimed=1` marker so claimed recipes land under "This session" (QA-B2).
  - `useAnalysisStatus` opens the EventSource with `{ withCredentials: true }` (QA-B3).
  - `RecipeService.assertOwned` format-guards non-UUID ids → clean 404 (QA-B4).
  - `toWireLine`/`WireLine` now carry `needs_review` (QA-B6); `ReadinessPanel` re-fetches
    `enqueue-state` when the lines change (QA-B7).
  **Regression tests added:** API auth.service reuse matrix (+3), auth.controller reuse +
  claim-marker + non-fatal-claim (+3), recipe.service malformed-id guard (+1), intake
  wire needs_review (+1) → API **178/178** (was 171). Web flow store-lines + claim re-tag
  (+2), ReadinessPanel re-fetch (+1), SSE credentials (+1), HomeView signature → web
  **85/85** (was 82). Worker 32/32 unchanged. lint 0 · typecheck 0.
  **Live browser re-verification (post-fix, internal browser):** guest session id STABLE
  across reload/re-entry (`f6ee2744` both times); guest reopen renders the stored lines
  ("Okra — 200g / Onion — 1 / Turmeric — 1/2 tsp", 3 lines); signup+claim for `qauserc`
  moved all 10 session recipes (psql: `still_guest=0`, session `claimed=t`) and the
  `claimed=1` re-tag put them under "This session" (qauserb's account recipes correctly
  stayed under "Other sessions"); SSE `/events` now **200** (was 403); malformed-UUID
  battery 404 everywhere (was 500); flagged line renders the Review-required badge +
  Clear review → click unblocks readiness WITHOUT a reload (Analyse re-enabled). Golden
  regression journey (qauserc, golden card): paste → review → method → analyse →
  Views 1–9 (V8 flags Fish/Coconut/Fenugreek + print line + H6, no "safe"; V9 band
  716–1,018 kcal + Sodium Unknown + I6) → View 9 recompute (oily persisted, band honest)
  → reload → reopen → logout → login → reopen (method + analysis + views persist).
  **Git:** single fix commit recorded below (QA-FIX-SET-1).

- 2026-09-10 — **QA FIX SET 1 — RESULT (evidence after the fix commit)**:
  Fix commit `f02e37a` (full `f02e37a044ad18bb8c7bf6a1d0c88d501c496821`) — pushed, tree clean.
  Full QA report: `docs/QA_E2E_D01_D19_REPORT.md` (verdict, area table, defect registry).
  CI: **success** — run `34476238511` (head `f02e37a`, the QA fix commit).
  Dev stack restarted healthy via start-dev.cmd
  (API :3001 · worker consuming both queues · web :3000 · containers up) after verification.
  Reference data re-verified intact 17/12/6/6/12/12. Q1/Q5/Q9/Q10/Q11 OPEN.

- 2026-09-10 — **D-20 PREFLIGHT (dispatcher authorization: D-21 GO → implement D-20 only) — STARTING STATE, recorded before any D-20 code**:
  **DECISION (dispatcher 2026-09-10):** D-20 = P4-2 chef mode + station card (C3/C5, §7/§8).
  **CANONICAL SOURCES READ:** DISPATCH D-20/A-20 · Recipe_Systems.md §7 (chef voice/output order/
  required blanks/refusal) + §8 (golden station card) · ERD §6 `analysis_station_card` (mise/
  sequence/do_nots/control_points JSONB, product_yield_hold nullable, printable default true) ·
  Epic-C C3 (default home; chef leads with the card; preference saved on account — toggle
  semantics OPEN per ERD §15.4, label not decide) + C5 (card when method exists or inferred
  accepted; mise/sequence/do-nots/control points; printable) · BUILD_PLAN P4-2 · SCAFFOLD §7
  ("one app, not two": modes over one analysis) · TEST_PLAN e2e tier · D-05 StationCardSchema
  (frozen) + envelope `station_card` nullable.
  **ALREADY IMPLEMENTED (verified, reused):** Prisma `AnalysisStationCard` model + migrated table
  (0 rows today — D-20 populates) · frozen StationCardSchema + envelope field · `account.
  preferred_mode` (CHECK home/chef) + `PATCH /auth/me/preferences` (zod enum) · `analysis.mode`
  (always 'home' from the web today) · worker one-writer handler + idempotent upserts ·
  Q1-labeled capture (method steps + ingredients) rides the job payload · Views 1–9 complete.
  **D-20 DESIGN DECISIONS (labeled, recorded here BEFORE code):**
  - D-20A: the station card is assembled DETERMINISTICALLY by the worker (the sole
    analysis_* writer) from the Q1-labeled capture + the persisted View 3/8 rows — NEVER free
    LLM prose (INV-10; A-20 BLOCKER class). No new snapshot persistence invented (Q1 OPEN).
  - D-20B: card precondition = method steps exist in the capture (METHOD or accepted INFERRED)
    AND persisted View 3 is COMPLETE. Otherwise NO card (refusal path; list-only analyses are
    already 422-refused at enqueue, so this also covers method-cleared-after-analysis).
  - D-20C: field sources (derivable, nothing invented): `mise` = capture ingredients verbatim
    (record keyed by ingredient id: display_name + amount_text + CARD) · `sequence` = View 3
    stages verbatim (action/cue/duration/tag) · `control_points` = one per View 3 stage
    (stage_name + cue verbatim) · `do_nots` = captured `explicitly_absent` mapped to ABSENT
    items ("confirmed absent — do not add"); EMPTY in the stub world (Q9 OPEN — inventing
    family-specific do-nots would violate no-invention; the field exists and populates
    truthfully) · `product_yield_hold` = null (unknowns stay blank per §7 required blanks) ·
    `printable` = true.
  - D-20D: API `GET /analysis/:analysisId/station-card` (GuestOrJwtGuard; UUID guard; INV-17 404
    for missing AND foreign; valid analysis WITHOUT a card → 404 `STATION_CARD_NOT_FOUND`);
    `station_card` (nullable, frozen shape) included in the GET /analysis/:id and
    /recipes/:id/analysis assemblies.
  - D-20E: web chef mode = a Home↔Chef toggle on the analysis workspace. Default home (C3 AC-1);
    chef leads with the station card then the compressed nine views with the §7 chef-voice
    headers (table column mapping only — payload CONTENT transformation awaits the real LLM,
    Q9 OPEN; the same nine frozen views render, never invented chef copy beyond the §7
    headers). Preference persisted via the existing `PATCH /auth/me/preferences`
    (signed-in only); guests get a session-local toggle (C3 is account-scoped — labeled).
  - D-20F: chef output order per §7: identification+confidence → station card → control points
    → product/yield/hold (unknowns blank) → compressed nine views → "Untasted briefing. Season
    after." line.
  **PLAN:** worker producer + handler hook → API route + assembly → web toggle + card component
  + chef headers → unit/integration/e2e coverage → gates/lint/typecheck → verify-local → commit
  → CI → H-20 + GO/NO-GO-style close. STOP (no D-22).

- 2026-09-10 — **D-20 EXECUTION (implementation + verification; dispatcher authorization above) — recorded at close-out**:
  **IMPLEMENTED per D-20A..F (decision trace above, honored verbatim):**
  - worker: `apps/analysis-worker/src/station-card.ts` — deterministic `buildStationCard(captured,
    view3)` (mise = capture ingredients verbatim keyed by line id; sequence = View 3 stages
    verbatim; control_points = one per stage; do_nots = capture `explicitly_absent` → ABSENT
    notes; product_yield_hold null; printable true). Precondition (method steps AND View 3
    COMPLETE) else null — the refusal path. Handler calls `upsertStationCard` after the View 8/9
    writes and before finalize; idempotent upsert on the unique `analysis_id`.
  - API: `GET /api/v1/analysis/:analysisId/station-card` (GuestOrJwtGuard; UUID guard; INV-17
    404 missing AND foreign; no-card → 404 `STATION_CARD_NOT_FOUND`) + `station_card` (nullable,
    frozen D-05 wire) in the GET /analysis/:id and /recipes/:id/analysis assemblies. API writes
    nothing (one-writer preserved).
  - web: Home↔Chef `ModeToggle` (radiogroup "Presentation mode") on the workspace; chef leads
    with the persisted `StationCard` (or the honest `NoStationCard`) then the nine views with the
    §7 chef-voice tab headers (label mapping only); closing line "Untasted briefing. Season
    after."; `preferredMode` prop from `/auth/me`; toggle persists via existing
    `PATCH /auth/me/preferences` (signed-in) / session-local for guests.
  **EVIDENCE (this session):**
  - unit: worker 44/44 · API 183/183 · web 93/93 (D-20 additions: worker station-card suite 8,
    handler +2, API station-card route suite 4 + assembly 1, web StationCard suite 4 + chef-mode
    tabs 3) · integration 97/97 incl. NEW `tests/integration/story_d20_station_card.test.ts`
    (3/3 on real Postgres: card row persisted with verbatim capture/View 3 content on a
    chef-mode run; 404 STATION_CARD_NOT_FOUND for INCOMPLETE-view3 AND no-method branches;
    foreign 404 ANALYSIS_NOT_FOUND; assemblies carry the card).
  - gates: QG2 regression gates PASS (8/8 golden invariants) · contract-check OK (openapi
    regenerated, zero drift) · lint 0 · typecheck 0 · verify-local ALL STEPS PASSED (exit 0).
  - LIVE stack (internal browser, real Keycloak chef account): paste golden card → method →
    analyse → complete → Chef toggle rendered the persisted card (Mise 11 lines CARD, Sequence,
    Control points, "Untasted briefing. Season after.") and all nine §7 chef-voice tab labels →
    Home toggle restored the home labels (no Views 1–9 regression) → Chef persisted
    (`PATCH /auth/me/preferences` 200) → reload + reopen restored chef mode with the card
    (C3 TC-03) → guest session: toggle present, chef caption switches, NO fabricated card
    (guest analysis copy intact) → live API: foreign/malformed station-card requests → 404
    ANALYSIS_NOT_FOUND (INV-17). `analysis_station_card` populated on the live DB (was 0 rows).
  - e2e: NEW `tests/e2e/chef-mode.spec.ts` (signed-in journey + C3 TC-03 persistence + guest
    refusal surface) — Playwright launches remain machine-policy blocked here (H-13); the live
    internal-browser run above is the executed verification of the same assertions.
  **DECISIONS CARRIED:** Q1 OPEN (card derives from the job-payload capture — no snapshot
  persistence invented) · Q9 OPEN (stub LLM content; chef payload transformation awaits the
  real provider — headers only) · do_nots empty in the stub world (truthful, never invented) ·
  analysis `mode` remains 'home' for web enqueues (the toggle is presentation-only per ERD
  §15.4 — labeled, no second analysis system).
  **COMMIT/CI:** see the H-20 ledger entry (SHA + CI run id recorded after the push).

- 2026-09-10 — **D-21 PREFLIGHT (dispatcher authorization: preflight → implement D-21 only; report GO/NO-GO for D-20) — STARTING STATE, recorded before any D-21 code**:
  **DECISION (dispatcher 2026-09-10):** D-21 = P4-3 disclaimer sweep (H6/I6 unconditional,
  INV-13 "safe" forbidden, INV-14 no point-kcal — DISPATCH D-21, A-21 attack vectors).
  **CANONICAL SOURCES READ:** DISPATCH §D-21/A-21 · Recipe_Systems.md §12 H6/I6 (+§3.7) ·
  Epic-H H6 / Epic-I I6 (exact texts below) · BUILD_PLAN P4-3 · TEST_PLAN · regression-gates.sh ·
  golden-check.js · schemas view-8/view-9 · worker deterministic-views + web AnalysisViews ·
  qg2_gates.test.ts fire-proof pattern.
  **CANONICAL TEXTS (authoritative, dispatch-quoted):** H6 = "Reads the card only. Does not test
  food. Does not know your kitchen. Not medical advice." · I6 = "Table estimate from stated
  assumptions. Not a lab analysis. Not medical advice." (both verified identical in the user
  stories + current producer constants).
  **ALREADY SATISFIED by D-19/A-19 (verified, no change):** H6_DISCLAIMER/I6_DISCLAIMER exported
  verbatim from `apps/analysis-worker/src/deterministic-views.ts` and emitted on every View 8/9
  payload; frozen D-05 schemas REQUIRE `disclaimer` (view-8) and `band.energy_kcal_min/max`
  (a single `energy_kcal` point is schema-rejected — contracts.test.ts); web AnalysisViews
  renders `{payload.disclaimer}` on both tabs (never hardcoded paraphrase); worker unit + handler
  tests assert the exact texts + no-"safe" + band strictness; golden-check.js runs the 8
  CI-blocking executable invariants incl. `view8_no_safe` and `view9_band`.
  **EXACT GAPS (this unit's work):**
  - G-1: regression-gates §5 only meta-checks the YAML markers — a planted "safe" on the View 8
    output surface (producer/web render) fires NOTHING today. Add a real static INV-13 gate:
    word-bounded case-insensitive "safe" grep over the View 8 surface sources (producer + web
    render path), test files excluded, + fire-proof (A-21: plant one, prove it fires).
  - G-2: no static INV-14 hook. Add a structural band-pair gate: the producer AND the web
    renderer must reference both `energy_kcal_min`/`energy_kcal_max` (a point-kcal refactor that
    drops the pair fires) + fire-proof. Runtime side already covered (schema rejection +
    band-strictness assertions) — add explicit "teeth" tests proving the runtime checks reject
    planted point payloads.
  - G-3: no verbatim-text gate. Add a static gate: the two canonical texts must appear verbatim
    in the producer constants, and the web render path must use `payload.disclaimer` for BOTH
    View 8 and View 9 (a paraphrase anywhere breaks CI) + fire-proof.
  - G-4: no e2e assertion for the disclaimers. Add `tests/e2e/view-disclaimers.spec.ts` (golden
    paste → method → analyse → complete → View 8 tab shows H6 verbatim + no "safe" on the page;
    View 9 tab shows I6 verbatim + the band dash). VM note: Playwright browser launch is
    machine-policy-blocked locally (exit 1260, H-13 note) — run attempt recorded honestly; the
    same assertions are additionally re-verified live through the VS Code internal browser.
  - G-5: qg2 fire-proofs for all three new static gates (scratch-tree plants, GATES_SCAN_ROOT
    pattern) + "teeth" unit tests for the INV-13/INV-14 runtime assertions (planted payloads are
    exactly the class the real assertions reject).
  **NON-GOALS (D-21):** new views · profile logic (D-26) · print (D-23) · chef mode/station card
  (D-20) · Q1/Q5/Q9/Q10 untouched. Print surfaces have no renderer yet — "every surface" today =
  the two web tabs + the persisted payload (recorded honestly; D-23 will re-sweep prints per
  A-23).
  **PLAN:** implement G-1..G-5 → run gates/unit/integration/lint/typecheck → verify-local →
  commit → CI → live e2e-style browser check → HANDOFF H-21 + GO/NO-GO report for D-20. STOP.

- 2026-09-10 — **D-21 EXECUTION (P4-3 disclaimer sweep) — DONE, evidence recorded before commit**:
  **SHIPPED (files):** `scripts/regression-gates.sh` §5 now carries FIVE real static hooks:
  (a) INV-13 producer: word-bounded "safe" grep over the View 8 producer surface — fires on any
  occurrence; (b) INV-13 render: same over the web render surface; (c) H6/I6 verbatim: the two
  canonical texts must appear exactly in the producer constants; (d) INV-14 producer: both
  `energy_kcal_min`/`energy_kcal_max` must exist in the producer (a point-kcal refactor fires);
  (e) render-path: web must render `{payload.disclaimer}` for BOTH views + both band bounds
  (a hardcoded/paraphrased copy fires). The existing golden-YAML marker check is preserved.
  `tests/integration/qg2_gates.test.ts` +4 fire-proofs (planted "safe" producer → fires; planted
  "safe" renderer → fires; paraphrased H6 → fires; point-kcal producer → fires) — **17/17**.
  `apps/analysis-worker/src/deterministic-views.test.ts` +2 "teeth" tests (planted "safe" payload
  + planted point-band are exactly the class the existing runtime assertions reject; the frozen
  D-05 View 9 schema has NO single `energy_kcal` field) — worker **34/34**.
  `tests/e2e/view-disclaimers.spec.ts` (new): real-stack journey — sign in → golden paste →
  method → analyse → complete → View 8 tab: H6 verbatim + no `\bsafe\b`; View 9 tab: I6 verbatim
  + Sodium Unknown + band dash. **PASSES 1/1 (7s)** on the live stack with a real browser.
  **E2E DRIFT REPAIRS (pre-existing spec failures exposed by the run — test-only, recorded
  honestly):** `tests/e2e/helpers/auth.ts` still asserted a removed "Signed in" heading → now
  asserts the real authenticated state (banner Sign out, `.first()` for strict mode);
  `signin.spec.ts`/`logout.spec.ts` used the stale seeded password `password` → the reconciled
  realm password `Password@123`; `signup.spec.ts`/`logout.spec.ts` Sign out clicks → `.first()`.
  Full e2e suite now **38/38** (was 34 passed + 4 stale failures; 1 new D-21 spec).
  **ENV NOTE (recurring, operational):** the start-dev worker window died mid-session (THIRD
  occurrence in this day's sessions — also during the QA run and during the D-21 e2e run) —
  an internal-browser analyse enqueued while it was down surfaced "Analysis not found" until
  the worker was restarted (pg-boss kept the job; it completed on restart). Pattern: worker
  windows launched from a VS Code terminal die when that terminal session is cleaned up; a
  worker started in a persistent agent terminal survives. Not product code; recommend a
  start-dev watchdog in a later ops pass.
  **VERIFICATION:** gates PASS (all five new hooks green on the real tree) · worker 34/34 ·
  API 178/178 · web 86/86 · integration **94/94** (12 suites + qg2 17) · lint 0 · typecheck 0 ·
  verify-local ALL STEPS PASSED exit 0 · e2e 38/38. Reference data intact 17/12/6/6/12/12.
  **GIT:** D-21 commit `ded60d6` (full `ded60d647d8add6e21961c0f8f3589e46b19cbd1`) — pushed,
  tree clean. CI: **success** — run `34480999679` (head `ded60d6`, the D-21 checkpoint).
  **LIVE INTERNAL-BROWSER RE-VERIFICATION (post-restart, dev stack):** fresh recipe as the
  seeded chef → analyse → complete → View 8 shows H6 verbatim with NO "safe" on the surface;
  View 9 shows I6 verbatim + the band dash — identical outcomes to the passing e2e spec.
  **D-20 GO/NO-GO:** see the H-21 entry.
  **DECISION (dispatcher/user 2026-09-09):** OCR work is paused for the day. Q10 stays OPEN
  (prior STOP history preserved above, verbatim). D-11 (OCR adapter + provider), GCV production
  integration, real-card benchmarking, and photo-OCR processing are all DEFERRED — not started.
  **WHY TEXT/PASTE WORK PROCEEDS INDEPENDENTLY:** canonical evidence — B3's review loop operates
  on `recipe_ingredient_line` draft rows regardless of source channel; D-10 already creates draft
  lines for paste input (`source_tag: CARD`, `needs_review: false`, verbatim `display_name`);
  Recipe_Systems §12's parse-review operations (edit/add/delete/split/merge, mark headers, sense
  confirmation) do not require an OCR stage for text-originated lines — pasted text has no OCR
  stage (B1). No OCR fields are fabricated for text input; `needs_review`/`ocr_confidence` stay
  untouched (false/null) on text lines.
  **UNITS WORKED TODAY:** D-12 (P2-3 Parse review) — TEXT/PASTE SCOPE ONLY. The photo-path done
  criteria (golden PHOTO split test, OCR-flagged-line review) remain deferred until D-11 lands;
  H-12 will be recorded as IN PROGRESS, never DONE, until those halves exist.
  **UNITS DELIBERATELY UNTOUCHED:** D-11 (deferred), D-13 (method attach — separate unit,
  depends on D-12), D-14 (needs_review enqueue gate — depends on D-11, explicitly NOT allowed
  today per its canonical dependency), D-29 dictionary (Q5 open). Q3/Q5/Q9/Q1/Q2 untouched.
  **D-12 design decisions (recorded, grounded in canonical docs):**
  - **D-12A auth:** API doc §3 labels all review routes `Auth: Bearer` → JwtAuthGuard (account
    session cookie) exactly as the doc labels parse-text/upload "Bearer or guest" → GuestOrJwtGuard.
    Guests keep their corrections client-side on the ephemeral draft (same precedent as the
    method-endpoint note in API §4) until P3's analyse consumes the corrected object. No silent
    deviation from the doc's auth labels.
  - **D-12B wire shape:** line objects gain `id` and `updated_at` (addressing + stale-edit token;
    D-05 structured_recipe.id = line_id confirms ids belong on the wire). Mapping: wire `amount` →
    `amount_text`, wire `quantity` → `amount` (Decimal→number), wire `category` → `group_name`,
    `canonical_name` stays null until D-29, `is_header` stays false (see D-12C).
  - **D-12C headers (B3 AC-2):** ERD v13 has NO header column and Recipe_Systems §12 says the
    corrected object has "No headers". Canonical exclusion mechanism = soft-delete. `is_header:
    true` on PATCH soft-deletes the line (excluded from the corrected object; raw preserved in
    `recipe_input`). No schema change (adding a column would require ERD v14 — out of scope).
  - **D-12D stale edits (QG4 cell, ERD §13):** no `version` column exists → optimistic lock on
    `updated_at`. PATCH/split require `expected_updated_at` (ISO, the value the client read);
    mismatch → 409 `STALE_EDIT` with the current line for reload/merge. DELETE/add carry no token
    (documented: delete is idempotent-ish; add creates a new row).
  - **D-12E split contract:** API doc gives no body → `{ split_point: number }` — 1-based count of
    chars in the first half; halves are trimmed substrings of the original text (deterministic,
    preserves raw identity). Both halves non-empty. Original soft-deleted; two new lines with NEW
    shopping_keys (C-39) at the original position; downstream active line_nos shifted +1.
  - **D-12F merge contract:** PATCH `{ merge_with_next: true }` merges with the NEXT active line;
    `display_name` = line1 + ' ' + line2 verbatim; new shopping_key (C-39); `needs_review` = OR of
    both (conservative — never silently clears a review flag); `ocr_confidence` = null (merged line
    is a fresh draft; no fabricated confidence); downstream active line_nos shifted −1.
  - **D-12G parse-preview status:** no recipe review-status column exists; the canonical review
    flag is `needs_review` (INV-05 — D-14's guard reads "the canonical flag only"). status =
    `draft` when any active line has needs_review=true, else `confirmed`. Text drafts (no flagged
    lines) → `confirmed`. No new status column invented.
  - **D-12H sense confirmation:** PATCH stores `confirmed_sense` as user text (API doc body).
    Dictionary resolution (`ingredient_id`/`canonical_name`) reads the dictionary D-29 curates
    (Q5 working assumption) — the dictionary is empty in dev until D-29, so no resolution occurs
    yet; no invented dictionary rows.
  **EXACT RESUME POINT (pre-implementation):** D-12 implementation proceeds NOW in text scope;
    after D-12, next decisions are D-13 dispatch (authorization required) and D-11/Q10 when OCR
    is re-opened. H-12 recorded IN PROGRESS until the photo-path criteria can pass after D-11.
- 2026-09-09 — **D-13 PRE-FLIGHT (recorded BEFORE implementation; verdict GO)**: authorized by user.
  **Starting state:** D-01..D-10 ✅, D-12 text scope 🟡 (checkpoint 8bd7708 + docs 83e6de0 pushed),
  D-11 ⏸ deferred (Q10 OPEN/BLOCKED), Q4 ✅ (Intake sole writer of `recipe_ingredient_line`), tree clean.
  **Canonical requirements verified:** DISPATCH D-13 (method attach on corrected object, optional per
  B4 AC-1; absent → list-only Views 3/7 INCOMPLETE OR accepted matched family method tagged INFERRED
  with named source; Views 3/7 NOT INCOMPLETE in that case; INFERRED provenance flows to C4 claim
  machinery), Recipe_Systems §12 B4 + §3.4 (never fabricate), API §4 `PATCH /recipes/:id/method`
  (RS-US-09; `{method: none|paste|inferred, method_text?, method_source?, accept_inferred?}` →
  `{method_tag: METHOD|INFERRED|null, method_source: string|null, list_only: boolean}`; Bearer only;
  guest selection client-side), ERD §5 (`recipe.method_text`, `method_source_tag` CHECK
  CARD/METHOD/INFERRED/UNKNOWN, `method_inferred_source` required when INFERRED), A-13 (refuse-empty
  = BLOCKER; source-less INFERRED = MAJOR; tag vocabulary integrity; the unit's flag = the C5
  station-card precondition), Epic-B B4 AC/TC, HANDOFF H-13 placeholder.
  **Ownership:** `recipe` table one-writer = RecipeService (ADR §2; stated in its header) — D-13
  method writes go there; Q4 untouched (no line writes). No unresolved architecture question → GO.
  **Decisions (D-13A…J):** A) write path = `RecipeService.attachMethod` (single `recipe.update`,
  assertOwned INV-17 404). B) wire = `{method_tag, method_source, list_only}` derived from persisted
  state; `list_only := method_source_tag IS NULL` (the INCOMPLETE driver flag P3 will assert; Views
  3/7 rendering stays P3 — D-13 proves the flag only, A-13 "unit's flag" cross-check recorded).
  C) `paste` → `method_text` + tag `METHOD`, inferred_source null. D) `inferred` → `method_text` +
  tag `INFERRED` + `method_inferred_source` = named source (REQUIRED, ERD; source-less → 400).
  E) `none` → all three method columns cleared → `list_only` true. F) `accept_inferred` accepted but
  behaviorally redundant with `method:"inferred"` (API doc maps "Accept INFERRED" to that value) —
  no distinct semantics invented. G) `method_source` only meaningful for INFERRED (sole source
  column is `method_inferred_source`); paste does not persist a source name. H) route guard =
  JwtAuthGuard + CsrfGuard (doc: Bearer; guest method = client-side, doc §4). I) no GET-method route
  (API doc defines only PATCH; the PATCH response is the state read). J) no schema change (columns
  exist since migration 002), no `analysis_claim` writes (C4 = P3), no D-14 gate, no Views 1–4
  generation, no OCR (Q10 stays untouched).
  **STOP conditions:** any need to write `recipe_ingredient_line` (Q4) or `analysis_claim`/P3 tables
  or to alter schema → STOP and report. Dependencies: D-12 ✅ (recipe + corrected lines exist).
- 2026-09-09 — **D-14 PRE-FLIGHT (recorded BEFORE implementation; verdict GO)**: authorized by user.
  **Starting state:** D-10 ✅, D-11 ⏸ (Q10 OPEN), D-12 🟡 text scope, D-13 ✅ (364d58b + 6146752 pushed),
  Q4 ✅, tree clean. **Canonical requirements verified:** DISPATCH D-14 (INV-05 enqueue guard; "Depends
  on: D-11" = the photo-path golden scenario only — the GATE itself is channel-agnostic, reads
  `needs_review` on active lines; text scope authorized by user, same pattern as D-12), ADR invariant
  table INV-05 ("Active needs_review lines block Analysis enqueue"), ADR §1 ownership ("Intake owns
  recipe_input and recipe_ingredient_line writes — the complete draft-line lifecycle … up to the
  analysis enqueue gate (INV-03, INV-05, INV-07)"), Epic-B boundary ("analysis is blocked while any
  active line has needs_review = TRUE (INV-05)"), BUILD_PLAN P2-5 + exit ("analysis refuses to enqueue
  until review is clean"), A-14 (INV-05 BLOCKER via every route; single source of truth = the canonical
  flag — shadow state = MAJOR; golden path photo→flagged→blocked→clean→enqueuable; completeness check
  SHARED with P3, duplicate implementations = MAJOR). API doc: no enqueue/readiness route exists and no
  block error code is specified (analyse = P3, RS-US-13; 422 METHOD_REQUIRED is the only analyse error)
  — D-14 adds NO new endpoint. **Existing code:** `listDraftLines` already defines ACTIVE =
  `deletedAt IS NULL`; `needs_review` is set false for text lines at parse and can become true ONLY via
  D-11 OCR flagging or merge-OR; no wire field exposes it; no public path clears it (LinePatch has no
  needs_review field).
  **Decisions (D-14A…H):** A) gate lives in IntakeService as a READ-ONLY `getEnqueueState(actor,
  recipeId)` → `{ canEnqueue: boolean, blockers: [{ lineId, displayName }] }` — the single shared check
  (A-14): P3's analyse must call THIS method (deliverable 2); assertOwned INV-17 404 inside.
  B) user-facing surface = `GET /recipes/:id/parse-preview` gains `enqueue: { can_enqueue, blockers }`
  (additive; "the user sees what blocks them, line by line" via the existing review surface; no new
  endpoint — API doc defines none). C) "clearing the last flagged line" (done criterion) needs a public
  path: review PATCH gains `needs_review: false` (zod `z.literal(false)` — clients can NEVER set true;
  OCR/D-11 owns true; no auto-clear: explicit user confirmation only, never tied to other edits).
  D) soft-deleted lines are inactive (`deletedAt IS NULL` = active, the existing listDraftLines
  definition) — deleted flagged lines never block. E) no writes anywhere in the gate (Q4 preserved);
  split/merge flag inheritance untouched. F) refusal wiring = P3 (no enqueue path exists yet — D-14
  proves the check; the analyse 409/422 contract is P3's). G) no new schema columns; `needs_review`
  exists since migration 002. H) new static regression gate: shadow enqueue-readiness STATE
  (`enqueue_ready|analysis_ready|review_complete|can_enqueue|ready_for_analysis`) in .prisma/.sql only
  (persisted drift risk, A-14) — wire names in .ts are derived, not state; qg2 plant-proofs added.
  **STOP conditions:** any write to lines from a new module, schema change, or P3 code → STOP.
  Dependencies: D-11 only for the photo golden scenario (recorded as text-scope limitation in H-14).
- 2026-09-09 — **D-15 PRE-FLIGHT (recorded BEFORE implementation; verdict GO)**: authorized by user.
  **Starting state:** D-10 ✅, D-11 ⏸ (Q10 OPEN), D-12 🟡 text scope, D-13 ✅, D-14 ✅ (bdbea9b +
  50bd215 pushed), Q4 ✅, tree clean. **Canonical requirements verified:** DISPATCH D-15 (prompt spec
  per view 1–9 + home/chef system prompts validated against frozen schemas — violations = regenerate
  path QG4 "invalid schema"; prompt_version persisted per analysis; LLM adapter seam mocked in CI,
  real provider only in the benchmark harness; NON-GOALS: D-16/D-17/D-18, provider selection),
  BUILD_PLAN P3-1 (same; ERD analysis.prompt_version), A-15 (schema conformance BLOCKER — run the
  validation, don't read it from HANDOFF; reproducibility = same prompt_version + same stubbed model →
  identical output twice, MAJOR otherwise; mode separation home ≠ chef; QG4 malformed payload →
  regenerate/never-publish; Q9 hygiene — no provider pinned), Analysis_Prompts.md v2 (input schema §0;
  shared system prompt §1 with the six-tag vocabulary + 7 hard rules; per-view ROLE/TASK/OUTPUT
  SCHEMA/few-shot §2–§8; Notes: one call per view, JSON-schema output, temperature 0.2, Zod validation
  before return/store, V8/V9 NOT in the LLM set), Recipe_Systems §6 (nine-view worked example = the
  acceptance data), §7 (chef mode spec: "Home mode explains. Chef mode briefs"; voice/refusal/blanks;
  the per-view Home-vs-Chef table), Deterministic_Views.md (V8/V9 deterministic algorithms),
  ERD/schema `analysis.prompt_version VARCHAR(64)` (reproducibility pin; writer = worker), frozen
  packages/schemas (SCHEMA_VERSION 1.0.0: VIEW_SCHEMAS 1–9, StructuredRecipeInputSchema,
  AnalysisEnvelopeSchema with mode + prompt_version + model_version, ClaimTag vocabulary, per-view
  tag-subset literals), Tech Stack §10 (provider-neutral adapter, Gemini candidate = Q9), §21 QG4 row
  (invalid LLM output → reject/regenerate; never publish), SCAFFOLD §1 (layout: no prompts package —
  the LLM layer is packages/llm-adapter), Q9/Q1 rows (both OPEN — not resolvable here).
  **Decisions (D-15A…K):** A) prompt module lives in `packages/llm-adapter/src/prompts/` (Tech Stack
  §10 LLM layer; no new package → no layout change). B) `PROMPT_VERSION = 'v2'` (the canonical
  Analysis_Prompts.md version; VARCHAR(64)-safe; bump = new dispatch unit). Prompt text carries
  provenance pins ("Analysis Prompts §N"). C) Views 8/9 are deterministic — the registry marks them
  `kind: 'deterministic'` (doc pointer only); no prompt text invented. D) home/chef system prompts =
  shared prompt (verbatim §1) + mode overlay authored from Recipe_Systems §7 (home: explain; chef:
  brief — voice rules, required blanks, refusal, per-view mode focus from the §7 table).
  E) `parseViewOutput(view, raw)` = `VIEW_SCHEMAS[n].safeParse` — the single validation the worker's
  QG4 regenerate path keys off (D-16/D-17 consume it; no regenerate loop built here). F) adapter seam:
  `LlmAdapter.generate({ view, mode, input, prompt_version, model_version })` returning raw JSON;
  `MockLlmAdapter` = deterministic fixture-driven stub (no network, CI-safe); NO provider, NO
  credentials (Q9 stays OPEN). G) no analysis_* writes (worker owns them, INV-03) — D-15 exposes
  PROMPT_VERSION for D-17 to stamp; the `analysis.prompt_version` write is D-17's. H) the seam's
  `recipe_snapshot` stays `unknown` (Q1 OPEN — D-17 builds to the labeled assumption); the prompt
  module types its input as the frozen StructuredRecipeInput. I) reproducibility proven by test: same
  version + same mock + same input → byte-identical output, run twice (A-15 MAJOR contract).
  J) identification + station-card prompts are OUT of D-15 scope (P3-4/D-18 owns C1 + station card
  per BUILD_PLAN P3-4) — recorded non-change. K) live-stack verification not applicable (no HTTP
  surface in D-15 — the seam runs inside the future worker); the package build + suite run is the
  honest evidence level, stated as such.
  **STOP conditions:** any analysis_* write, provider pinning/credentials, Q1/Q9 resolution, schema
  edits, or worker code → STOP and report. Dependencies: D-05 ✅ (frozen schemas), D-14 ✅ (gate —
  D-15's input types assume reviewed lines). No contradictions found → GO.
- 2026-09-09 — **D-16 PRE-FLIGHT (recorded BEFORE implementation; verdict GO)**: authorized by user.
  **Starting state:** D-10 ✅, D-11 ⏸ (Q10 OPEN), D-12 🟡 text scope, D-13 ✅, D-14 ✅, D-15 ✅
  (1b4b2f3 + 46fd99f pushed), Q4 ✅, Q9/Q1 OPEN (not resolvable here), tree clean. **Canonical
  requirements verified:** DISPATCH D-16 (grounding validator = the no-invention enforcement layer:
  every claim's reference resolves against the captured structured recipe lines only; unresolved
  positive/neutral → ABSENT marking or failure; regenerate-once; still failing → view INCOMPLETE —
  never current, never invented; ABSENT rule; single choke point in the P3 pipeline; NON-GOALS
  worker/UI), ADR §6 runtime grounding validator (validate every ingredient reference in the nine
  view payloads AND claims against the captured state: active lines, confirmed senses, dictionary,
  aliases; missing valid only when ABSENT-marked; regenerate once with a correction instruction;
  still failing → INCOMPLETE + recorded, never published/current), A-16 (INV-10 BLOCKER plants:
  invented ingredient / non-captured reference / reworded capture — all caught; golden invariants
  green through the validator with the garlic plant proven not to reach View 1/8/9; regenerate-once
  = first→regenerate, second→INCOMPLETE never current, third silent attempt = BLOCKER; choke point —
  no bypass; ABSENT-for-captured = MAJOR), Recipe_Systems §3 rule 1 (the structured recipe object is
  the only mise — non-object items usable only to mark ABSENT), SCAFFOLD §6 no-invention rule,
  BUILD_PLAN P3-2 + P3 exit (grounding failure → INCOMPLETE, never current), frozen schemas
  (StructuredRecipeInputSchema carries ingredients{id,display_name,canonical_name,confirmed_sense} +
  method_steps + explicitly_absent; ClaimSchema{claim_text,claim_tag,source_reference}; VIEW_SCHEMAS
  tag subsets), golden fixture (card.lines + expected.absent — garlic recorded absent;
  golden-check invariant no_ginger_garlic), D-15 pipeline (parseViewOutput + MockLlmAdapter +
  generateValidated in packages/llm-adapter). **Decisions (D-16A…K):** A) validator lives in
  `packages/llm-adapter/src/grounding/` — the D-15 pipeline package IS the single choke point
  (deliverable 3); provider-neutral; no new package. B) captured state = the frozen
  StructuredRecipeInput passed as a PARAMETER (Q1 stays OPEN — no persistence decision; ADR §6:
  the worker captures state at enqueue and supplies it). C) mechanical reference vocabulary today =
  captured ingredient ids + per-line name tokens (display_name/canonical_name/confirmed_sense) +
  method-step ids + explicitly_absent list; dictionary/alias resolution = Q5/Track R — noted, not
  built. D) structured resolution: every `ingredient_id` in views 1/2/4 must resolve to a captured
  id; unresolved positive/neutral = grounding failure. E) claim grounding: tag ∈ six canonical;
  CARD/METHOD → `source_reference` resolves to a captured id AND the claim text contains the cited
  element's name token (reworded-capture catch); ABSENT → subject must NOT be a captured ingredient
  (ABSENT-for-captured = MAJOR); INFERRED → source_reference = named pattern string or null;
  UNKNOWN/ASSUMED → no positive reference channel. F) ABSENT rule: non-captured references are valid
  ONLY via tag ABSENT or the captured `explicitly_absent` list; any non-ABSENT claim or view field
  mentioning an explicitly_absent item = failure (this is the mechanical garlic-catch for View 8/9
  text). G) view 5's regional-contrast text (not_this/key_difference) describes OTHER variants — the
  prompt's own few-shot names non-captured ingredients there; exempt from the structured-id checks
  (it has none) and only the absent-channel scan applies; view 5 stays human-gated (G2,
  needs_review literal true). H) unknown-word detection beyond the captured vocabulary + absent
  list is NOT built (no canonical ingredient lexicon exists — dictionary = Q5); recorded scope
  boundary: mechanical catches = structured ids + claims + absent channel. I) regenerate-once:
  `groundingAttempt(attempt, verdict)` — attempt 1 failure → `{action:'regenerate',
  correction_instruction}`; attempt 2 → `{action:'incomplete'}`; attempt ≥3 → THROWS (A-16: no
  third silent attempt). The worker LOOP is D-17's — D-16 provides the decision + instruction.
  J) choke point: `generateGrounded(adapter, request, captured)` = generate → parseViewOutput →
  grounding verdict (the worker's single entry); D-15's `generateValidated` stays as the schema-only
  stage. K) no new static gate (the existing one-writer analysis_* gate + golden-check cover the
  static surface; INV-10 is a runtime contract proven by plant tests).
  **STOP conditions:** provider code, Q1/Q9 resolution, analysis_* writes, worker plumbing, schema
  edits, or an invented persistence model → STOP. Dependencies: D-15 ✅ (pipeline + schemas +
  mock). No contradictions found → GO.
- 2026-09-09 — **D-17 PRE-FLIGHT + REPOSITORY/CI AUDIT (Part A–C; verdict: GO with labeled Q1 assumption)**: user
  authorized D-17 pre-flight + full repo/CI health audit. **Canonical D-17 contract verified:** DISPATCH D-17
  (worker = only writer of analysis_*; pg-boss dequeue; INV-11 idempotency; Q13 pilot retry defaults labeled;
  Q1 → "if Q1 is still open, use the worker/job-payload approach as the labeled working assumption with the
  ERD v14 seam documented — do not silently decide (BUILD_PLAN §7.2)"; NOTIFY→API→SSE→browser with NOTIFY =
  signal only, INV-16; crash/duplicate → one current, never two; done criteria incl. "failed jobs never stuck
  at generating"), A-17 (one-writer BLOCKER via grep; duplicate delivery → one current; NOTIFY loss → reload
  recovery; Q1/Q13 labeled assumptions — unlabeled policy = MINOR, silent ERD v14 change = BLOCKER),
  ADR §6/§14 (execution flow, retry lifecycle queued→processing→transient→bounded retry→success/failed;
  permanent errors must not retry indefinitely; analysis.id = business/job identity; idempotent upserts),
  Tech Stack §9/§13 (pg-boss; SSE via NOTIFY), BUILD_PLAN P3-3 + §7.2 (Q1 decides by week 5 / P3 finalization),
  ERD/schema (Analysis, AnalysisView{view_number CHECK 1–9, view_key, status CHECK, payload Json},
  AnalysisClaim{claim_tag CHECK, source_reference}, is_current partial unique), frozen D-05 contracts,
  D-14 gate + D-15 pipeline + D-16 choke point (consume, never duplicate). **Q1 verdict: GO-with-labeled-
  assumption** — DISPATCH D-17 deliverable 2 EXPLICITLY permits the job-payload approach while Q1 is open;
  Q1 stays OPEN in SCAFFOLD §7; assumption labeled with the register ID in HANDOFF H-17 (A-17 hygiene).
  **Q9:** worker stays provider-neutral through the D-15 seam; no provider. **Audit findings:** (1) CRITICAL
  CI-only failure — GitHub Actions run 13 (46fd99f, D-15 push) and run 14 (3eb18a6) FAILED at the typecheck
  step: D-15 pointed schemas' package main/types at dist/ but neither ci.yml nor verify-local.sh builds
  schemas before typecheck (local masked it because dist existed). Reproduced locally (TS2307 with
  schemas/dist absent) → fixed by adding a schemas build step to both ci.yml and verify-local.sh (mirrors
  the database-build precedent; EOL verified LF). Run 12 (50bd215) and run 11 (6146752) were green — the
  regression is D-15's. (2) gh CLI absent on this machine → CI state verified via the public GitHub REST API
  (repo is public). (3) Verified healthy: lockfile/npm ci, migration order (001+002), zero tracked generated
  artifacts, no secret leaks (only Prisma generated runtime strings — gitignored), scripts LF in index+tree,
  workspace topological build, verify-local ≈ ci.yml parity, Node 22 both sides. (4) Observation only (no
  action): packageManager pins npm@11.19.1 while CI's Node 22 ships npm 10 — tolerated (runs 11/12 green).
  **D-17 implementation plan (recorded before code):** enqueue surface = POST /recipes/:id/analyse (D-14
  gate → 422 METHOD_REQUIRED when list_only per API §5 → pg-boss send with a pre-generated analysis UUID →
  200 {analysis_id, status:'queued'} — the API NEVER writes analysis_* (A-17 one-writer); the full envelope
  shape is the GET /analysis/:id contract once the worker completes); worker (apps/analysis-worker): pg-boss
  work() on queue 'analysis', creates the analysis row (generating) + NOTIFY, runs each view 1–9 through the
  D-16 generateGrounded choke point with the configured adapter (Q9 stub = MockLlmAdapter — no provider:
  jobs fail cleanly, never stuck at generating), persists analysis_view + analysis_claim rows, marks
  complete + is_current (INV-09), NOTIFYs; duplicate delivery converges by upserting on the predetermined
  analysis id (INV-11); crash-mid-job recovery = startup reconciliation of stale 'generating' rows; retry =
  Q13-labeled pilot defaults (pg-boss retryLimit 3 + backoff) recorded in H-17; SSE = GET
  /analysis/:id/events (NOTIFY-driven, reconnect-reload from Postgres). Non-goals honored: no views
  content (D-18), no OCR, no provider.
- 2026-09-09 — **D-16 EXECUTION (post-implementation; H-16 filled)**: implemented per pre-flight —
   `packages/llm-adapter/src/grounding/{captured,validator,attempts}.ts` (new) + `src/index.ts`
  (choke-point chain `generateGrounded` + grounding exports) + `src/grounding/validator.test.ts`
  (new, 37 tests) + `tests/integration/story_d16_golden_grounding.test.ts` (new, 6/6 against the
  REAL golden fixture) + `jest.integration.config.js` (llm-adapter mapper). **Failures & recovery:**
  (1) reference collector missed `source_ingredient_ids` → view-2 pillar plant slipped through →
  added. (2) refactor broke single-string `ingredient_id` handling (array-only push) → restored
  string+array. (3) import-path errors (`ViewPayload` is llm-adapter-local, not a schemas export;
  missing `GroundingVerdict`/`validateViewGrounding` imports in index.ts) → fixed. (4) test-fixture
  bugs (CAPTURED lacked the fixture's extra golden ids; reworded-capture example still contained the
  captured token; "malformed" payload actually parsed) → fixtures corrected — the validator itself
  held throughout. **Evidence:** llm-adapter unit 89/89 (plants: invented id, reworded id, garlic/
  ginger in payloads, invented CARD claim, reworded capture, ABSENT-for-captured — all caught;
  regenerate-once + third-attempt throw; choke-point chain), golden integration 6/6, workspace
  unit/lint/typecheck green, gates PASS, verify-local exit 0. Live-stack N/A (pure function).
  Intentional non-changes per pre-flight B/F/G/H. **Resume point:** D-17 (P3-3 worker) awaits
  explicit dispatch; D-11/Q10 deferred.
- 2026-09-09 — **D-15 EXECUTION (post-implementation; H-15 filled)**: implemented per pre-flight —
   prompt module + version pin + validation gate + mock seam, all in packages/llm-adapter. Files:
  `packages/llm-adapter/src/prompts/{version,system,views,validate}.ts` + `src/index.ts` (rewritten)
  + `src/prompts/{system,validate}.test.ts` + `src/mock-adapter.test.ts` (new/extended),
  `packages/llm-adapter/{package.json,jest.config.js}` (schemas dep + mapper), `packages/schemas/
  package.json` (main/types → dist — D-15L packaging, contract surface unchanged, SCHEMA_FREEZE
  untouched). **Failures & recovery:** jest mapper path one `../` short → fixed; test compile errors
  (relative import `./index`→`../index`; zod `_output` type misuse → `StructuredRecipeInput` type) →
  fixed; VALID_VIEW_9 missed `tightening_factors`/`disclaimer` + carried an invented `notes` key →
  the .strict() schema caught it (the gate works as designed) → fixture corrected; two prompt-content
  regexes didn't match template line-wrapping/case → fixed. **Evidence:** llm-adapter unit 52/52
  (hand-checked valid+malformed per view, envelope both modes, reproducibility twice-identical, mode
  separation, QG4 rejection, Q9 hygiene), workspace unit/lint/typecheck green, gates PASS,
  verify-local exit 0. Live-stack N/A (no HTTP surface — D-15K, recorded honestly). Intentional
  non-changes per pre-flight C/J/G. **Resume point:** D-16 (P3-2 grounding validator) awaits
  explicit dispatch; D-11/Q10 still deferred.
- 2026-09-09 — **D-14 EXECUTION (post-implementation; H-14 filled)**: implemented per pre-flight —
   `IntakeService.getEnqueueState` (read-only, canonical flag only, active = deletedAt IS NULL) +
  `parse-preview` gains `enqueue` (D-14B) + review PATCH gains `needs_review: false` (literal-false
  zod; true → 400; explicit user confirmation only, never auto-cleared — D-14C) + new static gate for
  shadow enqueue-readiness STATE in .prisma/.sql (A-14 drift MAJOR) with qg2 plant proofs.
  Files: `apps/api/src/modules/intake/intake.{service,controller}.ts` + `intake.service.test.ts`
  (modified), `tests/integration/inv05_enqueue_gate.test.ts` (new, 6/6), `tests/integration/
  qg2_gates.test.ts` (+2 plants), `tests/e2e/enqueue-gate.spec.ts` (new, env-blocked),
  `scripts/regression-gates.sh` (new gate). **Failures & recovery:** (1) wire leaked camelCase
  `canEnqueue` — canonical wire = snake_case (D-13 MethodState convention) → renamed EnqueueState to
  the wire shape, unit/integration assertions converted. (2) an over-broad replace_all renamed
  service-internal camelCase identifiers inside intake.service.test.ts (model fields, LinePatch args)
  — reverted surgically: model/LinePatch stay camelCase, ONLY wire assertions snake_case; two wire
  assertions (toWireLine expected object + `wire.display_name`) restored. **Evidence:** API unit
  134/134, integration 62/62, gates PASS (new gate armed), lint/typecheck clean, verify-local exit 0,
  live-stack 8/8 (clean → DB-planted flag → blocked named → set-true 400 → review clear → unblocked
  immediately). Intentional non-changes per pre-flight F/G/E. **Resume point:** D-15 (P3-1) or
  D-11/Q10 when OCR re-opens — WAITING for explicit user authorization.
- 2026-09-09 — **D-13 EXECUTION (post-implementation; H-13 filled)**: implemented per pre-flight —
   `RecipeService.attachMethod` + `toMethodState`, new `RecipesController` (`PATCH /recipes/:id/method`,
  JwtAuthGuard+CsrfGuard, zod boundary validation: source-less INFERRED → 400 INVALID_METHOD), recipes
  module registers the controller. Files: `apps/api/src/modules/recipes/{recipe.service,recipes.controller,
  recipes.module}.ts` (modified/new), unit tests +5, `tests/integration/story_b4_method_attach.test.ts`
  (new, 6/6), `tests/e2e/method.spec.ts` (new, 5 specs, env-blocked), `tests/e2e/review.spec.ts`
  (parse-text 201→200 — D-12 latent expectation bug fixed against canonical API §3, confirmed live).
  **Failures & recovery:** (1) manual API restart used `KEYCLOAK_CLIENT_ID=recipe-systems-web` (wrong —
  `scripts/dev.sh` says `recipe-systems-bff`/`dev-bff-client-secret`) → Keycloak "Client not found";
  restarted with dev.sh values → login OK. (2) live-check script skipped `#HttpOnly_` cookie-jar lines →
  `recipe_session=undefined` → JWSInvalid 500 (script bug, NOT an API fault — the minted session verifies
  fine against the dev secret). (3) integration INV-17 assertion matched the wrong exception shape →
  corrected to `{ response: { code: 'RECIPE_NOT_FOUND' } }`. **Evidence:** unit 128/128, integration
  54/54, gates PASS, lint/typecheck clean, verify-local exit 0, live-stack 10/10 (guest 401 · paste
  METHOD · inferred INFERRED+"CDK 1669 / Mrs. Anitha" · none list-only · validation 400s · foreign 404),
  DB row confirmed (tag INFERRED + named source). Intentional non-changes per pre-flight D-13F..J.
  **Resume point:** D-14 (needs_review enqueue gate) awaits explicit dispatch; D-11/Q10 still deferred.
- 2026-09-09 — **GIT CHECKPOINT (owner-authorized push)**: workspace was a GitHub zip extraction
  (no `.git`); initialized git in place (`git init -b main`, `core.autocrlf=false` repo-local to
  avoid CRLF noise), fetched the canonical history, reset HEAD to `origin/main` `93cc8e8`
  (identical to the extracted tree — zero drift for untouched files), staged the exact D-12 delta
  (27 files; .env/node_modules/dist/generated/test-results excluded by .gitignore — no secrets),
  committed `8bd770884b3cab0422d27ffbe08540bff529cfd3` and pushed to
  `github.com/mohamedazzim/recipe-systems` main (`93cc8e8..8bd7708`). Remote verified via
  `git ls-remote`; working tree clean. D-12 remains IN PROGRESS (photo-path criteria still gated
  on D-11/Q10). Next: D-13 dispatch — WAITING for explicit user authorization.
- 2026-09-09 — **D-12 EXECUTION COMPLETE (text scope; H-12 filled)**: all six RS-US-08 routes
  live under the Intake writer boundary; stale-edit 409 on updated_at; split/merge with
  direction-aware line_no shifts (real integration bug caught + fixed); corrected-object read
  paths; parse-preview derived from needs_review. Evidence: API unit 123/123 · integration 48/48
  (story_b3 8/8) · all-workspace unit 112/112 · regression gates PASS · lint/typecheck clean ·
  verify-local exit 0. **Playwright E2E environment blocker (recorded, not a code issue):** on
  this corporate-managed machine, Playwright-launched browsers are killed by policy — exit code
  1260 (ERROR_BLOCKED_BY_POLICY) with chrome AND msedge channels, headed and headless (reproduced
  with DEBUG=pw:browser); the bundled Chromium download is network-blocked (CDN + npmmirror).
  The new tests/e2e/review.spec.ts is canonical for machines where Playwright runs; equivalent
  live-stack verification executed over the real HTTP surface (Keycloak OIDC → session cookie →
  BFF → Postgres) — 11/11 PASS (script kept OUTSIDE the repo). Next: D-13 dispatch decision
  (user authorization required); D-14 + D-11 stay gated. H-12 status: IN PROGRESS (photo-path
  criteria deferred), never DONE.
- 2026-09-09 — **Q10 OCR provider benchmark — decision trace (BLOCKED; Q10 stays OPEN; no production code changed)**:
  **STARTING STATE:** Q10 OPEN (SCAFFOLD §7; Tech Stack §11: "final OCR provider must be
  benchmarked against the team's real recipe-card dataset, including handwriting, poor lighting,
  multilingual/vernacular terms" — **NO numeric threshold defined anywhere**; Tech Stack §25.5;
  ADR §2 Decision 3 OCR=Intake-only). GCV = **INITIAL CANDIDATE** (Tech Stack §11/§25.5, BUILD_PLAN
  P2-2) — not decided. D-11 gated by Q10 (DISPATCH D-11 NON-GOALS); D-11 remains UNIMPLEMENTED
  (user instruction 2026-09-09: resolve Q10 first, do not implement D-11).
  **INSPECTED:** SCAFFOLD §7, DISPATCH D-11, BUILD_PLAN P2-2/§7.3, Tech Stack §11/§25.5, ADR §2/§19,
  HANDOFF H-04/H-10 + §5 D-11 pre-flight, IMPROVEMENT_PLAN P0-2, tests/fixtures/corpus (50) +
  messy_20 (20) + golden_kanyakumari_card.json + reviewers.json, .env (`OCR_PROVIDER=disabled`).
  **BENCHMARK ATTEMPT — BLOCKED (real evidence; nothing fabricated):**
  (1) **NO REAL-CARD IMAGES:** D-04 corpus = 50+20 SYNTHETIC JSON text fixtures
  (`provenance.synthetic:true`; H-04: "deterministic test data, no real-world source claims").
  Repo-wide image search: only `docs/diagram.png` + `docs/recipe_app_workflow_diagram_v2_fixed.png`
  (both diagrams, not cards). The real-card photos BUILD_PLAN §7.3 names as benchmark input were
  never added to the repo.
  (2) **NO PROVIDER CREDENTIALS:** no GOOGLE_APPLICATION_CREDENTIALS / VISION_API_KEY / gcloud /
  service-account file on this machine — GCV (or any provider) cannot be called.
  (3) **NO CANONICAL THRESHOLD:** the sources require real-photo benchmarking but define no numeric
  pass/fail threshold — gap recorded here; no fake canonical threshold invented.
  **DELIVERED (task-authorized):** `scripts/ocr-benchmark.js` — deterministic, stdlib-only harness:
  manifest-driven (image → reference_lines + critical flags); metric core (line preservation,
  missing/dropped lines, char-error count, confidence availability, low-confidence detection,
  latency); provider seam (mock for self-test; gcv HTTP runner gated on VISION_API_KEY — marked
  UNTESTED, credentials live outside the repo). Verified: `node scripts/ocr-benchmark.js
  --self-test` → **PASS 3/3** (deterministic cases incl. dropped-critical-line detection and
  missing-confidence flagging). A `--manifest` real run correctly exits 2 "BLOCKED: 1/1 manifest
  images do not exist" — that is the benchmark result until real inputs exist. Note: the H-10
  pre-flight "harness absence" note is superseded — the harness now exists; the block is images
  + credentials, not tooling.
  **PROPOSED CRITERION (project recommendation, NOT canonical):** per card ≥95% reference-line
  preservation (normalized whitespace/case/dash/fraction; tolerance ≤2 chars or ≤20% of line
  length); zero dropped critical lines (golden card: both fenugreek lines critical); per-line
  confidence available; lines <0.9 confidence or missing confidence must be detectable →
  `needs_review` candidates (INV-04); latency recorded per image (suggested budget <10s inside the
  canonical "photo→first analysis <2 min" P7 exit).
  **VERDICT: Q10 STOP (BLOCKED)** — the benchmark cannot execute on its canonical input (real
  cards) because the inputs do not exist in the repo. Q10 stays OPEN; GCV stays candidate.
  **D-11 consequence:** remains undispacted until Q10 resolves. When dispatched, D-11 ships the
  adapter SEAM + deterministic CI stub regardless (H-10 pre-flight note stands — CI never calls a
  real provider).
  **EXACT RESUME POINT:** user provides real recipe-card photos (e.g. gitignored
  `tests/fixtures/corpus_images/`) + GCV credentials OUTSIDE the repo (VISION_API_KEY env) → build
  the manifest → `node scripts/ocr-benchmark.js --manifest …` → record results here → Q10
  RESOLVED or STOP → D-11 dispatch decision.
- 2026-09-09 (cont.) — **Q10 benchmark attempt #2 — PRE-RUN VERIFICATION FAILED (still BLOCKED; prior STOP preserved)**:
  User added `tests/fixtures/corpus_images/` (15 JPGs) and stated credentials were supplied
  externally. Pre-run verification (real evidence):
  **(1) IMAGES — fail canonical input requirement:** 15 valid JPEGs (JFIF baseline, ~273–318 ×
  226–241 px, density 1×1, **no EXIF/camera metadata**). Local OCR (tesseract via Docker, eng)
  reads clean printed-style recipe text in EN + FR: Spaghetti Bolognese, Chicken Curry, Chocolate
  Chip Cookies, Pancakes, Tomato Soup, Beef Stew, Chana Masala, Crépes, Fish Tacos, Vegetable
  Stir-Fry, Apple Pie, Pad Thai, Ratatouille. **Zero correspondence to the D-04 corpus** (grep: 0
  hits for spaghetti/bolognese/crêpes/ratatouille/pad thai/apple pie; the corpus is Tamil/Kerala/
  other-Indian dishes with vernacular ingredient names — none appear). The canonical benchmark is
  "the team's REAL recipe-card dataset incl. handwriting, poor lighting, vernacular terms" — this
  set is generic international printed cards, not the team's cards. Real-photo provenance is NOT
  verifiable from file evidence (no EXIF, thumbnail resolution, clean tesseract reads); a
  ChatGPT-generated image file was downloaded to ~/Downloads 4 min before corpus_images appeared —
  flagged as a provenance concern, NOT asserted as fact.
  **(2) MANIFEST/REFERENCE MAPPING — absent:** no manifest was provided and no card maps to any
  rs-NNN reference set → no ground-truth reference text exists for any image → the line-preservation
  metric has nothing canonical to compare against.
  **(3) CREDENTIALS — absent:** sweep of bash env, full Windows env (cmd set), .env / .env.example /
  apps/web/.env.local.example, gcloud default paths (~/.config/gcloud, %APPDATA%/gcloud), Hermes
  .env, Windows Credential Manager (cmdkey), Downloads/Desktop/Documents/Temp, and files.zip →
  no VISION_API_KEY / GOOGLE_APPLICATION_CREDENTIALS / GCV key anywhere. Only `OCR_PROVIDER=disabled`.
  **VERDICT: benchmark NOT executed** (running it would be unfalsifiable — no credentials to call a
  provider, no reference mapping, and a corpus that fails the canonical input requirement). Q10 stays
  OPEN; GCV stays candidate. **Prior STOP history preserved verbatim above.**
  **NEEDED TO UNBLOCK:** (a) OCR credentials via environment (VISION_API_KEY) or gcloud ADC —
  never inside the repo; (b) a manifest mapping each image → ground-truth reference lines, or real
  cards corresponding to the D-04 corpus (incl. vernacular ingredient names); (c) user confirmation
  of image provenance (real photographs of the team's cards vs generated).
  **EXACT RESUME POINT:** unchanged — benchmark still cannot run. Once (a)+(b) hold, run
  `node scripts/ocr-benchmark.js --manifest …` and record the results here.
- 2026-09-07 — **Playwright E2E infrastructure**: `@playwright/test` added at root,
  `playwright.config.ts` (testDir tests/e2e, workers 1, retries 0), `tests/e2e/helpers/auth.ts`
  (real Keycloak login/registration helper), root script `test:e2e`. Local-only by design (hosted CI
  has no Keycloak service; TEST_PLAN §4). Verified: 15/15.
- 2026-09-07 — **Logout IdP-session fix**: RP-initiated logout with `id_token_hint` carried in the
  BFF session JWT (verified ID token), Keycloak SSO session terminated on logout; regression E2E
  "sign-in prompts for credentials again" added. Verified: E2E 15/15, verify-local exit 0.
- 2026-09-07 — **`/auth/me` contract alignment**: wire shape standardized to snake_case
  (`preferred_mode`, `label_pack`) matching the web types + API doc; caught by E2E.
- 2026-09-07 — **Entry-page redesign (public landing)**: design-system tokens + primitives applied
  to the public entry page (editorial hero, action hierarchy, guest path explained); later simplified
  per user direction (nine-view chips and account-band copy removed). Verified: entry.spec 5/5,
  build green, no overflow at 1440/390, single h1.
- 2026-09-08 — **Safe repository cleanup**: removed orphaned AppShell.tsx, useSession.ts, print.css,
  write.guard.ts, tsconfig.tsbuildinfo, stray `infra/docker/nginx/` dir, test-results/; archived
  DOCUMENTATION_FLOW.md + Recipe_Systems_API_CRUD.md to docs/historical/; .gitignore extended
  (test-results/, playwright-report/). Post-cleanup sweep: zero dangling references; full battery
  re-run green (lint, typecheck, 57/57, E2E 15/15, regression PASS, contract OK, verify-local exit 0).
- 2026-09-08 — **Local dev/test harness** (`scripts/dev.sh`): `start` (compose core+identity →
  migrate → API:3001 → web:3000, port-busy guard + startup liveness checks), `stop` (launcher PIDs +
  port-owner self-heal), `status`, `test:unit`, `test:api`, `test:e2e [args]`, `test:all`,
  `verify`. Dev credentials embedded (chef@recipesystems.test / password; recipe/recipe_dev_password
  @ localhost:5433). MSYS pitfalls encoded: native-Windows temp path (TMPDIR=/tmp breaks native curl
  with CURLE_WRITE_ERROR 23) and single-slash `taskkill /PID /F` (//T //F unreliable). Verified live:
  full stop→start cycle, test:e2e 15/15, test:unit all suites green. `STARTUP.md` (repo root) is the
  human-readable command reference for the same workflows (stack, migrations, API/web env, tests, gates).
- 2026-09-08 — **CI remediation chain (real evidence, all three failures fixed; final run SUCCESS)**:
  CI run https://github.com/mohamedazzim/recipe-systems/actions/runs/34266143182 (commit
  `a3b58e5`) green. Sequence: (1) `app.module.test.ts` boot failure in CI — IntakeModule's
  onModuleInit ensureBucket() crashed bootstrap when no MinIO runs (local masked: MinIO up);
  fixed by making ensureBucket never throw (degraded start, QG4 posture; per-request
  STORAGE_UPLOAD_FAILED unchanged) — commit `418eae3`, regression test added. (2) integration
  stage had no MinIO → `fd75512` added CI MinIO; first as a service container (health gate
  failed on runner), then as a docker-run job step with curl poll — `80f08e5`. (3) fresh-CI
  ts-jest compiled integration suites as one global script (TS2451 redeclarations; local cache
  masked it) → pinned module CommonJS/ES2021/isolatedModules — `a3b58e5`, verified locally with
  --no-cache 40/40.
- 2026-09-08 — **Git push (owner-authorized)**: implementation repo pushed to
  `github.com/mohamedazzim/recipe-systems` (branch `main`). Commit `432b601` "feat(D-10): raw
  intake pipeline — immutable recipe_input rows, MinIO photo storage" carries the D-10 + Q4/D-11
  pre-flight delta on top of the user's Initial commit `871ec48` (which already contained the
  D-01..D-05 state). Remote verified via `git ls-remote` (`432b60144e58df4d094e4a15e3fd14bb68cc346a`).
  H-10 SHA line updated with real evidence; earlier H entries keep their historical
  "none recorded" state (accurate at the time written — preserved, not rewritten).
- 2026-09-08 — **D-11 PRE-FLIGHT (read-only; no implementation code changed)**:
  Inspected: DISPATCH D-11, BUILD_PLAN P2-2/§7.3, SCAFFOLD §3/§7, ADR §2/§4/§10/§19, Tech Stack
  §11/§16, ERD §5 (ocr_text/needs_review/ocr_confidence, C-34), API §3 OCR route, Epic-B B2
  TC-02/03/04, TEST_PLAN QG4 + P2 row, HANDOFF H-10, current code (intake/recipes/storage modules,
  packages/ocr-adapter scaffold, D-10 immutability gate).
  **What D-10 provides:** photo input rows with photo_uri; Intake-only draft-line writes;
  assertOwned (INV-17); StorageService; GuestOrJwt+Csrf guards.
  **Findings/decisions:**
  - **CONTRADICTION (decision P1 required):** ERD §5 places `ocr_text` ON `recipe_input`, and ADR
    §4's pipeline persists the raw row BEFORE OCR — so D-11 must write ocr_text after row
    creation, which the D-10 immutability gate would fire on. Proposed resolution: narrow
    immutability to the raw-event fields (input_type/raw_text/photo_uri — never updateable);
    allow exactly ONE write-once OCR path owned by Intake:
    `recipeInput.updateMany({ where: { id, ocrText: null }, data: { ocrText } })` — DB-level
    write-once; gate amended to permit only updateMany-with-null-guard in intake.service.ts and
    still fire on any singular `recipeInput.update` anywhere. Amends a D-10 gate → reviewed
    patch; D-10 history preserved as-is (dated new entry, no erasure).
  - **No-photo / unreadable OCR** → single documented failure surface `422 OCR_UNREADABLE`
    (API §3 defines one OCR failure code; no new invented code).
  - **Low-confidence threshold:** not canonically specified. Conservative policy per adapter
    scaffold comment (no reliable confidence → review, never a score): normalize 0–1; flag
    `needs_review=TRUE` via a named constant in the intake module; missing confidence → flagged.
  - **Q3 NOT reopened** (stale Worker→OCR diagram edge stays OPEN; implementation follows
    Intake-only per ADR §2/SCAFFOLD §3). **Q10 NOT resolved** (D-11 ships the adapter SEAM;
    GCV initial candidate behind it; CI/verify uses a deterministic stub; real provider
    exercised only when credentials exist — dev has none; benchmark harness itself is a
    separate wks-1–4 track item, absence recorded, not a blocker).
  - **API response shape:** OCR lines follow the D-10 wire-shape convention — amount/unit null
    (parsing is D-12); confidence=ocr_confidence, low_confidence=needs_review.
  - **QG4 fault cells:** OCR timeout/down → adapter failure surfaces as 503, NOTHING persisted
    (OCR runs before any draft-line write), photo + input row intact, retry = re-POST. INV-04:
    flagged lines always created (never dropped) — test with stub output containing
    low-confidence lines.
  **Verdict: D-11 GO** — dependencies verified (D-10 live, Q4 canonical, guards/services in
  place); one required architecture decision (P1) + three scoped decisions recorded above; no
  blockers. Resume point: implement D-11 starting with the P1 gate amendment (reviewed patch to
  scripts/regression-gates.sh + H-10 note), then packages/ocr-adapter (normalize + GCV provider +
  deterministic golden stub), then Intake OCR endpoint + tests.
- 2026-09-08 — **D-10 raw intake + photo pipeline (H-10)**: recipes + intake + storage modules
  (Q4-resolved one-writer split), POST /recipes/parse-text + /upload live, recipe_input
  immutability regression gate + fire-proofs, QG4 no-dangling-URI evidence (upload-first +
  rollback + live-object integration probe). Verified: unit 25/25 new (workspace 251), integration
  40/40 (real DB+MinIO), E2E 25/25, gates PASS, verify-local exit 0. Decisions D-10A–K recorded in
  H-10. Full-suite E2E re-run note: a backgrounded playwright run hung once (~30 min, killed via
  taskkill /F /IM node.exe which also took down dev servers — restarted; re-run foreground
  25/25 in 2.0m).
- 2026-09-08 — **D-10 PRE-FLIGHT · Q4/Q5 decision trace — STARTING STATE (read-only, no code changed)**:
  Inspected: SCAFFOLD §7 register, ADR §2 one-writer + §13 invariants + B2/B3 responsibility row,
  IMPROVEMENT_PLAN P0-4/P0-5, ERD §5 (`recipe_input`, `recipe_ingredient_line`), BUILD_PLAN §P2,
  API doc §3. Findings: (a) **Q4 OPEN** — "Intake drafts vs Web API corrections" (SCAFFOLD §7,
  IMPROVEMENT_PLAN P0-4); (b) ADR §2 already assigns Intake "raw input and OCR-related draft
  writes" and its B2/B3 row assigns Intake the raw→flag→review lifecycle; INV-03 (one logical
  writer/table), INV-05 (needs_review gate), INV-07 (analysis never mutates lines) all support a
  single Intake writer; (c) **code scan: zero app write paths** touch `recipe_input` /
  `recipe_ingredient_line` (only packages/database schema+generated+db test); api modules =
  account/auth only — no competing writer, no bypass, no update/delete path exists; schema
  `recipe_input` has no `updated_at` (immutable by construction); `recipe_ingredient_line` has
  `updated_at`/`deleted_at` (B3 split/merge soft-delete — consistent with Intake ownership);
  (d) **Q5 inconsistency recorded, NOT resolved** (outside D-10 STOP scope): SCAFFOLD Q5 OPEN vs
  regression-gates admin-module "working assumption" for dictionary/alias writes.
  **RESOLUTION APPLIED (same session, docs-only):** Q4 → RESOLVED — Intake is the sole logical
  writer of `recipe_ingredient_line` for the full lifecycle (draft creation + B3 corrections;
  BFF exposes HTTP endpoints, delegates mutations to Intake). Canonical updates: ADR §2 (amended),
  SCAFFOLD §7 Q4/Q5 rows, IMPROVEMENT_PLAN P0-4 (RESOLVED) + P0-5 (finding note), CHANGE_LOG
  2026-09-08, this log. Q5 deliberately NOT resolved (Track-R gate item). Verdict: **D-10 GO**
  — no contradiction found; Q4 ambiguity cleared. Exact resume point: D-10 implementation on
  dispatch — `recipe_input` immutable rows (paste/photo/form), MinIO photo → URI only,
  Intake module owns all draft-line writes, QG4 evidence.
- 2026-09-08 — **D-05 schema freeze (H-05)**: `packages/schemas` frozen contract set v1.0.0 —
  nine view payloads, identification, six canonical claim tags + claim schema, station card,
  shared inputs, analysis envelope; Zod strict runtime validation; 112/112 contract tests;
  100% coverage; freeze record in `SCHEMA_FREEZE.md`. Provenance gate refined: quoted value
  literals only, test files excluded (type refs like `ClaimTagSchema` and negative test
  fixtures no longer false-fire); fire-proofs re-verified (integration 34/34).
- 2026-09-08 — **QG2 static-gate fire proofs (D-01 criterion 4 closeout)**:
  `tests/integration/qg2_gates.test.ts` (9/9) + `GATES_SCAN_ROOT` override in
  `scripts/regression-gates.sh` — every static gate proven to fire on a planted violation in a
  scratch tree (canonical tree untouched), plus baseline and real-tree green assertions.
  Also fixed a pre-existing gate bug: the golden-test-present skip regex (`xit`) false-flagged
  `result.exit` as a skipped test — now word-bounded both sides. Verified: integration 34/34, unit
  suites green, lint clean, typecheck 0, auth E2E 18/18, regression gates PASS, verify-local exit 0.
- 2026-09-08 — **Native Windows startup script** (`start-dev.cmd`, repo root): plain cmd — Docker
  compose (core+identity) → wait postgres healthy + Keycloak realm → prisma migrate → API window
  (:3001) → web window (:3000) via `start /D … cmd /k` with the dev env inherited, port-busy skip
  guard, ping-based sleeps (timeout breaks without a console), health waits, then opens the browser.
  Verified live: full run exit 0 (windows spawned, ports owned, health 200/200), re-run correctly
  skips existing servers, signin E2E 2/2 against the cmd-started stack. Pitfall fixed: parens inside
  echo within an if/else block break cmd parsing.
- 2026-09-08 — **Auth remediation: input validation + auth data integrity** (signup/signin, traces to
  H-07/D-07 + D-06 realm config). Files: `apps/api/src/modules/auth/email.ts` (new — application-boundary
  email validation + normalization: trim, lowercase, RFC-ish regex rejecting single-label domains, max
  320; `EmailValidationError` with EMPTY/TOO_LONG/MALFORMED codes), `account.service.ts`
  (upsertForSignIn validates+normalizes before any row exists — never persists raw claims),
  `auth.controller.ts` (callback maps EmailValidationError to a safe auth_error message),
  `infra/keycloak/recipe-systems-realm.json` (passwordPolicy `length(8)+upper+lower+digits+special`,
  bff client `directAccessGrantsEnabled=false`), `infra/docker/docker-compose.yml` (dev-only comment on
  admin creds). Live realm updated surgically via Admin API (no container recreate/user wipe) and
  verified via GET. Sub-linking investigation: ERD v13 `account` has no sub column; email UNIQUE is the
  canonical identity link — no schema change made (documented in email.ts). idTokenHint retention
  verified REQUIRED (KC shows logout-confirmation screen without it) — no change. Password policy lives
  at the IdP boundary (BFF never sees passwords by design; KC enforces independently, E2E-proven).
  Tests: `email.test.ts` (new, full matrix incl. demo@gmail.c case), account/auth service tests
  extended (normalization, rejection, no-upsert-on-invalid). E2E signup.spec: weak-password
  (realm-policy) + missing-special + malformed-email cases added; full suite 18/18. Unit 86/86; lint
  clean; typecheck 0; build green; regression PASS; contract OK; verify-local exit 0. Git: none
  recorded (not authorized). Known limitation: KC's own registration email check is looser than the
  app's (accepts demo@gmail.c format) — the app boundary is the defense-in-depth layer; pre-existing
  broken rows (e.g. `demo@gmail.c`) are not auto-cleaned.

- 2026-09-10 — **D-22 PREFLIGHT (dispatcher authorization: implement ONLY canonical D-22 scope — D1 save + D2 browse/open) — STARTING STATE, recorded before any D-22 code**:
  **DECISION (dispatcher 2026-09-10):** D-22 = P5-1 library (D1 save, D2 browse/open). D6 (delete)
  is part of the canonical D-22 unit in DISPATCH.md but was NOT dispatched in this message —
  explicitly deferred here as the open remainder of D-22 (no delete UI/endpoint this session).
  **CANONICAL SOURCES READ:** USER_STORIES Epic D (D1 AC-1/AC-2 TC-01/02; D2 AC-1 TC-01) + Epic A
  (A1 "recipes survive closing the browser", AC "Register → empty library", TC-02 save-while-signed-out
  resume; A2 claim) · Recipe_Systems.md §12 Epic D verbatim · ERD §4.2/4.3/§5 `recipe` (title editable,
  NO saved_at column, "no family column — identification belongs to analysis"), §12 `ix_recipe_account_updated`
  (account_id, updated_at DESC, deleted_at IS NULL), §13 lifecycle (D6 hard DELETE) · ADR §2 (one-writer),
  §4/§5 (claim transaction, guest session TTL), §9 (ownership authorization on every request; browser never
  reaches Postgres) · DISPATCH D-22 (deliverables/done-criteria/non-goals) · BUILD_PLAN P5-1 · TEST_PLAN
  (e2e flow "library save/reopen with cook-note recall") · IMPROVEMENT_PLAN (no D-22 blocker) · HANDOFF
  H-07 (resume-save seam documented, "the save flow itself arrives with D-22") + H-08/QA-B2 (callback
  claim already moves guest recipes onto the account).
  **ALREADY IMPLEMENTED (verified, reused):** recipe rows persist since intake (D-10; `title` placeholder
  'Untitled recipe' — D-10 decision: "later unit makes it editable" = D-22) · raw_text/photo_uri/lines/
  inputs/analyses all persisted · `assertOwned` INV-17 404 missing+foreign on every recipes/intake/analysis
  surface · guest sessions (Q11 TTL) + idempotent claim at auth callback (QA-B2) — a claimed recipe already
  lands on the account · `cook_log` table live in the DB (indicator = EXISTS) · web localStorage session list
  ("This session", capped, browser-only convenience — NOT canonical, see D-22I).
  **D-22 DESIGN DECISIONS (labeled, recorded here BEFORE code):**
  - D-22A: SCOPE = D1 + D2 only (dispatcher enumeration). D6 delete DEFERRED (open remainder of the
    canonical unit). No LLM/DeepSeek/Q9 work (dispatcher NON-GOAL confirmed).
  - D-22B: NO schema change. The ERD has no saved_at/saved flag — the saved artifact set IS the recipe
    row + recipe_input + recipe_ingredient_line + analysis rows (all already persisted). Save =
    (1) normalize the name (D-10 placeholder → family-defaulted, editable title), (2) confirm the
    artifact set, (3) bump `updated_at` (library ordering uses the ERD's own ix_recipe_account_updated).
  - D-22C: Save surface — `PUT /api/v1/recipes/:recipeId/save` (GuestOrJwtGuard + CsrfGuard; guests may
    save — A1 TC-02 seam). Body {title?: string ≤255} strict. Default name when title omitted/blank:
    latest current analysis identification family (view-5 payload `family` via the frozen
    View5PayloadSchema — the worker does NOT populate analysis.family today; column read first as
    fallback) → else existing non-placeholder title → else 'Untitled recipe'. Response carries the
    artifact-set presence (raw_input, photo, object, identification, analysis, timestamps) — nothing is
    copied or invented; the set lives in the existing rows.
  - D-22D: Library surface — `GET /api/v1/recipes` (JwtAuthGuard ONLY: the canonical library is
    account-owned). Rows: {recipe_id, name=title, date=created_at, family (same D-22C source),
    has_cook_log = EXISTS(cook_log)} ordered updated_at DESC (ERD index). Cross-account isolation is by
    construction (WHERE account_id = actor) and still 404-guarded elsewhere (INV-17 unchanged).
  - D-22E: One-writer — RecipeService remains the sole `recipe` writer (save/rename go through it);
    library family/cook reads are read-only API reads of analysis/cook_log (worker = sole analysis writer).
  - D-22F: Web — signed-in Home renders the canonical library from GET /recipes (name, date, family,
    cook indicator; click → workspace reopen via the existing onOpenRecipe path). Workspace gains a
    visible "Save recipe" action + editable title input (default family name offered; rename = save with
    a new title). Guest sessions keep the existing session list AND may save (naming) — save state rides
    the recipe row through the QA-B2 claim → the account library shows it = the resume-save path (A1 TC-02).
  - D-22G: Resume-save mechanics: no extra state — the claimed recipe row (title + updated_at + artifacts)
    is the resume. H-07's documented seam is closed by D-22C+D (nothing new to invent).
  - D-22H: Q1/Q5/Q9/Q10/Q11 stay OPEN. No register changes.
  - D-22I: localStorage data is NOT deleted and NOT migrated. Signed-in Home switches to the DB library
    (canonical replacement, verified by tests before the browser-state UI is retired for signed-in users);
    guests continue on the session list unchanged.
  **PLAN:** API (RecipeService save/list + RecipesController PUT save/GET list + tests) → web (HomeView
  library + RecipeWorkspace save UI + tests) → integration story_d22 (save default-name=family, library
  rows incl. cook indicator, cross-account denial, guest save→claim→resume) → e2e library.spec (save,
  reload persistence, reopen, guest resume-save) → gates/lint/typecheck/verify-local → commit/CI → H-22 +
  CHANGE_LOG → HARD STOP (D6 delete remains the next D-22 continuation point).

- 2026-09-10 — **D-22 EXECUTION (D1 save + D2 browse/open; dispatcher scope per the message above) — recorded at close-out**:
  **IMPLEMENTED per D-22A..I (decision trace above, honored verbatim):**
  - API: `RecipeService.saveRecipe` (family via `analysis.family` column then the frozen
    View5PayloadSchema view-5 payload; title default rules: explicit → family-on-placeholder →
    existing title → 'Untitled recipe'; artifact-set presence returned, nothing copied) +
    `identificationFamily` + `listLibrary` (account rows, updated_at DESC per the ERD index,
    has_cook_log = EXISTS on the live cook_log table). `PUT /recipes/:recipeId/save`
    (GuestOrJwt+Csrf, strict zod {title≤255}) and `GET /recipes` (JwtAuthGuard only — the library
    is account-owned). One-writer preserved (RecipeService sole `recipe` writer; analysis/cook reads
    are read-only).
  - web: workspace Save section (editable "Recipe name" + "Save recipe" button + "Saved as …" +
    honest artifact summary; guests may save) · signed-in Home renders "Your library" from
    GET /recipes (name, date, family, cook indicator) and opens rows carrying the saved DB name into
    the workspace title (works even after a browser restart — no session record) · guests keep the
    untouched session-local list and "Other sessions" (D-22I: no localStorage data deleted/migrated).
  - resume-save (A1 TC-02): guest save → the existing QA-B2 callback claim moves the row (title +
    updated_at + artifacts) onto the account → the new account library shows the saved recipe. No new
    state invented — the H-07 seam is closed by construction.
  **EVIDENCE (this session):**
  - unit: API 193/193 (recipes suite 27/27 incl. 8 new save/library tests) · web 98/98 (HomeView
    library + workspace Save suites) · integration 102/102 incl. NEW `tests/integration/
    story_d22_save_library.test.ts` (5/5 real Postgres: family-default save + artifact set; explicit
    title + blank-keeps; library AC-1 rows + cook indicator via a real cook_log row; cross-account
    library empty + save 404 (INV-17); guest save → REAL AuthService claim → named recipe in the new
    account library with XOR intact) · e2e `tests/e2e/library.spec.ts` (signed-in save/library/reload
    + guest resume-save; Playwright launches remain machine-policy blocked here — H-13 — the live
    internal-browser run below executed the same assertions).
  - gates: QG2 regression gates PASS (8/8 golden) · contract-check OK (zero drift) · lint 0 ·
    typecheck 0 · verify-local ALL STEPS PASSED (exit 0).
  - LIVE stack (internal browser, real Keycloak): chef save with blank name → "Saved as Coastal Tamil
    (Kanyakumari) style meen kuzhambu" with artifact summary (raw ✓ photo — object ✓ identification ✓
    analysis ✓ timestamps ✓) → library row (name, date, family, "No cook log yet") → reopen with the
    saved name as the workspace h1 → reload → library row persists (DB-owned) → guest saved
    "D22 guest fish curry …" → real Keycloak registration → callback claim → the new account's library
    contains exactly that saved recipe (resume-save) → guest home still renders the untouched session
    list + "Other sessions" (browser state preserved).
  **DECISIONS CARRIED:** D6 (delete) is the explicitly deferred remainder of the canonical D-22 unit
  (not dispatched in this message) — next continuation point · no schema change (ERD has no saved_at;
  the artifact set IS the existing rows; updated_at is the save stamp) · Q1/Q5/Q9/Q10/Q11 stay OPEN ·
  no LLM/DeepSeek work (dispatcher NON-GOAL honored).
  **COMMIT/CI:** see the H-22 ledger entry (SHA + CI run id recorded after the push).

- 2026-09-10 — **D-22 D6 PREFLIGHT (dispatcher authorization: implement ONLY the remaining D-22 D6 delete scope) — STARTING STATE, recorded before any D6 code**:
  **DECISION (dispatcher 2026-09-10):** D6 = hard-delete lifecycle for a saved recipe, the last
  D-22 deliverable. No D-23/D-30, no DeepSeek, no Q1/Q5/Q9/Q10/Q11 resolution.
  **CANONICAL SOURCES READ:** USER_STORIES Epic D D6 (AC-1 confirm; AC-2 removes photo, object,
  analyses, lists, logs; AC-3 no public residue; TC-01/02/03) · Recipe_Systems.md §12 D6 ·
  **API doc §5 `DELETE /recipes/:recipeId` (RS-US-24): Auth Bearer, body `{confirm: true}`, 204 No
  Content, "cascade: images, analyses, lists, logs, tags"** · ERD §5 recipe (`deleted_at` =
  "Archive/hide only; D6 is a hard DELETE") + §13 lifecycle + §12 indexes · migration 002 FK audit
  (ALL recipe children ON DELETE CASCADE: recipe_input, recipe_ingredient_line, recipe_tag, analysis,
  shopping_list_generation, ingredient_shopping_state, cook_log; analysis → analysis_view →
  analysis_claim + analysis_station_card; cook_log → swap/photo; shopping generation → items;
  `fk_analysis_snapshot_same_recipe` NO ACTION is safe — every analysis of the recipe cascades in
  the same statement) · ADR §3 (URIs only in Postgres, objects in S3/MinIO) + §16 ("Private uploaded
  objects must not remain indefinitely after their owning data is deleted"; "Cleanup operations must
  be safe to retry") · BUILD_PLAN P5-1 · DISPATCH D-22 DONE CRITERIA (delete cascade proven; no
  residue) · TEST_PLAN P5 row (delete cascade) · current D-22 D1/D2 implementation + StorageService
  (uploadImage/deleteObject best-effort/objectExists; URI form s3://<bucket>/recipes/<uuid>.<ext>).
  **D6 DESIGN DECISIONS (labeled, recorded here BEFORE code):**
  - D6-1: HARD DELETE exactly per the ERD — `prisma.recipe.delete` and the DB-level FK cascades do
    the work. No new soft-delete field; `deleted_at` keeps its "archive/hide only" meaning.
  - D6-2: Confirmation at BOTH canonical layers: the API body REQUIRES `{confirm: true}` (RS-US-24;
    anything else → 400 `CONFIRM_REQUIRED`) and the UI shows a two-step inline confirm (Cancel /
    "Delete recipe") stating the recipe name, the destructiveness, and what is removed.
  - D6-3: `DELETE /api/v1/recipes/:recipeId` — **JwtAuthGuard + CsrfGuard (Bearer-only per
    RS-US-24)**. Guests have NO delete surface (canonical): a guest recipe becomes deletable after
    claim. INV-17: 404 for missing AND foreign AND malformed UUID (before Prisma); repeated delete →
    the same canonical 404 (no existence leak, no duplicate-deletion state).
  - D6-4: Storage cleanup order (recorded rationale): (1) collect asset keys BEFORE the delete from
    recipe.photo_uri + recipe_input.photo_uri + cook_log_photo.photo_uri (only keys under our own
    `s3://<bucket>/` prefix — never arbitrary keys); (2) run the DB delete (FK cascades, atomic);
    (3) AFTER commit, best-effort per-object delete (compensating cleanup). No distributed
    transaction is invented (ADR: cleanup must be safe to retry; an orphaned object is recoverable,
    a dangling URI is not — hence DB-first). Storage failures are NOT hidden: the service logs a
    structured WARN with the failed keys (observable residue), and the canonical 204 response is
    preserved (RS-US-24 fixes the response; the receipt cannot ride a 204 — recorded).
  - D6-5: StorageService gains `tryDeleteObject(key): Promise<boolean>` (never throws; false =
    residue) — the existing best-effort `deleteObject` (QG4 rollback path) is unchanged.
  - D6-6: Web UX — a danger-zone "Delete recipe" section in the workspace (signed-in only):
    destructive copy → Cancel / Delete recipe; disabled + "Deleting…" while in flight; failure
    shows the safe error and preserves the recipe (no optimistic removal); success calls
    `onDeleted(recipeId)` → the page navigates home, re-fetches the library, and shows a
    "Recipe deleted." notice. Library rows refresh from the DB (the deleted recipe never returns;
    reload-safe). Opening a deleted recipe URL afterwards hits the canonical 404s (safe copy, no
    resurrection).
  - D6-7: One-writer + existing behavior untouched: RecipeService remains the sole recipe writer;
    DB-level cascade deletes are FK semantics, not service writes (same posture as the C-28
    trigger). The D-20 station-card logic and the D-22 save/library behavior are not altered.
  **PLAN:** API (StorageService.tryDeleteObject; RecipeService.deleteRecipe + collectAssetKeys;
  controller DELETE + CONFIRM_REQUIRED; unit tests) → web (workspace delete section + onDeleted +
  Home notice; tests) → integration story_d22_delete (real Postgres: cascade proof across all
  child tables, station-card/analysis orphans zero, cross-account 404, confirm-required 400,
  repeated 404, real MinIO upload→delete→objectExists false; storage-down tolerated in CI) → e2e
  library.spec delete test → gates/lint/typecheck/verify-local → commit/CI → H-22 update +
  CHANGE_LOG → HARD STOP (no D-23/D-30).

- 2026-09-10 — **D-22 D6 EXECUTION — DONE, evidence recorded before commit**:
  **IMPLEMENTED per D6-1..7 (decision trace above, honored verbatim):**
  - API: `DELETE /api/v1/recipes/:recipeId` (JwtAuthGuard + CsrfGuard; body `{confirm:true}`
    strict else 400 CONFIRM_REQUIRED; 204). `RecipeService.deleteRecipe`: assertOwned (INV-17 404
    missing/foreign/malformed) → collect asset keys (recipe.photo_uri + recipe_input.photo_uri +
    cook_log_photo.photo_uri, own s3://bucket/ prefix only, two-step id joins) → `recipe.delete`
    (DB-level ON DELETE CASCADE chain removes every child per migration 002) → compensating
    per-object `tryDeleteObject` after commit; failed keys logged as a structured WARN (observable
    residue, retry-safe — ADR §16). `StorageService.tryDeleteObject(key): boolean` added (never
    throws); the QG4 best-effort `deleteObject` unchanged. One-writer preserved (RecipeService sole
    recipe writer; cascades are FK semantics).
  - web: workspace danger-zone Delete section (signed-in only — the endpoint is Bearer-only per
    RS-US-24): initial "Delete recipe" → destructive confirmation naming the recipe ("Its photo,
    object, analyses, lists and logs are permanently removed. This cannot be undone.") → Cancel /
    Delete recipe; disabled + "Deleting…" while in flight; failure shows the safe error and keeps
    the recipe (no optimistic removal); success calls `onDeleted` ONLY after the 204 → page
    navigates home, refreshes the library, and shows a "Recipe deleted." success notice. Guests
    never see the delete surface.
  **EVIDENCE (this session):**
  - unit: API 202/202 (recipes suite 40/40 incl. 6 new D6 service tests + 3 controller tests;
    storage suite +2) · web 104/104 (workspace delete suite 4 + home notice 1) · integration
    106/106 incl. NEW `tests/integration/story_d22_delete.test.ts` (4/4 real Postgres + real MinIO:
    cascade proof across recipe_input, recipe_ingredient_line, recipe_tag, analysis,
    analysis_view, analysis_claim, analysis_station_card, shopping_list_generation, shopping_list_item,
    ingredient_shopping_state, cook_log, cook_log_swap, cook_log_photo — every count 0 after delete,
    unrelated recipe untouched; CONFIRM_REQUIRED 400 + recipe survives; foreign/malformed/missing/
    repeated → canonical 404s; real MinIO upload → delete → objectExists false).
  - gates: QG2 regression gates PASS (8/8 golden) · contract-check OK · lint 0 · typecheck 0 ·
    verify-local ALL STEPS PASSED (exit 0) · git diff --check clean.
  - LIVE stack (internal browser, real Keycloak chef): created → analysed → saved "D6 QA delete
    me …" → Delete → confirmation names the recipe + "permanently removed" + "cannot be undone" →
    Cancel preserved the recipe → Delete → Delete (two explicit steps) → home with
    "Recipe deleted." notice, library row gone immediately → reload → row still absent → live-DB
    orphan sweep: orphanAnalysis/Views/Cards/CookLogs/Lines/Inputs = 0/0/0/0/0/0.
  - D-10→D-22 regression: full cumulative suites green (above); the D-20 station-card logic and
    D-22 save/library behavior untouched (only the delete surface added).
  **DECISIONS CARRIED:** D6 = the last D-22 deliverable — the canonical D-22 unit is now complete.
  Q1/Q5/Q9/Q10/Q11 stay OPEN · no DeepSeek · no D-23/D-30 (HARD STOP).
  **COMMIT/CI:** see the H-22 ledger entry (SHA + CI run id recorded after the push).

- 2026-09-11 — **Q9 PREFLIGHT (dispatcher authorization: implement Q9 — real DeepSeek LLM integration) — STARTING STATE, recorded before any Q9 code**:
  **DECISION (dispatcher 2026-09-11):** Q9 = the real LLM provider behind the existing LlmAdapter
  seam. Q1/Q5/Q10/Q11 stay OPEN; OCR disabled; D-23/D-30 out of scope.
  **CANONICAL SOURCES READ:** Tech Stack §10 (provider-neutral seam, vendor responses normalized
  before the domain) · ADR §19 + §14 (no indefinite retry of permanent config failures) · SCAFFOLD
  §7 Q9 (OPEN — benchmark wks 1–4) · D-15 prompts/validate (D-05 frozen schemas mandatory) · D-16
  grounding (single choke point) · D-17 worker (sole analysis writer; regenerate-once; pg-boss
  Q13-labeled retry 3/backoff) · D-18..D-22 implementations · packages/llm-adapter (MockLlmAdapter,
  promptsForRequest/buildViewPrompt, parseViewOutput, generateGrounded) · DISPATCH Q9 · TEST_PLAN §4
  (mocked providers in CI) · HANDOFF H-15..H-22 · CHANGE_LOG.
  **CREDENTIAL VERIFICATION (executed BEFORE any code, all secrets redacted):**
  - The dev `.env` (git-ignored — `.gitignore:16` verified) carries an LLM section:
    LLM_PROVIDER=deepseek, DEEPSEEK_API_KEY (present, 35 chars, NOT a placeholder; value never
    printed, never committed), DEEPSEEK_MODEL=deepseek-v4-pro, DEEPSEEK_BASE_URL=
    https://api.deepseek.com, DEEPSEEK_TIMEOUT_MS=60000, DEEPSEEK_MAX_RETRIES=2, ANALYSIS_LLM_STUB=0.
  - ONE minimal server-side connectivity test only: `GET https://api.deepseek.com/models` → HTTP
    200; account model ids = [deepseek-flash, deepseek-v4-pro] — the configured model identifier
    is VALID for the account/API; the base URL is reachable. Authorization header never logged.
  **Q9 DESIGN DECISIONS (labeled, recorded here BEFORE code):**
  - Q9-1: NEW `DeepSeekLlmAdapter` in packages/llm-adapter implements the existing `LlmAdapter`
    interface — no new abstraction; worker/provider wiring stays inside `resolveAdapter`.
  - Q9-2: Provider selection (observable, no secrets): `LLM_PROVIDER=deepseek` → DeepSeek;
    `ANALYSIS_LLM_STUB=1` still FORCES the deterministic stub (explicit determinism wins);
    otherwise the existing PendingAdapter (CI/tests never set LLM_PROVIDER → mock/stub path
    unchanged; CI never requires the key).
  - Q9-3: Prompt/context policy — the adapter composes ONLY the canonical D-15 pair
    (systemPromptFor + buildViewPrompt) plus the captured structured_recipe JSON as the user
    message tail ("the ONLY source of truth"). No other DB data is injected; PROMPT_VERSION
    unchanged; no prompt logic duplicated. Views 8/9 are NEVER sent to DeepSeek (buildViewPrompt
    refuses deterministic views; the D-19 producers are untouched).
  - Q9-4: HTTP — OpenAI-compatible `POST {base}/chat/completions` via global fetch (no vendor
    SDK); JSON extraction from the message content (code-fence tolerant) happens in the adapter so
    parseViewOutput receives parsed JSON; the frozen D-05 schema gate and the D-16 grounding gate
    stay downstream and mandatory.
  - Q9-5: Error mapping (canonical, recorded): 401/403/400 → `LlmPermanentProviderError` (new,
    exported from llm-adapter) — the handler treats it exactly like ProviderPendingError (failed,
    NO retry, ADR §14). 429/5xx → bounded in-adapter retries (DEEPSEEK_MAX_RETRIES, default 2,
    short backoff) then a transient error → the EXISTING pg-boss Q13-labeled retry path (limit 3,
    backoff) is unchanged. Network/timeout/malformed output → transient. Worker retry semantics
    are NOT modified.
  - Q9-6: Observability without secrets — the adapter exposes `providerName` + a non-secret
    `describe()` ('deepseek:deepseek-v4-pro'); the worker boots logs the selected adapter and the
    handler logs per-view attempts (latency, parse ok, grounding ok, regenerate). No headers, no
    keys, no environment dumps.
  - Q9-7: Real-call evidence — a designated live harness `scripts/verify-deepseek.js` (requires
    the env; never auto-run; CI-safe) drives the golden capture through the REAL pipeline
    (generate → parse → D-05 schema → D-16 grounding → publish decision) for Views 1–7 and prints
    status/latency/validation outcomes — never secrets. Unit tests use mocked fetch ONLY.
  - Q9-8: SCAFFOLD Q9 status changes ONLY after the real evidence is recorded (end of this
    session), never erased before.
  **PLAN:** llm-adapter (DeepSeekLlmAdapter + errors + providerName/describe + mocked-HTTP unit
  tests) → worker (resolveAdapter branch + boot/per-view telemetry + LlmPermanentProviderError
  handling + selection tests) → live harness script + ONE controlled real run (golden fixture,
  all 7 views, validation table) → full stack with LLM_PROVIDER=deepseek + internal-browser E2E +
  real-output quality inspection (no invented ingredients/method/garlic/ginger; Views 8/9
  deterministic) → full regression (mock path) + gates/lint/typecheck/verify-local → commit (no
  secrets) + CI (no key required) → HANDOFF/CHANGE_LOG/SCAFFOLD Q9 → HARD STOP.

- 2026-09-11 — **Q9 EXECUTION — DONE, evidence recorded before commit**:
  **IMPLEMENTED per Q9-1..8 (decision trace above, honored verbatim):**
  - `packages/llm-adapter/src/deepseek-adapter.ts` (new): `DeepSeekLlmAdapter` behind the EXISTING
    `LlmAdapter` seam — env-only key (`DEEPSEEK_API_KEY`, never logged/committed/returned),
    OpenAI-compatible `POST {base}/chat/completions` via global fetch (no vendor SDK), JSON
    extraction (code-fence tolerant) before the domain, prompt = the canonical D-15 pair +
    `STRUCTURED RECIPE OBJECT` (captured state only; no other DB data), `describe()`/`providerName`/
    `modelVersion` (non-secret provenance), typed errors: `LlmPermanentProviderError`
    (401/403/400, no retry) vs `LlmTransientProviderError` (429/5xx/timeout/malformed — bounded
    in-adapter retries, then the worker's existing pg-boss path). Views 8/9 never reach it
    (buildViewPrompt refuses deterministic views).
  - worker: `resolveAdapter` gains `LLM_PROVIDER=deepseek` (stub still forced by
    ANALYSIS_LLM_STUB=1; default pending — CI/tests never select the real provider and never need
    the key); boot log prints provider + model (no secrets); per-view attempt telemetry
    (provider/latency/parse/grounding); the handler treats `LlmPermanentProviderError` exactly like
    ProviderPendingError (failed, NO retry — ADR §14). `model_version` now stamped from the adapter
    (`deepseek:deepseek-v4-pro`) instead of the stub label. Worker retry semantics unchanged.
  - `scripts/verify-deepseek.js` (new): the designated live harness (env-gated, never auto-run,
    CI-safe) — golden capture → generate → parse → D-05 → D-16 → publish decision.
  - `.env.example`: Q9-resolved template (placeholder key; CI/mock note).
  **CREDENTIAL/MODEL EVIDENCE (all secrets redacted):** `.env` git-ignored (`.gitignore:16`); key
  present (35 chars, non-placeholder, never printed); ONE connectivity call: `GET /models` → 200,
  account models [deepseek-flash, deepseek-v4-pro] → configured model VALID; base URL reachable.
  **REAL-CALL EVIDENCE (controlled golden fixture, home mode):** harness run #1 — v1 COMPLETE
  (59.4s), v2 timeout (transient), v3 COMPLETE (178.5s), v4 timeout, v5 REJECTED by grounding
  (violations: "garlic" is explicitly_absent — referenced in a payload, refused), v6 COMPLETE
  (36.1s), v7 COMPLETE (5.7s) → 4/7 accepted; invalid/rejected output never published. Run #2
  (view 5, 240s timeout): parse ok, grounding violations(2) — the garlic absent-channel plant —
  REJECTED: the D-16 gate holds against the REAL model.
  **LIVE APPLICATION EVIDENCE (internal browser, full stack with LLM_PROVIDER=deepseek):** chef
  sign-in → golden paste → method → analyse → worker ran DeepSeek per-view (logs: v1 55.7s ok/ok,
  v2 violations→regenerate→parse-invalid→INCOMPLETE, v3 98.8s ok, v4 66.4s ok, v5 71.5s ok, v6
  103.1s ok, v7 36.3s ok) → analysis complete with `model_version = deepseek:deepseek-v4-pro`
  (DB-proven) and the UI "Model" field showing the real pin → views 1,3,4,5,6,7 COMPLETE (real
  provider), view 2 INCOMPLETE (honest refusal), views 8/9 COMPLETE (deterministic D-19 —
  band 716–1,018 kcal, sodium Unknown) → Chef mode renders the station card + chef tabs with real
  identification ("South Indian coconut-tamarind fish curry … Kerala-leaning [INFERRED]") → Save
  (blank) applied the REAL family default → library row → reopen → View 9 assumption edit (fish
  class → lean) → deterministic view9-recompute job processed (no LLM) with `fish_class: lean`
  persisted → delete → recipe gone, "Recipe deleted." notice.
  **QUALITY CHECK (real output):** no invented ingredient ids (grounding would reject); no
  garlic/ginger presence claims (the one garlic mention was REJECTED and never published); method
  steps grounded (view 3 tag METHOD); no "safe" wording; frozen contract held (parse ok on all
  published views); Views 8/9 untouched by the provider.
  **FAILURE PATHS TESTED (unit, mocked HTTP):** 401/403/400 permanent no-retry; 429/5xx bounded
  retries then transient; timeout transient; network-type transient; missing key permanent before
  any network call; malformed/non-JSON output transient; no-secret-in-body assertion.
  **REGRESSION (mock path — CI posture):** llm-adapter 101/101 · worker 48/48 · API 202/202 ·
  web 104/104 · integration 106/106 · gates PASS (8/8 golden) · contract OK · lint 0 · typecheck 0
  · verify-local ALL STEPS PASSED. Secret sweep: no key in tracked files (only env references +
  fake test keys); `git diff --check` clean; CI needs no key (mock path).
  **DECISIONS CARRIED:** Q9 = RESOLVED for the development provider (DeepSeek via the existing
  seam; benchmark/revalidation policy unchanged) · Q1/Q5/Q10/Q11 stay OPEN · OCR disabled ·
  no D-23/D-30 · local `.env` aligned to dev defaults (SESSION_SECURE=false + committed dev
  Keycloak secret) so the dev stack runs from `.env` alone.
  **COMMIT/CI:** commit `5bab9f4` (full `5bab9f475b3e4df47568d29d443db5091d720b66`) · CI success
  (run `34523068980`) — CI passed WITHOUT the DeepSeek key (deterministic mock path).

### H-10 — D-10 Raw intake rows + photo pipeline

- BASE_SHA / COMMIT_SHA: **BASE `871ec48` (Initial commit) · COMMIT `432b601`** — pushed to
  `github.com/mohamedazzim/recipe-systems` branch `main` (2026-09-08, owner-authorized push).
- Date / agent session: 2026-09-08 · D-10 dispatch session (preceded by Q4 pre-flight, H-05 trace).
- Status: **DONE** (implementation + tests + full verification below; dispatch D-10 done criteria met).
- Implementation summary:
  - `apps/api/src/modules/recipes/` — Web API's writer of `recipe` (ADR §2): `createForIntake`
    (account XOR guest owner, placeholder title 'Untitled recipe'), `assertOwned` (404 for
    missing AND foreign — no existence leak, INV-17), `removeIfIntakeEmpty` (D-10K compensation).
  - `apps/api/src/modules/intake/` — SOLE logical writer of `recipe_input` +
    `recipe_ingredient_line` (Q4 resolved): `recordPaste` (raw row + one verbatim draft line per
    non-empty raw line, atomic $transaction), `recordPhoto` (URI only, never a blob — ADR §3),
    `recordForm` (B5, service-level — no HTTP route in API §3 yet), `createDraftLines`,
    `listDraftLines`. Draft rows: shopping_key uuid, line_no card order, display_name = as-written
    text (B1 mixed units / "to taste" / vernacular verbatim), source_tag CARD, needs_review false
    (OCR flagging = D-11), amount/unit/quantity/category/confirmed_sense stay null (parsing = D-12).
    **No update/delete/upsert method for recipe_input exists in this service (immutability).**
  - `apps/api/src/modules/intake/storage.service.ts` — S3-compatible object storage
    (@aws-sdk/client-s3, MinIO dev): `ensureBucket` (idempotent bootstrap), `uploadImage`
    (JPEG/PNG, 10 MB cap, key `recipes/<uuid>.<ext>`, URI `s3://<bucket>/<key>`, upload failure →
    STORAGE_UPLOAD_FAILED and nothing persisted), `deleteObject` (best-effort rollback),
    `objectExists` (QG4 probe).
  - `apps/api/src/modules/intake/intake.controller.ts` — API §3 surface: POST /recipes/parse-text
    (HttpCode 200, GuestOrJwt+Csrf guards, zod-validated text, returns {recipe:{raw_text, lines[],
    flags:[]}} in the documented wire shape), POST /recipes/upload (201, multipart file, returns
    {recipe_id, image_id, file_key}); QG4 ordering: upload first, persist second, compensation
    deletes the object and (if no intake row landed) the empty recipe row.
  - Regression gate (scripts/regression-gates.sh): "recipe_input immutability" — fires on any
    `recipeInput.update/updateMany/upsert/delete/deleteMany` or raw `UPDATE/DELETE FROM
    recipe_input` outside migrations; fire-proofed in qg2_gates.test.ts (both ORM and raw SQL
    plants, scratch trees).
  - Env wiring: S3_ENDPOINT/S3_BUCKET/S3_ACCESS_KEY/S3_SECRET_KEY added to scripts/dev.sh,
    start-dev.cmd, STARTUP.md (.env.example already carried them).
  - jest.integration.config.js: moduleNameMapper for @recipe-systems/database + ts-jest
    esModuleInterop/decorators override (integration suites may now require app services).
- Files added:
  - `apps/api/src/modules/recipes/{recipe.service.ts, recipe.service.test.ts, recipes.module.ts}`
  - `apps/api/src/modules/intake/{intake.service.ts, intake.service.test.ts, storage.service.ts,
    storage.service.test.ts, intake.controller.ts, intake.module.ts}`
  - `tests/integration/intake_storage.test.ts` (real Postgres + real MinIO)
  - `tests/e2e/intake.spec.ts` (7 tests, real HTTP surface)
- Files modified:
  - `apps/api/src/app.module.ts` (IntakeModule) · `apps/api/package.json` (@aws-sdk/client-s3,
    @types/multer) · `jest.integration.config.js` · `scripts/regression-gates.sh` ·
    `tests/integration/qg2_gates.test.ts` (+2 fire-proofs) · `scripts/dev.sh` · `start-dev.cmd` ·
    `STARTUP.md`
- Tests executed and results:
  - Unit: intake/recipes/storage **25/25** (workspace total 251); includes B1 TC-02 two-fenugreek
    distinctness, verbatim mixed-unit/vernacular preservation, URI-only photo rows, ownership
    refusal, immutability surface assertion (no update/delete/upsert method names), QG4
    upload-failure → no-URI + rollback-delete behavior.
  - Integration **40/40** (real DB + MinIO): golden paste → 1 raw row + 11 draft lines with both
    fenugreeks distinct and ordered; photo upload → URI row whose object EXISTS in MinIO
    (QG4 no-dangling-URI); foreign guest session rejected with 404 (INV-17) and persisted nothing;
    QG2 gate fire-proofs incl. 2 new immutability plants.
  - E2E **25/25** (7 new intake): guest golden paste via HTTP, verbatim B1 preservation, 403
    CSRF_MISMATCH without token, 400 INVALID_TEXT, JPEG upload → 201 + file_key shape, 400
    INVALID_IMAGE for non-images, account signup→paste flow.
  - Lint clean · typecheck 0 errors · regression gates PASS (incl. new immutability gate) ·
    contract-check OK · `verify-local.sh` **exit 0 · ALL STEPS PASSED**.
- Decisions recorded (D-10A–D-10K): placeholder title (no title input in API §3); URI format
  s3://bucket/key; file_key recipes/uuid.ext; JPEG/PNG + 10 MB cap; source_tag CARD for drafts;
  form channel service-level only (B5, no HTTP contract yet); parse-text returns the documented
  wire shape with unparsed fields null (parsing is D-12); upload-first QG4 ordering with
  best-effort object+recipe compensation; ownership enforced inside IntakeService via
  RecipeService.assertOwned.
- Deviations: none vs. dispatch. Intentional non-changes: OCR (D-11), parse-review endpoints
  (D-12), method attach (D-13), enqueue gate (D-14) — untouched; openapi/openapi.json unchanged
  (the generator renders frozen schemas, not HTTP routes).
- Known limitations: recipe_input rows are write-once by design — no re-intake overwrite (new
  intake = new row); 'Untitled recipe' placeholder until title editing lands; form intake has no
  HTTP surface yet.
- Traceability: P2-1 · DISPATCH D-10 · ADR §2/§3/§4 · ERD §5 recipe_input/recipe_ingredient_line ·
  API §3 · Stories B1/B2/B5 · Q4 resolution (SCAFFOLD §7) · INV-03/INV-17 · TEST_PLAN QG4.
- Audit result: A-10 not yet executed — PENDING.

### H-10A — D-10A B5 structured form intake

- **Status: COMPLETE (2026-09-16).** Ships the B5 form HTTP route + web UI that D-10
  left as a service-only seam (`recordForm` with no route). A-10A = PASS-WITH-FINDINGS (one
  environmental MINOR, unrelated).
- **BASE_SHA:** `148bf6b` (D-25A). **Scope:** B5 only.
- **API:** `IntakeService.recordFormLines` (one `recipe_input` `input_type:'form'` row +
  one draft line per structured entry, synthesized `raw_text`) +
  `POST /recipes/form` (body `{ ingredients: [{ display_name, amount?, unit?, quantity?, category? }] }`
  → the same `{ recipe_id, recipe: { raw_text, lines, flags } }` wire as parse-text).
  `amount` is free-text (`amount_text`) — all B5 AC-2 units accepted verbatim.
- **Web:** `apps/web/components/app/FormIntake.tsx` (add/remove rows; name + amount) +
  a Paste/Structured-form toggle in `CreateView` (paste stays default).
- **No changes:** no schema/migration (input_type 'form' already in the D-02 CHECK), no
  OCR/DeepSeek, no analysis/shopping/print, no D-28/G3.
- **Verification:** API 349/349 (29 suites; intake service/controller additions) · web
  158/158 (20 suites; CreateView form test) · integration `story_d10a_form_intake` 3/3
  (form-typed row + structured lines; paste/form shape parity; ownership + 400 INVALID_FORM)
  · `regression-gates.sh` PASS · typecheck 0 · lint 0 · build 0.
- **Decision trace:** inspected (intake service/controller, CreateView, recipe_input +
  recipe_ingredient_line schema, B5 story) · already implemented (recordForm service seam)
  · missing (form route + web UI) · blocked: none · decision: add `recordFormLines` +
  `POST /recipes/form` + `FormIntake` UI, reusing the paste wire shape · changed: intake
  service/controller + CreateView/FormIntake + tests · intentionally not changed: D-28/G3,
  OCR, analysis, shopping, print, schema · risks: none (read/write follows the paste path;
  one-writer preserved) · resume point: re-run the 50-story development cross-check, then
  human verification (D-28).
- **D-28 remains PENDING HUMAN EVIDENCE — untouched.**

### H-11 — D-11 OCR adapter + low-confidence flagging

- **Status: DONE — CI tier shipped (2026-09-15); A-11 audit pending.** The STOP
  preflight below is superseded by an explicit dispatcher authorization (2026-09-15)
  to implement D-11 with **PaddleOCR** as the concrete provider behind the existing
  provider-neutral `ocr-adapter` seam. Q10 stays OPEN (no provider selection claimed);
  D-28 stays blocked (see H-28 — the §14 photo go-metric needs the real-card path, not
  the stub). The implementation record follows the preflight trace.
- **Date / agent session:** 2026-09-15 · DeepSeek V4 Pro (VS Code) — D-11 preflight
  (STOP) + D-11 implementation (dispatcher-authorized).

#### Verdict: STOP — missing provenance evidence (golden photo fixture + provider credentials)
- D-11 deliverable #3 requires a **golden PHOTO fixture** ("Fish 500g, Drumstick 1,
  Mango 1/2, Half Shell coconut, both fenugreeks, no garlic") asserted against OCR
  output with the **real-card corpus (D-04) in the benchmark harness** — plus a
  "real provider behind the adapter".
- **That evidence is missing and must NOT be fabricated** (hard constraint):
  - No provenance-valid golden recipe-card IMAGE exists in the repo (the golden
    fixture is JSON text; `tests/fixtures/corpus_images/` = 15 generic EN/FR cards,
    zero D-04 corpus correspondence, no manifest, provenance unverifiable — CHANGE_LOG
    2026-09-09 Q10 attempts #1/#2 both BLOCKED on exactly this).
  - No OCR provider credentials exist on the machine (credential sweep recorded).
- Consequence: D-11's benchmark-tier done criteria are unsatisfiable without that
  external evidence; A-11's "golden-OCR assertion" requires the real-card benchmark
  in addition to the stub.
- **Buildable subset (recorded for the dispatcher):** the CI tier is NOT blocked —
  the provider-neutral seam (`packages/ocr-adapter` already has the interface) + a
  deterministic OCR stub (CI) + the Intake photo→OCR→draft pipeline + `needs_review`
  flagging (INV-04) + QG4 error cells (timeout/down → preserve + retryable) are all
  stub-testable with no provider and no photo.

#### D-11 scope (DISPATCH D-11 = P2-2 = story B2 OCR intake)
1. Provider-neutral OCR adapter package (`packages/ocr-adapter`) — vendor responses
   normalized before the domain; real provider behind the seam, deterministic stub in CI.
2. OCR draft visible before analysis (B2 TC-02): `ocr_text` on draft lines;
   low-confidence lines `needs_review = TRUE`, never dropped (INV-04).
3. Golden photo fixture (B2 TC-03) asserted in the benchmark harness only.
- **NON-GOALS:** parse-review editing (D-12), analysis, provider selection (Q10).

#### Provider / adapter decision requirements
- Tech Stack §11: provider-neutral OCR adapter; **Google Cloud Vision = initial
  candidate** (not a final selection). The final provider is a Q10 benchmark decision
  (real-card dataset: handwriting, poor lighting, multilingual/vernacular terms).
- Q10 must stay OPEN; GCV is implemented behind the seam as the documented candidate
  (config-gated, no credentials committed) — NOT a silent selection.
- Confidence: if a provider exposes no reliable confidence, use a conservative review
  policy (flag more), never invent a score.

#### Integration points (existing code to extend)
- `POST /recipes/upload` (IntakeController) — currently stores the image + creates
  recipe/recipe_input; D-11 adds: OCR call → `recipe_input.ocr_text` + draft lines
  with `source_tag`/`ocr_confidence` + `needs_review = TRUE` for low-confidence.
- `recipe_input.ocr_text` / `recipe_ingredient_line.needs_review` /
  `ocr_confidence` (ERD §5) already exist in the schema (no migration needed).
- Intake is the sole writer of `recipe_input` + `recipe_ingredient_line` (Q4 resolved);
  `packages/ocr-adapter` stays a read-only, provider-neutral package (no DB writes).

#### Writers / gates
- No new writer: OCR draft lines ride the Intake boundary (Q4). `packages/ocr-adapter`
  must contain no database writes (QG2 render/read-only-style check if asserted).
- QG4 cells to add: OCR timeout/down → `recipe_input` + photo preserved, intake
  retryable; OCR low-confidence → `needs_review = TRUE`, analysis blocked (INV-05).
- QG2: a benchmark harness consumes the SAME adapter seam (its absence is a MAJOR at
  A-11; `scripts/ocr-benchmark.js` exists, self-test-only).

#### Privacy / retention
- ADR §20: photos are private object-storage objects; OCR text is untrusted input
  treated as raw `recipe_input.ocr_text` (never confirmed recipe truth — P-11).
- OCR provider receives ONLY the minimum image required (ADR §19 trust boundary);
  no private data beyond the card image. Retention rides the existing recipe-delete /
  guest-expiry compensating cleanup (D-22/D-27).

#### Open decisions (record with register IDs — do NOT resolve)
- **Q10** (final OCR provider) — OPEN/BLOCKED (the gating gap; real-card benchmark
  prerequisite). Q3 (Worker→OCR diagram edge) is a diagram patch, confirm before P2.
- Q1/Q5/Q6/Q11/Q12/Q14/Q15 — untouched. Q9 (LLM) resolved — not affected.

#### A-11 audit vectors (from AUDIT.md A-11)
- INV-04 (BLOCKER): low-confidence N lines → all N flagged, zero dropped.
- Adapter seam: vendor field names never leak past the adapter (MAJOR).
- Golden photo: stub + real-card benchmark both assert Fish 500g / Drumstick 1 /
  Mango 1/2 / Half Shell coconut / both fenugreeks / no garlic (missing = BLOCKER).
- QG4 cells: OCR timeout/down → preserved + retryable (kill the mock mid-intake).
- Q10 hygiene: no provider selection in this unit; benchmark harness interface exists.

#### Exact implementation resume point
1. Dispatcher provides the missing external evidence — a provenance-valid golden card
   PHOTO + ground-truth manifest + OCR provider credentials (outside the repo) — OR
   records an explicit, dated scope decision to ship D-11's CI tier only (seam + stub +
   pipeline + flagging + error cells) with the golden-photo benchmark deferred to Q10.
2. Then D-11: seam + deterministic stub (CI) + GCV candidate behind the seam (config-
   gated) · Intake photo→OCR→draft pipeline · INV-04 flagging · QG4 error cells ·
   `scripts/ocr-benchmark.js` consuming the seam.
3. D-28 remains blocked on Q10 (the §14 photo→first-analysis metric needs the REAL
   path, not the stub) — D-11 alone does not unblock D-28.

#### D-11 IMPLEMENTATION — shipped (2026-09-15, dispatcher-authorized)

- **Commit:** `1b1ab77` (D-11, pushed to `main`; CI run 34976615556 in progress at
  record time). BASE `a8c08e1` (A-27 docs).
- **Provider-neutral seam** (`packages/ocr-adapter/src/index.ts` rewritten): the
  `OcrAdapter` interface is now `recognize(image: Uint8Array, contentType: string):
  Promise<OcrResult>` (the image bytes cross the seam — never a URI). Exports
  `OcrProviderError`, `OcrTimeoutError`, and `resolveOcrAdapter(env)` which selects
  `paddle` → `PaddleOcrAdapter`, `stub` → `StubOcrAdapter`, otherwise `null` (OCR
  disabled). No vendor field name leaks past the adapter.
- **Deterministic stub (CI)** (`packages/ocr-adapter/src/stub.ts`): `GOLDEN_OCR_LINES`
  = 11 golden-card lines (Fish 500g, Drumstick 1, Mango 1/2, Grated Coconut Half Shell,
  Coconut Oil, Chilli 5, Chilli Powder 2, Coriander Powder 1, Tamarind, Fenugreek
  Powder 1/2 [conf 0.45 → LOW], Fenugreek 1/4) — both fenugreeks distinct, garlic
  absent. One deliberate low-confidence line exercises INV-04 (flagged, never dropped).
- **PaddleOCR adapter** (`packages/ocr-adapter/src/paddle.ts`): `PaddleOcrAdapter`
  POSTs base64 image bytes to `OCR_PADDLE_ENDPOINT` (default
  `http://localhost:8866/predict/ocr_system`), `AbortController` timeout
  `OCR_PADDLE_TIMEOUT_MS` (default 30000), model `PP-OCRv4`, version `paddleocr-3.x`.
  `normalizePaddleResponse` normalizes v2 `[box,[text,conf]]`, flattened
  `[box,text,conf]`, object `{rec_text,rec_score}`, and single-page wrappers; empty
  results return a valid empty `OcrResult` (unreadable, not thrown); HTTP/non-array →
  `OcrProviderError`; abort → `OcrTimeoutError`.
- **API OCR pipeline** (`apps/api/src/modules/ocr/ocr.module.ts` NEW @Global module
  with `OCR_ADAPTER` token via `resolveOcrAdapter(process.env)`; `IntakeModule`
  imports `OcrModule`). `IntakeService`: `OCR_CONFIDENCE_THRESHOLD = 0.9`,
  `ocrPhoto(actor, recipeId, inputId, image, contentType)` →
  `{status:'complete'|'pending'|'unreadable'|'disabled', draft_line_count,
  flagged_count, source_metadata}`; `persistOcrDraft` writes `recipe_input.ocr_text`
  via the **write-once** `updateMany({where:{id, ocrText:null}})` null-guard (P1
  immutability amendment) then `createMany` draft lines with `sourceTag:'CARD'`,
  `ocrConfidence`, and `needsReview` for confidence < 0.9 (missing confidence → flagged).
  `IntakeController.upload` calls `ocrPhoto` after `recordPhoto`: `pending` → 503
  `OCR_UNAVAILABLE` (photo + input row stay DURABLE — no OCR compensation; retry =
  re-POST); `unreadable` → 422 `OCR_UNREADABLE`.
- **Immutability gate P1 amendment** (`scripts/regression-gates.sh` gate 3b): the
  recipe_input write-once grep now permits ONLY the Intake OCR
  `recipeInput.updateMany` null-guard path (any other recipe_input write still fires).
- **Benchmark harness** (`scripts/ocr-benchmark.js`): `paddleProvider(imagePath)` +
  `GOLDEN_CARD_REFERENCE` / `GOLDEN_CARD_CRITICAL` + `runGoldenStub()` + `--golden-stub`
  CLI. Self-test + golden-stub both PASS (11/11 preserved, bothFenugreeksDistinct,
  garlicAbsent, 1 lowConf). Real PaddleOCR benchmark NOT executed (no Python on the
  machine; no provenance-valid golden photo) — Q10 prerequisite unchanged.
- **Tests:** `ocr-adapter` 13/13 (resolve, stub golden, paddle normalize shapes,
  mocked fetch success/timeout/non-200/rejection, env helpers; coverage floor 75%);
  `intake.service.test` 40/40 (+5 OCR: complete/persist+flag, missing-confidence→flagged,
  provider-failure→pending, empty→unreadable, no-adapter→disabled);
  `story_d11_ocr.test` 2/2 (photo→OCR→ocr_text+draft+flag+INV-05 block; provider
  failure→pending with durable input row); `qg2_gates` 24/24 (+2 D-11 P1 fire proofs:
  `recipeInput.update` fires, the Intake `updateMany` null-guard does NOT).
- **Verification (all re-run 2026-09-15):** API 312/312 (28 suites) · integration
  149/149 (23 suites incl. story_d11) · lint 0 (api + ocr-adapter) · typecheck 0 ·
  build OK (ocr-adapter + api + database) · `contract-check` OK ·
  `regression-gates.sh` PASS · `ocr-benchmark.js --self-test` + `--golden-stub` PASS.
- **Live journey (API with `OCR_PROVIDER=stub`, real Postgres/MinIO):** guest session →
  `POST /api/v1/recipes/upload` (JPEG) → `{ocr:{status:'complete', draft_line_count:11,
  flagged_count:1}}`; DB shows `recipe_input.ocr_text` = 11 lines (photo URI in MinIO)
  and 11 `recipe_ingredient_line` rows all `source_tag='CARD'` with line 10
  "Fenugreek Powder - 1/2 Tsp" `ocr_confidence=0.45` + `needs_review=true` (all others
  ≥ 0.9); after claiming the guest session onto chef@recipesystems.test,
  `GET /recipes/:id/enqueue-state` → `{can_enqueue:false, blockers:[{"display_name":
  "Fenugreek Powder - 1/2 Tsp"}]}` (INV-05 block verified live).
- **Register / open decisions:** **Q10 stays OPEN** (PaddleOCR is a config-gated
  concrete adapter, NOT a provider selection — no benchmark verdict, no credentials).
  **D-28 stays BLOCKED** on Q10 (real-card path). Q1/Q5/Q6/Q11/Q12/Q14/Q15 untouched;
  Q9 (DeepSeek) unaffected. PaddleOCR latency = "not measured" (no Python runtime);
  stub latency = 0 ms.
- **Resume point:** A-11 audit complete — **PASS-WITH-FINDINGS** (2026-09-15).
  Findings (AUDIT_LOG A-11): F-1 MAJOR — `scripts/ocr-benchmark.js` duplicates the
  adapter logic instead of consuming `@recipe-systems/ocr-adapter` (Q10 benchmark
  would exercise a different code path than the shipped adapter); F-2 MINOR — gate 3b
  whitelists `recipeInput.updateMany` without verifying the `ocrText: null` guard;
  F-3 MINOR — builder-session audit caveat. Golden-photo BLOCKER vector stays
  deferred to Q10 (no Python runtime / provenance-valid photo / credentials). Q10
  OPEN; D-28 still BLOCKED.
- **A-11 remediation (2026-09-15) — F-1 + F-2 CLOSED.** `scripts/ocr-benchmark.js`
  now consumes the production seam (`resolveOcrAdapter` / `PaddleOcrAdapter` /
  `StubOcrAdapter` — duplicated HTTP/normalization + inline `isItem` deleted);
  `--self-test` + `--golden-stub` still PASS. Gate 3b now requires the canonical
  `updateMany({` … `ocrText: null` guard (multiline `grep -Pzo`, write-form only)
  and fires on an unguarded `updateMany` or any `updateMany` outside Intake; two new
  fire proofs in `qg2_gates.test.ts` (26/26). Q10 still OPEN; D-28 still BLOCKED.

#### D-11 FRONTEND — photo upload user path (shipped 2026-09-15, post-A-11)

- **CreateView photo upload** (`apps/web/components/app/CreateView.tsx`): the
  "Photo capture — Coming soon" card is replaced with a functional upload — a file
  picker (`accept="image/jpeg,image/png"`, 10 MB cap mirroring `IMAGE_CONTENT_TYPES`
  / `MAX_IMAGE_BYTES`), a selected-image preview (`URL.createObjectURL`), a client
  type/size gate, and a loading state "Uploading photo & reading the card…". The
  upload POSTs `FormData.file` to the EXISTING `POST /recipes/upload` (new
  `apiUpload` helper — no Content-Type, CSRF + cookie credentials ride like `api`).
  Errors map to the existing Alert UX with a Retry that re-POSTs the SAME selected
  file (the backend keeps photo + input durable on OCR failure). `onUploaded`
  navigates to the workspace with the returned draft lines (mirrors `onParsed`).
- **Wire shape** (`apps/api/src/modules/intake/intake.service.ts`): `WireLine` now
  carries `ocr_confidence` (0–1, or null) and `source_tag` (six-value vocabulary;
  OCR lines = `CARD`) — so the review surface can show confidence + provenance
  without a second API. `POST /recipes/upload` now returns `lines` on a completed
  OCR pass (mirrors parse-text) so GUEST uploaders (who can never call the
  Bearer-only `GET /recipes/:id/lines`) still render the draft read-only.
- **Review UI** (`apps/web/components/app/IngredientReview.tsx`): each OCR line
  shows its confidence ("98% confident"; low-confidence < 0.9 gets the amber
  Warning treatment) and provenance ("from card") beside the existing
  Review-required / Sense-confirmed / canonical chips. Low-confidence lines remain
  visibly marked and analysis stays blocked (INV-05) until the flag is cleared.
- **Live internal-browser (2026-09-15, chef@recipesystems.test, API
  `OCR_PROVIDER=stub`):** Create recipe → Choose photo → preview (`card.jpg`) →
  Upload → workspace `Photo: card.jpg` with **11 OCR draft lines**, each showing
  confidence (98% … 45%) + "from card"; canonical resolution rendered
  ("Fish - 500g" → fish; "Drumstick - 1 Nos" → drumstick with the confirm prompt).
  Analysis section read "Review required — 1 line needs your attention:
  Fenugreek Powder - 1/2 Tsp" (INV-05 blocked); after Clear review it flipped to
  "Ready to analyse. All lines are confirmed." (blocked → ready).
- **Tests:** web 150/150 (CreateView upload/validation/loading/retry/error; IngredientReview
  confidence + provenance) · API 312/312 · integration 151/151 (story_d11 wire
  assertions: `source_tag`/`ocr_confidence`) · lint/typecheck/build/gates/contract
  green. `verify-local` destructive steps (`npm ci`, root `next build`) skipped
  locally (live dev servers) — CI runs the full pipeline.
- **Q10 still OPEN; D-28 still BLOCKED.** PaddleOCR runtime + provenance-valid
  golden photo + manifest remain absent (see Q10 preflight); no benchmark run, no
  latency/accuracy claim. The frontend path is verified against the deterministic
  stub only.
- **Q10 corpus determination (2026-09-15) — `ocr_sample_pics/` classified USER-
  SUPPLIED, provenance INSUFFICIENT.** The 15 `ocr_sample_pics/card-001..015.jpg`
  are BYTE-IDENTICAL (SHA256) to the existing `tests/fixtures/corpus_images/`
  generic EN/FR handwritten cards (Spaghetti Bolognese, Chicken Curry, Tomato Soup,
  Crêpes, Ratatouille, Vegetable Stir-Fry, …) — NOT the canonical golden card, and
  NOT provenance-valid: no manifest, no transcription, no source-of-record, no
  capture conditions, no D-04 correspondence. No manifest was built (ground truth
  cannot be legitimately derived; a model-transcription would be circular).
  PaddleOCR runtime still absent (no Python interpreter / paddleocr / serving).
  → **Q10 stays OPEN; D-28 stays BLOCKED.** Real benchmark not run; no latency /
  accuracy claim. (See CHANGE_LOG + AUDIT_LOG Q10 determination.)
- **Q10 TECHNICAL benchmark (2026-09-15) — synthetic fixture `ocr_q10_fixture/`
  through the REAL PaddleOCR adapter.** Brought up a local PaddleOCR runtime via
  Docker (`paddlecloud/paddleocr:2.6-cpu-latest`; paddleocr 2.6.1.0 · paddlepaddle
  2.3.0 · python 3.7.13 · flask 2.2.5 · PP-OCRv3 EN det/rec + ch cls), serving the
  production `POST /predict/ocr_system` contract on :8866. The synthetic golden
  card (`kanyakumari_meen_kuzhambu.png`, SHA256 `6E8A5731…D6CE74817`; manifest
  `C7461476…2E0163F0`, `fixture_status = synthetic_benchmark_fixture`) ran through
  `resolveOcrAdapter → PaddleOcrAdapter` (new `scripts/ocr-benchmark.js
  --q10-fixture` mode). Result: 25/26 reference lines preserved (96.15%), **6/6
  critical lines** (fish/drumstick/mango/coconut/both fenugreeks), garlic absent,
  both fenugreek lines distinct, 0 low-confidence lines, 20 char-errors, ~4.3 s
  OCR latency. Live browser (chef, `OCR_PROVIDER=paddle`): upload → 27 draft lines,
  each "from card" with 90–100% confidence, no garlic, no `needs_review` flags
  (all ≥ 0.9) → "Ready to analyse". Observed handwriting errors (fractions ¼/½ →
  '/4, /2; "1" → "I"; Ginger→"Ginqer"; Salt→"Salf"; "Drumstick – 1"→"Drumstick –")
  while the model stayed ≥ 0.9-confident — the EN model over-confides on these.
  **This is TECHNICAL validation only — it does NOT satisfy the canonical real-card
  provenance requirement. Q10 stays OPEN; D-28 stays BLOCKED.**
- **Q10 REAL golden-card benchmark (2026-09-15) — FAILED; Q10 stays OPEN.** The
  benchmark owner's real handwritten card `ocr_q10/golden/kanyakumari_meen_kuzhambu.png`
  (SHA256 `6989C633…43214C78`, lined notebook page, blue ink) was transcribed
  independently into `kanyakumari_meen_kuzhambu.manifest.json` (26 reference lines;
  critical = fish/drumstick/mango/coconut/both fenugreeks; forbidden = garlic) and
  run through the SAME production adapter (paddleocr 2.6.1.0, PP-OCRv3 EN). Result:
  **7/26 lines preserved (26.92%), 0/6 critical lines recognized** — the EN
  PP-OCRv3 model garbled the cursive handwriting (`Fish - 500 g`→`Fi$h+50og`,
  `Fenugreek Seeds - 1/4 tsp`→`FenugreakSeed-1/9tsp`, …), ~6.97 s latency, garlic
  absent, 24 low-confidence lines. Live browser: 26 draft lines, 24 flagged
  `needs_review`, analysis correctly BLOCKED ("24 lines need your attention") — the
  INV-04/INV-05 safety net works, but the OCR itself fails the canonical critical-
  line assertion. **Q10 = OPEN; D-28 = BLOCKED** (real-card benchmark not met;
  photo→first-analysis cannot complete while review is blocked). Remediation: a
  handwriting-capable model/config (documented PP-OCRv4 / paddleocr-3.x, or a
  handwriting-oriented recognition model) — re-benchmark after.

#### Q10 RESOLVED — DeepSeek Vision adapter (2026-09-15, dispatcher-authorized second provider)

- **Code:** NEW `packages/ocr-adapter/src/deepseek.ts` (`DeepSeekVisionOcrAdapter`,
  `DEEPSEEK_OCR_PROMPT`, `normalizeDeepSeekResponse`, `DEEPSEEK_OCR_PROVIDER='deepseek'`,
  `deepseekModel`/`deepseekBaseUrl`/`deepseekTimeoutMs`/`deepseekMaxRetries`/
  `deepseekOcrMaxTokens`/`deepseekOcrMaxTokensCap`) · NEW
  `packages/ocr-adapter/src/errors.ts` (`OcrProviderError`/`OcrTimeoutError` moved
  out of `index.ts` so providers can extend them at load time without a circular
  import; paddle/deepseek now import `./errors`, `index.ts` re-exports) · NEW
  `packages/ocr-adapter/src/deepseek.test.ts` (9 tests) · `index.ts` +
  `index.test.ts` updated (resolveOcrAdapter deepseek case). No API/web changes —
  Intake/review/readiness are downstream and unchanged.
- **Adapter contract:** sends the image (base64 data URI) to
  `POST {DEEPSEEK_BASE_URL}/chat/completions` (`model=DEEPSEEK_MODEL`, temperature 0,
  `max_tokens=DEEPSEEK_OCR_MAX_TOKENS` default 8192) with the transcription prompt
  (preserve wording/quantities/units; Fenugreek Seeds vs Powder distinct; no
  inference/correction/recipe knowledge; `[unreadable]` for illegible; output only
  lines). Uses ONLY `message.content` — `reasoning_content` is NEVER the
  transcription. No per-line confidence → lines carry NO confidence → Intake flags
  every line `needs_review` (Tech Stack §11: never invent a score).
- **Token-budget fix (the live 422 root cause, fixed + regression-tested):**
  `deepseek-flash` is a reasoning model whose `max_tokens` covers BOTH
  `reasoning_content` and `content`. At 4096 the chain-of-thought could exhaust the
  budget and return `content:""` (`finish_reason=length`) — surfaced as a false
  `OCR_UNREADABLE` (422). Default raised to `DEEPSEEK_OCR_MAX_TOKENS=8192`
  (`DEEPSEEK_OCR_MAX_TOKENS_CAP=32768`); on empty-content-with-non-empty-reasoning
  the adapter doubles the budget and retries (a `DeepSeekTruncationError`, never a
  false unreadable). Verified live: 4096 → empty content; 8192/16000/32768 →
  `finish_reason=stop` with the full transcription.
- **Canonical benchmark (`scripts/ocr-benchmark.js --q10-fixture`, production seam,
  `OCR_PROVIDER=deepseek` + DEEPSEEK env from .env):** **26/26 reference lines
  (100%), 6/6 critical lines, 0 char-errors, garlic absent, both fenugreeks
  distinct, no fabricated lines, `confidence_available:false` (26 lines flagged),
  `pass:true`, latency ~14.7 s** (run-to-run 9.3–25.6 s).
- **Live internal-browser (chef, API `OCR_PROVIDER=deepseek`):** upload golden card
  → workspace `Photo: kanyakumari_meen_kuzhambu.png` with **26 OCR draft lines**,
  every line "from card" + "Review required" (no confidence → conservative policy),
  garlic absent, Fenugreek Seeds/Powder distinct, METHOD + 6 steps preserved.
  Analysis section: "26 lines need your attention before analysis can begin"
  (INV-05 blocked) → cleared all 26 → "Ready to analyse. All lines are confirmed."
  → pasted the method → Analyse → worker (DeepSeek LLM, views 1–7 parse/grounding
  ok + deterministic views 8/9) → **"Analysis complete"** (`mode home`, `prompt v2`,
  `model deepseek:deepseek-flash`) with the station card rendering all 26 CARD
  lines. photo→OCR→review→analysis path VERIFIED end-to-end.
- **PaddleOCR regression:** adapter still functional (`OCR_PROVIDER=paddle` returns
  normalized lines + confidence); still FAILS the handwritten golden card (7/26,
  0/6 critical) as documented — no regression introduced by the seam changes.
- **Tests / verification (all re-run 2026-09-15):** `ocr-adapter` 24/24 (deepseek
  normalize + env + mocked fetch success/401/abort/truncation-retry/no-reasoning;
  paddle + stub) · `story_d11_ocr` + `qg2_gates` 28/28 on real Postgres ·
  `regression-gates.sh` PASS (8/8 golden invariants) · `ocr-benchmark.js
  --self-test` + `--golden-stub` PASS · lint/typecheck/build green (ocr-adapter +
  api + web; api/web unchanged).
- **Register:** **Q10 = RESOLVED (DeepSeek Vision, `deepseek-flash`)** — every
  acceptance criterion met (6/6 critical, garlic absent, fenugreeks distinct, no
  fabrication, safety gates intact, benchmark pass, live browser success, latency
  recorded, provenance recorded). **D-28 = UNBLOCKED (NOT implemented — next
  dispatch).** PaddleOCR stays available behind the seam but is NOT the selected
  provider. `.env` default remains `OCR_PROVIDER=disabled` (provider is env-selected;
  the live run sets `OCR_PROVIDER=deepseek`).

### H-12 — D-12 Parse review

- BASE_SHA / COMMIT_SHA: **BASE `93cc8e8` · COMMIT `8bd7708`** (full `8bd770884b3cab0422d27ffbe08540bff529cfd3`) — D-12 checkpoint pushed to `github.com/mohamedazzim/recipe-systems` branch `main` (2026-09-09, owner-authorized; parent verified `93cc8e8`).
- Date / agent session: 2026-09-09 · D-12 dispatch session (text/paste scope — OCR deferred by
  user directive; decision trace + D-12A…I decisions in HANDOFF §5 2026-09-09, recorded BEFORE code).
- Status: **IN PROGRESS (text scope shipped)** — the full parse-review editor for text-originated
  draft lines is implemented, tested, and verified; the PHOTO-path done criteria (golden PHOTO
  split test, OCR-flagged-line review) remain deferred until D-11 lands. NOT DONE.
- Implementation summary:
  - `apps/api/src/modules/intake/intake.service.ts` — D-12 review methods, all under the Intake
    writer boundary (Q4): `updateLine` (edit incl. amount_text/amount/unit/group_name/
    confirmed_sense/include_on_list), `markHeader` (is_header → soft-delete, D-12C),
    `softDeleteLine`, `splitLine` (split_point; NEW shopping_keys C-39; review flags inherited,
    parse fields reset; downstream line_nos shifted, direction-aware to satisfy the partial
    unique index), `mergeWithNext` (verbatim concatenation; needs_review OR'd — never silently
    cleared; ocr_confidence never carried), `addLine` (append), `parsePreview` (status derived
    from needs_review — D-12G, no new column). Stale-edit optimistic lock on `updated_at` (D-12D)
    → 409 STALE_EDIT with the current line. `recipe_input` untouched by every path (immutability
    gate green).
  - `apps/api/src/modules/intake/intake.controller.ts` — RS-US-08 routes per API §3:
    PATCH/DELETE `/recipes/:recipeId/lines/:lineId`, POST `.../split`, POST `/lines` (201),
    GET `/lines` (200 `{items}`), GET `/parse-preview` (200 `{status, lines}`). JwtAuthGuard per
    the doc's "Auth: Bearer" labels (D-12A) + CsrfGuard on state changes. Wire shape per D-12B
    (lines carry `id` + `updated_at`); parse-text 200 now carries `recipe_id` (D-12I — the review
    routes need it; upload already returned it).
- Tests (all real executions):
  - Unit `apps/api/src/modules/intake/intake.service.test.ts` — extended to 21 tests incl. split
    halves + shift, merge OR + soft-deletes, stale-edit 409, header soft-delete, wire mapping;
    API workspace suite **123/123**.
  - Integration `tests/integration/story_b3_parse_review.test.ts` (new) — **8/8**: TC-01 split
    wrapped line → corrected object = the 11 canonical lines; TC-03 raw byte-unchanged through
    split+edit+delete+merge; TC-02 header exclusion + fenugreeks distinct; D-12D stale-edit
    roundtrip; D-12F merge roundtrip; vernacular verbatim; D-12G confirmed; INV-17 foreign 404.
    Real bug caught + fixed: downward line_no shift collided on the partial unique index
    (recipe_id, line_no) WHERE deleted_at IS NULL — shift order is now direction-aware.
  - Full integration suite **48/48**; all-workspace unit **112/112**; regression gates **PASS**
    (incl. recipe_input immutability — test assertions rephrased to `not.toHaveProperty` so the
    gate's static pattern keeps firing only on real code paths); lint clean (fixed one
    no-unused-vars); typecheck clean; `verify-local` **exit 0 · ALL STEPS PASSED**.
  - E2E: `tests/e2e/review.spec.ts` (new, 5 specs) written against the live stack. **Not
    executable on this machine** — Playwright cannot launch any browser: corporate policy kills
    the launched process (exit code 1260, ERROR_BLOCKED_BY_POLICY; reproduced with chrome AND
    msedge channels, headed and headless; the bundled Chromium download is also network-blocked).
    Environment blocker recorded in HANDOFF §5; the spec remains canonical for machines where
    Playwright runs. Equivalent live-stack verification executed instead via the real HTTP
    surface (real Keycloak OIDC → session cookie → BFF → Postgres): **11/11 PASS** — paste,
    split, edit-with-mapped-fields, stale-edit 409 + reload recovery, is_header exclusion,
    delete 204, corrected object (headers excluded, fenugreeks distinct), parse-preview
    confirmed, 401 without session. Temp script outside the repo (not committed).
- Deviations recorded: D-12A…I in HANDOFF §5 (auth per doc labels; wire gains id/updated_at;
  is_header → soft-delete, no ERD column; stale-edit token name; split/merge contracts;
  parse-preview status derivation; sense confirmation free text until D-29; parse-text
  recipe_id).
- Intentional non-changes: OCR fields never written for text lines (`needs_review` false,
  `ocr_confidence` null); no D-11/D-13/D-14 code; no schema change (no is_header column — ERD
  v14 would be required); `recipe_input` immutability preserved; no dictionary rows invented
  (D-29).
- Resume point: photo-path D-12 criteria (golden photo split; OCR-flagged-line review) wait for
  D-11/Q10; D-13 (method attach) is the next dispatchable unit (separate unit, depends on D-12);
  D-14 needs D-11. A-12 audit not yet executed.

### H-13 — D-13 Method attach

- BASE_SHA / COMMIT_SHA: **BASE `83e6de0` · COMMIT `364d58b`** (full `364d58ba6e5ec7e5c439dbc302ea788ab2f63246`) — D-13 checkpoint pushed to `github.com/mohamedazzim/recipe-systems` branch `main` (2026-09-09, owner-authorized; parent verified `83e6de0`).
- Date / agent session: 2026-09-09 · D-13 dispatch session (pre-flight GO recorded in HANDOFF §5 BEFORE implementation).
- Status: **DONE (evidence below)** — all three dispatch done criteria satisfied in text scope.
- What shipped:
  1. **Method entry/attach on the corrected object, optional (B4 AC-1)** — `PATCH /recipes/:recipeId/method`
     (API §4, RS-US-09) via a new `RecipesController` (recipes module; JwtAuthGuard + CsrfGuard — Bearer
     only; guest method selection stays client-side per API §4). Modes:
     - `paste` → `method_text` + tag `METHOD` (no inferred source);
     - `inferred` → `method_text` + tag `INFERRED` + `method_inferred_source` = named source (REQUIRED —
       source-less INFERRED refused 400 `INVALID_METHOD`, A-13 MAJOR avoided);
     - `none` → all three method columns cleared → `list_only: true`.
  2. **Wire shape** `{method_tag: "METHOD"|"INFERRED"|null, method_source: string|null, list_only: boolean}`
     — derived from persisted state (`list_only := method_source_tag IS NULL`). `accept_inferred` accepted
     but redundant with `method:"inferred"` (D-13F).
  3. **No method + accepted matched family method → INFERRED with named source; Views 3/7 NOT INCOMPLETE**
     — `list_only: false` with tag INFERRED (dispatch criterion 2).
  4. **No method + list-only → Views 3/7 INCOMPLETE flag** — `list_only: true` (dispatch criterion 3; the
     rendering assertion stays in P3's view tests per the dispatch note — this unit proves the flag).
  5. **INFERRED provenance ready for C4** — tag + named source persisted on `recipe`
     (`method_inferred_source`); `analysis_claim` untouched (C4 = P3).
- Ownership: all writes in `RecipeService.attachMethod` (one-writer, ADR §2); no
  `recipe_ingredient_line` writes (Q4 boundary proven by integration test); no schema change.
- Non-changes (intentional): no GET-method route (D-13I), no identification/matching (P3), no Views 1–4
  generation, no D-14 gate, no OCR, no `analysis_claim` writes.
- Evidence:
  - API unit **128/128** (5 new method tests in `recipe.service.test.ts`);
  - integration (real Postgres) **54/54** — new `story_b4_method_attach.test.ts` 6/6: paste/inferred/none
    persistence, fresh-recipe list-only, Q4 boundary (no line writes), INV-17 foreign 404;
  - regression gates **PASS**; lint + typecheck clean;
  - `verify-local` exit 0 (D-13 run);
  - live-stack HTTP verification (Keycloak OIDC → BFF → Postgres) **10/10 PASS**: guest 401, paste 200
    METHOD, inferred 200 INFERRED + "CDK 1669 / Mrs. Anitha", none 200 list-only, source-less inferred 400,
    empty paste 400, unknown method 400, foreign actor 404; DB row confirmed `method_source_tag=INFERRED`,
    `method_inferred_source='CDK 1669 / Mrs. Anitha'`;
  - Playwright E2E `tests/e2e/method.spec.ts` written (5 specs) but NOT executable on this machine
    (policy exit 1260 — unchanged environment blocker). Side fix: parse-text status expectation 201→200 in
    review.spec.ts + method.spec.ts (canonical doc §3 says 200; confirmed live).
- Failures & recovery (full trace in HANDOFF §5): manual API restart used a wrong Keycloak client env
  (`recipe-systems-web` instead of `scripts/dev.sh`'s `recipe-systems-bff` → Keycloak "Client not found");
  live-check script skipped `#HttpOnly_` cookie-jar lines → sent `recipe_session=undefined` → JWSInvalid
  500 (script bug, not API); integration INV-17 assertion matched the wrong exception shape → corrected to
  `response.code`.
- Resume point: D-13 is complete in text scope; photo/OCR interplay for method-from-card is D-11/Q10-
  gated only if a card-extracted method ever becomes a D-unit requirement. Next dispatchable: **D-14
  (needs_review enqueue gate) — WAITING for explicit user authorization.**

### H-14 — D-14 needs_review enqueue gate

- BASE_SHA / COMMIT_SHA: **BASE `6146752` · COMMIT `bdbea9b`** (full `bdbea9b2ce7ec0532bd07e4be20e2e5895b3dfa8`) — D-14 checkpoint pushed to `github.com/mohamedazzim/recipe-systems` branch `main` (2026-09-09, owner-authorized; parent verified `6146752`).
- Date / agent session: 2026-09-09 · D-14 dispatch session (pre-flight GO recorded in HANDOFF §5 BEFORE implementation).
- Status: **DONE (text scope; photo golden scenario gated on D-11 — evidence below)**.
- What shipped:
  1. **Enqueue guard (INV-05)** — `IntakeService.getEnqueueState(actor, recipeId)` → wire
     `{ can_enqueue: boolean, blockers: [{ line_id, display_name }] }`. Read-only; reads the canonical
     `needs_review` flag only (no shadow state — A-14); ACTIVE = `deleted_at IS NULL` (soft-deleted
     flagged lines never block); `assertOwned` inside (INV-17 404). THE single implementation P3's
     enqueue must reuse (A-14: duplicates = MAJOR) — D-14F: the actual refusal wiring is P3's
     (no enqueue path exists yet); the guard is the shared check.
  2. **User-visible blockers** — `GET /recipes/:id/parse-preview` now carries
     `enqueue: { can_enqueue, blockers }` (D-14B, additive — no new endpoint; the API doc defines
     none). The UI sees what blocks, line by line.
  3. **Clearing path (done criterion)** — review PATCH gains `needs_review: false`
     (zod `z.literal(false)`: clients can never SET the flag — `needs_review: true` → 400
     `INVALID_LINE_EDIT`; OCR/D-11 owns true; clearing is an explicit user confirmation only —
     ordinary edits never touch the flag, no auto-clear). Clearing the last flagged line unblocks
     immediately (proven at service + integration + live-HTTP level).
  4. **Shadow-state gate** — new static regression gate: persisted enqueue-readiness names
     (`enqueue_ready|analysis_ready|review_complete|can_enqueue|ready_for_analysis`) in .prisma/.sql
     fire the gate (A-14 drift MAJOR); qg2 plant-proofs added (schema + raw-SQL plants). Wire names in
     .ts are derived, not state — deliberately out of gate scope.
- Non-changes (intentional): no new endpoint, no schema change, no enqueue implementation (P3), no
  D-11/OCR, no auto-clear, no new writer (Q4: the gate writes nothing — proven by test).
- Evidence:
  - API unit **134/134** (6 new D-14 tests: blocked/clean/soft-deleted-excluded/404/clear/no-auto-clear);
  - integration (real Postgres) **62/62** — new `inv05_enqueue_gate.test.ts` 6/6 (file named by
    invariant, not story ID — D-14 has no story; deviation recorded): clean enqueues; planted flag
    (D-11 simulation) blocks named line by line; clearing via review unblocks immediately; soft-deleted
    flag never blocks; foreign 404; gate writes nothing (byte-identical rows); qg2 +2 plant proofs;
  - regression gates **PASS** (new INV-05 gate armed); lint + typecheck clean;
  - `verify-local` exit 0 (D-14 run);
  - live-stack HTTP (real OIDC → BFF → Postgres, DB-planted flag) **8/8 PASS**: clean can_enqueue;
    flagged → blocked with line named; needs_review:true → 400; review clear → unblocked immediately;
  - Playwright `tests/e2e/enqueue-gate.spec.ts` written (2 specs, env-blocked as documented).
- Failures & recovery (HANDOFF §5): wire initially leaked camelCase (`canEnqueue`) — canonical wire
  is snake_case (D-13 MethodState convention); renamed EnqueueState to wire shape; a reckless
  replace_all in the unit test renamed service-internal camelCase identifiers — reverted surgically
  (model fields/LinePatch stay camelCase; only wire assertions snake_case).
- Text-scope limitation: text lines are born `needs_review=false`; flags are planted at DB level in
  tests exactly as D-11 OCR will produce them. The photo golden scenario (photograph → flagged →
  blocked → review → enqueuable) completes when D-11 lands; the gate is channel-agnostic.
- Resume point: **D-15 (P3-1 prompt specs) or D-11/Q10 when OCR re-opens — WAITING for explicit user
  authorization. P2 remaining blockers: D-11 ⏸ (Q10 OPEN — needs real card corpus + provider creds);
  D-12 photo-path criteria pending D-11.**

### H-15 — D-15 Prompt specs + prompt_version

- BASE_SHA / COMMIT_SHA: **BASE `50bd215` · COMMIT `1b4b2f3`** (full `1b4b2f3cdab8cfc431786959ff6cae08de5d2fca`) — D-15 checkpoint pushed to `github.com/mohamedazzim/recipe-systems` branch `main` (2026-09-09, owner-authorized; parent verified `50bd215`).
- Date / agent session: 2026-09-09 · D-15 dispatch session (pre-flight GO recorded in HANDOFF §5 BEFORE implementation).
- Status: **DONE** — all three dispatch done criteria satisfied; evidence below.
- What shipped (all in `packages/llm-adapter`, the Tech Stack §10 LLM layer — no layout change):
  1. **Prompt spec per view** — `src/prompts/views.ts`: views 1–7 carry the canonical ROLE/TASK/OUTPUT
     SCHEMA/rules text (pinned to Analysis Prompts §2–§8, provenance per spec) + each view's home/chef
     mode focus from the Recipe_Systems §7 table; views 8/9 marked `kind: 'deterministic'` (Deterministic
     Views doc) — no prompt invented (D-15C). `buildViewPrompt(view, mode)` assembles the pair.
  2. **Home/chef system prompts** — `src/prompts/system.ts`: the shared lens verbatim (Analysis Prompts
     §1: six-tag vocabulary, 7 hard rules) + `HOME_MODE_OVERLAY` (explains) / `CHEF_MODE_OVERLAY`
     (briefs — voice, required blanks, refusal) authored from Recipe_Systems §7 (D-15D).
     `systemPromptFor(mode)` = shared + overlay; per-view mode focus injected into the user prompt.
  3. **Validation + QG4 trigger** — `src/prompts/validate.ts`: `parseViewOutput(view, raw)` =
     `VIEW_SCHEMAS[n].safeParse` (frozen, strict) — THE single gate D-16/D-17's regenerate path keys
     off; malformed output → `{ ok: false, errors }`, never published (D-15E).
  4. **prompt_version** — `src/prompts/version.ts`: `PROMPT_VERSION = 'v2'` (the canonical
     Analysis_Prompts.md version, D-15B) + provenance. The `analysis.prompt_version` write is D-17's
     (worker owns analysis_* writes — INV-03); D-15 exposes the pin (D-15G).
  5. **Adapter seam** — `src/index.ts`: `LlmAdapter.generate({ view, mode, recipe_snapshot,
     prompt_version, model_version })` + `MockLlmAdapter` (fixture-driven, zero network, deterministic,
     throws on unregistered keys — never invents) + `generateValidated` (generate→parse). No provider
     pinned, no credentials (Q9 stays OPEN); `recipe_snapshot` stays `unknown` at the seam (Q1 OPEN —
     D-17 builds to the labeled assumption) (D-15F/H).
  6. **Packaging (D-15L)** — `packages/schemas/package.json` main/types now point at `dist/` (the
     package already had a tsc build + dist output; src/index.ts remains the canonical SOURCE surface
     per SCHEMA_FREEZE). Mirrors the database package's dist-main + jest-src pattern. No schema/contract
     change — the freeze record is untouched.
- Non-changes (intentional): no identification/station-card prompts (P3-4/D-18 scope, D-15J); no
  worker/enqueue code; no regenerate LOOP (D-16/D-17); no provider; no analysis_* writes; no schema
  edits; Q1/Q9 not resolved.
- Evidence:
  - llm-adapter unit **52/52** (4 suites): schema-conformance suite with HAND-CHECKED instance
    documents — 7 valid + 7 malformed LLM-view instances run through `parseViewOutput` against the
    frozen schemas (A-15 BLOCKER cell, run not read); deterministic 8/9 through the same gate;
    full hand-checked AnalysisEnvelope (all nine views, both modes) parses;
  - reproducibility proven: same `PROMPT_VERSION` + same mock + same input → byte-identical output,
    run twice (A-15 MAJOR contract); mode separation: home vs chef prompts differ AND mode-scoped
    fixtures differ on the same recipe;
  - QG4 cell: malformed model output rejected end-to-end through `generateValidated`;
  - Q9 hygiene asserted: no provider name/key/endpoint anywhere in the seam;
  - workspace unit + lint + typecheck green; regression gates PASS; `verify-local` exit 0 (D-15 run);
  - live-stack: not applicable (no HTTP surface — the seam runs inside the future worker; recorded
    honestly per D-15K).
- Failures & recovery (HANDOFF §5): jest moduleNameMapper path miscount (one `../` short) → fixed;
  test-compile issues (wrong relative import, zod `_output` type misuse) → fixed; VALID_VIEW_9
  fixture initially missed `tightening_factors`/`disclaimer` and carried an invented `notes` key —
  corrected to the frozen schema (the .strict() schemas caught it — the gate works); two test regexes
  didn't account for template line-wrapping/case → fixed.
- Resume point: **D-16 (P3-2 grounding validator) — WAITING for explicit user authorization.**
  D-15's seam + `parseViewOutput` are D-16's inputs. D-11/Q10 remain deferred.

### H-16 — D-16 Grounding validator

- BASE_SHA / COMMIT_SHA: **BASE `46fd99f` · COMMIT `1c2741f`** (full `1c2741f7ec94d7633f76986ca6bd5579178523c8`) — D-16 checkpoint pushed to `github.com/mohamedazzim/recipe-systems` branch `main` (2026-09-09, owner-authorized; parent verified `46fd99f`).
- Date / agent session: 2026-09-09 · D-16 dispatch session (pre-flight GO recorded in HANDOFF §5 BEFORE implementation).
- Status: **DONE** — all three dispatch done criteria satisfied; evidence below.
- What shipped (all in `packages/llm-adapter/src/grounding/` + pipeline wiring in `src/index.ts`):
  1. **Grounding validator (ADR §6, INV-10)** — `validateViewGrounding(view, payload, captured)` +
     `validateClaimGrounding(claim, captured)` + `validateClaimsGrounding(claims, captured)`.
     Mechanical reference vocabulary (D-16C): captured ingredient ids, per-line name tokens
     (display_name/canonical_name/confirmed_sense), method-step ids, `explicitly_absent` list.
     Checks: structured `ingredient_id`/`ingredient_ids`/`source_ingredient_ids` references in
     views 1/2/4 must resolve to captured ids; absent-channel scan — any mention of an
     `explicitly_absent` item inside a view payload or a non-ABSENT claim fails; claim rules —
     CARD/METHOD cite a captured id AND the text carries the cited line's name token (reworded-capture
     catch), ABSENT-for-captured = MAJOR, INFERRED cites a named pattern, UNKNOWN/ASSUMED have no
     positive-reference channel.
  2. **ABSENT rule** — non-captured items valid ONLY via tag ABSENT or the captured
     `explicitly_absent` list (SCAFFOLD §6 no-invention; Recipe_Systems §3.1).
  3. **Regenerate-once (A-16)** — `groundingAttempt(attempt, violations)`: attempt 1 → `regenerate`
     + correction instruction (formatted for re-prompt); attempt 2 → `incomplete`; attempt ≥3
     THROWS (third silent attempt = BLOCKER). The worker's loop is D-17's; D-16 provides the decision.
  4. **Choke point (deliverable 3)** — `generateGrounded(adapter, request, captured)` =
     generate → parseViewOutput (schema) → grounding verdict; the single entry the worker uses.
     Malformed output is rejected before grounding (schema first).
- Scope boundaries (intentional, recorded): captured state = the frozen StructuredRecipeInput as a
  PARAMETER (Q1 stays OPEN — no persistence model invented); no provider (Q9 OPEN); no worker
  plumbing; no analysis_* writes; view 5's regional-contrast text has no structured ids (only the
  absent-channel scan applies; human-gated G2); unknown-word detection beyond the captured
  vocabulary is not built (no canonical lexicon — dictionary = Q5/Track R).
- Evidence:
  - llm-adapter unit **89/89** (5 suites; +37 grounding tests): grounded output passes; plants —
    invented ingredient id, reworded id, garlic/ginger smuggled into view payloads (absent channel),
    invented ingredient in a CARD claim, reworded capture (text never names the cited line),
    ABSENT-for-captured MAJOR — every plant caught; sanctioned ABSENT claims pass; regenerate-once
    semantics incl. third-attempt throw; choke-point chain (valid → green, planted → fails at
    grounding, malformed → rejected before grounding);
  - golden-fixture integration (new `tests/integration/story_d16_golden_grounding.test.ts`,
    real `golden_kanyakumari_card.json`) **6/6**: captured vocabulary resolves all card lines;
    hand-checked golden claims (fish, fenugreek powder/seeds as distinct, garlic/ginger ABSENT) all
    green; both fenugreek lines structurally distinct; garlic-positive, ginger-in-view-8, and
    invented-id plants all caught — DISPATCH done criterion 1;
  - workspace unit/lint/typecheck green; regression gates PASS (existing one-writer + golden-check
    gates cover the static surface — D-16K: no new static gate); `verify-local` exit 0 (D-16 run);
  - live-stack: not applicable (pure function — no HTTP surface introduced).
- Failures & recovery (HANDOFF §5): missing `source_ingredient_ids` in the reference collector
  (view-2 pillar plant slipped through) → added; refactor dropped single-string `ingredient_id`
  handling → restored string+array handling; `ViewPayload`/`GroundingVerdict` import-path errors →
  fixed; test-fixture issues (CAPTURED lacked fixture ids; reworded-capture text still contained the
  captured token; a "malformed" payload that actually parsed) → fixtures corrected — the validator
  itself held.
- Resume point: **D-17 (P3-3 analysis worker) — WAITING for explicit user authorization.** D-17's
  documented inputs are all in place: D-15 pipeline + mock, D-16 grounding + regenerate-once.
  D-11/Q10 remain deferred.

### H-17 — D-17 Analysis worker

**Status: DONE** (done criteria 1–4 pass; evidence below is real execution output).

- Sources: DISPATCH D-17; BUILD_PLAN P3-3; ADR §5/§6/§14; Tech Stack §9/§13; A-17; frozen
  D-05 schemas. Pre-flight GO recorded in §5 before any code.
- **Q1 gate result: GO with a LABELED working assumption** — DISPATCH D-17 deliverable 2
  explicitly permits the worker/job-payload captured-state approach while Q1 is OPEN
  (BUILD_PLAN §7.2 formal decision due week 5/P7). `recipe_snapshot` stays `unknown`.
- Implementation (one-writer preserved — A-17):
  - API `apps/api/src/modules/analysis/`: `POST /recipes/:recipeId/analyse` (RS-US-13) — GuestOrJwt
    + CSRF → ownership → **D-14 gate via `getEnqueueState`** (409 `ENQUEUE_BLOCKED` + blockers) →
    422 `METHOD_REQUIRED` (list_only, API §5) → pg-boss send with the Q1 job payload
    (`{recipe_id, mode, prompt_version, captured:{structured_recipe}}`, pre-generated analysis UUID)
    → **200** `{analysis_id, status:'queued', prompt_version}`. `GET /analysis/:id` (read-only;
    UUID guard → clean 404; INV-17 ownership) + SSE `GET /analysis/:id/events` (snapshot replay on
    connect, NOTIFY-driven pushes; connect-before-materialization streams from `queued` — signal-only).
    Queue + events services degrade gracefully (QG4 posture). NO analysis_* writes in the API.
  - Worker `apps/analysis-worker/`: `AnalysisJobHandler` — idempotent upsert, NOTIFY on every
    transition, views 1–7 through the **D-16 `generateGrounded` choke point with regenerate-once**
    (attempt-2 failure → view INCOMPLETE with payload `{}` — ungrounded output never published);
    views 8/9 persist INCOMPLETE (deterministic producers = D-18); `finalize()` flips `is_current`
    others-off-first in one transaction (INV-09, partial-unique safe); duplicate delivery after
    completion short-circuits (INV-11); ProviderPending (Q9) → `failed`, job completes without
    throw (no pointless retries, ADR §14); transient → `failed` + throw (pg-boss retry, Q13-labeled
    3/2s/backoff pilot defaults). Boot sweep: stale `generating` → failed (P3 exit). Model pin =
    labeled `stub-no-provider-q9`; adapter resolution = `ANALYSIS_LLM_STUB` env (fixture adapter) or
    the labeled pending adapter — **Q9 untouched**.
  - Migration `003_analysis_view_upsert_unique`: Prisma `@@unique` declaration for the existing
    `uq_analysis_view` (002) — metadata alignment for idempotent upserts; `IF NOT EXISTS` no-op
    on existing DBs. No new columns/constraints.
  - pg-boss pinned **v10.4.2** (CJS; v12 is ESM-only and incompatible with this stack).
- Failures & recovery (all recorded, all fixed):
  1. pg-boss v10.4 delivers a BATCH (array) to work handlers — single-job callback threw on
     `data.analysis_id` of undefined → silent worker + jobs failed after 3 retries. Repro script
     proved it; callback now iterates the batch.
  2. POST analyse defaulted 201 → `@HttpCode(200)` (the ACK is not a resource creation).
  3. Non-UUID analysisId → Prisma P2023 500 → UUID format guard → clean 404 (live-check catch).
  4. SSE connect racing the worker (row not yet materialized) → stream from `queued` (INV-16
     signal-only channel; content never flows).
  5. CI-only typecheck failure (D-15 schemas dist-main never built before typecheck; runs 13/14
     red) → fixed `ci.yml` + `verify-local.sh` (schemas build step) in commit `1140ef4`; run
     34343407523 green. See §5 pre-flight trace.
- Evidence:
  - Unit: worker 9/9; API 139/139; llm-adapter 89/89 (unchanged).
  - Integration `tests/integration/story_d17_worker_loop.test.ts` 4/4 (real Postgres + pg-boss,
    dedicated per-run queue): complete loop (9 views, 7 COMPLETE, one current, v2, model pin),
    provider-pending → failed-not-stuck, INV-09 single-current flip, stale-sweep.
  - Live stack (real Keycloak OIDC + real worker process): **15/15** — anonymous 403, parse →
    422 METHOD_REQUIRED → analyse 200 queued → complete (9 views, v2, stub-no-provider-q9,
    is_latest) → re-analysis flips current → foreign 404 → SSE snapshot replay. SSE live-push
    check: `snapshot:queued → status:generating → status:complete` (INV-16 push half).
  - verify-local exit 0 ALL STEPS PASSED; regression gates PASS; lint/typecheck clean.
    Playwright remains environment-blocked (policy); HTTP verification never misrepresented.
- OPEN after D-17: Q1 (job-payload assumption is labeled/temporary), Q5, Q9, Q10/D-11, Q13 (P7
  revalidation). Resume point: **D-18 (Views 1–4 + home mode) — awaiting explicit dispatch.**

### H-18 — D-18 Views 1–4 + home mode

- BASE_SHA / COMMIT_SHA: **BASE `6b618a2` · COMMIT `8c59a9d`** (full `8c59a9d6ce59e59a429b2a8a62a473e8497ae8e3`) — pushed to `github.com/mohamedazzim/recipe-systems` branch `main` (2026-09-09, owner-authorized).
- Date / agent session: 2026-09-09 · D-18 dispatch session (pre-flight GO recorded in HANDOFF §5 BEFORE code). Backfilled into this ledger 2026-09-10 from the §5 execution record + CHANGE_LOG (evidence re-verified by direct inspection; no criteria invented).
- Status: **DONE** (implementation + verification). Formal entry was "No entry yet" until this backfill — evidence always lived in HANDOFF §5 + CHANGE_LOG.
- Summary: read-only `GET /recipes/:recipeId/analysis` (API §5, RS-US-13, GuestOrJwt) — latest current analysis + view rows, INV-17 404 for missing/foreign, UUID guard; web `AnalysisViews` (identification C1 from the persisted view_5 payload, Tabs over Views 1–4 in home voice, claim tags, View 2 blind-spot visible, View 3 incomplete reason, unavailable/refused states never invented) replacing the "coming next" placeholder; `lib/views.ts` (UNKNOWN blanking, name resolution with visible unresolved ids); workspace lifts lines + method state and reopens on the latest analysis; worker dev stub (Q9-labeled) builds payloads from the captured ingredient ids so the D-16 grounding gate validates the same state.
- Files changed: `apps/api/src/modules/analysis/analysis.controller.ts` (+test), `apps/web/components/app/{AnalysisViews,AnalysisPanel,IngredientReview,RecipeWorkspace}.tsx` (+tests), `apps/web/lib/views.ts`, `apps/web/jest.config.js`, `apps/analysis-worker/src/adapter.ts` (+test), `docs/CHANGE_LOG.md`, `docs/HANDOFF.md`.
- Test results: web 69/69 · API 148/148 · worker 21/21 · integration 73/73 · gates PASS · lint/typecheck clean · live HTTP 13/13 · verify-local exit 0. Re-verified 2026-09-10 (post-D-29 tree): API 160/160, worker 21/21, web 69/69, integration 68/68 (+qg2 13/13 with the Git-Bash PATH fix — Windows-only environment issue, CI unaffected).
- Done-criteria evidence: Views 1–4 + identification render on the golden-style flow (live analyse → views 1–4 COMPLETE with payloads → view_5 identification → views 8/9 INCOMPLETE — honest refusal states, INV-10); golden invariants stay green (gates); grounding failure → view INCOMPLETE never current (D-16 gate exercised by the stub path); failed jobs never stuck at generating (D-17 states).
- Gate evidence: QG2 regression gates PASS; golden invariant evaluation green; QG1 coverage floors met.
- OPEN DECISION notes: Q1 (job-payload assumption continued, labeled), Q5, Q9 (stub labeled `stub-no-provider-q9`, dev-only), Q10 untouched.
- Deviations: identification block renders from the persisted view_5 payload (the only persisted identification source); the envelope's `absent_on_card` has no persisted row → honestly omitted (recorded in the pre-flight, never invented).
- Audit result: A-18 not yet executed — PENDING.

### H-19 — D-19 Views 5–9

- BASE_SHA / COMMIT_SHA: BASE `82f88b6` · COMMIT `46c0559` (full `46c0559fa7ac7668671b7f60776b9c49d93c72da`).
- Date / agent session: 2026-09-10 · D-19 dispatch session (pre-flight GO + recompute working assumption accepted by the dispatcher BEFORE code — recorded in HANDOFF §5).
- Status: **DONE** (implementation + verification; audit A-19 pending — dispatched after this checkpoint per convention).
- Summary: Views 5–9 shipped — deterministic View 8 (versioned allergen mapping via `dietary_allergen_definition/mapping`, `analysis_claim.allergen_id` semantics honored by construction) and View 9 (band from `nutrition_food_composition_entry/version`, USDA per-100g values) computed in the analysis worker with NO LLM; Views 5–7 presented from the persisted LLM/stub payloads; H6/I6 disclaimers verbatim on every View 8/9 surface; I2 assumption editors (fish class, coconut grams, oil tablespoons) → RS-US-45 PATCH → deterministic pg-boss recompute job → worker-only write → band recomputed; assumptions persist in `analysis_view.payload.assumptions`.
- Files changed: `apps/analysis-worker/src/{deterministic-views.ts(+test), analysis-job.handler.ts(+test), main.ts}` · `apps/api/src/modules/analysis/{analysis.controller.ts(+test), analysis.service.ts(+test), analysis-queue.service.ts}` · `apps/web/components/app/{AnalysisViews.tsx(+test), AnalysisPanel.tsx(+test)}` · `apps/web/lib/{views.ts, hooks/useAnalysisStatus.ts}` · `tests/integration/story_d19_views_8_9.test.ts` (new) · `tests/integration/story_d17_worker_loop.test.ts` (D-19 update) · `docs/{HANDOFF,CHANGE_LOG}.md`.
- Test results: worker 30/30 · API 171/171 · web 82/82 · integration 83/83 (real Postgres, live D-29 reference load; snapshot hygiene re-verified) · gates PASS (8/8 golden invariants) · lint 0 · typecheck 0 · verify-local exit 0 · CI green (run id at checkpoint).
- Done-criteria evidence: Views 5–9 render (live browser: all nine tabs; integration asserts the persisted rows) · View 8 flags fish + mustard-capable mapping, coconut NOT filed as US major tree nut (integration asserts no `tree_nuts`) · View 9 band around 1,300–2,200 kcal pot scale on golden-card amounts (integration asserts 1,306–2,223) with sodium Unknown · assumption edit recomputes the band (live: 716–1,018 → 893–1,018 kcal; integration: fish_class lean collapses the band) · disclaimers verbatim on every View 8/9 surface (unit + integration assert exact strings) · "safe" nowhere (INV-13 static + unit assertions) · no point-kcal (band min < max asserted).
- Gate evidence: QG2 regression gates PASS with the one-writer gates enforcing (API adds queue-enqueue only — no analysis_* writes; verified by the gate grep) · golden 8/8 invariants green.
- OPEN DECISION notes: Q1 OPEN (recompute input rides the job-payload capture — labeled, not resolved) · Q5 OPEN (D-19 reads dictionary/alias only) · Q9 OPEN (Views 5–7 stub in dev; Views 8/9 need no provider) · Q10 OPEN (no OCR) · ERD §15.4 recompute granularity labeled (View 9 only; Views 1–7 never regenerated).
- Deviations: RS-US-45 200 is `{analysis_id, status:'recompute_queued', assumptions}` instead of the synchronous recomputed band (one-writer + single-implementation hygiene; recorded in §5) · I7 unmapped listing carried as ASSUMED-tagged assumption entries (frozen View 9 payload has no dedicated unmapped field) · live lines without extracted amounts stay I7-excluded (D-12 intake limitation — honest, not invented).
- Audit result: **A-19 = PASS-WITH-FINDINGS** (2026-09-10, independent audit session; full
  block in `AUDIT_LOG.md`). F-1 MAJOR corrected during the audit (deterministic payloads
  now pass the frozen-schema gate — invalid → INCOMPLETE, never published); F-2 MAJOR
  deferred with recommendation (analysis_claim rows never materialized — provenance in
  payload tags; no wrong data; not a D-19 blocker); F-3 MINOR (recompute convergence relies
  on FIFO delivery); F-4 MINOR (tooling note). Correction commit `d95482a` (full
  `d95482a4c0e1688eeabb85ed8e9b2cf8416ea02d`).
- Follow-up: CI run for the checkpoint FAILED on the first push (CI's ephemeral Postgres has EMPTY reference tables; the D-19 story originally depended on the live load). Fixed in `cc69d15` (full SHA appended after the push): the story now self-bootstraps the committed reviewed imports through the real reviewed path in a snapshot/truncate/load/restore window, and `jest.integration.config.js` serializes integration suites (`maxWorkers: 1`) so the D-29/D-19 reference-table windows can never race. verify-local re-run exit 0; CI re-verified green (run id at checkpoint).

### H-20 — D-20 Chef mode + station card

- BASE_SHA / COMMIT_SHA: BASE `2bc6130` · COMMIT `748853e` (full `748853e442fcf0bf8624f9106974e59a501119ba`).
- Date / agent session: 2026-09-10 · D-20 dispatch session (pre-flight decision trace D-20A..F recorded in HANDOFF §5 BEFORE code — dispatcher-authorized per the D-21 close-out).
- Status: **DONE** (implementation + verification + CI; GO/NO-GO for D-22 recorded in the dispatch close-out).
- Summary: Chef Mode + Station Card shipped — the worker deterministically assembles `analysis_station_card` from the Q1-labeled capture + the persisted View 3 (mise = capture ingredients verbatim; sequence = View 3 stages verbatim; control_points one-per-stage; do_nots = captured `explicitly_absent`; product_yield_hold null; printable true — never free prose, INV-10). Refusal path (no method steps OR View 3 INCOMPLETE) persists NO row. API `GET /analysis/:analysisId/station-card` serves the frozen D-05 wire (INV-17 404s; 404 `STATION_CARD_NOT_FOUND` for a valid analysis without a card) and both analysis assemblies carry `station_card` (nullable). Web: Home↔Chef toggle on the workspace — chef leads with the persisted card (or the honest no-card copy), the nine views keep rendering with the §7 chef-voice tab headers, closing line "Untasted briefing. Season after."; the preference persists via the existing `PATCH /auth/me/preferences` (signed-in; session-local for guests).
- Files changed: `apps/analysis-worker/src/{station-card.ts(+test), analysis-job.handler.ts(+test)}` · `apps/api/src/modules/analysis/{analysis.controller.ts(+test)}` · `apps/web/components/app/{StationCard.tsx(+test), AnalysisViews.tsx(+test), AnalysisPanel.tsx, RecipeWorkspace.tsx}` · `apps/web/lib/types.ts` · `apps/web/app/page.tsx` · `tests/integration/story_d20_station_card.test.ts` (new) · `tests/e2e/chef-mode.spec.ts` (new) · `docs/{HANDOFF,CHANGE_LOG}.md`.
- Test results: worker 44/44 · API 183/183 · web 93/93 · integration 97/97 (real Postgres; new D-20 story 3/3: card row persisted with verbatim capture/View 3 content on a chef-mode run; 404 STATION_CARD_NOT_FOUND for INCOMPLETE-view3 AND no-method branches; foreign 404; assemblies carry the card) · gates PASS (8/8 golden) · contract-check OK (zero drift) · lint 0 · typecheck 0 · verify-local ALL STEPS PASSED (exit 0) · **CI success (run `34501720779`)**.
- Done-criteria evidence: live internal-browser run on the real stack (Keycloak chef account) — paste golden card → method → analyse → complete → Chef toggle renders the persisted card (Mise 11×CARD, Sequence, Control points, "Untasted briefing. Season after.") with all nine §7 chef-voice tab labels → Home toggle restores the home labels (no Views 1–9 regression) → chef persisted (PATCH 200) → reload + reopen restores chef mode with the card (C3 TC-03) → guest session: toggle present, chef caption switches, no fabricated card → live API foreign/malformed → 404 ANALYSIS_NOT_FOUND (INV-17). `analysis_station_card` went 0 rows → populated on the live DB.
- OPEN DECISION notes: Q1 OPEN (card derives from the job-payload capture — no snapshot persistence invented; station card needs no new snapshot) · Q9 OPEN (stub LLM content in dev; chef payload CONTENT transformation awaits the real provider — §7 headers only) · Q5/Q10/Q11 unchanged · do_nots empty in the stub world (truthful) · analysis `mode` stays 'home' for web enqueues (toggle = presentation mode, ERD §15.4 — labeled, no second analysis system) · print sizing itself remains D-23 (printable=true only).
- Deviations: none against the D-20A..F decision trace · e2e Playwright launches remain machine-policy blocked on the dev VM (H-13); the identical assertions were executed live through the VS Code internal browser and recorded in §5.
- Follow-up: none pending. D-21 unaffected (its suite re-verified within the ladder: gates include the D-21 static hooks; `view-disclaimers` surfaces untouched).

### H-21 — D-21 Disclaimer sweep

- BASE_SHA / COMMIT_SHA: **BASE `57e8b94` · COMMIT `ded60d6`** (full
  `ded60d647d8add6e21961c0f8f3589e46b19cbd1`) — D-21 checkpoint pushed to
  `github.com/mohamedazzim/recipe-systems` branch `main`, 2026-09-10; pre-flight GO recorded in
  HANDOFF §5 BEFORE implementation.
- Date / agent session: 2026-09-10 · D-21 dispatch (preflight → implement → verify → stop).
- Status: **DONE** — dispatch deliverables 1–3 + all three done criteria satisfied.
- What shipped:
  1. H6 ("Reads the card only. Does not test food. Does not know your kitchen. Not medical
     advice.") and I6 ("Table estimate from stated assumptions. Not a lab analysis. Not medical
     advice.") are now unconditional on every View 8/9 surface — enforced, not incidental:
     `scripts/regression-gates.sh` §5 greps the producer constants for BOTH texts verbatim and
     requires the web to render `{payload.disclaimer}` for both views (a paraphrase anywhere
     breaks CI). The texts were already emitted by the D-19 producers and rendered from the
     payload — D-21 makes the guarantee gate-permanent.
  2. INV-13 static gates: word-bounded case-insensitive "safe" grep over the View 8 producer
     surface AND the web render surface — any occurrence (incl. "safe to eat" paraphrases)
     fires. INV-14 static gates: both `energy_kcal_min`/`energy_kcal_max` must exist in the
     producer AND the renderer (a point-kcal refactor fires). The frozen D-05 View 9 schema has
     no single `energy_kcal` field (contracts test rejects the point shape) and the producer
     band is structurally min/max.
  3. Fire-proofs: `tests/integration/qg2_gates.test.ts` +4 planted violations (producer "safe",
     renderer "safe", paraphrased H6, missing band bound) — all fire; suite 17/17. Runtime
     "teeth" tests in `deterministic-views.test.ts` (+2) prove the existing INV-13/INV-14
     runtime assertions reject exactly the planted classes; worker 34/34.
  4. E2E: `tests/e2e/view-disclaimers.spec.ts` — real-stack journey asserting H6 verbatim +
     no "safe" on the rendered View 8, I6 verbatim + Sodium Unknown + band dash on View 9
     (PASSES 1/1, ~7s). Full e2e suite **38/38** after repairing stale auth specs (helper
     "Signed in" assertion, seeded password, strict-mode Sign out selectors — test drift only).
- Done criteria evidence:
  - Both texts verbatim on every surface: gate §5 (producer constants + render-path checks)
    green on the real tree + e2e asserts the rendered texts + worker unit tests assert exact
    strings (H6/I6_DISCLAIMER equality).
  - Planted "safe" → static gate fires (qg2 producer + renderer plants) and the runtime
    assertion has teeth (planted payload is the rejected class).
  - Planted point-kcal → schema rejection (contracts test), band-strictness assertions, teeth
    test, and the new static min/max pair gates all catch it (qg2 plant fires).
- Tests run: worker 34/34 · API 178/178 · web 86/86 · integration 94/94 · gates PASS · lint 0 ·
  typecheck 0 · verify-local ALL STEPS PASSED exit 0 · e2e 38/38 · **CI success
  (run `34480999679`)**.
  Reference data intact 17/12/6/6/12/12. Q1/Q5/Q9/Q10/Q11 OPEN.
- **D-20 GO/NO-GO (report, per dispatch):** **GO** — D-21 made no product-surface changes; the
  D-19 checkpoint (Views 5–9 + assumption editors + recompute) is unchanged and fully green;
  D-20 (chef mode + station card) has a clean base. Prereqs noted for D-20's dispatch: station
  card requires the method state (present) and `analysis_station_card` has no rows today —
  expected (D-20 writes it); Q1 (snapshot persistence) stays OPEN and D-20 must ride the same
  Q1-labeled capture assumption as D-17/D-19.
- Resume point: **D-20 (chef mode + station card) — WAITING for explicit user authorization.**

### H-22 — D-22 Library save / browse / delete

- BASE_SHA / COMMIT_SHA: BASE `d505201` · COMMIT `5cf4830` (D1/D2 checkpoint) · **D6 close-out `28ec1b9`** (full `28ec1b938bfbbd6136092cdbfac0eb4c137ae1c7`).
- Date / agent session: 2026-09-10 · D-22 dispatch session (pre-flight decision trace D-22A..I recorded in HANDOFF §5 BEFORE code).
- Status: **DONE — D1 + D2 shipped; D6 (delete) explicitly deferred as the remaining D-22 continuation** (not dispatched in this message; recorded in D-22A).
- Summary: canonical Save + library shipped. Save (`PUT /recipes/:recipeId/save`, guest-or-jwt) confirms the persisted artifact set (raw input, photo, object, identification, analysis, timestamps — nothing copied or invented) and normalizes the name: default = the identification family (analysis.family column, then the frozen View5PayloadSchema view-5 payload), editable afterwards (D1 AC-1/AC-2). Library (`GET /recipes`, account-only) returns D2 AC-1 rows — name, date, family, cook-log indicator (EXISTS on the live cook_log table) — ordered by the ERD's own `ix_recipe_account_updated`. The web workspace carries a visible Save action (guests included) and the signed-in Home renders the canonical DB library, opening rows with the saved name even after a browser restart. Guests keep the untouched session-local list (D-22I — browser state preserved, never migrated). Resume-save (A1 TC-02): guest save state rides the QA-B2 claim transaction into the account library.
- Files changed: `apps/api/src/modules/recipes/{recipe.service.ts(+test), recipes.controller.ts(+test)}` · `apps/web/{app/page.tsx, components/app/{HomeView.tsx(+test), RecipeWorkspace.tsx(+test), AppShell.tsx}, lib/types.ts}` · `tests/integration/story_d22_save_library.test.ts` (new) · `tests/e2e/library.spec.ts` (new) · `docs/{HANDOFF,CHANGE_LOG}.md`.
- Test results: API 193/193 · web 98/98 · integration 102/102 (real Postgres; new D-22 story 5/5: family-default save + artifact set; explicit title + blank-keeps; library AC-1 rows + cook indicator; cross-account library empty + save 404 INV-17; guest save → real claim → named recipe in the new account library, XOR intact) · gates PASS (8/8 golden) · contract-check OK (zero drift) · lint 0 · typecheck 0 · verify-local ALL STEPS PASSED (exit 0) · **CI success (run `34509853030`)**.
- Done-criteria evidence: live internal-browser run on the real stack — chef save (blank name) → "Saved as Coastal Tamil (Kanyakumari) style meen kuzhambu" + artifact summary → library row (name/date/family/"No cook log yet") → reopen with the saved name as the workspace title → reload → library row persists (DB-owned, not browser state) → guest saved a named recipe → real Keycloak registration → callback claim → the new account library contains exactly that saved recipe → guest home still renders the untouched session list + "Other sessions".
- OPEN DECISION notes: Q1/Q5/Q9/Q10/Q11 unchanged (OPEN) · no schema change (the artifact set IS the existing rows; `updated_at` is the save stamp — ERD has no saved_at) · no LLM/DeepSeek work (dispatcher NON-GOAL honored) · D6 delete deferred (next D-22 continuation point).
- Deviations: e2e Playwright launches remain machine-policy blocked on the dev VM (H-13) — the identical assertions were executed live through the VS Code internal browser and recorded in §5.

**D-22 D6 close-out (2026-09-10, commit `28ec1b9`) — the canonical D-22 unit is now COMPLETE:**
- Summary: hard delete per ERD §13 + API doc §5 RS-US-24 (`DELETE /recipes/:recipeId`, Bearer +
  CSRF, body `{confirm:true}` else 400 `CONFIRM_REQUIRED`, 204). INV-17 404s for missing/foreign/
  malformed/repeated. DB-level ON DELETE CASCADE proven across all 13 child tables (integration,
  real Postgres): recipe_input, recipe_ingredient_line, recipe_tag, analysis, analysis_view,
  analysis_claim, analysis_station_card, shopping_list_generation, shopping_list_item,
  ingredient_shopping_state, cook_log, cook_log_swap, cook_log_photo — zero orphans. Storage:
  own-bucket asset keys collected pre-delete; DB delete commits first, then compensating
  per-object cleanup (`StorageService.tryDeleteObject`) — no distributed transaction invented;
  residue logged as a structured WARN (ADR §16, retry-safe); real MinIO probe proven in the story
  (objectExists false after delete). Web: two-step named confirmation (Cancel / Delete recipe),
  disabled while deleting, safe errors, no optimistic removal, success only after the 204 →
  home + library refresh + "Recipe deleted." notice. Guests have no delete surface (Bearer-only).
  Live internal-browser QA: cancel preserves, confirmed delete removes the row, reload keeps it
  gone, live-DB orphan sweep 0/0/0/0/0/0.
- Tests at close-out: API 202/202 · web 104/104 · integration 106/106 · gates PASS (8/8) ·
  contract OK · lint 0 · typecheck 0 · verify-local exit 0 · CI success (run `34514834141`).
- OPEN DECISION notes: unchanged (Q1/Q5/Q9/Q10/Q11 OPEN) · no D-23/D-30 work (HARD STOP honored).
- Audit result: **A-22 = PASS-WITH-FINDINGS (2026-09-16)** — no BLOCKER/MAJOR; F-1 builder-session process note; library e2e spec machine-blocked (H-13) with live-browser + integration coverage.

### H-23 — D-23 Print list + station card

- BASE_SHA / COMMIT_SHA: base `1073291` / **final `f8af600`** (D-23 fix chain `66e652e → 834405c → 5346976` + diagnostics `4c82ead` + CI-infra `7478832/02cb872/7edac70/f8af600`).
- Date / agent session: 2026-09-11..14 · DeepSeek V4 Pro (VS Code) D-23 dispatch.
- Status: **DONE — E4/E5/H4 print templates, PDF generation, INV-12 snapshot
  proof, one-page fit, retryable PDF failure, and Q2 Option A persistence
  shipped.**
- Summary: `packages/rendering` now owns the shared A4 print shell, shopping
  list template, station-card template, frozen allergen-line renderer, and
  Playwright PDF runtime with bounded retry. Migration 005 adds
  `analysis_station_card.allergen_line`; the worker persists the View-8 line
  at analysis completion. API print endpoints read only the persisted shopping
  generation or station-card snapshot, enforce ownership through
  `RecipeService.assertOwned`, and return `PDF_RENDER_FAILED` as a retryable
  503 without changing snapshots. Web print controls open the viewer during
  the click gesture and navigate it to the generated PDF blob.
- Files changed: `packages/rendering/**`, `packages/database/prisma/{schema.prisma,
  migrations/005_station_card_allergen_line}`, `apps/analysis-worker/src/
  analysis-job.handler.ts`, `apps/api/src/modules/print/**`, `apps/api/src/
  app.module.ts`, `apps/api/package.json`, `apps/web/components/app/{ShoppingSection,
  StationCard,AnalysisViews,AnalysisPanel}.{tsx,test.tsx}`, `scripts/
  regression-gates.sh`, `tests/integration/story_d23_print.test.ts`,
  `docs/Recipe_Systems_ERD_FINAL.md`, and `start-dev.cmd`.
- Test results: rendering 14/14 · API 235/235 · web 114/114 · worker 61/61 ·
  database 3/3 · domain 1/1 · llm-adapter 123/123 · integration 115/115
  (17 suites, including `story_d23_print` 5/5) · typecheck 0 · lint 0 ·
  verify-local all steps passed (116 integration tests).
- Done-criteria evidence: `story_d23_print` generated real Chromium PDFs with
  `%PDF-`, one page, and measured height within A4; E4 proved five canonical
  groups, two distinct fenugreek rows, current have-state, H4, H6, and no
  forbidden safety wording. E5 proved mise, sequence, control points, do-not,
  and one-page station-card output. QG4 tests cover launch failure, transient
  retry, and timeout. INV-12 proved byte-identical HTML after editing a recipe
  line and renaming a live allergen definition. INV-17 ownership and malformed
  id tests pass.
- Live internal-browser evidence: the signed-in golden recipe completed a new
  DeepSeek analysis, generated the shopping list, displayed the five groups,
  two fenugreek rows, and the persisted allergen line. Authenticated HTML and
  PDF endpoints returned 200, `%PDF-`, one page, H6, and no forbidden wording.
  The golden recipe's View 3 was incomplete, so its station-card surface
  correctly refused with `STATION_CARD_NOT_FOUND`; the real station-card
  render is covered by the integration story. The integrated browser suppresses
  popup creation, so the endpoint proof was performed in-page.
- Q2 / snapshot proof: DB rows contain the same frozen allergen line in the
  latest shopping generation; print code has no live mapping access (QG2 gate
  2d). Migrations 004 and 005 are applied locally. Q2 remains RESOLVED,
  Option A.
- Lifecycle proof: all NEED rows print normally; marking all but one HAVE
  survives regeneration and reopen, prints HAVE rows struck with the remaining
  NEED row normal, and soft-deleting a line removes it from print. The print
  projection emits a row-level `have` class and checked marker; the ingredient
  boundary removes repeated records by stable line id. CI builds rendering
  before typecheck so API/integration cannot consume stale print artifacts.
- Final CI evidence (recorded 2026-09-14): GitHub Actions run **69 = success** on
  `f8af600` — full cumulative suite + regression gates + contract + migrate +
  MinIO + integration on Ubuntu, after the CI-infra fixes below. Earlier D-23
  runs 61–65 failed for CI-infra reasons, not code: 61/62 missing
  `packages/rendering` build step (fixed 42788d9); 63/64 transient install
  (fixed: npm ci retry); 65 integration had no Chromium (fixed: Playwright
  install step); 66–68 MinIO Docker Hub anonymous pull limits (fixed: retry +
  official Quay mirror fallback). The final-fix SHA `5346976`'s run 64 failed
  only at the install stage; its exact tree passes in run 69's superset.
- OPEN DECISION notes: Q1/Q5/Q9/Q10/Q11 untouched. No D-24+ or D-30 changes.
- Audit result: **A-23 PASS-WITH-FINDINGS (2026-09-14)** — no blocker; findings
  F-1 e2e print spec absent (H-13), F-2 rendering has no QG1 floor row,
  F-3 audit ran in the builder session. Verdict block in AUDIT_LOG.md.

### H-24 — D-24 Cook loop

- BASE_SHA / COMMIT_SHA: base `6cb5dfb` (A-23 closeout) / **`efb480e`** (D-24).
- Date / agent session: 2026-09-14/15 · DeepSeek V4 Pro (VS Code) D-24 dispatch.
- Status: **DONE — F1 cook log, F2 rating/note, F6 reopen surface shipped.**
- Preflight: GO recorded in HANDOFF §0 (D-24A..E) before any code — scope
  F1/F2/F6 exactly; no migration (`cook_log` shipped in migration 002); API
  cook module sole writer; renderer read-only; `assertOwned`/INV-17; F2 note
  carries the next-time text until the F4 field lands (D-26).
- Summary: new `apps/api/src/modules/cook` (API doc §8 slice) —
  POST /recipes/:recipeId/cook-logs (cook_date default today, editable;
  rating 1–5 optional; note optional; `next_time`/`swaps` refused at the
  boundary → D-26), GET cook-logs (newest first), GET last-cook (F6 reopen
  summary; `next_time` surfaced when present — only F4/D-26 writes it),
  PATCH /cook-logs/:cookLogId (rating/note partial; explicit null clears;
  empty body = canonical no-op). Library row gained `last_cooked_at`
  (F1 AC-3). Web `CookSection` renders at the top of the workspace: recall
  strip (last cooked, rating, note) above the analysis, "I cooked this" form
  (date/rating/note), and the multi-log history. QG2 gate 2e: cook_log*
  writes confined to the API cook module (+ scratch-tree fire proof in
  qg2_gates). Playwright e2e `cook-log.spec.ts` covers the fifth critical
  flow (cook log entry).
- Files changed: `apps/api/src/modules/cook/**`,
  `apps/api/src/app.module.ts`, `apps/api/src/modules/recipes/recipe.service.ts`
  (library last_cooked_at), `apps/web/components/app/CookSection.tsx`,
  `apps/web/components/app/RecipeWorkspace.tsx`, `apps/web/components/app/
  HomeView.tsx`, `apps/web/lib/types.ts`, `scripts/regression-gates.sh`,
  `tests/integration/qg2_gates.test.ts`,
  `tests/integration/story_d24_cook_log.test.ts`,
  `tests/e2e/cook-log.spec.ts`, `docs/Recipe_Systems_API.md` §8 annotations,
  and the unit test files for the touched surfaces.
- Test results: API 258/258 (24 suites, incl. cook 48 new) · web 123/123
  (16 suites, incl. CookSection 9) · worker 61/61 · database 3/3 · domain
  1/1 · llm-adapter 123/123 · rendering 14/14 · integration 124/124
  (18 suites; story_d24_cook_log 7/7 on real Postgres — default-today date,
  editable date, multiple logs, library last-cooked, rating CHECK at DB
  level, PATCH partial/null-clear, cross-account 404s, malformed-id 404s,
  guest contract, historical rows byte-identical) · typecheck 0 · lint 0 ·
  regression gates PASS (cook one-writer armed) · contract-check OK ·
  verify-local ALL STEPS PASSED.
- Live internal-browser evidence (seeded chef, golden recipe): opened the
  saved golden recipe → "I cooked this" → date defaulted to today → rated 4 →
  note "2 green chillies, fenugreek powder off heat" → saved → recall strip
  "Last cooked 9/15/2026 · Rating 4/5" + note at the top, above the analysis.
  Reload (browser restart) → library row "Cooked 9/15/2026" → reopen →
  recall intact. Generated the shopping list (11 rows, five groups, two
  fenugreek rows, no garlic, allergen line), marked Fish HAVE, logged a
  SECOND cook (5/5, "perfect with less chilli") → cook history lists both
  logs → reload → reopen → recall 5/5, Fish still HAVE, "Analysis complete"
  still showing (model stub-no-provider-q9 — no re-analysis fired), station
  card + print surfaces unchanged. No provider changes; no new analysis.
- OPEN DECISION notes: Q1/Q5/Q9/Q10/Q11 untouched. F3/F4/F5 explicitly
  deferred (D-26/D-31 per DISPATCH). No D-25+ work.
- CI evidence (recorded 2026-09-15): GitHub Actions run **34930312273 =
  success** on `efb480e` (D-24 implementation) and run **34930324926 =
  success** on `de47634` (docs SHA fill) — full cumulative suite + gates +
  migrate + MinIO + integration + build on Ubuntu, green on both.
- Resume point: **A-24 = PASS-WITH-FINDINGS (2026-09-15, no defects)** — the audit
  re-executed story_d24 7/7, the cook one-writer fire proof, the live cook journey
  (three distinct DB rows, DOM-proven recall above the analysis), INV-17/malformed-id
  404s, historical-row byte-identity, and reopen recall — all passed; two MINOR
  findings recorded (QG4 upload cell deferred with F5/D-31; builder-session audit).
  Verdict block in AUDIT_LOG.md. Next per dispatcher: D-25 or D-26 dispatch.

### H-25 — D-25 Aliases, tags, edit + re-analyse

- Date / agent session: 2026-09-15 · DeepSeek V4 Pro (VS Code) — **D-25 PREFLIGHT ONLY**
  (no implementation; no product code/tests/migrations/schema/config/UI touched).
- Base SHA / state: `f16d8b0` (A-26 docs) = `origin/main`; CI green; tree clean.
- Gate: **GO — with conditions** (see findings). No STOP-level contradiction found.

- **Scope (DISPATCH D-25 / P7-1):** B6 (vernacular aliases), C6 (re-analyse explicit
  only), C7 (substitution preview — §13 CONDITIONAL), D3 (free-text tags + search),
  D4 (edit saved recipe → parse review), D5 (analysis snapshot chain).
- **Dependencies:** D-24 ✅ (cook loop — C6 must preserve notes/logs), D-29 ✅
  (Track R admin writer — B6 reads dictionary/alias under the Q5 working
  assumption). D-27 is blocked until D-25 completes (DISPATCH table).
- **Tables (already migrated, migration 002 — no new DDL expected):**
  `ingredient_dictionary`, `ingredient_alias` (`requires_confirmation`),
  `recipe_tag` (composite PK recipe_id+tag_text), `analysis.snapshot_of_analysis_id`
  + `analysis.is_current` (partial unique `uq_analysis_current`).
- **Existing implementations to build on:** Intake `WireLine.canonical_name` is the
  B6 seam (currently hardcoded `null`, comment "alias resolution lands with the
  dictionary (Track R / D-29)"); D-12 parse-review routes + `IngredientReview.tsx`
  are the D4 surface; `POST /analysis` enqueue (D-14 readiness + D-13 METHOD_REQUIRED
  gates) is the C6 explicit re-run path; the worker ALREADY flips `is_current`
  order-safely (INV-09) — D5 only adds `snapshotOfAnalysisId` capture; D-29 admin
  module is the dictionary/alias writer (gate armed).
- **Open decisions / gates:** Q5 stays OPEN (D-25 does NOT resolve — B6 reads only);
  Q1/Q10/Q11 untouched; C7 is §13-conditional (stability evidence not yet recorded →
  defer or record first).

- **Preflight findings (recorded, NOT resolved here):**
  - **F-1 (PREREQUISITE — reference-data gap, not a code defect):** the committed
    dictionary import `R-2026-09-09-002` covers only 2 of B6's 5 alias groups in
    full. Missing: shallots group entirely (no `shallots` canonical, no
    chinna-vengayam/cheriya-ulli aliases), curry-leaves group entirely, and the
    aliases `moringa` (drumstick), `uluva`/`vendhayam` (fenugreek); `drumstick` has
    no `requires_confirmation` row. B6's done criterion "all five groups resolve"
    is unsatisfiable with current data — D-25 must first ship a NEW reviewed import
    (dictionary + aliases + approval record) via the D-29 admin path.
  - **F-2 (DESIGN AMBIGUITY):** D5 TC-02 says "logs point at the analysis they were
    made against", but ERD §6 models no `cook_log.analysis_id` FK — the ERD supports
    D5 via `analysis.snapshot_of_analysis_id` only (traceability row: D5 → ✅). Must
    resolve explicitly at implementation: (a) logs stay on `recipe_id` and the
    snapshot chain makes last+current reachable (matches "last + current is enough
    for the pilot"), or (b) add a `cook_log.analysis_id` column (ERD amendment — not
    a silent invention). Recommend (a).
  - **F-3 (GATE):** `recipe_tag` has NO writer today and NO one-writer gate. D-25
    must designate a single writer module and arm a new QG2 gate (mirror 2e/2f).
  - **F-4 (§13):** C7 is a Could-have gated on weeks-9–10 Must stability; that
    evidence is not yet recorded in HANDOFF. Ship B6/C6/D3/D4/D5 unconditionally;
    defer C7 (or record the stability evidence first).

- **A-25 audit vectors (re-execution targets):** alias resolution BLOCKER (five
  groups + drumstick confirmation); Q5 one-writer (no dictionary/alias writes
  outside admin); snapshot-chain BLOCKER (re-analyse → previous linked snapshot,
  logs → original analysis, notes untouched); explicit re-run only (edit never
  auto-enqueues); C7 preview states shift class + invents nothing (INV-10).
- **Exact implementation resume point:** dispatcher GO on D-25 → (1) dispatch the
  B6 reference-data import prerequisite (or fold into D-25 session 1); (2) resolve
  F-2/F-3 at implementation start; (3) session 1 = aliases (B6) + tags/search (D3);
  session 2 = edit/re-analyse/snapshots (D4/D5/C6) + optional C7 (only with §13
  evidence). CHECKPOINT after session 1 (commit + HANDOFF per DISPATCH).

### Session 1 — shipped (2026-09-15)

- **Status:** SESSION 1 COMPLETE — B6 aliases + D3 tags/search + recipe_tag gate.
  Session 2 (C6/D4/D5 + optional C7) NOT started.
- **B6 reference-data prerequisite (F-1 closed):** NEW reviewed import
  `infra/reference-data/imports/R-2026-09-15-005-b6-aliases.json` +
  approval `approvals/R-2026-09-15-005.json` (reviewer
  "Mohamed Azzim (D-25 dispatch authorization 2026-09-15)"; sha over the
  zod-parsed object). Adds canonicals `shallots` + `curry_leaves` and aliases
  moringa, drumstick (`requires_confirmation: true` — TC-02), fenugreek, uluva,
  vendhayam, chinna vengayam, cheriya ulli, karuveppilai. No app code hardcodes
  aliases — they ride the reviewed D-29 path (Q5 working assumption).
- **B6 alias resolution:** `IntakeService.resolveWireLines` + pure
  `buildResolutionMap`/`toWireLineResolved` — read-only over dictionary/alias
  (writes stay admin-only). Wire gained `requires_confirmation`; `canonical_name`
  now resolves via longest whole-word match (canonical display form = underscores
  → spaces, so "curry leaves" → `curry_leaves`; the two fenugreeks stay DISTINCT:
  "fenugreek" → `fenugreek_seed`, "fenugreek powder" → `fenugreek_powder`).
  Analysis capture (`buildCapture`) unchanged — still verbatim (`canonical_name`
  null there is the Q5/Track-R seam). D-24/D-26 behavior preserved.
- **D3 tags + search:** recipes module is the SOLE `recipe_tag` writer
  (`setTags`/`listTags` — wholesale replace, trimmed + de-duped, ≤100 chars,
  ≤20 tags) + `search` (name/ingredient/tag axes, insensitive contains, account
  scoped). Routes: `PUT/GET /recipes/:recipeId/tags`, `GET /recipes?q=` (library
  search).
- **QG2 gate (F-3 closed):** gate 2g "recipe_tag written only by the API recipes
  module" armed in `scripts/regression-gates.sh` + scratch-tree fire proof in
  `qg2_gates.test.ts` (20/20).
- **Verification:** API 296/296 (26 suites) · integration 135/135 (20 suites;
  `story_d25_session1` 3/3 on real Postgres: five groups + drumstick confirmation
  + tags persist + three-axis search + cross-account isolation) · qg2_gates 20/20
  · typecheck 0 · lint 0 · regression gates PASS · contract-check OK ·
  verify-local ALL STEPS PASSED.
- **D5 decision (F-2) recorded for session 2:** reuse `analysis.snapshot_of_analysis_id`
  chain — new analysis points at the previous; NO `cook_log.analysis_id` column.
  **C7 (F-4):** DEFERRED — §13 stability evidence not present; ship only if it is
  recorded first.
- **Resume point (session 2):** C6 explicit re-analyse · D4 saved-recipe edit →
  parse review · D5 snapshot chain (worker: capture previous current `analysis.id`
  into `snapshotOfAnalysisId` before the is_current flip) · historical cook-log
  preservation. C7 only with §13 evidence.

### Session 2 — shipped (2026-09-15)

- **Status:** SESSION 2 COMPLETE — C6 explicit re-analysis · D4 saved-recipe edit
  → parse review (reuses D-12) · D5 snapshot chain. C7 DEFERRED (§13 evidence
  absent). D-25 COMPLETE (both sessions).
- **D5 (worker):** `AnalysisJobHandler.finalize` now captures the PREVIOUS current
  analysis (`findFirst` same recipe, is_current, id≠self, newest) BEFORE the
  order-safe is_current flip, and persists it as the new analysis's
  `snapshot_of_analysis_id` (composite self-FK `fk_analysis_snapshot_same_recipe`).
  First analysis → null. No `cook_log.analysis_id` column (F-2 decision honored).
- **API wire:** `GET /analysis/:analysisId` + `GET /recipes/:recipeId/analysis`
  now expose `snapshot_of_analysis_id` (the linked previous analysis; null when
  none) — "last + current" is reachable from the current analysis.
- **C6/D4:** no new endpoints — editing a saved recipe reuses the existing D-12
  parse-review routes (patch/split/merge/delete/review) and never auto-enqueues;
  re-analysis is the existing explicit `POST /recipes/:recipeId/analyse`.
- **Snapshot-chain FK note (recorded, not a defect):** `fk_analysis_snapshot_same_recipe`
  is `NO ACTION` — individual analysis deletes must be newest-first. The only
  product delete path (D6 recipe delete) cascades ALL analyses in one statement
  (FK-safe); `story_d17`'s fixture afterAll was reordered recipe-first to match.
- **Verification:** API 297/297 (26 suites) · worker 64/64 (5 suites) · web 132/132
  · rendering 15/15 · schemas 112/112 · llm-adapter 123/123 · integration 138/138
  (21 suites; `story_d25_session2` 3/3 on real Postgres: edit-without-analyse,
  explicit re-analysis → new current + `snapshot_of_analysis_id` = previous +
  exactly-one-current + cook note/rating preserved + 9 previous views intact +
  foreign/malformed-id 404s) · `story_d17` 4/4 · qg2_gates 20/20 · typecheck 0 ·
  lint 0 · regression gates PASS · contract-check OK · verify-local ALL STEPS
  PASSED.
- **Live browser journey (COMPLETE — see infra note):** signed in as
  chef@recipesystems.test → opened the saved golden recipe → edited the Fish
  line amount to "450g" → **no auto-analysis** (analysis count stayed 1) →
  explicit **Analyse recipe** → new analysis `0dda7f25-96dc-4262-b36d-5f0c65ff31d9`
  completed via DeepSeek → DB-proven: new analysis `is_current=true`,
  previous `5ed224a6` `is_current=false`, new `snapshot_of_analysis_id =
  5ed224a6…`, cook logs unchanged (4, "fish held, garlic stayed out" intact) →
  UI reopened to "Analysis complete" with the new result.
- **Infra fix (Keycloak 401 root cause):** `GET /auth/callback` returned
  "identity token exchange failed (401)" because the API run via
  `npm run dev -w @recipe-systems/api` executes with CWD = `apps/api`, where no
  `.env` exists — `ConfigModule` loaded no `KEYCLOAK_CLIENT_SECRET` (empty),
  and Keycloak rejected the code exchange (`CODE_TO_TOKEN_ERROR /
  invalid_client_credentials`). Fixed permanently in `apps/api/src/app.module.ts`:
  `ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env','../.env','../../.env'] })`
  (first-existing wins; reaches the repo-root `.env` from the workspace CWD).
  The Keycloak container was also recreated (fresh H2 → realm re-import from the
  current realm JSON) as a belt-and-braces measure; the realm secret was already
  correct — the empty client secret was the actual fault.
- **C7:** DEFERRED — §13 weeks-9–10 Must-stability evidence is still not recorded
  in HANDOFF (same gate D-31 carries).
- **Resume point:** A-25 audit complete — **PASS-WITH-FINDINGS** (2026-09-15):
  story_d25_session1 3/3 · story_d25_session2 3/3 · story_d17 4/4 · qg2_gates 20/20
  · conformance greps clean (Q5 admin-only dictionary/alias writes; recipe_tag
  confined to recipes; worker-only snapshot write; no cook_log.analysis_id column;
  C7 not shipped; no cook_log writes outside cook). Findings (AUDIT_LOG A-25):
  F-1 MAJOR — the B6 + D3 web surfaces are not shipped (`canonical_name` /
  `requires_confirmation` / tags / search have no UI rendering; backend correct);
  F-2 MINOR — builder-session audit caveat. Next per dispatcher: D-27 (D-25 is
  otherwise fit; fold F-1 into a scoped UI follow-up).

### F-1 remediation — shipped (2026-09-15)

- **Status:** F-1 CLOSED — the B6 + D3 web surfaces are shipped and live-verified.
  D-27 NOT started (HARD STOP honored).
- **B6 web surface (`IngredientReview`):** `WireLine` gained `canonical_name` +
  `requires_confirmation`. Each resolved line shows a canonical chip (underscores
  → spaces). A `requires_confirmation && confirmed_sense === null` line shows a
  confirmation banner ("We read X as Y — Accept / Edit instead"); Accept PATCHes
  `{confirmed_sense: canonical_name, expected_updated_at}` and NEVER rewrites
  `display_name` (original capture preserved — B6 AC-2/TC-02).
- **D3 tags (`TagsSection`, NEW):** canonical GET/PUT `/recipes/:recipeId/tags`
  (chips + add + remove + error, Bearer-only), rendered in `RecipeWorkspace`
  after Save. **D3 search (`HomeView`):** account-scoped GET `/recipes?q=` search
  box (name/ingredient/tag axes); empty query = full library; Clear restores.
- **Local reference-data note:** the dev DB had empty
  `ingredient_dictionary`/`ingredient_alias` (B6 resolution returned null). The
  already-approved imports were re-applied via the D-29 admin CLI (002 dictionary,
  005 B6 aliases, 003 allergen mappings, 004 nutrition) — data only, no new
  sign-off, no code change.
- **Live browser (Keycloak, chef@recipesystems.test):** drumstick line renders the
  confirmation banner + canonical chip; Accept → `confirmed_sense = drumstick`,
  `display_name` unchanged, banner hidden. Canonical chips render for all resolved
  lines (the two fenugreeks stay DISTINCT: `fenugreek_powder` vs
  `fenugreek_seed`). Tags: add + remove round-trip. Search: tag → 1 hit, ingredient
  "fenugreek" → 34 hits, name axis OK. Account isolation:
  demo@recipesystems.test sees an empty library and zero hits for chef's tag.
- **Verification:** web 144/144 · API 297/297 · worker 64/64 · llm-adapter 123/123
  · schemas 112/112 · rendering 15/15 · integration 138/138 (21 suites) ·
  qg2_gates 20/20 · regression gates PASS · contract-check OK · lint 0 ·
  typecheck 0 · build OK. Commit + CI SHA recorded in CHANGE_LOG.
- **Resume point:** D-27 (D-25 is now fully complete including the A-25 F-1 web
  surfaces). Q5/C7 remain OPEN/deferred as before; D-23/D-24/D-26/DeepSeek
  preserved.

### H-25A — D-25A C7 substitution preview (RS-US-18)

- **Status: COMPLETE (2026-09-16).** The deferred C7 Could-have, shipped as the
  D-25A continuation after §13 SATISFIED. A-25A = PASS (no findings).
- **BASE_SHA:** `4154979` (post-D-31 reconciliation). **Scope:** C7 only.
- **Classifier:** `apps/api/src/modules/analysis/substitution-preview.ts` —
  pure/deterministic `classifySubstitution` (structural / modular /
  identity_shift) using ONLY persisted View 1/5/6 evidence + the persisted
  View 4 substitute/consequence. No LLM, no network, no invention.
- **API:** `AnalysisService.previewSubstitution` (read-only; latest complete
  analysis; 404s `RECIPE_NOT_FOUND` / `ANALYSIS_NOT_FOUND` /
  `SUBSTITUTION_NOT_FOUND` incl. malformed ingredient id) +
  `POST /recipes/:recipeId/substitute-preview` (body `{ ingredient_id }` →
  `{ ingredient_id, substitute, classification, what_is_lost }`). The body key
  is `ingredient_id` (the canonical API-doc `swap` placeholder pinned to the
  precise "one View 4 substitution" semantics).
- **Web:** `apps/web/components/app/SubstitutionPreview.tsx` — select one
  persisted substitution, preview its class + persisted consequence; chef mode
  carries the "Structural / modular / identity-shift grid" framing. Existing
  View 4 list rendering preserved.
- **Persistence:** NONE — no table, no migration, no `View4PayloadSchema`
  change; classification is derived at preview time and never persisted.
- **Verification:** classifier 9/9 · API 345/345 (29 suites) · web 157/157
  (20 suites) · integration 25/25 · 159/159 (new `story_d25a_substitute_preview`
  3/3: identity_shift + structural previews, read-only byte-identical analysis
  rows, no View 4 payload mutation, 404s) · `regression-gates.sh` PASS ·
  golden 8/8 · typecheck 0 · lint 0 · build 0.
- **Decision trace:** inspected (Recipe_Systems §6/§12 C7, Epic-C C7, D-25
  dispatch, H-25, A-25, View 1/4/5/6 schemas, llm-adapter View 4 prompt, web
  renderView4) · already implemented (View 4 generation/persistence/flat
  render) · missing (classifier, endpoint, preview UI, tests) · blocked: none
  (§13 satisfied; no OPEN decision) · decision: deterministic derivation,
  read-only, no schema change · changed: classifier + endpoint + UI + tests ·
  intentionally not changed: D-25/D-26/D-27 semantics, View4PayloadSchema,
  no persistence, no LLM · risks: heuristic misclassification on non-golden
  recipes (mitigated by golden mapping + no-invention guard) · resume point:
  D-28 human verification (unchanged).
- **D-28 remains PENDING HUMAN EVIDENCE — untouched.**

### H-26 — D-26 Profiles, swaps, next-time, I3/I4

- BASE_SHA / COMMIT_SHA: base `cc5fb88` (D-26 preflight) / final commit recorded
  in CHANGE_LOG (D-26 commit pending CI — filled at push).
- Date / agent session: 2026-09-15 · DeepSeek V4 Pro (VS Code) D-26 dispatch.
- Status: **DONE — F3 swaps, F4 next-time, H1/H3/H5 restriction profile,
  I3 portions (Q14 seam), I4 band tightening shipped.**
- Summary: new API `restrictions` module (sole writer of `account_restriction_*`,
  new QG2 gate 2f + fire proof) — GET/PUT `/me/restriction-profile` (strict
  canonical validation: allergen codes vs definitions, labeled PILOT
  diet-pattern vocabulary vegetarian/vegan/gluten-free, US|EU pack),
  GET `/restriction-vocabulary`, GET `/analysis/:analysisId/restriction-highlight`
  (conflicts-first projection over the FROZEN View 8 payload + profile rows;
  unknown never a pass; not-flagged carries no pass claim). Cook module gained
  `next_time` on POST/PATCH (RS-US-34) and POST `/cook-logs/:cookLogId/swaps`
  (F3/H5 — historical + immutable; `applied_to_card` routes through the Intake
  line surface: skipped → soft-delete, reduced/increased/swapped → amount_text
  edit). Station-card print surfaces the LATEST `cook_log.next_time_instruction`
  tagged COOK LOG (ADR §7 amendment 2026-09-15). Analysis gained
  PATCH `/analysis/:analysisId/view-9/portions` (RS-US-46) → view9-recompute;
  the worker fills `per_portion` in the frozen View 9 payload ONLY when portions
  are set (Q14 stays OPEN — no persisted column). Web: ProfileEditor (HomeView
  account section), RestrictionHighlight (top of View 8), SwapSection
  (workspace), next-time input in the cook form, per-bowl band + portions
  editor in View 9.
- Files changed: `apps/api/src/modules/restrictions/**`,
  `apps/api/src/modules/cook/*` (next_time + swaps), `apps/api/src/modules/
  analysis/*` (portions), `apps/api/src/modules/print/print.service.ts`,
  `apps/api/src/app.module.ts`, `apps/analysis-worker/src/deterministic-views.ts`
  + `analysis-job.handler.ts`, `packages/rendering/src/templates/station-card.ts`,
  `scripts/regression-gates.sh`, `tests/integration/qg2_gates.test.ts`,
  `tests/integration/story_d26_hardening.test.ts`,
  `apps/web/components/app/{ProfileEditor,RestrictionHighlight,SwapSection,
  CookSection,AnalysisViews,HomeView,RecipeWorkspace}.tsx`,
  `apps/web/lib/types.ts`, `docs/Recipe_Systems_Architecture_Decision_FINAL_V5.md`
  (ADR §7 amendment), `docs/Recipe_Systems_API.md` §8/§9/§10 annotations, and the
  unit test files for every touched surface.
- Test results: API 283/283 (26 suites, coverage 78.44% lines ≥ QG1 75%) ·
  web 132/132 (19 suites) · worker 63/63 (5 suites) · rendering 15/15 (1 suite,
  incl. COOK LOG tagging) · integration 131/131 (19 suites; story_d26_hardening
  6/6 on real Postgres: profile CRUD + isolation + never-auto-deletes; conflicts
  first + unknown-not-a-pass; swap immutability + Intake-routed application +
  cross-account 404s; next_time POST/PATCH + COOK LOG print tag; per_portion
  only when set + whole-pot band unchanged + sodium Unknown; coconut weighing
  narrows the band) · typecheck 0 · lint 0 · regression gates PASS (restriction
  gate 2f armed: writes confined to the restrictions module) · contract-check OK
  · verify-local ALL STEPS PASSED.
- Live internal-browser evidence (seeded chef, golden recipe): set profile
  (Fish + vegan + US) → saved; opened View 8 → "Against your restriction
  profile" with "Conflicts first: Fish" + diet-pattern/label-pack notes;
  logged a cook with the next-time line "2 green chillies, fenugreek powder off
  heat" → recall strip shows it; recorded a reduced Chilli swap (applied) →
  DB shows amount_text '3 Nos' + applied_to_recipe true; station-card print HTML
  contains "Next time:" + COOK LOG and no CARD tag in the next-time block; set
  portions 4 → live "Per bowl — 4 portions · 183–259 kcal · A band, never a
  point"; reload → profile, recall and next-time persist.
- Q14 treatment: REMAINS OPEN — portions persist ONLY in the View 9 payload's
  `per_portion` (the frozen schema), no column; the recompute carries the last
  portion count forward on assumption-only edits (labeled seam). ERD §15 open
  items in scope (diet-pattern vocabulary, label-pack precedence) handled as
  LABELED PILOT WORKING ASSUMPTIONS (D-26E/D-26F). ADR §7 amended (next-time
  print source). Q1/Q5/Q9/Q10/Q11 untouched; DeepSeek config untouched.
- Resume point: H-26 done criteria met; A-26 audit complete — **PASS-WITH-FINDINGS**
  (2026-09-15): story_d26_hardening 6/6 · qg2_gates 19/19 (restriction one-writer
  fire proof) · rendering 15/15 (F4 COOK LOG tag) · conformance greps clean (no
  cookLogSwap mutation; no ingredient-line writer outside Intake; restriction
  module is the sole `account_restriction_*` writer; no portion column — Q14
  stays OPEN). Findings (MINOR, in AUDIT_LOG A-26): F-1 FK SET NULL × CHECK
  interaction on `account_restriction_item.allergen_id` (pre-existing, carry into
  D-29); F-2 test fixture truncation order (clear profile items before reference
  tables); F-3 builder-session audit caveat. Next per dispatcher: D-25 / D-27+.

### H-27 — D-27 Regional veto + retention/ops

- **Status: DONE (2026-09-15) — implementation shipped; A-27 audit pending.** The
  preflight (GO) was recorded below BEFORE code; the implementation followed it exactly.
- **Date / agent session:** 2026-09-15 · DeepSeek V4 Pro (VS Code) D-27 implementation.

#### Preflight trace (recorded before code — unchanged)
- **Verdict: GO** (no BLOCKER; Q6/Q11/Q15/Q12 built to labeled working assumptions).

#### Scope (DISPATCH D-27 = BUILD_PLAN P7-3 = story G2 + ops tail)
1. **Veto workflow (G2):** a regional reviewer can block a live View 5 regional
   sentence; pilot = one Tamil Nadu/Kanyakumari reviewer + one Kerala reviewer on the
   fish-curry cluster; blocked sentences leave live views immediately (G2 TC-01/TC-02).
2. **Retention/cleanup jobs:** guest-session expiry cleanup (Q11 pilot default from
   D-08); photo/account retention per Q15's pilot defaults (labeled — do not decide Q15).
3. **Ops docs:** runbook, backup/restore, upgrade windows, monitoring (BUILD_PLAN §5
   "Ops burden" row; Tech Stack §17).
- **NON-GOALS:** pilot execution itself (D-28); printing (D-23); profiles/swaps (D-26).

#### Dependencies
- D-25 (depends-on per DISPATCH table) — **DONE** (`6f38689`, CI green).
- D-08 guest TTL — **DONE** (`GUEST_TTL_SECONDS` default 86400, Q11-labeled; `guest_session.expires_at`
  application-enforced). No cleanup job shipped yet (D-08 "Expiry cleanup job — PENDING").
- D-22 D6 delete + `StorageService.tryDeleteObject` compensating photo cleanup — **DONE** (reuse for
  the Q15 photo-retention path).
- D-26 / D-30 / Q2 (RESOLVED) — **DONE**, no interaction with the veto (Q2 is print-only).
- D-04 reviewer roster — **DONE as process**: "record slots/process if the people are not yet
  signed; do not fabricate reviewer names." → D-27 configures reviewer SLOTS (env), never invents names.

#### APIs / tables / UI
- **Reuse (existing):** `analysis_view` (view_number=5, status COMPLETE/INCOMPLETE, payload Json,
  `uq_analysis_view`); View 5 payload `{family, architecture, confidence, not_this[{variant,key_difference}],
  needs_review: literal true, tag: 'INFERRED'}`; `analysis_claim`; `guest_session`
  (expires_at/claimed_at); `recipe` (account XOR guest_session, FK cascades); web renders
  INCOMPLETE views already (`AnalysisViews.tsx` + `identificationFrom(view5)`).
- **New (D-27):**
  - Veto endpoint — Bearer-only, reviewer-authorized (e.g. `POST /api/v1/analysis/:analysisId/view-5/veto`
    or a `reviews` module route). Reviewer authorization = env-configured regional reviewer email slots.
  - Optional reviewer queue read (pilot may be external per ADR §11 "G2 = External/admin workflow").
  - Cleanup sweep — scheduled (API interval or worker); deletes expired unclaimed guest sessions and
    their orphaned recipe/analysis/object aggregates; photo retention per Q15 labeled defaults.
  - UI: veto affordance is minimal/optional for the pilot (ADR §11 classifies G2 as an external/admin
    workflow; the live-view BLOCKING is the runtime must, not a rich reviewer UI).

#### Writer / gate model (INV-03 + QG2)
- Existing QG2 gate 1: "`analysis_*` written only by `apps/analysis-worker`" (`scripts/regression-gates.sh`
  lines 21–30). The veto must NOT silently rewrite the analysis (ADR §8).
- **Q6 working assumption to record (build to it, do NOT decide Q6):** the publishable-state home for the
  pilot = `analysis_view.status`. A veto sets the affected View 5 `status = 'INCOMPLETE'` (ADR §8's
  explicit second mechanism: "…or the affected View 5 is marked incomplete according to the review
  policy"). The review EVENT (who vetoed which sentence, when) is recorded OUTSIDE the canonical
  recipe (ops-level log / minimal record) — the ADR deliberately keeps the review-event table out of
  ERD v13 for the pilot.
- Consequence: QG2 gate 1 must be refined (new gate, e.g. **2h**): the ONLY permitted `analysis_*`
  write outside the worker is the review module setting `analysis_view.status = 'INCOMPLETE'` for
  View 5 (veto), with a fire proof in `tests/integration/qg2_gates.test.ts`. Every other `analysis_*`
  write outside the worker keeps firing.
- Alternative considered (rejected as pilot default, recorded): a separate `review_event` table + a
  read-time projection that drops vetoed sentences (keeps worker-only intact but adds a new product
  table requiring an ERD amendment that ADR §8 explicitly defers).

#### Veto state machine + invariants
- **States (per View 5):** `live` (analysis_view.status = COMPLETE, no veto) →
  `vetoed` (status = INCOMPLETE + review event recorded).
- **Transition:** `COMPLETE --reviewer veto--> INCOMPLETE` (irreversible for the pilot; a re-analysis
  (D-25/D5) generates a NEW analysis whose View 5 is fresh — it does not resurrect the vetoed one).
- **Invariants:**
  - A veto never mutates `recipe`, `recipe_input`, or the View 5 `payload` JSON (no silent rewrite — ADR §8).
  - Blocked sentences leave live views immediately (status change + existing INCOMPLETE rendering).
  - Only a configured regional reviewer can veto (authorization); the event records reviewer + sentence + time.
  - `needs_review: true` is the View 5 schema invariant (human review ALWAYS required — product rule G2).
  - Approve/leave-live is the DEFAULT (no action); there is no separate "approve" write for the pilot.

#### Open decisions / Q-gates / pilot assumptions (record with register IDs, do NOT resolve)
- **Q6** (publishable state home, ADR §8): OPEN — build to the labeled assumption above.
- **Q11** (guest TTL + cleanup schedule, ERD §15.12/ADR §24.7): OPEN — pilot default 86400s already
  labeled in `GUEST_TTL_SECONDS`; cleanup schedule = labeled pilot default (e.g. daily sweep).
- **Q15** (account erasure / photo retention, ERD §15.11): OPEN — labeled pilot defaults only.
- **Q12** (RPO/RTO, ADR §17): OPEN — ops docs label "not set"; ADR §17 forbids inventing numbers.
- **Q1/Q5/Q10:** untouched (hard constraint). **Q13** (retry/backoff): pilot defaults already at D-17.
- **Reviewer identity:** not fabricated (D-04 rule) — env slots for the two regional reviewers.

#### A-27 audit vectors (from AUDIT.md A-27)
- Veto workflow (BLOCKER): veto → blocked from live views immediately; both reviewers configured on
  the fish-curry cluster; a veto that leaves the sentence live anywhere = BLOCKER.
- Q6 hygiene (BLOCKER): the publishable-state home is a labeled working assumption; a silently
  invented status column = BLOCKER.
- Cleanup jobs (QG4 cell): expired unclaimed guests removed; Q11/Q15 pilot defaults labeled with
  register IDs in HANDOFF.
- Ops docs (MAJOR if missing): runbook, backup/restore, upgrade windows, monitoring (Tech Stack §17).

#### GO / STOP
- **VERDICT: GO** — no BLOCKER, no missing code dependency, no hard contradiction found.
  - D-25 (the declared dependency) is DONE; D-08/D-22 seams to reuse exist.
  - Q6/Q11/Q15/Q12 are OPEN but the dispatch explicitly directs "build to the labeled working
    assumption, do not decide" — they are recorded assumptions, not STOP conditions.
  - The `analysis_*` one-writer vs veto-write tension is resolved by ADR §8's own authorization
    ("mark View 5 incomplete") — implemented as the Q6-labeled mechanism + a narrow QG2 gate 2h.

#### Exact implementation resume point
1. (this entry) — H-27 preflight recorded in HANDOFF.md.
2. Veto workflow: new API review surface (Bearer-only, env-configured reviewer emails) → set
   `analysis_view.status='INCOMPLETE'` for View 5 + record the review event outside the canonical
   recipe; reviewer slots via env (no fabricated identities).
3. QG2: refine gate 1 / add gate 2h (review-module View-5 INCOMPLETE veto only) + fire proof.
4. Cleanup jobs: scheduled sweep (expired unclaimed guests + orphaned aggregates + compensating
   storage cleanup) using Q11 default + Q15 labeled retention defaults.
5. Ops docs: `docs/ops/runbook.md` (backup/restore via Postgres PITR + realm export; upgrade
   windows; monitoring per Tech Stack §17; Q12 labeled unset).
6. Tests: `tests/integration/story_d27*.test.ts` (veto TC-01/TC-02 + cleanup QG4 cell) +
   `qg2_gates.test.ts` gate-2h fire proof + unit suites; then lint/typecheck/build/verify-local.
7. Docs (CHANGE_LOG/AUDIT_LOG A-27) + commit + push + CI. HARD STOP before D-28.

#### Implementation — shipped (2026-09-15)
- **G2 veto:** NEW `apps/api/src/modules/reviews/` (`reviews.module.ts` /
  `reviews.controller.ts` / `reviews.service.ts`) — `POST /api/v1/analysis/:analysisId/view-5/veto`
  (JwtAuthGuard + CsrfGuard, Bearer-only — no guest bypass). Reviewer authorization =
  env-configured `REVIEWER_EMAILS` slots (no fabricated identities). Veto = the review module's
  SOLE analysis_* write: `analysisView.update({ status: 'INCOMPLETE' })` for View 5 only; the
  payload JSON / recipe / recipe_input are never touched. Repeat veto = idempotent
  (`already_vetoed: true`). Review event = structured governance log (outside the canonical
  recipe; no review table, no publishable column). Re-analysis (D-25/D5) is a fresh analysis.
- **Retention/cleanup:** NEW `apps/api/src/modules/cleanup/` (`cleanup.module.ts` /
  `cleanup.service.ts` / `cleanup.runner.ts`) — `CleanupService.cleanupExpiredGuests()` removes
  expired UNCLAIMED guest sessions + their owned recipes (DB cascade + compensating storage
  cleanup via `RecipeService.deleteRecipeInternal`, the D-22 D6 path) — Q11-labeled default
  86400s TTL / `CLEANUP_INTERVAL_SECONDS` 3600s sweep (Q15 stays OPEN). Claimed + unexpired
  sessions are never swept. `CleanupRunner` schedules the sweep and clears timers on shutdown.
- **QG2:** gate 1 refined to exempt the review module; NEW gate **2h** ("the review module writes
  ONLY `analysis_view.status` — the View 5 veto") + two scratch-tree fire proofs in
  `tests/integration/qg2_gates.test.ts` (a beyond-veto write fires; the permitted
  `analysisView.update` does not).
- **Ops docs:** NEW `docs/ops/runbook.md` — backup/restore (Postgres PITR + Keycloak realm export +
  object-storage restore validation), upgrade windows, monitoring (Tech Stack §17), veto ops,
  retention. Q12 (RPO/RTO) labeled UNSET (ADR §17 forbids inventing numbers).
- **Tests:** unit `reviews.service.test.ts` (+6) + `cleanup.service.test.ts` (+3);
  integration `story_d27_veto_retention.test.ts` (+5: veto transition + payload/recipe/other-view
  integrity, repeat veto, reviewer auth + malformed 404, fresh re-analysis, retention sweep with
  claimed/unexpired preservation + storage compensation) — plus `qg2_gates` 22/22.
- **Verification:** worker 64/64 · API 307/307 · web 144/144 · llm-adapter 123/123 · schemas
  112/112 · rendering 15/15 · integration 145/145 (22 suites incl. story_d27 5/5) · qg2_gates
  22/22 · regression gates PASS · contract-check OK · lint 0 · typecheck 0 · build OK.
- **Live internal-browser (Keycloak, chef@recipesystems.test as the configured reviewer slot):**
  golden recipe analysis `0dda7f25` View 5 COMPLETE → veto (POST 200, `vetoed:true`) → View 5
  INCOMPLETE (payload unchanged, View 1 intact) → web renders "View 5 is incomplete" → reload
  persists → re-analyse (worker stub) → fresh analysis `4f918c62` with View 5 COMPLETE again
  (the veto stays on the vetoed analysis). No pilot execution beyond the canonical veto test.
- **Register:** Q6/Q11/Q15/Q12 remain OPEN (unchanged, labeled); Q1/Q5/Q10 untouched; DeepSeek
  provider unchanged; D-23/D-24/D-25/D-26 behavior preserved.
- **Resume point:** A-27 audit complete — **PASS-WITH-FINDINGS** (2026-09-15):
  veto BLOCKER re-executed live (both reviewer slots; payload/recipe untouched;
  idempotent; re-analysis fresh); Q6/Q11/Q15/Q12 OPEN and labeled; cleanup QG4 cell +
  claimed/unexpired preservation re-run green (`story_d27` 5/5 · qg2_gates 22/22).
  Findings (AUDIT_LOG A-27): F-1 MINOR — gate 2h whitelist is prefix-matching
  (`analysisView.updateMany` would evade); F-2 MINOR — builder-session audit caveat.
  Next per dispatcher: D-28.

### H-28 current status — pilot readiness (2026-09-16)

- **Status: PILOT READINESS AUDIT COMPLETE — PENDING HUMAN EVIDENCE.** The earlier
  H-28 preflight below is historical; this update supersedes its Q10-blocked wording
  because Q10 is now resolved. No participant data, human result, reviewer action,
  or new AI timing was created.
- **READY:** canonical participant/scenario structure, §14 metrics, §15 acceptance
  scene, G2/G3 criteria, `messy_20`, reviewer slots, deterministic persistence paths,
  and evidence categories.
- **MISSING HUMAN EVIDENCE:** real 20-user uncoached records, the three-curry chef
  pass, real reviewer assignment/veto, and human save/list/log observations.
- **BLOCKED:** new photo-to-first-analysis timing and live AI execution while DeepSeek
  credits are exhausted. PaddleOCR was not selected as a substitute.
- **Offline evidence:** golden `8/8`; corpus-check OK (50 corpus + 20 messy); selected
  integration `42/42`; selected web tests `69/69`; regression gates PASS. Tests used
  `OCR_PROVIDER=disabled`, `LLM_PROVIDER=disabled`, `MODEL_PROVIDER=disabled`.

#### Minimum uncoached pilot procedure

Participants receive only the canonical task. The facilitator records observations and
does not explain the click path or correct decisions during the run.

1. Enter the assigned recipe through the assigned intake path; record completion or abandonment.
2. Review and correct the parse; verify `needs_review` is visible and readiness is blocked until cleared.
3. Supply or accept the method; record `METHOD` or named-source `INFERRED` provenance.
4. Analyse only when the interface exposes the action; record the explicit status/result.
5. Save, leave, reopen from the library, and find the shopping list; record persistence.
6. Log the cook with rating 4 and the canonical note; reload/reopen and record recall.
7. Have the assigned regional reviewer veto one live View 5 sentence; record authorization,
   `COMPLETE -> INCOMPLETE`, payload preservation, and idempotency.
8. Run the G3 chef pass on Kumari, inland Tamil, and Kerala kudampuli; record distinct
   identifications, zero invention, runnable cards, no `safe`, and no point-kcal claims.

#### Exact resume point

Obtain/run the real 20-user uncoached pilot and reviewer/persistence scenarios when API
access is available, then execute A-28 and record the go/no-go decision. HARD STOP before D-31.

### H-28 final gate attempt — evidence gap matrix (2026-09-16)

- **Status: PENDING HUMAN EVIDENCE.** DeepSeek credits are available again, but no live
  AI call was made. Cost control plus the no-fabrication rule together determine the outcome.
- **Decision:** every remaining unverified D-28 criterion is gated on real human
  participants, not on model calls. Making live analyses now would consume credits without
  advancing any single criterion to PASS, because each also requires a human action.

| Criterion | Existing evidence | Fresh human/AI needed | Result |
|---|---|---|---|
| Golden no-invention | golden 8/8 + golden fixture 25/25 | No | Reused |
| Corpus 50 + messy_20 20 | corpus-check OK | No | Reused |
| Three curries separable (G3) | deterministic family/grounding paths only | Human chef + three live analyses | PENDING (human chef) |
| Prints fit one page | story_d23_print (real Chromium) | No | Reused |
| Photo to first analysis < 2 min | historical ~1m40s | Fresh run only at the actual pilot window | Historical reuse |
| No "safe" / no point-kcal | regression gates + golden | No | Reused |
| 20-user uncoached cohort | None | 20 real participants | PENDING |
| View 5 not vetoed wholesale | D-27 implemented + tested | Real regional reviewers | PENDING |
| Save + list + log without coaching | D-22/D-24 deterministic + prior live | Real uncoached users | PENDING |
| A-28 blocker sweep + §15 walk | regression gates PASS; prior live walk | Fresh at the pilot commit | Deferred to A-28 |

- **Live AI usage this run:** 0 DeepSeek calls, 0 retries, 0 failures.
- **D-28 overall: PENDING HUMAN EVIDENCE.** A-28 is NOT executed (D-28 is not complete).

### H-28 autonomous pilot execution (2026-09-16)

- **Scope:** strongest autonomous validation without fabricating human evidence.
  Every session is labeled AUTONOMOUS; none is presented as a human participant.
- **Live stack:** full local stack (Postgres 5433, MinIO, nginx, Keycloak, web 3000,
  API 3001) + analysis-worker with `ANALYSIS_LLM_STUB=1` (zero API cost).

#### Fresh automated evidence (re-run this session)
- golden-check 8/8 · corpus-check OK (50 + 20 messy) · integration 42/42 (corpus,
  golden, D-27 veto, D-22 save, D-24 cook) · web 69/69 · regression gates PASS.

#### Autonomous 20-session guest matrix (live BFF boundary)
- 20 independent guest sessions (AUTONOMOUS-P01..P20): guest session 200 →
  parse-text 200 (5–6 lines each) → analyse 422 METHOD_REQUIRED (canonical guest
  boundary: method attach is Bearer-only) → save 200 → cook-log 201 → last-cook 200
  rating 4 (persistence). 20/20 complete, 0 failures, ~4.8s total.
- Cross-session isolation: a foreign guest session reading another session's
  recipe → canonical 404 (INV-17). No data leak observed.

#### Authenticated production path (real browser, stub worker)
- Keycloak sign-in → paste 11-line golden-style card → review (canonical chips;
  Drumstick confirmation accepted; two fenugreeks distinct) → readiness
  "Ready to analyse" → method paste (Tag METHOD) → analyse → complete in ~13.8s
  (model `stub-no-provider-q9`) → identification "Coastal Tamil (Kanyakumari) style
  meen kuzhambu" + station card (both fenugreeks, CARD provenance, "Untasted
  briefing. Season after.") → View 8 (Contains Fish/Coconut/Fenugreek, H6
  disclaimer, no "safe") → View 9 (591–768 kcal band, Sodium Unknown, ASSUMED
  provenance, I6 disclaimer, no point-kcal) → save (family name) → library row +
  "Cooked 9/16/2026" → cook log rating 4 + note → reload/reopen: name, analysis,
  method, cook log, and note all persist.

#### G3 chef autonomous simulation
- NOT performed as a human Chef pass. The workflow was exercised with the
  deterministic stub (single family). Three-curry separability requires a real
  human Chef plus the real model; prior 9/15 live evidence already recorded
  distinct Kerala/Tamil identifications. G3 remains PENDING HUMAN EVIDENCE.

#### Regional reviewer autonomous simulation
- Deterministic D-27 veto re-run fresh this session (5/5): authorized veto
  COMPLETE→INCOMPLETE, payload/recipe/other views untouched, idempotency, 403 for
  non-reviewer, malformed 404, fresh re-analysis. Live API has no REVIEWER_EMAILS
  configured → no account may veto (403 boundary enforced). Real reviewer actions
  remain PENDING HUMAN EVIDENCE.

#### Findings
- F-1 (MINOR, docs): `STARTUP.md` and `scripts/dev.sh` document the seeded sign-in
  as `chef@recipesystems.test / password`; the Keycloak realm actually seeds
  `Password@123`. A developer following the docs cannot sign in. Not fixed this
  run (out of D-28 scope; recorded for the dispatcher).

#### DeepSeek accounting this run
- 0 calls, 0 retries, 0 failures. All autonomous flows used the deterministic
  stub; no live model or OCR was invoked.

### A-28 readiness sweep (2026-09-16)

- **Status: A-28 PREFLIGHT COMPLETE — FULL A-28 NOT EXECUTED (blocked on D-28 human evidence).**
- DeepSeek accounting: 0 calls, 0 retries, 0 failures.

| A-28 criterion | Classification | Basis |
|---|---|---|
| Zero invented ingredients (golden) | PASS | golden-check 8/8 re-run |
| No "safe" wording | PASS | regression gates + golden |
| No point-kcal | PASS | regression gates + golden |
| Prints fit one page | AUTONOMOUSLY VERIFIED | story_d23_print (real Chromium, one-page PDF) in the 151/151 integration run |
| Photo→first analysis < 2 min | PASS-WITH-EXISTING-EVIDENCE | historical ~1m40s reused; no fresh run |
| Three curries separable (G3) | PENDING HUMAN EVIDENCE | requires human Chef + real model |
| Must stories on golden + 20 messy (human) | PENDING HUMAN EVIDENCE | uncoached 20-user cohort |
| View 5 not vetoed wholesale | PENDING HUMAN EVIDENCE | real regional reviewers |
| Save + list + log without coaching | PENDING HUMAN EVIDENCE | uncoached users |
| Blocker regression sweep | AUTONOMOUSLY VERIFIED | integration 23/23 · 151/151 + regression-gates PASS on current commit |
| §15 acceptance scene unassisted | PENDING HUMAN EVIDENCE | requires an unassisted human walk |
| OPEN DECISION register hygiene | PASS | Q1/Q3/Q5/Q6/Q7/Q11–Q17 open; Q2/Q4/Q8/Q9/Q10/Q18 resolved with recorded traces; no silent resolution |

- **Finding retraction:** F-1 (dev sign-in credential mismatch) WITHDRAWN — the
  dispatcher confirms `Password@123` is the authoritative dev password and directed
  no credential-documentation change.
- **Technical blockers:** NO KNOWN AUTONOMOUS TECHNICAL BLOCKER — HUMAN ACCEPTANCE
  EVIDENCE REMAINS.
- **Exact resume point:** when 20 real users, a Chef, and two regional reviewers are
  available, run the uncoached protocol, then execute the A-28 closing sweep with
  the human evidence.

### Final production-readiness audit (2026-09-16)

- **Verdict: NO KNOWN TECHNICAL RELEASE BLOCKER.** No P0/P1 findings; no product-code changes.
- **Integrity:** HEAD = origin/main (`9695f50`); no committed secrets (pattern scan
  clean); no tracked `.env`/`dist`/`.next`/`coverage`; no temp scripts. Untracked
  Q10 OCR artifacts remain (INFO: decide commit vs gitignore later).
- **Build/deploy:** workspace typecheck exit 0; API `nest build` exit 0; worker
  build exit 0; `prisma migrate status` = "Database schema is up to date!".
- **Architecture:** web has no direct DB/worker access (BFF only);
  `recipe_ingredient_line` writes confined to Intake; one-writer gates PASS;
  OPEN DECISION register unchanged.
- **Security:** secret scan clean; ownership/CSRF/reviewer-auth/INV-17 covered by
  the 151/151 integration run + regression gates.
- **INFO findings (none blocking):** nginx.conf is a P0-scope health-only edge
  (no web/api reverse-proxy yet — consistent with "no deployment pipeline");
  Prisma 6.19.3 major-update notice; production-relevant OPEN decisions Q7 (cloud),
  Q11 (guest TTL), Q12 (RPO/RTO), Q15 (retention) remain intentionally deferred.

### H-28 — D-28 Week-12 pilot gate

- **Status: PREFLIGHT ONLY (2026-09-15) — STOP.** No implementation. This entry
  records the dispatch-required preflight trace (before any code, per DISPATCH D-28).
- **Date / agent session:** 2026-09-15 · DeepSeek V4 Pro (VS Code) D-28 preflight.

#### Verdict: STOP — missing dependency (D-11 / Q10 OCR) for the §14 photo go-metric
- D-28's done criteria (DISPATCH + BUILD_PLAN P7 exit) include the §14 go-metric
  **"photo→first analysis under 2 minutes including parse correction"**, and §14's
  **no-go line is "a beautiful analyser that cannot ingest a photograph."**
- That metric requires the B2 **photo → OCR draft → parse correction** pipeline, i.e.
  **D-11 (OCR adapter + low-confidence flagging)**.
- **D-11 is NOT shipped:** `H-11 = "No entry yet"`; `packages/ocr-adapter` is an
  interface-only seam (`Q10 OPEN — benchmark wks 1–4`); `D-12` shipped text scope
  only (its photo-path criteria are deferred until D-11 lands).
- **Q10 (OCR provider) is OPEN/BLOCKED** (SCAFFOLD §7 Q10; CHANGE_LOG 2026-09-09):
  no OCR provider credentials on the machine; the 15 `tests/fixtures/corpus_images/`
  JPGs fail provenance (generic EN/FR cards, no manifest, zero D-04 corpus
  correspondence); `scripts/ocr-benchmark.js` is self-test-only (PASS 3/3 harness,
  no provider run).
- Consequence: the photo go-metric **cannot be re-executed** — and A-28 declares
  "go metrics (BLOCKER class, re-executed, not read)". An unmeasurable photo metric
  is a BLOCKER at A-28, so D-28 cannot proceed as specified.

#### What IS ready (recorded, for the dispatcher)
- Dependencies D-24 (cook loop) + D-27 (veto/retention/ops) — DONE.
- `tests/fixtures/messy_20/` — the twenty messy week-12 recipes EXIST (20 synthetic
  JSON fixtures, `provenance.synthetic:true`, QG5 named set).
- Golden fixture + 8 CI invariants (G1) — green in CI.
- Prints (D-23 E4/E5 one-page), cook log + note recall (D-24 F1/F2/F6), save/list/log
  (D-22), veto (D-27 G2), restriction profiles (D-26), aliases/tags (D-25) — DONE.
- Reviewer ROSTER SLOTS (`tests/fixtures/reviewers.json`): two regional slots
  (tn_kanyakumari + kerala), identities OUTSIDE the repo (not fabricated) — G2 done;
  G3's chef pass is a product adversarial pass (culinary editor/chef), not the
  regional reviewers.

#### Open decisions / assumptions that MUST remain unresolved (record with register IDs)
- Q10 (OCR provider) — OPEN/BLOCKED (the gating gap above).
- Q1/Q5/Q6/Q11/Q12/Q14/Q15 — OPEN; none may be resolved here.
- Q7 (cloud vendor), Q13 (retry values pilot defaults at D-17) — untouched.
- A-27 F-1 (MINOR: gate 2h prefix-match) — carried forward; NOT silently closed.

#### A-28 audit vectors (for when D-28 is dispatched)
- Go metrics (BLOCKER class, re-executed not read): zero invented on golden; three
  curries separable in chef mode; prints one page; photo→first analysis < 2 min;
  no "safe"; no point-kcal.
- §14 go line: Must stories on golden + 20 messy; View 5 not vetoed wholesale;
  cooks used save + list + log without coaching (pilot log evidence).
- Blocker regression sweep: re-run every prior audit's BLOCKER checks on the pilot
  commit (one-writer greps, INV-04/05/10/12/13/14, two-fenugreeks, XOR/claim,
  ownership escape, golden suite in CI).
- §15 acceptance scene end-to-end (Priya's walk, unassisted).
- OPEN DECISION register diff (Q1–Q7, Q9–Q17) — none silently resolved.

#### Exact implementation resume point (after the dispatcher unblocks)
1. Dispatcher either (a) dispatches D-11/Q10 (OCR provider + adapter + golden photo
   fixture with provenance) BEFORE D-28, or (b) records a dated, explicit D-28 scope
   reduction excluding the photo go-metric (with the no-go line re-examined).
2. Then D-28: pilot protocol (20 users; golden + messy_20; §14 metrics recorded with
   go/no-go recommendation) · G3 chef pass (Kumari / inland Tamil / Kerala kudampuli
   separable, zero invented, no "safe"/point-kcal) · TEST_PLAN mechanism-5 closing
   sweep (every prior BLOCKER re-run + §15 acceptance scene) · HANDOFF evidence set.
3. HARD STOP before D-31.

### H-29 — D-29 Track R reference data

- BASE_SHA / COMMIT_SHA: **BASE `8c59a9d` · COMMIT `aff7c8c`** (full `aff7c8c07b497771c3dd85da6d009079c8f2b908`) — pushed to `github.com/mohamedazzim/recipe-systems` branch `main` (2026-09-10, owner-authorized). CI: **run 34390362800 = success** on this exact SHA (GitHub API-verified).
- Date / agent session: 2026-09-09/10 · D-29 dispatch session (pre-flight GO recorded in HANDOFF §5 BEFORE code; D-19→D-29 reorder decision recorded and user-accepted). Backfilled into this ledger 2026-09-10 from the §5 execution record + CHANGE_LOG (evidence re-verified by direct inspection + live DB query; no criteria invented).
- Status: **DONE** (implementation + verification). Formal entry was "No entry yet" until this backfill — evidence always lived in HANDOFF §5 + CHANGE_LOG.
- Summary: `apps/api/src/admin` reference-data module — sole writer of the six curated reference tables (ADR §2); no public admin HTTP API (canonical docs prescribe none) — reviewed path via CLI `reference-data:import`: stage/diff (writes nothing) → human approval record (content-sha-signed) → effective-dated persist; forward-only versioning; supersede closes the prior open version; history never mutated; overlap rejected by the DB `EXCLUDE USING gist` constraints; unreviewed persist impossible. Content: 4 reviewed imports with committed approval records — statutory allergen definitions (US big 9 + EU/UK 14 + coconut [non-statutory, FDA Edition 5] + fenugreek [legume]), 12 dictionary rows (Q5 label) + 6 aliases, 6 mappings, 12 USDA FDC SR Legacy composition entries (real values fetched 2026-09-09). Fenugreek powder has no distinct USDA record → I7-unmapped (listed, excluded) — no invented values. Gate fix: the Q5 one-writer pattern was case-blind to camelCase Prisma models (`ingredientDictionary`) → strengthened; both reference one-writer gates now actively enforce.
- Files changed: `apps/api/src/admin/**` (service, repository, module, CLI, import schema, tests), `apps/api/src/app.module.ts`, `apps/api/package.json`, `infra/reference-data/{approvals,imports}/**` (4+4 files), `scripts/regression-gates.sh`, `tests/integration/story_d29_reference_data.test.ts`, `docs/{CHANGE_LOG,HANDOFF}.md`.
- Test results: API 160/160 (+12) · D-29 integration story 8/8 real Postgres (stage no-rows; unreviewed reject; sha-mismatch reject; supersede closes+versions+history intact; backdate reject; DB overlap reject; I7 unmapped; golden lookups — fish flagged, coconut NOT tree_nuts, fenugreek flagged, mustard EU) · gates PASS with both one-writer gates enforcing · verify-local exit 0 · CI green (run above). Re-verified 2026-09-10: live DB counts 17 defs / 12 dict / 6 aliases / 6 mappings / 12 entries / 12 versions — intact after integration runs (snapshot-restore hygiene).
- Done-criteria evidence (BUILD_PLAN Track R exit): allergen + nutrition data loaded via the reviewed path with effective-dated versions; overlap attempt rejected (integration proves the EXCLUDE constraint fires); an unreviewed mapping change cannot silently alter View 8/9 (approve() requires the sha-signed approval record; bypass rejected in tests); I7 — mapped lines carry USDA ids, unmapped lines excluded from totals and listed.
- Gate evidence: QG2 one-writer gates (dietary/nutrition AND dictionary/alias) both actively enforcing, fire-proofed by `qg2_gates.test.ts`.
- OPEN DECISION notes: Q5 stays OPEN — every dictionary/alias write labeled "Q5 WORKING ASSUMPTION" (working assumption permitted by DISPATCH D-29; not a final decision).
- Deviations: no staging table (staging = validated import files + signed approval records — the ERD is frozen); fish sodium kept as real per-class values (species-unknown sodium rule deferred to D-19's consumption); D-19 recompute design preserved for the D-19 pre-flight (recorded 2026-09-10, see §5).
- Audit result: **A-29 = PASS-WITH-FINDINGS (2026-09-16)** — no BLOCKER/MAJOR; F-1 builder-session process note. Q5 stays OPEN (labeled working assumption).

### H-30 — D-30 Track S shopping data
- BASE_SHA / COMMIT_SHA: base `1bd38f1` / D-30 checkpoint commit (this entry).
- Date / agent session: 2026-09-11 · DeepSeek V4 Pro (VS Code) D-30 dispatch.
- Summary (what shipped): the Track S shopping data layer behind new API
  `ShoppingModule` endpoints (`POST/GET /recipes/:id/shopping-list`, `PATCH
  /recipes/:id/shopping-state`; GuestOrJwt + Csrf on writes, INV-17 404s) — E1
  generation from ACTIVE `recipe_ingredient_line` rows only (C-39 keys preserved,
  two fenugreeks distinct, qualifiers visible, no headers), E2 have/need in the
  canonical `ingredient_shopping_state` (composite-key upsert; survives
  regeneration + reopen; C-28 cleans on soft-delete), E3 five-group market
  grouping (D-30A keyword mapping persisted into `shopping_list_item.group_name`),
  Q2 Option A allergen snapshot (`shopping_list_generation.allergen_line`,
  migration 004 + ERD §7 amendment, frozen View-8 line rendered at generation,
  never re-derived at print time). Web `ShoppingSection` (generate/groups/
  have-need toggle/regenerate/reopen, no print UI).
- Files changed: `apps/api/src/modules/shopping/{shopping.service,shopping.controller,
  shopping.module,*.test}.ts`, `apps/api/src/app.module.ts`,
  `packages/database/prisma/schema.prisma` + `migrations/004_shopping_allergen_line`,
  `docs/Recipe_Systems_ERD_FINAL.md` (§7 amendment), `apps/web/components/app/
  ShoppingSection.{tsx,test.tsx}`, `apps/web/lib/types.ts`, `apps/web/components/
  app/RecipeWorkspace.tsx(+flow test routes)`, `scripts/regression-gates.sh`
  (2b shopping one-writer + 2c allergen_line column), `tests/integration/
  story_d30_shopping.test.ts`.
- Commands run: `npx prisma migrate deploy` (004 applied) · shopping API unit
  suite · web ShoppingSection suite + full web suite · full API/web/worker/db/
  domain/llm-adapter suites · `npx jest --config jest.integration.config.js` ·
  `bash scripts/regression-gates.sh` · `bash scripts/contract-check.sh` ·
  lint/typecheck · `bash scripts/verify-local.sh` (exit 0).
- Test results: API 224/224 (16 new shopping tests) · web 110/110 (6 new) ·
  worker 60/60 · database 3/3 · domain 1/1 · llm-adapter 123/123 · integration
  111/111 incl. NEW `story_d30_shopping.test.ts` 5/5 (real Postgres + golden
  fixture + reviewed reference data) · gates PASS (8/8 golden + 2 new D-30
  gates) · contract OK · lint/typecheck 0 · verify-local ALL STEPS PASSED.
- Done-criteria evidence (DISPATCH D-30, one line per criterion):
  - "List generated from the golden object … two fenugreek rows, no headers,
    'to taste'/'for tempering' visible (E1 TCs)" → story_d30 E1: 11 rows for the
    11 golden lines, fenugreek rows distinct keys + names, no headers (rows only),
    qualifiers in the display names; grouping matches D-30A for all 11 lines.
  - "Have/need state persists across list regeneration and reopen (E2 TCs)" →
    story_d30 E2 + live browser: toggle Fish → regenerate ×2 → reopen → state
    'have' persisted; exactly 1 state row (no duplicates).
  - "Grouping per E3 categories (E3 TC)" → story_d30 E1 groups equal the five
    canonical groups (golden card yields 4 non-empty groups, canonical order).
  - "Soft-delete of a line cleans its shopping state (C-28); state survives list
    regeneration" → story_d30 C-28: softDeleteLine → state row gone (trigger) →
    regeneration yields 10 rows without the deleted line; E2 regeneration keeps
    the state.
- Gate evidence: regression-gates PASS incl. NEW gates 2b (shopping_* writes
  confined to the API shopping module) + 2c (allergen_line in schema + migration)
  · qg2_gates scratch-tree proofs still pass (gates trivially green before the
  subject exists) · contract OK (openapi unchanged — D-05 frozen set untouched).
- OPEN DECISION notes: Q2 stays RESOLVED (Option A — D-30B ships its shopping
  side). `include_on_list` semantics stay OPEN (ERD §15.1) — D-30C applies the
  dispatcher's explicit rule (one row per active line) without deciding the ERD
  question. Q1/Q5/Q9/Q10/Q11 untouched. No D-23/D-24+ work.
- Deviations: none from the dispatch — E3 grouping mechanism (D-30A) and the
  allergen-snapshot rendering (D-30B) are the recorded D-30-scoped assumptions
  from the preflight, now implemented.
- Open items / follow-up risks: D-23 next (print templates; the station-card
  allergen column + the renderer stay D-23) · E3 keyword mapping is a labeled
  D-30 assumption — refine under D-23/D-25 if market feedback demands.
- Audit result: **A-30 = PASS-WITH-FINDINGS (2026-09-16)** — no BLOCKER/MAJOR; one MINOR finding F-1 (duplicated `renderAllergenLine` in the shopping module vs `packages/rendering`, worker already imports the shared helper) and F-2 (builder-session audit caveat). Not fixed in audit.
- **Preflight re-verification (2026-09-16):** D-30 ALREADY COMPLETE — `story_d30_shopping` 5/5 and the shopping unit suites 16/16 re-pass; regression gates 2b/2c PASS. No implementation is needed; the A-30 audit is the single outstanding step.

### H-31 — D-31 Could-have tail (E6, F5, I5 — conditional per §13)

- **Status: COMPLETE (2026-09-16).** §13 SATISFIED → D-31 UNBLOCKED → implemented → audited (**A-31 = PASS**, no findings).
- **Dispatcher determination (2026-09-16, recorded verbatim):** "Based on the recorded implementation, audit, CI, integration, regression, and E2E evidence for the week 9–10 Must units (D-22, D-23, D-24, D-30), I determine that the week 9–10 Must work was stable at dispatch for purposes of the §13 Could-have unlock condition." Supporting evidence cited: A-22/A-23/A-24/A-29/A-30 PASS-WITH-FINDINGS, recorded green CI/regression, recorded integration/E2E. Known non-blocking findings remain documented.
- This determination does NOT close D-28's separate human-pilot evidence requirement. **D-28 remains PENDING HUMAN EVIDENCE.**
- §13 condition: SATISFIED. D-31: UNBLOCKED (§13 satisfied 2026-09-16).

#### Implementation (2026-09-16)

- **E6 one-pager:** `packages/rendering/src/templates/one-pager.ts` (`onePagerHtml` + `I6_DISCLAIMER`) rendering keep (View 2), negotiate (View 4), identity-shift (View 5 `not_this` + family), ingredients (D-20 station-card mise) and the optional View 9 energy band; snapshot-only footer; never a legal nutrition label.
- **API print surface:** `PrintService.onePagerPrint` (reads persisted `analysis_view` 2/4/5/9 + `analysis_station_card` only; 404 `ONE_PAGER_NOT_FOUND` when no completed analysis) + `GET /recipes/:recipeId/print/one-pager` (`?format=html|pdf`).
- **F5 plate photo:** `CookService.attachPlatePhoto`/`platePhoto` (one `cook_log_photo` per log via the `@unique cookLogId`; replace deletes the old object; ownership rides `assertOwned`; no enqueue anywhere in the module) + `POST`/`GET /cook-logs/:cookLogId/photo` (JPEG/PNG ≤10 MB).
- **Web:** `CookSection` plate-photo attach/replace + status; `AnalysisViews` home-mode "Print one-pager" button (hidden in chef mode and without a `recipeId`).
- **Verification:** API 329/329 · web 156/156 · worker/schemas/rendering/database/domain/llm/ocr suites green · integration 24/24 · 156/156 (new `story_d31_one_pager_photo` 5/5) · `regression-gates.sh` PASS · golden 8/8 · typecheck 0 · lint 0 · build 0 · `prisma migrate deploy` no pending migrations.
- **Reconciliation note (2026-09-16):** C7 (substitution preview, RS-US-18 — a §13-conditional Could-have) remains UNSHIPPED: it was DEFERRED in D-25 (H-25) and is not part of D-31. §13 is now SATISFIED, so C7 is an open dispatcher decision, not a blocker. D-28 remains the only remaining dispatch unit (PENDING HUMAN EVIDENCE).

#### §13 stability evidence package (prepared 2026-09-16 — determination NOT made)

The §13 condition is: "Could-haves (C7, E6, F5, I5) only if Must on weeks 9–10 is stable" (Recipe_Systems §13). Weeks 9–10 Must units: D-22 (D1/D2/D6), D-30 (E1 data), D-23 (E4/E5/H4), D-24 (F1/F2/F6).

**Supports stability:**
- A-23 = PASS-WITH-FINDINGS (print one-page, INV-12 snapshot-only, Q2 allergen line).
- A-24 = PASS-WITH-FINDINGS (cook loop F1/F2/F6).
- A-30 = PASS-WITH-FINDINGS (shopping E1/E2/E3, C-28, Q2 Option A).
- D-22 implemented (H-22) and deterministically covered (story_d22 5/5 in the 151/151 integration run).
- Recorded green CI: D-23 run 69; D-24 34930312273/34930324926; D-25 34952720762; D-26 34936562239; D-27 34967842614; D-29 34390362800.
- Fresh (2026-09-16): integration 23/23 · 151/151; regression gates PASS; golden 8/8; typecheck 0; API build 0; migrate up to date.

**Missing evidence:**
- A-22 (D-22) and A-29 (D-29) audits are now recorded (both PASS-WITH-FINDINGS, 2026-09-16).
- D-28 week-12 pilot is PENDING HUMAN EVIDENCE (the natural stability demonstration).

**Human-only determination:**
- The §13 "weeks 9–10 Must is stable" judgment is a dispatcher decision — not agent-made.
- D-28 human gates: 20-user uncoached cohort, G3 Chef pass, two regional reviewers, uncoached save/list/cook-log.

**Non-blocking documented findings:** A-23 F-1 (no print e2e spec, deferred) + F-2; A-24 F-1 + F-2; A-25 F-2 (F-1 closed); A-26 F-1/F-2/F-3; A-27 F-1/F-2; A-30 F-1/F-2; A-11 F-1/F-2 (closed) + F-3.

**Actual blockers:** none technical (final production-readiness audit: "NO KNOWN TECHNICAL RELEASE BLOCKER"). The only D-31 blocker is the missing §13 dispatcher determination.

#### D-28 human evidence gap review (final, 2026-09-16)

Four evidence categories (never merged):

**A. Automated technical evidence (available):** golden 8/8 · corpus 50 + messy_20 20 · regression gates PASS · integration 23/23 · 151/151 · typecheck 0 · API build 0 · migrate up to date.

**B. Autonomous browser/live-system evidence (available, NOT human evidence):** 20 autonomous guest sessions (AUTONOMOUS-P01..P20, intake/save/cook-log/isolation) · authenticated browser production path (stub; ingest → review → method → analyse → views → save → library → cook log → reload/reopen) · D-27 veto semantics (story_d27 5/5 + live boundary) · historical timing ~1m40s (DeepSeek, reused).

**C. Human-observation evidence (MISSING — HUMAN EVIDENCE REQUIRED):** 20 real uncoached participants (§14 "cooks used save + list + log without coaching") · real Chef G3 evaluation of the three curries (Kumari / inland Tamil / Kerala kudampuli) · two real regional reviewers (TN/Kanyakumari + Kerala) exercising View 5 veto · §15 acceptance scene "unassisted" (A-28 vector).

**D. Dispatcher stability determination (NOT made):** the §13 "Must on weeks 9–10 is stable" judgment is the dispatcher's alone.

#### §13 DISPATCHER DECISION PACKAGE (2026-09-16)

**Evidence supporting stability:** weeks 9–10 Must units implemented + audited (A-22/A-23/A-24/A-30 + A-29 all PASS-WITH-FINDINGS); recorded green CI (69, 34930312273/34930324926, 34952720762, 34936562239, 34967842614, 34509853030, 34514834141, 34390362800); fresh integration 151/151 · gates PASS · golden 8/8 · typecheck 0 · API build 0 · migrate up to date; autonomous production-path validation green.

**Evidence still missing:** D-28 human pilot (20 users, G3 Chef, regional reviewers, uncoached persistence, §15 unassisted walk).

**Human-only evidence:** category C above.

**Non-blocking findings:** A-23 F-1/F-2; A-24 F-1/F-2; A-25 F-2; A-26 F-1/F-2/F-3; A-27 F-1/F-2; A-30 F-1/F-2; A-11 F-1/F-2(closed)/F-3.

**Known technical blockers:** none ("NO KNOWN TECHNICAL RELEASE BLOCKER").

**D-28 status:** PENDING HUMAN EVIDENCE. **D-31 status:** COMPLETE (H-31 implemented + A-31 PASS, 2026-09-16).

**Dispatcher action completed (2026-09-16):** the §13 determination was recorded by the dispatcher — week 9–10 Must work "was stable at dispatch." D-31 was then implemented and audited (A-31 PASS). D-28's human pilot remains separately pending.

✅ §13 stability evidence RECORDED (dispatcher, 2026-09-16): week 9–10 Must work was stable at dispatch.


- 2026-09-09 — **D-17 EXECUTION (post pre-flight GO; H-17 filled)**: implemented per the recorded
  plan. Implementation findings and decisions:
  - **pg-boss pinned v10.4.2** (CJS line; v12 is ESM-only — `"type":"module"` — and breaks
    ts-jest/ts-node/tsc for this CJS stack; downgrade recorded before implementation).
  - **pg-boss v10.4 batch delivery**: work handlers receive an ARRAY of jobs. The first worker
    build read `job.data` off the array → `data.analysis_id` threw inside the callback → pg-boss
    retried 3× → jobs failed with a silent worker (no logs beyond boot). Root-caused with a minimal
    repro (pgboss-debug.js: `DEBUG JOB = [{id,name,data}]`, keys `['0']`); fixed by iterating the
    batch. The integration suite's `boss.fetch`+`complete` was unaffected (fetch returns wrappers)
    — this was a live-worker-only failure, caught by live-stack verification.
  - **API analysis module never writes analysis_*** (A-17 one-writer): the enqueue ACK carries the
    pre-generated UUID; the row materializes at worker delivery. POST returns 200 via @HttpCode
    (default 201 was wrong — the ACK is not a resource creation).
  - **Non-UUID analysisId → P2023 → 500** (found by live check): UUID format guard now throws 404
    before any Prisma call, on GET and SSE alike.
  - **SSE connect racing the worker**: row-not-yet-materialized connects now stream from `queued`
    (INV-16 signal-only — content never flows on this channel), instead of 404ing the connect.
  - **Q1 payload in code**: the API's capture builder ships `{structured_recipe}` built from recipe
    + active lines + method state in the job payload — the DISPATCH-permitted labeled assumption;
    `recipe_snapshot` stays `unknown`; BUILD_PLAN §7.2 formal decision still owed (week 5/P7).
  - **Q9 in code**: worker adapter = `ANALYSIS_LLM_STUB` env (fixture adapter, dev/demo) or the
    labeled pending adapter; `analysis.model_version` = `stub-no-provider-q9`. No provider code.
  - **Migration 003**: Prisma `@@unique([analysisId, viewNumber], map: "uq_analysis_view")` — the
    DB constraint already exists (002); metadata alignment for idempotent upserts (ADR §14),
    `CREATE UNIQUE INDEX IF NOT EXISTS` = no-op on existing DBs.
  - **Integration-test queue hygiene**: `story_d17_worker_loop.test.ts` uses a dedicated per-run
    queue (analysis_it_<ts>_<rand>) so test fetch/complete never touches the live `analysis` queue
    (the first version abandoned fetched-but-unused jobs in `active` state — fixed, and the
    orphaned pgboss rows were deleted).
  - Tests/gates: worker unit 9/9; API unit 139/139 (analysis service 5/5 added); integration 4/4;
    live stack 15/15 + SSE live-push (snapshot:queued → status:generating → status:complete);
    regression gates PASS; lint/typecheck clean; verify-local exit 0 ALL STEPS PASSED.
  - Intentional non-changes: D-14 logic not duplicated (gate consumed as-is); D-16 grounding not
    re-implemented (generateGrounded consumed as the choke point); no D-18 view content (views 8/9
    INCOMPLETE); no Q9/Q1/Q5/Q10/Q13 resolution; no UI changes.
  - Git: feature `307d5a5` (307d5a5312b6dd0c89b4a4e5933288e6237e382f); CI fixes
    `221b1ac` (llm-adapter build before typecheck — CI-only: dist missing on fresh checkout) and
    `247b26b` (worker bootstrap test fully mocked — CI-only: DATABASE_URL set in CI made the old
    test open a real pg-boss connection and hang the unit step); pushed to main; remote SHA
    verified; tree clean. CI chain: run 34350615469 failed → 34352075690 failed →
    **34353922712 success**.
  - Resume point: **D-18 (Views 1–4 + home mode) — awaiting explicit dispatch.**


- 2026-09-09 — **UI/UX BUILD pre-flight (product flow around the implemented backend; recorded BEFORE code)**
  **STARTING UI STATE:** `apps/web` = one page (`app/page.tsx`): public landing (`LandingPage`) when
  anonymous, a bare 'Signed in' card, and a bare 'You're analysing as a guest' card + empty area
  (the reported problem). No routes beyond `/`; no app views. Design system EXISTS and is complete:
  `app/globals.css` semantic tokens (rice-flour canvas, charred-cumin ink, tamarind accent, turmeric
  gold, curry-leaf positive, chili negative; dark theme in `.dark`), `components/ui/*` primitives
  (Button 5 variants, Card 3 elevations, Typography/Display/Heading/Text/Eyebrow, Alert 4 tones,
  Tabs, Field, Input/Textarea, EmptyState, Spinner/LoadingScreen, Badge with claim tags), Fraunces
  display + IBM Plex Sans, `.container-rs`, `.eyebrow`, `.tabular`, global focus rings +
  reduced-motion. `lib/api.ts` = BFF fetch + CSRF header + ApiError{status,code}; `lib/types.ts`
  nearly empty. No web test framework (no jest in the workspace).
  **BACKEND CONTRACTS CONSUMED (verified in code):** POST /recipes/parse-text (GuestOrJwt+Csrf) →
  200 {recipe_id, recipe:{raw_text, lines, flags}}; GET /recipes/:id/lines → {items:[wire line]}
  (JwtAuthGuard); PATCH/DELETE lines, POST lines, POST lines/:id/split (all JwtAuthGuard+Csrf; PATCH
  body {display_name, amount, unit, quantity, category, confirmed_sense, include_on_list, is_header,
  merge_with_next, needs_review:false-literal, expected_updated_at}; merge = PATCH merge_with_next:true
  ALONE); PATCH /recipes/:id/method (JwtAuthGuard+Csrf) {method none|paste|inferred, method_text,
  method_source} → {method_tag METHOD|INFERRED|null, method_source, list_only}; POST
  /recipes/:id/analyse (GuestOrJwt+Csrf) {mode} → 200 {analysis_id, status:'queued', prompt_version}
  · 409 ENQUEUE_BLOCKED {blockers:[{line_id, display_name}]} · 422 METHOD_REQUIRED; GET
  /analysis/:id (GuestOrJwt) → {analysis_id, status queued|generating|complete|failed, mode,
  is_latest, prompt_version, model_version, views:[{view_number, view_key, status, payload}]};
  GET /analysis/:id/events (SSE: event snapshot + event status {analysis_id, status, is_latest}).
  **GAPS FOUND (recorded, not silently bridged):**
  1. **No readiness read endpoint** — D-14's `IntakeService.getEnqueueState` exists but has NO HTTP
     route. The UI's readiness screen + disabled-Analyse state need the canonical backend result
     (dispatch: no client-only calculation). **Decision:** add a minimal READ-ONLY `GET
     /recipes/:recipeId/enqueue-state` (JwtAuthGuard, Csrf-free read) exposing the existing D-14
     wire contract {can_enqueue, blockers}. No new business logic, no contract change (the shape is
     the D-14 wire contract). Recorded as a UI-required, canonical-shape route addition.
  2. **Guest review/method = client-side draft per canonical design** (API doc §3/§4 auth labels +
     H-12 D-12A: guests keep corrections client-side until P3's analyse consumes the corrected
     object; analyse takes {mode} only today). Guest UI therefore: paste works; review is READ-ONLY
     with a sign-in/claim CTA; method + analyse require sign-in (honest 422 fallback). The full
     demo flow runs on a signed-in account (chef@recipesystems.test); the claim flow bridges
     guests. NO guard changes, NO guest-draft endpoint invented.
  3. **needs_review=true is OCR-only** (D-11 deferred; PATCH accepts literal false only) — the
     blocked-Analyse state is implemented in the UI (disabled button + blockers list) but is only
     reachable with real data once D-11 ships; demo shows the ready state + the UI's blocked form
     is unit-tested. Recorded, not faked.
  4. **No recipe-list endpoint** — the home's 'recent recipes' is a client-side session store
     (localStorage), labeled 'This session', containing only recipes created here. Honest, not a
     fake backend list.
  **UI DECISIONS:** single-page app shell with an internal view state machine (home → create →
  workspace) inside `app/page.tsx` (no new Next routes; keeps existing E2E surface + the landing
  contracts); workspace = one page with sections (Ingredients review / Method / Readiness+Analyse /
  Analysis status) instead of empty separated screens; ingredient rows edit INLINE (no modals —
  keyboard + mobile friendly); analysis status = poll + SSE, real states only (queued/generating/
  complete/failed + per-view row statuses), NO fake progress percentages; complete-with-no-D-18 →
  honest state 'Analysis complete. Detailed recipe views are coming next.' backed by the real
  views array (7 COMPLETE + 2 INCOMPLETE with the real model pin); guests get a NON-BLOCKING
  account band (secondary), never the main page; photo = disabled card 'Photo capture — coming
  soon' (Q10 deferred, never appears functional). Existing E2E contracts (entry.spec guest
  headings, signup.spec 'Signed in' heading) are updated DELIBERATELY in the same change — the
  guest card strings are replaced by the Recipe Home; 'Create account & claim' + 'can be claimed
  onto an account' survive on the home band.
  **TEST INFRA GAP:** no web test framework → add jest + ts-jest + @testing-library/react + jsdom
  (React 19 compatible), coverage floor on the new app components/lib, CI parity via the existing
  workspace test step. Icons: add @phosphor-icons/react (no icon library present; no hand-rolled
  SVGs). Playwright remains environment-blocked (policy) — component tests + real live HTTP checks
  used instead, honestly recorded.
  **UI pre-flight verdict: GO** — with the four recorded gaps handled as above; no fake endpoints,
  no invented backend behavior, no auth-contract changes.


- 2026-09-09 — **UI/UX BUILD EXECUTION (product flow around the implemented backend; pre-flight GO above)**
  Inspected: the full web app (one landing page + two bare cards), the complete existing design
  system (tokens + ui primitives), the BFF api helper, and every backend route the flow needs.
  **Built (all frontend, components in `apps/web/components/app/` + `lib/`):**
  - `AppShell`: branding bar, account/guest state, one-line nav, view state machine
    (home → create → workspace) inside `app/page.tsx` (no new Next routes; landing contracts kept).
  - `HomeView`: Recipe Home (primary Create recipe, session-only recipe list labeled 'This
    session' from localStorage — no list endpoint exists, recorded above; helpful empty state;
    the guest claim band as a secondary non-blocking strip with 'Create account and claim').
  - `CreateView`: paste intake (real parse-text), loading/error states with real backend messages,
    photo card visible but disabled ('Photo capture — Coming soon.', never functional).
  - `RecipeWorkspace`: one page, four real sections. `IngredientReview` (D-12 actions: inline
    edit with stale-edit token, add, delete 204, split by char position, merge_with_next alone,
    sense-confirm, clear-review needs_review:false literal; review-required badge; guests
    read-only + honest note). `MethodSection` (D-13: paste / inferred+named-source / none; the
    canonical list-only consequence for no method; guest note per API §4). `ReadinessPanel`
    (readiness from the new GET enqueue-state ONLY; Analyse disabled on can_enqueue=false with
    the real blockers listed; 409 ENQUEUE_BLOCKED + 422 METHOD_REQUIRED handled). `AnalysisPanel`
    (D-17 states only: queued/generating/complete/failed via poll + SSE named events; complete →
    'Detailed recipe views are coming next.' with the REAL persisted view rows; no fake progress).
  - `lib/hooks/useAnalysisStatus.ts`: poll + SSE (named status/snapshot events; poll is the
    source of truth, INV-16), terminal-stop, error passthrough.
  **Backend addition (recorded, minimal, read-only):** `GET /recipes/:recipeId/enqueue-state`
  (JwtAuthGuard) exposing the existing D-14 `getEnqueueState` wire contract — required for the
  readiness screen; no business logic added, no contract changed.
  **UI decisions applied:** existing brand tokens/classes only (no one-off styles); inline row
  editing (no modals — mobile/keyboard friendly); no em-dashes in copy; middle dots removed from
  metadata strips; one accent (tamarind); tabular numerals for amounts; icons via
  @phosphor-icons/react (mocked in unit tests); global focus rings + reduced motion already in
  globals.css.
  **Test infra added:** jest + ts-jest + RTL + jsdom in apps/web (React 19 compatible), phosphor
  icon mock, style mock, EventSource stub, coverage floor 75% lines on the app components/lib.
  **Failures & recovery:** jest transform regex shipped with doubled backslashes (mangled by
  escaping) → rewrote the config verbatim; phosphor ESM package broke jest → dedicated icon mock;
  refresh() cleared the stale-edit error before it rendered → set the error AFTER reloading;
  test fixtures off-by-one on the COMPLETE/INCOMPLETE split (views 8/9 incomplete) → fixed;
  initial-method-sync call confused the method-save assertion → assert the last matching call;
  live check: DELETE returns 204 (not 200) → fixed expectation; the EADDRINUSE/orphan pattern
  repeated on API restart → kill-port + orphan sweep, then restart; the orphan sweep also killed
  the live worker once → restarted, noted as a recurring ops hazard.
  **E2E contracts updated DELIBERATELY (same change):** entry.spec guest flow now asserts the
  Recipe Home + secondary claim band + disabled photo card; signup.spec asserts 'Your recipes' +
  email in the header. Landing-page contracts untouched.
  **Evidence:** web unit 48/48 (82.98% lines, floor 75); API unit 141/141 (enqueue-state
  controller 2/2 added); workspace unit green; integration 72/72; regression gates PASS;
  typecheck/lint clean; live HTTP flow 13/13 (paste → two distinct fenugreek lines → readiness →
  edit/add/split/merge/delete → method → analyse → worker → 9 real view rows → list-only 422);
  web serves 200. Playwright remains environment-blocked (policy) — component tests + real live
  HTTP used, honestly recorded. verify-local: pending at this line (runs next, stack stopped).
  **Intentional non-changes:** no OCR/photo path, no guest review/method/analyse bridge (canonical
  auth labels preserved — guests read-only with sign-in CTA), no recipe-list endpoint, no fake
  analysis content, no D-18 view rendering, no readiness client-side calculation.
  **Resume point:** Git checkpoint **`a5530d3`** (a5530d352531f08a4c39862b401d7373719db6da) pushed
  to main; remote SHA verified; tree clean; CI run **34361814176 success**; stack restored
  (web/API/Keycloak 200, worker consuming). Next: D-18 (Views 1–4 + home mode) — awaiting
  explicit dispatch.


- 2026-09-09 — **BUG FIX: authenticated ingredient retrieval ("Recipe not found" in the workspace)**
  **Failure (user-reported, reproduced):** signed in as chef, the workspace title rendered but the
  ingredient section showed "Could not load the ingredient lines / Recipe not found".
  **Evidence (live trace, no code changed first):**
  - Path A (fresh authenticated paste): POST /recipes/parse-text (chef) → 200,
    recipe_id `aa7c2d44-...`; GET /recipes/:id/lines → 200 with real rows. The authenticated flow
    itself was NEVER broken.
  - Path B (reproduced exactly): a GUEST-created recipe (the user's earlier ground-beef paste was
    guest-owned), then chef signs in in the same browser; GET /recipes/:id/lines on the guest-owned
    id → 404 `RECIPE_NOT_FOUND`. Correct INV-17 behavior: assertOwned returns not-found for foreign
    recipes (no existence leak) — the API was right.
  - DB check: parse-text's returned recipe_id IS the persisted `recipe` row id (psql-verified), and
    the row is account-owned XOR guest-owned by construction.
  **Root cause (frontend):** the "This session" list (localStorage, no recipe-list endpoint exists)
  mixed recipes from BOTH identities and did not tag ownership; opening a guest-owned recipe while
  authenticated hit the correct 404 and the UI rendered it as a raw load error. Titles come from
  the session store because no title persistence exists (canonical placeholder: 'Untitled recipe').
  **Decision (canonical, no backend change, no auth weakening):** tag session records with their
  creating identity; the home splits "mine" (openable) from "Other sessions" (listed, explained,
  never openable); the review surface maps RECIPE_NOT_FOUND to a dedicated cross-session state
  ("This recipe belongs to a different session") instead of a raw error. Ownership enforcement
  stays 100% server-side (assertOwned untouched).
  **Changed:** `lib/flow.ts` (owner tags + isOwnedBy; legacy untagged records conservatively
  foreign), `lib/types.ts` (SessionRecipe.owner), `HomeView` (owner-aware split + accountId prop),
  `CreateView` (records the creating identity), `IngredientReview` (cross-session state on
  RECIPE_NOT_FOUND), `app/page.tsx` (accountId wiring; /auth/me id = accountId, verified in
  AccountService.toAccountRow).
  **Regression tests:** `RecipeWorkspace.flow.test.tsx` (authenticated paste → workspace → lines
  appear immediately from the parse response + refresh/edit target the SAME persisted id);
  HomeView owner-split tests; flow.ts isOwnedBy tests (incl. legacy-untagged conservative case);
  IngredientReview RECIPE_NOT_FOUND state test; existing guest no-fetch tests preserved (55/55 web).
  **Live verification:** 8/8 — authenticated paste → persisted-id match (psql) → account-owned row →
  lines 200 → edit 200 → method METHOD → enqueue-state ready → analyse queued.
  **Intentional non-changes:** no claim-existing-account endpoint invented (canonical claim exists
  only at signup), no recipe-list endpoint, no client-side ownership bypass, no OCR/D-18 changes.
  **Resume point:** verify-local → Git checkpoint → push → CI; then D-18 (Views 1–4) awaiting dispatch.


- 2026-09-09 — **BUG FIX: D-12 text/paste review (two reported bugs, root-caused + regression-locked)**
  **Bug 1 (paste = one giant line).** Evidence: `IntakeService.splitRawLines` split on
  `\r?\n` only — a single-line semicolon-separated paste ("1 lb ground beef; 1 onion, chopped;
  ...") became ONE draft line with the whole string. The canonical API doc §3 defines the OUTPUT
  (structured lines) without prescribing input delimiters; the D-12 boundary is segmentation, NOT
  semantic parsing. **Fix:** split on `\r?\n|;` (semantic-free; trim + drop empties unchanged).
  `recipe_input.raw_text` is NEVER touched — recordPaste stores the original string byte-for-byte
  before segmentation (psql-verified in live acceptance). Amount/unit/sense resolution untouched
  (stays in later D-12 stages; display_name stays verbatim per clause, including the trailing
  period of the final clause — byte-faithful segmentation).
  **Bug 2 (Add line → Delete fails with "Could not remove the line.").** Evidence: the canonical
  DELETE contract is **204 No Content with NO body** (API doc §3; controller `@HttpCode(204)`,
  no @Body, no stale-edit token — the row is soft-deleted by id alone). The frontend `api()`
  helper always ran `res.json()` — parsing the empty 204 body threw a SyntaxError (not an
  ApiError), so the catch showed the generic error and the list never refreshed (row stayed).
  **Fix:** `lib/api.ts` returns `undefined` for 204 without parsing; `IngredientReview.removeLine`
  now sends the canonical body-less DELETE (the dead STALE_EDIT branch removed — delete has no
  stale-edit semantics) and refreshes from the authoritative list.
  **Regression tests:** backend unit (splitRawLines semicolon cases incl. the exact reported
  string, no-clause-combining, mixed newline+semicolon; recordPaste raw-immutability + 8 ordered
  creates); integration `intake_storage.test.ts` (real Postgres: raw byte-for-byte + 8 ordered
  rows); web `lib/api.test.ts` (204 → undefined, ApiError passthrough, CSRF header),
  `IngredientReview` add→delete lifecycle regression (POST 201 → row appears → DELETE 204 with
  empty body → row gone, NO error banner) + delete-failure surfaces the real API message.
  **Live acceptance (12/12):** chef pastes the exact string → 8 separate draft lines, ordered;
  raw_text psql-verified byte-for-byte; add → persisted id → delete 204 → gone with no error;
  soft-delete row kept with deleted_at set; edit real line 200; delete real line 204; remaining 7
  lines correct and ordered.
  **Intentional non-changes:** no amount/unit/sense parsing (D-12 later stages), no OCR/Q10, no
  D-13/14/15/16/17 changes, recipe_input immutability preserved, Q4 Intake sole line writer.
  **Resume point:** verify-local → Git checkpoint → push → CI; then D-18 (Views 1–4) awaiting dispatch.


- 2026-09-09 — **D-18 PRE-FLIGHT (P3-4 Views 1–4 + home mode; recorded BEFORE code)**
  **Canonical contract (verified in docs + frozen schemas):**
  - DISPATCH D-18: render Views 1–4 from `analysis_*` rows (P0-5 schemas) + identification (C1) +
    claim tags (C4) + home mode as the default presentation. Done criteria: golden CI invariants
    stay green; grounding failure → view INCOMPLETE, never current (INV-10); two fenugreeks = two
    uses of one idea; coriander appears in View 1; View 2 records the blind spot; home mode by
    default; failed jobs never stuck at generating. NON-GOALS: Views 5–9 (D-19), chef mode (D-20),
    disclaimers (D-21).
  - Frozen payloads (packages/schemas, `.strict()`): View 1 {items[{ingredient_id, job,
    if_omitted, tag CARD|METHOD|INFERRED|ASSUMED}], role_groups[{role, ingredient_ids[]}]};
    View 2 {pillars[{pillar, source_ingredient_ids[], if_missing, tag}], blind_spot_notes
    [{ingredient_id, note}]}; View 3 {status COMPLETE|INCOMPLETE, stages[{stage_name, action, cue,
    duration|UNKNOWN, tag}], incomplete_reason}; View 4 {substitutions[{ingredient_id, substitute,
    consequence, tag INFERRED}]}. IdentificationSchema {family, architecture, confidence,
    not_this[], absent_on_card[], tags{family:INFERRED}} lives in the ENVELOPE; the persisted
    analysis_* rows hold NINE views only (D-17), and the identification content is carried by the
    persisted view_5 payload {family, architecture, confidence, not_this[{variant,
    key_difference}], needs_review:true, tag:INFERRED}.
  - **Decision (identification source):** the C1 block renders from the persisted view_5 row
    (family/architecture/confidence/not_this) — the only persisted identification source. The
    envelope's absent_on_card field has NO persisted row → honestly omitted (recorded, never
    invented). The full View 5 presentation stays D-19.
  - **Home-mode voice (Recipe_Systems §7):** View 1 = why each ingredient exists; View 2 =
    friendly balance table (blind-spot note VISIBLE — required output, not a bug); View 3 =
    narrative walkthrough; View 4 = what you can skip. UNKNOWN fields stay blank (duration
    UNKNOWN renders nothing). Claim tags C4 visible per item (Badge primitive exists); inferred
    method names its source = the D-13 method wire state from the workspace (method_tag/method_
    source — no GET-method route exists, so the workspace's method state is lifted for the
    display; fallback = the tag alone).
  - **API:** GET /analysis/:id (exists, GuestOrJwt) returns views[{view_number, view_key, status
    COMPLETE|INCOMPLETE, payload}] — the D-18 data source. The canonical GET
    /recipes/:recipeId/analysis (API §5, RS-US-13, Bearer or guest, 404 ANALYSIS_NOT_FOUND) does
    NOT exist yet — **Decision:** add it as a minimal READ-ONLY route (same assembly as the
    existing getAnalysis, latest is_current analysis for the recipe) so reopening a workspace
    shows the latest analysis. Doc-defined, no new business logic, no writer changes.
  - **States:** queued/generating/complete/failed (analysis.status, existing) + per-view
    COMPLETE/INCOMPLETE (view.status) + **unavailable view** (a view_number with no row → honest
    "not available yet" state, never fake content). INCOMPLETE views show their persisted
    incomplete_reason (View 3) or the grounding-refusal state (payload {} — INV-10: never current,
    never content).
  - **Ingredient name resolution:** payloads reference ingredient_id; names resolve from the
    current draft lines (GET /recipes/:id/lines — signed-in) + the workspace's initialLines.
    Unresolved ids render with the id visible and a neutral label — never dropped (INV-04
    spirit). Q1 stays OPEN (no captured-state persistence invented; the display uses the only
    persisted sources).
  - **UI structure:** the workspace's AnalysisPanel gains the real result rendering: when
    complete → identification block + Tabs (primitive exists) over Views 1–4, claim tags via
    Badge, grounded in the persisted payloads. Home mode only (no chef toggle — P4). The
    "Detailed recipe views are coming next" placeholder is REPLACED by the real rendering.
  - **Pre-flight verdict: GO** — Q1/Q5/Q9/Q10 untouched; no backend writers changed; no fake
    content; golden invariants re-verified by the existing gates.


- 2026-09-09 — **D-18 EXECUTION (P3-4 Views 1–4 + home mode; pre-flight GO above)**
  **Built:**
  - Backend: `GET /recipes/:recipeId/analysis` (API §5, RS-US-13, GuestOrJwt, read-only) — the
    latest is_current analysis with its view rows; INV-17 404 for missing/foreign; UUID guard.
    Controller unit tests 3/3 (assembly, foreign 404, none 404).
  - Web: `lib/views.ts` (pure helpers: home-mode UNKNOWN blanking, ingredient-name resolution
    from current lines with visible unresolved ids, identification-from-view_5, payload guards);
    `components/app/AnalysisViews.tsx` (identification block C1 + Tabs over Views 1–4 in home
    voice; claim tags via Badge; View 2 blind-spot alert visible; View 3 narrative + incomplete
    reason; unavailable/incomplete honest states — never invented content); `AnalysisPanel`
    complete → real result (placeholder removed); `RecipeWorkspace` lifts lines + method state +
    loads the latest analysis on open; `IngredientReview` onLinesLoaded callback.
  - Worker dev stub (Q9): `StubAdapter` builds view payloads FROM THE CAPTURED ingredient ids
    (request.recipe_snapshot.structured_recipe) so the D-16 grounding gate validates them against
    the same captured state — the full pipeline (including rejection) stays exercised in the demo;
    labeled dev-only, never production. (The previous static-id stub made every real recipe fail
    grounding → views 1/2/4 INCOMPLETE — the gate working as designed; the stub now demonstrates
    the COMPLETE path honestly.)
  **Evidence:** web 69/69 (AnalysisViews 9 cases incl. UNKNOWN blank, blind spot, INCOMPLETE
  reason, unavailable, unresolved ids); API 148/148 (+4); worker 21/21; workspace unit green;
  integration 73/73; gates PASS; lint/typecheck clean; live 13/13 (analyse → worker → latest
  analysis route → views 1–4 COMPLETE with payloads → view 5 identification → views 8/9
  INCOMPLETE → 404-none → foreign 404).
  **Intentional non-changes:** Q1/Q5/Q9/Q10 OPEN; no Views 5–9 presentation (identification uses
  the persisted view_5 payload only — the full View 5 surface is D-19); no chef mode (P4); no
  fake content; INV-10 respected (INCOMPLETE views render refusal states, never invented data).
  **Resume point:** verify-local → Git checkpoint → push → CI → report; then D-19 (Views 5–9)
  awaiting dispatch.


- 2026-09-09 — **D-19→D-29 REORDER DECISION (recorded BEFORE any D-29 code)**
  **D-19 pre-flight finding (accepted by the user):** D-19's deterministic View 8/9 golden
  criteria depend on the Track R reference tables (`dietary_allergen_definition`,
  `dietary_allergen_mapping`, `nutrition_food_composition_*`) — verified EMPTY in the live
  Postgres (0 rows in all six reference tables). Golden View 8 requires allergen claims via
  `analysis_claim.allergen_id` (H2) for fish/mustard/coconut/fenugreek; golden View 9 requires
  the 1300–2200 kcal energy band from composition data. D-19 cannot satisfy these honestly
  without reviewed reference data.
  **Decision:** OPTION A — dispatch D-29 (Track R reference data) BEFORE D-19. D-29 establishes
  the reviewed content-load path; no hidden golden-only reference subset in D-19; no fake
  allergen/nutrition seeding; D-19 is not the writer of reference tables; Q5 not silently
  resolved. D-19's open recompute design preserved for its own pre-flight.
  **Resume point:** D-29 pre-flight (this entry's companion) → report GO/STOP → await
  authorization → D-29 implementation → then D-19 re-dispatch.


- 2026-09-09 — **D-29 PRE-FLIGHT (Track R reference data; recorded BEFORE code)**
  **Canonical sources read:** DISPATCH D-29 (line 909+, deliverables/done criteria/non-goals),
  AUDIT A-29 (attack vectors: reviewed-path bypass BLOCKER, overlap rejection QG4, versioning
  UPDATE-of-history BLOCKER, I7 fidelity, Q5 hygiene), BUILD_PLAN §4 Track R + exit criteria,
  ADR §2 (one-writer: "Admin/reference-data module owns curated reference-data writes") + §7
  (reviewed import path: CSV/JSON → diff → human approval → effective-dated insert; source
  reference + import version recorded), ERD §9/§10 (effective-dated dictionaries; EXCLUDE USING
  gist overlap constraints; C-30 NOT NULL FKs), Recipe_Systems §12 H7/I7 + Epic-H/Epic-I story
  files, TEST_PLAN QG2 (gates) + QG4 (Track R fault cells: reference-import conflict,
  versioning determinism), SCAFFOLD §7 Q5 row.
  **Repository cross-check (per-instruction: verify, don't assume):**
  - EXISTING + VERIFIED: Prisma models for all six reference tables (IngredientDictionary 168,
    IngredientAlias 183, DietaryAllergenDefinition 378, DietaryAllergenMapping 393,
    NutritionFoodCompositionEntry 412, Version 428) matching ERD §9/§10 columns; migration 001
    (btree_gist) + 002 (tables + CHECKs + both EXCLUDE USING gist constraints); one-writer
    regression gates armed for dietary_*/nutrition_* + dictionary/alias (Q5 label).
  - MISSING: admin/reference-data module (no code; apps = analysis-worker/api/web; API modules =
    account/analysis/auth/intake/recipes); reviewed import path (import → diff → approval →
    effective-dated); any content (all six tables empty in live DB); import scripts; source
    corpus (US/EU statutory lists, USDA FoodData Central files); reference-data fixtures/tests.
  - NOT REQUIRED: analysis consumption (P4), profile UI (D-26) — D-29 non-goals.
  **Determinations (numbered per dispatch):** 1) D-29 owns the admin/reference-data module +
  reviewed import path; 2) tables: dietary_allergen_definition, dietary_allergen_mapping,
  nutrition_food_composition_entry/version + (Q5 working assumption) ingredient_dictionary/
  ingredient_alias; 3) sole writer = the admin/reference-data module (ADR §2; gates enforce);
  4) Q5 NOT formally resolved by D-29 — dispatch text: "work to the admin-module-working
  assumption until Q5 is answered; do not decide it" → Q5 stays OPEN, every dictionary/alias
  write labeled; 5) sources = US/EU statutory allergen lists + USDA FoodData Central with
  USDA/peer IDs (H7/I7); source_reference + import version recorded (ADR §7); 6) import =
  prepare CSV/JSON → show diff → human approval → effective-dated insert (the approval actor is
  the human reviewer per ADR §7; the app enforces via module-only writes + staging);
  7) effective-dated versions; new version per change, never in-place UPDATE (A-29 BLOCKER);
  overlap rejected by DB constraints; 8) golden records D-19 needs = the golden card's
  ingredients in the dictionary (fish, mustard, coconut, fenugreek lines) + statutory allergen
  definitions/mappings + USDA composition versions for the 1300–2200 kcal band — loaded via
  the REVIEWED path as real reference data; 9) done criteria = BUILD_PLAN Track R exit + A-29
  attack vectors (bypass rejected, overlap rejected, versioning, I7 fidelity, Q5 label kept);
  10) tests = reviewed-path integration, overlap-rejection (QG4), unreviewed-bypass rejection,
  versioning determinism, I7 unmapped-lines fixture; full suite + gates + verify-local + CI.
  **GO/STOP:** GO (canonical sources fully support proceeding under the labeled Q5 assumption;
  A-29's Q5 hygiene vector is satisfiable by keeping the label). Implementation AWAITS explicit
  authorization.


- 2026-09-09 — **D-29 EXECUTION (Track R reference data; pre-flight GO above; user-authorized)**
  **Built:** `apps/api/src/admin/` reference-data module — the sole writer of the six curated
  reference tables (ADR §2). NO public HTTP admin API (canonical docs prescribe none, ADR §7
  flow only): the reviewed path is a CLI (`reference-data:import` npm script):
  `stage|diff <file>` validates + diffs, writes nothing; `approve <file> --reviewer NAME`
  writes the human sign-off record (`infra/reference-data/approvals/<import_id>.json`,
  content-sha-signed) and persists effective-dated versions. Service: `ReferenceDataService`
  (stage/approve + I7 resolveMappings/resolveComposition), `ReferenceDataRepository` (ALL
  prisma writes; the only update = closing an OPEN version's effective_to at supersede;
  forward-only versioning; idempotent re-approve; fail-fast source_version length guard).
  **Reference content (all through the reviewed path — 4 approved imports, approval records
  committed):** R-001 statutory allergen definitions (US big 9 + EU/UK 14 + coconut
  [is_statutory=false, FDA Edition 5 Jan 2025, declared by name] + fenugreek [legume note]);
  R-002 dictionary (12 rows incl. two DISTINCT fenugreek rows, Q5 label) + 6 aliases;
  R-003 mappings (fish→fish, mustard_seed→mustard EU, coconut flesh+oil→coconut,
  fenugreek powder+seed→fenugreek); R-004 composition (12 USDA FDC SR Legacy entries with
  REAL values fetched from fdc.nal.usda.gov 2026-09-09: fdcIds 171955 cod / 175119 mackerel
  for species-unknown fish band, 170483 drumstick, 169910 mango, 170169 coconut meat, 171412
  coconut oil, 170497 chilli green, 171319 chilli powder, 170922 coriander seed, 167763
  tamarind, 171324 fenugreek seed, 170929 mustard seed). Fenugreek POWDER has NO distinct
  USDA food record (SR Legacy + Foundation + FNDDS searched) → I7-UNMAPPED by design
  (listed, excluded from totals, documented) — no invented values anywhere.
  **Verified root-cause fixes along the way:** 1) mapping/composition imports resolve
  dictionary ids across PRIOR approved imports (not just the current file); 2) re-approve
  idempotent (same effective_from = no-op) + backdated versions rejected (forward-only);
  3) CLI retracts the sign-off record if persist throws; 4) gate fix — the Q5 one-writer
  pattern was case-blind to camelCase Prisma models (`ingredientDictionary`) so dictionary/
  alias writes were invisible to the gate; pattern strengthened ([Dd]ictionary|[Aa]lias) —
  gate now reports "confined to the admin module" for BOTH reference gates.
  **Evidence:** API 160/160 (+12: 8 service lifecycle + 4 static one-writer); integration
  D-29 story 8/8 real Postgres (stage→no rows; unreviewed reject; sha-mismatch reject;
  supersede closes+versions+history intact; backdate reject; DB overlap reject via EXCLUDE
  USING gist; I7 unmapped; golden lookups: fish flagged, coconut NOT tree_nuts, fenugreek
  flagged, mustard EU); live dev DB loaded via CLI stage→approve (17 defs, 12 dict, 6
  aliases, 6 mappings, 12 entries, 12 versions); gates PASS with both one-writer gates
  actively enforcing; verify-local exit 0; CI green.
  **Intentional non-changes:** Q5 stays OPEN (every dictionary/alias write labeled "Q5
  WORKING ASSUMPTION"; SCAFFOLD untouched); no P4 consumption; no D-26; no staging table
  (staging = validated import files + signed approval records; the ERD is frozen); fish
  sodium kept as real per-class values (species-unknown sodium rule = D-19's consumption
  concern); D-19 recompute design preserved for the D-19 pre-flight.
  **Resume point:** D-19 re-dispatch (Views 5–9 + recompute) — now unblocked by live,
  reviewed reference data. Awaiting authorization; D-29 checkpoint commit below.


- 2026-09-10 — **METHOD-SAVE BUG FIX (decision trace recorded BEFORE code; user-reported live bug)**
  **Observed behavior (user report):** authenticated user → workspace → Method → "I will
  paste it" → enter `Cook for 1–2 hours over low heat.` → click `Save method` → button
  accepts the click, no visible success state, no confirmation, no useful error, method
  does not visibly update. The UI also showed "Method saved from your paste." before the
  user had actually saved.
  **Reproduction + HTTP evidence (live browser, chef@recipesystems.test, dev stack):**
  - Happy path: `PATCH /api/v1/recipes/:id/method` body `{method:"paste", method_text, method_source:""}` → 200 `{method_tag:"METHOD",method_source:null,list_only:false}` → status line "Method saved from your paste." — works on first save.
  - Then **Back → reopen the same recipe**: the workspace silently issued `PATCH method:none`
    (TWICE — React StrictMode double-mount in dev) on every mount → 200 `{method_tag:null,...}`;
    Postgres verified AFTER reopen: `method_text` NULL, `method_source_tag` NULL — **the
    saved method was destroyed from the database by merely reopening the workspace**.
  **Root cause (3 parts):**
  1. `MethodSection`'s mount `useEffect` called `attach({method:'none'}, silent)` — a WRITE on
     mount; every reopen wiped the persisted method (data loss). It existed because no read
     route for method state exists (API doc §4 defines only PATCH).
  2. The status line derived solely from the persisted state with no dirty/saving/error
     distinction → it kept claiming "Method saved from your paste." after mode/text edits
     (the reported "saved before actually saved") and re-saves produced no visible change.
  3. The silent mount-write could race a user save (last response wins).
  **Fix (canonical shape preserved; no data-model redesign):**
  - API: read-only `GET /recipes/:recipeId/method` (JwtAuthGuard) returning the existing
    canonical `{method_tag, method_source, list_only}` — delegates to the D-17
    `RecipeService.getMethodState`; no writer changes; ownership INV-17 inside the service.
    (Precedent: D-18 added the read-only GET /analysis route for the same hydration need;
    the API doc defines no GET /method — minimal read surface added for UI hydration.)
  - Web `MethodSection`: mounts now HYDRATE (GET) and never write; explicit status states —
    `Method ready to save.` → `Saving method…` → `Method saved.` (with tag/source detail) /
    `Could not save method — <error>.`; dirty tracking (mode/text/source edits return the
    status to ready — no false "saved"); stale-hydration guard (a user save that settles
    before the late hydration response wins); `onChange` lifted on hydration AND save.
  **Tests:** web MethodSection 10/10 (all 7 required scenarios: paste, inferred+named source,
  source-less inferred button-disabled, none clears, backend failure visible, method survives
  reload — asserts NO PATCH on mount, no false "saved" before success); API recipes 16/16
  (+3 controller tests for the GET route: METHOD state, list-only state, INV-17 404).
  **Live verification (browser + psql):** reopen issues only GETs (no PATCH); UI shows
  "Method saved." + "Tag: METHOD — saved from your paste."; psql: method_text retained after
  reopen; full analyse → worker → Views 1–4 still complete (no regression).
  **Intentional non-changes:** canonical PATCH contract and response untouched; no
  `method_text` added to any wire shape; guest flow unchanged; no snapshot/analysis changes.
  **Commit / evidence:** COMMIT `3decf4d` (full `3decf4da63792d6f2fc4c42f113d1935ac8e6864`),
  parent `72f1a9c`, pushed to `github.com/mohamedazzim/recipe-systems` branch `main`.
  Full verification on the commit tree: verify-local **ALL STEPS PASSED exit 0** (npm ci →
  prisma generate → lint → typecheck → unit (worker 21/21, API 163/163, web 74/74, packages
  green) → regression gates PASS (8/8 golden) → contract → migrate → integration 81/81 →
  build → QG3 perf OK); lint exit 0; typecheck exit 0.


- 2026-09-10 — **D-19 PRE-FLIGHT (read-only; recorded BEFORE any D-19 code)**
  **Starting state:** D-18 ✅ (Views 1–4 + home), D-29 ✅ (Track R reviewed reference load,
  live counts verified 2026-09-10: 17 allergen defs / 12 dictionary / 6 aliases / 6 mappings /
  12 composition entries / 12 versions; CI run 34390362800 success). Views 8/9 are persisted
  INCOMPLETE by the worker (intentional D-18 non-change). Frozen D-05 schemas for Views 5–9
  exist (`packages/schemas` v1.0.0, `.strict()`).
  **D-29 dependency:** SATISFIED. Live effective-dated data present; `ReferenceDataService`
  exposes `resolveMappings`/`resolveComposition` (I7 read surface) for D-19 consumption.
  **Recompute design — decision (labeled working assumption; dispatcher must confirm):**
  - Canonical state: ERD §15.4 leaves "analysis regeneration granularity" OPEN for I2; the I2
    story says the assumption-editor API is "specified by D-19"; RS-US-45 gives the wire
    contract `PATCH /analysis/:analysisId/view-9/assumptions` body `{fish_class?:"lean"|"oily",
    coconut_grams?:number, oil_tbsp?:number}` → 200 recomputed band (Bearer).
  - Labeled design for D-19 (no new tables/columns; frozen schemas already support it):
    - **Where assumptions live:** persisted inside `analysis_view.payload.assumptions`
      (`View9PayloadSchema` already requires `assumptions[{key,value,tag:ASSUMED}]`).
    - **Transmission:** the canonical RS-US-45 PATCH shape (API/BFF route, Bearer).
    - **Who writes the recomputed analysis:** the ANALYSIS WORKER only (ADR §2 one-writer).
      The BFF/API never writes `analysis_*` — it validates the edit and enqueues a
      deterministic view-9 recompute job (pg-boss, D-17 pattern; idempotent upsert on
      `uq_analysis_view`). Recomputed payload = band (never a point-kcal, INV-14), sodium
      `unknown` where required, unmapped lines excluded + listed (I7).
    - **Recompute is a worker job:** yes — deterministic, NO LLM (Deterministic Views v2 §4;
      Q9 untouched). Fish-class selection reads the two real USDA entries (species-unknown
      lean/oily band, D-29's deliberate data shape).
    - **One-writer preserved:** API adds a queue-enqueue write only; `analysis_*` writes stay
      worker-exclusive (regression gates + A-19 will re-verify).
    - **Q1:** REMAINS OPEN — the recompute job's input rides the existing D-17 job-payload
      working assumption (captured structured recipe); no ERD v14 column invented.
    - **OPEN to dispatcher:** granularity (ERD §15.4) — whole-view-9 recompute only, and
      whether assumption edits should also regenerate Views 1–7 (recommend NO — C6 requires
      explicit re-analysis only). If the dispatcher rejects this label, D-19 must STOP on
      recompute until ERD §15.4 is decided.
  **Schema naming reconciliation (Deterministic Views v2 → frozen ERD/schemas; the ERD +
  D-05 schemas are authoritative):**
  - `allergen_map` → `dietary_allergen_definition` + `dietary_allergen_mapping`
    (effective-dated; version column; EXCLUDE overlap; source_reference).
  - `food_composition_table` → `nutrition_food_composition_entry` (external_source/external_id
    = USDA fdcId; is_primary_for_ingredient) + `nutrition_food_composition_version`
    (per-100g values, source_version, effective-dated).
  - `food_id` → `external_id` (via `external_source`); `canonical_name` →
    `ingredient_dictionary.canonical_name` (+ `ingredient_alias` — Q5 read-only).
  - "computed in `analysis/`" → deterministic producers live in the analysis worker path
    (the sole `analysis_*` writer); NO new API module named `analysis/`.
  - `region_pack` → `account.label_pack` / `account_restriction_profile.label_pack` (US/EU).
  - Output JSON examples in the v2 doc are illustrative — the frozen
    `View8PayloadSchema`/`View9PayloadSchema`/`DeterministicViewInputSchema`/
    `View9AssumptionsSchema` are the binding payload contracts.
  **Q states:** Q5 OPEN (D-19 is read-only against dictionary/alias; one-writer gates
  enforce) · Q9 OPEN (Views 5–7 use the provider-neutral stub in dev — never production
  claims) · Q10 OPEN (no OCR work) · Q1 OPEN (working assumption labeled above).
  **GO/STOP:** **GO (pre-flight)** — with the labeled recompute working assumption above and
  the dispatcher's confirmation of the recompute granularity choice; Views 5–7 have fully
  canonical specs (Recipe_Systems §6) and Views 8/9 are deterministic per Deterministic
  Views v2 + frozen schemas; the D-29 dependency is live-verified. STOP condition: if the
  recompute label is not accepted, D-19 must halt on I2/recompute until ERD §15.4 is decided
  by a reviewed patch.
  **Resume point:** dispatcher confirms the recompute label → implement D-19 (Views 5–9 +
  assumption editors + disclaimers) per DISPATCH D-19; audit A-19 after.


- 2026-09-10 — **D-19 EXECUTION — DISPATCH AUTHORIZATION (recorded BEFORE code; user-accepted)**
  **Authorization:** the user explicitly accepted the D-19 pre-flight and confirmed the I2
  recompute design as a D-19-scoped LABELED working assumption:
  - Edits (fish class, coconut grams, oil tablespoons) → canonical RS-US-45 PATCH →
    deterministic pg-boss recompute job → the analysis worker performs the recomputation →
    the worker is the ONLY writer of `analysis_*` → updated View 9 payload persisted →
    assumptions remain in `analysis_view.payload.assumptions`.
  - Q1 REMAINS OPEN (recompute input rides the existing job-payload capture — same D-17
    labeled assumption; does NOT resolve Q1). ERD §15.4 recompute granularity remains a
    labeled D-19 assumption. Recompute scope is View 9 ONLY — Views 1–7 never regenerated.
  - One-writer preserved: the web/API never mutate `analysis_view` directly.
  - Schema/terminology reconciliation accepted (allergen_map → dietary_allergen_*;
    food_composition_table → nutrition_food_composition_*; food_id → external_id;
    "analysis/" → the current analysis-worker path; region_pack → label_pack).
  - Q5, Q9, Q10, Q1 all remain OPEN.
  **Non-goals (explicit):** D-20, OCR/Q10, chef-mode final presentation, View 5 veto
  workflow, print changes, Q5/Q9/Q1 resolution.
  **Implementation decisions recorded up-front (labels, not silent inventions):**
  - RS-US-45 200 is satisfied asynchronously: the PATCH validates + enqueues the recompute
    job and returns `{analysis_id, status:'recompute_queued', assumptions}` — the synchronous
    "recomputed band" body is impossible without duplicating the worker's computation in the
    API (one-writer + single-implementation hygiene). The UI re-renders the persisted band
    when the worker completes (existing poll/SSE). Deviation recorded.
  - Initial (un-edited) View 9 band spans lean→oily fish classes (canonical §6 default
    "species unknown"); an assumption edit may pin fish_class to one class (band tightens,
    stays a band via coconut/oil ranges). Internal 'both' representation is computation-only.
  - Deterministic View 8/9 producers live in the analysis worker (the sole analysis_*
    writer); reference-data reads are direct Prisma reads (reads are not writer-scoped).
  - Minimal ingredient→dictionary resolution for D-19: display_name word-match against
    dictionary canonical_name + alias_text (lowercased, punctuation-stripped); no match →
    I7-unmapped (excluded from totals, listed). Full alias UX stays D-25.
  - Labeled default-mass table for View 9 (per-dictionary-ingredient unit masses) derives
    from the §6 worked example; every value carries an ASSUMED tag/source.


- 2026-09-10 — **D-19 EXECUTION (P4-1 Views 5–9; dispatch authorized above)**
  **Built:**
  - Worker `deterministic-views.ts` (NO LLM, Deterministic Views v2 §4): minimal
    ingredient→dictionary resolution (word-subsequence over canonical_name + alias_text;
    bare-word defaults fenugreek→seed, coconut→flesh, chilli→green, mustard→seed; full
    alias UX stays D-25) · `computeView8` (effective-dated mappings at job time; present/
    not_on_card/unknown/removal_notes/allergen_line; fish species-unknown note; H6
    verbatim; never "safe") · `computeView9` (real USDA per-100g rows; fish band =
    lowest/highest-kcal entries; I2 overrides for fish_class lean|oily|both, coconut
    grams, oil tbsp; labeled default-mass table; I7 unmapped lines excluded from totals
    and listed as ASSUMED-tagged assumption entries — the frozen View 9 payload has no
    dedicated unmapped field; sodium `unknown`; per_portion null; I6 verbatim).
  - Handler: views 8/9 now COMPLETE via the deterministic producers; new
    `handleView9Recompute` merges the RS-US-45 delta over the PERSISTED payload
    assumptions (overridesFromPayload/mergeOverrides) → upserts ONLY view 9 (ERD §15.4
    granularity label; Views 1–7 never regenerated) → NOTIFY complete (SSE refresh).
    Worker consumes a second queue `view9-recompute`.
  - API: `PATCH /analysis/:analysisId/view-9/assumptions` (JwtAuthGuard + CsrfGuard;
    strict body with ≥1 of fish_class|coconut_grams|oil_tbsp; UUID guard; INV-17 404) →
    `AnalysisService.recomputeView9` (read-only analysis ownership check + Q1-labeled
    buildCapture) → queue enqueue → 200 `{analysis_id, status:'recompute_queued',
    assumptions}`. Recorded deviation: RS-US-45's synchronous "recomputed band" body is
    satisfied asynchronously — the API never writes analysis_* and never duplicates the
    worker's computation (one-writer + single-implementation hygiene).
  - Web: AnalysisViews tabs 5–9 (View 5 regional + G2 review notice; View 6 ratios +
    unresolvable; View 7 sensory with INCOMPLETE state; View 8 flag table + print line +
    removal notes + H6 verbatim on the surface; View 9 band/macros/sodium/assumptions/
    tightening factors + I6 verbatim); `View9AssumptionEditor` (fish class select, coconut
    grams, oil tbsp → PATCH → "Recompute queued" state → SSE-driven refresh with fallback
    polls via the new `useAnalysisStatus.refresh`); editors hidden for guests (Bearer-only).
  **Evidence:** worker 30/30 (+9) · API 171/171 (+8) · web 82/82 (+8) · integration
  83/83 (+2 `story_d19_views_8_9` on REAL Postgres + the LIVE D-29 reference load:
  View 8 flags fish/coconut/fenugreek, coconut NOT tree nuts, H6 verbatim, no "safe";
  View 9 band 1,306–2,223 kcal on the golden-card amounts, sodium Unknown, fenugreek
  powder I7-unmapped; recompute delta collapses the band and touches ONLY view 9; the
  D-17 story updated to 9/9 COMPLETE) · gates PASS (8/8 golden) · lint 0 · typecheck 0 ·
  verify-local exit 0 (run on the D-19 tree) · CI green (run id recorded at checkpoint).
  **Live verification (browser + psql, dev stack):** re-analysed the workspace recipe →
  all nine tabs render; View 8 shows Fish/Coconut/Fenugreek + species-unknown note + H6;
  View 9 renders a band with sodium Unknown + I7 listing + I6; assumption edit
  (coconut 200 g) → PATCH → recompute_queued → worker persisted → SSE refresh →
  band re-rendered (716–1,018 → 893–1,018 kcal), assumptions updated in place. Lines
  without extracted amounts stay honestly I7-excluded (D-12 parses no amounts — intake
  limitation, not invented here).
  **Intentional non-changes:** Q1/Q5/Q9/Q10 OPEN (labels kept; recompute rides the Q1
  job-payload capture) · no chef mode/station card (D-20) · no OCR (Q10) · no View 5 veto
  workflow (G2 notice only) · no print changes · frozen schemas untouched · reference
  data untouched (live counts re-verified 17/12/6/6/12/12 after the story run).
  **Resume point:** D-19 checkpoint commit `46c0559` (full `46c0559fa7ac7668671b7f60776b9c49d93c72da`;
  CI run recorded at checkpoint) → paired audit A-19 (executed 2026-09-10 — PASS-WITH-FINDINGS,
  see AUDIT_LOG.md; correction commit recorded there) → then D-20
  (chef mode + station card) or D-21 (disclaimer sweep) per dispatch.


## PERF - Q9 DeepSeek performance / production-readiness pass (2026-09-11)

Not a dispatch unit (H-XX numbering untouched). Measured baseline first, then measured
optimizations only. Before/after numbers recorded here per the performance dispatch.

### Measured baseline (sequential generation, real deepseek-v4-pro, QA recipe)

| Metric | Pass A (20cda642) | Pass B (55c93e85) |
|---|---|---|
| View 1 | 109.8 s | 91.0 s |
| View 2 | 167.8 s | 172.1 s |
| View 3 | 352.3 s (1 timeout + retry) | 142.1 s |
| View 4 | 147.7 s | 103.8 s |
| View 5 | 41.7 s | 46.3 s |
| View 6 | 134.8 s | 67.8 s |
| View 7 | 27.2 s | 13.1 s |
| Total (sum) | 981.3 s (16.4 min) | 636.2 s (10.6 min) |
| Queue wait | ~0.2 s | ~0.2 s |
| Retries/timeouts | 1 timeout (v3) | 0 |
| Input | captured snapshot 3,178 B (~3.2 KB); full request ~5-6 KB | same |
| Output | view payloads 50 B - 3.3 KB | same |

### After (bounded parallel, 4 lanes, ANALYSIS_VIEW_CONCURRENCY default 4)

Pass D (97cf0ae3, healthy): v1 96.3 s, v4 123.3 s, v3 150.4 s, v7 5.7 s, v5 82.2 s,
v6 95.0 s, v2 522.7 s -> wall ~523 s (8.7 min) = slowest lane, not the sum.
Six of seven views finished within ~170 s wall. Retries 0, timeouts 0, retry_count 0,
no duplicate job. Token telemetry per view: prompt 1,803-1,951, completion 293-10,923,
total 2,139-12,832 (whole pass ~56k tokens). Pass C (7021d48c) proved the resume path:
a host-network suspension killed the first delivery, and three redeliveries re-generated
ONLY the single missing view (view 3) - zero duplicate spend on completed views.

### Determinations (with evidence)

- Prompts contain no unnecessary context: snapshot 3.2 KB; D-15 pins the single shared
  input object for all views -> NO prompt changes, NO per-view context trimming.
- Safe parallel view generation: YES - Views 1-7 are independent prompts; implemented
  bounded at 4 with every view still through D-05 schema + D-16 grounding.
- Timeouts: DEEPSEEK_TIMEOUT_MS=180000 KEPT (1/14 timeouts before; 0/7 after; with resume
  a timeout costs at most one lane). No evidence to change it.
- pg-boss: expireInSeconds 4 h + retryLimit 3 + per-view resume verified appropriate.
- Session fix: SSE status polling runs on GuestOrJwtGuard which previously did NOT slide
  the session cookie - fixed (shared slideSessionCookies); live-verified 16+ min session
  survival under polling (checklist item 6).
- Environment note (QA machine): OS network suspension pauses Node timers AND in-flight
  fetches - a hung view is reclaimed by pg-boss expiry + per-view resume; no code change
  (production hosts are not suspend-prone).

### Checklist evidence

1. Real DeepSeek pass in the internal browser: pass D above, "Analysis complete",
   model deepseek:deepseek-v4-pro. 2. Views 1-7: worker telemetry parse=ok grounding=ok
   every view. 3. Views 8/9 deterministic: COMPLETE rows, never sent to the provider.
   4. Chef Mode + Station Card: station card persisted (printable) for pass C; pass D's
   view-3 "INCOMPLETE with stages" model inconsistency correctly refused (honest no-card
   copy rendered). 5. Save + Library + Delete: title/ownership persisted, library row,
   delete flow proven earlier this session. 6. Long-running session: survived 16+ min.
   7. pg-boss: no duplicate expensive jobs (healthy pass retry_count 0).
   8. Suites: worker 53/53, API 208/208, web 104/104, llm-adapter 102/102,
   integration 106/106, gates 8/8, contract OK, lint/typecheck 0, verify-local
   ALL STEPS PASSED. 9. CI: see performance-pass checkpoint commit. 10. Numbers: this table.

## BENCH - Q9 model benchmark: pro vs flash vs flash-low vs flash-high (2026-09-11)

Controlled: same golden capture (garlic+ginger explicitly_absent), D-15 v2 prompts, home mode,
temperature 0, same DeepSeekLlmAdapter + generateGrounded (D-05 + D-16), regenerate-once,
concurrency 4. Views 8/9 deterministic (not called). API contract verified live: /models ->
deepseek-flash + deepseek-v4-pro; docs: thinking {type} + reasoning_effort none/low/high/max.
4 passes per config (2 benchmark + 1 + 1 payload-capturing), 28 views per config.

| Metric | pro | flash | flash-low | flash-high |
|---|---:|---:|---:|---:|
| Wall time avg | 449.2s | 104.0s | 49.3s | 84.5s |
| View 1 | 94.3s | 42.1s | 16.8s | 69.7s |
| View 2 | 302.6s* | 119.6s | 28.8s | 53.9s |
| View 3 | 345.7s** | 28.0s | 31.4s | 30.3s |
| View 4 | 180.9s | 24.1s | 10.1s | 27.7s |
| View 5 | 211.1s | 65.0s | 21.1s | 33.8s |
| View 6 | 58.7s | 44.7s | 19.9s | 13.0s |
| View 7 | 38.4s | 10.1s | 6.3s | 8.3s |
| Complete views (of 28) | 21 | 19 | 23 | 18 |
| Incomplete (refusals) | 4 | 5 | 3 | 4 |
| Schema failures | 1 | 4 | 2 | 6 |
| Grounding violations | 18 | 19 | 19 | 17 |
| Provider timeouts | 2 (v3) | 0 | 0 | 0 |
| Retries (in-adapter) | on timeouts only | 0 | 0 | 0 |
| Tokens in / out | 13.3k / 40.4k | 14.6k / 47.5k | 13.3k / 30.2k | 14.9k / 50.7k |
| Est cost/analysis off-peak | $0.089 | $0.031 | $0.020 | $0.033 |
| Est cost/analysis peak | $0.178 | $0.061 | $0.040 | $0.065 |

* view 2 over its 3 completed passes; one pass schema-failed. ** includes two 540 s
triple-timeout passes (180 s x 3 attempts); the two healthy passes averaged 151.4 s.
Cost = official pricing (verified 2026-09-11), all-cache-miss (production assumption).
Semantic findings: zero banned-mention (garlic/ginger/onion) leaks in accepted payloads in any
config (D-16 enforced); pro refused view 5 in all 4 passes (family text trips the garlic
absent-plant); flash configs passed v5 in some passes with grounded wording; flash tag
discipline is weaker than pro (UNKNOWN/ABSENT tag values -> D-05 catches all, nothing invalid
persisted); flash derives view-6 ratios from the card's amount_text (defensible) while pro
refuses (strict); flash view-3 sometimes returns status INCOMPLETE with stages (station-card
refusal quirk, same as pro observed earlier); view 7 honors the v3 dependency gate.
RECOMMENDED: deepseek-flash + reasoning_effort=low. REASON: highest completion (23/28), lowest
wall (49.3 s), lowest cost ($0.020 off-peak), zero timeouts; schema compliance 2/28 acceptable
(D-05 catches all); grounding refusals are the guardrail working, not model output leakage.
Pro is additionally scheduled for provider retirement 2026-09-14 (routed to Flash).
Application default model NOT changed (dispatch constraint - recommendation only).

## VERIFY - Model switch live verification: deepseek-flash + effort low (2026-09-11)

Runtime (verified from .env, key never printed): LLM_PROVIDER=deepseek,
DEEPSEEK_MODEL=deepseek-flash, DEEPSEEK_REASONING_EFFORT=low, ANALYSIS_LLM_STUB=0.
Worker boot: "LLM adapter = deepseek (deepseek:deepseek-flash (effort low) @
https://api.deepseek.com)". model_version persisted = deepseek:deepseek-flash
(UI + DB). Session alive 26+ min under SSE polling (sliding fix held).

FINDING (fixed): (1) the worker ignored DEEPSEEK_REASONING_EFFORT (env was not
wired) - wired + tested; (2) flash-low emits D-05 tag-enum violations on
views 1/2, and the worker's old semantics (one schema-invalid view -> whole-job
transient failure) caused a 3+ delivery retry storm ending 'failed' with 6/7
valid views persisted. FIX: schema-invalid regenerates ONCE, then the view row
is INCOMPLETE (INV-08) and the analysis completes. Verified live on the SAME
analysis: v1 regenerated -> COMPLETE, v2 grounded refusal -> INCOMPLETE,
9/9 rows, status complete, is_current true, single delivery retry_count 0.

Live journey (internal browser): create -> paste (11 lines verbatim, two
fenugreeks) -> method saved -> analyse -> Views 1-7 (zero garlic/ginger/onion/
turmeric in any accepted panel; v3/v7 honest refusals; v2 balance table after
regenerate) -> Views 8/9 deterministic (fish/coconut/fenugreek, no "safe",
band 716-1,018 kcal, sodium Unknown) -> view-9 recompute coconut 100 ->
539-664 kcal, only view 9 changes -> chef mode honest no-card copy ->
save "Flash Low Live Verification 0911" -> library row -> reopen persists ->
disposable recipe delete (cancel intact, confirm removes, reload persists) ->
bad UUID 404, foreign UUID 404 -> duplicate Analyse = new analysis, single
delivery, no duplicate jobs, INV-09 flip correct.

Performance (live, flash-low, second clean pass): v1 28.6+32.1 s (regenerated),
v2 27.8+32.4 s (regenerated then refused), v3 30.3 s, v4 10.7 s, v5 18.6 s,
v6 23.2 s, v7 2.8 s; wall ~61 s. vs pro baseline 449.2 s and flash-low
benchmark 49.3 s - consistent.

Verdict: PASS (with one confirmed regression found and fixed; suites green:
worker 57/57, adapter 103/103, API 208/208, web 104/104, integration 106/106,
gates 8/8, contract OK, lint/typecheck 0, verify-local ALL STEPS PASSED,
secret sweep clean, CI green at the verification commit).
---

## 0c. Visual redesign — reference design system applied app-wide — 2026-09-18 (UI-only)

Scope: presentation only. Backend contracts, DB schema, routes, APIs, the nine-view analysis
system, Home/Chef modes, cook mode, the restriction profile, and all workflows are unchanged.

- **Reference visual language applied:** left navigation rail (brand + tagline, grouped nav with
  tinted active item, workspace section links while a recipe is open, editorial quote card),
  compact top utility bar (search with Ctrl K, theme toggle, avatar menu), warm paper tokens kept.
- **Home:** greeting + quote + primary CTA; four stat cards derived ONLY from the real account
  library (total recipes, cooked, updated this month, distinct families — no fabricated metrics);
  "Start a new recipe" banner with the three real intake modes (deep-link to the matching tab);
  "Household restriction profile" banner (real profile count via GET /me/restriction-profile,
  "View profile" routes to the new Household view); "Recently updated" card grid (monogram tiles —
  the library wire carries no photos) + Quick actions.
- **New surfaces:** HouseholdView (profile as a first-class view; guests get an honest sign-up
  explanation — the profile endpoints are Bearer-only). Sidebar "Household profile" and the Home
  banner route here.
- **Wiring:** page.tsx lifts the workspace section tab; the shell's "Recipe workspace" nav
  (Ingredients / Method / Shopping list / Analysis views / Cook mode) switches tabs and scrolls to
  the analysis/cook surfaces. Top-bar search routes to Library with the query pre-seeded
  (LibraryView.initialQuery). CreateView.initialMode deep-links the Home entry-mode buttons.
  Theme toggle drives the existing .dark token layer.
- **Verified:** web typecheck 0 · lint 0 · jest 23 suites / 196 tests · live browser at 1440px
  (signed-in chef): Home/Library/Workspace/Household/Add-recipe all render with real data; sidebar
  section links switch workspace tabs; top-bar search deep-links; Ctrl K focuses search; theme
  toggle flips the dark class; 390px mobile: rail hidden, compact bar visible, no horizontal
  overflow (workspace included).
---

## 0d. Home dashboard v2 — reference metrics, real card photos, quick actions — 2026-09-18 (read-model + UI)

Scope: presentation + read model. No business logic, schema, or writer changes.

- **Read-model extension (read-only):** GET /recipes rows now also carry photo_uri
  (recipe.photo_uri), has_analysis (EXISTS analysis row), has_shopping_list +
  shopping_list_generated_at (newest generation) — batched lookups in
  RecipeService.toLibraryRows (one analysis + one shopping query per library load).
- **Authenticated asset route:** GET /recipes/:recipeId/photo (JwtAuthGuard, INV-17
  ownership 404, PHOTO_NOT_FOUND when absent) streams the stored card photo via
  StorageService.getImage (read-only GetObject). The object store itself is not
  anonymously readable, so card imagery now renders everywhere the library is shown.
- **Home:** four summary cards from real read-model data — Total recipes, Analysed
  recipes (with real % progress bar), Shopping lists, Cooked recipes. NOTE: the
  reference's "Favourite recipes" has NO equivalent anywhere (no table, endpoint, or
  state) — per the no-fabrication rule the fourth slot uses the real cook-mode
  concept instead. Start-a-new-recipe panel uses a real stored card photo when one
  exists (icon composition otherwise). Household card shows real allergen/diet chips
  + label pack from the profile endpoints. Recently updated cards show real card
  photos, Analysed/Not analysed + family badges. Quick actions: the four reference
  actions wired to real routes — Create shopping list / Enter cook mode open the
  most recent recipe at that section.
- **Tests:** storage.getImage, RecipeService.photoBytes (ownership/no-photo/foreign
  404), controller photo streaming + PHOTO_NOT_FOUND; HomeView metric-card + quick
  action tests updated. Web 23 suites / 197 tests · API 29 / 360 · integration
  26 / 162 (Git-Bash PATH fix for qg2_gates, WSL shim). Typecheck + lint clean.
- **2026-09-18 follow-up:** the Start panel photo is now a CSS background layer
  (ackground-image, right-anchored cover, no \<img>\) with a surface-to-transparent
  gradient blend for legibility; reference button treatment (leaf icon on the heading,
  document/list/camera icons, green primary + white outline secondaries). Mobile hides
  the photographic layer; icon-composition fallback when the library has no photo.
- **2026-09-18 hero swap:** the Start panel background is now the user-provided flat-lay
  asset (pps/web/public/images/start-recipe-hero.png, from the Gemini-generated clean
  version — no baked-in buttons), used as a CSS ackground-image (right-anchored cover,
  no \<img>\). A surface gradient masks the artwork's baked-in title/subtitle on the
  left where the real DOM content + the three functional intake buttons sit; mobile hides
  the photographic layer. Same existing intake wiring (paste/form/photo).
- **2026-09-18 Home finalize:** recently updated shows exactly 2 cards; the bottom
  Account section (household form + sign-out) is REMOVED (the profile lives in the top
  banner + its own view; sign-out lives in the shell); the signed-in Home is a fixed
  single-viewport page (\lg:h-[calc(100dvh-7.5625rem-2px)]\ flex column, overflow hidden,
  the recent section is the only internally-scrollable area; guests keep the normal flow).
  Verified live: 1440x900 scrollHeight == clientHeight; 390px mobile no horizontal overflow.
- **2026-09-18 responsive fix:** the fixed single-viewport Home is now height-gated —
  it only pins at \(min-width: 1024px) and (min-height: 840px)\ (the \s-home-fixed\
  utility in globals.css). At 1440x900 the dashboard is a single non-scrolling page;
  shorter default windows (e.g. 1366x768 laptops) keep the normal scrollable flow so
  every section — banners, recent recipes, quick actions — stays reachable.
- **2026-09-18 OS-scaling breakpoint fix:** the stat-cards grid moved from
  \xl:grid-cols-4\ (1280px) to \md:grid-cols-4\ (768px) and the feature banners
  from \lg:\ to \md:grid-cols-2\, so a normal browser window under Windows display
  scaling (125%/150% — effective CSS viewport 1152/960/911px) keeps the reference
  4-up stats row and side-by-side banners. No JS/rem viewport font scaler exists in the
  app (verified); perceived text enlargement is OS zoom, which the lower breakpoints
  now tolerate. Verified live at 768/960/1024/1152/1280/1440/1536: 4 stat columns +
  side-by-side banners at every width.