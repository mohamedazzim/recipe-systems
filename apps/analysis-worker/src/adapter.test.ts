// D-17 (P3-3): adapter resolution tests — the Q9-honest seam. No provider is
// selected; the env knob only toggles the dev/demo stub adapter. D-18 extended
// the stub to build view payloads from the CAPTURED ingredient ids (so the
// D-16 grounding gate validates them against the same captured state) — every
// view branch is locked here.

import { ProviderPendingError, resolveAdapter } from './adapter';

const ING = [
  { id: 'line-1', display_name: 'Fish 500g', canonical_name: null, amount_text: '500g',
    quantity: 500, unit: 'g', confirmed_sense: null, category: null, food_id: null,
    include_on_list: true },
  { id: 'line-2', display_name: 'Fenugreek ½ tsp', canonical_name: null, amount_text: '½ tsp',
    quantity: 0.5, unit: 'tsp', confirmed_sense: null, category: null, food_id: null,
    include_on_list: true },
];

function req(view: number) {
  return {
    view: view as 1 | 2 | 3 | 4 | 5 | 6 | 7,
    mode: 'home' as const,
    recipe_snapshot: {
      structured_recipe: {
        ingredients: ING,
        method_steps: [{ id: 'method-1', text: 'Simmer', source: 'METHOD' }],
        method_source: { name: 'CDK 1669 / Mrs. Anitha', type: 'INFERRED', matched: false },
        explicitly_absent: [],
        card_metadata: { photographed: false, legible_issues: [] },
      },
    },
    prompt_version: 'v2',
    model_version: 'stub-no-provider-q9',
  };
}

describe('worker adapter resolution (Q9 RESOLVED — gemini + deepseek branches)', () => {
  it('default (no env): pending adapter throws the labeled ProviderPendingError', async () => {
    const adapter = resolveAdapter({});
    await expect(adapter.generate(req(1))).rejects.toBeInstanceOf(ProviderPendingError);
    await expect(adapter.generate(req(1))).rejects.toThrow(/MODEL_PROVIDER/);
  });

  it('Q9 provider switch: MODEL_PROVIDER=gemini selects the Gemini adapter (observable, no secrets)', () => {
    const adapter = resolveAdapter({
      MODEL_PROVIDER: 'gemini',
      GEMINI_API_KEY: 'AIza-test-not-real',
      GEMINI_MODEL: 'gemini-3.8-flash',
      GEMINI_THINKING_LEVEL: 'low',
    });
    expect(adapter.providerName).toBe('gemini');
    expect(adapter.modelVersion).toBe('gemini:gemini-3.8-flash');
    expect((adapter as unknown as { describe(): string }).describe()).toBe(
      'gemini:gemini-3.8-flash (thinking low) @ https://generativelanguage.googleapis.com',
    );
  });

  it('Q9 provider switch: GEMINI_THINKING_LEVEL is case-insensitive and enum-validated', () => {
    const upper = resolveAdapter({
      MODEL_PROVIDER: 'gemini',
      GEMINI_API_KEY: 'AIza-test-not-real',
      GEMINI_MODEL: 'gemini-3.8-flash',
      GEMINI_THINKING_LEVEL: 'MEDIUM',
    });
    expect((upper as unknown as { describe(): string }).describe()).toContain('(thinking medium)');

    const invalid = resolveAdapter({
      MODEL_PROVIDER: 'gemini',
      GEMINI_API_KEY: 'AIza-test-not-real',
      GEMINI_MODEL: 'gemini-3.8-flash',
      GEMINI_THINKING_LEVEL: 'ultra',
    });
    // Unknown levels are dropped, not guessed — provider default applies.
    expect((invalid as unknown as { describe(): string }).describe()).toBe(
      'gemini:gemini-3.8-flash @ https://generativelanguage.googleapis.com',
    );
  });

  it('Q9 provider switch: MODEL_PROVIDER wins over the legacy LLM_PROVIDER value', () => {
    const adapter = resolveAdapter({
      MODEL_PROVIDER: 'gemini',
      LLM_PROVIDER: 'deepseek',
      GEMINI_API_KEY: 'AIza-test-not-real',
      GEMINI_MODEL: 'gemini-3.8-flash',
    });
    expect(adapter.providerName).toBe('gemini');
  });

  it('Q9-2: LLM_PROVIDER=deepseek still selects DeepSeek (backward compatibility)', () => {
    const adapter = resolveAdapter({
      LLM_PROVIDER: 'deepseek',
      DEEPSEEK_API_KEY: 'sk-test-not-real',
      DEEPSEEK_MODEL: 'deepseek-v4-pro',
      DEEPSEEK_BASE_URL: 'https://api.deepseek.com',
    });
    expect(adapter.providerName).toBe('deepseek');
    expect(adapter.modelVersion).toBe('deepseek:deepseek-v4-pro');
  });

  it('model-switch verification: DEEPSEEK_REASONING_EFFORT=low forwards the documented passthrough', () => {
    const adapter = resolveAdapter({
      LLM_PROVIDER: 'deepseek',
      DEEPSEEK_API_KEY: 'sk-test-not-real',
      DEEPSEEK_MODEL: 'deepseek-flash',
      DEEPSEEK_BASE_URL: 'https://api.deepseek.com',
      DEEPSEEK_REASONING_EFFORT: 'low',
    });
    expect(adapter.providerName).toBe('deepseek');
    expect(adapter.modelVersion).toBe('deepseek:deepseek-flash');
    expect((adapter as unknown as { describe(): string }).describe()).toBe(
      'deepseek:deepseek-flash (effort low) @ https://api.deepseek.com',
    );
  });

  it('model-switch verification: an unknown effort value is dropped, not guessed', () => {
    const adapter = resolveAdapter({
      LLM_PROVIDER: 'deepseek',
      DEEPSEEK_API_KEY: 'sk-test-not-real',
      DEEPSEEK_MODEL: 'deepseek-flash',
      DEEPSEEK_REASONING_EFFORT: 'ultra',
    });
    expect((adapter as unknown as { describe(): string }).describe()).toBe(
      'deepseek:deepseek-flash @ https://api.deepseek.com',
    );
  });

  it('Q9-2: ANALYSIS_LLM_STUB=1 always forces the deterministic stub (explicit determinism wins)', () => {
    const adapter = resolveAdapter({ ANALYSIS_LLM_STUB: '1', LLM_PROVIDER: 'deepseek' });
    expect(adapter.providerName).toBe('stub');
  });

  it('Q9 provider switch: unknown MODEL_PROVIDER stays on the pending adapter (no silent fallback to a real provider)', () => {
    const adapter = resolveAdapter({ MODEL_PROVIDER: 'something-else' });
    expect(adapter.providerName).toBe('pending');
  });

  const stub = resolveAdapter({ ANALYSIS_LLM_STUB: '1' });

  it('view 1: items + role_groups reference the CAPTURED ingredient ids (groundable)', async () => {
    const out = (await stub.generate(req(1))) as {
      items: { ingredient_id: string; tag: string }[];
      role_groups: { ingredient_ids: string[] }[];
    };
    expect(out.items.map((i) => i.ingredient_id)).toEqual(['line-1', 'line-2']);
    expect(out.items[0].tag).toBe('CARD');
    expect(out.role_groups[0].ingredient_ids).toEqual(['line-1', 'line-2']);
  });

  it('view 2: pillar sources are captured ids; blind-spot notes always present as an array', async () => {
    const out = (await stub.generate(req(2))) as {
      pillars: { source_ingredient_ids: string[] }[]; blind_spot_notes: unknown[];
    };
    expect(out.pillars[0].source_ingredient_ids).toEqual(['line-1', 'line-2']);
    expect(out.blind_spot_notes).toEqual([]);
  });

  it('view 3: one METHOD-tagged stage, UNKNOWN duration (blanked by the UI, never invented)', async () => {
    const out = (await stub.generate(req(3))) as { status: string; stages: unknown[] };
    expect(out.status).toBe('COMPLETE');
    expect(out.stages).toHaveLength(1);
    expect((out.stages[0] as { duration: string }).duration).toBe('UNKNOWN');
    expect((out.stages[0] as { tag: string }).tag).toBe('METHOD');
  });

  it('view 4: substitution targets the first captured id with INFERRED tag', async () => {
    const out = (await stub.generate(req(4))) as {
      substitutions: { ingredient_id: string; tag: string }[];
    };
    expect(out.substitutions[0].ingredient_id).toBe('line-1');
    expect(out.substitutions[0].tag).toBe('INFERRED');
  });

  it('view 5: static identification (no ingredient refs — grounding-neutral)', async () => {
    const out = (await stub.generate(req(5))) as {
      family: string; confidence: string; not_this: unknown[]; tag: string;
    };
    expect(typeof out.family).toBe('string');
    expect(out.confidence).toBe('high');
    expect(out.not_this).toHaveLength(1);
    expect(out.tag).toBe('INFERRED');
  });

  it('view 6: structural ratio + one unresolvable UNKNOWN (expected output, not a bug)', async () => {
    const out = (await stub.generate(req(6))) as { ratios: unknown[]; unresolvable: unknown[] };
    expect(out.ratios).toHaveLength(1);
    expect(out.unresolvable).toHaveLength(1);
    expect((out.unresolvable[0] as { tag: string }).tag).toBe('UNKNOWN');
  });

  it('view 7: memorable element, INFERRED', async () => {
    const out = (await stub.generate(req(7))) as {
      status: string; memorable_elements: { tag: string }[];
    };
    expect(out.status).toBe('COMPLETE');
    expect(out.memorable_elements[0].tag).toBe('INFERRED');
  });

  it('unknown view number: throws (never silently fabricates a view)', async () => {
    await expect(stub.generate(req(8))).rejects.toThrow(/no fixture for view 8/);
  });

  it('empty captured ingredients: views degrade to empty structures (no ids invented)', async () => {
    const empty = {
      ...req(1),
      recipe_snapshot: {
        structured_recipe: {
          ingredients: [],
          method_steps: [],
          method_source: { name: null, type: null, matched: false },
          explicitly_absent: [],
          card_metadata: { photographed: false, legible_issues: [] },
        },
      },
    };
    const out = (await stub.generate(empty)) as { items: unknown[]; role_groups: unknown[] };
    expect(out.items).toEqual([]);
    expect(out.role_groups).toEqual([]);
    const v3 = (await stub.generate({ ...empty, view: 3 })) as { stages: { action: string }[] };
    expect(v3.stages[0].action).toContain('the ingredients');
  });
});
