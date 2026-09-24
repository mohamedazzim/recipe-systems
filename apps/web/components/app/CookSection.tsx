'use client';

// D-24 (P6-1) — the canonical after-cook capture (F1/F2/F5/F6, API §8).
//
//   F1 — "I cooked this" logs a NEW session (multiple logs kept): cook_date
//        defaults to today, editable; the library row shows last cooked.
//   F2 — optional 1–5 rating + free-text note, private; visible on reopen,
//        above the analysis.
//   F5 — one plate photo per log (D-31): attach/replace; never re-analysed.
//   F6 — the recall strip at the top: last cooked date, rating, and the
//        next-time line surfaced when present (only F4/D-26 writes it).
//
// Data comes ONLY from the BFF cook endpoints (never browser state):
//   GET  /recipes/:recipeId/last-cook + /cook-logs  (reopen hydration)
//   POST /recipes/:recipeId/cook-logs               (log a cook)
//   PATCH /cook-logs/:cookLogId                     (edit rating/note — RS-US-32)
//   POST /cook-logs/:cookLogId/photo                (attach plate photo — F5)
//   GET  /cook-logs/:cookLogId/photo                (photo presence — F5)
//
// NON-GOALS (DISPATCH D-24): swaps (F3), the next-time FIELD (F4).

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, apiUpload } from '@/lib/api';
import { photoUrl } from '@/lib/photo';
import type { CookLog, LastCook, PlatePhoto } from '@/lib/types';
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

export function CookSection({
  recipeId,
  onLogsChanged,
}: {
  recipeId: string;
  /** Reports the cook-log count after each load — the workspace uses it to
   *  reveal the swaps surface once the first cook exists. */
  onLogsChanged?: (count: number) => void;
}) {
  const [last, setLast] = useState<LastCook | null>(null);
  const [logs, setLogs] = useState<CookLog[]>([]);
  const [open, setOpen] = useState(false);
  const [cookDate, setCookDate] = useState(() => localToday());
  const [rating, setRating] = useState('');
  const [note, setNote] = useState('');
  const [nextTime, setNextTime] = useState('');
  const [photo, setPhoto] = useState<PlatePhoto | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** F5 photo states — kept separate from the cook-log error so one honest
   *  error lives per surface. */
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoLoadFailed, setPhotoLoadFailed] = useState(false);

  const loadPhoto = useCallback(async (logId: string | undefined) => {
    if (!logId) {
      setPhoto(null);
      return;
    }
    try {
      const wire = await api<PlatePhoto>(`/cook-logs/${logId}/photo`);
      setPhoto(wire);
      setPhotoLoadFailed(false);
    } catch {
      // 404 PLATE_PHOTO_NOT_FOUND = no photo yet; any failure stays quiet here.
      setPhoto(null);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const [lastWire, listWire] = await Promise.all([
        api<LastCook>(`/recipes/${recipeId}/last-cook`),
        api<{ items: CookLog[] }>(`/recipes/${recipeId}/cook-logs`),
      ]);
      setLast(lastWire);
      const items = Array.isArray(listWire?.items) ? listWire.items : [];
      setLogs(items);
      onLogsChanged?.(items.length);
      // D-4: only fetch the photo when the log actually has one — a missing
      // photo is an expected empty state, never a 404 GET (no console noise).
      await loadPhoto(items[0]?.has_photo ? items[0]?.cook_log_id : undefined);
      setError(null);
    } catch (err) {
      // 404 = no logs yet / recipe not found — the workspace owns recipe-level
      // errors; this surface simply shows the empty cook log.
      if (err instanceof ApiError && err.status === 404) {
        setLast(null);
        setLogs([]);
        onLogsChanged?.(0);
        setPhoto(null);
        return;
      }
      setError(err instanceof Error ? err.message : 'Could not load the cook log');
    }
  }, [recipeId, loadPhoto, onLogsChanged]);

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

  const attachPhoto = async (): Promise<void> => {
    if (!latest || !photoFile) return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const form = new FormData();
      form.append('file', photoFile);
      const wire = await apiUpload<PlatePhoto>(`/cook-logs/${latest.cook_log_id}/photo`, form);
      setPhoto(wire);
      setPhotoFile(null);
      setPhotoLoadFailed(false);
    } catch (err) {
      setPhotoError(err instanceof ApiError ? err.message : 'Could not save photo. Try again.');
    } finally {
      setPhotoBusy(false);
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
            className="mt-1 w-full max-w-52 rounded-md border border-border-strong bg-surface px-3 py-2 text-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          />
          <label className="mt-3 block text-caption font-semibold text-ink" htmlFor="cook-rating">
            Rating (optional)
          </label>
          <select
            id="cook-rating"
            aria-label="Rating"
            value={rating}
            onChange={(e) => setRating(e.target.value)}
            className="mt-1 w-full max-w-52 rounded-md border border-border-strong bg-surface px-3 py-2 text-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
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
            className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
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
            className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
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

      {/* F5 (D-31) — one plate photo per log, never re-analysed. The photo
          attaches to the LATEST log; attaching again replaces it. */}
      {latest && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-caption font-semibold text-ink">Plate photo</p>

          {photo ? (
            <div className="mt-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- dynamic
                  object-storage asset (user plate photo); no Next optimizer
                  remote-pattern for private S3 URLs, and the preview is tiny. */}
              <img
                src={photoUrl(photo.photo_uri)}
                alt="Plate photo — the finished dish"
                data-testid="plate-photo-preview"
                onError={() => setPhotoLoadFailed(true)}
                className="max-h-64 w-auto max-w-full rounded-md border border-border object-contain"
              />
              {photoLoadFailed && (
                <p className="mt-1 text-caption text-negative">
                  Could not load the photo preview.
                </p>
              )}
              <p className="mt-1 text-caption text-positive" role="status" data-testid="plate-photo-saved">
                Photo saved
              </p>
            </div>
          ) : (
            <p className="mt-1 text-caption text-muted">
              Add a photo of the finished dish.
            </p>
          )}

          <input
            type="file"
            accept="image/jpeg,image/png"
            aria-label="Plate photo"
            onChange={(e) => {
              setPhotoFile(e.target.files?.[0] ?? null);
              setPhotoError(null);
              setPhotoLoadFailed(false);
            }}
            className="mt-2 block text-caption"
          />
          {photoFile && (
            <div className="mt-2">
              <Button onClick={() => void attachPhoto()} disabled={photoBusy}>
                {photoBusy ? 'Uploading photo…' : photo ? 'Replace photo' : 'Upload photo'}
              </Button>
            </div>
          )}
          {photoError && (
            <p className="mt-2 text-caption text-negative" role="alert">
              {photoError}
            </p>
          )}
        </div>
      )}

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
