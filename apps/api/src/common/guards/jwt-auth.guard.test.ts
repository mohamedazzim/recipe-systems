import { JwtAuthGuard } from './jwt-auth.guard';
import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  defaultSessionTtl,
  signSession,
} from '../../modules/auth/session';

// Regression (real-LLM latency): fixed 15-minute sessions died mid-analysis, so
// JwtAuthGuard must SLIDE the session + CSRF cookie maxAge on every authenticated
// request. The JWT itself stays valid up to the absolute ceiling.
describe('JwtAuthGuard sliding renewal', () => {
  let guard: JwtAuthGuard;

  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-secret-for-guard-sliding';
    guard = new JwtAuthGuard();
  });

  afterEach(() => {
    delete process.env.SESSION_SECRET;
    delete process.env.SESSION_TTL_SECONDS;
  });

  function mockContext(sessionToken?: string, csrfToken?: string) {
    const cookies: Record<string, string> = {};
    if (sessionToken) cookies[SESSION_COOKIE] = sessionToken;
    if (csrfToken) cookies[CSRF_COOKIE] = csrfToken;
    const req = { cookies };
    const res = { cookie: jest.fn() };
    return { req, res };
  }

  it('re-issues the session cookie with a fresh idle maxAge on a valid session', async () => {
    const token = await signSession({ accountId: 'a-1', email: 'x@test.dev', sub: 's' });
    const { req, res } = mockContext(token);
    const ctx = { switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }) } as never;

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(res.cookie).toHaveBeenCalledWith(
      SESSION_COOKIE,
      token,
      expect.objectContaining({ maxAge: defaultSessionTtl() * 1000, httpOnly: true }),
    );
  });

  it('slides the CSRF cookie alongside the session cookie', async () => {
    const token = await signSession({ accountId: 'a-1', email: 'x@test.dev', sub: 's' });
    const { req, res } = mockContext(token, 'csrf-token-value');
    const ctx = { switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }) } as never;

    await guard.canActivate(ctx);
    expect(res.cookie).toHaveBeenCalledWith(
      CSRF_COOKIE,
      'csrf-token-value',
      expect.objectContaining({ httpOnly: false, maxAge: defaultSessionTtl() * 1000 }),
    );
  });

  it('does not touch cookies when the session cookie is missing', async () => {
    const { req, res } = mockContext(undefined);
    const ctx = { switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }) } as never;

    await expect(guard.canActivate(ctx)).rejects.toMatchObject({ status: 401 });
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('does not slide an invalid session token', async () => {
    const { req, res } = mockContext('not-a-valid-token');
    const ctx = { switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }) } as never;

    await expect(guard.canActivate(ctx)).rejects.toMatchObject({ status: 401 });
    expect(res.cookie).not.toHaveBeenCalled();
  });
});
