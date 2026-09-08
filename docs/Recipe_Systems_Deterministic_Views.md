# Recipe Systems — Deterministic Views (V2 — View 8 & View 9)

> **Status:** v2 · **Date:** 02 Sep 2026
> **Scope:** **V8 (dietary/allergens)** and **V9 (nutrition band)**.
> **These are DETERMINISTIC — no LLM.** They are computed in `analysis/` from the confirmed `recipe_lines` object plus **versioned curated tables**:
> - View 8 ← `allergen_map` (versioned allergen definitions)
> - View 9 ← `food_composition_table` (versioned USDA/peer rows) + user-set assumptions
>
> **Why deterministic:** the product invariants require V8 to never write "safe" and V9 to render a **band, not a point**, read from a **versioned** table — not from model arithmetic or training knowledge. This is the only way those are reproducible and reviewable.
> **Contracts below match `Recipe_Systems_API.md` §9–§10.**

---

## 1. Inputs (shared)

```json
{
  "ingredients": [
    {
      "id": "string",
      "canonical_name": "string|null",   // alias-resolved canonical ingredient
      "food_id": "bigint|null",          // FK → food_composition_table
      "quantity": "number|null",
      "amount_text": "string|null",
      "category": "string|null"
    }
  ],
  "explicitly_absent": ["string"],       // noted at parse review (e.g. "garlic")
  "region_pack": "US" | "EU"            // from user profile / label_pack
}
```

The **curated version** to read is pinned: each evaluation records the `version` of `allergen_map` / `food_composition_table` it used.

---

## 2. View 8 — Dietary restrictions & allergens (deterministic)

### Algorithm
For every ingredient with a `canonical_name`:
1. Look up the ingredient's allergens in the versioned `allergen_map`.
2. Classify each allergen as:
   - **present** — the ingredient (or an alias-mapped canonical name) is in the object and is a known allergen.
   - **not_on_card** — the allergen is relevant to the family but the ingredient is genuinely absent (from `explicitly_absent`, not guessed).
   - **unknown** — cannot be resolved from the mapped tables; never default to "present."
3. Produce `removal_notes` (what removing this changes) — always phrased as an effect, never a safety statement.
4. Emit the printable `allergen_line`.

### Output schema (matches `/analysis/:id/view-8`)

```json
{
  "present": ["Fish", "Mustard"],
  "not_on_card": ["Garlic"],
  "unknown": ["Coconut (pack-dependent)"],
  "removal_notes": [
    { "item": "Mustard", "note": "Removing it changes the tadka; the dish is still a kuzhambu." }
  ],
  "disclaimer": "Reads the card only. Does not test food. Does not know your kitchen. Not medical advice.",
  "allergen_line": { "contains": ["Fish", "Mustard"], "notes": [], "unknown": [] }
}
```

### Hard rules (asserted in CI — do not relax)
- **Never output "safe", "safe to eat", "guaranteed", "certified", "cured of", "no risk".** Use only: present / not_on_card / unknown / "removing this is a different recipe."
- `unknown` is an allowed, honest answer — **unknown is not a pass.**
- Coconut is **not** auto-filed as a US major tree nut; label-pack-dependent.
- Every output carries the **disclaimer**.
- The `allergen_map` **version** used is recorded.

---

## 3. View 9 — Calories & micronutrients (deterministic band)

### Algorithm
1. For each ingredient with a `food_id` → read its per-100g values from the **versioned** `food_composition_table`.
2. Scale by the ingredient's `quantity` (or, if unquantified, by a stated `ASSUMED` default).
3. Sum into a **whole-dish band** (min/max), driven by the spread of assumptions, **not** a single point.
4. Ingredients **without** a `food_id` are **excluded from totals and listed** (I7).
5. If portions are set, divide into a per-portion band.

### Inputs beyond the object (user-editable assumptions, I2/I4)
```json
{
  "fish_class": "lean" | "oily",
  "coconut_grams": "number",
  "oil_tbsp": "number",
  "portions": "number | null"
}
```

### Output schema (matches `/analysis/:id/view-9`)

```json
{
  "band": {
    "energy_kcal_min": 420,
    "energy_kcal_max": 540,
    "protein_g": { "min": 20, "max": 28 },
    "fat_g": { "min": 24, "max": 32 },
    "carb_g": { "min": 30, "max": 40 },
    "fibre_g": { "min": 4, "max": 6 }
  },
  "sodium": "unknown",
  "assumptions": [
    { "key": "fish_class", "value": "oily", "tag": "ASSUMED" },
    { "key": "coconut_grams", "value": "50", "tag": "ASSUMED" }
  ],
  "per_portion": { "portions": 4, "energy_kcal_min": 105, "energy_kcal_max": 135 } ,
  "tightening_factors": ["Name the fish species", "Weigh the coconut"],
  "disclaimer": "Table estimate from stated assumptions. Not a lab analysis. Not medical advice."
}
```

### Hard rules (asserted in CI)
- **Band, never a point.** A single `energy_kcal` value is a fail. Use `energy_kcal_min` / `energy_kcal_max`.
- **Sodium is `"unknown"`** when inputs are ranges — never a fabricated number.
- `assumptions` must be explicit (each tagged `ASSUMED`); user edits recompute the band (I2).
- Ingredients with no `food_id` (unmapped) are **excluded from totals and listed** (I7).
- The `food_composition_table` **version** used is recorded.
- `per_portion` only appears when `portions` is set.

---

## 4. Why this split is correct

| View | Producer | Can it be an LLM? | Reason |
|---|---|---|---|
| V1–V7/5 | pinned LLM (Gemini 2.5 Flash) | Yes | Reasoning/interpretation views |
| **V8** | **deterministic** (`allergen_map`) | **No** | Safety-adjacent; must be reproducible, no "safe" |
| **V9** | **deterministic** (`food_composition_table`) | **No** | Must match versioned USDA data; band not point |

Keeping V8/V9 out of the LLM is what makes the **"no certificates" and "bands not points"** invariants enforceable in CI — an LLM cannot guarantee either.
