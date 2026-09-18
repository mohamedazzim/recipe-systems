'use client';

// Recipe Home — the dashboard surface after sign-in or guest entry. Matches
// the reference composition: greeting + editorial quote, stat cards, the
// three entry modes, the household restriction profile, recently updated
// recipes, and quick actions. Every number is derived from the real account
// library; nothing is fabricated.

import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Books,
  Camera,
  CheckCircle,
  Clock,
  CookingPot,
  Plus,
  Tag,
  UserCirclePlus,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Alert } from '@/components/ui/Alert';
import { Text } from '@/components/ui/Typography';
import { isOwnedBy, listSessionRecipes, sessionRecipeLines } from '@/lib/flow';
import { GuestNotice } from '@/components/app/GuestNotice';
import { ProfileEditor } from '@/components/app/ProfileEditor';
import { api } from '@/lib/api';
import type { LibraryRecipe, RestrictionProfile, WireLine } from '@/lib/types';

export interface HomeViewProps {
  signedIn: boolean;
  /** The current identity's owner tag (null = guest). */
  accountId: string | null;
  /** Greeting name derived from the signed-in email (null for guests). */
  userName?: string | null;
  /**
   * D-22 (D2): the canonical account library (GET /recipes — persisted DB rows,
   * never browser state). null while loading. Guests never receive one.
   */
  library: LibraryRecipe[] | null;
  /** D-22 (D6): transient confirmation shown after a confirmed delete. */
  notice?: string | null;
  /** Create a recipe; the mode deep-links to the matching intake tab. */
  onCreate: (mode?: 'paste' | 'form' | 'photo') => void;
  /** QA-B1 fix: guest-owned records carry their parse-response lines so a
   *  read-only reopen renders them (guests can't fetch Bearer-only routes).
   *  D-22: library rows pass their saved DB name so the workspace title is the
   *  saved name even after a browser restart (no session record exists then). */
  onOpenRecipe: (recipeId: string, initialLines?: WireLine[] | null, title?: string) => void;
  /** Navigate to the full Library view (D-25 D3 separation from Home). */
  onOpenLibrary: () => void;
  /** Navigate to the Household restriction profile view. */
  onOpenHousehold: () => void;
  onSignUp: () => void;
  onSignOut: () => void;
}

function inThisMonth(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff) || diff < 0) return 'just now';
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString();
}

const MONOGRAM_TINTS = [
  'bg-accent/10 text-accent',
  'bg-gold/10 text-gold',
  'bg-positive/10 text-positive',
  'bg-negative/10 text-negative',
];

interface StatCardProps {
  label: string;
  value: number | string;
  sub: string;
  icon: React.ComponentType<{
    size?: number;
    weight?: 'bold' | 'fill' | 'regular';
    'aria-hidden'?: boolean | 'true' | 'false';
    className?: string;
  }>;
  tint: string;
}

function StatCard({ label, value, sub, icon: Icon, tint }: StatCardProps) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-whisper">
      <div className="flex items-start justify-between gap-3">
        <p className="text-small font-medium text-muted">{label}</p>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tint}`}>
          <Icon size={17} aria-hidden="true" weight="bold" />
        </span>
      </div>
      <p className="mt-2 font-display text-h2 text-ink tabular">{value}</p>
      <p className="mt-0.5 text-caption text-faint">{sub}</p>
    </div>
  );
}

export function HomeView({
  signedIn,
  accountId,
  userName,
  library,
  notice,
  onCreate,
  onOpenRecipe,
  onOpenLibrary,
  onOpenHousehold,
  onSignUp,
  onSignOut,
}: HomeViewProps) {
  const [guestNoticeDismissed, setGuestNoticeDismissed] = useState(false);
  const [profileCount, setProfileCount] = useState<number | null>(null);
  const recipes = listSessionRecipes();
  const owner = signedIn && accountId ? { kind: 'user' as const, accountId } : { kind: 'guest' as const };
  const mine = recipes.filter((r) => isOwnedBy(r, owner));
  const others = recipes.filter((r) => !isOwnedBy(r, owner));

  // The household banner's "N restrictions set" — real profile data only.
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    api<RestrictionProfile>('/me/restriction-profile')
      .then((profile) => {
        if (!cancelled) setProfileCount(profile.allergens.length + profile.diet_patterns.length);
      })
      .catch(() => {
        if (!cancelled) setProfileCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const stats =
    signedIn && library !== null
      ? [
          {
            label: 'Total recipes',
            value: library.length,
            sub: (() => {
              const added = library.filter((r) => inThisMonth(r.date)).length;
              return added > 0 ? `+${added} this month` : 'saved to your account';
            })(),
            icon: CookingPot,
            tint: 'bg-accent/10 text-accent',
          },
          {
            label: 'Cooked recipes',
            value: library.filter((r) => r.has_cook_log).length,
            sub: (() => {
              const cooked = library.filter(
                (r) => r.last_cooked_at && inThisMonth(r.last_cooked_at),
              ).length;
              return cooked > 0 ? `+${cooked} this month` : 'with a cook log';
            })(),
            icon: CheckCircle,
            tint: 'bg-gold/10 text-gold',
          },
          {
            label: 'Updated this month',
            value: library.filter((r) => inThisMonth(r.date)).length,
            sub: 'kept current',
            icon: Clock,
            tint: 'bg-positive/10 text-positive',
          },
          {
            label: 'Families',
            value: new Set(
              library.map((r) => r.family).filter((f): f is string => f !== null),
            ).size,
            sub: 'across your library',
            icon: Tag,
            tint: 'bg-negative/10 text-negative',
          },
        ]
      : null;

  const greeting =
    signedIn && userName ? `Welcome back, ${userName}!` : signedIn ? 'Welcome back!' : 'Welcome';

  const startCard = (
    <section
      aria-labelledby="start-heading"
      className="rounded-xl border border-border bg-surface p-6 shadow-whisper"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="start-heading" className="font-display text-h2 text-ink">
            Start a new recipe
          </h2>
          <p className="mt-1.5 max-w-prose text-small text-muted">
            Add a recipe from text, a structured form, or a photo.
          </p>
        </div>
        <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent sm:flex">
          <CookingPot size={20} aria-hidden="true" weight="bold" />
        </span>
      </div>
      <div className="mt-5 flex flex-wrap gap-2.5">
        <Button size="sm" onClick={() => onCreate('paste')}>
          <Plus size={14} aria-hidden="true" weight="bold" />
          Paste text
        </Button>
        <Button size="sm" variant="outline" onClick={() => onCreate('form')}>
          Structured form
        </Button>
        <Button size="sm" variant="outline" onClick={() => onCreate('photo')}>
          <Camera size={14} aria-hidden="true" weight="bold" />
          Upload photo
        </Button>
      </div>
    </section>
  );

  return (
    <div>
      {notice && (
        <div className="mb-6">
          <Alert tone="success" title={notice} />
        </div>
      )}

      {!signedIn && !guestNoticeDismissed && (
        <div className="mb-6">
          <GuestNotice onSignUp={onSignUp} onDismiss={() => setGuestNoticeDismissed(true)} />
        </div>
      )}

      {/* Greeting — name, subtitle, the editorial quote, and the one big CTA. */}
      <section
        aria-labelledby="home-heading"
        className="flex flex-wrap items-end justify-between gap-x-8 gap-y-6"
      >
        <div className="min-w-0">
          <h1 id="home-heading" className="font-display text-h1 text-ink">
            {greeting}
          </h1>
          <Text className="mt-2 max-w-prose text-muted">
            Continue your cooking journey with AI-powered recipe analysis.
          </Text>
        </div>
        <div className="hidden max-w-64 lg:block">
          <p className="font-display text-h3 italic leading-snug text-muted">
            &ldquo;A good recipe is more than ingredients — it&apos;s a story.&rdquo;
          </p>
        </div>
        <Button size="lg" onClick={() => onCreate()}>
          <Plus size={16} aria-hidden="true" weight="bold" />
          Add new recipe
        </Button>
      </section>

      {/* Stat cards — real numbers from the account library. */}
      {stats && (
        <div className="mt-6 grid grid-cols-2 gap-4 xl:grid-cols-4" aria-label="Recipe statistics">
          {stats.map((stat) => (
            <StatCard key={stat.label} {...stat} />
          ))}
        </div>
      )}

      {/* Feature banners — the three entry modes + the restriction profile. */}
      <div className={`mt-6 grid items-stretch gap-6 ${signedIn ? 'lg:grid-cols-2' : ''}`}>
        {startCard}

        {signedIn && (
          <section
            aria-labelledby="profile-heading"
            className="rounded-xl border border-border bg-surface p-6 shadow-whisper"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 id="profile-heading" className="font-display text-h2 text-ink">
                  Household restriction profile
                </h2>
                <p className="mt-1.5 max-w-prose text-small text-muted">
                  Manage allergens and dietary preferences for better analysis and safer recipes.
                </p>
              </div>
              <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/10 text-gold sm:flex">
                <UserCirclePlus size={20} aria-hidden="true" weight="bold" />
              </span>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button size="sm" variant="outline" onClick={onOpenHousehold}>
                View profile
                <ArrowRight size={14} aria-hidden="true" weight="bold" />
              </Button>
              {profileCount !== null && (
                <span className="text-caption text-muted">
                  {profileCount > 0
                    ? `${profileCount} restriction${profileCount === 1 ? '' : 's'} set`
                    : 'No restrictions set'}
                </span>
              )}
            </div>
          </section>
        )}
      </div>

      {/* Recently updated + quick actions — the bottom row. */}
      {signedIn && library !== null && (
        <div className="mt-10 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <section aria-labelledby="recent-heading" className="min-w-0">
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
              <p className="mt-4 text-small text-muted">No recipes yet — start one above.</p>
            ) : (
              <ul className="mt-4 grid gap-4 sm:grid-cols-2">
                {library.slice(0, 4).map((recipe, index) => (
                  <li key={recipe.recipe_id}>
                    <button
                      type="button"
                      onClick={() => onOpenRecipe(recipe.recipe_id, null, recipe.name)}
                      className="group w-full overflow-hidden rounded-xl border border-border bg-surface text-left shadow-whisper transition-shadow hover:shadow-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                    >
                      <span
                        className={`flex h-20 items-center justify-center ${MONOGRAM_TINTS[index % MONOGRAM_TINTS.length]}`}
                        aria-hidden="true"
                      >
                        <span className="font-display text-3xl font-semibold">
                          {(recipe.name.trim().charAt(0) || 'R').toUpperCase()}
                        </span>
                      </span>
                      <span className="block p-4">
                        <span className="block truncate text-body font-semibold text-ink">
                          {recipe.name}
                        </span>
                        <span className="mt-0.5 block text-caption text-faint">
                          Updated {timeAgo(recipe.date)}
                        </span>
                        <span className="mt-2.5 flex flex-wrap gap-1.5">
                          {recipe.family && (
                            <span className="rounded-full border border-border bg-canvas px-2 py-0.5 text-caption font-medium text-muted">
                              {recipe.family}
                            </span>
                          )}
                          {recipe.has_cook_log ? (
                            <span className="rounded-full border border-positive/40 bg-positive/10 px-2 py-0.5 text-caption font-semibold text-positive">
                              Cooked
                            </span>
                          ) : (
                            <span className="rounded-full border border-border bg-canvas px-2 py-0.5 text-caption font-medium text-faint">
                              Not cooked
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <aside
            aria-label="Quick actions"
            className="rounded-xl border border-border bg-surface p-5 shadow-whisper"
          >
            <h2 className="font-display text-h3 text-ink">Quick actions</h2>
            <div className="mt-3 flex flex-col gap-1">
              {(
                [
                  { label: 'Add a new recipe', icon: Plus, onClick: () => onCreate() },
                  { label: 'Upload a recipe photo', icon: Camera, onClick: () => onCreate('photo') },
                  { label: 'Open your library', icon: Books, onClick: onOpenLibrary },
                  { label: 'Manage restrictions', icon: UserCirclePlus, onClick: onOpenHousehold },
                ] as const
              ).map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.label}
                    type="button"
                    onClick={action.onClick}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-small font-medium text-body transition-colors hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                  >
                    <Icon size={16} aria-hidden="true" weight="bold" className="text-accent" />
                    {action.label}
                  </button>
                );
              })}
            </div>
          </aside>
        </div>
      )}

      {!signedIn && (
        <section aria-labelledby="recent-heading" className="mt-10 border-t border-border pt-8">
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
                  <Button onClick={() => onCreate()} variant="outline">
                    Paste your first recipe
                  </Button>
                }
                glyph={<CookingPot size={40} aria-hidden="true" />}
              />
            </div>
          ) : (
            <ul className="mt-6 divide-y divide-border rounded-xl border border-border bg-surface">
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
            Your work is saved to your account. Sign out from the account menu when you are done.
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
