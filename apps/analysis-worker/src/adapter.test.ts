// D-17 (P3-3): adapter resolution tests — the Q9-honest seam. No provider is
// selected; the env knob only toggles the dev/demo fixture adapter.

import { ProviderPendingError, resolveAdapter } from './adapter';

const REQ = {
  view: 1 as const,
  mode: 'home' as const,
  recipe_snapshot: {
    ingredients: [],
    method_steps: [],
    method_source: { name: null, type: null, matched: false },
    explicitly_absent: [],
    card_metadata: { photographed: false, legible_issues: [] },
  },
  prompt_version: 'v2',
  model_version: 'stub-no-provider-q9',
};

describe('worker adapter resolution (Q9 OPEN)', () => {
  it('default (no env): pending adapter throws the labeled ProviderPendingError', async () => {
    const adapter = resolveAdapter({});
    await expect(adapter.generate(REQ)).rejects.toBeInstanceOf(ProviderPendingError);
    await expect(adapter.generate(REQ)).rejects.toThrow(/Q9 OPEN/);
  });

  it('ANALYSIS_LLM_STUB=1: the deterministic fixture adapter answers from its fixtures', async () => {
    const adapter = resolveAdapter({ ANALYSIS_LLM_STUB: '1' });
    const out = await adapter.generate({ ...REQ, view: 5 });
    expect(out).toBeDefined();
    expect(typeof out).toBe('object');
  });
});