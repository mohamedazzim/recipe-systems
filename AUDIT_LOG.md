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
