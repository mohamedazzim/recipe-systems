// D-16 (P3-2) grounding-validator tests — the A-16 BLOCKER-class suite:
// INV-10 truthfulness plants (invented ingredient, non-captured reference,
// reworded capture, ABSENT-for-captured MAJOR), the absent-channel rule (the
// mechanical garlic catch), regenerate-once semantics (third attempt throws),
// and the pipeline choke point (generateGrounded: schema → grounding).

import { Claim, StructuredRecipeInput } from '@recipe-systems/schemas';
import {
  formatCorrection,
  generateGrounded,
  groundingAttempt,
  LlmGenerateRequest,
  MockLlmAdapter,
  PROMPT_VERSION,
  validateClaimGrounding,
  validateClaimsGrounding,
  validateViewGrounding,
} from '../index';
import { VALID_VIEWS } from '../prompts/validate.test';

// The captured state for the golden-ish fixture: fish + fenugreek×2 + chilli;
// garlic recorded explicitly_absent (the golden card's canonical absence).
export const CAPTURED: StructuredRecipeInput = {
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
        id: 'fenugreek_powder_half_tsp',
        display_name: 'Fenugreek Powder — 1/2 Tsp',
        canonical_name: null,
        amount_text: '1/2 Tsp',
        quantity: 0.5,
        unit: 'tsp',
        confirmed_sense: 'powder',
        category: 'spices',
        food_id: null,
        include_on_list: true,
      },
      {
        id: 'fenugreek_seeds_tadka',
        display_name: 'Fenugreek — 1/4 Tsp',
        canonical_name: null,
        amount_text: '1/4 Tsp',
        quantity: 0.25,
        unit: 'tsp',
        confirmed_sense: 'seeds',
        category: 'spices',
        food_id: null,
        include_on_list: true,
      },
      {
        id: 'chilli_5nos',
        display_name: 'Chilli — 5 Nos',
        canonical_name: null,
        amount_text: '5 Nos',
        quantity: 5,
        unit: 'nos',
        confirmed_sense: null,
        category: 'fresh_produce',
        food_id: null,
        include_on_list: true,
      },
      {
        id: 'coconut_half_shell',
        display_name: 'Grated Coconut — Half Shell',
        canonical_name: null,
        amount_text: 'Half Shell',
        quantity: null,
        unit: null,
        confirmed_sense: null,
        category: 'fats_oils',
        food_id: null,
        include_on_list: true,
      },
      {
        id: 'tamarind_lemon_size',
        display_name: 'Tamarind — A Lemon Size',
        canonical_name: null,
        amount_text: 'A Lemon Size',
        quantity: null,
        unit: null,
        confirmed_sense: null,
        category: 'other',
        food_id: null,
        include_on_list: true,
      },
      {
        id: 'raw_mango_half',
        display_name: 'Mango — 1/2 Nos',
        canonical_name: null,
        amount_text: '1/2 Nos',
        quantity: 0.5,
        unit: 'nos',
        confirmed_sense: null,
        category: 'fresh_produce',
        food_id: null,
        include_on_list: true,
      },
      {
        id: 'coriander_1tsp',
        display_name: 'Coriander Powder — 1 Tsp',
        canonical_name: null,
        amount_text: '1 Tsp',
        quantity: 1,
        unit: 'tsp',
        confirmed_sense: 'powder',
        category: 'spices',
        food_id: null,
        include_on_list: true,
      },
    ],
    method_steps: [{ id: 'm1', text: 'Boil tamarind water; temper; add fish.', source: 'METHOD' }],
    method_source: { name: 'CDK 1669 / Mrs. Anitha', type: 'video', matched: true },
    explicitly_absent: ['garlic'],
    card_metadata: { photographed: true, legible_issues: [] },
  },
};

function request(view: 1 | 2 | 4, mode: 'home' | 'chef' = 'home'): LlmGenerateRequest {
  return {
    view,
    mode,
    recipe_snapshot: CAPTURED,
    prompt_version: PROMPT_VERSION,
    model_version: 'stub-1',
  };
}

describe('D-16 grounding validator — view payloads (INV-10)', () => {
  it('grounded output passes: every structured reference resolves to a captured line', () => {
    const verdict = validateViewGrounding(1, VALID_VIEWS[1] as never, CAPTURED);
    expect(verdict.ok).toBe(true);
  });

  it('plant: an invented ingredient id (garlic_5cloves, tag CARD) is caught (BLOCKER class)', () => {
    const planted = JSON.parse(JSON.stringify(VALID_VIEWS[1]));
    planted.items.push({
      ingredient_id: 'garlic_5cloves',
      job: 'Aromatic base',
      if_omitted: 'Flatter sauce',
      tag: 'CARD',
    });
    const verdict = validateViewGrounding(1, planted, CAPTURED);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.violations.some((v) => v.code === 'UNRESOLVED_INGREDIENT_REFERENCE')).toBe(true);
    }
  });

  it('plant: a reworded id reference (murungakkai instead of drumstick) is caught', () => {
    const planted = JSON.parse(JSON.stringify(VALID_VIEWS[2]));
    planted.pillars.push({
      pillar: 'Texture',
      source_ingredient_ids: ['murungakkai_1nos'],
      if_missing: 'No crunch',
      tag: 'CARD',
    });
    const verdict = validateViewGrounding(2, planted, CAPTURED);
    expect(verdict.ok).toBe(false);
  });

  it('plant: garlic smuggled into a view payload is caught via the absent channel', () => {
    const planted = JSON.parse(JSON.stringify(VALID_VIEWS[8]));
    planted.allergen_line.contains.push('Garlic');
    const verdict = validateViewGrounding(8, planted, CAPTURED);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.violations.some((v) => v.code === 'ABSENT_ITEM_USED_WITHOUT_ABSENT_TAG')).toBe(true);
    }
  });

  it('view 5 contrast text is outside the structured checks (no ids; human-gated G2)', () => {
    // The canonical few-shot names kudampuli (non-captured) inside not_this —
    // the regional-contrast channel; only the absent-channel scan applies.
    const verdict = validateViewGrounding(5, VALID_VIEWS[5] as never, CAPTURED);
    expect(verdict.ok).toBe(true);
  });
});

describe('D-16 grounding validator — claims (ADR §6; A-16)', () => {
  it('CARD claim citing a captured line with its name token passes', () => {
    const claim: Claim = {
      claim_text: 'Fish is the protein, poached in the sour gravy.',
      claim_tag: 'CARD',
      source_reference: 'fish_500g',
      allergen_id: null,
    };
    expect(validateClaimGrounding(claim, CAPTURED).ok).toBe(true);
  });

  it('METHOD claim citing a captured method step passes', () => {
    const claim: Claim = {
      claim_text: 'The card method adds fish after tempering.',
      claim_tag: 'METHOD',
      source_reference: 'm1',
      allergen_id: null,
    };
    expect(validateClaimGrounding(claim, CAPTURED).ok).toBe(true);
  });

  it('plant: invented ingredient in a CARD claim (garlic, non-ABSENT) is caught', () => {
    const claim: Claim = {
      claim_text: 'Garlic deepens the base.',
      claim_tag: 'CARD',
      source_reference: 'fish_500g',
      allergen_id: null,
    };
    const verdict = validateClaimGrounding(claim, CAPTURED);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.violations.some((v) => v.code === 'ABSENT_ITEM_USED_WITHOUT_ABSENT_TAG')).toBe(true);
    }
  });

  it('plant: reworded capture — CARD claim cites a line but text never names it', () => {
    const claim: Claim = {
      claim_text: 'Seer steaks hold the gravy well.',
      claim_tag: 'CARD',
      source_reference: 'fish_500g',
      allergen_id: null,
    };
    const verdict = validateClaimGrounding(claim, CAPTURED);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.violations.some((v) => v.code === 'CLAIM_TEXT_MISMATCH')).toBe(true);
    }
  });

  it('plant: ABSENT for a captured ingredient is a MAJOR', () => {
    const claim: Claim = {
      claim_text: 'Fish is absent from this recipe.',
      claim_tag: 'ABSENT',
      source_reference: null,
      allergen_id: null,
    };
    const verdict = validateClaimGrounding(claim, CAPTURED);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.violations.some((v) => v.code === 'ABSENT_FOR_CAPTURED')).toBe(true);
    }
  });

  it('ABSENT claim about a family-absent item (garlic) passes — the sanctioned channel', () => {
    const claim: Claim = {
      claim_text: 'Garlic is absent from this card.',
      claim_tag: 'ABSENT',
      source_reference: null,
      allergen_id: null,
    };
    expect(validateClaimGrounding(claim, CAPTURED).ok).toBe(true);
  });

  it('INFERRED claim with a named pattern passes; with a positive garlic use it fails', () => {
    const ok: Claim = {
      claim_text: 'Late fenugreek+pepper finish matches the coastal pattern.',
      claim_tag: 'INFERRED',
      source_reference: 'Coastal Tamil meen kuzhambu pattern',
      allergen_id: null,
    };
    expect(validateClaimGrounding(ok, CAPTURED).ok).toBe(true);

    const bad: Claim = {
      claim_text: 'The garlic-forward profile matches a northern variant.',
      claim_tag: 'INFERRED',
      source_reference: 'northern pattern',
      allergen_id: null,
    };
    expect(validateClaimGrounding(bad, CAPTURED).ok).toBe(false);
  });

  it('the full claim set validates as one verdict (validateClaimsGrounding)', () => {
    const good: Claim = {
      claim_text: 'Fenugreek powder gives the bitter-aroma base.',
      claim_tag: 'CARD',
      source_reference: 'fenugreek_powder_half_tsp',
      allergen_id: null,
    };
    expect(validateClaimsGrounding([good], CAPTURED).ok).toBe(true);

    const bad: Claim = {
      claim_text: 'Garlic adds base aroma.',
      claim_tag: 'CARD',
      source_reference: 'fish_500g',
      allergen_id: null,
    };
    const verdict = validateClaimsGrounding([good, bad], CAPTURED);
    expect(verdict.ok).toBe(false);
  });
});

describe('D-16 regenerate-once semantics (A-16)', () => {
  const violation = {
    code: 'UNRESOLVED_INGREDIENT_REFERENCE',
    message: 'x does not resolve',
    at: 'view 1',
  } as const;

  it('attempt 1 → regenerate with a correction instruction', () => {
    const decision = groundingAttempt(1, [violation]);
    expect(decision.action).toBe('regenerate');
    if (decision.action === 'regenerate') {
      expect(decision.correction_instruction).toContain('UNRESOLVED_INGREDIENT_REFERENCE');
      expect(formatCorrection([violation])).toContain('ONLY source of truth');
    }
  });

  it('attempt 2 → INCOMPLETE with the violations (never current, INV-10)', () => {
    const decision = groundingAttempt(2, [violation]);
    expect(decision.action).toBe('incomplete');
  });

  it('attempt 3+ throws — a third silent attempt is a BLOCKER', () => {
    expect(() => groundingAttempt(3, [violation])).toThrow(/third silent attempt/);
    expect(() => groundingAttempt(0, [violation])).toThrow(/invalid attempt/);
  });
});

describe('D-16 pipeline choke point (generateGrounded)', () => {
  it('grounded generation: parse + grounding verdict, single entry point', async () => {
    const adapter = new MockLlmAdapter([{ view: 1, mode: 'home', output: VALID_VIEWS[1] }]);
    const result = await generateGrounded(adapter, request(1), CAPTURED);
    expect(result.parse.ok).toBe(true);
    expect(result.grounding).toEqual({ ok: true });
  });

  it('planted garlic payload fails at the grounding stage through the choke point', async () => {
    const planted = JSON.parse(JSON.stringify(VALID_VIEWS[1]));
    planted.items.push({
      ingredient_id: 'garlic_5cloves',
      job: 'Aromatic base',
      if_omitted: 'Flatter sauce',
      tag: 'CARD',
    });
    const adapter = new MockLlmAdapter([{ view: 1, mode: 'home', output: planted }]);
    const result = await generateGrounded(adapter, request(1), CAPTURED);
    expect(result.parse.ok).toBe(true);
    expect(result.grounding?.ok).toBe(false);
  });

  it('malformed output is rejected before grounding (schema first, then grounding)', async () => {
    const adapter = new MockLlmAdapter([
      { view: 1, mode: 'home', output: { items: [] } }, // role_groups missing → strict() rejects
    ]);
    const result = await generateGrounded(adapter, request(1), CAPTURED);
    expect(result.parse.ok).toBe(false);
    expect(result.grounding).toBeNull();
  });
});
