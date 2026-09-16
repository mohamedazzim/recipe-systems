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
  queue?: { enqueue: jest.Mock; enqueueView9Recompute?: jest.Mock };
} = {}) {
  const recipes = {
    assertOwned: jest.fn().mockResolvedValue({ id: 'r1', methodText: null }),
    getMethodState: jest.fn().mockResolvedValue(overrides.method ?? { list_only: false }),
  };
  const intake = {
    getEnqueueState: jest.fn().mockResolvedValue({ can_enqueue: true, blockers: [] }),
    listDraftLines: jest.fn().mockResolvedValue(overrides.lines ?? []),
  };
  const queue = overrides.queue ?? {
    enqueue: jest.fn().mockResolvedValue('a-uuid'),
    enqueueView9Recompute: jest.fn().mockResolvedValue(undefined),
  };
  const prisma = {
    analysis: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const svc = new AnalysisService(
    recipes as never,
    intake as never,
    queue as never,
    prisma as never,
  );
  return { svc, recipes, intake, queue, prisma };
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
    const svc2 = new AnalysisService(
      recipes as never,
      mocks().intake as never,
      queue as never,
      {} as never,
    );
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

describe('D-19 view-9 recompute (RS-US-45, API side)', () => {
  it('queues the deterministic recompute job with the current capture (never writes analysis_*)', async () => {
    const { svc, queue, prisma } = mocks({
      lines: [{ id: 'line-1', displayName: 'Fish — 500g', amountText: '500g', amount: { toString: () => '500' }, unit: 'g', confirmedSense: null, groupName: 'fish_meat', includeOnList: true }],
    });
    prisma.analysis.findUnique.mockResolvedValue({
      id: 'a1',
      recipeId: 'r1',
      recipe: { accountId: 'acc-1', guestSessionId: null },
    });

    const result = await svc.recomputeView9(userActor, 'a1', { fish_class: 'lean' });

    expect(result).toEqual({ analysis_id: 'a1', status: 'recompute_queued', assumptions: { fish_class: 'lean' } });
    const enqueueView9Recompute = queue.enqueueView9Recompute as jest.Mock;
    const payload = enqueueView9Recompute.mock.calls[0][0];
    expect(payload.analysis_id).toBe('a1');
    expect(payload.recipe_id).toBe('r1');
    expect(payload.delta).toEqual({ fish_class: 'lean' });
    expect(payload.captured.structured_recipe.ingredients).toHaveLength(1);
    // one-writer: no analysis_* writes anywhere on this path
    expect(prisma.analysis.findUnique).toHaveBeenCalledTimes(1);
  });

  it('INV-17: missing analysis → 404 ANALYSIS_NOT_FOUND', async () => {
    const { svc, prisma } = mocks();
    prisma.analysis.findUnique.mockResolvedValue(null);
    await expect(svc.recomputeView9(userActor, 'a-missing', { oil_tbsp: 2 })).rejects.toMatchObject({
      response: { code: 'ANALYSIS_NOT_FOUND' },
    });
  });

  it('INV-17: a foreign analysis 404s and never enqueues', async () => {
    const { svc, queue, prisma } = mocks();
    prisma.analysis.findUnique.mockResolvedValue({
      id: 'a1',
      recipeId: 'r1',
      recipe: { accountId: 'someone-else', guestSessionId: null },
    });
    await expect(svc.recomputeView9(userActor, 'a1', { coconut_grams: 180 })).rejects.toMatchObject({
      response: { code: 'ANALYSIS_NOT_FOUND' },
    });
    expect(queue.enqueueView9Recompute as jest.Mock).not.toHaveBeenCalled();
  });

  it('queue unavailable → 409 ENQUEUE_UNAVAILABLE', async () => {
    const queue = {
      enqueue: jest.fn(),
      enqueueView9Recompute: jest.fn().mockRejectedValue(new QueueUnavailableError()),
    };
    const { svc, prisma } = mocks({ queue });
    prisma.analysis.findUnique.mockResolvedValue({
      id: 'a1',
      recipeId: 'r1',
      recipe: { accountId: 'acc-1', guestSessionId: null },
    });
    await expect(svc.recomputeView9(userActor, 'a1', { oil_tbsp: 2 })).rejects.toMatchObject({
      response: { code: 'ENQUEUE_UNAVAILABLE' },
    });
  });
});

describe('AnalysisService.previewSubstitution (D-25A C7)', () => {
  const TAMARIND_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
  const UNKNOWN_ID = 'bbbbbbbb-0000-4000-8000-000000000002';

  function previewMocks(views: Record<number, unknown> = {}) {
    const recipes = { assertOwned: jest.fn().mockResolvedValue({ id: 'r1' }) };
    const intake = {} as never;
    const queue = { enqueue: jest.fn(), enqueueView9Recompute: jest.fn() };
    const prisma = {
      analysis: { findFirst: jest.fn().mockResolvedValue({ id: 'a1' }) },
      analysisView: {
        findUnique: jest.fn(async ({ where }: any) => {
          const payload = views[where.analysisId_viewNumber.viewNumber];
          return payload === undefined ? null : { payload };
        }),
      },
      recipeIngredientLine: {
        findUnique: jest.fn().mockResolvedValue({ displayName: 'Tamarind', recipeId: 'r1' }),
      },
    };
    const svc = new AnalysisService(recipes as never, intake, queue as never, prisma as never);
    return { svc, recipes, queue, prisma };
  }

  it('previews one persisted View 4 substitution with a grounded classification (no invention)', async () => {
    const { svc, queue, prisma } = previewMocks({
      1: {
        items: [{ ingredient_id: TAMARIND_ID, job: 'Sour', if_omitted: 'No sour — flat stew', tag: 'CARD' }],
        role_groups: [],
      },
      4: {
        substitutions: [
          { ingredient_id: TAMARIND_ID, substitute: 'Kudampuli', consequence: 'Kerala meen curry — walks to another coast', tag: 'INFERRED' },
        ],
      },
      5: {
        family: 'Coastal Tamil',
        architecture: 'x',
        confidence: 'high',
        not_this: [{ variant: 'Kerala meen curry', key_difference: 'uses kudampuli instead of tamarind/mango' }],
        needs_review: true,
        tag: 'INFERRED',
      },
      6: { ratios: [], unresolvable: [] },
    });
    const out = await svc.previewSubstitution(userActor, 'r1', TAMARIND_ID);
    expect(out).toEqual({
      ingredient_id: TAMARIND_ID,
      substitute: 'Kudampuli',
      classification: 'identity_shift',
      what_is_lost: 'Kerala meen curry — walks to another coast',
    });
    // read-only: no enqueue, no analysis_* writes, no recipe-line writes
    expect(queue.enqueue as jest.Mock).not.toHaveBeenCalled();
    expect(queue.enqueueView9Recompute as jest.Mock).not.toHaveBeenCalled();
    expect((prisma.analysisView.findUnique as jest.Mock).mock.calls).toHaveLength(4);
  });

  it('404 ANALYSIS_NOT_FOUND when the recipe has no latest complete analysis', async () => {
    const { svc, prisma } = previewMocks();
    prisma.analysis.findFirst.mockResolvedValue(null);
    await expect(svc.previewSubstitution(userActor, 'r1', TAMARIND_ID)).rejects.toMatchObject({
      response: { code: 'ANALYSIS_NOT_FOUND' },
    });
  });

  it('404 SUBSTITUTION_NOT_FOUND for an ingredient that is not a persisted View 4 source', async () => {
    const { svc } = previewMocks({
      4: { substitutions: [{ ingredient_id: TAMARIND_ID, substitute: 'Kudampuli', consequence: 'x', tag: 'INFERRED' }] },
    });
    await expect(svc.previewSubstitution(userActor, 'r1', UNKNOWN_ID)).rejects.toMatchObject({
      response: { code: 'SUBSTITUTION_NOT_FOUND' },
    });
  });

  it('malformed ingredient id → canonical 404 SUBSTITUTION_NOT_FOUND (no Prisma lookup)', async () => {
    const { svc, prisma } = previewMocks();
    await expect(svc.previewSubstitution(userActor, 'r1', 'not-a-uuid')).rejects.toMatchObject({
      response: { code: 'SUBSTITUTION_NOT_FOUND' },
    });
    expect(prisma.analysisView.findUnique).not.toHaveBeenCalled();
  });

  it('ownership rides assertOwned — a foreign recipe is the canonical 404', async () => {
    const { svc, recipes } = previewMocks();
    (recipes.assertOwned as jest.Mock).mockRejectedValue(
      Object.assign(new Error('not found'), {
        response: { code: 'RECIPE_NOT_FOUND' },
      }),
    );
    await expect(svc.previewSubstitution(userActor, 'foreign-recipe', TAMARIND_ID)).rejects.toMatchObject({
      response: { code: 'RECIPE_NOT_FOUND' },
    });
  });
});
