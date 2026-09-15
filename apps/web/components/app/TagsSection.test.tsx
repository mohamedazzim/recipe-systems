import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TagsSection } from '@/components/app/TagsSection';

function tagsResponse(tags: string[]) {
  return { ok: true, status: 200, json: async () => ({ tags }) };
}

describe('TagsSection (D-25 D3 — display, add, remove)', () => {
  beforeEach(() => {
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders existing tags and hides the surface for guests', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(tagsResponse(['comfort food', 'weeknight']));
    const { rerender } = render(<TagsSection recipeId="r1" signedIn />);
    expect(await screen.findByText('comfort food')).toBeInTheDocument();
    expect(screen.getByText('weeknight')).toBeInTheDocument();

    rerender(<TagsSection recipeId="r1" signedIn={false} />);
    expect(screen.queryByText('comfort food')).not.toBeInTheDocument();
    // guests must never hit the Bearer-only endpoint
    expect((globalThis.fetch as jest.Mock).mock.calls.length).toBe(1);
  });

  it('adds a tag by PUT-ing the wholesale tag set', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(tagsResponse(['weeknight']));
    render(<TagsSection recipeId="r1" signedIn />);
    await screen.findByText('weeknight');

    (globalThis.fetch as jest.Mock).mockResolvedValueOnce(tagsResponse(['weeknight', 'curry']));

    await userEvent.type(screen.getByLabelText('Add tag'), 'curry');
    await userEvent.click(screen.getByRole('button', { name: 'Add tag' }));

    const putCalls = (globalThis.fetch as jest.Mock).mock.calls.filter((c) => {
      const [url, init] = c as [string, RequestInit];
      return url.includes('/recipes/r1/tags') && init.method === 'PUT';
    });
    expect(putCalls.length).toBeGreaterThanOrEqual(1);
    expect(JSON.parse((putCalls[0] as [string, RequestInit])[1].body as string)).toEqual({
      tags: ['weeknight', 'curry'],
    });
    expect(await screen.findByText('curry')).toBeInTheDocument();
  });

  it('removes a tag and never sends an empty-string tag', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(tagsResponse(['comfort food', 'weeknight']));
    render(<TagsSection recipeId="r1" signedIn />);
    await screen.findByText('comfort food');

    (globalThis.fetch as jest.Mock).mockResolvedValueOnce(tagsResponse(['weeknight']));

    await userEvent.click(screen.getByRole('button', { name: 'Remove tag comfort food' }));

    const putCalls = (globalThis.fetch as jest.Mock).mock.calls.filter((c) => {
      const [url, init] = c as [string, RequestInit];
      return url.includes('/recipes/r1/tags') && init.method === 'PUT';
    });
    expect(JSON.parse((putCalls[0] as [string, RequestInit])[1].body as string)).toEqual({
      tags: ['weeknight'],
    });
  });

  it('surfaces an error when the tags route fails', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Sign in required' } }),
    });
    render(<TagsSection recipeId="r1" signedIn />);
    expect(await screen.findByText('Sign in required')).toBeInTheDocument();
  });
});
