// D-17 (P3-3): analysis-job handler tests — the worker's core contract
// (A-17): complete path writes rows through the D-16 choke point; duplicate
// delivery converges (INV-11); is_current flip order-safe (INV-09); provider-
// pending fails cleanly (never stuck at generating); transient failures throw
// for pg-boss retry; the startup sweep reaps crash remnants; NOTIFY is sent on
// every transition (INV-16: signal only).

import { MockLlmAdapter } from '@recipe-systems/llm-adapter';
import { ProviderPendingError } from './adapter';
import { AnalysisJobData, AnalysisJobHandler, MODEL_VERSION_LABEL } from './analysis-job.handler';

const CAPTURED = {
  structured_recipe: {
    ingredients: [
      {
        id: 'fish_500g',
        display_name: 'Fish — 500g',
        canonical_name: null,
        amount_text: '500g',
        quantity: 500,
        unit: 'g',
        confirmed_sense: null,
        category: 'fish_meat',
        food_id: null,
        include_on_list: true,
      },
    ],
    method_steps: [{ id: 'method-1', text: 'Boil, temper, simmer.', source: 'METHOD' }],
    method_source: { name: 'CDK 1669 / Mrs. Anitha', type: 'video', matched: true },
    explicitly_absent: ['garlic'],
    card_metadata: { photographed: true, legible_issues: [] },
  },
};

const VALID_VIEW_1 = {
  items: [
    {
      ingredient_id: 'fish_500g',
      job: 'Protein, fat, reason for the sour',
      if_omitted: 'Not this dish',
      tag: 'CARD',
    },
  ],
  role_groups: [{ role: 'Body / richness', ingredient_ids: ['fish_500g'] }],
};
const VALID_VIEW_2 = { pillars: [], blind_spot_notes: [] };
const VALID_VIEW_3 = { status: 'COMPLETE', stages: [], incomplete_reason: null };
const VALID_VIEW_4 = { substitutions: [] };
const VALID_VIEW_5 = {
  family: 'Coastal Tamil (Kanyakumari) style meen kuzhambu',
  architecture: 'Raw-ground paste, triple sour',
  confidence: 'high',
  not_this: [],
  needs_review: true,
  tag: 'INFERRED',
};
const VALID_VIEW_6 = { ratios: [], unresolvable: [] };
const VALID_VIEW_7 = { status: 'COMPLETE', memorable_elements: [] };

function stubAdapter(): MockLlmAdapter {
  const fixtures = ([
    [1, VALID_VIEW_1],
    [2, VALID_VIEW_2],
    [3, VALID_VIEW_3],
    [4, VALID_VIEW_4],
    [5, VALID_VIEW_5],
    [6, VALID_VIEW_6],
    [7, VALID_VIEW_7],
  ] as const).flatMap(([view, output]) =>
    (['home', 'chef'] as const).map((mode) => ({ view, mode, output })),
  );
  return new MockLlmAdapter(fixtures);
}

function jobData(overrides: Partial<AnalysisJobData> = {}): AnalysisJobData {
  return {
    analysis_id: '11111111-1111-4111-8111-111111111111',
    recipe_id: '22222222-2222-4222-8222-222222222222',
    mode: 'home',
    prompt_version: 'v2',
    captured: CAPTURED as AnalysisJobData['captured'],
    ...overrides,
  };
}

interface PrismaMock {
  analysis: {
    findUnique: jest.Mock;
    upsert: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    findMany: jest.Mock;
  };
  analysisView: { upsert: jest.Mock };
  $transaction: jest.Mock;
}

function mockPrisma(): PrismaMock {
  return {
    analysis: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    analysisView: { upsert: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(async (ops: unknown[]) => {
      for (const op of ops) await op;
    }),
  };
}

function makeHandler(prisma: PrismaMock, adapter = stubAdapter(), notify = jest.fn()) {
  return {
    handler: new AnalysisJobHandler(prisma as never, adapter, notify as never),
    notify,
  };
}

describe('D-17 analysis job handler (A-17 contract)', () => {
  it('complete path: 9 view rows, one current analysis, status complete, NOTIFY on every transition', async () => {
    const prisma = mockPrisma();
    const { handler, notify } = makeHandler(prisma);

    await handler.handle(jobData());

    expect(prisma.analysis.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ status: 'generating' }) }),
    );
    expect(prisma.analysisView.upsert).toHaveBeenCalledTimes(9);
    // is_current flip order: others off FIRST, then this one on (INV-09).
    expect(prisma.analysis.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isCurrent: false } }),
    );
    expect(prisma.analysis.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'complete', isCurrent: true } }),
    );
    expect(prisma.analysis.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.analysis.update.mock.invocationCallOrder[0],
    );
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'generating' }),
    );
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'complete' }),
    );
  });

  it('INV-11: duplicate delivery of a completed analysis is a no-op', async () => {
    const prisma = mockPrisma();
    prisma.analysis.findUnique.mockResolvedValue({ id: 'a', status: 'complete' });
    const { handler } = makeHandler(prisma);

    await handler.handle(jobData());

    expect(prisma.analysis.upsert).not.toHaveBeenCalled();
    expect(prisma.analysisView.upsert).not.toHaveBeenCalled();
  });

  it('INV-11: duplicate delivery mid-way converges — the analysis row upserts, never duplicates', async () => {
    const prisma = mockPrisma();
    prisma.analysis.findUnique.mockResolvedValue({ id: 'a', status: 'failed' });
    const { handler } = makeHandler(prisma);

    await handler.handle(jobData());

    expect(prisma.analysis.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { status: 'generating' } }),
    );
    expect(prisma.analysisView.upsert).toHaveBeenCalledTimes(9);
  });

  it('provider-pending (Q9 OPEN) fails cleanly: status failed, job completes without retry', async () => {
    const prisma = mockPrisma();
    const pending = { generate: jest.fn().mockRejectedValue(new ProviderPendingError()) };
    const { handler, notify } = makeHandler(prisma, pending as never);

    await expect(handler.handle(jobData())).resolves.toBeUndefined(); // no throw = no retry
    expect(prisma.analysis.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'failed' } }),
    );
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
    expect(prisma.analysisView.upsert).not.toHaveBeenCalled();
  });

  it('transient failure: marks failed (never stuck at generating) AND throws for pg-boss retry', async () => {
    const prisma = mockPrisma();
    const boom = {
      generate: jest.fn().mockRejectedValue(new Error('connection reset')),
    };
    const { handler, notify } = makeHandler(prisma, boom as never);

    await expect(handler.handle(jobData())).rejects.toThrow('connection reset');
    expect(prisma.analysis.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'failed' } }),
    );
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
  });

  it('grounding failure regenerates once, then the view row is INCOMPLETE (A-16; never published)', async () => {
    const prisma = mockPrisma();
    const planted = JSON.parse(JSON.stringify(VALID_VIEW_1));
    planted.items.push({
      ingredient_id: 'garlic_5cloves',
      job: 'Aromatic base',
      if_omitted: 'Flatter sauce',
      tag: 'CARD',
    });
    const adapter = new MockLlmAdapter([
      { view: 1, mode: 'home', output: planted },
      { view: 1, mode: 'chef', output: planted },
      { view: 2, mode: 'home', output: VALID_VIEW_2 },
      { view: 2, mode: 'chef', output: VALID_VIEW_2 },
      { view: 3, mode: 'home', output: VALID_VIEW_3 },
      { view: 3, mode: 'chef', output: VALID_VIEW_3 },
      { view: 4, mode: 'home', output: VALID_VIEW_4 },
      { view: 4, mode: 'chef', output: VALID_VIEW_4 },
      { view: 5, mode: 'home', output: VALID_VIEW_5 },
      { view: 5, mode: 'chef', output: VALID_VIEW_5 },
      { view: 6, mode: 'home', output: VALID_VIEW_6 },
      { view: 6, mode: 'chef', output: VALID_VIEW_6 },
      { view: 7, mode: 'home', output: VALID_VIEW_7 },
      { view: 7, mode: 'chef', output: VALID_VIEW_7 },
    ]);
    const { handler } = makeHandler(prisma, adapter);

    await handler.handle(jobData());

    const view1Upserts = prisma.analysisView.upsert.mock.calls.filter(
      (c) => (c[0] as { create: { viewNumber: number } }).create.viewNumber === 1,
    );
    expect(view1Upserts[view1Upserts.length - 1][0].create.status).toBe('INCOMPLETE');
    expect(prisma.analysisView.upsert).toHaveBeenCalledTimes(9);
  });

  it('sweepStaleGenerating reaps crash remnants → failed + NOTIFY (P3 exit)', async () => {
    const prisma = mockPrisma();
    prisma.analysis.findMany.mockResolvedValue([{ id: 'stale-1' }]);
    const { handler, notify } = makeHandler(prisma);

    const swept = await handler.sweepStaleGenerating(15 * 60 * 1000);

    expect(swept).toBe(1);
    expect(prisma.analysis.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'failed' } }),
    );
    expect(notify).toHaveBeenCalledWith({ analysis_id: 'stale-1', status: 'failed' });
  });

  it('the model pin is the Q9-honest label (never a pretend provider)', () => {
    expect(MODEL_VERSION_LABEL).toBe('stub-no-provider-q9');
  });
});
