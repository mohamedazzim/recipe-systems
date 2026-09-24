// D-30 (Track S) — ShoppingSection component tests (mocked fetch; no network).
// Covers: empty state → generate, grouped rendering (five groups, canonical
// order), two distinct fenugreek rows, have/need toggle → PATCH, regenerate
// preserving state, the Q2 allergen line visibility, error surfacing.

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShoppingSection } from './ShoppingSection';
import type { ShoppingList } from '@/lib/types';

const LIST: ShoppingList = {
  generation_id: 'gen-1',
  recipe_id: 'recipe-1',
  layout: 'grouped',
  generated_at: '2026-09-11T10:00:00.000Z',
  allergen_line: 'Contains: Fish, Mustard. Notes: Fish species unknown.',
  groups: [
    {
      name: 'fish/meat',
      items: [
        {
          shopping_key: 'key-fish', display_name: 'Fish — 500g', display_quantity: '500g',
          unit: 'g', group_name: 'fish/meat', state: 'need', position: 1,
        },
      ],
    },
    {
      name: 'fresh produce',
      items: [
        {
          shopping_key: 'key-mango', display_name: 'Mango — 1/2 Nos', display_quantity: '1/2 Nos',
          unit: null, group_name: 'fresh produce', state: 'need', position: 2,
        },
      ],
    },
    {
      name: 'spices',
      items: [
        {
          shopping_key: 'key-fen-powder', display_name: 'Fenugreek Powder — 1/2 Tsp',
          display_quantity: '1/2 Tsp', unit: null, group_name: 'spices', state: 'need', position: 3,
        },
        {
          shopping_key: 'key-fen-seed', display_name: 'Fenugreek — 1/4 Tsp',
          display_quantity: '1/4 Tsp', unit: null, group_name: 'spices', state: 'need', position: 4,
        },
      ],
    },
    {
      name: 'fats/oils',
      items: [
        {
          shopping_key: 'key-oil', display_name: 'Coconut Oil — For Tempering',
          display_quantity: 'For Tempering', unit: null, group_name: 'fats/oils', state: 'need', position: 5,
        },
      ],
    },
  ],
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

beforeEach(() => {
  (globalThis as unknown as { fetch: unknown }).fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

function fetchMock() {
  return globalThis.fetch as jest.Mock;
}

describe('ShoppingSection (D-30)', () => {
  it('shows the generate action when no list exists (404 SHOPPING_LIST_NOT_FOUND)', async () => {
    fetchMock().mockResolvedValue(
      jsonResponse({ error: { code: 'SHOPPING_LIST_NOT_FOUND', message: 'nope' } }, 404),
    );
    render(<ShoppingSection recipeId="recipe-1" />);
    expect(await screen.findByRole('button', { name: 'Generate shopping list' })).toBeInTheDocument();
  });

  it('skipInitialLoad renders the empty state without a doomed 404 GET', async () => {
    render(<ShoppingSection recipeId="recipe-1" skipInitialLoad />);
    expect(await screen.findByRole('button', { name: 'Generate shopping list' })).toBeInTheDocument();
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it('onGenerated fires after a successful generation (workspace drops the skip flag)', async () => {
    fetchMock().mockResolvedValue(jsonResponse(LIST));
    const onGenerated = jest.fn();
    render(<ShoppingSection recipeId="recipe-1" skipInitialLoad onGenerated={onGenerated} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Generate shopping list' }));
    expect(onGenerated).toHaveBeenCalled();
  });

  it('renders the grouped list: five-group names, two distinct fenugreeks, qualifiers, allergen line', async () => {
    fetchMock().mockResolvedValue(jsonResponse(LIST));
    render(<ShoppingSection recipeId="recipe-1" />);
    expect(await screen.findByText(/Fish — 500g/)).toBeInTheDocument();
    expect(screen.getByTestId('shopping-group-fish/meat')).toBeInTheDocument();
    expect(screen.getByTestId('shopping-group-fresh produce')).toBeInTheDocument();
    expect(screen.getByTestId('shopping-group-spices')).toBeInTheDocument();
    expect(screen.getByTestId('shopping-group-fats/oils')).toBeInTheDocument();
    // Two fenugreek rows, distinct keys → distinct buttons.
    expect(screen.getByText(/Fenugreek Powder — 1\/2 Tsp/)).toBeInTheDocument();
    expect(screen.getByText(/Fenugreek — 1\/4 Tsp/)).toBeInTheDocument();
    expect(screen.getByText(/Coconut Oil — For Tempering/)).toBeInTheDocument(); // qualifier visible
    expect(screen.getByText(/Contains: Fish, Mustard/)).toBeInTheDocument(); // Q2 Option A snapshot
  });

  it('shows the amount ONCE when the display name already carries it (no doubling)', async () => {
    // display_name is the verbatim card line ("Fish — 500g") and display_quantity is
    // that same extracted amount, so concatenating both printed "Fish — 500g — 500g".
    fetchMock().mockResolvedValue(jsonResponse(LIST));
    render(<ShoppingSection recipeId="recipe-1" />);
    expect(await screen.findByText('Fish — 500g')).toBeInTheDocument();
    expect(screen.queryByText('Fish — 500g — 500g')).not.toBeInTheDocument();
  });

  it('toggles have/need through the PATCH endpoint and strikes the row', async () => {
    fetchMock().mockImplementation((_url: string, init?: RequestInit) => {
      if (!init || init.method === 'GET') return Promise.resolve(jsonResponse(LIST));
      if (init.method === 'PATCH') {
        return Promise.resolve(jsonResponse({ shopping_key: 'key-fish', state: 'have' }));
      }
      return Promise.resolve(jsonResponse(LIST));
    });
    render(<ShoppingSection recipeId="recipe-1" />);
    await screen.findByText(/Fish — 500g/);
    await userEvent.click(screen.getByRole('button', { name: 'Mark Fish — 500g as have' }));
    expect(await screen.findByRole('button', { name: 'Mark Fish — 500g as need' })).toBeInTheDocument();
    const patch = fetchMock().mock.calls.find((c: unknown[]) => (c[1] as RequestInit).method === 'PATCH');
    expect(patch).toBeTruthy();
    expect(JSON.parse((patch![1] as RequestInit).body as string)).toEqual({
      shopping_key: 'key-fish',
      state: 'have',
    });
  });

  it('regenerates through POST and keeps the existing rows visible', async () => {
    fetchMock().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.resolve(jsonResponse(LIST));
      return Promise.resolve(jsonResponse(LIST));
    });
    render(<ShoppingSection recipeId="recipe-1" />);
    await screen.findByText(/Fish — 500g/);
    await userEvent.click(screen.getByRole('button', { name: 'Regenerate list' }));
    await waitFor(() =>
      expect(
        fetchMock().mock.calls.some((c: unknown[]) => (c[1] as RequestInit).method === 'POST'),
      ).toBe(true),
    );
    expect(screen.getByText(/Fish — 500g/)).toBeInTheDocument();
  });

  it('renders an empty generation honestly (no groups, no rows)', async () => {
    fetchMock().mockResolvedValue(jsonResponse({ ...LIST, groups: [], allergen_line: null }));
    render(<ShoppingSection recipeId="recipe-1" />);
    expect(await screen.findByText(/0 rows/)).toBeInTheDocument();
    expect(screen.queryByText('Allergen line:')).not.toBeInTheDocument();
  });

  it('surfaces generation errors', async () => {
    fetchMock().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Promise.resolve(
          jsonResponse({ error: { code: 'RECIPE_NOT_FOUND', message: 'Recipe not found' } }, 404),
        );
      }
      return Promise.resolve(jsonResponse({ error: { code: 'SHOPPING_LIST_NOT_FOUND', message: 'nope' } }, 404));
    });
    render(<ShoppingSection recipeId="recipe-1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Generate shopping list' }));
    expect(await screen.findByText('Recipe not found')).toBeInTheDocument();
  });

  it('Print list opens the snapshot PDF from the print endpoint (D-23 E4)', async () => {
    const viewer = { location: { href: '' }, close: jest.fn() };
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => viewer as never);
    const createUrl = jest.fn(() => 'blob:print');
    URL.createObjectURL = createUrl as never;
    fetchMock().mockImplementation((_url: string, init?: RequestInit) => {
      if (!init || !init.method || init.method === 'GET') {
        if (_url.includes('/print/shopping-list')) {
          return Promise.resolve({ ok: true, status: 200, blob: async () => new Blob(['%PDF']) });
        }
        return Promise.resolve(jsonResponse(LIST));
      }
      return Promise.resolve(jsonResponse(LIST));
    });
    render(<ShoppingSection recipeId="recipe-1" />);
    await screen.findByText(/Fish — 500g/);
    await userEvent.click(screen.getByRole('button', { name: 'Print list' }));
    await waitFor(() => expect(openSpy).toHaveBeenCalledWith('', '_blank'));
    // The viewer tab is opened synchronously in the click gesture (popup-safe)
    // and navigated to the PDF blob once it is ready.
    await waitFor(() => expect(viewer.location.href).toBe('blob:print'));
    expect(viewer.close).not.toHaveBeenCalled();
    const printCall = fetchMock().mock.calls.find((c: unknown[]) =>
      String(c[0]).includes('/print/shopping-list'),
    );
    expect(printCall).toBeTruthy();
    openSpy.mockRestore();
    delete (URL as unknown as Record<string, unknown>).createObjectURL;
  });
});
