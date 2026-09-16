import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@recipe-systems/database';
import type { Actor } from '../../common/guards/guest-or-jwt.guard';
import {
  buildResolutionMap,
  formRawText,
  IntakeService,
  splitRawLines,
  toWireLine,
  toWireLineResolved,
} from './intake.service';
import type { RecipeService } from '../recipes/recipe.service';

const userActor: Actor = {
  kind: 'user',
  user: { accountId: 'acc-1', email: 'chef@test.dev', sub: 's1' },
};
const guestActor: Actor = { kind: 'guest', guestSessionId: 'gs-1', expiresAt: new Date() };

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

function mockPrisma(recipeService?: Partial<RecipeService>) {
  const recipes = {
    assertOwned: jest.fn().mockResolvedValue({ id: 'r1' }),
    ...recipeService,
  };
  const prisma: any = {
    recipeInput: { create: jest.fn() },
    recipeIngredientLine: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
    },
    ingredientAlias: { findMany: jest.fn().mockResolvedValue([]) },
    ingredientDictionary: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(async (fnOrArray: any) => {
      if (Array.isArray(fnOrArray)) return Promise.all(fnOrArray);
      return fnOrArray(prisma);
    }),
  };
  return { prisma, recipes: recipes as unknown as RecipeService };
}

/** A realistic active draft line for review-method mocks. */
function mockLine(overrides: Record<string, unknown> = {}) {
  return {
    id: 'l1',
    recipeId: 'r1',
    shoppingKey: 'sk-1',
    lineNo: 1,
    displayName: 'Fish — 500g',
    amount: null,
    amountText: null,
    unit: null,
    groupName: null,
    confirmedSense: null,
    includeOnList: true,
    sourceTag: 'CARD',
    needsReview: false,
    ocrConfidence: null,
    updatedAt: new Date('2026-09-09T10:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

const SEMICOLON_PASTE = "1 lb ground beef; 1 onion, chopped; 2 cloves garlic; 1 can (28 oz) crushed tomatoes; 2 tbsp tomato paste; 1 tsp dried oregano; Salt & pepper to taste; Cook 1-2 hours, low heat.";

describe('splitRawLines (B1 raw-text handling)', () => {
  it('splits CRLF and LF, trims, and drops empty lines', () => {
    expect(splitRawLines('A\r\n\n  B  \r\n\n')).toEqual(['A', 'B']);
  });

  it('preserves mixed units, "to taste", and vernacular names verbatim', () => {
    const text = 'Murungakkai — to taste\nSalt — as required\nChinna vengayam — 10 nos';
    expect(splitRawLines(text)).toEqual([
      'Murungakkai — to taste',
      'Salt — as required',
      'Chinna vengayam — 10 nos',
    ]);
  });

  it('regression: a single-line semicolon-separated paste segments into distinct draft lines', () => {
    expect(splitRawLines(SEMICOLON_PASTE)).toEqual([
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

  it('never combines adjacent semicolon-delimited clauses and preserves order', () => {
    const result = splitRawLines('A; B;;  C ; D');
    expect(result).toEqual(['A', 'B', 'C', 'D']);
  });

  it('mixes newlines and semicolons without dropping or merging clauses', () => {
    expect(splitRawLines('A; B\nC\nD; E\n')).toEqual(['A', 'B', 'C', 'D', 'E']);
  });
});

describe('IntakeService — D-10 intake', () => {
  it('regression: semicolon paste keeps raw_text byte-for-byte and creates one line per clause', async () => {
    const { prisma, recipes } = mockPrisma();
    prisma.recipeInput.create.mockResolvedValue({ id: 'in1' });
    prisma.recipeIngredientLine.create.mockResolvedValue({ id: 'l1' });
    const svc = new IntakeService(prisma, recipes);
    await svc.recordPaste(userActor, 'r1', SEMICOLON_PASTE);
    // raw input NEVER mutated: the stored text is the original string
    expect(prisma.recipeInput.create).toHaveBeenCalledWith({
      data: { recipeId: 'r1', inputType: 'paste', rawText: SEMICOLON_PASTE },
    });
    // 8 clauses → 8 draft lines, in order
    expect(prisma.recipeIngredientLine.create).toHaveBeenCalledTimes(8);
    const names = prisma.recipeIngredientLine.create.mock.calls.map(
      (c: Array<{ data: { displayName: string } }>) => c[0].data.displayName,
    );
    expect(names).toEqual([
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

  it('recordPaste persists an immutable raw paste row and one draft line per raw line', async () => {
    const { prisma, recipes } = mockPrisma();
    prisma.recipeInput.create.mockResolvedValue({ id: 'in1' });
    prisma.recipeIngredientLine.create.mockResolvedValue({ id: 'l1' });
    const svc = new IntakeService(prisma, recipes);
    await svc.recordPaste(userActor, 'r1', GOLDEN_TEXT);
    expect(recipes.assertOwned).toHaveBeenCalledWith(userActor, 'r1');
    expect(prisma.recipeInput.create).toHaveBeenCalledWith({
      data: { recipeId: 'r1', inputType: 'paste', rawText: GOLDEN_TEXT },
    });
    expect(prisma.recipeIngredientLine.create).toHaveBeenCalledTimes(11);
    const firstCall = prisma.recipeIngredientLine.create.mock.calls[0][0].data;
    expect(firstCall).toEqual(
      expect.objectContaining({
        recipeId: 'r1',
        lineNo: 1,
        displayName: 'Fish — 500g',
        sourceTag: 'CARD',
        needsReview: false,
        includeOnList: true,
      }),
    );
  });

  it('keeps the two fenugreek lines as DISTINCT draft rows (B1 TC-02 golden invariant)', async () => {
    const { prisma, recipes } = mockPrisma();
    prisma.recipeInput.create.mockResolvedValue({ id: 'in1' });
    prisma.recipeIngredientLine.create.mockResolvedValue({ id: 'l1' });
    const svc = new IntakeService(prisma, recipes);
    await svc.recordPaste(userActor, 'r1', GOLDEN_TEXT);
    const displayNames = prisma.recipeIngredientLine.create.mock.calls.map(
      (c: any) => c[0].data.displayName,
    );
    const fenugreeks = displayNames.filter((d: string) => /fenugreek/i.test(d));
    expect(fenugreeks).toEqual(['Fenugreek Powder — 1/2 Tsp', 'Fenugreek — 1/4 Tsp']);
    const shoppingKeys = prisma.recipeIngredientLine.create.mock.calls.map(
      (c: any) => c[0].data.shoppingKey,
    );
    expect(new Set(shoppingKeys).size).toBe(11); // every draft row gets its own shopping_key
  });

  it('recordPhoto stores the URI only — never a blob (ADR §3)', async () => {
    const { prisma, recipes } = mockPrisma();
    prisma.recipeInput.create.mockResolvedValue({ id: 'in2' });
    const svc = new IntakeService(prisma, recipes);
    await svc.recordPhoto(userActor, 'r1', 's3://recipe-assets/recipes/x.jpg');
    expect(prisma.recipeInput.create).toHaveBeenCalledWith({
      data: { recipeId: 'r1', inputType: 'photo', photoUri: 's3://recipe-assets/recipes/x.jpg' },
    });
  });

  it('recordForm persists a form-typed raw row (B5 — same object as paste/photo)', async () => {
    const { prisma, recipes } = mockPrisma();
    prisma.recipeInput.create.mockResolvedValue({ id: 'in3' });
    const svc = new IntakeService(prisma, recipes);
    await svc.recordForm(userActor, 'r1', 'Fish — 500g');
    expect(prisma.recipeInput.create).toHaveBeenCalledWith({
      data: { recipeId: 'r1', inputType: 'form', rawText: 'Fish — 500g' },
    });
  });

  it('recordFormLines (D-10A B5) persists a form-typed raw row + one draft line per structured entry', async () => {
    const { prisma, recipes } = mockPrisma();
    prisma.recipeInput.create.mockResolvedValue({ id: 'in5' });
    prisma.recipeIngredientLine.create.mockImplementation(async ({ data }: any) => ({ id: 'l1', ...data }));
    const svc = new IntakeService(prisma, recipes);

    const input = await svc.recordFormLines(userActor, 'r1', [
      { displayName: 'Fish', amountText: '500g', unit: 'g', amount: 500, groupName: 'fish_meat' },
      { displayName: 'Salt', amountText: 'to taste' },
    ]);

    expect(input.id).toBe('in5');
    // B5 AC-1: same object path as paste — one recipe_input (form-typed) + draft lines.
    expect(prisma.recipeInput.create).toHaveBeenCalledWith({
      data: { recipeId: 'r1', inputType: 'form', rawText: 'Fish — 500g\nSalt — to taste' },
    });
    expect(prisma.recipeIngredientLine.create).toHaveBeenCalledTimes(2);
    const [first, second] = prisma.recipeIngredientLine.create.mock.calls.map((c: any[]) => c[0]);
    expect(first.data).toEqual(
      expect.objectContaining({
        recipeId: 'r1',
        lineNo: 1,
        displayName: 'Fish',
        amountText: '500g',
        unit: 'g',
        amount: 500,
        groupName: 'fish_meat',
        sourceTag: 'CARD',
        needsReview: false,
        includeOnList: true,
      }),
    );
    expect(second.data).toEqual(
      expect.objectContaining({
        lineNo: 2,
        displayName: 'Salt',
        amountText: 'to taste',
        unit: null,
        amount: null,
        groupName: null,
      }),
    );
  });

  it('formRawText renders one "Name — Amount" line per entry (B5 AC-2 free-text units)', () => {
    expect(
      formRawText([
        { displayName: 'Fish', amountText: '500g' },
        { displayName: 'Tamarind', amountText: 'A Lemon Size' },
        { displayName: 'Salt', amountText: 'to taste' },
        { displayName: 'Coconut', amountText: 'half shell' },
      ]),
    ).toBe('Fish — 500g\nTamarind — A Lemon Size\nSalt — to taste\nCoconut — half shell');
  });

  it('refuses to write intake rows for a recipe the actor does not own (D-10 ownership)', async () => {
    const { prisma } = mockPrisma();
    const foreign = {
      assertOwned: jest.fn().mockRejectedValue(new Error('Recipe not found')),
    } as unknown as RecipeService;
    const svc = new IntakeService(prisma, foreign);
    await expect(svc.recordPaste(guestActor, 'r1', 'Fish')).rejects.toThrow('Recipe not found');
    expect(prisma.recipeInput.create).not.toHaveBeenCalled();
  });

  it('IMMUTABILITY (D-10): recipe_input is write-once — even the D-12 line mutators never touch it', async () => {
    const { prisma, recipes } = mockPrisma();
    prisma.recipeIngredientLine.findFirst.mockResolvedValue(mockLine());
    prisma.recipeIngredientLine.update.mockResolvedValue(mockLine());
    const svc = new IntakeService(prisma, recipes);
    // The service exposes line mutation methods (D-12) — but recipe_input stays create-only.
    const methodNames = Object.getOwnPropertyNames(IntakeService.prototype).filter(
      (n) => n !== 'constructor',
    );
    expect(methodNames).toEqual(expect.arrayContaining(['recordPaste', 'recordPhoto', 'recordForm']));
    await svc.softDeleteLine(userActor, 'r1', 'l1');
    // Only recipeIngredientLine.update was used; recipeInput has no update/delete surface at all.
    expect(prisma.recipeIngredientLine.update).toHaveBeenCalled();
    expect(prisma.recipeInput).not.toHaveProperty('update');
    expect(prisma.recipeInput).not.toHaveProperty('delete');
    expect(prisma.recipeInput).not.toHaveProperty('upsert');
  });

  it('listDraftLines returns non-deleted lines in card order', async () => {
    const { prisma, recipes } = mockPrisma();
    prisma.recipeIngredientLine.findMany.mockResolvedValue([{ id: 'l1' }, { id: 'l2' }]);
    const svc = new IntakeService(prisma, recipes);
    const lines = await svc.listDraftLines(userActor, 'r1');
    expect(prisma.recipeIngredientLine.findMany).toHaveBeenCalledWith({
      where: { recipeId: 'r1', deletedAt: null },
      orderBy: { lineNo: 'asc' },
    });
    expect(lines).toHaveLength(2);
  });
});

describe('toWireLine (API §3 wire shape + D-12B)', () => {
  it('maps real review fields; id + updated_at present (stale-edit token)', () => {
    const updatedAt = new Date('2026-09-09T10:00:00.000Z');
    expect(
      toWireLine({
        id: 'l1',
        displayName: 'Fish — 500g',
        amountText: '500g',
        amount: { toString: () => '500' } as any,
        unit: 'g',
        groupName: 'fish_meat',
        confirmedSense: 'fish',
        includeOnList: true,
        updatedAt,
      } as any),
    ).toEqual({
      id: 'l1',
      display_name: 'Fish — 500g',
      canonical_name: null, // dictionary lands at D-29
      requires_confirmation: false,
      amount: '500g',
      unit: 'g',
      quantity: 500,
      category: 'fish_meat',
      is_header: false, // headers never appear in the corrected object (D-12C)
      include_on_list: true,
      confirmed_sense: 'fish',
      ocr_confidence: null,
      source_tag: null,
      updated_at: '2026-09-09T10:00:00.000Z',
    });
  });

  it('unparsed draft maps to nulls and a true include_on_list default', () => {
    const wire = toWireLine({
      id: 'l2',
      displayName: 'Murungakkai — to taste',
      amount: null,
      amountText: null,
      unit: null,
      groupName: null,
      confirmedSense: null,
      includeOnList: true,
      updatedAt: new Date('2026-09-09T10:00:00.000Z'),
    } as any);
    expect(wire.quantity).toBeNull();
    expect(wire.amount).toBeNull();
    expect(wire.confirmed_sense).toBeNull();
    expect(wire.display_name).toBe('Murungakkai — to taste');
  });

  it('carries needs_review on the wire (QA-B6: the D-14 Clear-review surface depends on it)', () => {
    expect(
      toWireLine({
        id: 'l3',
        displayName: 'Water — 2 cups',
        amount: null,
        amountText: null,
        unit: null,
        groupName: null,
        confirmedSense: null,
        includeOnList: true,
        needsReview: true,
        updatedAt: new Date('2026-09-09T10:00:00.000Z'),
      } as any).needs_review,
    ).toBe(true);
  });
});

describe('IntakeService — D-25 B6 alias resolution (read-only dictionary/alias)', () => {
  const aliases = [
    { aliasText: 'methi', requiresConfirmation: false, ingredient: { canonicalName: 'fenugreek_seed' } },
    { aliasText: 'uluva', requiresConfirmation: false, ingredient: { canonicalName: 'fenugreek_seed' } },
    { aliasText: 'vendhayam', requiresConfirmation: false, ingredient: { canonicalName: 'fenugreek_seed' } },
    { aliasText: 'fenugreek', requiresConfirmation: false, ingredient: { canonicalName: 'fenugreek_seed' } },
    { aliasText: 'moringa', requiresConfirmation: false, ingredient: { canonicalName: 'drumstick' } },
    { aliasText: 'murungakkai', requiresConfirmation: false, ingredient: { canonicalName: 'drumstick' } },
    { aliasText: 'drumstick', requiresConfirmation: true, ingredient: { canonicalName: 'drumstick' } },
    { aliasText: 'puli', requiresConfirmation: false, ingredient: { canonicalName: 'tamarind' } },
    { aliasText: 'chinna vengayam', requiresConfirmation: false, ingredient: { canonicalName: 'shallots' } },
    { aliasText: 'cheriya ulli', requiresConfirmation: false, ingredient: { canonicalName: 'shallots' } },
    { aliasText: 'karuveppilai', requiresConfirmation: false, ingredient: { canonicalName: 'curry_leaves' } },
  ];
  const canonicals = [
    { canonicalName: 'fish' },
    { canonicalName: 'drumstick' },
    { canonicalName: 'tamarind' },
    { canonicalName: 'fenugreek_seed' },
    { canonicalName: 'fenugreek_powder' },
    { canonicalName: 'shallots' },
    { canonicalName: 'curry_leaves' },
  ];
  const map = buildResolutionMap(aliases, canonicals);

  function line(displayName: string) {
    return {
      id: 'x',
      displayName,
      amountText: null,
      amount: null,
      unit: null,
      groupName: null,
      confirmedSense: null,
      includeOnList: true,
      needsReview: false,
      updatedAt: new Date('2026-09-09T10:00:00.000Z'),
    } as any;
  }

  it('resolves the five B6 groups to their canonical (TC-01)', () => {
    const cases: Array<[string, string]> = [
      ['murungakkai — 2 nos', 'drumstick'],
      ['moringa — 2 pods', 'drumstick'],
      ['chinna vengayam — 8 nos', 'shallots'],
      ['cheriya ulli — 8 nos', 'shallots'],
      ['shallots — 8 nos', 'shallots'],
      ['uluva — 1/4 tsp', 'fenugreek_seed'],
      ['vendhayam — 1/4 tsp', 'fenugreek_seed'],
      ['fenugreek — 1/4 tsp', 'fenugreek_seed'],
      ['fenugreek powder — 1/2 tsp', 'fenugreek_powder'],
      ['puli — a lemon size', 'tamarind'],
      ['tamarind — a lemon size', 'tamarind'],
      ['karuveppilai — a sprig', 'curry_leaves'],
      ['curry leaves — a sprig', 'curry_leaves'],
      ['fish — 500g', 'fish'],
    ];
    for (const [displayName, expected] of cases) {
      expect(toWireLineResolved(line(displayName), map).canonical_name).toBe(expected);
    }
  });

  it('ambiguous "drumstick" asks for confirmation; moringa/murungakkai do not (TC-02)', () => {
    const ambiguous = toWireLineResolved(line('drumstick — 1 nos'), map);
    expect(ambiguous.canonical_name).toBe('drumstick');
    expect(ambiguous.requires_confirmation).toBe(true);

    expect(toWireLineResolved(line('murungakkai — 1 nos'), map).requires_confirmation).toBe(false);
    expect(toWireLineResolved(line('moringa — 1 nos'), map).requires_confirmation).toBe(false);
  });

  it('leaves canonical_name null for an unresolvable line', () => {
    const wire = toWireLineResolved(line('unknown spice — to taste'), map);
    expect(wire.canonical_name).toBeNull();
    expect(wire.requires_confirmation).toBe(false);
  });
});

describe('IntakeService — D-12 parse review (text scope)', () => {
  it('updateLine applies review fields and returns the updated line (B3 AC-1)', async () => {
    const { prisma, recipes } = mockPrisma();
    const line = mockLine();
    prisma.recipeIngredientLine.findFirst.mockResolvedValue(line);
    prisma.recipeIngredientLine.update.mockResolvedValue({ ...line, displayName: 'Fish — 500 gm' });
    const svc = new IntakeService(prisma, recipes);
    const updated = await svc.updateLine(
      userActor,
      'r1',
      'l1',
      { displayName: 'Fish — 500 gm', amountText: '500g', amount: 500, unit: 'g', confirmedSense: 'fish' },
      line.updatedAt.toISOString(),
    );
    expect(updated.displayName).toBe('Fish — 500 gm');
    const updateCall = prisma.recipeIngredientLine.update.mock.calls[0][0];
    expect(updateCall.where).toEqual({ id: 'l1' });
    expect(updateCall.data.displayName).toBe('Fish — 500 gm');
    expect(updateCall.data.amountText).toBe('500g');
    expect(updateCall.data.unit).toBe('g');
    expect(updateCall.data.confirmedSense).toBe('fish');
    expect(updateCall.data.amount).toBeInstanceOf(Prisma.Decimal);
  });

  it('updateLine rejects a stale edit with 409 STALE_EDIT + current line (D-12D)', async () => {
    const { prisma, recipes } = mockPrisma();
    const line = mockLine();
    prisma.recipeIngredientLine.findFirst.mockResolvedValue(line);
    const svc = new IntakeService(prisma, recipes);
    const stale = new Date(line.updatedAt.getTime() - 60_000).toISOString();
    try {
      await svc.updateLine(userActor, 'r1', 'l1', { displayName: 'X' }, stale);
      fail('expected ConflictException');
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictException);
      expect((err as any).response.code).toBe('STALE_EDIT');
      expect((err as any).response.details.current_line.id).toBe('l1');
    }
    expect(prisma.recipeIngredientLine.update).not.toHaveBeenCalled();
  });

  it('markHeader soft-deletes the line (D-12C — no header column; excluded from corrected object)', async () => {
    const { prisma, recipes } = mockPrisma();
    const line = mockLine({ displayName: 'For the marinade:' });
    prisma.recipeIngredientLine.findFirst.mockResolvedValue(line);
    prisma.recipeIngredientLine.update.mockResolvedValue({ ...line, deletedAt: new Date() });
    const svc = new IntakeService(prisma, recipes);
    await svc.markHeader(userActor, 'r1', 'l1', line.updatedAt.toISOString());
    const call = prisma.recipeIngredientLine.update.mock.calls[0][0];
    expect(call.data.deletedAt).toBeInstanceOf(Date);
  });

  it('softDeleteLine 404s for a missing or foreign line (INV-17 shape)', async () => {
    const { prisma, recipes } = mockPrisma();
    prisma.recipeIngredientLine.findFirst.mockResolvedValue(null);
    const svc = new IntakeService(prisma, recipes);
    try {
      await svc.softDeleteLine(userActor, 'r1', 'nope');
      fail('expected NotFoundException');
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as any).response.code).toBe('LINE_NOT_FOUND');
    }
  });

  it('splitLine splits at the point, soft-deletes the original, shifts downstream, new shopping_keys (D-12E)', async () => {
    const { prisma, recipes } = mockPrisma();
    const original = mockLine({ displayName: 'Chilli Powder — 2 Tsp Coriander Powder — 1 Tsp' });
    prisma.recipeIngredientLine.findFirst.mockResolvedValue(original);
    prisma.recipeIngredientLine.findMany.mockResolvedValue([{ id: 'dn', lineNo: 9 }]);
    prisma.recipeIngredientLine.update.mockResolvedValue({ id: 'orig' });
    prisma.recipeIngredientLine.create
      .mockResolvedValueOnce({ id: 'n1', displayName: 'Chilli Powder — 2 Tsp' })
      .mockResolvedValueOnce({ id: 'n2', displayName: 'Coriander Powder — 1 Tsp' });
    const svc = new IntakeService(prisma, recipes);
    const splitPoint = original.displayName.indexOf(' Coriander') + 1; // 'C' of Coriander
    const [l1, l2] = await svc.splitLine(userActor, 'r1', 'l1', splitPoint, original.updatedAt.toISOString());
    expect(l1.displayName).toBe('Chilli Powder — 2 Tsp');
    expect(l2.displayName).toBe('Coriander Powder — 1 Tsp');
    // original soft-deleted
    const softDelete = prisma.recipeIngredientLine.update.mock.calls.find(
      (c: any) => c[0].where.id === 'l1',
    );
    expect(softDelete[0].data.deletedAt).toBeInstanceOf(Date);
    // downstream shifted +1 in desc order
    expect(prisma.recipeIngredientLine.findMany).toHaveBeenCalledWith({
      where: { recipeId: 'r1', deletedAt: null, lineNo: { gt: original.lineNo } },
      orderBy: { lineNo: 'desc' },
    });
    expect(prisma.recipeIngredientLine.update.mock.calls.some(
      (c: any) => c[0].where.id === 'dn' && c[0].data.lineNo === 10,
    )).toBe(true);
    // two fresh lines at the original position with NEW shopping keys
    const creates = prisma.recipeIngredientLine.create.mock.calls.map((c: any) => c[0].data);
    expect(creates[0]).toEqual(
      expect.objectContaining({ lineNo: original.lineNo, displayName: 'Chilli Powder — 2 Tsp', needsReview: original.needsReview, includeOnList: original.includeOnList }),
    );
    expect(creates[1]).toEqual(
      expect.objectContaining({ lineNo: original.lineNo + 1, displayName: 'Coriander Powder — 1 Tsp' }),
    );
    expect(creates[0].shoppingKey).not.toBe(original.shoppingKey);
    expect(new Set([creates[0].shoppingKey, creates[1].shoppingKey, original.shoppingKey]).size).toBe(3);
  });

  it('splitLine rejects a split that leaves an empty half (D-12E validation)', async () => {
    const { prisma, recipes } = mockPrisma();
    const original = mockLine({ displayName: 'Fish — 500g' });
    prisma.recipeIngredientLine.findFirst.mockResolvedValue(original);
    const svc = new IntakeService(prisma, recipes);
    await expect(
      svc.splitLine(userActor, 'r1', 'l1', 11, original.updatedAt.toISOString()), // == length → empty second half
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.splitLine(userActor, 'r1', 'l1', 0, original.updatedAt.toISOString()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('mergeWithNext concatenates, soft-deletes both, ORs needs_review, shifts −1 (D-12F)', async () => {
    const { prisma, recipes } = mockPrisma();
    const line = mockLine({ id: 'l1', lineNo: 3, displayName: 'Chilli Powder — 2 Tsp', needsReview: false });
    const next = { ...mockLine({ id: 'l2', lineNo: 4, displayName: 'Coriander Powder — 1 Tsp' }), needsReview: true };
    prisma.recipeIngredientLine.findFirst
      .mockResolvedValueOnce(line) // getOwnedLine
      .mockResolvedValueOnce(next); // merge target lookup
    prisma.recipeIngredientLine.findMany.mockResolvedValue([{ id: 'dn', lineNo: 9 }]);
    prisma.recipeIngredientLine.update.mockResolvedValue({ id: 'x' });
    prisma.recipeIngredientLine.create.mockResolvedValue({ id: 'm1', displayName: 'Chilli Powder — 2 Tsp Coriander Powder — 1 Tsp' });
    const svc = new IntakeService(prisma, recipes);
    const merged = await svc.mergeWithNext(userActor, 'r1', 'l1', line.updatedAt.toISOString());
    expect(merged.displayName).toBe('Chilli Powder — 2 Tsp Coriander Powder — 1 Tsp');
    const createCall = prisma.recipeIngredientLine.create.mock.calls[0][0].data;
    expect(createCall).toEqual(
      expect.objectContaining({
        lineNo: 3,
        needsReview: true, // OR of both — conservative, never silently cleared
      }),
    );
    expect(createCall.ocrConfidence).toBeUndefined(); // fresh draft — no fabricated confidence
    expect(createCall.shoppingKey).not.toBe(line.shoppingKey);
    // both originals soft-deleted
    const softDeletes = prisma.recipeIngredientLine.update.mock.calls
      .filter((c: any) => ['l1', 'l2'].includes(c[0].where.id))
      .map((c: any) => c[0].data.deletedAt);
    expect(softDeletes).toHaveLength(2);
    // downstream −1
    expect(prisma.recipeIngredientLine.update.mock.calls.some(
      (c: any) => c[0].where.id === 'dn' && c[0].data.lineNo === 8,
    )).toBe(true);
  });

  it('mergeWithNext errors when there is no next line', async () => {
    const { prisma, recipes } = mockPrisma();
    const line = mockLine({ id: 'l1' });
    prisma.recipeIngredientLine.findFirst
      .mockResolvedValueOnce(line)
      .mockResolvedValueOnce(null);
    const svc = new IntakeService(prisma, recipes);
    await expect(
      svc.mergeWithNext(userActor, 'r1', 'l1', line.updatedAt.toISOString()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('addLine appends after the max line_no (B3 AC-1)', async () => {
    const { prisma, recipes } = mockPrisma();
    prisma.recipeIngredientLine.aggregate.mockResolvedValue({ _max: { lineNo: 11 } });
    prisma.recipeIngredientLine.create.mockResolvedValue({ id: 'n12' });
    const svc = new IntakeService(prisma, recipes);
    await svc.addLine(userActor, 'r1', { displayName: 'Curry Leaves — a handful' });
    const createCall = prisma.recipeIngredientLine.create.mock.calls[0][0].data;
    expect(createCall).toEqual(
      expect.objectContaining({
        recipeId: 'r1',
        lineNo: 12,
        displayName: 'Curry Leaves — a handful',
        sourceTag: 'CARD',
        needsReview: false,
      }),
    );
    expect(createCall.shoppingKey).toBeTruthy();
  });

  it('parsePreview: confirmed when no line needs review, draft when any does (D-12G)', async () => {
    const { prisma, recipes } = mockPrisma();
    const svc = new IntakeService(prisma, recipes);
    prisma.recipeIngredientLine.findMany.mockResolvedValue([
      mockLine({ id: 'l1', needsReview: false }),
      mockLine({ id: 'l2', needsReview: false }),
    ]);
    const clean = await svc.parsePreview(userActor, 'r1');
    expect(clean.status).toBe('confirmed');
    expect(clean.enqueue).toEqual({ can_enqueue: true, blockers: [] }); // D-14B

    prisma.recipeIngredientLine.findMany.mockResolvedValue([
      mockLine({ id: 'l1', needsReview: false }),
      mockLine({ id: 'l2', needsReview: true }),
    ]);
    const flagged = await svc.parsePreview(userActor, 'r1');
    expect(flagged.status).toBe('draft');
    expect(flagged.enqueue.can_enqueue).toBe(false);
    expect(flagged.enqueue.blockers).toHaveLength(1);
    expect(flagged.enqueue.blockers[0].line_id).toBe('l2');
  });
});

describe('IntakeService — D-14 needs_review enqueue gate (INV-05)', () => {
  it('getEnqueueState: clean active lines → can_enqueue true, no blockers', async () => {
    const { prisma, recipes } = mockPrisma();
    prisma.recipeIngredientLine.findMany.mockResolvedValue([
      mockLine({ id: 'l1', needsReview: false }),
      mockLine({ id: 'l2', needsReview: false }),
    ]);
    const svc = new IntakeService(prisma, recipes);
    await expect(svc.getEnqueueState(userActor, 'r1')).resolves.toEqual({
      can_enqueue: true,
      blockers: [],
    });
  });

  it('getEnqueueState: any active needs_review line blocks, named line by line', async () => {
    const { prisma, recipes } = mockPrisma();
    prisma.recipeIngredientLine.findMany.mockResolvedValue([
      mockLine({ id: 'l1', displayName: 'Fish — 500g', needsReview: false }),
      mockLine({ id: 'l2', displayName: 'Chilli — 5 Nos', needsReview: true }),
      mockLine({ id: 'l3', displayName: 'Tamarind — A Lemon Size', needsReview: true }),
    ]);
    const svc = new IntakeService(prisma, recipes);
    const state = await svc.getEnqueueState(userActor, 'r1');
    expect(state.can_enqueue).toBe(false);
    expect(state.blockers).toEqual([
      { line_id: 'l2', display_name: 'Chilli — 5 Nos' },
      { line_id: 'l3', display_name: 'Tamarind — A Lemon Size' },
    ]);
  });

  it('getEnqueueState: reads the canonical flag only — soft-deleted flagged lines never block', async () => {
    // listDraftLines filters deletedAt: null, so a soft-deleted flagged row never
    // reaches the gate (active = non-deleted, D-14D).
    const { prisma, recipes } = mockPrisma();
    prisma.recipeIngredientLine.findMany.mockResolvedValue([
      mockLine({ id: 'l1', needsReview: false }),
    ]);
    const svc = new IntakeService(prisma, recipes);
    const state = await svc.getEnqueueState(userActor, 'r1');
    expect(state.can_enqueue).toBe(true);
    expect(state.blockers).toEqual([]);
  });

  it('getEnqueueState: foreign/missing recipe → 404 (INV-17 enforced inside the gate)', async () => {
    const { prisma, recipes } = mockPrisma({
      assertOwned: jest.fn().mockRejectedValue(new NotFoundException({ code: 'RECIPE_NOT_FOUND' })),
    });
    const svc = new IntakeService(prisma, recipes);
    await expect(svc.getEnqueueState(userActor, 'r1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updateLine: needsReview=false clears the flag (the only path — D-14C)', async () => {
    const { prisma, recipes } = mockPrisma();
    const line = mockLine({ id: 'l1', needsReview: true, updatedAt: new Date('2026-09-09T10:00:00Z') });
    prisma.recipeIngredientLine.findFirst.mockResolvedValue(line);
    prisma.recipeIngredientLine.update.mockResolvedValue({ ...line, needsReview: false });
    const svc = new IntakeService(prisma, recipes);
    await svc.updateLine(userActor, 'r1', 'l1', { needsReview: false }, line.updatedAt.toISOString());
    expect(prisma.recipeIngredientLine.update).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: expect.objectContaining({ needsReview: false }),
    });
  });

  it('updateLine: ordinary edits never touch needs_review (no auto-clear)', async () => {
    const { prisma, recipes } = mockPrisma();
    const line = mockLine({ id: 'l1', needsReview: true, updatedAt: new Date('2026-09-09T10:00:00Z') });
    prisma.recipeIngredientLine.findFirst.mockResolvedValue(line);
    prisma.recipeIngredientLine.update.mockResolvedValue(line);
    const svc = new IntakeService(prisma, recipes);
    await svc.updateLine(userActor, 'r1', 'l1', { displayName: 'renamed' }, line.updatedAt.toISOString());
    const data = prisma.recipeIngredientLine.update.mock.calls[0][0].data;
    expect(data.needsReview).toBeUndefined();
  });
});

describe('IntakeService — D-11 OCR draft (INV-04)', () => {
  function ocrPrisma() {
    const prisma: any = {
      recipeInput: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      recipeIngredientLine: {
        createMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };
    const recipes = { assertOwned: jest.fn().mockResolvedValue({ id: 'r1' }) };
    return { prisma, recipes };
  }

  const stub = {
    recognize: jest.fn().mockResolvedValue({
      recognized_text: 'Fish - 500g\nDrumstick - 1 Nos\nFenugreek - 1/4 Tsp',
      lines: [
        { text: 'Fish - 500g', confidence: 0.98 },
        { text: 'Drumstick - 1 Nos', confidence: 0.95 },
        { text: 'Fenugreek - 1/4 Tsp', confidence: 0.44 },
      ],
      source_metadata: { provider: 'stub' },
    }),
  };

  it('persists ocr_text write-once and flags only low-confidence lines (INV-04: none dropped)', async () => {
    const { prisma, recipes } = ocrPrisma();
    const svc = new IntakeService(prisma, recipes as never, stub as never);
    const result = await svc.ocrPhoto(userActor, 'r1', 'in-1', new Uint8Array([1]), 'image/jpeg');

    expect(result.status).toBe('complete');
    expect(result.draft_line_count).toBe(3);
    expect(result.flagged_count).toBe(1);
    expect(prisma.recipeInput.updateMany).toHaveBeenCalledWith({
      where: { id: 'in-1', ocrText: null },
      data: { ocrText: 'Fish - 500g\nDrumstick - 1 Nos\nFenugreek - 1/4 Tsp' },
    });
    const data = prisma.recipeIngredientLine.createMany.mock.calls[0][0].data;
    expect(data).toHaveLength(3); // all three lines persisted, none dropped
    expect(data[2]).toMatchObject({ displayName: 'Fenugreek - 1/4 Tsp', needsReview: true, sourceTag: 'CARD' });
    expect(data[0].needsReview).toBe(false);
    expect(data.every((d: { ocrConfidence: number | null }) => d.ocrConfidence !== null)).toBe(true);
  });

  it('missing confidence → flagged (conservative policy, never invented)', async () => {
    const { prisma, recipes } = ocrPrisma();
    const noConf = {
      recognize: jest.fn().mockResolvedValue({
        recognized_text: 'Fish - 500g',
        lines: [{ text: 'Fish - 500g' }],
        source_metadata: { provider: 'stub' },
      }),
    };
    const svc = new IntakeService(prisma, recipes as never, noConf as never);
    await svc.ocrPhoto(userActor, 'r1', 'in-1', new Uint8Array([1]), 'image/jpeg');
    const data = prisma.recipeIngredientLine.createMany.mock.calls[0][0].data;
    expect(data[0].needsReview).toBe(true);
    expect(data[0].ocrConfidence).toBeNull();
  });

  it('provider failure → pending (nothing persisted), retryable', async () => {
    const { prisma, recipes } = ocrPrisma();
    const failing = { recognize: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) };
    const svc = new IntakeService(prisma, recipes as never, failing as never);
    const result = await svc.ocrPhoto(userActor, 'r1', 'in-1', new Uint8Array([1]), 'image/jpeg');
    expect(result.status).toBe('pending');
    expect(prisma.recipeInput.updateMany).not.toHaveBeenCalled();
    expect(prisma.recipeIngredientLine.createMany).not.toHaveBeenCalled();
  });

  it('empty provider result → unreadable (422), nothing persisted', async () => {
    const { prisma, recipes } = ocrPrisma();
    const blank = { recognize: jest.fn().mockResolvedValue({ recognized_text: '', lines: [], source_metadata: {} }) };
    const svc = new IntakeService(prisma, recipes as never, blank as never);
    const result = await svc.ocrPhoto(userActor, 'r1', 'in-1', new Uint8Array([1]), 'image/jpeg');
    expect(result.status).toBe('unreadable');
    expect(prisma.recipeIngredientLine.createMany).not.toHaveBeenCalled();
  });

  it('no adapter configured → disabled (no draft lines)', async () => {
    const { prisma, recipes } = ocrPrisma();
    const svc = new IntakeService(prisma, recipes as never, null as never);
    const result = await svc.ocrPhoto(userActor, 'r1', 'in-1', new Uint8Array([1]), 'image/jpeg');
    expect(result.status).toBe('disabled');
    expect(prisma.recipeIngredientLine.createMany).not.toHaveBeenCalled();
  });
});
