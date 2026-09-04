# Recipe Systems — User Stories

**Status:** v1.1 · 2026-09-04 · The requirements source of truth for the 12-week pilot. This document **does not add requirements** — every line traces to the sources. v1.1 review fix: the could-haves (C7, E6, F5, I5) are labeled conditional per §13 and the traceability table names their dispatch unit (D-31).
**Sources:** `Recipe_Systems.md` §12 (story detail), §16 (Story index), §13 (weekly schedule) · `Recipe_Systems_ERD_FINAL.md` §17 (per-story ERD support) · `BUILD_PLAN.md` §6 (phase placement)
**Companions:** [DISPATCH.md](DISPATCH.md) (implementation tasks) · [AUDIT.md](AUDIT.md) (independent verification) · [HANDOFF.md](HANDOFF.md) (done evidence) · [TEST_PLAN.md](TEST_PLAN.md) (quality gates) · [SCAFFOLD.md](SCAFFOLD.md) (conventions)

---

## How to read this document

- **Priority semantics** (Recipe_Systems.md §12): *Must* ships in the 12-week pilot. *Should* ships if Must is stable. *Could* waits for the week-12 go/no-go. Could-haves (C7, E6, F5, I5) ship only if Must stories on weeks 9–10 are stable (Recipe_Systems.md §13).
- **IDs are the contract.** The 50 IDs A1–I7 are the source's canonical IDs and are preserved exactly — they become test-file names (`B3` → `tests/integration/story_b3_parse_review.test.ts`, SCAFFOLD §6 / TEST_PLAN §1). Never renumber.
- **Acceptance criteria** are the source's own bullets, condensed verbatim from Recipe_Systems.md §12.
- **Test cases** are derived **1:1 from the acceptance bullets** — one TC per source-asserted behavior, nothing added. TCs without a source line are an error; report them.
- **Traceability chain:** each story is scheduled exactly once in `BUILD_PLAN.md` §6 → implemented by the dispatch unit that owns its phase (DISPATCH.md) → verified by the paired audit (AUDIT.md) → proven done by handoff evidence (HANDOFF.md).
- **ERD support** cites `Recipe_Systems_ERD_FINAL.md` §17 (all 50 accounted for: 49 fully supported, I3 honestly open) plus named tables where the register names them.
- **OPEN DECISION note:** Q1–Q17 in SCAFFOLD §7 remain OPEN; no story below silently resolves one. Where a story depends on an open decision, the DISPATCH unit carries the gate.

---

## Story ledger — 50 stories, scheduled exactly once

| ID | Title | Priority | Epic | Phase (BUILD_PLAN §6) | ERD (§17) |
|---|---|---|---|---|---|
| A1 | Create an account | Must | A — Account | P1 | ✅ `account` |
| A2 | Guest session, then claim it | Should | A — Account | P1 | ✅ `guest_session`, XOR CHECK, claim tx |
| B1 | Paste a recipe | Must | B — Intake | P2 | ✅ `recipe_input`, `recipe_ingredient_line` |
| B2 | Photograph a recipe card | Must | B — Intake | P2 | ✅ `recipe_input.ocr_text`, line flags |
| B3 | Review and correct the parse | Must | B — Intake | P2 | ✅ mutable lines; raw record untouched |
| B4 | Enter or attach a method | Must | B — Intake | P2 | ✅ `method_text`, `method_source_tag` |
| B5 | Structured form intake | Should | B — Intake | P2 | ✅ `recipe_input.input_type = 'form'` |
| B6 | Vernacular aliases | Should | B — Intake | P7 | ✅ `ingredient_dictionary`, `ingredient_alias` |
| C1 | Identify the dish family | Must | C — Analysis | P3 | ✅ `analysis.family` block |
| C2 | Run all views | Must | C — Analysis | P3 (views 1–4; 5–9 in P4) | ✅ `analysis_view` 1..9, `analysis_claim` |
| C3 | Toggle home and chef mode | Must | C — Analysis | P4 | ✅ `account.preferred_mode`, `analysis.mode` |
| C4 | Claim tags and disagreements | Must | C — Analysis | P3 | ✅ `analysis_claim.claim_tag`, `source_reference` |
| C5 | Station card | Must | C — Analysis | P4 | ✅ `analysis_station_card` |
| C6 | Re-analyse after edit | Should | C — Analysis | P7 | ✅ `analysis.snapshot_of_analysis_id`, `is_current` |
| C7 | Preview a substitution | Could | C — Analysis | P7 (conditional) | ✅ |
| D1 | Save a recipe | Must | D — Save and library | P5 | ✅ ERD §13 |
| D2 | Browse and open library | Must | D — Save and library | P5 | ✅ ERD §13 |
| D3 | Tag and find | Should | D — Save and library | P7 | ✅ `recipe_tag` |
| D4 | Edit a saved recipe | Should | D — Save and library | P7 | ✅ ERD §13 |
| D5 | Analysis snapshot | Should | D — Save and library | P7 | ✅ `is_current` chain |
| D6 | Delete a recipe | Must | D — Save and library | P5 | ✅ hard DELETE cascade, ERD §13 |
| E1 | Generate a shopping list | Must | E — Shopping list and print | Track S (data); printed surface P5 | ✅ `shopping_list_generation`, `shopping_list_item` |
| E2 | Tick off owned items | Should | E — Shopping list and print | Track S | ✅ `ingredient_shopping_state` |
| E3 | Group list for market | Should | E — Shopping list and print | Track S | ✅ |
| E4 | Print shopping list | Must | E — Shopping list and print | P5 | ✅ render layer (ADR §7) |
| E5 | Print station card | Must | E — Shopping list and print | P5 | ✅ render layer (ADR §7) |
| E6 | Print home-mode one-pager | Could | E — Shopping list and print | P7 (conditional) | ✅ |
| F1 | Log that I cooked it | Must | F — After-cook capture | P6 | ✅ `cook_log` |
| F2 | Rating and note | Must | F — After-cook capture | P6 | ✅ `cook_log` |
| F3 | Record swaps used | Should | F — After-cook capture | P7 | ✅ `cook_log_swap` |
| F4 | Next-time instruction | Should | F — After-cook capture | P7 | ✅ `cook_log` |
| F5 | Plate photo | Could | F — After-cook capture | P7 (conditional) | ✅ `cook_log_photo` |
| F6 | Surface last-cook notes on reopen | Must | F — After-cook capture | P6 | ✅ `cook_log` |
| G1 | Golden fixture in CI | Must | G — Quality | P0 (runs every phase) | ✅ ERD §16 |
| G2 | Regional veto on View 5 | Must | G — Quality | P7 | ✅ (review workflow, ADR §8) |
| G3 | Chef pass on three curries | Must | G — Quality | P7 | ✅ |
| H1 | Household restriction profile | Should | H — Dietary profile | P7 | ✅ `account_restriction_profile` |
| H2 | Run View 8 on every analysis | Must | H — Dietary profile | P4 | ✅ `dietary_allergen_definition`/`mapping` |
| H3 | Highlight against profile | Should | H — Dietary profile | P7 | ✅ `account_restriction_item` |
| H4 | Print the allergen line | Must | H — Dietary profile | P5 | ✅ render layer (ADR §7) |
| H5 | Log a restriction-driven swap | Should | H — Dietary profile | P7 | ✅ via F3 |
| H6 | View 8 disclaimer | Must | H — Dietary profile | P4 | ✅ |
| H7 | Versioned allergen mapping | Must | H — Dietary profile | Track R | ✅ effective-dated tables |
| I1 | Run View 9 as a band | Must | I — Nutrition bands | P4 | ✅ `nutrition_food_composition_*` |
| I2 | Show and edit nutrition assumptions | Must | I — Nutrition bands | P4 | ✅ |
| I3 | Set portions | Should | I — Nutrition bands | P7 | ⚠️ openly deferred (Q14, ERD §17) |
| I4 | Tighten the nutrition band | Should | I — Nutrition bands | P7 | ✅ |
| I5 | Optional energy band on one-pager | Could | I — Nutrition bands | P7 (conditional) | ✅ |
| I6 | View 9 disclaimer | Must | I — Nutrition bands | P4 | ✅ |
| I7 | Versioned food composition table | Must | I — Nutrition bands | Track R | ✅ `nutrition_food_composition_version` |

Count check: A2 + B6 + C7 + D6 + E6 + F6 + G3 + H7 + I7 = **50** — matches the §16 Story index exactly, zero missing, zero extra.

---

## Epic A — Account

### A1 — Create an account

**Priority:** Must · **Epic:** A — Account · **Phase:** P1 · **ERD:** `account` (§17)
**Description (source):** As a cook, I want email/password (or existing SSO) so my recipes survive closing the browser. (Recipe_Systems.md §12)

**Acceptance criteria (source):**
1. Register → empty library.
2. Save while signed out → sign-in, then resume save.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Register a new account | Library renders empty |
| TC-02 | Save while signed out, then sign in | Save resumes onto the account |

---

### A2 — Guest session, then claim it

**Priority:** Should · **Epic:** A — Account · **Phase:** P1 · **ERD:** `guest_session`, `recipe.guest_session_id`, XOR CHECK, claim transaction (§17)
**Description (source):** As a first-time cook, I want to analyse one card before signing up.

**Acceptance criteria (source):**
1. Guest can ingest and see analysis.
2. Save migrates the current recipe onto a new account.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Guest ingests a recipe without an account | Analysis renders |
| TC-02 | Guest saves → signs up | Current recipe migrates to the new account (claim transaction; guest row preserved as audit per BUILD_PLAN P1-3) |

---

## Epic B — Intake

### B1 — Paste a recipe

**Priority:** Must · **Epic:** B — Intake · **Phase:** P2 · **ERD:** `recipe_input` (raw event, C-41) + `recipe_ingredient_line` (corrected object) (§17)
**Description (source):** Accepts mixed units, "to taste," "as required," vernacular names.

**Acceptance criteria (source):**
1. Mixed units, "to taste," "as required," vernacular names are accepted.
2. Kanyakumari paste keeps two fenugreek lines.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Paste a recipe with mixed units, "to taste," "as required," vernacular names | Accepted into the corrected object |
| TC-02 | Paste the golden Kanyakumari card | Two fenugreek lines survive as separate lines |

---

### B2 — Photograph a recipe card

**Priority:** Must · **Epic:** B — Intake · **Phase:** P2 · **ERD:** `recipe_input.ocr_text` + `recipe_ingredient_line.needs_review`/`ocr_confidence` (§17)
**Description (source):** JPEG/PNG from phone or desktop; OCR draft visible before analysis.

**Acceptance criteria (source):**
1. JPEG/PNG from phone or desktop.
2. OCR draft visible before analysis.
3. Golden fixture: Fish 500g, Drumstick 1, Mango 1/2, Half Shell coconut, both fenugreeks, no garlic.
4. Low-confidence OCR lines flagged, not dropped.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Photograph a card from phone and desktop (JPEG/PNG) | Photo accepted, stored as object-storage URI |
| TC-02 | After OCR, before analysis | OCR draft visible for review |
| TC-03 | Photograph the golden fixture card | Fish 500g, Drumstick 1, Mango 1/2, Half Shell coconut, both fenugreeks, no garlic all present in the draft |
| TC-04 | OCR returns low confidence on some lines | Lines flagged (needs_review), never dropped (INV-04) |

---

### B3 — Review and correct the parse

**Priority:** Must · **Epic:** B — Intake · **Phase:** P2 · **ERD:** mutable lines; `recipe_input` stays untouched as raw record (§17)
**Description (source):** Edit, add, delete, split, merge lines; mark headers; the corrected object is what analysis reads.

**Acceptance criteria (source):**
1. Edit, add, delete, split, merge lines (split the wrapped chilli/coriander line).
2. Mark non-ingredient headers.
3. Corrected object is what analysis reads.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Edit / add / delete / split / merge lines; split the wrapped chilli/coriander line | Corrected object reflects every operation |
| TC-02 | Mark a non-ingredient header | Header excluded from the ingredient object |
| TC-03 | Analysis runs after correction | Analysis reads the corrected object, not the raw input (raw record untouched) |

---

### B4 — Enter or attach a method

**Priority:** Must · **Epic:** B — Intake · **Phase:** P2 · **ERD:** `method_text`, `method_source_tag`, `method_inferred_source` (§17)
**Description (source):** Method optional; absent method → list-only analysis or matched-family method tagged INFERRED with the source named.

**Acceptance criteria (source):**
1. Method optional.
2. If absent: analyse list-only, or accept a matched family method tagged INFERRED with source named.
3. List-only → Views 3 and 7 INCOMPLETE.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Recipe with a method entered | Method attached and used |
| TC-02 | No method; accept the matched family method (e.g., CDK 1669 / Mrs. Anitha) | Tagged INFERRED with the source named |
| TC-03 | No method, list-only analysis | Views 3 and 7 render INCOMPLETE — never fabricated (§3.4) |

---

### B5 — Structured form intake

**Priority:** Should · **Epic:** B — Intake · **Phase:** P2 · **ERD:** `recipe_input.input_type = 'form'`; `amount_text` free text (§17)
**Description (source):** Same object as paste and photo.

**Acceptance criteria (source):**
1. Same object as paste and photo.
2. Units include tsp, tbsp, g, kg, nos, to taste, as required, lemon size, half shell.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Enter a recipe via the structured form | Produces the same corrected object shape as paste/photo |
| TC-02 | Use each unit: tsp, tbsp, g, kg, nos, to taste, as required, lemon size, half shell | All accepted |

---

### B6 — Vernacular aliases

**Priority:** Should · **Epic:** B — Intake · **Phase:** P7 · **ERD:** `ingredient_dictionary`, `ingredient_alias.requires_confirmation` (§17)
**Description (source):** drumstick / murungakkai / moringa; shallots / chinna vengayam / cheriya ulli; fenugreek / methi / uluva / vendhayam; tamarind / puli; curry leaves / karuveppilai.

**Acceptance criteria (source):**
1. The five alias groups above resolve to the canonical ingredient.
2. Ambiguous "drumstick" asks for confirmation.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Paste each vernacular name in the five groups | Resolves to the canonical ingredient via the dictionary/alias path |
| TC-02 | Input "drumstick" | Confirmation asked (`requires_confirmation`) |

---

## Epic C — Analysis

### C1 — Identify the dish family

**Priority:** Must · **Epic:** C — Analysis · **Phase:** P3 · **ERD:** `analysis.family`/`family_confidence`/`architecture_summary`/`not_this_neighbors`/`absent_family_items` (§17)
**Description (source):** Family, one-line architecture, confidence, not-this neighbours, ABSENT family items.

**Acceptance criteria (source):**
1. Family, one-line architecture, confidence, not-this neighbours, ABSENT family items.
2. Golden fixture is not "generic Indian curry."

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Analyse the golden fixture | Identification block contains all five fields |
| TC-02 | Analyse the golden fixture | Family is not "generic Indian curry" (golden invariant) |

---

### C2 — Run all views

**Priority:** Must · **Epic:** C — Analysis · **Phase:** P3 views 1–4, P4 views 5–9 · **ERD:** `analysis_view` 1..9, `analysis_claim` (§17)
**Description (source):** All nine render, or a view is explicitly INCOMPLETE.

**Acceptance criteria (source):**
1. All nine render, or a view is explicitly INCOMPLETE.
2. No invented ingredients.
3. Coriander in View 1; View 2 records the pillar blind spot.
4. Two fenugreeks treated as two uses of one idea.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Analyse a complete recipe | All nine views render |
| TC-02 | Analyse an incomplete recipe | Affected views render INCOMPLETE, explicitly |
| TC-03 | Inspect views for ingredients not on the card | Zero invented ingredients (INV-10) |
| TC-04 | Analyse the golden fixture | Coriander present in View 1; View 2 records the coriander blind-spot note |
| TC-05 | Analyse the golden fixture | Two fenugreek lines treated as two uses of one idea — never merged |

---

### C3 — Toggle home and chef mode

**Priority:** Must · **Epic:** C — Analysis · **Phase:** P4 · **ERD:** `account.preferred_mode`, `analysis.mode` (§17; toggle semantics open, ERD §15.4)
**Description (source):** Default home. Chef leads with station card. Mode preference saved on the account.

**Acceptance criteria (source):**
1. Default home. Chef leads with station card.
2. Mode preference saved on the account.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Open an analysis | Home mode by default |
| TC-02 | Toggle to chef mode | Station card leads the view |
| TC-03 | Toggle preference, sign out, sign in | Preference persisted on the account |

---

### C4 — Claim tags and disagreements

**Priority:** Must · **Epic:** C — Analysis · **Phase:** P3 · **ERD:** `analysis_claim.claim_tag`, `source_reference` (§17)
**Description (source):** CARD / METHOD / INFERRED / ABSENT / UNKNOWN / ASSUMED visible.

**Acceptance criteria (source):**
1. CARD / METHOD / INFERRED / ABSENT / UNKNOWN / ASSUMED visible.
2. Inferred method names its source.
3. Disagreement module can show the coriander case.
4. UNKNOWN fields stay blank.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Inspect claims across views | Every claim wears exactly one of the six tags |
| TC-02 | View an INFERRED method claim | Source named |
| TC-03 | Open the disagreement module on the golden fixture | Coriander case shown (View 1 vs View 2) |
| TC-04 | View a field whose value is unknown | Rendered blank, never fabricated |

---

### C5 — Station card

**Priority:** Must · **Epic:** C — Analysis · **Phase:** P4 · **ERD:** `analysis_station_card` (§17)
**Description (source):** Generated when a method exists or an inferred method was accepted.

**Acceptance criteria (source):**
1. Generated when a method exists or an inferred method was accepted.
2. Mise, sequence, do-nots, control points. Printable.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Analysis with a method (entered or accepted-inferred) | Station card generated |
| TC-02 | Inspect the station card | Mise, sequence, do-nots, control points present |
| TC-03 | Print the station card | Printable (golden invariant: appears when an inferred method is accepted) |

---

### C6 — Re-analyse after edit

**Priority:** Should · **Epic:** C — Analysis · **Phase:** P7 · **ERD:** `analysis.snapshot_of_analysis_id`, `is_current` (§17)
**Description (source):** Explicit re-run. Does not silently overwrite cook notes.

**Acceptance criteria (source):**
1. Explicit re-run.
2. Does not silently overwrite cook notes.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Edit a saved recipe, then re-analyse | Re-run happens only on explicit request |
| TC-02 | Re-analyse a recipe with cook logs | Cook notes preserved; previous analysis snapshotted (D5 chain) |

---

### C7 — Preview a substitution

**Priority:** Could · **Epic:** C — Analysis · **Phase:** P7 (conditional — §13 could-haves rule) · **ERD:** §17 ✅
**Description (source):** One swap from View 4. States structural / modular / identity-shift. Does not invent a new recipe.

**Acceptance criteria (source):**
1. One swap from View 4.
2. States structural / modular / identity-shift.
3. Does not invent a new recipe.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Preview one swap from View 4 | Preview states structural / modular / identity-shift |
| TC-02 | Inspect the preview | No new recipe invented (no-invention rule holds) |

---

## Epic D — Save and library

### D1 — Save a recipe

**Priority:** Must · **Epic:** D — Save and library · **Phase:** P5 · **ERD:** ERD §13 (§17 ✅)
**Description (source):** Stores raw input, photo, object, identification, analysis (or regenerate capability), timestamps. Default name is the family, editable.

**Acceptance criteria (source):**
1. Stores raw input, photo, object, identification, analysis (or regenerate capability), timestamps.
2. Default name is the family, editable.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Save a fully analysed recipe | All six artifacts stored (raw input, photo, object, identification, analysis, timestamps) |
| TC-02 | Save without naming | Default name = dish family, editable afterwards |

---

### D2 — Browse and open library

**Priority:** Must · **Epic:** D — Save and library · **Phase:** P5 · **ERD:** ERD §13 (§17 ✅)
**Description (source):** Library shows name, date, family, whether a cook log exists.

**Acceptance criteria (source):**
1. Library shows name, date, family, whether a cook log exists.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Save several recipes, open the library | Each row shows name, date, family, cook-log indicator |

---

### D3 — Tag and find

**Priority:** Should · **Epic:** D — Save and library · **Phase:** P7 · **ERD:** `recipe_tag` (§17 ✅)
**Description (source):** Free-text tags. Search name, ingredients, tags.

**Acceptance criteria (source):**
1. Free-text tags.
2. Search name, ingredients, tags.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Tag a recipe with free-text tags | Tags persist on the recipe |
| TC-02 | Search by name, by ingredient, by tag | Correct recipes returned for each search axis |

---

### D4 — Edit a saved recipe

**Priority:** Should · **Epic:** D — Save and library · **Phase:** P7 · **ERD:** ERD §13 (§17 ✅)
**Description (source):** Returns to parse review. Asks whether to re-analyse. Cook logs remain.

**Acceptance criteria (source):**
1. Returns to parse review.
2. Asks whether to re-analyse.
3. Cook logs remain.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Edit a saved recipe | Lands in parse review |
| TC-02 | Complete the edit | Re-analyse asked, never forced (C6) |
| TC-03 | Edit a recipe with cook logs | Cook logs remain attached |

---

### D5 — Analysis snapshot

**Priority:** Should · **Epic:** D — Save and library · **Phase:** P7 · **ERD:** `is_current` chain (§17 ✅)
**Description (source):** On re-analyse, previous analysis is snapshotted and linked to existing logs. Last + current is enough for the pilot.

**Acceptance criteria (source):**
1. Previous analysis snapshotted and linked to existing logs.
2. Last + current is enough for the pilot.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Re-analyse a saved recipe | Previous analysis becomes a linked snapshot |
| TC-02 | Open a re-analysed recipe | Last + current analyses both reachable; logs point at the analysis they were made against |

---

### D6 — Delete a recipe

**Priority:** Must · **Epic:** D — Save and library · **Phase:** P5 · **ERD:** hard DELETE cascade, ERD §13 (§17 ✅)
**Description (source):** Confirm. Removes photo, object, analyses, lists, logs. No public residue.

**Acceptance criteria (source):**
1. Confirm.
2. Removes photo, object, analyses, lists, logs.
3. No public residue.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Delete without confirming | Nothing removed |
| TC-02 | Confirm delete | Photo, object, analyses, lists, logs all removed (cascade) |
| TC-03 | Delete, then access any prior surface | No residue reachable (object-storage URI gone, prints/snapshots gone) |

---

## Epic E — Shopping list and print

### E1 — Generate a shopping list

**Priority:** Must · **Epic:** E — Shopping list and print · **Phase:** Track S data layer; printed surface P5 · **ERD:** `shopping_list_generation`, `shopping_list_item` (§17 ✅)
**Description (source):** From the structured object, not from prose. One row per ingredient. "To taste" and "for tempering" stay visible. Two fenugreek rows. No headers.

**Acceptance criteria (source):**
1. From the structured object, not from prose.
2. One row per ingredient.
3. "To taste" and "for tempering" stay visible.
4. Two fenugreek rows.
5. No headers.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Generate a list from a recipe with prose quirks | List generated from the structured object only |
| TC-02 | Inspect the list | One row per ingredient |
| TC-03 | Inspect "to taste" / "for tempering" rows | Both stay visible |
| TC-04 | Generate from the golden fixture | Two fenugreek rows, distinct |
| TC-05 | Inspect the list | No headers |

---

### E2 — Tick off owned items

**Priority:** Should · **Epic:** E — Shopping list and print · **Phase:** Track S · **ERD:** `ingredient_shopping_state` (§17 ✅)
**Description (source):** Have / need. Print hides or strikes "have." Persists on the saved recipe.

**Acceptance criteria (source):**
1. Have / need.
2. Print hides or strikes "have."
3. Persists on the saved recipe.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Tick items as have / need | State recorded per ingredient |
| TC-02 | Print with items ticked "have" | "Have" items hidden or struck on the paper |
| TC-03 | Reopen the saved recipe | Have/need state persisted (survives list regeneration) |

---

### E3 — Group list for market

**Priority:** Should · **Epic:** E — Shopping list and print · **Phase:** Track S · **ERD:** §17 ✅
**Description (source):** Fresh produce, fish/meat, spices, fats/oils, other.

**Acceptance criteria (source):**
1. Fresh produce, fish/meat, spices, fats/oils, other.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Generate a list with items from every category | Grouped: fresh produce, fish/meat, spices, fats/oils, other |

---

### E4 — Print the shopping list

**Priority:** Must · **Epic:** E — Shopping list and print · **Phase:** P5 · **ERD:** render layer (ADR §7) (§17 ✅)
**Description (source):** Black text, recipe name, date, grouped rows, checkboxes. One A4/Letter page for this card. No account chrome. Includes View 8 allergen line.

**Acceptance criteria (source):**
1. Black text, recipe name, date, grouped rows, checkboxes.
2. One A4/Letter page for this card.
3. No account chrome.
4. Includes View 8 allergen line.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Print the golden list | Black text, recipe name, date, grouped rows, checkboxes |
| TC-02 | Print the golden list | Fits one A4/Letter page (P7 exit metric) |
| TC-03 | Inspect the printed page | No account chrome |
| TC-04 | Inspect the printed page | View 8 allergen line present (H4; mechanism gated on Q2) |

---

### E5 — Print the station card

**Priority:** Must · **Epic:** E — Shopping list and print · **Phase:** P5 · **ERD:** render layer (ADR §7) (§17 ✅)
**Description (source):** Separate from the list. Control points + "untasted briefing." Readable at arm's length. Allergen line included.

**Acceptance criteria (source):**
1. Separate from the list.
2. Control points + "untasted briefing."
3. Readable at arm's length.
4. Allergen line included.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Print the station card | Separate document from the shopping list |
| TC-02 | Inspect the card | Control points and "untasted briefing" present |
| TC-03 | View the card at arm's length | Legible |
| TC-04 | Inspect the card | Allergen line included (H4) |

---

### E6 — Home-mode one-pager

**Priority:** Could · **Epic:** E — Shopping list and print · **Phase:** P7 (conditional — §13 could-haves rule) · **ERD:** §17 ✅
**Description (source):** Keep / negotiate / identity-shift + ingredient list. Optional View 9 energy band. Not a legal nutrition label.

**Acceptance criteria (source):**
1. Keep / negotiate / identity-shift + ingredient list.
2. Optional View 9 energy band.
3. Not a legal nutrition label.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Print the one-pager | Keep / negotiate / identity-shift sections + ingredient list |
| TC-02 | Enable the energy band | View 9 band appears on the one-pager only |
| TC-03 | Inspect the one-pager | Nothing presented as a legal nutrition label |

---

## Epic F — After-cook capture

### F1 — Log that I cooked it

**Priority:** Must · **Epic:** F — After-cook capture · **Phase:** P6 · **ERD:** `cook_log` (§17 ✅)
**Description (source):** Date default today, editable. Multiple logs per recipe. Library shows last cooked.

**Acceptance criteria (source):**
1. Date default today, editable.
2. Multiple logs per recipe.
3. Library shows last cooked.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Log a cook without touching the date | `cooked_at` defaults to today |
| TC-02 | Edit the date | Editable |
| TC-03 | Log the same recipe twice | Two log rows, both kept |
| TC-04 | Open the library | Last cooked date shown |

---

### F2 — Rating and note

**Priority:** Must · **Epic:** F — After-cook capture · **Phase:** P6 · **ERD:** `cook_log` (§17 ✅)
**Description (source):** 1–5 optional + free text. Private. Visible on reopen, above the analysis.

**Acceptance criteria (source):**
1. 1–5 optional + free text.
2. Private.
3. Visible on reopen, above the analysis.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Rate 1–5 and write a note | Both stored on the log |
| TC-02 | Log with no rating/note | Allowed (optional) |
| TC-03 | Reopen the recipe | Note visible above the analysis, private to the owner |

---

### F3 — Record swaps used

**Priority:** Should · **Epic:** F — After-cook capture · **Phase:** P7 · **ERD:** `cook_log_swap` (§17 ✅)
**Description (source):** Skipped / reduced / increased / swapped. Does not rewrite the card unless the user applies the swap.

**Acceptance criteria (source):**
1. Skipped / reduced / increased / swapped.
2. Does not rewrite the card unless the user applies the swap.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Record each type: skipped / reduced / increased / swapped | All four recorded on the log |
| TC-02 | Record a swap, reopen the recipe | Card unchanged unless the swap was explicitly applied |

---

### F4 — Next-time instruction

**Priority:** Should · **Epic:** F — After-cook capture · **Phase:** P7 · **ERD:** `cook_log` (§17 ✅)
**Description (source):** Dedicated field. Shown on station card tagged COOK LOG, not CARD.

**Acceptance criteria (source):**
1. Dedicated field.
2. Shown on station card tagged COOK LOG, not CARD.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Write a next-time note | Stored in the dedicated field |
| TC-02 | Print the station card after adding the note | Note appears tagged COOK LOG — never as CARD provenance |

---

### F5 — Plate photo

**Priority:** Could · **Epic:** F — After-cook capture · **Phase:** P7 (conditional — §13 could-haves rule) · **ERD:** `cook_log_photo` (§17 ✅)
**Description (source):** One image per log. Not re-analysed unless asked.

**Acceptance criteria (source):**
1. One image per log.
2. Not re-analysed unless asked.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Attach a plate photo to a log | One image stored per log |
| TC-02 | Attach a photo, do nothing else | No re-analysis triggered unless explicitly asked |

---

### F6 — Surface last-cook notes on reopen

**Priority:** Must · **Epic:** F — After-cook capture · **Phase:** P6 · **ERD:** `cook_log` (§17 ✅)
**Description (source):** Last cooked date, rating, next-time line. Shopping list still reflects the saved card unless a swap was applied.

**Acceptance criteria (source):**
1. Last cooked date, rating, next-time line.
2. Shopping list still reflects the saved card unless a swap was applied.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Reopen a recipe with cook history | Last cooked date, rating, next-time line surfaced at the top |
| TC-02 | Regenerate the shopping list after a cook | List reflects the saved card, unless a swap was applied |

---

## Epic G — Quality

### G1 — Golden fixture in CI

**Priority:** Must · **Epic:** G — Quality · **Phase:** P0 (runs on every phase thereafter) · **ERD:** ERD §16 (§17 ✅)
**Description (source):** The Kanyakumari card as the CI gate that never leaves (Recipe_Systems §3.8). All eight invariants.

**Acceptance criteria (source):**
1. Both fenugreeks present.
2. No ginger/garlic.
3. Family not generic curry.
4. View 2 has coriander blind-spot note.
5. Chef mode has station card when inferred method accepted.
6. View 8 flags fish + mustard, coconut not filed as US major tree nut, no "safe" language.
7. View 9 is a band, sodium Unknown, no point-kcal.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Golden fixture in CI (blocking) | Both fenugreek lines present |
| TC-02 | Golden fixture | No ginger, no garlic anywhere |
| TC-03 | Golden fixture | Family is not "generic curry" |
| TC-04 | Golden fixture | View 2 carries the coriander blind-spot note |
| TC-05 | Golden fixture, accept inferred method | Station card appears in chef mode |
| TC-06 | Golden fixture View 8 | Flags fish + mustard; coconut not filed as US major tree nut; no "safe" language |
| TC-07 | Golden fixture View 9 | Band, not a point; sodium Unknown; no point-kcal |

---

### G2 — Regional veto on View 5

**Priority:** Must · **Epic:** G — Quality · **Phase:** P7 · **ERD:** review workflow (ADR §8) (§17 ✅)
**Description (source):** Reviewer can block a live regional sentence. Pilot: one Tamil Nadu / Kanyakumari reviewer and one Kerala reviewer on the fish-curry cluster.

**Acceptance criteria (source):**
1. Reviewer can block a live regional sentence.
2. Pilot: one Tamil Nadu / Kanyakumari reviewer and one Kerala reviewer on the fish-curry cluster.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | A reviewer vetoes a View 5 regional sentence | Sentence blocked from live views |
| TC-02 | Pilot workflow | Both regional reviewers configured on the fish-curry cluster (Week-11 workflow per BUILD_PLAN P7-3) |

---

### G3 — Chef pass on three related curries

**Priority:** Must · **Epic:** G — Quality · **Phase:** P7 · **ERD:** §17 ✅
**Description (source):** Kumari / inland Tamil / Kerala kudampuli. Pass = identification differs, zero invented ingredients, station cards runnable, no "safe," no point-kcal presented as fact.

**Acceptance criteria (source):**
1. Kumari / inland Tamil / Kerala kudampuli.
2. Pass = identification differs.
3. Zero invented ingredients.
4. Station cards runnable.
5. No "safe," no point-kcal presented as fact.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Chef pass on the three curries | Identifications differ (three separable dishes) |
| TC-02 | Chef pass | Zero invented ingredients |
| TC-03 | Chef pass | Station cards runnable |
| TC-04 | Chef pass | No "safe" in View 8; no point-kcal presented as fact in View 9 |

---

## Epic H — Dietary profile (View 8)

### H1 — Household restriction profile

**Priority:** Should · **Epic:** H — Dietary profile · **Phase:** P7 · **ERD:** `account_restriction_profile` (§17 ✅)
**Description (source):** Allergens, diet patterns, US or EU pack. Optional. Never auto-deletes recipes.

**Acceptance criteria (source):**
1. Allergens, diet patterns, US or EU pack.
2. Optional.
3. Never auto-deletes recipes.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Configure allergens, diet patterns, US/EU pack | Profile stored |
| TC-02 | Use the product without a profile | Optional — nothing forced |
| TC-03 | Set a conflicting profile | No recipe is auto-deleted |

---

### H2 — Run View 8 on every analysis

**Priority:** Must · **Epic:** H — Dietary profile · **Phase:** P4 · **ERD:** `dietary_allergen_definition`/`mapping` via `analysis_claim.allergen_id` (§17 ✅)
**Description (source):** Golden mapping as in §6 View 8. Disclaimer visible.

**Acceptance criteria (source):**
1. Golden mapping as in §6 View 8.
2. Disclaimer visible.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Analyse the golden fixture | View 8 matches the §6 worked mapping (fish + mustard flagged; coconut not filed as US major tree nut) |
| TC-02 | View 8 on any analysis | Disclaimer visible (H6) |

---

### H3 — Highlight against profile

**Priority:** Should · **Epic:** H — Dietary profile · **Phase:** P7 · **ERD:** `account_restriction_item` (§17 ✅)
**Description (source):** Conflicts first. Unknown is not a pass.

**Acceptance criteria (source):**
1. Conflicts first.
2. Unknown is not a pass.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Analyse a recipe with conflicts against the profile | Conflicts listed first |
| TC-02 | Analyse a recipe with unknown matches | Unknown shown as unknown — never treated as a pass |

---

### H4 — Print the allergen line

**Priority:** Must · **Epic:** H — Dietary profile · **Phase:** P5 · **ERD:** render layer (ADR §7) (§17 ✅)
**Description (source):** On shopping list and station card.

**Acceptance criteria (source):**
1. On shopping list.
2. On station card.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Print the shopping list | Allergen line present (mechanism gated on Q2) |
| TC-02 | Print the station card | Allergen line present |

---

### H5 — Log a restriction-driven swap

**Priority:** Should · **Epic:** H — Dietary profile · **Phase:** P7 · **ERD:** via F3 (§17 ✅)
**Description (source):** Uses F3. Does not silently rewrite the card.

**Acceptance criteria (source):**
1. Uses F3.
2. Does not silently rewrite the card.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Record a restriction-driven swap | Uses the F3 swap record |
| TC-02 | Reopen the recipe | Card unchanged unless the swap was applied |

---

### H6 — View 8 disclaimer

**Priority:** Must · **Epic:** H — Dietary profile · **Phase:** P4 · **ERD:** §17 ✅
**Description (source):** "Reads the card only. Does not test food. Does not know your kitchen. Not medical advice."

**Acceptance criteria (source):**
1. The exact disclaimer text above on every View 8 surface.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | View 8 on every surface (analysis, prints) | Disclaimer text present verbatim |

---

### H7 — Versioned allergen mapping

**Priority:** Must · **Epic:** H — Dietary profile · **Phase:** Track R · **ERD:** effective-dated tables (§17 ✅)
**Description (source):** Curated tables. A mapping change is a reviewed data change.

**Acceptance criteria (source):**
1. Curated tables.
2. A mapping change is a reviewed data change.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Load the allergen mapping via the reviewed path | Versioned, effective-dated |
| TC-02 | Attempt an unreviewed mapping change | Rejected — reviewed path only (Track R exit) |

---

## Epic I — Nutrition bands (View 9)

### I1 — Run View 9 as a band

**Priority:** Must · **Epic:** I — Nutrition bands · **Phase:** P4 · **ERD:** `nutrition_food_composition_*` (§17 ✅)
**Description (source):** Golden fixture shows a range, not a point.

**Acceptance criteria (source):**
1. Golden fixture shows a range, not a point.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Analyse the golden fixture | View 9 shows a band (e.g., 1,300–2,200 kcal for the pot), never a point-kcal |

---

### I2 — Show and edit assumptions

**Priority:** Must · **Epic:** I — Nutrition bands · **Phase:** P4 · **ERD:** §17 ✅
**Description (source):** Fish class, coconut grams, oil tablespoons. Edit recomputes.

**Acceptance criteria (source):**
1. Fish class, coconut grams, oil tablespoons.
2. Edit recomputes.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | View 9 assumptions | Fish class, coconut grams, oil tablespoons shown |
| TC-02 | Edit an assumption | Band recomputes |

---

### I3 — Set portions

**Priority:** Should · **Epic:** I — Nutrition bands · **Phase:** P7 · **ERD:** ⚠️ openly deferred — Q14 (§17: "1 (I3) honestly left open")
**Description (source):** Per-bowl band only after portions are set.

**Acceptance criteria (source):**
1. Per-bowl band only after portions are set.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Set portions, view the band | Per-bowl band shown only after portions set |

> **OPEN DECISION:** portion-count persistence is Q14 (ERD §15.6, §17; BUILD_PLAN §7.8 — defer to the View 9 payload, revisit post-pilot). This story stays OPEN-gated; the dispatch unit carries it.

---

### I4 — Tighten the band

**Priority:** Should · **Epic:** I — Nutrition bands · **Phase:** P7 · **ERD:** §17 ✅
**Description (source):** Name fish / weigh coconut / measure oil.

**Acceptance criteria (source):**
1. Name fish / weigh coconut / measure oil.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Provide each tightening input (named fish, weighed coconut, measured oil) | Band narrows accordingly |

---

### I5 — Optional energy band on the one-pager

**Priority:** Could · **Epic:** I — Nutrition bands · **Phase:** P7 (conditional — §13 could-haves rule) · **ERD:** §17 ✅
**Description (source):** Never on the market list as if it were a packaged-food label.

**Acceptance criteria (source):**
1. Optional energy band on the one-pager.
2. Never on the market list as if it were a packaged-food label.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | Enable the energy band | Appears on the one-pager (E6) |
| TC-02 | Print the market list | No energy band presented as a packaged-food label |

---

### I6 — View 9 disclaimer

**Priority:** Must · **Epic:** I — Nutrition bands · **Phase:** P4 · **ERD:** §17 ✅
**Description (source):** "Table estimate from stated assumptions. Not a lab analysis. Not medical advice."

**Acceptance criteria (source):**
1. The exact disclaimer text above on every View 9 surface.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | View 9 on every surface (analysis, prints) | Disclaimer text present verbatim |

---

### I7 — Versioned food composition table

**Priority:** Must · **Epic:** I — Nutrition bands · **Phase:** Track R · **ERD:** `nutrition_food_composition_version` (§17 ✅)
**Description (source):** USDA or peer IDs on mapped lines. Unmapped lines excluded from totals and listed.

**Acceptance criteria (source):**
1. USDA or peer IDs on mapped lines.
2. Unmapped lines excluded from totals and listed.

**Test cases (derived 1:1):**
| # | Test | Expected |
|---|---|---|
| TC-01 | View 9 on a recipe with mapped lines | USDA/peer IDs shown on mapped lines |
| TC-02 | View 9 on a recipe with unmapped lines | Unmapped lines excluded from totals and listed |

---

## Story → Dispatch → Audit → Handoff traceability

| Story set | Dispatch units (DISPATCH.md) | Audit units (AUDIT.md) | Handoff evidence (HANDOFF.md) |
|---|---|---|---|
| G1 | D-03 (P0 golden scaffold), every phase re-runs it | A-03 + every later audit's golden check | Golden fixture results per phase |
| A1, A2 | D-06…D-09 (P1) | A-06…A-09 | H-06…H-09 |
| B1–B5 | D-10…D-14 (P2) | A-10…A-14 | H-10…H-14 |
| C1, C2 (1–4), C4 | D-15…D-18 (P3) | A-15…A-18 | H-15…H-18 |
| C2 (5–9), C3, C5, H2, H6, I1, I2, I6 | D-19…D-21 (P4) | A-19…A-21 | H-19…H-21 |
| D1, D2, D6, E4, E5, H4 | D-22, D-23 (P5) | A-22, A-23 | H-22, H-23 |
| F1, F2, F6 | D-24 (P6) | A-24 | H-24 |
| B6, C6, C7, D3–D5, F3, F4, G2, G3, H1, H3, H5, I3, I4 | D-25…D-28 (P7) | A-25…A-28 | H-25…H-28 |
| H7, I7 | D-29 (Track R) | A-29 | H-29 |
| E1–E3 | D-30 (Track S) | A-30 | H-30 |
| E6, F5, I5 | D-31 (P7 tail — conditional per §13) | A-31 | H-31 |

Every story is scheduled exactly once (`BUILD_PLAN.md` §6 — unchanged); the chain above is the same ledger, expanded one level. If a dispatch unit changes phase placement, `BUILD_PLAN.md` §6 must be amended first — never here alone.
