'use client';

// Analysis readiness + launch (D-14 + D-17 surfaces). Readiness comes ONLY
// from the canonical GET enqueue-state endpoint (no client-side calculation).
// The Analyse action is disabled while the backend says can_enqueue=false,
// with the real blocker lines listed. Enqueue errors surface the real codes
// (409 ENQUEUE_BLOCKED, 422 METHOD_REQUIRED).

import { useEffect, useState } from 'react';
import { CheckCircle, Warning, XCircle } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { api, ApiError } from '@/lib/api';
import type { EnqueueState, WireLine } from '@/lib/types';

export interface ReadinessPanelProps {
  recipeId: string;
  signedIn: boolean;
  /** QA-B7 fix: the current lines — any review change re-fetches the canonical
   *  enqueue-state (the endpoint stays the single source of readiness). */
  lines: WireLine[];
  /** Launch action owned by the workspace (single POST /analyse source). */
  onAnalyse: () => Promise<void>;
  /** true while the POST /analyse is in flight. */
  analysing: boolean;
  /** Error from the last analyse attempt (workspace-owned). */
  error: string | null;
  /** An analysis already exists for this recipe. */
  hasAnalysis: boolean;
  /** The recipe changed since the current analysis — primary action re-analyses. */
  stale: boolean;
  /** Jump back to the Ingredients panel from a blocked-line "Review" link. */
  onReviewLines?: () => void;
}

export function ReadinessPanel({
  recipeId,
  signedIn,
  lines,
  onAnalyse,
  analysing,
  error,
  hasAnalysis,
  stale,
  onReviewLines,
}: ReadinessPanelProps) {
  const [state, setState] = useState<EnqueueState | null>(null);
  const [readyError, setReadyError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState(null);
    setReadyError(null);
    if (!signedIn) return;
    api<EnqueueState>(`/recipes/${recipeId}/enqueue-state`)
      .then((s) => !cancelled && setState(s))
      .catch((err: unknown) => {
        if (cancelled) return;
        setReadyError(err instanceof ApiError ? err.message : 'Could not check readiness.');
      });
    return () => {
      cancelled = true;
    };
  }, [recipeId, signedIn, lines]);

  return (
    <section aria-labelledby="readiness-heading" className="mt-6">
      <h2 id="readiness-heading" className="font-display text-h2 text-ink">
        Analysis
      </h2>

      {!signedIn ? (
        <p className="mt-4 text-small text-muted">
          Analysis needs an account. Sign in to run it on this recipe.
        </p>
      ) : !hasAnalysis || stale ? (
        <>
          {!hasAnalysis && (
            <p className="mt-1 text-small text-muted">
              The nine-view analysis runs in the background. Status updates appear below.
            </p>
          )}
          {state === null && readyError === null ? (
            <div className="mt-4 flex items-center gap-3 text-small text-muted">
              <Spinner size="sm" label="Checking readiness" />
              Checking readiness...
            </div>
          ) : (
            <>
              {state && (
                <div className="mt-4" aria-live="polite">
                  {state.can_enqueue ? (
                    <p className="flex items-center gap-2 text-small font-semibold text-positive">
                      <CheckCircle size={16} aria-hidden="true" weight="bold" />
                      Ready to analyse. All lines are confirmed.
                    </p>
                  ) : (
                    <div className="rounded-md border border-gold/60 bg-gold/10 px-4 py-3">
                      <p className="flex items-center gap-2 text-small font-semibold text-gold">
                        <Warning size={16} aria-hidden="true" weight="bold" />
                        Review required
                      </p>
                      <p className="mt-1 text-small text-body">
                        {state.blockers.length} line{state.blockers.length === 1 ? '' : 's'} need
                        your attention before analysis can begin.
                      </p>
                      <ul className="mt-2 space-y-1 text-small text-body">
                        {state.blockers.map((b) => (
                          <li key={b.line_id} className="flex flex-wrap items-center justify-between gap-2">
                            <span>{b.display_name}</span>
                            {onReviewLines && (
                              <button
                                type="button"
                                onClick={onReviewLines}
                                className="text-caption font-semibold text-accent-strong underline-offset-2 hover:underline"
                              >
                                Review
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                      {/* Locked preview — communicates what the analysis will
                          unlock, without rendering live view content. */}
                      <div className="mt-3 border-t border-gold/30 pt-3" aria-hidden="true">
                        <p className="text-caption font-semibold text-muted">
                          Once review is cleared, the analysis will open:
                        </p>
                        <ul className="mt-1 flex flex-wrap gap-1 text-caption text-faint">
                          {['Why it works', 'Balance', 'Process', 'Substitutions', 'Regional'].map((label) => (
                            <li
                              key={label}
                              className="rounded-md border border-border px-2.5 py-1"
                            >
                              {label}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {stale && hasAnalysis && (
                <div className="mt-4">
                  <Alert tone="warning" title="Changes need analysis">
                    The recipe changed since your last analysis. Re-analyse to refresh the views.
                  </Alert>
                </div>
              )}

              {error && (
                <div className="mt-4">
                  <Alert tone="error" title="Analysis did not start">
                    {error}
                  </Alert>
                </div>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button
                  size="lg"
                  onClick={() => void onAnalyse()}
                  disabled={analysing || (state !== null && !state.can_enqueue)}
                >
                  {analysing ? 'Starting analysis…' : stale ? 'Re-analyze recipe' : 'Analyse recipe'}
                </Button>
                {state !== null && !state.can_enqueue && (
                  <span className="inline-flex items-center gap-1.5 text-small text-muted">
                    <XCircle size={14} aria-hidden="true" className="text-negative" />
                    Blocked by the lines above.
                  </span>
                )}
              </div>
            </>
          )}
        </>
      ) : null}
    </section>
  );
}
