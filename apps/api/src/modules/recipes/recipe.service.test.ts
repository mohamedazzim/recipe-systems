import { Logger, NotFoundException } from '@nestjs/common';
import type { Actor } from '../../common/guards/guest-or-jwt.guard';
import { RecipeService, UNTITLED_RECIPE } from './recipe.service';

function mockPrisma() {
  return {
    recipe: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    },
    recipeInput: { count: jest.fn(), findMany: jest.fn() },
    analysis: { findFirst: jest.fn() },
    analysisView: { findUnique: jest.fn() },
    recipeIngredientLine: { count: jest.fn() },
    cookLog: { count: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
    cookLogPhoto: { findMany: jest.fn() },
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
    prisma.recipe.create.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111' });
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
    prisma.recipe.create.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111' });
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
    prisma.recipe.findUnique.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111', accountId: 'acc-1', guestSessionId: null });
    const svc = new RecipeService(prisma);
    await expect(svc.assertOwned(userActor, '11111111-1111-4111-8111-111111111111')).resolves.toMatchObject({ id: '11111111-1111-4111-8111-111111111111' });
  });

  it('assertOwned 404s for a foreign recipe (no existence leak, INV-17)', async () => {
    const prisma: any = mockPrisma();
    prisma.recipe.findUnique.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111', accountId: 'acc-OTHER', guestSessionId: null });
    const svc = new RecipeService(prisma);
    await expect(svc.assertOwned(userActor, '11111111-1111-4111-8111-111111111111')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('assertOwned 404s for a missing recipe', async () => {
    const prisma: any = mockPrisma();
    prisma.recipe.findUnique.mockResolvedValue(null);
    const svc = new RecipeService(prisma);
    await expect(svc.assertOwned(userActor, 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('assertOwned 404s for a malformed (non-UUID) id BEFORE Prisma (QA-B4)', async () => {
    const prisma: any = mockPrisma();
    const svc = new RecipeService(prisma);
    await expect(svc.assertOwned(userActor, 'not-a-uuid')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.recipe.findUnique).not.toHaveBeenCalled();
  });

  it('assertOwned 404s when a guest asks for an account-owned recipe', async () => {
    const prisma: any = mockPrisma();
    prisma.recipe.findUnique.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111', accountId: 'acc-1', guestSessionId: null });
    const svc = new RecipeService(prisma);
    await expect(svc.assertOwned(guestActor, '11111111-1111-4111-8111-111111111111')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('removeIfIntakeEmpty deletes only recipes with zero intake rows (D-10K compensation)', async () => {
    const prisma: any = mockPrisma();
    prisma.recipe.findUnique.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111', accountId: 'acc-1', guestSessionId: null });
    prisma.recipeInput.count.mockResolvedValue(0);
    const svc = new RecipeService(prisma);
    await svc.removeIfIntakeEmpty(userActor, '11111111-1111-4111-8111-111111111111');
    expect(prisma.recipe.delete).toHaveBeenCalledWith({ where: { id: '11111111-1111-4111-8111-111111111111' } });
  });

  it('removeIfIntakeEmpty keeps the recipe once any intake row attached', async () => {
    const prisma: any = mockPrisma();
    prisma.recipe.findUnique.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111', accountId: 'acc-1', guestSessionId: null });
    prisma.recipeInput.count.mockResolvedValue(1);
    const svc = new RecipeService(prisma);
    await svc.removeIfIntakeEmpty(userActor, '11111111-1111-4111-8111-111111111111');
    expect(prisma.recipe.delete).not.toHaveBeenCalled();
  });
});

describe('RecipeService — D-13 method attach (B4)', () => {
  const ownedRecipe = { id: '11111111-1111-4111-8111-111111111111', accountId: 'acc-1', guestSessionId: null };

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
    const state = await svc.attachMethod(userActor, '11111111-1111-4111-8111-111111111111', {
      mode: 'paste',
      methodText: 'Dry roast the spices…',
    });
    expect(prisma.recipe.update).toHaveBeenCalledWith({
      where: { id: '11111111-1111-4111-8111-111111111111' },
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
    const state = await svc.attachMethod(userActor, '11111111-1111-4111-8111-111111111111', {
      mode: 'inferred',
      methodText: 'Boil tamarind, temper, simmer…',
      methodSource: 'CDK 1669 / Mrs. Anitha',
    });
    expect(prisma.recipe.update).toHaveBeenCalledWith({
      where: { id: '11111111-1111-4111-8111-111111111111' },
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
    const state = await svc.attachMethod(userActor, '11111111-1111-4111-8111-111111111111', { mode: 'none' });
    expect(prisma.recipe.update).toHaveBeenCalledWith({
      where: { id: '11111111-1111-4111-8111-111111111111' },
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
    const state = await svc.attachMethod(userActor, '11111111-1111-4111-8111-111111111111', { mode: 'none' });
    expect(state.method_tag).toBeNull();
    expect(state.list_only).toBe(true);
  });

  it('404s for a foreign recipe — method state never leaks across accounts (INV-17)', async () => {
    const prisma: any = mockPrisma();
    prisma.recipe.findUnique.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111', accountId: 'acc-OTHER', guestSessionId: null });
    const svc = new RecipeService(prisma);
    await expect(
      svc.attachMethod(userActor, '11111111-1111-4111-8111-111111111111', { mode: 'paste', methodText: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.recipe.update).not.toHaveBeenCalled();
  });
});

describe('RecipeService — D-22 save + library (D1/D2)', () => {
  const RECIPE_ID = '11111111-1111-4111-8111-111111111111';
  const FAMILY = 'Coastal Tamil (Kanyakumari) style meen kuzhambu';
  const VIEW5_PAYLOAD = {
    family: FAMILY,
    architecture: 'Raw-ground coconut paste, triple sour',
    confidence: 'high',
    not_this: [],
    needs_review: true,
    tag: 'INFERRED',
  };

  function mockD22(overrides: Record<string, unknown> = {}) {
    const prisma: any = mockPrisma();
    prisma.recipe.findUnique.mockResolvedValue({
      id: RECIPE_ID,
      accountId: 'acc-1',
      guestSessionId: null,
      title: UNTITLED_RECIPE,
      rawText: 'Fish — 500g\nFenugreek — 1/4 Tsp',
      photoUri: null,
    });
    prisma.analysis.findFirst.mockResolvedValue({ id: 'an-1', family: null });
    prisma.analysisView.findUnique.mockResolvedValue({ payload: VIEW5_PAYLOAD });
    prisma.recipeIngredientLine.count.mockResolvedValue(11);
    prisma.recipe.findUniqueOrThrow = jest.fn().mockResolvedValue({ updatedAt: new Date('2026-09-10T12:00:00Z') });
    prisma.recipe.findMany.mockResolvedValue([
      { id: RECIPE_ID, title: 'Untitled recipe', createdAt: new Date('2026-09-10T11:00:00Z') },
    ]);
    prisma.cookLog.count.mockResolvedValue(0);
    prisma.cookLog.findFirst.mockResolvedValue(null);
    Object.assign(prisma.recipe, overrides.recipe ?? {});
    Object.assign(prisma.analysis, overrides.analysis ?? {});
    Object.assign(prisma.analysisView, overrides.analysisView ?? {});
    Object.assign(prisma.cookLog, overrides.cookLog ?? {});
    return prisma;
  }

  it('save with no title applies the family default and reports the artifact set (D1 AC-1/AC-2)', async () => {
    const prisma = mockD22();
    const svc = new RecipeService(prisma);
    const wire = await svc.saveRecipe(userActor, RECIPE_ID, {});
    expect(prisma.recipe.update).toHaveBeenCalledWith({ where: { id: RECIPE_ID }, data: { title: FAMILY } });
    expect(wire).toEqual({
      recipe_id: RECIPE_ID,
      title: FAMILY,
      saved_at: '2026-09-10T12:00:00.000Z',
      artifacts: {
        raw_input: true,
        photo: false,
        object: true,
        identification: true,
        analysis: true,
        timestamps: true,
      },
    });
  });

  it('save accepts an explicit editable title and never overwrites a non-placeholder name silently (AC-2)', async () => {
    const prisma = mockD22();
    prisma.recipe.findUnique.mockResolvedValue({
      id: RECIPE_ID, accountId: 'acc-1', guestSessionId: null, title: 'My curry', rawText: null, photoUri: null,
    });
    const svc = new RecipeService(prisma);
    const named = await svc.saveRecipe(userActor, RECIPE_ID, { title: 'Sunday fish curry' });
    expect(named.title).toBe('Sunday fish curry');
    expect(prisma.recipe.update).toHaveBeenCalledWith({
      where: { id: RECIPE_ID },
      data: { title: 'Sunday fish curry' },
    });
    // blank title keeps the existing (already named) recipe title
    const blank = await svc.saveRecipe(userActor, RECIPE_ID, { title: '   ' });
    expect(blank.title).toBe('My curry');
  });

  it('save falls back to the analysis.family column when populated, and stays honest without identification', async () => {
    const prisma = mockD22({ analysis: { findFirst: jest.fn().mockResolvedValue({ id: 'an-1', family: 'Column family' }) } });
    const svc = new RecipeService(prisma);
    expect((await svc.saveRecipe(userActor, RECIPE_ID, {})).title).toBe('Column family');

    const noId = mockD22({ analysis: { findFirst: jest.fn().mockResolvedValue(null) } });
    const svc2 = new RecipeService(noId);
    expect((await svc2.saveRecipe(userActor, RECIPE_ID, {})).title).toBe(UNTITLED_RECIPE);
    expect(noId.analysisView.findUnique).not.toHaveBeenCalled();
  });

  it('guest save is allowed (A1 TC-02 seam) and rides the same ownership guard', async () => {
    const prisma = mockD22();
    prisma.recipe.findUnique.mockResolvedValue({
      id: RECIPE_ID, accountId: null, guestSessionId: 'gs-1', title: UNTITLED_RECIPE, rawText: null, photoUri: null,
    });
    const svc = new RecipeService(prisma);
    expect((await svc.saveRecipe(guestActor, RECIPE_ID, {})).title).toBe(FAMILY);
    // foreign guest → 404 (INV-17)
    prisma.recipe.findUnique.mockResolvedValue({
      id: RECIPE_ID, accountId: null, guestSessionId: 'gs-OTHER', title: UNTITLED_RECIPE, rawText: null, photoUri: null,
    });
    await expect(svc.saveRecipe(guestActor, RECIPE_ID, {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it('library returns canonical D2 AC-1 rows with the cook-log indicator and D-24 last cooked', async () => {
    const prisma = mockD22();
    prisma.recipe.findMany.mockResolvedValue([
      { id: RECIPE_ID, title: 'Sunday fish curry', createdAt: new Date('2026-09-10T11:00:00Z') },
      { id: '22222222-2222-4222-8222-222222222222', title: FAMILY, createdAt: new Date('2026-09-09T11:00:00Z') },
    ]);
    prisma.cookLog.findFirst
      .mockResolvedValueOnce({ cookedAt: new Date('2026-09-12T00:00:00Z') })
      .mockResolvedValueOnce(null);
    const svc = new RecipeService(prisma);
    const rows = await svc.listLibrary(userActor);
    expect(prisma.recipe.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountId: 'acc-1', deletedAt: null },
        orderBy: { updatedAt: 'desc' },
      }),
    );
    expect(rows).toEqual([
      {
        recipe_id: RECIPE_ID,
        name: 'Sunday fish curry',
        date: '2026-09-10T11:00:00.000Z',
        family: FAMILY,
        has_cook_log: true,
        last_cooked_at: '2026-09-12',
      },
      {
        recipe_id: '22222222-2222-4222-8222-222222222222',
        name: FAMILY,
        date: '2026-09-09T11:00:00.000Z',
        family: FAMILY,
        has_cook_log: false,
        last_cooked_at: null,
      },
    ]);
  });

  it('guest library is empty — the canonical library is account-owned (D-22D)', async () => {
    const prisma = mockD22();
    const svc = new RecipeService(prisma);
    expect(await svc.listLibrary(guestActor)).toEqual([]);
    expect(prisma.recipe.findMany).not.toHaveBeenCalled();
  });
});

describe('RecipeService — D-22 D6 delete (RS-US-24)', () => {
  const RECIPE_ID = '11111111-1111-4111-8111-111111111111';
  const PREFIX = 's3://recipe-assets/';

  function mockDelete(overrides: { owned?: boolean; recipe?: unknown } = {}) {
    const prisma: any = mockPrisma();
    prisma.recipe.findUnique.mockResolvedValue(
      overrides.owned === false
        ? { id: RECIPE_ID, accountId: 'acc-OTHER', guestSessionId: null }
        : {
            id: RECIPE_ID,
            accountId: 'acc-1',
            guestSessionId: null,
            title: 'My curry',
            rawText: null,
            photoUri: `${PREFIX}recipes/main.jpg`,
          },
    );
    prisma.recipe.delete.mockResolvedValue({});
    prisma.recipe.findUniqueOrThrow.mockResolvedValue({ photoUri: `${PREFIX}recipes/main.jpg` });
    prisma.recipeInput.findMany.mockResolvedValue([
      { photoUri: `${PREFIX}recipes/raw-a.jpg` },
      { photoUri: null },
      { photoUri: 's3://other-bucket/not-ours.jpg' },
    ]);
    prisma.cookLog.findMany.mockResolvedValue([{ id: 'log-1' }]);
    prisma.cookLogPhoto.findMany.mockResolvedValue([{ photoUri: `${PREFIX}logs/plate.jpg` }]);
    return prisma;
  }

  function fakeStorage(tryDeleteResult: boolean | ((key: string) => boolean) = true) {
    return {
      bucket: 'recipe-assets',
      tryDeleteObject: jest.fn((key: string) =>
        Promise.resolve(typeof tryDeleteResult === 'function' ? tryDeleteResult(key) : tryDeleteResult),
      ),
    };
  }

  it('owned delete removes the row and cleans only our own asset keys (DB first, storage compensating)', async () => {
    const prisma = mockDelete();
    const storage = fakeStorage();
    const svc = new RecipeService(prisma, storage as never);
    await svc.deleteRecipe(userActor, RECIPE_ID);
    expect(prisma.recipe.delete).toHaveBeenCalledWith({ where: { id: RECIPE_ID } });
    expect(storage.tryDeleteObject).toHaveBeenCalledTimes(3);
    expect(storage.tryDeleteObject.mock.calls.map((c) => c[0])).toEqual([
      'recipes/main.jpg',
      'recipes/raw-a.jpg',
      'logs/plate.jpg',
    ]);
  });

  it('INV-17: foreign owner gets 404 and nothing is deleted', async () => {
    const prisma = mockDelete({ owned: false });
    const svc = new RecipeService(prisma, fakeStorage() as never);
    await expect(svc.deleteRecipe(userActor, RECIPE_ID)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.recipe.delete).not.toHaveBeenCalled();
  });

  it('malformed and missing ids are clean 404s BEFORE Prisma (QA-B4 posture)', async () => {
    const prisma = mockDelete();
    const svc = new RecipeService(prisma, fakeStorage() as never);
    await expect(svc.deleteRecipe(userActor, 'not-a-uuid')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.recipe.findUnique).not.toHaveBeenCalled();
    prisma.recipe.findUnique.mockResolvedValue(null);
    await expect(svc.deleteRecipe(userActor, RECIPE_ID)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.recipe.delete).not.toHaveBeenCalled();
  });

  it('storage residue is observable (warn) and never fails the delete (ADR §16, D6-4)', async () => {
    const prisma = mockDelete();
    const storage = fakeStorage((key) => key !== 'recipes/raw-a.jpg'); // one failure
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const svc = new RecipeService(prisma, storage as never);
    await expect(svc.deleteRecipe(userActor, RECIPE_ID)).resolves.toBeUndefined();
    expect(prisma.recipe.delete).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('residue'));
    warnSpy.mockRestore();
  });

  it('without storage wiring the DB delete still runs (unit-test posture; no keys collected)', async () => {
    const prisma = mockDelete();
    const svc = new RecipeService(prisma);
    await svc.deleteRecipe(userActor, RECIPE_ID);
    expect(prisma.recipe.delete).toHaveBeenCalled();
    expect(prisma.cookLogPhoto.findMany).not.toHaveBeenCalled();
  });
});
