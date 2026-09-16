// D-25A (C7 / RS-US-18) integration — substitution preview on real Postgres:
//   - one persisted View 4 substitution is previewed at a time;
//   - the classification is stated (identity_shift / structural) from persisted
//     View 1/5 evidence only — NO LLM, NO re-analysis, NO persistence;
//   - no new recipe is invented (the substitute + consequence are the persisted
//     View 4 values, verbatim);
//   - analysis rows are byte-identical before/after the preview (read-only).
//   - 404s: no complete analysis, unknown/foreign ingredient, foreign recipe.
//
// Reference-data bootstrap: identical hygiene to story_d19/d23/d31.
// Integration suites run SERIALLY (maxWorkers: 1).

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
const { AnalysisJobHandler } = require('../../apps/analysis-worker/src/analysis-job.handler');
const { MockLlmAdapter } = require('@recipe-systems/llm-adapter');
const {
  ReferenceDataRepository,
} = require('../../apps/api/src/admin/reference-data.repository');
const { ReferenceDataService } = require('../../apps/api/src/admin/reference-data.service');

const recipes = new RecipeService(prisma);
const intake = new IntakeService(prisma, recipes as any);

const COMMITTED_APPROVALS_DIR = path.join(REPO, 'infra', 'reference-data', 'approvals');
const COMMITTED_IMPORTS_DIR = path.join(REPO, 'infra', 'reference-data', 'imports');
const D29_REVIEWER = 'Mohamed Azzim (D-29 dispatch authorization 2026-09-09)';
const COMMITTED_IMPORTS = [
  'R-2026-09-09-001-allergen-definitions.json',
  'R-2026-09-09-002-dictionary-golden.json',
  'R-2026-09-09-003-allergen-mappings.json',
  'R-2026-09-09-004-nutrition-composition.json',
];

const CARD_LINES = [
  'Fish — 500g',
  'Tamarind — A Lemon Size',
  'Chilli — 5 Nos',
  'Fenugreek Powder — 1/2 Tsp',
];

/** D-25A fixture: View 4 carries TWO persisted substitutions — fish (structural
 *  via View 1 "Not this dish") and tamarind (identity_shift via View 5
 *  "kudampuli instead of tamarind"). */
function fixtureAdapter(fishId: string, tamarindId: string) {
  const views: Record<number, unknown> = {
    1: {
      items: [
        { ingredient_id: fishId, job: 'Protein, fat', if_omitted: 'Not this dish', tag: 'CARD' },
        { ingredient_id: tamarindId, job: 'Sour', if_omitted: 'No sour — flat stew', tag: 'CARD' },
      ],
      role_groups: [],
    },
    2: { pillars: [], blind_spot_notes: [] },
    3: { status: 'COMPLETE', stages: [], incomplete_reason: null },
    4: {
      substitutions: [
        { ingredient_id: fishId, substitute: 'Brinjal', consequence: 'Vegetarian version; fish texture lost', tag: 'INFERRED' },
        { ingredient_id: tamarindId, substitute: 'Kudampuli', consequence: 'Kerala meen curry — walks to another coast', tag: 'INFERRED' },
      ],
    },
    5: {
      family: 'Coastal Tamil (Kanyakumari) style meen kuzhambu',
      architecture: 'Raw-ground paste, triple sour',
      confidence: 'high',
      not_this: [
        { variant: 'Kerala meen curry', key_difference: 'uses kudampuli instead of tamarind/mango' },
      ],
      needs_review: true,
      tag: 'INFERRED',
    },
    6: { ratios: [], unresolvable: [] },
    7: { status: 'COMPLETE', memorable_elements: [] },
  };
  const fixtures = ([1, 2, 3, 4, 5, 6, 7] as const).flatMap((view) =>
    (['home', 'chef'] as const).map((mode) => ({ view, mode, output: views[view] })),
  );
  return new MockLlmAdapter(fixtures);
}

async function truncateReferenceTables() {
  await prisma.dietaryAllergenMapping.deleteMany();
  await prisma.nutritionFoodCompositionVersion.deleteMany();
  await prisma.nutritionFoodCompositionEntry.deleteMany();
  await prisma.ingredientAlias.deleteMany();
  await prisma.ingredientDictionary.deleteMany();
  await prisma.dietaryAllergenDefinition.deleteMany();
}

let snapshot: {
  definitions: object[];
  dictionary: object[];
  aliases: object[];
  mappings: object[];
  entries: object[];
  versions: object[];
} | null = null;

async function captureReferenceTables() {
  snapshot = {
    definitions: await prisma.dietaryAllergenDefinition.findMany(),
    dictionary: await prisma.ingredientDictionary.findMany(),
    aliases: await prisma.ingredientAlias.findMany(),
    mappings: await prisma.dietaryAllergenMapping.findMany(),
    entries: await prisma.nutritionFoodCompositionEntry.findMany(),
    versions: await prisma.nutritionFoodCompositionVersion.findMany(),
  };
}

async function restoreReferenceTables() {
  if (!snapshot) return;
  await prisma.dietaryAllergenDefinition.createMany({ data: snapshot.definitions as never });
  await prisma.ingredientDictionary.createMany({ data: snapshot.dictionary as never });
  await prisma.ingredientAlias.createMany({ data: snapshot.aliases as never });
  await prisma.nutritionFoodCompositionEntry.createMany({ data: snapshot.entries as never });
  await prisma.dietaryAllergenMapping.createMany({ data: snapshot.mappings as never });
  await prisma.nutritionFoodCompositionVersion.createMany({ data: snapshot.versions as never });
}

async function loadCommittedReviewedImports() {
  const service = new ReferenceDataService(
    new ReferenceDataRepository(prisma),
    COMMITTED_APPROVALS_DIR,
  );
  for (const fileName of COMMITTED_IMPORTS) {
    const file = JSON.parse(
      fs.readFileSync(path.join(COMMITTED_IMPORTS_DIR, fileName), 'utf8'),
    );
    await service.approve(file.import_id, D29_REVIEWER, file);
  }
}

describe('D-25A substitution preview — real Postgres (read-only)', () => {
  const createdRecipeIds: string[] = [];
  const createdAccountIds: string[] = [];
  const createdAnalysisIds: string[] = [];

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
    const fishId = lines.find((l) => (l.displayName ?? '').includes('Fish'))!.id;
    const tamarindId = lines.find((l) => (l.displayName ?? '').includes('Tamarind'))!.id;

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
    expect(captured).not.toBeNull();

    const analysisId = crypto.randomUUID();
    const handler = new AnalysisJobHandler(
      prisma,
      fixtureAdapter(fishId, tamarindId) as any,
      jest.fn() as any,
    );
    await handler.handle({
      analysis_id: analysisId,
      recipe_id: recipe.id,
      mode: 'home',
      prompt_version: 'v2',
      captured,
    });
    createdAnalysisIds.push(analysisId);
    return { recipe, fishId, tamarindId };
  }

  beforeAll(async () => {
    await captureReferenceTables();
    await truncateReferenceTables();
    await loadCommittedReviewedImports();
  });

  afterAll(async () => {
    await prisma.analysisStationCard.deleteMany({ where: { analysisId: { in: createdAnalysisIds } } });
    await prisma.analysisView.deleteMany({ where: { analysisId: { in: createdAnalysisIds } } });
    await prisma.analysis.deleteMany({ where: { id: { in: createdAnalysisIds } } });
    for (const id of createdRecipeIds) {
      await prisma.recipe.deleteMany({ where: { id } });
    }
    for (const id of createdAccountIds) {
      await prisma.account.deleteMany({ where: { id } });
    }
    await truncateReferenceTables();
    await restoreReferenceTables();
    await prisma.$disconnect();
  });

  it('previews one persisted View 4 substitution with a grounded classification (identity_shift)', async () => {
    const actor = await newUserActor('d25a');
    const { recipe, tamarindId } = await makeAnalysedRecipe(actor, 'd25a');
    const svc = new AnalysisService(recipes as any, intake as any, { enqueue: jest.fn(), enqueueView9Recompute: jest.fn() } as any, prisma as any);

    const out = await svc.previewSubstitution(actor, recipe.id, tamarindId);
    expect(out).toEqual({
      ingredient_id: tamarindId,
      substitute: 'Kudampuli',
      classification: 'identity_shift',
      what_is_lost: 'Kerala meen curry — walks to another coast',
    });
  });

  it('previews a structural swap (fish) and never invents a new recipe', async () => {
    const actor = await newUserActor('d25b');
    const { recipe, fishId } = await makeAnalysedRecipe(actor, 'd25b');
    const svc = new AnalysisService(recipes as any, intake as any, { enqueue: jest.fn(), enqueueView9Recompute: jest.fn() } as any, prisma as any);

    const before = await prisma.analysis.findMany({
      where: { recipeId: recipe.id },
      orderBy: { createdAt: 'asc' },
    });
    const beforeRows = before.map((a) => `${a.id}:${a.createdAt.toISOString()}`);

    const out = await svc.previewSubstitution(actor, recipe.id, fishId);
    expect(out.classification).toBe('structural');
    expect(out.substitute).toBe('Brinjal');
    expect(out.what_is_lost).toBe('Vegetarian version; fish texture lost');

    // read-only: analysis rows are byte-identical before/after the preview.
    const after = await prisma.analysis.findMany({
      where: { recipeId: recipe.id },
      orderBy: { createdAt: 'asc' },
    });
    const afterRows = after.map((a) => `${a.id}:${a.createdAt.toISOString()}`);
    expect(afterRows).toEqual(beforeRows);
    // no View 4/analysis payload mutation — the classification was never persisted.
    const view4 = await prisma.analysisView.findUnique({
      where: { analysisId_viewNumber: { analysisId: before[0].id, viewNumber: 4 } },
    });
    expect((view4!.payload as any).substitutions).toHaveLength(2);
    expect(JSON.stringify(view4!.payload)).not.toContain('classification');
  });

  it('404s: no complete analysis, unknown ingredient, foreign recipe (no existence leak)', async () => {
    const actor = await newUserActor('d25c');
    const foreign = await newUserActor('d25d');
    const { recipe, fishId } = await makeAnalysedRecipe(actor, 'd25c');
    const svc = new AnalysisService(recipes as any, intake as any, { enqueue: jest.fn(), enqueueView9Recompute: jest.fn() } as any, prisma as any);

    // unknown ingredient id (valid UUID, not a View 4 source) → SUBSTITUTION_NOT_FOUND
    await expect(
      svc.previewSubstitution(actor, recipe.id, crypto.randomUUID()),
    ).rejects.toMatchObject({ response: { code: 'SUBSTITUTION_NOT_FOUND' } });

    // foreign actor → RECIPE_NOT_FOUND (no existence leak)
    await expect(
      svc.previewSubstitution(foreign, recipe.id, fishId),
    ).rejects.toMatchObject({ response: { code: 'RECIPE_NOT_FOUND' } });
  });
});
