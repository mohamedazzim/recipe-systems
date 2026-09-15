// D-25 (P7-1) session 2 integration — C6 explicit re-analysis, D4 edit → parse
// review, D5 analysis snapshot chain on real Postgres:
//   - editing a saved recipe never auto-enqueues (C6 TC-01);
//   - re-analysis is explicit and links the previous analysis via
//     analysis.snapshot_of_analysis_id (D5 — no cook_log.analysis_id column);
//   - the current-analysis flip stays order-safe (INV-09) and cook logs/notes
//     stay intact (C6 TC-02 / D4 AC-3);
//   - INV-17 ownership: foreign + malformed ids → canonical 404s.

/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

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
const { AnalysisService } = require('../../apps/api/src/modules/analysis/analysis.service');
const { CookService } = require('../../apps/api/src/modules/cook/cook.service');
const { AnalysisJobHandler } = require('../../apps/analysis-worker/src/analysis-job.handler');
const { MockLlmAdapter } = require('@recipe-systems/llm-adapter');

const recipes = new RecipeService(prisma);
const intake = new IntakeService(prisma, recipes as any);
const cook = new CookService(prisma, recipes as any, intake as any);

const CARD_LINES = [
  'Fish — 500g',
  'Drumstick — 1 Nos',
  'Mango — 1/2 Nos',
  'Grated Coconut — Half Shell',
  'Coconut Oil — For Tempering',
  'Chilli — 5 Nos',
  'Chilli Powder — 2 Tsp',
  'Coriander Powder — 1 Tsp',
  'Tamarind — A Lemon Size',
  'Fenugreek Powder — 1/2 Tsp',
  'Fenugreek — 1/4 Tsp',
];

function fixtureAdapter(firstLineId: string) {
  const views: Record<number, unknown> = {
    1: { items: [{ ingredient_id: firstLineId, job: 'Protein', if_omitted: 'Not this dish', tag: 'CARD' }], role_groups: [] },
    2: { pillars: [], blind_spot_notes: [] },
    3: {
      status: 'COMPLETE',
      stages: [
        {
          stage_name: 'Load and heat',
          action: 'Add fish; boil then reduce',
          cue: 'Fish opaque and just flaking',
          duration: 'About 5-6 minutes',
          tag: 'METHOD',
        },
      ],
      incomplete_reason: null,
    },
    4: { substitutions: [] },
    5: { family: 'Coastal Tamil (Kanyakumari) style meen kuzhambu', architecture: 'Raw-ground paste, triple sour', confidence: 'high', not_this: [], needs_review: true, tag: 'INFERRED' },
    6: { ratios: [], unresolvable: [] },
    7: { status: 'COMPLETE', memorable_elements: [] },
  };
  const fixtures = ([1, 2, 3, 4, 5, 6, 7] as const).flatMap((view) =>
    (['home', 'chef'] as const).map((mode) => ({ view, mode, output: views[view] })),
  );
  return new MockLlmAdapter(fixtures);
}

describe('D-25 session 2 — explicit re-analysis + snapshot chain (C6/D4/D5)', () => {
  const createdRecipeIds: string[] = [];
  const createdAccountIds: string[] = [];

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

  /** Create recipe → paste → method → enqueue → run the worker once. Returns the
   *  recipe, its lines, the first analysis id, and the captured job payload. */
  async function makeAnalysedRecipe(actor: any, prefix: string) {
    const recipe = await recipes.createForIntake(actor, { rawText: CARD_LINES.join('\n') });
    createdRecipeIds.push(recipe.id);
    await intake.recordPaste(actor, recipe.id, CARD_LINES.join('\n'));
    await recipes.attachMethod(actor, recipe.id, {
      mode: 'paste',
      methodText: `Temper mustard seeds; boil tamarind; simmer fish. (${prefix})`,
    });
    const lines = await prisma.recipeIngredientLine.findMany({
      where: { recipeId: recipe.id, deletedAt: null },
      orderBy: { lineNo: 'asc' },
    });
    let captured: any = null;
    const queue = {
      enqueue: jest.fn(async (payload: any) => {
        captured = payload.captured;
        return 'analysis-queued';
      }),
      enqueueView9Recompute: jest.fn(async () => undefined),
    };
    const svc = new AnalysisService(recipes as any, intake as any, queue as any, prisma as any);
    await svc.enqueue(actor, recipe.id, 'home');
    const analysisId = crypto.randomUUID();
    const handler = new AnalysisJobHandler(prisma, fixtureAdapter(lines[0].id) as any, jest.fn() as any);
    await handler.handle({
      analysis_id: analysisId,
      recipe_id: recipe.id,
      mode: 'home',
      prompt_version: 'v2',
      captured,
    });
    return { recipe, lines, analysisId, captured };
  }

  afterAll(async () => {
    for (const id of createdRecipeIds) {
      await prisma.recipe.deleteMany({ where: { id } });
    }
    for (const id of createdAccountIds) {
      await prisma.accountRestrictionItem.deleteMany({ where: { profile: { accountId: id } } });
      await prisma.accountRestrictionProfile.deleteMany({ where: { accountId: id } });
      await prisma.account.deleteMany({ where: { id } });
    }
    await prisma.$disconnect();
  });

  it('C6 TC-01: editing a saved recipe never auto-enqueues (no new analysis row)', async () => {
    const actor = await newUserActor('d25c6');
    const { recipe, lines } = await makeAnalysedRecipe(actor, 'd25c6');
    await recipes.saveRecipe(actor, recipe.id, { title: 'Saved fish curry' });

    const chilli = lines.find((l: any) => l.displayName.includes('Chilli — 5 Nos'))!;
    const before = await prisma.analysis.count({ where: { recipeId: recipe.id } });

    await intake.updateLine(actor, recipe.id, chilli.id, { displayName: 'Chilli — 4 Nos' }, chilli.updatedAt.toISOString());

    const after = await prisma.analysis.count({ where: { recipeId: recipe.id } });
    expect(after).toBe(before);
    expect(await prisma.analysis.count({ where: { recipeId: recipe.id, isCurrent: true } })).toBe(1);
  });

  it('C6/D5: explicit re-analysis links the previous analysis and keeps cook notes intact', async () => {
    const actor = await newUserActor('d25d5');
    const { recipe, lines, analysisId: firstId } = await makeAnalysedRecipe(actor, 'd25d5');

    // historical cook log + private note (must survive re-analysis)
    const log = await cook.logCook(actor, recipe.id, { rating: 4, note: 'less chilli next time' });

    // explicit re-analysis — a NEW analysis id, enqueue + worker run
    let captured2: any = null;
    const queue = {
      enqueue: jest.fn(async (payload: any) => {
        captured2 = payload.captured;
        return 'analysis-queued';
      }),
      enqueueView9Recompute: jest.fn(async () => undefined),
    };
    const svc = new AnalysisService(recipes as any, intake as any, queue as any, prisma as any);
    await svc.enqueue(actor, recipe.id, 'home');
    const secondId = crypto.randomUUID();
    const handler = new AnalysisJobHandler(prisma, fixtureAdapter(lines[0].id) as any, jest.fn() as any);
    await handler.handle({
      analysis_id: secondId,
      recipe_id: recipe.id,
      mode: 'home',
      prompt_version: 'v2',
      captured: captured2,
    });

    // D5 chain: second points at the first; the first is no longer current
    const second = await prisma.analysis.findUniqueOrThrow({ where: { id: secondId } });
    const first = await prisma.analysis.findUniqueOrThrow({ where: { id: firstId } });
    expect(second.isCurrent).toBe(true);
    expect(second.snapshotOfAnalysisId).toBe(firstId);
    expect(first.isCurrent).toBe(false);

    // INV-09: exactly one current per recipe
    expect(await prisma.analysis.count({ where: { recipeId: recipe.id, isCurrent: true } })).toBe(1);

    // C6 TC-02: the previous analysis's views + the cook log/note remain intact
    expect(await prisma.analysisView.count({ where: { analysisId: firstId } })).toBe(9);
    const logAfter = await prisma.cookLog.findUniqueOrThrow({ where: { id: log.cook_log_id } });
    expect(logAfter.note).toBe('less chilli next time');
    expect(logAfter.rating).toBe(4);
  });

  it('INV-17: foreign edit + re-analysis → canonical 404; malformed id → 404', async () => {
    const a = await newUserActor('d25inv-a');
    const b = await newUserActor('d25inv-b');
    const { recipe, lines } = await makeAnalysedRecipe(a, 'd25inv');

    const chilli = lines.find((l: any) => l.displayName.includes('Chilli — 5 Nos'))!;

    // foreign edit → 404 (no existence leak)
    await expect(
      intake.updateLine(b, recipe.id, chilli.id, { displayName: 'X' }, chilli.updatedAt.toISOString()),
    ).rejects.toMatchObject({ response: { code: 'RECIPE_NOT_FOUND' } });

    // malformed (non-UUID) recipe id → clean 404 before Prisma
    await expect(
      intake.updateLine(a, 'not-a-uuid', chilli.id, { displayName: 'X' }, chilli.updatedAt.toISOString()),
    ).rejects.toMatchObject({ response: { code: 'RECIPE_NOT_FOUND' } });
  });
});
