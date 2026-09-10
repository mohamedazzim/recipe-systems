// D-20 (P4-2) integration — Chef Mode + Station Card on real Postgres:
//   - the full AnalysisJobHandler run (mode 'chef') persists analysis_station_card
//     derived ONLY from the Q1-labeled capture + the persisted View 3 row
//     (INV-10 — never free prose). mise keys are ingredient line ids verbatim;
//     sequence is the persisted View 3 stages verbatim; control_points derive
//     one-per-stage; do_nots is empty (no absent-capture surface yet, C1/P3-4);
//     product_yield_hold stays null (unknowns stay blank, §7).
//   - the refusal path produces NO row (no method / View 3 INCOMPLETE) and the
//     API answers 404 STATION_CARD_NOT_FOUND — the card is never fabricated.
//   - GET /analysis/:analysisId/station-card returns the frozen wire shape and
//     the analysis assemblies carry `station_card` (INV-17: foreign → 404).
//
// Reference-data bootstrap: identical hygiene to story_d19_views_8_9 (the
// handler also writes deterministic Views 8/9, which need the D-29 reviewed
// reference tables). Integration suites run SERIALLY (maxWorkers: 1).

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
const { AnalysisService } = require('../../apps/api/src/modules/analysis/analysis.service');
const { AnalysisController } = require('../../apps/api/src/modules/analysis/analysis.controller');
const { AnalysisEventsService } = require('../../apps/api/src/modules/analysis/analysis-events.service');
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
const AMOUNTS = [
  '500g',
  '1 Nos',
  '1/2 Nos',
  'Half Shell',
  'For Tempering',
  '5 Nos',
  '2 Tsp',
  '1 Tsp',
  'A Lemon Size',
  '1/2 Tsp',
  '1/4 Tsp',
];

const COMPLETE_VIEW3 = {
  status: 'COMPLETE',
  stages: [
    {
      stage_name: 'Load and heat',
      action: 'Add fish, drumstick, chilli; cover; boil then reduce to medium',
      cue: 'Fish opaque and just flaking',
      duration: 'About 5-6 minutes after boil',
      tag: 'METHOD',
    },
    {
      stage_name: 'Finish aroma',
      action: 'Mustard, fenugreek seed, curry leaf and coconut oil tempered last',
      cue: 'Mustard pops; curry leaf crackles',
      duration: 'UNKNOWN',
      tag: 'METHOD',
    },
  ],
  incomplete_reason: null,
};

function fixtureAdapter(firstLineId: string, view3Payload: unknown) {
  const views: Record<number, unknown> = {
    1: {
      items: [{ ingredient_id: firstLineId, job: 'Protein', if_omitted: 'Not this dish', tag: 'CARD' }],
      role_groups: [],
    },
    2: { pillars: [], blind_spot_notes: [] },
    3: view3Payload,
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

describe('D-20 chef mode + station card — real Postgres + reviewed reference data', () => {
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

  async function runCapture(actor: any, recipeId: string, mode: 'home' | 'chef') {
    let captured: any = null;
    const queue = {
      enqueue: jest.fn(async (payload: any) => {
        captured = payload.captured;
        return 'analysis-queued';
      }),
      enqueueView9Recompute: jest.fn(async () => undefined),
    };
    const svc = new AnalysisService(recipes as any, intake as any, queue as any, prisma as any);
    await svc.enqueue(actor, recipeId, mode);
    expect(captured).not.toBeNull();
    return captured;
  }

  async function makeReadyRecipe(actor: any, prefix: string) {
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
    expect(lines).toHaveLength(CARD_LINES.length);
    for (let i = 0; i < lines.length; i += 1) {
      await prisma.recipeIngredientLine.update({
        where: { id: lines[i].id },
        data: { amountText: AMOUNTS[i], needsReview: false },
      });
    }
    return { recipe, lines };
  }

  async function runHandler(
    analysisId: string,
    recipeId: string,
    captured: any,
    view3Payload: unknown,
    firstLineId: string,
  ) {
    const handler = new AnalysisJobHandler(
      prisma,
      fixtureAdapter(firstLineId, view3Payload) as any,
      jest.fn() as any,
    );
    await handler.handle({
      analysis_id: analysisId,
      recipe_id: recipeId,
      mode: 'chef',
      prompt_version: 'v2',
      captured,
    });
    createdAnalysisIds.push(analysisId);
  }

  function controller() {
    const events = new AnalysisEventsService(process.env.DATABASE_URL as string, prisma);
    return new AnalysisController({} as any, events as any, prisma as any);
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

  it('the reviewed-path load carries the full D-29 content (17/12/6/6/12/12)', async () => {
    const counts = {
      defs: await prisma.dietaryAllergenDefinition.count(),
      dict: await prisma.ingredientDictionary.count(),
      aliases: await prisma.ingredientAlias.count(),
      mappings: await prisma.dietaryAllergenMapping.count(),
      entries: await prisma.nutritionFoodCompositionEntry.count(),
      versions: await prisma.nutritionFoodCompositionVersion.count(),
    };
    expect(counts).toEqual({ defs: 17, dict: 12, aliases: 6, mappings: 6, entries: 12, versions: 12 });
  });

  it('chef-mode run persists the station card (capture + View 3 verbatim) and the API serves the frozen wire; foreign → 404', async () => {
    const actor = await newUserActor('d20');
    const { recipe, lines } = await makeReadyRecipe(actor, 'd20');
    const captured = await runCapture(actor, recipe.id, 'chef');

    const analysisId = '88888888-8888-4888-8888-888888888888';
    await runHandler(analysisId, recipe.id, captured, COMPLETE_VIEW3, lines[0].id);

    // Persistence: the intended D-20 model row exists, derived verbatim.
    const card = await prisma.analysisStationCard.findUnique({ where: { analysisId } });
    expect(card).not.toBeNull();
    expect(card!.printable).toBe(true);
    expect(card!.productYieldHold).toBeNull();

    const mise = card!.mise as Record<string, { display_name: string; amount: string | null; tag: string }>;
    expect(Object.keys(mise)).toHaveLength(CARD_LINES.length);
    for (let i = 0; i < lines.length; i += 1) {
      expect(mise[lines[i].id]).toEqual({
        display_name: lines[i].displayName,
        amount: AMOUNTS[i],
        tag: 'CARD',
      });
    }

    const sequence = card!.sequence as any[];
    expect(sequence).toEqual(COMPLETE_VIEW3.stages); // stages verbatim, duration UNKNOWN preserved
    const controlPoints = card!.controlPoints as any[];
    expect(controlPoints).toEqual(
      COMPLETE_VIEW3.stages.map((s) => ({ stage_name: s.stage_name, cue: s.cue, tag: s.tag })),
    );
    expect(card!.doNots).toEqual([]); // no absent-capture surface yet (C1/P3-4) — never invented

    // API: the dedicated route returns the frozen wire shape.
    const got = await controller().getStationCard({ actor } as any, analysisId);
    expect(got).toEqual({
      station_card_id: card!.id,
      analysis_id: analysisId,
      mise: card!.mise,
      sequence: card!.sequence,
      do_nots: card!.doNots,
      control_points: card!.controlPoints,
      product_yield_hold: null,
      printable: true,
    });

    // API: the analysis assemblies carry the same card (workspace chef rendering).
    const latest = await controller().latestAnalysis({ actor } as any, recipe.id);
    expect(latest.station_card).toEqual(got);

    // INV-17: a foreign account gets 404 ANALYSIS_NOT_FOUND (no existence leak).
    const foreign = await newUserActor('d20-foreign');
    await expect(controller().getStationCard({ actor: foreign } as any, analysisId)).rejects.toMatchObject({
      response: { code: 'ANALYSIS_NOT_FOUND' },
    });

    await controller().latestAnalysis({ actor: foreign } as any, recipe.id).catch(() => undefined);
  });

  it('refusal path: View 3 INCOMPLETE or no method → no card row, 404 STATION_CARD_NOT_FOUND', async () => {
    const actor = await newUserActor('d20-incomplete');
    const { recipe } = await makeReadyRecipe(actor, 'd20-incomplete');

    // Branch 1: method attached but the persisted View 3 is INCOMPLETE.
    const captured = await runCapture(actor, recipe.id, 'chef');
    const lines = await prisma.recipeIngredientLine.findMany({
      where: { recipeId: recipe.id, deletedAt: null },
      orderBy: { lineNo: 'asc' },
    });
    const a1 = '77777777-7777-4777-8777-777777777777';
    await runHandler(a1, recipe.id, captured, {
      status: 'INCOMPLETE',
      stages: [],
      incomplete_reason: 'Process not recoverable from the accepted sources',
    }, lines[0].id);
    expect(await prisma.analysisStationCard.findUnique({ where: { analysisId: a1 } })).toBeNull();
    await expect(controller().getStationCard({ actor } as any, a1)).rejects.toMatchObject({
      response: { code: 'STATION_CARD_NOT_FOUND' },
    });

    // Branch 2: no method steps in the capture at all (the Q1 capture seam).
    const noMethod = {
      ...captured,
      structured_recipe: { ...captured.structured_recipe, method_steps: [] },
    };
    const a2 = '66666666-6666-4666-8666-666666666666';
    await runHandler(a2, recipe.id, noMethod, COMPLETE_VIEW3, lines[0].id);
    expect(await prisma.analysisStationCard.findUnique({ where: { analysisId: a2 } })).toBeNull();
    await expect(controller().getStationCard({ actor } as any, a2)).rejects.toMatchObject({
      response: { code: 'STATION_CARD_NOT_FOUND' },
    });

    // The assemblies still answer with station_card: null — never fabricated.
    const latest = await controller().latestAnalysis({ actor } as any, recipe.id);
    expect(latest.station_card).toBeNull();
  });
});
