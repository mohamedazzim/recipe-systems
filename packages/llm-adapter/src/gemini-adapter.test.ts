// Q9 provider switch (2026-09-11): GeminiLlmAdapter unit tests — mocked HTTP
// ONLY (no network; deterministic; CI-safe). The tests prove:
//   - valid completion → parsed JSON enters the domain unchanged;
//   - the official REST request shape: {model}:generateContent with
//     systemInstruction + contents[].parts[].text + x-goog-api-key header;
//   - thinking level forwarded ONLY as
//     generationConfig.thinkingConfig.thinkingLevel (official enum);
//   - malformed/non-JSON output → typed transient failure;
//   - 401/403/400 → LlmPermanentProviderError, NO retry (ADR §14);
//   - prompt block (promptFeedback.blockReason) → permanent (no rephrasing);
//   - 429/5xx → bounded in-adapter retries, then transient (worker retry path);
//   - timeout → transient;
//   - missing key → permanent BEFORE any network call;
//   - thought parts are skipped when visible answer text exists;
//   - the API key never appears in the request body or in any output;
//   - the downstream gates stay mandatory: generateGrounded still parses
//     (D-05) and grounds (D-16) whatever the adapter returns.

import {
  candidateText,
  GeminiConfig,
  GeminiLlmAdapter,
  generateGrounded,
  LlmPermanentProviderError,
  LlmTransientProviderError,
  retryAfterSeconds,
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
    model_version: 'gemini:test',
  };
}

const VIEW1 = {
  items: [
    { ingredient_id: 'line-fish', job: 'Body of the dish', if_omitted: 'No main element', tag: 'CARD' },
  ],
  role_groups: [],
};

function gemResponse(
  text: string,
  status = 200,
  extra: Record<string, unknown> = {},
): Response {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
      ...extra,
    }),
    { status },
  );
}

function mockFetch() {
  const fetchMock = jest.fn();
  const original = global.fetch;
  global.fetch = fetchMock as unknown as typeof fetch;
  return { fetchMock, restore: () => { global.fetch = original; } };
}

function adapter(overrides: GeminiConfig = {}) {
  return new GeminiLlmAdapter({
    apiKey: 'AIza-test-not-real',
    model: 'gemini-3.8-flash',
    baseUrl: 'https://generativelanguage.googleapis.com',
    maxRetries: 0,
    ...overrides,
  });
}

describe('GeminiLlmAdapter (Q9 provider switch)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns parsed JSON for a well-formed completion and sends the official REST shape', async () => {
    const { fetchMock, restore } = mockFetch();
    fetchMock.mockResolvedValue(gemResponse(JSON.stringify(VIEW1)));
    try {
      const out = (await adapter().generate(req(1))) as typeof VIEW1;
      expect(out.items[0].ingredient_id).toBe('line-fish');

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
      expect(url).toBe(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
      );
      expect(init.headers['x-goog-api-key']).toBe('AIza-test-not-real');
      const body = JSON.parse(init.body as string) as {
        contents: Array<{ role: string; parts: Array<{ text: string }> }>;
        systemInstruction: { parts: Array<{ text: string }> };
        generationConfig: Record<string, unknown>;
      };
      expect(body.contents[0].role).toBe('user');
      expect(body.contents[0].parts[0].text).toContain('STRUCTURED RECIPE OBJECT');
      expect(body.contents[0].parts[0].text).toContain('line-fish'); // captured state only
      expect(body.systemInstruction.parts[0].text).toContain('HARD RULES');
      expect(body.generationConfig.temperature).toBe(0);
      // The key rides ONLY in the x-goog-api-key header — never in the body.
      expect(JSON.stringify(body)).not.toContain('AIza-test-not-real');
    } finally {
      restore();
    }
  });

  it('omits thinkingConfig by default and passes the official thinkingLevel through when configured', async () => {
    const { fetchMock, restore } = mockFetch();
    fetchMock.mockImplementation(() => Promise.resolve(gemResponse(JSON.stringify(VIEW1))));
    try {
      await adapter().generate(req(1));
      const plain = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
        generationConfig: Record<string, unknown>;
      };
      expect(plain.generationConfig.thinkingConfig).toBeUndefined();

      fetchMock.mockClear();
      await adapter({ thinkingLevel: 'LOW' }).generate(req(1));
      const configured = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
        generationConfig: { thinkingConfig?: { thinkingLevel?: string }; temperature?: number };
      };
      expect(configured.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'LOW' });
      expect(configured.generationConfig.temperature).toBe(0); // unchanged
    } finally {
      restore();
    }
  });

  it('reports token usage to the optional telemetry hook (tokens only — never content)', async () => {
    const { fetchMock, restore } = mockFetch();
    fetchMock.mockResolvedValue(
      gemResponse(JSON.stringify(VIEW1), 200, {
        usageMetadata: {
          promptTokenCount: 1234,
          candidatesTokenCount: 567,
          thoughtsTokenCount: 890,
          totalTokenCount: 2691,
        },
      }),
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
          thoughtTokens: 890,
          totalTokens: 2691,
        }),
      );
      // The hook never receives response content.
      expect(JSON.stringify(onUsage.mock.calls)).not.toContain('line-fish');
    } finally {
      restore();
    }
  });

  it('skips thought parts when visible answer text exists', async () => {
    const { fetchMock, restore } = mockFetch();
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  { text: 'some internal reasoning', thought: true },
                  { text: JSON.stringify(VIEW1) },
                ],
              },
              finishReason: 'STOP',
            },
          ],
        }),
        { status: 200 },
      ),
    );
    try {
      const out = (await adapter().generate(req(1))) as typeof VIEW1;
      expect(out.items).toHaveLength(1);
    } finally {
      restore();
    }
  });

  it('strips markdown code fences around the JSON', async () => {
    const { fetchMock, restore } = mockFetch();
    fetchMock.mockResolvedValue(gemResponse('```json\n' + JSON.stringify(VIEW1) + '\n```'));
    try {
      const out = (await adapter().generate(req(1))) as typeof VIEW1;
      expect(out.items).toHaveLength(1);
    } finally {
      restore();
    }
  });

  it('no JSON object in the output → transient failure (never published)', async () => {
    const { fetchMock, restore } = mockFetch();
    fetchMock.mockResolvedValue(gemResponse('I cannot produce JSON today.'));
    try {
      await expect(adapter().generate(req(1))).rejects.toBeInstanceOf(LlmTransientProviderError);
    } finally {
      restore();
    }
  });

  it('401/403/400 → LlmPermanentProviderError with NO retry (ADR §14)', async () => {
    const { fetchMock, restore } = mockFetch();
    fetchMock.mockResolvedValue(gemResponse('{}', 401));
    try {
      await expect(adapter({ maxRetries: 2 }).generate(req(1))).rejects.toBeInstanceOf(
        LlmPermanentProviderError,
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
      fetchMock.mockResolvedValue(gemResponse('{}', 400));
      await expect(adapter({ maxRetries: 2 }).generate(req(1))).rejects.toBeInstanceOf(
        LlmPermanentProviderError,
      );
      expect(fetchMock).toHaveBeenCalledTimes(2); // still one call each
    } finally {
      restore();
    }
  });

  it('prompt blocked by policy (promptFeedback.blockReason) → permanent, no retry (never rephrased)', async () => {
    const { fetchMock, restore } = mockFetch();
    // A fresh Response per call: response.json() consumes the body once.
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            promptFeedback: { blockReason: 'SAFETY', safetyRatings: [] },
          }),
          { status: 200 },
        ),
      ),
    );
    try {
      await expect(adapter({ maxRetries: 2 }).generate(req(1))).rejects.toBeInstanceOf(
        LlmPermanentProviderError,
      );
      await expect(adapter({ maxRetries: 2 }).generate(req(1))).rejects.toThrow(/blocked the prompt/);
      expect(fetchMock).toHaveBeenCalledTimes(2); // one call per attempt, zero retries
    } finally {
      restore();
    }
  });

  it('429 → bounded in-adapter retries, then a transient error (worker retry path applies)', async () => {
    const { fetchMock, restore } = mockFetch();
    fetchMock.mockResolvedValue(gemResponse('{}', 429));
    try {
      await expect(adapter({ maxRetries: 2 }).generate(req(1))).rejects.toBeInstanceOf(
        LlmTransientProviderError,
      );
      expect(fetchMock).toHaveBeenCalledTimes(3); // initial + 2 retries
    } finally {
      restore();
    }
  });

  it('429 with Retry-After succeeds once the provider recovers (retry profile, congested-provider live evidence)', async () => {
    const { fetchMock, restore } = mockFetch();
    fetchMock.mockResolvedValueOnce(
      new Response('{"error":{"code":429}}', {
        status: 429,
        headers: { 'retry-after': '0' },
      }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response('{"error":{"code":429}}', {
        status: 429,
        headers: { 'retry-after': '0' },
      }),
    );
    fetchMock.mockResolvedValue(gemResponse(JSON.stringify(VIEW1)));
    try {
      const out = (await adapter({ maxRetries: 2 }).generate(req(1))) as typeof VIEW1;
      expect(out.items[0].ingredient_id).toBe('line-fish');
      expect(fetchMock).toHaveBeenCalledTimes(3); // two 429s, then success
    } finally {
      restore();
    }
  });

  it('503 UNAVAILABLE (provider congestion) → transient, not permanent', async () => {
    const { fetchMock, restore } = mockFetch();
    fetchMock.mockResolvedValue(gemResponse('{}', 503));
    try {
      await expect(adapter({ maxRetries: 0 }).generate(req(1))).rejects.toBeInstanceOf(
        LlmTransientProviderError,
      );
    } finally {
      restore();
    }
  });

  it('5xx → bounded retries then transient', async () => {
    const { fetchMock, restore } = mockFetch();
    fetchMock.mockResolvedValue(gemResponse('{}', 500));
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

  it('missing GEMINI_API_KEY → permanent error BEFORE any network call', async () => {
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

  it('describe() exposes provider/model/level only — never the key', () => {
    expect(adapter().describe()).toBe(
      'gemini:gemini-3.8-flash @ https://generativelanguage.googleapis.com',
    );
    expect(adapter({ thinkingLevel: 'LOW' }).describe()).toBe(
      'gemini:gemini-3.8-flash (thinking low) @ https://generativelanguage.googleapis.com',
    );
    expect(adapter().describe()).not.toContain('AIza-test');
  });

  it('the downstream gates stay mandatory: generateGrounded parses (D-05) and grounds (D-16) the adapter output', async () => {
    const { fetchMock, restore } = mockFetch();
    try {
      // Groundable output: captured ids only.
      fetchMock.mockResolvedValue(gemResponse(JSON.stringify(VIEW1)));
      const good = await generateGrounded(adapter(), req(1), CAPTURED);
      expect(good.parse.ok).toBe(true);
      expect(good.grounding?.ok).toBe(true);

      // Planted D-16 violation: an INVENTED ingredient id must be rejected.
      const invented = {
        ...VIEW1,
        items: [{ ingredient_id: 'line-ghost', job: 'x', if_omitted: 'y', tag: 'CARD' }],
      };
      fetchMock.mockResolvedValue(gemResponse(JSON.stringify(invented)));
      const bad = await generateGrounded(adapter(), req(1), CAPTURED);
      expect(bad.parse.ok).toBe(true);
      expect(bad.grounding?.ok).toBe(false);
    } finally {
      restore();
    }
  });
});

describe('candidateText (Gemini response normalization)', () => {
  it('joins visible text parts and skips thought parts', () => {
    expect(
      candidateText({
        content: {
          parts: [
            { text: 'thinking...', thought: true },
            { text: '{"a":1}' },
          ],
        },
      }),
    ).toBe('{"a":1}');
  });

  it('falls back to thought text only when no visible answer exists', () => {
    expect(candidateText({ content: { parts: [{ text: '{"a":1}', thought: true }] } })).toBe(
      '{"a":1}',
    );
  });

  it('returns empty string for missing/malformed candidates', () => {
    expect(candidateText(undefined)).toBe('');
    expect(candidateText({ content: { parts: [{ text: '' }] } })).toBe('');
  });
});

describe('retryAfterSeconds (Gemini Retry-After parsing)', () => {
  it('parses delta seconds and HTTP dates, rejects garbage', () => {
    expect(retryAfterSeconds('2')).toBe(2);
    expect(retryAfterSeconds('0')).toBe(0);
    expect(retryAfterSeconds(null)).toBeUndefined();
    expect(retryAfterSeconds('')).toBeUndefined();
    expect(retryAfterSeconds('nonsense')).toBeUndefined();
    const future = new Date(Date.now() + 5000).toUTCString();
    const parsed = retryAfterSeconds(future);
    expect(parsed).toBeGreaterThan(4);
    expect(parsed).toBeLessThanOrEqual(5);
  });
});
