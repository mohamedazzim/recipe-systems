// D-17 (P3-3): the analysis job handler — the worker's core. The ONLY writer of
// analysis_* (ADR §2 one-writer; A-17 BLOCKER class). Consumes the D-16 choke
// point (generateGrounded) for every LLM view — never duplicates D-14 readiness
// or D-16 grounding logic.
//
// Idempotency (INV-11 / ADR §14): `analysis.id` is the business identity
// predetermined by the API; duplicate deliveries converge via upserts on
// uq_analysis_view; re-delivery of a completed analysis is a no-op; the
// is_current flip is order-safe against uq_analysis_current.
//
// Failure semantics: permanent configuration errors (no provider — Q9 OPEN)
// mark `failed` and complete the job WITHOUT retry (ADR §14); transient errors
// mark `failed` (never stuck at `generating` — BUILD_PLAN P3 exit) and throw so
// pg-boss retries per the Q13-labeled pilot defaults; crash-mid-job rows are
// swept at startup.

import { Prisma, PrismaClient } from '@recipe-systems/database';
import { StructuredRecipeInput } from '@recipe-systems/schemas';
import { generateGrounded, LlmAdapter } from '@recipe-systems/llm-adapter';
import { ProviderPendingError } from './adapter';

/** Q9-honest model pin: no provider exists yet — the label is recorded, never a
 *  pretend provider (A-17 hygiene: labeled assumptions only). */
export const MODEL_VERSION_LABEL = 'stub-no-provider-q9';

export const ANALYSIS_EVENTS_CHANNEL = 'recipe_analysis_events';

export interface AnalysisJobData {
  analysis_id: string;
  recipe_id: string;
  mode: 'home' | 'chef';
  prompt_version: string;
  /** Q1-labeled working assumption: the captured state rides the job payload
   *  (DISPATCH D-17 deliverable 2; Q1 OPEN in SCAFFOLD §7). */
  captured: StructuredRecipeInput;
}

export type AnalysisStatus = 'generating' | 'complete' | 'failed';

export type NotifyFn = (payload: { analysis_id: string; status: AnalysisStatus }) => Promise<void>;

const LLM_VIEWS = [1, 2, 3, 4, 5, 6, 7] as const;

export class AnalysisJobHandler {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly adapter: LlmAdapter,
    private readonly notify: NotifyFn,
  ) {}

  async handle(data: AnalysisJobData): Promise<void> {
    const existing = await this.prisma.analysis.findUnique({
      where: { id: data.analysis_id },
    });
    // INV-11: duplicate delivery AFTER completion converges — no re-run, no
    // second current row (A-17).
    if (existing?.status === 'complete') {
      return;
    }

    await this.prisma.analysis.upsert({
      where: { id: data.analysis_id },
      create: {
        id: data.analysis_id,
        recipeId: data.recipe_id,
        mode: data.mode,
        status: 'generating',
        isCurrent: false,
        promptVersion: data.prompt_version,
        modelVersion: MODEL_VERSION_LABEL,
      },
      update: { status: 'generating' },
    });
    await this.notify({ analysis_id: data.analysis_id, status: 'generating' });

    try {
      for (const view of LLM_VIEWS) {
        const first = await generateGrounded(
          this.adapter,
          {
            view,
            mode: data.mode,
            recipe_snapshot: data.captured,
            prompt_version: data.prompt_version,
            model_version: MODEL_VERSION_LABEL,
          },
          data.captured,
        );

        if (!first.parse.ok) {
          throw new GenerationFailedError(view, 'schema');
        }

        if (first.grounding && !first.grounding.ok) {
          // D-16 regenerate-once (A-16): second attempt, then INCOMPLETE.
          const second = await generateGrounded(
            this.adapter,
            {
              view,
              mode: data.mode,
              recipe_snapshot: data.captured,
              prompt_version: data.prompt_version,
              model_version: MODEL_VERSION_LABEL,
            },
            data.captured,
          );
          if (!second.parse.ok || (second.grounding && !second.grounding.ok)) {
            // INV-08 refusal representation: the view row is INCOMPLETE; the
            // ungrounded output is never published (payload stays empty).
            await this.upsertView(data.analysis_id, view, 'INCOMPLETE', {});
            continue;
          }
          await this.upsertView(data.analysis_id, view, 'COMPLETE', second.parse.data);
          continue;
        }

        await this.upsertView(data.analysis_id, view, 'COMPLETE', first.parse.data);
      }

      // Deterministic views 8/9: computed by D-18 — until then the refusal form
      // (INCOMPLETE) is the honest persisted state, never fabricated content.
      await this.upsertView(data.analysis_id, 8, 'INCOMPLETE', {});
      await this.upsertView(data.analysis_id, 9, 'INCOMPLETE', {});

      await this.finalize(data.analysis_id, data.recipe_id);
      await this.notify({ analysis_id: data.analysis_id, status: 'complete' });
    } catch (err) {
      if (err instanceof ProviderPendingError) {
        // Permanent configuration error: failed, no retry (ADR §14).
        await this.markFailed(data.analysis_id);
        await this.notify({ analysis_id: data.analysis_id, status: 'failed' });
        return;
      }
      // Transient: mark failed (never stuck at generating) and throw so pg-boss
      // retries with the Q13-labeled backoff. Re-delivery re-marks generating.
      await this.markFailed(data.analysis_id);
      await this.notify({ analysis_id: data.analysis_id, status: 'failed' });
      throw err;
    }
  }

  /** Idempotent view upsert on uq_analysis_view (INV-11). */
  async upsertView(
    analysisId: string,
    viewNumber: number,
    status: 'COMPLETE' | 'INCOMPLETE',
    payload: unknown,
  ): Promise<void> {
    await this.prisma.analysisView.upsert({
      where: { analysisId_viewNumber: { analysisId, viewNumber } },
      create: {
        analysisId,
        viewNumber,
        viewKey: `view_${viewNumber}`,
        status,
        payload: payload as Prisma.InputJsonValue,
      },
      update: { status, payload: payload as Prisma.InputJsonValue },
    });
  }

  /** INV-09: exactly one current analysis per recipe — flip others off first
   *  (order-safe against the partial unique uq_analysis_current), then this on. */
  private async finalize(analysisId: string, recipeId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.analysis.updateMany({
        where: { recipeId, isCurrent: true, id: { not: analysisId } },
        data: { isCurrent: false },
      }),
      this.prisma.analysis.update({
        where: { id: analysisId },
        data: { status: 'complete', isCurrent: true },
      }),
    ]);
  }

  private async markFailed(analysisId: string): Promise<void> {
    await this.prisma.analysis
      .update({ where: { id: analysisId }, data: { status: 'failed' } })
      .catch(() => undefined);
  }

  /** Startup reconciliation: rows stuck at `generating` (crash mid-job) become
   *  `failed` — a failed job is never left at `generating` (P3 exit). */
  async sweepStaleGenerating(olderThanMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMs);
    const stale = await this.prisma.analysis.findMany({
      where: { status: 'generating', createdAt: { lt: cutoff } },
      select: { id: true },
    });
    await this.prisma.analysis.updateMany({
      where: { status: 'generating', createdAt: { lt: cutoff } },
      data: { status: 'failed' },
    });
    for (const row of stale) {
      await Promise.resolve(this.notify({ analysis_id: row.id, status: 'failed' })).catch(
        () => undefined,
      );
    }
    return stale.length;
  }
}

export class GenerationFailedError extends Error {
  constructor(view: number, stage: 'schema' | 'grounding') {
    super(`view ${view} failed the ${stage} gate`);
    this.name = 'GenerationFailedError';
  }
}
