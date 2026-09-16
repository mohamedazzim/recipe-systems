// D-31 integration — the home-mode one-pager (E6/I5) + the F5 plate photo on
// real Postgres (no live MinIO — the cook service takes a fake storage):
//   E6 — onePagerPrint renders ONLY persisted snapshots: View 2 (keep),
//        View 4 (negotiate), View 5 (identity-shift + family) and the D-20
//        station-card mise (ingredients). No legal nutrition-label wording.
//   I5 — the View 9 energy band appears on the one-pager but NEVER on the
//        market list (shoppingListPrint).
//   F5 — one plate photo per log (replace deletes the old object), no
//        re-analysis (analysis rows byte-identical before/after), ownership
//        canonical 404s.
//
// Reference-data bootstrap: identical hygiene to story_d19/d23/d30.
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
const { ShoppingService } = require('../../apps/api/src/modules/shopping/shopping.service');
const { PrintService } = require('../../apps/api/src/modules/print/print.service');
const { CookService } = require('../../apps/api/src/modules/cook/cook.service');
const { AnalysisJobHandler } = require('../../apps/analysis-worker/src/analysis-job.handler');
const { MockLlmAdapter } = require('@recipe-systems/llm-adapter');
const { chromiumRuntime } = require('@recipe-systems/rendering');
const {
  ReferenceDataRepository,
} = require('../../apps/api/src/admin/reference-data.repository');
const { ReferenceDataService } = require('../../apps/api/src/admin/reference-data.service');

const recipes = new RecipeService(prisma);
const intake = new IntakeService(prisma, recipes as any);
const shopping = new ShoppingService(prisma, recipes as any);
const print = new PrintService(prisma, recipes as any, chromiumRuntime());

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

/** D-31 fixture: populated Views 2/4/5 so the one-pager has keep/negotiate/
 *  identity-shift content. Views 8/9 are still deterministic (no LLM). */
function fixtureAdapter(firstLineId: string) {
  const views: Record<number, unknown> = {
    1: {
      items: [{ ingredient_id: firstLineId, job: 'Protein', if_omitted: 'Not this dish', tag: 'CARD' }],
      role_groups: [],
    },
    2: {
      pillars: [
        {
          pillar: 'Tamarind sharpness',
          source_ingredient_ids: [firstLineId],
          if_missing: 'Flat, generic stew',
          tag: 'INFERRED',
        },
      ],
      blind_spot_notes: [],
    },
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
    4: {
      substitutions: [
        { ingredient_id: firstLineId, substitute: 'Kokum', consequence: 'Milder sourness', tag: 'INFERRED' },
      ],
    },
    5: {
      family: 'Coastal Tamil (Kanyakumari) style meen kuzhambu',
      architecture: 'Raw-ground paste, triple sour',
      confidence: 'high',
      not_this: [
        { variant: 'Kerala meen curry', key_difference: 'coconut milk instead of ground coconut' },
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

function pdfPageCount(pdf: Buffer): number {
  const text = pdf.toString('latin1');
  const matches = text.match(/\/Type\s*\/Page\b/g);
  return matches ? matches.length : 0;
}

describe('D-31 one-pager + plate photo — real Postgres', () => {
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
    expect(lines).toHaveLength(CARD_LINES.length);
    for (let i = 0; i < lines.length; i += 1) {
      await prisma.recipeIngredientLine.update({
        where: { id: lines[i].id },
        data: { amountText: AMOUNTS[i], needsReview: false },
      });
    }

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
    await prisma.analysisStationCard.deleteMany({ where: { analysisId: { in: createdAnalysisIds } } });
    await prisma.analysisView.deleteMany({ where: { analysisId: { in: createdAnalysisIds } } });
    await prisma.analysis.deleteMany({ where: { id: { in: createdAnalysisIds } } });
    for (const id of createdRecipeIds) {
      await prisma.recipe.deleteMany({ where: { id } }); // cascades cook_log + photo
    }
    for (const id of createdAccountIds) {
      await prisma.account.deleteMany({ where: { id } });
    }
    await truncateReferenceTables();
    await restoreReferenceTables();
    await prisma.$disconnect();
  });

  it('E6: the one-pager renders keep/negotiate/identity-shift/ingredients with no nutrition-label wording', async () => {
    const actor = await newUserActor('d31a');
    const { recipe } = await makeAnalysedRecipe(actor, 'd31a');

    const out = await print.onePagerPrint(actor, recipe.id, 'html');
    expect(out.html).toContain('Keep');
    expect(out.html).toContain('Tamarind sharpness');
    expect(out.html).toContain('Negotiate');
    expect(out.html).toContain('Kokum');
    expect(out.html).toContain('Identity-shift');
    expect(out.html).toContain('Kerala meen curry');
    expect(out.html).toContain('Fish — 500g');
    expect(out.html).toContain('Coastal Tamil (Kanyakumari) style meen kuzhambu');
    expect(out.html).toContain('Not a lab analysis');
    expect(out.html).not.toContain('Nutrition Facts');
    expect(out.html).not.toContain('Serving Size');
  });

  it('E6: the one-pager PDF fits ONE A4 page', async () => {
    const actor = await newUserActor('d31b');
    const { recipe } = await makeAnalysedRecipe(actor, 'd31b');

    const out = await print.onePagerPrint(actor, recipe.id, 'pdf');
    expect(out.pdf).toBeTruthy();
    expect(out.pdf!.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdfPageCount(out.pdf!)).toBe(1);
  });

  it('I5: the energy band appears on the one-pager but never on the market list', async () => {
    const actor = await newUserActor('d31c');
    const { recipe } = await makeAnalysedRecipe(actor, 'd31c');

    const onePager = await print.onePagerPrint(actor, recipe.id, 'html');
    expect(onePager.html).toContain('Energy (whole pot)');
    expect(onePager.html).toContain('kcal');
    expect(onePager.html).toContain('a band, never a point');

    await shopping.generate(actor, recipe.id);
    const market = await print.shoppingListPrint(actor, recipe.id, 'html');
    expect(market.html).not.toContain('Energy (whole pot)');
    expect(market.html).not.toContain('kcal');
  });

  it('F5: one plate photo per log — attach, read, and replace (old object deleted), no re-analysis', async () => {
    const actor = await newUserActor('d31d');
    const { recipe } = await makeAnalysedRecipe(actor, 'd31d');

    const uploaded: Array<{ key: string; uri: string }> = [];
    const deleted: string[] = [];
    const fakeStorage = {
      bucket: 'recipe-assets',
      uploadImage: jest.fn(async (_buf: Buffer, _ct: string) => {
        const key = `cook/${crypto.randomUUID()}.jpg`;
        const uri = `s3://recipe-assets/${key}`;
        uploaded.push({ key, uri });
        return { key, uri };
      }),
      tryDeleteObject: jest.fn(async (key: string) => {
        deleted.push(key);
        return true;
      }),
      deleteObject: jest.fn(async () => undefined),
    };
    const cook = new CookService(prisma, recipes as any, intake as any, fakeStorage as any);

    const log = await cook.logCook(actor, recipe.id, { rating: 5, note: 'First cook' });
    const analysisBefore = await prisma.analysis.findMany({
      where: { recipeId: recipe.id },
      orderBy: { createdAt: 'asc' },
    });
    const analysisRowsBefore = analysisBefore.map((a) => `${a.id}:${a.createdAt.toISOString()}`);

    // Attach the first photo.
    const first = await cook.attachPlatePhoto(actor, log.cook_log_id, Buffer.from('img-1'), 'image/jpeg');
    expect(first.photo_uri).toBe(`s3://recipe-assets/${uploaded[0].key}`);
    expect(fakeStorage.uploadImage).toHaveBeenCalledTimes(1);
    expect(fakeStorage.tryDeleteObject).not.toHaveBeenCalled(); // no prior photo

    const read = await cook.platePhoto(actor, log.cook_log_id);
    expect(read.photo_uri).toBe(first.photo_uri);

    // Replace with a second photo → old object deleted, one row remains.
    const second = await cook.attachPlatePhoto(actor, log.cook_log_id, Buffer.from('img-2'), 'image/png');
    expect(second.photo_uri).toBe(`s3://recipe-assets/${uploaded[1].key}`);
    expect(fakeStorage.tryDeleteObject).toHaveBeenCalledTimes(1);
    expect(deleted).toEqual([uploaded[0].key]);

    const rows = await prisma.cookLogPhoto.findMany({ where: { cookLogId: log.cook_log_id } });
    expect(rows).toHaveLength(1); // ONE image per log (F5 AC-1)
    expect(rows[0].photoUri).toBe(second.photo_uri);

    // F5 AC-2: attaching a photo NEVER re-analyses (analysis rows unchanged).
    const analysisAfter = await prisma.analysis.findMany({
      where: { recipeId: recipe.id },
      orderBy: { createdAt: 'asc' },
    });
    const analysisRowsAfter = analysisAfter.map((a) => `${a.id}:${a.createdAt.toISOString()}`);
    expect(analysisRowsAfter).toEqual(analysisRowsBefore);
  });

  it('F5: ownership rides the log recipe — a foreign actor gets the canonical 404 (no existence leak)', async () => {
    const owner = await newUserActor('d31e');
    const foreign = await newUserActor('d31f');
    const { recipe } = await makeAnalysedRecipe(owner, 'd31e');
    const fakeStorage = {
      bucket: 'recipe-assets',
      uploadImage: jest.fn(async () => ({ key: 'cook/x.jpg', uri: 's3://recipe-assets/cook/x.jpg' })),
      tryDeleteObject: jest.fn(async () => true),
      deleteObject: jest.fn(async () => undefined),
    };
    const cook = new CookService(prisma, recipes as any, intake as any, fakeStorage as any);
    const log = await cook.logCook(owner, recipe.id, {});

    await expect(
      cook.attachPlatePhoto(foreign, log.cook_log_id, Buffer.from('x'), 'image/jpeg'),
    ).rejects.toMatchObject({ response: { code: 'RECIPE_NOT_FOUND' } });
    await expect(cook.platePhoto(foreign, log.cook_log_id)).rejects.toMatchObject({
      response: { code: 'RECIPE_NOT_FOUND' },
    });
    expect(fakeStorage.uploadImage).not.toHaveBeenCalled();
  });
});
