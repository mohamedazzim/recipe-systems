// D-27 (P7-3) unit tests — CleanupService guest-expiry sweep (Prisma + RecipeService mocked).

import { CleanupService } from './cleanup.service';

function recipesMock(overrides: Partial<{ deleteRecipeInternal: jest.Mock }> = {}) {
  return {
    deleteRecipeInternal: overrides.deleteRecipeInternal ?? jest.fn().mockResolvedValue([]),
  } as unknown as import('../recipes/recipe.service').RecipeService;
}

describe('CleanupService (D-27 guest expiry)', () => {
  function service(prisma: any, recipes = recipesMock()): CleanupService {
    return new CleanupService(prisma, recipes);
  }

  it('removes only expired, unclaimed guest sessions and their owned recipes', async () => {
    const prisma = {
      guestSession: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'g-expired' },
          { id: 'g-expired2' },
        ]),
        delete: jest.fn(),
      },
      recipe: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'r1' }, { id: 'r2' }])
          .mockResolvedValueOnce([]),
      },
      // BUG-015: the sweep also collects the guest's document-ingestion objects, so the
      // double has to answer that read. It is a separate aggregate from recipes.
      documentIngestion: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const recipes = recipesMock();
    const svc = service(prisma, recipes);

    const report = await svc.cleanupExpiredGuests(new Date('2026-09-15T00:00:00Z'));

    expect(prisma.guestSession.findMany).toHaveBeenCalledWith({
      where: { expiresAt: { lte: new Date('2026-09-15T00:00:00Z') }, claimedAt: null },
      select: { id: true },
    });
    expect(recipes.deleteRecipeInternal).toHaveBeenCalledTimes(2);
    expect(recipes.deleteRecipeInternal).toHaveBeenCalledWith('r1');
    expect(recipes.deleteRecipeInternal).toHaveBeenCalledWith('r2');
    expect(prisma.guestSession.delete).toHaveBeenCalledTimes(2);
    expect(report).toEqual({
      expired_sessions_found: 2,
      sessions_removed: 2,
      recipes_removed: 2,
      storage_residue_keys: 0,
    });
  });

  it('aggregates storage residue and reports it (never hides orphans)', async () => {
    const prisma = {
      guestSession: {
        findMany: jest.fn().mockResolvedValue([{ id: 'g1' }]),
        delete: jest.fn(),
      },
      recipe: { findMany: jest.fn().mockResolvedValue([{ id: 'r1' }]) },
      documentIngestion: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const recipes = recipesMock({
      deleteRecipeInternal: jest.fn().mockResolvedValue(['recipes/x.jpg']),
    });
    const svc = service(prisma, recipes);

    const report = await svc.cleanupExpiredGuests();

    expect(report.storage_residue_keys).toBe(1);
  });

  it('does nothing when no expired unclaimed sessions exist', async () => {
    const prisma = {
      guestSession: { findMany: jest.fn().mockResolvedValue([]), delete: jest.fn() },
      recipe: { findMany: jest.fn() },
      documentIngestion: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const recipes = recipesMock();
    const svc = service(prisma, recipes);

    const report = await svc.cleanupExpiredGuests();

    expect(report.expired_sessions_found).toBe(0);
    expect(recipes.deleteRecipeInternal).not.toHaveBeenCalled();
    expect(prisma.guestSession.delete).not.toHaveBeenCalled();
  });
});
