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
