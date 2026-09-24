// Provider-neutral LLM adapter — Tech Stack §10.
//
// D-15 (P3-1) seam (HANDOFF §5 D-15F/H): the worker calls this internal
// interface, never vendor SDKs; vendor responses are normalized before
// entering the domain (ADR §19). Provider selection stays Q9 (OPEN) — no
// provider is pinned here and no credentials exist in this package. The
// MockLlmAdapter is the deterministic CI stub; a real provider adapter lands
// only inside the benchmark harness (TEST_PLAN §4).
//
// `recipe_snapshot` stays `unknown` at this seam — Q1 (snapshot persistence
// mechanism) is OPEN and D-17 builds to the labeled assumption (SCAFFOLD §7).

import { AnalysisMode, DocumentExtraction, DocumentExtractionSchema, SERVINGS_MAX, SERVINGS_MIN, StructuredRecipeInput } from '@recipe-systems/schemas';
import { buildViewPrompt, isLlmView, ViewNumber } from './prompts/views';
import { parseViewOutput, ParseViewResult } from './prompts/validate';
import { GroundingVerdict, validateViewGrounding } from './grounding/validator';

export { EXTRACTION_PROMPT_VERSION } from './prompts/extraction';
export {
  SERVINGS_PROMPT_VERSION,
  SERVINGS_SYSTEM_PROMPT,
  buildServingsUserPrompt,
} from './prompts/servings';
export {
  VIDEO_PROMPT_VERSION,
  VIDEO_PROPOSAL_SYSTEM_PROMPT,
  buildVideoProposalUserPrompt,
  VIDEO_CHAPTERS_SYSTEM_PROMPT,
  buildVideoChaptersUserPrompt,
} from './prompts/video';
export { resolveLlmAdapter } from './resolve';

export interface LlmGenerateRequest {
  /** Which view the model must produce (1–9; 8/9 are deterministic — D-17 never calls the LLM for them). */
  view: ViewNumber;
  /** Analysis mode — drives the system prompt (home explains / chef briefs). */
  mode: AnalysisMode;
  /** Captured structured-recipe state (Q1 OPEN: shape pinned at the seam only). */
  recipe_snapshot: StructuredRecipeInput | unknown;
  /** Reproducibility pins — stamped into analysis rows by the worker. */
  prompt_version: string;
  model_version: string;
  /**
   * D-16 corrected retry: the correction instruction re-fed to the model when a
   * grounding failure is regenerated (the `formatCorrection` text, via
   * `groundingAttempt`). Absent on a first attempt, and absent on the
   * parse-failure retry — there are no violations to correct against there.
   */
  correction?: string;
}

/** Phase 3: the extraction request — raw document text in, parsed JSON out. */
export interface RecipeExtractionRequest {
  /** The source-faithful raw text from a document_ingestion row. */
  source_text: string;
  /** Reproducibility pins (the EXTRACTION_PROMPT_VERSION + provider model). */
  prompt_version: string;
  model_version: string;
}

/** RS-US servings estimation — ingredient list in, {"servings": number|null} out. */
export interface ServingsPredictionRequest {
  /** The recipe's ingredient lines (display name + amount text). */
  ingredient_lines: Array<{ name: string; amount: string | null }>;
  /** Reproducibility pins (SERVINGS_PROMPT_VERSION + provider model). */
  prompt_version: string;
  model_version: string;
}

/** Parse a raw servings-prediction output into a validated estimate. */
export type ParseServingsPredictionResult =
  | { ok: true; servings: number | null }
  | { ok: false; errors: string[] };

export function parseServingsPrediction(raw: unknown): ParseServingsPredictionResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ['output is not an object'] };
  }
  const obj = raw as Record<string, unknown>;
  if (!('servings' in obj)) {
    return { ok: false, errors: ['servings: required'] };
  }
  const servings = obj.servings;
  if (servings === null) {
    return { ok: true, servings: null };
  }
  if (
    typeof servings !== 'number' ||
    !Number.isInteger(servings) ||
    servings < SERVINGS_MIN ||
    servings > SERVINGS_MAX
  ) {
    return { ok: false, errors: [`servings: must be an integer ${SERVINGS_MIN}–${SERVINGS_MAX} or null`] };
  }
  return { ok: true, servings };
}

/** RS-US video (chef mode): find a real YouTube video for the dish. The answer
 *  is a CANDIDATE only — the caller verifies it exists before storing/showing. */
export interface VideoProposalRequest {
  /** The dish to find a video for (recipe name / identification family). */
  dish: string;
  /** The captured ingredient display names (context for the search). */
  ingredients: string[];
  prompt_version: string;
  model_version: string;
}

/** RS-US video: read the ATTACHED video into timestamped cooking steps. */
export interface VideoChaptersRequest {
  /** A YouTube watch URL — sent to the provider as a video file part. */
  video_url: string;
  dish: string;
  prompt_version: string;
  model_version: string;
}

export interface VideoChapter {
  /** "mm:ss" or "h:mm:ss", exactly as the provider reported it. */
  start: string;
  /** The same timestamp in seconds (the UI seeks with this). */
  seconds: number;
  title: string;
  summary: string;
}

/** The 11-character YouTube id inside any common YouTube URL form. */
export function youtubeIdFromUrl(url: string): string | null {
  const match = url.match(
    /(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)([A-Za-z0-9_-]{11})/,
  );
  return match ? match[1] : null;
}

/** "mm:ss" / "h:mm:ss" → seconds. Null when the timestamp is malformed. */
export function timestampSeconds(start: string): number | null {
  const parts = start.trim().split(':');
  if (parts.length < 2 || parts.length > 3) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0)) return null;
  return nums.length === 2 ? nums[0] * 60 + nums[1] : nums[0] * 3600 + nums[1] * 60 + nums[2];
}

export type ParseVideoProposalResult =
  | { ok: true; video: { video_id: string; title: string } | null }
  | { ok: false; errors: string[] };

/** Validate a proposal. "No confident answer" (null) is a VALID outcome. */
export function parseVideoProposal(raw: unknown): ParseVideoProposalResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ['output is not an object'] };
  }
  const video = (raw as Record<string, unknown>).video;
  if (video === null) return { ok: true, video: null };
  if (typeof video !== 'object' || video === undefined) {
    return { ok: false, errors: ['video: required (object or null)'] };
  }
  const obj = video as Record<string, unknown>;
  const id =
    typeof obj.id === 'string'
      ? obj.id.trim()
      : typeof obj.url === 'string'
        ? youtubeIdFromUrl(obj.url)
        : null;
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) {
    return { ok: false, errors: ['video.id: an 11-character YouTube id is required'] };
  }
  const title = typeof obj.title === 'string' ? obj.title.trim() : '';
  return { ok: true, video: { video_id: id, title: title || id } };
}

export type ParseVideoChaptersResult =
  | { ok: true; chapters: VideoChapter[] }
  | { ok: false; errors: string[] };

/** Validate a chapter read. An empty list is valid ("the video is not a cook"). */
export function parseVideoChapters(raw: unknown): ParseVideoChaptersResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ['output is not an object'] };
  }
  const chapters = (raw as Record<string, unknown>).chapters;
  if (!Array.isArray(chapters)) return { ok: false, errors: ['chapters: required array'] };
  const out: VideoChapter[] = [];
  for (const [index, item] of chapters.entries()) {
    if (typeof item !== 'object' || item === null) {
      return { ok: false, errors: [`chapters.${index}: not an object`] };
    }
    const c = item as Record<string, unknown>;
    const start = typeof c.start === 'string' ? c.start.trim() : '';
    const seconds = start ? timestampSeconds(start) : null;
    const title = typeof c.title === 'string' ? c.title.trim() : '';
    const summary = typeof c.summary === 'string' ? c.summary.trim() : '';
    if (seconds === null) return { ok: false, errors: [`chapters.${index}.start: mm:ss required`] };
    if (!title) return { ok: false, errors: [`chapters.${index}.title: required`] };
    out.push({ start, seconds, title, summary });
  }
  return { ok: true, chapters: out };
}

/** Phase 3 extraction parse result — same ok/errors shape as parseViewOutput. */
export type ParseDocumentExtractionResult =
  | { ok: true; data: DocumentExtraction }
  | { ok: false; errors: string[] };

/** Validate a raw extraction output against the frozen DocumentExtractionSchema. */
export function parseDocumentExtraction(raw: unknown): ParseDocumentExtractionResult {
  const result = DocumentExtractionSchema.safeParse(raw);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  return {
    ok: false,
    errors: result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
  };
}

/** The provider-neutral interface. Implementations normalize vendor responses
 *  to plain JSON before returning — validation happens in parseViewOutput. */
export interface LlmAdapter {
  /** Non-secret telemetry identity (Q9-6) — provider label, never a key. */
  readonly providerName: string;
  /** Optional provenance pin stamped into analysis rows (e.g. deepseek:model). */
  readonly modelVersion?: string;
  generate(request: LlmGenerateRequest): Promise<unknown>;
  /** Phase 3: source-faithful structured recipe extraction (document text → parsed JSON). */
  extractRecipeText(request: RecipeExtractionRequest): Promise<unknown>;
  /** RS-US servings: estimate the serving count from an ingredient list. */
  predictServings(request: ServingsPredictionRequest): Promise<unknown>;
  /** RS-US video: propose a YouTube video for the dish (verified by the caller). */
  proposeRecipeVideo(request: VideoProposalRequest): Promise<unknown>;
  /** RS-US video: read the ATTACHED video into timestamped cooking steps. */
  describeVideoChapters(request: VideoChaptersRequest): Promise<unknown>;
}

/** The canonical prompt pair for a request — exposed so the benchmark harness
 *  (TEST_PLAN §4) and worker can log/compare exactly what a run sent. */
export function promptsForRequest(
  request: Pick<LlmGenerateRequest, 'view' | 'mode'>,
): { system: string; user: string } {
  if (!isLlmView(request.view)) {
    throw new Error(`view ${request.view} is deterministic — no LLM prompt`);
  }
  return buildViewPrompt(request.view, request.mode);
}

/**
 * Deterministic CI stub: fixture-driven, zero network, no provider.
 * Fixtures key by `view` + `mode`; unknown keys throw (never invent output).
 * Same key + same fixture → byte-identical output every run (A-15
 * reproducibility MAJOR contract — proven in mock-adapter.test.ts).
 */
export class MockLlmAdapter implements LlmAdapter {
  readonly providerName = 'mock';
  private readonly fixtures: Map<string, unknown>;

  constructor(fixtures: Array<{ view: ViewNumber; mode: AnalysisMode; output: unknown }> = []) {
    this.fixtures = new Map(fixtures.map((f) => [fixtureKey(f.view, f.mode), f.output]));
  }

  async generate(request: LlmGenerateRequest): Promise<unknown> {
    // The stub consumes the real prompt assembly path — a fixture-less or
    // malformed request must surface, never be papered over.
    const key = fixtureKey(request.view, request.mode);
    const output = this.fixtures.get(key);
    if (output === undefined) {
      throw new Error(
        `MockLlmAdapter: no fixture for view ${request.view} mode ${request.mode} ` +
          `(prompt_version ${request.prompt_version})`,
      );
    }
    // Determinism: serialize-free structured clone per call (no shared refs).
    return JSON.parse(JSON.stringify(output));
  }

  /** The analysis mock has no extraction fixture — extraction is a separate path. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async extractRecipeText(_request: RecipeExtractionRequest): Promise<unknown> {
    throw new Error('MockLlmAdapter: extraction is not supported (analysis fixtures only)');
  }

  /** The analysis mock has no servings fixture — estimation is a separate path. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async predictServings(_request: ServingsPredictionRequest): Promise<unknown> {
    throw new Error('MockLlmAdapter: servings prediction is not supported (analysis fixtures only)');
  }

  /** The analysis mock has no video fixture — the walkthrough is a separate path. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async proposeRecipeVideo(_request: VideoProposalRequest): Promise<unknown> {
    throw new Error('MockLlmAdapter: video proposal is not supported (analysis fixtures only)');
  }

  /** The analysis mock has no video fixture — the walkthrough is a separate path. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async describeVideoChapters(_request: VideoChaptersRequest): Promise<unknown> {
    throw new Error('MockLlmAdapter: video chapters are not supported (analysis fixtures only)');
  }
}

function fixtureKey(view: ViewNumber, mode: AnalysisMode): string {
  return `view_${view}:${mode}`;
}

/** D-15E: validate-and-wrap helper the worker's QG4 regenerate cell will use —
 *  parse immediately after generate so invalid output is never stored. */
export async function generateValidated(
  adapter: LlmAdapter,
  request: LlmGenerateRequest,
): Promise<ParseViewResult> {
  const raw = await adapter.generate(request);
  return parseViewOutput(request.view, raw);
}

// ---------------------------------------------------------------------------
// D-16 (P3-2): the grounding stage — the single choke point every view output
// passes through (DISPATCH D-16 deliverable 3, A-16). The worker's per-view
// pipeline is: generate → parseViewOutput → validateViewGrounding → attempt
// decision (regenerate-once / INCOMPLETE). No view payload may be stored
// without a grounding verdict.
// ---------------------------------------------------------------------------

export interface GroundedGeneration {
  view: ViewNumber;
  mode: AnalysisMode;
  parse: ParseViewResult;
  /** Grounding verdict against the captured state (null when the parse failed —
   *  a malformed payload is rejected before grounding). */
  grounding: GroundingVerdict | null;
}

export async function generateGrounded(
  adapter: LlmAdapter,
  request: LlmGenerateRequest,
  captured: StructuredRecipeInput,
): Promise<GroundedGeneration> {
  const parse = await generateValidated(adapter, request);
  if (!parse.ok) {
    return { view: request.view, mode: request.mode, parse, grounding: null };
  }
  const grounding = validateViewGrounding(request.view, parse.data, captured);
  return { view: request.view, mode: request.mode, parse, grounding };
}

export { PROMPT_VERSION, PROMPT_VERSION_PROVENANCE } from './prompts/version';
export { SHARED_SYSTEM_PROMPT, HOME_MODE_OVERLAY, CHEF_MODE_OVERLAY, systemPromptFor } from './prompts/system';
export { VIEW_PROMPT_SPECS, LLM_VIEWS, buildViewPrompt, isLlmView } from './prompts/views';
export type { ViewPromptSpec, ViewNumber } from './prompts/views';
export { parseViewOutput } from './prompts/validate';
export type { ParseViewResult, ViewPayload } from './prompts/validate';
export {
  buildVocabulary,
  textMentions,
  citedTokensInText,
} from './grounding/captured';
export type { CapturedVocabulary } from './grounding/captured';
export {
  validateViewGrounding,
  validateClaimGrounding,
  validateClaimsGrounding,
} from './grounding/validator';
export type { GroundingVerdict, GroundingViolation } from './grounding/validator';
export { groundingAttempt, formatCorrection } from './grounding/attempts';
export type { GroundingAttemptAction } from './grounding/attempts';
export type { Claim } from '@recipe-systems/schemas';

export const LLM_ADAPTER_SEAM =
  'provider-neutral (Tech Stack §10; Q9 OPEN — benchmark wks 1–4; no provider pinned in-repo)';

export { DeepSeekLlmAdapter, extractJson, LlmPermanentProviderError, LlmTransientProviderError } from './deepseek-adapter';
export type { DeepSeekConfig } from './deepseek-adapter';
export { GeminiLlmAdapter, candidateText, retryAfterSeconds } from './gemini-adapter';
export type { GeminiConfig, GeminiThinkingLevel, GeminiUsage } from './gemini-adapter';
