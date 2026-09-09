// D-10 integration: real Postgres + real MinIO — the full intake path for paste and
// photo, golden two-fenugreek preservation, ownership enforcement, and QG4 evidence
// that a persisted photo URI always resolves to a live object (never dangling).
//
// DATABASE_URL is read at runtime from scripts/dev.sh (single source of dev env);
// nothing secret lives in this file. MinIO creds default to the compose dev values
// inside StorageService itself.

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
const { IntakeService, splitRawLines } = require('../../apps/api/src/modules/intake/intake.service');
const { RecipeService } = require('../../apps/api/src/modules/recipes/recipe.service');
const { StorageService } = require('../../apps/api/src/modules/intake/storage.service');

const GOLDEN_TEXT = [
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
].join('\n');

const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==',
  'base64',
);

describe('D-10 intake: real Postgres + real MinIO', () => {
  const recipes = new RecipeService(prisma);
  const intake = new IntakeService(prisma, recipes as any);
  const storage = new StorageService();
  const createdRecipeIds: string[] = [];
  const createdGuestIds: string[] = [];
  const uploadedKeys: string[] = [];

  async function newGuestActor() {
    const guest = await prisma.guestSession.create({
      data: { expiresAt: new Date(Date.now() + 3600_000) },
    });
    createdGuestIds.push(guest.id);
    return { kind: 'guest' as const, guestSessionId: guest.id, expiresAt: guest.expiresAt };
  }

  afterAll(async () => {
    for (const key of uploadedKeys) await storage.deleteObject(key);
    for (const id of createdRecipeIds) {
      await prisma.recipe.deleteMany({ where: { id } });
    }
    for (const id of createdGuestIds) {
      await prisma.guestSession.deleteMany({ where: { id } });
    }
  });

  it('paste: golden text → one immutable raw row + 11 draft lines, fenugreeks distinct (B1 TC-02)', async () => {
    const actor = await newGuestActor();
    const recipe = await recipes.createForIntake(actor, { rawText: GOLDEN_TEXT });
    createdRecipeIds.push(recipe.id);
    const input = await intake.recordPaste(actor, recipe.id, GOLDEN_TEXT);

    expect(input.inputType).toBe('paste');
    expect(input.rawText).toBe(GOLDEN_TEXT);

    const rows = await prisma.recipeInput.findMany({ where: { recipeId: recipe.id } });
    expect(rows).toHaveLength(1);

    const lines = await intake.listDraftLines(actor, recipe.id);
    expect(lines).toHaveLength(11);
    const fenugreeks = lines.filter((l) => /fenugreek/i.test(l.displayName));
    expect(fenugreeks.map((l) => l.displayName)).toEqual([
      'Fenugreek Powder — 1/2 Tsp',
      'Fenugreek — 1/4 Tsp',
    ]);
    expect(fenugreeks[0].shoppingKey).not.toBe(fenugreeks[1].shoppingKey);
    expect(lines.map((l) => l.lineNo)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(lines.every((l) => l.sourceTag === 'CARD')).toBe(true);
  });

  it('photo: upload → URI-only raw row; the persisted URI resolves to a live object (QG4)', async () => {
    await storage.ensureBucket(); // mirror the app's bootstrap (the running dev API does this; CI does not)
    const actor = await newGuestActor();
    const stored = await storage.uploadImage(TINY_JPEG, 'image/jpeg');
    uploadedKeys.push(stored.key);

    const recipe = await recipes.createForIntake(actor, { photoUri: stored.uri });
    createdRecipeIds.push(recipe.id);
    const input = await intake.recordPhoto(actor, recipe.id, stored.uri);

    expect(input.inputType).toBe('photo');
    expect(input.photoUri).toBe(stored.uri);
    expect(input.rawText).toBeNull();
    expect(stored.uri).toBe(`s3://recipe-assets/${stored.key}`);
    expect(await storage.objectExists(stored.key)).toBe(true); // URI is not dangling

    const row = await prisma.recipeInput.findUnique({ where: { id: input.id } });
    expect(row?.photoUri).toBe(stored.uri);
  });

  it('ownership: a different guest session cannot attach intake rows to a foreign recipe (INV-17)', async () => {
    const owner = await newGuestActor();
    const recipe = await recipes.createForIntake(owner, { rawText: 'Fish — 500g' });
    createdRecipeIds.push(recipe.id);
    await intake.recordPaste(owner, recipe.id, 'Fish — 500g');

    const intruder = await newGuestActor();
    await expect(intake.recordPaste(intruder, recipe.id, 'Garlic — 5')).rejects.toMatchObject({
      response: { code: 'RECIPE_NOT_FOUND' },
    });
    await expect(intake.listDraftLines(intruder, recipe.id)).rejects.toMatchObject({
      response: { code: 'RECIPE_NOT_FOUND' },
    });

    const rows = await prisma.recipeInput.findMany({ where: { recipeId: recipe.id } });
    expect(rows).toHaveLength(1); // intruder's attempt persisted nothing
  });

 it('regression: semicolon single-line paste → raw byte-for-byte + 8 ordered draft lines', async () => {
    const text = '1 lb ground beef; 1 onion, chopped; 2 cloves garlic; 1 can (28 oz) crushed tomatoes; 2 tbsp tomato paste; 1 tsp dried oregano; Salt & pepper to taste; Cook 1-2 hours, low heat.';
    const actor = await newGuestActor();
    const recipe = await recipes.createForIntake(actor, { rawText: text });
    createdRecipeIds.push(recipe.id);
    await intake.recordPaste(actor, recipe.id, text);

    const input = await prisma.recipeInput.findFirst({ where: { recipeId: recipe.id } });
    expect(input?.rawText).toBe(text);

    const lines = await prisma.recipeIngredientLine.findMany({
      where: { recipeId: recipe.id, deletedAt: null },
      orderBy: { lineNo: 'asc' },
    });
    expect(lines.map((l) => l.displayName)).toEqual([
      '1 lb ground beef',
      '1 onion, chopped',
      '2 cloves garlic',
      '1 can (28 oz) crushed tomatoes',
      '2 tbsp tomato paste',
      '1 tsp dried oregano',
      'Salt & pepper to taste',
      'Cook 1-2 hours, low heat.',
    ]);
  });
  it('splitRawLines preserves mixed units and vernacular names verbatim (B1 acceptance)', () => {
    expect(
      splitRawLines('Murungakkai — to taste\r\nChinna vengayam — 1/2 kg\r\nSalt — as required'),
    ).toEqual(['Murungakkai — to taste', 'Chinna vengayam — 1/2 kg', 'Salt — as required']);
  });
});



