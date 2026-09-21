// Phase 4 integration — story_bulk_confirm: the real Postgres path from a
// structured draft through user correction to a confirmed, NORMAL recipe.
//
// Proves on the live schema:
//   - updateDraft persists authoritative edits WITHOUT overwriting the model extraction
//   - confirmDraft creates exactly one recipe through the existing path (RecipeService
//     + IntakeService), with the user's confirmed values
//   - draft status → confirmed + recipe_id link; original payload + user_payload retained
//   - idempotency: a second confirm returns the same recipe (no duplicates)
//   - unresolved review flags block confirmation
//   - ownership: a foreign actor 404s and creates nothing

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
const { IngestionService } = require('../../apps/api/src/modules/ingestion/ingestion.service');

const recipes = new RecipeService(prisma);
const intake = new IntakeService(prisma, recipes as any);
const storageMock = { uploadDocument: jest.fn(), deleteObject: jest.fn(), getImage: jest.fn() };
const queueMock = { enqueue: jest.fn(), enqueueExtraction: jest.fn() };
const ingestion = new IngestionService(
  prisma,
  storageMock as any,
  queueMock as any,
  recipes as any,
  intake as any,
);

function sourceDraft() {
  return {
    title: 'Chicken Biryani',
    title_needs_review: false,
    ingredients: [
      {
        name: 'chicken',
        quantity: '500',
        unit: 'g',
        preparation: null,
        source: '500 g chicken',
        needs_review: false,
      },
      {
        name: 'onions',
        quantity: null,
        unit: null,
        preparation: null,
        source: 'onions',
        needs_review: true,
      },
    ],
    method_steps: [{ text: 'Cook the chicken.', source: 'Cook the chicken.', needs_review: false }],
    needs_review: true,
    notes: ['onions: no quantity in the source'],
  };
}

const CORRECTED = {
  title: 'Spicy Chicken Biryani',
  title_needs_review: false,
  ingredients: [
    {
      name: 'chicken',
      quantity: '500',
      unit: 'g',
      preparation: null,
      provenance: 'source',
      source: '500 g chicken',
      needs_review: false,
    },
    {
      name: 'red onions',
      quantity: '3',
      unit: null,
      preparation: 'thinly sliced',
      provenance: 'user_corrected',
      source: 'onions',
      needs_review: false,
    },
  ],
  method_steps: [
    { text: 'Cook the chicken.', provenance: 'source', source: 'Cook the chicken.', needs_review: false },
    { text: 'Garnish with coriander.', provenance: 'user_added', source: null, needs_review: false },
  ],
};

describe('Phase 4 bulk draft → confirm (real Postgres)', () => {
  const createdAccountIds: string[] = [];
  const createdIngestionIds: string[] = [];
  const createdRecipeIds: string[] = [];

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

  async function seedDraft(actor: any, payload: any = sourceDraft()) {
    const ingestionRow = await prisma.documentIngestion.create({
      data: {
        accountId: actor.user.accountId,
        originalFilename: 'recipe.txt',
        fileType: 'txt',
        fileSizeBytes: 64,
        storageKey: `documents/${Date.now()}.txt`,
        storageUri: 's3://recipe-assets/documents/x.txt',
        status: 'draft_ready',
        rawText: 'Chicken Biryani\n500 g chicken\nCook the chicken.',
      },
    });
    createdIngestionIds.push(ingestionRow.id);
    const draft = await prisma.documentRecipeDraft.create({
      data: {
        ingestionId: ingestionRow.id,
        draftIndex: 0,
        title: payload.title,
        titleNeedsReview: payload.title_needs_review,
        needsReview: payload.needs_review,
        payload,
      },
    });
    return { ingestionId: ingestionRow.id, draft };
  }

  afterAll(async () => {
    for (const id of createdRecipeIds) {
      await prisma.recipe.deleteMany({ where: { id } });
    }
    for (const id of createdIngestionIds) {
      await prisma.documentIngestion.deleteMany({ where: { id } });
    }
    for (const id of createdAccountIds) {
      await prisma.account.deleteMany({ where: { id } });
    }
  });

  it('edits then confirms a draft into one normal recipe with the user-confirmed values', async () => {
    const actor = await newUserActor('bulk-confirm');
    const { ingestionId, draft } = await seedDraft(actor);

    await ingestion.updateDraft(actor, ingestionId, draft.id, CORRECTED as any);
    const confirmed = await ingestion.confirmDraft(actor, ingestionId, draft.id);
    expect(confirmed.status).toBe('confirmed');
    createdRecipeIds.push(confirmed.recipe_id);

    // The created recipe is a NORMAL recipe with the user's authoritative values.
    const recipe = await prisma.recipe.findUnique({ where: { id: confirmed.recipe_id } });
    expect(recipe?.title).toBe('Spicy Chicken Biryani');
    expect(recipe?.methodText).toContain('Garnish with coriander.');
    expect(recipe?.methodSourceTag).toBe('METHOD');

    const lines = await prisma.recipeIngredientLine.findMany({
      where: { recipeId: confirmed.recipe_id },
      orderBy: { lineNo: 'asc' },
    });
    expect(lines.map((l) => l.displayName)).toEqual(['chicken', 'red onions, thinly sliced']);
    expect(lines[1].amountText).toBe('3');
    expect(lines[1].sourceTag).toBe('CARD');

    // Provenance: the original extraction is untouched; the user edit is authoritative.
    const persisted = await prisma.documentRecipeDraft.findUnique({ where: { id: draft.id } });
    expect(persisted?.status).toBe('confirmed');
    expect(persisted?.recipeId).toBe(confirmed.recipe_id);
    expect((persisted?.payload as any).ingredients[1].name).toBe('onions');
    expect((persisted?.userPayload as any).ingredients[1].name).toBe('red onions');

    // Idempotency: a second confirm returns the same recipe — no duplicate.
    const again = await ingestion.confirmDraft(actor, ingestionId, draft.id);
    expect(again.recipe_id).toBe(confirmed.recipe_id);
    expect(again.status).toBe('already_confirmed');
    const count = await prisma.recipe.count({ where: { id: confirmed.recipe_id } });
    expect(count).toBe(1);
  });

  it('blocks confirmation while the draft still has unresolved review flags', async () => {
    const actor = await newUserActor('bulk-block');
    const { ingestionId, draft } = await seedDraft(actor); // onions.needs_review === true

    await expect(ingestion.confirmDraft(actor, ingestionId, draft.id)).rejects.toMatchObject({
      response: { code: 'UNRESOLVED_REVIEW' },
    });
    // No recipe was created, and the draft stays editable.
    expect(await prisma.recipe.count({ where: { accountId: actor.user.accountId } })).toBe(0);
    const persisted = await prisma.documentRecipeDraft.findUnique({ where: { id: draft.id } });
    expect(persisted?.status).toBe('draft');
  });

  it('404s (indistinguishably) for a foreign draft and creates nothing', async () => {
    const owner = await newUserActor('bulk-owner');
    const stranger = await newUserActor('bulk-stranger');
    const { ingestionId, draft } = await seedDraft(owner);

    await expect(
      ingestion.confirmDraft(stranger, ingestionId, draft.id),
    ).rejects.toMatchObject({ response: { code: 'INGESTION_NOT_FOUND' } });
    expect(await prisma.recipe.count({ where: { accountId: stranger.user.accountId } })).toBe(0);
  });

  it('accepts the extended Phase 3 ingestion statuses (migration 010 width regression)', async () => {
    const actor = await newUserActor('bulk-status');
    const { ingestionId } = await seedDraft(actor);
    // These writes previously failed with Postgres P2000 ("value too long").
    await prisma.documentIngestion.update({
      where: { id: ingestionId },
      data: { status: 'extracting_structure' },
    });
    await prisma.documentIngestion.update({
      where: { id: ingestionId },
      data: { status: 'extraction_failed', errorCode: 'INVALID_EXTRACTION' },
    });
    const row = await prisma.documentIngestion.findUnique({ where: { id: ingestionId } });
    expect(row?.status).toBe('extraction_failed');
  });
});
