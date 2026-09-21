import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LibraryView } from '@/components/app/LibraryView';
import type { LibraryRecipe } from '@/lib/types';

function props(overrides: Partial<Parameters<typeof LibraryView>[0]> = {}) {
  return {
    library: [] as LibraryRecipe[],
    onBack: jest.fn(),
    onOpenRecipe: jest.fn(),
    onBulkUpload: jest.fn(),
    ...overrides,
  };
}

describe('LibraryView — D-22 library (D2)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

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
    render(<LibraryView {...p} />);
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

  it('shows the library empty state', () => {
    render(<LibraryView {...props({ library: [] })} />);
    expect(screen.getByText('No saved recipes yet')).toBeInTheDocument();
  });

  it('back returns to home', async () => {
    const p = props();
    render(<LibraryView {...p} />);
    await userEvent.click(screen.getByRole('button', { name: /Back to home/ }));
    expect(p.onBack).toHaveBeenCalled();
  });

  it('routes to Add Recipe with Upload selected via the bulk upload action', async () => {
    const p = props();
    render(<LibraryView {...p} />);
    await userEvent.click(screen.getByRole('button', { name: 'Bulk upload recipes' }));
    expect(p.onBulkUpload).toHaveBeenCalled();
  });
});

describe('LibraryView — D-25 D3 library search', () => {
  beforeEach(() => {
    window.localStorage.clear();
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function searchProps() {
    return props({
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
    });
  }

  /** Route fetches by URL fragment; unmatched requests fail gracefully. */
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
    render(<LibraryView {...searchProps()} />);
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
    render(<LibraryView {...searchProps()} />);
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
    render(<LibraryView {...searchProps()} />);
    await userEvent.type(screen.getByLabelText('Search your library'), 'biriyani');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('No matches')).toBeInTheDocument();
  });
});
