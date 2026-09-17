'use client';

// Recipe Home: the real landing view after sign-in or guest entry. One
// primary action (Create recipe), session recipes when they exist, a helpful
// empty state when they don't, and the guest band as a secondary strip.

import { useState } from 'react';
import { ArrowRight, CookingPot, Plus } from '@phosphor-icons/react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Alert } from '@/components/ui/Alert';
import { Heading, Text } from '@/components/ui/Typography';
import { isOwnedBy, listSessionRecipes, sessionRecipeLines } from '@/lib/flow';
import { GuestNotice } from '@/components/app/GuestNotice';
import { ProfileEditor } from '@/components/app/ProfileEditor';
import type { LibraryRecipe, WireLine } from '@/lib/types';

export interface HomeViewProps {
  signedIn: boolean;
  /** The current identity's owner tag (null = guest). */
  accountId: string | null;
  /**
   * D-22 (D2): the canonical account library (GET /recipes — persisted DB rows,
   * never browser state). null while loading. Guests never receive one.
   */
  library: LibraryRecipe[] | null;
  /** D-22 (D6): transient confirmation shown after a confirmed delete. */
  notice?: string | null;
  onCreate: () => void;
  /** QA-B1 fix: guest-owned records carry their parse-response lines so a
   *  read-only reopen renders them (guests can't fetch Bearer-only routes).
   *  D-22: library rows pass their saved DB name so the workspace title is the
   *  saved name even after a browser restart (no session record exists then). */
  onOpenRecipe: (recipeId: string, initialLines?: WireLine[] | null, title?: string) => void;
  /** Navigate to the full Library view (D-25 D3 separation from Home). */
  onOpenLibrary: () => void;
  onSignUp: () => void;
  onSignOut: () => void;
}

export function HomeView({
  signedIn,
  accountId,
  library,
  notice,
  onCreate,
  onOpenRecipe,
  onOpenLibrary,
  onSignUp,
  onSignOut,
}: HomeViewProps) {
  const [guestNoticeDismissed, setGuestNoticeDismissed] = useState(false);
  const recipes = listSessionRecipes();
  const owner = signedIn && accountId ? { kind: 'user' as const, accountId } : { kind: 'guest' as const };
  const mine = recipes.filter((r) => isOwnedBy(r, owner));
  const others = recipes.filter((r) => !isOwnedBy(r, owner));

  const startCard = (
    <section
      aria-labelledby="start-heading"
      className="flex min-w-0 flex-col justify-center rounded-lg border-2 border-accent bg-accent/10 p-6"
    >
      <h2 id="start-heading" className="font-display text-h2 text-ink">
        Start a new recipe
      </h2>
      <p className="mt-2 max-w-prose text-small text-body">
        Paste text, fill in a structured form, or upload a photo of a card.
      </p>
      <div className="mt-4">
        <Button size="lg" block onClick={onCreate}>
          <Plus size={16} aria-hidden="true" weight="bold" />
          New recipe
        </Button>
      </div>
    </section>
  );

  return (
    <div>
      {notice && (
        <div className="mb-8">
          <Alert tone="success" title={notice} />
        </div>
      )}

      {!signedIn && !guestNoticeDismissed && (
        <div className="mb-8">
          <GuestNotice onSignUp={onSignUp} onDismiss={() => setGuestNoticeDismissed(true)} />
        </div>
      )}

      <section aria-labelledby="home-heading">
        <Heading level={1} id="home-heading">
          Welcome back
        </Heading>
        <Text className="mt-2 max-w-prose text-muted">
          Here&apos;s where your recipes stand today.
        </Text>
      </section>

      {/* Dashboard metrics — only the two counts the backend actually exposes
          (saved recipes, cook logs). No placeholder "—" padding. */}
      <div className="mt-6 grid max-w-2xl grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-surface p-5">
          <p className="font-display text-metric tabular text-ink">
            {signedIn && library !== null ? library.length : mine.length}
          </p>
          <p className="mt-1 text-caption text-muted">Recipes saved</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-5">
          <p className="font-display text-metric tabular text-ink">
            {signedIn && library !== null ? library.filter((r) => r.has_cook_log).length : 0}
          </p>
          <p className="mt-1 text-caption text-muted">With cook logs</p>
        </div>
      </div>

      {/* Two-column dashboard — start on the left, recently updated on the right. */}
      {signedIn && library !== null ? (
        <div className="mt-6 grid items-stretch gap-6 lg:grid-cols-2">
          {startCard}

          <section aria-labelledby="recent-heading" className="min-w-0 rounded-lg border border-border bg-surface p-5">
            <div className="flex items-baseline justify-between gap-4">
              <h2 id="recent-heading" className="font-display text-h2 text-ink">
                Recently updated
              </h2>
              <button
                type="button"
                onClick={onOpenLibrary}
                className="inline-flex items-center gap-1 text-caption font-semibold text-accent-strong hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
              >
                View library
                <ArrowRight size={14} aria-hidden="true" />
              </button>
            </div>
            {library.length === 0 ? (
              <p className="mt-4 text-small text-muted">No recipes yet — start one on the left.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {library.slice(0, 2).map((recipe) => (
                  <li key={recipe.recipe_id}>
                    <button
                      type="button"
                      onClick={() => onOpenRecipe(recipe.recipe_id, null, recipe.name)}
                      className="group flex w-full items-center justify-between gap-4 rounded-sm px-1 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset--2 focus-visible:outline-gold"
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
                      <span className="flex shrink-0 items-center gap-2">
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
          </section>
        </div>
      ) : (
        <div className="mt-6 max-w-md">{startCard}</div>
      )}

      {!signedIn && (
        <section aria-labelledby="recent-heading" className="mt-12 border-t border-border pt-8">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="recent-heading" className="font-display text-h2 text-ink">
              This session
            </h2>
            <span className="text-caption text-faint">saved in this browser only</span>
          </div>

          {recipes.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                title="No recipes yet"
                description="Your pastes from this browser will appear here."
                action={
                  <Button onClick={onCreate} variant="outline">
                    Paste your first recipe
                  </Button>
                }
                glyph={<CookingPot size={40} aria-hidden="true" />}
              />
            </div>
          ) : (
            <ul className="mt-6 divide-y divide-border rounded-lg border border-border bg-surface">
              {mine.map((recipe) => (
                <li key={recipe.recipe_id}>
                  <button
                    type="button"
                    onClick={() =>
                      onOpenRecipe(
                        recipe.recipe_id,
                        recipe.owner === 'guest' ? sessionRecipeLines(recipe.recipe_id) : null,
                      )
                    }
                    className="group flex w-full items-center justify-between gap-4 rounded-sm px-4 py-4 text-left focus-visible:outline-2 focus-visible:outline-offset--2 focus-visible:outline-gold sm:px-5"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-small font-semibold text-ink">
                        {recipe.preview}
                      </span>
                      <span className="mt-0.5 block text-caption text-faint">
                        {new Date(recipe.created_at).toLocaleString()}
                      </span>
                    </span>
                    <ArrowRight
                      size={16}
                      aria-hidden="true"
                      className="shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {!signedIn && others.length > 0 && (
        <section aria-labelledby="other-heading" className="mt-10">
          <h2 id="other-heading" className="font-display text-h2 text-ink">
            Other sessions
          </h2>
          <p className="mt-1 text-small text-muted">
            These recipes belong to a different identity and cannot be opened here.
          </p>
          <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
            {others.map((recipe) => (
              <li key={recipe.recipe_id} className="px-4 py-3 sm:px-5">
                <p className="text-small font-semibold text-muted">{recipe.preview}</p>
                <p className="mt-0.5 text-caption text-faint">
                  {signedIn ? 'Created in a guest session.' : 'Created under an account.'}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {signedIn && (
        <section aria-labelledby="account-heading" className="mt-8 border-t border-border pt-8">
          <h2 id="account-heading" className="font-display text-h2 text-ink">
            Account
          </h2>
          <p className="mt-2 max-w-prose text-small text-muted">
            Your work is saved to your account. Sign out from the header when you are done.
          </p>
          <details className="mt-4 rounded-lg border border-border bg-surface">
            <summary className="cursor-pointer list-none px-5 py-4 font-sans text-h3 text-ink">
              Household restriction profile
            </summary>
            <div className="border-t border-border px-5 py-4">
              <p className="text-caption text-muted">
                Optional. A conflicting recipe highlights the conflicts first; unknown stays unknown.
                A profile never deletes recipes.
              </p>
              <div className="mt-3">
                <ProfileEditor />
              </div>
            </div>
          </details>
          <div className="mt-4">
            <Button variant="outline" onClick={onSignOut}>
              Sign out
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
