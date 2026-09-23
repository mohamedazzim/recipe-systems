'use client';

// Recipe workspace: one page with the four real sections (ingredient review,
// method, readiness + analyse, analysis status). The product flow lives in
// section order; nothing here is decorative.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, DotsThreeVertical, PencilSimple } from '@phosphor-icons/react';
import { Heading } from '@/components/ui/Typography';
import { Button } from '@/components/ui/Button';
import { api, ApiError, API_BASE_URL } from '@/lib/api';
import { listSessionRecipes } from '@/lib/flow';
import type { AnalyseAck, AnalysisState, MethodState, SavedRecipe } from '@/lib/types';
import { IngredientReview } from '@/components/app/IngredientReview';
import { VideoWalkthrough } from '@/components/app/VideoWalkthrough';
import type { WireLine } from '@/lib/types';
import { MethodSection } from '@/components/app/MethodSection';
import { ShoppingSection } from '@/components/app/ShoppingSection';
import { CookSection } from '@/components/app/CookSection';
import { SwapSection } from '@/components/app/SwapSection';
import { TagsSection } from '@/components/app/TagsSection';
import { ReadinessPanel } from '@/components/app/ReadinessPanel';
import { AnalysisPanel } from '@/components/app/AnalysisPanel';
import type { WorkspaceSection } from '@/components/app/AppShell';

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
  /** RS-US servings: the serving count detected from the source text. */
  initialServings?: number | null;
  /** RS-US servings: true when the count is an LLM estimate (never a stated fact). */
  initialServingsEstimated?: boolean;
  /** D-20 (C3): the account's saved mode preference (default home). */
  preferredMode?: 'home' | 'chef';
  /** Lifted section tab — the shell's workspace nav drives it when present. */
  tab?: 'ingredients' | 'method' | 'shopping';
  onTabChange?: (tab: 'ingredients' | 'method' | 'shopping') => void;
  /** A section request from the shell (tabs, analysis, cook mode). The counter
   *  makes repeated requests of the same section observable. */
  sectionRequest?: { section: WorkspaceSection; n: number } | null;
  /** Library read-model hints (2026-09-18): 'none' skips the mount-time
   *  GET /analysis (a new recipe has no row to find — no doomed 404).
   *  `initialHasShoppingList: false` skips the shopping GET the same way. */
  initialAnalysisHint?: 'none' | 'present' | 'unknown';
  initialHasShoppingList?: boolean | null;
}

export function RecipeWorkspace({
  recipeId,
  signedIn,
  onBack,
  onDeleted,
  initialLines = null,
  initialTitle,
  initialServings = null,
  initialServingsEstimated = false,
  preferredMode = 'home',
  tab,
  onTabChange,
  sectionRequest,
  initialAnalysisHint = 'unknown',
  initialHasShoppingList = null,
}: RecipeWorkspaceProps) {
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  /** true when the recipe changed since the current analysis (D-25/C6: never
   *  auto re-enqueue — the user explicitly clicks Re-analyse). */
  const [analysisStale, setAnalysisStale] = useState(false);
  /** true while POST /analyse is in flight (shared by Readiness + Analysis retry). */
  const [analysing, setAnalysing] = useState(false);
  /** error from the last analyse attempt. */
  const [analyseError, setAnalyseError] = useState<string | null>(null);
  /** true once the user runs the analysis — the analysis takes the full width
   *  and the workflow sections collapse back to the tabs above. */
  const [analysisFullscreen, setAnalysisFullscreen] = useState(false);
  /** RS-US (chef mode): the dish video walkthrough takes over the surface. */
  const [videoOpen, setVideoOpen] = useState(false);
  const [lines, setLines] = useState<WireLine[]>(initialLines ?? []);
  const [methodState, setMethodState] = useState<MethodState | null>(null);
  const [title, setTitle] = useState('Recipe');
  /** D-20 (C3): home explains, chef briefs. Guests get a session-local toggle;
   *  signed-in users persist the preference on the account (C3 AC-2/TC-03). */
  const [mode, setMode] = useState<'home' | 'chef'>(preferredMode);
  /** Header overflow menu (Delete + low-frequency actions). */
  const [moreOpen, setMoreOpen] = useState(false);
  /** E6 + I5 (D-31): the home-mode one-pager print, surfaced from the header. */
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  /** Which workflow section is active — Ingredients / Method / Shopping list.
   *  Controlled by the shell's workspace nav when `tab` is provided. */
  const [internalTab, setInternalTab] = useState<'ingredients' | 'method' | 'shopping'>(
    'ingredients',
  );
  const activeTab = tab ?? internalTab;
  const selectTab = useCallback(
    (next: 'ingredients' | 'method' | 'shopping') => {
      setAnalysisFullscreen(false);
      if (tab !== undefined) onTabChange?.(next);
      else setInternalTab(next);
    },
    [tab, onTabChange],
  );
  /** Top of the active workflow section — scrolled into view on tab changes so
   *  the footer's "next" doesn't leave the user stranded at the bottom. */
  const sectionTopRef = useRef<HTMLDivElement | null>(null);
  const firstRenderRef = useRef(true);

  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    sectionTopRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, [activeTab]);

  /** Shell section requests — tabs scroll to the section top; the analysis and
   *  cook-mode links scroll to their surfaces (stacked below on small screens). */
  const analysisRef = useRef<HTMLElement | null>(null);
  const cookRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!sectionRequest) return;
    const { section } = sectionRequest;
    if (section === 'analysis') {
      setAnalysisFullscreen(true);
    } else if (section === 'cook') {
      cookRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    } else {
      setAnalysisFullscreen(false);
      sectionTopRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    }
  }, [sectionRequest]);

  /** true once the recipe has at least one cook log — swaps only surface then. */
  const [hasCookLog, setHasCookLog] = useState(false);
  const handleCookLogsChanged = useCallback((count: number) => setHasCookLog(count > 0), []);
  /** The library says no shopping list exists yet — skip the doomed GET until
   *  one is actually generated in this session. */
  const [shoppingKnownAbsent, setShoppingKnownAbsent] = useState(
    initialHasShoppingList === false,
  );

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
  /** true while the name input is open (unnamed recipe or pencil edit). */
  const [editingName, setEditingName] = useState(false);
  /** A real name exists once saved this session or reopened with a DB name. */
  const named = saved !== null || (initialTitle != null && initialTitle.trim() !== '');

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
      setEditingName(false);
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

  /** D-26 (F3): an applied swap routes through the Intake surface — reload the
   *  corrected lines so the workspace reflects the rewritten card. */
  const reloadLines = async (): Promise<void> => {
    try {
      const wire = await api<{ items: WireLine[] }>(`/recipes/${recipeId}/lines`);
      // D-1: header lines are review-only — the workspace/views read ingredients.
      setLines(wire.items.filter((l) => !l.is_header));
    } catch {
      // the review surface re-reads on its own schedule; a failed reload is not fatal
    }
  };

  /** The single POST /analyse source (D-14/D-17). On success the workspace
   *  points the status panel at the new analysis and clears the stale flag. */
  const runAnalysis = async (): Promise<void> => {
    setAnalysing(true);
    setAnalyseError(null);
    try {
      const ack = await api<AnalyseAck>(`/recipes/${recipeId}/analyse`, {
        method: 'POST',
        body: JSON.stringify({ mode }),
      });
      setAnalysisId(ack.analysis_id);
      setAnalysisStale(false);
      setAnalysisFullscreen(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ENQUEUE_BLOCKED') {
        setAnalyseError('Analysis is blocked: some lines still need review.');
      } else if (err instanceof ApiError && err.code === 'METHOD_REQUIRED') {
        setAnalyseError('Add a method first. Without one, the analysis would be list-only.');
      } else {
        setAnalyseError(err instanceof ApiError ? err.message : 'Could not start the analysis.');
      }
    } finally {
      setAnalysing(false);
    }
  };

  /** D-25/C6: editing the structured recipe (or the method) does NOT silently
   *  re-enqueue — it marks the displayed analysis stale so the primary action
   *  becomes "Re-analyse recipe". */
  const markAnalysisStale = (): void => {
    if (analysisId !== null) setAnalysisStale(true);
  };

  /** E6 + I5 (D-31): snapshot-only PDF print — same endpoint the analysis
   *  views use, surfaced once more in the header for discoverability. */
  const printOnePager = async (): Promise<void> => {
    setPrinting(true);
    setPrintError(null);
    const viewer = window.open('', '_blank');
    try {
      const res = await fetch(`${API_BASE_URL}/recipes/${recipeId}/print/one-pager`, {
        credentials: 'include',
      });
      if (!res.ok) {
        let message = res.statusText;
        try {
          const body = (await res.json()) as { error?: { message?: string } };
          message = body.error?.message ?? message;
        } catch {
          // non-JSON error body
        }
        viewer?.close();
        throw new ApiError(res.status, 'HTTP_ERROR', message);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (viewer) viewer.location.href = url;
      else window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      viewer?.close();
      setPrintError(err instanceof Error ? err.message : 'Could not print the one-pager');
    } finally {
      setPrinting(false);
    }
  };

  // Close the header More menu on outside click or Escape.
  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (target && target.closest('[data-ws-menu]')) return;
      setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [moreOpen]);

  useEffect(() => {
    const record = listSessionRecipes().find((r) => r.recipe_id === recipeId);
    // D-22: the saved DB name (library row) wins over the session preview —
    // after a browser restart no session record exists at all.
    setTitle(initialTitle ?? record?.preview ?? 'Recipe');
    setAnalysisId(null);
    setAnalysisStale(false);
    setAnalyseError(null);
    setLines(initialLines ?? []);
    setMethodState(null);
    if (!signedIn) {
      // Guests never fetch Bearer-only routes (API §3): no analysis fetch, no
      // console-noise 404 — the panel renders the guest copy instead.
      return;
    }
    if (initialAnalysisHint === 'none') {
      // A new recipe has no analysis row yet — skip the doomed 404 discovery.
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
  }, [recipeId, initialLines, initialTitle, signedIn, initialAnalysisHint]);

  const readinessPanel = (
    <ReadinessPanel
      recipeId={recipeId}
      signedIn={signedIn}
      lines={lines}
      onAnalyse={runAnalysis}
      analysing={analysing}
      error={analyseError}
      hasAnalysis={analysisId !== null}
      stale={analysisStale}
      onReviewLines={() => {
        selectTab('ingredients');
        requestAnimationFrame(() =>
          document
            .getElementById('ingredients-heading')
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
        );
      }}
    />
  );

  const analysisContent = (
    <>
      <div className="shrink-0">
        <h2 className="font-display text-h2 text-ink">Analysis</h2>
        <p className="mt-1 text-small text-muted">
          The nine-view analysis runs in the background. Status updates appear below.
        </p>
      </div>
      <div className="mt-4">
        {readinessPanel}
        <AnalysisPanel
          analysisId={analysisId}
          recipeId={recipeId}
          lines={lines}
          methodState={methodState}
          signedIn={signedIn}
          mode={mode}
          stale={analysisStale}
          onRetry={runAnalysis}
        />
      </div>
    </>
  );

  return (
    <div className="mx-auto flex max-w-none flex-col lg:h-[calc(100dvh-5.5625rem-2px)] lg:overflow-hidden">
      <div className="shrink-0">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 rounded-sm text-small font-semibold text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Back to your recipes
      </button>

      {/* Recipe hero — identity, mode, and the primary/secondary actions. */}
      <div className="mt-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Heading level={1}>{title}</Heading>
            {named && !editingName && (
              <button
                type="button"
                aria-label="Edit recipe name"
                onClick={() => {
                  setSaveTitle(title);
                  setEditingName(true);
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
              >
                <PencilSimple size={16} aria-hidden="true" weight="bold" />
              </button>
            )}
          </div>
          <p className="mt-1 max-w-prose text-small text-muted">
            Review the lines, attach a method, then run the analysis.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ModeToggle mode={mode} onSelect={selectMode} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => void printOnePager()}
            disabled={analysisId === null || printing}
          >
            {printing ? 'Printing…' : 'Print one-pager'}
          </Button>
          {/* RS-US: the chef-mode video walkthrough — a separate surface; the
              station card stays an actual printable card. */}
          {mode === 'chef' && (
            <Button variant="outline" size="sm" onClick={() => setVideoOpen(true)}>
              Video walkthrough
            </Button>
          )}
          {signedIn && (
            <div data-ws-menu className="relative">
              <button
                type="button"
                aria-label="More actions"
                aria-haspopup="menu"
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen(!moreOpen)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border-strong bg-transparent text-muted transition-colors hover:border-ink/40 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
              >
                <DotsThreeVertical size={18} aria-hidden="true" weight="bold" />
              </button>
              {moreOpen && (
                <div
                  aria-label="Recipe actions"
                  className="absolute right-0 top-10 z-20 min-w-44 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-card"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      setConfirmingDelete(true);
                    }}
                    disabled={deleting}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-small font-medium text-negative transition-colors hover:bg-negative/10 disabled:text-faint"
                  >
                    Delete recipe
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Editorial banner removed — the recipe workspace keeps the focus on the
          ingredients, method, shopping list and analysis. */}

      {printError && <p className="mt-2 text-caption text-negative">{printError}</p>}
      {/* Save — the name input shows only while unnamed or editing. */}
      {(!named || editingName) && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            aria-label="Recipe name"
            value={saveTitle}
            onChange={(e) => setSaveTitle(e.target.value)}
            placeholder="Family name (blank = the default)"
            maxLength={255}
            className="min-h-11 min-w-52 max-w-full rounded-md border border-border-strong bg-background px-3 py-2 text-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          />
          <Button onClick={() => void saveRecipe()} disabled={saving}>
            {saving ? 'Saving…' : 'Save recipe'}
          </Button>
          {editingName && (
            <Button variant="ghost" size="sm" onClick={() => setEditingName(false)} disabled={saving}>
              Cancel
            </Button>
          )}
          {saveError && <span className="text-caption text-negative">{saveError}</span>}
        </div>
      )}
      {saved && !editingName && (
        <p className="mt-2 text-caption text-body">
          Saved as <span className="font-semibold text-ink">{saved.title}</span> ·{' '}
          {new Date(saved.saved_at).toLocaleString()}
          <span className="block text-caption text-muted">
            Artifacts — raw input {saved.artifacts.raw_input ? '✓' : '—'} · photo{' '}
            {saved.artifacts.photo ? '✓' : '—'} · object {saved.artifacts.object ? '✓' : '—'} · identification{' '}
            {saved.artifacts.identification ? '✓' : '—'} · analysis {saved.artifacts.analysis ? '✓' : '—'} · timestamps ✓
          </span>
        </p>
      )}

      {/* Delete confirmation — reached from the header More menu (D-22 D6). */}
      {signedIn && confirmingDelete && (
        <section aria-labelledby="delete-heading" className="mt-4 rounded-lg border border-negative/40 bg-negative/8 p-5">
          <h2 id="delete-heading" className="text-small font-semibold text-negative">
            Delete recipe
          </h2>
          <p className="mt-2 text-small text-body">
            Delete <span className="font-semibold">{title}</span>? Its photo, object, analyses,
            lists and logs are permanently removed. This cannot be undone.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="danger" onClick={() => void deleteRecipe()} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete recipe'}
            </Button>
            <Button variant="outline" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
              Cancel
            </Button>
          </div>
        </section>
      )}
      {deleteError && <p className="mt-2 text-caption text-negative">{deleteError}</p>}
      </div>

      {/* Workflow tabs — always visible so the user can switch between the
          recipe sections and (once it exists) the full-screen analysis. */}
      <div className="mt-6 shrink-0">
        <div
          className="flex gap-6 overflow-x-auto overflow-y-hidden border-b border-border"
          role="tablist"
          aria-label="Recipe sections"
        >
          {(
            [
              ['ingredients', `Ingredients ${lines.length}`],
              ['method', 'Method'],
              ['shopping', 'Shopping list'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={!analysisFullscreen && activeTab === key}
              onClick={() => selectTab(key)}
              className={`-mb-px whitespace-nowrap border-b-2 px-1 py-3 text-small font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset--2 focus-visible:outline-gold ${
                !analysisFullscreen && activeTab === key
                  ? 'border-accent text-ink'
                  : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
          {analysisId !== null && (
            <button
              type="button"
              role="tab"
              aria-selected={analysisFullscreen}
              onClick={() => setAnalysisFullscreen(true)}
              className={`-mb-px whitespace-nowrap border-b-2 px-1 py-3 text-small font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset--2 focus-visible:outline-gold ${
                analysisFullscreen
                  ? 'border-accent text-ink'
                  : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              Analysis
            </button>
          )}
        </div>
      </div>

      {videoOpen ? (
        /* RS-US (chef mode): the video walkthrough owns the surface. */
        <section
          aria-label="Video walkthrough"
          className="mt-6 min-h-0 flex-1 overflow-y-auto lg:pe-1"
        >
          <VideoWalkthrough
            recipeId={recipeId}
            title={title}
            lines={lines}
            signedIn={signedIn}
            onBack={() => setVideoOpen(false)}
          />
        </section>
      ) : analysisFullscreen ? (
        /* Analysis — full width after the user runs it. */
        <section
          ref={analysisRef}
          aria-label="Analysis"
          className="mt-6 flex min-w-0 flex-1 flex-col lg:overflow-hidden"
        >
          <div className="min-h-0 flex-1 overflow-y-auto lg:pe-1">{analysisContent}</div>
        </section>
      ) : (
        /* Recipe surface — full width; the analysis is hidden until it runs. */
        <div className="mt-6 min-h-0 flex-1 overflow-y-auto lg:pe-1">
          {/* Active section — one focused view at a time. */}
          <div ref={sectionTopRef}>
            {activeTab === 'ingredients' && (
              <IngredientReview
                recipeId={recipeId}
                signedIn={signedIn}
                title={title}
                initialLines={initialLines}
                initialServings={initialServings}
                initialServingsEstimated={initialServingsEstimated}
                onLinesLoaded={setLines}
                onChanged={markAnalysisStale}
              />
            )}
            {activeTab === 'method' && (
              <MethodSection
                recipeId={recipeId}
                signedIn={signedIn}
                onChange={setMethodState}
                onSaved={markAnalysisStale}
              />
            )}
            {activeTab === 'shopping' && (
              <ShoppingSection
                recipeId={recipeId}
                skipInitialLoad={shoppingKnownAbsent}
                onGenerated={() => setShoppingKnownAbsent(false)}
              />
            )}
          </div>

          {/* Section footer — step forward through the three sections. */}
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <span className="text-caption text-faint">
              {activeTab === 'ingredients' && 'Step 1 of 3 — review the parsed lines.'}
              {activeTab === 'method' && 'Step 2 of 3 — attach the method.'}
              {activeTab === 'shopping' && 'Step 3 of 3 — your shopping list.'}
            </span>
            {activeTab === 'shopping' ? (
              <Button variant="outline" onClick={() => selectTab('ingredients')}>
                <ArrowLeft size={14} aria-hidden="true" weight="bold" />
                Back to ingredients
              </Button>
            ) : (
              <Button
                onClick={() => selectTab(activeTab === 'ingredients' ? 'method' : 'shopping')}
              >
                {activeTab === 'ingredients' ? 'Proceed to Method' : 'Proceed to Shopping list'}
                <ArrowRight size={14} aria-hidden="true" weight="bold" />
              </Button>
            )}
          </div>

          {/* Readiness + Analyse entry — lives with the recipe (not a pinned column). */}
          <div className="mt-6">{readinessPanel}</div>

          {/* Logging surfaces — cook log first; swaps only once a cook exists. */}
          {signedIn && (
            <>
              <div ref={cookRef} id="cook-section">
                <CookSection recipeId={recipeId} onLogsChanged={handleCookLogsChanged} />
              </div>
              {hasCookLog && (
                <SwapSection recipeId={recipeId} lines={lines} onApplied={() => void reloadLines()} />
              )}
              <details className="mt-6 rounded-lg border border-border bg-surface">
                <summary className="cursor-pointer list-none px-5 py-4 text-small font-semibold text-ink">
                  Tags
                </summary>
                <div className="border-t border-border px-5 py-4">
                  <TagsSection recipeId={recipeId} signedIn={signedIn} bare />
                </div>
              </details>
            </>
          )}
        </div>
      )}
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
