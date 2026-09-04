# Recipe Systems — Agentic Dispatch Plan

**Status:** v1.1 — 31 units · 2026-09-04 · Each unit is one `BUILD_PLAN.md` §3/§4 work item, in the same order. v1.1 review fixes: D-31 could-have tail added (E6/F5/I5), migration-001 ownership clarified (D-01 owns 001, D-02 owns 002+), ledger story cells corrected (D-06, D-10). `BUILD_PLAN.md` is unchanged and remains the sequencing authority; this plan only turns its work items into runnable coding-agent prompts.
**Companions:** [BUILD_PLAN.md](BUILD_PLAN.md) (sequence + critical path) · [AUDIT.md](AUDIT.md) (paired verification) · [HANDOFF.md](HANDOFF.md) (done evidence) · [TEST_PLAN.md](TEST_PLAN.md) (quality gates QG1–QG5) · [SCAFFOLD.md](SCAFFOLD.md) (conventions) · [USER_STORIES.md](USER_STORIES.md) (requirements)

## Preflight (before D-01, once)

Dispatch prompts run from the **implementation monorepo root**, not from this documentation repo. The orchestrator (human or agent) must first:

1. Create a fresh implementation repository (empty, git-initialized).
2. Copy this entire documentation repo into it at `./docs/` (excluding `.git/`) — SCAFFOLD §1: "`docs/` copies over verbatim at kickoff."
3. Run every dispatch prompt from the implementation repo root.

**Guard (in every session): if `docs/SCAFFOLD.md` does not exist relative to the working directory, STOP and ask for the correct repository — do not improvise a layout and do not build inside the documentation repo.**

## How to use this document

Each **dispatch unit** is one coding-agent session unless its header says otherwise. Feed the unit's prompt to the agent **verbatim** — every prompt is self-contained: it names the documents to read, the exact deliverables, the non-goals, and the done criteria. Do not merge units into one session; the boundaries are where context resets safely.

Rules that apply to **every** unit (the prompts assume them):

1. The agent works in the implementation monorepo (layout per SCAFFOLD §1) with this documentation repo vendored at `docs/`. **Never modify anything under `docs/`.** A needed change to a source document is a reviewed patch outside any dispatch session (SCAFFOLD §7).
2. Conventions are binding: SCAFFOLD §6 (UUIDv4 IDs, snake_case wire format, decimal-string amounts, error envelope, story-ID test-file naming, CI order). The no-invention rule is binding everywhere: analysis output may reference only ingredients in the captured structured recipe, or mark them ABSENT (ADR §6, INV-10); View 8 never writes "safe" (INV-13); View 9 never writes a point-kcal when inputs are ranges (INV-14).
3. One-writer rule (ADR §2): the Analysis worker is the only writer of `analysis_*`; the Admin/reference-data module is the sole writer of `dietary_*`/`nutrition_*` (Track R working assumption covers `ingredient_dictionary`/`ingredient_alias` per Q5); Prisma owns ALL Postgres DDL (SCAFFOLD §2).
4. **Git protocol:** before writing any code, record `git rev-parse HEAD` as `BASE_SHA` in the HANDOFF entry. Commit only this unit's changes (no unrelated formatting or dependency churn) and record the final `COMMIT_SHA`. The audit diffs `BASE_SHA..COMMIT_SHA`.
5. **Verification:** where a done criterion says "CI passes", run the repo's CI steps locally when the hosted CI is unavailable, and record its output. Never claim remote CI success without a link/run id.
6. Done means: code + tests passing + the unit's done-criteria checklist demonstrably true + a `HANDOFF.md` entry appended using the exact template in HANDOFF.md §1.
7. After each unit, run the paired audit (AUDIT.md A-XX) with a **different** agent before dispatching the next **dependent** unit (parallel tracks don't wait on each other's audits).
8. **Quality gates (TEST_PLAN.md §2) are binding on every unit:** coverage floors (QG1) enforced in CI; the FULL cumulative suite + `scripts/regression-gates.sh` run on every unit, never just the unit's own tests (QG2); any measured perf criterion records its baseline in `.perf-baselines.json` and CI asserts it thereafter (QG3); the fault-matrix cells TEST_PLAN QG4 assigns to a unit are done criteria for that unit; test data comes from the deterministic tiers in QG5 (failing tests name their fixture).
9. **OPEN DECISION rule:** Q1–Q17 (SCAFFOLD §7) are open. A unit gated on one may build to the documented working assumption only where BUILD_PLAN says so (Q5, Q8), must leave a labeled seam, and must never resolve the decision in code. A decision that changes a phase's inputs re-runs that phase's gates (TEST_PLAN §5). Flag every assumption in the HANDOFF entry.

## Dispatch ledger

| Unit | BUILD_PLAN work item | Phase/Track | Stories (§6 ledger) | Depends on | Prompt | Status |
|---|---|---|---|---|---|---|
| D-01 | P0-1 | P0 — Foundation | G1 (CI harness) | — | ✅ below | ☐ |
| D-02 | P0-2 | P0 | — | D-01 | ✅ below | ☐ |
| D-03 | P0-3 | P0 | G1 | D-01 | ✅ below | ☐ |
| D-04 | P0-4 | P0 | — | D-01 | ✅ below | ☐ |
| D-05 | P0-5 | P0 | — (gates P3) | D-01 | ✅ below | ☐ |
| D-06 | P1-1 | P1 — Identity & account | A1, A2 (enabled; implemented in D-07/D-08) | D-05 (P0 exit) | ✅ below | ☐ |
| D-07 | P1-2 | P1 | A1 | D-06 | ✅ below | ☐ |
| D-08 | P1-3 | P1 | A2 | D-07 | ✅ below | ☐ |
| D-09 | P1-4 | P1 | A1, A2 (ownership) | D-07 | ✅ below | ☐ |
| D-10 | P2-1 | P2 — Intake | B1, B2, B5 (form path) | D-08, D-09 | ✅ below | ☐ |
| D-11 | P2-2 | P2 | B2 | D-10 | ✅ below | ☐ |
| D-12 | P2-3 | P2 | B3 | D-11 | ✅ below | ☐ |
| D-13 | P2-4 | P2 | B4 | D-12 | ✅ below | ☐ |
| D-14 | P2-5 | P2 | B1–B4 (enqueue gate) | D-11 | ✅ below | ☐ |
| D-15 | P3-1 | P3 — Analysis core | C1, C2, C4 | D-14, D-05 | ✅ below | ☐ |
| D-16 | P3-2 | P3 | C1, C2, C4 | D-15 | ✅ below | ☐ |
| D-17 | P3-3 | P3 | — (worker) | D-16 | ✅ below | ☐ |
| D-18 | P3-4 | P3 | C1, C2 (1–4), C4 | D-16 | ✅ below | ☐ |
| D-19 | P4-1 | P4 — Analysis complete | C2 (5–9), H2, I1, I2, H6, I6 | D-18, D-29 | ✅ below | ☐ |
| D-20 | P4-2 | P4 | C3, C5 | D-19 | ✅ below | ☐ |
| D-21 | P4-3 | P4 | H6, I6 | D-19 | ✅ below | ☐ |
| D-22 | P5-1 | P5 — Save, shop, print | D1, D2, D6 | D-21, D-30 | ✅ below | ☐ |
| D-23 | P5-2 | P5 | E4, E5, H4 | D-22, D-30 (Q2 gate) | ✅ below | ☐ |
| D-24 | P6-1 | P6 — Cook loop | F1, F2, F6 | D-23 | ✅ below | ☐ |
| D-25 | P7-1 | P7 — Hardening & pilot | B6, C6, C7, D3, D4, D5 | D-24, D-29 | ✅ below | ☐ |
| D-26 | P7-2 | P7 | F3, F4, H1, H3, H5, I3, I4 | D-24 | ✅ below | ☐ |
| D-27 | P7-3 | P7 | G2 (veto workflow) | D-25 | ✅ below | ☐ |
| D-28 | P7-4 | P7 | G3 (pilot gate) | D-24, D-27 | ✅ below | ☐ |
| D-29 | Track R | Track R — Reference data | H7, I7 | D-01 (runs wks 1–8) | ✅ below | ☐ |
| D-30 | Track S | Track S — Shopping data | E1, E2, E3 | D-14 (runs wks 8–9, feeds P5) | ✅ below | ☐ |
| D-31 | P7 could-haves | P7 tail (conditional) | E6, F5, I5 | D-23, D-24, D-26 (dispatch only if Must on weeks 9–10 is stable — Recipe_Systems §13) | ✅ below | ☐ |

Parallelism: Track R (D-29) runs alongside the spine from week 1. P1 units (D-06…D-09) run sequentially within weeks 3–4; P2 starts once D-08 (guest sessions) lands — the IdP choice (Q8) does not gate intake. After D-14, P3 units (D-15…D-18) run while D-30 (Track S, weeks 8–9) prepares shopping data; both feed P5. The critical path is D-01 → … → D-28 (P0→P7, BUILD_PLAN §2). D-31 (the could-have tail) dispatches only if the §13 condition holds — it is not on the critical path.

---

## D-01 — P0-1: Monorepo bootstrap & CI

**Session budget:** 1 session · **Depends on:** — · **Audit:** A-01

```text
You are bootstrapping the Recipe Systems implementation monorepo from its documentation repo.

READ FIRST: docs/SCAFFOLD.md (the authority for layout and conventions), docs/BUILD_PLAN.md §3 P0,
docs/TEST_PLAN.md §2 (the gates you scaffold), docs/Recipe_Systems_Tech_Stack_FINAL.md §20/§22 (CI, layout).

DELIVERABLES
1. Create the monorepo layout exactly per SCAFFOLD §1: apps/web (Next.js App Router, TypeScript,
   Tailwind + shadcn/ui), apps/api (NestJS), apps/analysis-worker (separate process),
   packages/{domain,schemas,database,llm-adapter,ocr-adapter,rendering}, tests/{fixtures,assertions,
   integration}, infra/{docker,keycloak,nginx,deployment}, .github/workflows, docs/ (this repo, copied verbatim).
2. packages/database: Prisma initialized; migration 001 contains ONLY `CREATE EXTENSION IF NOT EXISTS btree_gist`
   (SCAFFOLD §2, ERD §9). D-01 owns migration 001; the schema DDL arrives in D-02 as migrations 002+.
3. CI (GitHub Actions) per SCAFFOLD §6 order: lint → typecheck → unit → golden fixture + grounding
   validation → `prisma migrate deploy` on ephemeral Postgres → integration → build (Tech Stack §20).
4. scripts/verify-local.sh: the same steps in the same order locally, non-zero on failure (global rule 5).
5. Test-gate scaffolding per TEST_PLAN §2: scripts/regression-gates.sh implementing the QG2 static gates
   (one-writer greps, render read-only grep, DDL-outside-Prisma grep, provenance-tag check, disclaimer
   checks, golden-test-present check); coverage thresholds per QG1 configured in each package's tooling;
   an empty .perf-baselines.json at the root with the QG3 schema and a CI perf job asserting it (no-op while empty).
6. Compose (SCAFFOLD §5): default profile = postgres + minio + nginx; `identity` profile adds Keycloak
   (defined but NOT started before P1 — do not start Keycloak yet); `observability` profile reserved
   per Tech Stack §17. Dev secrets via .env.example; production uses the managed secrets store (Tech Stack §16).

NON-GOALS: no business logic, no intake, no analysis, no auth flows beyond skeletons, no Keycloak start.

DONE CRITERIA (record evidence in HANDOFF.md):
- `docker compose up -d` (default profile only) brings up postgres, minio, nginx — all healthy.
- `npx prisma migrate deploy` green on an empty Postgres; re-run is a no-op.
- CI workflow passes end-to-end on the bootstrap commit; scripts/verify-local.sh reproduces it locally.
- Each QG2 static gate provably fires: plant one violation per gate in a scratch path, prove it is
  caught, remove the plants. Coverage thresholds and the perf job are configured and enforced.
- git protocol: HANDOFF.md records BASE_SHA/COMMIT_SHA; diff contains only the declared deliverables.
```

## D-02 — P0-2: ERD v13 migrations

**Session budget:** 1 session · **Depends on:** D-01 · **Audit:** A-02

```text
You are materializing the ERD v13 schema as Prisma migrations.

READ FIRST: docs/Recipe_Systems_ERD_FINAL.md §3 (diagram), §5–§10 (dictionary), §12 (the migration spec —
applied verbatim), docs/SCAFFOLD.md §2 (Prisma owns ALL DDL), docs/Recipe_Systems_Architecture_Decision_FINAL_V5.md §22
(no ERD v13 changes required by the ADR).

DELIVERABLES
1. All 24 ERD v13 tables modeled; ERD §12's SQL applied verbatim as raw-SQL migrations where Prisma
   cannot express a construct: CHECK constraints (chk_recipe_owner_xor, chk_ocr_confidence_range,
   chk_restriction_item_type_matches_value), partial unique indexes (uq_analysis_current,
   uq_recipe_ingredient_line), `EXCLUDE USING gist` overlap protections, and the
   trg_line_soft_delete_cleans_shopping_state trigger (C-28).
2. Migrations 002+ carry the schema DDL. Migration 001 is D-01's extension-only migration — verify it
   opens with `CREATE EXTENSION IF NOT EXISTS btree_gist` (ERD §9) and contains nothing else. D-01 owns
   001; this unit owns the schema DDL from 002 onward.
3. CI runs `prisma migrate deploy` on ephemeral Postgres in the SCAFFOLD §6 order.

NON-GOALS: no application code beyond the migration files; no reference-data seed (D-29); no ERD v14
changes — any needed schema change is an ERD revision outside this session.

DONE CRITERIA:
- Fresh deploy applies all 24 tables + every constraint/index/trigger; `prisma migrate diff` shows zero drift.
- Each CHECK constraint fires on a violating row; the exclusion constraint rejects an overlapping
  effective-dated row; the soft-delete trigger cleans shopping state (C-28 scenario).
- CI green on the migration commit; HANDOFF.md records both SHAs.
```

## D-03 — P0-3: Golden fixture scaffold

**Session budget:** 1 session · **Depends on:** D-01 · **Audit:** A-03

```text
You are scaffolding the golden fixture that never leaves CI (G1, Recipe_Systems §3.8).

READ FIRST: docs/Recipe_Systems_ERD_FINAL.md §16 (fixture files + the 8 invariants),
docs/Recipe_Systems.md §15 (acceptance scene), §12 G1, docs/TEST_PLAN.md §1 mechanism 3.

DELIVERABLES
1. tests/fixtures/golden_kanyakumari_card.json — the golden Kanyakumari card input (Fish 500g,
   Drumstick 1, Mango 1/2, Half Shell coconut, both fenugreeks, no garlic — Recipe_Systems §12 B2).
2. tests/assertions/golden_recipe_assertions.yaml — all 8 ERD §16 invariants as executable assertions,
   wired into CI as a blocking job in the SCAFFOLD §6 order (golden fixture + grounding validation step).
3. The §15 acceptance scene (Priya) documented as the day-in-the-life e2e scenario (TEST_PLAN §1
   mechanism 3) — the assertions scaffold, not yet the implementation.

NON-GOALS: no analysis code; assertions fail cleanly until D-16/D-18 make them pass (state this in CI
config comments — the scaffold is the deliverable).

DONE CRITERIA:
- Both fixture files exist with the exact names/paths SCAFFOLD §1 and TEST_PLAN §1 promise.
- The 8 invariants are all encoded (both fenugreeks; no ginger/garlic; family not generic; coriander
  blind-spot note; station card on inferred method; View 8 flags + no "safe"; View 9 band + sodium
  unknown + no point-kcal) — audit A-03 cross-checks the list against ERD §16.
- CI runs the golden job on every PR from this commit forward; verify-local.sh includes it.
```

## D-04 — P0-4: 50-recipe corpus + reviewers

**Session budget:** 1 session · **Depends on:** D-01 · **Audit:** A-04

```text
You are starting the week 1–2 "Spec and kitchen" deliverable: the fixture corpus and the reviewer pool.

READ FIRST: docs/Recipe_Systems.md §13 (week 1–2 row: "Lens contracts frozen. 50-recipe fixture corpus
started. Reviewers signed"), §14 (week-12 go: twenty other messy recipes), docs/TEST_PLAN.md QG5
(deterministic tiers; the 20 messy set is a separate named set by convention — the source does not
state whether they live inside or outside the 50).

DELIVERABLES
1. tests/fixtures/corpus/: 50 deterministic recipe fixtures (the corpus TEST_PLAN QG5 tiers use),
   starting with the golden card; versioned, one file per fixture.
2. tests/fixtures/messy_20/: the twenty messy week-12 recipes as a separate named set (QG5 convention).
3. Reviewer roster: two regional reviewers on contract (one Tamil Nadu/Kanyakumari, one Kerala —
   Recipe_Systems §12 G2), with contact/availability recorded outside the repo; their review workflow
   lands in D-27.

NON-GOALS: no analysis code; fixtures are data. Do not fabricate reviewer names — record slots/process
if the people are not yet signed.

DONE CRITERIA:
- Corpus directory exists with the seeded start of 50 deterministic fixtures (corpus completion is a
  P7 gate — record how many exist now in HANDOFF.md).
- messy_20/ is a separate, named set (QG5 convention) — never merged into the corpus count.
- Reviewer process documented; BUILD_PLAN §7.9 (reviewers are people with calendars) tracked.
```

## D-05 — P0-5: Nine-view JSON schemas frozen

**Session budget:** 1 session · **Depends on:** D-01 · **Audit:** A-05

```text
You are freezing the product's contract layer: the nine-view JSON schemas (BUILD_PLAN §1.2 — contracts
before generators; the source's week 1–2 deliverable "lens contracts frozen", Recipe_Systems §13).

READ FIRST: docs/Recipe_Systems.md §3 (the nine principles — esp. §3.1 source-of-truth, §3.2 tagged
claims, §3.4 refuse-empty-method, §3.7 no certificates), §6 (nine views worked example), §16,
docs/Recipe_Systems_ERD_FINAL.md §15.8 (exact JSON contracts open question pointer),
docs/Recipe_Systems_Architecture_Decision_FINAL_V5.md §6.

DELIVERABLES
1. packages/schemas: one JSON schema per view (view payloads, claim tags, identification block,
   station-card sections — BUILD_PLAN P0-5), plus the shared envelope.
2. Home/chef system-prompt contracts: the input/output shape prompts must obey (P3 consumes these).
3. Freeze record: a `CHANGE_LOG.md` entry listing what froze and the review that approved it.

NON-GOALS: no prompt or grounding code (P3); no UI. ERD §15.8 (exact JSON contracts) is the open
question this freeze answers for the pilot — record the freeze, do not claim it closes Q-register items
it does not close.

DONE CRITERIA:
- All nine schemas + station-card sections exist in packages/schemas and validate against the §6
  worked example (hand-encoded instance documents per view).
- Every claim tag in a schema is one of CARD | METHOD | INFERRED | ABSENT | UNKNOWN | ASSUMED (§3.2).
- The freeze is recorded; P3's prompts consume these files — nothing later may edit them without a
  reviewed schema change (that review is the pilot's contract-change process).
```

## D-06 — P1-1: IdP setup (Q8 working assumption)

**Session budget:** 1 session · **Depends on:** D-05 (P0 exit) · **Audit:** A-06

```text
You are setting up the pilot identity provider. OPEN DECISION Q8: Tech Stack §1/§14/§25 recommend
Auth0; Keycloak is this plan's working assumption only (SCAFFOLD §3, BUILD_PLAN §5). This unit is
dispatched at P1 (weeks 3–4) — NOT before (do not start Keycloak yet).

READ FIRST: docs/SCAFFOLD.md §3 (identity mechanics), §5 (identity compose profile),
docs/BUILD_PLAN.md §5 (IdP position table), docs/Recipe_Systems_Tech_Stack_FINAL.md §1/§14/§25.

DELIVERABLES (Keycloak path under the Q8 assumption; Auth0 path = the same boundary, tenant config)
1. Keycloak realm `recipesystems` + realm export committed in infra/keycloak/ (the compose `identity`
   profile imports it). Realm owns credential lifecycle, password reset, email verification, OAuth/SSO,
   MFA — the Tech Stack §14 IdP list (BUILD_PLAN §5 "Role" row).
2. Auth0 tenant configuration documented as the fallback path if Q8 lands there instead (BUILD_PLAN
   P1-1: "Auth0 tenant configuration if Q8 lands there instead").
3. Leave the OIDC boundary abstract behind an adapter seam: app code consumes OIDC claims, never
   Keycloak-specific APIs directly — this is the "either way" seam BUILD_PLAN §7.5 demands.

NON-GOALS: no `account`-table work (D-07), no guest sessions (D-08), no application authorization
(D-09 — the app still owns it, ADR §19). Do not start Keycloak before P1.

DONE CRITERIA:
- `docker compose --profile identity up -d` at P1 brings up Keycloak with the realm imported;
  realm export diff-committed.
- A test user can authenticate; the OIDC boundary issues the claims the adapter consumes.
- The Q8 seam is demonstrable: swapping the adapter's provider config is a config change, not code.
- HANDOFF.md records the Q8 assumption explicitly (global rule 9).
```

## D-07 — P1-2: OIDC cookies + account creation

**Session budget:** 1 session · **Depends on:** D-06 · **Audit:** A-07

```text
You are building the account foundation (A1).

READ FIRST: docs/Recipe_Systems.md §12 A1, docs/Recipe_Systems_ERD_FINAL.md `account` (§5),
docs/Recipe_Systems_Tech_Stack_FINAL.md §14 (cookie mechanics), §15 (CSRF),
docs/Recipe_Systems_Architecture_Decision_FINAL_V5.md §19/§20.

DELIVERABLES
1. OIDC → secure HTTP-only cookie session (Secure, HttpOnly, SameSite, expiration — Tech Stack §14);
   CSRF protection appropriate to the cookie architecture (Tech Stack §15).
2. `account` creation on first sign-in: `preferred_mode` (default home), `label_pack` (US/EU) —
   BUILD_PLAN P1-2 / ERD `account`.
3. Register → empty library (A1 TC-01); save-while-signed-out → sign-in resumes save (A1 TC-02 —
   the resume-save seam integrates with D-08/D-22; stub the seam where the library does not yet exist).

NON-GOALS: guest sessions/claim (D-08), ownership enforcement sweep (D-09), IdP internals (D-06).

DONE CRITERIA:
- Register/sign-in works end-to-end (A1 story suite `story_a1_create_account.test.ts` green).
- Cookies carry Secure/HttpOnly/SameSite as specified; CSRF tokens verified on state-changing routes.
- Resume-save path demonstrably hands off to the save flow (D-22 seam documented).
```

## D-08 — P1-3: Guest sessions + claim transaction

**Session budget:** 1 session · **Depends on:** D-07 · **Audit:** A-08

```text
You are building the anonymous flow (A2) — the edge P2 depends on (BUILD_PLAN §2: "P2 depends on P1's
guest sessions only").

READ FIRST: docs/Recipe_Systems.md §12 A2, docs/Recipe_Systems_ERD_FINAL.md `guest_session`,
`recipe.guest_session_id`, XOR CHECK (ERD §5, §13), docs/Recipe_Systems_Architecture_Decision_FINAL_V5.md §5.

DELIVERABLES
1. Guest sessions: unguessable UUID identifier, scoped to one guest session, expiry cleanup
   (SCAFFOLD §3; TTL value is Q11 — use a labeled pilot default, HANDOFF-documented).
2. A2 claim transaction: idempotent; the guest row is preserved as audit (BUILD_PLAN P1-3);
   `chk_recipe_owner_xor` holds throughout (INV-02).
3. Guest can ingest and see analysis (A2 TC-01); save migrates the current recipe onto a new
   account (A2 TC-02) — the analysis side arrives in P2/P3; this unit ships the session + claim spine.

NON-GOALS: intake UI (P2), ownership sweep (D-09), IdP internals.

DONE CRITERIA:
- Guest ingest → analysis (stubbed render acceptable until P3; the pipeline path must exist).
- Claim: sign-up mid-session → recipe moves to the account; guest row preserved as audit;
  claim is idempotent (double-submit safe); XOR CHECK provably holds (test violates then re-satisfies).
- Expiry cleanup job exists (schedule = Q11 pilot default, documented in HANDOFF.md).
```

## D-09 — P1-4: Ownership enforcement

**Session budget:** 1 session · **Depends on:** D-07 · **Audit:** A-09

```text
You are enforcing ownership on every recipe/account/guest read and write (INV-17).

READ FIRST: docs/Recipe_Systems_Architecture_Decision_FINAL_V5.md §20 (ownership/authorization, INV-17),
docs/Recipe_Systems_ERD_FINAL.md §5 (XOR invariant INV-02), docs/SCAFFOLD.md §3 (guest scoping).

DELIVERABLES
1. Ownership check on every recipe/account/guest read and write path: recipes to their owner account
   or guest session; accounts to their holder; guests to their session (SCAFFOLD §3, ADR §20).
2. XOR invariant (INV-02) enforced at the data layer (CHECK chk_recipe_owner_xor exists from D-02;
   this unit makes every write path respect it) and covered by tests.
3. Middleware/guard pattern applied uniformly (grep-auditable: every controller route carries its guard).

NON-GOALS: no new endpoints beyond what P1 needs; no intake logic.

DONE CRITERIA:
- Cross-account and cross-guest access attempts on every P1 surface return not-found/forbidden — no
  existence leaks (audit A-09 probes this).
- `chk_recipe_owner_xor` holds under a test that tries every violation shape.
- Grep shows no unguarded mutating route (A-09 re-checks).
```

## D-10 — P2-1: Raw intake rows + photo pipeline

**Session budget:** 1 session · **Depends on:** D-08, D-09 · **Audit:** A-10

```text
You are building the immutable raw-intake layer (B1, B2).

READ FIRST: docs/Recipe_Systems.md §12 B1/B2, docs/Recipe_Systems_ERD_FINAL.md `recipe_input`
(raw event, C-41), `recipe_ingredient_line` (corrected object), docs/Recipe_Systems_Architecture_Decision_FINAL_V5.md §3
(photo → object storage, URI only).

DELIVERABLES
1. `recipe_input` immutable raw rows for paste/photo/form; paste path accepts mixed units, "to taste,"
   "as required," vernacular names (B1); photo path stores the image in object storage, URI only (ADR §3).
2. The corrected object `recipe_ingredient_line` write path (draft lines) — the one-writer answer for
   Q4 (SCAFFOLD §7) must be answered before draft lines ship (BUILD_PLAN §1.3); if Q4 is still open,
   STOP this deliverable and raise it — do not pick a writer silently.
3. Two-fenugreek preservation on the golden paste (B1 TC-02).

NON-GOALS: OCR (D-11), parse-review UI (D-12), method attach (D-13), enqueue gate (D-14).

DONE CRITERIA:
- Golden card pasted → raw `recipe_input` row + draft lines; two fenugreek lines distinct.
- Photo uploaded → object-storage URI stored; no image blob in Postgres; URI never dangling
  (object-storage failure = no URI persisted — TEST_PLAN QG4 cell).
- Raw rows immutable: no UPDATE path exists on `recipe_input` (grep-provable).
```

## D-11 — P2-2: OCR adapter + low-confidence flagging

**Session budget:** 1 session · **Depends on:** D-10 · **Audit:** A-11

```text
You are building OCR intake (B2).

READ FIRST: docs/Recipe_Systems.md §12 B2, docs/Recipe_Systems_Tech_Stack_FINAL.md §11 (OCR adapter,
provider = Q10 — GCV candidate per BUILD_PLAN P2-2; benchmark in the harness before final selection),
docs/Recipe_Systems_ERD_FINAL.md §5 (`ocr_text`, `needs_review`, `ocr_confidence`),
docs/SCAFFOLD.md §3 (OCR orchestrated by Intake, not by the worker — ADR §2 Decision 3; Q3 diagram patch).

DELIVERABLES
1. Provider-neutral OCR adapter package (packages/ocr-adapter); vendor responses normalized before
   they enter the domain (SCAFFOLD §3); real provider behind the adapter, mocked in CI (TEST_PLAN §4).
2. OCR draft visible before analysis (B2 TC-02): `ocr_text` on draft lines; low-confidence lines get
   `needs_review = TRUE` — flagged, never dropped (INV-04).
3. Golden photo fixture: Fish 500g, Drumstick 1, Mango 1/2, Half Shell coconut, both fenugreeks, no
   garlic (B2 TC-03) — assert against the OCR output with the real-card corpus (D-04) in the
   benchmark harness only; CI uses the deterministic stub.

NON-GOALS: parse-review editing (D-12), analysis, provider selection (Q10 — this unit builds the
adapter seam; the benchmark harness in weeks 1–4 feeds the decision, BUILD_PLAN §7.3).

DONE CRITERIA:
- Photo → OCR draft visible before any analysis runs.
- Low-confidence lines flagged TRUE, never dropped (INV-04 test).
- OCR timeout/down → `recipe_input` + photo preserved, intake retryable (QG4 cell, Tech Stack §21).
- Adapter seam: swapping providers is configuration, not code (QG4 + benchmark harness compatible).
```

## D-12 — P2-3: Parse review

**Session budget:** 1 session · **Depends on:** D-11 · **Audit:** A-12

```text
You are building the parse-review editor (B3).

READ FIRST: docs/Recipe_Systems.md §12 B3, docs/Recipe_Systems_ERD_FINAL.md §5 (mutable lines;
recipe_input stays untouched as raw record), docs/Recipe_Systems_Architecture_Decision_FINAL_V5.md §3.

DELIVERABLES
1. Edit/add/delete/split/merge on draft lines — including splitting the wrapped chilli/coriander line
   (B3, §15 acceptance scene); mark non-ingredient headers; sense confirmation reads the dictionary
   D-29 curates (Q5 working assumption — the admin module writes the dictionary; this unit reads).
2. The corrected object is what analysis reads (B3 TC-03) — expose the canonical read path P3 consumes.
3. Every edit is versioned/audited: concurrent stale edits rejected on version/`updated_at` with
   reload/merge (QG4 "Concurrent edit" cell, ERD §13).

NON-GOALS: method attach (D-13), analysis, OCR internals.

DONE CRITERIA:
- Golden card photo → split the wrapped chilli/coriander line → corrected object reflects the split;
  raw `recipe_input` byte-unchanged throughout (B3 TC-03).
- Headers marked non-ingredient never enter the ingredient object (B3 TC-02).
- Two-fenugreek lines survive review editing intact (golden invariant).
- Stale-edit rejection works (QG4 cell: version/updated_at conflict → reload/merge, no lost update).
```

## D-13 — P2-4: Method attach

**Session budget:** 1 session · **Depends on:** D-12 · **Audit:** A-13

```text
You are building method attach (B4).

READ FIRST: docs/Recipe_Systems.md §12 B4, §3.4 (refuse empty method — Views 3/7 INCOMPLETE),
docs/Recipe_Systems_ERD_FINAL.md §5 (`method_text`, `method_source_tag`, `method_inferred_source`).

DELIVERABLES
1. Method entry/attach on the corrected object: optional (B4).
2. No method → either list-only analysis or a matched family method offered, tagged INFERRED with the
   named source (CDK 1669 / Mrs. Anitha in the §15 scene). List-only → Views 3 and 7 INCOMPLETE —
   never fabricated (B4 TC-03, §3.4).
3. The INFERRED-method provenance flows into C4's claim machinery (claim tag + source_reference).

NON-GOALS: analysis execution (P3), station card (P4).

DONE CRITERIA:
- Method attached → object carries `method_text` + source tag.
- No method + accepted matched family method → INFERRED tag with named source; Views 3/7 are NOT
  INCOMPLETE in this case.
- No method + list-only → Views 3/7 render INCOMPLETE (asserted in P3's view tests; this unit proves
  the flag that drives it).
```

## D-14 — P2-5: needs_review enqueue gate

**Session budget:** 1 session · **Depends on:** D-11 · **Audit:** A-14

```text
You are building the intake completion gate (INV-05).

READ FIRST: docs/Recipe_Systems_Architecture_Decision_FINAL_V5.md §3 (INV-05: analysis enqueue blocked
while any active line has needs_review = TRUE), docs/BUILD_PLAN.md P2-5.

DELIVERABLES
1. Enqueue guard: while any active line has `needs_review = TRUE`, analysis refuses to enqueue
   (INV-05) — the user sees what blocks them, line by line.
2. The corrected-object completeness check P3's enqueue re-uses (single implementation, not two).
3. Unit covers the golden photo path: flagged lines → blocked; review clean → enqueuable.

NON-GOALS: worker execution (D-17), analysis.

DONE CRITERIA (BUILD_PLAN P2 exit):
- Golden card photographed → flagged lines → corrected object; analysis refuses to enqueue until
  review is clean.
- Clearing the last flagged line unblocks enqueue immediately.
- The guard reads the canonical flag only (no parallel state that can drift).
```

## D-15 — P3-1: Prompt specs + prompt_version

**Session budget:** 1 session · **Depends on:** D-14, D-05 · **Audit:** A-15

```text
You are writing the analysis prompt layer against the frozen schemas (P3 consumes the P0-5 schemas).

READ FIRST: docs/BUILD_PLAN.md P3 (inputs: nine-view schemas frozen at P0), P3-1,
docs/Recipe_Systems.md §6 (worked example — the prompt contract's acceptance data), §3,
docs/Recipe_Systems_ERD_FINAL.md `analysis.prompt_version`, docs/Recipe_Systems_Tech_Stack_FINAL.md §10
(provider-neutral LLM adapter; provider = Q9 — benchmark in weeks 1–4).

DELIVERABLES
1. Prompt spec per view (1–9) + home/chef system prompts, all validated against the frozen
   packages/schemas: prompt outputs must parse into the schemas; violations = regenerate path (QG4
   "invalid schema" cell).
2. `prompt_version` persisted per analysis (ERD `analysis.prompt_version`) — every analysis run is
   reproducible against the prompt version it used.
3. LLM adapter seam (packages/llm-adapter): mocked in CI, real provider in the benchmark harness only
   (TEST_PLAN §4); provider choice stays Q9 (this unit builds the seam, never the selection).

NON-GOALS: grounding validator (D-16), worker (D-17), views UI (D-18), provider selection.

DONE CRITERIA:
- Every view prompt validated against its frozen schema on the §6 worked example (hand-checked
  instance documents in the suite).
- Home and chef system prompts produce different mode outputs against the same recipe.
- prompt_version recorded per run; re-running the same version is deterministic on a stubbed model.
```

## D-16 — P3-2: Grounding validator

**Session budget:** 1 session · **Depends on:** D-15 · **Audit:** A-16

```text
You are building the no-invention enforcement layer (the load-bearing rule of the whole product).

READ FIRST: docs/Recipe_Systems_Architecture_Decision_FINAL_V5.md §6 (grounding validator, INV-10),
docs/Recipe_Systems.md §3.1 (source of truth), §3.4, docs/BUILD_PLAN.md P3-2.

DELIVERABLES
1. Grounding validator: every claim's reference resolves against the captured structured recipe
   lines only; unresolved ingredient reference → ABSENT marking; regenerate-once; still failing →
   view INCOMPLETE — never current, never invented (ADR §6, INV-10).
2. The ABSENT rule: analysis output may reference only captured ingredients or mark them ABSENT
   (SCAFFOLD §6 no-invention, INV-10).
3. Wire the validator into the P3 prompt pipeline so every view output passes through it (single choke point).

NON-GOALS: worker plumbing (D-17), UI (D-18).

DONE CRITERIA:
- Golden fixture passes: every claim resolves or is ABSENT; no ginger/garlic anywhere (golden invariants).
- Planted hallucination fixtures: invented ingredient → caught; regenerate → still bad → INCOMPLETE
  (QG4 "Grounding" cell).
- Grounding failure surfaces as view INCOMPLETE — never as current output (INV-10).
```

## D-17 — P3-3: Analysis worker

**Session budget:** 1–2 sessions (checkpoint below) · **Depends on:** D-16 · **Audit:** A-17

```text
You are building the analysis worker — the only writer of analysis_* (ADR §2).

READ FIRST: docs/Recipe_Systems_Architecture_Decision_FINAL_V5.md §2/§5/§14 (worker boundary, idempotency
INV-11, retry), docs/Recipe_Systems_Tech_Stack_FINAL.md §9 (pg-boss), §13 (SSE via NOTIFY),
docs/BUILD_PLAN.md P3-3 (Q1 pending — captured input state; Q13 pilot defaults, revalidated at P7).

DELIVERABLES
1. Worker process (apps/analysis-worker): dequeues pg-boss jobs from Postgres (Tech Stack §9);
   idempotent job handling (INV-11, ADR §14); retry/backoff = Q13 pilot defaults (labeled, HANDOFF-
   documented, revalidated at P7).
2. Captured-input state per Q1: if Q1 is still open, use the worker/job-payload approach as the
   labeled working assumption with the ERD v14 seam documented — do not silently decide (BUILD_PLAN §7.2).
3. Progress flow: worker → Postgres NOTIFY → API → SSE → browser (Tech Stack §13); NOTIFY is a
   signal, never durable state (INV-16); SSE reconcile = reconnect-and-reload from Postgres.
4. Worker crash mid-job / duplicate delivery → converge on one analysis, never two currents
   (QG4 cell, INV-11).

SESSION CHECKPOINT (if two sessions): session 1 = job queue + idempotency + NOTIFY/SSE spine (tested);
session 2 = retry policy + failure modes + ops wiring. Commit + HANDOFF.md at the checkpoint.

NON-GOALS: prompt/grounding internals (D-15/D-16 — consume them), views UI (D-18).

DONE CRITERIA:
- Enqueued job → analysis rows written by the worker alone (one-writer grep clean).
- Duplicate delivery → single current analysis (INV-11 test).
- SSE: status change → browser update; dropped NOTIFY → reconnect + reload recovers (QG4 cell).
- Failed jobs never stuck at `generating` (BUILD_PLAN P3 exit).
- Q1/Q13 assumptions recorded in HANDOFF.md with the register IDs.
```

## D-18 — P3-4: Views 1–4 + home mode

**Session budget:** 1–2 sessions (checkpoint below) · **Depends on:** D-16 · **Audit:** A-18

```text
You are shipping the first half of the product surface: identification + Views 1–4 in home mode.

READ FIRST: docs/Recipe_Systems.md §6 (Views 1–4 worked example), §12 C1/C2/C4,
docs/Recipe_Systems_ERD_FINAL.md §6 (analysis data dictionary),
docs/BUILD_PLAN.md P3-4 (the View 2 coriander blind-spot is output, not a bug).

DELIVERABLES
1. Views 1–4 rendering from `analysis_*` rows (schemas from P0-5): View 1 ingredient-function,
   View 2 taste pillars (with the coriander blind-spot note — golden invariant), View 3 process,
   View 4 substitutions.
2. Identification (C1): family, one-line architecture, confidence, not-this neighbours, ABSENT
   family items.
3. Claim tags (C4): CARD/METHOD/INFERRED/ABSENT/UNKNOWN/ASSUMED visible; inferred method names its
   source; disagreement module shows the coriander case; UNKNOWN fields stay blank.
4. Home mode as the default presentation (C3's default side; mode toggle ships in P4).

SESSION CHECKPOINT (if two sessions): session 1 = Views 1–2 + identification; session 2 = Views 3–4 +
claims/disagreement. Commit + HANDOFF.md at the checkpoint.

NON-GOALS: Views 5–9 (D-19), chef mode/station card (D-20), disclaimers (D-21 — H6/I6 belong to their
views in P4).

DONE CRITERIA (BUILD_PLAN P3 exit):
- Golden fixture passes all 8 CI invariants (full assertions from D-03 green).
- Grounding failure → view INCOMPLETE, never current (INV-10).
- Two fenugreeks = two uses of one idea; coriander in View 1; View 2 records the blind spot.
- Home mode renders by default; failed jobs never stuck at `generating`.
```

## D-19 — P4-1: Views 5–9

**Session budget:** 1–2 sessions (checkpoint below) · **Depends on:** D-18, D-29 · **Audit:** A-19

```text
You are shipping the second half of the product surface: Views 5–9 (C2 rest, H2, I1, I2, H6, I6).

READ FIRST: docs/Recipe_Systems.md §6 (Views 5–9 worked example), §12 H2/I1/I2/H6/I6,
docs/Recipe_Systems_ERD_FINAL.md §9/§10 (dietary + nutrition dictionaries),
docs/BUILD_PLAN.md P4-1 (View 8 via `analysis_claim.allergen_id` against
dietary_allergen_definition/mapping; View 9 bands from nutrition_food_composition_*).

DELIVERABLES
1. View 5 (regional notes — the view G2 can veto), View 6, View 7 (process detail — INCOMPLETE when
   method absent), View 8 (dietary warnings against the versioned allergen mapping, H2), View 9
   (nutrition band, I1).
2. View 8 disclaimers (H6) and View 9 disclaimers (I6) on every surface — "Reads the card only…" /
   "Table estimate from stated assumptions…" verbatim.
3. Assumption editors (I2): fish class, coconut grams, oil tablespoons; edit recomputes the band.

SESSION CHECKPOINT (if two sessions): session 1 = Views 5–7; session 2 = Views 8–9 + assumption
editors + disclaimers. Commit + HANDOFF.md at the checkpoint.

NON-GOALS: chef mode/station card (D-20), print (D-23), profiles (D-26).

DONE CRITERIA:
- Views 5–9 render on the golden fixture; View 8 flags fish + mustard, coconut NOT filed as US major
  tree nut; View 9 is a band (1,300–2,200 kcal pot scale) with sodium Unknown — golden invariants.
- "safe" appears nowhere (INV-13 static + runtime checks); no point-kcal when inputs are ranges (INV-14).
- Assumption edit recomputes the band (I2).
- Disclaimers present verbatim on every View 8/9 surface (H6/I6).
```

## D-20 — P4-2: Chef mode + station card

**Session budget:** 1 session · **Depends on:** D-19 · **Audit:** A-20

```text
You are shipping chef mode and the station card (C3, C5).

READ FIRST: docs/Recipe_Systems.md §7 (chef mode spec), §8 (station card for this curry), §12 C3/C5,
docs/Recipe_Systems_ERD_FINAL.md `analysis_station_card` (§6), `account.preferred_mode` / `analysis.mode`.

DELIVERABLES
1. Home↔chef toggle (C3): default home; chef leads with the station card; preference saved on the
   account (`account.preferred_mode`).
2. Station card (C5): generated when a method exists or an inferred method was accepted; mise,
   sequence, do-nots, control points; printable (print itself is D-23).
3. Chef-mode presentation per §7/§8 — the card is a chef's working brief, not a recipe restatement.

NON-GOALS: printing (D-23), View 5 veto workflow (D-27).

DONE CRITERIA:
- Golden fixture: toggle to chef → station card leads; card generated only when method exists or
  inferred method accepted (golden invariant).
- Mode preference persists across sign-out/sign-in (C3 TC-03).
- Station card contains mise, sequence, do-nots, control points; arm's-length readability confirmed
  on device (print sizing proven in D-23).
```

## D-21 — P4-3: Disclaimer sweep

**Session budget:** 1 session · **Depends on:** D-19 · **Audit:** A-21

```text
You are making the two disclaimers unconditional (H6/I6, BUILD_PLAN P4-3).

READ FIRST: docs/Recipe_Systems.md §12 H6/I6, §3.7, docs/BUILD_PLAN.md P4-3
(disclaimers on every surface; "safe" forbidden INV-13; point-kcal forbidden INV-14).

DELIVERABLES
1. H6 text — "Reads the card only. Does not test food. Does not know your kitchen. Not medical
   advice." — on every View 8 surface.
2. I6 text — "Table estimate from stated assumptions. Not a lab analysis. Not medical advice." —
   on every View 9 surface.
3. Static + runtime gates: View 8 output never contains "safe" (INV-13); View 9 never emits a
   point-kcal when an input is a range (INV-14) — the QG2 regression-gate hooks for both.

NON-GOALS: any new views; profile logic (D-26).

DONE CRITERIA:
- Both texts present verbatim on every surface (grep + e2e assertion).
- Planted "safe" in a View 8 fixture → caught by the static gate and the runtime assertion.
- Planted point-kcal over a range input → caught (INV-14 assertion exists and fires).
```

## D-22 — P5-1: Library save / browse / delete

**Session budget:** 1 session · **Depends on:** D-21, D-30 · **Audit:** A-22

```text
You are shipping the library (D1, D2, D6).

READ FIRST: docs/Recipe_Systems.md §12 D1/D2/D6, docs/Recipe_Systems_ERD_FINAL.md §13 (lifecycle/
concurrency — hard DELETE cascade), docs/BUILD_PLAN.md P5-1.

DELIVERABLES
1. Save (D1): stores raw input, photo, object, identification, analysis (or regenerate capability),
   timestamps; default name = family, editable.
2. Browse/open (D2): library shows name, date, family, cook-log indicator.
3. Delete (D6): confirm → hard DELETE cascade removes photo, object, analyses, lists, logs; no
   residue (object-storage object deleted; no dangling URI).
4. Save-while-signed-out resume path integrates here (A1 TC-02 seam from D-07).

NON-GOALS: tags/search/edit/re-analyse (D-25), shopping lists (D-30 data, D-23 print), cook logs (D-24).

DONE CRITERIA:
- Save a fully analysed golden recipe → all six artifacts persisted; default name = family.
- Library rows show name, date, family, cook-log indicator (D2).
- Delete cascade proven: confirm required; after delete, no recipe/analysis/list/log/photo residue
  reachable anywhere (D6 TCs).
- Print path (D-23) must render from persisted snapshots only — the D5/D-23 seam documented here.
```

## D-23 — P5-2: Print list + station card

**Session budget:** 1 session · **Depends on:** D-22, D-30 · **Audit:** A-23 · **Gate:** Q2 (BUILD_PLAN §7.1)

```text
You are shipping print (E4, E5, H4). GATED ON Q2 (SCAFFOLD §7): the allergen-line source under the
snapshot-only render rule (E4/H4/E5 vs ADR §7 permitted-source table) must be answered before this
unit ships the allergen line — if Q2 is still open at week 9, STOP and raise it; do not pick a source silently.

READ FIRST: docs/Recipe_Systems.md §12 E4/E5/H4, docs/Recipe_Systems_Architecture_Decision_FINAL_V5.md §7
(rendering: snapshot-only reads, INV-12), docs/Recipe_Systems_Tech_Stack_FINAL.md §12
(HTML/CSS templates → PDF via Playwright + Chromium), docs/SCAFFOLD.md §4 (print is first-class).

DELIVERABLES
1. packages/rendering: HTML/CSS print templates for the shopping list and the station card; rendered
   to PDF by Playwright + Chromium, read-only, from persisted snapshots only (INV-12); browser print
   preview uses the same templates (SCAFFOLD §4).
2. List (E4): black text, recipe name, date, grouped rows, checkboxes; no account chrome; View 8
   allergen line (H4) per the Q2 answer.
3. Station card (E5): separate document; control points + "untasted briefing"; arm's-length readable;
   allergen line per Q2.
4. Snapshot-only proof: prints do not change after a later recipe edit (INV-12).

NON-GOALS: cook loop (D-24), home-mode one-pager (E6 — P7).

DONE CRITERIA (BUILD_PLAN P5 exit):
- Both prints fit one A4/Letter page for the golden card; allergen line present per Q2.
- Print after a later recipe edit → identical output (snapshot-only, INV-12).
- PDF generation failure → retryable error, snapshots unchanged (QG4 cell).
```

## D-24 — P6-1: Cook loop

**Session budget:** 1 session · **Depends on:** D-23 · **Audit:** A-24

```text
You are shipping after-cook capture (F1, F2, F6).

READ FIRST: docs/Recipe_Systems.md §12 F1/F2/F6, §15 (acceptance scene — the cook step),
docs/Recipe_Systems_ERD_FINAL.md §8 (`cook_log`), docs/BUILD_PLAN.md P6-1.

DELIVERABLES
1. Log cook (F1): `cooked_at` defaults today, editable; multiple logs per recipe; library shows last
   cooked.
2. Rating + note (F2): 1–5 optional + free text; private; visible on reopen, above the analysis.
3. Reopen surface (F6): last cooked date, rating, next-time line at the top (the next-time field
   itself is F4/D-26 — this unit surfaces it when present).

NON-GOALS: swaps (F3), next-time field (F4), plate photos (F5), profiles (H1).

DONE CRITERIA (BUILD_PLAN P6 exit):
- Acceptance-scene cook step runs: log, rate 4, note "2 green chillies, fenugreek powder off heat" →
  reopen Sunday → note at the top, garlic still absent, list printable (Recipe_Systems §15).
- Multiple logs per recipe; last cooked on the library row.
- Notes private: cross-account access returns nothing (ownership suite from D-09 re-asserted).
```

## D-25 — P7-1: Aliases, tags, edit + re-analyse

**Session budget:** 1–2 sessions (checkpoint below) · **Depends on:** D-24, D-29 · **Audit:** A-25

```text
You are shipping the hardening slice: aliases, tags/search, edit + re-analyse with snapshot chains
(B6, C6, C7, D3, D4, D5).

READ FIRST: docs/Recipe_Systems.md §12 B6/C6/C7/D3/D4/D5, docs/Recipe_Systems_ERD_FINAL.md
`ingredient_dictionary`/`ingredient_alias` (§5), `recipe_tag`, `analysis.snapshot_of_analysis_id`/`is_current` (§6, §13),
docs/BUILD_PLAN.md P7-1 (aliases per Q5 working assumption).

DELIVERABLES
1. Aliases (B6): the five source groups resolve via the dictionary; ambiguous "drumstick" asks for
   confirmation (requires_confirmation) — dictionary data comes from Track R (D-29, Q5 assumption).
2. Tags + search (D3): free-text tags; search name, ingredients, tags.
3. Edit → parse review (D4); re-analyse on request only (C6) — previous analysis snapshotted and
   linked to existing logs (D5 chain); cook logs remain.
4. Substitution preview (C7): one swap from View 4; states structural / modular / identity-shift;
   no new recipe invented. Conditional per Recipe_Systems §13 (could-haves ship only if Must on weeks
   9–10 is stable) — the same gate D-31 carries; record the stability evidence if dispatched.

SESSION CHECKPOINT (if two sessions): session 1 = aliases + tags/search; session 2 = edit/re-analyse/
snapshots + C7 preview. Commit + HANDOFF.md at the checkpoint.

NON-GOALS: profiles/swaps (D-26), veto workflow (D-27).

DONE CRITERIA:
- All five vernacular groups resolve; "drumstick" prompts confirmation (B6 TCs).
- Re-analyse: explicit only; previous analysis linked as snapshot; cook notes untouched (C6, D5).
- Snapshot chain integrity: logs point at the analysis they were made against; print history stable.
- C7 preview states structural/modular/identity-shift and invents nothing (INV-10 holds).
```

## D-26 — P7-2: Profiles, swaps, next-time, assumption editors

**Session budget:** 1 session · **Depends on:** D-24 · **Audit:** A-26

```text
You are shipping the household hardening slice (F3, F4, H1, H3, H5, I3, I4).

READ FIRST: docs/Recipe_Systems.md §12 F3/F4/H1/H3/H5/I3/I4, docs/Recipe_Systems_ERD_FINAL.md
`account_restriction_profile`/`account_restriction_item` (§5), `cook_log_swap` (§8), §15.6/§17 (I3 — Q14),
docs/BUILD_PLAN.md P7-2.

DELIVERABLES
1. Restriction profiles (H1): allergens, diet patterns, US or EU pack; optional; never auto-deletes
   recipes.
2. Profile highlighting (H3): conflicts first; unknown is not a pass.
3. Swaps (F3): skipped / reduced / increased / swapped; does not rewrite the card unless applied;
   restriction-driven swaps reuse it (H5).
4. Next-time field (F4): dedicated; shown on the station card tagged COOK LOG, not CARD (print
   integration with D-23's templates).
5. I3 portions: per-bowl band only after portions are set — persistence is Q14 (ERD §15.6, §17;
   BUILD_PLAN §7.8 defers to the View 9 payload, revisit post-pilot): build to the View 9 payload
   convention, leave the labeled seam, do not decide Q14.
6. Band tightening (I4): name fish / weigh coconut / measure oil → band narrows.

NON-GOALS: G2 veto workflow (D-27), pilot gate (D-28).

DONE CRITERIA:
- Profile configured; conflicting recipe highlights conflicts first; unknown shown as unknown (H3).
- Swap recorded → card unchanged unless applied (F3/H5 TCs).
- Next-time line prints on the station card tagged COOK LOG, never CARD (F4).
- I3 per-bowl band appears only after portions set; Q14 seam documented in HANDOFF.md.
- I4 tightening narrows the band on the golden fixture.
```

## D-27 — P7-3: Regional veto workflow + retention/ops

**Session budget:** 1 session · **Depends on:** D-25 · **Audit:** A-27

```text
You are shipping the G2 veto workflow and the operational tail (BUILD_PLAN P7-3).

READ FIRST: docs/Recipe_Systems.md §12 G2, §10 (review gates), docs/Recipe_Systems_Architecture_Decision_FINAL_V5.md
§8 (G2 "publishable" state home — Q6: manual queue vs analysis_claim status column — build to the
labeled working assumption, do not decide Q6), §21 (retention/cleanup, Q11/Q15 pointers).

DELIVERABLES
1. Veto workflow (G2): a reviewer can block a live View 5 regional sentence; pilot: one Tamil Nadu/
   Kanyakumari reviewer + one Kerala reviewer on the fish-curry cluster; blocked sentences leave
   live views immediately.
2. Retention/cleanup jobs: guest-session expiry cleanup (Q11 pilot default from D-08), photo/account
   retention per Q15's pilot defaults (labeled — do not decide Q15).
3. Ops docs: runbook for pilot operations, backup/restore, upgrade windows (the BUILD_PLAN §5 "Ops
   burden" row), monitoring per Tech Stack §17.

NON-GOALS: pilot execution itself (D-28).

DONE CRITERIA:
- Reviewer vetoes a live regional sentence → blocked from live views (G2 TC-01).
- Both reviewer roles configured on the fish-curry cluster (G2 TC-02).
- Cleanup jobs run and are verified (expired unclaimed guests removed — QG4 guest-expiry cell).
- Q6/Q11/Q15 working assumptions recorded in HANDOFF.md with register IDs.
```

## D-28 — P7-4: Week-12 pilot gate

**Session budget:** 1 session · **Depends on:** D-24, D-27 · **Audit:** A-28

```text
You are running the week-12 pilot gate (G3, Recipe_Systems §14).

READ FIRST: docs/Recipe_Systems.md §14 (metrics and gates — go/no-go lines verbatim), §12 G3,
docs/BUILD_PLAN.md P7-4 (20 users, golden + 20 messy recipes, go/no-go metrics),
docs/TEST_PLAN.md §1 mechanism 5 (closing sweep), QG5 (messy_20 set).

DELIVERABLES
1. Pilot protocol: 20 users; golden fixture + the twenty messy recipes (tests/fixtures/messy_20/);
   go/no-go metrics recorded per §14.
2. Chef pass (G3): Kumari / inland Tamil / Kerala kudampuli — identification differs, zero invented
   ingredients, station cards runnable, no "safe", no point-kcal presented as fact.
3. The closing sweep (TEST_PLAN mechanism 5): every prior unit's blocker-class checks re-run on the
   pilot commit; the §15 acceptance scene runs end-to-end.

NON-GOALS: post-pilot features; no scope beyond the §14 metric list.

DONE CRITERIA (BUILD_PLAN P7 exit):
- Go metrics: zero invented ingredients on the golden fixture; three curries separable in chef mode;
  prints fit one page; photo→first analysis under 2 minutes including parse correction; no "safe";
  no point-kcal (§14).
- §14 go line holds: Must stories work on the golden fixture and on twenty other messy recipes;
  View 5 not vetoed wholesale; cooks used save + list + log without coaching.
- Pilot results recorded with the go/no-go recommendation; HANDOFF.md holds the full evidence set.
```

## D-29 — Track R: Reference data (wks 1–8, feeds P4)

**Session budget:** 1–2 sessions (checkpoint below) · **Depends on:** D-01 · **Audit:** A-29 · **Gate:** Q5

```text
You are building the curated reference-data path (H7, I7) — starts week 1, feeds P4 (BUILD_PLAN §4
Track R). GATE: Q5 (writer of ingredient_dictionary/ingredient_alias) — work to the admin-module
working assumption (TEST_PLAN QG2, BUILD_PLAN Track R) until Q5 is answered; do not decide it.

READ FIRST: docs/BUILD_PLAN.md §4 Track R, docs/Recipe_Systems.md §12 H7/I7,
docs/Recipe_Systems_ERD_FINAL.md §9/§10 (dietary + nutrition dictionaries, effective-dated),
docs/Recipe_Systems_Architecture_Decision_FINAL_V5.md §7 (reviewed import path).

DELIVERABLES
1. Admin/reference-data module: sole writer of dietary_allergen_definition, dietary_allergen_mapping,
   nutrition_food_composition_*, and (Q5 working assumption) ingredient_dictionary/ingredient_alias.
2. Reviewed import path: CSV/JSON import → diff → human approval → effective-dated version (ADR §7);
   `EXCLUDE USING gist` rejects overlaps (ERD §9/§10).
3. Sources: US/EU statutory allergen lists, USDA FoodData Central (H7/I7); USDA or peer IDs on mapped
   lines; unmapped lines excluded from totals and listed (I7).

SESSION CHECKPOINT (if two sessions): session 1 = import + diff + versioning spine; session 2 =
allergen + nutrition + dictionary content loads. Commit + HANDOFF.md at the checkpoint.

NON-GOALS: analysis consumption (P4), profile UI (D-26).

DONE CRITERIA (BUILD_PLAN Track R exit):
- Allergen + nutrition data loaded via the reviewed path; effective-dated versions; overlap attempt
  rejected (QG4 cell).
- An unreviewed mapping change cannot silently alter every recipe's View 8/9 (audit A-29 proves it).
- I7: mapped lines carry USDA/peer IDs; unmapped lines excluded from totals and listed.
```

## D-30 — Track S: Shopping data (wks 8–9, feeds P5)

**Session budget:** 1 session · **Depends on:** D-14 · **Audit:** A-30

```text
You are building the shopping data layer (E1, E2, E3) — weeks 8–9, feeds P5 (BUILD_PLAN §4 Track S).

READ FIRST: docs/Recipe_Systems.md §12 E1/E2/E3, docs/Recipe_Systems_ERD_FINAL.md §7
(`ingredient_shopping_state` composite FK to recipe_ingredient_line(recipe_id, shopping_key);
soft-delete cleanup trigger C-28), docs/BUILD_PLAN.md §4 Track S.

DELIVERABLES
1. Shopping state per ingredient line (E2): have/need; persists on the saved recipe; survives list
   regeneration.
2. List generation from the structured object (E1): one row per ingredient; "to taste" and "for
   tempering" visible; two fenugreek rows; no headers (the printed surface itself ships in D-23/P5).
3. Market grouping (E3): fresh produce, fish/meat, spices, fats/oils, other.
4. The composite FK + C-28 trigger behavior verified: shopping state survives line soft-delete cleanup.

NON-GOALS: print rendering (D-23), cook loop, library UI (D-22 — consume the state).

DONE CRITERIA:
- List generated from the golden object: one row per ingredient, two fenugreek rows, no headers,
  "to taste"/"for tempering" visible (E1 TCs).
- Have/need state persists across list regeneration and reopen (E2 TCs).
- Grouping per E3 categories (E3 TC).
- Soft-delete of a line cleans its shopping state (C-28 trigger scenario); state survives list
  regeneration (BUILD_PLAN Track S).
```

## D-31 — P7 tail (conditional): could-haves E6, F5, I5

**Session budget:** 1 session · **Depends on:** D-23, D-24, D-26 · **Audit:** A-31 · **Gate:** §13 could-haves rule

```text
You are shipping the three could-have stories. CONDITIONAL DISPATCH: Recipe_Systems §13 — "Could-haves
(C7, E6, F5, I5) only if Must on weeks 9–10 is stable." Do not start this unit until the week 9–10 Must
work is stable; record the stability evidence in the HANDOFF entry. (C7 shares this gate and ships in D-25.)

READ FIRST: docs/Recipe_Systems.md §12 E6/F5/I5, §13 (the could-haves rule),
docs/USER_STORIES.md E6/F5/I5 (acceptance + test cases), docs/DISPATCH.md D-23 (print templates),
D-24 (cook log), D-26 (I4/I5 tightening inputs).

DELIVERABLES
1. E6 — home-mode one-pager: keep / negotiate / identity-shift + ingredient list; optional View 9
   energy band (I5); NOT a legal nutrition label; prints through the D-23 template path.
2. F5 — plate photo: one image per cook log; not re-analysed unless asked.
3. I5 — optional energy band on the one-pager only; never on the market list as if it were a
   packaged-food label.

NON-GOALS: no analysis changes; no market-list changes; no new print templates beyond the one-pager.

DONE CRITERIA:
- One-pager renders keep / negotiate / identity-shift + ingredient list; energy band optional (E6 TCs).
- Nothing on the one-pager presents as a legal nutrition label (E6 TC-03).
- Plate photo: one image per log; no re-analysis unless asked (F5 TCs).
- Energy band appears on the one-pager only — never on the market list (I5 TCs).
- §13 stability evidence recorded in HANDOFF.md (the week 9–10 Must work was stable at dispatch).
```
