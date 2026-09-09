// D-15 (P3-1): the prompt set version — the reproducibility pin stamped into
// `analysis.prompt_version` by the worker (D-17). This package is the single
// source of truth for the value.
//
// D-15B (HANDOFF §5): 'v2' is the canonical version of
// docs/Recipe_Systems_Analysis_Prompts.md (header: "Status: v2 · Date: 02 Sep 2026").
// Bumping the prompt set (text or structure) = a new dispatch unit that changes
// this constant — never a silent edit. ERD: VARCHAR(64), satisfied.

export const PROMPT_VERSION = 'v2';

/** Human-readable provenance of the prompt set this package pins. */
export const PROMPT_VERSION_PROVENANCE =
  'docs/Recipe_Systems_Analysis_Prompts.md v2 (02 Sep 2026) — LLM views 1–7; ' +
  'views 8–9 deterministic (docs/Recipe_Systems_Deterministic_Views.md v2).';
