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

import { AnalysisMode, StructuredRecipeInput } from '@recipe-systems/schemas';
import { buildViewPrompt, isLlmView, ViewNumber } from './prompts/views';
import { parseViewOutput, ParseViewResult } from './prompts/validate';

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
}

/** The provider-neutral interface. Implementations normalize vendor responses
 *  to plain JSON before returning — validation happens in parseViewOutput. */
export interface LlmAdapter {
  generate(request: LlmGenerateRequest): Promise<unknown>;
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

export { PROMPT_VERSION, PROMPT_VERSION_PROVENANCE } from './prompts/version';
export { SHARED_SYSTEM_PROMPT, HOME_MODE_OVERLAY, CHEF_MODE_OVERLAY, systemPromptFor } from './prompts/system';
export { VIEW_PROMPT_SPECS, LLM_VIEWS, buildViewPrompt, isLlmView } from './prompts/views';
export type { ViewPromptSpec, ViewNumber } from './prompts/views';
export { parseViewOutput } from './prompts/validate';
export type { ParseViewResult, ViewPayload } from './prompts/validate';

export const LLM_ADAPTER_SEAM =
  'provider-neutral (Tech Stack §10; Q9 OPEN — benchmark wks 1–4; no provider pinned in-repo)';
