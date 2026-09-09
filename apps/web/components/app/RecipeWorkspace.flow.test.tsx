// Regression: the authenticated paste flow (the reported bug). An
// authenticated user pastes (CreateView → parse-text) and lands on the
// workspace: the ingredient rows must appear immediately from the parse
// response AND the Bearer-only refresh must succeed with the same recipe id.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecipeWorkspace } from '@/components/app/RecipeWorkspace';
import type { WireLine } from '@/lib/types';

jest.mock('@/components/app/MethodSection', () => ({
  MethodSection: () => <p>Method section</p>,
}));
jest.mock('@/components/app/ReadinessPanel', () => ({
  ReadinessPanel: () => <p>Readiness section</p>,
}));
jest.mock('@/components/app/AnalysisPanel', () => ({
  AnalysisPanel: () => <p>Status section</p>,
}));

const LINES: WireLine[] = [
  {
    id: 'line-1',
    line_no: 1,
    display_name: '1 lb ground beef',
    amount: '1 lb',
    unit: null,
    quantity: null,
    category: null,
    confirmed_sense: null,
    include_on_list: true,
    is_header: false,
    needs_review: false,
    ocr_confidence: null,
    source_tag: 'CARD',
    updated_at: '2026-09-09T10:00:00.000Z',
  },
];

describe('authenticated paste → workspace → ingredient lines (reported-bug regression)', () => {
  beforeEach(() => {
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn();
    window.localStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the parse-text lines immediately and refreshes with the SAME recipe id', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items: LINES }),
    });

    // The workspace receives the parse response (recipe_id + lines) exactly as
    // CreateView.onParsed hands them over after POST /recipes/parse-text.
    render(
      <RecipeWorkspace
        recipeId="r-persisted"
        signedIn={true}
        onBack={jest.fn()}
        initialLines={LINES}
      />,
    );

    // Immediate first paint from the parse response: no loading spinner.
    expect(screen.getByText('1 lb ground beef')).toBeInTheDocument();

    // The refresh targets the exact id the parse response returned.
    const calls = (globalThis.fetch as jest.Mock).mock.calls as Array<[string, RequestInit]>;
    expect(calls.some(([url]) => url.includes('/recipes/r-persisted/lines'))).toBe(true);
  });

  it('edits reach the persisted recipe id with the stale-edit token', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items: LINES }),
    });
    render(
      <RecipeWorkspace recipeId="r-persisted" signedIn={true} onBack={jest.fn()} initialLines={LINES} />,
    );
    await screen.findByText('1 lb ground beef');

    await userEvent.click(screen.getByRole('button', { name: 'Edit 1 lb ground beef' }));
    await userEvent.clear(screen.getByLabelText('Display name'));
    await userEvent.type(screen.getByLabelText('Display name'), '1 lb ground beef (85/15)');
    await userEvent.click(screen.getByRole('button', { name: 'Save line' }));

    const patch = (globalThis.fetch as jest.Mock).mock.calls.find((c) => {
      const [url, init] = c as [string, RequestInit];
      return url.includes('/recipes/r-persisted/lines/line-1') && init.method === 'PATCH';
    });
    expect(patch).toBeTruthy();
    expect(JSON.parse((patch as [string, RequestInit])[1].body as string).display_name).toBe(
      '1 lb ground beef (85/15)',
    );
  });
});
