'use client';

// D-26 (P7-2) F3/H5 — record what I actually used, against the LATEST cook log.
// The record is HISTORICAL (no edit/delete surface exists anywhere); the card is
// NEVER rewritten unless applied_to_card is checked, and applied swaps route
// through the Intake line surface (the workspace reloads lines afterwards).
// Restriction-driven swaps are the same record with reason=restriction (H5).

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { CookLog, SwapRecord, WireLine } from '@/lib/types';
import { Button } from '@/components/ui/Button';

export function SwapSection({
  recipeId,
  lines,
  onApplied,
}: {
  recipeId: string;
  lines: WireLine[];
  onApplied: () => void;
}) {
  const [logs, setLogs] = useState<CookLog[]>([]);
  const [lineId, setLineId] = useState('');
  const [action, setAction] = useState<'skipped' | 'reduced' | 'increased' | 'swapped'>('reduced');
  const [swappedTo, setSwappedTo] = useState('');
  const [reason, setReason] = useState<'restriction' | 'pantry' | 'other'>('other');
  const [apply, setApply] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recorded, setRecorded] = useState<SwapRecord[]>([]);

  const loadLogs = useCallback(async () => {
    try {
      const wire = await api<{ items: CookLog[] }>(`/recipes/${recipeId}/cook-logs`);
      setLogs(Array.isArray(wire?.items) ? wire.items : []);
    } catch (err) {
      // 404 = no logs yet — the surface shows the "log a cook first" state.
      if (!(err instanceof ApiError && err.status === 404)) {
        setError(err instanceof Error ? err.message : 'Could not load cook logs');
      }
    }
  }, [recipeId]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const latestLogId = logs[0]?.cook_log_id ?? null;

  const submit = async (): Promise<void> => {
    if (!latestLogId) return;
    setBusy(true);
    setError(null);
    try {
      const wire = await api<SwapRecord>(`/cook-logs/${latestLogId}/swaps`, {
        method: 'POST',
        body: JSON.stringify({
          line_id: lineId || undefined,
          action,
          swapped_to: swappedTo.trim() === '' ? null : swappedTo.trim(),
          reason,
          applied_to_card: apply,
        }),
      });
      setRecorded((prev) => [wire, ...prev]);
      setSwappedTo('');
      setApply(false);
      if (wire.applied_to_card) {
        onApplied();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record the swap');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="swap-heading" className="mt-6 rounded-lg border border-border bg-surface p-5">
      <h2 id="swap-heading" className="text-small font-semibold text-ink">
        What I actually used (swaps)
      </h2>
      <p className="mt-1 text-caption text-muted">
        Recorded against your latest cook log and kept forever. The card changes only when you check
        &ldquo;apply to card&rdquo; — restriction-driven swaps use the same record.
      </p>

      {latestLogId === null ? (
        <p className="mt-3 text-caption text-muted">Log a cook first — swaps attach to a cook log.</p>
      ) : (
        <div className="mt-3">
          <label className="block text-caption font-semibold text-ink" htmlFor="swap-line">
            Ingredient line
          </label>
          <select
            id="swap-line"
            aria-label="Ingredient line"
            value={lineId}
            onChange={(e) => setLineId(e.target.value)}
            className="mt-1 w-full max-w-md rounded-md border border-border-strong bg-surface px-3 py-2 text-body"
          >
            <option value="">Choose a line</option>
            {lines.map((line) => (
              <option key={line.id} value={line.id}>
                {line.display_name}
              </option>
            ))}
          </select>

          <label className="mt-3 block text-caption font-semibold text-ink" htmlFor="swap-action">
            What happened
          </label>
          <select
            id="swap-action"
            aria-label="Swap action"
            value={action}
            onChange={(e) => setAction(e.target.value as never)}
            className="mt-1 w-full max-w-md rounded-md border border-border-strong bg-surface px-3 py-2 text-body"
          >
            <option value="skipped">Skipped</option>
            <option value="reduced">Reduced</option>
            <option value="increased">Increased</option>
            <option value="swapped">Swapped</option>
          </select>

          <label className="mt-3 block text-caption font-semibold text-ink" htmlFor="swap-to">
            Actual value / swapped to
          </label>
          <input
            id="swap-to"
            aria-label="Swapped to"
            value={swappedTo}
            onChange={(e) => setSwappedTo(e.target.value)}
            placeholder="e.g. 3 Nos"
            maxLength={255}
            className="mt-1 w-full max-w-md rounded-md border border-border-strong bg-surface px-3 py-2 text-body"
          />

          <label className="mt-3 block text-caption font-semibold text-ink" htmlFor="swap-reason">
            Reason
          </label>
          <select
            id="swap-reason"
            aria-label="Swap reason"
            value={reason}
            onChange={(e) => setReason(e.target.value as never)}
            className="mt-1 w-full max-w-md rounded-md border border-border-strong bg-surface px-3 py-2 text-body"
          >
            <option value="restriction">Restriction</option>
            <option value="pantry">Pantry</option>
            <option value="other">Other</option>
          </select>

          <label className="mt-3 flex items-center gap-2 text-caption text-body">
            <input
              type="checkbox"
              aria-label="Apply to card"
              checked={apply}
              onChange={(e) => setApply(e.target.checked)}
            />
            Apply to card (rewrites the line through the review surface)
          </label>

          <div className="mt-3">
            <Button onClick={() => void submit()} disabled={busy}>
              {busy ? 'Saving…' : 'Record swap'}
            </Button>
          </div>
          {error && <p className="mt-2 text-caption text-negative">{error}</p>}
        </div>
      )}

      {recorded.length > 0 && (
        <ul className="mt-4 divide-y divide-border border-t border-border">
          {recorded.map((swap) => (
            <li key={swap.swap_id} className="py-1.5 text-caption text-body">
              <span className="font-semibold">{swap.ingredient_name_snapshot}</span> — {swap.action}
              {swap.swapped_to ? ` → ${swap.swapped_to}` : ''}
              {swap.reason ? ` · ${swap.reason}` : ''}
              {swap.applied_to_card ? ' · applied to card' : ' · card unchanged'}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
