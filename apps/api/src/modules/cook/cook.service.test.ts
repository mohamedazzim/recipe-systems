import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Actor } from '../../common/guards/guest-or-jwt.guard';
import { RecipeService } from '../recipes/recipe.service';
import {
  CookService,
  localToday,
  parseCookDate,
} from './cook.service';

const RECIPE_ID = '11111111-1111-4111-8111-111111111111';
const LOG_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_LOG_ID = '33333333-3333-4333-8333-333333333333';

function mockPrisma() {
  return {
    recipe: { findUnique: jest.fn() },
    cookLog: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
}

const userActor: Actor = {
  kind: 'user',
  user: { accountId: 'acc-1', email: 'chef@test.dev', sub: 's1' },
};
const guestActor: Actor = { kind: 'guest', guestSessionId: 'gs-1', expiresAt: new Date() };

function ownedRecipe(overrides: Record<string, unknown> = {}) {
  return {
    id: RECIPE_ID,
    accountId: 'acc-1',
    guestSessionId: null,
    title: 'Sunday fish curry',
    rawText: null,
    photoUri: null,
    ...overrides,
  };
}

function logRow(overrides: Record<string, unknown> = {}) {
  return {
    id: LOG_ID,
    recipeId: RECIPE_ID,
    cookedAt: new Date('2026-09-12T00:00:00Z'),
    rating: 4,
    note: '2 green chillies, fenugreek powder off heat',
    nextTimeInstruction: null,
    createdAt: new Date('2026-09-12T10:00:00Z'),
    ...overrides,
  };
}

describe('CookService (D-24 F1/F2/F6)', () => {
  it('logCook defaults cook_date to today (F1 TC-01) and persists rating + note', async () => {
    const prisma: any = mockPrisma();
    prisma.recipe.findUnique.mockResolvedValue(ownedRecipe());
    prisma.cookLog.create.mockResolvedValue(logRow({ cookedAt: new Date(`${localToday()}T00:00:00Z`) }));
    const svc = new CookService(prisma, new RecipeService(prisma));
    const wire = await svc.logCook(userActor, RECIPE_ID, { rating: 4, note: 'Fish held.' });
    expect(prisma.cookLog.create).toHaveBeenCalledWith({
      data: {
        recipeId: RECIPE_ID,
        cookedAt: new Date(`${localToday()}T00:00:00Z`),
        rating: 4,
        note: 'Fish held.',
      },
    });
    expect(wire.cook_date).toBe(localToday());
    expect(wire.cook_log_id).toBe(LOG_ID);
    expect(wire.next_time).toBeNull();
    expect(wire.created_at).toBe('2026-09-12T10:00:00.000Z');
  });

  it('logCook stores an explicit editable cook_date and omits optional rating/note (F1 AC-1, F2 AC-2)', async () => {
    const prisma: any = mockPrisma();
    prisma.recipe.findUnique.mockResolvedValue(ownedRecipe());
    prisma.cookLog.create.mockImplementation(async ({ data }: any) => ({
      ...logRow(),
      ...data,
      id: LOG_ID,
      createdAt: new Date('2026-09-12T10:00:00Z'),
    }));
    const svc = new CookService(prisma, new RecipeService(prisma));
    const wire = await svc.logCook(userActor, RECIPE_ID, { cookDate: '2026-09-01', rating: null, note: null });
    expect(prisma.cookLog.create).toHaveBeenCalledWith({
      data: {
        recipeId: RECIPE_ID,
        cookedAt: new Date('2026-09-01T00:00:00Z'),
        rating: null,
        note: null,
      },
    });
    expect(wire.cook_date).toBe('2026-09-01');
    expect(wire.rating).toBeNull();
    expect(wire.note).toBeNull();
  });

  it('logCook refuses an impossible calendar date and out-of-range ratings (service-level defense)', async () => {
    const prisma: any = mockPrisma();
    prisma.recipe.findUnique.mockResolvedValue(ownedRecipe());
    const svc = new CookService(prisma, new RecipeService(prisma));
    for (const bad of ['2026-02-31', 'not-a-date']) {
      await expect(svc.logCook(userActor, RECIPE_ID, { cookDate: bad })).rejects.toMatchObject({
        constructor: BadRequestException,
        response: { code: 'INVALID_COOK_LOG' },
      });
    }
    for (const bad of [0, 6, 1.5, -1]) {
      await expect(svc.logCook(userActor, RECIPE_ID, { rating: bad })).rejects.toMatchObject({
        constructor: BadRequestException,
        response: { code: 'INVALID_COOK_LOG' },
      });
    }
    expect(prisma.cookLog.create).not.toHaveBeenCalled();
  });

  it('logCook is INV-17 guarded — foreign recipe is a canonical 404 (no existence leak)', async () => {
    const prisma: any = mockPrisma();
    prisma.recipe.findUnique.mockResolvedValue(ownedRecipe({ accountId: 'acc-OTHER' }));
    const svc = new CookService(prisma, new RecipeService(prisma));
    await expect(svc.logCook(userActor, RECIPE_ID, {})).rejects.toMatchObject({
      constructor: NotFoundException,
      response: { code: 'RECIPE_NOT_FOUND' },
    });
    expect(prisma.cookLog.create).not.toHaveBeenCalled();
  });

  it('guests log on their own session recipe (the existing ownership/session contract)', async () => {
    const prisma: any = mockPrisma();
    prisma.recipe.findUnique.mockResolvedValue(ownedRecipe({ accountId: null, guestSessionId: 'gs-1' }));
    prisma.cookLog.create.mockResolvedValue(logRow());
    const svc = new CookService(prisma, new RecipeService(prisma));
    const wire = await svc.logCook(guestActor, RECIPE_ID, {});
    expect(wire.cook_log_id).toBe(LOG_ID);
  });

  it('listCookLogs returns the wire ordered newest-cook first (the ERD index order)', async () => {
    const prisma: any = mockPrisma();
    prisma.recipe.findUnique.mockResolvedValue(ownedRecipe());
    prisma.cookLog.findMany.mockResolvedValue([
      logRow({ id: 'a', cookedAt: new Date('2026-09-12T00:00:00Z') }),
      logRow({ id: 'b', cookedAt: new Date('2026-09-01T00:00:00Z'), rating: null, note: null }),
    ]);
    const svc = new CookService(prisma, new RecipeService(prisma));
    const items = await svc.listCookLogs(userActor, RECIPE_ID);
    expect(prisma.cookLog.findMany).toHaveBeenCalledWith({
      where: { recipeId: RECIPE_ID },
      orderBy: [{ cookedAt: 'desc' }, { createdAt: 'desc' }],
    });
    expect(items.map((i) => i.cook_log_id)).toEqual(['a', 'b']);
    expect(items[0].cook_date).toBe('2026-09-12');
    expect(items[0].note).toBe('2 green chillies, fenugreek powder off heat');
    expect(items[1].rating).toBeNull();
  });

  it('lastCook returns the latest log summary, and the null-safe empty case (F6)', async () => {
    const prisma: any = mockPrisma();
    prisma.recipe.findUnique.mockResolvedValue(ownedRecipe());
    prisma.cookLog.findFirst.mockResolvedValue({
      cookedAt: new Date('2026-09-12T00:00:00Z'),
      rating: 4,
      nextTimeInstruction: '2 green chillies, fenugreek powder off heat',
    });
    const svc = new CookService(prisma, new RecipeService(prisma));
    const summary = await svc.lastCook(userActor, RECIPE_ID);
    expect(prisma.cookLog.findFirst).toHaveBeenCalledWith({
      where: { recipeId: RECIPE_ID },
      orderBy: [{ cookedAt: 'desc' }, { createdAt: 'desc' }],
      select: { cookedAt: true, rating: true, nextTimeInstruction: true },
    });
    expect(summary).toEqual({
      last_cooked_at: '2026-09-12',
      rating: 4,
      next_time: '2 green chillies, fenugreek powder off heat',
    });

    prisma.cookLog.findFirst.mockResolvedValue(null);
    expect(await svc.lastCook(userActor, RECIPE_ID)).toEqual({
      last_cooked_at: null,
      rating: null,
      next_time: null,
    });
  });

  it('updateCookLog edits only the provided fields; explicit null clears (RS-US-32 partial body)', async () => {
    const prisma: any = mockPrisma();
    prisma.cookLog.findUnique.mockResolvedValue(logRow());
    prisma.recipe.findUnique.mockResolvedValue(ownedRecipe());
    prisma.cookLog.update.mockImplementation(async ({ data }: any) => ({ ...logRow(), ...data }));
    const svc = new CookService(prisma, new RecipeService(prisma));

    await svc.updateCookLog(userActor, LOG_ID, { rating: 5 });
    expect(prisma.cookLog.update).toHaveBeenLastCalledWith({
      where: { id: LOG_ID },
      data: { rating: 5 },
    });

    await svc.updateCookLog(userActor, LOG_ID, { note: 'Less chilli next time' });
    expect(prisma.cookLog.update).toHaveBeenLastCalledWith({
      where: { id: LOG_ID },
      data: { note: 'Less chilli next time' },
    });

    await svc.updateCookLog(userActor, LOG_ID, { note: null });
    expect(prisma.cookLog.update).toHaveBeenLastCalledWith({
      where: { id: LOG_ID },
      data: { note: null },
    });
  });

  it('updateCookLog 404s for missing and malformed log ids (canonical COOK_LOG_NOT_FOUND)', async () => {
    const prisma: any = mockPrisma();
    prisma.cookLog.findUnique.mockResolvedValue(null);
    const svc = new CookService(prisma, new RecipeService(prisma));

    await expect(svc.updateCookLog(userActor, LOG_ID, { rating: 5 })).rejects.toMatchObject({
      constructor: NotFoundException,
      response: { code: 'COOK_LOG_NOT_FOUND' },
    });
    await expect(svc.updateCookLog(userActor, 'not-a-uuid', { rating: 5 })).rejects.toMatchObject({
      constructor: NotFoundException,
      response: { code: 'COOK_LOG_NOT_FOUND' },
    });
    expect(prisma.cookLog.update).not.toHaveBeenCalled();
  });

  it('updateCookLog treats an empty partial body as a no-op and returns the unchanged log', async () => {
    const prisma: any = mockPrisma();
    prisma.cookLog.findUnique.mockResolvedValue(logRow());
    prisma.recipe.findUnique.mockResolvedValue(ownedRecipe());
    const svc = new CookService(prisma, new RecipeService(prisma));
    const wire = await svc.updateCookLog(userActor, LOG_ID, {});
    expect(prisma.cookLog.update).not.toHaveBeenCalled();
    expect(wire.cook_log_id).toBe(LOG_ID);
    expect(wire.rating).toBe(4);
  });

  it('updateCookLog never edits a foreign account log — the recipe guard answers the canonical 404', async () => {
    const prisma: any = mockPrisma();
    prisma.cookLog.findUnique.mockResolvedValue(logRow({ id: OTHER_LOG_ID }));
    prisma.recipe.findUnique.mockResolvedValue(ownedRecipe({ accountId: 'acc-OTHER' }));
    const svc = new CookService(prisma, new RecipeService(prisma));
    await expect(svc.updateCookLog(userActor, OTHER_LOG_ID, { rating: 1 })).rejects.toMatchObject({
      constructor: NotFoundException,
      response: { code: 'RECIPE_NOT_FOUND' },
    });
    expect(prisma.cookLog.update).not.toHaveBeenCalled();
  });
});

describe('cook date helpers', () => {
  it('parseCookDate validates real calendar dates (2026-02-31 → null, 2028-02-29 → ok)', () => {
    expect(parseCookDate('2026-02-31')).toBeNull();
    expect(parseCookDate('2026-13-01')).toBeNull();
    expect(parseCookDate('2026-00-10')).toBeNull();
    expect(parseCookDate('2026-09-14')?.toISOString()).toBe('2026-09-14T00:00:00.000Z');
    expect(parseCookDate('2028-02-29')?.toISOString()).toBe('2028-02-29T00:00:00.000Z');
  });

  it('localToday returns a strict YYYY-MM-DD string', () => {
    expect(localToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
