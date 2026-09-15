import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SwapSection } from '@/components/app/SwapSection';
import { api, ApiError } from '@/lib/api';
import type { WireLine } from '@/lib/types';

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

const LOG = {
  cook_log_id: 'log-1',
  recipe_id: 'r1',
  cook_date: '2026-09-15',
  rating: 4,
  note: null,
  next_time: null,
  created_at: '2026-09-15T10:00:00.000Z',
};

const LINES: WireLine[] = [
  {
    id: 'line-1',
    line_no: 1,
    display_name: 'Chilli — 5 Nos',
    amount: '5 Nos',
    unit: null,
    quantity: null,
    category: null,
    confirmed_sense: null,
    include_on_list: true,
    is_header: false,
    needs_review: false,
    ocr_confidence: null,
    source_tag: null,
    updated_at: '2026-09-15T08:00:00.000Z',
  },
];

function mockLogs(items = [LOG]) {
  (api as jest.Mock).mockImplementation(async (path: string) => {
    if (path === '/recipes/r1/cook-logs') return { items };
    throw new Error(`unexpected ${path}`);
  });
}

describe('SwapSection (D-26 F3/H5)', () => {
  beforeEach(() => {
    (api as jest.Mock).mockReset();
    mockLogs();
  });

  it('asks to log a cook first when there is no cook log', async () => {
    mockLogs([]);
    render(<SwapSection recipeId="r1" lines={LINES} onApplied={jest.fn()} />);
    expect(await screen.findByText(/Log a cook first/)).toBeInTheDocument();
  });

  it('records a swap against the latest cook log without touching the card', async () => {
    render(<SwapSection recipeId="r1" lines={LINES} onApplied={jest.fn()} />);
    await screen.findByLabelText('Ingredient line');
    await userEvent.selectOptions(screen.getByLabelText('Ingredient line'), 'line-1');
    await userEvent.selectOptions(screen.getByLabelText('Swap action'), 'reduced');
    await userEvent.type(screen.getByLabelText('Swapped to'), '3 Nos');
    await userEvent.selectOptions(screen.getByLabelText('Swap reason'), 'restriction');
    (api as jest.Mock).mockResolvedValueOnce({
      swap_id: 's1',
      cook_log_id: 'log-1',
      line_id: 'line-1',
      ingredient_name_snapshot: 'Chilli — 5 Nos',
      action: 'reduced',
      swapped_to: '3 Nos',
      reason: 'restriction',
      applied_to_card: false,
      created_at: '2026-09-15T11:00:00.000Z',
    });
    await userEvent.click(screen.getByRole('button', { name: 'Record swap' }));
    await waitFor(() => {
      expect(api).toHaveBeenCalledWith(
        '/cook-logs/log-1/swaps',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            line_id: 'line-1',
            action: 'reduced',
            swapped_to: '3 Nos',
            reason: 'restriction',
            applied_to_card: false,
          }),
        }),
      );
    });
    expect(await screen.findByText(/reduced/)).toBeInTheDocument();
    expect(screen.getAllByText(/restriction/).length).toBeGreaterThan(0);
    expect(screen.getByText(/card unchanged/)).toBeInTheDocument();
  });

  it('applied swaps trigger the line reload (Intake-routed)', async () => {
    const onApplied = jest.fn();
    render(<SwapSection recipeId="r1" lines={LINES} onApplied={onApplied} />);
    await screen.findByLabelText('Ingredient line');
    await userEvent.selectOptions(screen.getByLabelText('Ingredient line'), 'line-1');
    await userEvent.selectOptions(screen.getByLabelText('Swap action'), 'swapped');
    await userEvent.type(screen.getByLabelText('Swapped to'), '3 Nos');
    await userEvent.click(screen.getByLabelText('Apply to card'));
    (api as jest.Mock).mockResolvedValueOnce({
      swap_id: 's2',
      cook_log_id: 'log-1',
      line_id: 'line-1',
      ingredient_name_snapshot: 'Chilli — 5 Nos',
      action: 'swapped',
      swapped_to: '3 Nos',
      reason: 'pantry',
      applied_to_card: true,
      created_at: '2026-09-15T11:00:00.000Z',
    });
    await userEvent.click(screen.getByRole('button', { name: 'Record swap' }));
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
  });

  it('a rejected record surfaces the honest error', async () => {
    render(<SwapSection recipeId="r1" lines={LINES} onApplied={jest.fn()} />);
    await screen.findByLabelText('Ingredient line');
    (api as jest.Mock).mockRejectedValueOnce(
      new ApiError(400, 'INVALID_SWAP', 'applied reduced/increased/swapped requires swapped_to'),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Record swap' }));
    expect(await screen.findByText(/requires swapped_to/)).toBeInTheDocument();
  });
});
