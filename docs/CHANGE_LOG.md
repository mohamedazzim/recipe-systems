# Recipe Systems — Change Log

**Status:** v1.2 · 2026-09-07 · Chronological project memory. Every entry records what changed, why, and its effect on the OPEN DECISION register (SCAFFOLD §7). Newest first.
**Companions:** [USER_STORIES.md](USER_STORIES.md) · [DISPATCH.md](DISPATCH.md) · [AUDIT.md](AUDIT.md) · [HANDOFF.md](HANDOFF.md) · [IMPROVEMENT_PLAN.md](IMPROVEMENT_PLAN.md) · [SCAFFOLD.md](SCAFFOLD.md)

---

## Entry template (for every future change)

```markdown
## YYYY-MM-DD — <title>

- Author / session:
- What changed (files + substance):
- Why (pointer to the decision or instruction):
- Register impact (Q-IDs resolved / narrowed / opened / untouched):
- Commit(s): <sha> or "uncommitted"
- Verification (which checks re-ran and their result):
```

**Rule:** a change that alters any Q1–Q18 row must say so in its entry. The register (SCAFFOLD §7) is the single source of truth for open decisions; this log records the history of how the register changed. No Q-row changes in D-13.
## 2026-09-10 — D-20 P4-2: Chef mode + station card (deterministic, persisted through the model/API path)

- Author / session: DeepSeek V4 Pro (VS Code) D-20 dispatch; decision trace D-20A..F recorded
  in HANDOFF §5 before implementation (dispatcher-authorized at the D-21 close-out).
- What changed: `analysis_station_card` is now populated by the analysis worker as a
  deterministic assembly of the Q1-labeled capture + the persisted View 3 — mise (capture
  ingredients verbatim, keyed by line id), sequence (View 3 stages verbatim),
  control_points (one per stage), do_nots (captured `explicitly_absent`), product_yield_hold
  null, printable true — never free prose (INV-10; A-20 BLOCKER class). Refusal path
  (no method steps OR View 3 INCOMPLETE) persists no row. New API route
  `GET /api/v1/analysis/:analysisId/station-card` (frozen D-05 wire; INV-17 404s; 404
  `STATION_CARD_NOT_FOUND` for a valid analysis without a card); both analysis assemblies
  carry `station_card` (nullable). Web: Home↔Chef presentation toggle on the workspace —
  chef leads with the persisted card (or the honest no-card copy), §7 chef-voice tab headers
  over the same nine frozen views, closing line "Untasted briefing. Season after.";
  preference persists via the existing `PATCH /auth/me/preferences` (signed-in; session-local
  for guests). New integration story `tests/integration/story_d20_station_card.test.ts` and
  e2e spec `tests/e2e/chef-mode.spec.ts`.
- Why: C3/C5 + §7/§8 — chef mode is a presentation over the same analysis (one app, not two);
  the card is persisted through the intended D-20 model/API path with grounding/provenance
  preserved; incomplete/unknown states stay blank rather than invented.
- Register impact: Q1/Q5/Q9/Q10/Q11 unchanged (OPEN). No new snapshot persistence invented
  (Q1 seam unchanged); do_nots empty in the stub world; analysis `mode` stays 'home' for web
  enqueues (ERD §15.4 presentation semantics — labeled).
- Verification: gates PASS (8/8 golden) · contract-check OK · worker 44/44 · API 183/183 ·
  web 93/93 · integration 97/97 · lint 0 · typecheck 0 · verify-local exit 0 · live
  internal-browser run (chef toggle + card + C3 TC-03 persistence + guest refusal + INV-17)
  · **CI success (run `34501720779`)**.
- Commit(s): `748853e442fcf0bf8624f9106974e59a501119ba` (D-20 checkpoint).

## 2026-09-11 — Q9: Real DeepSeek LLM integration behind the existing adapter seam

- Author / session: DeepSeek V4 Pro (VS Code) Q9 dispatch; decision trace Q9-1..8 recorded in
  HANDOFF §5 before implementation (credentials verified first: key present in the git-ignored
  `.env`, never printed; ONE connectivity call — `GET /models` → 200; account models
  [deepseek-flash, deepseek-v4-pro]; configured `deepseek-v4-pro` VALID; base URL reachable).
- What changed: `packages/llm-adapter/src/deepseek-adapter.ts` (new) — server-side DeepSeek behind
  the existing `LlmAdapter` interface (env-only key; OpenAI-compatible chat completions via global
  fetch; JSON extraction before the domain; prompt = the canonical D-15 pair + the captured
  structured_recipe only; non-secret `providerName`/`modelVersion`/`describe()`). Typed errors:
  `LlmPermanentProviderError` (401/403/400 → worker fails with NO retry, ADR §14) vs transient
  (429/5xx/timeout/malformed → bounded in-adapter retries then the existing pg-boss Q13 path).
  Worker: `resolveAdapter` selects deepseek on `LLM_PROVIDER=deepseek` (ANALYSIS_LLM_STUB=1 still
  forces the deterministic stub; CI never sets the provider and never needs the key); boot
  provider/model log + per-view telemetry (no secrets); `model_version` stamped from the adapter
  (`deepseek:deepseek-v4-pro`). Views 8/9 remain deterministic (never sent to the provider).
  `scripts/verify-deepseek.js` (new) = the designated live harness (env-gated, never auto-run).
  `.env.example` updated (Q9-resolved template, placeholder key).
- Why: Q9 (the real provider) without touching the architecture — mock for CI/tests, DeepSeek for
  dev; schema/grounding/regenerate-once/one-writer all remain mandatory (proven against real
  output).
- Register impact: **Q9 RESOLVED (SCAFFOLD §7 updated with evidence).** Q1/Q5/Q10/Q11 unchanged
  (OPEN). OCR disabled. No D-23/D-30 work.
- Verification: credential/model verification (above) · real-call harness: v1/v3/v6/v7 accepted
  (59.4/178.5/36.1/5.7 s), v2/v4 timeout (transient path), v5 REJECTED by grounding (the
  "garlic is explicitly_absent" plant — D-16 holds against the real model) · live full-stack
  browser journey: analysis complete with model_version deepseek:deepseek-v4-pro, views 1/3/4/5/6/7
  COMPLETE (real provider), view 2 INCOMPLETE (regenerate-once refusal), 8/9 deterministic, chef
  mode + station card, save with the real family default, library/reopen, view-9 recompute
  (deterministic), delete · unit/regression: llm-adapter 101/101, worker 48/48, API 202/202,
  web 104/104, integration 106/106 · gates PASS (8/8) · contract OK · lint 0 · typecheck 0 ·
  verify-local exit 0 · secret sweep: no key in tracked files · CI green without the key.
- Commit(s): recorded after the push (Q9 checkpoint).

## 2026-09-10 — D-22 D6: Delete recipe (hard-delete cascade, P5-1 close-out)

- Author / session: DeepSeek V4 Pro (VS Code) D-22 D6 continuation; decision trace D6-1..7
  recorded in HANDOFF §5 before implementation.
- What changed: `DELETE /api/v1/recipes/:recipeId` (Bearer + CSRF; body `{confirm:true}` else 400
  `CONFIRM_REQUIRED`; 204) per the API doc §5 RS-US-24 contract. The service performs the
  canonical hard DELETE (ERD §13 — no soft-delete field invented): INV-17 ownership first, then
  own-bucket asset-key collection (recipe/input/cook-log photos), then the row delete whose
  DB-level ON DELETE CASCADE chain removes all 13 dependent tables (proven in integration),
  then compensating per-object storage cleanup after commit (`StorageService.tryDeleteObject`,
  never throws, boolean residue) — DB-first because a dangling URI is worse than a retry-safe
  orphan (ADR §16); residue is logged, never hidden. Web: two-step named confirmation in a
  workspace danger zone (signed-in only — the endpoint is Bearer-only), Cancel / Delete recipe,
  disabled while deleting, safe errors, no optimistic removal; success only after the 204 →
  home + library refresh + "Recipe deleted." notice.
- Why: D6 AC-1 (confirm), AC-2 (removes photo, object, analyses, lists, logs), AC-3 (no public
  residue) — the last D-22 deliverable; the canonical D-22 unit is now complete.
- Register impact: Q1/Q5/Q9/Q10/Q11 unchanged (OPEN). No DeepSeek. No D-23/D-30 work.
- Verification: API 202/202 · web 104/104 · integration 106/106 (new `story_d22_delete` 4/4 on
  real Postgres + real MinIO: cascade proof, confirm contract, INV-17 matrix, object gone) ·
  e2e `library.spec.ts` delete test added · live internal-browser QA (cancel preserves, confirmed
  delete removes the row, reload keeps it gone; live-DB orphan sweep 0 across analysis/views/
  station-cards/cook-logs/lines/inputs) · gates PASS (8/8) · contract-check OK · lint 0 ·
  typecheck 0 · verify-local exit 0 · **CI success (run `34514834141`)**.
- Commit(s): `28ec1b938bfbbd6136092cdbfac0eb4c137ae1c7` (D-22 D6 close-out).

## 2026-09-10 — D-22 P5-1: Save + recipe library (D1/D2, canonical library over the existing rows)

- Author / session: DeepSeek V4 Pro (VS Code) D-22 dispatch; decision trace D-22A..I recorded
  in HANDOFF §5 before implementation (the audit that preceded it confirmed D1/D2 as canonical
  Must stories — Recipe_Systems.md §12).
- What changed: `PUT /api/v1/recipes/:recipeId/save` (guest-or-jwt + CSRF) — the save action
  confirms the persisted artifact set (raw input, photo, object, identification, analysis,
  timestamps — nothing copied or invented) and normalizes the name: default = the identification
  family (`analysis.family` column, then the frozen View 5 payload), editable afterwards
  (D1 AC-1/AC-2). `GET /api/v1/recipes` (account-only) returns the canonical D2 AC-1 library
  rows — name, date, family, cook-log indicator — ordered by the ERD's own
  `ix_recipe_account_updated` index. Web: visible Save action + editable name on the workspace
  (guests included); the signed-in Home renders the DB library and opens rows with the saved
  name even after a browser restart; guests keep the untouched session-local list (browser
  state preserved, never migrated — D-22I). Resume-save (A1 TC-02): guest save state rides the
  existing QA-B2 claim transaction into the account library. INV-17 ownership enforcement
  untouched and re-proven. No schema change (the artifact set IS the existing rows;
  `updated_at` is the save stamp).
- Why: D1/D2 are canonical Must stories; the library is account/DB-owned ("recipes survive
  closing the browser", A1), never browser state. D6 (delete) remains deferred — the
  dispatcher scoped this session to D1+D2.
- Register impact: Q1/Q5/Q9/Q10/Q11 unchanged (OPEN). No LLM/DeepSeek work (dispatcher
  NON-GOAL).
- Verification: API 193/193 · web 98/98 · integration 102/102 (new
  `story_d22_save_library` 5/5 on real Postgres: family-default save + artifacts, editable
  title, AC-1 rows + cook indicator, cross-account denial, guest save → real claim → resume
  in the account library) · e2e `library.spec.ts` added (Playwright still machine-blocked
  locally — live internal-browser run executed the same assertions) · gates PASS (8/8) ·
  contract-check OK · lint 0 · typecheck 0 · verify-local exit 0 ·
  **CI success (run `34509853030`)**.
- Commit(s): `5cf483067c227aae812bb9bb9b002bc1680aabc0` (D-22 checkpoint).

## 2026-09-10 â€” D-21 P4-3: Disclaimer sweep (H6/I6 unconditional, INV-13/INV-14 gates)

- Author / session: DeepSeek V4 Pro (VS Code) D-21 dispatch; pre-flight GO recorded in
  HANDOFF Â§5 before implementation.
- What changed: `scripts/regression-gates.sh` Â§5 now carries real static hooks â€” verbatim
  H6/I6 in the producer constants, `{payload.disclaimer}` on both web view surfaces,
  word-bounded "safe" grep over the View 8 producer + render surfaces (INV-13), and the
  min/max energy-band pair in the producer + renderer (INV-14). +4 qg2 fire-proofs (planted
  "safe" producer/renderer, paraphrased H6, point-kcal producer) and +2 runtime "teeth" tests
  in the worker producer suite. New `tests/e2e/view-disclaimers.spec.ts` (H6 verbatim + no
  "safe" on View 8; I6 verbatim + band on View 9). Repaired stale e2e auth specs (helper
  "Signed in" assertion, seeded password, strict-mode selectors) â€” test drift only.
- Why: D-21 makes the two disclaimers unconditional and gate-permanent (A-21: one-off checks
  are a MAJOR; a planted violation must fire).
- Register impact: Q1/Q5/Q9/Q10/Q11 unchanged (OPEN).
- Verification: gates PASS Â· worker 34/34 Â· API 178/178 Â· web 86/86 Â· integration 94/94 Â·
  e2e 38/38 · lint 0 · typecheck 0 · verify-local exit 0 · **CI success (run `34480999679`)**.
- Commit(s): `ded60d647d8add6e21961c0f8f3589e46b19cbd1` (D-21 checkpoint).

## 2026-09-10 — Autonomous E2E QA D-01→D-19: 6 defect fixes (QA-FIX-SET-1)

- Author / session: DeepSeek V4 Pro (VS Code), QA dispatch 2026-09-10 (browser E2E + fix policy).
- What changed (files + substance): the QA run found six defects (full trace in HANDOFF §5,
  QA-B1..B7; QA-B5 documented as P3/no-code):
  - `apps/api/src/modules/auth/{auth.service,auth.controller}.ts` — guest sessions now REUSE
    the valid cookie session (no row-per-visit churn); the OIDC callback claims the pending
    guest session after any successful login and redirects with `?claimed=1`.
  - `apps/api/src/modules/recipes/recipe.service.ts` — `assertOwned` format-guards non-UUID
    ids → clean 404 (was Prisma P2023 → 500).
  - `apps/api/src/modules/intake/intake.service.ts` — `WireLine`/`toWireLine` carry
    `needs_review` (the D-14 Clear-review surface was dead without it).
  - `apps/web/lib/flow.ts` + `CreateView/HomeView/page/RecipeWorkspace/IngredientReview` —
    guest-created records keep their parse lines for read-only reopens; guest workspaces stop
    fetching Bearer-only routes; the `claimed=1` marker re-tags guest records to the account.
  - `apps/web/lib/hooks/useAnalysisStatus.ts` — EventSource opens with `{ withCredentials:
    true }` (SSE was 403ing on every connect).
  - `apps/web/components/app/ReadinessPanel.tsx` — re-fetches `enqueue-state` when the lines
    change (Clear review now unblocks without a reload).
  - Regression tests added across the affected suites (API +7, web +3 + updated fixtures).
- Why: autonomous black-box QA of D-01…D-19 via the internal browser; fixes per the dispatched
  policy (smallest correct layer + regression coverage); no roadmap units touched.
- Register impact: Q1/Q5/Q9/Q10/Q11 unchanged (OPEN).
- Commit(s): `f02e37a044ad18bb8c7bf6a1d0c88d501c496821` (QA-FIX-SET-1).
- Verification: API 178/178 · web 86/86 · worker 32/32 · lint 0 · typecheck 0 · integration
  90/90 · gates PASS · verify-local exit 0 · **CI success (run `34476238511`)** · live browser
  re-verification of every fix.
## 2026-09-10 — A-19 audit: D-19 PASS-WITH-FINDINGS + schema-gate correction

- Author / session: independent A-19 audit session (auditor, not the D-19 builder).
- What changed: `AUDIT_LOG.md` created (A-19 verdict block); `apps/analysis-worker/src/
  analysis-job.handler.ts` corrected — deterministic View 8/9 payloads now pass the frozen
  schema gate before upsert (invalid → INCOMPLETE on the main path; throw on recompute);
  +2 unit tests proving the gate fires; adversarial audit suite
  `tests/integration/audit_a19_views_8_9.test.ts` (7 attacks incl. BLOCKER-class
  effective-dating fidelity) added.
- Why: A-19 paired audit of the D-19 checkpoint (findings F-1..F-4 in AUDIT_LOG.md).
- Register impact: Q1/Q5/Q9/Q10 unchanged (OPEN).
- Verification: worker 32/32, API 171/171, web 82/82, integration 90/90, gates PASS,
  lint/typecheck 0, verify-local exit 0, CI green.
- Commit(s): recorded at the audit checkpoint commit (SHA appended in AUDIT_LOG.md).

## 2026-09-10 — D-19 Views 5–9 + assumption editors (P4-1)

- Author / session: DeepSeek V4 Pro (VS Code) D-19 dispatch; pre-flight GO + recompute
  working assumption accepted by the dispatcher before code (HANDOFF §5).
- What changed (files + substance): deterministic View 8/9 producers in the analysis
  worker (no LLM; effective-dated D-29 reference reads at job time); worker handler
  persists views 8/9 COMPLETE and gains the View-9-only recompute path (second queue
  `view9-recompute`); API adds `PATCH /analysis/:analysisId/view-9/assumptions`
  (RS-US-45, Bearer) that validates + enqueues only (one-writer preserved); web
  AnalysisViews ships tabs 5–9 with H6/I6 disclaimers verbatim, the View 9 band/sodium/
  assumptions surfaces, and the I2 assumption editors (edit → recompute → SSE refresh).
- Why: D-19 dispatch (Views 5–9, H2/I1/I2, H6/I6) — unblocked by the D-29 reviewed
  reference load.
- Register impact: Q1/Q5/Q9/Q10 remain OPEN (labels kept; recompute rides the Q1
  job-payload capture); ERD §15.4 granularity stays a labeled D-19 assumption.
- Verification: worker 30/30, API 171/171, web 82/82, integration 83/83 (real Postgres +
  live reference data), gates PASS, lint/typecheck 0, verify-local exit 0, CI green;
  live browser recompute verified.
- Commit(s): `46c0559` (`46c0559fa7ac7668671b7f60776b9c49d93c72da`) — D-19 checkpoint;
  pushed to `main`; CI run recorded at checkpoint. Follow-up: the first CI run FAILED
  (CI's ephemeral Postgres has empty reference tables) — fixed in `cc69d15`
  (story self-bootstraps the committed reviewed imports through the reviewed path;
  integration suites serialized via `maxWorkers: 1`). CI re-verified green.

## 2026-09-10 — Method-save bug fix + D-19 pre-flight (GO with labeled recompute)

- Author / session: DeepSeek V4 Pro (VS Code) takeover session; dispatcher-authorized.
- What changed:
  - **Bug fix:** `apps/api/src/modules/recipes/recipes.controller.ts` gains a read-only
    `GET /recipes/:recipeId/method` (JwtAuthGuard, canonical `{method_tag, method_source,
    list_only}` via the existing D-17 `RecipeService.getMethodState`); `apps/web/components/
    app/MethodSection.tsx` mounts now hydrate (GET) and never write — the previous mount
    effect PATCHed `method:none` and **destroyed the saved method on every workspace reopen**
    (live-verified in Postgres). Status line now distinguishes `Method ready to save.` /
    `Saving method…` / `Method saved.` / `Could not save method — <error>.` with dirty
    tracking (no false "saved" claims) and a stale-hydration guard. Tests: web
    MethodSection 10/10 (all 7 required scenarios incl. survives-reload and no-PATCH-on-mount),
    API recipes 16/16 (+3 GET-route controller tests). Canonical PATCH contract untouched.
  - **Docs only:** backfilled formal H-18 and H-29 ledger entries (evidence always existed
    in HANDOFF §5 + CHANGE_LOG); D-19 pre-flight recorded in HANDOFF §5.
- Why: user-reported live bug (no visible save state, false "saved" message) + the D-19
  pre-flight requirement (deterministic Views 8/9 + assumption editors + recompute design).
- Register impact: Q1/Q5/Q9/Q10 remain OPEN (pre-flight labels them; no decisions made).
- Verification (on the commit tree): verify-local **ALL STEPS PASSED exit 0**; lint 0;
  typecheck 0; unit worker 21/21, API 163/163, web 74/74; regression gates PASS (8/8 golden);
  integration 81/81 (qg2_gates needs Git Bash first on PATH on this machine — known Windows
  env issue, CI unaffected); live browser + psql evidence recorded; remote CI verified after
  push (run id recorded at checkpoint).
- Commit(s): `3decf4d` (`3decf4da63792d6f2fc4c42f113d1935ac8e6864`) — fix + tests + docs;
  parent `72f1a9c`; pushed to `main`.

## 2026-09-09 — CI fix: build schemas before typecheck (D-17 pre-flight audit)

- Issue: GitHub Actions runs 13 (46fd99f) and 14 (3eb18a6) FAILED at the typecheck step (TS2307:
  `@recipe-systems/schemas` unresolvable). Root cause: D-15 pointed the schemas package main/types at
  `dist/`, but neither ci.yml nor verify-local.sh builds schemas before typecheck — CI typechecks
  against a missing dist while local development masks it (dist present from earlier builds).
- Evidence: reproduced locally (`rm -rf packages/schemas/dist` → llm-adapter `tsc --noEmit` →
  TS2307 ×5); GitHub API run list: run 12 (50bd215) success, run 13 (46fd99f) failure, run 14
  (3eb18a6) failure.
- Fix: `ci.yml` + `scripts/verify-local.sh` each gain a "schemas build" step after the database
  build (mirrors the database-build precedent). EOL verified LF. No runtime/architecture change.
- Tests proving the fix: clean-dist → build steps → workspace typecheck exit 0; full verify-local
  re-run exit 0 (see H-17 run evidence). CI re-verification: run for the fix commit (polled).
- Commit(s): `307d5a5` (feature: `307d5a5312b6dd0c89b4a4e5933288e6237e382f`) +
  `221b1ac` (CI fix 2: llm-adapter build before typecheck) + `247b26b` (CI fix 3:
  worker bootstrap unit test fully mocked — in CI `DATABASE_URL` is set, so the
  earlier version started a real pg-boss connection and hung the unit step) +
  docs SHA-record commit. CI remediation chain: run 34350615469 failed (typecheck —
  llm-adapter dist missing in CI) → `221b1ac` → run 34352075690 failed (unit tests —
  real pg-boss connection from the bootstrap test) → `247b26b` → **run
  34353922712 success**.

## 2026-09-09 — D-29 Track R reference data (reviewed import path + live content load)

- **Module:** `apps/api/src/admin/` — sole writer of the six curated reference tables (ADR §2);
  no public admin HTTP API (canonical docs prescribe none). Reviewed path via CLI
  (`reference-data:import`): stage/diff (no writes) → human approval record (sha-signed) →
  effective-dated persist. Forward-only versioning; supersede closes the prior open version;
  history never mutated; overlap rejected by DB constraints; unreviewed persist impossible.
- **Content (4 reviewed imports, approval records committed, real sources):** statutory
  allergen definitions (US 9 + EU/UK 14 + coconut + fenugreek flags), 12 dictionary rows
  (Q5 working assumption) + 6 aliases, 6 allergen mappings, 12 USDA FDC SR Legacy composition
  entries with real values fetched 2026-09-09. Fenugreek powder has no distinct USDA record →
  I7-unmapped (listed, excluded) — no invented values.
- **Gate fix:** Q5 one-writer pattern was case-blind to camelCase Prisma models; strengthened.
- **Evidence:** API 160/160, D-29 integration 8/8 (real PG), gates PASS (both reference
  one-writer gates actively enforcing), verify-local exit 0, CI green.

## 2026-09-09 — D-18 Views 1–4 + home mode (P3-4)

- **Backend:** read-only `GET /recipes/:recipeId/analysis` (API §5, RS-US-13) — latest current
  analysis + view rows, INV-17, UUID guard. +3 controller tests.
- **Web:** `AnalysisViews` (identification C1 from the persisted view_5 payload + Tabs over
  Views 1–4 in home voice; claim tags; View 2 blind-spot visible; View 3 incomplete reason;
  unavailable/refused states never invented) replaces the "coming next" placeholder; workspace
  lifts lines/method state and reopens on the latest analysis; `lib/views.ts` helpers (UNKNOWN
  blanking, name resolution with visible unresolved ids).
- **Worker dev stub (Q9-labeled):** builds payloads from the captured ids so the D-16 grounding
  gate validates them against the same state (demo shows the real COMPLETE path; rejection path
  still exercised). Never production.
- **Evidence:** web 69/69, API 148/148, worker 21/21, integration 73/73, gates PASS, lint/
  typecheck clean, live 13/13, verify-local exit 0.

## 2026-09-09 — Fix: D-12 text/paste review bugs (semicolon segmentation + delete 204)

- **Bug 1:** single-line semicolon-separated pastes became one giant draft line (`splitRawLines`
  split newlines only). Fixed to split `\r?\n|;` — semantic-free segmentation, order preserved,
  clauses never combined; `recipe_input.raw_text` stays byte-for-byte (psql-verified); no
  amount/unit/sense parsing added.
- **Bug 2:** Add line → Delete showed "Could not remove the line." — the canonical DELETE is
  204 No Content with no body, but `api()` parsed the empty body as JSON (SyntaxError) and
  skipped the refresh. Fixed: `api()` resolves undefined on 204; `removeLine` sends the
  body-less canonical DELETE and refreshes; dead STALE_EDIT branch removed (delete has no
  stale-edit token).
- **Tests:** API unit 41/41 (+4 segmentation/immutability), integration 73/73 (+1 real-Postgres
  semicolon case), web 60/60 (+api 204 helper tests, add→delete lifecycle regression, delete
  failure surfaces the real message). Live acceptance 12/12 (exact reported flows incl.
  soft-delete row kept with deleted_at set). verify-local exit 0.

## 2026-09-09 — Fix: authenticated ingredient retrieval (cross-session 404)

- **Failure:** signed-in chef opened a guest-created recipe from the session list; GET /lines
  correctly 404'd (INV-17 assertOwned) and the UI showed a raw load error. The authenticated
  flow itself was never broken (fresh paste → lines 200 verified live).
- **Fix (frontend only, canonical):** session records now carry the creating identity
  (`SessionRecipe.owner`); HomeView splits "mine" (openable) from "Other sessions" (listed,
  explained, never openable); IngredientReview maps RECIPE_NOT_FOUND to a dedicated
  cross-session state. No backend change, no auth weakening, no new claim flow.
- **Tests:** web 55/55 incl. `RecipeWorkspace.flow.test.tsx` (authenticated paste → workspace →
  lines appear immediately + edits target the persisted id), owner-split + isOwnedBy tests
  (legacy untagged records conservatively foreign), RECIPE_NOT_FOUND state test; guest no-fetch
  regressions preserved. Live 8/8 (persisted-id match psql-verified, lines/edit/method/readiness/
  analyse). verify-local exit 0.

- **Frontend (apps/web):** real product flow replacing the bare guest/signed-in cards:
  `AppShell` + view state machine (home → create → workspace) in `app/page.tsx`; `HomeView`
  (Recipe Home, primary Create recipe, session-only recipe list, secondary guest claim band);
  `CreateView` (paste intake; photo visibly disabled, never functional); `RecipeWorkspace` with
  `IngredientReview` (all D-12 actions: inline edit with stale-edit token, add, delete, split,
  merge, sense-confirm, clear-review), `MethodSection` (D-13 paste/inferred/none with the
  canonical list-only consequence), `ReadinessPanel` (canonical enqueue-state only; blocked state
  with real blockers), `AnalysisPanel` (real D-17 states via poll + SSE; complete shows the real
  view rows + 'detailed views coming next', no fake progress). Design system tokens/primitives
  reused; icons via @phosphor-icons/react; no em-dashes in copy.
- **Backend addition (minimal, read-only):** `GET /recipes/:recipeId/enqueue-state` exposing the
  existing D-14 `getEnqueueState` contract (required for the readiness screen; no new logic).
- **Test infra:** jest + ts-jest + RTL + jsdom added to apps/web (coverage floor 75% lines).
  E2E contracts in entry.spec/signup.spec updated deliberately (Recipe Home + secondary guest
  band replace the old guest card assertions); landing contracts untouched.
- **Evidence:** web 48/48 (82.98%), API 141/141 (+2 controller), integration 72/72, gates PASS,
  typecheck/lint clean, live HTTP flow 13/13 (full demo path incl. two distinct fenugreek lines
  and real worker completion), verify-local exit 0, CI run 34361814176 success. Playwright remains
  environment-blocked.
- Commit: `a5530d3` (a5530d352531f08a4c39862b401d7373719db6da).
- **Deliberate non-changes:** no OCR, no guest review/method bridge (canonical auth labels kept),
  no recipe-list endpoint, no D-18 view rendering, no client-side readiness.

- **CI fix (pre-flight audit, commit `1140ef4`):** runs 13/14 were failing at typecheck —
  D-15's `packages/schemas` main→dist change means consumers import `dist/`, but CI never built
  schemas before typecheck (locally masked by a pre-existing dist). Added a schemas build step to
  `ci.yml` + `verify-local.sh` (mirrors the database-build precedent). Reproduced locally (TS2307),
  fix verified: run 34343407523 green.
- **D-17 (feature commit):** analysis worker + pg-boss queue (v10.4.2, CJS) + NOTIFY→SSE spine.
  API: `POST /recipes/:recipeId/analyse` (D-14 gate → 409 ENQUEUE_BLOCKED, 422 METHOD_REQUIRED,
  200 `{analysis_id,status:'queued',prompt_version}`), read-only `GET /analysis/:id` (UUID guard,
  INV-17), SSE `GET /analysis/:id/events` (snapshot replay + live pushes; connect-before-row
  streams from `queued`). Worker `apps/analysis-worker`: idempotent handler through the D-16
  `generateGrounded` choke point with regenerate-once; views 8/9 INCOMPLETE (D-18 producers);
  INV-09 is_current flip (others-off-first); duplicate delivery converges (INV-11);
  ProviderPending (Q9) → failed without retry; transient → failed + pg-boss retry (Q13-labeled
  pilot defaults); boot sweep for stale generating. Q1 = labeled job-payload captured state
  (DISPATCH-deliverable-2 assumption); `recipe_snapshot` stays `unknown`; model_version =
  `stub-no-provider-q9`. Migration 003 declares the existing `uq_analysis_view` unique for
  idempotent upserts. Tests: worker 9/9, API 139/139, integration 4/4 (real Postgres+pg-boss),
  live 15/15 + SSE push, verify-local ALL STEPS PASSED.

- Status: **DONE** (all three dispatch done criteria satisfied; H-16 filled with evidence).
- Change (in `packages/llm-adapter/src/grounding/` + pipeline wiring): `validateViewGrounding` /
  `validateClaimGrounding` / `validateClaimsGrounding` (ADR §6, INV-10) — structured references in
  views 1/2/4 resolve against captured ids; ABSENT rule via tag ABSENT or the captured
  `explicitly_absent` list; CARD/METHOD claims cite a captured id + carry its name token;
  ABSENT-for-captured = MAJOR; `groundingAttempt` regenerate-once (attempt 3 throws — A-16 BLOCKER);
  `generateGrounded` = the single choke-point chain (generate → schema → grounding). Captured state
  = frozen StructuredRecipeInput as a parameter (Q1 OPEN); no provider (Q9 OPEN); no worker writes.
- Tests: llm-adapter unit **89/89** (+37: invented/reworded/absent plants all caught; attempt
  semantics; choke point), golden-fixture integration **6/6** (real `golden_kanyakumari_card.json`;
  garlic/ginger plants caught — done criterion 1), workspace unit/lint/typecheck green, regression
  gates PASS (no new static gate — D-16K), `verify-local` exit 0. Live-stack N/A (pure function).
- Decisions: D-16A..K (HANDOFF §5 pre-flight); SCAFFOLD register unchanged (Q9/Q1 remain OPEN).
- Commit(s): **`1c2741f`** (full `1c2741f7ec94d7633f76986ca6bd5579178523c8`) — D-16 checkpoint, pushed to `github.com/mohamedazzim/recipe-systems` main (2026-09-09, owner-authorized; remote verified via `git ls-remote`, working tree clean).
- Resume point: D-17 (P3-3 analysis worker) awaits explicit dispatch; D-11/Q10 still deferred.

## 2026-09-09 — D-15 Prompt specs + prompt_version (P3-1)

- Status: **DONE** (all three dispatch done criteria satisfied; H-15 filled with evidence).
- Change (all in `packages/llm-adapter` — Tech Stack §10 LLM layer, no layout change): per-view
  prompt specs 1–7 pinned to Analysis Prompts §2–§8 (+ Recipe_Systems §7 per-view home/chef mode
  focus); views 8/9 marked deterministic (no prompt invented); shared system prompt verbatim §1 +
  home/chef mode overlays (§7); `parseViewOutput` = frozen VIEW_SCHEMAS safeParse — the single QG4
  regenerate trigger D-16/D-17 key off; `PROMPT_VERSION = 'v2'` (the `analysis.prompt_version` write
  stays D-17's — worker owns analysis_*); `MockLlmAdapter` deterministic CI stub; no provider, no
  credentials (Q9 OPEN); `recipe_snapshot` stays `unknown` (Q1 OPEN). Packaging: schemas package
  main/types → dist (D-15L; source surface + freeze record unchanged).
- Tests: llm-adapter unit **52/52** (hand-checked valid+malformed per view against the frozen
  schemas — A-15 BLOCKER cell run; envelope both modes; reproducibility twice-identical; mode
  separation; QG4 rejection; Q9 hygiene), workspace unit/lint/typecheck green, regression gates
  PASS, `verify-local` exit 0. Live-stack N/A (no HTTP surface — recorded honestly).
- Decisions: D-15A..L (HANDOFF §5 pre-flight); SCAFFOLD register unchanged (Q9/Q1 remain OPEN).
- Commit(s): **`1b4b2f3`** (full `1b4b2f3cdab8cfc431786959ff6cae08de5d2fca`) — D-15 checkpoint, pushed to `github.com/mohamedazzim/recipe-systems` main (2026-09-09, owner-authorized; remote verified via `git ls-remote`, working tree clean).
- Resume point: D-16 (P3-2 grounding validator) awaits explicit dispatch; D-11/Q10 still deferred.

## 2026-09-09 — D-14 needs_review enqueue gate (P2-5)

- Status: **DONE** (INV-05 guard shipped in text scope; photo golden scenario gated on D-11; H-14
  filled with evidence).
- Change: `IntakeService.getEnqueueState` (read-only, canonical `needs_review` flag only, active =
  `deleted_at IS NULL`; INV-17 404 inside) — THE shared check P3's enqueue must reuse. Wire shape
  `{ can_enqueue, blockers: [{ line_id, display_name }] }` (snake_case, D-13 convention).
  `GET /recipes/:id/parse-preview` + `enqueue` field (additive; no new endpoint — API doc defines
  none). Review PATCH + `needs_review: false` (literal false; `true` → 400 INVALID_LINE_EDIT; OCR
  owns true; no auto-clear). New static gate: shadow enqueue-readiness state in .prisma/.sql fires
  (A-14 drift MAJOR) with qg2 plant proofs.
- Tests: API unit 134/134 (+6), integration 62/62 (new `inv05_enqueue_gate.test.ts` 6/6; qg2 +2),
  regression gates PASS (new gate armed), lint/typecheck clean, `verify-local` exit 0. Live-stack
  HTTP 8/8 (DB-planted flag; review clear unblocks immediately). Playwright `enqueue-gate.spec.ts`
  written — env-blocked as documented.
- Decisions: D-14A..H (HANDOFF §5 pre-flight); SCAFFOLD register unchanged (no Q-row changes).
- Commit(s): **`bdbea9b`** (full `bdbea9b2ce7ec0532bd07e4be20e2e5895b3dfa8`) — D-14 checkpoint, pushed to `github.com/mohamedazzim/recipe-systems` main (2026-09-09, owner-authorized; remote verified via `git ls-remote`, working tree clean).
- Resume point: D-15 (P3-1) or D-11/Q10 when OCR re-opens. P2 blockers: D-11 ⏸ (Q10 OPEN);
  D-12 photo-path criteria pending D-11.

## 2026-09-09 — D-13 Method attach (P2-4)

- Status: **DONE** (dispatch criteria 1–3 all satisfied; H-13 filled with evidence).
- Change: new `PATCH /recipes/:recipeId/method` (API §4 / RS-US-09) via new `RecipesController`
  (recipes module, JwtAuthGuard + CsrfGuard). Modes: `paste` → `method_text` + tag `METHOD`;
  `inferred` → tag `INFERRED` + `method_inferred_source` (named source REQUIRED — source-less refused
  400); `none` → all three method columns cleared. Wire response `{method_tag, method_source, list_only}`;
  `list_only := method_source_tag IS NULL` = the Views 3/7 INCOMPLETE flag P3 will assert. All writes in
  `RecipeService.attachMethod` (one-writer ADR §2); no line writes (Q4); no schema change; no
  `analysis_claim` writes (C4 = P3).
- Tests: unit 128/128 (+5), integration 54/54 (new `story_b4_method_attach.test.ts` 6/6), regression
  gates PASS, lint/typecheck clean, `verify-local` exit 0. Live-stack HTTP (real OIDC) 10/10 PASS;
  DB row confirmed. Playwright E2E `method.spec.ts` written (5 specs) — env-blocked as documented.
- Side fix: `tests/e2e/review.spec.ts` parse-text status 201→200 (D-12 latent expectation; canonical
  API §3 is 200, confirmed live — never ran on a Playwright-capable machine).
- Decisions: D-13A..J (HANDOFF §5 2026-09-09 pre-flight); SCAFFOLD register unchanged.
- Commit(s): **`364d58b`** (full `364d58ba6e5ec7e5c439dbc302ea788ab2f63246`) — D-13 checkpoint, pushed to `github.com/mohamedazzim/recipe-systems` main (2026-09-09, owner-authorized; remote verified via `git ls-remote`, working tree clean).
- Resume point: D-14 (needs_review enqueue gate) awaits explicit dispatch; D-11/Q10 still deferred.

## 2026-09-09 — Git checkpoint + D-12 record (8bd7708, 83e6de0)

---

## 2026-09-09 — D-12 parse review shipped (text scope; OCR deferred)

- Author / session: Hermes Agent (D-12 dispatch, TEXT/PASTE scope — user directive 2026-09-09:
  OCR paused for the day; D-11/Q10 deferred; decision trace + D-12A…I recorded in HANDOFF §5
  BEFORE code).
- What changed: `apps/api/src/modules/intake/intake.service.ts` + `intake.controller.ts` — the
  full B3 parse-review editor for text-originated draft lines: edit / add / delete (soft) /
  split / merge / header marking / sense confirmation, stale-edit rejection on `updated_at`
  (409 STALE_EDIT), corrected-object read path (`GET /lines`, `GET /parse-preview`). All
  mutations stay under the Intake writer boundary (Q4); `recipe_input` untouched throughout.
  `tests/integration/story_b3_parse_review.test.ts` (new), unit tests extended, E2E
  `tests/e2e/review.spec.ts` (new). No schema change; no OCR fields fabricated for text lines.
- Why: pasted text has no OCR stage (B1); B3's review loop is source-channel-agnostic; the
  canonical sequence is preserved (D-11 remains deferred, D-13/D-14 untouched — D-14 depends
  on D-11).
- Register impact: none. Q10 stays OPEN (prior STOP history preserved verbatim); Q3/Q5/Q9/Q1/Q2
  untouched.
- Verification (all real executions): API unit 123/123; integration 48/48 (new story_b3 8/8 —
  caught + fixed a real bug: downward line_no shift collided on the partial unique index);
  all-workspace unit 112/112; regression gates PASS; lint/typecheck clean; verify-local
  **exit 0 · ALL STEPS PASSED**. E2E specs written but NOT executable on this machine —
  corporate policy kills Playwright-launched browsers (exit 1260 ERROR_BLOCKED_BY_POLICY,
  chrome+edge, headed+headless; bundled Chromium download network-blocked); equivalent live-
  stack verification via the real HTTP surface (Keycloak OIDC → session → BFF → Postgres)
  **11/11 PASS**.
- Commit(s): **`8bd7708`** (full `8bd770884b3cab0422d27ffbe08540bff529cfd3`) — D-12 checkpoint,
  pushed to `github.com/mohamedazzim/recipe-systems` main (2026-09-09, owner-authorized;
  remote verified via `git ls-remote`, working tree clean).
- Resume point: D-12 photo-path criteria wait for D-11/Q10; next dispatchable unit = D-13
  (method attach, depends on D-12); D-14 needs D-11. A-12 audit pending.

## 2026-09-09 (cont.) — Q10 benchmark attempt #2: pre-run verification failed — still blocked

- Author / session: Hermes Agent (Q10 benchmark attempt #2; user provided `tests/fixtures/corpus_images/`, 15 JPGs).
- What changed: nothing in the repo beyond this log — the benchmark was NOT executed.
- Why: pre-run verification failed on all three required inputs. (1) **Images**: valid JPEGs
  (no EXIF, ~280×240 px) whose OCR text is generic EN/FR recipe cards — Spaghetti Bolognese,
  Chocolate Chip Cookies, Crépes, Ratatouille, Pad Thai… — with zero correspondence to the D-04
  corpus (0 grep hits for the dishes; corpus = Tamil/Kerala/other-Indian recipes with vernacular
  ingredient names). Not the team's card dataset, provenance unverifiable (a ChatGPT-generated
  image file was downloaded 4 min before the images appeared — flagged, not asserted). (2)
  **Manifest**: none provided; no image maps to any rs-NNN reference set → no ground truth.
  (3) **Credentials**: none available anywhere (env ×2, .env ×3, gcloud paths, Hermes .env,
  cmdkey, Downloads/Desktop/Documents/Temp, files.zip). Running the benchmark would have been
  unfalsifiable.
- Register impact: Q10 remains OPEN; GCV remains candidate; prior STOP history preserved verbatim.
- Verification: tesseract (Docker) OCR of all 15 images → dish list recorded in HANDOFF §5;
  corpus grep → 0 overlap; full credential sweep → absent.
- Resume point: unchanged — real team card images + ground-truth manifest + credentials outside
  the repo are still required before the benchmark can execute.

## 2026-09-09 — Q10 OCR benchmark blocked: no real-card images + no provider credentials

- Author / session: Hermes Agent (Q10 resolution attempt, pre-D-11; user-authorized benchmark task).
- What changed: no production code. Added `scripts/ocr-benchmark.js` (deterministic benchmark
  harness, stdlib-only; self-test PASS 3/3). Decision trace recorded in HANDOFF §5; SCAFFOLD §7
  Q10 row noted; IMPROVEMENT_PLAN P0-2 noted.
- Why: Q10 requires "real-photo benchmarking" (Tech Stack §11/§25.5; ADR §2) but the D-04 corpus
  is synthetic JSON text (`provenance.synthetic:true`), no recipe-card photos exist in the repo,
  and no OCR provider credentials are available on the machine — the benchmark cannot execute on
  its canonical input. No results fabricated; no canonical threshold invented (the sources define
  none — gap recorded; a project-proposed criterion is recorded in HANDOFF §5 and clearly labeled
  as non-canonical).
- Register impact: Q10 remains OPEN (GCV still initial candidate). Q1/Q2/Q3/Q5/Q9 untouched.
- Commit(s): none (no git operations authorized for this task).
- Verification: `node scripts/ocr-benchmark.js --self-test` → PASS 3/3 (clean / dropped-critical /
  missing-confidence cases); `--manifest` real run → exit 2 "BLOCKED: 1/1 manifest images do not
  exist"; repo-wide image search → only `docs/diagram.png` +
  `docs/recipe_app_workflow_diagram_v2_fixed.png` (diagrams, not cards); `.env`
  `OCR_PROVIDER=disabled`; no GCV/gcloud credentials present.

## 2026-09-08 — D-10 shipped: raw intake rows + photo pipeline (H-10)

- Author / session: Hermes Agent (D-10 dispatch, after Q4 pre-flight resolution).
- What changed: `apps/api` gained `recipes` (Web API's `recipe` writer) and `intake` (sole writer
  of `recipe_input`/`recipe_ingredient_line`, Q4-resolved) modules plus an S3 storage service;
  HTTP surface POST /recipes/parse-text + /recipes/upload per API §3; `recipe_input` immutability
  regression gate added; S3_* env wired into dev.sh/start-dev.cmd/STARTUP.md.
- Why: P2-1 per BUILD_PLAN; the one-writer boundary formalized in the Q4 resolution.
- Register impact: none (Q4 stays RESOLVED; Q5 still OPEN).
- Tests: unit 25/25 new (workspace 251) · integration 40/40 (real DB + MinIO, QG4 live-URI probe,
  INV-17 ownership) · E2E 25/25 · verify-local exit 0.
- Decisions D-10A–D-10K recorded in HANDOFF H-10.

## 2026-09-08 — D-10 pre-flight: Q4 resolved (Intake = sole writer of `recipe_ingredient_line`)

- Author / session: Hermes Agent (D-10 pre-flight dispatch; Q4 STOP-condition resolution).
- What changed: **Q4 resolved.** Decision — Intake is the sole logical writer of
  `recipe_ingredient_line` across the entire intake lifecycle: draft creation AND later user
  corrections (edit/add/delete/split/merge, sense confirmation) before analysis. The Web API/BFF
  exposes the intake and parse-review HTTP endpoints (API §3) but delegates every
  `recipe_ingredient_line` mutation to the Intake module; it never writes that table
  independently. Prior OPEN state preserved: the ambiguity ("Intake drafts vs Web API corrections")
  remains visible as the struck-through register row and in IMPROVEMENT_PLAN P0-4's problem
  statement.
- Why: ADR §2 already assigns Intake "raw input and OCR-related draft writes"; the ADR B2/B3
  responsibility row assigns Intake the raw→flag→review lifecycle; B3 corrections are draft-line
  mutations in the same lifecycle (soft-delete on split/merge); INV-03 (one logical writer per
  table), INV-05 (needs_review gate) and INV-07 (analysis never mutates lines) are all satisfied
  by a single Intake writer. Code scan found zero app write paths for these tables (no competing
  writer exists), and `recipe_input` is immutable by construction (no `updated_at` column).
- Documents updated: ADR §2 (Intake bullet names the tables + delegation rule); SCAFFOLD §7
  (Q4 register row RESOLVED, Q5 row note added — Q5 remains OPEN); IMPROVEMENT_PLAN P0-4
  (RESOLVED with rationale) + P0-5 (pre-flight finding note); HANDOFF §5 (pre-flight starting
  state + resolution record).
- Register impact: Q4 → RESOLVED. Q5 → OPEN with documented pre-flight finding (gates' admin-module
  "working assumption" vs unnamed ADR ownership — resolution remains a Track-R-gate item).
- Tests/gates: none run — no code changed (pre-flight + documentation only).
- Resume point: D-10 implementation may proceed on dispatch — `recipe_input` immutable raw rows,
  photo → object storage (URI only), draft `recipe_ingredient_line` writes through the Intake
  module only, QG4 no-dangling-URI evidence.

## 2026-09-07 — Implementation reconciliation: mentor repo aligned to the authoritative program
- Author / session: Hermes Agent (owner-authorized governance decision).
- What changed: `E:\Pente_Recipe_System-main` reconciled to the canonical corpus —
  Prisma owns all DDL (24 ERD v13 tables, migration 002 with the §12 constraint suite applied
  verbatim); Keycloak realm renamed `recipesystems`; auth rebuilt as OIDC authorization-code
  behind the provider-neutral seam (JWKS/issuer/audience/nonce verification, BFF session cookie,
  CSRF double-submit); `guest_session` + idempotent claim transaction (A2); Python analysis
  service and Redis retired; Node `apps/analysis-worker` skeleton in place; contracts pipeline
  made a documented D-05-aware no-op instead of a failing stub; CI/verify/gates ported to the
  authoritative 7-stage order (QG1–QG5); WP-era docs moved to `docs/historical/`.
- Why: owner confirmed E:\recipe as the sole authority and this repo as the implementation
  repository (see `RECONCILIATION.md` for the full traceability map).
- Register impact: Q8 stays RESOLVED (Keycloak sole IdP). Q9 (LLM), Q10 (OCR), Q11 (guest TTL —
  labeled pilot default 24h used) remain OPEN.
- Commit(s): uncommitted (no git operations authorized for this task).
- Verification: fresh migrate deploy ×2 (25 objects incl. `_prisma_migrations`), 8/8
  constraint-firing probes, drift = 3 documented raw-SQL objects, lint/typecheck/test/build
  green (api 87.2% lines ≥ 75% floor), regression gates green.

## 2026-09-07 — Repository normalization: Keycloak locked + user_story/ reconstruction verified

- **What:** (1) **Q8 resolved — Keycloak is the sole identity/authentication provider (OIDC/OAuth2).** Tech Stack §1/§14/§25/§26 amended to name Keycloak (superseding the earlier "Auth0 recommended" note); ADR v1.4 (§19 names Keycloak; §24 item 6); SCAFFOLD §3/§7 (register row RESOLVED); BUILD_PLAN §2/§3/§5/§7; TEST_PLAN QG4/§4; DISPATCH D-06 + global rule 9; AUDIT A-06 + contract; HANDOFF H-06 + template; IMPROVEMENT_PLAN P1-1 + backlog; uiflow §1/§10 register + workflow notes. No Auth0 reference remains outside this log. (2) **`user_story/` reconstructed and verified against the canonical `USER_STORIES.md`:** all 50 stories (A1–I7) present exactly once with IDs, acceptance criteria, and test cases preserved; `Epic-A_Account.md` updated for the Q8 resolution and normalized to the epic-file format (canonical note, boundaries line, epic ref); `Epic-I_Dietary_View9.md` renamed to `Epic-I_Nutrition_View9.md` (Epic I is "Nutrition bands", not "Dietary"); epic headings normalized to the canonical epic names (G — Quality, H — Dietary profile, I — Nutrition bands); canonical notes across all nine files cite `USER_STORIES.md` v1.2.
- **Why:** user instruction — repository specification normalization: one active authentication decision (Keycloak) and one canonical story corpus (`USER_STORIES.md`) with `user_story/` as its partitioned epic representation.
- **Register impact:** Q8 → Resolved (2026-09-07, audit-trail row in SCAFFOLD §7). Q1–Q7, Q9–Q17 remain OPEN; Q18 stays Resolved.
- **Commit(s):** `b4b1ff1` (this change set; follow-up commit records the SHA)
- **Verification:** bidirectional story-mapping script — 50/50 canonical stories resolve to exactly one epic file each, 0 missing, 0 duplicated, 0 invented; AC/TC fidelity check across all 9 epic files (no genuine gaps); repo-wide grep — zero active Auth0 references outside this log; no broken cross-references to the renamed epic file.

## 2026-09-04 — Review findings fixed in the six-file set

- **What:** the 7 review findings + 1 same-class fix applied across `USER_STORIES.md`, `DISPATCH.md`, `AUDIT.md`, `HANDOFF.md`, `IMPROVEMENT_PLAN.md`, `CHANGE_LOG.md` (all bumped to v1.1): (1) D-31/A-31/H-31 added — the could-have tail E6/F5/I5, conditional per §13; (2) billing vocabulary removed from the AUDIT contract; (3) migration-001 ownership: D-01 owns 001 (extension-only), D-02 owns 002+; (4) D-05 freeze record now names `CHANGE_LOG.md`; (5) IMPROVEMENT_PLAN summary descriptions match sections; (6) ERD v13 entry date hedged; (7) D-06 ledger story cell corrected; (8) D-10 ledger story cell corrected to include B5 (form path); C7 labeled conditional like the other could-haves.
- **Why:** user-approved review findings.
- **Register impact:** none resolved. Q1–Q17 remain OPEN; Q18 stays Resolved.
- **Commit(s):** uncommitted.
- **Verification:** 31/31 dispatch-audit-handoff pairing; 50/50 story coverage incl. E6/F5/I5 → D-31; BUILD_PLAN/TEST_PLAN untouched.

## 2026-09-04 — Documentation program: dispatch/audit/handoff set

- **What:** created `USER_STORIES.md`, `DISPATCH.md`, `AUDIT.md`, `HANDOFF.md`, `CHANGE_LOG.md`, `IMPROVEMENT_PLAN.md` (this set), modeled on the Pente `pente-quantum-userstory` repository structure, adapted entirely to Recipe Systems.
- **Why:** user instruction to build the Story → Dispatch → Audit → Handoff chain with change memory and an improvement plan, on top of the existing trio (SCAFFOLD/BUILD_PLAN/TEST_PLAN).
- **Register impact:** none resolved. Q1–Q17 remain OPEN; Q18 stays Resolved (2026-09-04). Every dispatch unit gated on an open decision builds to a labeled working assumption only (DISPATCH global rule 9).
- **Commit(s):** uncommitted.

## 2026-09-04 — Consistency audit + 5 approved fixes

- **What:** end-to-end consistency/traceability audit of the derived trio against the four sources. Five fixes approved and applied: (1) Q18 resolved in the register (repo initialized + pushed); (2) Q17 narrowed to the policy for the unreferenced `recipe_app_workflow_diagram_v2_fixed.png` (`diagram.png` now canonical in ADR §10); (3) ADR v1.3 revision note amended to acknowledge the §23 cross-check row change; (4) Tech Stack header fixed to cite `Recipe_Systems_Architecture_Decision_FINAL_V5.md` (was missing `_V5`); (5) SCAFFOLD §1 corpus citation corrected to Recipe_Systems.md §13 (ERD §16 kept for the golden card/assertions).
- **Why:** user-approved fixes to findings from the audit report.
- **Register impact:** Q18 → Resolved (2026-09-04, audit-trail row); Q17 → narrowed, still OPEN; Q1–Q16 untouched.
- **Commit(s):** uncommitted.
- **Verification:** re-ran the full consistency pass — 50/50 stories, ledger exact-once, QG naming, register cross-refs, three-file diff only, uniform CRLF.

## 2026-09-04 — ADR-001 v1.3: topology diagram embedded

- **What:** ADR §10's Mermaid `flowchart` replaced by the rendered `diagram.png` (project-lead decision); revision note added; §23 cross-check row updated; Q3 references in SCAFFOLD/BUILD_PLAN updated to "regenerate `diagram.png`".
- **Why:** project-lead decision to embed the rendered diagram; Mermaid source remains recoverable from git history.
- **Register impact:** Q17 partially executed (PNG became canonical in the ADR); Q3 unchanged (the diagram still draws the Worker→OCR edge — patch pending).
- **Commit(s):** `e7cf601`.

## 2026-09-04 — Repository initialized; initial commit; remote pushed

- **What:** git init at `E:\recipe`; initial commit with the four source documents, `SCAFFOLD.md` v1.0, `BUILD_PLAN.md` v1.0, `TEST_PLAN.md` v1.0, `.gitignore`, and the two PNGs; pushed to `github.com/mohamedazzim/recipe-systems` (private, branch `main`).
- **Why:** user instruction ("create a repo and push").
- **Register impact:** Q18 executed (register row updated to Resolved later the same day).
- **Commit(s):** `736685f`.

## 2026-09-04 — Derived trio created (SCAFFOLD / BUILD_PLAN / TEST_PLAN)

- **What:** `SCAFFOLD.md`, `BUILD_PLAN.md`, `TEST_PLAN.md` created as the three derived documents, structured on the Pente `pente-quantum-userstory` SCAFFOLD/BUILD_PLAN/TEST_PLAN templates, adapted to Recipe Systems (quality gates renamed G1–G5 → QG1–QG5 to avoid colliding with product stories G1–G3; nine-view schema freeze at P0 per §13; Keycloak positioned as the Q8 working assumption, not before P1).
- **Why:** user instruction — exactly these three files, template-structured, source-grounded.
- **Register impact:** opened the Q1–Q18 register (SCAFFOLD §7), one row per unresolved question found during derivation.
- **Commit(s):** `736685f`.

## 2026-09-02 — Tech Stack and ADR finalized

- **What:** `Recipe_Systems_Tech_Stack_FINAL.md` (dated 2026-09-02) and `Recipe_Systems_Architecture_Decision_FINAL_V5.md` (dated 2026-09-02) finalized; ADR §1/§14/§25 carry the Auth0 recommendation that Q8 later contrasts with the Keycloak working assumption.
- **Why:** design phase completion; exact authoring date before the repo existed is not recorded beyond the document headers.
- **Register impact:** none yet (register did not exist).
- **Commit(s):** pre-repo; committed in `736685f`.

## 2026-09-02 — ERD finalized at v13

- **What:** `Recipe_Systems_ERD_FINAL.md` v13.0 "final, submission-ready" — supersedes v12; fixes two long-standing bugs (`recipe_input` added to the Data Dictionary as C-41; duplicate `recipe_tag` index removed); conflict register C-01…C-42 all logged, none silent. (The ERD header carries no date; the date above is the file timestamp.)
- **Why:** finalization for submission; header notes the v12 bugs and the authority/honesty note separating SOURCE-DEFINED from INFERRED design.
- **Register impact:** none yet (register did not exist).
- **Commit(s):** pre-repo; committed in `736685f`.

## 2026-08-28 — Product spec working draft

- **What:** `Recipe_Systems.md` working draft dated 28 August 2026 (per the ERD header's source citation): the product spec — nine views, Home/Chef modes, provenance tags, no-invention rules, 50 stories, 12-week plan.
- **Why:** product definition start.
- **Register impact:** none yet.
- **Commit(s):** pre-repo; committed in `736685f`.

---

## Register state table (as of 2026-09-04)

| ID | State | Note |
|---|---|---|
| Q1–Q16 | OPEN | Q1 due wk 5 · Q2 due wk 8 · Q3 = regenerate `diagram.png` without the Worker→OCR edge · Q4 before P2 draft lines · Q5 before Track R curation · Q9/Q10 benchmarks wks 1–4 · Q11/Q12/Q13 before P7 · Q14 post-pilot |
| Q17 | OPEN (narrowed) | Policy for the unreferenced `recipe_app_workflow_diagram_v2_fixed.png` only; `diagram.png` is canonical in ADR §10 |
| Q18 | **Resolved** 2026-09-04 | Repo initialized and pushed to `github.com/mohamedazzim/recipe-systems` (private, `main`) |

## File inventory at this entry

| Category | Files |
|---|---|
| Source documents (never modified without explicit authorization) | `Recipe_Systems.md` · `Recipe_Systems_ERD_FINAL.md` v13 · `Recipe_Systems_Architecture_Decision_FINAL_V5.md` (ADR-001) · `Recipe_Systems_Tech_Stack_FINAL.md` |
| Derived planning docs | `SCAFFOLD.md` · `BUILD_PLAN.md` · `TEST_PLAN.md` |
| Requirements & execution docs (this set) | `USER_STORIES.md` · `DISPATCH.md` · `AUDIT.md` · `HANDOFF.md` · `CHANGE_LOG.md` · `IMPROVEMENT_PLAN.md` |
| Assets | `diagram.png` (canonical, ADR §10) · `recipe_app_workflow_diagram_v2_fixed.png` (unreferenced — Q17) |
| Repo | `.gitignore` · git at `github.com/mohamedazzim/recipe-systems` |

**Uncommitted as of this entry:** the 5 consistency fixes (ADR note, Tech Stack header, SCAFFOLD §1/§7) and this six-file set — both awaiting review.
