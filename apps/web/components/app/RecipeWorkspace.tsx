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
import type { AnalysisState, MethodState, SavedRecipe } from '@/lib/types';
import { IngredientReview } from '@/components/app/IngredientReview';
import type { WireLine } from '@/lib/types';
import { MethodSection } from '@/components/app/MethodSection';
import { ReadinessPanel } from '@/components/app/ReadinessPanel';
import { AnalysisPanel } from '@/components/app/AnalysisPanel';

export interface RecipeWorkspaceProps {
  recipeId: string;
  signedIn: boolean;
  onBack: () => void;
  /** D-22 (D6): the backend confirmed the delete — the page navigates home and
   *  refreshes the library. Never called before the 204. */
  onDeleted?: () => void;
  /** Lines from the parse-text response (guest read-only rendering). */
  initialLines?: WireLine[] | null;
  /** D-22: the saved DB name passed from a library row — the authoritative
   *  title after a browser restart, when no session record exists. */
  initialTitle?: string;
  /** D-20 (C3): the account's saved mode preference (default home). */
  preferredMode?: 'home' | 'chef';
}

export function RecipeWorkspace({
  recipeId,
  signedIn,
  onBack,
  onDeleted,
  initialLines = null,
  initialTitle,
  preferredMode = 'home',
}: RecipeWorkspaceProps) {
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [lines, setLines] = useState<WireLine[]>(initialLines ?? []);
  const [methodState, setMethodState] = useState<MethodState | null>(null);
  const [title, setTitle] = useState('Recipe');
  /** D-20 (C3): home explains, chef briefs. Guests get a session-local toggle;
   *  signed-in users persist the preference on the account (C3 AC-2/TC-03). */
  const [mode, setMode] = useState<'home' | 'chef'>(preferredMode);

  /**
   * D-22 (D1): the visible Save action. The artifact set already persists in
   * the recipe/line/analysis rows — Save normalizes the name (blank → the
   * identification family default) and confirms the set. Guests may save too
   * (A1 TC-02 seam): the QA-B2 claim moves the row — and this save state —
   * onto the account, which is the resume-save path.
   */
  const [saveTitle, setSaveTitle] = useState('');
  const [saved, setSaved] = useState<SavedRecipe | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const saveRecipe = async (): Promise<void> => {
    setSaving(true);
    setSaveError(null);
    try {
      const result = await api<SavedRecipe>(`/recipes/${recipeId}/save`, {
        method: 'PUT',
        body: JSON.stringify({ title: saveTitle.trim() || undefined }),
      });
      setSaved(result);
      setSaveTitle(result.title);
      setTitle(result.title);
    } catch (err) {
      setSaved(null);
      setSaveError(err instanceof ApiError ? err.message : 'Could not save the recipe.');
    } finally {
      setSaving(false);
    }
  };

  /**
   * D-22 (D6 / RS-US-24): two-step confirmation (AC-1) — destructive copy,
   * explicit Cancel / Delete recipe buttons, no optimistic removal, disabled
   * while in flight. Signed-in only (the delete endpoint is Bearer-only).
   */
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deleteRecipe = async (): Promise<void> => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api<undefined>(`/recipes/${recipeId}`, {
        method: 'DELETE',
        body: JSON.stringify({ confirm: true }),
      });
      // The backend confirmed (204). Only now does the UI leave the recipe.
      onDeleted?.();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Could not delete the recipe.');
      setConfirmingDelete(false); // back to the safe initial state; the recipe remains
    } finally {
      setDeleting(false);
    }
  };

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
    // D-22: the saved DB name (library row) wins over the session preview —
    // after a browser restart no session record exists at all.
    setTitle(initialTitle ?? record?.preview ?? 'Recipe');
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
  }, [recipeId, initialLines, initialTitle, signedIn]);

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

      <section aria-labelledby="save-heading" className="mt-6 rounded-lg border border-border bg-surface p-5">
        <h2 id="save-heading" className="text-small font-semibold text-ink">
          Save
        </h2>
        <p className="mt-1 text-caption text-muted">
          Saved recipes survive closing the browser and appear in your library. Blank name = the dish family.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            aria-label="Recipe name"
            value={saveTitle}
            onChange={(e) => setSaveTitle(e.target.value)}
            placeholder="Family name (leave blank for the default)"
            maxLength={255}
            className="min-w-64 max-w-full flex-1 rounded-md border border-border-strong bg-background px-3 py-2 text-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          />
          <Button onClick={() => void saveRecipe()} disabled={saving}>
            {saving ? 'Saving…' : 'Save recipe'}
          </Button>
        </div>
        {saveError && <p className="mt-2 text-caption text-negative">{saveError}</p>}
        {saved && (
          <div className="mt-3 border-t border-border pt-3">
            <p className="text-caption text-body">
              Saved as <span className="font-semibold text-ink">{saved.title}</span> ·{' '}
              {new Date(saved.saved_at).toLocaleString()}
            </p>
            <p className="mt-1 text-caption text-muted">
              Artifacts — raw input {saved.artifacts.raw_input ? '✓' : '—'} · photo{' '}
              {saved.artifacts.photo ? '✓' : '—'} · object {saved.artifacts.object ? '✓' : '—'} · identification{' '}
              {saved.artifacts.identification ? '✓' : '—'} · analysis {saved.artifacts.analysis ? '✓' : '—'} · timestamps ✓
            </p>
          </div>
        )}
      </section>

      {signedIn && (
        <section aria-labelledby="delete-heading" className="mt-6 rounded-lg border border-negative/40 bg-negative/8 p-5">
        <h2 id="delete-heading" className="text-small font-semibold text-negative">
          Delete recipe
        </h2>
        {!confirmingDelete ? (
          <>
            <p className="mt-1 text-caption text-muted">
              Permanently removes this recipe and everything saved with it. This cannot be undone.
            </p>
            <div className="mt-3">
              <Button variant="danger" onClick={() => setConfirmingDelete(true)} disabled={deleting}>
                Delete recipe
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-small text-body">
              Delete <span className="font-semibold">{title}</span>? Its photo, object, analyses,
              lists and logs are permanently removed. This cannot be undone.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                variant="danger"
                onClick={() => void deleteRecipe()}
                disabled={deleting}
              >
                {deleting ? 'Deleting…' : 'Delete recipe'}
              </Button>
              <Button variant="outline" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
                Cancel
              </Button>
            </div>
          </>
        )}
        {deleteError && <p className="mt-2 text-caption text-negative">{deleteError}</p>}
        </section>
      )}

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
