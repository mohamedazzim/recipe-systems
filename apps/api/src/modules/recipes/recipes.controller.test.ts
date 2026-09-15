// Read-only hydration surface (method-save bug fix 2026-09-10):
// GET /recipes/:id/method. The controller delegates to the existing D-17
// RecipeService.getMethodState unchanged — the canonical wire shape
// {method_tag, method_source, list_only} (same as the PATCH 200).
// Ownership stays enforced inside the service (assertOwned, INV-17).

import { RecipesController } from './recipes.controller';
import { RecipeService } from './recipe.service';

describe('RecipesController.getMethod (read-only method hydration)', () => {
  const recipes = {
    getMethodState: jest.fn(),
  };
  const controller = new RecipesController(recipes as unknown as RecipeService);

  it('returns the canonical saved-method state (METHOD)', async () => {
    recipes.getMethodState.mockResolvedValue({
      method_tag: 'METHOD',
      method_source: null,
      list_only: false,
    });
    const result = await controller.getMethod(
      { user: { accountId: 'acc-1', email: 'c@t.dev', sub: 's' } } as never,
      'r1',
    );
    expect(result).toEqual({ method_tag: 'METHOD', method_source: null, list_only: false });
    expect(recipes.getMethodState).toHaveBeenCalledWith(
      { kind: 'user', user: { accountId: 'acc-1', email: 'c@t.dev', sub: 's' } },
      'r1',
    );
  });

  it('returns the canonical list-only state when no method is attached', async () => {
    recipes.getMethodState.mockResolvedValue({
      method_tag: null,
      method_source: null,
      list_only: true,
    });
    const result = await controller.getMethod(
      { user: { accountId: 'acc-1', email: 'c@t.dev', sub: 's' } } as never,
      'r2',
    );
    expect(result).toEqual({ method_tag: null, method_source: null, list_only: true });
  });

  it('delegates ownership to the service (INV-17 404 for missing/foreign)', async () => {
    recipes.getMethodState.mockRejectedValue({
      response: { code: 'RECIPE_NOT_FOUND', message: 'Recipe not found' },
    });
    await expect(
      controller.getMethod(
        { user: { accountId: 'acc-1', email: 'c@t.dev', sub: 's' } } as never,
        'foreign',
      ),
    ).rejects.toMatchObject({ response: { code: 'RECIPE_NOT_FOUND' } });
  });
});

describe('RecipesController — D-22 save + library (D1/D2)', () => {
  const recipes = {
    saveRecipe: jest.fn(),
    listLibrary: jest.fn(),
  };
  const controller = new RecipesController(recipes as unknown as RecipeService);
  const userReq = { user: { accountId: 'acc-1', email: 'c@t.dev', sub: 's' } } as never;
  const guestReq = { actor: { kind: 'guest', guestSessionId: 'gs-1', expiresAt: new Date() } } as never;

  beforeEach(() => {
    recipes.saveRecipe.mockClear();
    recipes.listLibrary.mockClear();
  });

  it('PUT save applies the service (default family name) and returns the canonical wire', async () => {
    recipes.saveRecipe.mockResolvedValue({
      recipe_id: 'r1',
      title: 'Coastal Tamil (Kanyakumari) style meen kuzhambu',
      saved_at: '2026-09-10T12:00:00.000Z',
      artifacts: { raw_input: true, photo: false, object: true, identification: true, analysis: true, timestamps: true },
    });
    const result = await controller.save(guestReq, 'r1', {});
    expect(recipes.saveRecipe).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'guest', guestSessionId: 'gs-1' }),
      'r1',
      { title: undefined },
    );
    expect(result.artifacts.object).toBe(true);
  });

  it('PUT save forwards an editable title (AC-2)', async () => {
    await controller.save(guestReq, 'r1', { title: 'Sunday fish curry' });
    expect(recipes.saveRecipe).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'guest' }),
      'r1',
      { title: 'Sunday fish curry' },
    );
  });

  it('PUT save rejects malformed bodies (strict schema, title bounds)', async () => {
    await expect(controller.save(guestReq, 'r1', { bogus: true })).rejects.toMatchObject({
      response: { code: 'INVALID_SAVE' },
    });
    await expect(controller.save(guestReq, 'r1', { title: '' })).rejects.toMatchObject({
      response: { code: 'INVALID_SAVE' },
    });
    await expect(controller.save(guestReq, 'r1', { title: 42 })).rejects.toMatchObject({
      response: { code: 'INVALID_SAVE' },
    });
    expect(recipes.saveRecipe).not.toHaveBeenCalled();
  });

  it('GET library returns the D2 AC-1 rows for the account', async () => {
    recipes.listLibrary.mockResolvedValue([
      {
        recipe_id: 'r1',
        name: 'Sunday fish curry',
        date: '2026-09-10T11:00:00.000Z',
        family: 'Coastal Tamil (Kanyakumari) style meen kuzhambu',
        has_cook_log: false,
      },
    ]);
    const result = await controller.library(userReq);
    expect(result).toEqual({
      recipes: [
        {
          recipe_id: 'r1',
          name: 'Sunday fish curry',
          date: '2026-09-10T11:00:00.000Z',
          family: 'Coastal Tamil (Kanyakumari) style meen kuzhambu',
          has_cook_log: false,
        },
      ],
    });
    expect(recipes.listLibrary).toHaveBeenCalledWith({
      kind: 'user',
      user: { accountId: 'acc-1', email: 'c@t.dev', sub: 's' },
    });
  });
});

describe('RecipesController — D-25 D3 tags + search', () => {
  const recipes = {
    search: jest.fn(),
    listTags: jest.fn(),
    setTags: jest.fn(),
    listLibrary: jest.fn(),
  };
  const controller = new RecipesController(recipes as unknown as RecipeService);
  const userReq = { user: { accountId: 'acc-1', email: 'c@t.dev', sub: 's' } } as never;

  beforeEach(() => {
    recipes.search.mockClear();
    recipes.listTags.mockClear();
    recipes.setTags.mockClear();
    recipes.listLibrary.mockClear();
  });

  it('GET library with ?q= delegates to search (D3 AC-2)', async () => {
    recipes.search.mockResolvedValue([{ recipe_id: 'r1' }]);
    const result = await controller.library(userReq, 'fish');
    expect(recipes.search).toHaveBeenCalledWith(
      { kind: 'user', user: { accountId: 'acc-1', email: 'c@t.dev', sub: 's' } },
      'fish',
    );
    expect(result.recipes).toEqual([{ recipe_id: 'r1' }]);
    expect(recipes.listLibrary).not.toHaveBeenCalled();
  });

  it('GET library without q keeps the canonical library path', async () => {
    recipes.listLibrary.mockResolvedValue([{ recipe_id: 'r1' }]);
    const result = await controller.library(userReq);
    expect(recipes.listLibrary).toHaveBeenCalled();
    expect(recipes.search).not.toHaveBeenCalled();
    expect(result.recipes).toEqual([{ recipe_id: 'r1' }]);
  });

  it('GET tags returns the persisted set', async () => {
    recipes.listTags.mockResolvedValue(['fish', 'sunday']);
    const result = await controller.tags(userReq, 'r1');
    expect(recipes.listTags).toHaveBeenCalledWith(
      { kind: 'user', user: { accountId: 'acc-1', email: 'c@t.dev', sub: 's' } },
      'r1',
    );
    expect(result).toEqual({ tags: ['fish', 'sunday'] });
  });

  it('PUT tags replaces the set (D3 AC-1)', async () => {
    recipes.setTags.mockResolvedValue(['fish']);
    const result = await controller.setTags(userReq, 'r1', { tags: [' fish '] });
    expect(recipes.setTags).toHaveBeenCalledWith(
      { kind: 'user', user: { accountId: 'acc-1', email: 'c@t.dev', sub: 's' } },
      'r1',
      [' fish '],
    );
    expect(result).toEqual({ tags: ['fish'] });
  });

  it('PUT tags rejects malformed bodies (strict schema)', async () => {
    await expect(controller.setTags(userReq, 'r1', { tags: 'nope' })).rejects.toMatchObject({
      response: { code: 'INVALID_TAGS' },
    });
    await expect(controller.setTags(userReq, 'r1', { tags: ['x'.repeat(101)] })).rejects.toMatchObject({
      response: { code: 'INVALID_TAGS' },
    });
    expect(recipes.setTags).not.toHaveBeenCalled();
  });
});

describe('RecipesController — D-22 D6 delete (RS-US-24)', () => {
  const recipes = { deleteRecipe: jest.fn() };
  const controller = new RecipesController(recipes as unknown as RecipeService);
  const userReq = { user: { accountId: 'acc-1', email: 'c@t.dev', sub: 's' } } as never;

  beforeEach(() => {
    recipes.deleteRecipe.mockClear();
  });

  it('DELETE with { confirm: true } delegates the canonical hard delete (204)', async () => {
    recipes.deleteRecipe.mockResolvedValue(undefined);
    await controller.deleteRecipe(userReq, 'r1', { confirm: true });
    expect(recipes.deleteRecipe).toHaveBeenCalledWith(
      { kind: 'user', user: { accountId: 'acc-1', email: 'c@t.dev', sub: 's' } },
      'r1',
    );
  });

  it('DELETE without confirm / with confirm:false / extra fields → 400 CONFIRM_REQUIRED, nothing deleted', async () => {
    await expect(controller.deleteRecipe(userReq, 'r1', {})).rejects.toMatchObject({
      response: { code: 'CONFIRM_REQUIRED' },
    });
    await expect(controller.deleteRecipe(userReq, 'r1', { confirm: false })).rejects.toMatchObject({
      response: { code: 'CONFIRM_REQUIRED' },
    });
    await expect(
      controller.deleteRecipe(userReq, 'r1', { confirm: true, bogus: 1 }),
    ).rejects.toMatchObject({ response: { code: 'CONFIRM_REQUIRED' } });
    expect(recipes.deleteRecipe).not.toHaveBeenCalled();
  });

  it('ownership stays inside the service — a foreign delete surfaces the canonical 404', async () => {
    recipes.deleteRecipe.mockRejectedValue({
      response: { code: 'RECIPE_NOT_FOUND', message: 'Recipe not found' },
    });
    await expect(controller.deleteRecipe(userReq, 'foreign', { confirm: true })).rejects.toMatchObject({
      response: { code: 'RECIPE_NOT_FOUND' },
    });
  });
});
