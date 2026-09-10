'use client';

import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL, api } from '@/lib/api';
import { User } from '@/lib/types';
import { LoadingScreen } from '@/components/ui/Spinner';
import { LandingPage } from '@/components/home/LandingPage';
import { AppShell, AppView } from '@/components/app/AppShell';
import { HomeView } from '@/components/app/HomeView';
import { CreateView } from '@/components/app/CreateView';
import { RecipeWorkspace } from '@/components/app/RecipeWorkspace';
import { claimSessionRecords } from '@/lib/flow';
import type { WireLine } from '@/lib/types';

type State =
  | { phase: 'loading' }
  | { phase: 'signed-in'; user: User }
  | { phase: 'guest' }
  | { phase: 'anonymous'; error?: string };

/** Auth error surfaced by the BFF callback (invalid credentials, expired code, IdP failure). */
function readAuthError(): string | null {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get('auth_error');
  return value ? decodeURIComponent(value) : null;
}

export default function Home() {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [guestSessionId, setGuestSessionId] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(readAuthError());
  const [view, setView] = useState<AppView>({ name: 'home' });

  useEffect(() => {
    let cancelled = false;
    api<User>('/auth/me')
      .then((user) => {
        if (cancelled) return;
        // QA-B2 fix: the BFF callback appends ?claimed=1 after a successful
        // guest-session claim — re-tag this browser's guest records so the
        // claimed recipes appear under "This session", not "Other sessions".
        if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('claimed')) {
          claimSessionRecords(user.id);
          const clean = window.location.pathname + window.location.hash;
          window.history.replaceState(null, '', clean);
        }
        setState({ phase: 'signed-in', user });
      })
      .catch(() => !cancelled && setState({ phase: 'anonymous' }));
    return () => {
      cancelled = true;
    };
  }, []);

  const startLogin = useCallback(() => {
    // Interactive OIDC: the BFF redirects to Keycloak (authorization-code flow).
    window.location.href = `${API_BASE_URL}/auth/login?redirect_to=/`;
  }, []);

  const startSignup = useCallback(() => {
    window.location.href = `${API_BASE_URL}/auth/signup`;
  }, []);

  const startGuest = useCallback(async () => {
    try {
      const result = await api<{ ok: boolean; guest_session_id: string }>('/auth/guest/session', {
        method: 'POST',
      });
      setGuestSessionId(result.guest_session_id);
      setView({ name: 'home' });
      setState({ phase: 'guest' });
    } catch {
      setState({ phase: 'anonymous', error: 'Could not start a guest session.' });
    }
  }, []);

  const signOut = useCallback(async () => {
    // BFF clears the app session and returns the IdP logout URL; navigating through
    // Keycloak ends its SSO session too, so the next Sign in prompts for credentials.
    try {
      const result = await api<{ ok: boolean; redirect_to?: string }>('/auth/logout', {
        method: 'POST',
      });
      if (result.redirect_to) {
        window.location.href = result.redirect_to;
        return;
      }
    } catch {
      // fall through to a local anonymous state
    }
    setState({ phase: 'anonymous' });
  }, []);

  if (state.phase === 'loading') {
    return <LoadingScreen label="Checking your session" />;
  }

  if (state.phase === 'anonymous') {
    return (
      <main>
        {state.error && (
          <div className="container-rs mt-6">
            <div className="rounded-md border border-negative/40 bg-negative/8 px-4 py-3">
              <p className="text-small font-semibold text-negative">Something went wrong</p>
              <p className="mt-0.5 text-small text-body">{state.error}</p>
            </div>
          </div>
        )}
        <LandingPage
          error={authError}
          errorTitle="Sign-in failed"
          onStartGuest={startGuest}
          onStartLogin={startLogin}
          onStartSignup={startSignup}
        />
      </main>
    );
  }

  const user = state.phase === 'signed-in' ? state.user : null;

  return (
    <AppShell user={user} onNavigate={setView} onSignOut={() => void signOut()}>
      {view.name === 'home' && (
        <HomeView
          signedIn={state.phase === 'signed-in'}
          accountId={user?.id ?? null}
          onCreate={() => setView({ name: 'create' })}
          onOpenRecipe={(recipeId, lines) =>
            setView({ name: 'workspace', recipeId, initialLines: lines ?? null })
          }
          onSignUp={startSignup}
          onSignOut={() => void signOut()}
        />
      )}
      {view.name === 'create' && (
        <CreateView
          signedIn={state.phase === 'signed-in'}
          accountId={user?.id ?? null}
          onBack={() => setView({ name: 'home' })}
          onParsed={(recipeId, lines) => setView({ name: 'workspace', recipeId, initialLines: lines })}
        />
      )}
      {view.name === 'workspace' && (
        <RecipeWorkspace
          recipeId={view.recipeId}
          signedIn={state.phase === 'signed-in'}
          onBack={() => setView({ name: 'home' })}
          initialLines={view.initialLines}
          preferredMode={user?.preferred_mode === 'chef' ? 'chef' : 'home'}
        />
      )}
      {state.phase === 'guest' && guestSessionId && (
        <p className="sr-only">Guest session {guestSessionId.slice(0, 8)}</p>
      )}
    </AppShell>
  );
}
