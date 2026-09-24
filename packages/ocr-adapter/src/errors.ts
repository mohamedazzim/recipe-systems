// OCR adapter error taxonomy (shared by every provider implementation).
// Kept in its own module so provider files can `extend` these at load time
// without pulling the adapter registry (`index.ts`) into a circular import.

/** A provider failure that the intake flow surfaces as retryable (503). */
export class OcrProviderError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'OcrProviderError';
  }
}

/**
 * A TRANSIENT provider failure (429 rate limit, 5xx, network) — the adapter's own
 * retry budget applies. Distinct from the base class because the retry branch
 * previously rethrew every OcrProviderError, which made the 429/5xx retry
 * (and the whole backoff/budget machinery) inert: rate limits were terminal.
 * A PERMANENT failure (401/403/400, prompt block, missing key) stays a plain
 * OcrProviderError and is never retried.
 */
export class OcrTransientProviderError extends OcrProviderError {
  constructor(message: string, readonly retryAfterMs?: number, cause?: unknown) {
    super(message, cause);
    this.name = 'OcrTransientProviderError';
  }
}

/** A provider timeout — retryable, photo/input preserved (QG4 cell). */
export class OcrTimeoutError extends OcrTransientProviderError {
  constructor(message: string) {
    super(message);
    this.name = 'OcrTimeoutError';
  }
}
