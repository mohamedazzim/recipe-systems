// Q9 (2026-09-11): DeepSeekLlmAdapter unit tests — mocked HTTP ONLY (no
// network; deterministic; CI-safe). The tests prove:
//   - valid completion → parsed JSON enters the domain unchanged;
//   - malformed/non-JSON output → typed transient failure;
//   - 401/403/400 → LlmPermanentProviderError, NO retry (ADR §14);
//   - 429/5xx → bounded in-adapter retries, then transient (worker retry path);
//   - timeout → transient;
//   - missing key → permanent BEFORE any network call;
//   - prompt composition: ONLY the canonical D-15 pair + the captured
//     structured_recipe JSON (no unrelated data, no secrets in the body);
//   - the downstream gates are NOT bypassed: generateGrounded still parses
//     (D-05) and grounds (D-16) whatever the adapter returns.

import {
  DeepSeekConfig,
  DeepSeekLlmAdapter,
  extractJson,
  generateGrounded,
  LlmPermanentProviderError,
  LlmTransientProviderError,
} from './index';
import { StructuredRecipeInput } from '@recipe-systems/schemas';

const CAPTURED = {
  structured_recipe: {
    ingredients: [
      {
        id: 'line-fish', display_name: 'Fish 500g', canonical_name: null, amount_text: '500g',
        quantity: 500, unit: 'g', confirmed_sense: null, category: null, food_id: null,
        include_on_list: true,
      },
      {
        id: 'line-fen', display_name: 'Fenugreek ½ tsp', canonical_name: null, amount_text: '½ tsp',
        quantity: 0.5, unit: 'tsp', confirmed_sense: null, category: null, food_id: null,
        include_on_list: true,
      },
    ],
    method_steps: [{ id: 'method-1', text: 'Simmer', source: 'METHOD' }],
    method_source: { name: 'CDK 1669 / Mrs. Anitha', type: 'INFERRED', matched: false },
    explicitly_absent: [],
    card_metadata: { photographed: false, legible_issues: [] },
  },
} as unknown as StructuredRecipeInput;

function req(view: 1 | 2 | 3 | 4 | 5 | 6 | 7) {
  return {
    view,
    mode: 'home' as const,
    recipe_snapshot: CAPTURED,
    prompt_version: 'v2',
    model_version: 'deepseek:test',
  };
}

const VIEW1 = {
  items: [
    { ingredient_id: 'line-fish', job: 'Body of the dish', if_omitted: 'No main element', tag: 'CARD' },
  ],
  role_groups: [],
};

function chatResponse(content: string, status = 200) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status });
}

function mockFetch() {
  const fetchMock = jest.fn();
  const original = global.fetch;
  global.fetch = fetchMock as unknown as typeof fetch;
  return { fetchMock, restore: () => { global.fetch = original; } };
}

function adapter(overrides: DeepSeekConfig = {}) {
  return new DeepSeekLlmAdapter({
    apiKey: 'sk-test-not-real',
    model: 'deepseek-v4-pro',
    baseUrl: 'https://api.deepseek.com',
    maxRetries: 0,
    ...overrides,
  });
}

describe('DeepSeekLlmAdapter (Q9)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns parsed JSON for a well-formed completion and never touches the key in the body', async () => {
    const { fetchMock, restore } = mockFetch();
    fetchMock.mockResolvedValue(chatResponse(JSON.stringify(VIEW1)));
    try {
      const out = (await adapter().generate(req(1))) as typeof VIEW1;
      expect(out.items[0].ingredient_id).toBe('line-fish');
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
        messages: Array<{ role: string; content: string }>;
        model: string;
      };
      expect(body.model).toBe('deepseek-v4-pro');
      expect(body.messages[0].content).toContain('structured_recipe');
      expect(body.messages[0].content).toContain('HARD RULES');
      expect(body.messages[1].content).toContain('line-fish'); // captured state only
      expect(body.messages[1].content).toContain('STRUCTURED RECIPE OBJECT');
      expect(JSON.stringify(body)).not.toContain('sk-test-not-real'); // secret never in the body
    } finally {
      restore();
    }
  });

  it('omits thinking fields by default and passes them through when configured (benchmark passthrough)', async () => {
    const { fetchMock, restore } = mockFetch();
    fetchMock.mockImplementation(() => Promise.resolve(chatResponse(JSON.stringify(VIEW1))));
    try {
      await adapter().generate(req(1));
      const plain = JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<string, unknown>;
      expect(plain.thinking).toBeUndefined();
      expect(plain.reasoning_effort).toBeUndefined();

      fetchMock.mockClear();
      await adapter({ thinking: { type: 'enabled' }, reasoningEffort: 'low' }).generate(req(1));
      const configured = JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<string, unknown>;
      expect(configured.thinking).toEqual({ type: 'enabled' });
      expect(configured.reasoning_effort).toBe('low');
      expect(configured.temperature).toBe(0); // unchanged
    } finally {
      restore();
    }
  });

  it('reports token usage to the optional telemetry hook (tokens only — never content)', async () => {
    const { fetchMock, restore } = mockFetch();
    const usage = { prompt_tokens: 1234, completion_tokens: 567, total_tokens: 1801 };
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(VIEW1) } }],
          usage,
        }),
        { status: 200 },
      ),
    );
    const onUsage = jest.fn();
    try {
      const out = await adapter({ onUsage }).generate(req(1));
      expect(out).toBeTruthy();
      expect(onUsage).toHaveBeenCalledTimes(1);
      expect(onUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          view: 1,
          mode: 'home',
          promptTokens: 1234,
          completionTokens: 567,
          totalTokens: 1801,
        }),
      );
      // The hook never receives response content.
      expect(JSON.stringify(onUsage.mock.calls)).not.toContain('line-fish');
    } finally {
      restore();
    }
  });

  it('strips markdown code fences around the JSON', async () => {
    const { fetchMock, restore } = mockFetch();
    fetchMock.mockResolvedValue(chatResponse('```json\n' + JSON.stringify(VIEW1) + '\n```'));
    try {
      const out = (await adapter().generate(req(1))) as typeof VIEW1;
      expect(out.items).toHaveLength(1);
    } finally {
      restore();
    }
  });

  it('no JSON object in the output → transient failure (never published)', async () => {
    const { fetchMock, restore } = mockFetch();
    fetchMock.mockResolvedValue(chatResponse('I cannot produce JSON today.'));
    try {
      await expect(adapter().generate(req(1))).rejects.toBeInstanceOf(LlmTransientProviderError);
    } finally {
      restore();
    }
  });

  it('401/403/400 → LlmPermanentProviderError with NO retry (ADR §14)', async () => {
    const { fetchMock, restore } = mockFetch();
    fetchMock.mockResolvedValue(chatResponse('{}', 401));
    try {
      await expect(adapter({ maxRetries: 2 }).generate(req(1))).rejects.toBeInstanceOf(
        LlmPermanentProviderError,
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
      fetchMock.mockResolvedValue(chatResponse('{}', 400));
      await expect(adapter({ maxRetries: 2 }).generate(req(1))).rejects.toBeInstanceOf(
        LlmPermanentProviderError,
      );
      expect(fetchMock).toHaveBeenCalledTimes(2); // still one call each
    } finally {
      restore();
    }
  });

  it('429 → bounded in-adapter retries, then a transient error (worker retry path applies)', async () => {
    const { fetchMock, restore } = mockFetch();
    fetchMock.mockResolvedValue(chatResponse('{}', 429));
    try {
      await expect(adapter({ maxRetries: 2 }).generate(req(1))).rejects.toBeInstanceOf(
        LlmTransientProviderError,
      );
      expect(fetchMock).toHaveBeenCalledTimes(3); // initial + 2 retries
    } finally {
      restore();
    }
  });

  it('5xx → bounded retries then transient', async () => {
    const { fetchMock, restore } = mockFetch();
    fetchMock.mockResolvedValue(chatResponse('{}', 500));
    try {
      await expect(adapter({ maxRetries: 1 }).generate(req(1))).rejects.toBeInstanceOf(
        LlmTransientProviderError,
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      restore();
    }
  });

  it('timeout → transient (no hang, no retry beyond the configured bound)', async () => {
    const { fetchMock, restore } = mockFetch();
    fetchMock.mockImplementation((_url: string, init: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
        );
      }),
    );
    try {
      await expect(adapter({ timeoutMs: 30, maxRetries: 0 }).generate(req(1))).rejects.toMatchObject({
        name: 'LlmTransientProviderError',
        message: expect.stringContaining('timed out'),
      });
    } finally {
      restore();
    }
  });

  it('missing DEEPSEEK_API_KEY → permanent error BEFORE any network call', async () => {
    const { fetchMock, restore } = mockFetch();
    try {
      await expect(adapter({ apiKey: '' }).generate(req(1))).rejects.toBeInstanceOf(
        LlmPermanentProviderError,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it('describe() exposes provider/model only — never the key', () => {
    expect(adapter().describe()).toBe('deepseek:deepseek-v4-pro @ https://api.deepseek.com');
    expect(adapter().describe()).not.toContain('sk-test');
  });

  it('the downstream gates stay mandatory: generateGrounded parses (D-05) and grounds (D-16) the adapter output', async () => {
    const { fetchMock, restore } = mockFetch();
    try {
      // Groundable output: captured ids only.
      fetchMock.mockResolvedValue(chatResponse(JSON.stringify(VIEW1)));
      const good = await generateGrounded(adapter(), req(1), CAPTURED);
      expect(good.parse.ok).toBe(true);
      expect(good.grounding?.ok).toBe(true);

      // Planted D-16 violation: an INVENTED ingredient id must be rejected.
      const invented = {
        ...VIEW1,
        items: [{ ingredient_id: 'line-ghost', job: 'x', if_omitted: 'y', tag: 'CARD' }],
      };
      fetchMock.mockResolvedValue(chatResponse(JSON.stringify(invented)));
      const bad = await generateGrounded(adapter(), req(1), CAPTURED);
      expect(bad.parse.ok).toBe(true);
      expect(bad.grounding?.ok).toBe(false);
    } finally {
      restore();
    }
  });
});

describe('extractJson (Q9 normalization)', () => {
  it('finds the JSON object span even with surrounding prose', () => {
    expect(extractJson('Here is the result: {"a": 1} thanks')).toEqual({ a: 1 });
  });

  it('rejects text without an object as a transient failure', () => {
    expect(() => extractJson('no braces at all')).toThrow(LlmTransientProviderError);
  });
});
