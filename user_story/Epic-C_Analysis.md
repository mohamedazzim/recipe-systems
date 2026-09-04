# Epic C — Analysis (C1–C7)

> **Epic:** C — Analysis · **Stories:** C1 (Must), C2 (Must), C3 (Must), C4 (Must), C5 (Must), C6 (Should), C7 (Could — conditional per §13) · **Domain:** Analysis / Nine views / Modes
> **Boundaries:** the nine views "are the product. They are contracts" (§3); the nine-view JSON schemas freeze at P0 (wks 1–2) and the prompts consume them (BUILD_PLAN §1.2). The Analysis worker is the only writer of `analysis_*` (ADR §2). Every claim wears exactly one of CARD | METHOD | INFERRED | ABSENT | UNKNOWN | ASSUMED (§3.2); unknown fields stay blank. Grounding enforces no-invention (INV-10, ADR §6). LLM provider is OPEN DECISION Q9.
> **Full detail:** description + acceptance criteria + test cases + API + data + traceability. Source: Recipe_Systems.md §12.
> **Canonical note:** canonical split representation of Epic C from `USER_STORIES.md` v1.1 — story IDs, acceptance criteria, and test cases preserved exactly; only the presentation follows the mentor's epic-file format.

---

## C1 — Identify the dish family

| Field | Value |
|---|---|
| **Story ID** | C1 |
| **Epic ref** | Epic C — Analysis (Recipe_Systems §12) |
| **Phase** | P3 (wks 5–6) |
| **Domain** | Analysis / Identification |
| **Priority** | Must |

**Badges:** UI · Backend · Worker · Priority: Must · Q9 (OPEN DECISION — LLM provider)

### Description

**As a cook**, I want the product to **identify the dish family** — family, one-line architecture, confidence, not-this neighbours, ABSENT family items — so that **I know what I am actually cooking**. The golden fixture is not "generic Indian curry." (Recipe_Systems.md §12)

### Acceptance Criteria

- AC-1: Family, one-line architecture, confidence, not-this neighbours, ABSENT family items.
- AC-2: Golden fixture is not "generic Indian curry."

### Test Cases

**TC-01 — Full identification block**
- Given: the golden fixture analysis
- When: identification runs
- Then: the identification block contains all five fields

**TC-02 — Not a generic classification**
- Given: the golden fixture analysis
- When: identification runs
- Then: the family is not "generic Indian curry" (golden invariant)

### API Endpoints

Not yet defined at the design stage. Specified by dispatch units **D-15** (prompt spec) and **D-18** (views rendering); `prompt_version` persisted per analysis (ERD `analysis.prompt_version`).

### Data

| Entity | Role | Source |
|---|---|---|
| `analysis` | `family`, `family_confidence`, `architecture_summary`, `not_this_neighbors`, `absent_family_items` | ERD §6 |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-15, D-16, D-18 | A-15, A-16, A-18 | H-15, H-16, H-18 | ERD §17 ✅ | Q9 (LLM provider) |

---

## C2 — Run all views

| Field | Value |
|---|---|
| **Story ID** | C2 |
| **Epic ref** | Epic C — Analysis (Recipe_Systems §12) |
| **Phase** | P3 views 1–4 (wks 5–6); P4 views 5–9 (wks 7–8) |
| **Domain** | Analysis / Nine views |
| **Priority** | Must |

**Badges:** UI · Backend · Worker · Priority: Must · Q9 (OPEN DECISION — LLM provider)

### Description

**As a cook**, I want **all nine views to run** — or a view to be explicitly INCOMPLETE — with **no invented ingredients**. Coriander appears in View 1; View 2 records the pillar blind spot. Two fenugreeks are treated as two uses of one idea. (Recipe_Systems.md §12)

### Acceptance Criteria

- AC-1: All nine render, or a view is explicitly INCOMPLETE.
- AC-2: No invented ingredients.
- AC-3: Coriander in View 1; View 2 records the pillar blind spot.
- AC-4: Two fenugreeks treated as two uses of one idea.

### Test Cases

**TC-01 — All nine render**
- Given: a complete analysed recipe
- When: the views render
- Then: all nine views render

**TC-02 — Explicit INCOMPLETE**
- Given: an analysed recipe with missing inputs
- When: the affected views render
- Then: they render INCOMPLETE, explicitly

**TC-03 — Zero invented ingredients**
- Given: any analysed recipe
- When: views are inspected for items not on the card
- Then: zero invented ingredients (INV-10)

**TC-04 — Coriander in both places**
- Given: the golden fixture
- When: Views 1 and 2 render
- Then: coriander is present in View 1 and View 2 records the blind-spot note

**TC-05 — Two fenugreeks, one idea**
- Given: the golden fixture
- When: views render
- Then: two fenugreek lines are treated as two uses of one idea — never merged

### API Endpoints

Not yet defined at the design stage. Views render from `analysis_*` rows (worker-written) per the frozen P0-5 schemas; status arrives via SSE (Tech Stack §13). Specified by dispatch units **D-18** (views 1–4) and **D-19** (views 5–9).

### Data

| Entity | Role | Source |
|---|---|---|
| `analysis_view` | one row per view 1..9; INCOMPLETE state | ERD §6 |
| `analysis_claim` | per-view claims with tags | ERD §6 |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-18, D-19 | A-18, A-19 | H-18, H-19 | ERD §17 ✅ (service-enforced completeness) | Q9 (LLM provider) |

---

## C3 — Toggle home and chef mode

| Field | Value |
|---|---|
| **Story ID** | C3 |
| **Epic ref** | Epic C — Analysis (Recipe_Systems §12) |
| **Phase** | P4 (wks 7–8) |
| **Domain** | Modes |
| **Priority** | Must |

**Badges:** UI · Backend · Priority: Must

### Description

**As a cook**, I want to **toggle between home and chef mode** so that **the product matches how I am using it**. Default home. Chef leads with the station card. Mode preference saved on the account. (Recipe_Systems.md §12)

### Acceptance Criteria

- AC-1: Default home. Chef leads with station card.
- AC-2: Mode preference saved on the account.

### Test Cases

**TC-01 — Home by default**
- Given: an analysis opened fresh
- When: the views render
- Then: home mode is the default

**TC-02 — Chef leads with the station card**
- Given: the mode is toggled to chef
- When: the views render
- Then: the station card leads the view

**TC-03 — Preference persists**
- Given: a preference set, then sign out
- When: signing back in
- Then: the preference is persisted on the account

### API Endpoints

Not yet defined at the design stage. Specified by dispatch unit **D-20** (toggle semantics open — ERD §15.4; label as such, do not decide).

### Data

| Entity | Role | Source |
|---|---|---|
| `account.preferred_mode` | persisted preference | ERD §5 |
| `analysis.mode` | per-analysis mode | ERD §6 |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-20 | A-20 | H-20 | ERD §17 ✅ (toggle semantics open, §15.4) | — |

---

## C4 — Claim tags and disagreements

| Field | Value |
|---|---|
| **Story ID** | C4 |
| **Epic ref** | Epic C — Analysis (Recipe_Systems §12) |
| **Phase** | P3 (wks 5–6) |
| **Domain** | Analysis / Provenance |
| **Priority** | Must |

**Badges:** UI · Backend · Worker · Priority: Must

### Description

**As a cook**, I want **claim tags and disagreements visible** — CARD / METHOD / INFERRED / ABSENT / UNKNOWN / ASSUMED — so that **I know where every statement comes from**. Inferred method names its source. The disagreement module can show the coriander case. UNKNOWN fields stay blank. (Recipe_Systems.md §12)

### Acceptance Criteria

- AC-1: CARD / METHOD / INFERRED / ABSENT / UNKNOWN / ASSUMED visible.
- AC-2: Inferred method names its source.
- AC-3: Disagreement module can show the coriander case.
- AC-4: UNKNOWN fields stay blank.

### Test Cases

**TC-01 — Exactly one tag per claim**
- Given: claims across views
- When: inspected
- Then: every claim wears exactly one of the six tags

**TC-02 — INFERRED names its source**
- Given: an INFERRED method claim
- When: viewed
- Then: the source is named

**TC-03 — Disagreement module shows the coriander case**
- Given: the golden fixture
- When: the disagreement module is opened
- Then: the coriander case (View 1 vs View 2) is shown

**TC-04 — UNKNOWN stays blank**
- Given: a field whose value is unknown
- When: viewed
- Then: it renders blank — never fabricated

### API Endpoints

Not yet defined at the design stage. Specified by dispatch unit **D-18**.

### Data

| Entity | Role | Source |
|---|---|---|
| `analysis_claim` | `claim_tag` (CHECK-constrained to the six), `source_reference` | ERD §6 |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-18 | A-18 | H-18 | ERD §17 ✅ | — |

---

## C5 — Station card

| Field | Value |
|---|---|
| **Story ID** | C5 |
| **Epic ref** | Epic C — Analysis (Recipe_Systems §12) |
| **Phase** | P4 (wks 7–8) |
| **Domain** | Analysis / Chef |
| **Priority** | Must |

**Badges:** UI · Backend · Worker · Print (surface in P5) · Priority: Must

### Description

**As a cook**, I want a **station card** — mise, sequence, do-nots, control points, printable — generated **when a method exists or an inferred method was accepted**. (Recipe_Systems.md §12)

### Acceptance Criteria

- AC-1: Generated when a method exists or an inferred method was accepted.
- AC-2: Mise, sequence, do-nots, control points. Printable.

### Test Cases

**TC-01 — Generation precondition**
- Given: an analysis with a method (entered or accepted-inferred)
- When: the analysis renders
- Then: the station card is generated

**TC-02 — Card content**
- Given: a generated station card
- When: inspected
- Then: mise, sequence, do-nots, control points are present

**TC-03 — Printable**
- Given: a generated station card
- When: printed
- Then: it is printable (golden invariant: card appears when an inferred method is accepted)

### API Endpoints

Not yet defined at the design stage. Card content derives from the analysis rows (INV-10 — no step invented). Specified by dispatch unit **D-20**; printing itself is D-23 (P5).

### Data

| Entity | Role | Source |
|---|---|---|
| `analysis_station_card` | card content | ERD §6 |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-20 | A-20 | H-20 | ERD §17 ✅ | — |

---

## C6 — Re-analyse after edit

| Field | Value |
|---|---|
| **Story ID** | C6 |
| **Epic ref** | Epic C — Analysis (Recipe_Systems §12) |
| **Phase** | P7 (wks 11–12) |
| **Domain** | Analysis |
| **Priority** | Should |

**Badges:** UI · Backend · Worker · Priority: Should

### Description

**As a cook**, I want **re-analysis to run only on explicit request** and **never silently overwrite cook notes**. (Recipe_Systems.md §12)

### Acceptance Criteria

- AC-1: Explicit re-run.
- AC-2: Does not silently overwrite cook notes.

### Test Cases

**TC-01 — Explicit only**
- Given: an edited saved recipe
- When: the edit completes
- Then: re-analysis runs only on explicit request

**TC-02 — Cook notes preserved**
- Given: a recipe with cook logs, re-analysed
- When: the logs are reopened
- Then: cook notes are preserved; the previous analysis is snapshotted (D5 chain)

### API Endpoints

Not yet defined at the design stage. Specified by dispatch unit **D-25**.

### Data

| Entity | Role | Source |
|---|---|---|
| `analysis.snapshot_of_analysis_id`, `is_current` | snapshot chain | ERD §6 |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-25 | A-25 | H-25 | ERD §17 ✅ | — |

---

## C7 — Preview a substitution

| Field | Value |
|---|---|
| **Story ID** | C7 |
| **Epic ref** | Epic C — Analysis (Recipe_Systems §12) |
| **Phase** | P7 (wks 11–12) — conditional per §13 (could-haves ship only if Must on weeks 9–10 is stable) |
| **Domain** | Analysis |
| **Priority** | Could |

**Badges:** UI · Backend · Worker · Priority: Could · §13-conditional

### Description

**As a cook**, I want to **preview one substitution from View 4** — stated as structural / modular / identity-shift — **without inventing a new recipe**. (Recipe_Systems.md §12)

### Acceptance Criteria

- AC-1: One swap from View 4.
- AC-2: States structural / modular / identity-shift.
- AC-3: Does not invent a new recipe.

### Test Cases

**TC-01 — Preview states the shift class**
- Given: one swap from View 4
- When: previewed
- Then: the preview states structural / modular / identity-shift

**TC-02 — Nothing invented**
- Given: a substitution preview
- When: inspected
- Then: no new recipe is invented (no-invention rule holds, INV-10)

### API Endpoints

Not yet defined at the design stage. Specified by dispatch unit **D-25** (conditional per §13 — the stability evidence is recorded in HANDOFF if dispatched).

### Data

| Entity | Role | Source |
|---|---|---|
| — (preview only; no new persistence defined) | — | ERD §17 ✅ |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-25 | A-25 | H-25 | ERD §17 ✅ | — |

---

*End of Epic C — Analysis. Stories C1–C7.*
