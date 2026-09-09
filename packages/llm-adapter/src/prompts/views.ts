// D-15 (P3-1): per-view prompt specs. Views 1–7 are LLM views — their ROLE /
// TASK / OUTPUT SCHEMA / rules text is pinned to docs/Recipe_Systems_Analysis_Prompts.md
// (provenance per spec). Views 8–9 are DETERMINISTIC (Deterministic_Views doc) —
// no prompt text exists and none is invented (D-15C).
//
// D-15D: each view spec carries the per-mode focus from the Recipe_Systems §7
// "Home vs chef (all views)" table — the canonical home/chef difference per view.
//
// A-15 note: the OUTPUT SCHEMA text here is what the model is told to emit;
// the ENFORCED contract is the frozen packages/schemas VIEW_SCHEMAS (see
// prompts/validate.ts) — conformance is proven by the D-15 test suite, not by
// reading this file.

import { AnalysisMode } from '@recipe-systems/schemas';
import { systemPromptFor } from './system';

export type ViewNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface ViewPromptSpec {
  view: ViewNumber;
  kind: 'llm' | 'deterministic';
  /** docs/Recipe_Systems_Analysis_Prompts.md section (LLM views). */
  provenance: string;
  /** LLM views only: the user prompt (ROLE/TASK/OUTPUT SCHEMA/rules). */
  prompt?: string;
  /** Recipe_Systems §7 table — canonical per-mode focus for this view. */
  modeFocus: { home: string; chef: string };
}

export const VIEW_PROMPT_SPECS: Record<ViewNumber, ViewPromptSpec> = {
  1: {
    view: 1,
    kind: 'llm',
    provenance: 'Analysis Prompts §2',
    prompt: `ROLE: You are a culinary function analyst. Your only job is to explain what
each ingredient DOES in the dish — not how it tastes, not when it's added.

TASK: For every entry in structured_recipe.ingredients, state:
(a) its functional role, (b) what changes if it were omitted.
Then group ingredients into functional role clusters (e.g. body/richness,
sour, heat, aroma, texture).

OUTPUT SCHEMA:
{
  "items": [
    { "ingredient_id": "string", "job": "string", "if_omitted": "string",
      "tag": "CARD" | "METHOD" | "INFERRED" | "ASSUMED" }
  ],
  "role_groups": [
    { "role": "string", "ingredient_ids": ["string"] }
  ]
}

SCOPE BOUNDARY: Do not comment on taste-pillar balance — that is View 2's
job. Do not sequence steps — that is View 3's job.

RULES: Ingredients that are structurally distinct on the card (same
ingredient, different jobs, different confirmed_sense) stay SEPARATE entries
with different ids — never merge them for tidiness.`,
    modeFocus: {
      home: 'Why each ingredient exists.',
      chef: 'Job + failure if omitted.',
    },
  },
  2: {
    view: 2,
    kind: 'llm',
    provenance: 'Analysis Prompts §3',
    prompt: `ROLE: You are a taste-balance analyst. Score contribution to each pillar:
salt, fat, acid, heat, bitter, sweet, aroma, umami, earth/round/body.

TASK: For each pillar present in this dish, name the ingredient(s)
responsible and what happens if that pillar were missing. You are NOT
required to agree with View 1's importance ranking — score strictly by
which ingredient most directly delivers that specific pillar.

OUTPUT SCHEMA:
{
  "pillars": [
    { "pillar": "string", "source_ingredient_ids": ["string"],
      "if_missing": "string", "tag": "CARD" | "METHOD" | "INFERRED" }
  ],
  "blind_spot_notes": [
    { "ingredient_id": "string", "note": "string" }
  ]
}

CRITICAL BEHAVIOUR — DO NOT "FIX" THIS: A "bridge" ingredient (e.g.
coriander, cumin, turmeric) may not cleanly own any single pillar even
though View 1 calls it structurally important. This is a KNOWN, REQUIRED
disagreement between views — record it in blind_spot_notes, do not inflate
its pillar score to make the views agree. Fenugreek is the counter-example:
it DOES cleanly own "bitter" — do not under-report it the same way.`,
    modeFocus: {
      home: 'Friendly balance table.',
      chef: 'Diagnostic only. Missing columns called out.',
    },
  },
  3: {
    view: 3,
    kind: 'llm',
    provenance: 'Analysis Prompts §4',
    prompt: `ROLE: You are a process sequencer. You determine order of operations and
sensory checkpoints — never a script assembled from general knowledge of
"how this type of dish is usually made" unless method_source.matched=true
or a named family match exists.

TASK: Break the cooking process into stages. For each stage: the action,
a sensory CUE (not just a clock duration), and duration if known.

OUTPUT SCHEMA:
{
  "status": "COMPLETE" | "INCOMPLETE",
  "stages": [
    { "stage_name": "string", "action": "string", "cue": "string",
      "duration": "string" | "UNKNOWN", "tag": "CARD" | "METHOD" | "INFERRED" }
  ],
  "incomplete_reason": "string | null"
}

HARD GATE: If method_source.matched is false AND no confident family/style
match can be named, set status="INCOMPLETE", leave stages minimal or empty,
and populate incomplete_reason. Do NOT fabricate a plausible sequence or
invent step timing to fill the gap. A wrong-but-confident sequence is worse
than an honest INCOMPLETE.`,
    modeFocus: {
      home: 'Narrative walkthrough.',
      chef: 'Sequence, heat, cue, failure.',
    },
  },
  4: {
    view: 4,
    kind: 'llm',
    provenance: 'Analysis Prompts §5',
    prompt: `ROLE: You are a substitution advisor working only from what's structurally
present, not a general recipe-improvement assistant.

TASK: For each ingredient, propose at most ONE realistic substitute and the
concrete flavour/texture consequence of making that swap.

OUTPUT SCHEMA:
{
  "substitutions": [
    { "ingredient_id": "string", "substitute": "string",
      "consequence": "string", "tag": "INFERRED" }
  ]
}

BOUNDARY: Only substitute ingredients that exist in structured_recipe. Do
not propose additions, upgrades, or "you could also add X" — this view
answers "what if I don't have X," not "how to improve the dish."`,
    modeFocus: {
      home: 'What you can skip.',
      chef: 'Structural / modular / identity-shift grid.',
    },
  },
  5: {
    view: 5,
    kind: 'llm',
    provenance: 'Analysis Prompts §6',
    prompt: `ROLE: You are a food-technique cartographer, not a food writer. You compare
structural and technique evidence between regional variants. You do not
write about culture, soul, memory, or identity — only what differs in
ingredients and method.

TASK: Identify the most likely regional/style family this recipe belongs
to based on ingredient and method evidence. Contrast it with 1-2
structurally similar but distinct regional variants, citing the specific
ingredient/technique differences (not vague cultural description).

OUTPUT SCHEMA:
{
  "family": "string",
  "architecture": "string",
  "confidence": "high" | "medium" | "low",
  "not_this": [
    { "variant": "string", "key_difference": "string" }
  ],
  "needs_review": true,
  "tag": "INFERRED"
}

FORBIDDEN LANGUAGE — reject and rewrite if any of this appears:
"soul of", "heart of", "authentic", "traditional heritage", "grandmother's",
any sentence describing emotion, memory, nostalgia, or identity rather than
a technique/ingredient fact.

needs_review is ALWAYS true for this view's output — it must be gated by a
human reviewer before being shown to end users (product rule G2). This is
not optional and does not change based on confidence level.`,
    modeFocus: {
      home: 'Story of the coast.',
      chef: 'Neighbour dishes and the swap that moves the border.',
    },
  },
  6: {
    view: 6,
    kind: 'llm',
    provenance: 'Analysis Prompts §7',
    prompt: `ROLE: You are a ratio extractor. You report only ratios computable directly
from stated quantities ("quantity") — you do not estimate a ratio when one
side is imprecise.

TASK: Extract structurally significant ratios (e.g. spice-to-spice,
protein-to-starch, fat-to-acid) from structured_recipe, and flag which ones
are load-bearing for the dish's identity (i.e., changing them changes what
dish this is).

OUTPUT SCHEMA:
{
  "ratios": [
    { "components": "string", "ratio": "string", "structural": "boolean",
      "tag": "CARD" }
  ],
  "unresolvable": [
    { "components": "string", "reason": "string", "tag": "UNKNOWN" }
  ]
}

HARD RULE: If either side of a ratio has no "quantity" (e.g. "to taste,"
"as required," "half shell," "lemon size"), do NOT estimate it — move it to
"unresolvable" with tag UNKNOWN. Never output a ratio tag other than CARD;
if you can't compute it directly from stated "quantity", it doesn't belong
in "ratios".`,
    modeFocus: {
      home: 'Prose about proportions.',
      chef: 'Working ratios against 500g fish.',
    },
  },
  7: {
    view: 7,
    kind: 'llm',
    provenance: 'Analysis Prompts §8',
    prompt: `ROLE: You explain distinctiveness using only evidence already established by
View 1 (function) and View 3 (process) — you do not introduce new culinary
claims here.

TASK: Name 1-3 elements that make this dish distinctive, each grounded in a
specific function or process fact already established elsewhere in the
analysis.

OUTPUT SCHEMA:
{
  "status": "COMPLETE" | "INCOMPLETE",
  "memorable_elements": [
    { "element": "string", "grounded_in": "string", "tag": "INFERRED" }
  ]
}

DEPENDENCY GATE: If View 3's status is INCOMPLETE (no known process), you
MUST also output status="INCOMPLETE" with an empty or minimal
memorable_elements list. You cannot make a technique-based memorability
claim about a process you don't actually know.`,
    modeFocus: {
      home: '“Tastes better tomorrow”.',
      chef: 'Texture stack + hold physics.',
    },
  },
  8: {
    view: 8,
    kind: 'deterministic',
    provenance: 'Recipe_Systems_Deterministic_Views.md §2',
    modeFocus: {
      home: 'Plain conflicts.',
      chef: 'Allergen brief + cannot-guarantee list.',
    },
  },
  9: {
    view: 9,
    kind: 'deterministic',
    provenance: 'Recipe_Systems_Deterministic_Views.md §3',
    modeFocus: {
      home: '“Coconut-and-fish dense”.',
      chef: 'Assumption log + bands.',
    },
  },
};

export const LLM_VIEWS: ViewNumber[] = [1, 2, 3, 4, 5, 6, 7];

/** D-15C: deterministic views have no prompt — D-17 computes them, never calls the LLM. */
export function isLlmView(view: ViewNumber): boolean {
  return VIEW_PROMPT_SPECS[view].kind === 'llm';
}

/**
 * D-15: assemble the full prompt pair for one LLM view + mode.
 * The user prompt = view spec + the canonical per-mode focus line (§7 table);
 * the system prompt = shared lens + mode overlay (systemPromptFor).
 */
export function buildViewPrompt(
  view: ViewNumber,
  mode: AnalysisMode,
): { system: string; user: string } {
  const spec = VIEW_PROMPT_SPECS[view];
  if (spec.kind !== 'llm' || !spec.prompt) {
    throw new Error(`view ${view} is deterministic — no LLM prompt (${spec.provenance})`);
  }
  return {
    system: systemPromptFor(mode),
    user: `${spec.prompt}\n\nMODE FOCUS (${mode}): ${spec.modeFocus[mode]}`,
  };
}
