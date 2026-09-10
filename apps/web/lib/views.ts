// D-18 (P3-4): pure helpers for rendering the persisted analysis_view payloads
// in home mode. No content is invented here — only the canonical presentation
// rules (Recipe_Systems §7 home-mode column; frozen D-05 payload contracts).

import type {
  View1Payload,
  View2Payload,
  View3Payload,
  View4Payload,
  View5Payload,
  View6Payload,
  View7Payload,
  View8Payload,
  View9Payload,
} from '@recipe-systems/schemas';
import type { WireLine } from '@/lib/types';

/** Home mode: UNKNOWN fields stay blank (Recipe_Systems §7 "Required blanks"). */
export function displayDuration(duration: string): string | null {
  return duration === 'UNKNOWN' ? null : duration;
}

/** Resolve an ingredient_id to its current draft-line display name. The captured
 *  state (Q1) is not persisted, so the current lines are the only persisted name
 *  source; unresolved ids stay visible, never dropped (INV-04 spirit). */
export function resolveIngredientName(
  ingredientId: string,
  lines: WireLine[],
): string {
  const line = lines.find((l) => l.id === ingredientId);
  return line ? line.display_name : `Ingredient ${ingredientId.slice(0, 8)}`;
}

/** The identification source (C1): the persisted view_5 payload — the only
 *  persisted identification content. Views 5's own presentation stays D-19. */
export function identificationFrom(view5: View5Payload | null): {
  family: string;
  architecture: string;
  confidence: string;
  not_this: Array<{ variant: string; key_difference: string }>;
} | null {
  if (!view5) return null;
  return {
    family: view5.family,
    architecture: view5.architecture,
    confidence: view5.confidence,
    not_this: view5.not_this,
  };
}

export function view1Payload(view: unknown): View1Payload | null {
  return isRecord(view) && Array.isArray(view.items) && Array.isArray(view.role_groups)
    ? (view as View1Payload)
    : null;
}

export function view2Payload(view: unknown): View2Payload | null {
  return isRecord(view) && Array.isArray(view.pillars) && Array.isArray(view.blind_spot_notes)
    ? (view as View2Payload)
    : null;
}

export function view3Payload(view: unknown): View3Payload | null {
  return isRecord(view) && 'status' in view && Array.isArray((view as View3Payload).stages)
    ? (view as View3Payload)
    : null;
}

export function view4Payload(view: unknown): View4Payload | null {
  return isRecord(view) && Array.isArray((view as View4Payload).substitutions)
    ? (view as View4Payload)
    : null;
}

export function view5Payload(view: unknown): View5Payload | null {
  return isRecord(view) && typeof view.family === 'string' && 'needs_review' in view
    ? (view as View5Payload)
    : null;
}

export function view6Payload(view: unknown): View6Payload | null {
  return isRecord(view) && Array.isArray(view.ratios) && Array.isArray(view.unresolvable)
    ? (view as View6Payload)
    : null;
}

export function view7Payload(view: unknown): View7Payload | null {
  return isRecord(view) && 'status' in view && Array.isArray((view as View7Payload).memorable_elements)
    ? (view as View7Payload)
    : null;
}

export function view8Payload(view: unknown): View8Payload | null {
  return (
    isRecord(view) &&
    Array.isArray(view.present) &&
    Array.isArray(view.not_on_card) &&
    Array.isArray(view.unknown) &&
    Array.isArray(view.removal_notes) &&
    typeof view.disclaimer === 'string' &&
    isRecord(view.allergen_line)
  )
    ? (view as View8Payload)
    : null;
}

export function view9Payload(view: unknown): View9Payload | null {
  return (
    isRecord(view) &&
    isRecord(view.band) &&
    typeof view.band.energy_kcal_min === 'number' &&
    typeof view.band.energy_kcal_max === 'number' &&
    view.sodium === 'unknown' &&
    Array.isArray(view.assumptions)
  )
    ? (view as View9Payload)
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
