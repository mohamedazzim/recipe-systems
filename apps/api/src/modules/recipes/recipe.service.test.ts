import { NotFoundException } from '@nestjs/common';
import type { Actor } from '../../common/guards/guest-or-jwt.guard';
import { RecipeService, UNTITLED_RECIPE } from './recipe.service';

function mockPrisma() {
  return {
    recipe: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn(), update: jest.fn() },
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

describe('RecipeService — D-13 method attach (B4)', () => {
  const ownedRecipe = { id: 'r1', accountId: 'acc-1', guestSessionId: null };

  function mockOwned(updateResult: any) {
    const prisma: any = mockPrisma();
    prisma.recipe.findUnique.mockResolvedValue(ownedRecipe);
    prisma.recipe.update.mockResolvedValue(updateResult);
    return prisma;
  }

  it('paste persists method_text with tag METHOD and no inferred source (D-13C)', async () => {
    const prisma = mockOwned({
      ...ownedRecipe,
      methodText: 'Dry roast the spices…',
      methodSourceTag: 'METHOD',
      methodInferredSource: null,
    });
    const svc = new RecipeService(prisma);
    const state = await svc.attachMethod(userActor, 'r1', {
      mode: 'paste',
      methodText: 'Dry roast the spices…',
    });
    expect(prisma.recipe.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { methodText: 'Dry roast the spices…', methodSourceTag: 'METHOD', methodInferredSource: null },
    });
    expect(state).toEqual({ method_tag: 'METHOD', method_source: null, list_only: false });
  });

  it('inferred persists tag INFERRED with the named source (D-13D, A-13: never source-less)', async () => {
    const prisma = mockOwned({
      ...ownedRecipe,
      methodText: 'Boil tamarind, temper, simmer…',
      methodSourceTag: 'INFERRED',
      methodInferredSource: 'CDK 1669 / Mrs. Anitha',
    });
    const svc = new RecipeService(prisma);
    const state = await svc.attachMethod(userActor, 'r1', {
      mode: 'inferred',
      methodText: 'Boil tamarind, temper, simmer…',
      methodSource: 'CDK 1669 / Mrs. Anitha',
    });
    expect(prisma.recipe.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: {
        methodText: 'Boil tamarind, temper, simmer…',
        methodSourceTag: 'INFERRED',
        methodInferredSource: 'CDK 1669 / Mrs. Anitha',
      },
    });
    expect(state).toEqual({
      method_tag: 'INFERRED',
      method_source: 'CDK 1669 / Mrs. Anitha',
      list_only: false,
    });
  });

  it('none clears all three method columns → list_only true (D-13E; Views 3/7 INCOMPLETE flag)', async () => {
    const prisma = mockOwned({
      ...ownedRecipe,
      methodText: null,
      methodSourceTag: null,
      methodInferredSource: null,
    });
    const svc = new RecipeService(prisma);
    const state = await svc.attachMethod(userActor, 'r1', { mode: 'none' });
    expect(prisma.recipe.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { methodText: null, methodSourceTag: null, methodInferredSource: null },
    });
    expect(state).toEqual({ method_tag: null, method_source: null, list_only: true });
  });

  it('unknown persisted tags (CARD/UNKNOWN) never leak into the wire as method_tag', async () => {
    const prisma = mockOwned({
      ...ownedRecipe,
      methodText: '…',
      methodSourceTag: 'CARD',
      methodInferredSource: null,
    });
    const svc = new RecipeService(prisma);
    const state = await svc.attachMethod(userActor, 'r1', { mode: 'none' });
    expect(state.method_tag).toBeNull();
    expect(state.list_only).toBe(true);
  });

  it('404s for a foreign recipe — method state never leaks across accounts (INV-17)', async () => {
    const prisma: any = mockPrisma();
    prisma.recipe.findUnique.mockResolvedValue({ id: 'r1', accountId: 'acc-OTHER', guestSessionId: null });
    const svc = new RecipeService(prisma);
    await expect(
      svc.attachMethod(userActor, 'r1', { mode: 'paste', methodText: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.recipe.update).not.toHaveBeenCalled();
  });
});
