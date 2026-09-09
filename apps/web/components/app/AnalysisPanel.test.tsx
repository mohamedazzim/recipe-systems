import { act, render, screen } from '@testing-library/react';
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

describe('AnalysisPanel (D-17 states, real data only)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('renders nothing without an analysis id', () => {
    render(<AnalysisPanel analysisId={null} recipeId="r1" />);
    expect(screen.queryByText('Analysis status')).not.toBeInTheDocument();
  });

  it('queued: shows the real queued state, no fake progress', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => stateOf('queued'),
    });
    render(<AnalysisPanel analysisId="a-123" recipeId="r1" />);
    expect(await screen.findByText(/Waiting for a worker to pick it up/)).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('generating: the honest processing state', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => stateOf('generating'),
    });
    render(<AnalysisPanel analysisId="a-123" recipeId="r1" />);
    expect((await screen.findAllByText('Your recipe is being analysed.')).length).toBeGreaterThan(0);
  });

  it('complete: shows the coming-next state with the real view rows', async () => {
    const views = Array.from({ length: 9 }, (_, i) => ({
      view_number: i + 1,
      view_key: `view_${i + 1}`,
      status: i >= 7 ? ('INCOMPLETE' as const) : ('COMPLETE' as const),
      payload: {},
    }));
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => stateOf('complete', views),
    });
    render(<AnalysisPanel analysisId="a-123" recipeId="r1" />);
    expect(await screen.findByText('Analysis complete.')).toBeInTheDocument();
    expect(screen.getByText(/Detailed recipe views are coming next/)).toBeInTheDocument();
    expect(screen.getAllByText('Complete')).toHaveLength(7);
    expect(screen.getAllByText('Incomplete')).toHaveLength(2);
    expect(screen.getByText('stub-no-provider-q9')).toBeInTheDocument();
  });

  it('failed: honest failure copy, nothing published', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => stateOf('failed'),
    });
    render(<AnalysisPanel analysisId="a-123" recipeId="r1" />);
    expect(await screen.findByText('The analysis run failed.')).toBeInTheDocument();
    expect(screen.getByText(/Nothing was published from this run/)).toBeInTheDocument();
  });

  it('backend error surfaces the message', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: { code: 'ANALYSIS_NOT_FOUND', message: 'Analysis not found' } }),
    });
    render(<AnalysisPanel analysisId="a-123" recipeId="r1" />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(await screen.findByText('Analysis not found')).toBeInTheDocument();
  });
});
