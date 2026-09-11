'use client';

// D-30 (Track S) — the canonical shopping UI: generate, grouped display,
// have/need toggling, regenerate. No print surface (D-23). Data comes ONLY
// from the BFF shopping endpoints (structured object, never prose).

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { ShoppingList, ShoppingItem } from '@/lib/types';

export function ShoppingSection({ recipeId }: { recipeId: string }) {
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
    void load();
  }, [load]);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const wire = await api<ShoppingList>(`/recipes/${recipeId}/shopping-list`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setList(wire);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate the shopping list');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (item: ShoppingItem) => {
    if (!item.shopping_key) return;
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

  return (
    <section
      aria-labelledby="shopping-heading"
      className="mt-8 rounded-lg border border-border bg-surface p-5"
    >
      <h2 id="shopping-heading" className="text-small font-semibold text-ink">
        Shopping list
      </h2>
      <p className="mt-1 text-caption text-muted">
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
                        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border border-border-strong bg-background text-xs font-bold text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {item.state === 'have' ? '✓' : ''}
                      </button>
                      <span
                        className={
                          item.state === 'have'
                            ? 'text-body text-muted line-through'
                            : 'text-body text-ink'
                        }
                      >
                        {item.display_quantity
                          ? `${item.display_name} — ${item.display_quantity}`
                          : item.display_name}
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
