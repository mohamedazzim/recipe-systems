// D-16 corrected-retry regression guard.
//
// Before this change the worker re-sent the IDENTICAL request on a grounding
// failure — same prompt, no correction — i.e. it asked a misbehaving model the same
// question and hoped for a different answer. The grounding-failure branch now
// re-feeds the violations via the shared `groundingAttempt`/`formatCorrection`
// decision.
//
// Three things must hold, and they are what this file asserts:
//   1. the grounding retry CARRIES a correction instruction;
//   2. the parse-failure retry carries NONE (no violations exist to correct
//      against — that branch is deliberately unchanged);
//   3. a bad correction can only LOWER the publish rate. It can never leak: the
//      verdict gate (`publishDecision`) refuses a still-ungrounded attempt.
import { AnalysisJobData, AnalysisJobHandler } from './analysis-job.handler';

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

const PARSE_INVALID_VIEW_1 = {
  items: [
    { ingredient_id: 'fish_500g', job: 'Protein', if_omitted: 'Not this dish', tag: 'NOT_A_TAG' },
  ],
  role_groups: [],
};

const UNGROUNDED_VIEW_1 = {
  items: [
    {
      ingredient_id: 'ingredient_not_in_capture',
      job: 'Protein, fat, reason for the sour',
      if_omitted: 'Not this dish',
      tag: 'CARD',
    },
  ],
  role_groups: [{ role: 'Body / richness', ingredient_ids: ['ingredient_not_in_capture'] }],
};

const GROUNDED_VIEW_1 = {
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

const OTHER_VIEWS: Record<number, unknown> = {
  2: { pillars: [], blind_spot_notes: [] },
  3: { status: 'COMPLETE', stages: [], incomplete_reason: null },
  4: { substitutions: [] },
  5: {
    family: 'Coastal Tamil (Kanyakumari) style meen kuzhambu',
    architecture: 'Raw-ground paste, triple sour',
    confidence: 'high',
    not_this: [],
    needs_review: true,
    tag: 'INFERRED',
  },
  6: { ratios: [], unresolvable: [] },
  7: { status: 'COMPLETE', memorable_elements: [] },
};

function jobData(): AnalysisJobData {
  return {
    analysis_id: '11111111-1111-4111-8111-111111111111',
    recipe_id: '22222222-2222-4222-8222-222222222222',
    mode: 'home',
    prompt_version: 'v2',
    captured: CAPTURED as AnalysisJobData['captured'],
  };
}

function mockPrisma() {
  return {
    analysis: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    analysisView: { upsert: jest.fn().mockResolvedValue({}), findUnique: jest.fn().mockResolvedValue(null) },
    analysisStationCard: { upsert: jest.fn().mockResolvedValue({}) },
    recipe: { findUnique: jest.fn().mockResolvedValue(null) },
    ingredientDictionary: { findMany: jest.fn().mockResolvedValue([]) },
    ingredientAlias: { findMany: jest.fn().mockResolvedValue([]) },
    dietaryAllergenMapping: { findMany: jest.fn().mockResolvedValue([]) },
    nutritionFoodCompositionEntry: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(async (ops: unknown[]) => {
      for (const op of ops) await op;
    }),
  };
}

/** Serves a scripted sequence for view 1, records every request it is handed. */
function scriptedAdapter(view1Outputs: unknown[]) {
  const seen: Array<{ view: number; correction?: string }> = [];
  let call = 0;
  return {
    seen,
    adapter: {
      providerName: 'stub',
      modelVersion: 'stub:test',
      generate: jest.fn(async (request: { view: number; correction?: string }) => {
        seen.push({ view: request.view, correction: request.correction });
        if (request.view === 1) {
          const output = view1Outputs[Math.min(call, view1Outputs.length - 1)];
          call += 1;
          return JSON.parse(JSON.stringify(output));
        }
        return JSON.parse(JSON.stringify(OTHER_VIEWS[request.view]));
      }),
    },
  };
}

function view1Upserts(prisma: ReturnType<typeof mockPrisma>) {
  return prisma.analysisView.upsert.mock.calls.filter(
    (call) => (call[0] as { create: { viewNumber: number } }).create.viewNumber === 1,
  );
}

describe('D-16 corrected retry', () => {
  it('re-feeds a correction instruction on the grounding retry', async () => {
    const prisma = mockPrisma();
    const { adapter, seen } = scriptedAdapter([UNGROUNDED_VIEW_1, GROUNDED_VIEW_1]);
    const handler = new AnalysisJobHandler(prisma as never, adapter as never, jest.fn() as never);

    await handler.handle(jobData());

    const attempts = seen.filter((s) => s.view === 1);
    expect(attempts).toHaveLength(2);
    // First attempt is sent bare; the retry carries the correction.
    expect(attempts[0].correction).toBeUndefined();
    expect(attempts[1].correction).toContain('ONLY source of truth');
    expect(attempts[1].correction).toContain('UNRESOLVED_INGREDIENT_REFERENCE');
  });

  it('leaves the parse-failure retry uncorrected (no violations to correct against)', async () => {
    const prisma = mockPrisma();
    const { adapter, seen } = scriptedAdapter([PARSE_INVALID_VIEW_1, GROUNDED_VIEW_1]);
    const handler = new AnalysisJobHandler(prisma as never, adapter as never, jest.fn() as never);

    await handler.handle(jobData());

    const attempts = seen.filter((s) => s.view === 1);
    expect(attempts).toHaveLength(2);
    expect(attempts[1].correction).toBeUndefined();
  });

  it('a bad correction lowers the publish rate and still cannot leak', async () => {
    const prisma = mockPrisma();
    // The correction did not help: attempt 2 is ungrounded again.
    const { adapter, seen } = scriptedAdapter([UNGROUNDED_VIEW_1, UNGROUNDED_VIEW_1]);
    const handler = new AnalysisJobHandler(prisma as never, adapter as never, jest.fn() as never);

    await handler.handle(jobData());

    const attempts = seen.filter((s) => s.view === 1);
    expect(attempts[1].correction).toContain('ONLY source of truth'); // it WAS re-fed

    const upserts = view1Upserts(prisma);
    const last = upserts[upserts.length - 1][0] as { create: { status: string; payload: unknown } };
    expect(last.create.status).toBe('INCOMPLETE');
    expect(last.create.payload).toEqual({});
    expect(
      upserts.some((call) => (call[0] as { create: { status: string } }).create.status === 'COMPLETE'),
    ).toBe(false);
  });
});
