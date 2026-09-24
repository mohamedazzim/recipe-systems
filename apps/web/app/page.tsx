'use client';

import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL, api, setSessionExpiredHandler } from '@/lib/api';
import { User } from '@/lib/types';
import { LoadingScreen } from '@/components/ui/Spinner';
import { LandingPage } from '@/components/home/LandingPage';
import { AppShell, AppView, WorkspaceSection, greetName } from '@/components/app/AppShell';
import { HomeView } from '@/components/app/HomeView';
import { LibraryView } from '@/components/app/LibraryView';
import { CreateView } from '@/components/app/CreateView';
import { HouseholdView } from '@/components/app/HouseholdView';
import { DocumentDraftReview } from '@/components/app/DocumentDraftReview';
import { RecipeWorkspace } from '@/components/app/RecipeWorkspace';
import { SessionExpiredModal } from '@/components/app/SessionExpiredModal';
import { claimSessionRecords } from '@/lib/flow';
import type { LibraryRecipe, WireLine } from '@/lib/types';

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

/** Deep link into a create intake tab (e.g. /?mode=upload). Without a valid
 *  mode the app keeps its default home entry — direct navigation is unchanged. */
function initialViewFromUrl(): AppView {
  if (typeof window === 'undefined') return { name: 'home' };
  const mode = new URLSearchParams(window.location.search).get('mode');
  if (mode === 'paste' || mode === 'form' || mode === 'photo' || mode === 'upload') {
    return { name: 'create', mode };
  }
  return { name: 'home' };
}

export default function Home() {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [guestSessionId, setGuestSessionId] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(readAuthError());
  const [view, setView] = useState<AppView>(initialViewFromUrl);
  /** D-22 (D6): transient confirmation after a confirmed recipe delete. */
  const [homeNotice, setHomeNotice] = useState<string | null>(null);
  /** D-22 (D2): the canonical account library (persisted DB rows, never
   *  browser state). null = not loaded / no account (guests keep their
   *  session-local surface). */
  const [library, setLibrary] = useState<LibraryRecipe[] | null>(null);
  /** Top-bar search routes to the Library with this pre-seeded query. */
  const [libraryQuery, setLibraryQuery] = useState('');
  /** The workspace section tab — lifted so the shell's workspace nav can
   *  drive it (Ingredients / Method / Shopping list). */
  const [workspaceTab, setWorkspaceTab] = useState<'ingredients' | 'method' | 'shopping'>(
    'ingredients',
  );
  /** A workspace section request from the shell (tabs, analysis, cook mode).
   *  The counter makes repeat requests of the same section observable. */
  const [sectionRequest, setSectionRequest] = useState<{ section: WorkspaceSection; n: number } | null>(
    null,
  );

  const handleWorkspaceSection = useCallback((section: WorkspaceSection) => {
    if (section === 'ingredients' || section === 'method' || section === 'shopping') {
      setWorkspaceTab(section);
    }
    setSectionRequest({ section, n: Date.now() });
  }, []);

  /** Quick actions — open the most recent recipe at its real shopping/cook
   *  surface; with an empty library, route to the Library to pick one. */
  const openMostRecentAt = useCallback(
    (section: 'shopping' | 'cook') => {
      const latest = library?.[0];
      if (latest) {
        if (section === 'shopping') setWorkspaceTab('shopping');
        setSectionRequest({ section, n: Date.now() });
        setView({ name: 'workspace', recipeId: latest.recipe_id, initialTitle: latest.name });
      } else {
        setView({ name: 'library' });
      }
    },
    [library],
  );

  const loadLibrary = useCallback(() => {
    api<{ recipes: LibraryRecipe[] }>('/recipes')
      .then((result) => setLibrary(result.recipes))
      .catch(() => setLibrary([]));
  }, []);

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
        loadLibrary();
      })
      .catch(() => !cancelled && setState({ phase: 'anonymous' }));
    return () => {
      cancelled = true;
    };
  }, [loadLibrary]);

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
    setLibrary(null);
    setState({ phase: 'anonymous' });
  }, []);

  /** RS-US: any 401 from an authed call means the BFF session expired (the API
   *  answers UNAUTHENTICATED / SESSION_EXPIRED). Show ONE re-sign-in prompt
   *  rather than leaving every button on the page silently failing.
   *
   *  Armed ONLY while signed in. The anonymous bootstrap calls GET /auth/me on
   *  purpose and takes a 401 by design; a handler registered for the app's whole
   *  life latched the flag on FIRST VISIT, so the "session expired" prompt appeared
   *  the moment the visitor entered a guest session. A guest has no session to
   *  expire, so the prompt is meaningless there — and leaving this phase clears a
   *  stale flag on sign-out. */
  const [sessionExpired, setSessionExpired] = useState(false);
  useEffect(() => {
    if (state.phase !== 'signed-in') {
      setSessionExpired(false);
      return;
    }
    setSessionExpiredHandler(() => setSessionExpired(true));
    return () => setSessionExpiredHandler(null);
  }, [state.phase]);

  if (state.phase === 'loading') {
    return <LoadingScreen label="Checking your session" />;
  }

  if (state.phase === 'anonymous') {
    return (
      <AppShell
        user={null}
        view={{ name: 'landing' }}
        onNavigate={(target) => {
          // The landing rail disables login-gated items; anything else that
          // lands here (e.g. the mobile New recipe CTA) routes to sign-in.
          if (target.name !== 'landing' && target.name !== 'home') startLogin();
        }}
        onSignOut={() => undefined}
      >
        {state.error && (
          <div className="mb-6">
            <div className="rounded-md border border-negative/40 bg-negative/10 px-4 py-3">
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
      </AppShell>
    );
  }

  const user = state.phase === 'signed-in' ? state.user : null;

  return (
    <>
    <AppShell
      user={user}
      view={view}
      onNavigate={setView}
      onSignOut={() => void signOut()}
      onSearch={(query) => {
        setLibraryQuery(query);
        setView({ name: 'library' });
      }}
      workspaceSections={
        view.name === 'workspace'
          ? { active: workspaceTab, onSelect: handleWorkspaceSection }
          : undefined
      }
    >
      {view.name === 'home' && (
        <HomeView
          signedIn={state.phase === 'signed-in'}
          accountId={user?.id ?? null}
          userName={greetName(user)}
          library={user ? library : null}
          notice={homeNotice}
          onCreate={(mode) => setView({ name: 'create', mode })}
          onOpenRecipe={(recipeId, lines, title) =>
            setView({ name: 'workspace', recipeId, initialLines: lines ?? null, initialTitle: title })
          }
          onOpenLibrary={(filter) => setView({ name: 'library', filter })}
          onOpenHousehold={() => setView({ name: 'household' })}
          onCreateShoppingList={() => openMostRecentAt('shopping')}
          onEnterCookMode={() => openMostRecentAt('cook')}
          onSignUp={startSignup}
        />
      )}
      {view.name === 'library' && (
        <LibraryView
          library={user ? library : null}
          initialQuery={libraryQuery}
          initialFilter={view.filter}
          onBack={() => {
            setView({ name: 'home' });
            setLibraryQuery('');
          }}
          onOpenRecipe={(recipeId, lines, title) =>
            setView({ name: 'workspace', recipeId, initialLines: lines ?? null, initialTitle: title })
          }
          onBulkUpload={() => setView({ name: 'create', mode: 'upload' })}
        />
      )}
      {view.name === 'create' && (
        <CreateView
          signedIn={state.phase === 'signed-in'}
          accountId={user?.id ?? null}
          initialMode={view.mode}
          onBack={() => setView({ name: 'home' })}
          onParsed={(recipeId, lines, servings, servingsEstimated) =>
            setView({
              name: 'workspace',
              recipeId,
              initialLines: lines,
              initialServings: servings ?? null,
              initialServingsEstimated: servingsEstimated ?? false,
            })
          }
          onUploaded={(recipeId, lines, title, servings, servingsEstimated) =>
            setView({
              name: 'workspace',
              recipeId,
              initialLines: lines,
              initialTitle: title ?? undefined,
              initialServings: servings ?? null,
              initialServingsEstimated: servingsEstimated ?? false,
            })
          }
          onOpenDraftReview={(ingestionId, originalFilename) =>
            setView({ name: 'draft-review', ingestionId, originalFilename })
          }
        />
      )}
      {view.name === 'draft-review' && (
        <DocumentDraftReview
          ingestionId={view.ingestionId}
          originalFilename={view.originalFilename}
          onBack={() => setView({ name: 'create', mode: 'upload' })}
          onConfirmed={(recipeId, title) => {
            loadLibrary(); // the new recipe shows in the Library immediately
            setView({
              name: 'workspace',
              recipeId,
              initialTitle: title ?? undefined,
              // A brand-new recipe has no analysis and no shopping list — tell
              // the workspace so it skips the doomed discovery GETs (no 404).
              initialAnalysisHint: 'none',
              initialHasShoppingList: false,
            });
          }}
        />
      )}
      {view.name === 'household' && (
        <HouseholdView
          signedIn={state.phase === 'signed-in'}
          onBack={() => setView({ name: 'home' })}
          onSignUp={startSignup}
        />
      )}
      {view.name === 'workspace' && (
        <RecipeWorkspace
          recipeId={view.recipeId}
          signedIn={state.phase === 'signed-in'}
          initialTitle={view.initialTitle}
          initialServings={view.initialServings}
          initialServingsEstimated={view.initialServingsEstimated}
          tab={workspaceTab}
          onTabChange={setWorkspaceTab}
          sectionRequest={sectionRequest}
          initialAnalysisHint={
            view.initialAnalysisHint ??
            (!user || library === null
              ? 'unknown'
              : library.some((r) => r.recipe_id === view.recipeId && r.has_analysis === true)
                ? 'present'
                : 'none')
          }
          initialHasShoppingList={
            view.initialHasShoppingList ??
            (!user || library === null
              ? null
              : (library.find((r) => r.recipe_id === view.recipeId)?.has_shopping_list ?? null))
          }
          onDeleted={() => {
            setView({ name: 'home' });
            setHomeNotice('Recipe deleted.');
            loadLibrary();
          }}
          onBack={() => {
            setView({ name: 'home' });
            loadLibrary(); // the saved title/family shows on the library rows
          }}
          initialLines={view.initialLines}
          preferredMode={user?.preferred_mode === 'chef' ? 'chef' : 'home'}
        />
      )}
      {state.phase === 'guest' && guestSessionId && (
        <p className="sr-only">Guest session {guestSessionId.slice(0, 8)}</p>
      )}
    </AppShell>
      {/* RS-US: the single re-sign-in prompt for an expired session. Rendered
          over the current view, which stays intact behind it. */}
      <SessionExpiredModal
        open={sessionExpired}
        onDismiss={() => setSessionExpired(false)}
      />
    </>
  );
}
