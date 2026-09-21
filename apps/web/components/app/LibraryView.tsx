'use client';

// Library: the full account library with search (D-25 D3). Reachable from the
// shell "Library" nav and the Home "View library" link. Search is account-
// scoped GET /recipes?q=; the full list is the canonical GET /recipes rows.

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, MagnifyingGlass, UploadSimple, X } from '@phosphor-icons/react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Alert } from '@/components/ui/Alert';
import { Heading, Text } from '@/components/ui/Typography';
import { api, ApiError } from '@/lib/api';
import { recipePhotoUrl } from '@/lib/photo';
import type { LibraryRecipe } from '@/lib/types';

export interface LibraryViewProps {
  library: LibraryRecipe[] | null;
  /** A query pre-seeded by the shell search — runs once on mount. */
  initialQuery?: string;
  onBack: () => void;
  onOpenRecipe: (recipeId: string, initialLines: null, title?: string) => void;
  /** Phase 1 bulk-upload entry: routes to Add Recipe with Upload selected. */
  onBulkUpload: () => void;
}

const MONOGRAM_TINTS = [
  'bg-accent/10 text-accent',
  'bg-gold/10 text-gold',
  'bg-positive/10 text-positive',
  'bg-negative/10 text-negative',
];

export function LibraryView({ library, initialQuery, onBack, onOpenRecipe, onBulkUpload }: LibraryViewProps) {
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

  // Top-bar search deep link: seed the query and run it once on mount.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    if (initialQuery && initialQuery.trim() !== '') {
      seeded.current = true;
      setQuery(initialQuery);
      void runSearch(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

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

        <Button size="sm" variant="outline" onClick={onBulkUpload}>
          <UploadSimple size={14} aria-hidden="true" weight="bold" />
          Bulk upload recipes
        </Button>
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
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((recipe, index) => (
            <li key={recipe.recipe_id}>
              <button
                type="button"
                onClick={() => onOpenRecipe(recipe.recipe_id, null, recipe.name)}
                className="group w-full overflow-hidden rounded-xl border border-border bg-surface text-left shadow-whisper transition-shadow hover:shadow-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
              >
                <span className="relative block h-20 w-full overflow-hidden bg-canvas">
                  {recipe.photo_uri ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={recipePhotoUrl(recipe.photo_uri, recipe.recipe_id)}
                      alt=""
                      className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                        const sib = (e.currentTarget as HTMLImageElement).nextElementSibling;
                        if (sib instanceof HTMLElement) sib.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <span
                    className={`${
                      recipe.photo_uri ? 'hidden' : 'flex'
                    } h-full w-full items-center justify-center ${MONOGRAM_TINTS[index % MONOGRAM_TINTS.length]}`}
                    aria-hidden="true"
                  >
                    <span className="font-display text-2xl font-semibold">
                      {(recipe.name.trim().charAt(0) || 'R').toUpperCase()}
                    </span>
                  </span>
                </span>
                <span className="block p-4">
                  <span className="block truncate text-body font-semibold text-ink">
                    {recipe.name}
                  </span>
                  <span className="mt-0.5 block text-caption text-faint">
                    {new Date(recipe.date).toLocaleDateString()}
                    {recipe.family ? ` · ${recipe.family}` : ' · Family unknown'}
                  </span>
                  <span className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    {recipe.has_analysis ? (
                      <span className="rounded-full border border-positive/40 bg-positive/10 px-2 py-0.5 text-caption font-semibold text-positive">
                        Analysed
                      </span>
                    ) : (
                      <span className="rounded-full border border-negative/30 bg-negative/10 px-2 py-0.5 text-caption font-semibold text-negative">
                        Not analysed
                      </span>
                    )}
                    {recipe.has_cook_log ? (
                      <span className="rounded-full border border-border bg-canvas px-2 py-0.5 text-caption font-medium text-muted">
                        {recipe.last_cooked_at
                          ? `Cooked ${new Date(`${recipe.last_cooked_at}T12:00:00`).toLocaleDateString()}`
                          : 'Cooked'}
                      </span>
                    ) : (
                      <span className="rounded-full border border-border bg-canvas px-2 py-0.5 text-caption font-medium text-faint">
                        No cook log yet
                      </span>
                    )}
                    <ArrowRight
                      size={14}
                      aria-hidden="true"
                      className="ml-auto shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
                    />
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
