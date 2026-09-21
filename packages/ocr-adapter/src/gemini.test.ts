import {
  GeminiVisionOcrAdapter,
  geminiOcrBaseUrl,
  geminiOcrMaxRetries,
  geminiOcrModel,
  geminiOcrTimeoutMs,
  normalizeGeminiResponse,
} from './gemini';
import { OcrProviderError, OcrTimeoutError } from './errors';
import { resolveOcrAdapter } from './index';

describe('GeminiVisionOcrAdapter (Q10 third provider)', () => {
  describe('env configuration', () => {
    it('defaults and overrides', () => {
      expect(geminiOcrModel({})).toBe('gemini-3.8-flash');
      expect(geminiOcrModel({ GEMINI_MODEL: 'gemini-2.5-flash' })).toBe('gemini-2.5-flash');
      expect(geminiOcrBaseUrl({})).toBe('https://generativelanguage.googleapis.com');
      expect(geminiOcrBaseUrl({ GEMINI_BASE_URL: 'https://proxy.example.com/' })).toBe(
        'https://proxy.example.com',
      );
      expect(geminiOcrTimeoutMs({})).toBe(120000);
      expect(geminiOcrTimeoutMs({ GEMINI_TIMEOUT_MS: '5000' })).toBe(5000);
      expect(geminiOcrMaxRetries({})).toBe(2);
      expect(geminiOcrMaxRetries({ GEMINI_MAX_RETRIES: '0' })).toBe(0);
    });

    it('resolveOcrAdapter picks GeminiVisionOcrAdapter for OCR_PROVIDER=gemini', () => {
      expect(resolveOcrAdapter({ OCR_PROVIDER: 'gemini' })).toBeInstanceOf(
        GeminiVisionOcrAdapter,
      );
    });
  });

  describe('normalizeGeminiResponse', () => {
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
      const result = normalizeGeminiResponse(text, 'gemini-3.8-flash');
      expect(result.lines.map((l) => l.text)).toEqual([
        'Fish - 500g',
        'Drumstick - 1',
        'Fenugreek Seeds - 1/4 tsp',
        'Plain line',
      ]);
      expect(result.lines.every((l) => l.confidence === undefined)).toBe(true);
      expect(result.recognized_text).toContain('Fish - 500g');
      expect(result.source_metadata).toEqual({ provider: 'gemini', model: 'gemini-3.8-flash' });
    });

    it('empty text is a valid empty result (unreadable, not a throw)', () => {
      const result = normalizeGeminiResponse('  \n  ', 'gemini-3.8-flash');
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
      const adapter = new GeminiVisionOcrAdapter({ OCR_PROVIDER: 'gemini' });
      await expect(adapter.recognize(new Uint8Array([1]), 'image/png')).rejects.toBeInstanceOf(
        OcrProviderError,
      );
    });

    it('POSTs :generateContent with the transcription prompt + inline image and normalizes visible text only', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  { text: 'Fish - 500g\nFenugreek Seeds - 1/4 tsp' },
                  { text: 'ignored thought', thought: true },
                ],
              },
            },
          ],
        }),
      }) as never;
      const adapter = new GeminiVisionOcrAdapter({ GEMINI_API_KEY: 'test-key' });
      const result = await adapter.recognize(new Uint8Array([9, 8, 7]), 'image/png');
      expect(result.lines.map((l) => l.text)).toEqual(['Fish - 500g', 'Fenugreek Seeds - 1/4 tsp']);
      expect(result.lines.every((l) => l.confidence === undefined)).toBe(true);
      const call = (globalThis.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
      expect(call[0]).toBe(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
      );
      const headers = call[1].headers as Record<string, string>;
      expect(headers['x-goog-api-key']).toBe('test-key');
      const body = JSON.parse(call[1].body as string);
      expect(body.contents[0].parts[0].text).toContain('Transcribe EXACTLY');
      expect(body.contents[0].parts[1].inlineData).toEqual({
        mimeType: 'image/png',
        data: Buffer.from([9, 8, 7]).toString('base64'),
      });
      expect(body.generationConfig.temperature).toBe(0);
      // Thought parts are NEVER treated as the transcription.
      expect(result.recognized_text).not.toContain('ignored thought');
    });

    it('maps 401/403/400 to OcrProviderError', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 }) as never;
      const adapter = new GeminiVisionOcrAdapter({ GEMINI_API_KEY: 'test-key' });
      await expect(adapter.recognize(new Uint8Array([1]), 'image/png')).rejects.toBeInstanceOf(
        OcrProviderError,
      );
    });

    it('maps a provider-policy block to OcrProviderError (no retry)', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ promptFeedback: { blockReason: 'IMAGE_SAFETY' } }),
      }) as never;
      const adapter = new GeminiVisionOcrAdapter({
        GEMINI_API_KEY: 'test-key',
        GEMINI_MAX_RETRIES: '3',
      });
      await expect(adapter.recognize(new Uint8Array([1]), 'image/png')).rejects.toBeInstanceOf(
        OcrProviderError,
      );
      expect((globalThis.fetch as jest.Mock).mock.calls).toHaveLength(1);
    });

    it('maps an abort to OcrTimeoutError (QG4 cell)', async () => {
      const abort = new Error('aborted');
      abort.name = 'AbortError';
      globalThis.fetch = jest.fn().mockRejectedValue(abort) as never;
      const adapter = new GeminiVisionOcrAdapter({
        GEMINI_API_KEY: 'test-key',
        GEMINI_MAX_RETRIES: '0',
      });
      await expect(adapter.recognize(new Uint8Array([1]), 'image/png')).rejects.toBeInstanceOf(
        OcrTimeoutError,
      );
    });
  });
});
