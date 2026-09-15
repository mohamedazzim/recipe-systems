// DeepSeek Vision OCR adapter — a SECOND provider behind the provider-neutral
// seam (Q10). It sends the card image to the configured DeepSeek vision model
// (chat/completions with an image content part) and normalizes the returned
// transcription into OcrResult — the SAME contract PaddleOcrAdapter/StubOcrAdapter
// produce. No second parser; Intake/review/readiness are downstream and unchanged.
//
// Confidence: DeepSeek exposes no per-line confidence, so lines carry NO
// `confidence`. The Intake persist path flags missing-confidence lines
// needs_review (Tech Stack §11: never invent a score — conservative review).
//
// Q10 stays OPEN until this adapter passes the canonical golden-card benchmark.

import { OcrProviderError, OcrTimeoutError } from './errors';
import type { OcrAdapter, OcrLine, OcrResult } from './index';

export const DEEPSEEK_OCR_PROVIDER = 'deepseek';

export function deepseekModel(env: Record<string, string | undefined>): string {
  return env.DEEPSEEK_MODEL ?? 'deepseek-flash';
}

export function deepseekBaseUrl(env: Record<string, string | undefined>): string {
  return (env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com').replace(/\/+$/, '');
}

export function deepseekTimeoutMs(env: Record<string, string | undefined>): number {
  return Number(env.DEEPSEEK_TIMEOUT_MS ?? 120_000);
}

export function deepseekMaxRetries(env: Record<string, string | undefined>): number {
  return Math.max(0, Number(env.DEEPSEEK_MAX_RETRIES ?? 2));
}

/** deepseek-flash is a reasoning model: max_tokens covers BOTH reasoning_content
 *  and content. 4096 was too small (the chain-of-thought could exhaust the whole
 *  budget and leave `content` empty → finish_reason=length). 8192 is the default;
 *  the adapter doubles toward the cap on truncation before giving up. */
export function deepseekOcrMaxTokens(env: Record<string, string | undefined>): number {
  return Number(env.DEEPSEEK_OCR_MAX_TOKENS ?? 8192);
}

export function deepseekOcrMaxTokensCap(env: Record<string, string | undefined>): number {
  return Number(env.DEEPSEEK_OCR_MAX_TOKENS_CAP ?? 32768);
}

/**
 * The transcription contract (Q10): text ONLY as visibly written — no recipe
 * knowledge, no invented ingredients, no correction, no analysis. Illegible
 * words become "[unreadable]", never a guess.
 */
export const DEEPSEEK_OCR_PROMPT = [
  'You are a recipe-card transcription engine. Transcribe EXACTLY the text visibly',
  'written on the recipe card image, nothing else.',
  '',
  'RULES (non-negotiable):',
  '- One ingredient or one step per line, in the order it appears.',
  '- Preserve the exact wording, quantities, and units as written (e.g. "1/2 tsp", "500 g", "2 tbsp").',
  '- Preserve distinctions between similar ingredients: "Fenugreek Seeds" and "Fenugreek Powder" are DIFFERENT lines — never merge them.',
  '- Do NOT correct handwriting using recipe knowledge; do NOT infer missing ingredients; do NOT add, translate, or "improve" text.',
  '- Do NOT write a method, and do NOT generate analysis, views, or commentary.',
  '- If a word is illegible, write "[unreadable]" for that word instead of guessing.',
  '- Output ONLY the transcribed lines. No headings, no explanations, no markdown.',
].join('\n');

/** Strip common assistant decorations (markdown bullets/numbering/code fences)
 *  so each line is the raw card text. Never used to "repair" content. */
function cleanLine(raw: string): string {
  let line = raw.trim();
  if (line.startsWith('```')) return '';
  line = line.replace(/^[-*•]\s*/, '');
  line = line.replace(/^\d+[.)]\s*/, '');
  return line.trim();
}

/**
 * Normalize the assistant's plain-text transcription into OcrResult. Empty
 * (or whitespace-only) assistant output is a VALID provider outcome → the
 * intake maps it to OCR_UNREADABLE (422); it is NOT thrown here.
 */
export function normalizeDeepSeekResponse(text: string, model: string): OcrResult {
  const lines: OcrLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = cleanLine(raw);
    if (line.length === 0) continue;
    lines.push({ text: line }); // no confidence — conservative review policy
  }
  return {
    recognized_text: lines.map((l) => l.text).join('\n'),
    lines,
    source_metadata: { provider: DEEPSEEK_OCR_PROVIDER, model },
  };
}

/** The reasoning model spent its whole token budget on chain-of-thought and
 *  returned an empty final `content` (finish_reason=length). This is NOT
 *  "unreadable" — it is a budget symptom, so `recognize` retries with a larger
 *  budget instead of surfacing a false 422. */
class DeepSeekTruncationError extends OcrProviderError {
  constructor() {
    super('DeepSeek Vision reasoning exhausted the token budget (empty content)');
    this.name = 'DeepSeekTruncationError';
  }
}

export class DeepSeekVisionOcrAdapter implements OcrAdapter {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly maxTokens: number;
  private readonly maxTokensCap: number;

  constructor(env: Record<string, string | undefined>) {
    this.apiKey = env.DEEPSEEK_API_KEY ?? '';
    this.model = deepseekModel(env);
    this.baseUrl = deepseekBaseUrl(env);
    this.timeoutMs = deepseekTimeoutMs(env);
    this.maxRetries = deepseekMaxRetries(env);
    this.maxTokens = deepseekOcrMaxTokens(env);
    this.maxTokensCap = Math.max(this.maxTokens, deepseekOcrMaxTokensCap(env));
  }

  async recognize(image: Uint8Array, contentType: string): Promise<OcrResult> {
    if (!this.apiKey) {
      throw new OcrProviderError('DEEPSEEK_API_KEY is not set (Q10 DeepSeek Vision credential missing)');
    }
    const dataUri = `data:${contentType};base64,${Buffer.from(image).toString('base64')}`;

    // The budget may grow on truncation retries (reasoning + answer share it).
    let maxTokens = this.maxTokens;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const body = JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: DEEPSEEK_OCR_PROMPT },
              { type: 'image_url', image_url: { url: dataUri } },
            ],
          },
        ],
        temperature: 0,
        max_tokens: maxTokens,
        stream: false,
      });

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body,
          signal: controller.signal,
        });
        if (response.status === 401 || response.status === 403 || response.status === 400) {
          throw new OcrProviderError(
            `DeepSeek Vision rejected the request (HTTP ${response.status}) — check DEEPSEEK_MODEL/key`,
          );
        }
        if (response.status === 429 || response.status >= 500) {
          throw new OcrProviderError(`DeepSeek Vision HTTP ${response.status} (transient)`);
        }
        if (!response.ok) {
          throw new OcrProviderError(`DeepSeek Vision HTTP ${response.status}`);
        }
        const json = (await response.json()) as {
          choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
        };
        const message = json.choices?.[0]?.message;
        // `content` is the final answer; `reasoning_content` is chain-of-thought
        // and is NEVER treated as the transcription.
        const content = message?.content;
        if (typeof content !== 'string') {
          throw new OcrProviderError('DeepSeek Vision returned no transcription content');
        }
        if (content.trim().length > 0) {
          return normalizeDeepSeekResponse(content, this.model);
        }
        // Empty final content. Reasoning present + empty answer means the model
        // ran out of budget mid-chain-of-thought — retry with a larger budget,
        // never report a false "unreadable".
        if (typeof message?.reasoning_content === 'string' && message.reasoning_content.trim().length > 0) {
          if (maxTokens < this.maxTokensCap) {
            maxTokens = Math.min(maxTokens * 2, this.maxTokensCap);
            throw new DeepSeekTruncationError();
          }
          throw new OcrProviderError(
            'DeepSeek Vision exhausted the maximum token budget without producing a transcription',
          );
        }
        // Genuinely nothing readable: a valid provider outcome → empty lines (422).
        return normalizeDeepSeekResponse(content, this.model);
      } catch (err) {
        if (err instanceof DeepSeekTruncationError) {
          await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
          continue;
        }
        if (err instanceof OcrProviderError) throw err;
        const isRetryable = attempt < this.maxRetries;
        if (!isRetryable) {
          if (err instanceof Error && err.name === 'AbortError') {
            throw new OcrTimeoutError(`DeepSeek Vision timed out after ${this.timeoutMs}ms`);
          }
          throw new OcrProviderError('DeepSeek Vision unavailable', err);
        }
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
      } finally {
        clearTimeout(timer);
      }
    }
    throw new OcrProviderError('DeepSeek Vision retries exhausted');
  }
}
