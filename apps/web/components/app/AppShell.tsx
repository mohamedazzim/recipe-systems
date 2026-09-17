'use client';

// The application shell: slim sticky nav — wordmark, Home/Library navigation,
// search, the New recipe primary action, and account/sign-out. Mirrors the
// reference shell composition while staying wired to the real view machine.

import { MagnifyingGlass, Plus, SignOut } from '@phosphor-icons/react';
import { Button } from '@/components/ui/Button';
import type { User, WireLine } from '@/lib/types';

export type AppView =
  | { name: 'home' }
  | { name: 'library' }
  | { name: 'create' }
  | { name: 'workspace'; recipeId: string; initialLines?: WireLine[] | null; initialTitle?: string };

export interface AppShellProps {
  user: User | null;
  /** The active view — drives the Home/Library active state. */
  view: AppView;
  onNavigate: (view: AppView) => void;
  onSignOut: () => void;
  children: React.ReactNode;
}

export function AppShell({ user, view, onNavigate, onSignOut, children }: AppShellProps) {
  const nav = [
    { key: 'home', label: 'Home' },
    { key: 'library', label: 'Library' },
  ] as const;

  return (
    <div className="min-h-[100dvh]">
      <header className="sticky top-0 z-30 border-b border-border bg-surface">
        <div className="container-rs flex min-h-14 flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => onNavigate({ name: 'home' })}
              className="font-display text-lg font-medium tracking-tight text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
            >
              Recipe Systems
            </button>
            <nav aria-label="Primary" className="flex items-center gap-1">
              {nav.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() =>
                    onNavigate(item.key === 'home' ? { name: 'home' } : { name: 'library' })
                  }
                  aria-current={view.name === item.key ? 'page' : undefined}
                  className={`rounded-md px-3 py-1.5 text-small font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${
                    view.name === item.key ? 'bg-canvas text-ink' : 'text-muted hover:text-ink'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden max-w-48 truncate text-small text-muted sm:inline">
              {user ? user.email : 'Guest session'}
            </span>
            <button
              type="button"
              aria-label="Search"
              onClick={() => onNavigate({ name: 'library' })}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border-strong text-muted transition-colors hover:border-ink/40 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
            >
              <MagnifyingGlass size={16} aria-hidden="true" weight="bold" />
            </button>
            <Button size="sm" onClick={() => onNavigate({ name: 'create' })}>
              <Plus size={14} aria-hidden="true" weight="bold" />
              New recipe
            </Button>
            {user ? (
              <Button size="sm" variant="outline" onClick={onSignOut}>
                <SignOut size={14} aria-hidden="true" weight="bold" />
                Sign out
              </Button>
            ) : (
              <span className="rounded-full border border-border px-3 py-1 text-caption text-muted">
                Guest
              </span>
            )}
          </div>
        </div>
      </header>
      <main
        className={
          view.name === 'workspace'
            ? 'container-rs py-3 sm:py-4'
            : 'container-rs py-8 sm:py-10'
        }
      >
        {children}
      </main>
    </div>
  );
}
