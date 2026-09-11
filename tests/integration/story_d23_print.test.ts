// D-23 (P5-2) integration — print on real Postgres with the REAL Chromium
// runtime:
//   - E4: the shopping-list PDF/HTML renders the real D-30 snapshot (groups,
//     two distinct fenugreeks, qualifiers, strike) and fits ONE A4 page.
//   - E5: the station-card PDF/HTML renders the real D-20 card snapshot
//     (mise/sequence/control points/do-nots/untasted briefing) on ONE page.
//   - H4/Q2 Option A: the frozen allergen line (persisted at analysis time by
//     the worker) appears on BOTH prints; no "safe"; H6 verbatim.
//   - INV-12 snapshot-only proof: after the snapshot exists, (1) the current
//     allergen definition is CHANGED live and (2) a recipe line is EDITED
//     live — both re-prints are BYTE-IDENTICAL to the originals (no print-time
//     join to the current mapping, no live-row reconstruction).
//   - INV-17: foreign/missing/malformed ids → canonical 404s.
//
// Reference-data bootstrap: identical hygiene to story_d20/d22/d30.
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
const { AnalysisJobHandler } = require('../../apps/analysis-worker/src/analysis-job.handler');
const { MockLlmAdapter } = require('@recipe-systems/llm-adapter');
const { A4_HEIGHT_PX, chromiumRuntime } = require('@recipe-systems/rendering');
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

function fixtureAdapter(firstLineId: string) {
  const views: Record<number, unknown> = {
    1: { items: [{ ingredient_id: firstLineId, job: 'Protein', if_omitted: 'Not this dish', tag: 'CARD' }], role_groups: [] },
    2: { pillars: [], blind_spot_notes: [] },
    3: { status: 'COMPLETE', stages: [{ stage_name: 'Load and heat', action: 'Add fish; boil then reduce', cue: 'Fish opaque and just flaking', duration: 'About 5-6 minutes', tag: 'METHOD' }], incomplete_reason: null },
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

describe('D-23 print — real Postgres + real Chromium PDF', () => {
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
      await prisma.recipe.deleteMany({ where: { id } });
    }
    for (const id of createdAccountIds) {
      await prisma.account.deleteMany({ where: { id } });
    }
    await truncateReferenceTables();
    await restoreReferenceTables();
    await prisma.$disconnect();
  });

  it('E4 + H4: the golden shopping list prints on ONE page with the frozen allergen line, two fenugreeks, groups and strike', async () => {
    const actor = await newUserActor('d23a');
    const { recipe } = await makeAnalysedRecipe(actor, 'd23a');
    await shopping.generate(actor, recipe.id);
    await shopping.setState(actor, recipe.id, {
      shopping_key: (await prisma.recipeIngredientLine.findFirstOrThrow({ where: { recipeId: recipe.id } })).shoppingKey,
      state: 'have',
    });

    const out = await print.shoppingListPrint(actor, recipe.id, 'pdf');
    expect(out.pdf).toBeTruthy();
    expect(out.pdf!.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdfPageCount(out.pdf!)).toBe(1); // ONE page (E4 TC-02)

    const html = out.html;
    expect(html).toContain('Fenugreek Powder — 1/2 Tsp');
    expect(html).toContain('Fenugreek — 1/4 Tsp'); // distinct rows
    expect(html).toContain('fresh produce');
    expect(html).toContain('fish/meat');
    expect(html).toContain('spices');
    expect(html).toContain('fats/oils');
    expect(html).toContain('Contains: Fish, Coconut, Fenugreek. Notes: Fish species unknown.');
    expect(html).toContain('Reads the card only. Does not test food.'); // H6 verbatim
    expect(html).toContain('class="have"'); // E2 strike
    expect(html).not.toMatch(/\bsafe\b/i);

    // One-page layout proof: the rendered height fits the A4 viewport.
    const height = await (print as unknown as { runtime: { measureHeight(html: string, t: number): Promise<number> } }).runtime.measureHeight(html, 30_000);
    expect(height).toBeLessThanOrEqual(A4_HEIGHT_PX);
  });

  it('E5 + H4: the station-card print renders the persisted D-20 snapshot on ONE page with the frozen allergen line', async () => {
    const actor = await newUserActor('d23b');
    const { recipe } = await makeAnalysedRecipe(actor, 'd23b');

    const out = await print.stationCardPrint(actor, recipe.id, 'pdf');
    expect(out.pdf!.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdfPageCount(out.pdf!)).toBe(1);
    const html = out.html;
    expect(html).toContain('Chef mode · station card');
    expect(html).toContain('Mise');
    expect(html).toContain('Fish — 500g');
    expect(html).toContain('Sequence');
    expect(html).toContain('Control points');
    expect(html).toContain('Untasted briefing. Season after.');
    expect(html).toContain('Contains: Fish, Coconut, Fenugreek. Notes: Fish species unknown.');
    expect(html).toContain('Reads the card only. Does not test food.');
    expect(html).not.toMatch(/\bsafe\b/i);

    const height = await (print as unknown as { runtime: { measureHeight(html: string, t: number): Promise<number> } }).runtime.measureHeight(html, 30_000);
    expect(height).toBeLessThanOrEqual(A4_HEIGHT_PX);
  });

  it('INV-12 snapshot-only proof: live mapping change + live line edit leave both re-prints BYTE-IDENTICAL', async () => {
    const actor = await newUserActor('d23c');
    const { recipe, lines } = await makeAnalysedRecipe(actor, 'd23c');
    await shopping.generate(actor, recipe.id);

    const listBefore = await print.shoppingListPrint(actor, recipe.id, 'html');
    const cardBefore = await print.stationCardPrint(actor, recipe.id, 'html');

    // (1) CHANGE the underlying current mapping live (effective-dated change).
    const coconut = await prisma.dietaryAllergenDefinition.findFirstOrThrow({
      where: { code: 'coconut' },
    });
    await prisma.dietaryAllergenDefinition.update({
      where: { id: coconut.id },
      data: { name: 'Coconut (RENAMED AFTER ANALYSIS — must never reach the print)' },
    });

    // (2) EDIT a recipe line live (the print must not reconstruct from it).
    const lineRow = await prisma.recipeIngredientLine.findFirstOrThrow({
      where: { id: lines[0].id },
    });
    await intake.updateLine(
      actor,
      recipe.id,
      lines[0].id,
      { display_name: 'Fish (EDITED AFTER SNAPSHOT) — 500g' },
      lineRow.updatedAt.toISOString(),
    );

    const listAfter = await print.shoppingListPrint(actor, recipe.id, 'html');
    const cardAfter = await print.stationCardPrint(actor, recipe.id, 'html');

    expect(listAfter.html).toBe(listBefore.html); // byte-identical
    expect(cardAfter.html).toBe(cardBefore.html); // byte-identical
    expect(listAfter.html).toContain('Contains: Fish, Coconut, Fenugreek. Notes: Fish species unknown.');
    expect(listAfter.html).not.toContain('RENAMED AFTER ANALYSIS');
    expect(cardAfter.html).not.toContain('RENAMED AFTER ANALYSIS');
  });

  it('INV-17: foreign and malformed ids → canonical 404s (no existence leak)', async () => {
    const a = await newUserActor('d23d-a');
    const b = await newUserActor('d23d-b');
    const { recipe } = await makeAnalysedRecipe(a, 'd23d');
    await shopping.generate(a, recipe.id);

    await expect(print.shoppingListPrint(b, recipe.id, 'html')).rejects.toMatchObject({
      response: { code: 'RECIPE_NOT_FOUND' },
    });
    await expect(print.stationCardPrint(b, recipe.id, 'html')).rejects.toMatchObject({
      response: { code: 'RECIPE_NOT_FOUND' },
    });
    await expect(print.shoppingListPrint(a, 'not-a-uuid', 'html')).rejects.toMatchObject({
      response: { code: 'RECIPE_NOT_FOUND' },
    });
  });
});
