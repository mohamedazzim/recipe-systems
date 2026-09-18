'use client';

// Recipe Home — the dashboard surface after sign-in or guest entry. Matches
// the reference composition: greeting + editorial quote, four summary cards,
// the three entry modes, the household restriction profile, recently updated
// recipes, and quick actions. Every number is derived from the real account
// library read model; nothing is fabricated.

import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Basket,
  Camera,
  ChartBar,
  CheckCircle,
  CookingPot,
  FileText,
  ListBullets,
  Plant,
  Plus,
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
import { recipePhotoUrl } from '@/lib/photo';
import type {
  LibraryRecipe,
  RestrictionProfile,
  RestrictionVocabulary,
  WireLine,
} from '@/lib/types';

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
  /** Quick actions — open the most recent recipe at the shopping/cook section. */
  onCreateShoppingList: () => void;
  onEnterCookMode: () => void;
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
  /** Optional real proportion (0–100) — the Analysed card's progress bar. */
  progress?: number;
}

function StatCard({ label, value, sub, icon: Icon, tint, progress }: StatCardProps) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-whisper">
      <div className="flex items-start justify-between gap-3">
        <p className="text-small font-medium text-muted">{label}</p>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tint}`}>
          <Icon size={17} aria-hidden="true" weight="bold" />
        </span>
      </div>
      <p className="mt-1.5 font-display text-h2 text-ink tabular">{value}</p>
      {progress !== undefined && (
        <div
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border"
          role="img"
          aria-label={`${Math.round(progress)} percent of recipes analysed`}
        >
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}
      <p className="mt-1 text-caption text-faint">{sub}</p>
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
  onCreateShoppingList,
  onEnterCookMode,
  onSignUp,
  onSignOut,
}: HomeViewProps) {
  const [guestNoticeDismissed, setGuestNoticeDismissed] = useState(false);
  /** The household banner — the real profile + its vocabulary names. */
  const [profileInfo, setProfileInfo] = useState<{
    allergenNames: string[];
    patterns: string[];
    labelPack: string | null;
  } | null>(null);
  const recipes = listSessionRecipes();
  const owner = signedIn && accountId ? { kind: 'user' as const, accountId } : { kind: 'guest' as const };
  const mine = recipes.filter((r) => isOwnedBy(r, owner));
  const others = recipes.filter((r) => !isOwnedBy(r, owner));

  // The household banner — real profile + vocabulary only.
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    Promise.all([
      api<RestrictionProfile>('/me/restriction-profile'),
      api<RestrictionVocabulary>('/restriction-vocabulary'),
    ])
      .then(([profile, vocabulary]) => {
        if (cancelled) return;
        const nameByCode = new Map(
          vocabulary.allergens.map((a) => [a.code, a.name]),
        );
        setProfileInfo({
          allergenNames: profile.allergens
            .map((code) => nameByCode.get(code) ?? code.replace(/_/g, ' '))
            .slice(0, 4),
          patterns: profile.diet_patterns,
          labelPack: profile.label_pack,
        });
      })
      .catch(() => {
        if (!cancelled) setProfileInfo(null);
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const total = library?.length ?? 0;
  const analysed = library?.filter((r) => r.has_analysis === true).length ?? 0;
  const withList = library?.filter((r) => r.has_shopping_list === true).length ?? 0;
  const listsThisMonth =
    library?.filter(
      (r) => r.shopping_list_generated_at && inThisMonth(r.shopping_list_generated_at),
    ).length ?? 0;
  const cooked = library?.filter((r) => r.has_cook_log).length ?? 0;
  const cookedThisMonth =
    library?.filter((r) => r.last_cooked_at && inThisMonth(r.last_cooked_at)).length ?? 0;
  const addedThisMonth = library?.filter((r) => inThisMonth(r.date)).length ?? 0;

  // Four summary cards — the reference concepts that exist in the product.
  // "Favourite recipes" has no equivalent feature anywhere (no favourites
  // table, endpoint, or state), so the fourth slot carries the real
  // cook-mode concept instead of a fabricated number.
  const stats =
    signedIn && library !== null
      ? [
          {
            label: 'Total recipes',
            value: total,
            sub: addedThisMonth > 0 ? `+${addedThisMonth} this month` : 'saved to your account',
            icon: CookingPot,
            tint: 'bg-accent/10 text-accent',
          },
          {
            label: 'Analysed recipes',
            value: analysed,
            sub:
              total > 0
                ? `${Math.round((analysed / total) * 100)}% of total`
                : 'run an analysis to start',
            icon: ChartBar,
            tint: 'bg-gold/10 text-gold',
            progress: total > 0 ? (analysed / total) * 100 : 0,
          },
          {
            label: 'Shopping lists',
            value: withList,
            sub:
              listsThisMonth > 0
                ? `+${listsThisMonth} this month`
                : 'generated from your recipes',
            icon: Basket,
            tint: 'bg-positive/10 text-positive',
          },
          {
            label: 'Cooked recipes',
            value: cooked,
            sub: cookedThisMonth > 0 ? `+${cookedThisMonth} this month` : 'with a cook log',
            icon: CheckCircle,
            tint: 'bg-negative/10 text-negative',
          },
        ]
      : null;

  const greeting =
    signedIn && userName ? `Welcome back, ${userName}!` : signedIn ? 'Welcome back!' : 'Welcome';

  const startCard = (
    <section
      aria-labelledby="start-heading"
      className="relative overflow-hidden rounded-xl border border-border bg-surface p-6 shadow-whisper"
    >
      {/* The reference artwork — a CSS background layer (never an <img>): the
          clean flat-lay image, right-anchored cover so the spoon and leaves
          stay visible, with a short surface gradient on the left where the
          real content sits over the artwork's own baked-in title area. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 hidden bg-cover bg-right bg-no-repeat sm:block"
        style={{ backgroundImage: 'url("/images/start-recipe-hero.png")' }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 hidden sm:block"
        style={{
          background:
            'linear-gradient(to right, rgb(var(--rs-surface)) 0%, rgb(var(--rs-surface)) 62%, rgb(var(--rs-surface) / 0.6) 72%, transparent 80%)',
        }}
      />

      <div className="relative z-10 flex min-w-0 flex-col justify-between gap-5 lg:flex-row lg:items-center">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Plant size={20} aria-hidden="true" weight="bold" className="text-accent" />
            <h2 id="start-heading" className="font-display text-h2 text-ink">
              Start a new recipe
            </h2>
          </div>
          <p className="mt-1.5 max-w-prose text-small text-muted">
            Add a recipe from text, a structured form, or a photo.
          </p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <Button size="sm" onClick={() => onCreate('paste')}>
              <FileText size={14} aria-hidden="true" weight="bold" />
              Paste text
            </Button>
            <Button size="sm" variant="outline" onClick={() => onCreate('form')}>
              <ListBullets size={14} aria-hidden="true" weight="bold" />
              Structured form
            </Button>
            <Button size="sm" variant="outline" onClick={() => onCreate('photo')}>
              <Camera size={14} aria-hidden="true" weight="bold" />
              Upload photo
            </Button>
          </div>
        </div>
      </div>
    </section>
  );

  return (
    <div>
      {notice && (
        <div className="mb-5">
          <Alert tone="success" title={notice} />
        </div>
      )}

      {!signedIn && !guestNoticeDismissed && (
        <div className="mb-5">
          <GuestNotice onSignUp={onSignUp} onDismiss={() => setGuestNoticeDismissed(true)} />
        </div>
      )}

      {/* Greeting — name, subtitle, the editorial quote, and the one big CTA. */}
      <section
        aria-labelledby="home-heading"
        className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5"
      >
        <div className="min-w-0">
          <h1 id="home-heading" className="font-display text-h1 text-ink">
            {greeting}
          </h1>
          <Text className="mt-1.5 max-w-prose text-muted">
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

      {/* Four summary cards — real numbers from the library read model. */}
      {stats && (
        <div className="mt-5 grid grid-cols-2 gap-4 xl:grid-cols-4" aria-label="Recipe statistics">
          {stats.map((stat) => (
            <StatCard key={stat.label} {...stat} />
          ))}
        </div>
      )}

      {/* Feature row — the three entry modes + the restriction profile. */}
      <div className={`mt-5 grid items-stretch gap-4 ${signedIn ? 'lg:grid-cols-2' : ''}`}>
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
            {profileInfo && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {profileInfo.allergenNames.map((name) => (
                  <span
                    key={name}
                    className="rounded-full border border-border bg-canvas px-2 py-0.5 text-caption font-medium text-muted"
                  >
                    {name}
                  </span>
                ))}
                {profileInfo.patterns.map((pattern) => (
                  <span
                    key={pattern}
                    className="rounded-full border border-positive/40 bg-positive/10 px-2 py-0.5 text-caption font-semibold text-positive"
                  >
                    {pattern}
                  </span>
                ))}
                {profileInfo.labelPack && (
                  <span className="rounded-full border border-border bg-canvas px-2 py-0.5 text-caption font-medium text-faint">
                    {profileInfo.labelPack} label pack
                  </span>
                )}
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button size="sm" variant="outline" onClick={onOpenHousehold}>
                View profile
                <ArrowRight size={14} aria-hidden="true" weight="bold" />
              </Button>
              {profileInfo && (
                <span className="text-caption text-muted">
                  {profileInfo.allergenNames.length + profileInfo.patterns.length > 0
                    ? `${profileInfo.allergenNames.length + profileInfo.patterns.length} restriction${
                        profileInfo.allergenNames.length + profileInfo.patterns.length === 1 ? '' : 's'
                      } set`
                    : 'No restrictions set'}
                </span>
              )}
            </div>
          </section>
        )}
      </div>

      {/* Recently updated + quick actions — the bottom row. */}
      {signedIn && library !== null && (
        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_16.5rem]">
          <section aria-labelledby="recent-heading" className="min-w-0">
            <div className="flex items-baseline justify-between gap-4">
              <h2 id="recent-heading" className="font-display text-h2 text-ink">
                Recently updated recipes
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
                      <span className="relative block h-28 w-full overflow-hidden bg-canvas">
                        {recipe.photo_uri ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={recipePhotoUrl(recipe.photo_uri, recipe.recipe_id)}
                            alt=""
                            className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                            onError={(e) => {
                              // Broken/expired asset — fall back to the monogram.
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
                          <span className="font-display text-3xl font-semibold">
                            {(recipe.name.trim().charAt(0) || 'R').toUpperCase()}
                          </span>
                        </span>
                      </span>
                      <span className="block p-4">
                        <span className="block truncate text-body font-semibold text-ink">
                          {recipe.name}
                        </span>
                        <span className="mt-0.5 block text-caption text-faint">
                          Updated {timeAgo(recipe.date)}
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
                          {recipe.family && (
                            <span className="rounded-full border border-border bg-canvas px-2 py-0.5 text-caption font-medium text-muted">
                              {recipe.family}
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
            <div className="mt-2 flex flex-col gap-0.5">
              {(
                [
                  { label: 'Add a new recipe', icon: Plus, onClick: () => onCreate() },
                  { label: 'Upload a recipe photo', icon: Camera, onClick: () => onCreate('photo') },
                  { label: 'Create shopping list', icon: Basket, onClick: onCreateShoppingList },
                  { label: 'Enter cook mode', icon: CookingPot, onClick: onEnterCookMode },
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
            <p className="mt-3 border-t border-border pt-3 text-caption text-faint">
              Shopping lists and cook mode live inside each recipe — these open your most recent
              one.
            </p>
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
