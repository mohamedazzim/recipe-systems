import type { Actor } from '../../common/guards/guest-or-jwt.guard';
import { IntakeService, splitRawLines, toWireLine } from './intake.service';
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
    recipeIngredientLine: { create: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn(async (fnOrArray: any) => {
      if (Array.isArray(fnOrArray)) return Promise.all(fnOrArray);
      return fnOrArray(prisma);
    }),
  };
  return { prisma, recipes: recipes as unknown as RecipeService };
}

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
});

describe('IntakeService', () => {
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

  it('refuses to write intake rows for a recipe the actor does not own (D-10 ownership)', async () => {
    const { prisma } = mockPrisma();
    const foreign = {
      assertOwned: jest.fn().mockRejectedValue(new Error('Recipe not found')),
    } as unknown as RecipeService;
    const svc = new IntakeService(prisma, foreign);
    await expect(svc.recordPaste(guestActor, 'r1', 'Fish')).rejects.toThrow('Recipe not found');
    expect(prisma.recipeInput.create).not.toHaveBeenCalled();
  });

  it('IMMUTABILITY: exposes no update/delete/upsert surface for recipe_input', () => {
    const methodNames = Object.getOwnPropertyNames(IntakeService.prototype).filter(
      (n) => n !== 'constructor',
    );
    // The only recipe_input writers are recordPaste/recordPhoto/recordForm (write-once creates).
    const creators = ['recordPaste', 'recordPhoto', 'recordForm'];
    creators.forEach((name) => expect(methodNames).toContain(name));
    const mutators = methodNames.filter((n) => /update|upsert|delete/i.test(n));
    expect(mutators).toEqual([]);
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

  it('toWireLine maps a draft row to the API §3 wire shape (unparsed fields null)', () => {
    expect(
      toWireLine({
        id: 'l1',
        displayName: 'Fish — 500g',
        includeOnList: true,
      } as any),
    ).toEqual({
      display_name: 'Fish — 500g',
      canonical_name: null,
      amount: null,
      unit: null,
      quantity: null,
      category: null,
      is_header: false,
      include_on_list: true,
      confirmed_sense: null,
    });
  });
});
