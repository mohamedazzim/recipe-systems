'use client';

// D-30 (Track S) — the canonical shopping UI: generate, grouped display,
// have/need toggling, regenerate. No print surface (D-23). Data comes ONLY
// from the BFF shopping endpoints (structured object, never prose).

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, API_BASE_URL } from '@/lib/api';
import type { ShoppingList, ShoppingItem } from '@/lib/types';

/** One row's label. `display_name` is the VERBATIM card line and already carries
 *  the amount ("Fish — 500g"); `display_quantity` is that same extracted amount.
 *  Concatenating unconditionally printed every quantity twice, so only append when
 *  the name does not already contain it. */
function shoppingLabel(item: ShoppingItem): string {
  const quantity = item.display_quantity;
  if (!quantity || item.display_name.includes(quantity)) return item.display_name;
  return `${item.display_name} — ${quantity}`;
}

export function ShoppingSection({
  recipeId,
  skipInitialLoad = false,
  onGenerated,
}: {
  recipeId: string;
  /** The workspace already knows (library read model) that no list exists for
   *  this recipe — show the empty state directly instead of a doomed 404 GET. */
  skipInitialLoad?: boolean;
  /** Fired after a successful generation — the workspace drops the skip flag. */
  onGenerated?: () => void;
}) {
  const [list, setList] = useState<ShoppingList | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const wire = await api<ShoppingList>(`/recipes/${recipeId}/shopping-list`);
      // Contract guard: only a real list wire (with groups) is rendered.
      if (!wire || !Array.isArray(wire.groups)) {
        setList(null);
        return;
      }
      setList(wire);
      setError(null);
    } catch (err) {
      // Any 404 means "no list yet" — the recipe-level errors are the
      // workspace's own surfaces (single honest error, never duplicated).
      if (err instanceof ApiError && err.status === 404) {
        setList(null);
        return;
      }
      setError(err instanceof Error ? err.message : 'Could not load the shopping list');
    } finally {
      setLoading(false);
    }
  }, [recipeId]);

  useEffect(() => {
    if (skipInitialLoad) {
      // Known absent — render the empty state without a 404 round-trip.
      setLoading(false);
      setList(null);
      return;
    }
    void load();
  }, [load, skipInitialLoad]);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const wire = await api<ShoppingList>(`/recipes/${recipeId}/shopping-list`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setList(wire);
      onGenerated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate the shopping list');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (item: ShoppingItem) => {
    setBusy(true);
    setError(null);
    const next: 'have' | 'need' = item.state === 'have' ? 'need' : 'have';
    try {
      const saved = await api<{ shopping_key: string; state: 'have' | 'need' }>(
        `/recipes/${recipeId}/shopping-state`,
        {
          method: 'PATCH',
          body: JSON.stringify({ shopping_key: item.shopping_key, state: next }),
        },
      );
      setList((prev) =>
        prev
          ? {
              ...prev,
              groups: prev.groups.map((g) => ({
                ...g,
                items: g.items.map((it) =>
                  it.shopping_key === saved.shopping_key ? { ...it, state: saved.state } : it,
                ),
              })),
            }
          : prev,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the shopping state');
    } finally {
      setBusy(false);
    }
  };

  const items = list?.groups.flatMap((g) => g.items) ?? [];

  async function printList() {
    setBusy(true);
    setError(null);
    // Open the viewer SYNCHRONOUSLY inside the click gesture — window.open
    // after the awaited fetch would be outside the user-activation window and
    // blocked as a popup. The tab is navigated to the PDF blob once ready.
    const viewer = window.open('', '_blank');
    try {
      const res = await fetch(`${API_BASE_URL}/recipes/${recipeId}/print/shopping-list`, {
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
      setError(err instanceof Error ? err.message : 'Could not print the shopping list');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="shopping-heading"
      className="mt-8 rounded-lg border border-border bg-surface p-5"
    >
      <h2 id="shopping-heading" className="font-display text-h2 text-ink">
        Shopping list
      </h2>
      <p className="mt-1 text-small text-muted">
        Generated from the structured object — one row per ingredient, grouped for the market.
      </p>

      {loading ? (
        <p className="mt-3 text-caption text-muted">Loading…</p>
      ) : list === null ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => void generate()}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-surface transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:bg-faint disabled:text-surface"
          >
            {busy ? 'Generating…' : 'Generate shopping list'}
          </button>
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void generate()}
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-surface transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:bg-faint disabled:text-surface"
            >
              {busy ? 'Regenerating…' : 'Regenerate list'}
            </button>
            <button
              type="button"
              onClick={() => void printList()}
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-border-strong bg-transparent px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-ink/40 hover:bg-ink/5 disabled:cursor-not-allowed disabled:text-faint"
            >
              Print list
            </button>
            <span className="text-caption text-muted">
              {`${items.length} rows · generated ${new Date(list.generated_at).toLocaleString()}`}
            </span>
          </div>

          <div className="mt-4 space-y-4">
            {list.groups.map((group) => (
              <div key={group.name} data-testid={`shopping-group-${group.name}`}>
                <h3 className="text-caption font-semibold uppercase tracking-wide text-muted">
                  {group.name}
                </h3>
                <ul className="mt-1 divide-y divide-border">
                  {group.items.map((item) => (
                    <li
                      key={item.shopping_key ?? item.display_name}
                      className="flex items-center gap-3 py-1.5"
                    >
                      <button
                        type="button"
                        onClick={() => void toggle(item)}
                        disabled={busy || item.shopping_key === null}
                        aria-pressed={item.state === 'have'}
                        aria-label={`Mark ${item.display_name} as ${item.state === 'have' ? 'need' : 'have'}`}
                        // A 20px tap target was the smallest control in the app. The
                        // box stays 20px visually; the BUTTON becomes the 44px hit area.
                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="flex h-5 w-5 items-center justify-center rounded-sm border border-border-strong bg-surface text-xs font-bold text-accent">
                          {item.state === 'have' ? '✓' : ''}
                        </span>
                      </button>
                      <span
                        className={
                          item.state === 'have'
                            ? 'text-body text-muted line-through'
                            : 'text-body text-ink'
                        }
                      >
                        {shoppingLabel(item)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {list.allergen_line && (
            <p className="mt-4 border-t border-border pt-3 text-caption text-muted">
              Allergen line: {list.allergen_line}
            </p>
          )}
        </>
      )}

      {error && <p className="mt-2 text-caption text-negative">{error}</p>}
    </section>
  );
}
