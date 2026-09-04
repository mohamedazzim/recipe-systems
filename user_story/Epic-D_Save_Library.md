# Epic D — Save and library (D1–D6)

> **Epic:** D — Save and library · **Stories:** D1 (Must), D2 (Must), D3 (Should), D4 (Should), D5 (Should), D6 (Must) · **Domain:** Library / Persistence
> **Boundaries:** the saved recipe stores the full artifact set (D1); deletion is a confirmed hard DELETE cascade with no residue (D6, ERD §13). Re-analysis snapshots the previous analysis and links it to existing logs (D5). Ownership checks apply on every read/write (INV-17).
> **Full detail:** description + acceptance criteria + test cases + API + data + traceability. Source: Recipe_Systems.md §12.
> **Canonical note:** canonical split representation of Epic D from `USER_STORIES.md` v1.1 — story IDs, acceptance criteria, and test cases preserved exactly; only the presentation follows the mentor's epic-file format.

---

## D1 — Save a recipe

| Field | Value |
|---|---|
| **Story ID** | D1 |
| **Epic ref** | Epic D — Save and library (Recipe_Systems §12) |
| **Phase** | P5 (wks 9–10) |
| **Domain** | Library |
| **Priority** | Must |

**Badges:** UI · Backend · Priority: Must

### Description

**As a cook**, I want to **save a recipe** — raw input, photo, object, identification, analysis (or regenerate capability), timestamps — with **the family as the default name, editable**. (Recipe_Systems.md §12)

### Acceptance Criteria

- AC-1: Stores raw input, photo, object, identification, analysis (or regenerate capability), timestamps.
- AC-2: Default name is the family, editable.

### Test Cases

**TC-01 — All six artifacts stored**
- Given: a fully analysed golden recipe
- When: saved
- Then: raw input, photo, object, identification, analysis, and timestamps are all stored

**TC-02 — Default name**
- Given: a save without naming
- When: saved
- Then: the default name is the dish family, editable afterwards

### API Endpoints

Not yet defined at the design stage. Specified by dispatch unit **D-22** (the save-while-signed-out resume path integrates here — A1 TC-02 seam from D-07).

### Data

| Entity | Role | Source |
|---|---|---|
| `recipe` (+ object, photo URI, identification, analysis refs, timestamps) | the saved artifact set | ERD §5, §13 |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-22 | A-22 | H-22 | ERD §17 ✅ | — |

---

## D2 — Browse and open library

| Field | Value |
|---|---|
| **Story ID** | D2 |
| **Epic ref** | Epic D — Save and library (Recipe_Systems §12) |
| **Phase** | P5 (wks 9–10) |
| **Domain** | Library |
| **Priority** | Must |

**Badges:** UI · Backend · Priority: Must

### Description

**As a cook**, I want the **library to show name, date, family, and whether a cook log exists** so that **I can find the recipe I mean**. (Recipe_Systems.md §12)

### Acceptance Criteria

- AC-1: Library shows name, date, family, whether a cook log exists.

### Test Cases

**TC-01 — Library rows**
- Given: several saved recipes
- When: the library is opened
- Then: each row shows name, date, family, and the cook-log indicator

### API Endpoints

Not yet defined at the design stage. Specified by dispatch unit **D-22**.

### Data

| Entity | Role | Source |
|---|---|---|
| `recipe` (+ `cook_log` presence) | library row contents | ERD §13 |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-22 | A-22 | H-22 | ERD §17 ✅ | — |

---

## D3 — Tag and find

| Field | Value |
|---|---|
| **Story ID** | D3 |
| **Epic ref** | Epic D — Save and library (Recipe_Systems §12) |
| **Phase** | P7 (wks 11–12) |
| **Domain** | Library |
| **Priority** | Should |

**Badges:** UI · Backend · Priority: Should

### Description

**As a cook**, I want **free-text tags and search across name, ingredients, and tags**. (Recipe_Systems.md §12)

### Acceptance Criteria

- AC-1: Free-text tags.
- AC-2: Search name, ingredients, tags.

### Test Cases

**TC-01 — Tags persist**
- Given: a saved recipe
- When: free-text tags are applied
- Then: the tags persist on the recipe

**TC-02 — Three search axes**
- Given: tagged recipes
- When: searching by name, by ingredient, and by tag
- Then: the correct recipes are returned for each axis

### API Endpoints

Not yet defined at the design stage. Specified by dispatch unit **D-25**.

### Data

| Entity | Role | Source |
|---|---|---|
| `recipe_tag` | free-text tags | ERD §5 |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-25 | A-25 | H-25 | ERD §17 ✅ | — |

---

## D4 — Edit a saved recipe

| Field | Value |
|---|---|
| **Story ID** | D4 |
| **Epic ref** | Epic D — Save and library (Recipe_Systems §12) |
| **Phase** | P7 (wks 11–12) |
| **Domain** | Library |
| **Priority** | Should |

**Badges:** UI · Backend · Priority: Should

### Description

**As a cook**, I want to **edit a saved recipe** — returning to parse review, with re-analysis asked, not forced — while **cook logs remain**. (Recipe_Systems.md §12)

### Acceptance Criteria

- AC-1: Returns to parse review.
- AC-2: Asks whether to re-analyse.
- AC-3: Cook logs remain.

### Test Cases

**TC-01 — Edit lands in parse review**
- Given: a saved recipe
- When: edited
- Then: the edit lands in parse review

**TC-02 — Re-analysis asked, never forced**
- Given: a completed edit
- When: the edit is saved
- Then: re-analysis is asked, never forced (C6)

**TC-03 — Logs remain**
- Given: a recipe with cook logs, edited
- When: reopened
- Then: cook logs remain attached

### API Endpoints

Not yet defined at the design stage. Specified by dispatch unit **D-25**.

### Data

| Entity | Role | Source |
|---|---|---|
| `recipe` / lines | edited corrected object | ERD §13 |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-25 | A-25 | H-25 | ERD §17 ✅ | — |

---

## D5 — Analysis snapshot

| Field | Value |
|---|---|
| **Story ID** | D5 |
| **Epic ref** | Epic D — Save and library (Recipe_Systems §12) |
| **Phase** | P7 (wks 11–12) |
| **Domain** | Library / Analysis history |
| **Priority** | Should |

**Badges:** UI · Backend · Worker · Priority: Should

### Description

**As a cook**, I want the **previous analysis snapshotted and linked to existing logs on re-analysis** — last + current is enough for the pilot. (Recipe_Systems.md §12)

### Acceptance Criteria

- AC-1: Previous analysis snapshotted and linked to existing logs.
- AC-2: Last + current is enough for the pilot.

### Test Cases

**TC-01 — Snapshot chain on re-analysis**
- Given: a saved recipe, re-analysed
- When: the re-analysis completes
- Then: the previous analysis becomes a linked snapshot

**TC-02 — Logs point at their analysis**
- Given: a re-analysed recipe with logs
- When: opened
- Then: last + current analyses are both reachable; logs point at the analysis they were made against

### API Endpoints

Not yet defined at the design stage. Specified by dispatch unit **D-25**.

### Data

| Entity | Role | Source |
|---|---|---|
| `analysis.is_current` / `snapshot_of_analysis_id` | snapshot chain | ERD §6 |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-25 | A-25 | H-25 | ERD §17 ✅ | — |

---

## D6 — Delete a recipe

| Field | Value |
|---|---|
| **Story ID** | D6 |
| **Epic ref** | Epic D — Save and library (Recipe_Systems §12) |
| **Phase** | P5 (wks 9–10) |
| **Domain** | Library |
| **Priority** | Must |

**Badges:** UI · Backend · Priority: Must

### Description

**As a cook**, I want to **delete a recipe** — confirm, then remove photo, object, analyses, lists, logs — with **no public residue**. (Recipe_Systems.md §12)

### Acceptance Criteria

- AC-1: Confirm.
- AC-2: Removes photo, object, analyses, lists, logs.
- AC-3: No public residue.

### Test Cases

**TC-01 — Confirmation required**
- Given: a delete attempt without confirmation
- When: the action runs
- Then: nothing is removed

**TC-02 — Full cascade**
- Given: a confirmed delete
- When: it runs
- Then: photo, object, analyses, lists, and logs are all removed (cascade)

**TC-03 — No residue**
- Given: a deleted recipe
- When: any prior surface is accessed
- Then: no residue is reachable — object-storage object gone, no dangling URI, prints/snapshots gone

### API Endpoints

Not yet defined at the design stage. Specified by dispatch unit **D-22** (hard DELETE cascade per ERD §13).

### Data

| Entity | Role | Source |
|---|---|---|
| `recipe` (+ cascades) | hard DELETE | ERD §13 |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-22 | A-22 | H-22 | ERD §17 ✅ | — |

---

*End of Epic D — Save and library. Stories D1–D6.*
