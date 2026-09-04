# Recipe Systems — Dispatch Audit Plan

**Status:** v1.1 — 31 audits · 2026-09-04 · Paired 1:1 with [DISPATCH.md](DISPATCH.md) v1.1 and the [TEST_PLAN.md](TEST_PLAN.md) gates QG1–QG5. v1.1 review fixes: A-31 added (could-have tail), billing vocabulary removed from the contract, migration-001 ownership reflected in A-01/A-02.
**Purpose:** Every dispatch unit D-XX is verified by an **independent audit agent** running the paired prompt A-XX below, in a fresh session, before any dependent unit is dispatched. The audit agent must not be the agent that built the unit.

## Audit contract (applies to every A-XX)

1. The audit agent has read-only intent: it may run builds, tests, containers, and queries, but must not fix anything — findings only. (Fixes go back through a dispatch session.)
2. Every audit verifies five layers, in order:
   - **Existence** — the deliverables are present where the dispatch prompt said.
   - **Conformance** — conventions hold: SCAFFOLD §6 (UUIDv4, snake_case, decimal-string amounts, error envelope, story-ID test naming, CI order), the one-writer rule (ADR §2), Prisma-owns-DDL (SCAFFOLD §2), and the no-invention rules (INV-10 grounding, INV-13 no "safe", INV-14 no point-kcal). Spot-check, don't assume.
   - **Behavior** — the done-criteria are *re-executed*, not read from HANDOFF.md. HANDOFF.md claims are hypotheses to test.
   - **Gates (TEST_PLAN.md §2)** — the coverage report meets the QG1 floors for every package this unit touched (read the actual CI/coverage output, not the HANDOFF); the CI run executed the FULL cumulative suite + `regression-gates.sh`, not just this unit's tests (QG2); any perf-measuring criterion updated `.perf-baselines.json` and the perf job asserted it (QG3); the fault-matrix cells QG4 assigns to this unit were demonstrated; fixtures came from the deterministic tiers with named files (QG5). A floor miss on an analysis/grounding path, a suite run scoped to the unit only, or an unrecorded baseline is a MAJOR; a disabled/skipped regression gate is a BLOCKER.
   - **Drift** — nothing out of scope was changed (`git diff BASE_SHA..COMMIT_SHA` against the pre-unit commit; flag surprise files, `docs/` edits, dependency additions with no justification). Any edit under `docs/` is a BLOCKER (DISPATCH global rule 1).
   - **OPEN DECISION hygiene** — no Q1–Q17 decision was silently resolved in code; working assumptions are labeled with their register IDs (DISPATCH global rule 9). A silent resolution is a BLOCKER.
3. Output format (mandatory):
   - `VERDICT: PASS | PASS-WITH-FINDINGS | FAIL`
   - Findings table: severity (BLOCKER / MAJOR / MINOR), file:line, one-line defect, evidence (command + output excerpt).
   - BLOCKER = a done-criterion is false, a convention is violated in a way that propagates (wrong wire format, DDL outside Prisma, one-writer breach, invented ingredient reaching a view, a silent Q1–Q17 resolution), or the golden fixture regressed. Any BLOCKER ⇒ FAIL.
4. The audit ends by appending its verdict block to `AUDIT_LOG.md` in the implementation monorepo root.

## Audit ledger

| Audit | Verifies (DISPATCH unit) | Prompt | Status |
|---|---|---|---|
| A-01 | D-01 Monorepo bootstrap & CI | ✅ below | ☐ |
| A-02 | D-02 ERD v13 migrations | ✅ below | ☐ |
| A-03 | D-03 Golden fixture scaffold | ✅ below | ☐ |
| A-04 | D-04 Corpus + reviewers | ✅ below | ☐ |
| A-05 | D-05 Nine-view schemas frozen | ✅ below | ☐ |
| A-06 | D-06 IdP (Q8 assumption) | ✅ below | ☐ |
| A-07 | D-07 OIDC cookies + account | ✅ below | ☐ |
| A-08 | D-08 Guest sessions + claim | ✅ below | ☐ |
| A-09 | D-09 Ownership enforcement | ✅ below | ☐ |
| A-10 | D-10 Raw intake + photo pipeline | ✅ below | ☐ |
| A-11 | D-11 OCR adapter + flagging | ✅ below | ☐ |
| A-12 | D-12 Parse review | ✅ below | ☐ |
| A-13 | D-13 Method attach | ✅ below | ☐ |
| A-14 | D-14 needs_review enqueue gate | ✅ below | ☐ |
| A-15 | D-15 Prompt specs + prompt_version | ✅ below | ☐ |
| A-16 | D-16 Grounding validator | ✅ below | ☐ |
| A-17 | D-17 Analysis worker | ✅ below | ☐ |
| A-18 | D-18 Views 1–4 + home mode | ✅ below | ☐ |
| A-19 | D-19 Views 5–9 | ✅ below | ☐ |
| A-20 | D-20 Chef mode + station card | ✅ below | ☐ |
| A-21 | D-21 Disclaimer sweep | ✅ below | ☐ |
| A-22 | D-22 Library save/browse/delete | ✅ below | ☐ |
| A-23 | D-23 Print list + station card | ✅ below | ☐ |
| A-24 | D-24 Cook loop | ✅ below | ☐ |
| A-25 | D-25 Aliases, tags, edit + re-analyse | ✅ below | ☐ |
| A-26 | D-26 Profiles, swaps, next-time, I3/I4 | ✅ below | ☐ |
| A-27 | D-27 Regional veto + retention/ops | ✅ below | ☐ |
| A-28 | D-28 Week-12 pilot gate (closing sweep) | ✅ below | ☐ |
| A-29 | D-29 Track R reference data | ✅ below | ☐ |
| A-30 | D-30 Track S shopping data | ✅ below | ☐ |
| A-31 | D-31 Could-have tail (E6, F5, I5) | ✅ below | ☐ |

---

*Common preamble for every audit below (implied, do not omit when dispatching):*
> You are the independent audit agent for dispatch unit D-XX. You did not build it; try to fail it. READ: docs/DISPATCH.md unit D-XX, docs/AUDIT.md contract, docs/TEST_PLAN.md §2, the docs the unit names. HANDOFF.md claims are hypotheses. Verify Existence → Conformance → Behavior (re-execute every done criterion) → Gates (coverage floors, full cumulative suite + regression-gates.sh ran, perf baselines updated/asserted, assigned QG4 fault-matrix cells demonstrated) → Drift (git diff BASE_SHA..COMMIT_SHA; no docs/ edits) → OPEN DECISION hygiene (no silent Q1–Q17 resolution). Output the verdict block; append to AUDIT_LOG.md; fix nothing.

## A-01 — Audit: monorepo bootstrap & CI

```text
[Preamble for D-01.] Verify, in order:
- [Existence] Layout matches SCAFFOLD §1 exactly (apps/, packages/, tests/, infra/, .github/workflows/,
  docs/). Preflight held: docs/SCAFFOLD.md exists relative to the repo root; no implementation files
  were created inside the documentation repo itself.
- [Conformance] No DDL outside packages/database migrations (grep CREATE TABLE in TS source — BLOCKER
  per SCAFFOLD §2). Migration 001 opens with `CREATE EXTENSION IF NOT EXISTS btree_gist` and contains
  ONLY the extension (D-01 owns 001; the schema DDL arrives in D-02 as migrations 002+).
- [Behavior — re-execute every D-01 done criterion from a clean state]
  `docker compose down -v && docker compose up -d` (default profile only — do NOT pass any --profile
  flag): postgres, minio, nginx reach healthy. The `identity` profile is DEFINED but Keycloak has NOT
  been started (docker ps shows no keycloak container — starting it before P1 violates BUILD_PLAN §5).
  Fresh `prisma migrate deploy` on an empty database applies cleanly; re-run is a no-op; `prisma
  migrate diff` shows zero drift.
- [Gates] scripts/regression-gates.sh exists, is wired into BOTH CI and verify-local.sh, and each
  static gate actually fires: plant one violation per gate in a scratch path (a write to analysis_*
  outside the worker, a DB write inside packages/rendering, a CREATE TABLE in TS source, a claim_tag
  outside the six canonical values, "safe" in a View 8 fixture, a point-kcal assertion absence, a
  missing golden test) and prove each is caught, then remove the plants. Coverage thresholds are
  configured per QG1 (break them to prove enforcement); `.perf-baselines.json` exists with the QG3
  schema and the CI perf job references it.
- [Drift] git diff BASE_SHA..COMMIT_SHA contains only the declared deliverables. Any dependency added
  that no deliverable needs is a finding.
OUTPUT: verdict block per the audit contract. Append to AUDIT_LOG.md. Fix nothing.
```

## A-02 — Audit: ERD v13 migrations

```text
[Preamble for D-02.] Attack vectors, beyond re-executing D-02's done criteria:
- Constraint truthfulness: attempt a violating row for each of chk_recipe_owner_xor,
  chk_ocr_confidence_range, chk_restriction_item_type_matches_value — each must reject. Attempt an
  overlapping effective-dated dietary/nutrition row — the EXCLUDE USING gist must reject it. Soft-
  delete an ingredient line with shopping state — the C-28 trigger must clean the state.
- Completeness: count tables = 24 (ERD §5–§10 dictionary count); every table named in the ERD §3
  Mermaid exists; every index/constraint ERD §12 names exists. A missing named constraint is a BLOCKER.
- Drift: no ERD v14 invention — diff the migration SQL against ERD §12's spec; any schema object not
  in ERD v13 is a BLOCKER (SCAFFOLD §2: "No table changes without an ERD revision").
- Idempotency: deploy twice, zero drift; rollback path documented or explicitly out of scope in
  HANDOFF.md (flag as MINOR if absent).
```

## A-03 — Audit: golden fixture scaffold

```text
[Preamble for D-03.] Attack vectors:
- Invariant completeness (the load-bearing check): cross-check the 8 assertions in
  golden_recipe_assertions.yaml against ERD §16's invariant list, one by one. A missing invariant is
  a BLOCKER; a weakened assertion (e.g., checking only one fenugreek) is a BLOCKER.
- Truthfulness: the golden card input contains Fish 500g, Drumstick 1, Mango 1/2, Half Shell coconut,
  both fenugreek lines, and NO garlic/ginger — diff the fixture against Recipe_Systems §12 B2's list.
- CI wiring: the golden job runs on every PR in the SCAFFOLD §6 position; skipping it in this CI run
  is a BLOCKER. It is expected to FAIL now (scaffold) — the pipeline position is the deliverable;
  verify the failure is the scaffolded assertion, not a broken job.
- Naming: fixture/assertion paths match SCAFFOLD §1 and TEST_PLAN §1 exactly
  (tests/fixtures/golden_kanyakumari_card.json, tests/assertions/golden_recipe_assertions.yaml).
```

## A-04 — Audit: corpus + reviewers

```text
[Preamble for D-04.] Attack vectors:
- Set separation (QG5): messy_20/ is a separate named set — verify no messy fixture is counted inside
  the corpus index and vice versa (cross-contamination is a MAJOR).
- Determinism: re-generate/validate every fixture parses deterministically (a failing test must name
  its fixture — check the fixture naming convention is stable and versioned).
- Reviewer roster: two regional reviewers (Tamil Nadu/Kanyakumari + Kerala) with recorded process;
  empty roster rows labeled as slots, not fabricated people (fabricated reviewer names = MAJOR —
  this is a real-people process, BUILD_PLAN §7.9).
- Corpus count honesty: HANDOFF.md records how many of the 50 exist at this commit; the ledger claims
  only that number (claiming 50 while 12 exist is a MAJOR).
```

## A-05 — Audit: nine-view schemas frozen

```text
[Preamble for D-05.] Attack vectors:
- Contract truthfulness: hand-validate instance documents for all nine views + station-card sections
  from the §6 worked example against the schemas — any mismatch between the schema and the worked
  example is a BLOCKER (the worked example is the product's acceptance data).
- Provenance vocabulary: every claim tag in any schema ∈ {CARD, METHOD, INFERRED, ABSENT, UNKNOWN,
  ASSUMED} (§3.2). A seventh tag anywhere is a BLOCKER.
- INCOMPLETE semantics: schemas must allow a view to be explicitly INCOMPLETE (C2) — a schema that
  cannot represent INCOMPLETE is a BLOCKER.
- Freeze discipline: the freeze record exists and names the reviewer; attempt to edit a schema after
  the freeze commit is rejected by process (check the freeze record's own procedure — its absence is
  a MINOR, its non-enforcement from this point on is a MAJOR).
```

## A-06 — Audit: IdP (Q8 assumption)

```text
[Preamble for D-06.] Attack vectors:
- Q8 hygiene (BLOCKER class): grep the diff for any claim that Q8 is resolved. Keycloak work must be
  labeled the working assumption; the Auth0 fallback path must be documented; the adapter seam must
  exist. A Keycloak-specific API call outside the adapter is a MAJOR.
- Timing: verify Keycloak was not started before P1 (BUILD_PLAN §5 "Not started before P1"): container
  history/compose profiles must show identity profile first used at this unit.
- Realm fidelity: the realm export is committed and re-importable from scratch (`docker compose
  --profile identity up -d` on a clean volume → realm present); the export in git matches the running
  realm (diff).
- Boundary roles: IdP owns credential lifecycle/password reset/email verification/OAuth/MFA (Tech
  Stack §14 list) — check nothing in this unit moved those into app code (a reset flow in app code is
  a MAJOR). App still owns account/authorization (ADR §19) — check no IdP claim is used as the
  authorization source.
```

## A-07 — Audit: OIDC cookies + account

```text
[Preamble for D-07.] Attack vectors:
- Cookie hygiene: every session cookie has Secure, HttpOnly, SameSite, expiration (Tech Stack §14).
  Inspect the Set-Cookie headers directly — a missing flag is a MAJOR, HttpOnly missing is a BLOCKER.
- CSRF: every state-changing route verifies a CSRF token (Tech Stack §15); replay a captured state
  change without the token → rejected. An unguarded mutation is a BLOCKER.
- A1 story suite: re-run story_a1_create_account.test.ts — register → empty library; save-while-
  signed-out → sign-in resumes save (the resume seam must be demonstrably wired, not stubbed silently —
  a silent no-op seam is a MAJOR).
- Account fields: preferred_mode defaults home; label_pack US/EU enforced (ERD `account`). A third
  label_pack value is a MAJOR.
```

## A-08 — Audit: guest sessions + claim

```text
[Preamble for D-08.] Attack vectors:
- Claim transaction (BLOCKER class): run claim twice concurrently → one account owns the recipe, the
  guest row preserved as audit, no duplicate ownership. chk_recipe_owner_xor must hold through every
  step (attempt violations directly in SQL — all rejected).
- Guest isolation: two guest sessions cannot see each other's recipes (ID enumeration attempt on the
  unguessable UUID — 404, no existence leak).
- Expiry: expire an unclaimed guest (Q11 pilot default from HANDOFF.md) → cleanup job removes it;
  an expired guest session cannot read or claim afterwards (QG4 cell).
- Q11 hygiene: the TTL is a labeled pilot default with the register ID in HANDOFF.md — a bare magic
  constant with no label is a MINOR.
```

## A-09 — Audit: ownership enforcement

```text
[Preamble for D-09.] Attack vectors:
- Cross-tenant escape (BLOCKER class): account A's session calls every recipe/guest surface with
  account B's ids — all must 403/404, none may leak existence (id-in-body vs id-in-path mismatches
  included).
- Guard coverage: grep every mutating controller route for its guard decorator; an unguarded mutation
  is a BLOCKER (this audit's grep becomes the QG2 one-writer/ownership gate going forward).
- XOR invariant: drive both violation shapes (both owner fields set; neither set) → CHECK rejects.
- Invariant cross-check: INV-17 wording vs ADR §20 — the implementation must match the ADR, not a
  rephrased weaker version (weakened = BLOCKER).
```

## A-10 — Audit: raw intake + photo pipeline

```text
[Preamble for D-10.] Attack vectors:
- Immutability: grep for any UPDATE/DELETE path on recipe_input — finding one is a BLOCKER (raw
  record untouched, B3 TC-03, C-41).
- Two-fenugreek survival: golden paste → draft lines contain two distinct fenugreek lines (BLOCKER
  if merged).
- Photo storage: no image bytes in Postgres (grep BLOB/BYTEA usage); URI stored, object exists;
  object-storage upload failure → no URI persisted (QG4 cell). A persisted URI for a missing object
  is a BLOCKER.
- Q4 hygiene: draft-line writer must match the Q4 answer recorded in HANDOFF.md; if Q4 was open, the
  unit must have STOPPED and raised it (DISPATCH D-10 deliverable 2) — a silently chosen writer while
  Q4 is open is a BLOCKER (OPEN DECISION hygiene).
```

## A-11 — Audit: OCR adapter + flagging

```text
[Preamble for D-11.] Attack vectors:
- INV-04 (BLOCKER class): feed OCR output with low confidence on N lines → all N flagged needs_review
  = TRUE, zero dropped. Drop-on-low-confidence is a BLOCKER.
- Adapter seam: provider responses are normalized before entering the domain (SCAFFOLD §3) — feed a
  vendor-shaped fixture and check no vendor field names leak past the adapter (leak = MAJOR).
- Golden photo: the OCR stub + real-card benchmark both assert Fish 500g / Drumstick 1 / Mango 1/2 /
  Half Shell coconut / both fenugreeks / no garlic — a missing golden-OCR assertion is a BLOCKER.
- QG4 cells: OCR timeout/down → recipe_input + photo preserved, retryable (Tech Stack §21) — kill the
  mock provider mid-intake and verify.
- Q10 hygiene: no provider selection in this unit; the benchmark harness consumes the same adapter
  seam (check the harness interface exists — absence is a MAJOR, it gates Q10 by week 4).
```

## A-12 — Audit: parse review

```text
[Preamble for D-12.] Attack vectors:
- The acceptance-scene edit (BLOCKER class): photograph/load the golden card, split the wrapped
  chilli/coriander line exactly as §15 describes → corrected object carries two lines; recipe_input
  byte-unchanged throughout (hash before/after).
- Two fenugreeks survive review editing (golden invariant) — an edit path that merges them is a BLOCKER.
- Header exclusion: mark a non-ingredient header → absent from the ingredient object (B3 TC-02);
  a header that leaks into the object is a MAJOR.
- Stale-edit protection (QG4 cell): two sessions edit the same line; the stale write is rejected on
  version/updated_at with reload/merge — a lost update is a BLOCKER.
- Dictionary read path: sense confirmation reads the D-29 dictionary via the Q5 working assumption —
  no writes to ingredient_dictionary/ingredient_alias from this unit (one-writer grep; write = BLOCKER).
```

## A-13 — Audit: method attach

```text
[Preamble for D-13.] Attack vectors:
- Refuse-empty-method (§3.4, BLOCKER class): no method, no accepted family match → Views 3/7 flag is
  INCOMPLETE. A fabricated method or a silently "complete" View 3/7 in this state is a BLOCKER.
- INFERRED provenance: accepted matched family method (CDK 1669 / Mrs. Anitha) carries the INFERRED
  tag AND the named source (C4) — a source-less INFERRED is a MAJOR.
- Tag integrity: method_source_tag values ∈ the C4 vocabulary; a new tag invented here is a MAJOR.
- The golden invariant: station-card precondition (method exists or inferred accepted) is exactly
  this unit's flag — cross-check its semantics against C5 before D-20 builds on it (mismatch = MAJOR).
```

## A-14 — Audit: needs_review enqueue gate

```text
[Preamble for D-14.] Attack vectors:
- INV-05 (BLOCKER class): with any active line needs_review = TRUE, enqueue must refuse — try every
  route (direct API, worker poke, duplicate job) and prove none enqueues. Clearing the last flagged
  line unblocks immediately.
- Single source of truth: the gate reads the canonical flag only — a parallel state that can drift is
  a MAJOR (grep for shadow flags).
- Golden path: photo → flagged → blocked → review clean → enqueuable (P2 exit scenario, end-to-end).
- Completeness check reuse: the same check P3 enqueues with — verify the code is shared, not
  duplicated (duplicate implementations = MAJOR; they will drift).
```

## A-15 — Audit: prompt specs + prompt_version

```text
[Preamble for D-15.] Attack vectors:
- Schema conformance (BLOCKER class): every view prompt's outputs validate against the frozen
  packages/schemas on the §6 worked example — run the validation, do not read it from HANDOFF.md.
- Reproducibility: same prompt_version + same stubbed model → identical output (run twice); two runs
  differing with the same version is a MAJOR (this is the reproducibility contract D-16/D-17 inherit).
- Mode separation: home vs chef system prompts produce different outputs on the same recipe (a single
  shared prompt with a flag is acceptable only if the schemas prove the outputs differ — else MAJOR).
- QG4 cell: invalid model output → regenerate path exists and never publishes (Tech Stack §21) —
  feed a malformed payload and verify the regenerate/INCOMPLETE path.
- Q9 hygiene: no provider pinned; the benchmark harness interface exists (Q9 gates by week 4,
  BUILD_PLAN §7.3).
```

## A-16 — Audit: grounding validator

```text
[Preamble for D-16.] This is the highest-stakes audit of the program; take the time.
- INV-10 truthfulness (BLOCKER class): feed plant fixtures — an invented ingredient, a claim
  referencing a non-captured line, a reworded capture — every one must be caught (ABSENT-marked or
  rejected). A single invented ingredient reaching a view is a BLOCKER.
- Golden fixture: all 8 invariants green through the validator (garlic absence is the sharpest —
  plant garlic in a model output and prove it cannot reach View 1/8/9).
- Regenerate-once semantics: first grounding failure → regenerate; second → view INCOMPLETE, never
  current (INV-10). A third silent attempt or a "current" INCOMPLETE row is a BLOCKER.
- Choke point: every view output path passes through the validator (grep for view-write paths that
  bypass it — any bypass is a BLOCKER).
- Absent-rule scoping: ABSENT markings reference only family-absent items per C1 — an ABSENT for a
  captured ingredient is a MAJOR.
```

## A-17 — Audit: analysis worker

```text
[Preamble for D-17.] Attack vectors:
- One-writer (BLOCKER class): grep the whole repo — the only writer of analysis_* is
  apps/analysis-worker. Any write from the API layer is a BLOCKER (ADR §2).
- Idempotency (INV-11): deliver the same job twice (and twice concurrently) → exactly one current
  analysis, no orphan rows; crash mid-job and restart → converges (QG4 cell).
- NOTIFY is a signal (INV-16): NOTIFY payload loss must not lose state — kill the SSE subscriber,
  mutate status, verify the reload-from-Postgres path recovers (QG4 cell).
- Stuck-state: a failed job must never leave `generating` (P3 exit) — inject a failure and inspect
  the status field.
- Q1/Q13 hygiene: captured-input approach and retry values are labeled working assumptions with
  register IDs in HANDOFF.md; an unlabeled hardcoded policy is a MINOR, a silently shipped ERD v14
  schema change is a BLOCKER.
```

## A-18 — Audit: views 1–4 + home mode

```text
[Preamble for D-18.] Attack vectors:
- Golden invariants (BLOCKER class): full 8-invariant suite green in CI — verify it actually ran
  (not skipped, not commented). Coriander in View 1 AND the View 2 blind-spot note (both must hold
  simultaneously — the "bug that is output" from BUILD_PLAN P3-4).
- No-invention: plant an invented ingredient in the analysis rows → views must render it INCOMPLETE
  or absent, never current (INV-10); inspect rendered View 1 rows against the captured object line
  by line.
- C4 truthfulness: every claim wears exactly one of the six tags; the disagreement module shows the
  coriander case; UNKNOWN fields render blank (not a guess) — a rendered guess is a BLOCKER.
- Identification (C1): all five fields present; family ≠ "generic curry" on the golden fixture.
- Home default: first render is home mode (C3); mode toggle not yet required (P4).
- Two fenugreeks = two uses of one idea — not merged, not double-counted as two ingredients.
```

## A-19 — Audit: views 5–9

```text
[Preamble for D-19.] Attack vectors:
- View 8 mapping fidelity (BLOCKER class): golden fixture → fish + mustard flagged; coconut NOT
  filed as US major tree nut; source is dietary_allergen_definition/mapping via analysis_claim.
  allergen_id (BUILD_PLAN P4-1) — a hardcoded View 8 is a BLOCKER.
- View 9 band (INV-14, BLOCKER class): band on the golden fixture (pot scale); sodium Unknown shown
  as unknown; a point-kcal over a range input is a BLOCKER. Assumption edit (I2) recomputes the band —
  edit fish class and verify the band changes.
- INCOMPLETE semantics: View 7 with absent method renders INCOMPLETE (D-13's flag drives it).
- Disclaimers (H6/I6): verbatim on every View 8/9 surface — screen and print paths both.
- Unmapped lines (I7): excluded from totals and listed — verify on a fixture with an unmapped line.
```

## A-20 — Audit: chef mode + station card

```text
[Preamble for D-20.] Attack vectors:
- Station-card precondition (BLOCKER class): no method + no inferred acceptance → NO station card;
  method or inferred accepted → card exists. The golden invariant states both directions — verify
  both.
- Card content: mise, sequence, do-nots, control points present and derivable from the analysis rows
  (not free prose) — a card that invents a step not in the object is a BLOCKER (INV-10).
- Mode persistence: chef preference saved on account (`account.preferred_mode`); sign out/in restores
  it (C3 TC-03).
- Arm's-length readability: render on a real device at viewing distance; a 6pt text dump is a MAJOR.
- Chef leads with the station card (§7/§8) — verify the chef entry point is the card, not a menu.
```

## A-21 — Audit: disclaimer sweep

```text
[Preamble for D-21.] Attack vectors:
- INV-13 (BLOCKER class): grep the entire View 8 output surface + static gates for "safe" — any
  occurrence (including "safe to eat" paraphrases on any surface) is a BLOCKER. Plant one to prove
  the gate fires.
- INV-14 (BLOCKER class): plant a point-kcal over a range input — the runtime assertion AND the
  static gate must both catch it.
- Verbatim texts: H6 and I6 exact texts on every surface — screen, print templates, one-pager (E6
  later); a truncated paraphrase is a MAJOR.
- Gate permanence: both checks are in regression-gates.sh and wired into CI (not a one-off test
  script) — a one-off is a MAJOR (TEST_PLAN QG2: gates hold between audits).
```

## A-22 — Audit: library save/browse/delete

```text
[Preamble for D-22.] Attack vectors:
- Save completeness (BLOCKER class): save a fully analysed golden recipe → all six artifacts
  (raw input, photo, object, identification, analysis, timestamps) persist; default name = family,
  editable.
- Delete cascade (BLOCKER class): confirm required; after delete, no recipe/analysis/list/log/photo
  residue reachable ANYWHERE — object-storage object gone (or unreachable), no dangling URI, prints/
  snapshots gone. Probe every surface (a residue is a BLOCKER).
- Ownership: A's library cannot see B's recipes (D-09 suite re-asserted on the library surfaces).
- Resume-save: signed-out save → sign-in → save completes onto the account (A1 TC-02 seam, wired
  for real — a silent no-op is a MAJOR).
```

## A-23 — Audit: print list + station card

```text
[Preamble for D-23.] Attack vectors:
- Snapshot-only (INV-12, BLOCKER class): print a recipe, edit the recipe, print again → byte-
  identical PDFs. A changed print is a BLOCKER.
- One page: golden list AND golden station card each fit one A4/Letter page (P7 exit metric — measure
  the actual PDF page count).
- List content (E4): black text, recipe name, date, grouped rows, checkboxes, no account chrome —
  verify each; two fenugreek rows; "to taste"/"for tempering" visible.
- Station card (E5): separate document; control points + "untasted briefing"; allergen line per Q2.
- Q2 hygiene: the allergen-line source matches the Q2 answer; if Q2 was open, the unit must have
  STOPPED (DISPATCH D-23 gate) — a silently chosen source is a BLOCKER (OPEN DECISION hygiene).
- QG4 cell: PDF render failure → retryable error, snapshots unchanged.
```

## A-24 — Audit: cook loop

```text
[Preamble for D-24.] Attack vectors:
- Acceptance-scene re-run (BLOCKER class): the full §15 cook step — log, rate 4, note "2 green
  chillies, fenugreek powder off heat", reopen Sunday → next-time line at the top, garlic still
  absent, list printable. Any deviation from the scene's outcomes is a BLOCKER.
- F1 semantics: cooked_at defaults today, editable; multiple logs per recipe (not one row overwritten —
  an UPSERT-over-log is a MAJOR); library shows last cooked.
- Privacy: notes/ratings are private — cross-account access returns nothing (ownership suite).
- Header recall (F6): the note appears above the analysis on reopen — verify DOM order.
```

## A-25 — Audit: aliases, tags, edit + re-analyse

```text
[Preamble for D-25.] Attack vectors:
- Alias resolution (BLOCKER class): all five source groups resolve (drumstick/murungakkai/moringa;
  shallots/chinna vengayam/cheriya ulli; fenugreek/methi/uluva/vendhayam; tamarind/puli; curry
  leaves/karuveppilai); ambiguous "drumstick" asks confirmation (requires_confirmation).
- One-writer (Q5): no writes to ingredient_dictionary/ingredient_alias outside the admin module —
  grep; a write here is a BLOCKER.
- Snapshot chain (BLOCKER class): re-analyse → previous analysis is a linked snapshot; existing cook
  logs still point at their original analysis; cook notes untouched (C6 — a silently overwritten note
  is a BLOCKER).
- Explicit re-run only: an edit must never auto-trigger analysis (C6) — edit and confirm no enqueue.
- C7 preview: states structural/modular/identity-shift; invents nothing (INV-10) — plant an invented
  ingredient in the preview path and prove it cannot render.
```

## A-26 — Audit: profiles, swaps, next-time, I3/I4

```text
[Preamble for D-26.] Attack vectors:
- Profile semantics (BLOCKER class): configure allergens/diet patterns/US/EU pack; a conflicting
  recipe highlights conflicts FIRST; unknown is shown as unknown, never a pass (H3); no recipe is
  ever auto-deleted (H1).
- Swap immutability: record skipped/reduced/increased/swapped → card unchanged unless the swap is
  explicitly applied (F3/H5). A silent card rewrite is a BLOCKER.
- Next-time tagging (F4): the line prints on the station card tagged COOK LOG, never CARD — check the
  rendered card's provenance tags.
- I3/Q14 (BLOCKER class): per-bowl band appears ONLY after portions are set; Q14 is not decided —
  the seam + HANDOFF label must exist. A persisted portion column shipped while Q14 is open is a
  BLOCKER (OPEN DECISION hygiene).
- I4: name fish / weigh coconut / measure oil → band narrows — verify each tightening input moves
  the band in the right direction.
```

## A-27 — Audit: regional veto + retention/ops

```text
[Preamble for D-27.] Attack vectors:
- Veto workflow (BLOCKER class): reviewer vetoes a live View 5 regional sentence → blocked from
  live views immediately (G2 TC-01); both regional reviewers configured on the fish-curry cluster
  (G2 TC-02). A veto that leaves the sentence live anywhere is a BLOCKER.
- Q6 hygiene: the publishable-state home is a labeled working assumption (manual queue vs
  analysis_claim status column) — a silently invented status column is a BLOCKER.
- Cleanup jobs: expired unclaimed guests removed (QG4 cell); Q11/Q15 pilot defaults labeled with
  register IDs in HANDOFF.md.
- Ops docs exist: runbook, backup/restore, upgrade windows, monitoring (Tech Stack §17) — missing
  backup documentation is a MAJOR for a pilot gate.
```

## A-28 — Audit: week-12 pilot gate (closing sweep)

```text
[Preamble for D-28.] This audit runs the program-final sweep.
- Go metrics (BLOCKER class, re-executed, not read): zero invented ingredients on the golden fixture;
  three curries separable in chef mode (Kumari / inland Tamil / Kerala kudampuli — identifications
  differ); prints fit one page; photo→first analysis under 2 minutes including parse correction;
  no "safe"; no point-kcal (Recipe_Systems §14).
- §14 go line: Must stories work on the golden fixture and on the twenty messy recipes (messy_20/
  set); View 5 not vetoed wholesale; cooks used save + list + log without coaching (pilot log
  evidence).
- Blocker regression sweep: re-run every prior audit's BLOCKER-class check once more on the pilot
  commit (one-writer greps, INV-04/05/10/12/13/14 checks, two-fenugreeks, XOR/claim, ownership
  escape, golden suite in CI).
- Acceptance scene end-to-end (§15): Priya's full walk, unassisted, with the evidence trail.
- OPEN DECISION register: Q1–Q17 still open, none silently resolved by pilot code (final hygiene
  check — register diff vs SCAFFOLD §7).
This green = the 12-week pilot program is built per spec.
```

## A-29 — Audit: track R reference data

```text
[Preamble for D-29.] Attack vectors:
- Reviewed path (BLOCKER class): an unreviewed mapping change must not be able to alter View 8/9 —
  attempt the bypass (direct table write, API without approval step) and prove rejection. The
  import→diff→approval→effective-dated flow must be the ONLY writer (one-writer grep).
- Overlap rejection: two effective-dated rows overlapping → EXCLUDE USING gist rejects (QG4 cell).
- Versioning: a mapping change creates a new version, never an in-place edit (an UPDATE to a
  historical version is a BLOCKER).
- I7 fidelity: USDA/peer IDs on mapped lines; unmapped lines excluded from totals and listed —
  verify on a fixture with unmapped lines.
- Q5 hygiene: dictionary/alias writer = admin module working assumption, labeled; no decision made
  (OPEN DECISION hygiene).
```

## A-30 — Audit: track S shopping data

```text
[Preamble for D-30.] Attack vectors:
- List truthfulness (BLOCKER class): generated from the structured object — one row per ingredient,
  two fenugreek rows, no headers, "to taste"/"for tempering" visible (E1 TCs). A list row with no
  source line (invented) is a BLOCKER.
- State persistence (QG4/E2): have/need survives list regeneration and reopen; soft-delete of a line
  cleans its shopping state (C-28 trigger scenario) — orphaned state after soft-delete is a MAJOR.
- Composite FK: state rows reference recipe_ingredient_line(recipe_id, shopping_key) — a state row
  with a dangling FK is a BLOCKER (ERD §7).
- Grouping (E3): five categories correct; an item in two groups is a MINOR, a category invented
  beyond the source list is a MAJOR.
- Seam to P5: the printed surface consumes this data layer only (no parallel list logic in D-23) —
  grep the print path for a second generation implementation (duplication = MAJOR).
```

## A-31 — Audit: could-have tail (E6, F5, I5)

```text
[Preamble for D-31.] Attack vectors:
- Conditional-dispatch proof (BLOCKER class): the HANDOFF entry must record the §13 stability evidence
  (the week 9–10 Must work was stable at dispatch). A unit run without that evidence is a BLOCKER.
- E6 truthfulness: one-pager sections = keep / negotiate / identity-shift + ingredient list, derived
  from the analysis rows (INV-10 — a fabricated line is a BLOCKER); nothing presented as a legal
  nutrition label; the energy band absent unless I5 is enabled.
- I5 boundary: the energy band appears ONLY on the one-pager — scan the market-list print path for any
  band (a band on the market list is a BLOCKER); the band stays a band (INV-14 — a point-kcal over a
  range input is a BLOCKER).
- F5 semantics: exactly one image per cook log; attaching a photo triggers NO analysis unless asked
  (watch for enqueue calls in the diff).
- Drift: no analysis-engine changes anywhere in this unit's diff (a prompt/grounding edit is a BLOCKER —
  the could-have tail must not touch the spine).
```
