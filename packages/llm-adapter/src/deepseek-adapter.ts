// Q9 (2026-09-11): the real DeepSeek provider behind the existing LlmAdapter
// seam (Tech Stack §10). Server-side only:
//   - the API key is read ONLY from server-side environment (never logged,
//     never in a response, never in this repository);
//   - the prompt sent is ONLY the canonical D-15 pair (systemPromptFor +
//     buildViewPrompt) plus the captured structured_recipe JSON — no other
//     database data is injected (Q9-3);
//   - Views 8/9 are deterministic and are never sent here (buildViewPrompt
//     refuses non-LLM views);
//   - the response is normalized to parsed JSON BEFORE it enters the domain —
//     the frozen D-05 schema gate (parseViewOutput) and the D-16 grounding
//     gate remain downstream and mandatory;
//   - errors are typed: LlmPermanentProviderError (401/403/400 — the worker's
//     permanent no-retry path, ADR §14) vs transient (429/5xx/network/timeout/
//     malformed output — the existing pg-boss Q13-labeled retries apply).
//
// HTTP: OpenAI-compatible POST {base}/chat/completions via global fetch (no
// vendor SDK). Bounded in-adapter retries for 429/5xx only (DEEPSEEK_MAX_RETRIES,
// default 2) — the worker's own retry semantics are unchanged (Q9-5).

import { AnalysisMode } from '@recipe-systems/schemas';
import { buildViewPrompt } from './prompts/views';
import type { LlmAdapter, LlmGenerateRequest } from './index';

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
  constructor(message: string) {
    super(message);
    this.name = 'LlmTransientProviderError';
  }
}

export interface DeepSeekConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

function envConfig(): DeepSeekConfig {
  return {
    apiKey: process.env.DEEPSEEK_API_KEY,
    model: process.env.DEEPSEEK_MODEL,
    baseUrl: process.env.DEEPSEEK_BASE_URL,
    timeoutMs: process.env.DEEPSEEK_TIMEOUT_MS ? Number(process.env.DEEPSEEK_TIMEOUT_MS) : undefined,
    maxRetries: process.env.DEEPSEEK_MAX_RETRIES ? Number(process.env.DEEPSEEK_MAX_RETRIES) : undefined,
  };
}

/** Strip markdown fences/commentary: the first `{` .. last `}` span. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new LlmTransientProviderError('DeepSeek output contained no JSON object');
  }
  return JSON.parse(trimmed.slice(start, end + 1));
}

export class DeepSeekLlmAdapter implements LlmAdapter {
  /** Non-secret telemetry identity (Q9-6): provider + model only. */
  readonly providerName = 'deepseek';

  /** Provenance pin for analysis rows (A-17 hygiene). */
  get modelVersion(): string {
    return `deepseek:${this.model}`;
  }

  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(config: DeepSeekConfig = envConfig()) {
    this.apiKey = config.apiKey ?? '';
    this.model = config.model ?? 'deepseek-chat';
    this.baseUrl = (config.baseUrl ?? 'https://api.deepseek.com').replace(/\/+$/, '');
    this.timeoutMs = config.timeoutMs ?? 60_000;
    this.maxRetries = Math.max(0, config.maxRetries ?? 2);
  }

  /** Non-secret description for boot logs (never includes the key). */
  describe(): string {
    return `deepseek:${this.model} @ ${this.baseUrl}`;
  }

  private async chatCompletion(
    system: string,
    user: string,
  ): Promise<string> {
    if (!this.apiKey) {
      throw new LlmPermanentProviderError(
        'DEEPSEEK_API_KEY is not set in the server environment (Q9 credential missing)',
      );
    }
    let attempt = 0;
    for (attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
            temperature: 0,
            stream: false,
          }),
          signal: controller.signal,
        });
        if (response.status === 401 || response.status === 403 || response.status === 400) {
          throw new LlmPermanentProviderError(
            `DeepSeek rejected the request (HTTP ${response.status}) — check DEEPSEEK_MODEL/key`,
          );
        }
        if (response.status === 429 || response.status >= 500) {
          throw new LlmTransientProviderError(`DeepSeek HTTP ${response.status} (transient)`);
        }
        if (!response.ok) {
          throw new LlmTransientProviderError(`DeepSeek HTTP ${response.status}`);
        }
        const body = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = body.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || content.length === 0) {
          throw new LlmTransientProviderError('DeepSeek returned an empty completion');
        }
        return content;
      } catch (err) {
        if (err instanceof LlmPermanentProviderError) throw err;
        const isRetryable = attempt < this.maxRetries;
        if (!isRetryable) {
          if (err instanceof Error && err.name === 'AbortError') {
            throw new LlmTransientProviderError(
              `DeepSeek request timed out after ${this.timeoutMs}ms`,
            );
          }
          if (err instanceof LlmTransientProviderError) throw err;
          throw new LlmTransientProviderError(`DeepSeek request failed: ${(err as Error).message}`);
        }
        // Bounded in-adapter retry (transient classes only; permanent errors
        // rethrow above) — the worker's own retry semantics are unchanged (Q9-5).
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
      } finally {
        clearTimeout(timer);
      }
    }
    throw new LlmTransientProviderError('DeepSeek retries exhausted');
  }

  /**
   * Q9-3: send ONLY the canonical prompt pair + the captured snapshot. The
   * captured state is the single source of truth the D-15 prompts demand.
   */
  async generate(request: LlmGenerateRequest): Promise<unknown> {
    const prompts = buildViewPrompt(request.view, request.mode as AnalysisMode);
    const snapshot = JSON.stringify(request.recipe_snapshot);
    const user = `${prompts.user}\n\nSTRUCTURED RECIPE OBJECT (the ONLY source of truth):\n${snapshot}`;
    const content = await this.chatCompletion(prompts.system, user);
    return extractJson(content);
  }
}
