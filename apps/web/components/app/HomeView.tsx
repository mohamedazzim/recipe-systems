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
  Books,
  Camera,
  CaretDown,
  ChartBar,
  CheckCircle,
  CookingPot,
  FileText,
  ListBullets,
  Plant,
  Plus,
  SquaresFour,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Text } from '@/components/ui/Typography';
import { isOwnedBy, listSessionRecipes, sessionRecipeLines } from '@/lib/flow';
import { GuestNotice } from '@/components/app/GuestNotice';
import { api } from '@/lib/api';
import { recipePhotoUrl } from '@/lib/photo';
import type {
  LibraryFilter,
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
  onCreate: (mode?: 'paste' | 'form' | 'photo' | 'upload') => void;
  /** QA-B1 fix: guest-owned records carry their parse-response lines so a
   *  read-only reopen renders them (guests can't fetch Bearer-only routes).
   *  D-22: library rows pass their saved DB name so the workspace title is the
   *  saved name even after a browser restart (no session record exists then). */
  onOpenRecipe: (recipeId: string, initialLines?: WireLine[] | null, title?: string) => void;
  /** Navigate to the full Library view (D-25 D3 separation from Home) with an
   *  optional status filter pre-applied (the dashboard stat cards). */
  onOpenLibrary: (filter?: LibraryFilter) => void;
  /** Navigate to the Household restriction profile view. */
  onOpenHousehold: () => void;
  /** Quick actions — open the most recent recipe at the shopping/cook section. */
  onCreateShoppingList: () => void;
  onEnterCookMode: () => void;
  onSignUp: () => void;
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
  onClick: () => void;
}

function StatCard({ label, value, sub, icon: Icon, tint, progress, onClick }: StatCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl border border-border bg-surface p-4 text-left shadow-whisper transition-shadow hover:shadow-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
    >
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
    </button>
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
            filter: 'all' as LibraryFilter,
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
            filter: 'analysed' as LibraryFilter,
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
            filter: 'shopping' as LibraryFilter,
          },
          {
            label: 'Cooked recipes',
            value: cooked,
            sub: cookedThisMonth > 0 ? `+${cookedThisMonth} this month` : 'with a cook log',
            icon: CheckCircle,
            tint: 'bg-negative/10 text-negative',
            filter: 'cooked' as LibraryFilter,
          },
        ]
      : null;

  const greeting =
    signedIn && userName ? `Welcome back, ${userName}!` : signedIn ? 'Welcome back!' : 'Welcome';

  const startCard = (
    <section
      aria-labelledby="start-heading"
      className="relative overflow-hidden rounded-[1.5rem] border border-[#dfe7dc] bg-[#edf6ec] p-5 shadow-[0_18px_42px_rgba(27,54,42,0.08)]"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 hidden bg-cover bg-right bg-no-repeat sm:block"
        style={{ backgroundImage: 'url("/images/start-recipe-clean.png")' }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 hidden sm:block"
        style={{
          background:
            'linear-gradient(to right, rgba(237,246,236,0.96) 0%, rgba(237,246,236,0.88) 35%, rgba(237,246,236,0.36) 62%, rgba(237,246,236,0.04) 84%, transparent 100%)',
        }}
      />

      <div className="relative z-10 max-w-[38rem]">
        <div className="flex items-center gap-2">
          <Plant size={20} aria-hidden="true" weight="bold" className="text-accent" />
          <h2 id="start-heading" className="font-display text-h2 text-ink">
            Start a new recipe
          </h2>
        </div>
        <p className="mt-1 max-w-prose text-small text-muted">
          Add a recipe from text, a structured form, or a photo.
        </p>
        <div className="mt-4 flex flex-wrap gap-2.5">
          <Button size="sm" onClick={() => onCreate('paste')} className="shadow-sm">
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
    </section>
  );

  // Guest-only building blocks (Image 2 reference layout).
  const startModes = [
    { label: 'Paste text', sub: 'Quick & easy', icon: FileText, mode: 'paste', primary: true },
    { label: 'Structured form', sub: 'Step by step', icon: ListBullets, mode: 'form', primary: false },
    { label: 'Upload photo', sub: 'From a recipe image', icon: Camera, mode: 'photo', primary: false },
  ] as const;

  const guestFeatures = [
    { icon: ChartBar, title: 'Smart analysis', body: 'Ingredients, steps, nutrition & more', tint: 'bg-[#f6e6d6] text-[#c06a2e]' },
    { icon: Books, title: 'Organise easily', body: 'Keep your favourites in one place', tint: 'bg-[#e9e3f3] text-[#6a5aa8]' },
    { icon: CookingPot, title: 'Cook better', body: 'Insights to improve your meals', tint: 'bg-[#e2ede0] text-[#4c6b3a]' },
    { icon: Plant, title: 'For everyone', body: 'Good food brings people together', tint: 'bg-[#f7e0e5] text-[#b3546b]' },
  ] as const;

  return (
    // The redesigned home is a scrollable editorial landing page: the shell's
    // `<main>` provides the normal document flow so every section (hero, stats,
    // entry modes, profile, recent recipes, quick actions) stays reachable.
    <div>
      {notice && (
        <div className="mb-5 lg:shrink-0">
          <Alert tone="success" title={notice} />
        </div>
      )}

      {!signedIn && !guestNoticeDismissed && (
        <div className="mb-5">
          <GuestNotice onSignUp={onSignUp} onDismiss={() => setGuestNoticeDismissed(true)} />
        </div>
      )}

      {signedIn ? (
        <section aria-labelledby="home-heading" className="lg:shrink-0">
        <div className="overflow-hidden rounded-[1.75rem] border border-[#dfe7dc] bg-[#f5f6f0] shadow-[0_22px_60px_rgba(23,48,37,0.08)]">
          <div className="grid gap-6 p-5 md:p-8 xl:grid-cols-[1.08fr_0.92fr] xl:items-center">
            <div className="min-w-0">
              <p className="mb-4 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-[#3d6c59]">
                Welcome to Recipe Systems
              </p>
              <h1 id="home-heading" className="font-display text-[2.4rem] leading-[1.05] tracking-[-0.03em] text-ink md:text-[3.4rem]">
                {greeting}
              </h1>
              <p className="mt-2 font-display text-[1.35rem] leading-snug text-accent md:text-[1.6rem]">
                Good food starts here.
              </p>
              <Text className="mt-4 max-w-[30rem] text-base text-muted md:text-lg">
                Continue your cooking journey with AI-powered recipe analysis. Understand ingredients,
                discover new ideas, and cook with confidence.
              </Text>

              <div className="mt-6 flex flex-wrap gap-3">
                <Button size="lg" onClick={() => onCreate()}>
                  <Plus size={16} aria-hidden="true" weight="bold" />
                  Add new recipe
                </Button>
                {signedIn && (
                  <Button size="lg" variant="outline" onClick={() => onOpenLibrary()}>
                    <Books size={16} aria-hidden="true" weight="bold" />
                    Browse library
                  </Button>
                )}
              </div>
            </div>

            <div className="relative min-h-[16rem] overflow-hidden rounded-[1.5rem] border border-[#e0e2da] bg-[#f0f1ea]">
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-cover bg-center bg-no-repeat"
                style={{ backgroundImage: 'url("/images/hero-food.png")' }}
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0.08)_100%)]" />
              <div className="absolute bottom-4 right-4 max-w-[14rem] rounded-[1.25rem] border border-[#dfe7dc] bg-[rgba(250,249,245,0.78)] p-3 text-sm text-ink shadow-[0_12px_25px_rgba(33,58,49,0.08)] backdrop-blur-sm">
                <p className="font-display text-[1.15rem] italic leading-snug text-ink">
                  “A good recipe is more than ingredients — it&apos;s a story.”
                </p>
              </div>
            </div>
          </div>
        </div>
        </section>
      ) : (
        <section aria-labelledby="home-heading" className="lg:shrink-0">
          <div className="overflow-hidden rounded-[1.75rem] border border-[#dfe7dc] bg-[#f5f6f0] shadow-[0_22px_60px_rgba(23,48,37,0.08)]">
            <div className="grid gap-6 p-5 md:p-8 xl:grid-cols-[1.08fr_0.92fr] xl:items-center">
              <div className="min-w-0">
                <p className="mb-4 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-[#3d6c59]">
                  Welcome to Recipe Systems
                </p>
                <h1 id="home-heading" className="font-display text-[2.7rem] leading-[0.95] tracking-[-0.04em] text-ink md:text-[4rem]">
                  Good food<br />
                  starts <span className="italic text-accent">here.</span>
                </h1>
                <Text className="mt-4 max-w-[30rem] text-base text-muted md:text-lg">
                  Continue your cooking journey with AI-powered recipe analysis. Understand
                  ingredients, discover new ideas, and cook with confidence.
                </Text>

                <div className="mt-7 flex flex-wrap items-center gap-x-7 gap-y-4">
                  <span className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f3e2d0] text-[#c06a2e]">
                      <FileText size={16} aria-hidden="true" weight="bold" />
                    </span>
                    <span className="text-small font-semibold leading-snug text-body">
                      Analyse
                      <br />
                      recipes
                    </span>
                  </span>
                  <span className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e4ede2] text-[#4c6b3a]">
                      <ChartBar size={16} aria-hidden="true" weight="bold" />
                    </span>
                    <span className="text-small font-semibold leading-snug text-body">
                      Get insights
                      <br />
                      &amp; nutrition
                    </span>
                  </span>
                  <span className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e8e4f1] text-[#6a5aa8]">
                      <Books size={16} aria-hidden="true" weight="bold" />
                    </span>
                    <span className="text-small font-semibold leading-snug text-body">
                      Save to
                      <br />
                      your library
                    </span>
                  </span>
                </div>

                <div className="mt-7">
                  <Button size="lg" onClick={() => onCreate()}>
                    <Plus size={16} aria-hidden="true" weight="bold" />
                    Add new recipe
                  </Button>
                </div>
              </div>

              <div className="relative min-h-[18rem] overflow-hidden rounded-[1.5rem] border border-[#e0e2da] bg-[#f0f1ea]">
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-cover bg-center bg-no-repeat"
                  style={{ backgroundImage: 'url("/images/hero-food.png")' }}
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0.12)_100%)]" />
                <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-[rgba(250,249,245,0.82)] px-3 py-1.5 text-caption font-semibold text-ink shadow-sm backdrop-blur-sm">
                  Turn ingredients into delicious stories
                  <ArrowRight size={14} aria-hidden="true" weight="bold" className="text-accent" />
                </div>
                <div className="absolute bottom-4 right-4 max-w-[15rem] rounded-[1.25rem] border border-[#dfe7dc] bg-[rgba(250,249,245,0.78)] p-3 text-sm text-ink shadow-[0_12px_25px_rgba(33,58,49,0.08)] backdrop-blur-sm">
                  <Plant size={16} aria-hidden="true" weight="fill" className="text-accent" />
                  <p className="mt-1.5 font-display text-[1.1rem] italic leading-snug text-ink">
                    “A good recipe is more than ingredients — it&apos;s a story.”
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Four summary cards — real numbers from the library read model. */}
      {stats && (
        <div
          className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4"
          aria-label="Recipe statistics"
        >
          {stats.map((stat) => (
            <StatCard
              key={stat.label}
              label={stat.label}
              value={stat.value}
              sub={stat.sub}
              icon={stat.icon}
              tint={stat.tint}
              progress={stat.progress}
              onClick={() => onOpenLibrary(stat.filter)}
            />
          ))}
        </div>
      )}

      {signedIn ? (
        <div className="mt-6">{startCard}</div>
      ) : (
        <section aria-labelledby="start-heading" className="mt-6">
          <div className="flex items-center gap-2">
            <Plant size={20} aria-hidden="true" weight="bold" className="text-accent" />
            <h2 id="start-heading" className="font-display text-h2 text-ink">
              Start a new recipe
            </h2>
          </div>
          <p className="mt-1 max-w-prose text-small text-muted">
            Add a recipe from text, a structured form, or a photo.
          </p>

          <div className="mt-4 grid items-stretch gap-4 md:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="grid gap-4 sm:grid-cols-3">
              {startModes.map((mode) => {
                const Icon = mode.icon;
                return (
                  <button
                    key={mode.label}
                    type="button"
                    onClick={() => onCreate(mode.mode)}
                    className={`group rounded-[1.25rem] border p-4 text-left transition-shadow hover:shadow-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${
                      mode.primary
                        ? 'border-[#8bb79a] bg-[#d2ead8] shadow-sm'
                        : 'border-border bg-surface shadow-whisper'
                    }`}
                  >
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                        mode.primary ? 'bg-[#1d553f] text-white' : 'bg-accent/10 text-accent'
                      }`}
                    >
                      <Icon size={18} aria-hidden="true" weight="bold" />
                    </span>
                    <span className="mt-3 block text-body font-semibold text-ink">
                      {mode.label}
                    </span>
                    <span className="mt-0.5 block text-caption text-faint">
                      {mode.sub}
                    </span>
                  </button>
                );
              })}
            </div>

            <aside className="relative overflow-hidden rounded-[1.25rem] border border-[#e2e5d8] bg-[#eef3eb]">
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-cover bg-center bg-no-repeat"
                style={{ backgroundImage: 'url("/images/start-recipe-clean.png")' }}
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-[linear-gradient(135deg,rgba(238,243,235,0.96)_0%,rgba(238,243,235,0.78)_100%)]"
              />
              <div className="relative p-5">
                <p className="font-display text-h3 text-ink">Any recipe, any format</p>
                <ul className="mt-3 space-y-1.5">
                  {['Ingredients', 'Instructions', 'Nutrition', 'AI Insights'].map((item) => (
                    <li key={item} className="flex items-center gap-2 text-small text-body">
                      <CheckCircle size={15} aria-hidden="true" weight="fill" className="text-accent" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          </div>
        </section>
      )}

      {signedIn && (
        <section
          aria-labelledby="profile-heading"
          className="mt-6 rounded-[1.5rem] border border-border bg-surface p-5 shadow-whisper"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 id="profile-heading" className="font-display text-h2 text-ink">
                Household restriction profile
              </h2>
              <p className="mt-1 text-small text-muted">
                Manage allergens and dietary preferences for better analysis and safer recipes.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={onOpenHousehold}>
              View profile
              <ArrowRight size={14} aria-hidden="true" weight="bold" />
            </Button>
          </div>

          {profileInfo && (
            <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
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
              {!profileInfo.allergenNames.length && !profileInfo.patterns.length && (
                <span className="text-caption text-muted">No restrictions set</span>
              )}
            </div>
          )}
        </section>
      )}

      {signedIn && library !== null && (
        <>
          <section aria-labelledby="recent-heading" className="mt-6 min-w-0">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="recent-heading" className="font-display text-h2 text-ink">
              Recently updated recipes
            </h2>
            <button
              type="button"
              onClick={() => onOpenLibrary()}
              className="inline-flex items-center gap-1 text-caption font-semibold text-accent-strong hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
            >
              View library
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          </div>

          {library.length === 0 ? (
            <div className="mt-4 overflow-hidden rounded-[1.5rem] border border-dashed border-border bg-surface shadow-whisper">
              <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <div className="mb-4 rounded-full bg-[#e7f3ea] p-5 text-[#2f6d57]">
                  <CookingPot size={30} aria-hidden="true" weight="bold" />
                </div>
                <h3 className="font-display text-h3 text-ink">No recipes yet</h3>
                <p className="mt-2 max-w-md text-small text-muted">
                  Your pasted or created recipes will appear here.
                </p>
                <Button className="mt-5" onClick={() => onCreate()}>
                  <Plus size={16} aria-hidden="true" weight="bold" />
                  Paste your first recipe
                </Button>
              </div>
            </div>
          ) : (
            <ul className="mt-4 grid gap-4 sm:grid-cols-2">
              {library.slice(0, 2).map((recipe, index) => (
                <li key={recipe.recipe_id}>
                  <button
                    type="button"
                    onClick={() => onOpenRecipe(recipe.recipe_id, null, recipe.name)}
                    className="group w-full overflow-hidden rounded-[1.25rem] border border-border bg-surface text-left shadow-whisper transition-shadow hover:shadow-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                  >
                    <span className="relative block h-36 w-full overflow-hidden bg-canvas">
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
                        <span className="font-display text-4xl font-semibold">
                          {(recipe.name.trim().charAt(0) || 'R').toUpperCase()}
                        </span>
                      </span>
                    </span>
                    <span className="block p-4">
                      <span className="block truncate text-body font-semibold text-ink">
                        {recipe.name}
                      </span>
                      <span className="mt-1 block text-caption text-faint">
                        Updated {timeAgo(recipe.date)}
                      </span>
                      <span className="mt-3 flex flex-wrap items-center gap-1.5">
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
          className="mt-6 rounded-[1.25rem] border border-border bg-surface p-5 shadow-whisper"
        >
          <h2 className="font-display text-h3 text-ink">Quick actions</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {(
              [
                { label: 'Create shopping list', icon: Basket, onClick: onCreateShoppingList },
                { label: 'Enter cook mode', icon: CookingPot, onClick: onEnterCookMode },
                { label: 'Add a new recipe', icon: Plus, onClick: () => onCreate() },
                { label: 'Upload a recipe photo', icon: Camera, onClick: () => onCreate('photo') },
              ] as const
            ).map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-canvas px-3 py-2 text-small font-medium text-body transition-colors hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                >
                  <Icon size={16} aria-hidden="true" weight="bold" className="text-accent" />
                  {action.label}
                </button>
              );
            })}
          </div>
        </aside>
        </>
      )}

      {!signedIn && (
        <section aria-labelledby="recent-heading" className="mt-10 border-t border-border pt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <div>
              <h2 id="recent-heading" className="font-display text-h2 text-ink">
                Your recipes
              </h2>
              <p className="mt-1 text-small text-muted">
                Here&apos;s where your saved recipes will appear.
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-small font-medium text-body">
                Recently added
                <CaretDown size={14} aria-hidden="true" />
              </span>
              <span className="flex overflow-hidden rounded-lg border border-border bg-surface" aria-hidden="true">
                <span className="flex h-8 w-8 items-center justify-center border-r border-border text-muted">
                  <SquaresFour size={15} />
                </span>
                <span className="flex h-8 w-8 items-center justify-center text-ink">
                  <ListBullets size={15} />
                </span>
              </span>
            </div>
          </div>

          {recipes.length === 0 ? (
            <div className="mt-6 flex flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-border bg-surface px-6 py-16 text-center">
              <div className="mb-4 rounded-full bg-[#e7f3ea] p-5 text-[#2f6d57]">
                <CookingPot size={30} aria-hidden="true" weight="bold" />
              </div>
              <h3 className="font-display text-h3 text-ink">No recipes yet</h3>
              <p className="mt-2 max-w-md text-small text-muted">
                Your pasted or created recipes will appear here.
              </p>
              <Button className="mt-5" onClick={() => onCreate()}>
                <Plus size={16} aria-hidden="true" weight="bold" />
                Paste your first recipe
              </Button>
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

          <p className="mt-8 border-t border-dashed border-border pt-6 text-center font-display text-small italic tracking-wide text-faint">
            Discover. Analyse. Cook. Enjoy.
          </p>
        </section>
      )}

      {!signedIn && (
        <section aria-label="What Recipe Systems offers" className="mt-8">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {guestFeatures.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="rounded-[1.25rem] border border-border bg-surface p-5 shadow-whisper"
                >
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${feature.tint}`}>
                    <Icon size={18} aria-hidden="true" weight="bold" />
                  </span>
                  <h3 className="mt-3 font-display text-body font-semibold text-ink">
                    {feature.title}
                  </h3>
                  <p className="mt-1 text-caption text-muted">{feature.body}</p>
                </div>
              );
            })}
          </div>
          <p className="mt-6 flex items-center justify-end gap-2 font-display text-[1.3rem] italic text-muted">
            Cooking made simple
            <ArrowRight size={18} aria-hidden="true" weight="bold" className="text-accent" />
          </p>
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
    </div>
  );
}
