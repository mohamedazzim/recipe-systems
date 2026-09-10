// D-22 (P5-1) integration — Save + library (D1/D2) on real Postgres:
//   - a fully analysed golden recipe is SAVED with no title → the default name
//     is the identification family (D1 AC-2), artifacts confirmed, never copied.
//   - an explicit editable title is persisted (AC-2).
//   - the account library returns canonical D2 AC-1 rows (name, date, family,
//     cook-log indicator — EXISTS on the live cook_log table).
//   - cross-account denial: B's library never lists A's recipes and B cannot
//     save A's recipe (INV-17, 404).
//   - A1 TC-02 resume-save: a guest saves, the real AuthService claim transaction
//     (QA-B2/D-08 spine) moves the recipe onto a new account, and the saved
//     recipe — name and all — appears in that account's library.
//
// Reference-data bootstrap: identical hygiene to story_d20 (the handler writes
// deterministic Views 8/9). Integration suites run SERIALLY (maxWorkers: 1).

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
const { AuthService } = require('../../apps/api/src/modules/auth/auth.service');
const { AccountService } = require('../../apps/api/src/modules/account/account.service');
const { AnalysisJobHandler } = require('../../apps/analysis-worker/src/analysis-job.handler');
const { MockLlmAdapter } = require('@recipe-systems/llm-adapter');
const {
  ReferenceDataRepository,
} = require('../../apps/api/src/admin/reference-data.repository');
const { ReferenceDataService } = require('../../apps/api/src/admin/reference-data.service');

const recipes = new RecipeService(prisma);
const intake = new IntakeService(prisma, recipes as any);
const auth = new AuthService({} as any, prisma, new AccountService(prisma));
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

describe('D-22 save + library — real Postgres + reviewed reference data', () => {
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

  async function newGuestSession() {
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

    // REAL capture path: AnalysisService.buildCapture via a capturing fake queue
    // (the same Q1-labeled seam the API enqueue uses).
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
    return { recipe, lines };
  }

  beforeAll(async () => {
    await captureReferenceTables();
    await truncateReferenceTables();
    await loadCommittedReviewedImports();
  });

  afterAll(async () => {
    await prisma.cookLog.deleteMany({ where: { recipeId: { in: createdRecipeIds } } });
    await prisma.analysisStationCard.deleteMany({ where: { analysisId: { in: createdAnalysisIds } } });
    await prisma.analysisView.deleteMany({ where: { analysisId: { in: createdAnalysisIds } } });
    await prisma.analysis.deleteMany({ where: { id: { in: createdAnalysisIds } } });
    for (const id of createdRecipeIds) {
      await prisma.recipe.deleteMany({ where: { id } });
    }
    for (const id of createdAccountIds) {
      await prisma.account.deleteMany({ where: { id } });
    }
    for (const id of createdGuestSessionIds) {
      await prisma.guestSession.deleteMany({ where: { id } });
    }
    await truncateReferenceTables();
    await restoreReferenceTables();
    await prisma.$disconnect();
  });

  it('D1: saving a fully analysed recipe with no title applies the family default and confirms the artifact set', async () => {
    const actor = await newUserActor('d22');
    const { recipe } = await makeAnalysedRecipe(actor, 'd22a');
    const wire = await controller.save({ actor } as any, recipe.id, {});
    expect(wire.title).toBe(FAMILY);
    expect(wire.artifacts).toEqual({
      raw_input: true,
      photo: false,
      object: true,
      identification: true,
      analysis: true,
      timestamps: true,
    });
    expect(wire.saved_at).toBeTruthy();
    const row = await prisma.recipe.findUnique({ where: { id: recipe.id } });
    expect(row?.title).toBe(FAMILY); // persisted in the recipe row (AC-2: editable)
  });

  it('D1 AC-2: an explicit title is persisted and a blank later save keeps it', async () => {
    const actor = await newUserActor('d22b');
    const { recipe } = await makeAnalysedRecipe(actor, 'd22b');
    const named = await controller.save({ actor } as any, recipe.id, { title: 'Sunday fish curry' });
    expect(named.title).toBe('Sunday fish curry');
    const blank = await controller.save({ actor } as any, recipe.id, { title: '   ' });
    expect(blank.title).toBe('Sunday fish curry');
  });

  it('D2: the library returns canonical AC-1 rows; the cook-log indicator flips with a real log row', async () => {
    const actor = await newUserActor('d22c');
    const { recipe } = await makeAnalysedRecipe(actor, 'd22c');
    await controller.save({ actor } as any, recipe.id, {});

    let rows = (await controller.library({ user: actor.user } as any)).recipes;
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe(FAMILY);
    expect(rows[0].family).toBe(FAMILY);
    expect(rows[0].has_cook_log).toBe(false);
    expect(Date.parse(rows[0].date)).toBeTruthy();

    await prisma.cookLog.create({
      data: { recipeId: recipe.id, cookedAt: new Date('2026-09-09'), rating: 4 },
    });
    rows = (await controller.library({ user: actor.user } as any)).recipes;
    expect(rows[0].has_cook_log).toBe(true);
  });

  it('INV-17: cross-account denial — B never sees A’s recipe and cannot save it', async () => {
    const a = await newUserActor('d22d-a');
    const b = await newUserActor('d22d-b');
    const { recipe } = await makeAnalysedRecipe(a, 'd22d');

    const rows = (await controller.library({ user: b.user } as any)).recipes;
    expect(rows).toEqual([]);

    await expect(controller.save({ actor: b } as any, recipe.id, {})).rejects.toMatchObject({
      response: { code: 'RECIPE_NOT_FOUND' },
    });
    const row = await prisma.recipe.findUnique({ where: { id: recipe.id } });
    expect(row?.title).toBe('Untitled recipe'); // B's save attempt changed nothing
  });

  it('A1 TC-02 resume-save: guest save → real claim transaction → the saved recipe lands in the new account library', async () => {
    const guest = await newGuestSession();
    const { recipe } = await makeAnalysedRecipe(guest, 'd22e');

    const saved = await controller.save({ actor: guest } as any, recipe.id, { title: 'Amma’s fish curry' });
    expect(saved.title).toBe('Amma’s fish curry');

    const account = await prisma.account.create({
      data: { email: `d22e-claim-${Date.now()}@test.dev`, authProvider: 'sso', preferredMode: 'home' },
    });
    createdAccountIds.push(account.id);

    const claim = await auth.claimGuestSession(account.id, guest.guestSessionId);
    expect(claim.claimed).toBe('new');

    const rows = (await controller.library({ user: { accountId: account.id, email: account.email, sub: 'd22e' } } as any)).recipes;
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Amma’s fish curry'); // the save state rode the claim
    expect(rows[0].family).toBe(FAMILY);

    const claimedRow = await prisma.recipe.findUnique({ where: { id: recipe.id } });
    expect(claimedRow?.accountId).toBe(account.id);
    expect(claimedRow?.guestSessionId).toBeNull(); // XOR holds
  });
});
