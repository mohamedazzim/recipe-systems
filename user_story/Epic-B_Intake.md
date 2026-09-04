# Epic B — Intake (B1–B6)

> **Epic:** B — Intake · **Stories:** B1 (Must), B2 (Must), B3 (Must), B4 (Must), B5 (Should), B6 (Should) · **Domain:** Intake / OCR / Parse review
> **Boundaries:** `recipe_input` is the immutable raw event (C-41); the corrected object (`recipe_ingredient_line`) is what analysis reads (B3). OCR is orchestrated by Intake, not by the worker (ADR §2 Decision 3 — Q3 diagram patch). Low-confidence lines are flagged, never dropped (INV-04); analysis is blocked while any active line has `needs_review = TRUE` (INV-05). Dictionary/alias writer per the Q5 working assumption (admin module).
> **Full detail:** description + acceptance criteria + test cases + API + data + traceability. Source: Recipe_Systems.md §12.
> **Canonical note:** canonical split representation of Epic B from `USER_STORIES.md` v1.1 — story IDs, acceptance criteria, and test cases preserved exactly; only the presentation follows the mentor's epic-file format.

---

## B1 — Paste a recipe

| Field | Value |
|---|---|
| **Story ID** | B1 |
| **Epic ref** | Epic B — Intake (Recipe_Systems §12) |
| **Phase** | P2 (wks 3–4) |
| **Domain** | Intake |
| **Priority** | Must |

**Badges:** UI · Backend · Intake · Priority: Must

### Description

**As a cook**, I want to **paste a recipe** so that **it becomes the structured object**. (Recipe_Systems.md §12 — accepts mixed units, "to taste," "as required," vernacular names.)

### Acceptance Criteria

- AC-1: Mixed units, "to taste," "as required," vernacular names are accepted.
- AC-2: Kanyakumari paste keeps two fenugreek lines.

### Test Cases

**TC-01 — Mixed units and loose quantities accepted**
- Given: a recipe with mixed units, "to taste," "as required," vernacular names
- When: pasted
- Then: accepted into the corrected object

**TC-02 — Two fenugreek lines survive**
- Given: the golden Kanyakumari card
- When: pasted
- Then: two fenugreek lines survive as separate lines

### API Endpoints

Not yet defined at the design stage. Specified by dispatch unit **D-10** (raw `recipe_input` rows for paste/photo/form).

### Data

| Entity | Role | Source |
|---|---|---|
| `recipe_input` | immutable raw event (C-41) | ERD §5 |
| `recipe_ingredient_line` | corrected object (draft lines) | ERD §5 |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-10 | A-10 | H-10 | ERD §17 ✅ | Q4 (draft-line writer) |

---

## B2 — Photograph a recipe card

| Field | Value |
|---|---|
| **Story ID** | B2 |
| **Epic ref** | Epic B — Intake (Recipe_Systems §12) |
| **Phase** | P2 (wks 3–4) |
| **Domain** | Intake / OCR |
| **Priority** | Must |

**Badges:** UI · Backend · Intake · OCR · Priority: Must · Q10 (OPEN DECISION — OCR provider)

### Description

**As a cook**, I want to **photograph a recipe card (JPEG/PNG from phone or desktop)** so that **OCR turns it into reviewable draft lines**. (Recipe_Systems.md §12)

**Mechanics (sourced):** photo → private object storage, URI only (ADR §3); OCR adapter is provider-neutral (Tech Stack §11; provider = Q10 — GCV candidate per BUILD_PLAN P2-2, benchmarked in the harness before selection); low-confidence lines flagged `needs_review`, never dropped (INV-04).

### Acceptance Criteria

- AC-1: JPEG/PNG from phone or desktop.
- AC-2: OCR draft visible before analysis.
- AC-3: Golden fixture: Fish 500g, Drumstick 1, Mango 1/2, Half Shell coconut, both fenugreeks, no garlic.
- AC-4: Low-confidence OCR lines flagged, not dropped.

### Test Cases

**TC-01 — Photo from phone and desktop**
- Given: a recipe card, JPEG/PNG from phone or desktop
- When: photographed
- Then: photo accepted, stored as an object-storage URI

**TC-02 — OCR draft before analysis**
- Given: a photographed card after OCR
- When: before any analysis runs
- Then: the OCR draft is visible for review

**TC-03 — Golden photo fixture**
- Given: the golden fixture card
- When: photographed
- Then: Fish 500g, Drumstick 1, Mango 1/2, Half Shell coconut, both fenugreeks, no garlic — all present in the draft

**TC-04 — Low-confidence lines flagged**
- Given: OCR returns low confidence on some lines
- When: the draft is created
- Then: those lines are flagged `needs_review = TRUE`, never dropped (INV-04)

### API Endpoints

Not yet defined at the design stage. Specified by dispatch units **D-10** (upload → object storage URI) and **D-11** (OCR adapter; mocked in CI, real provider only in the benchmark harness — TEST_PLAN §4).

### Data

| Entity | Role | Source |
|---|---|---|
| `recipe_input` | raw event; `ocr_text` | ERD §5 |
| `recipe_ingredient_line` | `needs_review`, `ocr_confidence` | ERD §5 |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-10, D-11 | A-10, A-11 | H-10, H-11 | ERD §17 ✅ | Q3 (diagram patch), Q10 (OCR provider) |

---

## B3 — Review and correct the parse

| Field | Value |
|---|---|
| **Story ID** | B3 |
| **Epic ref** | Epic B — Intake (Recipe_Systems §12) |
| **Phase** | P2 (wks 3–4) |
| **Domain** | Parse review |
| **Priority** | Must |

**Badges:** UI · Backend · Intake · Priority: Must

### Description

**As a cook**, I want to **review and correct the parse** so that **analysis reads what I actually have on the card**. (Recipe_Systems.md §12 — edit, add, delete, split, merge lines; mark headers; the corrected object is what analysis reads.)

### Acceptance Criteria

- AC-1: Edit, add, delete, split, merge lines (split the wrapped chilli/coriander line).
- AC-2: Mark non-ingredient headers.
- AC-3: Corrected object is what analysis reads.

### Test Cases

**TC-01 — All edit operations incl. the wrapped-line split**
- Given: a photographed golden card
- When: edit / add / delete / split / merge lines — including splitting the wrapped chilli/coriander line
- Then: the corrected object reflects every operation

**TC-02 — Headers excluded**
- Given: a draft containing non-ingredient headers
- When: a header is marked
- Then: it is excluded from the ingredient object

**TC-03 — Analysis reads the corrected object**
- Given: a corrected object and the untouched raw input
- When: analysis runs
- Then: analysis reads the corrected object only; the raw record stays untouched

### API Endpoints

Not yet defined at the design stage. Specified by dispatch unit **D-12** (concurrent stale edits rejected on version/`updated_at` with reload/merge — QG4 cell, ERD §13).

### Data

| Entity | Role | Source |
|---|---|---|
| `recipe_ingredient_line` | mutable corrected lines | ERD §5 |
| `recipe_input` | raw record — never updated | ERD §5 (C-41) |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-12 | A-12 | H-12 | ERD §17 ✅ | Q4 (draft-line writer) |

---

## B4 — Enter or attach a method

| Field | Value |
|---|---|
| **Story ID** | B4 |
| **Epic ref** | Epic B — Intake (Recipe_Systems §12) |
| **Phase** | P2 (wks 3–4) |
| **Domain** | Intake / Method |
| **Priority** | Must |

**Badges:** UI · Backend · Intake · Priority: Must

### Description

**As a cook**, I want to **enter or attach a method** so that **Views 3 and 7 reflect how the dish is actually made**. (Recipe_Systems.md §12 — method optional; absent → analyse list-only or accept a matched family method tagged INFERRED with source named; list-only → Views 3 and 7 INCOMPLETE.)

### Acceptance Criteria

- AC-1: Method optional.
- AC-2: If absent: analyse list-only, or accept a matched family method tagged INFERRED with source named.
- AC-3: List-only → Views 3 and 7 INCOMPLETE.

### Test Cases

**TC-01 — Method entered**
- Given: a recipe with a method
- When: the method is entered
- Then: the method is attached and used

**TC-02 — Matched family method accepted**
- Given: no method; the system offers the matched family method (CDK 1669 / Mrs. Anitha)
- When: accepted
- Then: tagged INFERRED with the source named

**TC-03 — List-only analysis**
- Given: no method and no accepted family match
- When: analysis runs
- Then: Views 3 and 7 render INCOMPLETE — never fabricated (§3.4)

### API Endpoints

Not yet defined at the design stage. Specified by dispatch unit **D-13** (the INCOMPLETE-driving flag is this unit's output; INFERRED provenance flows into C4's claim machinery).

### Data

| Entity | Role | Source |
|---|---|---|
| `recipe` / method fields | `method_text`, `method_source_tag`, `method_inferred_source` | ERD §5 |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-13 | A-13 | H-13 | ERD §17 ✅ | — |

---

## B5 — Structured form intake

| Field | Value |
|---|---|
| **Story ID** | B5 |
| **Epic ref** | Epic B — Intake (Recipe_Systems §12) |
| **Phase** | P2 (wks 3–4) |
| **Domain** | Intake |
| **Priority** | Should |

**Badges:** UI · Backend · Intake · Priority: Should

### Description

**As a cook**, I want to **enter a recipe through a structured form** that produces **the same object as paste and photo**. (Recipe_Systems.md §12)

### Acceptance Criteria

- AC-1: Same object as paste and photo.
- AC-2: Units include tsp, tbsp, g, kg, nos, to taste, as required, lemon size, half shell.

### Test Cases

**TC-01 — Same object shape**
- Given: the structured form
- When: a recipe is entered
- Then: it produces the same corrected-object shape as paste/photo

**TC-02 — All units accepted**
- Given: the structured form
- When: each unit is used — tsp, tbsp, g, kg, nos, to taste, as required, lemon size, half shell
- Then: all are accepted

### API Endpoints

Not yet defined at the design stage. Specified by dispatch unit **D-10** (raw rows for paste/photo/form).

### Data

| Entity | Role | Source |
|---|---|---|
| `recipe_input` | `input_type = 'form'` | ERD §17 |
| `recipe_ingredient_line` | `amount_text` free text | ERD §17 |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-10 | A-10 | H-10 | ERD §17 ✅ | — |

---

## B6 — Vernacular aliases

| Field | Value |
|---|---|
| **Story ID** | B6 |
| **Epic ref** | Epic B — Intake (Recipe_Systems §12) |
| **Phase** | P7 (wks 11–12) |
| **Domain** | Intake / Reference |
| **Priority** | Should |

**Badges:** UI · Backend · Reference data · Priority: Should · Q5 (OPEN DECISION — dictionary writer)

### Description

**As a cook**, I want **vernacular names to resolve to canonical ingredients**: drumstick / murungakkai / moringa; shallots / chinna vengayam / cheriya ulli; fenugreek / methi / uluva / vendhayam; tamarind / puli; curry leaves / karuveppilai. Ambiguous "drumstick" asks for confirmation. (Recipe_Systems.md §12)

### Acceptance Criteria

- AC-1: The five alias groups above resolve to the canonical ingredient.
- AC-2: Ambiguous "drumstick" asks for confirmation.

### Test Cases

**TC-01 — Five vernacular groups resolve**
- Given: each vernacular name in the five groups
- When: pasted
- Then: resolves to the canonical ingredient via the dictionary/alias path

**TC-02 — Ambiguous drumstick asks**
- Given: input "drumstick"
- When: resolution is ambiguous
- Then: confirmation is asked (`requires_confirmation`)

### API Endpoints

Not yet defined at the design stage. Specified by dispatch unit **D-25**; dictionary data comes from Track R (D-29) under the Q5 working assumption (admin module writes; intake reads only).

### Data

| Entity | Role | Source |
|---|---|---|
| `ingredient_dictionary` | canonical ingredients | ERD §5 |
| `ingredient_alias` | aliases; `requires_confirmation` | ERD §5 |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-25 | A-25 | H-25 | ERD §17 ✅ | Q5 (dictionary writer) |

---

*End of Epic B — Intake. Stories B1–B6.*
