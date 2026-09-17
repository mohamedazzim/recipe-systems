// Analysis status: poll the real GET /analysis/:id endpoint (reload-from-Postgres,
// INV-16) and layer the real SSE event stream on top as a faster signal. No fake
// progress: only the backend states (queued / generating / complete / failed) are
// ever rendered.

import { useEffect, useRef, useState } from 'react';
import { api, ApiError, API_BASE_URL, readCookie } from '@/lib/api';
import type { AnalysisState, AnalysisStatus } from '@/lib/types';

export interface AnalysisStatusValue {
  analysis: AnalysisState | null;
  /** Terminal status reached (complete or failed) or null while still running. */
  terminal: AnalysisStatus | null;
  error: string | null;
  /** Manual refresh (D-19: the View 9 assumption editor re-reads after the
   *  worker's recompute signal — the same GET /analysis/:id read). */
  refresh: () => Promise<void>;
}

const POLL_MS = 2000;

export function useAnalysisStatus(analysisId: string | null): AnalysisStatusValue {
  const [analysis, setAnalysis] = useState<AnalysisState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const closedRef = useRef(false);

  const refreshRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    if (!analysisId) return;
    closedRef.current = false;
    setAnalysis(null);
    setError(null);

    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let eventSource: EventSource | null = null;
    let stopped = false;

    const refresh = async (): Promise<boolean> => {
      // terminal = stop polling when the backend says the job is done
      try {
        const state = await api<AnalysisState>(`/analysis/${analysisId}`);
        if (stopped) return false;
        setAnalysis(state);
        setError(null);
        return state.status === 'complete' || state.status === 'failed';
      } catch (err) {
        if (stopped) return false;
        // A-17 (one-writer BLOCKER): the API only enqueues — the worker
        // materializes the analysis_* row on delivery. Right after POST
        // /analyse the row may not exist yet, so that 404 is "queued, not yet
        // written", never a failure. Keep polling; the row appears on the
        // next tick (and the SSE events endpoint reconnects the same way).
        if (err instanceof ApiError && err.code === 'ANALYSIS_NOT_FOUND') {
          setAnalysis(null);
          setError(null);
          return false;
        }
        setAnalysis(null);
        setError(err instanceof Error ? err.message : 'Could not load the analysis.');
        return false;
      }
    };
    refreshRef.current = async () => {
      await refresh();
    };

    const poll = async (): Promise<void> => {
      const terminal = await refresh();
      if (terminal || stopped) return;
      pollTimer = setTimeout(poll, POLL_MS);
    };

    void poll();

    // SSE: a signal, never durable state (INV-16). Snapshot replay arrives
    // first, then live status events; the poll above stays the source of truth.
    // QA-B3 fix: cross-origin EventSource must opt into credentials — without
    // `withCredentials` the browser sends no cookies and the BFF 403s the connect.
    try {
      const url = `${API_BASE_URL}/analysis/${analysisId}/events`;
      const es = new EventSource(url, { withCredentials: true });
      eventSource = es;
      const onEvent = (ev: Event): void => {
        if (stopped) return;
        try {
          const data = JSON.parse((ev as MessageEvent).data as string) as { status?: string };
          if (data.status === 'complete' || data.status === 'failed') {
            void refresh();
          }
        } catch {
          // malformed event: ignore, the poll re-syncs
        }
      };
      es.addEventListener('status', onEvent);
      es.addEventListener('snapshot', onEvent);
    } catch {
      // SSE unavailable in this browser: polling alone is fine
    }

    return () => {
      stopped = true;
      closedRef.current = true;
      if (pollTimer) clearTimeout(pollTimer);
      if (eventSource) eventSource.close();
    };
  }, [analysisId]);

  const terminal =
    analysis && (analysis.status === 'complete' || analysis.status === 'failed')
      ? analysis.status
      : null;

  return { analysis, terminal, error, refresh: refreshRef.current };
}

/** The session cookie name the BFF sets (readable, non-httpOnly). */
export function hasSessionCookie(): boolean {
  return Boolean(readCookie('recipe_session'));
}
