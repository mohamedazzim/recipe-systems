// D-16 (P3-2): the grounding validator — the no-invention enforcement layer
// (ADR §6, INV-10). Every ingredient reference must resolve against the
// captured structured recipe; unresolved positive/neutral references are
// grounding failures; the ABSENT rule is the only channel for missing items.
//
// Scope (D-16D..H, HANDOFF §5):
//   - structured ingredient_id references (views 1/2/4) resolve against
//     captured ids;
//   - claims resolve by tag: CARD/METHOD cite a captured id AND carry its
//     name token in the text (reworded-capture catch); ABSENT may never mark
//     a captured ingredient (MAJOR); INFERRED cites a named pattern;
//   - the explicitly_absent list is the sanctioned ABSENT channel — any
//     non-ABSENT mention of an absent-listed item is a failure (the
//     mechanical garlic catch for View 8/9 text);
//   - view 5's regional-contrast text describes OTHER variants (the prompt's
//     own few-shot) — no structured ids there, only the absent-channel scan
//     applies; the view stays human-gated (G2).
//   - unknown-word detection beyond the captured vocabulary is NOT built
//     (no canonical lexicon — dictionary = Q5, Track R).

import { Claim, StructuredRecipeInput } from '@recipe-systems/schemas';
import { ViewNumber } from '../prompts/views';
import { ViewPayload } from '../prompts/validate';
import { buildVocabulary, citedTokensInText, textMentions } from './captured';

export interface GroundingViolation {
  code:
    | 'UNRESOLVED_INGREDIENT_REFERENCE'
    | 'CLAIM_MISSING_SOURCE'
    | 'CLAIM_SOURCE_UNRESOLVED'
    | 'CLAIM_TEXT_MISMATCH'
    | 'ABSENT_FOR_CAPTURED'
    | 'ABSENT_ITEM_USED_WITHOUT_ABSENT_TAG'
    | 'NON_ABSENT_UNRESOLVED_REFERENCE';
  /** Human-readable line for the correction instruction / review record. */
  message: string;
  /** Where the violation was found (view number or 'claim'). */
  at: string;
}

export type GroundingVerdict =
  | { ok: true }
  | { ok: false; violations: GroundingViolation[] };

// ---------------------------------------------------------------------------
// View-level: structured references + absent-channel scan
// ---------------------------------------------------------------------------

function collectStringFields(view: number, payload: unknown): string[] {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') {
      if (node.length > 2) out.push(node);
    } else if (Array.isArray(node)) {
      for (const item of node) walk(item);
    } else if (node && typeof node === 'object') {
      for (const value of Object.values(node as Record<string, unknown>)) walk(value);
    }
  };
  walk(payload);
  return out;
}

/** Structured ingredient_id references per view (frozen schemas — D-16D). */
function structuredReferences(view: ViewNumber, payload: Record<string, unknown>): string[] {
  const refs: string[] = [];
  const asRecord = (node: unknown): Record<string, unknown> | null =>
    node && typeof node === 'object' ? (node as Record<string, unknown>) : null;
  const pushIdList = (node: unknown, key: string): void => {
    const rec = asRecord(node);
    const value = rec?.[key];
    if (typeof value === 'string') {
      refs.push(value);
    } else if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === 'string') refs.push(entry);
      }
    }
  };
  const pushIds = (list: unknown): void => {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      pushIdList(item, 'ingredient_id');
      pushIdList(item, 'ingredient_ids');
      // View 2 pillars carry their ids under source_ingredient_ids.
      pushIdList(item, 'source_ingredient_ids');
    }
  };
  if (view === 1) {
    pushIds((payload as Record<string, unknown>).items);
    pushIds((payload as Record<string, unknown>).role_groups);
  } else if (view === 2) {
    pushIds((payload as Record<string, unknown>).pillars);
    pushIds((payload as Record<string, unknown>).blind_spot_notes);
  } else if (view === 4) {
    pushIds((payload as Record<string, unknown>).substitutions);
  }
  return refs;
}

/** D-16D/F: validate one view payload against the captured state. */
export function validateViewGrounding(
  view: ViewNumber,
  payload: ViewPayload,
  captured: StructuredRecipeInput,
): GroundingVerdict {
  const vocab = buildVocabulary(captured);
  const violations: GroundingViolation[] = [];
  const record = payload as unknown as Record<string, unknown>;

  // 1. Structured references must resolve to captured lines (ADR §6).
  for (const ref of structuredReferences(view, record)) {
    if (!vocab.ingredientIds.has(ref)) {
      violations.push({
        code: 'UNRESOLVED_INGREDIENT_REFERENCE',
        message: `ingredient reference "${ref}" does not resolve to any captured recipe line`,
        at: `view ${view}`,
      });
    }
  }

  // 2. Absent-channel scan: explicitly_absent items may appear only via the
  //    sanctioned ABSENT channel (claims tagged ABSENT / the input list itself).
  //    A mention inside a view payload is never the sanctioned channel.
  for (const text of collectStringFields(view, record)) {
    const hit = textMentions(text, vocab.explicitlyAbsent);
    if (hit) {
      violations.push({
        code: 'ABSENT_ITEM_USED_WITHOUT_ABSENT_TAG',
        message: `"${hit}" is recorded explicitly_absent in the capture — it may be referenced only to mark it ABSENT (claim tag ABSENT), never used in a view payload`,
        at: `view ${view}`,
      });
    }
  }

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

// ---------------------------------------------------------------------------
// Claim-level grounding (C4 claim machinery — D-16E)
// ---------------------------------------------------------------------------

/** D-16E: validate one claim row against the captured state. */
export function validateClaimGrounding(
  claim: Claim,
  captured: StructuredRecipeInput,
): GroundingVerdict {
  const vocab = buildVocabulary(captured);
  const violations: GroundingViolation[] = [];
  const at = `claim "${claim.claim_text.slice(0, 60)}…"`;

  switch (claim.claim_tag) {
    case 'CARD':
    case 'METHOD': {
      // Must cite a captured element AND the text must carry its name token.
      if (!claim.source_reference) {
        violations.push({
          code: 'CLAIM_MISSING_SOURCE',
          message: `a ${claim.claim_tag} claim must cite a captured source (source_reference is null)`,
          at,
        });
        break;
      }
      const isIngredient = vocab.ingredientIds.has(claim.source_reference);
      const isStep = vocab.methodStepIds.has(claim.source_reference);
      if (!isIngredient && !isStep) {
        violations.push({
          code: 'CLAIM_SOURCE_UNRESOLVED',
          message: `source_reference "${claim.source_reference}" does not resolve to a captured ingredient line or method step`,
          at,
        });
        break;
      }
      if (isIngredient) {
        const matched = citedTokensInText(vocab, claim.source_reference, claim.claim_text);
        if (matched.length === 0) {
          violations.push({
            code: 'CLAIM_TEXT_MISMATCH',
            message: `the claim text does not mention the cited ingredient (reworded capture? — the text must carry the captured line's name)`,
            at,
          });
        }
      }
      // The claim must not positively use an absent-listed item.
      const absentHit = textMentions(claim.claim_text, vocab.explicitlyAbsent);
      if (absentHit) {
        violations.push({
          code: 'ABSENT_ITEM_USED_WITHOUT_ABSENT_TAG',
          message: `"${absentHit}" is explicitly_absent — a ${claim.claim_tag} claim may not use it`,
          at,
        });
      }
      break;
    }
    case 'ABSENT': {
      // ABSENT marks only items that are NOT captured (A-16: ABSENT-for-captured = MAJOR).
      const capturedHit = textMentions(claim.claim_text, vocab.allNameTokens);
      if (capturedHit) {
        violations.push({
          code: 'ABSENT_FOR_CAPTURED',
          message: `"${capturedHit}" is a captured ingredient — marking it ABSENT is a MAJOR violation`,
          at,
        });
      }
      break;
    }
    case 'INFERRED': {
      // Named pattern (free string) or null — but no positive use of absent items.
      const absentHit = textMentions(claim.claim_text, vocab.explicitlyAbsent);
      if (absentHit) {
        violations.push({
          code: 'ABSENT_ITEM_USED_WITHOUT_ABSENT_TAG',
          message: `"${absentHit}" is explicitly_absent — an INFERRED claim may not use it positively`,
          at,
        });
      }
      break;
    }
    case 'UNKNOWN':
    case 'ASSUMED': {
      // No positive reference channel: unknown fields stay blank; assumed values
      // are calculation defaults, never stated facts (prompt hard rules).
      const absentHit = textMentions(claim.claim_text, vocab.explicitlyAbsent);
      if (absentHit) {
        violations.push({
          code: 'ABSENT_ITEM_USED_WITHOUT_ABSENT_TAG',
          message: `"${absentHit}" is explicitly_absent — a ${claim.claim_tag} claim may not reference it`,
          at,
        });
      }
      break;
    }
  }

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

/** D-16: validate a full set of claims (used by the pipeline choke point). */
export function validateClaimsGrounding(
  claims: Claim[],
  captured: StructuredRecipeInput,
): GroundingVerdict {
  const violations: GroundingViolation[] = [];
  for (const claim of claims) {
    const verdict = validateClaimGrounding(claim, captured);
    if (!verdict.ok) violations.push(...verdict.violations);
  }
  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}
