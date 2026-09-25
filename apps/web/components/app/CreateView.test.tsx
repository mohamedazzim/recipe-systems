import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateView } from '@/components/app/CreateView';

// The photo path downscales via Image/canvas, which jsdom cannot decode — stub
// the helper to the identity so these tests exercise the component's upload
// flow (the codec itself is covered by lib/image.test.ts).
jest.mock('@/lib/image', () => ({
  downscaleImage: (file: File) => Promise.resolve(file),
}));

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
      onOpenDraftReview: jest.fn(),
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

  function documentFile(name = 'recipe.txt', size = 1024): File {
    const type = name.toLowerCase().endsWith('.pdf')
      ? 'application/pdf'
      : name.toLowerCase().endsWith('.docx')
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'text/plain';
    return new File([new Uint8Array(size)], name, { type });
  }

  function ingestionResponse(overrides: Record<string, unknown> = {}) {
    return {
      ingestion_id: 'ing-1',
      original_filename: 'recipe.txt',
      file_type: 'txt',
      file_size_bytes: 1024,
      status: 'queued',
      has_text: false,
      error_code: null,
      error_message: null,
      created_at: '2026-09-21T00:00:00.000Z',
      updated_at: '2026-09-21T00:00:00.000Z',
      ...overrides,
    };
  }

  it('photo upload control renders behind the Photo tab with a picker and a shared footer action', async () => {
    render(<CreateView {...props()} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Photo' }));
    expect(screen.getByText('Drop a photo here, or click to choose a file')).toBeInTheDocument();
    expect(screen.getByLabelText('Choose recipe photo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analyze recipe' })).toBeEnabled();
    expect(screen.queryByText('Coming soon.')).not.toBeInTheDocument();
  });

  it('rejects a non-image file type before any request', async () => {
    render(<CreateView {...props()} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Photo' }));
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
    await userEvent.click(screen.getByRole('tab', { name: 'Photo' }));
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
    await userEvent.click(screen.getByRole('tab', { name: 'Photo' }));
    await userEvent.upload(screen.getByLabelText('Choose recipe photo'), imageFile());
    await userEvent.click(screen.getByRole('button', { name: 'Analyze recipe' }));

    expect(await screen.findByRole('button', { name: 'Working…' })).toBeInTheDocument();

    const [url, init] = (globalThis.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/recipes/upload');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers).not.toHaveProperty('Content-Type');

    expect(p.onUploaded).toHaveBeenCalledWith('r7', lines, null, null, false);
    const stored = JSON.parse(window.localStorage.getItem('rs.session.recipes') ?? '[]');
    expect(stored[0].owner).toBe('user:acc-1');
  });

  it('uploads a photo and routes with the card title as the recipe name', async () => {
    const lines = [
      { id: 'l1', line_no: 1, display_name: 'Fish - 500g', ocr_confidence: 0.98, needs_review: false, source_tag: 'CARD' },
    ];
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        recipe_id: 'r8',
        image_id: 'img-2',
        file_key: 'recipes/y.jpg',
        title: 'Parippu Curry',
        ocr: { status: 'complete', draft_line_count: 1, flagged_count: 0 },
        lines,
      }),
    });
    const p = props();
    render(<CreateView {...p} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Photo' }));
    await userEvent.upload(screen.getByLabelText('Choose recipe photo'), imageFile());
    await userEvent.click(screen.getByRole('button', { name: 'Analyze recipe' }));

    expect(await screen.findByRole('button', { name: 'Working…' })).toBeInTheDocument();
    expect(p.onUploaded).toHaveBeenCalledWith('r8', lines, 'Parippu Curry', null, false);
    const stored = JSON.parse(window.localStorage.getItem('rs.session.recipes') ?? '[]');
    expect(stored[0].preview).toBe('Parippu Curry');
  });

  it('maps an OCR-unavailable backend error to a recoverable message with Retry', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({
        error: { code: 'OCR_UNAVAILABLE', message: 'OCR is unavailable, so nothing was saved. Retry the upload.' },
      }),
    });
    const p = props();
    render(<CreateView {...p} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Photo' }));
    await userEvent.upload(screen.getByLabelText('Choose recipe photo'), imageFile());
    await userEvent.click(screen.getByRole('button', { name: 'Analyze recipe' }));

    expect(await screen.findByText('OCR is unavailable, so nothing was saved. Retry the upload.')).toBeInTheDocument();
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
    await userEvent.click(screen.getByRole('button', { name: 'Analyze recipe' }));

    expect(await screen.findByRole('button', { name: 'Working…' })).toBeInTheDocument();
    const [url, init] = (globalThis.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/recipes/parse-text');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ text: 'Meen Kuzhambu' });
    expect(p.onParsed).toHaveBeenCalledWith('r42', [], null, false);
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
    await userEvent.click(screen.getByRole('button', { name: 'Analyze recipe' }));
    expect(await screen.findByText('text must be a non-empty string')).toBeInTheDocument();
  });

  it('D-10A B5: the structured form submits entries and routes to the parsed recipe', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        recipe_id: 'r50',
        recipe: { raw_text: 'Fish — 500g\nSalt — to taste', lines: [], flags: [] },
      }),
    });
    const p = props();
    render(<CreateView {...p} />);

    await userEvent.click(screen.getByRole('tab', { name: 'Structured form' }));
    await userEvent.type(screen.getByLabelText('Ingredient'), 'Fish');
    await userEvent.type(screen.getByLabelText('Amount'), '500g');
    await userEvent.click(screen.getByRole('button', { name: 'Add ingredient' }));
    await userEvent.type(screen.getByLabelText('Ingredient 2'), 'Salt');
    await userEvent.type(screen.getByLabelText('Amount 2'), 'to taste');

    await userEvent.click(screen.getByRole('button', { name: 'Analyze recipe' }));

    expect(await screen.findByRole('button', { name: 'Working…' })).toBeInTheDocument();
    const [url, init] = (globalThis.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/recipes/form');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      ingredients: [
        { display_name: 'Fish', amount: '500g' },
        { display_name: 'Salt', amount: 'to taste' },
      ],
    });
    expect(p.onParsed).toHaveBeenCalledWith('r50', [], null, false);
    const stored = JSON.parse(window.localStorage.getItem('rs.session.recipes') ?? '[]');
    expect(stored[0].owner).toBe('user:acc-1');
  });

  it('guest note is shown for guests, absent for signed-in', () => {
    const { rerender } = render(<CreateView {...props({ signedIn: false, accountId: null })} />);
    expect(screen.getByText(/As a guest you can paste/)).toBeInTheDocument();
    rerender(<CreateView {...props({ signedIn: true })} />);
    expect(screen.queryByText(/As a guest you can paste/)).not.toBeInTheDocument();
  });

  it('selects the Upload tab when initialMode is "upload" (bulk entry)', () => {
    render(<CreateView {...props({ initialMode: 'upload' })} />);
    expect(screen.getByRole('tab', { name: 'Upload' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Drop documents here, or click to choose files')).toBeInTheDocument();
    expect(screen.getByLabelText('Choose recipe documents')).toBeInTheDocument();
  });

  it('lists a single selected bulk document', async () => {
    render(<CreateView {...props()} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Upload' }));
    await userEvent.upload(screen.getByLabelText('Choose recipe documents'), documentFile('recipe.txt'));
    const list = screen.getByRole('list', { name: 'Selected files' });
    expect(within(list).getByText('recipe.txt')).toBeInTheDocument();
  });

  it('lists multiple selected bulk documents and removes one', async () => {
    render(<CreateView {...props()} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Upload' }));
    await userEvent.upload(screen.getByLabelText('Choose recipe documents'), [
      documentFile('one.pdf'),
      documentFile('two.docx'),
    ]);
    const list = screen.getByRole('list', { name: 'Selected files' });
    expect(within(list).getByText('one.pdf')).toBeInTheDocument();
    expect(within(list).getByText('two.docx')).toBeInTheDocument();

    await userEvent.click(within(list).getByRole('button', { name: 'Remove one.pdf' }));
    expect(within(list).queryByText('one.pdf')).not.toBeInTheDocument();
    expect(within(list).getByText('two.docx')).toBeInTheDocument();
  });

  it('skips non-document files in the Upload tab', async () => {
    render(<CreateView {...props()} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Upload' }));
    await userEvent.upload(
      screen.getByLabelText('Choose recipe documents'),
      imageFile('card.jpg'),
      { applyAccept: false },
    );
    expect(
      await screen.findByText('One file was skipped — only PDF, DOCX, or TXT files up to 10 MB are accepted.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Selected files' })).not.toBeInTheDocument();
  });

  it('Phase 2: uploads selected documents and shows the ready state', async () => {
    (globalThis.fetch as jest.Mock).mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return { ok: true, status: 200, json: async () => ingestionResponse({ status: 'queued' }) };
      }
      return { ok: true, status: 200, json: async () => ingestionResponse({ status: 'ready', has_text: true }) };
    });
    render(<CreateView {...props()} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Upload' }));
    await userEvent.upload(screen.getByLabelText('Choose recipe documents'), documentFile('recipe.txt'));
    await userEvent.click(screen.getByRole('button', { name: 'Upload documents' }));

    expect(await screen.findByText('Ready for recipe extraction')).toBeInTheDocument();
    const postCall = (globalThis.fetch as jest.Mock).mock.calls.find(
      (c) => (c[1] as RequestInit | undefined)?.method === 'POST',
    ) as [string, RequestInit];
    expect(postCall[0]).toContain('/recipes/import/documents');
    expect(postCall[1].body).toBeInstanceOf(FormData);
  });

  it('Phase 2: shows extracting then ready as the worker progresses', async () => {
    let polls = 0;
    (globalThis.fetch as jest.Mock).mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return { ok: true, status: 200, json: async () => ingestionResponse({ status: 'queued' }) };
      }
      polls += 1;
      return {
        ok: true,
        status: 200,
        json: async () =>
          ingestionResponse({ status: polls === 1 ? 'queued' : 'ready', has_text: polls !== 1 }),
      };
    });
    render(<CreateView {...props()} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Upload' }));
    await userEvent.upload(screen.getByLabelText('Choose recipe documents'), documentFile('recipe.txt'));
    await userEvent.click(screen.getByRole('button', { name: 'Upload documents' }));

    expect(await screen.findByText('Extracting…')).toBeInTheDocument();
    expect(await screen.findByText('Ready for recipe extraction', {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it('Phase 2: shows failed state and recovers via Retry', async () => {
    let shouldFail = true;
    (globalThis.fetch as jest.Mock).mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        if (shouldFail) {
          return {
            ok: false,
            status: 400,
            json: async () => ({
              error: { code: 'INVALID_DOCUMENT', message: 'Only PDF, DOCX, or TXT documents are accepted' },
            }),
          };
        }
        return { ok: true, status: 200, json: async () => ingestionResponse({ status: 'queued' }) };
      }
      return { ok: true, status: 200, json: async () => ingestionResponse({ status: 'ready', has_text: true }) };
    });
    render(<CreateView {...props()} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Upload' }));
    await userEvent.upload(screen.getByLabelText('Choose recipe documents'), documentFile('recipe.txt'));
    await userEvent.click(screen.getByRole('button', { name: 'Upload documents' }));

    expect(await screen.findByText('Only PDF, DOCX, or TXT documents are accepted')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();

    shouldFail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Ready for recipe extraction')).toBeInTheDocument();
  });

  it('Phase 2 ingestion failure: Retry surfaces the ingestion error instead of extracting', async () => {
    let extractCalls = 0;
    (globalThis.fetch as jest.Mock).mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && (url as string).includes('/extract')) {
        extractCalls += 1;
        return { ok: true, status: 200, json: async () => ingestionResponse({ status: 'extracting_structure' }) };
      }
      if (init?.method === 'POST') {
        return { ok: true, status: 200, json: async () => ingestionResponse({ status: 'queued' }) };
      }
      // The worker failed the raw-text extraction (e.g. scanned PDF).
      return {
        ok: true,
        status: 200,
        json: async () =>
          ingestionResponse({
            status: 'failed',
            error_code: 'NO_TEXT_EXTRACTED',
            error_message: 'No text could be extracted from this document.',
          }),
      };
    });

    render(<CreateView {...props()} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Upload' }));
    await userEvent.upload(screen.getByLabelText('Choose recipe documents'), documentFile('recipe.pdf'));
    await userEvent.click(screen.getByRole('button', { name: 'Upload documents' }));

    expect(await screen.findByText('No text could be extracted from this document.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    // Retry must NOT POST /extract against a failed ingestion — it re-reads the
    // status and keeps the real error visible.
    expect(extractCalls).toBe(0);
    expect(await screen.findByText('No text could be extracted from this document.')).toBeInTheDocument();
  });

  it('Phase 3: shows Extract recipe, then Draft ready, and opens review', async () => {
    let extractionTriggered = false;
    (globalThis.fetch as jest.Mock).mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && url.includes('/extract')) {
        extractionTriggered = true;
        return { ok: true, status: 200, json: async () => ingestionResponse({ status: 'extracting_structure' }) };
      }
      if (init?.method === 'POST') {
        return { ok: true, status: 200, json: async () => ingestionResponse({ status: 'queued' }) };
      }
      return {
        ok: true,
        status: 200,
        json: async () =>
          ingestionResponse({ status: extractionTriggered ? 'draft_ready' : 'ready', has_text: true }),
      };
    });

    const p = props();
    render(<CreateView {...p} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Upload' }));
    await userEvent.upload(screen.getByLabelText('Choose recipe documents'), documentFile('recipe.txt'));
    await userEvent.click(screen.getByRole('button', { name: 'Upload documents' }));

    expect(await screen.findByText('Ready for recipe extraction')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Extract recipe' }));

    expect(await screen.findByText('Draft ready')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(p.onOpenDraftReview).toHaveBeenCalledWith('ing-1', 'recipe.txt');
  });

  it('Phase 3: extraction failure shows failed and retries extraction', async () => {
    let extractionTriggered = false;
    let failExtraction = true;
    (globalThis.fetch as jest.Mock).mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && url.includes('/extract')) {
        extractionTriggered = true;
        return { ok: true, status: 200, json: async () => ingestionResponse({ status: 'extracting_structure' }) };
      }
      if (init?.method === 'POST') {
        return { ok: true, status: 200, json: async () => ingestionResponse({ status: 'queued' }) };
      }
      if (extractionTriggered) {
        return {
          ok: true,
          status: 200,
          json: async () =>
            ingestionResponse({
              status: failExtraction ? 'extraction_failed' : 'draft_ready',
              error_code: failExtraction ? 'INVALID_EXTRACTION' : null,
              error_message: failExtraction ? 'No valid recipe structure' : null,
            }),
        };
      }
      return { ok: true, status: 200, json: async () => ingestionResponse({ status: 'ready', has_text: true }) };
    });

    render(<CreateView {...props()} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Upload' }));
    await userEvent.upload(screen.getByLabelText('Choose recipe documents'), documentFile('recipe.txt'));
    await userEvent.click(screen.getByRole('button', { name: 'Upload documents' }));

    expect(await screen.findByText('Ready for recipe extraction')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Extract recipe' }));

    expect(await screen.findByText('No valid recipe structure')).toBeInTheDocument();
    failExtraction = false;
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Draft ready')).toBeInTheDocument();
  });

  it('Phase 3 resume: Retry on an already-extracted document opens review without re-extracting', async () => {
    let extractionTriggered = false;
    let failExtraction = true;
    (globalThis.fetch as jest.Mock).mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && url.includes('/extract')) {
        extractionTriggered = true;
        return { ok: true, status: 200, json: async () => ingestionResponse({ status: 'extracting_structure' }) };
      }
      if (init?.method === 'POST') {
        return { ok: true, status: 200, json: async () => ingestionResponse({ status: 'queued' }) };
      }
      if (extractionTriggered) {
        return {
          ok: true,
          status: 200,
          json: async () =>
            ingestionResponse({
              status: failExtraction ? 'extraction_failed' : 'draft_ready',
              error_code: failExtraction ? 'INVALID_EXTRACTION' : null,
              error_message: failExtraction ? 'No valid recipe structure' : null,
            }),
        };
      }
      return { ok: true, status: 200, json: async () => ingestionResponse({ status: 'ready', has_text: true }) };
    });

    render(<CreateView {...props()} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Upload' }));
    await userEvent.upload(screen.getByLabelText('Choose recipe documents'), documentFile('recipe.txt'));
    await userEvent.click(screen.getByRole('button', { name: 'Upload documents' }));

    expect(await screen.findByText('Ready for recipe extraction')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Extract recipe' }));
    expect(await screen.findByText('No valid recipe structure')).toBeInTheDocument();

    // The worker actually completed extraction in the meantime — Retry must
    // resume to the ready draft, never POST /extract again.
    failExtraction = false;
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Draft ready')).toBeInTheDocument();
    const extractPosts = (globalThis.fetch as jest.Mock).mock.calls.filter(
      ([u, i]: [string, RequestInit | undefined]) => i?.method === 'POST' && u.includes('/extract'),
    );
    expect(extractPosts).toHaveLength(1);
  });
});
