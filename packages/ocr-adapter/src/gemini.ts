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
 * Total wall-clock ceiling for one OCR call (all attempts + backoff). OCR runs
 * synchronously on the intake request path behind a proxy, so the retry budget
 * must stay well under the proxy/client ceiling — the per-attempt timeout alone
 * does not bound the call (8 attempts of exponential backoff already sum to
 * ~128s). Kept deliberately below the ~30s edge cut observed in production.
 */
export function geminiOcrTotalBudgetMs(env: Record<string, string | undefined>): number {
  return Math.max(0, Number(env.OCR_TOTAL_BUDGET_MS ?? 25_000));
}

/**
 * The transcription contract (Q10): text ONLY as visibly written — identical
 * to the DeepSeek Vision contract so switching providers never changes what
 * the intake sees. Illegible words become "[unreadable]", never a guess.
 */
export const GEMINI_OCR_PROMPT = [
  'You are a recipe-card transcription engine. Read the card image and return STRICT JSON',
  '(no markdown fences, no commentary) with exactly this shape:',
  '{ "title": "...", "ingredients": [ { "name": "...", "amount": "..." } ], "method_steps": [ "...", "..." ] }',
  '',
  'RULES (non-negotiable):',
  '- Transcribe EXACTLY the text visibly written; never correct, translate, infer, or "improve" it.',
  '- Put the recipe name (the dish title at the top of the card) into "title". If the card has no title, use "title": "".',
  '- For "title", omit any leading list/serial number — write "Parippu Curry", not "1. Parippu Curry".',
  '- Split every ingredient into its name and its amount: "Dal (split green gram, cherupayar parippu): 1 cup" becomes name "Dal (split green gram, cherupayar parippu)" and amount "1 cup".',
  '- Preserve amounts exactly as written (e.g. "1/2 tsp", "500 g", "2 tbsp", "to taste"). If an ingredient has no amount, use "amount": "".',
  '- Preserve distinctions between similar ingredients: "Fenugreek Seeds" and "Fenugreek Powder" are DIFFERENT entries — never merge them.',
  '- Put every step of the METHOD section into method_steps, one string per step, in order. Do NOT put ingredients in method_steps, and do NOT put method steps in ingredients.',
  '- Section headings like "INGREDIENTS", "For tempering", "METHOD" are headers — skip them (do not emit them as ingredients or steps).',
  '- If a word is illegible, write "[unreadable]".',
  '- Output ONLY the JSON object.',
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

/** Strip a leading list serial from a transcribed dish title so a numbered
 *  menu card yields the bare name: "1. Parippu Curry" → "Parippu Curry",
 *  "No. 1 Parippu Curry" → "Parippu Curry". Names like "3-Cheese Pasta" are
 *  left intact (a dash must be followed by whitespace to count as a marker). */
export function stripSerialPrefix(title: string): string {
  return title
    // "S.No 1:" / "No. 1" / "Sl.No 1)" style prefixes
    .replace(
      /^(?:s\.?\s*no\.?|sl\.?\s*no\.?|sr\.?\s*no\.?|serial\s*no\.?|no\.?)\s*[:.\-–]?\s*\d+\s*[.):\-–]?\s*/i,
      '',
    )
    // bare number markers: "1." / "1)" / "1:" / "1 - " (space after the dash)
    .replace(/^\s*\d+\s*(?:[.):]|\s*[-–]\s+)\s*/, '')
    .trim();
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

/** The structured shape the prompt requests (best-effort — the JSON parse is
 *  validated loosely and a malformed payload falls back to plain lines). */
interface GeminiStructuredOcr {
  title?: unknown;
  ingredients?: Array<{ name?: unknown; amount?: unknown }>;
  method_steps?: unknown[];
}

function asText(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** Best-effort JSON extraction from the assistant text (tolerates code fences). */
export function parseGeminiStructuredOcr(text: string): GeminiStructuredOcr | null {
  const fenced = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(fenced.slice(start, end + 1)) as unknown;
    if (parsed && typeof parsed === 'object') return parsed as GeminiStructuredOcr;
  } catch {
    return null;
  }
  return null;
}

/** Normalize the structured JSON into OcrResult — ingredients split into name +
 *  amount; method steps kept out of the ingredient list. */
export function normalizeGeminiStructured(parsed: GeminiStructuredOcr, model: string): OcrResult {
  const title = stripSerialPrefix(asText(parsed.title));
  const lines: OcrLine[] = [];
  for (const ing of parsed.ingredients ?? []) {
    const name = asText(ing?.name).trim();
    if (name.length === 0) continue;
    const amount = asText(ing?.amount).trim();
    lines.push({ text: name, kind: 'ingredient', amountText: amount.length > 0 ? amount : null });
  }
  for (const step of parsed.method_steps ?? []) {
    const text = asText(step).trim();
    if (text.length === 0) continue;
    lines.push({ text, kind: 'method' });
  }
  const body = lines
    .map((l) => (l.kind === 'ingredient' && l.amountText ? `${l.text}: ${l.amountText}` : l.text))
    .join('\n');
  const recognized_text = title ? `${title}\n${body}` : body;
  return {
    recognized_text,
    lines,
    source_metadata: { provider: GEMINI_OCR_PROVIDER, model },
    title: title.length > 0 ? title : null,
  };
}

interface GeminiOcrCandidate {
  content?: { parts?: Array<{ text?: string; thought?: boolean }> };
}

interface GeminiOcrResponseBody {
  candidates?: GeminiOcrCandidate[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    totalTokenCount?: number;
    promptTokensDetails?: Array<{ modality?: string; tokenCount?: number }>;
  };
}

/** Normalize the provider's usageMetadata into the OcrResult telemetry shape
 *  (tokens only — never content, never secrets). */
function geminiOcrUsage(u?: GeminiOcrResponseBody['usageMetadata']): OcrResult['usage'] {
  if (!u || typeof u.totalTokenCount !== 'number') return undefined;
  const imageTokens =
    (u.promptTokensDetails ?? []).find((d) => d.modality === 'IMAGE')?.tokenCount ?? 0;
  return {
    promptTokens: u.promptTokenCount ?? 0,
    imageTokens,
    outputTokens: u.candidatesTokenCount ?? 0,
    thoughtTokens: u.thoughtsTokenCount ?? 0,
    totalTokens: u.totalTokenCount,
  };
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
  private readonly totalBudgetMs: number;

  constructor(env: Record<string, string | undefined>) {
    this.apiKey = env.GEMINI_API_KEY ?? '';
    this.model = geminiOcrModel(env);
    this.baseUrl = geminiOcrBaseUrl(env);
    this.timeoutMs = geminiOcrTimeoutMs(env);
    this.maxRetries = geminiOcrMaxRetries(env);
    this.totalBudgetMs = geminiOcrTotalBudgetMs(env);
  }

  async recognize(image: Uint8Array, contentType: string): Promise<OcrResult> {
    if (!this.apiKey) {
      throw new OcrProviderError(
        'GEMINI_API_KEY is not set (Q10 Gemini Vision credential missing)',
      );
    }
    const dataBase64 = Buffer.from(image).toString('base64');
    // Bound the WHOLE call, not just one attempt: the retry ladder (500ms·2^n)
    // plus repeated timeouts otherwise stretch one upload into minutes.
    const deadline = Date.now() + this.totalBudgetMs;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(this.timeoutMs, remaining));
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
        const usage = geminiOcrUsage(body.usageMetadata);
        // Empty (or whitespace-only) transcription is a VALID outcome → the
        // intake maps it to OCR_UNREADABLE (422); never thrown here.
        if (text.trim().length === 0) {
          return { ...normalizeGeminiResponse(text, this.model), usage };
        }
        // Prefer the structured parse (ingredients split name/amount, method
        // steps separated). A non-JSON / malformed payload degrades to the
        // whole-line transcription so intake still gets the raw text.
        const structured = parseGeminiStructuredOcr(text);
        if (structured) {
          return { ...normalizeGeminiStructured(structured, this.model), usage };
        }
        return { ...normalizeGeminiResponse(text, this.model), usage };
      } catch (err) {
        if (err instanceof OcrProviderError) throw err;
        const delay = 500 * 2 ** attempt;
        // Retry only when BOTH the attempt count and the wall-clock budget allow.
        const isRetryable = attempt < this.maxRetries && Date.now() + delay < deadline;
        if (!isRetryable) {
          if (err instanceof Error && err.name === 'AbortError') {
            throw new OcrTimeoutError(`Gemini Vision timed out after ${this.timeoutMs}ms`);
          }
          throw new OcrProviderError('Gemini Vision unavailable', err);
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
      } finally {
        clearTimeout(timer);
      }
    }
    throw new OcrProviderError('Gemini Vision retries exhausted');
  }
}
