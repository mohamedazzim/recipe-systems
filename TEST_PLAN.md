# Recipe Systems — Test Plan

**Status:** v1.0 · 2026-09-04 · **Binding companion to** [BUILD_PLAN.md](BUILD_PLAN.md) — every phase exit references these gates.
**Sources:** Tech Stack §20 (CI suite) · ERD §16 (golden fixture) · ADR §9 (G1/G2) · `Recipe_Systems.md` §10 (review gates) and §14 (metrics)
**Purpose:** The testing mechanisms the product already demands, consolidated into five layers, plus quality gates that prevent erosion: coverage floors, a cumulative regression suite with static gates, performance baselines as CI assertions, a fault matrix, and a deterministic test-data strategy. Builders implement what this plan assigns to their phase; the golden fixture is the CI gate that never leaves (Recipe_Systems §3.8).

---

## 1. Test strategy — the five mechanisms

| # | Mechanism | Where it lives | What it catches |
|---|---|---|---|
| 1 | **Story suites** — every story in the 50-story index becomes same-ID test files (`B3` → `tests/integration/story_b3_parse_review.test.ts`) | Each BUILD_PLAN phase; SCAFFOLD §6 | Spec-level behavior per story |
| 2 | **Re-executable phase exits** — every P0–P7 "Exit" in BUILD_PLAN §3 is a runnable check, re-run at the next phase's entry | BUILD_PLAN §3 | Acceptance per phase, including failure modes |
| 3 | **Golden tests** — `golden_kanyakumari_card.json` + `golden_recipe_assertions.yaml`, CI-blocking, asserting all 8 invariants; the §15 acceptance scene (Priya) as a day-in-the-life e2e | ERD §16; Recipe_Systems §15 | No-invention, provenance, band-not-point, two-fenugreeks |
| 4 | **Adversarial passes** — week-4 chef lie-circling on ingest, week-8 three-curry separation, week-12 chef pass (G3), regional veto on View 5 (G2) — G2/G3 here are product story IDs (Recipe_Systems §12), not QG gates | Recipe_Systems §10 | What builders don't test against themselves |
| 5 | **Closing sweep** — week-12 pilot gate: 20 users, golden + 20 messy recipes, go/no-go metrics re-run | Recipe_Systems §14 | System-level regression + product readiness |

The grounding validator (ADR §6) is the load-bearing test target for the entire no-invention rule: INV-10 is asserted on every analysis job in production *and* exercised in CI on the golden fixture.

## 2. Quality gates (binding)

**Naming:** these gates are numbered **QG1–QG5**. The source's G1/G2/G3 are *product stories* (golden fixture in CI, regional veto, chef pass — Recipe_Systems §12 Epic G, §10 review gates) and keep their source IDs wherever they appear in this plan.

### QG1 — Coverage floors

Measured in CI from the moment a package exists; below floor fails the build. Floors are this plan's policy, review-adjustable — the sources mandate the CI suite (Tech Stack §20) but not the numbers. Jest is the NestJS default runner.

| Surface | Floor | Tool |
|---|---|---|
| `packages/schemas` + `packages/domain` | 90% statements | jest `--coverage` |
| `apps/analysis-worker` (grounding + validation paths) | 80% | jest `--coverage` |
| `apps/api` modules | 75% lines | jest `--coverage` |
| `packages/llm-adapter` / `packages/ocr-adapter` | 75% | jest `--coverage` |
| `apps/web` | no line floor — Playwright e2e of the five critical flows is the gate | Playwright |

Five critical web flows (must exist as e2e): intake review (photo→OCR→correction), analysis status via SSE (including reconnect/reload), library save/reopen with cook-note recall, print list + station card (one page each), cook log entry.

### QG2 — Cumulative regression suite + static gates

1. Every phase's story suites join the monorepo suite permanently; CI runs the **full** suite on every PR (Tech Stack §20) — no phase ever runs only its own tests.
2. `scripts/regression-gates.sh` (created in P0, grown by later phases) automates blocker-class checks so they hold between adversarial passes:
   - **one-writer:** no writes to `analysis_*` outside `apps/analysis-worker`; no writes to `dietary_*` / `nutrition_*` outside the admin module (ADR §2); `ingredient_dictionary` / `ingredient_alias` likewise, per the Q5 working assumption
   - **render read-only:** `packages/rendering` contains no database writes (ADR §7)
   - **DDL:** no `CREATE TABLE` outside Prisma migrations (SCAFFOLD §2)
   - **provenance:** `claim_tag` values ⊆ the six canonical tags; every claim carries a tag
   - **disclaimers:** View 8 output never contains "safe"; View 9 never emits a point-kcal when an input is a range (asserted on fixtures at runtime + static check that the assertions exist)
   - **golden:** the golden test exists, is not skipped, and ran in this CI run
3. Gates run green-trivially before their subject exists; they arm automatically as code lands.

### QG3 — Performance baselines as CI assertions

| Metric | Set by | Target (from source) | Tolerance |
|---|---|---|---|
| Photo → first analysis (incl. parse correction) | P2–P4 | **< 2 min** (Recipe_Systems §14) | none — hard gate |
| Analysis job end-to-end latency | P3 | recorded at phase | +25% |
| Print PDF generation (list + station card) | P5 | recorded at phase; one page each | +25% |
| SSE: worker write → browser update | P3 | recorded at phase | +25% |
| Grounding validation wall time | P3 | recorded at phase | +25% |

Baselines recorded in `.perf-baselines.json` at repo root; regression beyond tolerance fails CI. LLM/OCR latency and cost are benchmarked separately in the benchmark harness (§4) because they depend on external providers.

### QG4 — Fault matrix

Every dependency × failure-mode cell has an owning phase and a named test.

| Dependency | Failure mode | Owning phase | Required behavior (source) |
|---|---|---|---|
| OCR provider | timeout / down | P2 | Preserve `recipe_input` + photo; intake retryable (Tech Stack §21) |
| OCR provider | low confidence | P2 | `needs_review = TRUE`; analysis blocked (INV-05) |
| LLM provider | timeout / down | P3 | `analysis.status = failed`, retryable; previous current preserved |
| LLM output | invalid schema | P3 | Reject/regenerate; never publish (Tech Stack §21) |
| Grounding | unresolved ingredient reference | P3 | Not current (INV-10); regenerate once, then INCOMPLETE |
| Worker | crash mid-job / duplicate delivery | P3 | Idempotent retry; converge on one analysis (INV-11, ADR §14) |
| Postgres | down during request | P1 (named test; applies in every phase) | Controlled failure; no partial business state (Tech Stack §21) |
| Object storage | upload failure | P2/P6 | No URI persisted for a missing object |
| Reference import | overlapping effective period | Track R | Reject transaction; current data preserved (ADR §7) |
| Concurrent edit | stale recipe write | P2 (named test — first recipe update; re-asserted P7) | Reject on version/`updated_at`; reload/merge (ERD §13) |
| PDF render | failure | P5 | Retryable error; snapshots unchanged |
| SSE / NOTIFY | signal lost | P3 | Reconnect + reload from Postgres (Tech Stack §13) |
| IdP (Keycloak under Q8) | down | P1 | 503 envelope; no unauthenticated fallthrough (plan addition — the sources are silent on IdP failure behavior) |
| Guest session | expiry | P1 | Cleanup of expired unclaimed guests (ADR §21) |

### QG5 — Test data strategy (three deterministic tiers)

| Tier | Artifact | Built by | Used for |
|---|---|---|---|
| Smoke | `golden_kanyakumari_card.json` + reference-data seed scripts (idempotent, via reviewed admin path) | P0/P1, Track R | dev loop, golden CI, story fixtures |
| Volume | 50-recipe fixture corpus (deterministic), plus the 20 messy week-12 recipes as a separate named set (the source does not state whether they live inside or outside the 50 — convention: keep them separate and named) | P0, grown through P7 | benchmark runs, grounding regression, adversarial passes |
| History | Cook-log + shopping snapshot fixtures; analysis snapshot chains (D5 re-analysis) | P6/P7 | recall-on-reopen tests, snapshot-chain integrity, print-history tests |

Every fixture is deterministic and versioned; a failing test names its fixture and reproduces exactly. Real provider benchmarks (LLM/OCR) run in a separate benchmark harness, budget-gated, outside normal CI.

## 3. Test-type matrix by phase

| Phase | Story suites | Integration | e2e (Playwright) | Perf (QG3) | Fault cells (QG4) | Golden |
|---|---|---|---|---|---|---|
| P0 | — | migrate-deploy smoke on ephemeral PG | — | — | — | fixture + assertions scaffolded; gates scaffolded |
| P1 | A1, A2 | Keycloak + Postgres; claim transaction; XOR invariant | register→guest→claim | — | Keycloak down; guest expiry | — |
| P2 | B1–B5 | full intake path; OCR adapter contract; needs_review gate | intake review flow | — | OCR timeout / low confidence | two-fenugreeks preserved |
| P3 | C1, C4, C2 (views 1–4) | grounding validator vs corpus; idempotency; SSE reconcile | analysis status flow | job latency; SSE latency; grounding time | LLM timeout/output; grounding; worker crash/dupe | **full 8 invariants, CI-blocking** |
| P4 | C3, C5, H2, H6, I1, I2, I6 | reference-data joins; station-card build | home↔chef toggle | — | — | no-"safe"; band-not-point |
| Track R | H7, I7 | reviewed import path; version-overlap rejection (`EXCLUDE USING gist`); dictionary/alias curation (Q5 assumption: admin module) | — | — | reference-import conflict | versioning determinism |
| P5 | D1, D2, D6, E4, E5, H4 | snapshot-only renderer (INV-12); delete cascade | print flows (both templates) | PDF baseline | PDF failure; stale edit | allergen line present (mechanism per Q2) |
| Track S | E1, E2, E3 | shopping-state composite FK; soft-delete cleanup trigger (C-28) | — | — | — | — |
| P6 | F1, F2, F6 | cook-log persistence | cook loop flow | — | object upload failure | — |
| P7 | B6, C6, C7, D3–D5, E6, F3–F5, H1, H3, H5, I3, I4, I5 | snapshot chains; profile highlighting; cleanup jobs | 20-user pilot protocol | photo→analysis <2 min re-asserted | — | acceptance-scene e2e |

## 4. Environments

- **Local/CI:** compose stack — Postgres, MinIO (S3-compatible dev stand-in), Nginx; the IdP via the `identity` profile from P1 onward (**not started before P1**; Keycloak under the Q8 working assumption). CI uses an ephemeral Postgres for migrations (GitHub Actions, Tech Stack §20). No staging environment is assumed (convention — the sources are silent on staging).
- **Providers:** LLM and OCR are mocked behind the adapter contracts in CI and unit tests (deterministic stubs); real providers run only in the benchmark harness, budget-gated (Tech Stack §10/§11).
- **Time:** no clock manipulation needed — cook logs take `cooked_at` as input; nothing in the domain sleeps on wall time.
- **External services:** object storage via MinIO in dev/CI; email (if used by Keycloak flows) via a dev catcher.

## 5. Entry / exit criteria

- **Phase entry:** all upstream phases' exits green (BUILD_PLAN §2 graph); required contract inputs frozen (e.g., P3 consumes the nine-view schemas frozen at P0). A decision from the OPEN DECISION register (SCAFFOLD §7, Q1–Q18) that changes a phase's inputs re-runs that phase's gates — this plan assumes none of them silently.
- **Phase exit (builder):** story suites green · full cumulative suite green (QG2) · coverage floors met (QG1) · perf baselines recorded/asserted where assigned (QG3) · assigned fault cells demonstrated (QG4) · BUILD_PLAN §3 exit checks re-run green.
- **Week gates (adversarial):** week 4 chef lie-circling; week 8 three-curry separation; week 12 pilot go/no-go (Recipe_Systems §10/§14).
- **Program exit:** the §15 acceptance scene runs end-to-end; go metrics re-verified — zero invented ingredients on the golden fixture, three curries separable in chef mode, prints fit one page, photo→first analysis under 2 minutes including parse correction, no "safe" in View 8, no point-kcal in View 9.

## 6. Ownership

Builders write and run everything assigned to their phase; the culinary editor and regional reviewers own the adversarial-pass content (product G2/G3); the golden fixture (product G1) and gates QG1–QG3 run in CI on every PR — the golden fixture never leaves CI (Recipe_Systems §3.8). A failing gate is a build failure, not a review note.
