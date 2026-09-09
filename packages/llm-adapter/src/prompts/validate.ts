// D-15 (P3-1): output validation — the single parse gate every LLM view payload
// passes through before it is returned or stored (Analysis Prompts "Notes on
// execution": "All output is validated against a Zod schema in analysis/ before
// it is returned or stored").
//
// D-15E (HANDOFF §5): the worker's QG4 "invalid schema → regenerate" cell keys
// off this exact function (D-16/D-17 consume it). A malformed payload returns
// { ok: false, errors } — it is never published.

import { VIEW_SCHEMAS, View1Payload, View2Payload, View3Payload, View4Payload, View5Payload, View6Payload, View7Payload, View8Payload, View9Payload } from '@recipe-systems/schemas';
import type { ViewNumber } from './views';
import { isLlmView } from './views';

export type ViewPayload =
  | View1Payload
  | View2Payload
  | View3Payload
  | View4Payload
  | View5Payload
  | View6Payload
  | View7Payload
  | View8Payload
  | View9Payload;

export type ParseViewResult =
  | { ok: true; view: ViewNumber; data: ViewPayload }
  | { ok: false; view: ViewNumber; errors: string[] };

/**
 * Validate one view's raw model output against its frozen schema (.strict()).
 * Views 8/9 are deterministic — their payloads still validate here (the
 * worker validates ALL views through the same gate before storage).
 */
export function parseViewOutput(view: ViewNumber, raw: unknown): ParseViewResult {
  const schema = VIEW_SCHEMAS[`view_${view}` as keyof typeof VIEW_SCHEMAS];
  const result = schema.safeParse(raw);
  if (result.success) {
    return { ok: true, view, data: result.data as ViewPayload };
  }
  return {
    ok: false,
    view,
    errors: result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
  };
}

/** Convenience: every LLM view validates against its schema — used by tests to
 *  prove the prompt-set ↔ frozen-schema conformance (A-15 BLOCKER cell). */
export const LLM_VIEW_KINDS = { isLlmView };
