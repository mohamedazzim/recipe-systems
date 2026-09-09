// D-13 integration — story_b4_method_attach: the real Postgres path for method attach
// (B4) on intake-created recipes.
//
// Proves on the live schema:
//   - B4 TC-01: paste → method_text persisted, tag METHOD, list_only false
//   - B4 TC-02: inferred → tag INFERRED + named source persisted (never source-less, A-13)
//   - B4 TC-03: none → all three method columns NULL → list_only true (Views 3/7 INCOMPLETE flag)
//   - transitions: paste → inferred → none on the same recipe; wire shape {method_tag,
//     method_source, list_only} matches API §4
//   - Q4 boundary: no recipe_ingredient_line row is ever written by method attach
//   - INV-17: foreign actor → 404, no write

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

// Require AFTER env is set (the db package constructs its client at import time).
const { prisma } = require('@recipe-systems/database');
const { RecipeService } = require('../../apps/api/src/modules/recipes/recipe.service');
const { IntakeService } = require('../../apps/api/src/modules/intake/intake.service');

const recipes = new RecipeService(prisma);
const intake = new IntakeService(prisma, recipes as any);

const METHOD_TEXT = 'Dry roast the spices; boil tamarind; temper in coconut oil; simmer with fish.';
const FAMILY_METHOD = 'Boil tamarind water; temper mustard, fenugreek; add fish; simmer; garnish with curry leaves.';
const NAMED_SOURCE = 'CDK 1669 / Mrs. Anitha';

describe('D-13 method attach (B4) — real Postgres', () => {
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
      user: { accountId: account.id, email: account.email, sub: 'integration-b4' },
    };
  }

  async function pasteRecipe(actor: any) {
    const recipe = await recipes.createForIntake(actor, { rawText: 'Fish — 500g\nTamarind — A Lemon Size' });
    createdRecipeIds.push(recipe.id);
    await intake.recordPaste(actor, recipe.id, 'Fish — 500g\nTamarind — A Lemon Size');
    return recipe.id;
  }

  afterAll(async () => {
    for (const id of createdRecipeIds) {
      await prisma.recipe.deleteMany({ where: { id } });
    }
    for (const id of createdAccountIds) {
      await prisma.account.deleteMany({ where: { id } });
    }
  });

  it('TC-01: paste attaches the user method (tag METHOD, list_only false) and persists on recipe', async () => {
    const actor = await newUserActor('b4-paste');
    const recipeId = await pasteRecipe(actor);

    const state = await recipes.attachMethod(actor, recipeId, { mode: 'paste', methodText: METHOD_TEXT });
    expect(state).toEqual({ method_tag: 'METHOD', method_source: null, list_only: false });

    const row = await prisma.recipe.findUnique({ where: { id: recipeId } });
    expect(row?.methodText).toBe(METHOD_TEXT);
    expect(row?.methodSourceTag).toBe('METHOD');
    expect(row?.methodInferredSource).toBeNull();
  });

  it('TC-02: inferred attaches the family method tagged INFERRED with the named source', async () => {
    const actor = await newUserActor('b4-inferred');
    const recipeId = await pasteRecipe(actor);

    const state = await recipes.attachMethod(actor, recipeId, {
      mode: 'inferred',
      methodText: FAMILY_METHOD,
      methodSource: NAMED_SOURCE,
    });
    expect(state).toEqual({
      method_tag: 'INFERRED',
      method_source: NAMED_SOURCE,
      list_only: false,
    });

    const row = await prisma.recipe.findUnique({ where: { id: recipeId } });
    expect(row?.methodText).toBe(FAMILY_METHOD);
    expect(row?.methodSourceTag).toBe('INFERRED');
    expect(row?.methodInferredSource).toBe(NAMED_SOURCE);
  });

  it('TC-03: none clears the method → list_only true (the Views 3/7 INCOMPLETE flag, never fabricated)', async () => {
    const actor = await newUserActor('b4-none');
    const recipeId = await pasteRecipe(actor);

    // attach first, then clear — the transition itself is the contract
    await recipes.attachMethod(actor, recipeId, { mode: 'paste', methodText: METHOD_TEXT });
    const state = await recipes.attachMethod(actor, recipeId, { mode: 'none' });
    expect(state).toEqual({ method_tag: null, method_source: null, list_only: true });

    const row = await prisma.recipe.findUnique({ where: { id: recipeId } });
    expect(row?.methodText).toBeNull();
    expect(row?.methodSourceTag).toBeNull();
    expect(row?.methodInferredSource).toBeNull();
  });

  it('fresh intake recipe starts list-only (absent method → Views 3/7 INCOMPLETE, §3.4)', async () => {
    const actor = await newUserActor('b4-fresh');
    const recipeId = await pasteRecipe(actor);

    const row = await prisma.recipe.findUnique({ where: { id: recipeId } });
    expect(row?.methodText).toBeNull();
    expect(row?.methodSourceTag).toBeNull();
    // the wire derivation from a fresh row:
    const state = await recipes.attachMethod(actor, recipeId, { mode: 'none' });
    expect(state).toEqual({ method_tag: null, method_source: null, list_only: true });
  });

  it('Q4 boundary: method attach never writes recipe_ingredient_line rows', async () => {
    const actor = await newUserActor('b4-q4');
    const recipeId = await pasteRecipe(actor);
    const before = await prisma.recipeIngredientLine.count({ where: { recipeId } });

    await recipes.attachMethod(actor, recipeId, { mode: 'paste', methodText: METHOD_TEXT });
    await recipes.attachMethod(actor, recipeId, {
      mode: 'inferred',
      methodText: FAMILY_METHOD,
      methodSource: NAMED_SOURCE,
    });
    await recipes.attachMethod(actor, recipeId, { mode: 'none' });

    const after = await prisma.recipeIngredientLine.count({ where: { recipeId } });
    expect(after).toBe(before);
  });

  it('INV-17: a foreign actor gets 404 and no write happens', async () => {
    const owner = await newUserActor('b4-owner');
    const recipeId = await pasteRecipe(owner);
    const intruder = await newUserActor('b4-intruder');

    await expect(
      recipes.attachMethod(intruder, recipeId, { mode: 'paste', methodText: 'stolen' }),
    ).rejects.toMatchObject({ response: { code: 'RECIPE_NOT_FOUND' } });

    const row = await prisma.recipe.findUnique({ where: { id: recipeId } });
    expect(row?.methodText).toBeNull(); // untouched
  });
});
