import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReadinessPanel } from '@/components/app/ReadinessPanel';

describe('ReadinessPanel (D-14 + D-17 launch)', () => {
  beforeEach(() => {
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function props(overrides: Partial<Parameters<typeof ReadinessPanel>[0]> = {}) {
    return { recipeId: 'r1', signedIn: true, onAnalysed: jest.fn(), ...overrides };
  }

  it('ready state: enables the Analyse action', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ can_enqueue: true, blockers: [] }),
    });
    render(<ReadinessPanel {...props()} />);
    expect(await screen.findByText('Ready to analyse. All lines are confirmed.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analyse recipe' })).toBeEnabled();
  });

  it('blocked state: disables Analyse and lists the canonical blockers', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        can_enqueue: false,
        blockers: [
          { line_id: 'l9', display_name: 'Chilli — 5 Nos' },
          { line_id: 'l4', display_name: 'Curry leaves' },
        ],
      }),
    });
    render(<ReadinessPanel {...props()} />);
    expect(await screen.findByText('2 lines need your attention before analysis can begin.')).toBeInTheDocument();
    expect(screen.getByText('Chilli — 5 Nos')).toBeInTheDocument();
    expect(screen.getByText('Curry leaves')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analyse recipe' })).toBeDisabled();
    expect(screen.getByText('Blocked by the lines above.')).toBeInTheDocument();
  });

  it('successful enqueue routes to the analysis', async () => {
    (globalThis.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ can_enqueue: true, blockers: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ analysis_id: 'a-1', status: 'queued', prompt_version: 'v2' }),
      });
    const p = props();
    render(<ReadinessPanel {...p} />);
    await screen.findByText(/Ready to analyse/);
    await userEvent.click(screen.getByRole('button', { name: 'Analyse recipe' }));
    expect(p.onAnalysed).toHaveBeenCalledWith('a-1');
    const enqueue = (globalThis.fetch as jest.Mock).mock.calls[1] as [string, RequestInit];
    expect(enqueue[0]).toContain('/recipes/r1/analyse');
    expect(JSON.parse(enqueue[1].body as string)).toEqual({ mode: 'home' });
  });

  it('422 METHOD_REQUIRED explains the real consequence', async () => {
    (globalThis.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ can_enqueue: true, blockers: [] }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: async () => ({
          error: { code: 'METHOD_REQUIRED', message: 'method required' },
        }),
      });
    render(<ReadinessPanel {...props()} />);
    await screen.findByText(/Ready to analyse/);
    await userEvent.click(screen.getByRole('button', { name: 'Analyse recipe' }));
    expect(await screen.findByText(/Add a method first/)).toBeInTheDocument();
  });

  it('guest: no readiness call, honest account note', async () => {
    render(<ReadinessPanel {...props({ signedIn: false })} />);
    expect(await screen.findByText(/Analysis needs an account/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Analyse recipe' })).not.toBeInTheDocument();
    expect((globalThis.fetch as jest.Mock).mock.calls.length).toBe(0);
  });
});
