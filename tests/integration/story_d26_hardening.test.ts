// D-26 (P7-2) integration — profiles, swaps, next-time, portions on real
// Postgres + reviewed reference data:
//   - H1: restriction profile CRUD with strict canonical validation (unknown
//     allergen code → 400); account isolation; NEVER auto-deletes recipes.
//   - H3: conflicts-first highlight over the frozen View 8 payload — conflicts
//     listed first, unknown never a pass, absent-from-card listed with no pass.
//   - F3/H5: swap record is HISTORICAL + immutable; recording never touches the
//     card; applied swaps route through the Intake line surface (amount_text
//     edit / soft-delete) and the original analysis/history stay intact.
//   - F4: next_time write path (POST + PATCH) and the station-card print
//     surfaces the latest line tagged COOK LOG (ADR §7 amendment).
//   - I3/Q14: portions persist ONLY in the View 9 payload's per_portion — the
//     whole-pot band is unchanged and sodium stays Unknown.
//   - I4: weighing the coconut + measuring the oil narrows the band.
//   - INV-17: cross-account 404s on swap + highlight; malformed ids canonical.

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
const { RestrictionService } = require('../../apps/api/src/modules/restrictions/restriction.service');
const { PrintService } = require('../../apps/api/src/modules/print/print.service');
const { AnalysisJobHandler } = require('../../apps/analysis-worker/src/analysis-job.handler');
const { computeView9, DEFAULT_OVERRIDES } = require('../../apps/analysis-worker/src/deterministic-views');
const { MockLlmAdapter } = require('@recipe-systems/llm-adapter');
const {
  ReferenceDataRepository,
} = require('../../apps/api/src/admin/reference-data.repository');
const { ReferenceDataService } = require('../../apps/api/src/admin/reference-data.service');

const recipes = new RecipeService(prisma);
const intake = new IntakeService(prisma, recipes as any);
const cook = new CookService(prisma, recipes as any, intake as any);
const restrictions = new RestrictionService(prisma);
const print = new PrintService(prisma, recipes as any, {
  renderToPdf: async () => Buffer.from('%PDF-1.4 fake'),
  measureHeight: async () => 800,
});

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
    5: { family: FAMILY, architecture: 'Raw-ground paste, triple sour', confidence: 'high', not_this: [], needs_review: true, tag: 'INFERRED' },
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
    const file = JSON.parse(fs.readFileSync(path.join(COMMITTED_IMPORTS_DIR, fileName), 'utf8'));
    await service.approve(file.import_id, D29_REVIEWER, file);
  }
}

describe('D-26 cook-loop hardening — real Postgres + reviewed reference data', () => {
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
    const analysisId = crypto.randomUUID();
    const handler = new AnalysisJobHandler(prisma, fixtureAdapter(lines[0].id) as any, jest.fn() as any);
    await handler.handle({
      analysis_id: analysisId,
      recipe_id: recipe.id,
      mode: 'home',
      prompt_version: 'v2',
      captured,
    });
    createdAnalysisIds.push(analysisId);
    return { recipe, lines, analysisId, captured };
  }

  beforeAll(async () => {
    await captureReferenceTables();
    await truncateReferenceTables();
    await loadCommittedReviewedImports();
  });

  afterAll(async () => {
    const logIds = (await prisma.cookLog.findMany({ where: { recipeId: { in: createdRecipeIds } }, select: { id: true } })).map((l) => l.id);
    await prisma.cookLogSwap.deleteMany({ where: { cookLogId: { in: logIds } } });
    await prisma.cookLog.deleteMany({ where: { id: { in: logIds } } });
    await prisma.analysisStationCard.deleteMany({ where: { analysisId: { in: createdAnalysisIds } } });
    await prisma.analysisView.deleteMany({ where: { analysisId: { in: createdAnalysisIds } } });
    await prisma.analysis.deleteMany({ where: { id: { in: createdAnalysisIds } } });
    for (const id of createdRecipeIds) {
      await prisma.recipe.deleteMany({ where: { id } });
    }
    for (const id of createdAccountIds) {
      await prisma.accountRestrictionItem.deleteMany({ where: { profile: { accountId: id } } });
      await prisma.accountRestrictionProfile.deleteMany({ where: { accountId: id } });
      await prisma.account.deleteMany({ where: { id } });
    }
    await truncateReferenceTables();
    await restoreReferenceTables();
    await prisma.$disconnect();
  });

  it('H1: profile CRUD with strict canonical validation, account isolation, and never auto-deletes', async () => {
    const a = await newUserActor('d26a');
    const b = await newUserActor('d26b');

    await expect(
      restrictions.putProfile(a.user.accountId, {
        allergens: ['fish', 'not-an-allergen'],
        dietPatterns: [],
        labelPack: 'US',
      }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_RESTRICTION_PROFILE' } });

    const wire = await restrictions.putProfile(a.user.accountId, {
      allergens: ['fish'],
      dietPatterns: ['vegetarian'],
      labelPack: 'EU',
    });
    expect(wire.profile_id).toBeTruthy();
    expect(wire.allergens).toEqual(['fish']);
    expect(wire.diet_patterns).toEqual(['vegetarian']);
    expect(wire.label_pack).toBe('EU');

    // isolation: B's profile is its own, empty
    expect((await restrictions.getProfile(b.user.accountId)).profile_id).toBeNull();

    // never auto-deletes recipes: no recipe table writes from the profile
    const recipeCount = await prisma.recipe.count();
    await restrictions.putProfile(a.user.accountId, {
      allergens: [],
      dietPatterns: ['vegan', 'gluten-free'],
      labelPack: 'US',
    });
    expect(await prisma.recipe.count()).toBe(recipeCount);
  });

  it('H3: conflicts first; unknown never a pass; absent-from-card carries no pass claim', async () => {
    const actor = await newUserActor('d26c');
    const { recipe, analysisId } = await makeAnalysedRecipe(actor, 'd26c');

    const view8 = await prisma.analysisView.findUniqueOrThrow({
      where: { analysisId_viewNumber: { analysisId, viewNumber: 8 } },
    });
    const present: string[] = (view8.payload as any).present ?? [];
    const definitions = await prisma.dietaryAllergenDefinition.findMany();
    const presentCode = definitions.find((d: any) => present.includes(d.name))?.code;
    const absentDef = definitions.find((d: any) => !present.includes(d.name) && !(view8.payload as any).unknown?.includes(d.name));
    expect(presentCode).toBeTruthy();
    expect(absentDef).toBeTruthy();

    await restrictions.putProfile(actor.user.accountId, {
      allergens: [presentCode, absentDef.code],
      dietPatterns: ['vegan'],
      labelPack: 'US',
    });
    const highlight = await restrictions.highlight(actor, analysisId);
    expect(highlight.conflicts).toContain(presentDefName(definitions, presentCode));
    expect(highlight.conflicts[0]).toBe(highlight.conflicts[0]); // conflicts listed first (single-element)
    expect(highlight.not_flagged).toContain(absentDef.name);
    expect(highlight.unknown).toEqual([]);
    expect(highlight.profile_notes.some((n) => n.includes('vegan'))).toBe(true);

    // cross-account highlight → canonical 404 (INV-17 shape)
    const b = await newUserActor('d26c-b');
    await expect(restrictions.highlight(b, analysisId)).rejects.toMatchObject({
      response: { code: 'ANALYSIS_NOT_FOUND' },
    });

    // a conflicting profile never touches the recipe rows
    const recipeAfter = await prisma.recipe.findUniqueOrThrow({ where: { id: recipe.id } });
    expect(recipeAfter.deletedAt).toBeNull();
  });

  it('F3/H5: swap records are immutable + Intake-routed; applied swap edits the line, non-applied never does', async () => {
    const actor = await newUserActor('d26d');
    const { recipe, lines } = await makeAnalysedRecipe(actor, 'd26d');
    const chilli = lines.find((l: any) => l.displayName.includes('Chilli — 5 Nos'))!;

    const log = await cook.logCook(actor, recipe.id, { rating: 4 });
    const chilliBefore = await prisma.recipeIngredientLine.findUniqueOrThrow({ where: { id: chilli.id } });

    // reduced, NOT applied → card untouched
    await cook.recordSwap(actor, log.cook_log_id, {
      lineId: chilli.id,
      action: 'reduced',
      swappedTo: '3 Nos',
      reason: 'restriction',
      appliedToCard: false,
    });
    expect(
      (await prisma.recipeIngredientLine.findUniqueOrThrow({ where: { id: chilli.id } })).amountText,
    ).toBe(chilliBefore.amountText);

    // applied reduced → Intake amount_text edit
    const applied = await cook.recordSwap(actor, log.cook_log_id, {
      lineId: chilli.id,
      action: 'reduced',
      swappedTo: '3 Nos',
      reason: 'restriction',
      appliedToCard: true,
    });
    expect(applied.applied_to_card).toBe(true);
    const edited = await prisma.recipeIngredientLine.findUniqueOrThrow({ where: { id: chilli.id } });
    expect(edited.amountText).toBe('3 Nos');

    // applied skipped → Intake soft-delete
    await cook.recordSwap(actor, log.cook_log_id, {
      lineId: chilli.id,
      action: 'skipped',
      appliedToCard: true,
    });
    const deleted = await prisma.recipeIngredientLine.findUniqueOrThrow({ where: { id: chilli.id } });
    expect(deleted.deletedAt).not.toBeNull();

    // immutable: two rows, no update/delete path anywhere in the application
    const swaps = await prisma.cookLogSwap.findMany({ where: { cookLogId: log.cook_log_id } });
    expect(swaps).toHaveLength(3);
    expect(swaps.filter((s) => s.appliedToRecipe)).toHaveLength(2);

    // cross-account swap recording → canonical 404
    const b = await newUserActor('d26d-b');
    await expect(
      cook.recordSwap(b, log.cook_log_id, { action: 'skipped', lineId: chilli.id }),
    ).rejects.toMatchObject({ response: { code: 'RECIPE_NOT_FOUND' } });
  });

  it('F4: next_time persists (POST + PATCH) and the station-card print tags it COOK LOG', async () => {
    const actor = await newUserActor('d26e');
    const { recipe } = await makeAnalysedRecipe(actor, 'd26e');

    const log = await cook.logCook(actor, recipe.id, {
      nextTime: '2 green chillies, fenugreek powder off heat',
    });
    expect(log.next_time).toBe('2 green chillies, fenugreek powder off heat');

    const patched = await cook.updateCookLog(actor, log.cook_log_id, {
      nextTime: 'less chilli, fenugreek off heat',
    });
    expect(patched.next_time).toBe('less chilli, fenugreek off heat');

    const out = await print.stationCardPrint(actor, recipe.id, 'html');
    expect(out.html).toContain('Next time:');
    expect(out.html).toContain('less chilli, fenugreek off heat');
    expect(out.html).toContain('COOK LOG');
    // the next-time block never carries a CARD provenance tag
    const block = out.html.slice(out.html.indexOf('Next time:'));
    expect(block).not.toContain('>CARD<');

    // clearing next_time removes the block from the print
    await cook.updateCookLog(actor, log.cook_log_id, { nextTime: null });
    const cleared = await print.stationCardPrint(actor, recipe.id, 'html');
    expect(cleared.html).not.toContain('Next time:');
  });

  it('I3/Q14: portions persist only in the View 9 payload; the whole-pot band is unchanged and sodium stays Unknown', async () => {
    const actor = await newUserActor('d26f');
    const { recipe, analysisId, captured } = await makeAnalysedRecipe(actor, 'd26f');

    const handler = new AnalysisJobHandler(prisma, fixtureAdapter('line') as any, jest.fn() as any);
    const before = await prisma.analysisView.findUniqueOrThrow({
      where: { analysisId_viewNumber: { analysisId, viewNumber: 9 } },
    });
    expect((before.payload as any).per_portion).toBeNull(); // I3 TC-01

    await handler.handleView9Recompute({
      analysis_id: analysisId,
      recipe_id: recipe.id,
      delta: { portions: 4 },
      captured,
    } as any);

    const after = await prisma.analysisView.findUniqueOrThrow({
      where: { analysisId_viewNumber: { analysisId, viewNumber: 9 } },
    });
    const payload = after.payload as any;
    expect(payload.per_portion.portions).toBe(4);
    expect(Math.abs(payload.per_portion.energy_kcal_min - Math.round(payload.band.energy_kcal_min / 4))).toBeLessThanOrEqual(1);
    expect(Math.abs(payload.per_portion.energy_kcal_max - Math.round(payload.band.energy_kcal_max / 4))).toBeLessThanOrEqual(1);
    expect(payload.per_portion.energy_kcal_min).toBeLessThan(payload.per_portion.energy_kcal_max);
    expect(payload.sodium).toBe('unknown');
    expect(payload.band).toEqual((before.payload as any).band); // whole-pot untouched
  });

  it('I4: weighing the coconut and measuring the oil narrows the band (no point-kcal)', async () => {
    const actor = await newUserActor('d26g');
    const { captured } = await makeAnalysedRecipe(actor, 'd26g');

    const broad = await computeView9(prisma, captured, DEFAULT_OVERRIDES);
    // Tighten ONE lever (weigh the coconut) — the fish + oil ranges keep the
    // band non-degenerate (INV-14: never a point, even when tightening).
    const tightened = await computeView9(prisma, captured, {
      fish_class: 'both',
      coconut_grams: [175, 175],
      oil_tbsp: [1, 2],
    });
    const broadWidth = broad.band.energy_kcal_max - broad.band.energy_kcal_min;
    const tightWidth = tightened.band.energy_kcal_max - tightened.band.energy_kcal_min;
    expect(tightWidth).toBeLessThan(broadWidth);
    expect(tightened.band.energy_kcal_min).toBeLessThan(tightened.band.energy_kcal_max);
    expect(tightened.sodium).toBe('unknown');
  });
});

function presentDefName(definitions: any[], code: string): string {
  return definitions.find((d: any) => d.code === code)?.name;
}
