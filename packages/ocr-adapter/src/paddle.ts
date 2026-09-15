// PaddleOCR adapter — the concrete LOCAL OCR provider behind the provider-neutral
// seam (D-11 decision). The adapter talks to a local PaddleOCR serving process
// (`paddleocr --server`, default http://localhost:8866/predict/ocr_system) and
// normalizes its vendor response into the OcrResult contract — NO PaddleOCR field
// names ever leak into the API/domain (A-11: vendor-shape leak = MAJOR).
//
// Q10 stays OPEN: this is the implementation for this session, not a resolved
// provider decision. The real-card benchmark (provenance-valid photos + manifest)
// must still pass before Q10 can be closed. No credentials are hardcoded.

import { OcrProviderError, OcrTimeoutError } from './errors';
import type { OcrAdapter, OcrLine, OcrResult } from './index';

export const PADDLE_OCR_PROVIDER = 'paddle';

export function paddleEndpoint(env: Record<string, string | undefined>): string {
  return env.OCR_PADDLE_ENDPOINT ?? 'http://localhost:8866/predict/ocr_system';
}

export function paddleTimeoutMs(env: Record<string, string | undefined>): number {
  return Number(env.OCR_PADDLE_TIMEOUT_MS ?? 30_000);
}

/** PaddleOCR model/version documented for the benchmark (config, not a claim). */
export function paddleModel(env: Record<string, string | undefined>): string {
  return env.OCR_PADDLE_MODEL ?? 'PP-OCRv4';
}
export function paddleVersion(env: Record<string, string | undefined>): string {
  return env.OCR_PADDLE_VERSION ?? 'paddleocr-3.x';
}

/** Is `x` a per-line item — `[box, [text, conf]]` (v2) or `[box, text, conf]` (v3)? */
function isItem(x: unknown): boolean {
  if (!Array.isArray(x)) return false;
  const second = x[1];
  if (Array.isArray(second)) return typeof second[0] === 'string';
  return typeof second === 'string';
}

/**
 * Normalize PaddleOCR's serving response into the OcrResult contract. Handles the
 * common shapes (documented; the exact vendor shape is re-verified at the Q10
 * real-card benchmark):
 *  - v2 `ocr()` item list:  `result = [ [box, [text, confidence]], ... ]`
 *  - flattened v3:          `result = [ [box, text, confidence], ... ]`
 *  - object list:           `result = [ { rec_text, rec_score }, ... ]`
 *  - single-page serving:   `result = [ [items...] ]`
 * Malformed output → OcrProviderError (never a half-normalized result).
 */
export function normalizePaddleResponse(json: unknown, model: string, version: string): OcrResult {
  const root = json as { result?: unknown; results?: unknown[] } | null;
  const candidate: unknown = root?.result ?? root?.results?.[0] ?? root;
  if (!Array.isArray(candidate)) {
    throw new OcrProviderError('malformed PaddleOCR response (no result array)');
  }
  let list: unknown[] = candidate;
  // Unwrap a single-page wrapper (`result = [ [items...] ]`) — the page's first
  // element is an item, and the page itself is not an item.
  if (list.length === 1 && Array.isArray(list[0]) && !isItem(list[0]) && isItem(list[0][0])) {
    list = list[0] as unknown[];
  }

  const lines: OcrLine[] = [];
  for (const item of list as unknown[]) {
    if (Array.isArray(item)) {
      const second = item[1];
      if (Array.isArray(second)) {
        // v2: [box, [text, confidence]]
        if (typeof second[0] === 'string' && second[0].trim().length > 0) {
          lines.push({ text: second[0].trim(), confidence: typeof second[1] === 'number' ? second[1] : undefined });
        }
      } else if (typeof second === 'string' && second.trim().length > 0) {
        // flattened v3: [box, text, confidence]
        lines.push({ text: second.trim(), confidence: typeof item[2] === 'number' ? item[2] : undefined });
      }
    } else if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      const text = typeof obj.rec_text === 'string' ? obj.rec_text : typeof obj.text === 'string' ? obj.text : null;
      if (typeof text === 'string' && text.trim().length > 0) {
        const score = typeof obj.rec_score === 'number' ? obj.rec_score : typeof obj.confidence === 'number' ? obj.confidence : undefined;
        lines.push({ text: text.trim(), confidence: score });
      }
    }
  }

  if (lines.length === 0) {
    // A readable result with no text is a VALID provider outcome (blank/unreadable
    // card), NOT a provider failure — the intake maps it to OCR_UNREADABLE (422).
    return { recognized_text: '', lines: [], source_metadata: { provider: PADDLE_OCR_PROVIDER, model, version } };
  }

  return {
    recognized_text: lines.map((l) => l.text).join('\n'),
    lines,
    source_metadata: { provider: PADDLE_OCR_PROVIDER, model, version },
  };
}

export class PaddleOcrAdapter implements OcrAdapter {
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly model: string;
  private readonly version: string;

  constructor(env: Record<string, string | undefined>) {
    this.endpoint = paddleEndpoint(env);
    this.timeoutMs = paddleTimeoutMs(env);
    this.model = paddleModel(env);
    this.version = paddleVersion(env);
  }

  async recognize(image: Uint8Array, _contentType: string): Promise<OcrResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const body = JSON.stringify({
        images: [Buffer.from(image).toString('base64')],
      });
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new OcrProviderError(`PaddleOCR HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }
      const json = await res.json();
      return normalizePaddleResponse(json, this.model, this.version);
    } catch (err) {
      if (err instanceof OcrProviderError) throw err;
      if (err instanceof Error && err.name === 'AbortError') {
        throw new OcrTimeoutError(`PaddleOCR timed out after ${this.timeoutMs}ms`);
      }
      throw new OcrProviderError('PaddleOCR unavailable', err);
    } finally {
      clearTimeout(timer);
    }
  }
}
