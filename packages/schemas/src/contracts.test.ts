// Functional contract tests (D-05 dispatch \u00a710\u2013\u00a713): for EVERY frozen contract —
// valid payload, missing required, wrong type, invalid enum, invalid nesting,
// nullability behavior, and strict rejection of unexpected keys.
import {
  AnalysisEnvelopeSchema,
  ClaimSchema,
  DeterministicViewInputSchema,
  IdentificationSchema,
  StationCardSchema,
  StructuredRecipeInputSchema,
  View1PayloadSchema,
  View2PayloadSchema,
  View3PayloadSchema,
  View4PayloadSchema,
  View5PayloadSchema,
  View6PayloadSchema,
  View7PayloadSchema,
  View8PayloadSchema,
  View9PayloadSchema,
  View9AssumptionsSchema,
} from './index';
import {
  claimValid,
  deterministicInputValid,
  envelopeValid,
  identificationValid,
  stationCardValid,
  structuredRecipeInputValid,
  view1Valid,
  view2Valid,
  view3Valid,
  view4Valid,
  view5Valid,
  view6Valid,
  view7Valid,
  view8Valid,
  view9Valid,
  view9AssumptionsValid,
  UUID_A,
  UUID_B,
} from './fixtures';
import { deepDelete, deepSet } from './test-helpers';

describe('View 1 — Ingredient Function', () => {
  it('accepts the valid payload', () => {
    expect(View1PayloadSchema.safeParse(view1Valid).success).toBe(true);
  });
  it('rejects when items is missing', () => {
    expect(View1PayloadSchema.safeParse(deepDelete(view1Valid, 'items')).success).toBe(false);
  });
  it('rejects an item with a non-string job', () => {
    expect(View1PayloadSchema.safeParse(deepSet(view1Valid, 'items.0.job', 42)).success).toBe(false);
  });
  it('rejects an item tag outside CARD|METHOD|INFERRED|ASSUMED', () => {
    expect(View1PayloadSchema.safeParse(deepSet(view1Valid, 'items.0.tag', 'UNKNOWN')).success).toBe(false);
  });
  it('rejects a role_group with non-string role', () => {
    expect(View1PayloadSchema.safeParse(deepSet(view1Valid, 'role_groups.0.role', 7)).success).toBe(false);
  });
  it('rejects unexpected top-level keys (strict)', () => {
    expect(View1PayloadSchema.safeParse({ ...view1Valid, extra: 1 }).success).toBe(false);
  });
  it('rejects an item carrying an unexpected key (strict nested)', () => {
    expect(View1PayloadSchema.safeParse(deepSet(view1Valid, 'items.0.extra', 1)).success).toBe(false);
  });
});

describe('View 2 — Taste Pillars', () => {
  it('accepts the valid payload', () => {
    expect(View2PayloadSchema.safeParse(view2Valid).success).toBe(true);
  });
  it('rejects when blind_spot_notes is missing', () => {
    expect(View2PayloadSchema.safeParse(deepDelete(view2Valid, 'blind_spot_notes')).success).toBe(false);
  });
  it('rejects a pillar tag of ASSUMED (not in CARD|METHOD|INFERRED)', () => {
    expect(View2PayloadSchema.safeParse(deepSet(view2Valid, 'pillars.0.tag', 'ASSUMED')).success).toBe(false);
  });
  it('rejects source_ingredient_ids containing a number', () => {
    expect(View2PayloadSchema.safeParse(deepSet(view2Valid, 'pillars.0.source_ingredient_ids', ['x', 2])).success).toBe(false);
  });
  it('rejects a note with non-string note', () => {
    expect(View2PayloadSchema.safeParse(deepSet(view2Valid, 'blind_spot_notes.0.note', true)).success).toBe(false);
  });
  it('accepts an empty blind_spot_notes list (no disagreement = nothing to record)', () => {
    expect(View2PayloadSchema.safeParse(deepSet(view2Valid, 'blind_spot_notes', [])).success).toBe(true);
  });
});

describe('View 3 — Process & Timing', () => {
  it('accepts the valid payload', () => {
    expect(View3PayloadSchema.safeParse(view3Valid).success).toBe(true);
  });
  it('rejects an invalid status enum', () => {
    expect(View3PayloadSchema.safeParse(deepSet(view3Valid, 'status', 'PARTIAL')).success).toBe(false);
  });
  it('rejects a stage tag of ASSUMED', () => {
    expect(View3PayloadSchema.safeParse(deepSet(view3Valid, 'stages.0.tag', 'ASSUMED')).success).toBe(false);
  });
  it('rejects a numeric duration', () => {
    expect(View3PayloadSchema.safeParse(deepSet(view3Valid, 'stages.0.duration', 5)).success).toBe(false);
  });
  it('accepts duration "UNKNOWN" and null incomplete_reason (COMPLETE case)', () => {
    expect(View3PayloadSchema.safeParse(view3Valid).success).toBe(true);
  });
  it('accepts the honest INCOMPLETE shape: empty stages + populated reason', () => {
    const incomplete = { status: 'INCOMPLETE', stages: [], incomplete_reason: 'No matched method source' };
    expect(View3PayloadSchema.safeParse(incomplete).success).toBe(true);
  });
  it('rejects INCOMPLETE with a non-string incomplete_reason', () => {
    const bad = { status: 'INCOMPLETE', stages: [], incomplete_reason: 3 };
    expect(View3PayloadSchema.safeParse(bad).success).toBe(false);
  });
  it('rejects when incomplete_reason is missing entirely', () => {
    const missing = { status: 'INCOMPLETE', stages: [] };
    expect(View3PayloadSchema.safeParse(missing).success).toBe(false);
  });
});

describe('View 4 — Substitutions', () => {
  it('accepts the valid payload', () => {
    expect(View4PayloadSchema.safeParse(view4Valid).success).toBe(true);
  });
  it('rejects a substitution tag of CARD (items are INFERRED-only)', () => {
    expect(View4PayloadSchema.safeParse(deepSet(view4Valid, 'substitutions.0.tag', 'CARD')).success).toBe(false);
  });
  it('rejects a missing consequence', () => {
    expect(View4PayloadSchema.safeParse(deepDelete(view4Valid, 'substitutions.0.consequence')).success).toBe(false);
  });
  it('accepts an empty substitutions list', () => {
    expect(View4PayloadSchema.safeParse(deepSet(view4Valid, 'substitutions', [])).success).toBe(true);
  });
});

describe('View 5 — Regional Context (high-risk)', () => {
  it('accepts the valid payload', () => {
    expect(View5PayloadSchema.safeParse(view5Valid).success).toBe(true);
  });
  it('rejects confidence outside high|medium|low', () => {
    expect(View5PayloadSchema.safeParse(deepSet(view5Valid, 'confidence', 'certain')).success).toBe(false);
  });
  it('rejects a not_this entry missing key_difference', () => {
    expect(View5PayloadSchema.safeParse(deepDelete(view5Valid, 'not_this.0.key_difference')).success).toBe(false);
  });
  it('BOUNDARY: rejects needs_review=false — human review is ALWAYS required (rule G2)', () => {
    expect(View5PayloadSchema.safeParse(deepSet(view5Valid, 'needs_review', false)).success).toBe(false);
  });
  it('rejects tag other than INFERRED', () => {
    expect(View5PayloadSchema.safeParse(deepSet(view5Valid, 'tag', 'CARD')).success).toBe(false);
  });
});

describe('View 6 — Ratios', () => {
  it('accepts the valid payload', () => {
    expect(View6PayloadSchema.safeParse(view6Valid).success).toBe(true);
  });
  it('rejects a ratio tag other than CARD', () => {
    expect(View6PayloadSchema.safeParse(deepSet(view6Valid, 'ratios.0.tag', 'INFERRED')).success).toBe(false);
  });
  it('rejects an unresolvable tag other than UNKNOWN', () => {
    expect(View6PayloadSchema.safeParse(deepSet(view6Valid, 'unresolvable.0.tag', 'CARD')).success).toBe(false);
  });
  it('rejects a non-boolean structural flag', () => {
    expect(View6PayloadSchema.safeParse(deepSet(view6Valid, 'ratios.0.structural', 'yes')).success).toBe(false);
  });
  it('accepts both lists empty', () => {
    expect(
      View6PayloadSchema.safeParse({ ratios: [], unresolvable: [] }).success,
    ).toBe(true);
  });
});

describe('View 7 — Why It\'s Memorable', () => {
  it('accepts the valid payload', () => {
    expect(View7PayloadSchema.safeParse(view7Valid).success).toBe(true);
  });
  it('rejects status outside COMPLETE|INCOMPLETE', () => {
    expect(View7PayloadSchema.safeParse(deepSet(view7Valid, 'status', 'PARTIAL')).success).toBe(false);
  });
  it('rejects an element tag other than INFERRED', () => {
    expect(View7PayloadSchema.safeParse(deepSet(view7Valid, 'memorable_elements.0.tag', 'CARD')).success).toBe(false);
  });
  it('rejects a missing grounded_in', () => {
    expect(View7PayloadSchema.safeParse(deepDelete(view7Valid, 'memorable_elements.0.grounded_in')).success).toBe(false);
  });
  it('accepts the INCOMPLETE dependency-gate shape (empty elements)', () => {
    expect(View7PayloadSchema.safeParse({ status: 'INCOMPLETE', memorable_elements: [] }).success).toBe(true);
  });
});

describe('View 8 — Dietary restrictions (deterministic)', () => {
  it('accepts the valid payload', () => {
    expect(View8PayloadSchema.safeParse(view8Valid).success).toBe(true);
  });
  it('rejects when disclaimer is missing (every output carries it)', () => {
    expect(View8PayloadSchema.safeParse(deepDelete(view8Valid, 'disclaimer')).success).toBe(false);
  });
  it('rejects a removal_note missing item', () => {
    expect(View8PayloadSchema.safeParse(deepDelete(view8Valid, 'removal_notes.0.item')).success).toBe(false);
  });
  it('rejects allergen_line with a non-array notes', () => {
    expect(View8PayloadSchema.safeParse(deepSet(view8Valid, 'allergen_line.notes', 'none')).success).toBe(false);
  });
  it('rejects a numeric entry in present', () => {
    expect(View8PayloadSchema.safeParse(deepSet(view8Valid, 'present', ['Fish', 3])).success).toBe(false);
  });
  it('rejects an unexpected allergen_line key (strict)', () => {
    expect(View8PayloadSchema.safeParse(deepSet(view8Valid, 'allergen_line.certified', true)).success).toBe(false);
  });
});

describe('View 9 — Calories (deterministic band)', () => {
  it('accepts the valid payload (golden band 1300\u20132200)', () => {
    expect(View9PayloadSchema.safeParse(view9Valid).success).toBe(true);
  });
  it('BOUNDARY: rejects a single point value instead of min/max (band, never a point)', () => {
    const point = deepDelete(deepSet(view9Valid, 'band.energy_kcal', 487), 'band.energy_kcal_min');
    expect(View9PayloadSchema.safeParse(point).success).toBe(false);
  });
  it('rejects sodium as a fabricated number — only "unknown" is canonical', () => {
    expect(View9PayloadSchema.safeParse(deepSet(view9Valid, 'sodium', 900)).success).toBe(false);
  });
  it('rejects an assumption tag other than ASSUMED', () => {
    expect(View9PayloadSchema.safeParse(deepSet(view9Valid, 'assumptions.0.tag', 'CARD')).success).toBe(false);
  });
  it('rejects a string energy_kcal_min', () => {
    expect(View9PayloadSchema.safeParse(deepSet(view9Valid, 'band.energy_kcal_min', '1300')).success).toBe(false);
  });
  it('accepts per_portion when portions are set, and null when not', () => {
    const withPortion = deepSet(view9Valid, 'per_portion', {
      portions: 4,
      energy_kcal_min: 330,
      energy_kcal_max: 550,
    });
    expect(View9PayloadSchema.safeParse(withPortion).success).toBe(true);
    expect(View9PayloadSchema.safeParse(deepSet(view9Valid, 'per_portion', null)).success).toBe(true);
  });
  it('rejects a per_portion object missing portions', () => {
    const bad = deepSet(view9Valid, 'per_portion', { energy_kcal_min: 330, energy_kcal_max: 550 });
    expect(View9PayloadSchema.safeParse(bad).success).toBe(false);
  });
  it('rejects a protein_g with string min', () => {
    expect(View9PayloadSchema.safeParse(deepSet(view9Valid, 'band.protein_g.min', '20')).success).toBe(false);
  });
});

describe('Identification', () => {
  it('accepts the valid payload', () => {
    expect(IdentificationSchema.safeParse(identificationValid).success).toBe(true);
  });
  it('rejects when absent_on_card is missing (C1 AC-1: all five fields required)', () => {
    expect(IdentificationSchema.safeParse(deepDelete(identificationValid, 'absent_on_card')).success).toBe(false);
  });
  it('rejects confidence outside high|medium|low', () => {
    expect(IdentificationSchema.safeParse(deepSet(identificationValid, 'confidence', 'certain')).success).toBe(false);
  });
  it('rejects not_this entries that are not strings', () => {
    expect(IdentificationSchema.safeParse(deepSet(identificationValid, 'not_this', [{ a: 1 }])).success).toBe(false);
  });
  it('rejects tags.family other than INFERRED', () => {
    expect(IdentificationSchema.safeParse(deepSet(identificationValid, 'tags.family', 'CARD')).success).toBe(false);
  });
  it('rejects an extra tag key beyond family (strict)', () => {
    expect(IdentificationSchema.safeParse(deepSet(identificationValid, 'tags.architecture', 'INFERRED')).success).toBe(false);
  });
  it('rejects an empty family string', () => {
    expect(IdentificationSchema.safeParse(deepSet(identificationValid, 'family', '')).success).toBe(false);
  });
});

describe('Claim schema (analysis_claim)', () => {
  it('accepts the valid payload', () => {
    expect(ClaimSchema.safeParse(claimValid).success).toBe(true);
  });
  it('accepts every one of the six canonical tags', () => {
    (['CARD', 'METHOD', 'INFERRED', 'ABSENT', 'UNKNOWN', 'ASSUMED'] as const).forEach((tag) => {
      expect(ClaimSchema.safeParse({ ...claimValid, claim_tag: tag }).success).toBe(true);
    });
  });
  it('rejects a tag outside the six canonical values', () => {
    expect(ClaimSchema.safeParse({ ...claimValid, claim_tag: 'GUESS' }).success).toBe(false);
  });
  it('rejects an empty claim_text', () => {
    expect(ClaimSchema.safeParse({ ...claimValid, claim_text: '' }).success).toBe(false);
  });
  it('accepts a nullable source_reference and a uuid allergen_id', () => {
    const withAllergen = { ...claimValid, allergen_id: UUID_A };
    expect(ClaimSchema.safeParse(withAllergen).success).toBe(true);
    expect(ClaimSchema.safeParse(claimValid).success).toBe(true);
  });
  it('rejects a malformed allergen_id uuid', () => {
    expect(ClaimSchema.safeParse({ ...claimValid, allergen_id: 'not-a-uuid' }).success).toBe(false);
  });
  it('rejects a numeric source_reference', () => {
    expect(ClaimSchema.safeParse({ ...claimValid, source_reference: 42 }).success).toBe(false);
  });
});

describe('Station card', () => {
  it('accepts the valid payload', () => {
    expect(StationCardSchema.safeParse(stationCardValid).success).toBe(true);
  });
  it('rejects when printable is missing', () => {
    expect(StationCardSchema.safeParse(deepDelete(stationCardValid, 'printable')).success).toBe(false);
  });
  it('rejects a non-boolean printable', () => {
    expect(StationCardSchema.safeParse(deepSet(stationCardValid, 'printable', 'yes')).success).toBe(false);
  });
  it('accepts product_yield_hold null (chef-mode hold data optional)', () => {
    expect(StationCardSchema.safeParse(deepSet(stationCardValid, 'product_yield_hold', null)).success).toBe(true);
  });
  it('rejects a malformed station_card_id uuid', () => {
    expect(StationCardSchema.safeParse(deepSet(stationCardValid, 'station_card_id', 'x')).success).toBe(false);
  });
  it('rejects sequence as a string (must be an array)', () => {
    expect(StationCardSchema.safeParse(deepSet(stationCardValid, 'sequence', 'step 1')).success).toBe(false);
  });
});

describe('StructuredRecipeInput (shared LLM input)', () => {
  it('accepts the valid payload (both fenugreek senses kept as separate entries)', () => {
    expect(StructuredRecipeInputSchema.safeParse(structuredRecipeInputValid).success).toBe(true);
  });
  it('rejects an ingredient missing include_on_list', () => {
    expect(
      StructuredRecipeInputSchema.safeParse(
        deepDelete(structuredRecipeInputValid, 'structured_recipe.ingredients.0.include_on_list'),
      ).success,
    ).toBe(false);
  });
  it('rejects a numeric display_name', () => {
    expect(
      StructuredRecipeInputSchema.safeParse(
        deepSet(structuredRecipeInputValid, 'structured_recipe.ingredients.0.display_name', 9),
      ).success,
    ).toBe(false);
  });
  it('rejects a method step source outside CARD|METHOD|null', () => {
    const withStep = deepSet(structuredRecipeInputValid, 'structured_recipe.method_steps', [
      { id: 's1', text: 'Boil water', source: 'GUESS' },
    ]);
    expect(StructuredRecipeInputSchema.safeParse(withStep).success).toBe(false);
  });
  it('rejects method_source type outside video|text|null', () => {
    expect(
      StructuredRecipeInputSchema.safeParse(
        deepSet(structuredRecipeInputValid, 'structured_recipe.method_source.type', 'pdf'),
      ).success,
    ).toBe(false);
  });
  it('rejects when method_source.matched is not a boolean', () => {
    expect(
      StructuredRecipeInputSchema.safeParse(
        deepSet(structuredRecipeInputValid, 'structured_recipe.method_source.matched', 'true'),
      ).success,
    ).toBe(false);
  });
  it('accepts null canonical_name / quantity (alias-unresolved, "to taste")', () => {
    expect(StructuredRecipeInputSchema.safeParse(structuredRecipeInputValid).success).toBe(true);
  });
  it('rejects a non-string food_id', () => {
    expect(
      StructuredRecipeInputSchema.safeParse(
        deepSet(structuredRecipeInputValid, 'structured_recipe.ingredients.0.food_id', 1157),
      ).success,
    ).toBe(false);
  });
});

describe('DeterministicViewInput + View9Assumptions', () => {
  it('accepts the valid deterministic input', () => {
    expect(DeterministicViewInputSchema.safeParse(deterministicInputValid).success).toBe(true);
  });
  it('rejects region_pack outside US|EU', () => {
    expect(DeterministicViewInputSchema.safeParse(deepSet(deterministicInputValid, 'region_pack', 'IN')).success).toBe(false);
  });
  it('rejects an ingredient with a numeric canonical_name', () => {
    expect(
      DeterministicViewInputSchema.safeParse(
        deepSet(deterministicInputValid, 'ingredients.0.canonical_name', 12),
      ).success,
    ).toBe(false);
  });
  it('accepts the valid V9 assumptions', () => {
    expect(View9AssumptionsSchema.safeParse(view9AssumptionsValid).success).toBe(true);
  });
  it('rejects fish_class outside lean|oily', () => {
    expect(View9AssumptionsSchema.safeParse(deepSet(view9AssumptionsValid, 'fish_class', 'fatty')).success).toBe(false);
  });
  it('rejects a string coconut_grams', () => {
    expect(View9AssumptionsSchema.safeParse(deepSet(view9AssumptionsValid, 'coconut_grams', '175')).success).toBe(false);
  });
  it('accepts portions null (no per-bowl number until the user sets it)', () => {
    expect(View9AssumptionsSchema.safeParse(deepSet(view9AssumptionsValid, 'portions', null)).success).toBe(true);
  });
});

describe('Analysis envelope (analyse 200)', () => {
  it('accepts the full nine-view envelope', () => {
    expect(AnalysisEnvelopeSchema.safeParse(envelopeValid).success).toBe(true);
  });
  it('rejects when any of the nine views is missing', () => {
    expect(
      AnalysisEnvelopeSchema.safeParse(deepDelete(envelopeValid, 'views.view_5')).success,
    ).toBe(false);
  });
  it('rejects mode outside home|chef', () => {
    expect(AnalysisEnvelopeSchema.safeParse(deepSet(envelopeValid, 'mode', 'pro')).success).toBe(false);
  });
  it('rejects a claim_tags value that is not a non-negative integer', () => {
    expect(AnalysisEnvelopeSchema.safeParse(deepSet(envelopeValid, 'claim_tags.CARD', -1)).success).toBe(false);
    expect(AnalysisEnvelopeSchema.safeParse(deepSet(envelopeValid, 'claim_tags.CARD', 1.5)).success).toBe(false);
  });
  it('rejects a claim_tags key outside the six canonical tags', () => {
    expect(AnalysisEnvelopeSchema.safeParse(deepSet(envelopeValid, 'claim_tags.GUESS', 1)).success).toBe(false);
  });
  it('accepts station_card null (home mode) and a real station card (chef mode)', () => {
    expect(AnalysisEnvelopeSchema.safeParse(deepSet(envelopeValid, 'station_card', null)).success).toBe(true);
    expect(AnalysisEnvelopeSchema.safeParse(deepSet(envelopeValid, 'station_card', stationCardValid)).success).toBe(true);
  });
  it('BOUNDARY: rejects an almost-correct envelope whose identification has no tags', () => {
    expect(
      AnalysisEnvelopeSchema.safeParse(deepDelete(envelopeValid, 'identification.tags')).success,
    ).toBe(false);
  });
  it('rejects a malformed analysis_id uuid', () => {
    expect(AnalysisEnvelopeSchema.safeParse(deepSet(envelopeValid, 'analysis_id', 'abc')).success).toBe(false);
  });
  it('rejects an unexpected top-level key (strict)', () => {
    expect(AnalysisEnvelopeSchema.safeParse({ ...envelopeValid, cooking_time: 4 }).success).toBe(false);
  });
  it('rejects a view payload with an unexpected key inside the envelope (strict nested)', () => {
    expect(
      AnalysisEnvelopeSchema.safeParse(deepSet(envelopeValid, 'views.view_8.forbidden', 'safe')).success,
    ).toBe(false);
  });
});

describe('UUID fixtures sanity', () => {
  it('uses distinct valid uuids', () => {
    expect(UUID_A).not.toBe(UUID_B);
  });
});
