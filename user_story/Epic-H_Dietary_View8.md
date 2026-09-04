# Epic H — Dietary profile / View 8 (H1–H7)

> **Epic:** H — Dietary profile (View 8) · **Stories:** H1 (Should), H2 (Must), H3 (Should), H4 (Must), H5 (Should), H6 (Must), H7 (Must) · **Domain:** Dietary / View 8
> **Boundaries:** View 8 runs on every analysis against the versioned allergen mapping (H2, via `analysis_claim.allergen_id` — BUILD_PLAN P4-1). "Reads the card only. Does not test food. Does not know your kitchen. Not medical advice." appears on every surface (H6). "Safe" is forbidden (INV-13). The mapping is curated and a change is a reviewed data change (H7). The printed allergen line (H4) is gated on **Q2 (OPEN)**.
> **Full detail:** description + acceptance criteria + test cases + API + data + traceability. Source: Recipe_Systems.md §12.
> **Canonical note:** canonical split representation of Epic H from `USER_STORIES.md` v1.1 — story IDs, acceptance criteria, and test cases preserved exactly; only the presentation follows the mentor's epic-file format.

---

## H1 — Household restriction profile

| Field | Value |
|---|---|
| **Story ID** | H1 |
| **Epic ref** | Epic H — Dietary profile (Recipe_Systems §12) |
| **Phase** | P7 (wks 11–12) |
| **Domain** | Dietary |
| **Priority** | Should |

**Badges:** UI · Backend · Priority: Should

### Description

**As a cook**, I want a **household restriction profile** — allergens, diet patterns, US or EU pack — optional, and it **never auto-deletes recipes**. (Recipe_Systems.md §12)

### Acceptance Criteria

- AC-1: Allergens, diet patterns, US or EU pack.
- AC-2: Optional.
- AC-3: Never auto-deletes recipes.

### Test Cases

**TC-01 — Profile stored**
- Given: the profile editor
- When: allergens, diet patterns, and the US/EU pack are configured
- Then: the profile is stored

**TC-02 — Optional**
- Given: the product used without a profile
- When: nothing is configured
- Then: nothing is forced

**TC-03 — Never auto-deletes**
- Given: a conflicting profile
- When: it is set
- Then: no recipe is auto-deleted

### API Endpoints

Not yet defined at the design stage. Specified by dispatch unit **D-26**.

### Data

| Entity | Role | Source |
|---|---|---|
| `account_restriction_profile` | household profile | ERD §5 |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-26 | A-26 | H-26 | ERD §17 ✅ | — |

---

## H2 — Run View 8 on every analysis

| Field | Value |
|---|---|
| **Story ID** | H2 |
| **Epic ref** | Epic H — Dietary profile (Recipe_Systems §12) |
| **Phase** | P4 (wks 7–8) |
| **Domain** | Dietary / View 8 |
| **Priority** | Must |

**Badges:** UI · Backend · Worker · Priority: Must

### Description

**As a cook**, I want **View 8 on every analysis** — the golden mapping as in §6 View 8, with the disclaimer visible. (Recipe_Systems.md §12)

### Acceptance Criteria

- AC-1: Golden mapping as in §6 View 8.
- AC-2: Disclaimer visible.

### Test Cases

**TC-01 — Golden mapping**
- Given: the golden fixture analysis
- When: View 8 renders
- Then: it matches the §6 worked mapping (fish + mustard flagged; coconut not filed as a US major tree nut)

**TC-02 — Disclaimer visible**
- Given: View 8 on any analysis
- When: rendered
- Then: the disclaimer is visible (H6)

### API Endpoints

Not yet defined at the design stage. View 8 reads `dietary_allergen_definition`/`mapping` via `analysis_claim.allergen_id` (BUILD_PLAN P4-1). Specified by dispatch unit **D-19**.

### Data

| Entity | Role | Source |
|---|---|---|
| `dietary_allergen_definition`, `dietary_allergen_mapping` | versioned mapping | ERD §9 |
| `analysis_claim.allergen_id` | claim → allergen join | ERD §6 |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-19 | A-19 | H-19 | ERD §17 ✅ | — |

---

## H3 — Highlight against profile

| Field | Value |
|---|---|
| **Story ID** | H3 |
| **Epic ref** | Epic H — Dietary profile (Recipe_Systems §12) |
| **Phase** | P7 (wks 11–12) |
| **Domain** | Dietary |
| **Priority** | Should |

**Badges:** UI · Backend · Priority: Should

### Description

**As a cook**, I want **profile conflicts highlighted — conflicts first** — and **unknown shown as unknown, never a pass**. (Recipe_Systems.md §12)

### Acceptance Criteria

- AC-1: Conflicts first.
- AC-2: Unknown is not a pass.

### Test Cases

**TC-01 — Conflicts first**
- Given: a recipe with conflicts against the profile
- When: it is analysed
- Then: conflicts are listed first

**TC-02 — Unknown is not a pass**
- Given: a recipe with unknown matches
- When: it is analysed
- Then: unknown is shown as unknown — never treated as a pass

### API Endpoints

Not yet defined at the design stage. Specified by dispatch unit **D-26**.

### Data

| Entity | Role | Source |
|---|---|---|
| `account_restriction_item` | profile items checked against claims | ERD §5 |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-26 | A-26 | H-26 | ERD §17 ✅ | — |

---

## H4 — Print the allergen line

| Field | Value |
|---|---|
| **Story ID** | H4 |
| **Epic ref** | Epic H — Dietary profile (Recipe_Systems §12) |
| **Phase** | P5 (wks 9–10) |
| **Domain** | Dietary / Print |
| **Priority** | Must |

**Badges:** UI · Print · Priority: Must · Q2 (OPEN DECISION — allergen-line source)

### Description

**As a cook**, I want the **allergen line on the printed shopping list and station card**. (Recipe_Systems.md §12)

### Acceptance Criteria

- AC-1: On shopping list.
- AC-2: On station card.

### Test Cases

**TC-01 — List carries the line**
- Given: the printed shopping list
- When: inspected
- Then: the allergen line is present (mechanism gated on Q2)

**TC-02 — Card carries the line**
- Given: the printed station card
- When: inspected
- Then: the allergen line is present

### API Endpoints

Not yet defined at the design stage. Print path shared with E4/E5 (snapshot-only, INV-12). Specified by dispatch unit **D-23**.

### Data

| Entity | Role | Source |
|---|---|---|
| render layer (ADR §7) | snapshot-only reads | ADR §7 |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-23 | A-23 | H-23 | ERD §17 ✅ | Q2 (allergen-line source) |

---

## H5 — Log a restriction-driven swap

| Field | Value |
|---|---|
| **Story ID** | H5 |
| **Epic ref** | Epic H — Dietary profile (Recipe_Systems §12) |
| **Phase** | P7 (wks 11–12) |
| **Domain** | Dietary |
| **Priority** | Should |

**Badges:** UI · Backend · Priority: Should

### Description

**As a cook**, I want to **log a restriction-driven swap** — it uses F3 and **does not silently rewrite the card**. (Recipe_Systems.md §12)

### Acceptance Criteria

- AC-1: Uses F3.
- AC-2: Does not silently rewrite the card.

### Test Cases

**TC-01 — Uses the F3 record**
- Given: a restriction-driven swap
- When: it is recorded
- Then: it uses the F3 swap record

**TC-02 — Card unchanged**
- Given: the swap recorded, recipe reopened
- When: the card is inspected
- Then: the card is unchanged unless the swap was applied

### API Endpoints

Not yet defined at the design stage. Specified by dispatch unit **D-26**.

### Data

| Entity | Role | Source |
|---|---|---|
| `cook_log_swap` | via F3 | ERD §8 |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-26 | A-26 | H-26 | ERD §17 ✅ | — |

---

## H6 — View 8 disclaimer

| Field | Value |
|---|---|
| **Story ID** | H6 |
| **Epic ref** | Epic H — Dietary profile (Recipe_Systems §12) |
| **Phase** | P4 (wks 7–8) |
| **Domain** | Dietary |
| **Priority** | Must |

**Badges:** UI · Print · Priority: Must

### Description

**As a cook**, I want the disclaimer **"Reads the card only. Does not test food. Does not know your kitchen. Not medical advice."** on every View 8 surface. (Recipe_Systems.md §12)

### Acceptance Criteria

- AC-1: The exact disclaimer text above on every View 8 surface.

### Test Cases

**TC-01 — Verbatim on every surface**
- Given: View 8 on every surface (analysis, prints)
- When: inspected
- Then: the disclaimer text is present verbatim

### API Endpoints

Not yet defined at the design stage. The disclaimer sweep across every surface (incl. prints) is dispatch unit **D-21** (static + runtime gates, INV-13).

### Data

| Entity | Role | Source |
|---|---|---|
| — (rendered text) | — | ERD §17 ✅ |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-19, D-21 | A-19, A-21 | H-19, H-21 | ERD §17 ✅ | — |

---

## H7 — Versioned allergen mapping

| Field | Value |
|---|---|
| **Story ID** | H7 |
| **Epic ref** | Epic H — Dietary profile (Recipe_Systems §12) |
| **Phase** | Track R (wks 1–8, feeds P4) |
| **Domain** | Dietary / Reference data |
| **Priority** | Must |

**Badges:** Backend · Reference data · Priority: Must

### Description

**As the team**, we want the **allergen mapping curated in versioned tables** — a mapping change is a **reviewed data change**. (Recipe_Systems.md §12)

### Acceptance Criteria

- AC-1: Curated tables.
- AC-2: A mapping change is a reviewed data change.

### Test Cases

**TC-01 — Versioned, effective-dated**
- Given: the allergen mapping loaded via the reviewed path
- When: inspected
- Then: it is versioned and effective-dated

**TC-02 — Unreviewed change rejected**
- Given: an unreviewed mapping change
- When: attempted
- Then: it is rejected — reviewed path only (Track R exit)

### API Endpoints

Not yet defined at the design stage. The reviewed import path (CSV/JSON → diff → human approval → effective-dated version) is ADR §7; overlap attempts rejected via `EXCLUDE USING gist` (ERD §9). Specified by dispatch unit **D-29**.

### Data

| Entity | Role | Source |
|---|---|---|
| `dietary_allergen_definition` / `dietary_allergen_mapping` | effective-dated, overlap-protected | ERD §9 |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-29 | A-29 | H-29 | ERD §17 ✅ | — |

---

*End of Epic H — Dietary profile / View 8. Stories H1–H7.*
