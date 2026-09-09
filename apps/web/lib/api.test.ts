// api() helper: the 204 No Content contract (canonical DELETE) must resolve
// cleanly — parsing an empty body used to throw and turn successful deletes
// into UI error banners (the reported add-then-delete bug).

import { api, ApiError, readCookie } from '@/lib/api';

describe('api() helper', () => {
  beforeEach(() => {
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('resolves undefined for 204 No Content (never parses an empty body)', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 204,
      json: jest.fn().mockRejectedValue(new SyntaxError('Unexpected end of JSON input')),
    });
    await expect(api('/recipes/r1/lines/l1', { method: 'DELETE' })).resolves.toBeUndefined();
    expect((globalThis.fetch as jest.Mock).mock.calls[0][1].method).toBe('DELETE');
  });

  it('throws ApiError with the backend code and message on failure', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: { code: 'STALE_EDIT', message: 'Line changed' } }),
    });
    await expect(api('/recipes/r1/lines/l1', { method: 'PATCH' })).rejects.toMatchObject({
      status: 409,
      code: 'STALE_EDIT',
      message: 'Line changed',
    });
  });

  it('attaches the CSRF header on mutating methods', async () => {
    Object.defineProperty(document, 'cookie', {
      value: 'recipe_csrf=token-123',
      writable: true,
      configurable: true,
    });
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    await api('/x', { method: 'POST' });
    const init = (globalThis.fetch as jest.Mock).mock.calls[0][1];
    expect(init.headers['X-CSRF-Token']).toBe('token-123');
    expect(init.credentials).toBe('include');
  });
});
