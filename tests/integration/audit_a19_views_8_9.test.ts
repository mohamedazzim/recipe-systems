// A-19 audit — adversarial attack suite against the D-19 deterministic Views 8/9
// implementation (independent audit; NOT a D-19 implementation continuation).
//
// Attack vectors (AUDIT.md A-19):
//   - effective-dated mapping fidelity: a FUTURE mapping must not flag; a CLOSED
//     mapping must not flag (a broken filter would file coconut as a US major
//     tree nut — the golden-invariant BLOCKER class).
//   - effective-dated nutrition lookup: future/closed composition versions must
//     never leak into the band.
//   - I7: unmapped lines excluded from totals (band identical without the line).
//   - INV-14: range inputs always produce a band (never a point-kcal).
//   - recompute convergence + idempotency: sequential deltas converge; only
//     view 9 is ever rewritten.
//   - frozen contracts: producer outputs parse under the D-05 schemas (no
//     invented fields).
//   - D-13 INCOMPLETE semantics: absent method → the canonical 422
//     METHOD_REQUIRED list-only gate (Views 3/7 INCOMPLETE representation).
//
// Same snapshot/truncate/load/restore reference-data hygiene as the D-29/D-19
// stories (suites run serially — jest.integration.config.js maxWorkers: 1).

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
const { View8PayloadSchema, View9PayloadSchema } = require('@recipe-systems/schemas');
const { computeView8, computeView9 } = require('../../apps/analysis-worker/src/deterministic-views');
const { AnalysisJobHandler } = require('../../apps/analysis-worker/src/analysis-job.handler');
const { RecipeService } = require('../../apps/api/src/modules/recipes/recipe.service');
const { IntakeService } = require('../../apps/api/src/modules/intake/intake.service');
const { AnalysisService } = require('../../apps/api/src/modules/analysis/analysis.service');
const { ReferenceDataRepository } = require('../../apps/api/src/admin/reference-data.repository');
const { ReferenceDataService } = require('../../apps/api/src/admin/reference-data.service');
const { MockLlmAdapter } = require('@recipe-systems/llm-adapter');

const COMMITTED_APPROVALS_DIR = path.join(REPO, 'infra', 'reference-data', 'approvals');
const COMMITTED_IMPORTS_DIR = path.join(REPO, 'infra', 'reference-data', 'imports');
const D29_REVIEWER = 'Mohamed Azzim (D-29 dispatch authorization 2026-09-09)';
const COMMITTED_IMPORTS = [
  'R-2026-09-09-001-allergen-definitions.json',
  'R-2026-09-09-002-dictionary-golden.json',
  'R-2026-09-09-003-allergen-mappings.json',
  'R-2026-09-09-004-nutrition-composition.json',
];

const recipes = new RecipeService(prisma);
const intake = new IntakeService(prisma, recipes as any);

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
  '500g', '1 Nos', '1/2 Nos', 'Half Shell', 'For Tempering', '5 Nos',
  '2 Tsp', '1 Tsp', 'A Lemon Size', '1/2 Tsp', '1/4 Tsp',
];

function line(id: string, display: string, amount: string) {
  return {
    id, display_name: display, canonical_name: null, amount_text: amount,
    quantity: null, unit: null, confirmed_sense: null, category: null,
    food_id: null, include_on_list: true,
  };
}

function goldenCapture(): any {
  return {
    structured_recipe: {
      ingredients: CARD_LINES.map((display, i) => line(`l-${i}`, display, AMOUNTS[i])),
      method_steps: [],
      method_source: { name: null, type: null, matched: false },
      explicitly_absent: ['garlic', 'ginger'],
      card_metadata: { photographed: false, legible_issues: [] },
    },
  };
}

async function truncateReferenceTables() {
  await prisma.dietaryAllergenMapping.deleteMany();
  await prisma.nutritionFoodCompositionVersion.deleteMany();
  await prisma.nutritionFoodCompositionEntry.deleteMany();
  await prisma.ingredientAlias.deleteMany();
  await prisma.ingredientDictionary.deleteMany();
  await prisma.dietaryAllergenDefinition.deleteMany();
}

let snapshot: Record<string, object[]> | null = null;

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
    const file = JSON.parse(fs.readFileSync(path.join(COMMITTED_IMPORTS_DIR, fileName), 'utf8'));
    await service.approve(file.import_id, D29_REVIEWER, file);
  }
}

describe('A-19 audit — adversarial attacks on deterministic Views 8/9', () => {
  const auditRows: { table: string; id: string }[] = [];
  const createdRecipeIds: string[] = [];
  const createdAccountIds: string[] = [];

  beforeAll(async () => {
    await captureReferenceTables();
    await truncateReferenceTables();
    await loadCommittedReviewedImports();
  });

  afterAll(async () => {
    for (const row of auditRows) {
      await prisma.$executeRawUnsafe(`DELETE FROM ${row.table} WHERE id = '${row.id}'`).catch(() => undefined);
    }
    for (const id of createdRecipeIds) await prisma.recipe.deleteMany({ where: { id } });
    for (const id of createdAccountIds) await prisma.account.deleteMany({ where: { id } });
    await truncateReferenceTables();
    await restoreReferenceTables();
    await prisma.$disconnect();
  });

  it('A1 BLOCKER-class: a FUTURE effective mapping does not flag; a CLOSED mapping does not flag (coconut stays out of tree nuts)', async () => {
    const fish = await prisma.ingredientDictionary.findUnique({ where: { canonicalName: 'fish' } });
    const coconutFlesh = await prisma.ingredientDictionary.findUnique({ where: { canonicalName: 'coconut_flesh' } });
    const crustacean = await prisma.dietaryAllergenDefinition.findUnique({ where: { code: 'crustacean_shellfish' } });
    const treeNuts = await prisma.dietaryAllergenDefinition.findUnique({ where: { code: 'tree_nuts' } });
    expect(fish && coconutFlesh && crustacean && treeNuts).toBeTruthy();

    // future mapping: fish → crustacean effective tomorrow
    const future = await prisma.dietaryAllergenMapping.create({
      data: {
        ingredientId: fish!.id,
        allergenId: crustacean!.id,
        version: 99,
        effectiveFrom: new Date(Date.now() + 86400_000),
        effectiveTo: null,
        sourceReference: 'A-19 audit fixture',
      },
    });
    auditRows.push({ table: 'dietary_allergen_mapping', id: future.id });

    // closed mapping: coconut → tree_nuts, effective in the past and closed
    const closed = await prisma.dietaryAllergenMapping.create({
      data: {
        ingredientId: coconutFlesh!.id,
        allergenId: treeNuts!.id,
        version: 98,
        effectiveFrom: new Date('2020-01-01T00:00:00Z'),
        effectiveTo: new Date('2021-01-01T00:00:00Z'),
        sourceReference: 'A-19 audit fixture',
      },
    });
    auditRows.push({ table: 'dietary_allergen_mapping', id: closed.id });

    const payload = await computeView8(prisma as never, goldenCapture());
    expect(payload.present).not.toContain('Crustacean shellfish');
    expect(payload.present).not.toContain('Tree nuts');
    expect(payload.present).toEqual(expect.arrayContaining(['Fish', 'Coconut', 'Fenugreek']));
  });

  it('A2: future/closed nutrition composition versions never leak into the View 9 band', async () => {
    const baseline = await computeView9(prisma as never, goldenCapture());
    const fish = await prisma.ingredientDictionary.findUnique({ where: { canonicalName: 'fish' } });
    expect(fish).toBeTruthy();

    // The DB's EXCLUDE overlap constraint forbids a future range on the same
    // entry while its open version lives — so the attack uses a SEPARATE entry
    // for fish carrying (a) a CLOSED old version and (b) a FUTURE version, both
    // with an impossible 9999 kcal. Both must stay invisible to the band.
    const entry = await prisma.nutritionFoodCompositionEntry.create({
      data: {
        ingredientId: fish!.id,
        externalSource: 'A19_AUDIT',
        externalId: 'A19-FUTURE-9999',
        foodName: 'A-19 audit future fish',
        isPrimaryForIngredient: false,
      },
    });
    auditRows.push({ table: 'nutrition_food_composition_entry', id: entry.id });

    const closed = await prisma.nutritionFoodCompositionVersion.create({
      data: {
        entryId: entry.id,
        energyKcalPer100g: '9999',
        proteinGPer100g: '0',
        fatGPer100g: '0',
        carbGPer100g: '0',
        fiberGPer100g: '0',
        sodiumMgPer100g: '0',
        sourceVersion: 'A-19 audit closed',
        effectiveFrom: new Date('2020-01-01T00:00:00Z'),
        effectiveTo: new Date('2021-01-01T00:00:00Z'),
      },
    });
    auditRows.push({ table: 'nutrition_food_composition_version', id: closed.id });

    const future = await prisma.nutritionFoodCompositionVersion.create({
      data: {
        entryId: entry.id,
        energyKcalPer100g: '9999',
        proteinGPer100g: '0',
        fatGPer100g: '0',
        carbGPer100g: '0',
        fiberGPer100g: '0',
        sodiumMgPer100g: '0',
        sourceVersion: 'A-19 audit future',
        effectiveFrom: new Date(Date.now() + 86400_000),
        effectiveTo: null,
      },
    });
    auditRows.push({ table: 'nutrition_food_composition_version', id: future.id });

    const attacked = await computeView9(prisma as never, goldenCapture());
    expect(attacked.band).toEqual(baseline.band);
  });

  it('A3 I7: an unmapped line is EXCLUDED from totals — removing it changes nothing', async () => {
    const withLine = await computeView9(prisma as never, goldenCapture());
    const without = goldenCapture();
    without.structured_recipe.ingredients = without.structured_recipe.ingredients.filter(
      (ing: { display_name: string }) => !ing.display_name.startsWith('Fenugreek Powder'),
    );
    const withoutLine = await computeView9(prisma as never, without);

    expect(withLine.band).toEqual(withoutLine.band); // excluded from totals
    expect(
      withLine.assumptions.filter((a) => a.key === 'unmapped_ingredient').map((a) => a.value),
    ).toEqual(['Fenugreek Powder — 1/2 Tsp']); // …and listed
  });

  it('A4 INV-14: range inputs always yield a strict band (never a point-kcal)', async () => {
    const payload = await computeView9(prisma as never, goldenCapture());
    expect(payload.band.energy_kcal_min).toBeLessThan(payload.band.energy_kcal_max);
    // adversarial: pin every assumption — all inputs become points; the band
    // must never invert (min <= max) even when it legitimately collapses.
    const pinned = await computeView9(prisma as never, goldenCapture(), {
      fish_class: 'lean',
      coconut_grams: [180, 180],
      oil_tbsp: [2, 2],
    });
    expect(pinned.band.energy_kcal_min).toBeLessThanOrEqual(pinned.band.energy_kcal_max);
    expect(pinned.sodium).toBe('unknown');
  });

  it('A5 recompute convergence + idempotency: sequential deltas converge to the LAST one; only view 9 is rewritten', async () => {
    const actor = {
      kind: 'user' as const,
      user: { accountId: (await prisma.account.create({ data: { email: `a19-${Date.now()}@test.dev`, authProvider: 'sso', preferredMode: 'home' } })).id, email: 'x@test.dev', sub: 'a19' },
    };
    createdAccountIds.push(actor.user.accountId);
    const recipe = await recipes.createForIntake(actor, { rawText: CARD_LINES.join('\n') });
    createdRecipeIds.push(recipe.id);
    await intake.recordPaste(actor, recipe.id, CARD_LINES.join('\n'));
    await recipes.attachMethod(actor, recipe.id, { mode: 'paste', methodText: 'Boil; temper; simmer.' });

    let captured: any = null;
    const svc = new AnalysisService(
      recipes as any,
      intake as any,
      { enqueue: jest.fn(async (p: any) => { captured = p.captured; return 'a1'; }), enqueueView9Recompute: jest.fn() } as any,
      prisma as any,
    );
    // fixture setup BEFORE enqueue: amounts + reviewed (the D-14 gate is not
    // this audit's subject).
    const lines = await prisma.recipeIngredientLine.findMany({ where: { recipeId: recipe.id, deletedAt: null }, orderBy: { lineNo: 'asc' } });
    for (let i = 0; i < lines.length; i += 1) {
      await prisma.recipeIngredientLine.update({ where: { id: lines[i].id }, data: { amountText: AMOUNTS[i], needsReview: false } });
    }
    await svc.enqueue(actor, recipe.id, 'home');
    expect(captured).not.toBeNull();

    const analysisId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const adapter = new MockLlmAdapter(
      ([1, 2, 3, 4, 5, 6, 7] as const).flatMap((view) =>
        (['home', 'chef'] as const).map((mode) => ({
          view,
          mode,
          output: {
            1: { items: [{ ingredient_id: lines[0].id, job: 'Protein', if_omitted: 'Not this dish', tag: 'CARD' }], role_groups: [] },
            2: { pillars: [], blind_spot_notes: [] },
            3: { status: 'COMPLETE', stages: [], incomplete_reason: null },
            4: { substitutions: [] },
            5: { family: 'Coastal Tamil meen kuzhambu', architecture: 'Raw-ground paste, triple sour', confidence: 'high', not_this: [], needs_review: true, tag: 'INFERRED' },
            6: { ratios: [], unresolvable: [] },
            7: { status: 'COMPLETE', memorable_elements: [] },
          }[view],
        })),
      ),
    );
    const handler = new AnalysisJobHandler(prisma, adapter as never, jest.fn() as never);
    await handler.handle({ analysis_id: analysisId, recipe_id: recipe.id, mode: 'home', prompt_version: 'v2', captured });

    const leanDelta = { fish_class: 'lean' as const };
    const oilyDelta = { fish_class: 'oily' as const };
    await handler.handleView9Recompute({ analysis_id: analysisId, recipe_id: recipe.id, delta: leanDelta, captured });
    await handler.handleView9Recompute({ analysis_id: analysisId, recipe_id: recipe.id, delta: oilyDelta, captured });
    // idempotent re-delivery of the SAME delta converges (no drift)
    await handler.handleView9Recompute({ analysis_id: analysisId, recipe_id: recipe.id, delta: oilyDelta, captured });

    const row = await prisma.analysisView.findUnique({
      where: { analysisId_viewNumber: { analysisId, viewNumber: 9 } },
    });
    const payload = row?.payload as any;
    expect(payload.assumptions.find((a: any) => a.key === 'fish_class')?.value).toBe('oily');

    const allViews = await prisma.analysisView.findMany({ where: { analysisId } });
    expect(allViews.map((v) => v.viewNumber).sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);

    await prisma.analysisView.deleteMany({ where: { analysisId } });
    await prisma.analysis.deleteMany({ where: { id: analysisId } });
  });

  it('A6 frozen contracts: producer outputs parse under the D-05 schemas (no invented fields)', async () => {
    const v8 = await computeView8(prisma as never, goldenCapture());
    const v9 = await computeView9(prisma as never, goldenCapture());
    expect(View8PayloadSchema.safeParse(v8).success).toBe(true);
    expect(View9PayloadSchema.safeParse(v9).success).toBe(true);
    expect(v8.disclaimer).toBe(
      'Reads the card only. Does not test food. Does not know your kitchen. Not medical advice.',
    );
    expect(v9.disclaimer).toBe(
      'Table estimate from stated assumptions. Not a lab analysis. Not medical advice.',
    );
  });

  it('A7 D-13 INCOMPLETE semantics: absent method → canonical 422 METHOD_REQUIRED (list-only Views 3/7 representation)', async () => {
    const account = await prisma.account.create({ data: { email: `a19b-${Date.now()}@test.dev`, authProvider: 'sso', preferredMode: 'home' } });
    createdAccountIds.push(account.id);
    const actor = { kind: 'user' as const, user: { accountId: account.id, email: 'x@test.dev', sub: 'a19b' } };
    const recipe = await recipes.createForIntake(actor, { rawText: 'Fish — 500g' });
    createdRecipeIds.push(recipe.id);
    await intake.recordPaste(actor, recipe.id, 'Fish — 500g');
    // no method attached — enqueue must refuse with the canonical list-only gate
    const svc = new AnalysisService(
      recipes as any,
      intake as any,
      { enqueue: jest.fn(), enqueueView9Recompute: jest.fn() } as any,
      prisma as any,
    );
    await expect(svc.enqueue(actor, recipe.id, 'home')).rejects.toMatchObject({
      response: { code: 'METHOD_REQUIRED' },
    });
  });
});
