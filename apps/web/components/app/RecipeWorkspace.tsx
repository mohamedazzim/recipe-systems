'use client';

// Recipe workspace: one page with the four real sections (ingredient review,
// method, readiness + analyse, analysis status). The product flow lives in
// section order; nothing here is decorative.

import { useEffect, useState } from 'react';
import { ArrowLeft } from '@phosphor-icons/react';
import { Heading } from '@/components/ui/Typography';
import { listSessionRecipes } from '@/lib/flow';
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
  const [title, setTitle] = useState('Recipe');

  useEffect(() => {
    const record = listSessionRecipes().find((r) => r.recipe_id === recipeId);
    if (record) setTitle(record.preview);
    setAnalysisId(null);
  }, [recipeId]);

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
        <IngredientReview recipeId={recipeId} signedIn={signedIn} title={title} initialLines={initialLines} />
      </div>

      <MethodSection recipeId={recipeId} signedIn={signedIn} />

      <ReadinessPanel recipeId={recipeId} signedIn={signedIn} onAnalysed={setAnalysisId} />

      <AnalysisPanel analysisId={analysisId} recipeId={recipeId} />
    </div>
  );
}
