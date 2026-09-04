# Recipe Systems — Change Log

**Status:** v1.1 · 2026-09-04 · Chronological project memory. Every entry records what changed, why, and its effect on the OPEN DECISION register (SCAFFOLD §7). Newest first.
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

**Rule:** a change that alters any Q1–Q18 row must say so in its entry. The register (SCAFFOLD §7) is the single source of truth for open decisions; this log records the history of how the register changed.

---

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
