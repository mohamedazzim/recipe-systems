'use client';

// Recipe workspace: one page with the four real sections (ingredient review,
// method, readiness + analyse, analysis status). The product flow lives in
// section order; nothing here is decorative.

import { useEffect, useState } from 'react';
import { ArrowLeft } from '@phosphor-icons/react';
import { Heading } from '@/components/ui/Typography';
import { Button } from '@/components/ui/Button';
import { api, ApiError } from '@/lib/api';
import { listSessionRecipes } from '@/lib/flow';
import type { AnalysisState, MethodState } from '@/lib/types';
import { IngredientReview } from '@/components/app/IngredientReview';
import type { WireLine } from '@/lib/types';
import { MethodSection } from '@/components/app/MethodSection';
import { ReadinessPanel } from '@/components/app/ReadinessPanel';
import { AnalysisPanel } from '@/components/app/AnalysisPanel';

export interface RecipeWorkspaceProps {
  recipeId: string;
  signedIn: boolean;
  onBack: () => void;
  /** Lines from the parse-text response (guest read-only rendering). */
  initialLines?: WireLine[] | null;
  /** D-20 (C3): the account's saved mode preference (default home). */
  preferredMode?: 'home' | 'chef';
}

export function RecipeWorkspace({
  recipeId,
  signedIn,
  onBack,
  initialLines = null,
  preferredMode = 'home',
}: RecipeWorkspaceProps) {
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [lines, setLines] = useState<WireLine[]>(initialLines ?? []);
  const [methodState, setMethodState] = useState<MethodState | null>(null);
  const [title, setTitle] = useState('Recipe');
  /** D-20 (C3): home explains, chef briefs. Guests get a session-local toggle;
   *  signed-in users persist the preference on the account (C3 AC-2/TC-03). */
  const [mode, setMode] = useState<'home' | 'chef'>(preferredMode);

  const selectMode = (next: 'home' | 'chef'): void => {
    setMode(next);
    if (signedIn) {
      void api('/auth/me/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ preferred_mode: next }),
      }).catch(() => undefined);
    }
  };

  useEffect(() => {
    const record = listSessionRecipes().find((r) => r.recipe_id === recipeId);
    if (record) setTitle(record.preview);
    setAnalysisId(null);
    setLines(initialLines ?? []);
    setMethodState(null);
    if (!signedIn) {
      // Guests never fetch Bearer-only routes (API §3): no analysis fetch, no
      // console-noise 404 — the panel renders the guest copy instead.
      return;
    }
    // Reopen the workspace on the latest persisted analysis (API §5, read-only).
    let cancelled = false;
    api<AnalysisState>(`/recipes/${recipeId}/analysis`)
      .then((latest) => {
        if (!cancelled) setAnalysisId(latest.analysis_id);
      })
      .catch((err: unknown) => {
        // 404 ANALYSIS_NOT_FOUND = no analysis yet: expected, stay quiet.
        if (!(err instanceof ApiError && err.code === 'ANALYSIS_NOT_FOUND') && !cancelled) {
          // other errors are surfaced by the status panel's own poll
        }
      });
    return () => {
      cancelled = true;
    };
  }, [recipeId, initialLines, signedIn]);

  return (
    <div className="mx-auto max-w-4xl">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 rounded-sm text-small font-semibold text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Back to your recipes
      </button>

      <Heading level={1} className="mt-5">
        {title}
      </Heading>
      <p className="mt-2 text-small text-muted">
        Review the lines, attach a method, then run the analysis.
      </p>

      <div className="mt-4 flex items-center gap-3">
        <ModeToggle mode={mode} onSelect={selectMode} />
        <span className="text-caption text-faint">
          {mode === 'home' ? 'Home explains.' : 'Chef briefs — the station card leads.'}
        </span>
      </div>

      <div className="mt-8">
        <IngredientReview
          recipeId={recipeId}
          signedIn={signedIn}
          title={title}
          initialLines={initialLines}
          onLinesLoaded={setLines}
        />
      </div>

      <MethodSection recipeId={recipeId} signedIn={signedIn} onChange={setMethodState} />

      <ReadinessPanel recipeId={recipeId} signedIn={signedIn} lines={lines} onAnalysed={setAnalysisId} />

      <AnalysisPanel
        analysisId={analysisId}
        recipeId={recipeId}
        lines={lines}
        methodState={methodState}
        signedIn={signedIn}
        mode={mode}
      />
    </div>
  );
}

/** D-20 (C3): the Home↔Chef segmented toggle (mode semantics per ERD §15.4 —
 *  presentation mode over the same analysis, never a second system). */
export function ModeToggle({
  mode,
  onSelect,
}: {
  mode: 'home' | 'chef';
  onSelect: (next: 'home' | 'chef') => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Presentation mode"
      className="inline-flex rounded-md border border-border-strong bg-surface p-0.5"
    >
      <button
        type="button"
        role="radio"
        aria-checked={mode === 'home'}
        onClick={() => onSelect('home')}
        className={
          mode === 'home'
            ? 'rounded-sm bg-accent px-3 py-1 text-small font-semibold text-surface'
            : 'rounded-sm px-3 py-1 text-small font-semibold text-muted hover:text-ink'
        }
      >
        Home
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={mode === 'chef'}
        onClick={() => onSelect('chef')}
        className={
          mode === 'chef'
            ? 'rounded-sm bg-accent px-3 py-1 text-small font-semibold text-surface'
            : 'rounded-sm px-3 py-1 text-small font-semibold text-muted hover:text-ink'
        }
      >
        Chef
      </button>
    </div>
  );
}
