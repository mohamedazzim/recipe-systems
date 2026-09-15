// D-27 (P7-3) unit tests — ReviewsService veto transition (Prisma mocked).

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ReviewsService, configuredReviewerEmails } from './reviews.service';

const ANALYSIS_ID = '11111111-1111-4111-8111-111111111111';
const VIEW_ID = '22222222-2222-4222-8222-222222222222';

function reviewer() {
  return { accountId: 'acc-1', email: 'reviewer@test.dev', sub: 'sub-1' };
}

describe('ReviewsService (D-27 G2 veto)', () => {
  const originalEnv = process.env.REVIEWER_EMAILS;

  beforeEach(() => {
    process.env.REVIEWER_EMAILS = 'reviewer@test.dev';
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.REVIEWER_EMAILS;
    else process.env.REVIEWER_EMAILS = originalEnv;
  });

  function service(prisma: any): ReviewsService {
    return new ReviewsService(prisma);
  }

  it('configuredReviewerEmails parses comma-separated, trimmed, case-insensitive slots', () => {
    process.env.REVIEWER_EMAILS = ' A@test.dev , B@test.dev ';
    expect(configuredReviewerEmails()).toEqual(new Set(['a@test.dev', 'b@test.dev']));
  });

  it('an authorized reviewer vetoes a live View 5: COMPLETE → INCOMPLETE (payload untouched)', async () => {
    const prisma = {
      analysis: { findUnique: jest.fn().mockResolvedValue({ id: ANALYSIS_ID }) },
      analysisView: {
        findFirst: jest.fn().mockResolvedValue({
          id: VIEW_ID,
          analysisId: ANALYSIS_ID,
          viewNumber: 5,
          status: 'COMPLETE',
          payload: { family: 'Coastal Tamil', needs_review: true, tag: 'INFERRED' },
        }),
        update: jest.fn().mockResolvedValue({ id: VIEW_ID, status: 'INCOMPLETE' }),
      },
    };
    const svc = service(prisma);

    const result = await svc.vetoView5(reviewer(), ANALYSIS_ID);

    expect(result).toEqual({
      analysis_id: ANALYSIS_ID,
      view_number: 5,
      status: 'INCOMPLETE',
      vetoed: true,
      already_vetoed: false,
    });
    // The veto transition writes ONLY status — never the payload, recipe, or input.
    expect(prisma.analysisView.update).toHaveBeenCalledWith({
      where: { id: VIEW_ID },
      data: { status: 'INCOMPLETE' },
    });
    expect(JSON.stringify(prisma.analysisView.update.mock.calls[0][0])).not.toContain('payload');
  });

  it('a repeat veto is idempotent (already INCOMPLETE → already_vetoed, no second write)', async () => {
    const prisma = {
      analysis: { findUnique: jest.fn().mockResolvedValue({ id: ANALYSIS_ID }) },
      analysisView: {
        findFirst: jest.fn().mockResolvedValue({ id: VIEW_ID, status: 'INCOMPLETE' }),
        update: jest.fn(),
      },
    };
    const svc = service(prisma);

    const result = await svc.vetoView5(reviewer(), ANALYSIS_ID);

    expect(result.already_vetoed).toBe(true);
    expect(prisma.analysisView.update).not.toHaveBeenCalled();
  });

  it('a non-reviewer is forbidden (403 REVIEWER_REQUIRED), no DB write', async () => {
    const prisma = { analysis: { findUnique: jest.fn() }, analysisView: { findFirst: jest.fn() } };
    const svc = service(prisma);

    await expect(
      svc.vetoView5({ accountId: 'acc-x', email: 'outsider@test.dev', sub: 's' }, ANALYSIS_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.analysis.findUnique).not.toHaveBeenCalled();
  });

  it('no configured reviewers → nobody may veto (403)', async () => {
    process.env.REVIEWER_EMAILS = '';
    const prisma = { analysis: { findUnique: jest.fn() }, analysisView: { findFirst: jest.fn() } };
    const svc = service(prisma);

    await expect(svc.vetoView5(reviewer(), ANALYSIS_ID)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('a malformed analysis id is a clean 404 (before Prisma)', async () => {
    const prisma = { analysis: { findUnique: jest.fn() }, analysisView: { findFirst: jest.fn() } };
    const svc = service(prisma);

    await expect(svc.vetoView5(reviewer(), 'not-a-uuid')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.analysis.findUnique).not.toHaveBeenCalled();
  });

  it('a missing analysis is a canonical 404 (no existence leak)', async () => {
    const prisma = {
      analysis: { findUnique: jest.fn().mockResolvedValue(null) },
      analysisView: { findFirst: jest.fn() },
    };
    const svc = service(prisma);

    await expect(svc.vetoView5(reviewer(), ANALYSIS_ID)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.analysisView.findFirst).not.toHaveBeenCalled();
  });
});
