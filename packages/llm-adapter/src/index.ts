// Provider-neutral LLM adapter — Tech Stack §10.
// The worker calls this internal interface, never vendor SDKs directly; vendor responses are
// normalized before entering the domain (ADR §19). Payload typing is deliberately loose until
// the nine-view schemas freeze in D-05.
export interface LlmGenerateRequest {
  /** Captured immutable structured-recipe state for the job (ADR §6; Q1 — D-17 builds to the labeled assumption). */
  recipe_snapshot: unknown;
  prompt_version: string;
  model_version: string;
}

/** Structured nine-view payload — exact shape frozen with the D-05 schemas. */
export type NineViewPayload = unknown;

export interface LlmAdapter {
  generate(request: LlmGenerateRequest): Promise<NineViewPayload>;
}

export const LLM_ADAPTER_SEAM = 'provider-neutral (Tech Stack §10; Q9 OPEN — benchmark wks 1–4)';
