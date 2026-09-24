// BUG-001 regression guard (2026-09-24 external audit, HIGH).
//
// In `processView`, when attempt 1 fails SCHEMA PARSING the handler regenerates
// once — but the retry branch published attempt 2 as COMPLETE on `second.parse.ok`
// alone, never consulting `second.grounding`. The sibling branch (attempt 1 passes
// parsing but fails GROUNDING) correctly required both. So on exactly the retry
// path taken when the model is already misbehaving, an ungrounded payload could
// reach users — voiding the D-16 choke point.
//
// The two branches now share one condition. This test drives the parse-failure
// path with an attempt 2 that parses cleanly but references an ingredient the
// capture does not contain, and asserts the view lands INCOMPLETE with an empty
// payload — i.e. the ungrounded output is never published.
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

/** Attempt 1: schema-INVALID — `tag` is not one of the frozen enum values. */
const PARSE_INVALID_VIEW_1 = {
  items: [
    { ingredient_id: 'fish_500g', job: 'Protein', if_omitted: 'Not this dish', tag: 'NOT_A_TAG' },
  ],
  role_groups: [],
};

/** Attempt 2: schema-VALID, but the reference does not resolve → grounding fails. */
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

/** Returns attempt 1 then attempt 2 for view 1; the other views are stable. */
function retryAdapter(onView1: (call: number) => unknown) {
  let view1Calls = 0;
  return {
    calls: () => view1Calls,
    adapter: {
      providerName: 'stub',
      modelVersion: 'stub:test',
      generate: jest.fn(async (request: { view: number }) => {
        if (request.view === 1) {
          view1Calls += 1;
          return JSON.parse(JSON.stringify(onView1(view1Calls)));
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

describe('BUG-001 — the parse-retry branch must also honour grounding', () => {
  it('never publishes a parse-valid but ungrounded second attempt', async () => {
    const prisma = mockPrisma();
    const { adapter, calls } = retryAdapter((call) =>
      call === 1 ? PARSE_INVALID_VIEW_1 : UNGROUNDED_VIEW_1,
    );
    const handler = new AnalysisJobHandler(prisma as never, adapter as never, jest.fn() as never);

    await handler.handle(jobData());

    // The retry ran (attempt 1 parsed invalid)…
    expect(calls()).toBe(2);

    const upserts = view1Upserts(prisma);
    const last = upserts[upserts.length - 1][0] as {
      create: { status: string; payload: unknown };
    };

    // …and the ungrounded payload was refused, not published.
    expect(last.create.status).toBe('INCOMPLETE');
    expect(last.create.payload).toEqual({});
    expect(
      upserts.some((call) => (call[0] as { create: { status: string } }).create.status === 'COMPLETE'),
    ).toBe(false);
  });

  it('still publishes a second attempt that parses AND grounds (no over-correction)', async () => {
    const prisma = mockPrisma();
    const grounded = {
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
    const { adapter, calls } = retryAdapter((call) =>
      call === 1 ? PARSE_INVALID_VIEW_1 : grounded,
    );
    const handler = new AnalysisJobHandler(prisma as never, adapter as never, jest.fn() as never);

    await handler.handle(jobData());

    expect(calls()).toBe(2);
    const upserts = view1Upserts(prisma);
    const last = upserts[upserts.length - 1][0] as {
      create: { status: string; payload: unknown };
    };
    expect(last.create.status).toBe('COMPLETE');
    expect(last.create.payload).toEqual(grounded);
  });
});
