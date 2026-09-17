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
    return {
      recipeId: 'r1',
      signedIn: true,
      lines: [],
      onAnalyse: jest.fn(async () => undefined),
      analysing: false,
      error: null,
      hasAnalysis: false,
      stale: false,
      ...overrides,
    };
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

  it('clicking Analyse delegates to the workspace-owned action', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ can_enqueue: true, blockers: [] }),
    });
    const p = props();
    render(<ReadinessPanel {...p} />);
    await screen.findByText(/Ready to analyse/);
    await userEvent.click(screen.getByRole('button', { name: 'Analyse recipe' }));
    expect(p.onAnalyse).toHaveBeenCalledTimes(1);
  });

  it('surfaces the workspace analyse error (e.g. METHOD_REQUIRED)', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ can_enqueue: true, blockers: [] }),
    });
    render(
      <ReadinessPanel
        {...props({ error: 'Add a method first. Without one, the analysis would be list-only.' })}
      />,
    );
    await screen.findByText(/Ready to analyse/);
    expect(await screen.findByText(/Add a method first/)).toBeInTheDocument();
  });

  it('stale analysis shows "Re-analyze recipe" + the changes-need-analysis notice', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ can_enqueue: true, blockers: [] }),
    });
    render(<ReadinessPanel {...props({ hasAnalysis: true, stale: true })} />);
    await screen.findByText(/Ready to analyse/);
    expect(screen.getByRole('button', { name: 'Re-analyze recipe' })).toBeEnabled();
    expect(screen.getByText('Changes need analysis')).toBeInTheDocument();
  });

  it('current analysis: renders nothing (the status panel owns the result)', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ can_enqueue: true, blockers: [] }),
    });
    const { container } = render(<ReadinessPanel {...props({ hasAnalysis: true, stale: false })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('in-flight shows "Starting analysis…" and disables the button', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ can_enqueue: true, blockers: [] }),
    });
    render(<ReadinessPanel {...props({ analysing: true })} />);
    await screen.findByText(/Ready to analyse/);
    const button = screen.getByRole('button', { name: 'Starting analysis…' });
    expect(button).toBeDisabled();
  });

  it('guest: no readiness call, honest account note', async () => {
    render(<ReadinessPanel {...props({ signedIn: false })} />);
    expect(await screen.findByText(/Analysis needs an account/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Analyse recipe' })).not.toBeInTheDocument();
    expect((globalThis.fetch as jest.Mock).mock.calls.length).toBe(0);
  });

  it('re-fetches readiness when the lines change (QA-B7: Clear review unblocks without reload)', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ can_enqueue: true, blockers: [] }),
    });
    const p = props();
    const { rerender } = render(<ReadinessPanel {...p} />);
    await screen.findByText(/Ready to analyse/);
    const callsBefore = (globalThis.fetch as jest.Mock).mock.calls.length;

    rerender(
      <ReadinessPanel
        {...p}
        lines={[
          {
            id: 'l1',
            line_no: 1,
            display_name: 'Salt',
            amount: null,
            unit: null,
            quantity: null,
            category: null,
            confirmed_sense: null,
            include_on_list: true,
            is_header: false,
            needs_review: false,
            ocr_confidence: null,
            source_tag: 'CARD',
            updated_at: new Date().toISOString(),
          },
        ]}
      />,
    );
    await screen.findByText(/Ready to analyse/);
    expect((globalThis.fetch as jest.Mock).mock.calls.length).toBeGreaterThan(callsBefore);
  });
});
