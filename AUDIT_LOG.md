# Recipe Systems — Audit Log

**Purpose:** one verdict block per executed audit (AUDIT.md pairing contract; HANDOFF.md §2
registry). Verdicts are the audit agents' independent results — the H-XX entries record the
implementation; this log records whether the implementation survives the audit's attacks.

## A-19 — Audit: Views 5–9 (D-19)

- **Date / audit agent:** 2026-09-10 · DeepSeek V4 Pro (independent audit session — not the
  D-19 implementation session).
- **Audited commit:** `46c0559` (D-19 checkpoint; CI-fix `cc69d15` and docs `df5fe6e`/`bb2541b`
  included in the audited tree). Post-audit correction commit recorded below.
- **Scope:** DISPATCH D-19 done criteria, BUILD_PLAN P4-1, frozen D-05 schemas, Deterministic
  Views v2, Recipe_Systems §6, USER_STORIES H2/I1/I2/H6/I6, ADR §2 one-writer, D-29 reference
  contracts, INV-13, INV-14, I7, H-19 ledger entry.

### Verdict: PASS-WITH-FINDINGS

No BLOCKER or failure-class finding. One MAJOR finding was corrected during the audit
(separately recorded); one MAJOR is deferred with a recommendation; two MINORs recorded.

### Findings

**F-1 (MAJOR — corrected during audit): deterministic View 8/9 payloads bypassed the frozen-schema gate.**
- Attack: the LLM path (views 1–7) validates every payload through the D-16/D-17
  generateGrounded schema stage before upsert; views 8/9 were upserted from typed producer
  output with no `View8PayloadSchema`/`View9PayloadSchema` validation — a producer regression
  could persist payload drift against the D-05 freeze without any gate firing.
- Expected: every persisted view payload passes its frozen schema (INV-08 refusal semantics
  apply to ALL views).
- Observed: no runtime validation on the deterministic path (code inspection).
- Evidence: `apps/analysis-worker/src/analysis-job.handler.ts` (D-19 tree) upserted
  `computeView8`/`computeView9` output directly; the LLM loop validated via
  `generateGrounded`'s schema stage.
- Root cause: the deterministic producers were added beside the LLM loop without reusing the
  schema stage.
- Correction (minimal, separately recorded): the handler now `safeParse`s both payloads
  against the frozen schemas — main path: invalid → view INCOMPLETE with empty payload
  (never published); recompute path: invalid → throw (the existing valid payload stays
  intact; pg-boss retries per the Q13-labeled defaults). Two new unit tests prove the gate
  fires (invalid view-8 → INCOMPLETE; invalid recompute → throws, no overwrite).
- Re-verification: worker 32/32, API 171/171, web 82/82, integration 90/90, gates PASS,
  lint/typecheck 0, verify-local exit 0, CI green.

**F-2 (MAJOR — deferred, not corrected): `analysis_claim` rows are never materialized for any view.**
- Attack: A-19's attack vector requires View 8's source to be
  `dietary_allergen_definition/mapping` **via `analysis_claim.allergen_id`**; the ERD wires
  that support (nullable FK, partial index) but the worker writes NO `analysis_claim` rows for
  View 8 (or any view) — claim provenance lives only inside the JSON payload tags.
- Expected: allergen claims represented as claim rows referencing the allergen definition
  (H2's structural support).
- Observed: zero `analysis_claim` writes anywhere in apps/ (grep evidence); the frozen
  `View8PayloadSchema` carries no claim rows, and the D-19 outputs satisfy the frozen contract
  exactly (audit test A6: both payloads `.safeParse` under the D-05 schemas).
- Severity rationale: NOT a BLOCKER — the View 8 output is genuinely computed from the
  versioned mapping (audit A1 proves effective-dating fidelity; a "hardcoded View 8" — the
  BLOCKER class — does not exist); no wrong data is produced; the golden invariants hold.
  It is a provenance-representation gap against H2.
- Root cause: claim-row materialization was never in any dispatched unit's scope
  (D-15..D-19) — pre-existing, not a D-19 regression.
- Recommended correction: materialize View 8 claims (`claim_text`, `claim_tag`,
  `source_reference`, `allergen_id`) from the deterministic producer in a dedicated follow-up
  (recommend scoping into D-20 or a small D-25-adjacent unit; requires a dispatcher decision,
  not an audit-side invention).

**F-3 (MINOR — recorded, not corrected): recompute convergence relies on FIFO job delivery.**
- Attack: two assumption PATCHes in quick succession (lean then oily); a late re-delivery of
  the OLDER job (retry/out-of-order) after the newer one would regress the persisted
  assumptions to the older delta.
- Observed: sequential (in-order) delivery converges correctly — audit A5 proves
  lean→oily→oily converges to oily with idempotent re-delivery and only view 9 rewritten.
  Out-of-order delivery was not observed and pg-boss delivers per-queue in creation order
  (single consumer in the pilot).
- Recommendation (future): include a delta sequence/timestamp in the recompute job and ignore
  jobs older than the persisted payload's updated_at — or decide explicitly under Q13/P7.
  No correction applied (not observed in behavior; keep scope minimal).

**F-4 (MINOR — tooling note, not a product defect): Prisma's error for an unknown create
field surfaces as an opaque "Must call super constructor" ReferenceError.**
- Evidence: encountered while building audit fixture inserts with a misspelled model field
  (`fibreGPer100g` vs the canonical `fiberGPer100g`); the audit fixture was corrected, not the
  product. Product code uses the canonical field (typecheck-verified).
- Recommendation: none for the product; test-writing caution only.

### Tests performed (all green on the audited + corrected tree)
- Adversarial audit suite `tests/integration/audit_a19_views_8_9.test.ts` — 7/7:
  A1 effective-dated mapping fidelity (future/closed mappings do not flag; coconut never a
  tree nut — BLOCKER-class); A2 future/closed composition versions never leak into the band;
  A3 I7 unmapped line excluded from totals + listed; A4 INV-14 band semantics incl.
  all-assumptions-pinned edge; A5 recompute convergence + idempotency + view-9-only writes;
  A6 frozen-schema parsing of both producer outputs; A7 D-13 absent-method 422 gate.
- Unit: worker 32/32 (+2 A-19 gate tests), API 171/171, web 82/82, packages green.
- Integration: 90/90 (12 suites, serial). Gates: regression gates PASS (one-writer greps
  verified separately: no analysis_* writes outside the worker; no reference-table writes in
  the worker; no "safe" substring on any View 8 surface). Lint 0 · typecheck 0.
- verify-local: ALL STEPS PASSED, exit 0 (run on the corrected tree — recorded below).
- Live spot evidence (D-19 session, re-confirmed in audit): nine tabs render; H6/I6 verbatim
  on the surfaces; assumption edit recomputes the band via the queue; reference data intact
  (17/12/6/6/12/12) after every suite's snapshot-restore.

### H-19 ledger completeness
The H-19 entry covers BASE/COMMIT SHAs, scope, files, all test results, every D-19 done
criterion with evidence, gate evidence, OPEN DECISION labels (Q1/Q5/Q9/Q10 + ERD §15.4), the
RS-US-45 async deviation, and the I7 listing representation — complete; no fabrication found.

### Corrections recorded
- Commit: `d95482a` (full `d95482a4c0e1688eeabb85ed8e9b2cf8416ea02d`) —
  `fix(A-19): frozen-schema gate on deterministic payloads + audit verdict`; the original
  finding (F-1) is preserved above.

### CI status
- Runs for the D-19 checkpoint + CI-fix: success. Post-audit correction run: verified green
  after the push (run id recorded at checkpoint).

### Recommendation for D-20 / D-21
- **Proceed.** D-19 is fit for the next dispatch. Recommended order: **D-21 (disclaimer sweep)
  before or alongside D-20** — H6/I6 verbatim coverage already exists on the View 8/9
  surfaces, so D-21 is cheap and hardens INV-13/14 gates; D-20 (chef mode + station card)
  can then build on a stable View surface. Include the F-2 claim-row materialization as a
  scoped follow-up item (dispatcher decision), and keep F-3 in mind when Q13 is revisited at
  P7.

## A-23 — Audit: Print list + station card (D-23)

- **Date / audit agent:** 2026-09-14 · DeepSeek V4 Pro (builder session, read-only audit
  intent — canonical independence caveat recorded as F-3 below).
- **Audited commits:** D-23 tree `66e652e` → final `f8af600` (incl. `42788d9`, `834405c`,
  `5346976`, `4c82ead`, CI infra `7478832`/`02cb872`/`7edac70`/`f8af600`).
- **Scope:** DISPATCH D-23 done criteria; E4/E5/H4; INV-12 snapshot-only; QG4 PDF failure
  cell; Q2 Option A persistence.

### Verdict: PASS-WITH-FINDINGS

No BLOCKER. Behavior re-executed 2026-09-14: rendering 14/14 · API print 11/11 ·
story_d23_print 5/5 (real Postgres + real Chromium: one-page `%PDF` for both templates,
byte-identical INV-12 proof, INV-17 404s) · regression gates PASS incl. gate 2d · CI run
**69 = success** on `f8af600` (full cumulative suite + gates + migrate + MinIO + integration
on Ubuntu). Conformance spot-checks: one-writer intact, no DDL outside migrations, error
envelope canonical, no "safe" in print output.

### Findings

**F-1 (MAJOR — deferred): no Playwright e2e spec covers the two print flows.**
- Attack: TEST_PLAN QG1's web gate is the e2e of the five critical flows; "print list +
  station card (one page each)" is one of the five, and no print e2e spec exists. CI also
  has no e2e job at all (pre-existing infra gap, H-13 — local Playwright launches are
  machine-policy blocked).
- Evidence: `tests/e2e/` contains no print spec; `ci.yml` has no e2e step.
- Recommendation: add print e2e specs and an e2e CI job when Keycloak-in-CI becomes viable;
  until then the D-23 integration story (real Chromium PDFs) is the CI-grade substitute — a
  pre-existing gap, not a D-23 regression.

**F-2 (MINOR — deferred): `packages/rendering` has no QG1 floor row.**
- Attack: the QG1 table lists floors for every package except rendering (new in D-23);
  measured coverage ≈ 64% statements (pdf.ts partly uncovered).
- Recommendation: dispatcher adds a rendering floor row or accepts the current number;
  no silent decision made here.

**F-3 (MINOR — process note): audit executed in the builder's session.**
- The canonical independence constraint (fresh independent agent) could not be honored
  in-session; the audit ran with read-only intent — findings only, no fixes during
  re-execution.


## A-24 — Audit: Cook loop (D-24)

- **Date / audit agent:** 2026-09-15 · DeepSeek V4 Pro (builder session, read-only
  audit intent — independence caveat recorded as F-2 below).
- **Audited commits:** `efb480e` (D-24 feature) + `de47634`/`7043e03` (docs: SHA fill +
  CI evidence). Base `6cb5dfb`. Tree clean at audit time.
- **Scope:** DISPATCH D-24 (P6-1) done criteria; F1/F2/F6; AUDIT.md A-24 attack vectors.

### Verdict: PASS-WITH-FINDINGS

No BLOCKER or MAJOR. Every done criterion and attack vector re-executed 2026-09-15:

- **Acceptance-scene re-run (live, internal browser):** opened the saved golden recipe
  → logged a cook (date defaulted today, editable form) → rated 4 with the canonical
  note (history row) → reload → library row `Cooked 9/15/2026` → reopen → recall strip
  `Last cooked 9/15/2026 · Rating N/5` + note at the TOP, DOM-proven above the
  Analysis result (section order: Cook log → Save → Delete → Review ingredients →
  Method → Shopping list → Analysis). Garlic still absent; print list button present;
  "Analysis complete." unchanged (no re-analysis fired).
- **F1 semantics:** three DISTINCT cook_log rows proven in Postgres (different UUIDs,
  ratings 3/5/4, notes intact, newest first) — no upsert-over-log.
- **F2:** rating 1 and 5 accepted, 0/6/1.5 rejected at the boundary (400
  INVALID_COOK_LOG) AND at the DB CHECK (direct rating-6 insert throws); note persists
  across reopen; PATCH partial + explicit-null clear verified.
- **Privacy / INV-17:** cross-account POST/GET/PATCH → canonical 404s; malformed and
  missing log/recipe ids → canonical 404s (RECIPE_NOT_FOUND / COOK_LOG_NOT_FOUND);
  guest own-session works, foreign guest refused.
- **Historical data:** story_d24 proves analysis/shopping/ingredient rows are
  byte-identical after logging + PATCH (JSON round-trip equality).
- **Reopen recall:** reload → reopen shows the NEWEST log's date/rating/note every time.
- **Suites:** `story_d24_cook_log` 7/7 on real Postgres (re-run this session) ·
  `qg2_gates` 18/18 incl. the cook one-writer fire proof and the real-tree pass ·
  API 258/258 with coverage 75.59% lines ≥ QG1 75% floor (cook.service.ts 100%) ·
  CI runs 34930312273 + 34930324926 both success (full cumulative suite + gates).
- **Conformance spot-checks:** one-writer — application writes to `cook_log` exist ONLY
  in `apps/api/src/modules/cook` (gate 2e armed; `tests/integration` fixtures/cleanup
  are outside the gate's application scan scope, same pattern as D-22/D-30); no new
  DDL (no migrations in the diff); `next_time_instruction` has NO write path in D-24
  (reads/surface only — F4 honestly deferred); wire is snake_case per API doc §8.
- **Drift:** 22 files, all in D-24 scope. `docs/` edits (HANDOFF H-24, CHANGE_LOG,
  API doc §8 annotation) were dispatch-ordered ("Update: HANDOFF H-24, CHANGE_LOG,
  relevant audit evidence"; the API doc §8 endpoints are specified BY D-24).
- **OPEN DECISION hygiene:** no silent register change; Q1/Q5/Q9/Q10/Q11 labeled
  untouched; F3/F4/F5 labeled deferred (D-26/D-31).

### Findings

**F-1 (MINOR — deferred, not a D-24 defect): the QG4 P6 fault cell "object upload
failure" was not demonstrated.**
- The cell belongs to the plate-photo upload (F5), which D-24 does not ship
  (DISPATCH NON-GOAL; D-31). The pre-existing D-10 upload-failure cell is untouched.
  Recorded so the cell is not forgotten when D-31 lands.

**F-2 (MINOR — process note): audit executed in the builder's session.**
- Same independence caveat as A-23 F-3: read-only intent, findings only, nothing fixed
  during re-execution.

**Recommendation for the next dispatch:** proceed to D-25 / D-26 per the dispatcher;
when D-26 ships, A-24's F-1 cell plus the F4 `next_time` write path become its audit
targets (D-24 already surfaces both correctly).

## A-26 — Audit: profiles, swaps, next-time, I3/I4 (D-26)

- **Date / audit agent:** 2026-09-15 · DeepSeek V4 Pro (builder session, read-only
  audit intent — independence caveat recorded as F-3 below).
- **Audited commit:** `e687c4e` (D-26 feature, HEAD = `origin/main`). CI run
  `34936562239` = success. Tree clean at audit time except the never-commit prompt
  artifact `packages/llm-adapter/src/prompts/South Indian Coconut Tamarind Fish Curry.md`.
- **Scope:** DISPATCH D-26 (P7-2) done criteria; F3/F4/H1/H3/H5/I3/I4; AUDIT.md A-26
  attack vectors (profile semantics BLOCKER, swap immutability BLOCKER, next-time COOK
  LOG tagging, I3/Q14 BLOCKER-class seam, I4 band tightening).

### Verdict: PASS-WITH-FINDINGS

No BLOCKER or MAJOR in D-26's shipped paths. Every attack vector re-executed
2026-09-15:

- **Profile semantics (BLOCKER):** `story_d26_hardening` 6/6 on real Postgres — H1
  strict canonical validation (unknown code → 400 INVALID_RESTRICTION_PROFILE) + account
  isolation + never auto-deletes recipes (recipe count unchanged after PUT); H3 conflicts
  first, unknown never a pass, absent-from-card listed with no pass claim, cross-account
  highlight → canonical 404.
- **Swap immutability (BLOCKER):** F3/H5 in the story — reduced-not-applied leaves the
  card byte-identical; applied routes through Intake (`amount_text` edit / soft-delete);
  three immutable `cook_log_swap` rows; cross-account recording → 404. Conformance grep:
  no `cookLogSwap.update/updateMany/delete/deleteMany/upsert` anywhere in `apps/*` or
  `packages/*` (silent card rewrite is impossible by construction).
- **Next-time tagging (F4):** story F4 proves POST + PATCH persistence, the station-card
  print carries `Next time:` + `COOK LOG`, and the next-time block never carries a CARD
  tag; clearing `next_time` removes the block. `packages/rendering` 15/15 incl. the
  never-CARD provenance test; template grep confirms the `COOK LOG` tag.
- **I3/Q14 (BLOCKER class):** story I3 proves `per_portion` is null before portions are
  set (I3 TC-01), fills only after a portions recompute, the whole-pot band is unchanged,
  and sodium stays unknown. Conformance grep: zero `portion` hits in
  `packages/database/prisma` (schema + migrations) — no persisted portion column shipped;
  Q14 REMAINS OPEN with the labeled `per_portion` seam (HANDOFF H-26).
- **I4:** story I4 proves naming the fish / weighing the coconut / measuring the oil
  narrows the energy band without collapsing it to a point (INV-14).
- **One-writer gate:** `qg2_gates` 19/19 on real Postgres incl. the cook and restriction
  fire proofs and the real-tree pass. Conformance grep: `accountRestrictionItem` /
  `accountRestrictionProfile` referenced only in
  `apps/api/src/modules/restrictions/restriction.service.ts` (+ its `.test.ts`) — the
  API restriction module is the sole application writer.
- **Live journey:** verified end-to-end during the D-26 session (profile → View 8
  conflicts-first → applied swap DB-proven → next-time COOK LOG print → portions 4
  "Per bowl" → reload persistence; evidence in H-26). Not re-run in this audit session
  (dev stack torn down); the underlying DB effects are independently re-proven by
  `story_d26_hardening` + `qg2_gates` above.

### Findings

**F-1 (MINOR — latent data-integrity interaction, pre-existing, not a D-26 defect):**
`account_restriction_item.allergen_id` is wired `ON DELETE SET NULL` (migration 002,
line 404) while CHECK `chk_restriction_item_type_matches_value` requires
`allergen_id IS NOT NULL` for `restriction_type = 'allergen'` (migration 002, line 599).
Deleting any `dietary_allergen_definition` row that a household profile references
therefore always fails with Postgres 23514 rather than a clean RESTRICT or cascade.
- Not triggered by D-26's shipped paths: the restriction module never deletes
  definitions, and the only definition-delete path (admin reference data) is D-29
  scope. Pre-existing in the schema; D-26 is merely the first feature that writes
  `account_restriction_item`, making the interaction observable.
- Recommendation (D-29 / hygiene backlog, not this audit): align the FK action to
  `RESTRICT` (or explicitly clear `account_restriction_item` before definition
  deletes) so the failure mode is intentional, not a 500.

**F-2 (MINOR — test-isolation fragility):** `story_d26_hardening.test.ts` (and any test
reusing `truncateReferenceTables`) does not clear `account_restriction_item` before
truncating `dietary_allergen_definition`; on a non-pristine DB with any live profile row,
the truncate throws 23514 (F-1 above) and the whole suite fails before a test runs.
- Observed this audit: the leftover chef profile from the D-26 live journey blocked the
  suite; after removing that verification artifact the suite ran 6/6 green.
- Recommendation: have the fixture clear profile items (or delete profiles) before
  truncating reference tables. Deferred — no test edits made in an audit.

**F-3 (MINOR — process note): audit executed in the builder's session.**
- Same independence caveat as A-23 F-3 / A-24 F-2: read-only intent, findings only,
  nothing fixed during re-execution. Q14 left OPEN (no decision made here).

**Recommendation for the next dispatch:** proceed to D-25 / D-27+ per the dispatcher.
D-26 is fit for the next unit; carry F-1/F-2 into the D-29 reference-data work (or a
hygiene backlog item) so the definition-delete path and the test fixture are hardened
together.

## A-25 — Audit: aliases, tags, edit + re-analyse (D-25)

- **Date / audit agent:** 2026-09-15 · DeepSeek V4 Pro (builder session, read-only
  audit intent — independence caveat recorded as F-2 below).
- **Audited commits:** `fb09de4` (D-25 session 1) + `c92186b` (D-25 session 2) +
  `224eb34` (auth .env-loading fix). Base `f16d8b0`. CI run 34952720762 = success
  on `224eb34`.
- **Scope:** DISPATCH D-25 (P7-1) done criteria; B6/C6/C7/D3/D4/D5; AUDIT.md A-25
  attack vectors (alias-resolution BLOCKER, Q5 one-writer, snapshot-chain BLOCKER,
  explicit re-run only, C7 conditional).

### Verdict: PASS-WITH-FINDINGS

No BLOCKER. Every attack vector re-executed 2026-09-15:

- **Alias resolution (BLOCKER class):** `story_d25_session1` 3/3 on real Postgres —
  all five vernacular groups resolve to their canonical (`drumstick`/murungakkai/
  moringa → drumstick; shallots/chinna vengayam/cheriya ulli → shallots; fenugreek/
  methi/uluva/vendhayam → fenugreek_seed with "fenugreek powder" staying distinct;
  tamarind/puli → tamarind; curry leaves/karuveppilai → curry_leaves) and ambiguous
  "drumstick" carries `requires_confirmation: true` on the wire (TC-01/TC-02). The
  resolution logic is read-only over dictionary/alias and is CORRECT.
- **One-writer (Q5):** `qg2_gates` 20/20 incl. the dictionary/alias + recipe_tag fire
  proofs and the real-tree pass; write-scoped grep confirms
  `ingredientDictionary/ingredientAlias` writes exist ONLY in
  `apps/api/src/admin/reference-data.repository.ts` (the D-29 admin module). Q5 stays
  OPEN (working assumption honored, not resolved).
- **Snapshot chain (BLOCKER class):** `story_d25_session2` 3/3 + `story_d17` 4/4 —
  re-analyse links the previous analysis via `analysis.snapshot_of_analysis_id` (new
  current `0dda7f25` → previous `5ed224a6`), the `is_current` flip stays order-safe
  (INV-09, exactly one current), the worker remains the sole `analysis_*` writer, and
  NO `cook_log.analysis_id` column exists (grep: schema has none).
- **Explicit re-run only (C6):** `story_d25_session2` — editing a saved recipe never
  auto-enqueues (analysis count unchanged after a line edit); re-analysis is the
  explicit `POST /recipes/:recipeId/analyse`.
- **C7 conditional:** grep confirms NO substitution-preview implementation shipped (the
  only "identity-shift" hit is the pre-existing D-11 View 4 prompt vocabulary).
  C7 DEFERRED — the §13 weeks-9–10 Must-stability evidence is still not recorded.
- **D3 tag/search ownership:** `story_d25_session1` proves tags persist + three-axis
  search (name/ingredient/tag) + cross-account isolation; grep confirms the
  `recipe_tag` writer is confined to `apps/api/src/modules/recipes`.
- **D4 edit/review + D-24 note preservation:** live journey + `story_d25_session2` —
  line edit via the review surface, cook logs/notes unchanged ("fish held, garlic
  stayed out"), and write-scoped grep shows no `cook_log` writes outside the cook
  module (no silent note overwrite).
- **INV-17 / malformed / foreign IDs:** `story_d25_session2` — foreign edit → canonical
  404; malformed (non-UUID) recipe id → clean 404 before Prisma.

### Findings

**F-1 (MAJOR — deferred, user-facing completeness gap): the B6 + D3 web surfaces are
not shipped.**
- The API exposes `canonical_name` + `requires_confirmation` on the line wire (B6) and
  `PUT/GET /recipes/:recipeId/tags` + `GET /recipes?q=` search (D3), and both are
  integration-proven correct. But NO web component renders them — grep across
  `apps/web` finds zero references to `canonical_name`, `requires_confirmation`,
  `tagText`, `/tags`, or the search query path.
- Consequence: the user-facing acceptance criteria are not reachable from the UI —
  "drumstick asks for confirmation" (B6 AC-2/TC-02) shows no prompt, the resolved
  canonical is never displayed (B6 AC-1), and free-text tags + three-axis search
  (D3 AC-1/AC-2) have no editor or search box.
- Severity rationale: NOT a BLOCKER — the resolution logic and ownership are correct,
  no wrong data is produced, and nothing regressed. It is a story-completeness gap
  against the UI-side acceptance criteria (the D-25 dispatch listed B6/D3 as
  backend-first deliverables, but Recipe_Systems §12 stories are user-facing).
- Recommendation: surface the canonical name + a confirmation affordance in
  `IngredientReview`, and add a tag editor + search box to the library/home surface, in
  a small D-25-adjacent follow-up (dispatcher decision, not an audit-side fix).

**F-2 (MINOR — process note): audit executed in the builder's session.**
- Same independence caveat as A-23 F-3 / A-24 F-2 / A-26 F-3: read-only intent,
  findings only, nothing fixed during re-execution. Q5/Q1/Q10/Q11 left OPEN.

**Recommendation for the next dispatch:** proceed to D-27 (D-25 is otherwise fit; the
snapshot chain, one-writer gates, and explicit-re-run behavior are sound). Fold F-1
(the B6/D3 web surfaces) into a scoped follow-up alongside D-27 or a UI pass.

### F-1 closure (2026-09-15)

- **Status: CLOSED.** Dispatcher shipped the scoped follow-up: B6 + D3 web surfaces
  only (HARD STOP before D-27). No audit-side fix was applied — closure is by
  dispatcher work, verified below.
- **B6:** `IngredientReview` renders the resolved canonical chip and a
  confirmation banner for `requires_confirmation && confirmed_sense === null`;
  Accept records `confirmed_sense = canonical_name` and never rewrites
  `display_name`. `WireLine` carries `canonical_name` + `requires_confirmation`.
- **D3:** `TagsSection` (GET/PUT `/recipes/:recipeId/tags` — chips/add/remove,
  Bearer-only) in `RecipeWorkspace`; `HomeView` search box over the
  account-scoped GET `/recipes?q=` (name/ingredient/tag; Clear restores).
- **Automated evidence:** web 144/144 (B6 +5, TagsSection +4, search +3) ·
  integration 138/138 · qg2_gates 20/20 · regression gates PASS · contract-check
  OK · lint 0 · typecheck 0 · build OK.
- **Live-browser evidence:** drumstick confirmation + Accept (display_name
  unchanged; `confirmed_sense=drumstick`); canonical chips incl. the two fenugreeks
  distinct (`fenugreek_powder` vs `fenugreek_seed`); tags add/remove round-trip;
  search by tag (1 hit) / ingredient / name; account isolation —
  demo@recipesystems.test empty library + zero tag hits.
- **Reference-data note:** the dev DB's `ingredient_dictionary`/`ingredient_alias`
  were empty; the already-approved imports were re-applied via the D-29 admin CLI
  (002 dictionary, 005 B6 aliases, 003 allergen mappings, 004 nutrition) — data
  only, no new sign-off.

**A-25 final: PASS-WITH-FINDINGS → F-1 CLOSED (2026-09-15); F-2 (process note)
stands.** D-25 is now fully complete including the user-facing B6/D3 surfaces.

## A-27 — Audit: regional veto + retention/ops (D-27)

- **Date / audit agent:** 2026-09-15 · DeepSeek V4 Pro (builder session, read-only
  audit intent — independence caveat recorded as F-2 below).
- **Audited commit:** `691a55f` (D-27). CI run 34967842614 = success on this SHA.

### Verdict: PASS-WITH-FINDINGS

No BLOCKER, no failure-class finding. Every A-27 vector re-executed 2026-09-15:

- **Veto (BLOCKER class) — live + integration:** on the golden recipe, reviewer slot 1
  (chef@recipesystems.test) vetoed the current analysis `4f918c62` View 5:
  `COMPLETE → INCOMPLETE` (200, `vetoed:true`); the View 5 payload JSON is byte-identical
  (family/architecture/not_this/needs_review/tag untouched), View 1 stays COMPLETE, and
  the recipe row is unchanged. Repeat veto → 200 `already_vetoed:true` (idempotent).
  Re-analysis (integration `story_d27`) produces a FRESH analysis whose View 5 is
  COMPLETE again while the vetoed analysis stays INCOMPLETE. `story_d27_veto_retention`
  5/5 re-run green.
- **Reviewer authorization:** both slots work — reviewer slot 1 and slot 2
  (demo@recipesystems.test, `REVIEWER_EMAILS` comma-separated) both return 200;
  unauthenticated → 401 `UNAUTHENTICATED` (no guest bypass — JwtAuthGuard only);
  malformed id → 404 `ANALYSIS_NOT_FOUND` before Prisma; non-reviewer → 403
  (`story_d27` + unit). No cross-account owner data leaks in the response
  (analysis_id + view_number + status only).
- **Q6 hygiene:** no `publishable`/status column was added (schema.prisma unchanged);
  the publishable-state home rides the pre-existing `analysis_view.status` (labeled
  working assumption, Q6 OPEN). The review module's only `analysis_*` write is
  `analysisView.update({status:'INCOMPLETE'})`. QG2 gate 2h + fire proofs re-run 22/22.
- **Retention/cleanup:** `story_d27` proves an expired UNCLAIMED guest session + its
  recipe + cascaded `recipe_input` are removed and the storage keys are passed to the
  compensating cleanup; claimed + unexpired sessions and their recipes are preserved.
  `CleanupRunner` clears its timers on shutdown (no open handle). Schedule/TTL stay
  Q11-labeled (`GUEST_TTL_SECONDS` 86400, `CLEANUP_INTERVAL_SECONDS` 3600).
- **Q15:** photo/account retention remains labeled pilot defaults (reuses D-22
  compensating storage cleanup); no silent permanent retention decision. Q15 OPEN.
- **Q12:** RPO/RTO remain UNSET in `docs/ops/runbook.md` (ADR §17 forbids inventing
  numbers). Q12 OPEN.
- **Ops:** `docs/ops/runbook.md` contains backup/restore (Postgres PITR + Keycloak
  realm export + object-storage restore validation), upgrade windows, monitoring
  (Tech Stack §17), veto ops, and retention; reviewer identities are env slots, not
  fabricated names.
- **Regression:** `regression-gates.sh` re-run PASS; grep confirms NO `analysis_*`
  write outside `apps/analysis-worker/` except `apps/api/src/modules/reviews/`.
  D-23/D-24/D-25/D-26 behavior untouched; no provider/OCR/Q-resolution changes.

### Findings

**F-1 (MINOR — gate-hardening gap, empirically demonstrated):** QG2 gate 2h's whitelist
is prefix-matching — `bad=$(echo "$hits" | grep -vE "prisma\.analysisView\.update")`
also whitelists `prisma.analysisView.updateMany(...)`. Planted
`prisma.analysisView.updateMany({ where: {}, data: { status: 'INCOMPLETE' } })` in
`apps/api/src/modules/reviews/` → the gate reports `[gate:ok]` (no fire), contradicting
the gate's own comment ("updateMany … fires"). The shipped code uses only `.update`, so
there is NO live defect, but the gate does not enforce its stated boundary. Fix later
(not here): add a word boundary — e.g. `grep -vE "prisma\.analysisView\.update\b"`.

**F-2 (MINOR — process note):** audit executed in the builder's session (same
independence caveat as A-23 F-3 / A-24 F-2 / A-25 F-2 / A-26 F-3). Read-only intent;
findings only; nothing fixed during re-execution. Q6/Q11/Q15/Q12 left OPEN.

**Observation (not a finding):** the veto endpoint accepts any analysis id, including a
non-current (historical) analysis — vetoing a historical View 5 has no live effect (the
"blocked from live views" guarantee holds for the current analysis). Benign for the
pilot; ADR §8 "block a live sentence" is satisfied.

**Recommendation for the next dispatch:** proceed to D-28 (D-27 is otherwise fit).
Carry F-1 into a future gate-hardening pass (or fold into D-28's closing sweep hygiene).

## A-11 — Audit: OCR adapter + low-confidence flagging (D-11)

- **Date / audit agent:** 2026-09-15 · DeepSeek V4 Pro (builder session, read-only
  audit intent — independence caveat recorded as F-3 below).
- **Audited commits:** `1b1ab77` (D-11) + `001b0d7` (docs SHA/CI record). CI run
  34976615556. BASE `a8c08e1` (A-27 docs).

### Verdict: PASS-WITH-FINDINGS

No BLOCKER. Every A-11 vector re-executed 2026-09-15 (fresh runs, not HANDOFF claims):

- **INV-04 (BLOCKER class):** `IntakeService.persistOcrDraft` maps EVERY line in the
  normalized `OcrResult` with `low = confidence === undefined || confidence < 0.9`
  and no filtering — all N low-confidence lines flagged, zero dropped by
  construction. Empirical: `story_d11_ocr` (real Postgres + `StubOcrAdapter`) → 11/11
  lines, 1 flagged (`Fenugreek Powder - 1/2 Tsp`, 0.45), `getEnqueueState` blocks
  (`can_enqueue:false`, blocker named). Unit cases: complete/persist+flag (N=1 low),
  missing-confidence→flagged (undefined→flagged, never invented). Re-run green:
  `story_d11_ocr` 2/2 · `intake.service` 40/40.
- **Adapter seam:** `OcrAdapter.recognize(Uint8Array, contentType)` is the only
  contract the API sees (`resolveOcrAdapter` selects paddle/stub/null). Grep for
  vendor field names (`rec_text|rec_score|paddle|PaddleOCR|PADDLE`) across
  `apps/api/src`, `packages/domain`, `packages/schemas` → zero matches. No DB write
  in `packages/ocr-adapter` (grep prisma/database/transaction → zero). `OCR_ADAPTER`
  token consumed only by `IntakeService`. `ocr-adapter` 13/13.
- **OCR failure / QG4:** provider throw → `pending` (nothing OCR-specific persisted;
  photo + `recipe_input` row already durable; retry = re-POST); empty result →
  `unreadable` (422); no adapter → `disabled`. Controller: `pending` → 503
  `OCR_UNAVAILABLE`, `unreadable` → 422 `OCR_UNREADABLE`. `persistOcrDraft` runs
  `updateMany` + `createMany` in one `$transaction` — atomic, no partial silent
  persistence. Re-run: unit provider-failure→pending, empty→unreadable,
  no-adapter→disabled green; `story_d11` provider-failure case green (durable input,
  `ocr_text` null, 0 lines).
- **Golden stub:** `stub.ts` `GOLDEN_OCR_LINES` = 11 lines, both fenugreeks distinct,
  no garlic, exactly one low-confidence (0.45). `ocr-benchmark.js --golden-stub`
  → 11/11 preserved, `criticalMissing:[]`, `lowConfidenceCount:1`, `garlicAbsent:true`,
  `bothFenugreeksDistinct:true`, pass (exit 0). `--self-test` PASS.
- **QG2 / ownership:** no unauthorized writer introduced — `recipe_ingredient_line`
  writes live only in `apps/api/src/modules/intake/` (grep outside intake → only the
  Prisma generated `.d.ts`). No `analysis_*` write outside the worker. `qg2_gates`
  24/24 incl. the two D-11 immutability fire proofs. INV-17 untouched.
- **Q10 hygiene:** `resolveOcrAdapter` treats `paddle` as config-gated (no
  credentials, no selection claim); Q10 OPEN; no fabricated latency/accuracy claim
  (PaddleOCR = "not measured"; stub = 0 ms). D-28 stays BLOCKED.
- **D-12 compatibility:** OCR draft lines ride the Intake boundary (`sourceTag:'CARD'`,
  `needsReview` per line); `recipe_input.ocr_text` = normalized `recognized_text`
  (paste raw_text untouched); enqueue/parse-preview blocked while any `needs_review`
  line is active (INV-05, D-14 suite green). No auto-analysis path.
- **Regression:** `git diff --name-only a8c08e1..001b0d7` = 17 files, all in-scope
  (intake / ocr / ocr-adapter / scripts / tests / evidence docs) — zero out-of-scope
  (worker, llm-adapter, schemas, domain, reference-data, database, rendering).
  `regression-gates.sh` PASS · `contract-check` OK (previous run) · lint 0 ·
  typecheck 0 · build OK. DeepSeek/LLM unchanged.

### Findings

**F-1 (MAJOR — benchmark harness does not consume the adapter seam):**
`scripts/ocr-benchmark.js` duplicates the adapter logic instead of importing
`@recipe-systems/ocr-adapter`: `paddleProvider()` re-implements the PaddleOCR HTTP +
vendor-response normalization inline (a second copy of `paddle.ts`), and
`runGoldenStub()` hardcodes the 11 golden lines inline (a second copy of
`stub.ts`/`GOLDEN_OCR_LINES`). Evidence: `Select-String scripts/ocr-benchmark.js
-Pattern "ocr-adapter|StubOcrAdapter|resolveOcrAdapter|OcrAdapter|normalizePaddle"`
→ zero matches; its only `require()`s are `fs`/`https`. Impact: A-11 vector 4/6
("benchmark harness consumes the adapter seam") is not met — the Q10 real-card
benchmark would exercise a DIFFERENT code path than the API's shipped adapter, so a
drift/bug in `paddle.ts`/`stub.ts` would not be caught and the benchmark's
provider-selection evidence value is compromised. No live product defect (the API
uses the real adapter; CI green).

**F-2 (MINOR — gate 3b does not verify the `ocrText: null` guard):**
`scripts/regression-gates.sh:158` whitelists via
`grep -vE "apps/api/src/modules/intake/.*recipeInput\.updateMany"` — any
`recipeInput.updateMany` under the intake module passes, regardless of the write-once
`ocrText: null` guard the gate's own comment claims to enforce. Evidence: probing
`prisma.recipeInput.updateMany({ where: { id: "x" }, data: { ocrText: "y" } })` (no
null guard) under `apps/api/src/modules/intake/` → the gate does NOT fire. No live
defect (the shipped `persistOcrDraft` HAS the guard); same class as A-27 F-1
(prefix-matching).

**F-3 (MINOR — process note):** audit executed in the builder's session (same
independence caveat as A-23 F-3 / A-24 F-2 / A-25 F-2 / A-26 F-3 / A-27 F-2).
Read-only intent; findings only; nothing fixed during re-execution.

**Observation (not a finding):** the golden-photo BLOCKER vector (real-card
benchmark) remains DEFERRED to Q10 — no Python runtime, no provenance-valid golden
photo, no provider credentials (environment/tooling limitation, not a product defect,
and no evidence fabricated). The H-28 STOP preflight entry rode along in the D-11
commit (`docs/HANDOFF.md`) — benign process note.

**Recommendation:** dispatch a small D-11 follow-up (or fold into the D-28 closing
sweep) to make `scripts/ocr-benchmark.js` consume `resolveOcrAdapter` /
`StubOcrAdapter` / `PaddleOcrAdapter` and tighten gate 3b to require `ocrText: null`.
Then A-11 closes. Q10 remains the gate for D-28.

### Remediation (2026-09-15) — F-1 + F-2 CLOSED

- **F-1 CLOSED.** `scripts/ocr-benchmark.js` now `require('@recipe-systems/ocr-adapter')`
  and consumes the production seam: `paddleProvider()` builds the adapter via
  `resolveOcrAdapter({ ...process.env, OCR_PROVIDER: PADDLE_OCR_PROVIDER })` and calls
  `adapter.recognize(bytes, 'image/jpeg')`; `runGoldenStub()` calls `new
  StubOcrAdapter().recognize(...)`. The duplicated HTTP/normalization logic and the
  inline `isItem()` copy are deleted. Evidence: `--self-test` PASS and `--golden-stub`
  PASS (11/11 preserved, `garlicAbsent`, `bothFenugreeksDistinct`) with the adapter
  as the only implementation.
- **F-2 CLOSED.** `scripts/regression-gates.sh` gate 3b now partitions: any
  non-`updateMany` `recipeInput` write fires; an `updateMany` is whitelisted only
  when the file is under `apps/api/src/modules/intake/` AND contains the canonical
  `updateMany({` … `ocrText: null` guard (multiline-capable `grep -Pzo`; only the
  WRITE form `updateMany(` is considered, so test mocks/assertions are not writes).
  Fire proofs added in `tests/integration/qg2_gates.test.ts`: `updateMany` in Intake
  WITHOUT the guard → FIRES; `updateMany` OUTSIDE Intake → FIRES; the canonical
  multi-line guard → PASS. `qg2_gates` 26/26 · real-tree `regression-gates.sh` PASS.
- **Verification (2026-09-15):** full unit suite green (worker 64 · API 312 · web 144 ·
  database 3 · domain 1 · llm-adapter 123 · ocr-adapter 13 · rendering 15 · schemas
  112) · integration 151/151 (23 suites) · `regression-gates.sh` PASS ·
  `contract-check` OK · lint 0 · typecheck 0 · build OK (ocr-adapter + api +
  database). `verify-local`'s destructive steps (`npm ci`, root `npm run build`) were
  NOT run locally (live dev servers; `next build` clobbers `.next`) — the equivalent
  non-destructive steps all ran green and CI runs the full pipeline.
- **Q10 still OPEN; D-28 still BLOCKED.** No provider selection, no credentials, no
  real-card benchmark claim.

### D-11 frontend upload — shipped post-A-11 (2026-09-15, builder-verified; not an audit verdict)

- `apps/web/components/app/CreateView.tsx` photo upload (file picker + preview +
  client type/size gate + loading + Retry) → existing `POST /recipes/upload`
  (`apiUpload` helper). `IngredientReview` renders per-line OCR confidence +
  provenance. API `WireLine` gains `ocr_confidence` + `source_tag`; upload returns
  `lines` on a complete pass (guest-uploader parity with parse-text).
- Live internal-browser (chef@recipesystems.test, `OCR_PROVIDER=stub`): upload →
  11 OCR draft lines each with confidence + "from card" → the 0.45 line flagged
  "Review required" and analysis blocked (INV-05) → Clear review → "Ready to
  analyse". No second OCR API; no vendor fields leaked; Intake stays the sole
  writer. Web 150/150 · API 312/312 · integration 151/151 · gates/lint/typecheck
  green.
- **Q10 still OPEN; D-28 still BLOCKED.** Real PaddleOCR runtime + provenance-valid
  golden photo + manifest remain absent; the frontend path is verified against the
  deterministic stub only (no benchmark, no latency/accuracy claim).

## A-28 readiness audit — preparation run (not the final human-pilot verdict)

- **Date:** 2026-09-16.
- **Scope:** D-28 pilot-readiness preparation under the zero-API-cost constraint.
- **Important boundary:** this is not a completed A-28 closing-sweep verdict. No
  participants, human completion records, human timings, reviewer actions, or fake
  pilot outcomes were created.

### Classification

- READY: canonical participant scenarios, §14 metrics, §15 acceptance scene, G3/G2
  criteria, `messy_20`, reviewer slots, deterministic persistence paths, and evidence
  categories.
- MISSING HUMAN EVIDENCE: 20-user uncoached records, three-curry chef pass, real
  reviewer assignment/veto, and human save/list/log observations.
- BLOCKED: new photo-to-first-analysis timing and live AI-dependent execution because
  DeepSeek credits are exhausted. The historical timing remains historical evidence.

### Evidence re-executed

- `node scripts/golden-check.js` -> `8/8` invariants pass.
- `node scripts/corpus-check.js --corpus tests/fixtures/corpus --messy tests/fixtures/messy_20 --reviewers tests/fixtures/reviewers.json` -> corpus-check OK; 50 corpus + 20 messy; reviewer references resolve.
- Corpus/golden integration -> 2 suites, 25 tests passed.
- D-27 veto + D-22 save/library + D-24 cook-log integration -> 3 suites, 17 tests passed.
- Deterministic web readiness/review/method/library/cook-log tests -> 6 suites, 69 tests passed.
- `scripts/regression-gates.sh` -> `RESULT: regression gates PASS`.
- Safety configuration used: `OCR_PROVIDER=disabled`, `LLM_PROVIDER=disabled`,
  `MODEL_PROVIDER=disabled`. No DeepSeek or other external AI request was made.

### Findings and decision

- The repository is pilot-ready for deterministic setup and local rehearsal.
- The actual pilot environment is BLOCKED until the live AI prerequisite is available;
  PaddleOCR was not selected as an unapproved substitute.
- D-28 remains **PENDING HUMAN PILOT**, not PASS.
- Q10 remains resolved and was not reopened.
- Exact resume point: obtain/run the real 20-user uncoached pilot and reviewer/
  persistence scenarios when API access is available, then execute A-28.

## D-28 final human-pilot gate attempt (2026-09-16)

- **Verdict: PENDING HUMAN EVIDENCE.** A-28 not executed. This is not a fabricated
  completion; it is the honest determination from the evidence gap matrix.
- **Live AI usage:** 0 DeepSeek calls, 0 retries, 0 failures. No live analysis, no
  OCR, no fresh timing run, no exploratory prompts.
- **Why zero calls:** each remaining criterion requires a real human (the 20-user
  cohort, the G3 chef reviewer, the two regional reviewers). Model calls cannot
  convert automated evidence into human evidence and would only consume credits.
- **Reused evidence:** Q10 golden-card benchmark, prior live photo-to-analysis,
  historical ~1m40s timing, golden 8/8, corpus 50+20, integration 25/25,
  D-27/D-22/D-24 17/17, web deterministic 69/69, regression gates PASS.
- **Open findings:** none new. The blocking gap is unchanged: no real participants
  are available in this environment to execute the uncoached protocol.
- **Exact resume point:** obtain and run the real 20-user uncoached pilot, the G3
  chef pass, and real reviewer/persistence scenarios; then execute the A-28 closing sweep.

## D-28 autonomous pilot (2026-09-16)

- **Boundary:** autonomous/simulated evidence only; no human evidence claimed.
- Fresh deterministic regression re-run: golden 8/8, corpus OK, integration 42/42,
  web 69/69, regression gates PASS.
- 20-session guest matrix (live BFF): 20/20 complete; guest analyse correctly 422
  METHOD_REQUIRED; save/cook-log/last-cook persistence green; foreign session →
  404 (isolation).
- Authenticated browser flow (stub worker, 0 DeepSeek): full intake → review →
  method → analysis (complete ~13.8s) → station card + View 8/9 safeguards → save
  → library → cook log → reopen persistence all verified.
- Veto: `story_d27` 5/5 fresh; live API has no REVIEWER_EMAILS → veto denied (403).
- Finding F-1 (MINOR): STARTUP.md/dev.sh dev sign-in credential mismatch
  (`password` vs realm `Password@123`). Not fixed this run.
- D-28 remains PENDING HUMAN EVIDENCE. A-28 not executed.

## A-28 readiness sweep (2026-09-16)

- A-28 preflight only; full A-28 not executed (D-28 is PENDING HUMAN EVIDENCE).
- Blocker-class sweep re-run on the current commit: full integration 23/23 ·
  151/151 green (one-writer, INV-04/05/10/12/13/14, two-fenugreeks, XOR/claim,
  ownership escape, golden suite); regression-gates PASS; golden 8/8.
- OPEN DECISION register verified unchanged: Q1/Q3/Q5/Q6/Q7/Q11–Q17 open;
  Q2/Q4/Q8/Q9/Q10/Q18 resolved with recorded traces. No silent resolution.
- F-1 credential finding WITHDRAWN (dispatcher: `Password@123` authoritative; no
  credential-doc change).
- 0 DeepSeek calls. No known autonomous technical blocker; human acceptance
  evidence remains the only outstanding gate.

## D-30 preflight re-verification (2026-09-16)

- **Decision: D-30 ALREADY COMPLETE** (implementation + evidence in H-30). Not re-implemented.
- Fresh checks: `story_d30_shopping` 5/5 · shopping unit suites 16/16 · regression gates 2b/2c PASS (shopping one-writer + allergen_line column).
- Canonical scope verified against DISPATCH D-30 / BUILD_PLAN Track S: E1 list shape (one row per ingredient, two fenugreek rows, no headers, qualifiers visible), E2 have/need persistence across regeneration + reopen, E3 five-group market grouping, composite FK + C-28 soft-delete cleanup — all evidenced in H-30.
- Remaining gap: A-30 audit not executed. DISPATCH ledger row corrected from ☐ to ✅ (H-30; A-30 pending).
- 0 DeepSeek calls.

## Final production-readiness audit (2026-09-16)

- **Verdict: NO KNOWN TECHNICAL RELEASE BLOCKER.**
- Evidence re-executed: workspace typecheck exit 0; API build exit 0; worker build
  exit 0; `prisma migrate status` up to date; secret-pattern scan clean; no temp
  scripts; web→BFF-only and Intake-only line writes confirmed by grep; integration
  151/151 + regression gates PASS (prior this session).
- Findings: INFO-only — (1) nginx edge is health-only (no reverse proxy yet, no
  deployment pipeline exists); (2) untracked Q10 OCR artifacts; (3) Prisma major
  update notice; (4) production-relevant OPEN decisions Q7/Q11/Q12/Q15 deferred.
- No P0/P1 → no product-code changes.

### Q10 corpus determination — `ocr_sample_pics/` (2026-09-15)

- **Inventory:** 15 JPEGs `card-001..015.jpg` (~274×237 px). Content = generic
  EN/FR handwritten recipe cards (Spaghetti Bolognese, Chicken Curry, Tomato Soup,
  Crêpes, Ratatouille, Vegetable Stir-Fry, …). **Byte-identical (SHA256)** to the
  pre-existing unprovenanced `tests/fixtures/corpus_images/card-001..015.jpg`.
- **Provenance:** INSUFFICIENT — no manifest, no transcription, no source-of-record,
  no capture conditions, no reviewer, no D-04 correspondence. Classified as
  **user-supplied benchmark samples**, NOT provenance-valid evidence. Not silently
  relabeled.
- **Manifest:** NOT built — ground truth cannot be legitimately derived without
  source material or an independently verified transcription (a model reading
  would be circular).
- **Golden card:** ABSENT — none of the 15 is the canonical Kanyakumari Meen
  Kuzhambu card (no fish/drumstick/mango/coconut/fenugreek card). The D-28 golden
  benchmark cannot be completed from this corpus.
- **PaddleOCR runtime:** ABSENT (no Python interpreter, no `paddleocr`, no serving
  on `:8866`) → real benchmark NOT run; no metrics, no latency, no timing.
- **Decision:** Q10 stays OPEN; D-28 stays BLOCKED. Required to proceed: (1) a real
  PaddleOCR runtime; (2) provenance metadata or an independently verified
  transcription for the sample cards; (3) the canonical golden-card photo.

### Q10 technical benchmark — synthetic fixture through REAL PaddleOCR (2026-09-15)

- **Runtime (brought up via Docker):** `paddlecloud/paddleocr:2.6-cpu-latest`
  (paddleocr 2.6.1.0 · paddlepaddle 2.3.0 · python 3.7.13 · flask 2.2.5 ·
  PP-OCRv3 EN det/rec + ch cls), serving the production `POST /predict/ocr_system`
  contract on `:8866` — consumed by `PaddleOcrAdapter` (no vendor fields leak).
- **Fixture (SYNTHETIC, not real provenance):** `ocr_q10_fixture/
  kanyakumari_meen_kuzhambu.png` (SHA256 `6E8A573115F373F13CC325476F4905B34223
  8766B64DA7FD6B1CC12D6CE74817`) + manifest `C7461476D4232E703DFE59AE9131BFC806E
  AF50AEF2A9CA2CA86E8EC2E0163F0` (`fixture_status = synthetic_benchmark_fixture`,
  `provenance = synthetic`). Run via new `scripts/ocr-benchmark.js --q10-fixture`.
- **Metrics:** 25/26 reference lines preserved (96.15%) · **6/6 critical lines**
  (fish/drumstick/mango/coconut/both fenugreeks) · garlic absent · both fenugreek
  lines distinct · 0 low-confidence · 20 char-errors · ~4.3 s OCR latency ·
  `pass: true`.
- **Live browser** (chef, `OCR_PROVIDER=paddle`): upload → 27 draft lines, each
  "from card" at 90–100% confidence, no garlic, no `needs_review` (all ≥ 0.9) →
  "Ready to analyse. All lines are confirmed."
- **Observations:** the EN PP-OCRv3 model stays ≥ 0.9-confident while misreading
  handwriting (¼/½ → '/4, /2; "1" → "I"; Ginger → "Ginqer"; Salt → "Salf";
  "Drumstick – 1" → "Drumstick –") — an over-confidence signal relevant to the
  real-card benchmark and `needs_review` policy.
- **Decision:** TECHNICAL validation only. **Q10 stays OPEN; D-28 stays BLOCKED** —
  the canonical real-world provenance requirement is NOT satisfied by this
  synthetic fixture.

### Q10 REAL golden-card benchmark (2026-09-15) — FAILED

- **Card:** `ocr_q10/golden/kanyakumari_meen_kuzhambu.png` — the benchmark owner's
  REAL handwritten card (lined notebook page, blue ink). SHA256 `6989C633F8ABDBECE5
  5B3D714B63EE5BEE0686D2D5FE5E5CE866928943214C78`. Ground truth = independent
  transcription by the audit agent (from the image, NOT PaddleOCR), recorded in
  `kanyakumari_meen_kuzhambu.manifest.json` (26 reference lines; 6 critical; garlic
  forbidden).
- **Run:** production adapter unchanged — `resolveOcrAdapter → PaddleOcrAdapter`
  (runtime paddleocr 2.6.1.0, PP-OCRv3 EN). Metrics: **7/26 reference lines
  (26.92%); 0/6 critical lines**; garlic absent; 24 low-confidence lines; ~6.97 s
  latency; `pass: false`.
- **Failure evidence:** the cursive handwriting was garbled — `Fish - 500 g` →
  `Fi$h+50og`, `Drumstick - 1` → `Dxwmstick-|1`, `Fenugreek Seeds - 1/4 tsp` →
  `FenugreakSeed-1/9tsp`, `Fenugreek Powder - 1/2 tsp` → `FenugreokPowde-1tsp`,
  `Grated Coconut - 1/2 shell` → `GratelLoconut-1l/2shell`.
- **Safety net (correct behavior):** live browser upload → 26 draft lines, 24
  flagged `needs_review`, analysis BLOCKED ("24 lines need your attention") —
  INV-04 (flagged, never dropped) + INV-05 (block enqueue) hold even on bad OCR.
- **Decision:** the canonical golden-card critical-line assertion FAILS.
  **Q10 = OPEN; D-28 = BLOCKED.** photo→first-analysis not measurable (review
  blocks analysis). Remediation: a handwriting-capable model/config (documented
  PP-OCRv4 / paddleocr-3.x, or a handwriting-oriented recognition model) — then
  re-run this same benchmark.

### Q10 RESOLVED — DeepSeek Vision adapter (2026-09-15, dispatcher-authorized)

- **Change:** second provider behind the seam — `packages/ocr-adapter/src/deepseek.ts`
  (`DeepSeekVisionOcrAdapter`, `OCR_PROVIDER=deepseek`) + `errors.ts` (error taxonomy
  extracted from `index.ts` to break the provider↔registry circular import) +
  `deepseek.test.ts`. `index.ts`/`paddle.ts`/`scripts/ocr-benchmark.js` touch only the
  seam/imports. No API/web/Intake change.
- **Root cause fixed before the pass:** `deepseek-flash` is a reasoning model;
  `max_tokens` covers reasoning + answer. 4096 → empty `content` (false
  `OCR_UNREADABLE` 422). Default `DEEPSEEK_OCR_MAX_TOKENS=8192` (cap 32768) +
  truncation→doubled-budget retry (never a false unreadable).
- **Canonical benchmark (production seam, `OCR_PROVIDER=deepseek`):** **26/26
  reference, 6/6 critical, 0 char-errors, garlic absent, fenugreeks distinct, no
  fabrication, `confidence_available:false`, `pass:true`, ~14.7 s latency.**
- **Live browser (chef, API `OCR_PROVIDER=deepseek`, worker DeepSeek):** upload →
  26 "from card" draft lines, ALL flagged `needs_review` (conservative
  no-confidence policy), analysis blocked → cleared 26 flags → "Ready to analyse" →
  method pasted → Analyse → **"Analysis complete"** (`deepseek:deepseek-flash`) with
  the station card rendered (26 CARD lines). INV-04/INV-05 safety net verified live.
- **PaddleOCR regression:** still functional; still fails the handwritten card as
  previously recorded — no seam regression.
- **Verification:** `ocr-adapter` 24/24 · `story_d11_ocr` + `qg2_gates` 28/28 ·
  `regression-gates.sh` PASS · `--self-test`/`--golden-stub` PASS · lint/typecheck/
  build green.
- **Decision:** **Q10 = RESOLVED (DeepSeek Vision); D-28 = UNBLOCKED (not
  implemented).** PaddleOCR remains available behind the seam, not selected.
