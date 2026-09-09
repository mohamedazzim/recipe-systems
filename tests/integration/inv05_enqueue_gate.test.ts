// D-14 integration — inv05_enqueue_gate: the real Postgres path for the needs_review
// enqueue gate (INV-05, ADR §3 invariant table; DISPATCH D-14).
//
// Proves on the live schema:
//   - INV-05: an active line with needs_review=true blocks enqueue, named line by line
//   - clearing the last flagged line (via the review PATCH path — needsReview=false)
//     unblocks immediately (dispatch done criterion)
//   - soft-deleted flagged lines never block (active = deleted_at IS NULL, D-14D)
//   - clean drafts enqueue freely; parse-preview carries the shared enqueue state (D-14B)
//   - ownership: foreign actor → 404 (INV-17); no write path exists in the gate (Q4)
//
// Note: text-scope lines are born needs_review=false; a flagged line is planted at the DB
// level here exactly as D-11 OCR flagging will produce it (the flag's producer is D-11 —
// deferred; the GATE is channel-agnostic). No OCR state is fabricated for text input.

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

const TEXT = 'Fish — 500g\nChilli — 5 Nos\nTamarind — A Lemon Size';

describe('D-14 needs_review enqueue gate (INV-05) — real Postgres', () => {
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
      user: { accountId: account.id, email: account.email, sub: 'integration-d14' },
    };
  }

  async function pasteRecipe(actor: any) {
    const recipe = await recipes.createForIntake(actor, { rawText: TEXT });
    createdRecipeIds.push(recipe.id);
    await intake.recordPaste(actor, recipe.id, TEXT);
    return recipe.id;
  }

  /** Plant a flag the way D-11 OCR will: needs_review=true on an active line. */
  async function plantFlag(recipeId: string, displayName: string) {
    const line = await prisma.recipeIngredientLine.findFirst({
      where: { recipeId, displayName, deletedAt: null },
    });
    if (!line) throw new Error(`line not found: ${displayName}`);
    await prisma.recipeIngredientLine.update({
      where: { id: line.id },
      data: { needsReview: true },
    });
    return line.id;
  }

  afterAll(async () => {
    for (const id of createdRecipeIds) {
      await prisma.recipe.deleteMany({ where: { id } });
    }
    for (const id of createdAccountIds) {
      await prisma.account.deleteMany({ where: { id } });
    }
  });

  it('clean draft enqueues freely; parse-preview carries the shared state (D-14B)', async () => {
    const actor = await newUserActor('d14-clean');
    const recipeId = await pasteRecipe(actor);

    const state = await intake.getEnqueueState(actor, recipeId);
    expect(state).toEqual({ can_enqueue: true, blockers: [] });

    const preview = await intake.parsePreview(actor, recipeId);
    expect(preview.status).toBe('confirmed');
    expect(preview.enqueue).toEqual({ can_enqueue: true, blockers: [] });
  });

  it('INV-05: a flagged active line blocks enqueue, named line by line', async () => {
    const actor = await newUserActor('d14-flag');
    const recipeId = await pasteRecipe(actor);
    await plantFlag(recipeId, 'Chilli — 5 Nos');

    const state = await intake.getEnqueueState(actor, recipeId);
    expect(state.can_enqueue).toBe(false);
    expect(state.blockers).toEqual([expect.objectContaining({ display_name: 'Chilli — 5 Nos' })]);
    expect(state.blockers[0].line_id).toBeTruthy();

    const preview = await intake.parsePreview(actor, recipeId);
    expect(preview.status).toBe('draft');
    expect(preview.enqueue.can_enqueue).toBe(false);
  });

  it('clearing the last flagged line via review unblocks immediately (done criterion)', async () => {
    const actor = await newUserActor('d14-clear');
    const recipeId = await pasteRecipe(actor);
    const fishId = await plantFlag(recipeId, 'Fish — 500g');
    const chilliId = await plantFlag(recipeId, 'Chilli — 5 Nos');

    // two flags → blocked, both named
    let state = await intake.getEnqueueState(actor, recipeId);
    expect(state.can_enqueue).toBe(false);
    expect(state.blockers).toHaveLength(2);

    // review the first line: explicit needsReview=false (the only clearing path)
    const fish = await prisma.recipeIngredientLine.findUnique({ where: { id: fishId } });
    await intake.updateLine(
      actor,
      recipeId,
      fishId,
      { needsReview: false },
      fish!.updatedAt.toISOString(),
    );

    state = await intake.getEnqueueState(actor, recipeId);
    expect(state.can_enqueue).toBe(false); // one flag left
    expect(state.blockers).toHaveLength(1);
    expect(state.blockers[0].line_id).toBe(chilliId);

    // clear the last flag → unblocked IMMEDIATELY (no cache, no drift)
    const chilli = await prisma.recipeIngredientLine.findUnique({ where: { id: chilliId } });
    await intake.updateLine(
      actor,
      recipeId,
      chilliId,
      { needsReview: false },
      chilli!.updatedAt.toISOString(),
    );

    state = await intake.getEnqueueState(actor, recipeId);
    expect(state).toEqual({ can_enqueue: true, blockers: [] });
  });

  it('a soft-deleted flagged line never blocks (active = deleted_at IS NULL, D-14D)', async () => {
    const actor = await newUserActor('d14-soft');
    const recipeId = await pasteRecipe(actor);
    const tamarindId = await plantFlag(recipeId, 'Tamarind — A Lemon Size');

    // user deletes the flagged line during review (soft delete)
    await intake.softDeleteLine(actor, recipeId, tamarindId);

    const state = await intake.getEnqueueState(actor, recipeId);
    expect(state).toEqual({ can_enqueue: true, blockers: [] });
  });

  it('ownership: a foreign actor cannot read enqueue state (INV-17, 404)', async () => {
    const owner = await newUserActor('d14-owner');
    const recipeId = await pasteRecipe(owner);
    const intruder = await newUserActor('d14-intruder');

    await expect(intake.getEnqueueState(intruder, recipeId)).rejects.toMatchObject({
      response: { code: 'RECIPE_NOT_FOUND' },
    });
  });

  it('the gate writes nothing: line rows are byte-identical across state reads (Q4)', async () => {
    const actor = await newUserActor('d14-q4');
    const recipeId = await pasteRecipe(actor);
    await plantFlag(recipeId, 'Fish — 500g');

    const before = await prisma.recipeIngredientLine.findMany({
      where: { recipeId },
      orderBy: { lineNo: 'asc' },
    });
    await intake.getEnqueueState(actor, recipeId);
    await intake.parsePreview(actor, recipeId);
    const after = await prisma.recipeIngredientLine.findMany({
      where: { recipeId },
      orderBy: { lineNo: 'asc' },
    });

    expect(after).toEqual(before);
  });
});
