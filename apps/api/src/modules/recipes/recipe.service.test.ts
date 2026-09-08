import { NotFoundException } from '@nestjs/common';
import type { Actor } from '../../common/guards/guest-or-jwt.guard';
import { RecipeService, UNTITLED_RECIPE } from './recipe.service';

function mockPrisma() {
  return {
    recipe: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
    recipeInput: { count: jest.fn() },
  };
}

const userActor: Actor = {
  kind: 'user',
  user: { accountId: 'acc-1', email: 'chef@test.dev', sub: 's1' },
};
const guestActor: Actor = { kind: 'guest', guestSessionId: 'gs-1', expiresAt: new Date() };

describe('RecipeService', () => {
  it('creates an account-owned recipe with a placeholder title (D-10: no title input on intake)', async () => {
    const prisma: any = mockPrisma();
    prisma.recipe.create.mockResolvedValue({ id: 'r1' });
    const svc = new RecipeService(prisma);
    await svc.createForIntake(userActor, { rawText: 'Fish — 500g' });
    expect(prisma.recipe.create).toHaveBeenCalledWith({
      data: {
        title: UNTITLED_RECIPE,
        rawText: 'Fish — 500g',
        photoUri: null,
        accountId: 'acc-1',
      },
    });
  });

  it('creates a guest-owned recipe (XOR: no accountId set)', async () => {
    const prisma: any = mockPrisma();
    prisma.recipe.create.mockResolvedValue({ id: 'r1' });
    const svc = new RecipeService(prisma);
    await svc.createForIntake(guestActor, { photoUri: 's3://recipe-assets/recipes/a.jpg' });
    expect(prisma.recipe.create).toHaveBeenCalledWith({
      data: {
        title: UNTITLED_RECIPE,
        rawText: null,
        photoUri: 's3://recipe-assets/recipes/a.jpg',
        guestSessionId: 'gs-1',
      },
    });
  });

  it('assertOwned passes for the owning account', async () => {
    const prisma: any = mockPrisma();
    prisma.recipe.findUnique.mockResolvedValue({ id: 'r1', accountId: 'acc-1', guestSessionId: null });
    const svc = new RecipeService(prisma);
    await expect(svc.assertOwned(userActor, 'r1')).resolves.toMatchObject({ id: 'r1' });
  });

  it('assertOwned 404s for a foreign recipe (no existence leak, INV-17)', async () => {
    const prisma: any = mockPrisma();
    prisma.recipe.findUnique.mockResolvedValue({ id: 'r1', accountId: 'acc-OTHER', guestSessionId: null });
    const svc = new RecipeService(prisma);
    await expect(svc.assertOwned(userActor, 'r1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('assertOwned 404s for a missing recipe', async () => {
    const prisma: any = mockPrisma();
    prisma.recipe.findUnique.mockResolvedValue(null);
    const svc = new RecipeService(prisma);
    await expect(svc.assertOwned(userActor, 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('assertOwned 404s when a guest asks for an account-owned recipe', async () => {
    const prisma: any = mockPrisma();
    prisma.recipe.findUnique.mockResolvedValue({ id: 'r1', accountId: 'acc-1', guestSessionId: null });
    const svc = new RecipeService(prisma);
    await expect(svc.assertOwned(guestActor, 'r1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('removeIfIntakeEmpty deletes only recipes with zero intake rows (D-10K compensation)', async () => {
    const prisma: any = mockPrisma();
    prisma.recipe.findUnique.mockResolvedValue({ id: 'r1', accountId: 'acc-1', guestSessionId: null });
    prisma.recipeInput.count.mockResolvedValue(0);
    const svc = new RecipeService(prisma);
    await svc.removeIfIntakeEmpty(userActor, 'r1');
    expect(prisma.recipe.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
  });

  it('removeIfIntakeEmpty keeps the recipe once any intake row attached', async () => {
    const prisma: any = mockPrisma();
    prisma.recipe.findUnique.mockResolvedValue({ id: 'r1', accountId: 'acc-1', guestSessionId: null });
    prisma.recipeInput.count.mockResolvedValue(1);
    const svc = new RecipeService(prisma);
    await svc.removeIfIntakeEmpty(userActor, 'r1');
    expect(prisma.recipe.delete).not.toHaveBeenCalled();
  });
});
