import { AuthService } from './auth.service';
import { decodeSession, signOAuthState, signSession, verifySession } from './session';
import { AccountService } from '../account/account.service';

function mockIdentity() {
  return {
    buildAuthorizationUrl: jest.fn().mockReturnValue('https://idp/auth?...'),
    buildRegistrationUrl: jest.fn().mockReturnValue('https://idp/register'),
    buildPasswordResetUrl: jest.fn().mockReturnValue('https://idp/reset'),
    buildLogoutUrl: jest.fn().mockReturnValue('https://idp/logout?post_logout_redirect_uri=http%3A%2F%2Flocalhost%3A3000'),
    handleCallback: jest.fn(),
    verifyIdToken: jest.fn(),
  };
}

function mockPrisma(): any {
  return {
    guestSession: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    recipe: { updateMany: jest.fn() },
    account: { findUnique: jest.fn() },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockPrisma())),
  };
}

function mockAccounts(): any {
  return {
    upsertForSignIn: jest.fn(),
    updatePreferences: jest.fn(),
    findByEmail: jest.fn(),
    touchLogin: jest.fn(),
  };
}

describe('AuthService', () => {
  it('beginLogin returns an authorization URL and a signed state cookie', async () => {
    const svc = new AuthService(mockIdentity() as any, mockPrisma() as any, mockAccounts() as any);
    const result = await svc.beginLogin('/');
    expect(result.authorizationUrl).toContain('https://idp/auth');
    expect(result.stateCookie).toBeTruthy();
  });

  it('completeLogin verifies state and issues a session for the upserted account', async () => {
    const identity = mockIdentity();
    identity.handleCallback.mockResolvedValue({ sub: 's1', email: 'x@test.dev', idTokenHint: 'id-token-1' });
    const accounts = mockAccounts();
    accounts.upsertForSignIn.mockResolvedValue({ id: 'a1', email: 'x@test.dev' });
    const svc = new AuthService(identity as any, mockPrisma() as any, accounts as any);
    const stateCookie = await signOAuthState({ state: 'st-1', nonce: 'nc-1', redirectTo: '/home' });
    const result = await svc.completeLogin('code', 'st-1', stateCookie);
    expect(result.email).toBe('x@test.dev');
    expect(result.redirectTo).toBe('/home');
    expect(result.session).toBeTruthy();
    expect(result.csrf).toBeTruthy();
    // The verified ID token is retained in the session for RP-initiated logout.
    const sessionPayload = await verifySession(result.session);
    expect(sessionPayload.idTokenHint).toBeUndefined(); // not re-exposed to guards
    expect(decodeSession(result.session).idTokenHint).toBe('id-token-1');
  });

  it('completeLogin rejects a state mismatch', async () => {
    const svc = new AuthService(mockIdentity() as any, mockPrisma() as any, mockAccounts() as any);
    const stateCookie = await signOAuthState({ state: 'st-1', nonce: 'nc-1', redirectTo: '/' });
    await expect(svc.completeLogin('code', 'other-state', stateCookie)).rejects.toThrow('state');
  });

  it('completeLogin rejects a malformed identity email and never creates an account', async () => {
    const identity = mockIdentity();
    identity.handleCallback.mockResolvedValue({
      sub: 's1',
      email: 'demo@gmail.c', // malformed: single-letter TLD
      idTokenHint: 'id-token-1',
    });
    const prisma = mockPrisma() as any;
    prisma.account.upsert = jest.fn().mockResolvedValue({ id: 'a1', email: 'demo@gmail.c' });
    // Real AccountService so the application-boundary validation actually runs.
    const accounts = new AccountService(prisma);
    const svc = new AuthService(identity as any, prisma, accounts);
    const stateCookie = await signOAuthState({ state: 'st-1', nonce: 'nc-1', redirectTo: '/' });
    await expect(svc.completeLogin('code', 'st-1', stateCookie)).rejects.toThrow(
      'identity email rejected',
    );
    expect(prisma.account.upsert).not.toHaveBeenCalled();
  });

  it('claimGuestSession moves guest recipes and marks the session claimed', async () => {
    const tx = {
      guestSession: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'g1',
            expiresAt: new Date(Date.now() + 3600_000),
            claimedAt: null,
            claimedByAccountId: null,
          })
          .mockResolvedValueOnce({
            id: 'g1',
            expiresAt: new Date(Date.now() + 3600_000),
            claimedAt: new Date(),
            claimedByAccountId: 'a1',
          }),
        update: jest.fn().mockResolvedValue({}),
      },
      recipe: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    const prisma: any = mockPrisma();
    prisma.$transaction.mockImplementation(async (fn: (t: unknown) => Promise<unknown>) => fn(tx));
    const svc = new AuthService(mockIdentity() as any, prisma, mockAccounts() as any);
    const result = await svc.claimGuestSession('a1', 'g1');
    expect(result.claimed).toBe('new');
    // XOR-respecting move: guest recipes become account-owned, guest link cleared.
    expect(tx.recipe.updateMany).toHaveBeenCalledWith({
      where: { guestSessionId: 'g1' },
      data: { accountId: 'a1', guestSessionId: null },
    });
    expect(tx.guestSession.update).toHaveBeenCalledWith({
      where: { id: 'g1' },
      data: { claimedAt: expect.any(Date), claimedByAccountId: 'a1' },
    });
    // second claim by the same account is idempotent
    const again = await svc.claimGuestSession('a1', 'g1');
    expect(again.claimed).toBe('already');
  });

  it('claimGuestSession rejects a session claimed by another account', async () => {
    const tx = {
      guestSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'g1',
          expiresAt: new Date(Date.now() + 3600_000),
          claimedAt: new Date(),
          claimedByAccountId: 'other',
        }),
        update: jest.fn(),
      },
      recipe: { updateMany: jest.fn() },
    };
    const prisma: any = mockPrisma();
    prisma.$transaction.mockImplementation(async (fn: (t: unknown) => Promise<unknown>) => fn(tx));
    const svc = new AuthService(mockIdentity() as any, prisma, mockAccounts() as any);
    await expect(svc.claimGuestSession('a1', 'g1')).rejects.toThrow('already claimed');
  });

  it('claimGuestSession rejects an expired guest session', async () => {
    const tx = {
      guestSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'g1',
          expiresAt: new Date(Date.now() - 1000),
          claimedAt: null,
          claimedByAccountId: null,
        }),
        update: jest.fn(),
      },
      recipe: { updateMany: jest.fn() },
    };
    const prisma: any = mockPrisma();
    prisma.$transaction.mockImplementation(async (fn: (t: unknown) => Promise<unknown>) => fn(tx));
    const svc = new AuthService(mockIdentity() as any, prisma, mockAccounts() as any);
    await expect(svc.claimGuestSession('a1', 'g1')).rejects.toThrow('expired');
  });

  it('createGuestSession creates a row with a TTL and returns a csrf token', async () => {
    const prisma: any = mockPrisma();
    prisma.guestSession.create.mockResolvedValue({ id: 'g2' });
    const svc = new AuthService(mockIdentity() as any, prisma, mockAccounts() as any);
    const result = await svc.createGuestSession(null);
    expect(result.guestSessionId).toBe('g2');
    expect(result.reused).toBe(false);
    expect(result.csrf).toBeTruthy();
    expect(prisma.guestSession.create).toHaveBeenCalledWith({
      data: { expiresAt: expect.any(Date) },
    });
  });

  it('createGuestSession REUSES a valid unclaimed unexpired cookie session (QA-B1)', async () => {
    const prisma: any = mockPrisma();
    prisma.guestSession.findUnique.mockResolvedValue({
      id: 'g1',
      claimedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const svc = new AuthService(mockIdentity() as any, prisma, mockAccounts() as any);
    const result = await svc.createGuestSession('g1');
    expect(result.guestSessionId).toBe('g1');
    expect(result.reused).toBe(true);
    expect(result.csrf).toBeTruthy();
    expect(prisma.guestSession.create).not.toHaveBeenCalled();
  });

  it('createGuestSession mints a fresh session when the cookie is claimed, expired, or unknown (QA-B1)', async () => {
    const prisma: any = mockPrisma();
    prisma.guestSession.create.mockResolvedValue({ id: 'fresh' });
    const svc = new AuthService(mockIdentity() as any, prisma, mockAccounts() as any);

    prisma.guestSession.findUnique.mockResolvedValue({
      id: 'g1',
      claimedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(svc.createGuestSession('g1')).resolves.toMatchObject({ guestSessionId: 'fresh' });

    prisma.guestSession.findUnique.mockResolvedValue({
      id: 'g1',
      claimedAt: null,
      expiresAt: new Date(Date.now() - 60_000),
    });
    await expect(svc.createGuestSession('g1')).resolves.toMatchObject({ guestSessionId: 'fresh' });

    prisma.guestSession.findUnique.mockResolvedValue(null);
    await expect(svc.createGuestSession('g1')).resolves.toMatchObject({ guestSessionId: 'fresh' });
  });

  it('exposes IdP URLs for password reset', () => {
    const svc = new AuthService(mockIdentity() as any, mockPrisma() as any, mockAccounts() as any);
    expect(svc.getPasswordResetUrl()).toBe('https://idp/reset');
  });

  it('beginSignup returns a registration URL and a signed state cookie', async () => {
    const identity = mockIdentity();
    identity.buildRegistrationUrl.mockReturnValue('https://idp/registrations?...');
    const svc = new AuthService(identity as any, mockPrisma() as any, mockAccounts() as any);
    const result = await svc.beginSignup('/');
    expect(result.registrationUrl).toContain('https://idp/registrations');
    expect(result.stateCookie).toBeTruthy();
    expect(identity.buildRegistrationUrl).toHaveBeenCalledWith(
      expect.objectContaining({ state: expect.any(String), nonce: expect.any(String) }),
    );
  });

  it('me() returns the mapped account row', async () => {
    const prisma: any = mockPrisma();
    prisma.account.findUnique.mockResolvedValue({
      id: 'a1',
      email: 'x@test.dev',
      preferredMode: 'home',
      labelPack: null,
    });
    const svc = new AuthService(mockIdentity() as any, prisma, mockAccounts() as any);
    const row = await svc.me('a1');
    expect(row).toEqual({ id: 'a1', email: 'x@test.dev', preferred_mode: 'home', label_pack: null });
  });

  it('readLogoutHint recovers the id_token_hint from a session token, tolerating garbage', async () => {
    const svc = new AuthService(mockIdentity() as any, mockPrisma() as any, mockAccounts() as any);
    const session = await signSession({
      accountId: 'a1',
      email: 'x@test.dev',
      sub: 's1',
      idTokenHint: 'hint-1',
    });
    expect(svc.readLogoutHint(session)).toBe('hint-1');
    expect(svc.readLogoutHint('not.a.jwt')).toBeUndefined();
    expect(svc.readLogoutHint(undefined)).toBeUndefined();
  });

  it('getLogoutRedirectUrl passes the id_token_hint through to the IdP', async () => {
    const identity = mockIdentity();
    const svc = new AuthService(identity as any, mockPrisma() as any, mockAccounts() as any);
    svc.getLogoutRedirectUrl('http://localhost:3000', 'hint-1');
    expect(identity.buildLogoutUrl).toHaveBeenCalledWith('http://localhost:3000', 'hint-1');
  });
});
