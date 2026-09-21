// Provider-neutral OCR adapter — Tech Stack §11.
// Contract: recognized text, line/word information, confidence, source metadata (Tech Stack §11).
// Confidence flows into the ERD OCR fields; if a provider exposes no reliable confidence, the
// system uses a conservative review policy rather than inventing a score (Tech Stack §11).
//
// D-11 (P2-2): the adapter SEAM ships here. PaddleOCR is the concrete implementation for this
// session (behind the seam — never called directly from the API). Q10 stays OPEN: the final
// provider is a real-card benchmark decision; nothing here resolves it.

import { PaddleOcrAdapter, PADDLE_OCR_PROVIDER } from './paddle';
import { StubOcrAdapter, STUB_OCR_PROVIDER } from './stub';
import { DeepSeekVisionOcrAdapter, DEEPSEEK_OCR_PROVIDER } from './deepseek';
import { GeminiVisionOcrAdapter, GEMINI_OCR_PROVIDER } from './gemini';

export interface OcrLine {
  text: string;
  confidence?: number;
  /** Best-effort structured parse (LLM providers only). When `kind` is present,
   *  intake persists the split name/amount and role instead of the raw line text.
   *  Providers that only transcribe (paddle/deepseek/stub) leave these unset and
   *  the existing whole-line behavior is preserved. */
  kind?: 'ingredient' | 'method';
  /** Free-text amount separated from the name ("1 cup", "2 sprigs", "to taste"). */
  amountText?: string | null;
}

export interface OcrResult {
  recognized_text: string;
  lines: OcrLine[];
  source_metadata: Record<string, unknown>;
}

export interface OcrAdapter {
  /** Recognize text from image bytes. Provider-neutral: each adapter encodes and
   *  transmits the bytes its own way; the returned shape is always normalized. */
  recognize(image: Uint8Array, contentType: string): Promise<OcrResult>;
}

// Re-export the error taxonomy from its own module (avoids a circular import:
// providers extend these classes at load time, and `index.ts` imports them).
export { OcrProviderError, OcrTimeoutError } from './errors';

export const OCR_ADAPTER_SEAM = 'provider-neutral (Tech Stack §11; Q10 OPEN — real-card benchmark)';

/**
 * Select the OCR adapter from the environment.
 *  - OCR_PROVIDER=paddle   → the local PaddleOCR adapter (config-gated; no credentials).
 *  - OCR_PROVIDER=deepseek → the DeepSeek Vision adapter (server-side key; no per-line
 *                            confidence → conservative needs_review policy).
 *  - OCR_PROVIDER=gemini   → the Gemini Vision adapter (server-side key; no per-line
 *                            confidence → conservative needs_review policy).
 *  - OCR_PROVIDER=stub     → the deterministic golden-card stub (CI / local dev).
 *  - anything else         → null (OCR disabled — no draft lines are produced).
 */
export function resolveOcrAdapter(env: Record<string, string | undefined>): OcrAdapter | null {
  const provider = env.OCR_PROVIDER;
  if (provider === PADDLE_OCR_PROVIDER) return new PaddleOcrAdapter(env);
  if (provider === DEEPSEEK_OCR_PROVIDER) return new DeepSeekVisionOcrAdapter(env);
  if (provider === GEMINI_OCR_PROVIDER) return new GeminiVisionOcrAdapter(env);
  if (provider === STUB_OCR_PROVIDER) return new StubOcrAdapter();
  return null;
}

export { PaddleOcrAdapter, PADDLE_OCR_PROVIDER } from './paddle';
export { StubOcrAdapter, STUB_OCR_PROVIDER } from './stub';
export { DeepSeekVisionOcrAdapter, DEEPSEEK_OCR_PROVIDER, DEEPSEEK_OCR_PROMPT, normalizeDeepSeekResponse } from './deepseek';
export { GeminiVisionOcrAdapter, GEMINI_OCR_PROVIDER, GEMINI_OCR_PROMPT, normalizeGeminiResponse } from './gemini';
