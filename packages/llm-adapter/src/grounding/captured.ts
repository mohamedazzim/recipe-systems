// D-16 (P3-2): the captured-state reference vocabulary — what the grounding
// validator is allowed to resolve against (D-16B/C, HANDOFF §5).
//
// Q1 stays OPEN: the captured state is the frozen StructuredRecipeInput passed
// in as a PARAMETER (ADR §6: the worker captures it at enqueue). No persistence
// model is invented here. Dictionary/alias resolution (Q5, Track R) plugs into
// this vocabulary later — the fields exist on the frozen schema.

import { StructuredRecipeInput } from '@recipe-systems/schemas';

export interface CapturedVocabulary {
  ingredientIds: Set<string>;
  /** Per line: name tokens the model may use in claim text (display_name parts,
   *  canonical_name, confirmed_sense) — lowercased. */
  nameTokensByLine: Map<string, Set<string>>;
  /** All name tokens across lines (membership check for ABSENT-scope rules). */
  allNameTokens: Set<string>;
  methodStepIds: Set<string>;
  explicitlyAbsent: string[];
}

const NAME_PART_SEPARATOR = /—|–|-|\(|\)|,|:/;

function tokensOf(value: string): string[] {
  return value
    .toLowerCase()
    .split(NAME_PART_SEPARATOR)
    .map((part) => part.trim().replace(/\s+/g, ' '))
    .filter((part) => part.length >= 2);
}

/** D-16C: build the mechanical vocabulary from the captured state. */
export function buildVocabulary(captured: StructuredRecipeInput): CapturedVocabulary {
  const ingredientIds = new Set<string>();
  const nameTokensByLine = new Map<string, Set<string>>();
  const allNameTokens = new Set<string>();
  const methodStepIds = new Set<string>();

  for (const line of captured.structured_recipe.ingredients) {
    ingredientIds.add(line.id);
    const tokens = new Set<string>([
      ...tokensOf(line.display_name),
      ...(line.canonical_name ? tokensOf(line.canonical_name) : []),
      ...(line.confirmed_sense ? tokensOf(line.confirmed_sense) : []),
    ]);
    // The primary name (text before the amount separator) is the strongest token.
    tokens.add(line.display_name.split(NAME_PART_SEPARATOR)[0].trim().toLowerCase());
    nameTokensByLine.set(line.id, tokens);
    for (const t of tokens) allNameTokens.add(t);
  }
  for (const step of captured.structured_recipe.method_steps) {
    methodStepIds.add(step.id);
  }

  return {
    ingredientIds,
    nameTokensByLine,
    allNameTokens,
    methodStepIds,
    explicitlyAbsent: captured.structured_recipe.explicitly_absent,
  };
}

/** Does the text mention one of the given tokens (word-boundary, case-insensitive)? */
export function textMentions(text: string, tokens: Iterable<string>): string | null {
  const lower = text.toLowerCase();
  for (const token of tokens) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`).test(lower)) return token;
  }
  return null;
}

/** D-16E: which name tokens of the cited line appear in the claim text. */
export function citedTokensInText(
  vocab: CapturedVocabulary,
  citedId: string,
  text: string,
): string[] {
  const tokens = vocab.nameTokensByLine.get(citedId);
  if (!tokens) return [];
  const lower = text.toLowerCase();
  return [...tokens].filter((t) => {
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`).test(lower);
  });
}
