// Gemini Vision OCR adapter — a third provider behind the provider-neutral
// OCR seam (Q10). It sends the card image to the configured Gemini model via
// `:generateContent` (inline image part) and normalizes the returned
// transcription into OcrResult — the SAME contract Paddle/DeepSeek/Stub
// produce. No second parser; Intake/review/readiness are downstream and
// unchanged.
//
// Confidence: Gemini exposes no per-line confidence, so lines carry NO
// `confidence`. The Intake persist path flags missing-confidence lines
// needs_review (Tech Stack §11: never invent a score — conservative review).

import { OcrProviderError, OcrTimeoutError } from './errors';
import type { OcrAdapter, OcrLine, OcrResult } from './index';

export const GEMINI_OCR_PROVIDER = 'gemini';

export function geminiOcrModel(env: Record<string, string | undefined>): string {
  return env.GEMINI_MODEL ?? 'gemini-3.8-flash';
}

export function geminiOcrBaseUrl(env: Record<string, string | undefined>): string {
  return (env.GEMINI_BASE_URL ?? 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
}

export function geminiOcrTimeoutMs(env: Record<string, string | undefined>): number {
  return Number(env.GEMINI_TIMEOUT_MS ?? 120_000);
}

export function geminiOcrMaxRetries(env: Record<string, string | undefined>): number {
  return Math.max(0, Number(env.GEMINI_MAX_RETRIES ?? 2));
}

/**
 * The transcription contract (Q10): text ONLY as visibly written — identical
 * to the DeepSeek Vision contract so switching providers never changes what
 * the intake sees. Illegible words become "[unreadable]", never a guess.
 */
export const GEMINI_OCR_PROMPT = [
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
export function normalizeGeminiResponse(text: string, model: string): OcrResult {
  const lines: OcrLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = cleanLine(raw);
    if (line.length === 0) continue;
    lines.push({ text: line }); // no confidence — conservative review policy
  }
  return {
    recognized_text: lines.map((l) => l.text).join('\n'),
    lines,
    source_metadata: { provider: GEMINI_OCR_PROVIDER, model },
  };
}

interface GeminiOcrCandidate {
  content?: { parts?: Array<{ text?: string; thought?: boolean }> };
}

interface GeminiOcrResponseBody {
  candidates?: GeminiOcrCandidate[];
  promptFeedback?: { blockReason?: string };
}

/** Join the candidate's visible text parts — thought parts are never treated
 *  as the transcription. */
function candidateTranscription(candidate?: GeminiOcrCandidate): string {
  const parts = candidate?.content?.parts ?? [];
  return parts
    .filter((p) => p.thought !== true && typeof p.text === 'string')
    .map((p) => p.text as string)
    .join('');
}

export class GeminiVisionOcrAdapter implements OcrAdapter {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(env: Record<string, string | undefined>) {
    this.apiKey = env.GEMINI_API_KEY ?? '';
    this.model = geminiOcrModel(env);
    this.baseUrl = geminiOcrBaseUrl(env);
    this.timeoutMs = geminiOcrTimeoutMs(env);
    this.maxRetries = geminiOcrMaxRetries(env);
  }

  async recognize(image: Uint8Array, contentType: string): Promise<OcrResult> {
    if (!this.apiKey) {
      throw new OcrProviderError(
        'GEMINI_API_KEY is not set (Q10 Gemini Vision credential missing)',
      );
    }
    const dataBase64 = Buffer.from(image).toString('base64');

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
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
                {
                  role: 'user',
                  parts: [
                    { text: GEMINI_OCR_PROMPT },
                    { inlineData: { mimeType: contentType, data: dataBase64 } },
                  ],
                },
              ],
              generationConfig: { temperature: 0 },
            }),
            signal: controller.signal,
          },
        );
        if (response.status === 401 || response.status === 403 || response.status === 400) {
          throw new OcrProviderError(
            `Gemini Vision rejected the request (HTTP ${response.status}) — check GEMINI_MODEL/key`,
          );
        }
        if (response.status === 429 || response.status >= 500) {
          throw new OcrProviderError(`Gemini Vision HTTP ${response.status} (transient)`);
        }
        if (!response.ok) {
          throw new OcrProviderError(`Gemini Vision HTTP ${response.status}`);
        }
        const body = (await response.json()) as GeminiOcrResponseBody;
        // A provider-policy block cannot succeed on retry — permanent no-retry.
        if (body.promptFeedback?.blockReason) {
          throw new OcrProviderError(
            `Gemini blocked the image (${body.promptFeedback.blockReason})`,
          );
        }
        const text = candidateTranscription(body.candidates?.[0]);
        // Empty (or whitespace-only) transcription is a VALID outcome → the
        // intake maps it to OCR_UNREADABLE (422); never thrown here.
        return normalizeGeminiResponse(text, this.model);
      } catch (err) {
        if (err instanceof OcrProviderError) throw err;
        const isRetryable = attempt < this.maxRetries;
        if (!isRetryable) {
          if (err instanceof Error && err.name === 'AbortError') {
            throw new OcrTimeoutError(`Gemini Vision timed out after ${this.timeoutMs}ms`);
          }
          throw new OcrProviderError('Gemini Vision unavailable', err);
        }
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
      } finally {
        clearTimeout(timer);
      }
    }
    throw new OcrProviderError('Gemini Vision retries exhausted');
  }
}
