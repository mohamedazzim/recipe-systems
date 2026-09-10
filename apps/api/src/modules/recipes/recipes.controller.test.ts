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
