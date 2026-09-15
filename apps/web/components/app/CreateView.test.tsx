import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateView } from '@/components/app/CreateView';

describe('CreateView (paste + photo intake)', () => {
  beforeEach(() => {
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn();
    window.localStorage.clear();
    // jsdom has no object-URL implementation; the photo preview path needs one.
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = jest.fn(() => 'blob:preview');
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function props(overrides: Partial<Parameters<typeof CreateView>[0]> = {}) {
    return {
      signedIn: true,
      accountId: 'acc-1',
      onBack: jest.fn(),
      onParsed: jest.fn(),
      onUploaded: jest.fn(),
      ...overrides,
    };
  }

  function uploadResponse(lines: unknown[] = []) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        recipe_id: 'r7',
        image_id: 'img-1',
        file_key: 'recipes/x.jpg',
        ocr: { status: 'complete', draft_line_count: lines.length, flagged_count: 0 },
        lines,
      }),
    };
  }

  function imageFile(name = 'card.jpg', type = 'image/jpeg', size = 1024): File {
    return new File([new Uint8Array(size)], name, { type });
  }

  it('photo upload control renders with a file picker and a disabled upload action', () => {
    render(<CreateView {...props()} />);
    expect(screen.getByText('Photo capture')).toBeInTheDocument();
    expect(screen.getByLabelText('Choose recipe photo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload photo' })).toBeDisabled();
    expect(screen.queryByText('Coming soon.')).not.toBeInTheDocument();
  });

  it('rejects a non-image file type before any request', async () => {
    render(<CreateView {...props()} />);
    await userEvent.upload(
      screen.getByLabelText('Choose recipe photo'),
      imageFile('notes.txt', 'text/plain'),
      { applyAccept: false },
    );
    expect(await screen.findByText('Only JPEG or PNG images are accepted.')).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('rejects an oversized image before any request', async () => {
    render(<CreateView {...props()} />);
    await userEvent.upload(
      screen.getByLabelText('Choose recipe photo'),
      imageFile('big.jpg', 'image/jpeg', 11 * 1024 * 1024),
    );
    expect(await screen.findByText('The image is larger than 10 MB.')).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('uploads a photo, shows the processing state, and routes to the OCR draft', async () => {
    const lines = [
      { id: 'l1', line_no: 1, display_name: 'Fish - 500g', ocr_confidence: 0.98, needs_review: false, source_tag: 'CARD' },
      { id: 'l2', line_no: 2, display_name: 'Fenugreek Powder - 1/2 Tsp', ocr_confidence: 0.45, needs_review: true, source_tag: 'CARD' },
    ];
    (globalThis.fetch as jest.Mock).mockResolvedValue(uploadResponse(lines));
    const p = props();
    render(<CreateView {...p} />);
    await userEvent.upload(screen.getByLabelText('Choose recipe photo'), imageFile());
    await userEvent.click(screen.getByRole('button', { name: 'Upload photo' }));

    expect(await screen.findByRole('button', { name: 'Uploading photo & reading the card…' })).toBeInTheDocument();

    const [url, init] = (globalThis.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/recipes/upload');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers).not.toHaveProperty('Content-Type');

    expect(p.onUploaded).toHaveBeenCalledWith('r7', lines);
    const stored = JSON.parse(window.localStorage.getItem('rs.session.recipes') ?? '[]');
    expect(stored[0].owner).toBe('user:acc-1');
  });

  it('maps an OCR-unavailable backend error to a recoverable message with Retry', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({
        error: { code: 'OCR_UNAVAILABLE', message: 'OCR is unavailable; the photo was saved. Retry the upload.' },
      }),
    });
    const p = props();
    render(<CreateView {...p} />);
    await userEvent.upload(screen.getByLabelText('Choose recipe photo'), imageFile());
    await userEvent.click(screen.getByRole('button', { name: 'Upload photo' }));

    expect(await screen.findByText('OCR is unavailable; the photo was saved. Retry the upload.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByText('card.jpg')).toBeInTheDocument();
    expect(p.onUploaded).not.toHaveBeenCalled();
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
    expect(p.onParsed).toHaveBeenCalledWith('r42', []);
    const stored = JSON.parse(window.localStorage.getItem('rs.session.recipes') ?? '[]');
    expect(stored[0].owner).toBe('user:acc-1');
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
    const { rerender } = render(<CreateView {...props({ signedIn: false, accountId: null })} />);
    expect(screen.getByText(/As a guest you can paste or upload a photo/)).toBeInTheDocument();
    rerender(<CreateView {...props({ signedIn: true })} />);
    expect(screen.queryByText(/As a guest you can paste or upload a photo/)).not.toBeInTheDocument();
  });
});
