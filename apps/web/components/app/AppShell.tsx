'use client';

// The application shell: branding bar, account state, and the product view
// machine (home → create → workspace). Navigation stays on one line; the
// guest band lives inside HomeView, never dominating the page.

import { Plus, SignOut } from '@phosphor-icons/react';
import { Button } from '@/components/ui/Button';
import type { User, WireLine } from '@/lib/types';

export type AppView =
  | { name: 'home' }
  | { name: 'create' }
  | { name: 'workspace'; recipeId: string; initialLines?: WireLine[] | null; initialTitle?: string };

export interface AppShellProps {
  user: User | null;
  onNavigate: (view: AppView) => void;
  onSignOut: () => void;
  children: React.ReactNode;
}

export function AppShell({ user, onNavigate, onSignOut, children }: AppShellProps) {
  return (
    <div className="min-h-[100dvh]">
      <header className="sticky top-0 z-30 border-b border-border bg-surface">
        <div className="container-rs flex min-h-14 items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => onNavigate({ name: 'home' })}
            className="flex items-baseline gap-2 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
          >
            <span className="font-display text-lg font-medium tracking-tight text-ink">
              Recipe Systems
            </span>
            <span aria-hidden="true" className="hidden text-caption text-muted sm:inline">
              analysis, not generation
            </span>
          </button>
          <div className="flex items-center gap-3">
            <span className="hidden max-w-56 truncate text-small text-muted sm:inline">
              {user ? user.email : 'Guest session'}
            </span>
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
      <main className="container-rs py-8 sm:py-10">{children}</main>
    </div>
  );
}
