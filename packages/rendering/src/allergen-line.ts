// Q2 Option A (D-23): the canonical rendering of the frozen View-8 allergen
// line. Pure function — the API shopping module (D-30) and the worker's
// station-card writer both use it, so the print snapshot and the persisted
// column are always the SAME deterministic string.
//
// INV-13: the View-8 producer surface never emits "safe" (static regression
// gate) — this renderer only joins the frozen payload's fields.

import type { View8Payload } from '@recipe-systems/schemas';

export function renderAllergenLine(view8: View8Payload): string | null {
  const line = view8.allergen_line;
  const parts: string[] = [];
  if (line.contains.length > 0) parts.push(`Contains: ${line.contains.join(', ')}.`);
  if (line.unknown.length > 0) parts.push(`May contain: ${line.unknown.join(', ')}.`);
  if (line.notes.length > 0) parts.push(`Notes: ${line.notes.join(' ')}`);
  return parts.length > 0 ? parts.join(' ') : null;
}
