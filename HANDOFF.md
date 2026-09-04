# Recipe Systems — Handoff Evidence

**Status:** v1.1 · 2026-09-04 · The evidence ledger proving every dispatch unit is DONE. One entry per unit (H-01…H-31), appended by the builder, re-executed by the paired audit (AUDIT.md). v1.1 review fix: H-31 added for the could-have tail (D-31); the P7 matrix row split accordingly. **All entries start empty** — nothing has been built yet; this document is the evidence model the program will fill.
**Companions:** [DISPATCH.md](DISPATCH.md) (the tasks) · [AUDIT.md](AUDIT.md) (the verification) · [TEST_PLAN.md](TEST_PLAN.md) (the gates the evidence must satisfy) · [USER_STORIES.md](USER_STORIES.md) (the requirements the evidence traces to)

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
- OPEN DECISION notes (which Q1–Q17 items this unit touched, under which labeled working assumption, with register IDs):
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

☐ No entry yet.

### H-02 — D-02 ERD v13 migrations

☐ No entry yet.

### H-03 — D-03 Golden fixture scaffold

☐ No entry yet.

### H-04 — D-04 50-recipe corpus + reviewers

☐ No entry yet.

### H-05 — D-05 Nine-view JSON schemas frozen

☐ No entry yet.

### H-06 — D-06 IdP setup (Q8 working assumption)

☐ No entry yet.

### H-07 — D-07 OIDC cookies + account creation

☐ No entry yet.

### H-08 — D-08 Guest sessions + claim transaction

☐ No entry yet.

### H-09 — D-09 Ownership enforcement

☐ No entry yet.

### H-10 — D-10 Raw intake rows + photo pipeline

☐ No entry yet.

### H-11 — D-11 OCR adapter + low-confidence flagging

☐ No entry yet.

### H-12 — D-12 Parse review

☐ No entry yet.

### H-13 — D-13 Method attach

☐ No entry yet.

### H-14 — D-14 needs_review enqueue gate

☐ No entry yet.

### H-15 — D-15 Prompt specs + prompt_version

☐ No entry yet.

### H-16 — D-16 Grounding validator

☐ No entry yet.

### H-17 — D-17 Analysis worker

☐ No entry yet.

### H-18 — D-18 Views 1–4 + home mode

☐ No entry yet.

### H-19 — D-19 Views 5–9

☐ No entry yet.

### H-20 — D-20 Chef mode + station card

☐ No entry yet.

### H-21 — D-21 Disclaimer sweep

☐ No entry yet.

### H-22 — D-22 Library save / browse / delete

☐ No entry yet.

### H-23 — D-23 Print list + station card

☐ No entry yet.

### H-24 — D-24 Cook loop

☐ No entry yet.

### H-25 — D-25 Aliases, tags, edit + re-analyse

☐ No entry yet.

### H-26 — D-26 Profiles, swaps, next-time, I3/I4

☐ No entry yet.

### H-27 — D-27 Regional veto + retention/ops

☐ No entry yet.

### H-28 — D-28 Week-12 pilot gate

☐ No entry yet.

### H-29 — D-29 Track R reference data

☐ No entry yet.

### H-30 — D-30 Track S shopping data

☐ No entry yet.

### H-31 — D-31 Could-have tail (E6, F5, I5 — conditional per §13)

☐ No entry yet. (Dispatch is conditional: entry must record the week 9–10 Must-stability evidence before any work.)
