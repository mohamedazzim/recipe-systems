// D-19 (P4-1) integration — deterministic Views 8/9 on real Postgres with the
// LIVE D-29 reviewed reference data:
//   - the full AnalysisJobHandler run persists View 8 (allergen flags from
//     dietary_allergen_mapping) and View 9 (band from nutrition_food_composition_*)
//     as COMPLETE — never fabricated, never "safe" (INV-13), sodium Unknown.
//   - the RS-US-45 recompute (handleView9Recompute) merges an assumption delta
//     over the persisted payload and rewrites ONLY view 9 (one-writer).
//   - I7: the fenugreek-powder line has no distinct USDA composition record →
//     unmapped, excluded from totals and listed.
// Snapshot hygiene: this story only READS reference tables — the live load is
// untouched (no writes, no deletes).

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
const { AnalysisJobHandler } = require('../../apps/analysis-worker/src/analysis-job.handler');
const { MockLlmAdapter } = require('@recipe-systems/llm-adapter');

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

function fixtureAdapter(lineId: string) {
  const views: Record<number, unknown> = {
    1: {
      items: [{ ingredient_id: lineId, job: 'Protein', if_omitted: 'Not this dish', tag: 'CARD' }],
      role_groups: [],
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
  const fixtures = ([1, 2, 3, 4, 5, 6, 7] as const).flatMap((view) =>
    (['home', 'chef'] as const).map((mode) => ({ view, mode, output: views[view] })),
  );
  return new MockLlmAdapter(fixtures);
}

describe('D-19 deterministic views 8/9 — real Postgres + live reference data', () => {
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
      user: { accountId: account.id, email: account.email, sub: 'integration-d19' },
    };
  }

  afterAll(async () => {
    for (const id of createdRecipeIds) {
      await prisma.recipe.deleteMany({ where: { id } });
    }
    for (const id of createdAccountIds) {
      await prisma.account.deleteMany({ where: { id } });
    }
  });

  it('full run persists COMPLETE View 8 + View 9 from the reviewed reference tables; recompute merges the I2 delta', async () => {
    const actor = await newUserActor('d19');
    const recipe = await recipes.createForIntake(actor, { rawText: CARD_LINES.join('\n') });
    createdRecipeIds.push(recipe.id);
    await intake.recordPaste(actor, recipe.id, CARD_LINES.join('\n'));
    await recipes.attachMethod(actor, recipe.id, {
      mode: 'paste',
      methodText: 'Temper mustard seeds; boil tamarind; simmer fish.',
    });

    // amounts are not extracted by the D-12 parser — set the card's amount text
    // directly (test-fixture setup; the capture reads this column). The D-14
    // review gate is not this story's subject — mark lines reviewed.
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

    // REAL capture path: AnalysisService.buildCapture via a capturing fake queue.
    let captured: any = null;
    const queue = {
      enqueue: jest.fn(async (payload: any) => {
        captured = payload.captured;
        return 'analysis-a1';
      }),
      enqueueView9Recompute: jest.fn(async () => undefined),
    };
    const svc = new AnalysisService(
      recipes as any,
      intake as any,
      queue as any,
      prisma as any,
    );
    await svc.enqueue(actor, recipe.id, 'home');
    expect(captured).not.toBeNull();

    // REAL worker handler with the fixture adapter (Q9 OPEN — no provider).
    const firstLineId = lines[0].id;
    const handler = new AnalysisJobHandler(
      prisma,
      fixtureAdapter(firstLineId) as any,
      jest.fn() as any,
    );
    const analysisId = '99999999-9999-4999-8999-999999999999';
    await handler.handle({
      analysis_id: analysisId,
      recipe_id: recipe.id,
      mode: 'home',
      prompt_version: 'v2',
      captured,
    });

    const view8 = await prisma.analysisView.findUnique({
      where: { analysisId_viewNumber: { analysisId, viewNumber: 8 } },
    });
    expect(view8?.status).toBe('COMPLETE');
    const p8 = view8?.payload as any;
    expect(p8.present).toEqual(expect.arrayContaining(['Fish', 'Coconut', 'Fenugreek']));
    expect(p8.present).not.toContain('Tree nuts'); // coconut is never a US major tree nut
    expect(p8.allergen_line.notes).toEqual(['Fish species unknown.']);
    expect(p8.disclaimer).toBe(
      'Reads the card only. Does not test food. Does not know your kitchen. Not medical advice.',
    );
    expect(JSON.stringify(p8).toLowerCase()).not.toContain('safe');

    const view9 = await prisma.analysisView.findUnique({
      where: { analysisId_viewNumber: { analysisId, viewNumber: 9 } },
    });
    expect(view9?.status).toBe('COMPLETE');
    const p9 = view9?.payload as any;
    expect(p9.band.energy_kcal_min).toBeGreaterThanOrEqual(1300);
    expect(p9.band.energy_kcal_min).toBeLessThanOrEqual(1350);
    expect(p9.band.energy_kcal_max).toBeGreaterThanOrEqual(2150);
    expect(p9.band.energy_kcal_max).toBeLessThanOrEqual(2250);
    expect(p9.band.energy_kcal_min).toBeLessThan(p9.band.energy_kcal_max);
    expect(p9.sodium).toBe('unknown');
    expect(p9.disclaimer).toBe(
      'Table estimate from stated assumptions. Not a lab analysis. Not medical advice.',
    );
    // I7: fenugreek powder is unmapped (no distinct USDA record) — listed, excluded.
    const unmapped = (p9.assumptions as any[]).filter((a) => a.key === 'unmapped_ingredient');
    expect(unmapped.map((a) => a.value)).toEqual(['Fenugreek Powder — 1/2 Tsp']);

    // RS-US-45 recompute: pin the fish class → view 9 payload updated, views 1–8 untouched.
    await handler.handleView9Recompute({
      analysis_id: analysisId,
      recipe_id: recipe.id,
      delta: { fish_class: 'lean' },
      captured,
    });
    const recomputed = await prisma.analysisView.findUnique({
      where: { analysisId_viewNumber: { analysisId, viewNumber: 9 } },
    });
    const pr = recomputed?.payload as any;
    expect(pr.assumptions.find((a: any) => a.key === 'fish_class')?.value).toBe('lean');
    expect(pr.band.energy_kcal_min).toBeGreaterThanOrEqual(1300);
    expect(pr.band.energy_kcal_max).toBeLessThan(1800); // lean end collapses
    expect(pr.band.energy_kcal_min).toBeLessThan(pr.band.energy_kcal_max); // still a band
    // one-writer: the recompute touched ONLY view 9
    const allViews = await prisma.analysisView.findMany({ where: { analysisId } });
    expect(allViews.map((v) => v.viewNumber).sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);

    // hygiene: the analysis rows this story created are removed with the recipe cascade
    await prisma.analysisView.deleteMany({ where: { analysisId } });
    await prisma.analysis.deleteMany({ where: { id: analysisId } });
  });

  it('reference tables remain untouched by the D-19 story (live D-29 load intact)', async () => {
    const defs = await prisma.dietaryAllergenDefinition.count();
    const dict = await prisma.ingredientDictionary.count();
    const mappings = await prisma.dietaryAllergenMapping.count();
    const entries = await prisma.nutritionFoodCompositionEntry.count();
    const versions = await prisma.nutritionFoodCompositionVersion.count();
    expect({ defs, dict, mappings, entries, versions }).toEqual({
      defs: 17,
      dict: 12,
      mappings: 6,
      entries: 12,
      versions: 12,
    });
  });
});
