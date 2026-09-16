// D-10A (B5) integration — structured form intake on real Postgres:
//   - POST /recipes/form creates a `form`-typed recipe_input row + one draft
//     line per structured entry (display_name + free-text amount_text);
//   - the form produces the SAME corrected object as paste (B5 AC-1): the
//     returned wire and the persisted draft lines carry the same shape the
//     review/analysis flow reads;
//   - every B5 AC-2 amount unit (g, tsp, to taste, half shell, lemon size,
//     nos) is accepted as free text;
//   - ownership is enforced (foreign actor → canonical 404); malformed body →
//     400 INVALID_FORM.
//
// No reference-data bootstrap needed — intake writes/reads only recipe +
// recipe_input + recipe_ingredient_line. Integration suites run SERIALLY.

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
const { IntakeController } = require('../../apps/api/src/modules/intake/intake.controller');

const recipes = new RecipeService(prisma);
const intake = new IntakeService(prisma, recipes as any);
// formIntake never touches storage — a bare placeholder is enough.
const controller = new IntakeController(recipes as any, intake as any, {} as any);

const FORM_BODY = {
  ingredients: [
    { display_name: 'Fish', amount: '500g' },
    { display_name: 'Chilli', amount: '5 nos' },
    { display_name: 'Tamarind', amount: 'A Lemon Size' },
    { display_name: 'Grated Coconut', amount: 'half shell' },
    { display_name: 'Salt', amount: 'to taste' },
    { display_name: 'Curry leaves', amount: 'as required' },
  ],
};

describe('D-10A structured form intake — real Postgres', () => {
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

  afterAll(async () => {
    for (const id of createdRecipeIds) {
      await prisma.recipe.deleteMany({ where: { id } }); // cascades recipe_input + lines
    }
    for (const id of createdAccountIds) {
      await prisma.account.deleteMany({ where: { id } });
    }
    await prisma.$disconnect();
  });

  it('form intake creates a form-typed raw row + structured draft lines (B5 AC-1/AC-2)', async () => {
    const actor = await newUserActor('d10a');
    const out = await controller.formIntake({ actor } as any, FORM_BODY);

    createdRecipeIds.push(out.recipe_id);
    expect(out.recipe.raw_text).toBe(
      'Fish — 500g\nChilli — 5 nos\nTamarind — A Lemon Size\nGrated Coconut — half shell\nSalt — to taste\nCurry leaves — as required',
    );
    expect(out.recipe.flags).toEqual([]);
    expect(out.recipe.lines).toHaveLength(6);
    expect(out.recipe.lines[0].display_name).toBe('Fish');
    expect(out.recipe.lines[0].amount).toBe('500g');

    const input = await prisma.recipeInput.findFirst({
      where: { recipeId: out.recipe_id, inputType: 'form' },
    });
    expect(input).toBeTruthy();
    expect(input!.rawText).toBe(out.recipe.raw_text);

    const lines = await prisma.recipeIngredientLine.findMany({
      where: { recipeId: out.recipe_id, deletedAt: null },
      orderBy: { lineNo: 'asc' },
    });
    expect(lines).toHaveLength(6);
    // AC-2: every free-text unit survives verbatim in amount_text.
    expect(lines.map((l) => l.amountText)).toEqual([
      '500g', '5 nos', 'A Lemon Size', 'half shell', 'to taste', 'as required',
    ]);
    // B5 AC-1: same corrected-object shape as paste — card-sourced, on the list.
    expect(lines.every((l) => l.sourceTag === 'CARD' && l.includeOnList === true && l.needsReview === false)).toBe(true);
  });

  it('the form object is readable by the review/analysis surface (same path as paste)', async () => {
    const actor = await newUserActor('d10b');
    const out = await controller.formIntake({ actor } as any, FORM_BODY);
    createdRecipeIds.push(out.recipe_id);

    // The review surface (listDraftLines) and the enqueue readiness read the
    // same draft lines a paste would produce.
    const listed = await intake.listDraftLines(actor, out.recipe_id);
    expect(listed).toHaveLength(6);
    expect(listed[0].displayName).toBe('Fish');
    expect(listed[0].amountText).toBe('500g');

    // B5 AC-1: paste with the equivalent text yields the SAME draft-line shape.
    const pasteRecipe = await recipes.createForIntake(actor, { rawText: 'Fish — 500g\nSalt — to taste' });
    createdRecipeIds.push(pasteRecipe.id);
    await intake.recordPaste(actor, pasteRecipe.id, 'Fish — 500g\nSalt — to taste');
    const pasteLines = await intake.listDraftLines(actor, pasteRecipe.id);
    expect(pasteLines.map((l) => l.displayName)).toEqual(['Fish — 500g', 'Salt — to taste']);
    expect(pasteLines.every((l) => l.sourceTag === 'CARD' && l.includeOnList === true)).toBe(true);
  });

  it('ownership + malformed body: foreign actor 404, bad body 400 INVALID_FORM', async () => {
    const owner = await newUserActor('d10c');
    const foreign = await newUserActor('d10d');
    const out = await controller.formIntake({ actor: owner } as any, FORM_BODY);
    createdRecipeIds.push(out.recipe_id);

    // Foreign actor cannot read the form's draft lines (INV-17, no leak).
    await expect(intake.listDraftLines(foreign, out.recipe_id)).rejects.toMatchObject({
      response: { code: 'RECIPE_NOT_FOUND' },
    });

    // Malformed bodies are rejected at the boundary, before any row is written.
    await expect(
      controller.formIntake({ actor: owner } as any, { ingredients: [] }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_FORM' } });
    await expect(
      controller.formIntake({ actor: owner } as any, { ingredients: [{ name: 'Fish' }] }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_FORM' } });
  });
});
