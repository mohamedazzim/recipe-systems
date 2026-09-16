// D-25A (C7 / RS-US-18) — the deterministic substitution-preview classifier.
// Pure + deterministic: NO LLM, NO network, NO persistence, NO invention.
//
// It classifies ONE substitution that ALREADY EXISTS in the persisted View 4
// payload (the caller guarantees this invariant) into the three
// Recipe_Systems §6 View 4 classes, using ONLY persisted analysis evidence:
//
//   identity_shift — the substitute or the source ingredient is named in a
//                    persisted View 5 `not_this` neighbour (variant +
//                    key_difference): "walks to another coast or another recipe".
//   structural    — the source ingredient's persisted View 1 omission
//                    consequence states the dish breaks ("different dish or a
//                    broken one"), or the ingredient sits in a persisted
//                    View 6 `structural: true` ratio.
//   modular       — otherwise ("same family" — the neutral, least-claim class).
//
// Nothing is invented: when the persisted views carry no structural or
// identity-shift evidence, the swap is classified `modular` (same family)
// rather than fabricating a stronger claim. The substitute + consequence are
// always the persisted View 4 values, verbatim.

import type {
  View1Payload,
  View4Payload,
  View5Payload,
  View6Payload,
} from '@recipe-systems/schemas';

export type SubstitutionClass = 'structural' | 'modular' | 'identity_shift';

export interface SubstitutionPreviewInput {
  /** The persisted View 4 substitution (already verified to exist). */
  substitution: View4Payload['substitutions'][number];
  /** Source ingredient display name (read-only recipe line); may be absent. */
  ingredientName: string;
  view1: View1Payload | null;
  view5: View5Payload | null;
  view6: View6Payload | null;
}

/** Normalize for grounded text matching: case-fold, collapse hyphen/underscore
 *  and whitespace so "coconut-oil" matches "coconut oil". */
const norm = (s: string): string =>
  s.toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();

/** A View 1 `if_omitted` that states the DISH breaks (Recipe_Systems §6 View 4
 *  "Structural — different dish or a broken one"). */
const STRUCTURAL_OMISSION =
  /not this dish|different dish|broken|generic|flat|no richness|no sour|no body|loses the dish|thin .{0,24}stew/;

/** True when `term` is a non-empty substring of the normalized `text`. */
const mentioned = (text: string, term: string): boolean =>
  term.length > 0 && norm(text).includes(term);

export function classifySubstitution(input: SubstitutionPreviewInput): SubstitutionClass {
  const ing = norm(input.ingredientName);
  const sub = norm(input.substitution.substitute);

  // identity_shift — the persisted View 5 neighbours name this swap
  // ("walks to another coast or another recipe").
  for (const n of input.view5?.not_this ?? []) {
    const text = `${n.variant} ${n.key_difference}`;
    if (mentioned(text, ing) || mentioned(text, sub)) {
      return 'identity_shift';
    }
  }

  // structural — the persisted View 1 omission consequence says the dish
  // breaks ("different dish or a broken one").
  for (const item of input.view1?.items ?? []) {
    if (item.ingredient_id === input.substitution.ingredient_id) {
      if (STRUCTURAL_OMISSION.test(norm(item.if_omitted))) {
        return 'structural';
      }
    }
  }
  // structural — a persisted View 6 `structural: true` ratio names the swap.
  for (const ratio of input.view6?.ratios ?? []) {
    if (ratio.structural && (mentioned(ratio.components, ing) || mentioned(ratio.components, sub))) {
      return 'structural';
    }
  }

  // modular — same-family swap (the neutral, non-invented class).
  return 'modular';
}
