// D-11 (P2-2) integration — OCR draft pipeline on real Postgres:
//   - photo → OCR (deterministic stub behind the adapter seam) → ocr_text
//     persisted write-once + draft lines created (INV-04: none dropped);
//   - low-confidence line → needs_review=true → the INV-05 enqueue gate blocks;
//   - provider failure → pending (nothing OCR-specific persisted), retryable.
// The real PaddleOCR provider + provenance-valid photo are Q10-gated (not here).

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
const { StubOcrAdapter } = require('@recipe-systems/ocr-adapter');
const { RecipeService } = require('../../apps/api/src/modules/recipes/recipe.service');
const { IntakeService } = require('../../apps/api/src/modules/intake/intake.service');

const recipes = new RecipeService(prisma);
const intake = new IntakeService(prisma, recipes, new StubOcrAdapter());

describe('D-11 — OCR draft pipeline on real Postgres', () => {
  const createdRecipeIds: string[] = [];
  const createdAccountIds: string[] = [];

  async function newUserActor(prefix: string) {
    const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.dev`;
    const account = await prisma.account.create({
      data: { email, authProvider: 'sso', preferredMode: 'home' },
    });
    createdAccountIds.push(account.id);
    return { kind: 'user' as const, user: { accountId: account.id, email: account.email, sub: `int-${prefix}` } };
  }

  afterAll(async () => {
    for (const id of createdRecipeIds) await prisma.recipe.deleteMany({ where: { id } });
    for (const id of createdAccountIds) await prisma.account.deleteMany({ where: { id } });
    await prisma.$disconnect();
  });

  it('B2: photo → OCR draft → ocr_text + lines; low-confidence flagged and the enqueue gate blocks (INV-04/INV-05)', async () => {
    const actor = await newUserActor('d11');
    const recipe = await recipes.createForIntake(actor, { photoUri: 's3://recipe-assets/recipes/d11.jpg' });
    createdRecipeIds.push(recipe.id);
    const input = await intake.recordPhoto(actor, recipe.id, 's3://recipe-assets/recipes/d11.jpg');

    const result = await intake.ocrPhoto(actor, recipe.id, input.id, new Uint8Array([1, 2, 3]), 'image/jpeg');
    expect(result.status).toBe('complete');
    expect(result.draft_line_count).toBe(11);
    expect(result.flagged_count).toBe(1); // Fenugreek Powder 0.45

    const persistedInput = await prisma.recipeInput.findUnique({ where: { id: input.id } });
    expect(persistedInput!.ocrText).toContain('Fish - 500g');
    expect(persistedInput!.ocrText).toContain('Fenugreek - 1/4 Tsp');

    const lines = await intake.listDraftLines(actor, recipe.id);
    expect(lines).toHaveLength(11); // all OCR lines persisted — none dropped
    expect(lines.every((l) => l.sourceTag === 'CARD')).toBe(true);
    const flagged = lines.filter((l) => l.needsReview);
    expect(flagged).toHaveLength(1);
    expect(flagged[0].displayName).toContain('Fenugreek Powder');
    expect(flagged[0].ocrConfidence).not.toBeNull();

    // INV-05: the flagged line blocks analysis enqueue.
    const readiness = await intake.getEnqueueState(actor, recipe.id);
    expect(readiness.can_enqueue).toBe(false);
    expect(readiness.blockers.map((b) => b.display_name)).toContain('Fenugreek Powder - 1/2 Tsp');
  });

  it('provider failure → pending (nothing OCR-specific persisted), retryable', async () => {
    const actor = await newUserActor('d11fail');
    const recipe = await recipes.createForIntake(actor, { photoUri: 's3://recipe-assets/recipes/d11fail.jpg' });
    createdRecipeIds.push(recipe.id);
    const input = await intake.recordPhoto(actor, recipe.id, 's3://recipe-assets/recipes/d11fail.jpg');

    const failingIntake = new IntakeService(prisma, recipes, {
      recognize: () => Promise.reject(new Error('ECONNREFUSED')),
    } as any);
    const result = await failingIntake.ocrPhoto(actor, recipe.id, input.id, new Uint8Array([1]), 'image/jpeg');
    expect(result.status).toBe('pending');

    // The photo + input row stay durable; nothing OCR-specific was persisted.
    const persistedInput = await prisma.recipeInput.findUnique({ where: { id: input.id } });
    expect(persistedInput).toBeTruthy();
    expect(persistedInput!.ocrText).toBeNull();
    expect(await intake.listDraftLines(actor, recipe.id)).toHaveLength(0);
  });
});
