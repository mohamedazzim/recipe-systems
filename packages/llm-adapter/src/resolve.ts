// Provider-neutral LLM adapter resolution for the API/BFF (Q9 provider switch).
// Unlike the worker's resolver (which returns a PendingAdapter that throws when
// no provider is set, so analysis jobs fail cleanly), this returns NULL when no
// provider is configured — the API's optional capabilities (servings estimation)
// then simply skip the LLM and degrade to deterministic behavior.
//
// MODEL_PROVIDER is the canonical knob; LLM_PROVIDER is accepted for backward
// compatibility (deepseek only). Credentials stay server-side (adapters read
// env); CI never sets a provider and never requires a key.

import { DeepSeekLlmAdapter } from './deepseek-adapter';
import { GeminiLlmAdapter } from './gemini-adapter';
import type { LlmAdapter } from './index';

export function resolveLlmAdapter(env: Record<string, string | undefined>): LlmAdapter | null {
  const provider = (env.MODEL_PROVIDER ?? env.LLM_PROVIDER)?.toLowerCase();
  if (provider === 'gemini') {
    return new GeminiLlmAdapter({
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL,
      baseUrl: env.GEMINI_BASE_URL,
      timeoutMs: env.GEMINI_TIMEOUT_MS ? Number(env.GEMINI_TIMEOUT_MS) : undefined,
      maxRetries: env.GEMINI_MAX_RETRIES ? Number(env.GEMINI_MAX_RETRIES) : undefined,
      // Token-usage telemetry for the optional API-side capabilities (servings
      // estimate, video proposal + chapters). Tokens only — never content, never
      // secrets. The worker logs the same shape for the analysis views.
      onUsage: (usage) => {
        console.log(
          `api telemetry [gemini] usage: prompt=${usage.promptTokens} ` +
            `completion=${usage.completionTokens} thoughts=${usage.thoughtTokens} ` +
            `total=${usage.totalTokens}`,
        );
      },
    });
  }
  if (provider === 'deepseek') {
    const rawEffort = env.DEEPSEEK_REASONING_EFFORT;
    const reasoningEffort =
      rawEffort === 'none' || rawEffort === 'low' || rawEffort === 'high' || rawEffort === 'max'
        ? rawEffort
        : undefined;
    return new DeepSeekLlmAdapter({
      apiKey: env.DEEPSEEK_API_KEY,
      model: env.DEEPSEEK_MODEL,
      baseUrl: env.DEEPSEEK_BASE_URL,
      timeoutMs: env.DEEPSEEK_TIMEOUT_MS ? Number(env.DEEPSEEK_TIMEOUT_MS) : undefined,
      maxRetries: env.DEEPSEEK_MAX_RETRIES ? Number(env.DEEPSEEK_MAX_RETRIES) : undefined,
      reasoningEffort,
    });
  }
  return null;
}
