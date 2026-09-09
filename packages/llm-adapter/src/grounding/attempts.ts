// D-16 (P3-2): regenerate-once semantics (ADR §6; A-16) — the decision the
// worker's per-view loop consumes. D-16 provides the decision + the correction
// instruction; the LOOP itself is the worker's (D-17).
//
// A-16: first grounding failure → regenerate; second → view INCOMPLETE, never
// current (INV-10). A third silent attempt is a BLOCKER — attempting ≥3 throws.

import { GroundingViolation } from './validator';

export type GroundingAttemptAction =
  | { action: 'regenerate'; correction_instruction: string }
  | { action: 'incomplete'; violations: GroundingViolation[] };

/** D-16I: attempt-numbered decision. Attempts are 1-based. */
export function groundingAttempt(
  attempt: number,
  violations: GroundingViolation[],
): GroundingAttemptAction {
  if (attempt <= 0) {
    throw new Error(`groundingAttempt: invalid attempt number ${attempt}`);
  }
  if (attempt >= 3) {
    throw new Error(
      'groundingAttempt: attempt 3 is forbidden — regenerate-once is the contract; ' +
        'a still-failing view goes INCOMPLETE, never a third silent attempt (A-16 BLOCKER)',
    );
  }
  if (attempt === 1) {
    return {
      action: 'regenerate',
      correction_instruction: formatCorrection(violations),
    };
  }
  return { action: 'incomplete', violations };
}

/** D-16: the correction instruction re-fed to the model on regenerate. */
export function formatCorrection(violations: GroundingViolation[]): string {
  const lines = violations.map((v) => `- [${v.code} @ ${v.at}] ${v.message}`);
  return (
    'The previous output failed grounding validation. Correct ONLY these issues ' +
    'and re-emit the full payload — do not change anything else:\n' +
    lines.join('\n') +
    '\nRule: the structured_recipe object is the ONLY source of truth. Non-captured ' +
    'items may be referenced only to mark them ABSENT.'
  );
}
