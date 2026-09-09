import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MethodSection } from '@/components/app/MethodSection';

describe('MethodSection (D-13 modes)', () => {
  beforeEach(() => {
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn();
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

  it('reports the canonical no-method consequence (list-only)', async () => {
    render(<MethodSection {...props()} />);
    expect(await screen.findByText('Method not provided.')).toBeInTheDocument();
    expect(screen.getByText(/Views 3 and 7 will be incomplete/)).toBeInTheDocument();
  });

  it('paste mode saves method_text as METHOD', async () => {
    render(<MethodSection {...props()} />);
    await userEvent.click(screen.getByRole('radio', { name: 'I will paste it' }));
    await userEvent.type(screen.getByLabelText('Method text'), 'Boil; temper; simmer.');
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ method_tag: 'METHOD', method_source: null, list_only: false }),
    });
    await userEvent.click(screen.getByRole('button', { name: 'Save method' }));
    const calls = (globalThis.fetch as jest.Mock).mock.calls.filter((c) => {
      const [url] = c as [string, RequestInit];
      return url.includes('/r1/method');
    });
    const call = calls[calls.length - 1];
    expect(JSON.parse((call as [string, RequestInit])[1].body as string)).toEqual({
      method: 'paste',
      method_text: 'Boil; temper; simmer.',
      method_source: '',
    });
    expect(await screen.findByText('Method saved from your paste.')).toBeInTheDocument();
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
        list_only: false,
      }),
    });
    await userEvent.click(screen.getByRole('button', { name: 'Save method' }));
    expect(await screen.findByText('Inferred from: CDK 1669 / Mrs. Anitha.')).toBeInTheDocument();
  });

  it('none clears the method', async () => {
    render(<MethodSection {...props()} />);
    await userEvent.click(screen.getByRole('radio', { name: 'No method' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save method' }));
    const call = (globalThis.fetch as jest.Mock).mock.calls.find((c) => {
      const [url] = c as [string, RequestInit];
      return url.includes('/r1/method');
    });
    expect(JSON.parse((call as [string, RequestInit])[1].body as string).method).toBe('none');
  });

  it('guest: no form, honest note', async () => {
    render(<MethodSection {...props({ signedIn: false })} />);
    expect(await screen.findByText(/Method attach needs an account/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save method' })).not.toBeInTheDocument();
  });
});
