// D-17 (P3-3) integration — the real Postgres + pg-boss loop (DISPATCH done
// criteria, A-17): enqueued job → analysis rows written by the worker alone;
// duplicate delivery → single current analysis (INV-11); failed jobs never
// stuck at generating; the is_current flip is order-safe (INV-09).
//
// Uses the REAL AnalysisService (API enqueue) + REAL AnalysisJobHandler with
// the fixture adapter (Q9 OPEN — no provider needed for the lifecycle proof).

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

const PgBoss = require('pg-boss');
const { prisma } = require('@recipe-systems/database');
const { RecipeService } = require('../../apps/api/src/modules/recipes/recipe.service');
const { IntakeService } = require('../../apps/api/src/modules/intake/intake.service');
const {
  AnalysisService,
} = require('../../apps/api/src/modules/analysis/analysis.service');
const {
  AnalysisJobHandler,
} = require('../../apps/analysis-worker/src/analysis-job.handler');
const { MockLlmAdapter } = require('@recipe-systems/llm-adapter');

const recipes = new RecipeService(prisma);
const intake = new IntakeService(prisma, recipes as any);

function validViews(lineId: string): Record<number, unknown> {
  return {
  1: {
    items: [
      {
        ingredient_id: lineId,
        job: 'Protein, fat, reason for the sour',
        if_omitted: 'Not this dish',
        tag: 'CARD',
      },
    ],
    role_groups: [{ role: 'Body / richness', ingredient_ids: [lineId] }],
  },
  2: { pillars: [], blind_spot_notes: [] },
  3: { status: 'COMPLETE', stages: [], incomplete_reason: null },
  4: { substitutions: [] },
  5: {
    family: 'Coastal Tamil (Kanyakumari) style meen kuzhambu',
    architecture: 'Raw-ground paste, triple sour',
    confidence: 'high',
    not_this: [],
    needs_review: true,
    tag: 'INFERRED',
  },
    6: { ratios: [], unresolvable: [] },
    7: { status: 'COMPLETE', memorable_elements: [] },
  };
}

function fixtureAdapter(lineId: string) {
  const views = validViews(lineId);
  const fixtures = ([1, 2, 3, 4, 5, 6, 7] as const).flatMap((view) =>
    (['home', 'chef'] as const).map((mode) => ({ view, mode, output: views[view] })),
  );
  return new MockLlmAdapter(fixtures);
}

async function firstLineId(recipeId: string): Promise<string> {
  const line = await prisma.recipeIngredientLine.findFirst({
    where: { recipeId, deletedAt: null },
    orderBy: { lineNo: 'asc' },
  });
  return line!.id;
}

describe('D-17 analysis worker loop — real Postgres + pg-boss', () => {
  const createdRecipeIds: string[] = [];
  const createdAccountIds: string[] = [];
  const createdAnalysisIds: string[] = [];
  let boss: any;
  const TEST_QUEUE = `analysis_it_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  beforeAll(async () => {
    boss = new PgBoss({ connectionString: process.env.DATABASE_URL });
    await boss.start();
    await boss.createQueue(TEST_QUEUE);
  });

  afterAll(async () => {
    // D-25 D5: analyses now carry a composite self-FK snapshot chain
    // (fk_analysis_snapshot_same_recipe, NO ACTION). Deleting a recipe cascades
    // ALL its analyses in one statement (order-safe against the self-FK);
    // individual analysis deletes would need newest-first ordering. Recipe-first
    // keeps the fixture FK-safe — the production delete path (D6) is the recipe
    // cascade.
    for (const id of createdRecipeIds) {
      await prisma.recipe.deleteMany({ where: { id } });
    }
    for (const id of createdAccountIds) {
      await prisma.account.deleteMany({ where: { id } });
    }
    if (boss) await boss.stop({ graceful: true }).catch(() => undefined);
  });

  async function newUser(prefix: string) {
    const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.dev`;
    const account = await prisma.account.create({
      data: { email, authProvider: 'sso', preferredMode: 'home' },
    });
    createdAccountIds.push(account.id);
    return { kind: 'user' as const, user: { accountId: account.id, email: account.email, sub: 'integration-d17' } };
  }

  async function readyRecipe(actor: any): Promise<string> {
    const recipe = await recipes.createForIntake(actor, { rawText: 'Fish — 500g' });
    createdRecipeIds.push(recipe.id);
    await intake.recordPaste(actor, recipe.id, 'Fish — 500g');
    await recipes.attachMethod(actor, recipe.id, {
      mode: 'paste',
      methodText: 'Boil tamarind water; temper; add fish; simmer.',
    });
    return recipe.id;
  }

  function queueService(): any {
    return {
      async enqueue(payload: any) {
        const analysis_id = require('crypto').randomUUID();
        createdAnalysisIds.push(analysis_id);
        await boss.send(TEST_QUEUE, { ...payload, analysis_id });
        return analysis_id;
      },
    };
  }

  it('enqueued job → analysis rows written by the worker alone; one current (DONE criterion 1 + INV-11)', async () => {
    const actor = await newUser('d17-complete');
    const recipeId = await readyRecipe(actor);

    const svc = new AnalysisService(recipes as any, intake as any, queueService() as any);
    const enqueued = await svc.enqueue(actor, recipeId, 'home');
    expect(enqueued.status).toBe('queued');

    const notifier = jest.fn().mockResolvedValue(undefined);
    const handler = new AnalysisJobHandler(prisma as any, fixtureAdapter(await firstLineId(recipeId)), notifier as any);

    // Consume the job exactly as the worker does.
    const jobs = await boss.fetch(TEST_QUEUE, { batchSize: 10 });
    expect(jobs.length).toBe(1);
    await handler.handle(jobs[0].data);
    await boss.complete(TEST_QUEUE, jobs[0].id);

    const analysis = await prisma.analysis.findUnique({ where: { id: enqueued.analysis_id } });
    expect(analysis?.status).toBe('complete');
    expect(analysis?.isCurrent).toBe(true);
    expect(analysis?.promptVersion).toBe('v2');
    expect(analysis?.modelVersion).toBe('stub-no-provider-q9');

    const views = await prisma.analysisView.findMany({ where: { analysisId: analysis!.id } });
    expect(views).toHaveLength(9);
    // D-19: all nine views COMPLETE — views 8/9 are the deterministic producers
    // (no LLM), which replaced the D-18-era INCOMPLETE refusal rows.
    expect(views.filter((v) => v.status === 'COMPLETE')).toHaveLength(9);

    // INV-11: duplicate delivery converges — the completed-status early-return
    // means the payload is never read; no second analysis row, same single current.
    await handler.handle({
      analysis_id: enqueued.analysis_id,
      recipe_id: recipeId,
      mode: 'home',
      prompt_version: 'v2',
      captured: {
        structured_recipe: {
          ingredients: [],
          method_steps: [],
          method_source: { name: null, type: null, matched: false },
          explicitly_absent: [],
          card_metadata: { photographed: false, legible_issues: [] },
        },
      },
    });
    const all = await prisma.analysis.findMany({ where: { recipeId } });
    expect(all).toHaveLength(1);
    expect(all[0].isCurrent).toBe(true);

    // NOTIFY transitions observed (signal-only — INV-16).
    expect(notifier).toHaveBeenCalledWith(expect.objectContaining({ status: 'generating' }));
  });

  it('provider-pending (Q9 OPEN): job fails cleanly — status failed, never stuck at generating', async () => {
    const actor = await newUser('d17-pending');
    const recipeId = await readyRecipe(actor);

    const svc = new AnalysisService(recipes as any, intake as any, queueService() as any);
    const enqueued = await svc.enqueue(actor, recipeId, 'home');

    const { AnalysisJobHandler: H } = require('../../apps/analysis-worker/src/analysis-job.handler');
    const { ProviderPendingError } = require('../../apps/analysis-worker/src/adapter');
    const pending = {
      generate: async () => {
        throw new ProviderPendingError();
      },
    };
    const handler = new H(prisma as any, pending, jest.fn().mockResolvedValue(undefined));

    const jobs = await boss.fetch(TEST_QUEUE, { batchSize: 10 });
    const job = jobs.find((j: any) => j.data.analysis_id === enqueued.analysis_id);
    expect(job).toBeTruthy();
    await handler.handle(job.data); // resolves (no throw → no pg-boss retry)
    await boss.complete(TEST_QUEUE, job.id);

    const analysis = await prisma.analysis.findUnique({ where: { id: enqueued.analysis_id } });
    expect(analysis?.status).toBe('failed');
    expect(analysis?.isCurrent).toBe(false);
  });

  it('INV-09: a second analysis on the same recipe flips current — exactly one current row', async () => {
    const actor = await newUser('d17-current');
    const recipeId = await readyRecipe(actor);
    const svc = new AnalysisService(recipes as any, intake as any, queueService() as any);

    const first = await svc.enqueue(actor, recipeId, 'home');
    const handler = new AnalysisJobHandler(prisma as any, fixtureAdapter(await firstLineId(recipeId)), jest.fn().mockResolvedValue(undefined));
    const jobs1 = await boss.fetch(TEST_QUEUE, { batchSize: 10 });
    await handler.handle(jobs1.find((j: any) => j.data.analysis_id === first.analysis_id)!.data);
    await boss.complete(TEST_QUEUE, jobs1[0].id);

    const second = await svc.enqueue(actor, recipeId, 'chef');
    const jobs2 = await boss.fetch(TEST_QUEUE, { batchSize: 10 });
    await handler.handle(jobs2.find((j: any) => j.data.analysis_id === second.analysis_id)!.data);
    await boss.complete(TEST_QUEUE, jobs2[0].id);

    const rows = await prisma.analysis.findMany({ where: { recipeId } });
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.isCurrent)).toHaveLength(1);
    expect(rows.find((r) => r.isCurrent)?.id).toBe(second.analysis_id);
  });

  it('sweep: a generating row older than the threshold becomes failed (P3 exit)', async () => {
    const actor = await newUser('d17-sweep');
    const recipeId = await readyRecipe(actor);
    const staleId = require('crypto').randomUUID();
    createdAnalysisIds.push(staleId);
    await prisma.analysis.create({
      data: {
        id: staleId,
        recipeId,
        mode: 'home',
        status: 'generating',
        isCurrent: false,
        createdAt: new Date(Date.now() - 60 * 60 * 1000),
      },
    });

    const handler = new AnalysisJobHandler(prisma as any, fixtureAdapter(await firstLineId(recipeId)), jest.fn().mockResolvedValue(undefined));
    const swept = await handler.sweepStaleGenerating(15 * 60 * 1000);
    expect(swept).toBeGreaterThanOrEqual(1);

    const row = await prisma.analysis.findUnique({ where: { id: staleId } });
    expect(row?.status).toBe('failed');
  });
});
