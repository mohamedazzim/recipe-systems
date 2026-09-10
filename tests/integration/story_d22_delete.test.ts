// D-22 (D6) integration — the canonical hard-delete lifecycle on real Postgres:
//   - DELETE /recipes/:id (confirm:true) removes the recipe row and EVERY
//     dependent row through the DB-level ON DELETE CASCADE chain proven here:
//     recipe_input, recipe_ingredient_line, recipe_tag, analysis → analysis_view
//     → analysis_claim + analysis_station_card, shopping_list_generation(+items),
//     ingredient_shopping_state, cook_log(+swap/photo).
//   - no orphan analysis/station-card rows remain (D-20 logic untouched).
//   - CONFIRM_REQUIRED (400) without {confirm:true}; recipe survives.
//   - INV-17: foreign + malformed + missing + repeated delete → the canonical
//     404s; nothing is removed and no existence leaks.
//   - storage: a real MinIO object (recipe.photo_uri) is deleted as the
//     compensating cleanup (DB first, storage after). Where object storage is
//     unreachable (CI), the DB delete still succeeds and the storage checks
//     are skipped — the residue path is unit-proven and logged (D6-4).
//
// Reference-data bootstrap: identical hygiene to the D-20/D-22 stories (the
// handler writes deterministic Views 8/9). Integration suites run SERIALLY.

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
const { RecipesController } = require('../../apps/api/src/modules/recipes/recipes.controller');
const { IntakeService } = require('../../apps/api/src/modules/intake/intake.service');
const { AnalysisService } = require('../../apps/api/src/modules/analysis/analysis.service');
const { StorageService } = require('../../apps/api/src/modules/intake/storage.service');
const { AnalysisJobHandler } = require('../../apps/analysis-worker/src/analysis-job.handler');
const { MockLlmAdapter } = require('@recipe-systems/llm-adapter');
const {
  ReferenceDataRepository,
} = require('../../apps/api/src/admin/reference-data.repository');
const { ReferenceDataService } = require('../../apps/api/src/admin/reference-data.service');

const recipes = new RecipeService(prisma, new StorageService());
const intake = new IntakeService(prisma, recipes as any);
const controller = new RecipesController(recipes as any);

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
const FAMILY = 'Coastal Tamil (Kanyakumari) style meen kuzhambu';

function fixtureAdapter(firstLineId: string) {
  const views: Record<number, unknown> = {
    1: {
      items: [{ ingredient_id: firstLineId, job: 'Protein', if_omitted: 'Not this dish', tag: 'CARD' }],
      role_groups: [],
    },
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
    5: {
      family: FAMILY,
      architecture: 'Raw-ground paste, triple sour',
      confidence: 'high',
      not_this: [],
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

describe('D-22 D6 delete — real Postgres + real object storage', () => {
  const createdRecipeIds: string[] = [];
  const createdAccountIds: string[] = [];
  const createdAnalysisIds: string[] = [];
  let storageKeysToVerify: string[] = [];

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
      fixtureAdapter(lines[0].id) as any,
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
    return { recipe, lines, analysisId };
  }

  /** Attach one of every dependent-row kind the cascade must remove. */
  async function attachDependentRows(recipeId: string, lines: any[]) {
    await prisma.recipeTag.create({ data: { recipeId, tagText: 'd6-proof' } });
    const log = await prisma.cookLog.create({
      data: { recipeId, cookedAt: new Date('2026-09-09'), rating: 4 },
    });
    await prisma.cookLogSwap.create({
      data: {
        cookLogId: log.id,
        ingredientNameSnapshot: 'Fish',
        changeType: 'reduced',
        originalValue: '500g',
        actualValue: '400g',
      },
    });
    await prisma.cookLogPhoto.create({
      data: { cookLogId: log.id, photoUri: 's3://recipe-assets/logs/d6-plate.jpg' },
    });
    const generation = await prisma.shoppingListGeneration.create({
      data: { recipeId, layout: 'flat', generatedAt: new Date() },
    });
    await prisma.shoppingListItem.create({
      data: {
        generationId: generation.id,
        shoppingKey: lines[0].shoppingKey,
        displayName: 'Fish — 500g',
        displayQuantity: '500g',
        unit: 'g',
        groupName: 'fish_meat',
        stateAtGeneration: 'need',
        position: 1,
      },
    });
    await prisma.ingredientShoppingState.create({
      data: { recipeId, shoppingKey: lines[0].shoppingKey, state: 'need' },
    });
    return { cookLogIds: [log.id], analysisIds: [] as string[], generationIds: [generation.id] };
  }

  beforeAll(async () => {
    await captureReferenceTables();
    await truncateReferenceTables();
    await loadCommittedReviewedImports();
  });

  afterAll(async () => {
    // two-step cleanup (id lists) — the same joins the service uses.
    const logIds = (await prisma.cookLog.findMany({ where: { recipeId: { in: createdRecipeIds } }, select: { id: true } })).map((l) => l.id);
    await prisma.cookLogPhoto.deleteMany({ where: { cookLogId: { in: logIds } } });
    await prisma.cookLogSwap.deleteMany({ where: { cookLogId: { in: logIds } } });
    await prisma.cookLog.deleteMany({ where: { id: { in: logIds } } });
    const genIds = (await prisma.shoppingListGeneration.findMany({ where: { recipeId: { in: createdRecipeIds } }, select: { id: true } })).map((g) => g.id);
    await prisma.shoppingListItem.deleteMany({ where: { generationId: { in: genIds } } });
    await prisma.shoppingListGeneration.deleteMany({ where: { id: { in: genIds } } });
    await prisma.ingredientShoppingState.deleteMany({ where: { recipeId: { in: createdRecipeIds } } });
    await prisma.recipeTag.deleteMany({ where: { recipeId: { in: createdRecipeIds } } });
    const viewIds = (await prisma.analysisView.findMany({ where: { analysisId: { in: createdAnalysisIds } }, select: { id: true } })).map((v) => v.id);
    await prisma.analysisStationCard.deleteMany({ where: { analysisId: { in: createdAnalysisIds } } });
    await prisma.analysisClaim.deleteMany({ where: { analysisViewId: { in: viewIds } } });
    await prisma.analysisView.deleteMany({ where: { id: { in: viewIds } } });
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

  it('hard delete cascades EVERY dependent row and leaves zero orphans; other users are untouched', async () => {
    const owner = await newUserActor('d6');
    const other = await newUserActor('d6-other');
    const { recipe, lines, analysisId } = await makeAnalysedRecipe(owner, 'd6a');
    await attachDependentRows(recipe.id, lines);
    // a second, unrelated recipe must survive
    const otherRecipe = await recipes.createForIntake(other, { rawText: 'Okra — 200g' });
    createdRecipeIds.push(otherRecipe.id);
    await intake.recordPaste(other, otherRecipe.id, 'Okra — 200g');

    // Pre-conditions: every dependent kind exists.
    expect(await prisma.recipeInput.count({ where: { recipeId: recipe.id } })).toBeGreaterThan(0);
    expect(await prisma.analysisStationCard.count({ where: { analysisId } })).toBe(1);
    const preLogIds = (
      await prisma.cookLog.findMany({ where: { recipeId: recipe.id }, select: { id: true } })
    ).map((l) => l.id);
    expect(await prisma.cookLogPhoto.count({ where: { cookLogId: { in: preLogIds } } })).toBe(1);

    await controller.deleteRecipe({ user: owner.user } as any, recipe.id, { confirm: true });

    expect(await prisma.recipe.findUnique({ where: { id: recipe.id } })).toBeNull();
    const logIdsAfter = (await prisma.cookLog.findMany({ where: { recipeId: recipe.id }, select: { id: true } })).map((l) => l.id);
    const genIdsAfter = (await prisma.shoppingListGeneration.findMany({ where: { recipeId: recipe.id }, select: { id: true } })).map((g) => g.id);
    const viewIdsAfter = (await prisma.analysisView.findMany({ where: { analysisId }, select: { id: true } })).map((v) => v.id);
    for (const [label, count] of Object.entries({
      recipe_input: await prisma.recipeInput.count({ where: { recipeId: recipe.id } }),
      recipe_ingredient_line: await prisma.recipeIngredientLine.count({ where: { recipeId: recipe.id } }),
      recipe_tag: await prisma.recipeTag.count({ where: { recipeId: recipe.id } }),
      analysis: await prisma.analysis.count({ where: { recipeId: recipe.id } }),
      analysis_view: await prisma.analysisView.count({ where: { analysisId } }),
      analysis_claim: viewIdsAfter.length ? await prisma.analysisClaim.count({ where: { analysisViewId: { in: viewIdsAfter } } }) : 0,
      analysis_station_card: await prisma.analysisStationCard.count({ where: { analysisId } }),
      shopping_list_generation: await prisma.shoppingListGeneration.count({ where: { recipeId: recipe.id } }),
      shopping_list_item: genIdsAfter.length ? await prisma.shoppingListItem.count({ where: { generationId: { in: genIdsAfter } } }) : 0,
      ingredient_shopping_state: await prisma.ingredientShoppingState.count({
        where: { recipeId: recipe.id },
      }),
      cook_log: await prisma.cookLog.count({ where: { recipeId: recipe.id } }),
      cook_log_swap: logIdsAfter.length ? await prisma.cookLogSwap.count({ where: { cookLogId: { in: logIdsAfter } } }) : 0,
      cook_log_photo: logIdsAfter.length ? await prisma.cookLogPhoto.count({ where: { cookLogId: { in: logIdsAfter } } }) : 0,
    })) {
      expect(Number(count)).toBe(0); // cascade proof — no orphans, no residue
      expect(label).toBeTruthy();
    }
    // the other user's recipe survives untouched
    expect(await prisma.recipe.findUnique({ where: { id: otherRecipe.id } })).not.toBeNull();
  });

  it('CONFIRM_REQUIRED: deletion without {confirm:true} is refused and the recipe survives', async () => {
    const actor = await newUserActor('d6-confirm');
    const { recipe } = await makeAnalysedRecipe(actor, 'd6b');
    await expect(controller.deleteRecipe({ user: actor.user } as any, recipe.id, {})).rejects.toMatchObject({
      response: { code: 'CONFIRM_REQUIRED' },
    });
    await expect(
      controller.deleteRecipe({ user: actor.user } as any, recipe.id, { confirm: false }),
    ).rejects.toMatchObject({ response: { code: 'CONFIRM_REQUIRED' } });
    expect(await prisma.recipe.findUnique({ where: { id: recipe.id } })).not.toBeNull();
  });

  it('INV-17: foreign, malformed, missing and repeated deletes are the canonical 404 — no existence leak', async () => {
    const owner = await newUserActor('d6-owner');
    const foreign = await newUserActor('d6-foreign');
    const { recipe } = await makeAnalysedRecipe(owner, 'd6c');

    await expect(
      controller.deleteRecipe({ user: foreign.user } as any, recipe.id, { confirm: true }),
    ).rejects.toMatchObject({ response: { code: 'RECIPE_NOT_FOUND' } });
    await expect(
      controller.deleteRecipe({ user: owner.user } as any, 'not-a-uuid', { confirm: true }),
    ).rejects.toMatchObject({ response: { code: 'RECIPE_NOT_FOUND' } });
    await expect(
      controller.deleteRecipe({ user: owner.user } as any, crypto.randomUUID(), { confirm: true }),
    ).rejects.toMatchObject({ response: { code: 'RECIPE_NOT_FOUND' } });
    expect(await prisma.recipe.findUnique({ where: { id: recipe.id } })).not.toBeNull();

    // the real delete, then the repeat → same 404
    await controller.deleteRecipe({ user: owner.user } as any, recipe.id, { confirm: true });
    await expect(
      controller.deleteRecipe({ user: owner.user } as any, recipe.id, { confirm: true }),
    ).rejects.toMatchObject({ response: { code: 'RECIPE_NOT_FOUND' } });
  });

  it('storage: the recipe photo object is deleted by the compensating cleanup (real MinIO)', async () => {
    const storage = new StorageService();
    let uploaded: { key: string; uri: string } | null = null;
    try {
      uploaded = await storage.uploadImage(Buffer.from('d6-probe-jpeg'), 'image/jpeg');
    } catch {
      // Object storage unreachable (CI posture): DB-only delete still proven below.
    }

    const actor = await newUserActor('d6-storage');
    const { recipe } = await makeAnalysedRecipe(actor, 'd6d');
    if (uploaded) {
      await prisma.recipe.update({ where: { id: recipe.id }, data: { photoUri: uploaded.uri } });
      storageKeysToVerify.push(uploaded.key);
    }

    await controller.deleteRecipe({ user: actor.user } as any, recipe.id, { confirm: true });
    expect(await prisma.recipe.findUnique({ where: { id: recipe.id } })).toBeNull();

    if (uploaded) {
      expect(await storage.objectExists(uploaded.key)).toBe(false); // object gone — no residue
    }
  });
});
