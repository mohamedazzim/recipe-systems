import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { CsrfGuard } from './csrf.guard';
import { GuestOrJwtGuard } from './guest-or-jwt.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { signSession } from '../../modules/auth/session';

function ctx(req: Record<string, unknown>): ExecutionContext {
  const res = { cookie: jest.fn() };
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  const guard = new JwtAuthGuard();

  it('rejects a request without a session cookie', async () => {
    await expect(guard.canActivate(ctx({ cookies: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a tampered session cookie', async () => {
    await expect(
      guard.canActivate(ctx({ cookies: { recipe_session: 'garbage.token.value' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('attaches the verified session to the request', async () => {
    const token = await signSession({ accountId: 'a1', email: 'x@test.dev', sub: 's1' });
    const req: Record<string, unknown> = { cookies: { recipe_session: token } };
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    expect((req.user as { accountId: string }).accountId).toBe('a1');
  });

  it('slides the session cookie on an authenticated request (real-LLM latency regression)', async () => {
    const token = await signSession({ accountId: 'a1', email: 'x@test.dev', sub: 's1' });
    const req: Record<string, unknown> = { cookies: { recipe_session: token } };
    const res = { cookie: jest.fn() };
    await expect(
      guard.canActivate({
        switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
      } as unknown as ExecutionContext),
    ).resolves.toBe(true);
    expect(res.cookie).toHaveBeenCalledWith('recipe_session', token, expect.any(Object));
  });
});

describe('CsrfGuard', () => {
  const guard = new CsrfGuard();

  it('allows read-only requests without a token', () => {
    expect(guard.canActivate(ctx({ method: 'GET', cookies: {}, headers: {} }))).toBe(true);
  });

  it('rejects a state-changing request without a matching token', () => {
    expect(() =>
      guard.canActivate(ctx({ method: 'POST', cookies: {}, headers: {} })),
    ).toThrow(ForbiddenException);
    expect(() =>
      guard.canActivate(
        ctx({
          method: 'POST',
          cookies: { recipe_csrf: 'abc' },
          headers: { 'x-csrf-token': 'xyz' },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('accepts a matching double-submit token', () => {
    expect(
      guard.canActivate(
        ctx({
          method: 'PATCH',
          cookies: { recipe_csrf: 'abc' },
          headers: { 'x-csrf-token': 'abc' },
        }),
      ),
    ).toBe(true);
  });
});

describe('GuestOrJwtGuard', () => {
  function guardWith(prisma: Record<string, unknown>) {
    return new GuestOrJwtGuard(prisma as never);
  }

  it('resolves a signed-in user as the actor', async () => {
    const guard = guardWith({});
    const token = await signSession({ accountId: 'a1', email: 'x@test.dev', sub: 's1' });
    const req: Record<string, unknown> = { cookies: { recipe_session: token } };
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    expect((req.actor as { kind: string }).kind).toBe('user');
  });

  it('slides the session + CSRF cookies for the SSE polling path (long-running analysis regression)', async () => {
    const guard = guardWith({});
    const token = await signSession({ accountId: 'a1', email: 'x@test.dev', sub: 's1' });
    const req: Record<string, unknown> = {
      cookies: { recipe_session: token, recipe_csrf: 'csrf-v' },
    };
    const res = { cookie: jest.fn() };
    await expect(
      guard.canActivate({
        switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
      } as unknown as ExecutionContext),
    ).resolves.toBe(true);
    expect((req.actor as { kind: string }).kind).toBe('user');
    expect(res.cookie).toHaveBeenCalledWith('recipe_session', token, expect.any(Object));
    expect(res.cookie).toHaveBeenCalledWith(
      'recipe_csrf',
      'csrf-v',
      expect.objectContaining({ httpOnly: false }),
    );
  });

  it('resolves a valid guest session as the actor', async () => {
    const guard = guardWith({
      guestSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'g1',
          expiresAt: new Date(Date.now() + 3600_000),
          claimedAt: null,
        }),
      },
    });
    const req: Record<string, unknown> = { cookies: { recipe_guest_session: 'g1' } };
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    expect((req.actor as { kind: string }).kind).toBe('guest');
  });

  it('rejects an expired or claimed guest session with a clean 401', async () => {
    const guard = guardWith({
      guestSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'g1',
          expiresAt: new Date(Date.now() - 1000),
          claimedAt: null,
        }),
      },
    });
    await expect(guard.canActivate(ctx({ cookies: { recipe_guest_session: 'g1' } }))).rejects.toMatchObject({
      response: { code: 'SESSION_REQUIRED' },
    });

    const claimed = guardWith({
      guestSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'g1',
          expiresAt: new Date(Date.now() + 3600_000),
          claimedAt: new Date(),
        }),
      },
    });
    await expect(claimed.canActivate(ctx({ cookies: { recipe_guest_session: 'g1' } }))).rejects.toMatchObject({
      response: { code: 'SESSION_REQUIRED' },
    });
  });

  it('DEGRADES an unverifiable session cookie instead of throwing (guest fallback)', async () => {
    // verifySession throws on an expired/malformed token. That error used to escape
    // this guard, so EVERY guest-or-jwt route (intake, analyse, shopping, SSE)
    // answered 500 once the 8h session aged out — and the web layer, which reacts
    // only to 401, had nothing it could act on. It must fall through to the guest
    // cookie instead.
    const guard = guardWith({
      guestSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'g1',
          expiresAt: new Date(Date.now() + 3600_000),
          claimedAt: null,
        }),
      },
    });
    const req: Record<string, unknown> = {
      cookies: { recipe_session: 'expired.token.value', recipe_guest_session: 'g1' },
    };
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    expect((req.actor as { kind: string }).kind).toBe('guest');
  });

  it('answers a clean 401 (never a 500) for an unverifiable session with no guest cookie', async () => {
    const guard = guardWith({});
    await expect(
      guard.canActivate(ctx({ cookies: { recipe_session: 'expired.token.value' } })),
    ).rejects.toMatchObject({ response: { code: 'SESSION_REQUIRED' } });
  });

  it('throws a clean 401 SESSION_REQUIRED when no identity is present (never a bare 403)', async () => {
    const guard = guardWith({});
    await expect(guard.canActivate(ctx({ cookies: {} }))).rejects.toMatchObject({
      response: { code: 'SESSION_REQUIRED' },
    });
  });
});
