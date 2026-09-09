// D-15 (P3-1) schema-conformance suite — the A-15 BLOCKER-class cell:
// "every view prompt's outputs validate against the frozen packages/schemas on
// the §6 worked example — run the validation, do not read it from HANDOFF.md".
//
// The fixtures below are HAND-CHECKED instance documents authored from the
// Recipe_Systems §6 worked example (the Kanyakumari meen kuzhambu golden
// fixture) and from each view's frozen schema. Every valid fixture must parse;
// every malformed fixture must reject — the rejection is the QG4
// "invalid schema" trigger the worker's regenerate path keys off (D-15E).
// The same valid documents also anchor the envelope conformance test.

import {
  parseViewOutput,
  VIEW_PROMPT_SPECS,
  LLM_VIEWS,
  buildViewPrompt,
  PROMPT_VERSION,
} from '../index';

// ─── Hand-checked VALID instance documents (§6 worked example) ──────────────

const VALID_VIEW_1 = {
  items: [
    {
      ingredient_id: 'fish_500g',
      job: 'Protein, fat, reason for the sour',
      if_omitted: 'Not this dish',
      tag: 'CARD',
    },
    {
      ingredient_id: 'coconut_half_shell',
      job: 'Body and fat of the gravy',
      if_omitted: 'Thin tamarind stew',
      tag: 'CARD',
    },
    {
      ingredient_id: 'tamarind_lemon_size',
      job: 'Deep acid',
      if_omitted: 'Oily and flat unless mango is very sour',
      tag: 'CARD',
    },
    {
      ingredient_id: 'fenugreek_powder_half_tsp',
      job: 'Bitter-aroma base',
      if_omitted: 'Loses the family smell',
      tag: 'CARD',
    },
    {
      ingredient_id: 'fenugreek_seeds_tadka',
      job: 'Late tadka pop',
      if_omitted: 'Cooked but not finished',
      tag: 'METHOD',
    },
  ],
  role_groups: [
    { role: 'Sour', ingredient_ids: ['tamarind_lemon_size', 'raw_mango_half'] },
    { role: 'Bitter / fish-curry aroma', ingredient_ids: ['fenugreek_powder_half_tsp', 'fenugreek_seeds_tadka'] },
    { role: 'Body / richness', ingredient_ids: ['coconut_half_shell', 'fish_500g'] },
  ],
};

const VALID_VIEW_2 = {
  pillars: [
    {
      pillar: 'Sour',
      source_ingredient_ids: ['tamarind_lemon_size', 'raw_mango_half'],
      if_missing: 'Heavy, oily, flat',
      tag: 'CARD',
    },
    {
      pillar: 'Bitter',
      source_ingredient_ids: ['fenugreek_powder_half_tsp', 'fenugreek_seeds_tadka'],
      if_missing: 'Generic spicy stew, not this coast',
      tag: 'CARD',
    },
    {
      pillar: 'Body / fat',
      source_ingredient_ids: ['coconut_half_shell'],
      if_missing: 'Thin, sharp, “just sour water”',
      tag: 'CARD',
    },
  ],
  blind_spot_notes: [
    {
      ingredient_id: 'coriander_1tsp',
      note: 'Bridge spice — rounds chilli heat and adds paste body; does not cleanly own a single pillar. View 1 will weight this more heavily; that disagreement is expected, not an error.',
    },
  ],
};

const VALID_VIEW_3 = {
  status: 'COMPLETE',
  stages: [
    {
      stage_name: 'Load and heat',
      action: 'Add fish, drumstick, green chillies, mango, tomato in that order; cover; boil then reduce to medium',
      cue: 'Fish opaque and just flaking; mango holding shape; drumstick scrapeable',
      duration: 'About 5-6 minutes after boil — cue matters more than the clock',
      tag: 'METHOD',
    },
    {
      stage_name: 'Finish aroma',
      action: 'Mustard, fenugreek seed, curry leaf and coconut oil tempered last',
      cue: 'Mustard pops; curry leaf crackles',
      duration: 'UNKNOWN',
      tag: 'METHOD',
    },
  ],
  incomplete_reason: null,
};

const VALID_VIEW_4 = {
  substitutions: [
    {
      ingredient_id: 'coconut_half_shell',
      substitute: 'Coconut milk (reduced quantity)',
      consequence: 'Thinner body, less textural richness; still holds structurally since tamarind is kept',
      tag: 'INFERRED',
    },
  ],
};

const VALID_VIEW_5 = {
  family: 'Coastal Tamil (Kanyakumari) style meen kuzhambu',
  architecture: 'Raw-ground coconut paste, triple sour (tamarind + mango + tomato), late fenugreek+pepper, coconut-oil tadka last',
  confidence: 'high',
  not_this: [
    {
      variant: 'Kerala meen curry',
      key_difference: 'Uses kudampuli instead of tamarind/mango, typically coconut milk-based, no raw-ground paste',
    },
  ],
  needs_review: true,
  tag: 'INFERRED',
};

const VALID_VIEW_6 = {
  ratios: [
    { components: 'chilli powder : coriander', ratio: '2 tsp : 1 tsp', structural: true, tag: 'CARD' },
  ],
  unresolvable: [
    { components: 'salt : liquid', reason: 'salt quantity is null (“to taste”)', tag: 'UNKNOWN' },
  ],
};

const VALID_VIEW_7 = {
  status: 'COMPLETE',
  memorable_elements: [
    {
      element: 'Late fenugreek+pepper finish',
      grounded_in: 'Process stage “finish aroma” — mustard+fenugreek seed+curry leaf+coconut oil added last, per View 3',
      tag: 'INFERRED',
    },
  ],
};

// Deterministic views (Deterministic_Views doc) — included so the envelope
// conformance covers ALL nine views through the same gate.
const VALID_VIEW_8 = {
  present: ['Fish', 'Mustard'],
  not_on_card: ['Coconut (not filed as US major tree nut)'],
  unknown: [],
  removal_notes: [],
  disclaimer: 'This is an ingredient screen, not a safety certificate.',
  allergen_line: { contains: ['Fish', 'Mustard'], notes: [], unknown: [] },
};

const VALID_VIEW_9 = {
  band: {
    energy_kcal_min: 420,
    energy_kcal_max: 560,
    protein_g: { min: 30, max: 42 },
    fat_g: { min: 18, max: 30 },
    carb_g: { min: 12, max: 24 },
    fibre_g: { min: 4, max: 9 },
  },
  sodium: 'unknown',
  assumptions: [
    { key: 'fish_class', value: 'lean', tag: 'ASSUMED' },
    { key: 'coconut_grams', value: 90, tag: 'ASSUMED' },
  ],
  per_portion: { portions: 4, energy_kcal_min: 105, energy_kcal_max: 140 },
  tightening_factors: [],
  disclaimer: 'Bands, not points. Assumptions listed above.',
};

export const VALID_VIEWS: Record<number, unknown> = {
  1: VALID_VIEW_1,
  2: VALID_VIEW_2,
  3: VALID_VIEW_3,
  4: VALID_VIEW_4,
  5: VALID_VIEW_5,
  6: VALID_VIEW_6,
  7: VALID_VIEW_7,
  8: VALID_VIEW_8,
  9: VALID_VIEW_9,
};

// ─── Hand-checked MALFORMED instances (one per view) ────────────────────────

export const MALFORMED_VIEWS: Record<number, unknown> = {
  1: { items: [{ ingredient_id: 'x', job: 'y', if_omitted: 'z' }], role_groups: [] }, // missing tag
  2: { pillars: [], blind_spot_notes: [{ ingredient_id: 'a', note: 'n', extra: true }] }, // strict(): unexpected key
  3: { status: 'MAYBE', stages: [], incomplete_reason: null }, // status not in enum
  4: { substitutions: [{ ingredient_id: 'c', substitute: 's', consequence: 'k', tag: 'CARD' }] }, // tag must be INFERRED
  5: { family: 'f', architecture: 'a', confidence: 'high', not_this: [], needs_review: false, tag: 'INFERRED' }, // needs_review literal true
  6: { ratios: [{ components: 'a : b', ratio: '1:1', structural: true, tag: 'INFERRED' }], unresolvable: [] }, // ratio tag literal CARD
  7: { status: 'COMPLETE', memorable_elements: [{ element: 'e', grounded_in: 'g', tag: 'CARD' }] }, // tag literal INFERRED
  8: { present: [], not_on_card: [], unknown: [], removal_notes: [], disclaimer: 'x' }, // allergen_line missing
  9: { band: { energy_kcal_min: 1, energy_kcal_max: 2 }, sodium: 'unknown', assumptions: [], per_portion: { portions: 1, energy_kcal_min: 1, energy_kcal_max: 2 } }, // incomplete band
};

describe('D-15 schema conformance (A-15 BLOCKER class — run, not read)', () => {
  for (const view of LLM_VIEWS) {
    it(`view ${view} valid instance parses against its frozen schema (${VIEW_PROMPT_SPECS[view].provenance})`, () => {
      const result = parseViewOutput(view, VALID_VIEWS[view]);
      expect(result.ok).toBe(true);
    });

    it(`view ${view} malformed instance is rejected — the QG4 regenerate trigger (${VIEW_PROMPT_SPECS[view].provenance})`, () => {
      const result = parseViewOutput(view, MALFORMED_VIEWS[view]);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.length).toBeGreaterThan(0);
      }
    });
  }

  it('deterministic views 8/9 validate through the same gate', () => {
    expect(parseViewOutput(8, VALID_VIEWS[8]).ok).toBe(true);
    expect(parseViewOutput(9, VALID_VIEWS[9]).ok).toBe(true);
    expect(parseViewOutput(8, MALFORMED_VIEWS[8]).ok).toBe(false);
    expect(parseViewOutput(9, MALFORMED_VIEWS[9]).ok).toBe(false);
  });

  it('every LLM view prompt assembles for home and chef, and the mode focus differs (A-15 mode separation)', () => {
    for (const view of LLM_VIEWS) {
      const home = buildViewPrompt(view, 'home');
      const chef = buildViewPrompt(view, 'chef');
      expect(home.system).toContain('MODE: HOME');
      expect(chef.system).toContain('MODE: CHEF');
      expect(home.user).not.toBe(chef.user);
      expect(home.user).toContain('MODE FOCUS (home)');
      expect(chef.user).toContain('MODE FOCUS (chef)');
    }
  });

  it('deterministic views refuse prompt assembly (D-15C — no invented prompt)', () => {
    for (const view of [8, 9] as const) {
      expect(() => buildViewPrompt(view, 'home')).toThrow(/deterministic/);
      expect(VIEW_PROMPT_SPECS[view].kind).toBe('deterministic');
    }
  });

  it('the prompt version pin is the canonical Analysis_Prompts.md version (D-15B)', () => {
    expect(PROMPT_VERSION).toBe('v2');
  });
});
