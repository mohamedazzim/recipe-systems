import { OCR_ADAPTER_SEAM, resolveOcrAdapter, OcrProviderError, OcrTimeoutError } from './index';
import { GOLDEN_OCR_LINES, StubOcrAdapter } from './stub';
import { GeminiVisionOcrAdapter } from './gemini';
import {
  normalizePaddleResponse,
  PaddleOcrAdapter,
  paddleEndpoint,
  paddleModel,
  paddleTimeoutMs,
  paddleVersion,
} from './paddle';

describe('ocr-adapter (D-11)', () => {
  it('exposes the provider-neutral seam note (Q10 stays OPEN)', () => {
    expect(OCR_ADAPTER_SEAM).toMatch(/provider-neutral/);
  });

  it('resolveOcrAdapter: disabled/unset → null; stub → StubOcrAdapter; paddle → PaddleOcrAdapter; gemini → GeminiVisionOcrAdapter', () => {
    expect(resolveOcrAdapter({})).toBeNull();
    expect(resolveOcrAdapter({ OCR_PROVIDER: 'disabled' })).toBeNull();
    expect(resolveOcrAdapter({ OCR_PROVIDER: 'stub' })).toBeInstanceOf(StubOcrAdapter);
    expect(resolveOcrAdapter({ OCR_PROVIDER: 'paddle' })).toBeInstanceOf(PaddleOcrAdapter);
    expect(resolveOcrAdapter({ OCR_PROVIDER: 'gemini' })).toBeInstanceOf(GeminiVisionOcrAdapter);
  });

  describe('StubOcrAdapter (CI deterministic)', () => {
    it('returns the golden card lines: both fenugreeks distinct, no garlic, drumstick/mango/coconut present', async () => {
      const stub = new StubOcrAdapter();
      const result = await stub.recognize(new Uint8Array([1]), 'image/jpeg');
      const texts = result.lines.map((l) => l.text);
      expect(texts.some((t) => /fenugreek powder/i.test(t))).toBe(true);
      expect(texts.some((t) => /fenugreek - 1\/4/i.test(t))).toBe(true);
      expect(texts.some((t) => /garlic/i.test(t))).toBe(false);
      expect(texts.some((t) => /drumstick/i.test(t))).toBe(true);
      expect(texts.some((t) => /mango/i.test(t))).toBe(true);
      expect(texts.some((t) => /coconut/i.test(t))).toBe(true);
    });

    it('includes exactly one low-confidence line (INV-04 exercise)', () => {
      const low = GOLDEN_OCR_LINES.filter((l) => (l.confidence ?? 1) < 0.9);
      expect(low).toHaveLength(1);
      expect(low[0].text).toMatch(/fenugreek powder/i);
    });
  });

  describe('normalizePaddleResponse (vendor shape never leaks)', () => {
    it('normalizes the v2 shape [box, [text, confidence]]', () => {
      const json = { result: [[[[0, 0], [1, 0], [1, 1], [0, 1]], ['Fish - 500g', 0.98]]] };
      const r = normalizePaddleResponse(json, 'PP-OCRv4', 'paddleocr-3.x');
      expect(r.lines).toEqual([{ text: 'Fish - 500g', confidence: 0.98 }]);
      expect(r.recognized_text).toBe('Fish - 500g');
      expect(r.source_metadata).toEqual({ provider: 'paddle', model: 'PP-OCRv4', version: 'paddleocr-3.x' });
    });

    it('normalizes the flattened v3 shape [box, text, confidence]', () => {
      const json = { result: [[[[0, 0], [1, 0], [1, 1], [0, 1]], 'Drumstick - 1 Nos', 0.91]] };
      const r = normalizePaddleResponse(json, 'PP-OCRv4', 'paddleocr-3.x');
      expect(r.lines).toEqual([{ text: 'Drumstick - 1 Nos', confidence: 0.91 }]);
    });

    it('normalizes the object shape { rec_text, rec_score }', () => {
      const json = { result: [{ rec_text: 'Mango - 1/2 Nos', rec_score: 0.87 }] };
      const r = normalizePaddleResponse(json, 'PP-OCRv4', 'paddleocr-3.x');
      expect(r.lines).toEqual([{ text: 'Mango - 1/2 Nos', confidence: 0.87 }]);
    });

    it('a non-array result throws OcrProviderError; an empty array is a valid empty result (unreadable, not a failure)', () => {
      expect(() => normalizePaddleResponse({ result: 'nope' }, 'm', 'v')).toThrow(OcrProviderError);
      const empty = normalizePaddleResponse({ result: [] }, 'm', 'v');
      expect(empty.lines).toEqual([]);
      expect(empty.recognized_text).toBe('');
    });
  });

  describe('PaddleOcrAdapter.recognize (mocked fetch)', () => {
    const originalFetch = globalThis.fetch;
    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('POSTs base64 bytes and normalizes the response', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ result: [[[[0, 0], [1, 0], [1, 1], [0, 1]], 'Tamarind - A Lemon Size', 0.88]] }),
      }) as never;
      const adapter = new PaddleOcrAdapter({});
      const result = await adapter.recognize(new Uint8Array([9, 8, 7]), 'image/jpeg');
      expect(result.lines[0]).toEqual({ text: 'Tamarind - A Lemon Size', confidence: 0.88 });
      const call = (globalThis.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
      expect(call[0]).toContain('/predict/ocr_system');
      expect((call[1].body as string)).toContain('CQgH'); // base64 of [9,8,7]
    });

    it('surfaces a non-200 as OcrProviderError (retryable)', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'boom',
      }) as never;
      const adapter = new PaddleOcrAdapter({});
      await expect(adapter.recognize(new Uint8Array([1]), 'image/jpeg')).rejects.toBeInstanceOf(OcrProviderError);
    });

    it('surfaces a fetch rejection as OcrProviderError (provider unavailable)', async () => {
      globalThis.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as never;
      const adapter = new PaddleOcrAdapter({});
      await expect(adapter.recognize(new Uint8Array([1]), 'image/jpeg')).rejects.toBeInstanceOf(OcrProviderError);
    });

    it('surfaces an abort as OcrTimeoutError (QG4 timeout cell)', async () => {
      const abort = new Error('aborted');
      abort.name = 'AbortError';
      globalThis.fetch = jest.fn().mockRejectedValue(abort) as never;
      const adapter = new PaddleOcrAdapter({});
      await expect(adapter.recognize(new Uint8Array([1]), 'image/jpeg')).rejects.toBeInstanceOf(OcrTimeoutError);
    });

    it('honors env configuration (endpoint/model/version/timeout)', () => {
      expect(paddleEndpoint({})).toBe('http://localhost:8866/predict/ocr_system');
      expect(paddleEndpoint({ OCR_PADDLE_ENDPOINT: 'http://x:1/p' })).toBe('http://x:1/p');
      expect(paddleModel({})).toBe('PP-OCRv4');
      expect(paddleVersion({})).toBe('paddleocr-3.x');
      expect(paddleTimeoutMs({})).toBe(30000);
      expect(paddleTimeoutMs({ OCR_PADDLE_TIMEOUT_MS: '5000' })).toBe(5000);
    });
  });
});
