import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HomeView } from '@/components/app/HomeView';
import { recordSessionRecipe } from '@/lib/flow';

describe('HomeView', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  function props(overrides: Partial<Parameters<typeof HomeView>[0]> = {}) {
    return {
      signedIn: true,
      accountId: 'acc-1',
      library: null,
      onCreate: jest.fn(),
      onOpenRecipe: jest.fn(),
      onSignUp: jest.fn(),
      onSignOut: jest.fn(),
      ...overrides,
    };
  }

  it('renders the product heading and the primary create action', () => {
    render(<HomeView {...props()} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Your recipes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create recipe' })).toBeInTheDocument();
  });

  it('shows a helpful empty state when no session recipes exist', () => {
    render(<HomeView {...props({ signedIn: false, accountId: null })} />);
    expect(screen.getByText('No recipes yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Paste your first recipe' })).toBeInTheDocument();
  });

  it('guest: lists session recipes and opens them', async () => {
    recordSessionRecipe('r1', 'Meen Kuzhambu', { kind: 'guest' });
    const p = props({ signedIn: false, accountId: null });
    render(<HomeView {...p} />);
    const row = screen.getByRole('button', { name: /Meen Kuzhambu/ });
    expect(row).toBeInTheDocument();
    await userEvent.click(row);
    expect(p.onOpenRecipe).toHaveBeenCalledWith('r1', null);
  });

  it('guest: shows the secondary claim band, dismissible, never blocking the create action', async () => {
    const p = props({ signedIn: false, accountId: null });
    render(<HomeView {...p} />);
    expect(screen.getByText(/exploring as a guest/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create account and claim' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create recipe' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss the guest notice' }));
    expect(screen.queryByText(/exploring as a guest/i)).not.toBeInTheDocument();
  });

  it('recipes owned by another identity are listed but NOT openable (cross-session 404 regression)', () => {
    recordSessionRecipe('r1', 'Chef paste', { kind: 'user', accountId: 'acc-1' });
    recordSessionRecipe('r2', 'Guest paste', { kind: 'guest' });
    render(<HomeView {...props({ signedIn: false, accountId: null })} />);
    // the guest recipe is the openable row for this guest identity
    expect(screen.getByRole('button', { name: /Guest paste/ })).toBeInTheDocument();
    // the account-owned recipe appears under "Other sessions" and is not a button
    expect(screen.getByText('Other sessions')).toBeInTheDocument();
    expect(screen.getByText('Chef paste')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Chef paste/ })).not.toBeInTheDocument();
    expect(screen.getByText('Created under an account.')).toBeInTheDocument();
  });

  it('guest identity: user-owned recipes go to Other sessions with account copy', () => {
    recordSessionRecipe('r2', 'Chef paste', { kind: 'user', accountId: 'acc-1' });
    render(<HomeView {...props({ signedIn: false, accountId: null })} />);
    expect(screen.queryByRole('button', { name: /Chef paste/ })).not.toBeInTheDocument();
    expect(screen.getByText('Created under an account.')).toBeInTheDocument();
  });

  it('signed in: account section offers sign out', async () => {
    const p = props({ library: [] });
    render(<HomeView {...p} />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(p.onSignOut).toHaveBeenCalled();
  });
});

describe('HomeView — D-22 library (D2)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  function props(overrides: Partial<Parameters<typeof HomeView>[0]> = {}) {
    return {
      signedIn: true,
      accountId: 'acc-1',
      library: [] as Parameters<typeof HomeView>[0]['library'],
      onCreate: jest.fn(),
      onOpenRecipe: jest.fn(),
      onSignUp: jest.fn(),
      onSignOut: jest.fn(),
      ...overrides,
    };
  }

  it('renders canonical library rows (name, date, family, cook indicator) and opens them', async () => {
    const p = props({
      library: [
        {
          recipe_id: 'r1',
          name: 'Coastal Tamil (Kanyakumari) style meen kuzhambu',
          date: '2026-09-10T11:00:00.000Z',
          family: 'Coastal Tamil (Kanyakumari) style meen kuzhambu',
          has_cook_log: true,
          last_cooked_at: '2026-09-12',
        },
        {
          recipe_id: 'r2',
          name: 'Untitled recipe',
          date: '2026-09-09T11:00:00.000Z',
          family: null,
          has_cook_log: false,
          last_cooked_at: null,
        },
      ],
    });
    render(<HomeView {...p} />);
    expect(screen.getByRole('heading', { name: 'Your library' })).toBeInTheDocument();
    const row1 = screen.getByRole('button', { name: /Coastal Tamil/ });
    expect(row1).toBeInTheDocument();
    // D-24 (F1 AC-3): the library row shows the last cooked date.
    expect(screen.getByText((content) => content.startsWith('Cooked '))).toBeInTheDocument();
    expect(screen.getByText(/Family unknown/)).toBeInTheDocument();
    expect(screen.getByText('No cook log yet')).toBeInTheDocument();
    await userEvent.click(row1);
    expect(p.onOpenRecipe).toHaveBeenCalledWith(
      'r1',
      null,
      'Coastal Tamil (Kanyakumari) style meen kuzhambu',
    );
  });

  it('shows the library empty state and never the browser session list for signed-in users', () => {
    recordSessionRecipe('r9', 'Browser-only paste', { kind: 'user', accountId: 'acc-1' });
    render(<HomeView {...props({ library: [] })} />);
    expect(screen.getByText('No saved recipes yet')).toBeInTheDocument();
    expect(screen.queryByText('This session')).not.toBeInTheDocument();
    expect(screen.queryByText('Browser-only paste')).not.toBeInTheDocument();
  });

  it('D6: renders the post-delete confirmation notice', () => {
    render(<HomeView {...props({ library: [], notice: 'Recipe deleted.' })} />);
    expect(screen.getByText('Recipe deleted.')).toBeInTheDocument();
  });
});

describe('HomeView — D-25 D3 library search', () => {
  beforeEach(() => {
    window.localStorage.clear();
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function props(overrides: Partial<Parameters<typeof HomeView>[0]> = {}) {
    return {
      signedIn: true,
      accountId: 'acc-1',
      library: [
        {
          recipe_id: 'r1',
          name: 'Meen Kuzhambu',
          date: '2026-09-10T11:00:00.000Z',
          family: 'Meen Kuzhambu',
          has_cook_log: false,
          last_cooked_at: null,
        },
      ],
      onCreate: jest.fn(),
      onOpenRecipe: jest.fn(),
      onSignUp: jest.fn(),
      onSignOut: jest.fn(),
      ...overrides,
    };
  }

  /** Route fetches by URL fragment. Everything unmatched (the signed-in
   *  ProfileEditor's two mount fetches) fails gracefully so it stays in its
   *  loading state and never crashes the tree. */
  function routeFetch(routes: Record<string, unknown>): void {
    (globalThis.fetch as jest.Mock).mockImplementation(async (url: string) => {
      for (const [fragment, body] of Object.entries(routes)) {
        if (url.includes(fragment)) {
          return { ok: true, status: 200, json: async () => body };
        }
      }
      return {
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'n/a' } }),
      };
    });
  }

  it('sends the query to the account-scoped search endpoint and renders the results', async () => {
    routeFetch({
      '/recipes?q=': {
        recipes: [
          {
            recipe_id: 'r9',
            name: 'Coconut Fish Curry',
            date: '2026-09-09T11:00:00.000Z',
            family: 'Coconut Fish Curry',
            has_cook_log: false,
            last_cooked_at: null,
          },
        ],
      },
    });
    render(<HomeView {...props()} />);
    await userEvent.type(screen.getByLabelText('Search your library'), 'coconut');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));

    const calls = (globalThis.fetch as jest.Mock).mock.calls.filter((c) =>
      (c as [string, RequestInit])[0].includes('/recipes?q='),
    );
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect((calls[0] as [string, RequestInit])[0]).toContain('/recipes?q=coconut');
    expect(await screen.findByText('Coconut Fish Curry')).toBeInTheDocument();
    expect(screen.queryByText('Meen Kuzhambu')).not.toBeInTheDocument();
  });

  it('clearing the search restores the full library', async () => {
    routeFetch({});
    render(<HomeView {...props()} />);
    expect(screen.getByText('Meen Kuzhambu')).toBeInTheDocument();

    routeFetch({ '/recipes?q=': { recipes: [] } });
    await userEvent.type(screen.getByLabelText('Search your library'), 'nope');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('No matches')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('Meen Kuzhambu')).toBeInTheDocument();
    expect(screen.queryByText('No matches')).not.toBeInTheDocument();
  });

  it('renders the no-matches state when the account has no hits', async () => {
    routeFetch({ '/recipes?q=': { recipes: [] } });
    render(<HomeView {...props()} />);
    await userEvent.type(screen.getByLabelText('Search your library'), 'biriyani');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('No matches')).toBeInTheDocument();
  });
});
