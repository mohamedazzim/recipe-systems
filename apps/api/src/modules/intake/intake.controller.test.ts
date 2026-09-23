// D-14 read surface (UI readiness screen): GET /recipes/:id/enqueue-state.
// The controller delegates to IntakeService.getEnqueueState unchanged — the
// canonical wire shape {can_enqueue, blockers:[{line_id, display_name}]}.
// Ownership stays enforced inside the service (assertOwned, INV-17).

import { IntakeController } from './intake.controller';
import { IntakeService } from './intake.service';
import { RecipeService } from '../recipes/recipe.service';
import { StorageService } from './storage.service';

describe('IntakeController.enqueueState (D-14 read route)', () => {
  const intake = {
    getEnqueueState: jest.fn(),
  };
  const controller = new IntakeController(
    {} as RecipeService,
    intake as unknown as IntakeService,
    {} as StorageService,
  );

  it('returns the canonical ready state', async () => {
    intake.getEnqueueState.mockResolvedValue({ can_enqueue: true, blockers: [] });
    const result = await controller.enqueueState(
      { user: { accountId: 'acc-1', email: 'c@t.dev', sub: 's' } } as never,
      'r1',
    );
    expect(result).toEqual({ can_enqueue: true, blockers: [] });
    expect(intake.getEnqueueState).toHaveBeenCalledWith(
      { kind: 'user', user: { accountId: 'acc-1', email: 'c@t.dev', sub: 's' } },
      'r1',
    );
  });

  it('returns the canonical blocked state with blockers', async () => {
    intake.getEnqueueState.mockResolvedValue({
      can_enqueue: false,
      blockers: [{ line_id: 'l9', display_name: 'Chilli — 5 Nos' }],
    });
    const result = await controller.enqueueState(
      { user: { accountId: 'acc-1', email: 'c@t.dev', sub: 's' } } as never,
      'r2',
    );
    expect(result).toEqual({
      can_enqueue: false,
      blockers: [{ line_id: 'l9', display_name: 'Chilli — 5 Nos' }],
    });
  });
});

describe('IntakeController.formIntake (D-10A B5)', () => {
  const actorReq = {
    actor: { kind: 'user' as const, user: { accountId: 'acc-1', email: 'c@t.dev', sub: 's' } },
  };

  function controllerWith(intake: Partial<IntakeService>) {
    const recipes = {
      createForIntake: jest.fn().mockResolvedValue({ id: 'r1' }),
    };
    return {
      controller: new IntakeController(
        recipes as unknown as RecipeService,
        intake as unknown as IntakeService,
        {} as StorageService,
      ),
      recipes,
    };
  }

  it('accepts the structured body and returns the same wire as parse-text', async () => {
    const intake = {
      recordFormLines: jest.fn().mockResolvedValue({ id: 'in1' }),
      listDraftLines: jest.fn().mockResolvedValue([{ id: 'l1' }]),
      resolveWireLines: jest.fn().mockResolvedValue([{ id: 'l1', display_name: 'Fish' }]),
      resolveServings: jest.fn().mockResolvedValue({ servings: null, estimated: false }),
    };
    const { controller, recipes } = controllerWith(intake);

    const out = await controller.formIntake(actorReq as never, {
      ingredients: [
        { display_name: 'Fish', amount: '500g' },
        { display_name: 'Salt', amount: 'to taste' },
      ],
    });

    expect(recipes.createForIntake).toHaveBeenCalledWith(actorReq.actor, {
      rawText: 'Fish — 500g\nSalt — to taste',
    });
    expect(intake.recordFormLines).toHaveBeenCalledWith(actorReq.actor, 'r1', [
      { displayName: 'Fish', amountText: '500g', unit: null, amount: null, groupName: null },
      { displayName: 'Salt', amountText: 'to taste', unit: null, amount: null, groupName: null },
    ]);
    expect(out).toEqual({
      recipe_id: 'r1',
      recipe: {
        raw_text: 'Fish — 500g\nSalt — to taste',
        lines: [{ id: 'l1', display_name: 'Fish' }],
        flags: [],
        servings: null,
        servings_estimated: false,
      },
    });
  });

  it('refuses an empty or non-canonical body → 400 INVALID_FORM', async () => {
    const { controller } = controllerWith({ recordFormLines: jest.fn() });
    for (const body of [{}, { ingredients: [] }, { ingredients: [{ name: 'Fish' }] }, { ingredients: [{ display_name: '' }] }]) {
      await expect(controller.formIntake(actorReq as never, body)).rejects.toMatchObject({
        response: { code: 'INVALID_FORM' },
      });
    }
  });
});
