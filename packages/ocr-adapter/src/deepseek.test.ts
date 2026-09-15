import {
  DeepSeekVisionOcrAdapter,
  DEEPSEEK_OCR_PROMPT,
  deepseekBaseUrl,
  deepseekMaxRetries,
  deepseekModel,
  deepseekOcrMaxTokens,
  deepseekOcrMaxTokensCap,
  deepseekTimeoutMs,
  normalizeDeepSeekResponse,
} from './deepseek';
import { OcrProviderError, OcrTimeoutError } from './errors';
import { resolveOcrAdapter } from './index';

describe('DeepSeekVisionOcrAdapter (Q10 second provider)', () => {
  describe('env configuration', () => {
    it('defaults and overrides', () => {
      expect(deepseekModel({})).toBe('deepseek-flash');
      expect(deepseekModel({ DEEPSEEK_MODEL: 'deepseek-v4-pro' })).toBe('deepseek-v4-pro');
      expect(deepseekBaseUrl({})).toBe('https://api.deepseek.com');
      expect(deepseekBaseUrl({ DEEPSEEK_BASE_URL: 'https://api.example.com/' })).toBe('https://api.example.com');
      expect(deepseekTimeoutMs({})).toBe(120000);
      expect(deepseekTimeoutMs({ DEEPSEEK_TIMEOUT_MS: '5000' })).toBe(5000);
      expect(deepseekMaxRetries({})).toBe(2);
      expect(deepseekMaxRetries({ DEEPSEEK_MAX_RETRIES: '0' })).toBe(0);
      // The reasoning model needs headroom for reasoning_content + content.
      expect(deepseekOcrMaxTokens({})).toBe(8192);
      expect(deepseekOcrMaxTokens({ DEEPSEEK_OCR_MAX_TOKENS: '4096' })).toBe(4096);
      expect(deepseekOcrMaxTokensCap({})).toBe(32768);
    });

    it('resolveOcrAdapter picks DeepSeekVisionOcrAdapter for OCR_PROVIDER=deepseek', () => {
      expect(resolveOcrAdapter({ OCR_PROVIDER: 'deepseek' })).toBeInstanceOf(DeepSeekVisionOcrAdapter);
    });
  });

  describe('normalizeDeepSeekResponse', () => {
    it('splits plain lines, strips markdown bullets/numbering/code fences, and never invents confidence', () => {
      const text = [
        '```',
        '- Fish - 500g',
        '2. Drumstick - 1',
        '*Fenugreek Seeds - 1/4 tsp',
        'Plain line',
        '```',
        '',
      ].join('\n');
      const result = normalizeDeepSeekResponse(text, 'deepseek-flash');
      expect(result.lines.map((l) => l.text)).toEqual([
        'Fish - 500g',
        'Drumstick - 1',
        'Fenugreek Seeds - 1/4 tsp',
        'Plain line',
      ]);
      expect(result.lines.every((l) => l.confidence === undefined)).toBe(true);
      expect(result.recognized_text).toContain('Fish - 500g');
      expect(result.source_metadata).toEqual({ provider: 'deepseek', model: 'deepseek-flash' });
    });

    it('empty text is a valid empty result (unreadable, not a throw)', () => {
      const result = normalizeDeepSeekResponse('  \n  ', 'deepseek-flash');
      expect(result.lines).toEqual([]);
      expect(result.recognized_text).toBe('');
    });
  });

  describe('recognize (mocked fetch)', () => {
    const originalFetch = globalThis.fetch;
    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('throws OcrProviderError when the API key is missing', async () => {
      const adapter = new DeepSeekVisionOcrAdapter({ OCR_PROVIDER: 'deepseek' });
      await expect(adapter.recognize(new Uint8Array([1]), 'image/png')).rejects.toBeInstanceOf(OcrProviderError);
    });

    it('POSTs chat/completions with the transcription prompt + data URI and normalizes content only', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: 'Fish - 500g\nFenugreek Seeds - 1/4 tsp', reasoning_content: 'ignored' } }],
        }),
      }) as never;
      const adapter = new DeepSeekVisionOcrAdapter({ DEEPSEEK_API_KEY: 'sk-test' });
      const result = await adapter.recognize(new Uint8Array([9, 8, 7]), 'image/png');
      expect(result.lines.map((l) => l.text)).toEqual(['Fish - 500g', 'Fenugreek Seeds - 1/4 tsp']);
      expect(result.lines.every((l) => l.confidence === undefined)).toBe(true);
      const call = (globalThis.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
      expect(call[0]).toBe('https://api.deepseek.com/chat/completions');
      const body = JSON.parse(call[1].body as string);
      expect(body.model).toBe('deepseek-flash');
      expect(body.messages[0].content[0].text).toContain('Transcribe EXACTLY');
      expect(body.messages[0].content[1].image_url.url).toBe(`data:image/png;base64,${Buffer.from([9, 8, 7]).toString('base64')}`);
      expect(body.max_tokens).toBe(8192);
      expect(body.temperature).toBe(0);
      // reasoning_content is NEVER used as the transcription.
      expect(result.recognized_text).not.toContain('ignored');
    });

    it('maps 401/403/400 to OcrProviderError', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 }) as never;
      const adapter = new DeepSeekVisionOcrAdapter({ DEEPSEEK_API_KEY: 'sk-test' });
      await expect(adapter.recognize(new Uint8Array([1]), 'image/png')).rejects.toBeInstanceOf(OcrProviderError);
    });

    it('maps an abort to OcrTimeoutError (QG4 cell)', async () => {
      const abort = new Error('aborted');
      abort.name = 'AbortError';
      globalThis.fetch = jest.fn().mockRejectedValue(abort) as never;
      const adapter = new DeepSeekVisionOcrAdapter({ DEEPSEEK_API_KEY: 'sk-test', DEEPSEEK_MAX_RETRIES: '0' });
      await expect(adapter.recognize(new Uint8Array([1]), 'image/png')).rejects.toBeInstanceOf(OcrTimeoutError);
    });

    it('retries with a doubled max_tokens when reasoning exhausted the budget (empty content)', async () => {
      // First attempt: empty content + non-empty reasoning (finish_reason=length).
      // Second attempt: full transcription.
      globalThis.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: '', reasoning_content: 'thinking…' } }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: 'Fish - 500g', reasoning_content: '' } }] }),
        }) as never;
      const adapter = new DeepSeekVisionOcrAdapter({ DEEPSEEK_API_KEY: 'sk-test', DEEPSEEK_MAX_RETRIES: '2' });
      const result = await adapter.recognize(new Uint8Array([1]), 'image/png');
      expect(result.lines.map((l) => l.text)).toEqual(['Fish - 500g']);
      const calls = (globalThis.fetch as jest.Mock).mock.calls as [string, RequestInit][];
      expect(calls).toHaveLength(2);
      expect(JSON.parse(calls[0][1].body as string).max_tokens).toBe(8192);
      expect(JSON.parse(calls[1][1].body as string).max_tokens).toBe(16384);
    });

    it('empty content with NO reasoning is a valid unreadable result (no retry)', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: '', reasoning_content: '' } }] }),
      }) as never;
      const adapter = new DeepSeekVisionOcrAdapter({ DEEPSEEK_API_KEY: 'sk-test', DEEPSEEK_MAX_RETRIES: '2' });
      const result = await adapter.recognize(new Uint8Array([1]), 'image/png');
      expect(result.lines).toEqual([]);
      expect((globalThis.fetch as jest.Mock).mock.calls).toHaveLength(1);
    });
  });
});

describe('DEEPSEEK_OCR_PROMPT (transcription contract)', () => {
  it('forbids inference/correction and preserves fenugreek distinctions', () => {
    expect(DEEPSEEK_OCR_PROMPT).toContain('Fenugreek Seeds');
    expect(DEEPSEEK_OCR_PROMPT).toContain('Fenugreek Powder');
    expect(DEEPSEEK_OCR_PROMPT).toMatch(/Do NOT correct handwriting/);
    expect(DEEPSEEK_OCR_PROMPT).toMatch(/Do NOT .*infer missing ingredients/);
    expect(DEEPSEEK_OCR_PROMPT).toContain('[unreadable]');
  });
});
