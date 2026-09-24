// View 8 regression guard: a line that matches no dictionary entry must be reported
// as UNKNOWN, never dropped. It previously landed in no bucket at all — neither
// `present`, `not_on_card` nor `unknown` — so a present allergen could disappear
// from the allergen view, which reads as a pass on a safety surface.
import { computeView8 } from './deterministic-views';

const ingredient = (id: string, display_name: string, amount_text: string) => ({
  id,
  display_name,
  canonical_name: null,
  amount_text,
  quantity: null,
  unit: null,
  confirmed_sense: null,
  category: null,
  food_id: null,
  include_on_list: true,
});

const CAPTURED = {
  structured_recipe: {
    ingredients: [
      ingredient('fish', 'Fish', '500g'),
      // Resolves to nothing in the dictionary below.
      ingredient('anchovy', 'Anchovy', '1 tbsp'),
    ],
    method_steps: [],
    method_source: null,
    explicitly_absent: [],
    card_metadata: { photographed: false, legible_issues: [] },
  },
} as never;

/** Only the three tables computeView8 actually reads. */
function prismaStub() {
  return {
    ingredientDictionary: { findMany: async () => [{ id: 'd-fish', canonicalName: 'fish' }] },
    ingredientAlias: { findMany: async () => [] },
    dietaryAllergenMapping: {
      findMany: async () => [{ ingredientId: 'd-fish', allergen: { code: 'fish' } }],
    },
  } as never;
}

describe('computeView8 — an unmatched line is UNKNOWN, never dropped', () => {
  it('lists a line with no dictionary match under unknown', async () => {
    const view8 = await computeView8(prismaStub(), CAPTURED);

    expect(view8.present).toContain('Fish');
    expect(view8.unknown).toContain('Anchovy');
  });

  it('carries the unknown line onto the frozen allergen line', async () => {
    const view8 = await computeView8(prismaStub(), CAPTURED);

    expect(view8.allergen_line.unknown).toContain('Anchovy');
  });

  it('does not quietly reclassify the unknown line as absent', async () => {
    const view8 = await computeView8(prismaStub(), CAPTURED);

    expect(view8.not_on_card).not.toContain('Anchovy');
  });
});
