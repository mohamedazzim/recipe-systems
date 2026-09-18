'use client';

// The application shell — left navigation rail (desktop) + compact top
// utility bar (search, theme, account). Mirrors the reference composition:
// brand block with tagline, grouped nav with the active item tinted,
// workspace section links while a recipe is open, and the editorial quote
// card at the foot of the rail.

import { useEffect, useRef, useState } from 'react';
import {
  Basket,
  Books,
  CaretDown,
  CookingPot,
  Flask,
  ForkKnife,
  House,
  ListChecks,
  ListNumbers,
  MagnifyingGlass,
  Moon,
  Plant,
  Plus,
  SignOut,
  Sun,
  UserCirclePlus,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/Button';
import type { User, WireLine } from '@/lib/types';

export type WorkspaceSection = 'ingredients' | 'method' | 'shopping' | 'analysis' | 'cook';

export type AppView =
  | { name: 'home' }
  | { name: 'library' }
  | { name: 'create'; mode?: 'paste' | 'form' | 'photo' }
  | { name: 'household' }
  | { name: 'workspace'; recipeId: string; initialLines?: WireLine[] | null; initialTitle?: string };

export interface AppShellProps {
  user: User | null;
  /** The active view — drives the Home/Library active state. */
  view: AppView;
  onNavigate: (view: AppView) => void;
  onSignOut: () => void;
  /** Workspace-only: section links rendered under "Recipe workspace". */
  workspaceSections?: {
    active: 'ingredients' | 'method' | 'shopping';
    onSelect: (section: WorkspaceSection) => void;
  };
  /** Top-bar search submit — the parent routes to the Library with the query. */
  onSearch?: (query: string) => void;
  children: React.ReactNode;
}

function initialsFor(user: User | null): string {
  if (!user) return 'G';
  const local = user.email.split('@')[0].replace(/[^a-zA-Z]/g, '');
  if (local.length === 0) return 'R';
  return local.slice(0, 2).toUpperCase();
}

function firstNameOf(user: User | null): string | null {
  if (!user) return null;
  const raw = user.email.split('@')[0].replace(/[._+-]/g, ' ');
  const first = raw.trim().split(/\s+/)[0];
  if (!first) return null;
  const word = first.toLowerCase();
  return word.charAt(0).toUpperCase() + word.slice(1);
}

const NAV_ITEMS = [
  { key: 'home', label: 'Home', icon: House },
  { key: 'library', label: 'Library', icon: Books },
  { key: 'create', label: 'Add recipe', icon: Plus },
] as const;

const WORKSPACE_ITEMS = [
  { key: 'ingredients', label: 'Ingredients', icon: ListChecks },
  { key: 'method', label: 'Method', icon: ListNumbers },
  { key: 'shopping', label: 'Shopping list', icon: Basket },
  { key: 'analysis', label: 'Analysis views', icon: Flask },
  { key: 'cook', label: 'Cook mode', icon: CookingPot },
] as const;

export function AppShell({
  user,
  view,
  onNavigate,
  onSignOut,
  workspaceSections,
  onSearch,
  children,
}: AppShellProps) {
  const [dark, setDark] = useState(false);
  const [query, setQuery] = useState('');
  const [accountOpen, setAccountOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Theme — the token layer ships both palettes; this is the switch.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem('rs-theme');
    const prefersDark =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    setDark(stored ? stored === 'dark' : prefersDark);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('rs-theme', dark ? 'dark' : 'light');
    }
  }, [dark]);

  // Ctrl+K focuses the top-bar search (the reference's shortcut).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Account menu — close on outside click or Escape.
  useEffect(() => {
    if (!accountOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (target && target.closest('[data-account-menu]')) return;
      setAccountOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAccountOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [accountOpen]);

  const go = (target: AppView) => () => onNavigate(target);

  const groupLabel =
    'px-3 pt-6 pb-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-faint';
  const navItem = (active: boolean) =>
    `flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-small font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset--2 focus-visible:outline-gold ${
      active
        ? 'bg-accent/10 font-semibold text-accent-strong'
        : 'text-muted hover:bg-ink/5 hover:text-ink'
    }`;

  return (
    <div className="min-h-[100dvh] lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)]">
      {/* LEFT — the navigation rail. Desktop only; mobile keeps the compact bar. */}
      <aside
        aria-label="Primary"
        className="hidden border-r border-border bg-surface lg:flex lg:flex-col"
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4 pt-5">
          <button
            type="button"
            onClick={go({ name: 'home' })}
            className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-surface shadow-card">
              <ForkKnife size={20} aria-hidden="true" weight="fill" />
            </span>
            <span className="min-w-0">
              <span className="block font-display text-lg font-semibold leading-tight tracking-tight text-ink">
                Recipe Systems
              </span>
              <span className="block text-caption text-muted">Understand. Cook. Enjoy.</span>
            </span>
          </button>

          <nav aria-label="Primary" className="mt-6">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = view.name === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={go(item.key === 'create' ? { name: 'create' } : { name: item.key })}
                  aria-current={active ? 'page' : undefined}
                  className={navItem(active)}
                >
                  <Icon size={17} aria-hidden="true" weight={active ? 'fill' : 'regular'} />
                  {item.label}
                </button>
              );
            })}
          </nav>

          {workspaceSections && view.name === 'workspace' && (
            <nav aria-label="Recipe workspace">
              <p className={groupLabel}>Recipe workspace</p>
              {WORKSPACE_ITEMS.map((item) => {
                const Icon = item.icon;
                const isTab =
                  item.key === 'ingredients' || item.key === 'method' || item.key === 'shopping';
                const active = isTab && workspaceSections.active === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => workspaceSections.onSelect(item.key)}
                    aria-current={active ? 'true' : undefined}
                    className={navItem(active)}
                  >
                    <Icon size={17} aria-hidden="true" weight={active ? 'fill' : 'regular'} />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          )}

          <nav aria-label="Account">
            <p className={groupLabel}>Account</p>
            <button
              type="button"
              onClick={go({ name: 'household' })}
              className={navItem(view.name === 'household')}
            >
              <UserCirclePlus
                size={17}
                aria-hidden="true"
                weight={view.name === 'household' ? 'fill' : 'regular'}
              />
              Household profile
            </button>
            {user && (
              <button type="button" onClick={onSignOut} className={navItem(false)}>
                <SignOut size={17} aria-hidden="true" />
                Sign out
              </button>
            )}
          </nav>

          {/* Editorial footnote — the rail's quiet close. */}
          <div className="mt-auto pt-6">
            <div className="rounded-xl border border-accent/20 bg-accent/10 p-4">
              <Plant size={18} aria-hidden="true" className="text-accent" weight="fill" />
              <p className="mt-2.5 font-display text-small italic leading-relaxed text-ink">
                Good food brings people together.
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* RIGHT — top utility bar + content. */}
      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-border bg-surface">
          <div className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 sm:px-6 lg:px-8">
            {/* Mobile-only brand + primary nav (the rail replaces these on lg). */}
            <button
              type="button"
              onClick={go({ name: 'home' })}
              className="font-display text-lg font-medium tracking-tight text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold lg:hidden"
            >
              Recipe Systems
            </button>
            <nav aria-label="Primary" className="flex items-center gap-1 lg:hidden">
              <button
                type="button"
                onClick={go({ name: 'home' })}
                aria-current={view.name === 'home' ? 'page' : undefined}
                className={`rounded-md px-2.5 py-1.5 text-small font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${
                  view.name === 'home' ? 'bg-canvas text-ink' : 'text-muted hover:text-ink'
                }`}
              >
                Home
              </button>
              <button
                type="button"
                onClick={go({ name: 'library' })}
                aria-current={view.name === 'library' ? 'page' : undefined}
                className={`rounded-md px-2.5 py-1.5 text-small font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${
                  view.name === 'library' ? 'bg-canvas text-ink' : 'text-muted hover:text-ink'
                }`}
              >
                Library
              </button>
            </nav>

            {/* Search — routes to the Library search on submit. */}
            <form
              role="search"
              aria-label="Search recipes"
              className="order-last w-full min-w-0 lg:order-none lg:w-auto lg:max-w-xl lg:flex-1"
              onSubmit={(e) => {
                e.preventDefault();
                if (query.trim() !== '') onSearch?.(query.trim());
              }}
            >
              <div className="relative">
                <MagnifyingGlass
                  size={16}
                  aria-hidden="true"
                  weight="bold"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
                />
                <input
                  ref={searchRef}
                  aria-label="Search your recipes, ingredients or cuisines"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search your recipes, ingredients or cuisines..."
                  maxLength={100}
                  className="h-9 w-full rounded-md border border-border-strong bg-canvas pl-9 pr-14 text-small text-ink placeholder:text-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                />
                <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-surface px-1.5 py-0.5 text-[0.625rem] font-semibold text-faint sm:inline-block">
                  Ctrl K
                </kbd>
              </div>
            </form>

            <div className="ml-auto flex items-center gap-1.5 lg:ml-0">
              <Button size="sm" onClick={go({ name: 'create' })} className="lg:hidden">
                <Plus size={14} aria-hidden="true" weight="bold" />
                New recipe
              </Button>
              <button
                type="button"
                aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
                onClick={() => setDark(!dark)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
              >
                {dark ? (
                  <Sun size={16} aria-hidden="true" weight="bold" />
                ) : (
                  <Moon size={16} aria-hidden="true" weight="bold" />
                )}
              </button>

              {user ? (
                <div data-account-menu className="relative">
                  <button
                    type="button"
                    aria-label={`Account menu for ${user.email}`}
                    aria-haspopup="menu"
                    aria-expanded={accountOpen}
                    onClick={() => setAccountOpen(!accountOpen)}
                    className="flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-ink/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-small font-bold text-surface">
                      {initialsFor(user)}
                    </span>
                    <span className="hidden min-w-0 max-w-40 truncate text-small font-medium text-ink sm:block">
                      {user.email}
                    </span>
                    <CaretDown size={14} aria-hidden="true" weight="bold" className="text-faint" />
                  </button>
                  {accountOpen && (
                    <div
                      aria-label="Account menu"
                      className="absolute right-0 top-11 z-30 min-w-56 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-card"
                    >
                      <p className="border-b border-border px-3 py-2 text-caption text-muted">
                        Signed in as
                        <span className="block truncate font-semibold text-ink">{user.email}</span>
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setAccountOpen(false);
                          onNavigate({ name: 'household' });
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-small font-medium text-body transition-colors hover:bg-ink/5 hover:text-ink"
                      >
                        <UserCirclePlus size={15} aria-hidden="true" />
                        Household profile
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAccountOpen(false);
                          onSignOut();
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-small font-medium text-negative transition-colors hover:bg-negative/10"
                      >
                        <SignOut size={15} aria-hidden="true" />
                        Sign out
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <span className="rounded-full border border-border px-3 py-1 text-caption text-muted">
                  Guest
                </span>
              )}
            </div>
          </div>
        </header>

        <main
          className={view.name === 'workspace' ? 'container-rs py-3 sm:py-4' : 'container-rs py-6 sm:py-8'}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

/** The first-name greeting used by the Home header (derived from the email). */
export function greetName(user: User | null): string | null {
  return firstNameOf(user);
}
