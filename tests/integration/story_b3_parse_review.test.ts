// D-12 integration — story_b3_parse_review: the real Postgres path for the parse-review
// lifecycle on TEXT-originated draft lines (OCR channel deferred — HANDOFF §5 2026-09-09).
//
// Proves on the live schema:
//   - B3 TC-01: edit/add/delete/split/merge; the wrapped chilli/coriander line splits into
//     the two canonical lines; the corrected object reflects every operation
//   - B3 TC-02: headers marked non-ingredient are excluded from the corrected object
//   - B3 TC-03: raw recipe_input stays byte-unchanged through every review mutation
//   - golden invariant: the two fenugreek lines survive review as distinct rows
//   - vernacular/ambiguous text preserved verbatim
//   - D-12D: stale edits rejected on updated_at (409) with the current line
//   - D-12G: parse-preview status derives from needs_review (no new column)

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
const { IntakeService } = require('../../apps/api/src/modules/intake/intake.service');
const { RecipeService } = require('../../apps/api/src/modules/recipes/recipe.service');

const recipes = new RecipeService(prisma);
const intake = new IntakeService(prisma, recipes as any);

// The golden card as the PHOTO card would carry it: the chilli/coriander pair wrapped on
// one line (B3 acceptance scene) plus the two distinct fenugreek lines.
const WRAPPED_GOLDEN = [
  'Fish — 500g',
  'Drumstick — 1 Nos',
  'Mango — 1/2 Nos',
  'Grated Coconut — Half Shell',
  'Coconut Oil — For Tempering',
  'Chilli — 5 Nos',
  'Chilli Powder — 2 Tsp Coriander Powder — 1 Tsp', // wrapped (photo artifact)
  'Tamarind — A Lemon Size',
  'Fenugreek Powder — 1/2 Tsp',
  'Fenugreek — 1/4 Tsp',
].join('\n');

const GOLDEN_LINES = [
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

describe('D-12 parse review (text scope) — real Postgres', () => {
  const createdRecipeIds: string[] = [];
  const createdAccountIds: string[] = [];
  const accountEmails: string[] = [];

  async function newUserActor(prefix: string) {
    const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.dev`;
    const account = await prisma.account.create({
      data: { email, authProvider: 'sso', preferredMode: 'home' },
    });
    createdAccountIds.push(account.id);
    accountEmails.push(email);
    return {
      kind: 'user' as const,
      user: { accountId: account.id, email: account.email, sub: 'integration-b3' },
    };
  }

  async function pasteGolden(actor: any) {
    const recipe = await recipes.createForIntake(actor, { rawText: WRAPPED_GOLDEN });
    createdRecipeIds.push(recipe.id);
    await intake.recordPaste(actor, recipe.id, WRAPPED_GOLDEN);
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

  it('TC-01: split the wrapped chilli/coriander line → corrected object = the 11 canonical lines (B3)', async () => {
    const actor = await newUserActor('b3-split');
    const recipeId = await pasteGolden(actor);

    const wrapped = (await intake.listDraftLines(actor, recipeId)).find((l) =>
      l.displayName.includes('Coriander Powder'),
    )!;
    expect(wrapped.displayName).toBe('Chilli Powder — 2 Tsp Coriander Powder — 1 Tsp');

    const splitPoint = wrapped.displayName.indexOf(' Coriander') + 1;
    const [l1, l2] = await intake.splitLine(
      actor,
      recipeId,
      wrapped.id,
      splitPoint,
      wrapped.updatedAt.toISOString(),
    );
    expect(l1.displayName).toBe('Chilli Powder — 2 Tsp');
    expect(l2.displayName).toBe('Coriander Powder — 1 Tsp');
    expect(l1.shoppingKey).not.toBe(wrapped.shoppingKey);
    expect(l2.shoppingKey).not.toBe(wrapped.shoppingKey);
    expect(l1.shoppingKey).not.toBe(l2.shoppingKey); // C-39: never reused

    const corrected = (await intake.listDraftLines(actor, recipeId)).map((l) => l.displayName);
    expect(corrected).toEqual(GOLDEN_LINES); // order preserved, headers none, both fenugreeks distinct
  });

  it('TC-03: raw recipe_input is byte-unchanged through split + edit + delete + merge', async () => {
    const actor = await newUserActor('b3-raw');
    const recipeId = await pasteGolden(actor);

    const rawBefore = await prisma.recipeInput.findFirst({ where: { recipeId } });
    expect(rawBefore.rawText).toBe(WRAPPED_GOLDEN);

    const lines = await intake.listDraftLines(actor, recipeId);
    const fish = lines.find((l) => l.displayName.startsWith('Fish'))!;

    // edit
    await intake.updateLine(
      actor,
      recipeId,
      fish.id,
      { displayName: 'Fish — 500 g', amountText: '500 g', amount: 500, unit: 'g', confirmedSense: 'fish' },
      fish.updatedAt.toISOString(),
    );
    // add
    await intake.addLine(actor, recipeId, { displayName: 'Curry Leaves — a handful' });
    // delete (soft) — the drumstick line
    const drumstick = (await intake.listDraftLines(actor, recipeId)).find((l) =>
      l.displayName.startsWith('Drumstick'),
    )!;
    await intake.softDeleteLine(actor, recipeId, drumstick.id);
    // merge — mango into grated coconut
    const mango = (await intake.listDraftLines(actor, recipeId)).find((l) =>
      l.displayName.startsWith('Mango'),
    )!;
    await intake.mergeWithNext(actor, recipeId, mango.id, mango.updatedAt.toISOString());

    const rawAfter = await prisma.recipeInput.findFirst({ where: { recipeId } });
    expect(rawAfter.rawText).toBe(WRAPPED_GOLDEN); // byte-unchanged, every step
  });

  it('TC-02: a marked header is excluded from the corrected object; the two fenugreeks survive review intact', async () => {
    const actor = await newUserActor('b3-header');
    const recipe = await recipes.createForIntake(actor, { rawText: null });
    createdRecipeIds.push(recipe.id);
    const textWithHeader = [
      'For the marinade:',
      'Fish — 500g',
      'Fenugreek Powder — 1/2 Tsp',
      'Fenugreek — 1/4 Tsp',
      'For tempering:',
      'Coconut Oil — For Tempering',
    ].join('\n');
    await intake.recordPaste(actor, recipe.id, textWithHeader);

    const lines = await intake.listDraftLines(actor, recipe.id);
    const marinade = lines.find((l) => l.displayName === 'For the marinade:')!;
    const tempering = lines.find((l) => l.displayName === 'For tempering:')!;

    await intake.markHeader(actor, recipe.id, marinade.id, marinade.updatedAt.toISOString());
    await intake.markHeader(actor, recipe.id, tempering.id, tempering.updatedAt.toISOString());

    // edit the fish line afterwards — review session continues around the exclusion
    const fish = (await intake.listDraftLines(actor, recipe.id)).find((l) =>
      l.displayName.startsWith('Fish'),
    )!;
    await intake.updateLine(
      actor,
      recipe.id,
      fish.id,
      { confirmedSense: 'fish' },
      fish.updatedAt.toISOString(),
    );

    const corrected = (await intake.listDraftLines(actor, recipe.id)).map((l) => l.displayName);
    expect(corrected).not.toContain('For the marinade:');
    expect(corrected).not.toContain('For tempering:');
    expect(corrected.filter((d) => /fenugreek/i.test(d))).toEqual([
      'Fenugreek Powder — 1/2 Tsp',
      'Fenugreek — 1/4 Tsp',
    ]);

    const raw = await prisma.recipeInput.findFirst({ where: { recipeId: recipe.id } });
    expect(raw.rawText).toBe(textWithHeader); // headers preserved in the raw record
  });

  it('D-12D: stale edit → 409 STALE_EDIT with current line; fresh token succeeds (QG4 cell)', async () => {
    const actor = await newUserActor('b3-stale');
    const recipeId = await pasteGolden(actor);

    const fish = (await intake.listDraftLines(actor, recipeId)).find((l) =>
      l.displayName.startsWith('Fish'),
    )!;
    const originalToken = fish.updatedAt.toISOString();

    // First edit succeeds (bumps updated_at).
    await intake.updateLine(
      actor,
      recipeId,
      fish.id,
      { displayName: 'Fish — 500 gm' },
      originalToken,
    );

    // Second edit with the OLD token must be rejected.
    try {
      await intake.updateLine(actor, recipeId, fish.id, { displayName: 'Fish — 1 kg' }, originalToken);
      fail('expected stale-edit rejection');
    } catch (err: any) {
      expect(err.constructor.name).toBe('ConflictException');
      expect(err.response.code).toBe('STALE_EDIT');
      expect(err.response.details.current_line.id).toBe(fish.id);
      expect(err.response.details.current_line.display_name).toBe('Fish — 500 gm');
    }

    // Reload → fresh token → succeeds (reload/merge recovery path).
    const reloaded = (await intake.listDraftLines(actor, recipeId)).find((l) => l.id === fish.id)!;
    const updated = await intake.updateLine(
      actor,
      recipeId,
      fish.id,
      { displayName: 'Fish — 1 kg' },
      reloaded.updatedAt.toISOString(),
    );
    expect(updated.displayName).toBe('Fish — 1 kg');
  });

  it('D-12F: merge concatenates verbatim and preserves order (merge roundtrip after split)', async () => {
    const actor = await newUserActor('b3-merge');
    const recipeId = await pasteGolden(actor);

    const wrapped = (await intake.listDraftLines(actor, recipeId)).find((l) =>
      l.displayName.includes('Coriander Powder'),
    )!;
    const splitPoint = wrapped.displayName.indexOf(' Coriander') + 1;
    await intake.splitLine(actor, recipeId, wrapped.id, splitPoint, wrapped.updatedAt.toISOString());

    const chilli = (await intake.listDraftLines(actor, recipeId)).find((l) =>
      l.displayName === 'Chilli Powder — 2 Tsp',
    )!;
    const merged = await intake.mergeWithNext(
      actor,
      recipeId,
      chilli.id,
      chilli.updatedAt.toISOString(),
    );
    expect(merged.displayName).toBe('Chilli Powder — 2 Tsp Coriander Powder — 1 Tsp');

    const names = (await intake.listDraftLines(actor, recipeId)).map((l) => l.displayName);
    expect(names.filter((n) => n === merged.displayName)).toHaveLength(1); // exactly one merged row
    expect(names).toHaveLength(10); // 10 wrapped lines → 11 after split → 10 after merge
  });

  it('vernacular + ambiguous text is preserved verbatim through review edits (B1 + §12)', async () => {
    const actor = await newUserActor('b3-vernacular');
    const recipe = await recipes.createForIntake(actor, { rawText: null });
    createdRecipeIds.push(recipe.id);
    const vernacular = [
      'Murungakkai — 2 nos',
      'Chinna vengayam — to taste',
      'Perungayam — a pinch',
      'Thenga paal — 1 cup',
    ].join('\n');
    await intake.recordPaste(actor, recipe.id, vernacular);

    // review: edit one line, add one, delete one — the others stay byte-identical
    const first = (await intake.listDraftLines(actor, recipe.id))[0];
    await intake.updateLine(
      actor,
      recipe.id,
      first.id,
      { confirmedSense: 'drumstick (moringa)' },
      first.updatedAt.toISOString(),
    );
    await intake.addLine(actor, recipe.id, { displayName: 'Kadugu — 1 tsp' });
    const pinch = (await intake.listDraftLines(actor, recipe.id)).find((l) =>
      l.displayName.includes('Perungayam'),
    )!;
    await intake.softDeleteLine(actor, recipe.id, pinch.id);

    const names = (await intake.listDraftLines(actor, recipe.id)).map((l) => l.displayName);
    expect(names).toContain('Murungakkai — 2 nos');
    expect(names).toContain('Chinna vengayam — to taste');
    expect(names).toContain('Thenga paal — 1 cup');
    expect(names).toContain('Kadugu — 1 tsp');
    expect(names).not.toContain('Perungayam — a pinch');
  });

  it('D-12G: parse-preview is confirmed for a clean text draft', async () => {
    const actor = await newUserActor('b3-preview');
    const recipeId = await pasteGolden(actor);
    const preview = await intake.parsePreview(actor, recipeId);
    expect(preview.status).toBe('confirmed');
    expect(preview.lines).toHaveLength(10); // the wrapped paste, unreviewed
  });

  it('INV-17: a foreign actor cannot see or touch the lines (404 both reads and writes)', async () => {
    const owner = await newUserActor('b3-owner');
    const foreign = await newUserActor('b3-foreign');
    const recipeId = await pasteGolden(owner);
    const line = (await intake.listDraftLines(owner, recipeId))[0];

    await expect(intake.listDraftLines(foreign, recipeId)).rejects.toThrow('Recipe not found');
    await expect(
      intake.updateLine(foreign, recipeId, line.id, { displayName: 'X' }, line.updatedAt.toISOString()),
    ).rejects.toThrow('Recipe not found');
    await expect(intake.softDeleteLine(foreign, recipeId, line.id)).rejects.toThrow('Recipe not found');
  });
});
