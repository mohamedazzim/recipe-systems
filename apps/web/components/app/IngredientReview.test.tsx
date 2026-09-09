import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IngredientReview } from '@/components/app/IngredientReview';
import type { WireLine } from '@/lib/types';

function line(overrides: Partial<WireLine> = {}): WireLine {
  return {
    id: 'l1',
    line_no: 1,
    display_name: 'Fish — 500g',
    amount: '500g',
    unit: null,
    quantity: 500,
    category: null,
    confirmed_sense: null,
    include_on_list: true,
    is_header: false,
    needs_review: false,
    ocr_confidence: null,
    source_tag: 'CARD',
    updated_at: '2026-09-09T10:00:00.000Z',
    ...overrides,
  };
}

const LINES: WireLine[] = [
  line(),
  line({ id: 'l2', line_no: 2, display_name: 'Fenugreek seeds 1 tsp', amount: '1 tsp' }),
  line({ id: 'l3', line_no: 3, display_name: 'Fenugreek leaves, a handful', amount: 'a handful' }),
];

function listResponse(items: WireLine[]) {
  return { ok: true, status: 200, json: async () => ({ items }) };
}
function okResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

describe('IngredientReview (D-12 actions)', () => {
  beforeEach(() => {
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function props(overrides: Partial<Parameters<typeof IngredientReview>[0]> = {}) {
    return { recipeId: 'r1', signedIn: true, title: 'Meen Kuzhambu', ...overrides };
  }

  it('renders the lines with amounts and keeps the two fenugreek lines distinct', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(listResponse(LINES));
    render(<IngredientReview {...props()} />);
    expect(await screen.findByText('Fenugreek seeds 1 tsp')).toBeInTheDocument();
    expect(screen.getByText('Fenugreek leaves, a handful')).toBeInTheDocument();
    expect(screen.getByText('500g')).toBeInTheDocument();
    expect(screen.getByText(/3 lines/)).toBeInTheDocument();
  });

  it('flags review-required lines', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      listResponse([line({ needs_review: true, display_name: 'Chilli — 5 Nos' })]),
    );
    render(<IngredientReview {...props()} />);
    expect(await screen.findByText('Review required')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear review' })).toBeInTheDocument();
  });

  it('edit saves with the stale-edit token (expected_updated_at)', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(listResponse(LINES));
    render(<IngredientReview {...props()} />);
    await screen.findByText('Fish — 500g');

    (globalThis.fetch as jest.Mock).mockResolvedValueOnce(okResponse(line()));
    (globalThis.fetch as jest.Mock).mockResolvedValue(listResponse(LINES));

    await userEvent.click(screen.getByRole('button', { name: 'Edit Fish — 500g' }));
    await userEvent.clear(screen.getByLabelText('Display name'));
    await userEvent.type(screen.getByLabelText('Display name'), 'Fish fillet 500g');
    await userEvent.click(screen.getByRole('button', { name: 'Save line' }));

    const patchCalls = (globalThis.fetch as jest.Mock).mock.calls.filter((c) => {
      const [url, init] = c as [string, RequestInit];
      return url.includes('/lines/l1') && init.method === 'PATCH';
    });
    expect(patchCalls.length).toBeGreaterThanOrEqual(1);
    const body = JSON.parse((patchCalls[0] as [string, RequestInit])[1].body as string);
    expect(body.display_name).toBe('Fish fillet 500g');
    expect(body.expected_updated_at).toBe('2026-09-09T10:00:00.000Z');
  });

  it('split posts the character position', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(listResponse(LINES));
    render(<IngredientReview {...props()} />);
    await screen.findByText('Fish — 500g');

    (globalThis.fetch as jest.Mock).mockResolvedValueOnce(okResponse({ lines: [line(), line()] }));
    (globalThis.fetch as jest.Mock).mockResolvedValue(listResponse(LINES));

    await userEvent.click(screen.getByRole('button', { name: 'Split Fish — 500g' }));
    await userEvent.type(screen.getByLabelText('Split after character'), '4');
    await userEvent.click(screen.getByRole('button', { name: 'Split line' }));

    const splitCalls = (globalThis.fetch as jest.Mock).mock.calls.filter((c) => {
      const [url, init] = c as [string, RequestInit];
      return url.includes('/lines/l1/split') && init.method === 'POST';
    });
    expect(JSON.parse((splitCalls[0] as [string, RequestInit])[1].body as string).split_point).toBe(4);
  });

  it('merge sends merge_with_next alone', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(listResponse(LINES));
    render(<IngredientReview {...props()} />);
    await screen.findByText('Fish — 500g');

    (globalThis.fetch as jest.Mock).mockResolvedValueOnce(okResponse(line()));
    (globalThis.fetch as jest.Mock).mockResolvedValue(listResponse(LINES));

    await userEvent.click(
      screen.getByRole('button', { name: 'Merge Fish — 500g with the next line' }),
    );

    const mergeCalls = (globalThis.fetch as jest.Mock).mock.calls.filter((c) => {
      const [url, init] = c as [string, RequestInit];
      return url.includes('/lines/l1') && init.method === 'PATCH';
    });
    const body = JSON.parse((mergeCalls[0] as [string, RequestInit])[1].body as string);
    expect(body).toEqual({ merge_with_next: true, expected_updated_at: '2026-09-09T10:00:00.000Z' });
  });

  it('clear review sends needs_review false literal only', async () => {
    const flagged = line({ needs_review: true });
    (globalThis.fetch as jest.Mock).mockResolvedValueOnce(listResponse([flagged]));
    (globalThis.fetch as jest.Mock).mockResolvedValue(listResponse([line()]));

    render(<IngredientReview {...props()} />);
    await screen.findByText('Review required');
    await userEvent.click(screen.getByRole('button', { name: 'Clear review' }));

    const clearCalls = (globalThis.fetch as jest.Mock).mock.calls.filter((c) => {
      const [url, init] = c as [string, RequestInit];
      return url.includes('/lines/l1') && init.method === 'PATCH';
    });
    const body = JSON.parse((clearCalls[0] as [string, RequestInit])[1].body as string);
    expect(body.needs_review).toBe(false);
    expect(body.expected_updated_at).toBe('2026-09-09T10:00:00.000Z');
  });

  it('stale-edit 409 reloads the list and explains', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(listResponse(LINES));
    render(<IngredientReview {...props()} />);
    await screen.findByText('Fish — 500g');

    (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: { code: 'STALE_EDIT', message: 'Line changed' } }),
    });
    (globalThis.fetch as jest.Mock).mockResolvedValue(listResponse(LINES));

    await userEvent.click(screen.getByRole('button', { name: 'Edit Fish — 500g' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save line' }));
    expect(await screen.findByText(/changed elsewhere/)).toBeInTheDocument();
  });

  it('guest: read-only rows, no action buttons, honest note', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(listResponse(LINES));
    render(<IngredientReview {...props({ signedIn: false })} />);
    expect(await screen.findByText('Fenugreek seeds 1 tsp')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Fish — 500g' })).not.toBeInTheDocument();
    expect(screen.getByText(/viewing these lines as a guest/i)).toBeInTheDocument();
  });
});
