# Epic E — Shopping list and print (E1–E6)

> **Epic:** E — Shopping list and print · **Stories:** E1 (Must), E2 (Should), E3 (Should), E4 (Must), E5 (Must), E6 (Could — conditional per §13) · **Domain:** Shopping / Print
> **Boundaries:** the list is generated from the structured object, never from prose (E1). Shopping state persists on the saved recipe and survives list regeneration and line soft-delete (E2, C-28). Print renders from persisted snapshots only (INV-12) via the Playwright templates (Tech Stack §12, ADR §7). The printed allergen line (H4) is gated on **Q2 (OPEN)**.
> **Full detail:** description + acceptance criteria + test cases + API + data + traceability. Source: Recipe_Systems.md §12.
> **Canonical note:** canonical split representation of Epic E from `USER_STORIES.md` v1.1 — story IDs, acceptance criteria, and test cases preserved exactly; only the presentation follows the mentor's epic-file format.

---

## E1 — Generate a shopping list

| Field | Value |
|---|---|
| **Story ID** | E1 |
| **Epic ref** | Epic E — Shopping list and print (Recipe_Systems §12) |
| **Phase** | Track S data layer (wks 8–9); printed surface P5 |
| **Domain** | Shopping |
| **Priority** | Must |

**Badges:** UI · Backend · Priority: Must

### Description

**As a cook**, I want the **shopping list generated from the structured object, not from prose** — one row per ingredient; "to taste" and "for tempering" stay visible; two fenugreek rows; no headers. (Recipe_Systems.md §12)

### Acceptance Criteria

- AC-1: From the structured object, not from prose.
- AC-2: One row per ingredient.
- AC-3: "To taste" and "for tempering" stay visible.
- AC-4: Two fenugreek rows.
- AC-5: No headers.

### Test Cases

**TC-01 — Structured object only**
- Given: a recipe with prose quirks
- When: the list is generated
- Then: it is generated from the structured object only

**TC-02 — One row per ingredient**
- Given: the generated list
- When: inspected
- Then: one row per ingredient

**TC-03 — Loose quantities visible**
- Given: the generated list
- When: the "to taste" / "for tempering" rows are inspected
- Then: both stay visible

**TC-04 — Two fenugreek rows**
- Given: the golden fixture
- When: the list is generated
- Then: two fenugreek rows, distinct

**TC-05 — No headers**
- Given: the generated list
- When: inspected
- Then: no headers

### API Endpoints

Not yet defined at the design stage. Specified by dispatch unit **D-30** (data layer; the printed surface ships in D-23/P5).

### Data

| Entity | Role | Source |
|---|---|---|
| `shopping_list_generation` | generated list | ERD §7 |
| `shopping_list_item` | one row per ingredient | ERD §7 |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-30 | A-30 | H-30 | ERD §17 ✅ | — |

---

## E2 — Tick off owned items

| Field | Value |
|---|---|
| **Story ID** | E2 |
| **Epic ref** | Epic E — Shopping list and print (Recipe_Systems §12) |
| **Phase** | Track S (wks 8–9) |
| **Domain** | Shopping |
| **Priority** | Should |

**Badges:** UI · Backend · Priority: Should

### Description

**As a cook**, I want **have/need ticking** — print hides or strikes "have"; the state **persists on the saved recipe**. (Recipe_Systems.md §12)

### Acceptance Criteria

- AC-1: Have / need.
- AC-2: Print hides or strikes "have."
- AC-3: Persists on the saved recipe.

### Test Cases

**TC-01 — Have/need recorded**
- Given: a generated list
- When: items are ticked as have / need
- Then: the state is recorded per ingredient

**TC-02 — Print hides or strikes have**
- Given: items ticked "have"
- When: the list is printed
- Then: "have" items are hidden or struck on the paper

**TC-03 — State persists**
- Given: a saved recipe with state
- When: the recipe is reopened
- Then: the have/need state persists (survives list regeneration)

### API Endpoints

Not yet defined at the design stage. Specified by dispatch unit **D-30**.

### Data

| Entity | Role | Source |
|---|---|---|
| `ingredient_shopping_state` | have/need per line (composite FK recipe_id + shopping_key) | ERD §7 |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-30 | A-30 | H-30 | ERD §17 ✅ | — |

---

## E3 — Group list for market

| Field | Value |
|---|---|
| **Story ID** | E3 |
| **Epic ref** | Epic E — Shopping list and print (Recipe_Systems §12) |
| **Phase** | Track S (wks 8–9) |
| **Domain** | Shopping |
| **Priority** | Should |

**Badges:** UI · Backend · Priority: Should

### Description

**As a cook**, I want the list **grouped for the market**: fresh produce, fish/meat, spices, fats/oils, other. (Recipe_Systems.md §12)

### Acceptance Criteria

- AC-1: Fresh produce, fish/meat, spices, fats/oils, other.

### Test Cases

**TC-01 — Five groups**
- Given: a list with items from every category
- When: generated
- Then: items are grouped: fresh produce, fish/meat, spices, fats/oils, other

### API Endpoints

Not yet defined at the design stage. Specified by dispatch unit **D-30**.

### Data

| Entity | Role | Source |
|---|---|---|
| — (grouping is a derivation of `shopping_list_item`) | — | ERD §17 ✅ |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-30 | A-30 | H-30 | ERD §17 ✅ | — |

---

## E4 — Print the shopping list

| Field | Value |
|---|---|
| **Story ID** | E4 |
| **Epic ref** | Epic E — Shopping list and print (Recipe_Systems §12) |
| **Phase** | P5 (wks 9–10) |
| **Domain** | Print |
| **Priority** | Must |

**Badges:** UI · Print · Priority: Must · Q2 (OPEN DECISION — allergen-line source)

### Description

**As a cook**, I want the **printed shopping list**: black text, recipe name, date, grouped rows, checkboxes; one A4/Letter page for this card; no account chrome; includes the View 8 allergen line. (Recipe_Systems.md §12)

### Acceptance Criteria

- AC-1: Black text, recipe name, date, grouped rows, checkboxes.
- AC-2: One A4/Letter page for this card.
- AC-3: No account chrome.
- AC-4: Includes View 8 allergen line.

### Test Cases

**TC-01 — Print content**
- Given: the golden list
- When: printed
- Then: black text, recipe name, date, grouped rows, checkboxes

**TC-02 — One page**
- Given: the golden list
- When: printed
- Then: it fits one A4/Letter page (P7 exit metric)

**TC-03 — No chrome**
- Given: the printed page
- When: inspected
- Then: no account chrome

**TC-04 — Allergen line present**
- Given: the printed page
- When: inspected
- Then: the View 8 allergen line is present (H4; mechanism gated on Q2)

### API Endpoints

Not yet defined at the design stage. Print renders via the Playwright templates from persisted snapshots only (INV-12). Specified by dispatch unit **D-23**.

### Data

| Entity | Role | Source |
|---|---|---|
| render layer (ADR §7) | snapshot-only reads | ADR §7, Tech Stack §12 |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-23 | A-23 | H-23 | ERD §17 ✅ | Q2 (allergen-line source) |

---

## E5 — Print the station card

| Field | Value |
|---|---|
| **Story ID** | E5 |
| **Epic ref** | Epic E — Shopping list and print (Recipe_Systems §12) |
| **Phase** | P5 (wks 9–10) |
| **Domain** | Print |
| **Priority** | Must |

**Badges:** UI · Print · Priority: Must · Q2 (OPEN DECISION — allergen-line source)

### Description

**As a cook**, I want the **printed station card** — separate from the list; control points + "untasted briefing"; readable at arm's length; allergen line included. (Recipe_Systems.md §12)

### Acceptance Criteria

- AC-1: Separate from the list.
- AC-2: Control points + "untasted briefing."
- AC-3: Readable at arm's length.
- AC-4: Allergen line included.

### Test Cases

**TC-01 — Separate document**
- Given: the station card
- When: printed
- Then: it is a separate document from the shopping list

**TC-02 — Card content**
- Given: the printed card
- When: inspected
- Then: control points and the "untasted briefing" are present

**TC-03 — Arm's-length readable**
- Given: the printed card
- When: viewed at arm's length
- Then: it is legible

**TC-04 — Allergen line included**
- Given: the printed card
- When: inspected
- Then: the allergen line is included (H4)

### API Endpoints

Not yet defined at the design stage. Same template path as E4 (snapshot-only, INV-12). Specified by dispatch unit **D-23**.

### Data

| Entity | Role | Source |
|---|---|---|
| render layer (ADR §7) | snapshot-only reads | ADR §7, Tech Stack §12 |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-23 | A-23 | H-23 | ERD §17 ✅ | Q2 (allergen-line source) |

---

## E6 — Home-mode one-pager

| Field | Value |
|---|---|
| **Story ID** | E6 |
| **Epic ref** | Epic E — Shopping list and print (Recipe_Systems §12) |
| **Phase** | P7 (wks 11–12) — conditional per §13 (could-haves ship only if Must on weeks 9–10 is stable) |
| **Domain** | Print |
| **Priority** | Could |

**Badges:** UI · Print · Priority: Could · §13-conditional

### Description

**As a cook**, I want a **home-mode one-pager**: keep / negotiate / identity-shift + ingredient list; optional View 9 energy band; **not a legal nutrition label**. (Recipe_Systems.md §12)

### Acceptance Criteria

- AC-1: Keep / negotiate / identity-shift + ingredient list.
- AC-2: Optional View 9 energy band.
- AC-3: Not a legal nutrition label.

### Test Cases

**TC-01 — One-pager sections**
- Given: the one-pager
- When: printed
- Then: keep / negotiate / identity-shift sections + ingredient list

**TC-02 — Optional energy band**
- Given: the energy band enabled
- When: printed
- Then: the View 9 band appears on the one-pager only

**TC-03 — Not a legal label**
- Given: the one-pager
- When: inspected
- Then: nothing is presented as a legal nutrition label

### API Endpoints

Not yet defined at the design stage. Specified by dispatch unit **D-31** (conditional — §13 stability evidence required before dispatch).

### Data

| Entity | Role | Source |
|---|---|---|
| — (renders from analysis snapshots) | — | ERD §17 ✅ |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-31 | A-31 | H-31 | ERD §17 ✅ | — |

---

*End of Epic E — Shopping list and print. Stories E1–E6.*
