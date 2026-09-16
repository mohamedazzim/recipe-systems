'use client';

// Analysis status (D-17 surface): the real backend states only, driven by the
// poll + SSE hook. No fake percentages, no simulated activity. When the
// backend reports complete, the D-17 persisted rows are shown (view rows with
// their real COMPLETE/INCOMPLETE status); the detailed Views 1-4 presentation
// is D-18 work and is honestly labeled as coming next.

import { CheckCircle, Clock, XCircle } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useAnalysisStatus } from '@/lib/hooks/useAnalysisStatus';
import { AnalysisViews } from '@/components/app/AnalysisViews';
import type { MethodState, WireLine } from '@/lib/types';

export interface AnalysisPanelProps {
  analysisId: string | null;
  recipeId: string;
  /** Current draft lines for ingredient-name resolution in the views. */
  lines: WireLine[];
  /** D-13 method wire state for the inferred-source display. */
  methodState: MethodState | null;
  /** Bearer-only assumption editors (RS-US-45): hidden for guests. */
  signedIn: boolean;
  /** D-20 (C3): home explains, chef briefs (station card leads). */
  mode?: 'home' | 'chef';
  /** The recipe changed since this analysis — show an out-of-date tag. */
  stale?: boolean;
  /** Retry action (same POST /analyse the workspace owns). */
  onRetry?: () => void;
}

const STATUS_COPY: Record<string, { label: string; live: boolean }> = {
  queued: { label: 'Analysis queued — waiting for a worker.', live: true },
  generating: { label: 'Analyzing recipe — generating views.', live: true },
  complete: { label: 'Analysis complete.', live: false },
  failed: { label: 'Analysis failed.', live: false },
};

export function AnalysisPanel({
  analysisId,
  recipeId,
  lines,
  methodState,
  signedIn,
  mode = 'home',
  stale = false,
  onRetry,
}: AnalysisPanelProps) {
  const { analysis, error, refresh } = useAnalysisStatus(analysisId);

  if (!analysisId) {
    return null;
  }

  return (
    <section aria-labelledby="status-heading" className="mt-6">
      <h2 id="status-heading" className="sr-only">
        Analysis status
      </h2>

      <div className="rounded-lg border border-border bg-surface p-5">
        {analysis === null && error === null && (
          <div className="flex items-center gap-3 text-small text-muted">
            <Spinner size="sm" label="Loading analysis status" />
            Loading status...
          </div>
        )}

        {error && (
          <Alert tone="error" title="Could not load the analysis status">
            {error}
          </Alert>
        )}

        {analysis && (
          <div aria-live="polite">
            <div className="flex flex-wrap items-center gap-2">
              {analysis.status === 'queued' && <Clock size={18} aria-hidden="true" className="text-muted" weight="bold" />}
              {analysis.status === 'generating' && <Spinner size="sm" label={STATUS_COPY[analysis.status].label} />}
              {analysis.status === 'complete' && <CheckCircle size={18} aria-hidden="true" className="text-positive" weight="bold" />}
              {analysis.status === 'failed' && <XCircle size={18} aria-hidden="true" className="text-negative" weight="bold" />}
              <span className="font-semibold text-ink">{STATUS_COPY[analysis.status]?.label ?? analysis.status}</span>
              {stale && (
                <span className="inline-flex items-center rounded-full border border-gold/60 bg-gold/10 px-2 py-0.5 text-caption font-semibold text-gold">
                  Views out of date — re-analyse
                </span>
              )}
            </div>

            {analysis.status !== 'complete' && analysis.status !== 'failed' && (
              <p className="mt-2 text-small text-muted">
                Status updates arrive automatically. You can stay on this page.
              </p>
            )}

            <p className="mt-2 text-caption text-faint">
              {analysis.mode} · prompt {analysis.prompt_version} ·{' '}
              {analysis.model_version ?? 'model not recorded'}
            </p>

            {analysis.status === 'failed' && (
              <div className="mt-4">
                <p className="text-small text-body">
                  Nothing was published from this run. Fix the recipe if needed, then retry.
                </p>
                {onRetry && (
                  <Button size="sm" onClick={() => void onRetry()} className="mt-3">
                    Retry analysis
                  </Button>
                )}
              </div>
            )}

            {analysis.status === 'complete' && (
              <div className="mt-5 border-t border-border pt-4">
                <AnalysisViews
                  analysis={analysis}
                  lines={lines}
                  methodState={methodState}
                  signedIn={signedIn}
                  onRefresh={refresh}
                  mode={mode}
                  recipeId={recipeId}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <p className="mt-3 text-caption text-faint">
        Analysis {analysisId.slice(0, 8)} for recipe {recipeId.slice(0, 8)}
      </p>
    </section>
  );
}
