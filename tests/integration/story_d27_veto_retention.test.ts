// D-27 (P7-3) integration — G2 regional veto + guest-expiry retention on real
// Postgres:
//   - veto: COMPLETE → INCOMPLETE (View 5 only); payload/recipe untouched;
//     other views intact; repeat veto idempotent; reviewer authorization;
//     malformed id 404; a re-analysis is a FRESH analysis (veto stays on the
//     vetoed analysis).
//   - retention: expired unclaimed guest sessions + their recipes are removed
//     (DB cascade + compensating storage cleanup); claimed and unexpired
//     sessions are untouched (Q11/Q15 labeled pilot defaults).

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
const { ForbiddenException, NotFoundException } = require('@nestjs/common');
const { RecipeService } = require('../../apps/api/src/modules/recipes/recipe.service');
const { ReviewsService } = require('../../apps/api/src/modules/reviews/reviews.service');
const { CleanupService } = require('../../apps/api/src/modules/cleanup/cleanup.service');

const REVIEWER_EMAIL = 'd27-reviewer@test.dev';

const VIEW5_PAYLOAD = {
  family: 'Coastal Tamil (Kanyakumari) style',
  architecture: 'Raw-ground coconut paste, triple sour',
  confidence: 'high',
  not_this: [
    { variant: 'Kerala meen curry', key_difference: 'uses kudampuli instead of tamarind/mango' },
  ],
  needs_review: true,
  tag: 'INFERRED',
};

async function newAccount(prefix: string) {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.dev`;
  return prisma.account.create({
    data: { email, authProvider: 'sso', preferredMode: 'home' },
  });
}

async function newRecipeWithViews(view5Status: 'COMPLETE' | 'INCOMPLETE') {
  const account = await newAccount('d27veto');
  const recipe = await prisma.recipe.create({
    data: { accountId: account.id, title: 'D-27 veto recipe' },
  });
  const analysis = await prisma.analysis.create({
    data: { recipeId: recipe.id, mode: 'home', status: 'complete', isCurrent: true },
  });
  await prisma.analysisView.createMany({
    data: [
      { analysisId: analysis.id, viewNumber: 1, viewKey: 'roles', status: 'COMPLETE', payload: { items: [], role_groups: [] } },
      { analysisId: analysis.id, viewNumber: 5, viewKey: 'regional_context', status: view5Status, payload: VIEW5_PAYLOAD },
    ],
  });
  return { account, recipe, analysis };
}

describe('D-27 — G2 veto + guest-expiry retention on real Postgres', () => {
  const createdRecipes: string[] = [];
  const createdAccounts: string[] = [];
  const createdGuests: string[] = [];
  const originalReviewerEnv = process.env.REVIEWER_EMAILS;

  beforeAll(() => {
    process.env.REVIEWER_EMAILS = REVIEWER_EMAIL;
  });

  afterAll(async () => {
    for (const id of createdRecipes) await prisma.recipe.deleteMany({ where: { id } });
    for (const id of createdAccounts) await prisma.account.deleteMany({ where: { id } });
    for (const id of createdGuests) await prisma.guestSession.deleteMany({ where: { id } });
    if (originalReviewerEnv === undefined) delete process.env.REVIEWER_EMAILS;
    else process.env.REVIEWER_EMAILS = originalReviewerEnv;
    await prisma.$disconnect();
  });

  it('G2 TC-01: a configured reviewer vetoes View 5 → COMPLETE → INCOMPLETE, payload/recipe/other views untouched', async () => {
    const { account, recipe, analysis } = await newRecipeWithViews('COMPLETE');
    createdRecipes.push(recipe.id);
    createdAccounts.push(account.id);

    const reviews = new ReviewsService(prisma);
    const result = await reviews.vetoView5(
      { accountId: account.id, email: REVIEWER_EMAIL, sub: 'd27' },
      analysis.id,
    );

    expect(result).toEqual({
      analysis_id: analysis.id,
      view_number: 5,
      status: 'INCOMPLETE',
      vetoed: true,
      already_vetoed: false,
    });

    const views = await prisma.analysisView.findMany({
      where: { analysisId: analysis.id },
      orderBy: { viewNumber: 'asc' },
    });
    const view5 = views.find((v) => v.viewNumber === 5)!;
    const view1 = views.find((v) => v.viewNumber === 1)!;
    expect(view5.status).toBe('INCOMPLETE');
    expect(view5.payload).toEqual(VIEW5_PAYLOAD); // payload NEVER rewritten
    expect(view1.status).toBe('COMPLETE'); // other views intact

    const still = await prisma.recipe.findUnique({ where: { id: recipe.id } });
    expect(still).toBeTruthy();
    expect(still!.title).toBe('D-27 veto recipe');
    const inputs = await prisma.recipeInput.findMany({ where: { recipeId: recipe.id } });
    expect(inputs).toHaveLength(0);
  });

  it('G2: a repeat veto is idempotent (already INCOMPLETE → already_vetoed, no second write)', async () => {
    const { account, recipe, analysis } = await newRecipeWithViews('INCOMPLETE');
    createdRecipes.push(recipe.id);
    createdAccounts.push(account.id);

    const reviews = new ReviewsService(prisma);
    const result = await reviews.vetoView5(
      { accountId: account.id, email: REVIEWER_EMAIL, sub: 'd27' },
      analysis.id,
    );
    expect(result.already_vetoed).toBe(true);
  });

  it('G2: a non-reviewer is forbidden; a malformed id is a clean 404', async () => {
    const { account, recipe, analysis } = await newRecipeWithViews('COMPLETE');
    createdRecipes.push(recipe.id);
    createdAccounts.push(account.id);

    const reviews = new ReviewsService(prisma);
    await expect(
      reviews.vetoView5({ accountId: account.id, email: 'outsider@test.dev', sub: 'x' }, analysis.id),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      reviews.vetoView5({ accountId: account.id, email: REVIEWER_EMAIL, sub: 'x' }, 'not-a-uuid'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('G2: a re-analysis is a FRESH analysis — the veto stays on the vetoed analysis', async () => {
    const { account, recipe, analysis } = await newRecipeWithViews('COMPLETE');
    createdRecipes.push(recipe.id);
    createdAccounts.push(account.id);

    const reviews = new ReviewsService(prisma);
    await reviews.vetoView5({ accountId: account.id, email: REVIEWER_EMAIL, sub: 'd27' }, analysis.id);

    // Re-analysis: new analysis becomes current; fresh View 5 is COMPLETE again.
    await prisma.analysis.update({ where: { id: analysis.id }, data: { isCurrent: false } });
    const fresh = await prisma.analysis.create({
      data: { recipeId: recipe.id, mode: 'home', status: 'complete', isCurrent: true },
    });
    await prisma.analysisView.create({
      data: { analysisId: fresh.id, viewNumber: 5, viewKey: 'regional_context', status: 'COMPLETE', payload: VIEW5_PAYLOAD },
    });

    const old5 = await prisma.analysisView.findFirst({
      where: { analysisId: analysis.id, viewNumber: 5 },
    });
    const fresh5 = await prisma.analysisView.findFirst({
      where: { analysisId: fresh.id, viewNumber: 5 },
    });
    expect(old5!.status).toBe('INCOMPLETE'); // veto persists on the vetoed analysis
    expect(fresh5!.status).toBe('COMPLETE'); // the fresh analysis is unaffected
  });

  it('retention: expired unclaimed guest sessions + their recipes are removed; claimed/unexpired are kept', async () => {
    const fakeStorage = {
      bucket: 'recipe-assets',
      tryDeleteObject: jest.fn().mockResolvedValue(true),
    };
    const recipes = new RecipeService(prisma, fakeStorage as any);
    const cleanup = new CleanupService(prisma, recipes);

    // Expired, unclaimed — will be swept (with a photo + a recipe_input to prove cascade).
    const expired = await prisma.guestSession.create({
      data: { expiresAt: new Date(Date.now() - 60_000), claimedAt: null },
    });
    createdGuests.push(expired.id);
    const expiredRecipe = await prisma.recipe.create({
      data: {
        guestSessionId: expired.id,
        title: 'expired guest recipe',
        photoUri: 's3://recipe-assets/recipes/expired-photo.jpg',
      },
    });
    createdRecipes.push(expiredRecipe.id);
    await prisma.recipeInput.create({
      data: { recipeId: expiredRecipe.id, inputType: 'paste', rawText: 'Fish', photoUri: 's3://recipe-assets/recipes/expired-input.jpg' },
    });

    // Claimed — audit record, never swept.
    const claimed = await prisma.guestSession.create({
      data: { expiresAt: new Date(Date.now() - 60_000), claimedAt: new Date() },
    });
    createdGuests.push(claimed.id);
    const claimedRecipe = await prisma.recipe.create({
      data: { guestSessionId: claimed.id, title: 'claimed guest recipe' },
    });
    createdRecipes.push(claimedRecipe.id);

    // Unexpired, unclaimed — not yet eligible.
    const future = await prisma.guestSession.create({
      data: { expiresAt: new Date(Date.now() + 60_000), claimedAt: null },
    });
    createdGuests.push(future.id);
    const futureRecipe = await prisma.recipe.create({
      data: { guestSessionId: future.id, title: 'future guest recipe' },
    });
    createdRecipes.push(futureRecipe.id);

    const report = await cleanup.cleanupExpiredGuests();

    // The DB may hold OTHER expired unclaimed sessions from earlier runs — the
    // assertions target THIS test's own rows, not absolute sweep counts.
    expect(report.expired_sessions_found).toBeGreaterThanOrEqual(1);
    expect(report.recipes_removed).toBeGreaterThanOrEqual(1);
    expect(await prisma.recipe.findUnique({ where: { id: expiredRecipe.id } })).toBeNull();
    expect(await prisma.guestSession.findUnique({ where: { id: expired.id } })).toBeNull();
    // Cascade removed the recipe_input.
    expect(await prisma.recipeInput.findMany({ where: { recipeId: expiredRecipe.id } })).toHaveLength(0);
    // Storage compensation ran for both photo keys.
    expect(fakeStorage.tryDeleteObject).toHaveBeenCalledWith('recipes/expired-photo.jpg');
    expect(fakeStorage.tryDeleteObject).toHaveBeenCalledWith('recipes/expired-input.jpg');

    // Claimed + unexpired are untouched.
    expect(await prisma.recipe.findUnique({ where: { id: claimedRecipe.id } })).toBeTruthy();
    expect(await prisma.guestSession.findUnique({ where: { id: claimed.id } })).toBeTruthy();
    expect(await prisma.recipe.findUnique({ where: { id: futureRecipe.id } })).toBeTruthy();
    expect(await prisma.guestSession.findUnique({ where: { id: future.id } })).toBeTruthy();
  });
});
