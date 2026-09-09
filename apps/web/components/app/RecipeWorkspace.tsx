'use client';

// Recipe workspace: one page with the four real sections (ingredient review,
// method, readiness + analyse, analysis status). The product flow lives in
// section order; nothing here is decorative.

import { useEffect, useState } from 'react';
import { ArrowLeft } from '@phosphor-icons/react';
import { Heading } from '@/components/ui/Typography';
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
}

export function RecipeWorkspace({ recipeId, signedIn, onBack, initialLines = null }: RecipeWorkspaceProps) {
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [lines, setLines] = useState<WireLine[]>(initialLines ?? []);
  const [methodState, setMethodState] = useState<MethodState | null>(null);
  const [title, setTitle] = useState('Recipe');

  useEffect(() => {
    const record = listSessionRecipes().find((r) => r.recipe_id === recipeId);
    if (record) setTitle(record.preview);
    setAnalysisId(null);
    setLines(initialLines ?? []);
    setMethodState(null);
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
  }, [recipeId, initialLines]);

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

      <ReadinessPanel recipeId={recipeId} signedIn={signedIn} onAnalysed={setAnalysisId} />

      <AnalysisPanel analysisId={analysisId} recipeId={recipeId} lines={lines} methodState={methodState} />
    </div>
  );
}
