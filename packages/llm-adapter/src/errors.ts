// Q9 provider-neutral error model (ADR §14). Shared by every real provider
// adapter behind the LlmAdapter seam — the worker classifies on these classes
// only, so a provider switch never touches worker retry semantics.

/** Permanent provider/configuration failure — the worker must fail the job
 *  WITHOUT retry (same class as ProviderPendingError, ADR §14). */
export class LlmPermanentProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmPermanentProviderError';
  }
}

/** Transient provider failure — the worker's existing pg-boss retry path. */
export class LlmTransientProviderError extends Error {
  /** Optional provider-requested wait for bounded in-adapter retries
   *  (Retry-After, in milliseconds). Undefined when the provider sent none. */
  readonly retryAfterMs: number | undefined;

  constructor(message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = 'LlmTransientProviderError';
    this.retryAfterMs = retryAfterSeconds !== undefined ? retryAfterSeconds * 1000 : undefined;
  }
}
