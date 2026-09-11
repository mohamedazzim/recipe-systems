// D-30 (Track S) integration — shopping data on real Postgres:
//   - E1: the generated list matches the structured object exactly — one row
//     per active line, card order, the two golden fenugreeks stay DISTINCT
//     (C-39 keys), qualifiers visible, no headers, five canonical groups.
//   - Q2 Option A: the snapshot carries the FROZEN View-8 allergen line of the
//     analysis (rendered from the analysis's own View-8 payload — never the
//     live effective-dated mapping).
//   - E2: have/need persists across regeneration AND reopen; regenerations
//     never duplicate state rows.
//   - C-28: soft-deleting a line cleans its shopping state; regeneration then
//     excludes the line.
//   - INV-17: foreign accounts and malformed/unknown keys get canonical 404s.
//
// Reference-data bootstrap: identical hygiene to story_d20/story_d22 (the
// handler writes deterministic Views 8/9). Integration suites run SERIALLY
// (maxWorkers: 1).

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
const { View8PayloadSchema } = require('@recipe-systems/schemas');
const { RecipeService } = require('../../apps/api/src/modules/recipes/recipe.service');
const { IntakeService } = require('../../apps/api/src/modules/intake/intake.service');
const { AnalysisService } = require('../../apps/api/src/modules/analysis/analysis.service');
const { ShoppingService } = require('../../apps/api/src/modules/shopping/shopping.service');
const { AnalysisJobHandler } = require('../../apps/analysis-worker/src/analysis-job.handler');
const { MockLlmAdapter } = require('@recipe-systems/llm-adapter');
const {
  ReferenceDataRepository,
} = require('../../apps/api/src/admin/reference-data.repository');
const { ReferenceDataService } = require('../../apps/api/src/admin/reference-data.service');

const recipes = new RecipeService(prisma);
const intake = new IntakeService(prisma, recipes as any);
const shopping = new ShoppingService(prisma, recipes as any);

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

describe('D-30 shopping data — real Postgres + reviewed reference data', () => {
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

  function flatItems(wire: any) {
    return wire.groups.flatMap((g: any) => g.items);
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
    for (const id of createdGuestSessionIds) {
      await prisma.guestSession.deleteMany({ where: { id } });
    }
    await truncateReferenceTables();
    await restoreReferenceTables();
    await prisma.$disconnect();
  });

  it('E1: the golden object generates one row per active line with the five canonical groups', async () => {
    const actor = await newUserActor('d30a');
    const { recipe } = await makeAnalysedRecipe(actor, 'd30a');
    const wire = await shopping.generate(actor, recipe.id);
    const items = flatItems(wire);
    expect(items).toHaveLength(11); // exactly the 11 card lines — no headers, no collapse

    const byName = new Map(items.map((i: any) => [i.display_name, i]));
    expect(byName.get('Fish — 500g').group_name).toBe('fish/meat');
    expect(byName.get('Drumstick — 1 Nos').group_name).toBe('fresh produce');
    expect(byName.get('Mango — 1/2 Nos').group_name).toBe('fresh produce');
    expect(byName.get('Grated Coconut — Half Shell').group_name).toBe('fresh produce');
    expect(byName.get('Coconut Oil — For Tempering').group_name).toBe('fats/oils');
    expect(byName.get('Chilli — 5 Nos').group_name).toBe('fresh produce');
    expect(byName.get('Chilli Powder — 2 Tsp').group_name).toBe('spices');
    expect(byName.get('Coriander Powder — 1 Tsp').group_name).toBe('spices');
    expect(byName.get('Tamarind — A Lemon Size').group_name).toBe('fresh produce');
    expect(byName.get('Fenugreek Powder — 1/2 Tsp').group_name).toBe('spices');
    expect(byName.get('Fenugreek — 1/4 Tsp').group_name).toBe('spices');

    // Golden fidelity: the two fenugreek lines stay DISTINCT rows and keys.
    const fenugreeks = items.filter((i: any) => i.display_name.toLowerCase().includes('fenugreek'));
    expect(fenugreeks).toHaveLength(2);
    expect(fenugreeks[0].shopping_key).not.toBe(fenugreeks[1].shopping_key);

    // Qualifiers ride the rows — "for tempering" and "a lemon size" are part
    // of the card line names (the parser keeps them verbatim).
    expect(byName.get('Coconut Oil — For Tempering').display_name).toContain('For Tempering');
    expect(byName.get('Tamarind — A Lemon Size').display_name).toContain('A Lemon Size');

    // The group list preserves the canonical E3 order.
    expect(wire.groups.map((g: any) => g.name)).toEqual(['fresh produce', 'fish/meat', 'spices', 'fats/oils']);

    // DB snapshot fidelity: 11 persisted item rows on the generation.
    const rows = await prisma.shoppingListItem.findMany({ where: { generationId: wire.generation_id } });
    expect(rows).toHaveLength(11);
  });

  it('Q2 Option A: the snapshot carries the frozen View-8 allergen line of the analysis', async () => {
    const actor = await newUserActor('d30b');
    const { recipe } = await makeAnalysedRecipe(actor, 'd30b');
    const wire = await shopping.generate(actor, recipe.id);
    expect(wire.allergen_line).toBeTruthy();
    expect(wire.allergen_line).toContain('Fish');
    expect(wire.allergen_line).toContain('Coconut');
    expect(wire.allergen_line).toContain('Fenugreek');
    expect(wire.allergen_line).not.toMatch(/\bsafe\b/i); // INV-13

    // It is the analysis's OWN View-8 output (rendered), persisted verbatim.
    const generation = await prisma.shoppingListGeneration.findUniqueOrThrow({
      where: { id: wire.generation_id },
    });
    expect(generation.allergenLine).toBe(wire.allergen_line);
    const current = await prisma.analysis.findFirst({
      where: { recipeId: recipe.id, isCurrent: true, status: 'complete' },
      orderBy: { createdAt: 'desc' },
    });
    const view8 = await prisma.analysisView.findUnique({
      where: { analysisId_viewNumber: { analysisId: current.id, viewNumber: 8 } },
    });
    const parsed = View8PayloadSchema.safeParse(view8?.payload);
    expect(parsed.success).toBe(true);
    const expectedLine = parsed.data.allergen_line;
    expect(wire.allergen_line).toContain(expectedLine.contains.join(', '));
  });

  it('E2: have/need persists across regeneration and reopen without duplicate states', async () => {
    const actor = await newUserActor('d30c');
    const { recipe, lines } = await makeAnalysedRecipe(actor, 'd30c');
    const fishKey = lines[0].shoppingKey;

    await shopping.setState(actor, recipe.id, { shopping_key: fishKey, state: 'have' });
    const first = await shopping.generate(actor, recipe.id);
    expect(flatItems(first).find((i: any) => i.shopping_key === fishKey).state).toBe('have');

    // Regenerate twice: state survives AND no duplicate state rows appear.
    await shopping.generate(actor, recipe.id);
    const third = await shopping.generate(actor, recipe.id);
    expect(flatItems(third).find((i: any) => i.shopping_key === fishKey).state).toBe('have');
    const stateRows = await prisma.ingredientShoppingState.findMany({ where: { recipeId: recipe.id } });
    expect(stateRows).toHaveLength(1);

    // Reopen via the read path (fresh service instance = fresh query).
    const fresh = new ShoppingService(prisma, recipes as any);
    const latest = await fresh.latest(actor, recipe.id);
    expect(latest.generation_id).toBe(third.generation_id);
    expect(flatItems(latest).find((i: any) => i.shopping_key === fishKey).state).toBe('have');
  });

  it('C-28: soft-deleting a line cleans its shopping state and regeneration excludes it', async () => {
    const actor = await newUserActor('d30d');
    const { recipe, lines } = await makeAnalysedRecipe(actor, 'd30d');
    const fishKey = lines[0].shoppingKey;
    await shopping.setState(actor, recipe.id, { shopping_key: fishKey, state: 'have' });
    expect(
      await prisma.ingredientShoppingState.count({ where: { recipeId: recipe.id, shoppingKey: fishKey } }),
    ).toBe(1);

    await intake.softDeleteLine(actor, recipe.id, lines[0].id);

    // C-28 trigger removed the state row.
    expect(
      await prisma.ingredientShoppingState.count({ where: { recipeId: recipe.id, shoppingKey: fishKey } }),
    ).toBe(0);

    const wire = await shopping.generate(actor, recipe.id);
    const items = flatItems(wire);
    expect(items).toHaveLength(10); // fish line gone
    expect(items.some((i: any) => i.shopping_key === fishKey)).toBe(false);
  });

  it('INV-17: foreign, malformed and unknown access returns canonical 404s', async () => {
    const a = await newUserActor('d30e-a');
    const b = await newUserActor('d30e-b');
    const { recipe } = await makeAnalysedRecipe(a, 'd30e');
    const aList = await shopping.generate(a, recipe.id);

    await expect(shopping.latest(b, recipe.id)).rejects.toMatchObject({
      response: { code: 'RECIPE_NOT_FOUND' },
    });
    await expect(shopping.generate(b, recipe.id)).rejects.toMatchObject({
      response: { code: 'RECIPE_NOT_FOUND' },
    });
    await expect(
      shopping.setState(b, recipe.id, { shopping_key: aList.groups[0].items[0].shopping_key, state: 'have' }),
    ).rejects.toMatchObject({ response: { code: 'RECIPE_NOT_FOUND' } });
    await expect(shopping.latest(a, 'not-a-uuid')).rejects.toMatchObject({
      response: { code: 'RECIPE_NOT_FOUND' },
    });
    await expect(
      shopping.setState(a, recipe.id, { shopping_key: 'ffffffff-0000-0000-0000-000000000000', state: 'have' }),
    ).rejects.toMatchObject({ response: { code: 'LINE_NOT_FOUND' } });

    // Guest ownership works the same way on session-owned recipes.
    const guest = await newGuestSession();
    const { recipe: guestRecipe } = await makeAnalysedRecipe(guest, 'd30e-guest');
    const guestWire = await shopping.generate(guest, guestRecipe.id);
    expect(guestWire.recipe_id).toBe(guestRecipe.id);
  });
});
