// D-27 (P7-3): G2 regional veto — the review module is the SOLE writer of the
// veto transition (analysis_view.status COMPLETE → INCOMPLETE, View 5 only).
// This is the ONE deliberate exception to "the worker writes analysis_*"
// (ADR §8: "…or the affected View 5 is marked incomplete according to the
// review policy"); QG2 gate 1 is refined to exempt this module and gate 2h
// confines it to exactly this transition.
//
// The review EVENT is recorded OUTSIDE the canonical recipe (structured
// governance log) — no review-event table, no publishable/approval column,
// no ERD redesign (ADR §8 deliberately keeps the review table out of ERD v13
// for the pilot). Q6 stays OPEN (labeled working assumption, recorded in
// HANDOFF H-27).

import { ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@recipe-systems/database';
import type { SessionPayload } from '../auth/session';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export interface VetoResult {
  analysis_id: string;
  view_number: number;
  status: 'INCOMPLETE';
  vetoed: true;
  already_vetoed: boolean;
}

/** D-27: the env-configured regional-reviewer slots (pilot). Never fabricated —
 *  the contracted reviewers fill these slots; a missing slot = no one may veto. */
export function configuredReviewerEmails(): Set<string> {
  const raw = process.env.REVIEWER_EMAILS ?? '';
  return new Set(
    raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  /**
   * G2 TC-01: a configured regional reviewer vetoes a live View 5 regional
   * sentence → the whole View 5 leaves live views immediately
   * (COMPLETE → INCOMPLETE). Irreversible for the current analysis; a
   * re-analysis (D-25/D5) generates a fresh analysis whose View 5 is new.
   *
   * Auth (controller): Bearer only (JwtAuthGuard) — no guest bypass. The
   * reviewer is authorized globally by slot, NOT by recipe ownership: the
   * response leaks no recipe/owner data (analysis_id + view_number + status
   * only). Missing/malformed analysis → canonical 404 (INV-17 shape, no
   * existence leak of the underlying recipe).
   */
  async vetoView5(user: SessionPayload, analysisId: string): Promise<VetoResult> {
    const reviewers = configuredReviewerEmails();
    if (reviewers.size === 0 || !reviewers.has(user.email.toLowerCase())) {
      throw new ForbiddenException({
        code: 'REVIEWER_REQUIRED',
        message: 'Not an authorized regional reviewer',
      });
    }

    if (!UUID_RE.test(analysisId)) {
      throw new NotFoundException({ code: 'ANALYSIS_NOT_FOUND', message: 'Analysis not found' });
    }
    const analysis = await this.prisma.analysis.findUnique({
      where: { id: analysisId },
      select: { id: true },
    });
    if (!analysis) {
      throw new NotFoundException({ code: 'ANALYSIS_NOT_FOUND', message: 'Analysis not found' });
    }

    const view5 = await this.prisma.analysisView.findFirst({
      where: { analysisId, viewNumber: 5 },
    });
    if (!view5) {
      // A completed analysis always has one view per number (INV-08); a missing
      // View 5 is a 404, not an error to fabricate.
      throw new NotFoundException({ code: 'ANALYSIS_NOT_FOUND', message: 'Analysis not found' });
    }

    if (view5.status === 'INCOMPLETE') {
      // Repeat veto = idempotent no-op (the sentence is already blocked).
      return {
        analysis_id: analysisId,
        view_number: 5,
        status: 'INCOMPLETE',
        vetoed: true,
        already_vetoed: true,
      };
    }

    // The veto transition — the review module's sole analysis_* write. The
    // View 5 payload JSON is NEVER touched (no silent rewrite of the analysis;
    // recipe / recipe_input are untouched).
    await this.prisma.analysisView.update({
      where: { id: view5.id },
      data: { status: 'INCOMPLETE' },
    });

    // Review event OUTSIDE the canonical recipe (governance log). No table.
    this.logger.warn(
      `review veto: analysis=${analysisId} view=${view5.id} reviewer=${user.email} at=${new Date().toISOString()}`,
    );

    return {
      analysis_id: analysisId,
      view_number: 5,
      status: 'INCOMPLETE',
      vetoed: true,
      already_vetoed: false,
    };
  }
}
