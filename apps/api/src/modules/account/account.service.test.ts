import { AccountService } from './account.service';

describe('AccountService', () => {
  function mockPrisma() {
    return {
      account: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };
  }

  it('upserts the account on first sign-in (auth_provider sso, home mode)', async () => {
    const prisma: any = mockPrisma();
    prisma.account.upsert.mockResolvedValue({ id: 'a1', email: 'x@test.dev' });
    const svc = new AccountService(prisma);
    await svc.upsertForSignIn({ email: 'x@test.dev' });
    expect(prisma.account.upsert).toHaveBeenCalledWith({
      where: { email: 'x@test.dev' },
      update: expect.objectContaining({ updatedAt: expect.any(Date) }),
      create: {
        email: 'x@test.dev',
        authProvider: 'sso',
        preferredMode: 'home',
      },
    });
  });

  it('finds an account by email', async () => {
    const prisma: any = mockPrisma();
    prisma.account.findUnique.mockResolvedValue({ id: 'a1', email: 'x@test.dev' });
    const svc = new AccountService(prisma);
    const found = await svc.findByEmail('x@test.dev');
    expect(prisma.account.findUnique).toHaveBeenCalledWith({ where: { email: 'x@test.dev' } });
    expect(found?.id).toBe('a1');
  });

  it('updates preferences and maps the row', async () => {
    const prisma: any = mockPrisma();
    prisma.account.update.mockResolvedValue({
      id: 'a1',
      email: 'x@test.dev',
      preferredMode: 'chef',
      labelPack: 'US',
    });
    const svc = new AccountService(prisma);
    const row = await svc.updatePreferences('a1', { preferredMode: 'chef', labelPack: 'US' });
    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { preferredMode: 'chef', labelPack: 'US' },
    });
    expect(row).toEqual({ id: 'a1', email: 'x@test.dev', preferred_mode: 'chef', label_pack: 'US' });
  });

  it('upserts idempotently on a duplicate email (second sign-in updates, never duplicates)', async () => {
    const prisma: any = mockPrisma();
    const existing = { id: 'a1', email: 'dup@test.dev' };
    prisma.account.upsert.mockResolvedValue(existing);
    const svc = new AccountService(prisma);
    const first = await svc.upsertForSignIn({ email: 'dup@test.dev' });
    const second = await svc.upsertForSignIn({ email: 'dup@test.dev' });
    expect(first.id).toBe('a1');
    expect(second.id).toBe('a1');
    // both calls keyed on the unique email; a duplicate sign-in takes the update branch
    expect(prisma.account.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.account.upsert.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        where: { email: 'dup@test.dev' },
        update: expect.objectContaining({ updatedAt: expect.any(Date) }),
      }),
    );
  });

  it('normalizes the email before upsert (trim + lowercase is the stored form)', async () => {
    const prisma: any = mockPrisma();
    prisma.account.upsert.mockResolvedValue({ id: 'a1', email: 'user@example.com' });
    const svc = new AccountService(prisma);
    await svc.upsertForSignIn({ email: '  User@Example.COM ' });
    expect(prisma.account.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: 'user@example.com' },
        create: expect.objectContaining({ email: 'user@example.com' }),
      }),
    );
  });

  it.each([
    ['demo@gmail.c', 'MALFORMED'],
    ['not-an-email', 'MALFORMED'],
    ['   ', 'EMPTY'],
    ['', 'EMPTY'],
  ])('rejects invalid identity email %j and never calls the database (%s)', async (email, code) => {
    const prisma: any = mockPrisma();
    const svc = new AccountService(prisma);
    const attempt = svc.upsertForSignIn({ email });
    await expect(attempt).rejects.toThrow('identity email rejected');
    await attempt.catch((err: Error & { code?: string }) => {
      expect(err.code).toBe(code);
    });
    expect(prisma.account.upsert).not.toHaveBeenCalled();
  });

  it('touches last-login without changing identity fields', async () => {
    const prisma: any = mockPrisma();
    prisma.account.update.mockResolvedValue({});
    const svc = new AccountService(prisma);
    await svc.touchLogin('a1');
    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { updatedAt: expect.any(Date) },
    });
  });
});
