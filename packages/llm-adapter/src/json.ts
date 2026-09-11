// Q9 response normalization (ADR §19): vendor text is reduced to parsed JSON
// BEFORE it enters the domain. Shared by the real provider adapters.

import { LlmTransientProviderError } from './errors';

/** Strip markdown fences/commentary: the first `{` .. last `}` span. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new LlmTransientProviderError('LLM output contained no JSON object');
  }
  return JSON.parse(trimmed.slice(start, end + 1));
}
