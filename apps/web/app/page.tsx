'use client';

import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL, api } from '@/lib/api';
import { User } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Heading, Text } from '@/components/ui/Typography';
import { Alert } from '@/components/ui/Alert';
import { LoadingScreen } from '@/components/ui/Spinner';
import { LandingPage } from '@/components/home/LandingPage';

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

  useEffect(() => {
    let cancelled = false;
    api<User>('/auth/me')
      .then((user) => !cancelled && setState({ phase: 'signed-in', user }))
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

  if (state.phase === 'signed-in') {
    return (
      <main className="container-rs py-12">
        <Card elevation="flat" className="max-w-xl">
          <Heading level={2}>Signed in</Heading>
          <Text className="mt-2">{state.user.email}</Text>
          <p className="mt-1 text-small text-muted">
            Mode {state.user.preferred_mode} · label pack {state.user.label_pack ?? 'not set'}
          </p>
          <div className="mt-5">
            <Button variant="secondary" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </Card>
      </main>
    );
  }

  if (state.phase === 'guest') {
    return (
      <main className="container-rs py-12">
        <Card elevation="flat" className="max-w-xl">
          <Heading level={2}>You&apos;re analysing as a guest</Heading>
          <Text className="mt-2">
            Guest session {guestSessionId?.slice(0, 8)}. Analyses you run now can be claimed
            onto an account when you sign up.
          </Text>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button onClick={startSignup}>Create account &amp; claim</Button>
            <Button variant="secondary" onClick={signOut}>
              Dismiss
            </Button>
          </div>
        </Card>
      </main>
    );
  }

  // Anonymous: the full entry experience.
  return (
    <main>
      {state.error && (
        <div className="container-rs mt-6">
          <Alert tone="error" title="Something went wrong">
            {state.error}
          </Alert>
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
