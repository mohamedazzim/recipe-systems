'use client';

// Phase 3 draft review — inspect the source-faithful structured extraction of
// one document before any recipe is created. Read-only inspection: the source
// text, the extracted fields, and per-field "needs review" flags. A draft is
// NOT a recipe yet — no save/confirm action exists in this phase.

import { useEffect, useState } from 'react';
import { ArrowLeft, Warning } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Heading, Text } from '@/components/ui/Typography';
import { api, ApiError } from '@/lib/api';
import type { DocumentDraft } from '@/lib/types';

export interface DocumentDraftReviewProps {
  ingestionId: string;
  originalFilename: string;
  onBack: () => void;
}

function ReviewBadge({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-gold/50 bg-gold/10 px-2 py-0.5 text-caption font-semibold text-gold">
      <Warning size={12} aria-hidden="true" weight="bold" />
      Needs review
    </span>
  );
}

export function DocumentDraftReview({
  ingestionId,
  originalFilename,
  onBack,
}: DocumentDraftReviewProps) {
  const [drafts, setDrafts] = useState<DocumentDraft[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ drafts: DocumentDraft[] }>(`/recipes/import/documents/${ingestionId}/drafts`)
      .then((result) => {
        if (!cancelled) setDrafts(result.drafts);
      })
      .catch((err) => {
        if (!cancelled) {
          setDrafts([]);
          setError(err instanceof ApiError ? err.message : 'Could not load the draft.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [ingestionId]);

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 rounded-sm text-small font-semibold text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Back to upload
      </button>

      <Heading level={1} className="mt-5">
        Recipe draft
      </Heading>
      <Text className="mt-1 text-muted">
        Extracted from <span className="font-semibold text-ink">{originalFilename}</span>. Review
        the source-faithful draft below — nothing has been saved as a recipe yet.
      </Text>

      {error && (
        <div className="mt-4">
          <Alert tone="error" title="Could not load the draft">{error}</Alert>
        </div>
      )}

      {drafts === null && !error && <Spinner label="Loading draft" />}

      {drafts !== null && drafts.length === 0 && !error && (
        <div className="mt-6">
          <Alert tone="info" title="No draft">No recipe draft was extracted from this document.</Alert>
        </div>
      )}

      {drafts !== null &&
        drafts.map((draft, draftNo) => (
          <section
            key={draft.draft_id}
            aria-label={draft.title ?? `Recipe ${draft.draft_index + 1}`}
            className="mt-6 rounded-lg border border-border bg-surface"
          >
            <div className="border-b border-border px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-h3 text-ink">
                  {draft.title ?? 'Untitled recipe'}
                </h2>
                <ReviewBadge active={draft.title_needs_review || draft.needs_review} />
              </div>
              {draft.title === null && (
                <p className="mt-1 text-caption text-faint">No title was present in the source.</p>
              )}
            </div>

            <div className="px-5 py-4">
              <h3 className="text-small font-semibold uppercase tracking-wide text-muted">
                Ingredients
              </h3>
              {draft.payload.ingredients.length === 0 ? (
                <p className="mt-2 text-caption text-faint">No ingredients were extracted.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {draft.payload.ingredients.map((ing, i) => (
                    <li key={i} className="rounded-md border border-border bg-canvas px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-small font-semibold text-ink">
                          {[ing.name, ing.quantity, ing.unit, ing.preparation]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                        <ReviewBadge active={ing.needs_review} />
                      </div>
                      <span className="mt-0.5 block text-caption text-faint">
                        Source: “{ing.source}”
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-border px-5 py-4">
              <h3 className="text-small font-semibold uppercase tracking-wide text-muted">
                Method
              </h3>
              {draft.payload.method_steps.length === 0 ? (
                <p className="mt-2 text-caption text-faint">No method steps were extracted.</p>
              ) : (
                <ol className="mt-2 list-inside list-decimal space-y-2">
                  {draft.payload.method_steps.map((step, i) => (
                    <li key={i} className="rounded-md border border-border bg-canvas px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-small text-ink">{step.text}</span>
                        <ReviewBadge active={step.needs_review} />
                      </div>
                      {step.source && (
                        <span className="mt-0.5 block text-caption text-faint">
                          Source: “{step.source}”
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {draft.payload.notes.length > 0 && (
              <div className="border-t border-border px-5 py-4">
                <h3 className="text-small font-semibold uppercase tracking-wide text-muted">
                  Review notes
                </h3>
                <ul className="mt-2 list-inside list-disc space-y-1">
                  {draft.payload.notes.map((note, i) => (
                    <li key={i} className="text-small text-muted">
                      {note}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        ))}
    </div>
  );
}
