// D-20 (P4-2): deterministic station-card assembly — the card is a chef's working
// brief, NEVER free prose. Every field derives from the Q1-labeled capture or the
// persisted analysis rows (INV-10: no ingredient or process content is invented).
//
// D-20A..C (HANDOFF §5, recorded before code):
//  - precondition: method steps exist in the capture (METHOD or accepted INFERRED)
//    AND the persisted View 3 is COMPLETE → card; otherwise NO card (refusal path).
//  - mise      = capture ingredients verbatim (record keyed by ingredient id).
//  - sequence  = View 3 stages verbatim (action/cue/duration/tag).
//  - control_points = one per View 3 stage (stage_name + cue verbatim).
//  - do_nots   = captured `explicitly_absent` items (ABSENT — do not add); empty
//    in the stub world (Q9 OPEN) — the field exists and populates truthfully.
//  - product_yield_hold = null (unknowns stay blank per §7 required blanks).
//  - printable = true (print sizing itself is D-23).

import { StructuredRecipeInput, View3Payload } from '@recipe-systems/schemas';

export interface StationCardRecord {
  mise: Record<string, { display_name: string; amount: string | null; tag: 'CARD' }>;
  sequence: View3Payload['stages'];
  do_nots: Array<{ item: string; tag: 'ABSENT'; note: string }>;
  control_points: Array<{ stage_name: string; cue: string; tag: string }>;
  product_yield_hold: null;
  printable: boolean;
}

/**
 * Build the station card (or null — the refusal path). All content is copied
 * verbatim from the capture/analysis rows; nothing is synthesized.
 */
export function buildStationCard(
  captured: StructuredRecipeInput,
  view3: View3Payload | null,
): StationCardRecord | null {
  const methodSteps = captured.structured_recipe.method_steps;
  if (methodSteps.length === 0) return null; // no method, no inferred acceptance → no card
  if (!view3 || view3.status !== 'COMPLETE') return null; // no known process → no card (INV-08)

  const mise: StationCardRecord['mise'] = {};
  for (const ingredient of captured.structured_recipe.ingredients) {
    mise[ingredient.id] = {
      display_name: ingredient.display_name,
      amount: ingredient.amount_text ?? null,
      tag: 'CARD',
    };
  }

  const sequence = view3.stages;
  const control_points = sequence.map((stage) => ({
    stage_name: stage.stage_name,
    cue: stage.cue,
    tag: stage.tag,
  }));

  const do_nots = captured.structured_recipe.explicitly_absent.map((item) => ({
    item,
    tag: 'ABSENT' as const,
    note: 'Confirmed absent at review — do not add.',
  }));

  return {
    mise,
    sequence,
    do_nots,
    control_points,
    product_yield_hold: null,
    printable: true,
  };
}
