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
    expect(result.views).toHaveLength(1);
    expect(result.views[0].status).toBe('COMPLETE');
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
