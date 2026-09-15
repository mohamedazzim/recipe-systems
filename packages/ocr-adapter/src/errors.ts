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

/** A provider timeout — retryable, photo/input preserved (QG4 cell). */
export class OcrTimeoutError extends OcrProviderError {
  constructor(message: string) {
    super(message);
    this.name = 'OcrTimeoutError';
  }
}
