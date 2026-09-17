'use client';

// Library: the full account library with search (D-25 D3). Reachable from the
// shell "Library" nav and the Home "View library" link. Search is account-
// scoped GET /recipes?q=; the full list is the canonical GET /recipes rows.

import { useState } from 'react';
import { ArrowLeft, ArrowRight, MagnifyingGlass, X } from '@phosphor-icons/react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Alert } from '@/components/ui/Alert';
import { Heading, Text } from '@/components/ui/Typography';
import { api, ApiError } from '@/lib/api';
import type { LibraryRecipe } from '@/lib/types';

export interface LibraryViewProps {
  library: LibraryRecipe[] | null;
  onBack: () => void;
  onOpenRecipe: (recipeId: string, initialLines: null, title?: string) => void;
}

export function LibraryView({ library, onBack, onOpenRecipe }: LibraryViewProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LibraryRecipe[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  /** Client-side status filter — only the two states the list wire carries.
   *  "Needs review" / tag filters await a list field (TODO, no fabrication). */
  const [filter, setFilter] = useState<'all' | 'cooked'>('all');

  const runSearch = async (q: string): Promise<void> => {
    const value = q.trim();
    if (value === '') {
      setResults(null);
      setSearchError(null);
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const result = await api<{ recipes: LibraryRecipe[] }>(
        `/recipes?q=${encodeURIComponent(value)}`,
      );
      setResults(result.recipes);
    } catch (err) {
      setResults([]);
      setSearchError(err instanceof ApiError ? err.message : 'Search failed. Please try again.');
    } finally {
      setSearching(false);
    }
  };

  const clearSearch = (): void => {
    setQuery('');
    setResults(null);
    setSearchError(null);
  };

  const list = (results ?? library ?? []).filter(
    (recipe) => filter === 'all' || recipe.has_cook_log,
  );

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 rounded-sm text-small font-semibold text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Back to home
      </button>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Heading level={1}>Your library</Heading>
          <Text className="mt-1 text-muted">
            {library?.length ?? 0} recipe{library?.length === 1 ? '' : 's'} saved to your account.
          </Text>
        </div>

        <form
          role="search"
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch(query);
          }}
        >
          <input
            aria-label="Search your library"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, ingredient, or tag"
            maxLength={100}
            className="min-w-64 max-w-full flex-1 rounded-md border border-border-strong bg-background px-3 py-2 text-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          />
          <Button size="sm" type="submit" disabled={searching || query.trim() === ''}>
            <MagnifyingGlass size={14} aria-hidden="true" weight="bold" />
            {searching ? 'Searching…' : 'Search'}
          </Button>
          {results !== null && (
            <Button size="sm" variant="ghost" onClick={clearSearch} type="button">
              <X size={14} aria-hidden="true" weight="bold" />
              Clear
            </Button>
          )}
        </form>
      </div>

      {searchError && (
        <div className="mt-4">
          <Alert tone="error" title="Search needs attention">
            {searchError}
          </Alert>
        </div>
      )}

      {/* Status filter chips — the pill tier (same treatment as the analysis
          view tabs). */}
      <div className="mt-4 flex gap-1" role="group" aria-label="Filter library">
        {(
          [
            ['all', 'All'],
            ['cooked', 'Has cook log'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
            className={`whitespace-nowrap rounded-md px-3.5 py-2 text-small font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${
              filter === key ? 'bg-ink text-canvas' : 'text-muted hover:bg-ink/5 hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title={results !== null ? 'No matches' : 'No saved recipes yet'}
            description={
              results !== null
                ? `Nothing in your library matches “${query.trim()}”.`
                : 'Recipes you save appear here and survive closing the browser.'
            }
          />
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-border rounded-lg border border-border bg-surface">
          {list.map((recipe) => (
            <li key={recipe.recipe_id}>
              <button
                type="button"
                onClick={() => onOpenRecipe(recipe.recipe_id, null, recipe.name)}
                className="group flex w-full items-center justify-between gap-4 rounded-sm px-4 py-4 text-left focus-visible:outline-2 focus-visible:outline-offset--2 focus-visible:outline-gold sm:px-5"
              >
                <span className="min-w-0">
                  <span className="block truncate text-body font-semibold text-ink">
                    {recipe.name}
                  </span>
                  <span className="mt-0.5 block text-caption text-faint">
                    {new Date(recipe.date).toLocaleDateString()}
                    {recipe.family ? ` · ${recipe.family}` : ' · Family unknown'}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  {recipe.has_cook_log ? (
                    <span className="rounded-sm border border-border px-2 py-0.5 text-caption font-semibold text-body">
                      {recipe.last_cooked_at
                        ? `Cooked ${new Date(`${recipe.last_cooked_at}T12:00:00`).toLocaleDateString()}`
                        : 'Cooked'}
                    </span>
                  ) : (
                    <span className="text-caption text-faint">No cook log yet</span>
                  )}
                  <ArrowRight
                    size={16}
                    aria-hidden="true"
                    className="shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
                  />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
