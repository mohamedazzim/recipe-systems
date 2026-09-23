'use client';

// D-25A (C7 / RS-US-18) — the View 4 substitution-preview surface. The user
// selects ONE substitution that ALREADY exists in the persisted View 4 payload;
// the BFF classifies it deterministically (structural / modular /
// identity_shift) from persisted analysis evidence and returns the persisted
// substitute + consequence (what-is-lost). Nothing here generates or modifies
// recipe content — it only previews what the analysis already recorded.

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { resolveIngredientName } from '@/lib/views';
import { Badge } from '@/components/ui/Badge';
import type { WireLine } from '@/lib/types';

export type SubstitutionClass = 'structural' | 'modular' | 'identity_shift';

export interface SubstitutionPreviewWire {
  ingredient_id: string;
  substitute: string;
  classification: SubstitutionClass;
  what_is_lost: string;
}

export interface PersistedSubstitution {
  ingredient_id: string;
  substitute: string;
  consequence: string;
  tag: string;
}

const CLASS_LABELS: Record<SubstitutionClass, string> = {
  structural: 'Structural',
  modular: 'Modular',
  identity_shift: 'Identity shift',
};

export function SubstitutionPreview({
  substitutions,
  lines,
  recipeId,
  chefMode,
}: {
  substitutions: PersistedSubstitution[];
  lines: WireLine[];
  recipeId?: string;
  chefMode: boolean;
}) {
  const [previews, setPreviews] = useState<Record<string, SubstitutionPreviewWire>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const previewOne = async (sub: PersistedSubstitution): Promise<void> => {
    if (!recipeId) return;
    setBusyId(sub.ingredient_id);
    setError(null);
    try {
      const wire = await api<SubstitutionPreviewWire>(
        `/recipes/${recipeId}/substitute-preview`,
        {
          method: 'POST',
          body: JSON.stringify({ ingredient_id: sub.ingredient_id }),
        },
      );
      setPreviews((prev) => ({ ...prev, [sub.ingredient_id]: wire }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not preview this substitution');
    } finally {
      setBusyId(null);
    }
  };

  const hideOne = (sub: PersistedSubstitution): void => {
    setPreviews((prev) => {
      const next = { ...prev };
      delete next[sub.ingredient_id];
      return next;
    });
    setError(null);
  };

  /** The control is a disclosure toggle: first click previews, next click hides. */
  const toggleOne = (sub: PersistedSubstitution): void => {
    if (previews[sub.ingredient_id]) {
      hideOne(sub);
      return;
    }
    void previewOne(sub);
  };

  return (
    <div>
      <p className="text-small text-muted">
        {chefMode
          ? 'Structural / modular / identity-shift grid. Select a swap to preview its class.'
          : 'Select a swap to preview its class and what is lost.'}
      </p>
      {error && <p className="mt-2 text-caption text-negative">{error}</p>}
      <ul className="mt-4 divide-y divide-border rounded-lg border border-border bg-surface">
        {substitutions.map((sub, index) => {
          const preview = previews[sub.ingredient_id];
          return (
            <li key={`${sub.ingredient_id}-${index}`} className="px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-ink">
                  {resolveIngredientName(sub.ingredient_id, lines)} → {sub.substitute}
                </span>
                <Badge tag="INFERRED" />
              </div>
              <p className="mt-1 text-small text-body">{sub.consequence}</p>
              {preview && (
                <p className="mt-2 text-small font-semibold text-ink" data-testid="substitution-class">
                  {CLASS_LABELS[preview.classification]}
                  <span className="ml-2 font-normal text-muted">— {preview.what_is_lost}</span>
                </p>
              )}
              {recipeId && (
                <button
                  type="button"
                  onClick={() => toggleOne(sub)}
                  disabled={busyId === sub.ingredient_id}
                  aria-expanded={Boolean(preview)}
                  className="mt-2 text-caption font-semibold text-accent underline-offset-2 hover:underline disabled:text-faint"
                >
                  {busyId === sub.ingredient_id
                    ? 'Previewing…'
                    : preview
                      ? 'Hide shift class'
                      : 'Preview shift class'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
