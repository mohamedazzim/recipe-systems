// D-18 read surface: GET /recipes/:recipeId/analysis (API doc §5, RS-US-13).
// Read-only latest-analysis assembly; INV-17 preserved (404 for missing AND
// foreign — no existence leak).

import { NotFoundException } from '@nestjs/common';
import { AnalysisController } from './analysis.controller';

describe('AnalysisController.latestAnalysis (D-18 read route)', () => {
  const prisma = {
    recipe: { findUnique: jest.fn() },
    analysis: { findFirst: jest.fn() },
    analysisView: { findMany: jest.fn() },
    analysisStationCard: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const controller = new AnalysisController(
    {} as never,
    {} as never,
    prisma as never,
  );

  const actor = {
    kind: 'user' as const,
    user: { accountId: 'acc-1', email: 'c@t.dev', sub: 's' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the latest current analysis with its view rows', async () => {
    prisma.recipe.findUnique.mockResolvedValue({ id: 'r1', accountId: 'acc-1', guestSessionId: null });
    prisma.analysis.findFirst.mockResolvedValue({
      id: 'a-1',
      status: 'complete',
      mode: 'home',
      isCurrent: true,
      snapshotOfAnalysisId: null,
      promptVersion: 'v2',
      modelVersion: 'stub-no-provider-q9',
      createdAt: new Date('2026-09-09T10:00:00Z'),
    });
    prisma.analysisView.findMany.mockResolvedValue([
      { viewNumber: 1, viewKey: 'view_1', status: 'COMPLETE', payload: { items: [] } },
    ]);

    const result = await controller.latestAnalysis(
      { actor } as never,
      'aaaaaaaa-0000-4000-8000-000000000001',
    );

    expect(prisma.analysis.findFirst).toHaveBeenCalledWith({
      where: { recipeId: 'aaaaaaaa-0000-4000-8000-000000000001', isCurrent: true },
      orderBy: { createdAt: 'desc' },
    });
    expect(result.analysis_id).toBe('a-1');
    expect(result.snapshot_of_analysis_id).toBeNull(); // D-25 D5 chain
    expect(result.views).toHaveLength(1);
    expect(result.views[0].status).toBe('COMPLETE');
  });

  it('D-25 D5: exposes the linked previous analysis id when present', async () => {
    prisma.recipe.findUnique.mockResolvedValue({ id: 'r1', accountId: 'acc-1', guestSessionId: null });
    prisma.analysis.findFirst.mockResolvedValue({
      id: 'a-2',
      status: 'complete',
      mode: 'home',
      isCurrent: true,
      snapshotOfAnalysisId: 'a-1',
      promptVersion: 'v2',
      modelVersion: 'stub-no-provider-q9',
      createdAt: new Date('2026-09-09T10:00:00Z'),
    });
    prisma.analysisView.findMany.mockResolvedValue([]);

    const result = await controller.latestAnalysis(
      { actor } as never,
      'aaaaaaaa-0000-4000-8000-000000000005',
    );
    expect(result.snapshot_of_analysis_id).toBe('a-1');
  });

  it('foreign recipe → 404 ANALYSIS_NOT_FOUND (INV-17, no existence leak)', async () => {
    prisma.recipe.findUnique.mockResolvedValue({ id: 'r1', accountId: 'acc-OTHER', guestSessionId: null });
    await expect(
      controller.latestAnalysis({ actor } as never, 'aaaaaaaa-0000-4000-8000-000000000002'),
    ).rejects.toMatchObject({
      response: { code: 'ANALYSIS_NOT_FOUND' },
    });
    expect(prisma.analysis.findFirst).not.toHaveBeenCalled();
  });

  it('no analysis yet → 404 ANALYSIS_NOT_FOUND', async () => {
    prisma.recipe.findUnique.mockResolvedValue({ id: 'r1', accountId: 'acc-1', guestSessionId: null });
    prisma.analysis.findFirst.mockResolvedValue(null);
    await expect(
      controller.latestAnalysis({ actor } as never, 'aaaaaaaa-0000-4000-8000-000000000003'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('D-20: includes the station card in the assembly when persisted (frozen wire shape)', async () => {
    prisma.recipe.findUnique.mockResolvedValue({ id: 'r1', accountId: 'acc-1', guestSessionId: null });
    prisma.analysis.findFirst.mockResolvedValue({
      id: 'a-1',
      status: 'complete',
      mode: 'home',
      isCurrent: true,
      promptVersion: 'v2',
      modelVersion: 'stub-no-provider-q9',
      createdAt: new Date('2026-09-09T10:00:00Z'),
    });
    prisma.analysisView.findMany.mockResolvedValue([]);
    prisma.analysisStationCard.findUnique.mockResolvedValue({
      id: 'sc-1',
      analysisId: 'a-1',
      mise: { fish_500g: { display_name: 'Fish — 500g', amount: '500g', tag: 'CARD' } },
      sequence: [{ stage_name: 'Load', action: 'Boil', cue: 'Opaque', duration: 'UNKNOWN', tag: 'METHOD' }],
      doNots: [],
      controlPoints: [],
      productYieldHold: null,
      printable: true,
    });

    const result = await controller.latestAnalysis(
      { actor } as never,
      'aaaaaaaa-0000-4000-8000-000000000004',
    );

    expect(result.station_card).toEqual({
      station_card_id: 'sc-1',
      analysis_id: 'a-1',
      mise: { fish_500g: { display_name: 'Fish — 500g', amount: '500g', tag: 'CARD' } },
      sequence: [{ stage_name: 'Load', action: 'Boil', cue: 'Opaque', duration: 'UNKNOWN', tag: 'METHOD' }],
      do_nots: [],
      control_points: [],
      product_yield_hold: null,
      printable: true,
    });
  });
});

describe('AnalysisController.getStationCard (D-20 P4-2)', () => {
  const prisma = {
    analysis: { findUnique: jest.fn() },
    analysisStationCard: { findUnique: jest.fn() },
  };
  const controller = new AnalysisController({} as never, {} as never, prisma as never);

  const actor = {
    kind: 'user' as const,
    user: { accountId: 'acc-1', email: 'c@t.dev', sub: 's' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the persisted card in the frozen wire shape', async () => {
    prisma.analysis.findUnique.mockResolvedValue({
      id: 'a-1',
      recipe: { accountId: 'acc-1', guestSessionId: null },
    });
    prisma.analysisStationCard.findUnique.mockResolvedValue({
      id: 'sc-1',
      analysisId: 'a-1',
      mise: {},
      sequence: [],
      doNots: [],
      controlPoints: [],
      productYieldHold: null,
      printable: true,
    });

    const result = await controller.getStationCard(
      { actor } as never,
      'aaaaaaaa-0000-4000-8000-000000000001',
    );

    expect(result.station_card_id).toBe('sc-1');
    expect(result.printable).toBe(true);
    expect(result.product_yield_hold).toBeNull();
  });

  it('valid analysis without a card → 404 STATION_CARD_NOT_FOUND (refusal path, never fabricated)', async () => {
    prisma.analysis.findUnique.mockResolvedValue({
      id: 'a-1',
      recipe: { accountId: 'acc-1', guestSessionId: null },
    });
    prisma.analysisStationCard.findUnique.mockResolvedValue(null);

    await expect(
      controller.getStationCard({ actor } as never, 'aaaaaaaa-0000-4000-8000-000000000001'),
    ).rejects.toMatchObject({ response: { code: 'STATION_CARD_NOT_FOUND' } });
  });

  it('foreign analysis → 404 ANALYSIS_NOT_FOUND (INV-17, no existence leak)', async () => {
    prisma.analysis.findUnique.mockResolvedValue({
      id: 'a-1',
      recipe: { accountId: 'acc-OTHER', guestSessionId: null },
    });

    await expect(
      controller.getStationCard({ actor } as never, 'aaaaaaaa-0000-4000-8000-000000000001'),
    ).rejects.toMatchObject({ response: { code: 'ANALYSIS_NOT_FOUND' } });
    expect(prisma.analysisStationCard.findUnique).not.toHaveBeenCalled();
  });

  it('malformed id → clean 404 (UUID guard before Prisma)', async () => {
    await expect(controller.getStationCard({ actor } as never, 'not-a-uuid')).rejects.toMatchObject({
      response: { code: 'ANALYSIS_NOT_FOUND' },
    });
    expect(prisma.analysis.findUnique).not.toHaveBeenCalled();
  });
});

describe('AnalysisController.patchView9Assumptions (D-19 RS-US-45)', () => {
  const analysis = { recomputeView9: jest.fn() };
  const controller = new AnalysisController(analysis as never, {} as never, {} as never);

  const user = { accountId: 'acc-1', email: 'c@t.dev', sub: 's' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('valid body → recompute_queued response (Bearer-only route)', async () => {
    analysis.recomputeView9.mockResolvedValue({
      analysis_id: 'a-1',
      status: 'recompute_queued',
      assumptions: { fish_class: 'lean' },
    });
    const result = await controller.patchView9Assumptions(
      { user } as never,
      'aaaaaaaa-0000-4000-8000-000000000001',
      { fish_class: 'lean' },
    );
    expect(result).toEqual({
      analysis_id: 'a-1',
      status: 'recompute_queued',
      assumptions: { fish_class: 'lean' },
    });
    expect(analysis.recomputeView9).toHaveBeenCalledWith(
      { kind: 'user', user },
      'aaaaaaaa-0000-4000-8000-000000000001',
      { fish_class: 'lean' },
    );
  });

  it('empty body → 400 INVALID_ASSUMPTIONS', async () => {
    await expect(
      controller.patchView9Assumptions(
        { user } as never,
        'aaaaaaaa-0000-4000-8000-000000000001',
        {},
      ),
    ).rejects.toMatchObject({ response: { code: 'INVALID_ASSUMPTIONS' } });
    expect(analysis.recomputeView9).not.toHaveBeenCalled();
  });

  it('unknown field → 400 INVALID_ASSUMPTIONS (strict body)', async () => {
    await expect(
      controller.patchView9Assumptions(
        { user } as never,
        'aaaaaaaa-0000-4000-8000-000000000001',
        { fish_class: 'lean', garlic: true },
      ),
    ).rejects.toMatchObject({ response: { code: 'INVALID_ASSUMPTIONS' } });
  });

  it('non-UUID analysis id → 404 ANALYSIS_NOT_FOUND before any service call', async () => {
    await expect(
      controller.patchView9Assumptions({ user } as never, 'not-a-uuid', { oil_tbsp: 2 }),
    ).rejects.toMatchObject({ response: { code: 'ANALYSIS_NOT_FOUND' } });
    expect(analysis.recomputeView9).not.toHaveBeenCalled();
  });
});

describe('AnalysisController.patchView9Portions (D-26 RS-US-46 / Q14 seam)', () => {
  const analysis = { recomputeView9: jest.fn() };
  const controller = new AnalysisController(analysis as never, {} as never, {} as never);
  const user = { accountId: 'acc-1', email: 'c@t.dev', sub: 's' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('valid body {portions: 4} → recompute_queued with the portions delta', async () => {
    analysis.recomputeView9.mockResolvedValue({
      analysis_id: 'a-1',
      status: 'recompute_queued',
      assumptions: { portions: 4 },
    });
    const result = await controller.patchView9Portions(
      { user } as never,
      'aaaaaaaa-0000-4000-8000-000000000001',
      { portions: 4 },
    );
    expect(analysis.recomputeView9).toHaveBeenCalledWith(
      { kind: 'user', user },
      'aaaaaaaa-0000-4000-8000-000000000001',
      { portions: 4 },
    );
    expect(result.status).toBe('recompute_queued');
  });

  it('non-canonical bodies → 400 INVALID_PORTIONS (5, 0, missing, extra)', async () => {
    for (const body of [{ portions: 5 }, { portions: 0 }, {}, { portions: 3, extra: true }]) {
      await expect(
        controller.patchView9Portions(
          { user } as never,
          'aaaaaaaa-0000-4000-8000-000000000001',
          body,
        ),
      ).rejects.toMatchObject({ response: { code: 'INVALID_PORTIONS' } });
    }
    expect(analysis.recomputeView9).not.toHaveBeenCalled();
  });

  it('malformed analysis id → canonical 404 ANALYSIS_NOT_FOUND', async () => {
    await expect(
      controller.patchView9Portions({ user } as never, 'not-a-uuid', { portions: 3 }),
    ).rejects.toMatchObject({ response: { code: 'ANALYSIS_NOT_FOUND' } });
  });
});
