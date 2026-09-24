import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VideoWalkthrough } from '@/components/app/VideoWalkthrough';
import type { WireLine } from '@/lib/types';

function line(overrides: Partial<WireLine> = {}): WireLine {
  return {
    id: 'l1',
    line_no: 1,
    display_name: 'Fish',
    amount: '500g',
    unit: 'g',
    quantity: 500,
    category: null,
    confirmed_sense: null,
    include_on_list: true,
    is_header: false,
    needs_review: false,
    ocr_confidence: null,
    source_tag: 'CARD',
    updated_at: '2026-09-23T10:00:00.000Z',
    ...overrides,
  };
}

const READY = {
  status: 'ready',
  video: {
    id: 'iV651XRxquM',
    url: 'https://www.youtube.com/watch?v=iV651XRxquM',
    title: 'Meen kuzhambu recipe',
    channel: 'Some Kitchen',
  },
  chapters: [
    { start: '00:00', seconds: 0, title: 'Intro', summary: 'The finished dish.' },
    { start: '01:20', seconds: 80, title: 'Boil the gravy', summary: 'Simmer 10-15 minutes.' },
  ],
  error: null,
};

function readyResponse() {
  return { ok: true, status: 200, json: async () => READY };
}

describe('VideoWalkthrough (chef mode)', () => {
  beforeEach(() => {
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn().mockResolvedValue(readyResponse());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function props(overrides: Partial<Parameters<typeof VideoWalkthrough>[0]> = {}) {
    return {
      recipeId: 'r1',
      title: 'Meen Kuzhambu',
      lines: [line()],
      signedIn: true,
      onBack: jest.fn(),
      ...overrides,
    };
  }

  it('renders the video, its ingredient chips and the timestamped steps', async () => {
    render(<VideoWalkthrough {...props()} />);

    expect(await screen.findByText('Step 1 of 2')).toBeInTheDocument();
    expect(screen.getByText('Intro')).toBeInTheDocument();
    expect(screen.getByText('01:20')).toBeInTheDocument();
    // The chips come from the corrected ingredient lines.
    expect(screen.getByText('Fish')).toBeInTheDocument();
    // The surface is honest about where the video came from.
    expect(screen.getAllByText(/third-party video/i).length).toBeGreaterThan(0);
    const frame = screen.getByTitle('Meen kuzhambu recipe') as HTMLIFrameElement;
    expect(frame.getAttribute('src')).toContain('youtube-nocookie.com/embed/iV651XRxquM');
  });

  it('tapping a step seeks the player and makes it current', async () => {
    render(<VideoWalkthrough {...props()} />);
    await screen.findByText('Step 1 of 2');

    const frame = screen.getByTitle('Meen kuzhambu recipe') as HTMLIFrameElement;
    const post = jest.fn();
    Object.defineProperty(frame, 'contentWindow', { value: { postMessage: post } });

    await userEvent.click(screen.getByRole('button', { name: /Boil the gravy/ }));

    expect(screen.getByText('Step 2 of 2')).toBeInTheDocument();
    expect(screen.getByText('Chapter 2: Boil the gravy')).toBeInTheDocument();
    const commands = post.mock.calls.map((c) => JSON.parse(String(c[0])));
    expect(commands).toContainEqual({ event: 'command', func: 'seekTo', args: [80, true] });
  });

  it('Previous steps back through the list and seeks back', async () => {
    render(<VideoWalkthrough {...props()} />);
    await screen.findByText('Step 1 of 2');
    await userEvent.click(screen.getByRole('button', { name: /Boil the gravy/ }));
    expect(screen.getByText('Step 2 of 2')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument();
  });

  it('offers a retry instead of an endless spinner when the load fails', async () => {
    // A failed read used to leave `state` null, so the view sat on "Finding a video…"
    // forever with no way forward: the poll effect never re-ran and only the 'failed'
    // status (never reached) had a retry.
    (globalThis.fetch as jest.Mock).mockRejectedValue(new Error('network'));
    render(<VideoWalkthrough {...props()} />);

    expect(await screen.findByText('Could not load the walkthrough')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByText(/Finding a video for this dish/)).not.toBeInTheDocument();
  });

  it('starts generation when no walkthrough exists yet', async () => {
    (globalThis.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 'absent', video: null, chapters: [], error: null }),
      })
      .mockResolvedValueOnce({ ok: true, status: 202, json: async () => ({ status: 'generating' }) });

    render(<VideoWalkthrough {...props()} />);

    expect(
      await screen.findByText(/Finding a video for this dish and reading its steps/),
    ).toBeInTheDocument();
    const post = (globalThis.fetch as jest.Mock).mock.calls.find(
      (c) => (c[1] as RequestInit)?.method === 'POST',
    );
    expect(post?.[0]).toContain('/recipes/r1/video-walkthrough');
  });
});
