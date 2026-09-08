// Representative valid payloads \u2014 canonical/example values ONLY, taken from the
// specification documents (Recipe_Systems \u00a75/\u00a76, Analysis Prompts few-shots,
// Deterministic Views examples, API doc shapes, D-03 golden fixture, D-04 corpus rs-001).
export const UUID_A = '8f14e45f-2b4c-4d3e-a2f1-9c7d6b5a4e3f';
export const UUID_B = '7d1c9a2e-5f6b-4e8a-9c3d-1f2e3b4a5c6d';

export const identificationValid = {
  family: 'Coastal Tamil meen kuzhambu, Kanyakumari / Kumari',
  architecture: 'Raw-ground coconut paste, triple sour, late fenugreek + pepper, coconut-oil tadka last',
  confidence: 'high',
  not_this: [
    'Inland Tamil gingelly-oil kuzhambu',
    'Kerala kudampuli meen curry',
    'Roasted-coconut varutharacha',
  ],
  absent_on_card: ['garlic', 'ginger', 'coconut milk', 'kudampuli', 'sesame oil'],
  tags: { family: 'INFERRED' },
} as const;

export const claimValid = {
  claim_text: 'Fish is a structural ingredient: protein, fat, and the reason for the sour',
  claim_tag: 'CARD',
  source_reference: 'Card line "Fish — 500g"',
  allergen_id: null,
} as const;

export const structuredRecipeInputValid = {
  structured_recipe: {
    ingredients: [
      {
        id: 'fenugreek_powder_half_tsp',
        display_name: 'Fenugreek Powder',
        canonical_name: 'fenugreek',
        amount_text: '1/2 Tsp',
        quantity: 0.5,
        unit: 'tsp',
        confirmed_sense: 'powder',
        category: 'spices',
        food_id: null,
        include_on_list: true,
      },
      {
        id: 'fenugreek_seed_quarter_tsp',
        display_name: 'Fenugreek',
        canonical_name: 'fenugreek',
        amount_text: '1/4 Tsp',
        quantity: 0.25,
        unit: 'tsp',
        confirmed_sense: 'seeds',
        category: 'spices',
        food_id: null,
        include_on_list: true,
      },
      {
        id: 'salt_to_taste',
        display_name: 'Salt',
        canonical_name: 'salt',
        amount_text: 'To Taste',
        quantity: null,
        unit: null,
        confirmed_sense: null,
        category: 'other',
        food_id: null,
        include_on_list: false,
      },
    ],
    method_steps: [],
    method_source: { name: 'CDK 1669', type: 'video', matched: true },
    explicitly_absent: ['garlic', 'ginger'],
    card_metadata: { photographed: true, legible_issues: [] },
  },
} as const;

export const deterministicInputValid = {
  ingredients: [
    { id: 'fish_500g', canonical_name: 'fish', food_id: null, quantity: 500, amount_text: '500g', category: 'fish_meat' },
    { id: 'coconut_half', canonical_name: 'coconut', food_id: '1157', quantity: null, amount_text: 'Half Shell', category: 'fresh_produce' },
  ],
  explicitly_absent: ['garlic'],
  region_pack: 'US',
} as const;

export const view9AssumptionsValid = {
  fish_class: 'oily',
  coconut_grams: 175,
  oil_tbsp: 2,
  portions: 4,
} as const;

export const view1Valid = {
  items: [
    {
      ingredient_id: 'coconut_half_shell',
      job: 'Body and fat of the gravy',
      if_omitted: 'Thin tamarind stew, no richness',
      tag: 'CARD',
    },
    {
      ingredient_id: 'fish_500g',
      job: 'Protein, fat, reason for the sour',
      if_omitted: 'Not this dish',
      tag: 'CARD',
    },
  ],
  role_groups: [
    { role: 'Body / richness', ingredient_ids: ['coconut_half_shell', 'fish_500g'] },
    { role: 'Sour', ingredient_ids: [] },
  ],
} as const;

export const view2Valid = {
  pillars: [
    {
      pillar: 'Bitter',
      source_ingredient_ids: ['fenugreek_powder_half_tsp', 'fenugreek_seed_quarter_tsp'],
      if_missing: 'Generic spicy stew, not this coast',
      tag: 'CARD',
    },
  ],
  blind_spot_notes: [
    {
      ingredient_id: 'coriander_1tsp',
      note:
        'Bridge spice — rounds chilli heat and adds paste body; does not cleanly own a single pillar. View 1 will weight this more heavily; that disagreement is expected, not an error.',
    },
  ],
} as const;

export const view3Valid = {
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
      stage_name: 'Late powders',
      action: 'Add fenugreek powder and pepper when the fish is just done',
      cue: 'Fenugreek aroma, not bitterness',
      duration: 'UNKNOWN',
      tag: 'INFERRED',
    },
  ],
  incomplete_reason: null,
} as const;

export const view4Valid = {
  substitutions: [
    {
      ingredient_id: 'coconut_half_shell',
      substitute: 'Coconut milk (reduced quantity)',
      consequence: 'Thinner body, less textural richness; still holds structurally since tamarind is kept',
      tag: 'INFERRED',
    },
  ],
} as const;

export const view5Valid = {
  family: 'Coastal Tamil (Kanyakumari) style',
  architecture:
    'Raw-ground coconut paste, triple sour (tamarind + mango + tomato), late fenugreek+pepper, coconut-oil tadka last',
  confidence: 'high',
  not_this: [
    {
      variant: 'Kerala meen curry',
      key_difference: 'uses kudampuli instead of tamarind/mango, typically coconut milk-based, no raw-ground paste',
    },
  ],
  needs_review: true,
  tag: 'INFERRED',
} as const;

export const view6Valid = {
  ratios: [
    { components: 'chilli powder : coriander', ratio: '2 tsp : 1 tsp', structural: true, tag: 'CARD' },
  ],
  unresolvable: [
    { components: 'salt : liquid', reason: "salt quantity is null ('to taste')", tag: 'UNKNOWN' },
  ],
} as const;

export const view7Valid = {
  status: 'COMPLETE',
  memorable_elements: [
    {
      element: 'Late fenugreek+pepper finish',
      grounded_in:
        "Process stage 'finish aroma' — mustard+fenugreek seed+curry leaf+coconut oil added last, per View 3",
      tag: 'INFERRED',
    },
  ],
} as const;

export const view8Valid = {
  present: ['Fish', 'Mustard'],
  not_on_card: ['Garlic'],
  unknown: ['Coconut (pack-dependent)'],
  removal_notes: [
    { item: 'Mustard', note: 'Removing it changes the tadka; the dish is still a kuzhambu.' },
  ],
  disclaimer: 'Reads the card only. Does not test food. Does not know your kitchen. Not medical advice.',
  allergen_line: { contains: ['Fish', 'Mustard'], notes: [], unknown: [] },
} as const;

export const view9Valid = {
  band: {
    energy_kcal_min: 1300,
    energy_kcal_max: 2200,
    protein_g: { min: 90, max: 110 },
    fat_g: { min: 24, max: 32 },
    carb_g: { min: 30, max: 40 },
    fibre_g: { min: 4, max: 6 },
  },
  sodium: 'unknown',
  assumptions: [
    { key: 'fish_class', value: 'oily', tag: 'ASSUMED' },
    { key: 'coconut_grams', value: '50', tag: 'ASSUMED' },
  ],
  per_portion: null,
  tightening_factors: ['Name the fish species', 'Weigh the coconut'],
  disclaimer: 'Table estimate from stated assumptions. Not a lab analysis. Not medical advice.',
} as const;

export const stationCardValid = {
  station_card_id: UUID_A,
  analysis_id: UUID_B,
  mise: { fish: '500g steaks', coconut: 'half shell, grated' },
  sequence: ['Build the liquid', 'Load fish and vegetables', 'Late powders', 'Tadka last'],
  do_nots: ['Do not stir like dal', 'Do not add fenugreek early'],
  control_points: ['Fish opaque and just flaking', 'Mustard pops'],
  product_yield_hold: { yield: '4 bowls', hold: 'poor — cook to order' },
  printable: true,
} as const;

export const envelopeValid = {
  analysis_id: UUID_B,
  mode: 'home',
  identification: identificationValid,
  views: {
    view_1: view1Valid,
    view_2: view2Valid,
    view_3: view3Valid,
    view_4: view4Valid,
    view_5: view5Valid,
    view_6: view6Valid,
    view_7: view7Valid,
    view_8: view8Valid,
    view_9: view9Valid,
  },
  claim_tags: { CARD: 12, METHOD: 2, INFERRED: 9, ABSENT: 2, UNKNOWN: 3, ASSUMED: 2 },
  station_card: null,
  is_latest: true,
  model_version: 'gemini-2.5-flash',
  prompt_version: 'v2',
} as const;
