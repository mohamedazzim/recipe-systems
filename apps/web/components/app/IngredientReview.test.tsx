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
    return { recipeId: 'r1', signedIn: true, title: 'Meen Kuzhambu', initialLines: null, ...overrides };
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

  it('regression: add line → appears → delete → disappears, no error (204 contract)', async () => {
    const created = line({ id: 'l-new', display_name: 'New ingredient' });
    const afterAdd = [...LINES, created];
    const afterDelete = LINES;
    const mock = globalThis.fetch as jest.Mock;

    mock.mockResolvedValueOnce(listResponse(LINES)); // initial load
    mock.mockResolvedValueOnce(okResponse(created)); // POST add → 201 created line
    mock.mockResolvedValueOnce(listResponse(afterAdd)); // refresh after add
    mock.mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: jest.fn().mockRejectedValue(new SyntaxError('Unexpected end of JSON input')),
    }); // DELETE → 204, empty body
    mock.mockResolvedValue(listResponse(afterDelete)); // refresh after delete

    render(<IngredientReview {...props()} />);
    await screen.findByText('Fish — 500g');

    await userEvent.click(screen.getByRole('button', { name: 'Add line' }));
    expect(await screen.findByText('New ingredient')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Delete New ingredient' }));
    expect(await screen.findByText('Fish — 500g')).toBeInTheDocument();
    expect(screen.queryByText('New ingredient')).not.toBeInTheDocument();
    expect(screen.queryByText('Could not remove the line.')).not.toBeInTheDocument();
    expect(screen.queryByText('Something needs attention')).not.toBeInTheDocument();

    const delCalls = mock.mock.calls.filter((c) => {
      const [url, init] = c as [string, RequestInit];
      return url.includes('/lines/l-new') && init.method === 'DELETE';
    });
    expect(delCalls.length).toBe(1);
    expect((delCalls[0] as [string, RequestInit])[1].body).toBeUndefined();
  });

  it('delete failure surfaces the real API message', async () => {
    const mock = globalThis.fetch as jest.Mock;
    mock.mockResolvedValueOnce(listResponse(LINES));
    mock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: { code: 'RECIPE_NOT_FOUND', message: 'Recipe not found' } }),
    });
    render(<IngredientReview {...props()} />);
    await screen.findByText('Fish — 500g');
    await userEvent.click(screen.getByRole('button', { name: 'Delete Fish — 500g' }));
    expect(await screen.findByText('Recipe not found')).toBeInTheDocument();
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

  it('guest: renders the parse-text lines read-only and NEVER fetches Bearer-only GET /lines', async () => {
    render(<IngredientReview {...props({ signedIn: false, initialLines: LINES })} />);
    expect(await screen.findByText('Fenugreek seeds 1 tsp')).toBeInTheDocument();
    expect(screen.getByText('Fenugreek leaves, a handful')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Fish — 500g' })).not.toBeInTheDocument();
    expect(screen.getByText(/viewing these lines as a guest/i)).toBeInTheDocument();
    // The guest path must never hit the API (the 401-loop regression).
    expect((globalThis.fetch as jest.Mock).mock.calls.length).toBe(0);
  });

  it('deduplicates repeated line records by id before rendering', () => {
    const duplicate = { ...LINES[0] };
    render(<IngredientReview {...props({ initialLines: [LINES[0], duplicate] })} />);
    expect(screen.getAllByText(LINES[0].display_name)).toHaveLength(1);
  });

  it('RECIPE_NOT_FOUND (cross-session recipe) shows the ownership state, not a raw error', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: { code: 'RECIPE_NOT_FOUND', message: 'Recipe not found' } }),
    });
    render(<IngredientReview {...props({ initialLines: null })} />);
    expect(await screen.findByText('This recipe belongs to a different session')).toBeInTheDocument();
    expect(screen.getByText(/created in a guest session/)).toBeInTheDocument();
    expect(screen.queryByText('Loading ingredients...')).not.toBeInTheDocument();
  });

  it('failed load shows the error with a retry instead of an endless spinner', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Sign in required' } }),
    });
    render(<IngredientReview {...props({ initialLines: null })} />);
    expect(await screen.findByText('Could not load the ingredient lines')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByText('Loading ingredients...')).not.toBeInTheDocument();
  });
});

describe('IngredientReview (D-25 B6 — canonical + confirmation)', () => {
  beforeEach(() => {
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function props(overrides: Partial<Parameters<typeof IngredientReview>[0]> = {}) {
    return { recipeId: 'r1', signedIn: true, title: 'Meen Kuzhambu', initialLines: null, ...overrides };
  }

  it('renders the canonical chip when the backend resolves a line', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      listResponse([line({ canonical_name: 'fish_fillet' })]),
    );
    render(<IngredientReview {...props()} />);
    expect(await screen.findByText('fish fillet')).toBeInTheDocument();
    expect(screen.queryByText(/We read/)).not.toBeInTheDocument();
  });

  it('shows a confirmation prompt only when requires_confirmation and not yet confirmed', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      listResponse([
        line({
          id: 'drumstick',
          display_name: 'Drumstick 1 Nos',
          canonical_name: 'drumstick',
          requires_confirmation: true,
        }),
      ]),
    );
    render(<IngredientReview {...props()} />);
    expect(await screen.findByText(/We read/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
  });

  it('accepting records confirmed_sense = canonical and never rewrites display_name', async () => {
    const target = line({
      id: 'drumstick',
      display_name: 'Drumstick 1 Nos',
      canonical_name: 'drumstick',
      requires_confirmation: true,
    });
    (globalThis.fetch as jest.Mock).mockResolvedValue(listResponse([target]));
    render(<IngredientReview {...props()} />);
    await screen.findByText(/We read/);

    (globalThis.fetch as jest.Mock).mockResolvedValueOnce(okResponse(target));
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      listResponse([{ ...target, confirmed_sense: 'drumstick' }]),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Accept' }));

    const patchCalls = (globalThis.fetch as jest.Mock).mock.calls.filter((c) => {
      const [url, init] = c as [string, RequestInit];
      return url.includes('/lines/drumstick') && init.method === 'PATCH';
    });
    expect(patchCalls.length).toBeGreaterThanOrEqual(1);
    const body = JSON.parse((patchCalls[0] as [string, RequestInit])[1].body as string);
    expect(body.confirmed_sense).toBe('drumstick');
    expect(body).not.toHaveProperty('display_name');
    expect(body.expected_updated_at).toBe('2026-09-09T10:00:00.000Z');
  });

  it('hides the confirmation prompt once confirmed_sense is set', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      listResponse([
        line({
          id: 'drumstick',
          display_name: 'Drumstick 1 Nos',
          canonical_name: 'drumstick',
          requires_confirmation: true,
          confirmed_sense: 'drumstick',
        }),
      ]),
    );
    render(<IngredientReview {...props()} />);
    expect(await screen.findByText('drumstick')).toBeInTheDocument();
    expect(screen.queryByText(/We read/)).not.toBeInTheDocument();
  });

  it('keeps the two fenugreek lines distinct by their distinct canonical names', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      listResponse([
        line({ id: 'fen-seed', display_name: 'Fenugreek seeds 1 tsp', canonical_name: 'fenugreek_seed' }),
        line({ id: 'fen-powder', display_name: 'Fenugreek powder ½ tsp', canonical_name: 'fenugreek_powder' }),
      ]),
    );
    render(<IngredientReview {...props()} />);
    expect(await screen.findByText('fenugreek seed')).toBeInTheDocument();
    expect(screen.getByText('fenugreek powder')).toBeInTheDocument();
    expect(screen.getByText('Fenugreek seeds 1 tsp')).toBeInTheDocument();
    expect(screen.getByText('Fenugreek powder ½ tsp')).toBeInTheDocument();
  });
});
