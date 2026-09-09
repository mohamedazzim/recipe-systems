// D-17 (P3-3): Q9-honest adapter resolution. NO provider is selected here —
// the worker stays provider-neutral through the D-15 seam (Tech Stack §10).
// - ANALYSIS_LLM_STUB=1 → the deterministic fixture adapter (dev/demo only, for
//   the golden card — labeled; never production).
// - default → ProviderPendingError: jobs fail cleanly as `failed` (never stuck
//   at `generating`) until Q9 lands a real provider adapter.

import { LlmAdapter, LlmGenerateRequest, MockLlmAdapter } from '@recipe-systems/llm-adapter';

export class ProviderPendingError extends Error {
  constructor() {
    super('no LLM provider configured — Q9 OPEN (benchmark wks 1–4; adapter stub only)');
    this.name = 'ProviderPendingError';
  }
}

class PendingAdapter implements LlmAdapter {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async generate(_request: LlmGenerateRequest): Promise<unknown> {
    throw new ProviderPendingError();
  }
}

// Minimal golden-card fixtures for the dev/demo stub (views 1–7, home+chef share
// the same payloads here — the mode separation contract is proven in llm-adapter).
const STUB_VIEW_1 = {
  items: [
    {
      ingredient_id: 'fish_500g',
      job: 'Protein, fat, reason for the sour',
      if_omitted: 'Not this dish',
      tag: 'CARD',
    },
  ],
  role_groups: [{ role: 'Body / richness', ingredient_ids: ['fish_500g'] }],
};
const STUB_VIEW_2 = {
  pillars: [
    {
      pillar: 'Sour',
      source_ingredient_ids: ['tamarind_lemon_size'],
      if_missing: 'Heavy, oily, flat',
      tag: 'CARD',
    },
  ],
  blind_spot_notes: [],
};
const STUB_VIEW_3 = {
  status: 'COMPLETE',
  stages: [
    {
      stage_name: 'Load and heat',
      action: 'Add fish, cover; boil then reduce to medium',
      cue: 'Fish opaque and just flaking',
      duration: 'UNKNOWN',
      tag: 'METHOD',
    },
  ],
  incomplete_reason: null,
};
const STUB_VIEW_4 = {
  substitutions: [
    {
      ingredient_id: 'coconut_half_shell',
      substitute: 'Coconut milk (reduced quantity)',
      consequence: 'Thinner body; still holds structurally since tamarind is kept',
      tag: 'INFERRED',
    },
  ],
};
const STUB_VIEW_5 = {
  family: 'Coastal Tamil (Kanyakumari) style meen kuzhambu',
  architecture: 'Raw-ground coconut paste, triple sour, late fenugreek+pepper',
  confidence: 'high',
  not_this: [
    { variant: 'Kerala meen curry', key_difference: 'Kudampuli instead of tamarind/mango' },
  ],
  needs_review: true,
  tag: 'INFERRED',
};
const STUB_VIEW_6 = {
  ratios: [{ components: 'chilli powder : coriander', ratio: '2 tsp : 1 tsp', structural: true, tag: 'CARD' }],
  unresolvable: [{ components: 'salt : liquid', reason: 'salt quantity is null', tag: 'UNKNOWN' }],
};
const STUB_VIEW_7 = {
  status: 'COMPLETE',
  memorable_elements: [
    {
      element: 'Late fenugreek+pepper finish',
      grounded_in: 'Process stage finish aroma, per View 3',
      tag: 'INFERRED',
    },
  ],
};

const STUB_VIEWS: Record<number, unknown> = {
  1: STUB_VIEW_1,
  2: STUB_VIEW_2,
  3: STUB_VIEW_3,
  4: STUB_VIEW_4,
  5: STUB_VIEW_5,
  6: STUB_VIEW_6,
  7: STUB_VIEW_7,
};

export function resolveAdapter(env: Record<string, string | undefined>): LlmAdapter {
  if (env.ANALYSIS_LLM_STUB === '1') {
    const fixtures = [1, 2, 3, 4, 5, 6, 7].flatMap((view) =>
      (['home', 'chef'] as const).map((mode) => ({
        view: view as 1 | 2 | 3 | 4 | 5 | 6 | 7,
        mode,
        output: STUB_VIEWS[view],
      })),
    );
    return new MockLlmAdapter(fixtures);
  }
  return new PendingAdapter();
}
