'use client';

// D-26 (P7-2) H3 — the conflicts-first highlight. Rendered at the TOP of the
// View 8 card (before the dietary content): conflicts first, unknown shown as
// unknown (NEVER a pass), and profile notes carry the diet patterns. Signed-in
// only (profiles are account-owned); guests render nothing.

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { RestrictionHighlight } from '@/lib/types';

export function RestrictionHighlight({
  analysisId,
  signedIn,
}: {
  analysisId: string;
  signedIn: boolean;
}) {
  const [highlight, setHighlight] = useState<RestrictionHighlight | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    api<RestrictionHighlight>(`/analysis/${analysisId}/restriction-highlight`)
      .then((wire) => {
        if (!cancelled) setHighlight(wire);
      })
      .catch((err: unknown) => {
        // 404 = no profile yet or no analysis — the surface stays empty.
        if (!cancelled && err instanceof ApiError && err.status === 404) {
          setHighlight(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [analysisId, signedIn]);

  if (!highlight) return null;
  // Defensive normalization: a non-canonical wire (e.g. a mocked 200) renders empty.
  const conflicts = Array.isArray(highlight.conflicts) ? highlight.conflicts : [];
  const unknown = Array.isArray(highlight.unknown) ? highlight.unknown : [];
  const notFlagged = Array.isArray(highlight.not_flagged) ? highlight.not_flagged : [];
  const profileNotes = Array.isArray(highlight.profile_notes) ? highlight.profile_notes : [];
  const empty =
    conflicts.length === 0 && unknown.length === 0 && notFlagged.length === 0 && profileNotes.length === 0;
  if (empty) return null;

  return (
    <div className="mt-4 rounded-md border border-border bg-surface p-4" data-testid="restriction-highlight">
      <p className="eyebrow">Against your restriction profile</p>
      {conflicts.length > 0 && (
        <div className="mt-2">
          <p className="text-small font-semibold text-negative">Conflicts first</p>
          <ul className="mt-1 list-inside list-disc text-small text-body">
            {conflicts.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
      )}
      {unknown.length > 0 && (
        <div className="mt-2">
          <p className="text-small font-semibold text-ink">Unknown — not a pass</p>
          <ul className="mt-1 list-inside list-disc text-small text-body">
            {unknown.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
      )}
      {notFlagged.length > 0 && (
        <p className="mt-2 text-caption text-muted">
          Not flagged on this card: {notFlagged.join(', ')} — no pass claimed.
        </p>
      )}
      {profileNotes.length > 0 && (
        <ul className="mt-2 list-inside list-disc text-caption text-muted">
          {profileNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
