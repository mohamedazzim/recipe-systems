'use client';

// D-25 (D3): free-text tags on a saved recipe — display, add, remove. The
// recipes module is the sole recipe_tag writer; this surface only talks to the
// canonical GET/PUT /recipes/:recipeId/tags endpoints (no client-side tag store).

import { useCallback, useEffect, useState } from 'react';
import { Plus, Tag, X } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { api, ApiError } from '@/lib/api';

export interface TagsSectionProps {
  recipeId: string;
  signedIn: boolean;
  /** Render just the content — no card border or heading. The accordion
   *  wrapper's summary supplies the label. */
  bare?: boolean;
}

export function TagsSection({ recipeId, signedIn, bare = false }: TagsSectionProps) {
  const [tags, setTags] = useState<string[] | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    if (!signedIn) return;
    try {
      const result = await api<{ tags: string[] }>(`/recipes/${recipeId}/tags`);
      setTags(result.tags);
      setError(null);
    } catch (err) {
      setTags([]);
      setError(err instanceof ApiError ? err.message : 'Could not load tags.');
    }
  }, [recipeId, signedIn]);

  useEffect(() => {
    setTags(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeId, signedIn]);

  const save = async (next: string[]): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ tags: string[] }>(`/recipes/${recipeId}/tags`, {
        method: 'PUT',
        body: JSON.stringify({ tags: next }),
      });
      setTags(result.tags);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save tags.');
    } finally {
      setBusy(false);
    }
  };

  const addTag = async (): Promise<void> => {
    const value = draft.trim();
    if (value === '' || tags === null) return;
    if (tags.includes(value)) {
      setDraft('');
      return;
    }
    setDraft('');
    await save([...tags, value]);
  };

  const removeTag = async (tag: string): Promise<void> => {
    if (tags === null) return;
    await save(tags.filter((t) => t !== tag));
  };

  if (!signedIn) return null; // the tags endpoints are Bearer-only

  return (
    <section
      aria-labelledby={bare ? undefined : 'tags-heading'}
      className={bare ? '' : 'mt-6 rounded-lg border border-border bg-surface p-5'}
    >
      {!bare && (
        <h2 id="tags-heading" className="text-small font-semibold text-ink">
          Tags
        </h2>
      )}
      <p className="mt-1 text-caption text-muted">
        Free-text tags help you find this recipe later by name, ingredient, or tag.
      </p>

      {tags === null ? (
        <p className="mt-3 text-caption text-muted">Loading tags…</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {tags.length === 0 ? (
              <p className="text-caption text-faint">No tags yet.</p>
            ) : (
              tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-caption text-body"
                >
                  <Tag size={12} aria-hidden="true" weight="bold" />
                  {tag}
                  <button
                    type="button"
                    onClick={() => void removeTag(tag)}
                    disabled={busy}
                    aria-label={`Remove tag ${tag}`}
                    className="-m-2 inline-flex items-center rounded-sm p-2 text-muted hover:text-negative focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                  >
                    <X size={12} aria-hidden="true" weight="bold" />
                  </button>
                </span>
              ))
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              aria-label="Add tag"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void addTag();
                }
              }}
              placeholder="e.g. comfort food"
              maxLength={100}
              className="min-w-48 max-w-full flex-1 rounded-md border border-border-strong bg-surface px-3 py-2 text-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
            />
            <Button size="sm" onClick={() => void addTag()} disabled={busy || draft.trim() === ''}>
              <Plus size={14} aria-hidden="true" weight="bold" />
              Add tag
            </Button>
          </div>

          {error && (
            <div className="mt-3">
              <Alert tone="error" title="Tags need attention">
                {error}
              </Alert>
            </div>
          )}
        </>
      )}
    </section>
  );
}
