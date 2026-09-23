// Q9 provider switch (2026-09-11): the Gemini provider behind the EXISTING
// LlmAdapter seam (Tech Stack §10) — the same contract as DeepSeekLlmAdapter.
// Server-side only:
//   - GEMINI_API_KEY is read ONLY from server-side environment (never logged,
//     never in a response, never in this repository);
//   - the prompt sent is ONLY the canonical D-15 pair (systemPromptFor +
//     buildViewPrompt) plus the captured structured_recipe JSON — no other
//     database data is injected;
//   - Views 8/9 are deterministic and are never sent here (buildViewPrompt
//     refuses non-LLM views);
//   - the response is normalized to parsed JSON BEFORE it enters the domain —
//     the frozen D-05 schema gate (parseViewOutput) and the D-16 grounding
//     gate remain downstream and mandatory;
//   - errors reuse the shared adapter error model: LlmPermanentProviderError
//     (401/403/400/prompt-block — the worker's permanent no-retry path,
//     ADR §14) vs transient (429/5xx/network/timeout/malformed output — the
//     existing pg-boss Q13-labeled retries apply).
//
// HTTP: POST {base}/v1beta/models/{model}:generateContent via global fetch
// (no vendor SDK), `x-goog-api-key` header. The thinking level is forwarded
// ONLY as the official REST field
// generationConfig.thinkingConfig.thinkingLevel (enum MINIMAL/LOW/MEDIUM/HIGH —
// verified against the live API and the REST reference 2026-09-11;
// gemini-3.8-flash supports low/medium/high). maxOutputTokens is deliberately
// NOT set: Gemini counts thinking tokens inside it, so a cap truncates output.

import { AnalysisMode } from '@recipe-systems/schemas';
import { LlmPermanentProviderError, LlmTransientProviderError } from './errors';
import { extractJson } from './json';
import { buildViewPrompt } from './prompts/views';
import { buildExtractionUserPrompt, EXTRACTION_SYSTEM_PROMPT } from './prompts/extraction';
import { buildServingsUserPrompt, SERVINGS_SYSTEM_PROMPT } from './prompts/servings';
import {
  buildVideoProposalUserPrompt,
  buildVideoChaptersUserPrompt,
  VIDEO_PROPOSAL_SYSTEM_PROMPT,
  VIDEO_CHAPTERS_SYSTEM_PROMPT,
} from './prompts/video';
import type {
  LlmAdapter,
  LlmGenerateRequest,
  RecipeExtractionRequest,
  ServingsPredictionRequest,
  VideoChaptersRequest,
  VideoProposalRequest,
} from './index';

/** Official ThinkingLevel enum values (REST JSON string form). */
export type GeminiThinkingLevel = 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH';

/** Upper bound for a provider-sent Retry-After wait (keeps retries bounded). */
const RETRY_AFTER_CAP_MS = 30_000;

/** Parse a Retry-After header (seconds or HTTP-date); undefined when absent. */
export function retryAfterSeconds(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.max(0, (date - Date.now()) / 1000);
  return undefined;
}

export interface GeminiConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  /** Optional per-call token-usage telemetry (tokens only — never content,
   *  never secrets). The worker logs it; nothing is stored. */
  onUsage?: (usage: GeminiUsage) => void;
  /** Official thinking-level passthrough. When omitted the provider default
   *  applies (gemini-3.8-flash: MEDIUM). */
  thinkingLevel?: GeminiThinkingLevel;
}

/** Token usage as reported by the provider (`usageMetadata`). */
export interface GeminiUsage {
  view?: number;
  mode?: string;
  promptTokens: number;
  completionTokens: number;
  thoughtTokens: number;
  totalTokens: number;
  /** Raw provider usageMetadata object — telemetry only. */
  details?: unknown;
}

function envConfig(): GeminiConfig {
  return {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL,
    baseUrl: process.env.GEMINI_BASE_URL,
    timeoutMs: process.env.GEMINI_TIMEOUT_MS ? Number(process.env.GEMINI_TIMEOUT_MS) : undefined,
    maxRetries: process.env.GEMINI_MAX_RETRIES ? Number(process.env.GEMINI_MAX_RETRIES) : undefined,
  };
}

interface GeminiCandidate {
  content?: { parts?: Array<{ text?: string; thought?: boolean }> };
  finishReason?: string;
}

interface GeminiResponseBody {
  candidates?: GeminiCandidate[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    totalTokenCount?: number;
  };
}

/** Join the candidate's text parts. Thought parts are skipped when visible
 *  answer text exists; only as a last resort is thought text considered. */
export function candidateText(candidate?: GeminiCandidate): string {
  const parts = candidate?.content?.parts ?? [];
  const visible = parts
    .filter((p) => p.thought !== true && typeof p.text === 'string')
    .map((p) => p.text as string)
    .join('');
  if (visible.length > 0) return visible;
  return parts
    .filter((p): p is { text: string } => typeof p.text === 'string' && p.text.length > 0)
    .map((p) => p.text)
    .join('');
}

export class GeminiLlmAdapter implements LlmAdapter {
  /** Non-secret telemetry identity: provider only. */
  readonly providerName = 'gemini';

  /** Provenance pin for analysis rows (A-17 hygiene). */
  get modelVersion(): string {
    return `gemini:${this.model}`;
  }

  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly onUsage: GeminiConfig['onUsage'];
  private readonly thinkingLevel: GeminiConfig['thinkingLevel'];

  constructor(config: GeminiConfig = envConfig()) {
    this.apiKey = config.apiKey ?? '';
    this.model = config.model ?? 'gemini-3.8-flash';
    this.baseUrl = (config.baseUrl ?? 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
    this.timeoutMs = config.timeoutMs ?? 60_000;
    // Gemini default 8 (not DeepSeek's 2): gemini-3.8-flash launched under
    // high demand with intermittent 503 UNAVAILABLE + 429 quota windows
    // (live-verified 2026-09-11 — even single sequential calls hit them).
    // Bounded retries with capped backoff (~16s spacing) ride out the
    // windows; the worker's own retry semantics stay untouched.
    this.maxRetries = Math.max(0, config.maxRetries ?? 8);
    this.onUsage = config.onUsage;
    this.thinkingLevel = config.thinkingLevel;
  }

  /** Non-secret description for boot logs (never includes the key). */
  describe(): string {
    const level = this.thinkingLevel
      ? ` (thinking ${this.thinkingLevel.toLowerCase()})`
      : '';
    return `gemini:${this.model}${level} @ ${this.baseUrl}`;
  }

  private async generateContent(
    system: string,
    user: string,
    opts: { extraParts?: Array<Record<string, unknown>>; extraBody?: Record<string, unknown> } = {},
  ): Promise<{ content: string; usage?: GeminiUsage }> {
    if (!this.apiKey) {
      throw new LlmPermanentProviderError(
        'GEMINI_API_KEY is not set in the server environment (credential missing)',
      );
    }
    let attempt = 0;
    for (attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await fetch(
          `${this.baseUrl}/v1beta/models/${this.model}:generateContent`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': this.apiKey,
            },
            body: JSON.stringify({
              contents: [
                { role: 'user', parts: [...(opts.extraParts ?? []), { text: user }] },
              ],
              systemInstruction: { parts: [{ text: system }] },
              generationConfig: {
                temperature: 0,
                ...(this.thinkingLevel
                  ? { thinkingConfig: { thinkingLevel: this.thinkingLevel } }
                  : {}),
              },
              ...(opts.extraBody ?? {}),
            }),
            signal: controller.signal,
          },
        );
        if (response.status === 401 || response.status === 403 || response.status === 400) {
          throw new LlmPermanentProviderError(
            `Gemini rejected the request (HTTP ${response.status}) — check GEMINI_MODEL/key`,
          );
        }
        if (response.status === 429 || response.status >= 500) {
          const retryAfter = retryAfterSeconds(response.headers.get('retry-after'));
          throw new LlmTransientProviderError(
            `Gemini HTTP ${response.status} (transient)`,
            retryAfter,
          );
        }
        if (!response.ok) {
          throw new LlmTransientProviderError(`Gemini HTTP ${response.status}`);
        }
        const body = (await response.json()) as GeminiResponseBody;
        // Prompt blocked by provider policy: retrying the same prompt cannot
        // succeed and prompt changes are out of scope — permanent no-retry.
        if (body.promptFeedback?.blockReason) {
          throw new LlmPermanentProviderError(
            `Gemini blocked the prompt (${body.promptFeedback.blockReason})`,
          );
        }
        const content = candidateText(body.candidates?.[0]);
        if (content.length === 0) {
          throw new LlmTransientProviderError('Gemini returned an empty completion');
        }
        const u = body.usageMetadata;
        const usage: GeminiUsage | undefined =
          u && typeof u.totalTokenCount === 'number'
            ? {
                promptTokens: u.promptTokenCount ?? 0,
                completionTokens: u.candidatesTokenCount ?? 0,
                thoughtTokens: u.thoughtsTokenCount ?? 0,
                totalTokens: u.totalTokenCount,
                details: u,
              }
            : undefined;
        return { content, usage };
      } catch (err) {
        if (err instanceof LlmPermanentProviderError) throw err;
        const isRetryable = attempt < this.maxRetries;
        if (!isRetryable) {
          if (err instanceof Error && err.name === 'AbortError') {
            throw new LlmTransientProviderError(
              `Gemini request timed out after ${this.timeoutMs}ms`,
            );
          }
          if (err instanceof LlmTransientProviderError) throw err;
          throw new LlmTransientProviderError(`Gemini request failed: ${(err as Error).message}`);
        }
        // Bounded in-adapter retry (transient classes only; permanent errors
        // rethrow above) — the worker's own retry semantics are unchanged.
        // Gemini retry profile: honor Retry-After when the provider sends it,
        // else exponential backoff (base 1s, cap 16s) with jitter so the
        // worker's concurrent lanes don't retry in lockstep bursts.
        const delayMs = err instanceof LlmTransientProviderError && err.retryAfterMs !== undefined
          ? Math.min(err.retryAfterMs, RETRY_AFTER_CAP_MS)
          : Math.min(1000 * 2 ** attempt, 16_000);
        await new Promise((resolve) =>
          setTimeout(resolve, delayMs + Math.floor(Math.random() * 500)),
        );
      } finally {
        clearTimeout(timer);
      }
    }
    throw new LlmTransientProviderError('Gemini retries exhausted');
  }

  /**
   * Q9-3: send ONLY the canonical prompt pair + the captured snapshot. The
   * captured state is the single source of truth the D-15 prompts demand.
   */
  async generate(request: LlmGenerateRequest): Promise<unknown> {
    const prompts = buildViewPrompt(request.view, request.mode as AnalysisMode);
    const snapshot = JSON.stringify(request.recipe_snapshot);
    const user = `${prompts.user}\n\nSTRUCTURED RECIPE OBJECT (the ONLY source of truth):\n${snapshot}`;
    const { content, usage } = await this.generateContent(prompts.system, user);
    if (usage && this.onUsage) {
      this.onUsage({ view: request.view, mode: request.mode, ...usage });
    }
    return extractJson(content);
  }

  /** Phase 3: source-faithful extraction — same HTTP path, dedicated prompt. */
  async extractRecipeText(request: RecipeExtractionRequest): Promise<unknown> {
    const user = buildExtractionUserPrompt(request.source_text);
    const { content } = await this.generateContent(EXTRACTION_SYSTEM_PROMPT, user);
    return extractJson(content);
  }

  /** RS-US servings: estimate the serving count from an ingredient list. */
  async predictServings(request: ServingsPredictionRequest): Promise<unknown> {
    const user = buildServingsUserPrompt(request.ingredient_lines);
    const { content } = await this.generateContent(SERVINGS_SYSTEM_PROMPT, user);
    return extractJson(content);
  }

  /**
   * RS-US video: propose a YouTube video for the dish. Google-Search grounding is
   * requested so the answer can come from a real result rather than recall — but
   * the CALLER still verifies the video exists before storing or showing it, so a
   * non-grounded (or wrong) answer can never reach the user.
   */
  async proposeRecipeVideo(request: VideoProposalRequest): Promise<unknown> {
    const user = buildVideoProposalUserPrompt({
      dish: request.dish,
      ingredients: request.ingredients,
    });
    const { content } = await this.generateContent(VIDEO_PROPOSAL_SYSTEM_PROMPT, user, {
      extraBody: { tools: [{ google_search: {} }] },
    });
    return extractJson(content);
  }

  /** RS-US video: hand the video itself to the model and read out its steps. */
  async describeVideoChapters(request: VideoChaptersRequest): Promise<unknown> {
    const user = buildVideoChaptersUserPrompt({ dish: request.dish });
    const { content } = await this.generateContent(VIDEO_CHAPTERS_SYSTEM_PROMPT, user, {
      extraParts: [{ fileData: { fileUri: request.video_url } }],
    });
    return extractJson(content);
  }
}
