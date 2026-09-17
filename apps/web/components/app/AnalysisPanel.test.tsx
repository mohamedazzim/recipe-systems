import { fireEvent, render, screen } from '@testing-library/react';
import { AnalysisPanel } from '@/components/app/AnalysisPanel';
import type { AnalysisState } from '@/lib/types';

function stateOf(status: AnalysisState['status'], views: AnalysisState['views'] = []): AnalysisState {
  return {
    analysis_id: 'a-123',
    status,
    mode: 'home',
    is_latest: true,
    prompt_version: 'v2',
    model_version: 'stub-no-provider-q9',
    views,
  };
}

function props(overrides: Partial<Parameters<typeof AnalysisPanel>[0]> = {}) {
  return {
    analysisId: 'a-123' as string | null,
    recipeId: 'r1',
    lines: [],
    methodState: null,
    signedIn: true,
    ...overrides,
  };
}

describe('AnalysisPanel (D-17 states + D-18 result)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('renders nothing without an analysis id', () => {
    render(<AnalysisPanel {...props({ analysisId: null })} />);
    expect(screen.queryByText('Analysis status')).not.toBeInTheDocument();
  });

  it('queued: shows the real queued state, no fake progress', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true, status: 200, json: async () => stateOf('queued'),
    });
    render(<AnalysisPanel {...props()} />);
    expect(await screen.findByText(/Analysis queued/)).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('generating: the honest processing state', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true, status: 200, json: async () => stateOf('generating'),
    });
    render(<AnalysisPanel {...props()} />);
    expect((await screen.findAllByText('Analyzing recipe — generating views.')).length).toBeGreaterThan(0);
  });

  it('complete: renders the real D-18 views (identification + view tabs), no placeholder', async () => {
    const views = Array.from({ length: 9 }, (_, i) => ({
      view_number: i + 1,
      view_key: `view_${i + 1}`,
      status: i >= 7 ? ('INCOMPLETE' as const) : ('COMPLETE' as const),
      payload: {},
    }));
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true, status: 200, json: async () => stateOf('complete', views),
    });
    render(<AnalysisPanel {...props()} />);
    expect(await screen.findByText('Analysis complete.')).toBeInTheDocument();
    // The "coming next" placeholder is GONE.
    expect(screen.queryByText(/Detailed recipe views are coming next/)).not.toBeInTheDocument();
    // The real result surface is present (identification honest state + accordion).
    expect(screen.getByText('Identification not available')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1 · Why it works' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '4 · Substitutions' })).toBeInTheDocument();
  });

  it('failed: honest failure copy, nothing published, retry offered', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true, status: 200, json: async () => stateOf('failed'),
    });
    const onRetry = jest.fn();
    render(<AnalysisPanel {...props({ onRetry })} />);
    expect(await screen.findByText('Analysis failed.')).toBeInTheDocument();
    expect(screen.getByText(/Nothing was published from this run/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry analysis' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('stale: shows a compact out-of-date tag above the views', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true, status: 200, json: async () => stateOf('complete', []),
    });
    render(<AnalysisPanel {...props({ stale: true })} />);
    expect(await screen.findByText('Views out of date — re-analyse')).toBeInTheDocument();
  });

  it('ANALYSIS_NOT_FOUND (row still being written) shows the waiting state, not an error', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: { code: 'ANALYSIS_NOT_FOUND', message: 'Analysis not found' } }),
    });
    render(<AnalysisPanel {...props()} />);
    expect(await screen.findByText('Loading status...')).toBeInTheDocument();
    expect(screen.queryByText('Could not load the analysis status')).not.toBeInTheDocument();
  });

  it('a real backend error surfaces the message', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: { code: 'WORKER_DOWN', message: 'Analysis service unavailable' } }),
    });
    render(<AnalysisPanel {...props()} />);
    expect(await screen.findByText('Analysis service unavailable')).toBeInTheDocument();
  });
});
