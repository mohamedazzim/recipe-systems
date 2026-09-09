import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateView } from '@/components/app/CreateView';

describe('CreateView (paste intake)', () => {
  beforeEach(() => {
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn();
    window.localStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function props(overrides: Partial<Parameters<typeof CreateView>[0]> = {}) {
    return { signedIn: true, onBack: jest.fn(), onParsed: jest.fn(), ...overrides };
  }

  it('photo capture is present but clearly disabled (coming soon)', () => {
    render(<CreateView {...props()} />);
    expect(screen.getByText('Photo capture')).toBeInTheDocument();
    expect(screen.getByText('Coming soon.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /photo/i })).not.toBeInTheDocument();
  });

  it('submits the paste and routes to the parsed recipe', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ recipe_id: 'r42', recipe: { raw_text: 'x', lines: [], flags: [] } }),
    });
    const p = props();
    render(<CreateView {...p} />);
    await userEvent.type(screen.getByLabelText('Recipe text'), 'Meen Kuzhambu');
    await userEvent.click(screen.getByRole('button', { name: 'Parse and review' }));

    expect(await screen.findByRole('button', { name: 'Parsing...' })).toBeInTheDocument();
    const [url, init] = (globalThis.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/recipes/parse-text');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ text: 'Meen Kuzhambu' });
    expect(p.onParsed).toHaveBeenCalledWith('r42');
  });

  it('shows the backend error message (no generic fallback)', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { code: 'INVALID_TEXT', message: 'text must be a non-empty string' } }),
    });
    render(<CreateView {...props()} />);
    await userEvent.type(screen.getByLabelText('Recipe text'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Parse and review' }));
    expect(await screen.findByText('text must be a non-empty string')).toBeInTheDocument();
  });

  it('guest note is shown for guests, absent for signed-in', () => {
    const { rerender } = render(<CreateView {...props({ signedIn: false })} />);
    expect(screen.getByText(/As a guest you can paste/)).toBeInTheDocument();
    rerender(<CreateView {...props({ signedIn: true })} />);
    expect(screen.queryByText(/As a guest you can paste/)).not.toBeInTheDocument();
  });
});
