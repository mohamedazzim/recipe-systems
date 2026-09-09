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

## 2026-09-09 — D-16 Grounding validator (P3-2)

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
