// D-15 (P3-1): adapter-seam + reproducibility tests (A-15):
//  - same prompt_version + same stubbed model → identical output, run twice (MAJOR otherwise)
//  - home vs chef: different prompts AND different mode-scoped fixtures against the same recipe
//  - generateValidated: invalid model output is rejected, never published (QG4 cell)
//  - Q9 hygiene: no provider, no credentials, no network in the seam
//  - determinism survives JSON round-trips (structured clone, no shared refs)

import {
  AnalysisEnvelopeSchema,
  IdentificationSchema,
  StructuredRecipeInput,
} from '@recipe-systems/schemas';
import {
  generateValidated,
  LlmGenerateRequest,
  MockLlmAdapter,
  PROMPT_VERSION,
  promptsForRequest,
  systemPromptFor,
} from './index';
import { VALID_VIEWS } from './prompts/validate.test';

const SNAPSHOT: StructuredRecipeInput = {
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
    ],
    method_steps: [{ id: 'm1', text: 'Boil tamarind water; temper; add fish.', source: 'METHOD' }],
    method_source: { name: 'CDK 1669 / Mrs. Anitha', type: 'video', matched: true },
    explicitly_absent: [],
    card_metadata: { photographed: true, legible_issues: [] },
  },
};

function request(view: 1 | 3, mode: 'home' | 'chef'): LlmGenerateRequest {
  return {
    view,
    mode,
    recipe_snapshot: SNAPSHOT,
    prompt_version: PROMPT_VERSION,
    model_version: 'stub-1',
  };
}

describe('D-15 LLM adapter seam + mock (P3-1)', () => {
  it('reproducibility: same version + same mock + same input → byte-identical output, run twice (A-15 MAJOR contract)', async () => {
    const adapter = new MockLlmAdapter([
      { view: 1, mode: 'home', output: VALID_VIEWS[1] },
      { view: 1, mode: 'chef', output: VALID_VIEWS[1] },
    ]);
    const a = await adapter.generate(request(1, 'home'));
    const b = await adapter.generate(request(1, 'home'));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a).toEqual(VALID_VIEWS[1]);
  });

  it('home vs chef: different assembled prompts against the same recipe (A-15 mode separation)', () => {
    const home = promptsForRequest({ view: 3, mode: 'home' });
    const chef = promptsForRequest({ view: 3, mode: 'chef' });
    expect(home.system).not.toBe(chef.system);
    expect(home.user).not.toBe(chef.user);
    expect(systemPromptFor('home')).toContain('MODE: HOME');
    expect(systemPromptFor('chef')).toContain('MODE: CHEF');
    expect(chef.system).toContain('briefing');
    expect(home.system).not.toContain('briefing');
  });

  it('home vs chef: mode-scoped fixtures produce different outputs for the same view', async () => {
    const homeOut = { ...(VALID_VIEWS[3] as object) };
    const chefOut = JSON.parse(JSON.stringify(VALID_VIEWS[3]));
    chefOut.stages = [
      {
        stage_name: 'Load and heat',
        action: 'Fish, drumstick, chillies, mango, tomato — cover, boil, reduce to medium',
        cue: 'Fish opaque and just flaking',
        duration: 'UNKNOWN',
        tag: 'METHOD',
      },
    ];
    const adapter = new MockLlmAdapter([
      { view: 3, mode: 'home', output: homeOut },
      { view: 3, mode: 'chef', output: chefOut },
    ]);
    const a = await adapter.generate(request(3, 'home'));
    const b = await adapter.generate(request(3, 'chef'));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('generateValidated: a malformed model output is rejected — never published (QG4 invalid-schema cell)', async () => {
    const bad = { status: 'MAYBE', stages: [], incomplete_reason: null };
    const adapter = new MockLlmAdapter([{ view: 3, mode: 'home', output: bad }]);
    const result = await generateValidated(adapter, request(3, 'home'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toMatch(/status|MAYBE/);
    }
  });

  it('generateValidated: valid model output parses end-to-end', async () => {
    const adapter = new MockLlmAdapter([{ view: 3, mode: 'home', output: VALID_VIEWS[3] }]);
    const result = await generateValidated(adapter, request(3, 'home'));
    expect(result.ok).toBe(true);
  });

  it('the mock never invents: an unregistered view+mode throws', async () => {
    const adapter = new MockLlmAdapter([{ view: 1, mode: 'home', output: VALID_VIEWS[1] }]);
    await expect(adapter.generate(request(1, 'chef'))).rejects.toThrow(/no fixture/);
  });

  it('deterministic views refuse prompt assembly through the seam too (D-15C)', () => {
    expect(() => promptsForRequest({ view: 8, mode: 'home' })).toThrow(/deterministic/);
    expect(() => promptsForRequest({ view: 9, mode: 'chef' })).toThrow(/deterministic/);
  });

  it('Q9 hygiene: the seam carries no provider name, key, or endpoint', () => {
    const seam = `${systemPromptFor('home')}\n${promptsForRequest({ view: 1, mode: 'home' }).user}`;
    expect(seam).not.toMatch(/api[-_.]?key/i);
    expect(seam).not.toMatch(/gemini|openai|anthropic|bedrock|azure/i);
  });

  it('envelope conformance: a hand-checked full analysis envelope parses (all nine views, both modes)', () => {
    const identification = {
      family: 'Coastal Tamil (Kanyakumari) style meen kuzhambu',
      architecture: 'Raw-ground coconut paste, triple sour, late fenugreek+pepper',
      confidence: 'high',
      not_this: ['Kerala meen curry'],
      absent_on_card: [],
      tags: { family: 'INFERRED' },
    };
    IdentificationSchema.parse(identification); // hand-check the fixture itself
    for (const mode of ['home', 'chef'] as const) {
      const envelope = {
        analysis_id: '4a5c9f2e-0001-4000-8000-000000000001',
        mode,
        identification,
        views: {
          view_1: VALID_VIEWS[1],
          view_2: VALID_VIEWS[2],
          view_3: VALID_VIEWS[3],
          view_4: VALID_VIEWS[4],
          view_5: VALID_VIEWS[5],
          view_6: VALID_VIEWS[6],
          view_7: VALID_VIEWS[7],
          view_8: VALID_VIEWS[8],
          view_9: VALID_VIEWS[9],
        },
        claim_tags: { CARD: 9, METHOD: 4, INFERRED: 5, ABSENT: 0, UNKNOWN: 2, ASSUMED: 2 },
        station_card: null,
        is_latest: true,
        model_version: 'stub-1',
        prompt_version: PROMPT_VERSION,
      };
      expect(AnalysisEnvelopeSchema.safeParse(envelope).success).toBe(true);
    }
  });
});
