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

export interface OcrLine {
  text: string;
  confidence?: number;
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

/** A provider failure that the intake flow surfaces as retryable (503). */
export class OcrProviderError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'OcrProviderError';
  }
}

/** A provider timeout — retryable, photo/input preserved (QG4 cell). */
export class OcrTimeoutError extends OcrProviderError {
  constructor(message: string) {
    super(message);
    this.name = 'OcrTimeoutError';
  }
}

export const OCR_ADAPTER_SEAM = 'provider-neutral (Tech Stack §11; Q10 OPEN — real-card benchmark)';

/**
 * Select the OCR adapter from the environment.
 *  - OCR_PROVIDER=paddle → the local PaddleOCR adapter (config-gated; no credentials).
 *  - OCR_PROVIDER=stub   → the deterministic golden-card stub (CI / local dev).
 *  - anything else       → null (OCR disabled — no draft lines are produced).
 */
export function resolveOcrAdapter(env: Record<string, string | undefined>): OcrAdapter | null {
  const provider = env.OCR_PROVIDER;
  if (provider === PADDLE_OCR_PROVIDER) return new PaddleOcrAdapter(env);
  if (provider === STUB_OCR_PROVIDER) return new StubOcrAdapter();
  return null;
}

export { PaddleOcrAdapter, PADDLE_OCR_PROVIDER } from './paddle';
export { StubOcrAdapter, STUB_OCR_PROVIDER } from './stub';
