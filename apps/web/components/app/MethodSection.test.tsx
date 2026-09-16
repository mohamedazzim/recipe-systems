import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MethodSection } from '@/components/app/MethodSection';

describe('MethodSection (D-13 modes)', () => {
  beforeEach(() => {
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn();
    // default: mount hydration (read-only GET) reports no saved method
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ method_tag: null, method_source: null, list_only: true }),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function props(overrides: Partial<Parameters<typeof MethodSection>[0]> = {}) {
    return { recipeId: 'r1', signedIn: true, ...overrides };
  }

  /** all requests whose URL contains the method route */
  function methodCalls() {
    return (globalThis.fetch as jest.Mock).mock.calls.filter((c) => {
      const [url] = c as [string, RequestInit];
      return String(url).includes('/r1/method');
    });
  }

  function lastMethodCall() {
    const calls = methodCalls();
    return calls[calls.length - 1] as [string, RequestInit];
  }

  it('reports the canonical no-method consequence (list-only)', async () => {
    render(<MethodSection {...props()} />);
    expect(
      await screen.findByText('No method attached. Analysis will be list-only: Views 3 and 7 will be incomplete.'),
    ).toBeInTheDocument();
  });

  it('never claims saved before a save succeeds (no false "saved" message)', async () => {
    render(<MethodSection {...props()} />);
    await screen.findByText(/No method attached/);
    expect(screen.queryByText('Method saved successfully')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'I will paste it' }));
    await userEvent.type(screen.getByLabelText('Method text'), 'Boil; temper; simmer.');
    // still un-saved: form is dirty, not saved
    expect(screen.getByText('You have unsaved changes.')).toBeInTheDocument();
    expect(screen.queryByText('Method saved successfully')).not.toBeInTheDocument();
  });

  it('paste mode saves method_text as METHOD and shows the saved state', async () => {
    render(<MethodSection {...props()} />);
    await userEvent.click(screen.getByRole('radio', { name: 'I will paste it' }));
    await userEvent.type(screen.getByLabelText('Method text'), 'Boil; temper; simmer.');
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ method_tag: 'METHOD', method_source: null, method_text: 'Boil; temper; simmer.', list_only: false }),
    });
    await userEvent.click(screen.getByRole('button', { name: 'Save method' }));
    const [url, init] = lastMethodCall();
    expect(url).toContain('/r1/method');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({
      method: 'paste',
      method_text: 'Boil; temper; simmer.',
      method_source: '',
    });
    expect(await screen.findByText('Method saved successfully')).toBeInTheDocument();
    expect(
      screen.getByText('Your cooking method has been saved and is now attached to this recipe.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Cooking method attached')).toBeInTheDocument();
    expect(screen.getByText('Tag: METHOD — saved from your paste.')).toBeInTheDocument();
    expect(screen.getAllByText('Boil; temper; simmer.').length).toBeGreaterThan(0);
    expect(screen.queryByText('Could not save method')).not.toBeInTheDocument();
  });

  it('inferred requires BOTH text and a named source (button disabled otherwise)', async () => {
    render(<MethodSection {...props()} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Accepted from a source' }));
    await userEvent.type(screen.getByLabelText('Method text'), 'Simmer in tamarind water.');
    expect(screen.getByRole('button', { name: 'Save method' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Named source'), 'CDK 1669 / Mrs. Anitha');
    expect(screen.getByRole('button', { name: 'Save method' })).toBeEnabled();
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        method_tag: 'INFERRED',
        method_source: 'CDK 1669 / Mrs. Anitha',
        method_text: 'Simmer in tamarind water.',
        list_only: false,
      }),
    });
    await userEvent.click(screen.getByRole('button', { name: 'Save method' }));
    const [url, init] = lastMethodCall();
    expect(url).toContain('/r1/method');
    expect(JSON.parse(init.body as string)).toEqual({
      method: 'inferred',
      method_text: 'Simmer in tamarind water.',
      method_source: 'CDK 1669 / Mrs. Anitha',
    });
    expect(await screen.findByText('Method saved successfully')).toBeInTheDocument();
    expect(
      screen.getByText('Tag: INFERRED — source: CDK 1669 / Mrs. Anitha.'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Simmer in tamarind water.').length).toBeGreaterThan(0);
  });

  it('none clears the method → list-only state after success', async () => {
    render(<MethodSection {...props()} />);
    await userEvent.click(screen.getByRole('radio', { name: 'No method' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save method' }));
    const [url, init] = lastMethodCall();
    expect(url).toContain('/r1/method');
    expect(JSON.parse(init.body as string).method).toBe('none');
    expect(
      await screen.findByText('No method attached. Analysis will be list-only: Views 3 and 7 will be incomplete.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Method saved successfully')).not.toBeInTheDocument();
  });

  it('shows "Saving method…" while the request is in flight, then the saved state', async () => {
    let resolvePatch!: (value: unknown) => void;
    (globalThis.fetch as jest.Mock).mockImplementation((_url: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'PATCH') {
        // the save stays in flight until the test resolves it
        return new Promise((resolve) => {
          resolvePatch = resolve;
        });
      }
      // hydration (read-only GET) resolves immediately
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ method_tag: null, method_source: null, list_only: true }),
      });
    });
    render(<MethodSection {...props()} />);
    await screen.findByText(/No method attached/);
    await userEvent.click(screen.getByRole('radio', { name: 'I will paste it' }));
    await userEvent.type(screen.getByLabelText('Method text'), 'Cook for 1–2 hours over low heat.');
    await userEvent.click(screen.getByRole('button', { name: 'Save method' }));
    expect(await screen.findByText('Saving method…')).toBeInTheDocument();
    resolvePatch({
      ok: true,
      status: 200,
      json: async () => ({ method_tag: 'METHOD', method_source: null, method_text: 'Cook for 1–2 hours over low heat.', list_only: false }),
    });
    expect(await screen.findByText('Method saved successfully')).toBeInTheDocument();
  });

  it('backend failure is visible: status line carries the real error', async () => {
    render(<MethodSection {...props()} />);
    await userEvent.click(screen.getByRole('radio', { name: 'I will paste it' }));
    await userEvent.type(screen.getByLabelText('Method text'), 'Simmer.');
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: { code: 'INTERNAL', message: 'boom' } }),
    });
    await userEvent.click(screen.getByRole('button', { name: 'Save method' }));
    expect(await screen.findByText('Could not save method. Please try again.')).toBeInTheDocument();
    expect(screen.getByText('boom')).toBeInTheDocument(); // the error Alert
  });

  it('method survives workspace reload: mount only reads, never PATCHes none', async () => {
    // hydration reports a previously saved paste method
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ method_tag: 'METHOD', method_source: null, method_text: 'Boil; temper; simmer.', list_only: false }),
    });
    render(<MethodSection {...props()} />);
    expect(await screen.findByText('Cooking method attached')).toBeInTheDocument();
    expect(screen.getByText('Tag: METHOD — saved from your paste.')).toBeInTheDocument();
    expect(screen.getAllByText('Boil; temper; simmer.').length).toBeGreaterThan(0);
    // regression: the old mount-effect PATCHed method:none and wiped the DB row
    const writes = methodCalls().filter((c) => (c[1] as RequestInit).method === 'PATCH');
    expect(writes).toHaveLength(0);
  });

  it('editing the form after a save returns the status to ready (no stale "saved")', async () => {
    render(<MethodSection {...props()} />);
    await userEvent.click(screen.getByRole('radio', { name: 'I will paste it' }));
    await userEvent.type(screen.getByLabelText('Method text'), 'Boil; simmer.');
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ method_tag: 'METHOD', method_source: null, list_only: false }),
    });
    await userEvent.click(screen.getByRole('button', { name: 'Save method' }));
    expect(await screen.findByText('Method saved successfully')).toBeInTheDocument();
    // switching the mode invalidates the saved claim
    await userEvent.click(screen.getByRole('radio', { name: 'Accepted from a source' }));
    expect(await screen.findByText('You have unsaved changes.')).toBeInTheDocument();
    expect(screen.queryByText('Method saved successfully')).not.toBeInTheDocument();
  });

  it('guest: no form, honest note', async () => {
    render(<MethodSection {...props({ signedIn: false })} />);
    expect(await screen.findByText(/Method attach needs an account/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save method' })).not.toBeInTheDocument();
  });
});
