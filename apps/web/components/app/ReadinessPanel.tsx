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
import type { AnalyseAck, EnqueueState, WireLine } from '@/lib/types';

export interface ReadinessPanelProps {
  recipeId: string;
  signedIn: boolean;
  /** QA-B7 fix: the current lines — any review change re-fetches the canonical
   *  enqueue-state (the endpoint stays the single source of readiness). */
  lines: WireLine[];
  onAnalysed: (analysisId: string) => void;
}

export function ReadinessPanel({ recipeId, signedIn, lines, onAnalysed }: ReadinessPanelProps) {
  const [state, setState] = useState<EnqueueState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState(null);
    setError(null);
    if (!signedIn) return;
    api<EnqueueState>(`/recipes/${recipeId}/enqueue-state`)
      .then((s) => !cancelled && setState(s))
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'Could not check readiness.');
      });
    return () => {
      cancelled = true;
    };
  }, [recipeId, signedIn, lines]);

  const analyse = async (): Promise<void> => {
    setSubmitting(true);
    setError(null);
    try {
      const ack = await api<AnalyseAck>(`/recipes/${recipeId}/analyse`, {
        method: 'POST',
        body: JSON.stringify({ mode: 'home' }),
      });
      onAnalysed(ack.analysis_id);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ENQUEUE_BLOCKED') {
        setError('Analysis is blocked: some lines still need review.');
      } else if (err instanceof ApiError && err.code === 'METHOD_REQUIRED') {
        setError('Add a method first. Without one, the analysis would be list-only.');
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not start the analysis.');
      }
      setSubmitting(false);
    }
  };

  return (
    <section aria-labelledby="readiness-heading" className="mt-12 border-t border-border pt-8">
      <h2 id="readiness-heading" className="font-display text-h2 text-ink">
        Analysis
      </h2>
      <p className="mt-1 text-small text-muted">
        The nine-view analysis runs in the background. Status updates appear below.
      </p>

      {!signedIn ? (
        <p className="mt-4 text-small text-muted">
          Analysis needs an account. Sign in to run it on this recipe.
        </p>
      ) : state === null && error === null ? (
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
                  <p className="flex items-center gap-2 text-small font-semibold text-[#8A6516] dark:text-gold">
                    <Warning size={16} aria-hidden="true" weight="bold" />
                    Review required
                  </p>
                  <p className="mt-1 text-small text-body">
                    {state.blockers.length} line{state.blockers.length === 1 ? '' : 's'} need
                    your attention before analysis can begin.
                  </p>
                  <ul className="mt-2 list-inside list-disc text-small text-body">
                    {state.blockers.map((b) => (
                      <li key={b.line_id}>{b.display_name}</li>
                    ))}
                  </ul>
                </div>
              )}
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
              onClick={() => void analyse()}
              disabled={submitting || (state !== null && !state.can_enqueue)}
            >
              {submitting ? 'Starting...' : 'Analyse recipe'}
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
    </section>
  );
}
