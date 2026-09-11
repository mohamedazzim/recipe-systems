'use client';

// D-20 (P4-2): the station card — a chef's working brief, rendered from the
// persisted analysis_station_card row (worker-assembled, never free prose).
// §7 output order: identification → station card → control points →
// product/yield/hold → "Untasted briefing. Season after."
// D-23 (P5-2): the print surface — the PDF comes from the snapshot-only
// print endpoint (no re-analysis, no print-time allergen derivation).

import { useState } from 'react';
import { API_BASE_URL, ApiError } from '@/lib/api';
import { Badge, Tag } from '@/components/ui/Badge';
import type { StationCard } from '@/lib/types';

export function StationCard({ card, recipeId }: { card: StationCard; recipeId?: string }) {
  const mise = Object.entries(card.mise);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  async function printCard() {
    if (!recipeId) return;
    setPrinting(true);
    setPrintError(null);
    // Open the viewer SYNCHRONOUSLY inside the click gesture — window.open
    // after the awaited fetch would be outside the user-activation window and
    // blocked as a popup. The tab is navigated to the PDF blob once ready.
    const viewer = window.open('', '_blank');
    try {
      const res = await fetch(`${API_BASE_URL}/recipes/${recipeId}/print/station-card`, {
        credentials: 'include',
      });
      if (!res.ok) {
        let code = 'HTTP_ERROR';
        let message = res.statusText;
        try {
          const body = (await res.json()) as { error?: { code?: string; message?: string } };
          code = body.error?.code ?? code;
          message = body.error?.message ?? message;
        } catch {
          // non-JSON error body
        }
        viewer?.close();
        throw new ApiError(res.status, code, message);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (viewer) {
        viewer.location.href = url;
      } else {
        window.open(url, '_blank');
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      viewer?.close();
      setPrintError(err instanceof Error ? err.message : 'Could not print the station card');
    } finally {
      setPrinting(false);
    }
  }

  return (
    <section aria-labelledby="station-card-heading" className="rounded-lg border border-border bg-surface p-5">
      <p className="eyebrow">Chef mode · station card</p>
      <h3 id="station-card-heading" className="mt-1 font-display text-h2 text-ink">
        Station card
      </h3>
      {recipeId && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => void printCard()}
            disabled={printing}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-border-strong bg-transparent px-3 py-1.5 text-small font-semibold text-ink transition-colors hover:border-ink/40 hover:bg-ink/5 disabled:cursor-not-allowed disabled:text-faint"
          >
            {printing ? 'Printing…' : 'Print station card'}
          </button>
          {printError && <p className="mt-2 text-caption text-negative">{printError}</p>}
        </div>
      )}

      <div className="mt-5">
        <h4 className="text-small font-semibold text-ink">Mise</h4>
        <ul className="mt-2 divide-y divide-border rounded-md border border-border">
          {mise.map(([id, item]) => (
            <li key={id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span className="text-small text-body">
                <span className="font-semibold">{item.display_name}</span>
                {item.amount ? <span className="text-muted"> · {item.amount}</span> : null}
              </span>
              <Badge tag={item.tag as Tag} />
            </li>
          ))}
        </ul>
        {mise.length === 0 && <p className="mt-2 text-small text-muted">No mise recorded.</p>}
      </div>

      <div className="mt-5">
        <h4 className="text-small font-semibold text-ink">Sequence</h4>
        <ol className="mt-2 space-y-3">
          {card.sequence.map((stage, index) => (
            <li key={`${stage.stage_name}-${index}`} className="text-small text-body">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-ink">
                  {index + 1}. {stage.stage_name}
                </span>
                <Badge tag={stage.tag as Tag} />
              </div>
              <p className="mt-0.5">{stage.action}</p>
              <p className="text-muted">
                Cue: {stage.cue}
                {stage.duration && stage.duration !== 'UNKNOWN'
                  ? ` · ${stage.duration}`
                  : ' · clock unknown — cue leads'}
              </p>
            </li>
          ))}
        </ol>
      </div>

      {card.control_points.length > 0 && (
        <div className="mt-5">
          <h4 className="text-small font-semibold text-ink">Control points</h4>
          <ul className="mt-2 space-y-1 text-small text-body">
            {card.control_points.map((point, index) => (
              <li key={`${point.stage_name}-${index}`} className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-ink">{point.stage_name}:</span>
                <span>{point.cue}</span>
                <Badge tag={point.tag as Tag} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {card.do_nots.length > 0 && (
        <div className="mt-5">
          <h4 className="text-small font-semibold text-ink">Do not</h4>
          <ul className="mt-2 space-y-1 text-small text-body">
            {card.do_nots.map((dont) => (
              <li key={dont.item} className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{dont.item}</span>
                <span className="text-muted">{dont.note}</span>
                <Badge tag="ABSENT" />
              </li>
            ))}
          </ul>
        </div>
      )}

      {card.product_yield_hold !== null && (
        <div className="mt-5">
          <h4 className="text-small font-semibold text-ink">Product · yield · hold</h4>
          <p className="mt-1 text-small text-body">
            {Object.entries(card.product_yield_hold)
              .map(([key, value]) => `${key}: ${String(value)}`)
              .join(' · ')}
          </p>
        </div>
      )}

      <p className="mt-6 border-t border-border pt-3 text-caption text-muted">
        Untasted briefing. Season after.
      </p>
    </section>
  );
}

/** The refusal path (A-20 precondition): a complete analysis with NO card. */
export function NoStationCard() {
  return (
    <section aria-label="Station card unavailable" className="rounded-lg border border-border bg-surface p-5">
      <p className="eyebrow">Chef mode · station card</p>
      <h3 className="mt-1 font-display text-h2 text-ink">Station card</h3>
      <p className="mt-3 text-small text-body">
        No station card for this analysis — the process was incomplete or no method was attached.
        Views 3 and 7 stay incomplete rather than inventing steps.
      </p>
    </section>
  );
}
