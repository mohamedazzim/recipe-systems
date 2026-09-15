'use client';

// D-24 (P6-1) — the canonical after-cook capture (F1/F2/F6, API §8).
//
//   F1 — "I cooked this" logs a NEW session (multiple logs kept): cook_date
//        defaults to today, editable; the library row shows last cooked.
//   F2 — optional 1–5 rating + free-text note, private; visible on reopen,
//        above the analysis.
//   F6 — the recall strip at the top: last cooked date, rating, and the
//        next-time line surfaced when present (only F4/D-26 writes it).
//
// Data comes ONLY from the BFF cook endpoints (never browser state):
//   GET  /recipes/:recipeId/last-cook + /cook-logs  (reopen hydration)
//   POST /recipes/:recipeId/cook-logs               (log a cook)
//   PATCH /cook-logs/:cookLogId                     (edit rating/note — RS-US-32)
//
// NON-GOALS (DISPATCH D-24): swaps (F3), the next-time FIELD (F4), photos (F5).

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { CookLog, LastCook } from '@/lib/types';
import { Button } from '@/components/ui/Button';

function localToday(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Date-only wire strings render at local noon so no timezone can shift the day. */
function formatDate(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString();
}

export function CookSection({ recipeId }: { recipeId: string }) {
  const [last, setLast] = useState<LastCook | null>(null);
  const [logs, setLogs] = useState<CookLog[]>([]);
  const [open, setOpen] = useState(false);
  const [cookDate, setCookDate] = useState(() => localToday());
  const [rating, setRating] = useState('');
  const [note, setNote] = useState('');
  const [nextTime, setNextTime] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [lastWire, listWire] = await Promise.all([
        api<LastCook>(`/recipes/${recipeId}/last-cook`),
        api<{ items: CookLog[] }>(`/recipes/${recipeId}/cook-logs`),
      ]);
      setLast(lastWire);
      setLogs(Array.isArray(listWire?.items) ? listWire.items : []);
      setError(null);
    } catch (err) {
      // 404 = no logs yet / recipe not found — the workspace owns recipe-level
      // errors; this surface simply shows the empty cook log.
      if (err instanceof ApiError && err.status === 404) {
        setLast(null);
        setLogs([]);
        return;
      }
      setError(err instanceof Error ? err.message : 'Could not load the cook log');
    }
  }, [recipeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api<CookLog>(`/recipes/${recipeId}/cook-logs`, {
        method: 'POST',
        body: JSON.stringify({
          cook_date: cookDate,
          rating: rating === '' ? null : Number(rating),
          note: note.trim() === '' ? null : note.trim(),
          next_time: nextTime.trim() === '' ? null : nextTime.trim(),
        }),
      });
      setOpen(false);
      setRating('');
      setNote('');
      setNextTime('');
      setCookDate(localToday());
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the cook log');
    } finally {
      setBusy(false);
    }
  };

  const latest = logs[0] ?? null;

  return (
    <section aria-labelledby="cook-heading" className="mt-6 rounded-lg border border-border bg-surface p-5">
      <h2 id="cook-heading" className="text-small font-semibold text-ink">
        Cook log
      </h2>
      <p className="mt-1 text-caption text-muted">
        Log when you cooked it. Notes are private to your account.
      </p>

      {/* F6 AC-1 — the reopen recall at the top: last cooked date, rating,
          next-time line (when present). The F2 note sits right above the
          analysis below. */}
      {last && last.last_cooked_at !== null && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="text-small text-body" data-testid="last-cook-recall">
            Last cooked <span className="font-semibold">{formatDate(last.last_cooked_at)}</span>
            {last.rating !== null ? ` · Rating ${last.rating}/5` : ''}
          </p>
          {last.next_time && (
            <p className="mt-1 text-caption font-semibold text-accent">Next time: {last.next_time}</p>
          )}
        </div>
      )}
      {latest?.note && (
        <p className="mt-2 text-caption text-body">
          Your note: <span className="font-semibold">{latest.note}</span>
        </p>
      )}

      {!open ? (
        <div className="mt-3">
          <Button onClick={() => setOpen(true)}>I cooked this</Button>
        </div>
      ) : (
        <div className="mt-3 border-t border-border pt-3">
          <label className="block text-caption font-semibold text-ink" htmlFor="cook-date">
            Cooked on
          </label>
          <input
            id="cook-date"
            type="date"
            aria-label="Cooked on"
            value={cookDate}
            onChange={(e) => setCookDate(e.target.value)}
            className="mt-1 w-full max-w-52 rounded-md border border-border-strong bg-background px-3 py-2 text-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          />
          <label className="mt-3 block text-caption font-semibold text-ink" htmlFor="cook-rating">
            Rating (optional)
          </label>
          <select
            id="cook-rating"
            aria-label="Rating"
            value={rating}
            onChange={(e) => setRating(e.target.value)}
            className="mt-1 w-full max-w-52 rounded-md border border-border-strong bg-background px-3 py-2 text-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          >
            <option value="">No rating</option>
            <option value="1">1 — poor</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5 — excellent</option>
          </select>
          <label className="mt-3 block text-caption font-semibold text-ink" htmlFor="cook-note">
            Note (optional, private)
          </label>
          <textarea
            id="cook-note"
            aria-label="Note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={10_000}
            placeholder="What happened? What would you change next time?"
            className="mt-1 w-full rounded-md border border-border-strong bg-background px-3 py-2 text-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          />
          <label className="mt-3 block text-caption font-semibold text-ink" htmlFor="cook-next-time">
            Next time (optional — prints on the station card, tagged COOK LOG)
          </label>
          <input
            id="cook-next-time"
            aria-label="Next time"
            value={nextTime}
            onChange={(e) => setNextTime(e.target.value)}
            maxLength={1_000}
            placeholder="e.g. 2 green chillies, fenugreek powder off heat"
            className="mt-1 w-full rounded-md border border-border-strong bg-background px-3 py-2 text-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button onClick={() => void submit()} disabled={busy}>
              {busy ? 'Saving…' : 'Save cook log'}
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-caption text-negative">{error}</p>}

      {/* F1 AC-2 — multiple logs per recipe, all kept and listed. */}
      {logs.length > 1 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-caption font-semibold text-ink">Cook history</p>
          <ul className="mt-2 divide-y divide-border">
            {logs.map((log) => (
              <li key={log.cook_log_id} className="py-1.5 text-caption text-body">
                <span className="font-semibold">{formatDate(log.cook_date)}</span>
                {log.rating !== null ? ` · ${log.rating}/5` : ''}
                {log.note ? ` — ${log.note}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
