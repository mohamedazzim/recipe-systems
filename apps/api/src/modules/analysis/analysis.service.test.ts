// D-17 (P3-3): analysis-enqueue unit tests — gate ORDER (ownership → D-14
// readiness → 422 METHOD_REQUIRED), the Q1-labeled job-payload capture, and
// queue-error mapping. The API never writes analysis_* (one-writer) — proven
// by construction here (no prisma.analysis writes anywhere in the service).

import { PROMPT_VERSION } from '@recipe-systems/llm-adapter';
import type { Actor } from '../../common/guards/guest-or-jwt.guard';
import { AnalysisService } from './analysis.service';
import { QueueUnavailableError } from './analysis-queue.service';

const userActor: Actor = {
  kind: 'user',
  user: { accountId: 'acc-1', email: 'chef@test.dev', sub: 's1' },
};

function mocks(overrides: {
  lines?: unknown[];
  method?: { list_only: boolean };
  queue?: { enqueue: jest.Mock };
} = {}) {
  const recipes = {
    assertOwned: jest.fn().mockResolvedValue({ id: 'r1', methodText: null }),
    getMethodState: jest.fn().mockResolvedValue(overrides.method ?? { list_only: false }),
  };
  const intake = {
    getEnqueueState: jest.fn().mockResolvedValue({ can_enqueue: true, blockers: [] }),
    listDraftLines: jest.fn().mockResolvedValue(overrides.lines ?? []),
  };
  const queue = overrides.queue ?? { enqueue: jest.fn().mockResolvedValue('a-uuid') };
  const svc = new AnalysisService(recipes as never, intake as never, queue as never);
  return { svc, recipes, intake, queue };
}

describe('D-17 analysis enqueue (API side)', () => {
  it('clean recipe: capture + enqueue → { analysis_id, status queued, prompt_version }', async () => {
    const { svc, queue } = mocks({
      lines: [
        {
          id: 'line-1',
          displayName: 'Fish — 500g',
          amountText: '500g',
          amount: { toString: () => '500' },
          unit: 'g',
          confirmedSense: null,
          groupName: 'fish_meat',
          includeOnList: true,
        },
      ],
    });
    const result = await svc.enqueue(userActor, 'r1', 'home');
    expect(result).toEqual({ analysis_id: 'a-uuid', status: 'queued', prompt_version: PROMPT_VERSION });
    const payload = queue.enqueue.mock.calls[0][0];
    expect(payload.mode).toBe('home');
    expect(payload.recipe_id).toBe('r1');
    expect(payload.prompt_version).toBe(PROMPT_VERSION);
    expect(payload.captured.structured_recipe.ingredients).toHaveLength(1);
    expect(payload.captured.structured_recipe.ingredients[0].quantity).toBe(500);
  });

  it('D-14 gate: flagged lines → 409 ENQUEUE_BLOCKED with the blockers (never duplicated logic)', async () => {
    const { svc, intake, queue } = mocks();
    intake.getEnqueueState.mockResolvedValue({
      can_enqueue: false,
      blockers: [{ line_id: 'l9', display_name: 'Chilli — 5 Nos' }],
    });
    await expect(svc.enqueue(userActor, 'r1', 'home')).rejects.toMatchObject({
      response: {
        code: 'ENQUEUE_BLOCKED',
        details: { blockers: [{ line_id: 'l9' }] },
      },
    });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('list-only → 422 METHOD_REQUIRED (API §5)', async () => {
    const { svc, queue } = mocks({ method: { list_only: true } });
    await expect(svc.enqueue(userActor, 'r1', 'home')).rejects.toMatchObject({
      response: { code: 'METHOD_REQUIRED' },
    });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('queue unavailable → 409 ENQUEUE_UNAVAILABLE (graceful, never a crash)', async () => {
    const { svc } = mocks({
      queue: { enqueue: jest.fn().mockRejectedValue(new QueueUnavailableError()) },
    });
    await expect(svc.enqueue(userActor, 'r1', 'home')).rejects.toMatchObject({
      response: { code: 'ENQUEUE_UNAVAILABLE' },
    });
  });

  it('capture carries the inferred method as a matched METHOD step (Q1 job payload)', async () => {
    const { recipes } = mocks({ lines: [] });
    recipes.assertOwned.mockResolvedValue({
      id: 'r1',
      methodText: 'Boil tamarind; temper; simmer.',
      methodSourceTag: 'INFERRED',
      methodInferredSource: 'CDK 1669 / Mrs. Anitha',
      photoUri: null,
    });
    const queue = { enqueue: jest.fn().mockResolvedValue('a2') };
    // rebuild service with the updated recipes mock
    const svc2 = new AnalysisService(recipes as never, mocks().intake as never, queue as never);
    await svc2.enqueue(userActor, 'r1', 'chef');
    const payload = queue.enqueue.mock.calls[0][0];
    expect(payload.captured.structured_recipe.method_steps).toEqual([
      { id: 'method-1', text: 'Boil tamarind; temper; simmer.', source: 'METHOD' },
    ]);
    expect(payload.captured.structured_recipe.method_source).toEqual({
      name: 'CDK 1669 / Mrs. Anitha',
      type: null,
      matched: true,
    });
  });
});
