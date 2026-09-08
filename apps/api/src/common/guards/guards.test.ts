import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { CsrfGuard } from './csrf.guard';
import { GuestOrJwtGuard } from './guest-or-jwt.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { signSession } from '../../modules/auth/session';

function ctx(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
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

  it('rejects an expired or claimed guest session', async () => {
    const guard = guardWith({
      guestSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'g1',
          expiresAt: new Date(Date.now() - 1000),
          claimedAt: null,
        }),
      },
    });
    await expect(guard.canActivate(ctx({ cookies: { recipe_guest_session: 'g1' } }))).resolves.toBe(false);

    const claimed = guardWith({
      guestSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'g1',
          expiresAt: new Date(Date.now() + 3600_000),
          claimedAt: new Date(),
        }),
      },
    });
    await expect(claimed.canActivate(ctx({ cookies: { recipe_guest_session: 'g1' } }))).resolves.toBe(false);
  });

  it('returns false when no identity is present', async () => {
    const guard = guardWith({});
    await expect(guard.canActivate(ctx({ cookies: {} }))).resolves.toBe(false);
  });
});
