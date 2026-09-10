import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAnalysisStatus } from '@/lib/hooks/useAnalysisStatus';
import type { AnalysisState } from '@/lib/types';

function stateOf(status: AnalysisState['status']): AnalysisState {
  return {
    analysis_id: 'a-123',
    status,
    mode: 'home',
    is_latest: true,
    prompt_version: 'v2',
    model_version: 'stub-no-provider-q9',
    views: [],
  };
}

function Probe({ analysisId }: { analysisId: string | null }) {
  const { analysis, terminal, error } = useAnalysisStatus(analysisId);
  return (
    <div>
      <span data-testid="status">{analysis?.status ?? 'none'}</span>
      <span data-testid="terminal">{terminal ?? 'running'}</span>
      <span data-testid="error">{error ?? 'no-error'}</span>
    </div>
  );
}

describe('useAnalysisStatus (poll + SSE, real states only)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  function respondWith(status: AnalysisState['status']): void {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => stateOf(status),
    });
  }

  it('polls until complete, then stops (terminal = complete)', async () => {
    respondWith('generating');
    render(<Probe analysisId="a-123" />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('status').textContent).toBe('generating');

    respondWith('complete');
    await act(async () => {
      jest.advanceTimersByTime(2500);
    });
    expect(screen.getByTestId('status').textContent).toBe('complete');
    expect(screen.getByTestId('terminal').textContent).toBe('complete');

    // no further polling after terminal
    const calls = (globalThis.fetch as jest.Mock).mock.calls.length;
    await act(async () => {
      jest.advanceTimersByTime(10000);
    });
    expect((globalThis.fetch as jest.Mock).mock.calls.length).toBe(calls);
  });

  it('stops on failed with the real status', async () => {
    respondWith('failed');
    render(<Probe analysisId="a-123" />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('status').textContent).toBe('failed');
    expect(screen.getByTestId('terminal').textContent).toBe('failed');
  });

  it('surfaces API errors as a message', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: { code: 'ANALYSIS_NOT_FOUND', message: 'Analysis not found' } }),
    });
    render(<Probe analysisId="a-123" />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('error').textContent).toBe('Analysis not found');
  });

  it('does nothing without an analysis id', async () => {
    render(<Probe analysisId={null} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('status').textContent).toBe('none');
    expect((globalThis.fetch as jest.Mock).mock.calls.length).toBe(0);
  });

  it('opens the EventSource with credentials (QA-B3: cross-origin cookies)', async () => {
    respondWith('generating');
    const EsMock = jest.fn(function (this: unknown, url: string, options?: unknown) {
      (this as unknown as { url: string; options: unknown }).url = url;
      (this as unknown as { options: unknown }).options = options;
    }) as unknown as typeof EventSource;
    const close = jest.fn();
    const addEventListener = jest.fn();
    (EsMock as unknown as { prototype: Partial<EventSource> }).prototype.close = close as never;
    (EsMock as unknown as { prototype: Partial<EventSource> }).prototype.addEventListener = addEventListener as never;
    (globalThis as unknown as { EventSource: unknown }).EventSource = EsMock;

    render(<Probe analysisId="a-123" />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(EsMock).toHaveBeenCalledWith(
      expect.stringContaining('/analysis/a-123/events'),
      { withCredentials: true },
    );
    expect(addEventListener).toHaveBeenCalledWith('status', expect.any(Function));
    expect(addEventListener).toHaveBeenCalledWith('snapshot', expect.any(Function));
  });
});
