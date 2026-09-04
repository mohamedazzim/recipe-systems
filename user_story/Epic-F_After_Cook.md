# Epic F — After-cook capture (F1–F6)

> **Epic:** F — After-cook capture · **Stories:** F1 (Must), F2 (Must), F3 (Should), F4 (Should), F5 (Could — conditional per §13), F6 (Must) · **Domain:** Cook log
> **Boundaries:** cook logs record what really happened without rewriting the recipe (ERD §19). Notes are private (F2). Swaps never rewrite the card unless applied (F3). The next-time line prints on the station card tagged COOK LOG, never CARD (F4).
> **Full detail:** description + acceptance criteria + test cases + API + data + traceability. Source: Recipe_Systems.md §12.
> **Canonical note:** canonical split representation of Epic F from `USER_STORIES.md` v1.1 — story IDs, acceptance criteria, and test cases preserved exactly; only the presentation follows the mentor's epic-file format.

---

## F1 — Log that I cooked it

| Field | Value |
|---|---|
| **Story ID** | F1 |
| **Epic ref** | Epic F — After-cook capture (Recipe_Systems §12) |
| **Phase** | P6 (wk 10) |
| **Domain** | Cook log |
| **Priority** | Must |

**Badges:** UI · Backend · Priority: Must

### Description

**As a cook**, I want to **log that I cooked a recipe** — date default today, editable; multiple logs per recipe; library shows last cooked. (Recipe_Systems.md §12)

### Acceptance Criteria

- AC-1: Date default today, editable.
- AC-2: Multiple logs per recipe.
- AC-3: Library shows last cooked.

### Test Cases

**TC-01 — Date defaults to today**
- Given: a cook log created without touching the date
- When: it is saved
- Then: `cooked_at` defaults to today

**TC-02 — Date editable**
- Given: a cook log
- When: the date is edited
- Then: the edit is stored

**TC-03 — Multiple logs kept**
- Given: the same recipe cooked twice
- When: both are logged
- Then: two log rows exist, both kept

**TC-04 — Library shows last cooked**
- Given: a recipe with cook logs
- When: the library is opened
- Then: the last cooked date is shown

### API Endpoints

Not yet defined at the design stage. Specified by dispatch unit **D-24**.

### Data

| Entity | Role | Source |
|---|---|---|
| `cook_log` | `cooked_at` | ERD §8 |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-24 | A-24 | H-24 | ERD §17 ✅ | — |

---

## F2 — Rating and note

| Field | Value |
|---|---|
| **Story ID** | F2 |
| **Epic ref** | Epic F — After-cook capture (Recipe_Systems §12) |
| **Phase** | P6 (wk 10) |
| **Domain** | Cook log |
| **Priority** | Must |

**Badges:** UI · Backend · Priority: Must

### Description

**As a cook**, I want a **1–5 optional rating plus a free-text note** — private — **visible on reopen, above the analysis**. (Recipe_Systems.md §12)

### Acceptance Criteria

- AC-1: 1–5 optional + free text.
- AC-2: Private.
- AC-3: Visible on reopen, above the analysis.

### Test Cases

**TC-01 — Rating and note stored**
- Given: a cook log
- When: a rating (1–5) and a note are written
- Then: both are stored on the log

**TC-02 — Both optional**
- Given: a cook log
- When: no rating and no note are given
- Then: the log is allowed (optional)

**TC-03 — Above the analysis, private**
- Given: a reopened recipe
- When: the note is viewed
- Then: the note is visible above the analysis and private to the owner

### API Endpoints

Not yet defined at the design stage. Specified by dispatch unit **D-24**.

### Data

| Entity | Role | Source |
|---|---|---|
| `cook_log` | rating, note | ERD §8 |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-24 | A-24 | H-24 | ERD §17 ✅ | — |

---

## F3 — Record swaps used

| Field | Value |
|---|---|
| **Story ID** | F3 |
| **Epic ref** | Epic F — After-cook capture (Recipe_Systems §12) |
| **Phase** | P7 (wks 11–12) |
| **Domain** | Cook log |
| **Priority** | Should |

**Badges:** UI · Backend · Priority: Should

### Description

**As a cook**, I want to **record what I actually used** — skipped / reduced / increased / swapped — **without rewriting the card unless the swap is applied**. (Recipe_Systems.md §12)

### Acceptance Criteria

- AC-1: Skipped / reduced / increased / swapped.
- AC-2: Does not rewrite the card unless the user applies the swap.

### Test Cases

**TC-01 — Four record types**
- Given: a cook log
- When: each type is recorded — skipped / reduced / increased / swapped
- Then: all four are recorded on the log

**TC-02 — Card unchanged**
- Given: a swap recorded, recipe reopened
- When: the card is inspected
- Then: the card is unchanged unless the swap was explicitly applied

### API Endpoints

Not yet defined at the design stage. Specified by dispatch unit **D-26** (restriction-driven swaps reuse this record — H5).

### Data

| Entity | Role | Source |
|---|---|---|
| `cook_log_swap` | swap records | ERD §8 |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-26 | A-26 | H-26 | ERD §17 ✅ | — |

---

## F4 — Next-time instruction

| Field | Value |
|---|---|
| **Story ID** | F4 |
| **Epic ref** | Epic F — After-cook capture (Recipe_Systems §12) |
| **Phase** | P7 (wks 11–12) |
| **Domain** | Cook log |
| **Priority** | Should |

**Badges:** UI · Backend · Print · Priority: Should

### Description

**As a cook**, I want a **dedicated next-time field** shown on the station card **tagged COOK LOG, not CARD**. (Recipe_Systems.md §12)

### Acceptance Criteria

- AC-1: Dedicated field.
- AC-2: Shown on station card tagged COOK LOG, not CARD.

### Test Cases

**TC-01 — Dedicated field**
- Given: a cook log
- When: a next-time note is written
- Then: it is stored in the dedicated field

**TC-02 — Tagged COOK LOG on the card**
- Given: a station card printed after the note
- When: inspected
- Then: the note appears tagged COOK LOG — never as CARD provenance

### API Endpoints

Not yet defined at the design stage. Specified by dispatch unit **D-26** (print integration with the D-23 templates).

### Data

| Entity | Role | Source |
|---|---|---|
| `cook_log` | next-time field | ERD §8 |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-26 | A-26 | H-26 | ERD §17 ✅ | — |

---

## F5 — Plate photo

| Field | Value |
|---|---|
| **Story ID** | F5 |
| **Epic ref** | Epic F — After-cook capture (Recipe_Systems §12) |
| **Phase** | P7 (wks 11–12) — conditional per §13 (could-haves ship only if Must on weeks 9–10 is stable) |
| **Domain** | Cook log |
| **Priority** | Could |

**Badges:** UI · Backend · Priority: Could · §13-conditional

### Description

**As a cook**, I want a **plate photo — one image per log — not re-analysed unless asked**. (Recipe_Systems.md §12)

### Acceptance Criteria

- AC-1: One image per log.
- AC-2: Not re-analysed unless asked.

### Test Cases

**TC-01 — One image per log**
- Given: a cook log
- When: a plate photo is attached
- Then: one image is stored per log

**TC-02 — No re-analysis**
- Given: a plate photo attached
- When: nothing else is done
- Then: no re-analysis is triggered unless explicitly asked

### API Endpoints

Not yet defined at the design stage. Specified by dispatch unit **D-31** (conditional — §13 stability evidence required before dispatch).

### Data

| Entity | Role | Source |
|---|---|---|
| `cook_log_photo` | one image per log | ERD §8 |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-31 | A-31 | H-31 | ERD §17 ✅ | — |

---

## F6 — Surface last-cook notes on reopen

| Field | Value |
|---|---|
| **Story ID** | F6 |
| **Epic ref** | Epic F — After-cook capture (Recipe_Systems §12) |
| **Phase** | P6 (wk 10) |
| **Domain** | Cook log |
| **Priority** | Must |

**Badges:** UI · Backend · Priority: Must

### Description

**As a cook**, I want the **last cooked date, rating, and next-time line surfaced on reopen** — and the shopping list still reflecting the saved card **unless a swap was applied**. (Recipe_Systems.md §12)

### Acceptance Criteria

- AC-1: Last cooked date, rating, next-time line.
- AC-2: Shopping list still reflects the saved card unless a swap was applied.

### Test Cases

**TC-01 — Recall at the top**
- Given: a recipe with cook history, reopened
- When: the header renders
- Then: last cooked date, rating, and the next-time line are surfaced at the top

**TC-02 — List reflects the card**
- Given: a recipe with cook history
- When: the shopping list is regenerated
- Then: the list reflects the saved card, unless a swap was applied

### API Endpoints

Not yet defined at the design stage. Specified by dispatch unit **D-24** (the next-time field itself is F4/D-26 — this unit surfaces it when present).

### Data

| Entity | Role | Source |
|---|---|---|
| `cook_log` | last-cook recall | ERD §8 |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-24 | A-24 | H-24 | ERD §17 ✅ | — |

---

*End of Epic F — After-cook capture. Stories F1–F6.*
