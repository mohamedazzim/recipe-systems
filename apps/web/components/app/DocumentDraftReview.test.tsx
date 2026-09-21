import { render, screen } from '@testing-library/react';
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
        quantity: '500 g',
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
  created_at: '2026-09-21T00:00:00.000Z',
  updated_at: '2026-09-21T00:00:00.000Z',
};

function props(overrides: Partial<Parameters<typeof DocumentDraftReview>[0]> = {}) {
  return {
    ingestionId: 'ing-1',
    originalFilename: 'recipe.txt',
    onBack: jest.fn(),
    ...overrides,
  };
}

describe('DocumentDraftReview — Phase 3 draft inspection', () => {
  beforeEach(() => {
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ drafts: [draft] }),
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('shows the extracted title, ingredients, method, and source excerpts', async () => {
    render(<DocumentDraftReview {...props()} />);
    expect(await screen.findByText('Chicken Biryani')).toBeInTheDocument();
    expect(screen.getByText('chicken · 500 g · g')).toBeInTheDocument();
    expect(screen.getByText('Cook the chicken.')).toBeInTheDocument();
    expect(screen.getAllByText(/Source: “/).length).toBeGreaterThanOrEqual(2);
  });

  it('marks ambiguous ingredients for review', async () => {
    render(<DocumentDraftReview {...props()} />);
    expect(await screen.findAllByText('Needs review')).not.toHaveLength(0);
  });

  it('shows the back action', async () => {
    const p = props();
    render(<DocumentDraftReview {...p} />);
    (await screen.findByRole('button', { name: /Back to upload/ })).click();
    expect(p.onBack).toHaveBeenCalled();
  });

  it('states that nothing has been saved as a recipe yet', async () => {
    render(<DocumentDraftReview {...props()} />);
    expect(await screen.findByText(/nothing has been saved as a recipe yet/i)).toBeInTheDocument();
  });
});
