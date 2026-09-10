// D-20 (P4-2): station-card producer tests — derivability (INV-10), the
// generation precondition (C5 AC-1), and the refusal paths.

import { StructuredRecipeInput } from '@recipe-systems/schemas';
import { buildStationCard } from './station-card';

const CAPTURED: StructuredRecipeInput = {
  structured_recipe: {
    ingredients: [
      {
        id: 'fish_500g',
        display_name: 'Fish — 500g',
        canonical_name: null,
        amount_text: '500g',
        quantity: 500,
        unit: 'g',
        confirmed_sense: null,
        category: 'fish_meat',
        food_id: null,
        include_on_list: true,
      },
      {
        id: 'tamarind',
        display_name: 'Tamarind — A Lemon Size',
        canonical_name: null,
        amount_text: 'A Lemon Size',
        quantity: null,
        unit: null,
        confirmed_sense: null,
        category: null,
        food_id: null,
        include_on_list: true,
      },
    ],
    method_steps: [
      { id: 'method-1', text: 'Boil, temper, simmer.', source: 'METHOD' },
    ],
    method_source: { name: null, type: null, matched: false },
    explicitly_absent: ['garlic'],
    card_metadata: { photographed: true, legible_issues: [] },
  },
};

const VIEW_3 = {
  status: 'COMPLETE' as const,
  stages: [
    {
      stage_name: 'Load and heat',
      action: 'Add fish, drumstick, chilli; cover; boil then reduce to medium',
      cue: 'Fish opaque and just flaking',
      duration: 'About 5-6 minutes after boil',
      tag: 'METHOD' as const,
    },
    {
      stage_name: 'Finish aroma',
      action: 'Mustard, fenugreek seed, curry leaf and coconut oil tempered last',
      cue: 'Mustard pops; curry leaf crackles',
      duration: 'UNKNOWN',
      tag: 'METHOD' as const,
    },
  ],
  incomplete_reason: null,
};

describe('D-20 buildStationCard (deterministic, derivable only)', () => {
  it('builds the card when a method exists AND View 3 is COMPLETE (C5 AC-1)', () => {
    const card = buildStationCard(CAPTURED, VIEW_3);
    expect(card).not.toBeNull();
    expect(card!.printable).toBe(true);
    expect(card!.product_yield_hold).toBeNull(); // §7 required blanks stay blank
  });

  it('mise is the capture ingredients verbatim, keyed by ingredient id (INV-10)', () => {
    const card = buildStationCard(CAPTURED, VIEW_3)!;
    expect(Object.keys(card.mise).sort()).toEqual(['fish_500g', 'tamarind']);
    expect(card.mise['fish_500g']).toEqual({
      display_name: 'Fish — 500g',
      amount: '500g',
      tag: 'CARD',
    });
    expect(card.mise['tamarind'].amount).toBe('A Lemon Size');
  });

  it('sequence is View 3 stages verbatim — nothing reworded or invented', () => {
    const card = buildStationCard(CAPTURED, VIEW_3)!;
    expect(card.sequence).toEqual(VIEW_3.stages);
  });

  it('control points derive one-per-stage from the View 3 cues verbatim', () => {
    const card = buildStationCard(CAPTURED, VIEW_3)!;
    expect(card.control_points).toEqual([
      { stage_name: 'Load and heat', cue: 'Fish opaque and just flaking', tag: 'METHOD' },
      { stage_name: 'Finish aroma', cue: 'Mustard pops; curry leaf crackles', tag: 'METHOD' },
    ]);
  });

  it('do_nots derive from the captured explicitly_absent list (ABSENT — do not add)', () => {
    const card = buildStationCard(CAPTURED, VIEW_3)!;
    expect(card.do_nots).toEqual([
      { item: 'garlic', tag: 'ABSENT', note: 'Confirmed absent at review — do not add.' },
    ]);
  });

  it('refuses without a method (C5 precondition: method or accepted inference)', () => {
    const noMethod: StructuredRecipeInput = {
      ...CAPTURED,
      structured_recipe: { ...CAPTURED.structured_recipe, method_steps: [] },
    };
    expect(buildStationCard(noMethod, VIEW_3)).toBeNull();
  });

  it('refuses when View 3 is missing (no known process — INV-08)', () => {
    expect(buildStationCard(CAPTURED, null)).toBeNull();
  });

  it('refuses when View 3 is INCOMPLETE (list-only representation)', () => {
    const incomplete = { status: 'INCOMPLETE' as const, stages: [], incomplete_reason: 'no method' };
    expect(buildStationCard(CAPTURED, incomplete)).toBeNull();
  });
});
