import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CookSection } from '@/components/app/CookSection';
import { api, ApiError } from '@/lib/api';
import type { CookLog, LastCook } from '@/lib/types';

jest.mock('@/lib/api', () => ({
  api: jest.fn(),
  ApiError: class ApiError extends Error {
    constructor(
      public readonly status: number,
      public readonly code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));

const LAST_COOK: LastCook = { last_cooked_at: '2026-09-12', rating: 4, next_time: null };
const LOG: CookLog = {
  cook_log_id: 'log-1',
  recipe_id: 'r1',
  cook_date: '2026-09-12',
  rating: 4,
  note: '2 green chillies, fenugreek powder off heat',
  next_time: null,
  created_at: '2026-09-12T10:00:00.000Z',
};

function mockLoad(last: LastCook = LAST_COOK, items: CookLog[] = [LOG]) {
  (api as jest.Mock).mockImplementation(async (path: string) => {
    if (path.endsWith('/last-cook')) return last;
    if (path.endsWith('/cook-logs')) return { items };
    throw new Error(`unexpected GET ${path}`);
  });
}

describe('CookSection (D-24 F1/F2/F6)', () => {
  beforeEach(() => {
    (api as jest.Mock).mockReset();
    mockLoad();
  });

  it('renders the cook UI and the F6 reopen recall: last cooked date + rating + the F2 note', async () => {
    render(<CookSection recipeId="r1" />);
    expect(screen.getByRole('heading', { name: 'Cook log' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'I cooked this' })).toBeInTheDocument();
    await waitFor(() => expect(api).toHaveBeenCalledWith('/recipes/r1/last-cook'));
    expect(await screen.findByTestId('last-cook-recall')).toHaveTextContent('Last cooked');
    expect(screen.getByTestId('last-cook-recall')).toHaveTextContent('Rating 4/5');
    expect(screen.getByText(/2 green chillies, fenugreek powder off heat/)).toBeInTheDocument();
  });

  it('reload/reopen preserves state: the recall is hydrated from the BFF, never browser state', async () => {
    const { unmount } = render(<CookSection recipeId="r1" />);
    await waitFor(() => expect(screen.getByTestId('last-cook-recall')).toBeInTheDocument());
    unmount();
    (api as jest.Mock).mockClear();
    render(<CookSection recipeId="r1" />);
    await waitFor(() => expect(api).toHaveBeenCalledWith('/recipes/r1/last-cook'));
    expect(await screen.findByTestId('last-cook-recall')).toHaveTextContent('Rating 4/5');
  });

  it('save posts the canonical body and refreshes the surface (F1/F2 happy path)', async () => {
    render(<CookSection recipeId="r1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'I cooked this' }));
    await userEvent.type(screen.getByLabelText('Note'), '  fish held  ');
    await userEvent.selectOptions(screen.getByLabelText('Rating'), '4');
    (api as jest.Mock).mockResolvedValueOnce(LOG);
    await userEvent.click(screen.getByRole('button', { name: 'Save cook log' }));
    await waitFor(() => {
      const post = (api as jest.Mock).mock.calls.find(
        ([path, init]: [string, RequestInit]) => path === '/recipes/r1/cook-logs' && init?.method === 'POST',
      );
      expect(post).toBeTruthy();
      expect(JSON.parse((post as [string, RequestInit])[1].body as string)).toEqual({
        cook_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        rating: 4,
        note: 'fish held',
        next_time: null,
      });
    });
  });

  it('date defaults to today and is editable (F1 AC-1)', async () => {
    render(<CookSection recipeId="r1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'I cooked this' }));
    const dateInput = screen.getByLabelText('Cooked on') as HTMLInputElement;
    const today = new Date();
    const expected = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    expect(dateInput.value).toBe(expected);
    await userEvent.clear(dateInput);
    await userEvent.type(dateInput, '2026-09-01');
    (api as jest.Mock).mockResolvedValueOnce(LOG);
    await userEvent.click(screen.getByRole('button', { name: 'Save cook log' }));
    await waitFor(() => {
      const post = (api as jest.Mock).mock.calls.find(
        ([path, init]: [string, RequestInit]) => path === '/recipes/r1/cook-logs' && init?.method === 'POST',
      );
      expect(post).toBeTruthy();
      expect(JSON.parse((post as [string, RequestInit])[1].body as string)).toEqual({
        cook_date: '2026-09-01',
        rating: null,
        note: null,
        next_time: null,
      });
    });
  });

  it('rating and note are both optional (F2 AC-2)', async () => {
    render(<CookSection recipeId="r1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'I cooked this' }));
    (api as jest.Mock).mockResolvedValueOnce({ ...LOG, rating: null, note: null });
    await userEvent.click(screen.getByRole('button', { name: 'Save cook log' }));
    await waitFor(() => {
      const post = (api as jest.Mock).mock.calls.find(
        ([path, init]: [string, RequestInit]) => path === '/recipes/r1/cook-logs' && init?.method === 'POST',
      );
      expect(post).toBeTruthy();
      expect(JSON.parse((post as [string, RequestInit])[1].body as string)).toEqual(
        expect.objectContaining({ rating: null, note: null }),
      );
    });
  });

  it('a rejected save surfaces the honest error and keeps the form open (validation errors surface)', async () => {
    render(<CookSection recipeId="r1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'I cooked this' }));
    (api as jest.Mock).mockRejectedValueOnce(
      new ApiError(400, 'INVALID_COOK_LOG', 'rating must be a whole number 1–5 (or omitted)'),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save cook log' }));
    expect(await screen.findByText(/rating must be a whole number/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save cook log' })).toBeInTheDocument();
  });

  it('a 404 means no logs yet — the surface stays empty without an error (guests/reopen included)', async () => {
    (api as jest.Mock).mockRejectedValue(new ApiError(404, 'RECIPE_NOT_FOUND', 'Recipe not found'));
    render(<CookSection recipeId="r1" />);
    expect(await screen.findByRole('button', { name: 'I cooked this' })).toBeInTheDocument();
    expect(screen.queryByTestId('last-cook-recall')).not.toBeInTheDocument();
    expect(screen.queryByText(/Recipe not found/)).not.toBeInTheDocument();
  });

  it('lists the kept history when the recipe was cooked more than once (F1 AC-2)', async () => {
    mockLoad(LAST_COOK, [
      LOG,
      { ...LOG, cook_log_id: 'log-2', cook_date: '2026-09-01', rating: null, note: null },
    ]);
    render(<CookSection recipeId="r1" />);
    expect(await screen.findByText('Cook history')).toBeInTheDocument();
    expect(screen.getAllByText((content) => content.includes('2 green chillies')).length).toBeGreaterThan(0);
  });

  it('surfaces the next-time line when present (F6 AC-1 — written later by F4/D-26)', async () => {
    mockLoad({ last_cooked_at: '2026-09-12', rating: 4, next_time: 'Less chilli next time' });
    render(<CookSection recipeId="r1" />);
    expect(await screen.findByText('Next time: Less chilli next time')).toBeInTheDocument();
  });
});
