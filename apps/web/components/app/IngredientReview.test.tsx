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

  async function openActions(name: string) {
    await userEvent.click(screen.getByRole('button', { name: `Ingredient actions for ${name}` }));
  }

  async function clickAction(name: string, label: string) {
    await openActions(name);
    await userEvent.click(screen.getByRole('menuitem', { name: label }));
  }

  it('renders the lines with amounts and keeps the two fenugreek lines distinct', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(listResponse(LINES));
    render(<IngredientReview {...props()} />);
    expect(await screen.findByText('Fenugreek seeds 1 tsp')).toBeInTheDocument();
    expect(screen.getByText('Fenugreek leaves, a handful')).toBeInTheDocument();
    expect(screen.getByText('500g')).toBeInTheDocument();
    expect(screen.getByText(/3 ingredients/)).toBeInTheDocument();
  });

  it('flags review-required lines', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      listResponse([line({ needs_review: true, display_name: 'Chilli — 5 Nos' })]),
    );
    render(<IngredientReview {...props()} />);
    expect(await screen.findByText('Review required')).toBeInTheDocument();
    await openActions('Chilli — 5 Nos');
    expect(screen.getByRole('menuitem', { name: 'Clear review' })).toBeInTheDocument();
  });

  it('shows fast-access Edit / Clear review / Delete on each row, plus the kebab for the rest', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      listResponse([line({ needs_review: true })]),
    );
    render(<IngredientReview {...props()} />);
    await screen.findByText('Fish — 500g');

    // fast-access buttons sit on the row, outside the kebab
    expect(screen.getByRole('button', { name: 'Edit Fish — 500g' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear review for Fish — 500g' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Fish — 500g' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ingredient actions for Fish — 500g' })).toBeInTheDocument();

    // the kebab still holds the full action set
    await openActions('Fish — 500g');
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Mark as header' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Split line' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Merge with next' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Clear review' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();
  });

  it('persistent Edit button opens the inline editor directly', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(listResponse(LINES));
    render(<IngredientReview {...props()} />);
    await screen.findByText('Fish — 500g');

    await userEvent.click(screen.getByRole('button', { name: 'Edit Fish — 500g' }));
    expect(screen.getByLabelText('Display name')).toBeInTheDocument();
  });

  it('persistent Delete button removes the line (204 contract)', async () => {
    const mock = globalThis.fetch as jest.Mock;
    mock.mockResolvedValueOnce(listResponse(LINES)); // initial load
    mock.mockResolvedValueOnce({ ok: true, status: 204, json: async () => ({}) }); // DELETE
    mock.mockResolvedValue(listResponse(LINES.slice(1))); // refresh

    render(<IngredientReview {...props()} />);
    await screen.findByText('Fish — 500g');

    await userEvent.click(screen.getByRole('button', { name: 'Delete Fish — 500g' }));
    expect(await screen.findByText('Fenugreek seeds 1 tsp')).toBeInTheDocument();
    expect(screen.queryByText('Fish — 500g')).not.toBeInTheDocument();

    const deleteCalls = mock.mock.calls.filter((c) => {
      const [url, init] = c as [string, RequestInit];
      return url.includes('/lines/l1') && init.method === 'DELETE';
    });
    expect(deleteCalls.length).toBe(1);
  });

  it('persistent Clear review sends needs_review false', async () => {
    const mock = globalThis.fetch as jest.Mock;
    mock.mockResolvedValueOnce(listResponse([line({ needs_review: true })])); // initial load
    mock.mockResolvedValueOnce(okResponse({})); // PATCH
    mock.mockResolvedValue(listResponse([line({ needs_review: false })])); // refresh

    render(<IngredientReview {...props()} />);
    await screen.findByText('Fish — 500g');

    await userEvent.click(screen.getByRole('button', { name: 'Clear review for Fish — 500g' }));

    const patchCalls = mock.mock.calls.filter((c) => {
      const [url, init] = c as [string, RequestInit];
      return url.includes('/lines/l1') && init.method === 'PATCH';
    });
    const body = JSON.parse((patchCalls[0] as [string, RequestInit])[1].body as string);
    expect(body.needs_review).toBe(false);
  });

  it('D-11: shows OCR confidence and visibly marks a low-confidence line', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      listResponse([
        line({ display_name: 'Fish - 500g', ocr_confidence: 0.98 }),
        line({ id: 'l2', line_no: 2, display_name: 'Fenugreek Powder - 1/2 Tsp', ocr_confidence: 0.45, needs_review: true }),
      ]),
    );
    render(<IngredientReview {...props()} />);
    expect(await screen.findByText('Fish - 500g')).toBeInTheDocument();
    expect(screen.getByText('98% confident')).toBeInTheDocument();
    // low confidence is visibly marked: the confidence chip + the review flag
    expect(screen.getByText('45% confident')).toBeInTheDocument();
    expect(screen.getByText('Review required')).toBeInTheDocument();
  });

  it('D-11: shows the source provenance tag for card-derived lines', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      listResponse([line({ display_name: 'Fish - 500g', source_tag: 'CARD', ocr_confidence: 0.98 })]),
    );
    render(<IngredientReview {...props()} />);
    expect(await screen.findByText('Fish - 500g')).toBeInTheDocument();
    expect(screen.getByText('from card')).toBeInTheDocument();
  });

  it('edit saves with the stale-edit token (expected_updated_at)', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(listResponse(LINES));
    render(<IngredientReview {...props()} />);
    await screen.findByText('Fish — 500g');

    (globalThis.fetch as jest.Mock).mockResolvedValueOnce(okResponse(line()));
    (globalThis.fetch as jest.Mock).mockResolvedValue(listResponse(LINES));

    await clickAction('Fish — 500g', 'Edit');
    await userEvent.clear(screen.getByLabelText('Display name'));
    await userEvent.type(screen.getByLabelText('Display name'), 'Fish fillet 500g');
    await userEvent.click(screen.getByRole('button', { name: 'Save ingredient' }));

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

    await clickAction('Fish — 500g', 'Split line');
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

    await clickAction('Fish — 500g', 'Merge with next');

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

    await userEvent.click(screen.getByRole('button', { name: 'Add ingredient' }));
    expect(await screen.findByText('New ingredient')).toBeInTheDocument();

    await clickAction('New ingredient', 'Delete');
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

  it('Add ingredient does not mark the analysis stale until Save ingredient', async () => {
    const created = line({ id: 'l-new', display_name: 'New ingredient' });
    const afterAdd = [...LINES, created];
    const onChanged = jest.fn();
    const mock = globalThis.fetch as jest.Mock;

    mock.mockResolvedValueOnce(listResponse(LINES)); // initial load
    mock.mockResolvedValueOnce(okResponse(created)); // POST add
    mock.mockResolvedValue(listResponse(afterAdd)); // refresh + added re-fetch

    render(<IngredientReview {...props({ onChanged })} />);
    await screen.findByText('Fish — 500g');

    await userEvent.click(screen.getByRole('button', { name: 'Add ingredient' }));
    expect(await screen.findByLabelText('Display name')).toHaveValue('New ingredient');
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('fires onChanged after a user mutation (never on load)', async () => {
    const onChanged = jest.fn();
    const mock = globalThis.fetch as jest.Mock;
    mock.mockResolvedValueOnce(listResponse(LINES)); // initial load
    mock.mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: jest.fn().mockRejectedValue(new SyntaxError('Unexpected end of JSON input')),
    }); // DELETE
    mock.mockResolvedValue(listResponse(LINES.slice(1))); // refresh

    render(<IngredientReview {...props({ onChanged })} />);
    await screen.findByText('Fish — 500g');
    // loading/hydrating must never be treated as a user change
    expect(onChanged).not.toHaveBeenCalled();

    await clickAction('Fish — 500g', 'Delete');
    expect(onChanged).toHaveBeenCalledTimes(1);
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
    await clickAction('Fish — 500g', 'Delete');
    expect(await screen.findByText('Recipe not found')).toBeInTheDocument();
  });

  it('clear review sends needs_review false literal only', async () => {
    const flagged = line({ needs_review: true });
    (globalThis.fetch as jest.Mock).mockResolvedValueOnce(listResponse([flagged]));
    (globalThis.fetch as jest.Mock).mockResolvedValue(listResponse([line()]));

    render(<IngredientReview {...props()} />);
    await screen.findByText('Review required');
    await clickAction('Fish — 500g', 'Clear review');

    const clearCalls = (globalThis.fetch as jest.Mock).mock.calls.filter((c) => {
      const [url, init] = c as [string, RequestInit];
      return url.includes('/lines/l1') && init.method === 'PATCH';
    });
    const body = JSON.parse((clearCalls[0] as [string, RequestInit])[1].body as string);
    expect(body.needs_review).toBe(false);
    expect(body.expected_updated_at).toBe('2026-09-09T10:00:00.000Z');
  });

  it('D-1: marks a line as header via the existing is_header PATCH path', async () => {
    const mock = globalThis.fetch as jest.Mock;
    mock.mockResolvedValueOnce(listResponse(LINES)); // initial load
    mock.mockResolvedValueOnce(okResponse(line())); // PATCH mark-as-header
    mock.mockResolvedValue(listResponse(LINES)); // refresh

    render(<IngredientReview {...props()} />);
    await screen.findByText('Fish — 500g');
    await clickAction('Fish — 500g', 'Mark as header');

    const patchCalls = mock.mock.calls.filter((c) => {
      const [url, init] = c as [string, RequestInit];
      return url.includes('/lines/l1') && init.method === 'PATCH';
    });
    const body = JSON.parse((patchCalls[0] as [string, RequestInit])[1].body as string);
    expect(body.is_header).toBe(true);
    expect(body.expected_updated_at).toBe('2026-09-09T10:00:00.000Z');
  });

  it('D-1: renders header lines in a distinct section and restores via is_header false', async () => {
    const header = line({ id: 'h1', line_no: 1, display_name: 'Kanyakumari Fish Curry', is_header: true, amount: null });
    const mock = globalThis.fetch as jest.Mock;
    mock.mockResolvedValueOnce(listResponse([header, ...LINES])); // initial load
    mock.mockResolvedValueOnce(okResponse(line({ id: 'h1', is_header: false }))); // PATCH restore
    mock.mockResolvedValue(listResponse(LINES)); // refresh

    render(<IngredientReview {...props()} />);
    expect(await screen.findByText('Kanyakumari Fish Curry')).toBeInTheDocument();
    expect(screen.getByText(/Header lines — excluded from ingredients, shopping and print/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Kanyakumari Fish Curry' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Restore Kanyakumari Fish Curry as ingredient' }));
    const patchCalls = mock.mock.calls.filter((c) => {
      const [url, init] = c as [string, RequestInit];
      return url.includes('/lines/h1') && init.method === 'PATCH';
    });
    const body = JSON.parse((patchCalls[0] as [string, RequestInit])[1].body as string);
    expect(body.is_header).toBe(false);
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

    await clickAction('Fish — 500g', 'Edit');
    await userEvent.click(screen.getByRole('button', { name: 'Save ingredient' }));
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
