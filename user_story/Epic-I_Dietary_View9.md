# Epic I — Nutrition bands / View 9 (I1–I7)

> **Epic:** I — Nutrition bands (View 9) · **Stories:** I1 (Must), I2 (Must), I3 (Should — Q14-gated), I4 (Should), I5 (Could — conditional per §13), I6 (Must), I7 (Must) · **Domain:** Nutrition / View 9
> **Boundaries:** View 9 is always a band, never a point-kcal over range inputs (INV-14). "Table estimate from stated assumptions. Not a lab analysis. Not medical advice." appears on every surface (I6). The food composition table is versioned with USDA or peer IDs; unmapped lines are excluded from totals and listed (I7). Portion-count persistence is **Q14 (OPEN)** — ERD §17 leaves I3 honestly open.
> **Full detail:** description + acceptance criteria + test cases + API + data + traceability. Source: Recipe_Systems.md §12.
> **Canonical note:** canonical split representation of Epic I from `USER_STORIES.md` v1.1 — story IDs, acceptance criteria, and test cases preserved exactly; only the presentation follows the mentor's epic-file format.

---

## I1 — Run View 9 as a band

| Field | Value |
|---|---|
| **Story ID** | I1 |
| **Epic ref** | Epic I — Nutrition bands (Recipe_Systems §12) |
| **Phase** | P4 (wks 7–8) |
| **Domain** | Nutrition / View 9 |
| **Priority** | Must |

**Badges:** UI · Backend · Worker · Priority: Must

### Description

**As a cook**, I want **View 9 as a band** — the golden fixture shows a range, not a point. (Recipe_Systems.md §12)

### Acceptance Criteria

- AC-1: Golden fixture shows a range, not a point.

### Test Cases

**TC-01 — Band, not point**
- Given: the golden fixture analysis
- When: View 9 renders
- Then: it shows a band (e.g., 1,300–2,200 kcal for the pot), never a point-kcal

### API Endpoints

Not yet defined at the design stage. View 9 bands come from `nutrition_food_composition_*` (BUILD_PLAN P4-1). Specified by dispatch unit **D-19**.

### Data

| Entity | Role | Source |
|---|---|---|
| `nutrition_food_composition_*` | band inputs | ERD §10 |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-19 | A-19 | H-19 | ERD §17 ✅ | — |

---

## I2 — Show and edit assumptions

| Field | Value |
|---|---|
| **Story ID** | I2 |
| **Epic ref** | Epic I — Nutrition bands (Recipe_Systems §12) |
| **Phase** | P4 (wks 7–8) |
| **Domain** | Nutrition / View 9 |
| **Priority** | Must |

**Badges:** UI · Backend · Priority: Must

### Description

**As a cook**, I want to **see and edit the assumptions** — fish class, coconut grams, oil tablespoons — and **editing recomputes the band**. (Recipe_Systems.md §12)

### Acceptance Criteria

- AC-1: Fish class, coconut grams, oil tablespoons.
- AC-2: Edit recomputes.

### Test Cases

**TC-01 — Assumptions shown**
- Given: View 9
- When: the assumptions are inspected
- Then: fish class, coconut grams, and oil tablespoons are shown

**TC-02 — Edit recomputes**
- Given: an assumption edited
- When: the edit is saved
- Then: the band recomputes

### API Endpoints

Not yet defined at the design stage. Specified by dispatch unit **D-19** (assumption editors).

### Data

| Entity | Role | Source |
|---|---|---|
| — (assumptions feed the band computation) | — | ERD §17 ✅ |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-19 | A-19 | H-19 | ERD §17 ✅ | — |

---

## I3 — Set portions

| Field | Value |
|---|---|
| **Story ID** | I3 |
| **Epic ref** | Epic I — Nutrition bands (Recipe_Systems §12) |
| **Phase** | P7 (wks 11–12) |
| **Domain** | Nutrition / View 9 |
| **Priority** | Should |

**Badges:** UI · Backend · Priority: Should · Q14 (OPEN DECISION — portion persistence)

### Description

**As a cook**, I want a **per-bowl band only after portions are set**. (Recipe_Systems.md §12)

> **OPEN DECISION:** portion-count persistence is Q14 (ERD §15.6, §17 — the one story ERD leaves honestly open). BUILD_PLAN §7.8 defers it to the View 9 payload and revisits it post-pilot; dispatch unit D-26 builds behind a labeled seam and must not decide it.

### Acceptance Criteria

- AC-1: Per-bowl band only after portions are set.

### Test Cases

**TC-01 — Per-bowl only after portions**
- Given: View 9
- When: portions are set, then the band is viewed
- Then: the per-bowl band is shown only after portions are set

### API Endpoints

Not yet defined at the design stage. Specified by dispatch unit **D-26** (Q14 seam — no persisted portion column shipped while Q14 is open).

### Data

| Entity | Role | Source |
|---|---|---|
| — (Q14 — no persistence decided) | — | ERD §15.6, §17 ⚠️ honestly open |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-26 | A-26 | H-26 | ERD §17 ⚠️ (I3 openly deferred) | Q14 (portion persistence) |

---

## I4 — Tighten the band

| Field | Value |
|---|---|
| **Story ID** | I4 |
| **Epic ref** | Epic I — Nutrition bands (Recipe_Systems §12) |
| **Phase** | P7 (wks 11–12) |
| **Domain** | Nutrition / View 9 |
| **Priority** | Should |

**Badges:** UI · Backend · Priority: Should

### Description

**As a cook**, I want to **tighten the band** — name fish / weigh coconut / measure oil. (Recipe_Systems.md §12)

### Acceptance Criteria

- AC-1: Name fish / weigh coconut / measure oil.

### Test Cases

**TC-01 — Each input narrows the band**
- Given: View 9
- When: each tightening input is provided (named fish, weighed coconut, measured oil)
- Then: the band narrows accordingly

### API Endpoints

Not yet defined at the design stage. Specified by dispatch unit **D-26**.

### Data

| Entity | Role | Source |
|---|---|---|
| — (assumption refinement) | — | ERD §17 ✅ |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-26 | A-26 | H-26 | ERD §17 ✅ | — |

---

## I5 — Optional energy band on the one-pager

| Field | Value |
|---|---|
| **Story ID** | I5 |
| **Epic ref** | Epic I — Nutrition bands (Recipe_Systems §12) |
| **Phase** | P7 (wks 11–12) — conditional per §13 (could-haves ship only if Must on weeks 9–10 is stable) |
| **Domain** | Nutrition / Print |
| **Priority** | Could |

**Badges:** UI · Print · Priority: Could · §13-conditional

### Description

**As a cook**, I want the **optional energy band on the one-pager** — **never on the market list as if it were a packaged-food label**. (Recipe_Systems.md §12)

### Acceptance Criteria

- AC-1: Optional energy band on the one-pager.
- AC-2: Never on the market list as if it were a packaged-food label.

### Test Cases

**TC-01 — Band on the one-pager**
- Given: the energy band enabled
- When: the one-pager renders (E6)
- Then: the band appears on the one-pager

**TC-02 — Never on the market list**
- Given: the market list printed
- When: inspected
- Then: no energy band is presented as a packaged-food label

### API Endpoints

Not yet defined at the design stage. Specified by dispatch unit **D-31** (conditional — §13 stability evidence required before dispatch).

### Data

| Entity | Role | Source |
|---|---|---|
| — (renders from the band) | — | ERD §17 ✅ |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-31 | A-31 | H-31 | ERD §17 ✅ | — |

---

## I6 — View 9 disclaimer

| Field | Value |
|---|---|
| **Story ID** | I6 |
| **Epic ref** | Epic I — Nutrition bands (Recipe_Systems §12) |
| **Phase** | P4 (wks 7–8) |
| **Domain** | Nutrition / View 9 |
| **Priority** | Must |

**Badges:** UI · Print · Priority: Must

### Description

**As a cook**, I want the disclaimer **"Table estimate from stated assumptions. Not a lab analysis. Not medical advice."** on every View 9 surface. (Recipe_Systems.md §12)

### Acceptance Criteria

- AC-1: The exact disclaimer text above on every View 9 surface.

### Test Cases

**TC-01 — Verbatim on every surface**
- Given: View 9 on every surface (analysis, prints)
- When: inspected
- Then: the disclaimer text is present verbatim

### API Endpoints

Not yet defined at the design stage. The disclaimer sweep across every surface (incl. prints) is dispatch unit **D-21** (static + runtime gates, INV-14).

### Data

| Entity | Role | Source |
|---|---|---|
| — (rendered text) | — | ERD §17 ✅ |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-19, D-21 | A-19, A-21 | H-19, H-21 | ERD §17 ✅ | — |

---

## I7 — Versioned food composition table

| Field | Value |
|---|---|
| **Story ID** | I7 |
| **Epic ref** | Epic I — Nutrition bands (Recipe_Systems §12) |
| **Phase** | Track R (wks 1–8, feeds P4) |
| **Domain** | Nutrition / Reference data |
| **Priority** | Must |

**Badges:** Backend · Reference data · Priority: Must

### Description

**As the team**, we want the **versioned food composition table** — USDA or peer IDs on mapped lines; **unmapped lines excluded from totals and listed**. (Recipe_Systems.md §12)

### Acceptance Criteria

- AC-1: USDA or peer IDs on mapped lines.
- AC-2: Unmapped lines excluded from totals and listed.

### Test Cases

**TC-01 — Mapped lines carry IDs**
- Given: View 9 on a recipe with mapped lines
- When: inspected
- Then: USDA/peer IDs are shown on mapped lines

**TC-02 — Unmapped lines excluded and listed**
- Given: View 9 on a recipe with unmapped lines
- When: inspected
- Then: unmapped lines are excluded from totals and listed

### API Endpoints

Not yet defined at the design stage. Sources: USDA FoodData Central (H7/I7). Specified by dispatch unit **D-29** (reviewed import path, ADR §7).

### Data

| Entity | Role | Source |
|---|---|---|
| `nutrition_food_composition_entry` / `version` | versioned table with source IDs | ERD §10 |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-29 | A-29 | H-29 | ERD §17 ✅ | — |

---

*End of Epic I — Nutrition bands / View 9. Stories I1–I7.*
