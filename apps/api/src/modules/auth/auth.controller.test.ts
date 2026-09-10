import { BadRequestException } from '@nestjs/common';
import { AuthController } from './auth.controller';

function mockAuthService() {
  return {
    beginLogin: jest.fn(),
    beginSignup: jest.fn(),
    completeLogin: jest.fn(),
    claimGuestSession: jest.fn(),
    createGuestSession: jest.fn(),
    getRegistrationUrl: jest.fn().mockReturnValue('https://idp/register'),
    getPasswordResetUrl: jest.fn().mockReturnValue('https://idp/reset'),
    me: jest.fn(),
    updatePreferences: jest.fn(),
    sessionTtlSeconds: jest.fn().mockReturnValue(900),
    cookieOptions: jest.fn().mockReturnValue({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 900,
    }),
    guestCookieName: jest.fn().mockReturnValue('recipe_guest_session'),
  };
}

function mockRes() {
  const res: Record<string, jest.Mock> = {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
    redirect: jest.fn(),
    json: jest.fn(),
    status: jest.fn(),
  };
  res.status.mockImplementation(() => res);
  return res;
}

describe('AuthController', () => {
  it('login redirects to the IdP authorization URL', async () => {
    const auth: any = mockAuthService();
    auth.beginLogin.mockResolvedValue({ authorizationUrl: 'https://idp/auth?...', stateCookie: 'sc' });
    const res = mockRes();
    const ctrl = new AuthController(auth);
    await ctrl.login(undefined, res as never);
    expect(res.redirect).toHaveBeenCalledWith(302, 'https://idp/auth?...');
    expect(res.cookie).toHaveBeenCalledWith(
      'recipe_oauth_state',
      'sc',
      expect.objectContaining({ httpOnly: true }),
    );
  });

  it('callback rejects a request without code/state', async () => {
    const ctrl = new AuthController(mockAuthService() as never);
    await expect(
      ctrl.callback(undefined, undefined, { cookies: {} } as never, mockRes() as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('callback completes login, sets session + csrf cookies, redirects', async () => {
    const auth: any = mockAuthService();
    auth.completeLogin.mockResolvedValue({
      session: 'sess',
      csrf: 'csrf',
      redirectTo: '/home',
      email: 'x@test.dev',
      accountId: 'a1',
    });
    const res = mockRes();
    const ctrl = new AuthController(auth);
    await ctrl.callback('code', 'st', { cookies: { recipe_oauth_state: 'sc' } } as never, res as never);
    expect(res.cookie).toHaveBeenCalledWith('recipe_session', 'sess', expect.anything());
    expect(res.cookie).toHaveBeenCalledWith(
      'recipe_csrf',
      'csrf',
      expect.objectContaining({ httpOnly: false }),
    );
    expect(res.redirect).toHaveBeenCalledWith(302, 'http://localhost:3000/home');
  });

  it('callback claims a pending guest session, clears its cookie, and marks the redirect (QA-B2)', async () => {
    const auth: any = mockAuthService();
    auth.completeLogin.mockResolvedValue({
      session: 'sess',
      csrf: 'csrf',
      redirectTo: '/',
      email: 'x@test.dev',
      accountId: 'a1',
    });
    auth.claimGuestSession.mockResolvedValue({ claimed: 'new' });
    const res = mockRes();
    const ctrl = new AuthController(auth);
    await ctrl.callback(
      'code',
      'st',
      { cookies: { recipe_oauth_state: 'sc', recipe_guest_session: 'g1' } } as never,
      res as never,
    );
    expect(auth.claimGuestSession).toHaveBeenCalledWith('a1', 'g1');
    expect(res.clearCookie).toHaveBeenCalledWith('recipe_guest_session', { path: '/' });
    expect(res.redirect).toHaveBeenCalledWith(302, 'http://localhost:3000/?claimed=1');
  });

  it('callback never fails login when the guest claim fails (QA-B2)', async () => {
    const auth: any = mockAuthService();
    auth.completeLogin.mockResolvedValue({
      session: 'sess',
      csrf: 'csrf',
      redirectTo: '/',
      email: 'x@test.dev',
      accountId: 'a1',
    });
    auth.claimGuestSession.mockRejectedValue(new Error('guest session expired'));
    const res = mockRes();
    const ctrl = new AuthController(auth);
    await ctrl.callback(
      'code',
      'st',
      { cookies: { recipe_oauth_state: 'sc', recipe_guest_session: 'gone' } } as never,
      res as never,
    );
    expect(res.redirect).toHaveBeenCalledWith(302, 'http://localhost:3000/');
    expect(res.clearCookie).toHaveBeenCalledWith('recipe_guest_session', { path: '/' });
  });

  it('callback redirects to the web app with an auth_error on login failure (invalid credentials / IdP error)', async () => {
    const auth: any = mockAuthService();
    auth.completeLogin.mockRejectedValue(new Error('invalid credentials'));
    const res = mockRes();
    const ctrl = new AuthController(auth);
    await ctrl.callback('code', 'st', { cookies: { recipe_oauth_state: 'sc' } } as never, res as never);
    expect(res.clearCookie).toHaveBeenCalledWith('recipe_oauth_state', { path: '/' });
    expect(res.redirect).toHaveBeenCalledWith(
      302,
      'http://localhost:3000/?auth_error=invalid%20credentials',
    );
  });

  it('signup sets the state cookie and redirects to IdP registration; forgot redirects to the reset flow', async () => {
    const auth: any = mockAuthService();
    auth.beginSignup.mockResolvedValue({ registrationUrl: 'https://idp/registrations?state=x', stateCookie: 'sc' });
    const ctrl = new AuthController(auth);
    const res = mockRes();
    await ctrl.signup(res as never);
    expect(res.cookie).toHaveBeenCalledWith(
      'recipe_oauth_state',
      'sc',
      expect.objectContaining({ httpOnly: true, maxAge: 300000 }),
    );
    expect(res.redirect).toHaveBeenCalledWith(302, 'https://idp/registrations?state=x');
    await ctrl.forgotPassword(res as never);
    expect(res.redirect).toHaveBeenCalledWith(302, 'https://idp/reset');
  });

  it('logout clears session + csrf cookies and returns the IdP logout redirect when a session exists', async () => {
    const auth: any = mockAuthService();
    auth.readLogoutHint = jest.fn().mockReturnValue('id-token-1');
    auth.getLogoutRedirectUrl = jest
      .fn()
      .mockReturnValue('https://idp/logout?post_logout_redirect_uri=http%3A%2F%2Flocalhost%3A3000&id_token_hint=id-token-1');
    const ctrl = new AuthController(auth);
    const res = mockRes();
    await ctrl.logout({ cookies: { recipe_session: 'jwt' } } as never, res as never);
    expect(auth.readLogoutHint).toHaveBeenCalledWith('jwt');
    expect(res.clearCookie).toHaveBeenCalledWith('recipe_session', { path: '/' });
    expect(res.clearCookie).toHaveBeenCalledWith('recipe_csrf', { path: '/' });
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      redirect_to: 'https://idp/logout?post_logout_redirect_uri=http%3A%2F%2Flocalhost%3A3000&id_token_hint=id-token-1',
    });
  });

  it('logout without a session (guest) clears cookies and skips the IdP redirect', async () => {
    const auth: any = mockAuthService();
    auth.readLogoutHint = jest.fn().mockReturnValue(undefined);
    const ctrl = new AuthController(auth);
    const res = mockRes();
    await ctrl.logout({ cookies: {} } as never, res as never);
    expect(res.clearCookie).toHaveBeenCalledWith('recipe_session', { path: '/' });
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it('me returns the account row for the session user', async () => {
    const auth: any = mockAuthService();
    auth.me.mockResolvedValue({ id: 'a1', email: 'x@test.dev', preferred_mode: 'home', label_pack: null });
    const ctrl = new AuthController(auth);
    const result = await ctrl.me({ user: { accountId: 'a1' } } as never);
    expect(result).toEqual({ id: 'a1', email: 'x@test.dev', preferred_mode: 'home', label_pack: null });
  });

  it('preferences validates the body and delegates', async () => {
    const auth: any = mockAuthService();
    auth.updatePreferences.mockResolvedValue({ ok: true });
    const ctrl = new AuthController(auth);
    await ctrl.preferences(
      { user: { accountId: 'a1' } } as never,
      { preferred_mode: 'chef', label_pack: 'US' },
    );
    expect(auth.updatePreferences).toHaveBeenCalledWith('a1', {
      preferredMode: 'chef',
      labelPack: 'US',
    });
    await expect(
      ctrl.preferences({ user: { accountId: 'a1' } } as never, { preferred_mode: 'bogus' }),
    ).rejects.toThrow();
  });

  it('guest/session creates the session and sets both cookies', async () => {
    const auth: any = mockAuthService();
    auth.createGuestSession.mockResolvedValue({ guestSessionId: 'g1', csrf: 'csrf', reused: false });
    const res = mockRes();
    const ctrl = new AuthController(auth);
    await ctrl.guestSession({ cookies: {} } as never, res as never);
    expect(auth.createGuestSession).toHaveBeenCalledWith(null);
    expect(res.cookie).toHaveBeenCalledWith(
      'recipe_guest_session',
      'g1',
      expect.objectContaining({ httpOnly: true }),
    );
    expect(res.json).toHaveBeenCalledWith({ ok: true, guest_session_id: 'g1' });
  });

  it('guest/session reuses the existing cookie session (QA-B1)', async () => {
    const auth: any = mockAuthService();
    auth.createGuestSession.mockResolvedValue({ guestSessionId: 'g0', csrf: 'csrf', reused: true });
    const res = mockRes();
    const ctrl = new AuthController(auth);
    await ctrl.guestSession({ cookies: { recipe_guest_session: 'g0' } } as never, res as never);
    expect(auth.createGuestSession).toHaveBeenCalledWith('g0');
    expect(res.json).toHaveBeenCalledWith({ ok: true, guest_session_id: 'g0' });
  });

  it('guest/claim rejects when no guest cookie exists', async () => {
    const ctrl = new AuthController(mockAuthService() as never);
    await expect(
      ctrl.claimGuest({ user: { accountId: 'a1' }, cookies: {} } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('guest/claim claims the session', async () => {
    const auth: any = mockAuthService();
    auth.claimGuestSession.mockResolvedValue({ claimed: 'new' });
    const ctrl = new AuthController(auth);
    const result = await ctrl.claimGuest({
      user: { accountId: 'a1' },
      cookies: { recipe_guest_session: 'g1' },
    } as never);
    expect(result).toEqual({ ok: true, claimed: 'new' });
  });
});
