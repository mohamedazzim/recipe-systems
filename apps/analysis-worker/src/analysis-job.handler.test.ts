// D-17 (P3-3): analysis-job handler tests — the worker's core contract
// (A-17): complete path writes rows through the D-16 choke point; duplicate
// delivery converges (INV-11); is_current flip order-safe (INV-09); provider-
// pending fails cleanly (never stuck at generating); transient failures throw
// for pg-boss retry; the startup sweep reaps crash remnants; NOTIFY is sent on
// every transition (INV-16: signal only).

import { LlmPermanentProviderError, MockLlmAdapter } from '@recipe-systems/llm-adapter';
import { ProviderPendingError } from './adapter';
import { AnalysisJobData, AnalysisJobHandler, MODEL_VERSION_LABEL } from './analysis-job.handler';
import * as deterministicViews from './deterministic-views';

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
  analysisView: { upsert: jest.Mock; findUnique: jest.Mock };
  analysisStationCard: { upsert: jest.Mock };
  ingredientDictionary: { findMany: jest.Mock };
  ingredientAlias: { findMany: jest.Mock };
  dietaryAllergenMapping: { findMany: jest.Mock };
  nutritionFoodCompositionEntry: { findMany: jest.Mock };
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
    analysisView: {
      upsert: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    analysisStationCard: { upsert: jest.fn().mockResolvedValue({}) },
    ingredientDictionary: { findMany: jest.fn().mockResolvedValue([]) },
    ingredientAlias: { findMany: jest.fn().mockResolvedValue([]) },
    dietaryAllergenMapping: { findMany: jest.fn().mockResolvedValue([]) },
    nutritionFoodCompositionEntry: { findMany: jest.fn().mockResolvedValue([]) },
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

  it('real-LLM-latency regression: a redelivered job RESUMES — COMPLETE views are skipped, never regenerated', async () => {
    const prisma = mockPrisma();
    prisma.analysis.findUnique.mockResolvedValue({ id: 'a', status: 'generating' });
    prisma.analysisView.findUnique.mockResolvedValue({ status: 'COMPLETE' });
    const adapter = stubAdapter();
    const generateSpy = jest.spyOn(adapter, 'generate');
    const { handler, notify } = makeHandler(prisma, adapter);

    await handler.handle(jobData());

    expect(generateSpy).not.toHaveBeenCalled();
    // Only the deterministic Views 8/9 are re-upserted; Views 1–7 are kept as-is.
    expect(prisma.analysisView.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.analysis.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'complete', isCurrent: true } }),
    );
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ status: 'complete' }));
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

  it('Q9: a permanent DeepSeek provider error (401/403/400) fails cleanly with NO retry (ADR §14)', async () => {
    const prisma = mockPrisma();
    const deepseek401 = {
      providerName: 'deepseek',
      generate: jest
        .fn()
        .mockRejectedValue(new LlmPermanentProviderError('DeepSeek rejected the request (HTTP 401)')),
    };
    const { handler, notify } = makeHandler(prisma, deepseek401 as never);

    await expect(handler.handle(jobData())).resolves.toBeUndefined(); // no throw = no retry
    expect(prisma.analysis.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'failed' } }),
    );
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
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

  it('D-20: the station card is persisted when a method exists and View 3 is COMPLETE', async () => {
    const prisma = mockPrisma();
    prisma.analysisView.findUnique.mockResolvedValue({
      viewNumber: 3,
      status: 'COMPLETE',
      payload: {
        status: 'COMPLETE',
        stages: [
          {
            stage_name: 'Load and heat',
            action: 'Add fish, drumstick, chilli; cover; boil then reduce to medium',
            cue: 'Fish opaque and just flaking',
            duration: 'About 5-6 minutes after boil',
            tag: 'METHOD',
          },
        ],
        incomplete_reason: null,
      },
    });
    const { handler } = makeHandler(prisma);

    await handler.handle(jobData());

    expect(prisma.analysisStationCard.upsert).toHaveBeenCalledTimes(1);
    const card = prisma.analysisStationCard.upsert.mock.calls[0][0] as {
      create: { mise: Record<string, unknown>; sequence: unknown[]; doNots: unknown[]; controlPoints: unknown[] };
    };
    expect(card.create.mise).toHaveProperty('fish_500g');
    expect(card.create.sequence).toHaveLength(1);
    expect(card.create.doNots).toEqual([
      { item: 'garlic', tag: 'ABSENT', note: 'Confirmed absent at review — do not add.' },
    ]);
    expect(card.create.controlPoints).toEqual([
      { stage_name: 'Load and heat', cue: 'Fish opaque and just flaking', tag: 'METHOD' },
    ]);
  });

  it('D-20: NO card when View 3 is missing (the refusal path)', async () => {
    const prisma = mockPrisma();
    const { handler } = makeHandler(prisma);

    await handler.handle(jobData());

    expect(prisma.analysisStationCard.upsert).not.toHaveBeenCalled();
  });

  it('D-19: deterministic views 8/9 are COMPLETE with the frozen payload shapes (no LLM)', async () => {
    const prisma = mockPrisma();
    const { handler } = makeHandler(prisma);

    await handler.handle(jobData());

    const view8Upserts = prisma.analysisView.upsert.mock.calls.filter(
      (c) => (c[0] as { create: { viewNumber: number } }).create.viewNumber === 8,
    );
    const view9Upserts = prisma.analysisView.upsert.mock.calls.filter(
      (c) => (c[0] as { create: { viewNumber: number } }).create.viewNumber === 9,
    );
    expect(view8Upserts).toHaveLength(1);
    expect(view8Upserts[0][0].create.status).toBe('COMPLETE');
    const view8Payload = view8Upserts[0][0].create.payload as {
      present: unknown[];
      disclaimer: string;
    };
    expect(view8Payload.disclaimer).toBe(
      'Reads the card only. Does not test food. Does not know your kitchen. Not medical advice.',
    );
    expect(JSON.stringify(view8Payload).toLowerCase()).not.toContain('safe');

    expect(view9Upserts).toHaveLength(1);
    expect(view9Upserts[0][0].create.status).toBe('COMPLETE');
    const view9Payload = view9Upserts[0][0].create.payload as {
      band: { energy_kcal_min: number; energy_kcal_max: number };
      sodium: string;
      disclaimer: string;
    };
    expect(view9Payload.band.energy_kcal_min).toBeLessThanOrEqual(view9Payload.band.energy_kcal_max);
    expect(view9Payload.sodium).toBe('unknown');
    expect(view9Payload.disclaimer).toBe(
      'Table estimate from stated assumptions. Not a lab analysis. Not medical advice.',
    );
  });

  it('D-19: view-9 recompute merges the delta over persisted assumptions (worker is the writer)', async () => {
    const prisma = mockPrisma();
    prisma.analysis.findUnique.mockResolvedValue({ id: 'a1', status: 'complete' });
    prisma.analysisView.findUnique.mockResolvedValue({
      id: 'v9',
      payload: {
        assumptions: [
          { key: 'fish_class', value: 'lean-to-oily (species unknown)', tag: 'ASSUMED' },
          { key: 'coconut_grams', value: '150–200', tag: 'ASSUMED' },
          { key: 'oil_tbsp', value: '1–2', tag: 'ASSUMED' },
        ],
      },
    });
    const { handler } = makeHandler(prisma);

    await handler.handleView9Recompute({
      analysis_id: 'a1',
      recipe_id: 'r1',
      delta: { fish_class: 'lean' },
      captured: CAPTURED as never,
    });

    const view9Upserts = prisma.analysisView.upsert.mock.calls.filter(
      (c) => (c[0] as { create: { viewNumber: number } }).create.viewNumber === 9,
    );
    expect(view9Upserts).toHaveLength(1);
    const payload = view9Upserts[0][0].create.payload as {
      assumptions: Array<{ key: string; value: string | number }>;
    };
    expect(payload.assumptions.find((a) => a.key === 'fish_class')?.value).toBe('lean');
  });

  it('D-19: view-9 recompute for a never-materialized analysis is a no-op', async () => {
    const prisma = mockPrisma();
    prisma.analysis.findUnique.mockResolvedValue(null);
    const { handler } = makeHandler(prisma);

    await handler.handleView9Recompute({
      analysis_id: 'missing',
      recipe_id: 'r1',
      delta: { oil_tbsp: 2 },
      captured: CAPTURED as never,
    });

    expect(prisma.analysisView.upsert).not.toHaveBeenCalled();
  });

  it('A-19 gate: an invalid deterministic payload is never published (view 8 → INCOMPLETE)', async () => {
    const prisma = mockPrisma();
    const { handler } = makeHandler(prisma);
    const spy = jest
      .spyOn(deterministicViews, 'computeView8')
      .mockResolvedValue({ present: 'not-an-array' } as never);

    await handler.handle(jobData());
    spy.mockRestore();

    const view8Upserts = prisma.analysisView.upsert.mock.calls.filter(
      (c) => (c[0] as { create: { viewNumber: number } }).create.viewNumber === 8,
    );
    expect(view8Upserts[view8Upserts.length - 1][0].create.status).toBe('INCOMPLETE');
    expect(view8Upserts[view8Upserts.length - 1][0].create.payload).toEqual({});
    // the invalid payload was never persisted
    const persisted = view8Upserts.map((c) => (c[0] as { create: { payload: unknown } }).create.payload);
    expect(persisted).not.toContain(expect.objectContaining({ present: 'not-an-array' }));
  });

  it('A-19 gate: an invalid recompute payload throws and never overwrites the persisted view 9', async () => {
    const prisma = mockPrisma();
    prisma.analysis.findUnique.mockResolvedValue({ id: 'a1', status: 'complete' });
    prisma.analysisView.findUnique.mockResolvedValue({
      id: 'v9',
      payload: { assumptions: [] },
    });
    const { handler } = makeHandler(prisma);
    const spy = jest
      .spyOn(deterministicViews, 'computeView9')
      .mockResolvedValue({ band: 'not-a-band' } as never);

    await expect(
      handler.handleView9Recompute({
        analysis_id: 'a1',
        recipe_id: 'r1',
        delta: { fish_class: 'lean' },
        captured: CAPTURED as never,
      }),
    ).rejects.toThrow('frozen schema');
    spy.mockRestore();

    expect(prisma.analysisView.upsert).not.toHaveBeenCalled();
  });
});
