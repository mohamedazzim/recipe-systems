// D-24 (P6-1) integration — the canonical cook loop on real Postgres:
//   - F1: POST /recipes/:recipeId/cook-logs defaults cook_date to today
//     (TC-01), accepts an editable date (TC-02), keeps MULTIPLE logs per
//     recipe (TC-03), and the account library row shows last cooked
//     (TC-04 / AC-3).
//   - F2: rating 1–5 optional + free-text note stored and returned; the
//     rating CHECK constraint rejects out-of-range rows at the DB level;
//     PATCH edits rating/note (RS-US-32, partial body, null clears).
//   - F6: GET last-cook returns the reopen summary (last_cooked_at, rating,
//     next_time surfaced when present).
//   - Ownership (INV-17 / D-09 re-asserted): user B gets the canonical 404
//     on A's POST/GET/PATCH surfaces; malformed ids are clean 404s; guests
//     log on their own session recipe and foreign guests are refused.
//   - Historical-data behavior: logging cooks never touches the analysis,
//     shopping or ingredient rows (byte-identical before/after).
//
// No reference-data bootstrap needed — the cook module writes/reads only
// recipe + cook_log. Integration suites run SERIALLY (maxWorkers: 1).

/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'fs';
import path from 'path';

const REPO = path.join(__dirname, '..', '..');
if (!process.env.DATABASE_URL) {
  const devSh = fs.readFileSync(path.join(REPO, 'scripts', 'dev.sh'), 'utf8');
  const match = devSh.match(/export DATABASE_URL="([^"]+)"/);
  if (!match) throw new Error('DATABASE_URL not found in scripts/dev.sh');
  process.env.DATABASE_URL = match[1];
}

const { prisma } = require('@recipe-systems/database');
const { RecipeService } = require('../../apps/api/src/modules/recipes/recipe.service');
const { IntakeService } = require('../../apps/api/src/modules/intake/intake.service');
const { CookService, localToday } = require('../../apps/api/src/modules/cook/cook.service');
const { CookController, CookLogController } = require('../../apps/api/src/modules/cook/cook.controller');

const recipes = new RecipeService(prisma);
const intake = new IntakeService(prisma, recipes as any);
const cook = new CookService(prisma, recipes as any, intake as any);
const controller = new CookController(cook as any);
const logController = new CookLogController(cook as any);

const CARD_LINES = ['Fish — 500g', 'Chilli — 5 Nos', 'Fenugreek Powder — 1/2 Tsp'];

describe('D-24 cook loop — real Postgres', () => {
  const createdRecipeIds: string[] = [];
  const createdAccountIds: string[] = [];
  const createdAnalysisIds: string[] = [];
  const createdGuestSessionIds: string[] = [];

  async function newUserActor(prefix: string) {
    const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.dev`;
    const account = await prisma.account.create({
      data: { email, authProvider: 'sso', preferredMode: 'home' },
    });
    createdAccountIds.push(account.id);
    return {
      kind: 'user' as const,
      user: { accountId: account.id, email: account.email, sub: `integration-${prefix}` },
    };
  }

  async function newGuestActor() {
    const session = await prisma.guestSession.create({
      data: { expiresAt: new Date(Date.now() + 86_400_000) },
    });
    createdGuestSessionIds.push(session.id);
    return {
      kind: 'guest' as const,
      guestSessionId: session.id,
      expiresAt: session.expiresAt,
    };
  }

  async function makeRecipe(actor: any, prefix: string) {
    const recipe = await recipes.createForIntake(actor, { rawText: CARD_LINES.join('\n') });
    createdRecipeIds.push(recipe.id);
    await intake.recordPaste(actor, recipe.id, CARD_LINES.join('\n'));
    return recipe;
  }

  afterAll(async () => {
    await prisma.analysisStationCard.deleteMany({ where: { analysisId: { in: createdAnalysisIds } } });
    await prisma.analysis.deleteMany({ where: { id: { in: createdAnalysisIds } } });
    for (const id of createdRecipeIds) {
      await prisma.recipe.deleteMany({ where: { id } }); // cascades cook_log
    }
    for (const id of createdAccountIds) {
      await prisma.account.deleteMany({ where: { id } });
    }
    for (const id of createdGuestSessionIds) {
      await prisma.guestSession.deleteMany({ where: { id } });
    }
    await prisma.$disconnect();
  });

  it('F1 canonical cook flow: default-today date, editable date, multiple logs kept, library shows last cooked', async () => {
    const actor = await newUserActor('d24a');
    const recipe = await makeRecipe(actor, 'd24a');

    // TC-01: no cook_date → today.
    const first = await controller.logCook({ actor } as any, recipe.id, {});
    expect(first.cook_date).toBe(localToday());
    expect(first.rating).toBeNull();
    expect(first.note).toBeNull();
    expect(first.cook_log_id).toBeTruthy();

    // TC-02: editable date + rating + note (the acceptance-scene note).
    const second = await controller.logCook({ actor } as any, recipe.id, {
      cook_date: '2026-09-08',
      rating: 4,
      note: '2 green chillies, fenugreek powder off heat',
    });
    expect(second.cook_date).toBe('2026-09-08');
    expect(second.rating).toBe(4);

    // TC-03: two rows exist and both are kept.
    const rows = await prisma.cookLog.findMany({ where: { recipeId: recipe.id } });
    expect(rows).toHaveLength(2);

    // GET cook-logs: newest cook first.
    const listed = await controller.listCookLogs({ actor } as any, recipe.id);
    expect(listed.items.map((i: any) => i.cook_date)).toEqual([localToday(), '2026-09-08']);
    expect(listed.items[0].note).toBeNull();
    expect(listed.items[1].note).toBe('2 green chillies, fenugreek powder off heat');
    expect(listed.items[1].rating).toBe(4);

    // TC-04 / F1 AC-3: the library row shows last cooked (today, the newest).
    const library = await recipes.listLibrary(actor);
    const row = library.find((r: any) => r.recipe_id === recipe.id);
    expect(row.has_cook_log).toBe(true);
    expect(row.last_cooked_at).toBe(localToday());
  });

  it('F6 reopen: last-cook returns the summary — date, rating, next_time surfaced when present (null today)', async () => {
    const actor = await newUserActor('d24b');
    const recipe = await makeRecipe(actor, 'd24b');
    await controller.logCook({ actor } as any, recipe.id, {});
    await controller.logCook({ actor } as any, recipe.id, {
      cook_date: '2026-09-12',
      rating: 4,
      note: 'fish held',
    });

    const summary = await controller.lastCook({ actor } as any, recipe.id);
    expect(summary.last_cooked_at).toBe(localToday());
    expect(summary.rating).toBeNull(); // the newest log carries no rating
    expect(summary.next_time).toBeNull();

    // The summary reads the NEWEST cook (insert a later-dated one with rating).
    await controller.logCook({ actor } as any, recipe.id, {
      cook_date: localToday(),
      rating: 5,
      note: 'perfect',
    });
    const newer = await controller.lastCook({ actor } as any, recipe.id);
    expect(newer.last_cooked_at).toBe(localToday());
    expect(newer.rating).toBe(5);
  });

  it('F2: rating validation at the boundary and at the DB CHECK — invalid ratings never persist', async () => {
    const actor = await newUserActor('d24c');
    const recipe = await makeRecipe(actor, 'd24c');

    for (const body of [{ rating: 0 }, { rating: 6 }, { rating: 1.5 }]) {
      await expect(controller.logCook({ actor } as any, recipe.id, body)).rejects.toMatchObject({
        response: { code: 'INVALID_COOK_LOG' },
      });
    }
    // The canonical boundaries are accepted.
    await controller.logCook({ actor } as any, recipe.id, { rating: 1 });
    await controller.logCook({ actor } as any, recipe.id, { rating: 5 });

    // DB-level CHECK (migration 002 chk_cook_log_rating) rejects a direct 6.
    await expect(
      prisma.cookLog.create({
        data: { recipeId: recipe.id, cookedAt: new Date('2026-09-10T00:00:00Z'), rating: 6 },
      }),
    ).rejects.toThrow();

    const rows = await prisma.cookLog.findMany({ where: { recipeId: recipe.id } });
    expect(rows).toHaveLength(2);
    expect(rows.map((r: any) => r.rating).sort()).toEqual([1, 5]);
  });

  it('F2: note persists and PATCH edits rating/note partially (RS-US-32); explicit null clears', async () => {
    const actor = await newUserActor('d24d');
    const recipe = await makeRecipe(actor, 'd24d');
    const created = await controller.logCook({ actor } as any, recipe.id, {
      cook_date: '2026-09-08',
      rating: 2,
      note: 'too much chilli',
    });

    const patched = await logController.updateCookLog({ actor } as any, created.cook_log_id, {
      rating: 4,
    });
    expect(patched.rating).toBe(4);
    expect(patched.note).toBe('too much chilli'); // untouched by a partial body

    const noted = await logController.updateCookLog({ actor } as any, created.cook_log_id, {
      note: '2 green chillies, fenugreek powder off heat',
    });
    expect(noted.rating).toBe(4);
    expect(noted.note).toBe('2 green chillies, fenugreek powder off heat');

    const cleared = await logController.updateCookLog({ actor } as any, created.cook_log_id, {
      note: null,
    });
    expect(cleared.note).toBeNull();

    const row = await prisma.cookLog.findUniqueOrThrow({ where: { id: created.cook_log_id } });
    expect(row.rating).toBe(4);
    expect(row.note).toBeNull();
  });

  it('ownership (INV-17 / D-09 re-asserted): B gets canonical 404s on every A surface; malformed ids are clean 404s', async () => {
    const a = await newUserActor('d24e-a');
    const b = await newUserActor('d24e-b');
    const recipe = await makeRecipe(a, 'd24e');
    const log = await controller.logCook({ actor: a } as any, recipe.id, { rating: 3 });

    // B cannot create, list, summarize or edit A's cook log.
    await expect(controller.logCook({ actor: b } as any, recipe.id, {})).rejects.toMatchObject({
      response: { code: 'RECIPE_NOT_FOUND' },
    });
    await expect(controller.listCookLogs({ actor: b } as any, recipe.id)).rejects.toMatchObject({
      response: { code: 'RECIPE_NOT_FOUND' },
    });
    await expect(controller.lastCook({ actor: b } as any, recipe.id)).rejects.toMatchObject({
      response: { code: 'RECIPE_NOT_FOUND' },
    });
    await expect(
      logController.updateCookLog({ actor: b } as any, log.cook_log_id, { rating: 1 }),
    ).rejects.toMatchObject({ response: { code: 'RECIPE_NOT_FOUND' } });

    // Malformed ids → the same canonical 404, no existence leak.
    await expect(controller.logCook({ actor: a } as any, 'not-a-uuid', {})).rejects.toMatchObject({
      response: { code: 'RECIPE_NOT_FOUND' },
    });
    await expect(
      logController.updateCookLog({ actor: a } as any, 'not-a-uuid', { rating: 1 }),
    ).rejects.toMatchObject({ response: { code: 'COOK_LOG_NOT_FOUND' } });
    await expect(
      logController.updateCookLog(
        { actor: a } as any,
        '99999999-9999-4999-8999-999999999999',
        { rating: 1 },
      ),
    ).rejects.toMatchObject({ response: { code: 'COOK_LOG_NOT_FOUND' } });

    // The rating really is untouched.
    expect((await prisma.cookLog.findUniqueOrThrow({ where: { id: log.cook_log_id } })).rating).toBe(3);
  });

  it('guest session contract: guests log on their own recipe; foreign guests are refused', async () => {
    const guest = await newGuestActor();
    const foreign = await newGuestActor();
    const recipe = await makeRecipe(guest, 'd24g');

    const logged = await controller.logCook({ actor: guest } as any, recipe.id, { note: 'guest cook' });
    expect(logged.note).toBe('guest cook');
    expect((await controller.listCookLogs({ actor: guest } as any, recipe.id)).items).toHaveLength(1);

    await expect(controller.logCook({ actor: foreign } as any, recipe.id, {})).rejects.toMatchObject({
      response: { code: 'RECIPE_NOT_FOUND' },
    });
  });

  it('historical-data behavior: cook logging never touches analysis, shopping or ingredient rows', async () => {
    const actor = await newUserActor('d24h');
    const recipe = await makeRecipe(actor, 'd24h');
    const lines = await prisma.recipeIngredientLine.findMany({
      where: { recipeId: recipe.id, deletedAt: null },
    });

    // Historical neighbors from earlier phases.
    const analysis = await prisma.analysis.create({
      data: { recipeId: recipe.id, mode: 'home', status: 'complete', isCurrent: true },
    });
    createdAnalysisIds.push(analysis.id);
    const generation = await prisma.shoppingListGeneration.create({
      data: { recipeId: recipe.id, layout: 'flat', generatedAt: new Date() },
    });
    await prisma.shoppingListItem.create({
      data: {
        generationId: generation.id,
        shoppingKey: lines[0].shoppingKey,
        displayName: lines[0].displayName,
        displayQuantity: lines[0].amountText ?? '1',
        unit: null,
        groupName: 'fish_meat',
        stateAtGeneration: 'need',
        position: 1,
      },
    });
    await prisma.ingredientShoppingState.create({
      data: { recipeId: recipe.id, shoppingKey: lines[0].shoppingKey, state: 'need' },
    });

    const snapshot = {
      analyses: await prisma.analysis.findMany({ where: { recipeId: recipe.id } }),
      generations: await prisma.shoppingListGeneration.findMany({ where: { recipeId: recipe.id } }),
      states: await prisma.ingredientShoppingState.findMany({ where: { recipeId: recipe.id } }),
      lines: await prisma.recipeIngredientLine.findMany({ where: { recipeId: recipe.id } }),
    };

    await controller.logCook({ actor } as any, recipe.id, {
      rating: 4,
      note: '2 green chillies, fenugreek powder off heat',
    });
    await controller.lastCook({ actor } as any, recipe.id);
    await logController.updateCookLog(
      { actor } as any,
      (await prisma.cookLog.findFirstOrThrow({ where: { recipeId: recipe.id } })).id,
      { rating: 5 },
    );

    const after = {
      analyses: await prisma.analysis.findMany({ where: { recipeId: recipe.id } }),
      generations: await prisma.shoppingListGeneration.findMany({ where: { recipeId: recipe.id } }),
      states: await prisma.ingredientShoppingState.findMany({ where: { recipeId: recipe.id } }),
      lines: await prisma.recipeIngredientLine.findMany({ where: { recipeId: recipe.id } }),
    };
    // JSON round-trip: Prisma Decimals compare as their wire strings.
    expect(JSON.parse(JSON.stringify(after))).toEqual(JSON.parse(JSON.stringify(snapshot)));
  });
});
