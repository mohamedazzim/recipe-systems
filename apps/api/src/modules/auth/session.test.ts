import {
  csrfMatches,
  newCsrfToken,
  signOAuthState,
  signSession,
  verifyOAuthState,
  verifySession,
} from './session';

describe('session', () => {
  const payload = { accountId: 'a-1', email: 'x@test.dev', sub: 'kc-sub' };

  it('signs and verifies a session roundtrip', async () => {
    const token = await signSession(payload);
    const verified = await verifySession(token);
    expect(verified.accountId).toBe('a-1');
    expect(verified.email).toBe('x@test.dev');
    expect(verified.sub).toBe('kc-sub');
  });

  it('rejects a tampered session', async () => {
    const token = await signSession(payload);
    const [head] = token.split('.');
    const forged = `${head}.${Buffer.from('{"accountId":"evil"}').toString('base64url')}.${token.split('.')[2]}`;
    await expect(verifySession(forged)).rejects.toThrow();
  });

  it('rejects a session signed with a different secret', async () => {
    const prev = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = 'secret-one';
    const token = await signSession(payload);
    process.env.SESSION_SECRET = 'secret-two';
    await expect(verifySession(token)).rejects.toThrow();
    if (prev === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = prev;
  });

  it('signs and verifies oauth state roundtrip', async () => {
    const token = await signOAuthState({ state: 'st', nonce: 'nc', redirectTo: '/home' });
    const verified = await verifyOAuthState(token);
    expect(verified.state).toBe('st');
    expect(verified.nonce).toBe('nc');
    expect(verified.redirectTo).toBe('/home');
  });

  it('compares csrf tokens constant-time', () => {
    expect(csrfMatches(undefined, undefined)).toBe(false);
    expect(csrfMatches('a', undefined)).toBe(false);
    expect(csrfMatches('a', 'a')).toBe(true);
    expect(csrfMatches('a', 'b')).toBe(false);
    expect(csrfMatches('abc', 'abcd')).toBe(false);
  });

  it('generates distinct csrf tokens', () => {
    expect(newCsrfToken()).not.toBe(newCsrfToken());
    expect(newCsrfToken().length).toBeGreaterThanOrEqual(16);
  });
});
