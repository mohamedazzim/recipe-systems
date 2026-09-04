# Epic G — Quality / Review (G1–G3)

> **Epic:** G — Quality (review gates) · **Stories:** G1 (Must), G2 (Must), G3 (Must) · **Domain:** Quality / Review
> **Boundaries:** G1 (golden fixture in CI) is the gate that never leaves CI (Recipe_Systems §3.8) and runs on every phase. G2/G3 here are product story IDs — the adversarial review passes (Recipe_Systems §10), distinct from the QG1–QG5 quality gates (TEST_PLAN §2). The two regional reviewers are people on contract (Recipe_Systems §13).
> **Full detail:** description + acceptance criteria + test cases + API + data + traceability. Source: Recipe_Systems.md §12.
> **Canonical note:** canonical split representation of Epic G from `USER_STORIES.md` v1.1 — story IDs, acceptance criteria, and test cases preserved exactly; only the presentation follows the mentor's epic-file format.

---

## G1 — Golden fixture in CI

| Field | Value |
|---|---|
| **Story ID** | G1 |
| **Epic ref** | Epic G — Quality (Recipe_Systems §12) |
| **Phase** | P0 (wks 1–2) — runs on every phase thereafter |
| **Domain** | Quality / CI |
| **Priority** | Must |

**Badges:** CI · Quality · Priority: Must

### Description

**As the team**, we want the **golden Kanyakumari fixture as a CI gate that never leaves** (§3.8), asserting all eight invariants. (Recipe_Systems.md §12 G1, ERD §16)

### Acceptance Criteria

- AC-1: Both fenugreeks present.
- AC-2: No ginger/garlic.
- AC-3: Family not generic curry.
- AC-4: View 2 has coriander blind-spot note.
- AC-5: Chef mode has station card when inferred method accepted.
- AC-6: View 8 flags fish + mustard, coconut not filed as US major tree nut, no "safe" language.
- AC-7: View 9 is a band, sodium Unknown, no point-kcal.

### Test Cases

**TC-01 — Both fenugreeks**
- Given: the golden fixture in CI (blocking)
- When: the assertions run
- Then: both fenugreek lines are present

**TC-02 — No ginger/garlic**
- Given: the golden fixture
- When: the assertions run
- Then: no ginger, no garlic anywhere

**TC-03 — Not generic curry**
- Given: the golden fixture
- When: the assertions run
- Then: the family is not "generic curry"

**TC-04 — Coriander blind-spot note**
- Given: the golden fixture
- When: the assertions run
- Then: View 2 carries the coriander blind-spot note

**TC-05 — Station card on inferred method**
- Given: the golden fixture with the inferred method accepted
- When: the assertions run
- Then: the station card appears in chef mode

**TC-06 — View 8 flags**
- Given: the golden fixture View 8
- When: the assertions run
- Then: fish + mustard are flagged; coconut is not filed as a US major tree nut; no "safe" language

**TC-07 — View 9 band**
- Given: the golden fixture View 9
- When: the assertions run
- Then: the output is a band, not a point; sodium Unknown; no point-kcal

### API Endpoints

Not applicable — this is a CI artifact story. The fixture files are `tests/fixtures/golden_kanyakumari_card.json` + `tests/assertions/golden_recipe_assertions.yaml` (ERD §16); scaffolded by dispatch unit **D-03**.

### Data

| Entity | Role | Source |
|---|---|---|
| — (fixture files, not modeled) | CI gate | ERD §16 |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-03 (+ every later phase's golden evidence) | A-03 (+ every later audit's golden check) | H-03 | ERD §16 | — |

---

## G2 — Regional veto on View 5

| Field | Value |
|---|---|
| **Story ID** | G2 |
| **Epic ref** | Epic G — Quality (Recipe_Systems §12) |
| **Phase** | P7 (wks 11–12) |
| **Domain** | Quality / Review |
| **Priority** | Must |

**Badges:** UI · Backend · Review · Priority: Must · Q6 (OPEN DECISION — publishable state home)

### Description

**As a reviewer**, I want to **block a live regional sentence on View 5**. Pilot: one Tamil Nadu / Kanyakumari reviewer and one Kerala reviewer on the fish-curry cluster. (Recipe_Systems.md §12)

### Acceptance Criteria

- AC-1: Reviewer can block a live regional sentence.
- AC-2: Pilot: one Tamil Nadu / Kanyakumari reviewer and one Kerala reviewer on the fish-curry cluster.

### Test Cases

**TC-01 — Veto blocks the sentence**
- Given: a live View 5 regional sentence
- When: a reviewer vetoes it
- Then: the sentence is blocked from live views

**TC-02 — Reviewer configuration**
- Given: the pilot workflow (week 11)
- When: the veto workflow is configured
- Then: both regional reviewers are configured on the fish-curry cluster (BUILD_PLAN P7-3)

### API Endpoints

Not yet defined at the design stage. Specified by dispatch unit **D-27** (the "publishable" state home is Q6 — build to the labeled working assumption, do not decide).

### Data

| Entity | Role | Source |
|---|---|---|
| review workflow | veto state (Q6 working assumption) | ADR §8 |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-27 | A-27 | H-27 | ERD §17 ✅ | Q6 (publishable state home) |

---

## G3 — Chef pass on three related curries

| Field | Value |
|---|---|
| **Story ID** | G3 |
| **Epic ref** | Epic G — Quality (Recipe_Systems §12) |
| **Phase** | P7 (wk 12) |
| **Domain** | Quality / Review |
| **Priority** | Must |

**Badges:** Review · Quality · Priority: Must

### Description

**As the chef reviewer**, I want a **chef pass on three related curries** — Kumari / inland Tamil / Kerala kudampuli. Pass = identification differs, zero invented ingredients, station cards runnable, no "safe," no point-kcal presented as fact. (Recipe_Systems.md §12)

### Acceptance Criteria

- AC-1: Kumari / inland Tamil / Kerala kudampuli.
- AC-2: Pass = identification differs.
- AC-3: Zero invented ingredients.
- AC-4: Station cards runnable.
- AC-5: No "safe," no point-kcal presented as fact.

### Test Cases

**TC-01 — Three separable identifications**
- Given: the chef pass on the three curries
- When: identification runs on each
- Then: the identifications differ (three separable dishes)

**TC-02 — Zero invented ingredients**
- Given: the chef pass
- When: the curries are analysed
- Then: zero invented ingredients

**TC-03 — Runnable cards**
- Given: the chef pass
- When: the station cards are reviewed
- Then: the cards are runnable

**TC-04 — No forbidden claims**
- Given: the chef pass
- When: Views 8 and 9 are reviewed
- Then: no "safe" in View 8; no point-kcal presented as fact in View 9

### API Endpoints

Not applicable — this is the week-12 pilot gate (Recipe_Systems §14 go/no-go). Specified by dispatch unit **D-28** (closing sweep).

### Data

| Entity | Role | Source |
|---|---|---|
| — (pilot protocol, messy_20 set) | review evidence | Recipe_Systems §14; TEST_PLAN QG5 |

### Traceability

| Dispatch | Audit | Handoff | ERD support | OPEN DECISIONS |
|---|---|---|---|---|
| D-28 | A-28 | H-28 | ERD §17 ✅ | — |

---

*End of Epic G — Quality / Review. Stories G1–G3.*
