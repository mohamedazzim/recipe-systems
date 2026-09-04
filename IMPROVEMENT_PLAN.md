# Recipe Systems — Improvement Plan

**Status:** v1.1 · 2026-09-04 · Gaps, risks, technical debt, and improvements, each traced to where the sources declare it. v1.1 review fix: priority-summary descriptions now match the sections. **This plan resolves nothing** — every Q-item below stays OPEN in the SCAFFOLD §7 register; resolving one requires the register's own process (a reviewed patch, never a silent edit).
**Companions:** [SCAFFOLD.md](SCAFFOLD.md) §7 (the register — single source of truth for Q1–Q18) · [BUILD_PLAN.md](BUILD_PLAN.md) §7 (sequencing risks) · [USER_STORIES.md](USER_STORIES.md) · [DISPATCH.md](DISPATCH.md) · [TEST_PLAN.md](TEST_PLAN.md) · [CHANGE_LOG.md](CHANGE_LOG.md)

---

## Priority summary

| Priority | Count | Description |
|---|---|---|
| 🔴 P0 — blocks pilot weeks | 6 | Q1, Q2, Q3, Q4, Q5, Q9/Q10 |
| 🟠 P1 — gates later weeks | 6 | Q7, Q8, Q11, Q12, Q13, reviewer staffing |
| 🟡 P2 — post-pilot / non-blocking | 12+ | Q6, Q14, Q15, Q16, Q17 + ERD §15 open questions |

**Resolution rule (TEST_PLAN §5, binding):** a decision from the register that changes a phase's inputs re-runs that phase's gates — this plan assumes none of them silently. Each item below names the phase it gates and the check that re-runs.

---

## 🔴 P0 — blocks the pilot schedule

### P0-1. Q1 — Analysis-input snapshot persistence *(due week 5)*

**Declared in:** ADR §6 vs ERD `analysis` (SCAFFOLD §7 Q1). **Gates:** P3 worker finalization (BUILD_PLAN §7.2).
**Problem:** the worker must re-run an analysis from captured inputs; whether those inputs live in the job payload or an ERD v14 column is undecided.
**Options on the table:** worker/job-payload (working assumption available) vs ERD v14 column (requires an ERD revision). **Status:** OPEN — D-17 builds to the labeled assumption until answered.
**Re-run on resolution:** P3 gates (D-15…D-18 audits + golden suite).

### P0-2. Q9/Q10 — LLM and OCR provider benchmarks *(due weeks 1–4)*

**Declared in:** Tech Stack §1/§25.4 (Q9), §11/§25.5 (Q10). **Gates:** P3 prompt layer and P2 OCR (BUILD_PLAN §7.3 — the benchmark must land before P3/P2 ship).
**Problem:** provider selection is deferred to a quality/cost/grounding benchmark (Q9) and a real-card OCR benchmark (Q10); the benchmark harness is scaffolded in D-11/D-15 but the decisions are people+data decisions.
**Options on the table:** run the harness on the D-04 corpus + real-card photos in weeks 1–4; record; decide. **Status:** OPEN.

### P0-3. Q3 — Topology diagram still draws the Worker→OCR edge *(confirm before P2 OCR work)*

**Declared in:** ADR §2/§10 vs Tech Stack §18 (SCAFFOLD §7 Q3). **Gates:** P2 OCR work (BUILD_PLAN §7.1).
**Problem:** `diagram.png` (now canonical in ADR §10) draws an edge the ADR contradicts — OCR is Intake-only (ADR §2 Decision 3).
**Fix on the table:** regenerate `diagram.png` without that edge. **Status:** OPEN — visual check confirmed the edge is present.

### P0-4. Q4 — Single writer of `recipe_ingredient_line` *(before P2 ships draft lines)*

**Declared in:** ADR §2 one-writer list vs INV-03 (SCAFFOLD §7 Q4). **Gates:** P2 draft lines (BUILD_PLAN §1.3; D-10 stops and raises it if still open).
**Problem:** Intake drafts and Web API corrections both plausibly write draft lines; the one-writer rule needs one answer. **Status:** OPEN.

### P0-5. Q5 — Writer of `ingredient_dictionary` / `ingredient_alias` *(before Track R curation)*

**Declared in:** ADR §2 (unnamed) (SCAFFOLD §7 Q5). **Gates:** Track R curation feeding P2 sense confirmation (BUILD_PLAN §1.3).
**Working assumption in force:** the admin/reference-data module writes them (TEST_PLAN QG2, D-29). **Status:** OPEN.

### P0-6. Q2 — Printed allergen-line source *(due week 8)*

**Declared in:** E4/H4/E5 vs ADR §7 permitted-source table (SCAFFOLD §7 Q2). **Gates:** P5 print (BUILD_PLAN §7.1; D-23 stops and raises it if still open).
**Problem:** the allergen line must come from somewhere under the snapshot-only render rule (INV-12); which permitted source is undecided. **Status:** OPEN. *(Classified P0 because its week-8 deadline drives the week-1–8 window alongside Q1.)*

---

## 🟠 P1 — gates later weeks

### P1-1. Q8 — IdP: Keycloak pilot vs Auth0 *(reconcile by P1 start)*

**Declared in:** Tech Stack §25.3 (sources recommend Auth0). **Gates:** P1 identity, but not intake (BUILD_PLAN §7.5 — P2 needs guest sessions only).
**Working assumption in force:** Keycloak as pilot IdP, Auth0 as managed fallback; Keycloak work is discardable if Auth0 wins; nothing started before P1. **Status:** OPEN.

### P1-2. Q7 — Cloud vendor + managed-PG provider *(lead time)*

**Declared in:** Tech Stack §25. **Gates:** nothing in dev (compose/MinIO cover it) but production procurement is pure lead time (BUILD_PLAN §7.6). **Status:** OPEN.

### P1-3. Q11 — Guest-session TTL + cleanup schedule *(needed before P7)*

**Declared in:** ERD §15.12, ADR §24.7. **Gates:** P7 retention jobs (D-27). Pilot defaults documented in D-08 until answered. **Status:** OPEN.

### P1-4. Q12 — RPO / RTO targets *(needed before P7)*

**Declared in:** ADR §17, §24.11. **Gates:** P7 ops docs (D-27; BUILD_PLAN §7.7). **Status:** OPEN.

### P1-5. Q13 — Retry counts / backoff values *(needed before P7; pilot defaults at P3)*

**Declared in:** ADR §24.12. **Gates:** P3 defaults (D-17, labeled), revalidated at P7 (BUILD_PLAN P3-3). **Status:** OPEN.

### P1-6. Reviewer staffing *(weeks 1–2, real people)*

**Declared in:** Recipe_Systems §13 (two regional reviewers on contract, weeks 1–2). **Gates:** G2/G3 adversarial passes (BUILD_PLAN §7.9).
**Risk:** reviewers are people with calendars; their unavailability stalls week 8 and week 12 gates. D-04 tracks the roster. **Status:** process tracked, not a Q-item.

---

## 🟡 P2 — post-pilot / non-blocking

### P2-1. Q14 — I3 portion-count persistence

**Declared in:** ERD §15.6, §17 (I3 is the one story ERD leaves honestly open). **Status:** OPEN — D-26 builds the per-bowl band behind a labeled seam; revisit post-pilot (BUILD_PLAN §7.8).

### P2-2. Q6 — G2 "publishable" state home

**Declared in:** ADR §8 (manual queue vs `analysis_claim` status column). **Status:** OPEN — D-27 builds to the labeled working assumption.

### P2-3. Q15 — Account erasure / photo retention windows

**Declared in:** ERD §15.11. **Status:** OPEN — D-27 uses labeled pilot defaults.

### P2-4. Q16 — Freeze `Recipe_Systems.md` as v1.0

**Declared in:** ERD header ("three FINAL docs pin a draft"). **Status:** OPEN — the spec is still a working draft while the ERD/ADR/Tech Stack are FINAL; freezing needs a review pass.

### P2-5. Q17 — Workflow PNG policy

**Declared in:** SCAFFOLD §7 Q17 (narrowed 2026-09-04). **Problem:** `recipe_app_workflow_diagram_v2_fixed.png` is unreferenced; retain, reference, or delete is undecided. **Status:** OPEN.

### P2-6. ERD §15 open questions (12 items, source-declared)

`include_on_list` semantics · diet-pattern vocabulary · recipe-input history retention · analysis regeneration granularity · restriction-profile label-pack precedence · nutrition serving persistence · method representation/versioning · exact JSON contracts for view payloads and station-card sections (P0-5 freezes the pilot answer for this one — record, don't close the question) · unmapped-ingredient nutrition/allergen lookup · account hard-delete / GDPR-style erasure · guest-session TTL (also Q11) · `Analysis.tags` as a possibly-distinct entity. **Status:** all OPEN (ERD §15; item 9 resolved as C-28).

### P2-7. Sources-silent conventions this plan relies on (flagged, not decided)

- **No staging environment** (TEST_PLAN §4, labeled convention — the sources are silent).
- **IdP-down behavior** (TEST_PLAN QG4 — 503 envelope, no fallthrough, labeled "plan addition").
- **The 20 messy week-12 recipes live in a separate named set** (TEST_PLAN QG5 convention — the source says "twenty other messy recipes" without stating inside/outside the 50-corpus).
Each is a candidate for source amendment if the team wants them normative.

### P2-8. Technical-debt watch items (from BUILD_PLAN §7.5)

- **Keycloak-specific work is discardable** if Q8 lands on Auth0: the compose/realm work in D-06 is the throwaway; the OIDC adapter seam is the investment. Minimize Keycloak-specific surface outside `infra/keycloak/` + the adapter.
- **Benchmark harness** (D-11/D-15) is the only place real LLM/OCR providers run in the pilot — keep it budget-gated and out of CI (TEST_PLAN §4).

---

## Improvement backlog checklist (all OPEN — nothing checked)

- [ ] Q1 answered (wk 5) → P3 gates re-run
- [ ] Q2 answered (wk 8) → P5 print gate re-run
- [ ] Q3: regenerate `diagram.png` without the Worker→OCR edge
- [ ] Q4 answered → P2 draft-line work unblocks
- [ ] Q5 answered → Track R curation finalizes
- [ ] Q6 answered → D-27 publishable-state home finalizes
- [ ] Q7 answered → production procurement starts
- [ ] Q8 answered → P1 IdP path fixed (Keycloak or Auth0)
- [ ] Q9/Q10 benchmarked and answered (wks 1–4)
- [ ] Q11/Q12/Q13 answered (before P7) → ops docs finalize
- [ ] Q14 answered (post-pilot) → I3 persistence
- [ ] Q15 answered → erasure/retention jobs finalize
- [ ] Q16: `Recipe_Systems.md` frozen as v1.0
- [ ] Q17: workflow PNG policy (retain / reference / delete)
- [ ] ERD §15 items triaged into the register or resolved by reviewed patch
- [ ] Staging / IdP-down / messy-20 conventions proposed to the sources if the team wants them normative

**Rule:** when any row above is answered, update SCAFFOLD §7 (the register), add a CHANGE_LOG entry, and re-run the phase gates TEST_PLAN §5 names. Until then, every dispatch unit treats these as OPEN.
