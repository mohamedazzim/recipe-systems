import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DocumentDraftReview } from '@/components/app/DocumentDraftReview';
import type { DocumentDraft } from '@/lib/types';

const draft: DocumentDraft = {
  draft_id: 'draft-1',
  draft_index: 0,
  title: 'Chicken Biryani',
  title_needs_review: false,
  needs_review: true,
  payload: {
    title: 'Chicken Biryani',
    title_needs_review: false,
    ingredients: [
      {
        name: 'chicken',
        quantity: '500',
        unit: 'g',
        preparation: null,
        source: '500 g chicken',
        needs_review: false,
      },
      {
        name: 'onions',
        quantity: null,
        unit: null,
        preparation: null,
        source: 'onions',
        needs_review: true,
      },
    ],
    method_steps: [
      { text: 'Cook the chicken.', source: 'Cook the chicken.', needs_review: false },
    ],
    needs_review: true,
    notes: ['onions: no quantity in the source'],
  },
  user_payload: null,
  status: 'draft',
  recipe_id: null,
  confirmed_at: null,
  created_at: '2026-09-21T00:00:00.000Z',
  updated_at: '2026-09-21T00:00:00.000Z',
};

function props(overrides: Partial<Parameters<typeof DocumentDraftReview>[0]> = {}) {
  return {
    ingestionId: 'ing-1',
    originalFilename: 'recipe.txt',
    onBack: jest.fn(),
    onConfirmed: jest.fn(),
    ...overrides,
  };
}

function okJson(body: unknown, status = 200) {
  return { ok: true, status, json: async () => body };
}

describe('DocumentDraftReview — Phase 4 editable draft', () => {
  beforeEach(() => {
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn().mockImplementation(
      async (url: string, init?: RequestInit) => {
        const u = String(url);
        if (init?.method === 'PATCH' && u.endsWith('/drafts/draft-1')) {
          return okJson({ ...draft, user_payload: JSON.parse(String(init.body)) });
        }
        if (init?.method === 'POST' && u.endsWith('/confirm')) {
          return okJson({ recipe_id: 'recipe-1', status: 'confirmed' });
        }
        return okJson({ drafts: [draft] });
      },
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('shows the editable title, ingredients, method, and source excerpts', async () => {
    render(<DocumentDraftReview {...props()} />);
    expect(await screen.findByLabelText('Recipe title')).toHaveValue('Chicken Biryani');
    expect(screen.getByLabelText('Ingredient name 1')).toHaveValue('chicken');
    expect(screen.getByLabelText('Ingredient quantity 1')).toHaveValue('500');
    expect(screen.getByLabelText('Method step 1')).toHaveValue('Cook the chicken.');
    expect(screen.getAllByText(/Source: “/).length).toBeGreaterThanOrEqual(2);
  });

  it('flags ambiguous items and disables Create recipe until resolved', async () => {
    render(<DocumentDraftReview {...props()} />);
    await screen.findByLabelText('Recipe title');
    expect(screen.getAllByText('Needs review')).not.toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Create recipe' })).toBeDisabled();

    // Resolve the ambiguous "onions" ingredient by giving it a quantity.
    fireEvent.change(screen.getByLabelText('Ingredient quantity 2'), { target: { value: '2' } });
    expect(screen.getByRole('button', { name: 'Create recipe' })).toBeEnabled();
  });

  it('marks edited rows as corrected and user-added rows as added', async () => {
    render(<DocumentDraftReview {...props()} />);
    await screen.findByLabelText('Recipe title');
    expect(screen.getAllByText('From source').length).toBeGreaterThanOrEqual(1);

    fireEvent.change(screen.getByLabelText('Ingredient name 1'), { target: { value: 'red chicken' } });
    expect(screen.getByText('Corrected')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Add ingredient/ }));
    expect(screen.getByText('Added')).toBeInTheDocument();
  });

  it('saves edits through PATCH and shows the saved confirmation', async () => {
    render(<DocumentDraftReview {...props()} />);
    await screen.findByLabelText('Recipe title');
    fireEvent.change(screen.getByLabelText('Recipe title'), { target: { value: 'Spicy Biryani' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument());
    const patchCall = (globalThis.fetch as jest.Mock).mock.calls.find(
      ([, init]: [string, RequestInit]) => init?.method === 'PATCH',
    );
    expect(patchCall).toBeTruthy();
    const body = JSON.parse(String(patchCall[1].body));
    expect(body.title).toBe('Spicy Biryani');
  });

  it('persists edits then confirms, navigating to the created recipe', async () => {
    const p = props();
    render(<DocumentDraftReview {...p} />);
    await screen.findByLabelText('Recipe title');
    // resolve the ambiguous ingredient first
    fireEvent.change(screen.getByLabelText('Ingredient quantity 2'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Recipe title'), { target: { value: 'Spicy Biryani' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create recipe' }));
    await waitFor(() => expect(p.onConfirmed).toHaveBeenCalledWith('recipe-1', 'Spicy Biryani'));

    const methods = (globalThis.fetch as jest.Mock).mock.calls.map(([url, init]: [string, RequestInit]) => init?.method);
    expect(methods).toContain('PATCH');
    expect(methods).toContain('POST');
  });

  it('shows the back action', async () => {
    const p = props();
    render(<DocumentDraftReview {...p} />);
    (await screen.findByRole('button', { name: /Back to upload/ })).click();
    expect(p.onBack).toHaveBeenCalled();
  });
});

describe('DocumentDraftReview — confirmed draft', () => {
  it('shows the Open recipe action for an already-confirmed draft', async () => {
    const confirmed: DocumentDraft = {
      ...draft,
      status: 'confirmed',
      recipe_id: 'recipe-1',
      confirmed_at: '2026-09-21T01:00:00.000Z',
      user_payload: {
        title: 'Spicy Biryani',
        title_needs_review: false,
        ingredients: [],
        method_steps: [],
      },
    };
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn().mockResolvedValue(
      okJson({ drafts: [confirmed] }),
    );
    const p = props();
    render(<DocumentDraftReview {...p} />);
    const open = await screen.findByRole('button', { name: /Open recipe/ });
    open.click();
    expect(p.onConfirmed).toHaveBeenCalledWith('recipe-1', 'Spicy Biryani');
  });
});