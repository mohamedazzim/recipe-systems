// D-19 (P4-1): deterministic View 8/9 producer tests — frozen payload shapes,
// golden-card behavior, I7 fidelity, and the I2 assumption merge. Reference
// data is the D-29 fixture content (real values, mocked rows — unit tests never
// connect to a database).

import {
  computeView8,
  computeView9,
  DEFAULT_OVERRIDES,
  H6_DISCLAIMER,
  I6_DISCLAIMER,
  ingredientMassGrams,
  mergeOverrides,
  overridesFromPayload,
} from './deterministic-views';
import { View9PayloadSchema } from '@recipe-systems/schemas';
import type { StructuredRecipeInput } from '@recipe-systems/schemas';

const DICTIONARY = [
  { id: 'd-fish', canonicalName: 'fish' },
  { id: 'd-drumstick', canonicalName: 'drumstick' },
  { id: 'd-mango', canonicalName: 'mango' },
  { id: 'd-coconut-flesh', canonicalName: 'coconut_flesh' },
  { id: 'd-coconut-oil', canonicalName: 'coconut_oil' },
  { id: 'd-chilli-green', canonicalName: 'chilli_green' },
  { id: 'd-chilli-powder', canonicalName: 'chilli_powder' },
  { id: 'd-coriander-powder', canonicalName: 'coriander_powder' },
  { id: 'd-tamarind', canonicalName: 'tamarind' },
  { id: 'd-fenugreek-powder', canonicalName: 'fenugreek_powder' },
  { id: 'd-fenugreek-seed', canonicalName: 'fenugreek_seed' },
  { id: 'd-mustard-seed', canonicalName: 'mustard_seed' },
];

const ALIASES = [
  { ingredientId: 'd-fenugreek-powder', aliasText: 'methi powder' },
  { ingredientId: 'd-fenugreek-seed', aliasText: 'methi' },
  { ingredientId: 'd-coconut-flesh', aliasText: 'thengai' },
];

const MAPPINGS = [
  { ingredientId: 'd-fish', allergen: { id: 'a-fish', code: 'fish', name: 'Fish' } },
  {
    ingredientId: 'd-coconut-flesh',
    allergen: { id: 'a-coconut', code: 'coconut', name: 'Coconut (declared by name)' },
  },
  {
    ingredientId: 'd-coconut-oil',
    allergen: { id: 'a-coconut', code: 'coconut', name: 'Coconut (declared by name)' },
  },
  {
    ingredientId: 'd-fenugreek-powder',
    allergen: { id: 'a-fenugreek', code: 'fenugreek', name: 'Fenugreek (legume)' },
  },
  {
    ingredientId: 'd-fenugreek-seed',
    allergen: { id: 'a-fenugreek', code: 'fenugreek', name: 'Fenugreek (legume)' },
  },
  {
    ingredientId: 'd-mustard-seed',
    allergen: { id: 'a-mustard', code: 'mustard', name: 'Mustard (EU/UK 14)' },
  },
];

interface CompositionFixture {
  ingredientId: string;
  isPrimary: boolean;
  kcal: number;
  protein: number;
  fat: number;
  carb: number;
  fibre: number;
}

const COMPOSITION: CompositionFixture[] = [
  { ingredientId: 'd-fish', isPrimary: true, kcal: 82, protein: 17.8, fat: 0.67, carb: 0, fibre: 0 },
  { ingredientId: 'd-fish', isPrimary: false, kcal: 205, protein: 18.6, fat: 13.9, carb: 0, fibre: 0 },
  { ingredientId: 'd-drumstick', isPrimary: true, kcal: 37, protein: 2.1, fat: 0.2, carb: 8.53, fibre: 3.2 },
  { ingredientId: 'd-mango', isPrimary: true, kcal: 60, protein: 0.82, fat: 0.38, carb: 15, fibre: 1.6 },
  { ingredientId: 'd-coconut-flesh', isPrimary: true, kcal: 354, protein: 3.33, fat: 33.5, carb: 15.2, fibre: 9 },
  { ingredientId: 'd-coconut-oil', isPrimary: true, kcal: 892, protein: 0, fat: 99.1, carb: 0, fibre: 0 },
  { ingredientId: 'd-chilli-green', isPrimary: true, kcal: 40, protein: 2, fat: 0.2, carb: 9.46, fibre: 1.5 },
  { ingredientId: 'd-chilli-powder', isPrimary: true, kcal: 282, protein: 13.5, fat: 14.3, carb: 49.7, fibre: 34.8 },
  { ingredientId: 'd-coriander-powder', isPrimary: true, kcal: 298, protein: 12.4, fat: 17.8, carb: 55, fibre: 41.9 },
  { ingredientId: 'd-tamarind', isPrimary: true, kcal: 239, protein: 2.8, fat: 0.6, carb: 62.5, fibre: 5.1 },
  { ingredientId: 'd-fenugreek-seed', isPrimary: true, kcal: 323, protein: 23, fat: 6.41, carb: 58.4, fibre: 24.6 },
  { ingredientId: 'd-mustard-seed', isPrimary: true, kcal: 508, protein: 26.1, fat: 36.2, carb: 28.1, fibre: 12.2 },
];

function entryRows(): Array<{
  id: string;
  ingredientId: string;
  isPrimaryForIngredient: boolean;
  versions: Array<{
    energyKcalPer100g: { toNumber(): number };
    proteinGPer100g: { toNumber(): number };
    fatGPer100g: { toNumber(): number };
    carbGPer100g: { toNumber(): number };
    fibreGPer100g: { toNumber(): number };
  }>;
}> {
  return COMPOSITION.map((row, index) => ({
    id: `e-${index}`,
    ingredientId: row.ingredientId,
    isPrimaryForIngredient: row.isPrimary,
    versions: [
      {
        energyKcalPer100g: { toNumber: () => row.kcal },
        proteinGPer100g: { toNumber: () => row.protein },
        fatGPer100g: { toNumber: () => row.fat },
        carbGPer100g: { toNumber: () => row.carb },
        fibreGPer100g: { toNumber: () => row.fibre },
      },
    ],
  }));
}

function referencePrisma() {
  return {
    ingredientDictionary: { findMany: jest.fn().mockResolvedValue(DICTIONARY) },
    ingredientAlias: { findMany: jest.fn().mockResolvedValue(ALIASES) },
    // honor the Prisma `where.ingredientId.in` filter like the real client
    dietaryAllergenMapping: {
      findMany: jest.fn(async (args?: { where?: { ingredientId?: { in?: string[] } } }) => {
        const ids = args?.where?.ingredientId?.in ?? [];
        return MAPPINGS.filter((m) => ids.includes(m.ingredientId));
      }),
    },
    nutritionFoodCompositionEntry: {
      findMany: jest.fn(
        async (args?: { where?: { ingredientId?: { in?: string[] } } }) => {
          const ids = args?.where?.ingredientId?.in ?? [];
          return entryRows().filter((row) => ids.includes(row.ingredientId));
        },
      ),
    },
  };
}

function goldenCapture(): StructuredRecipeInput {
  const line = (
    id: string,
    display: string,
    amount: string,
  ): StructuredRecipeInput['structured_recipe']['ingredients'][number] => ({
    id,
    display_name: display,
    canonical_name: null,
    amount_text: amount,
    quantity: null,
    unit: null,
    confirmed_sense: null,
    category: null,
    food_id: null,
    include_on_list: true,
  });
  return {
    structured_recipe: {
      ingredients: [
        line('l-fish', 'Fish — 500g', '500g'),
        line('l-drumstick', 'Drumstick — 1 Nos', '1 Nos'),
        line('l-mango', 'Mango — 1/2 Nos', '1/2 Nos'),
        line('l-coconut', 'Grated Coconut — Half Shell', 'Half Shell'),
        line('l-oil', 'Coconut Oil — For Tempering', 'For Tempering'),
        line('l-chilli', 'Chilli — 5 Nos', '5 Nos'),
        line('l-chilli-powder', 'Chilli Powder — 2 Tsp', '2 Tsp'),
        line('l-coriander', 'Coriander Powder — 1 Tsp', '1 Tsp'),
        line('l-tamarind', 'Tamarind — A Lemon Size', 'A Lemon Size'),
        line('l-fenugreek-powder', 'Fenugreek Powder — 1/2 Tsp', '1/2 Tsp'),
        line('l-fenugreek-seed', 'Fenugreek — 1/4 Tsp', '1/4 Tsp'),
      ],
      method_steps: [{ id: 'method-1', text: 'Temper mustard seeds; simmer.', source: 'METHOD' }],
      method_source: { name: null, type: null, matched: false },
      explicitly_absent: ['garlic', 'ginger'],
      card_metadata: { photographed: false, legible_issues: [] },
    },
  };
}

describe('D-19 deterministic View 8 (golden-card behavior)', () => {
  it('flags fish + coconut + fenugreek; coconut is NEVER a US major tree nut', async () => {
    const prisma = referencePrisma();
    const payload = await computeView8(prisma as never, goldenCapture());

    expect(payload.present).toEqual(expect.arrayContaining(['Fish', 'Coconut', 'Fenugreek']));
    expect(payload.present).not.toContain('Tree nuts');
    expect(payload.present).not.toContain('Mustard'); // not on this card
    expect(payload.not_on_card).toEqual(['garlic', 'ginger']);
    expect(payload.allergen_line.contains).toEqual(payload.present);
    expect(payload.allergen_line.notes).toEqual(['Fish species unknown.']);
    expect(payload.removal_notes.map((n) => n.item)).toEqual(
      expect.arrayContaining(['Fish', 'Coconut', 'Fenugreek']),
    );
    expect(payload.disclaimer).toBe(H6_DISCLAIMER);
    // INV-13: the word "safe" appears nowhere in the View 8 output
    expect(JSON.stringify(payload).toLowerCase()).not.toContain('safe');
  });

  it('INV-13 runtime check has teeth: a planted "safe" in the View 8 payload is exactly the class the assertion rejects', async () => {
    const prisma = referencePrisma();
    const payload = await computeView8(prisma as never, goldenCapture());
    // A-21 plant: an output surface that smuggles the forbidden word in.
    const planted = {
      ...payload,
      removal_notes: [...payload.removal_notes, { item: 'Fish', note: 'safe to eat for most people' }],
    };
    // The sibling assertion (JSON lowercased, not.toContain('safe')) fires on this exact class.
    expect(JSON.stringify(planted).toLowerCase()).toContain('safe');
  });

  it('flags mustard when the card carries a mapped mustard line', async () => {
    const prisma = referencePrisma();
    const capture = goldenCapture();
    capture.structured_recipe.ingredients.push({
      id: 'l-mustard',
      display_name: 'Mustard Seeds — 1/2 Tsp',
      canonical_name: null,
      amount_text: '1/2 Tsp',
      quantity: null,
      unit: null,
      confirmed_sense: null,
      category: null,
      food_id: null,
      include_on_list: true,
    });
    const payload = await computeView8(prisma as never, capture);
    expect(payload.present).toContain('Mustard');
  });
});

describe('D-19 deterministic View 9 (golden band)', () => {
  it('produces a pot-scale band around 1,300–2,200 kcal; sodium stays Unknown', async () => {
    const prisma = referencePrisma();
    const payload = await computeView9(prisma as never, goldenCapture());

    expect(payload.band.energy_kcal_min).toBeGreaterThanOrEqual(1300);
    expect(payload.band.energy_kcal_min).toBeLessThanOrEqual(1350);
    expect(payload.band.energy_kcal_max).toBeGreaterThanOrEqual(2150);
    expect(payload.band.energy_kcal_max).toBeLessThanOrEqual(2250);
    expect(payload.band.energy_kcal_min).toBeLessThan(payload.band.energy_kcal_max);
    expect(payload.sodium).toBe('unknown');
    expect(payload.per_portion).toBeNull();
    expect(payload.disclaimer).toBe(I6_DISCLAIMER);
    expect(payload.tightening_factors).toEqual(
      expect.arrayContaining(['Name the fish species', 'Weigh the coconut']),
    );
    // I7: the unmapped fenugreek-powder line is EXCLUDED from totals and LISTED.
    const unmapped = payload.assumptions.filter((a) => a.key === 'unmapped_ingredient');
    expect(unmapped.map((a) => a.value)).toEqual(['Fenugreek Powder — 1/2 Tsp']);
  });

  it('pinning fish_class to lean collapses the fish end of the band', async () => {
    const prisma = referencePrisma();
    const both = await computeView9(prisma as never, goldenCapture(), DEFAULT_OVERRIDES);
    const lean = await computeView9(prisma as never, goldenCapture(), {
      ...DEFAULT_OVERRIDES,
      fish_class: 'lean',
    });
    const oily = await computeView9(prisma as never, goldenCapture(), {
      ...DEFAULT_OVERRIDES,
      fish_class: 'oily',
    });

    expect(lean.band.energy_kcal_min).toBeGreaterThanOrEqual(both.band.energy_kcal_min);
    expect(lean.band.energy_kcal_max).toBeLessThan(oily.band.energy_kcal_max);
    expect(lean.band.energy_kcal_min).toBeLessThan(both.band.energy_kcal_max);
    // the band stays a band (coconut + oil ranges still apply) — never a point
    expect(lean.band.energy_kcal_min).toBeLessThan(lean.band.energy_kcal_max);
    expect(
      lean.assumptions.find((a) => a.key === 'fish_class')?.value,
    ).toBe('lean');
  });

  it('D-26 I4: weighing the coconut and measuring the oil narrow the band', async () => {
    const prisma = referencePrisma();
    const broad = await computeView9(prisma as never, goldenCapture(), DEFAULT_OVERRIDES);
    const tightened = await computeView9(prisma as never, goldenCapture(), {
      fish_class: 'both',
      coconut_grams: [175, 175], // weighed, not estimated
      oil_tbsp: [1.5, 1.5], // measured, not "for tempering"
    });
    const broadWidth = broad.band.energy_kcal_max - broad.band.energy_kcal_min;
    const tightWidth = tightened.band.energy_kcal_max - tightened.band.energy_kcal_min;
    expect(tightWidth).toBeLessThan(broadWidth);
    // still a band, never a point (other lines still carry ranges)
    expect(tightened.band.energy_kcal_min).toBeLessThan(tightened.band.energy_kcal_max);
    expect(tightened.sodium).toBe('unknown');
  });

  it('D-26 I3 / Q14: per_portion appears ONLY when portions are set and stays a band', async () => {
    const prisma = referencePrisma();
    const whole = await computeView9(prisma as never, goldenCapture());
    expect(whole.per_portion).toBeNull(); // I3 TC-01 — no portions, no per-bowl number

    const forFour = await computeView9(prisma as never, goldenCapture(), DEFAULT_OVERRIDES, 4);
    expect(forFour.per_portion).toEqual({
      portions: 4,
      energy_kcal_min: Math.round(forFour.band.energy_kcal_min / 4),
      energy_kcal_max: Math.round(forFour.band.energy_kcal_max / 4),
    });
    // per-bowl is a BAND, never a fabricated point; sodium stays Unknown
    expect(forFour.per_portion!.energy_kcal_min).toBeLessThan(forFour.per_portion!.energy_kcal_max);
    expect(forFour.sodium).toBe('unknown');
    // the whole-pot band is untouched by the per-bowl projection
    expect(forFour.band).toEqual(whole.band);
  });

  it('INV-14 runtime check has teeth: a planted point-kcal payload is rejected by the frozen schema', async () => {
    const prisma = referencePrisma();
    const payload = await computeView9(prisma as never, goldenCapture());
    const planted = {
      ...payload,
      band: { ...payload.band, energy_kcal_min: 1800, energy_kcal_max: 1800 },
    };
    // The band-strictness assertion (min < max) and the frozen D-05 schema both reject this class.
    expect(planted.band.energy_kcal_min).toBe(planted.band.energy_kcal_max);
    expect(View9PayloadSchema.safeParse(planted).success).toBe(true); // shape-wise valid…
    expect(
      View9PayloadSchema.safeParse({
        ...planted,
        band: { ...planted.band, energy_kcal: 1800 },
      } as never).success,
    ).toBe(false); // …but the schema has NO single energy_kcal field — a point-kcal shape is rejected
  });
});

describe('D-19 View 9 mass parsing + assumption merge (I2)', () => {
  it('parses card amounts into grams', () => {
    expect(ingredientMassGrams('fish', '500g', null, null)).toEqual([500, 500]);
    expect(ingredientMassGrams('drumstick', '1 Nos', null, null)).toEqual([150, 150]);
    expect(ingredientMassGrams('mango', '1/2 Nos', null, null)).toEqual([120, 120]);
    expect(ingredientMassGrams('coconut_flesh', 'Half Shell', null, null)).toEqual([150, 200]);
    expect(ingredientMassGrams('fenugreek_powder', '1/2 Tsp', null, null)).toBeNull();
  });

  it('merges a delta over persisted assumptions and round-trips through a payload', () => {
    const merged = mergeOverrides(DEFAULT_OVERRIDES, { fish_class: 'oily', coconut_grams: 200 });
    expect(merged).toEqual({
      fish_class: 'oily',
      coconut_grams: [200, 200],
      oil_tbsp: [1, 2],
    });
    const payload = {
      assumptions: [
        { key: 'fish_class', value: 'oily', tag: 'ASSUMED' },
        { key: 'coconut_grams', value: 200, tag: 'ASSUMED' },
        { key: 'oil_tbsp', value: '1–2', tag: 'ASSUMED' },
      ],
    };
    const restored = overridesFromPayload(payload);
    expect(restored.fish_class).toBe('oily');
    expect(restored.coconut_grams).toEqual([200, 200]);
    expect(restored.oil_tbsp).toEqual([1, 2]);
  });
});
