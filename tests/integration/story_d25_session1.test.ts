// D-25 (P7-1) session 1 integration — B6 aliases + D3 tags/search on real
// Postgres + reviewed reference data:
//   - the five B6 vernacular groups resolve to their canonical via the
//     dictionary/alias path (TC-01); ambiguous "drumstick" asks confirmation
//     (TC-02); the two fenugreeks stay DISTINCT (powder vs seed).
//   - D3: free-text tags persist (AC-1); search returns the right recipe on
//     each of the three axes — name, ingredient, tag (AC-2).
//   - The B6 prerequisite import (R-2026-09-15-005) loads through the reviewed
//     D-29 path — aliases are reference data, never hardcoded in app code.

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
const {
  ReferenceDataRepository,
} = require('../../apps/api/src/admin/reference-data.repository');
const { ReferenceDataService } = require('../../apps/api/src/admin/reference-data.service');

const recipes = new RecipeService(prisma);
const intake = new IntakeService(prisma, recipes as any);

const COMMITTED_APPROVALS_DIR = path.join(REPO, 'infra', 'reference-data', 'approvals');
const COMMITTED_IMPORTS_DIR = path.join(REPO, 'infra', 'reference-data', 'imports');
const D29_REVIEWER = 'Mohamed Azzim (D-29 dispatch authorization 2026-09-09)';
const D25_REVIEWER = 'Mohamed Azzim (D-25 dispatch authorization 2026-09-15)';
const D29_IMPORTS = [
  'R-2026-09-09-001-allergen-definitions.json',
  'R-2026-09-09-002-dictionary-golden.json',
  'R-2026-09-09-003-allergen-mappings.json',
  'R-2026-09-09-004-nutrition-composition.json',
];
const D25_IMPORTS = ['R-2026-09-15-005-b6-aliases.json'];

// B6 TC-01: every name in the five groups resolves; the groups are:
// drumstick/murungakkai/moringa · shallots/chinna vengayam/cheriya ulli ·
// fenugreek/methi/uluva/vendhayam · tamarind/puli · curry leaves/karuveppilai.
const B6_CASES: Array<[string, string]> = [
  ['murungakkai — 2 nos', 'drumstick'],
  ['moringa — 2 pods', 'drumstick'],
  ['chinna vengayam — 8 nos', 'shallots'],
  ['cheriya ulli — 8 nos', 'shallots'],
  ['shallots — 8 nos', 'shallots'],
  ['fenugreek — 1/4 Tsp', 'fenugreek_seed'],
  ['methi — 1/4 Tsp', 'fenugreek_seed'],
  ['uluva — 1/4 Tsp', 'fenugreek_seed'],
  ['vendhayam — 1/4 Tsp', 'fenugreek_seed'],
  ['Fenugreek Powder — 1/2 Tsp', 'fenugreek_powder'],
  ['tamarind — A Lemon Size', 'tamarind'],
  ['puli — A Lemon Size', 'tamarind'],
  ['curry leaves — a sprig', 'curry_leaves'],
  ['karuveppilai — a sprig', 'curry_leaves'],
];

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

describe('D-25 session 1 — aliases (B6) + tags/search (D3) on real Postgres', () => {
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
      user: { accountId: account.id, email: account.email, sub: `integration-${prefix}` },
    };
  }

  beforeAll(async () => {
    await captureReferenceTables();
    await truncateReferenceTables();
    const service = new ReferenceDataService(new ReferenceDataRepository(prisma), COMMITTED_APPROVALS_DIR);
    for (const fileName of D29_IMPORTS) {
      const file = JSON.parse(fs.readFileSync(path.join(COMMITTED_IMPORTS_DIR, fileName), 'utf8'));
      await service.approve(file.import_id, D29_REVIEWER, file);
    }
    for (const fileName of D25_IMPORTS) {
      const file = JSON.parse(fs.readFileSync(path.join(COMMITTED_IMPORTS_DIR, fileName), 'utf8'));
      await service.approve(file.import_id, D25_REVIEWER, file);
    }
  });

  afterAll(async () => {
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

  it('B6 TC-01/TC-02: the five groups resolve and drumstick asks confirmation', async () => {
    const actor = await newUserActor('d25b6');
    const text = [...B6_CASES.map(([name]) => name), 'drumstick — 1 Nos'].join('\n');
    const recipe = await recipes.createForIntake(actor, { rawText: text });
    createdRecipeIds.push(recipe.id);
    await intake.recordPaste(actor, recipe.id, text);

    const lines = await intake.listDraftLines(actor, recipe.id);
    const wire = await intake.resolveWireLines(lines);
    const byDisplay = new Map(wire.map((w) => [w.display_name.toLowerCase(), w]));

    for (const [name, canonical] of B6_CASES) {
      const w = byDisplay.get(name.toLowerCase());
      expect(w).toBeTruthy();
      expect(w!.canonical_name).toBe(canonical);
      expect(w!.requires_confirmation).toBe(false);
    }

    // TC-02: ambiguous "drumstick" asks confirmation — canonical still proposed.
    const drumstick = byDisplay.get('drumstick — 1 nos');
    expect(drumstick).toBeTruthy();
    expect(drumstick!.canonical_name).toBe('drumstick');
    expect(drumstick!.requires_confirmation).toBe(true);
  });

  it('D3 AC-1: free-text tags persist (wholesale replace, sorted read-back)', async () => {
    const actor = await newUserActor('d25d3');
    const recipe = await recipes.createForIntake(actor, { rawText: 'Fish — 500g\nTamarind — a lemon size' });
    createdRecipeIds.push(recipe.id);
    await intake.recordPaste(actor, recipe.id, 'Fish — 500g\nTamarind — a lemon size');

    expect(await recipes.setTags(actor, recipe.id, ['sunday', 'fish curry', 'fish curry'])).toEqual([
      'sunday',
      'fish curry',
    ]);
    expect(await recipes.listTags(actor, recipe.id)).toEqual(['fish curry', 'sunday']);

    // replace, not append
    await recipes.setTags(actor, recipe.id, ['comfort']);
    expect(await recipes.listTags(actor, recipe.id)).toEqual(['comfort']);
  });

  it('D3 AC-2: search returns the right recipe on all three axes', async () => {
    const actor = await newUserActor('d25search');
    const recipe = await recipes.createForIntake(actor, { rawText: 'Fish — 500g\nTamarind — a lemon size' });
    createdRecipeIds.push(recipe.id);
    await intake.recordPaste(actor, recipe.id, 'Fish — 500g\nTamarind — a lemon size');
    await recipes.saveRecipe(actor, recipe.id, { title: 'Sunday fish curry' });
    await recipes.setTags(actor, recipe.id, ['comfort']);

    // name axis
    expect((await recipes.search(actor, 'sunday')).map((r) => r.recipe_id)).toContain(recipe.id);
    // ingredient axis (line display name)
    expect((await recipes.search(actor, 'tamarind')).map((r) => r.recipe_id)).toContain(recipe.id);
    // tag axis
    expect((await recipes.search(actor, 'comfort')).map((r) => r.recipe_id)).toContain(recipe.id);
    // non-matching query excludes it
    expect((await recipes.search(actor, 'paneer')).map((r) => r.recipe_id)).not.toContain(recipe.id);
    // cross-account isolation (INV-17): a second account never sees the first's recipe
    const b = await newUserActor('d25search-b');
    expect((await recipes.search(b, 'sunday')).map((r) => r.recipe_id)).not.toContain(recipe.id);
  });
});
