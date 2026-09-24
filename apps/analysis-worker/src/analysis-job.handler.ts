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
import {
  StructuredRecipeInput,
  View3PayloadSchema,
  View8PayloadSchema,
  View9PayloadSchema,
} from '@recipe-systems/schemas';
import { generateGrounded, groundingAttempt, LlmAdapter, LlmPermanentProviderError } from '@recipe-systems/llm-adapter';
import { renderAllergenLine } from '@recipe-systems/rendering';
import { ProviderPendingError } from './adapter';
import {
  computeView8,
  computeView9,
  DEFAULT_OVERRIDES,
  mergeOverrides,
  overridesFromPayload,
  View9AssumptionDelta,
} from './deterministic-views';
import { buildStationCard } from './station-card';

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

/** D-19 (P4-1): the RS-US-45 assumption-edit recompute job (View 9 only). */
export interface View9RecomputeJobData {
  analysis_id: string;
  recipe_id: string;
  delta: View9AssumptionDelta;
  /** Q1-labeled working assumption: the captured state rides the job payload
   *  (same assumption as AnalysisJobData). */
  captured: StructuredRecipeInput;
}

const LLM_VIEWS = [1, 2, 3, 4, 5, 6, 7] as const;

/**
 * Q9 performance pass (measured): Views 1–7 are INDEPENDENT prompts (each gets
 * the full D-15 pair + captured snapshot) — sequential generation summed to
 * ~10–17 min per analysis (real DeepSeek, 13–352 s/view). Generation runs with
 * this bounded concurrency; validation is unchanged (D-05 parse + D-16
 * grounding per view, regenerate-once, Views 8/9 deterministic after).
 */
function viewConcurrency(): number {
  const raw = Number(process.env.ANALYSIS_VIEW_CONCURRENCY ?? 4);
  if (!Number.isFinite(raw)) return 4;
  return Math.min(LLM_VIEWS.length, Math.max(1, Math.floor(raw)));
}

export class AnalysisJobHandler {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly adapter: LlmAdapter,
    private readonly notify: NotifyFn,
  ) {}

  async handle(data: AnalysisJobData): Promise<void> {
    const modelVersion = this.adapter.modelVersion ?? MODEL_VERSION_LABEL;
    // RS-US servings: the recipe's yield is context the views reason against
    // (per-portion thinking, chef ratios). Read once per job; the capture itself
    // stays the source-faithful ingredient object.
    const recipe = await this.prisma.recipe.findUnique({
      where: { id: data.recipe_id },
      select: { servings: true },
    });
    const servings = recipe?.servings ?? null;
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
        modelVersion,
      },
      update: { status: 'generating' },
    });
    await this.notify({ analysis_id: data.analysis_id, status: 'generating' });

    try {
      // Q9 performance pass: Views 1–7 generate CONCURRENTLY (bounded by
      // ANALYSIS_VIEW_CONCURRENCY, default 4). Every view still passes the
      // D-05 schema gate and the D-16 grounding choke point individually, and
      // a redelivered job still skips COMPLETE views (per-view resume).
      const errors: Array<{ view: number; error: Error }> = [];
      let nextViewIndex = 0;
      const lanes = Array.from({ length: viewConcurrency() }, async () => {
        while (nextViewIndex < LLM_VIEWS.length) {
          const view = LLM_VIEWS[nextViewIndex];
          nextViewIndex += 1;
          try {
            await this.processView(data, view, modelVersion, servings);
          } catch (err) {
            errors.push({ view, error: err as Error });
          }
        }
      });
      await Promise.all(lanes);

      if (errors.length > 0) {
        const permanent = errors.find(
          (e) =>
            e.error instanceof ProviderPendingError ||
            e.error instanceof LlmPermanentProviderError,
        );
        // Never stuck at `generating` (P3 exit). Permanent → no retry;
        // transient/schema → throw so pg-boss retries (per-view resume makes
        // the retry cheap — COMPLETE views are skipped).
        await this.markFailed(data.analysis_id);
        await this.notify({ analysis_id: data.analysis_id, status: 'failed' });
        if (permanent) {
          return;
        }
        throw errors[0].error;
      }

      // Deterministic views 8/9 (D-19): computed here from the captured state +
      // the D-29 reviewed reference tables — NO LLM (Deterministic Views v2 §4).
      // A-19 correction: the deterministic payloads pass the SAME frozen-schema
      // gate as the LLM path (INV-08 refusal semantics — an invalid payload is
      // never published; the view row goes INCOMPLETE instead).
      const view8Payload = await computeView8(this.prisma, data.captured);
      if (!View8PayloadSchema.safeParse(view8Payload).success) {
        await this.upsertView(data.analysis_id, 8, 'INCOMPLETE', {});
      } else {
        await this.upsertView(data.analysis_id, 8, 'COMPLETE', view8Payload);
      }
      const view9Payload = await computeView9(this.prisma, data.captured);
      if (!View9PayloadSchema.safeParse(view9Payload).success) {
        await this.upsertView(data.analysis_id, 9, 'INCOMPLETE', {});
      } else {
        await this.upsertView(data.analysis_id, 9, 'COMPLETE', view9Payload);
      }

      // D-20 (P4-2): the station card — deterministic, derived from the capture
      // + the persisted View 3 row (INV-10). No method/View 3 INCOMPLETE → no
      // card (the refusal path). Idempotent upsert on the unique analysis_id.
      await this.upsertStationCard(data.analysis_id, data.captured);

      await this.finalize(data.analysis_id, data.recipe_id);
      await this.notify({ analysis_id: data.analysis_id, status: 'complete' });
    } catch (err) {
      if (
        err instanceof ProviderPendingError ||
        err instanceof LlmPermanentProviderError
      ) {
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

  /**
   * One LLM view end-to-end (Q9 performance pass extraction): redelivery skip →
   * generateGrounded (D-05 parse + D-16 grounding inside) → regenerate-once on
   * grounding violations → COMPLETE/INCOMPLETE upsert. Throws on schema failure
   * (transient — the retry regenerates only non-COMPLETE views) and on provider
   * errors (classified by the caller).
   */
  private async processView(
    data: AnalysisJobData,
    view: (typeof LLM_VIEWS)[number],
    modelVersion: string,
    servings: number | null,
  ): Promise<void> {
    // Real-LLM-latency regression: a redelivered job (pg-boss expiry while a
    // pass was still running) must RESUME, not regenerate — a COMPLETE view
    // row is kept as-is (INV-11 extension to per-view granularity). This
    // prevents duplicate provider spend and two passes racing over the same
    // views.
    const done = await this.prisma.analysisView.findUnique({
      where: { analysisId_viewNumber: { analysisId: data.analysis_id, viewNumber: view } },
    });
    if (done?.status === 'COMPLETE') {
      console.log(`analysis ${data.analysis_id} view ${view} already COMPLETE — skip (redelivery)`);
      return;
    }

    const request = {
      view,
      mode: data.mode,
      // RS-US servings: the yield rides ALONGSIDE the capture (the frozen
      // capture schema is unchanged; grounding still validates against
      // `data.captured`, never this augmented snapshot).
      recipe_snapshot: servings == null ? data.captured : { ...data.captured, servings },
      prompt_version: data.prompt_version,
      model_version: modelVersion,
    };
    const started = Date.now();
    const first = await generateGrounded(this.adapter, request, data.captured);
    console.log(
      `analysis ${data.analysis_id} view ${view} attempt 1 [${this.adapter.providerName}]: ` +
        `${Date.now() - started}ms parse=${first.parse.ok ? 'ok' : 'invalid'} ` +
        `grounding=${first.grounding ? (first.grounding.ok ? 'ok' : 'violations:' + first.grounding.violations.length) : 'n/a'}`,
    );

    if (!first.parse.ok) {
      // D-05 refusal (model-switch regression fix): a schema-invalid output is
      // NEVER published. Regenerate once (A-16 parity with the grounding path),
      // then the view row goes INCOMPLETE — a job must not fail and retry-storm
      // over a deterministic schema mismatch while its other views are already
      // COMPLETE (observed live with flash tag-enum outputs).
      const secondStarted = Date.now();
      const second = await generateGrounded(this.adapter, request, data.captured);
      console.log(
        `analysis ${data.analysis_id} view ${view} attempt 2 [${this.adapter.providerName}]: ` +
          `${Date.now() - secondStarted}ms parse=${second.parse.ok ? 'ok' : 'invalid'} ` +
          `grounding=${second.grounding ? (second.grounding.ok ? 'ok' : 'violations:' + second.grounding.violations.length) : 'n/a'}`,
      );
      // DEAD-003: both retry branches share one verdict (see publishDecision).
      const decision = this.publishDecision(second);
      await this.upsertView(
        data.analysis_id,
        view,
        decision.publish ? 'COMPLETE' : 'INCOMPLETE',
        decision.publish ? decision.payload : {},
      );
      return;
    }

    if (first.grounding && !first.grounding.ok) {
      // D-16 corrected retry (A-16): regenerate ONCE, re-feeding the violations as
      // a correction instruction. The worker used to re-send the IDENTICAL request
      // here — asking a misbehaving model the same question and hoping for a
      // different answer. `groundingAttempt` is the shared D-16 decision and
      // supplies the correction (it calls formatCorrection itself).
      //
      // Scoped to this branch only: the parse-failure branch above has no
      // violations to correct against, so its request is deliberately unchanged.
      const correction = groundingAttempt(1, first.grounding.violations);
      const retryRequest = {
        ...request,
        ...(correction.action === 'regenerate'
          ? { correction: correction.correction_instruction }
          : {}),
      };
      const secondStarted = Date.now();
      const second = await generateGrounded(this.adapter, retryRequest, data.captured);
      console.log(
        `analysis ${data.analysis_id} view ${view} attempt 2 corrected [${this.adapter.providerName}]: ` +
          `${Date.now() - secondStarted}ms parse=${second.parse.ok ? 'ok' : 'invalid'} ` +
          `grounding=${second.grounding ? (second.grounding.ok ? 'ok' : 'violations:' + second.grounding.violations.length) : 'n/a'}`,
      );
      // INV-08 refusal representation: an ungrounded (or unparseable) second
      // attempt leaves the row INCOMPLETE with an empty payload — never published.
      const decision = this.publishDecision(second);
      // A/B seam: the verdict is the publish rate's single source, and it stays the
      // final gate — the worst case of a bad correction is a LOWER publish rate,
      // never a leaked payload. The guardrail (a published attempt-2 that still
      // carried violations) is impossible by construction, so this line paired with
      // the attempt-2 line above is the whole measurement.
      console.log(
        `analysis ${data.analysis_id} view ${view} attempt-2 verdict: ` +
          `${decision.publish ? 'published' : 'refused_incomplete'}`,
      );
      await this.upsertView(
        data.analysis_id,
        view,
        decision.publish ? 'COMPLETE' : 'INCOMPLETE',
        decision.publish ? decision.payload : {},
      );
      return;
    }

    await this.upsertView(data.analysis_id, view, 'COMPLETE', first.parse.data);
  }

  /**
   * D-19 (P4-1) I2 recompute: the RS-US-45 assumption edit. Deterministic,
   * View 9 ONLY (ERD §15.4 granularity — labeled D-19 assumption; Views 1–7 are
   * never regenerated). The API enqueues this job; the worker is still the ONLY
   * writer of analysis_* (one-writer preserved). The updated assumptions persist
   * in analysis_view.payload.assumptions (frozen View9PayloadSchema).
   */
  async handleView9Recompute(data: View9RecomputeJobData): Promise<void> {
    const analysis = await this.prisma.analysis.findUnique({
      where: { id: data.analysis_id },
    });
    if (!analysis) return; // never materialized — nothing to recompute

    const existing = await this.prisma.analysisView.findUnique({
      where: {
        analysisId_viewNumber: { analysisId: data.analysis_id, viewNumber: 9 },
      },
    });
    const current = existing ? overridesFromPayload(existing.payload) : DEFAULT_OVERRIDES;
    const merged = mergeOverrides(current, data.delta);
    // D-26 I3 / Q14 seam: portions persist ONLY in the payload's per_portion.
    // An assumption-only recompute carries the last portion count forward (the
    // payload convention); a portions delta overwrites it. No column exists.
    const priorPortions =
      existing &&
      existing.payload &&
      typeof existing.payload === 'object' &&
      (existing.payload as { per_portion?: { portions?: number } | null }).per_portion?.portions;
    const portions = data.delta.portions ?? (priorPortions === 3 || priorPortions === 4 ? priorPortions : undefined);
    const payload = await computeView9(this.prisma, data.captured, merged, portions);
    // A-19 correction: never overwrite a valid persisted payload with an
    // invalid one — a producer bug throws (pg-boss retries per the Q13-labeled
    // defaults) and the existing payload stays intact.
    if (!View9PayloadSchema.safeParse(payload).success) {
      throw new Error('deterministic view 9 recompute failed the frozen schema (A-19 gate)');
    }
    await this.upsertView(data.analysis_id, 9, 'COMPLETE', payload);
    // Signal-only (INV-16): the status is still 'complete' — the SSE listener
    // refreshes the persisted payload.
    await this.notify({ analysis_id: data.analysis_id, status: 'complete' });
  }

  /**
   * The ONE verdict for a regenerated attempt (BUG-001 / DEAD-003).
   *
   * An attempt may be published only if it BOTH parses and grounds. Both retry
   * branches used to spell that out separately, and the parse-failure branch
   * omitted the grounding half — which is how an ungrounded payload reached users
   * on exactly the retry path taken when the model is misbehaving. One helper, so
   * the two can never drift apart again.
   *
   * Returns a discriminated decision rather than a boolean on purpose: the
   * published payload is `parse.data`, which only type-checks while `parse.ok` is
   * narrowed. A plain boolean would lose that narrowing at the call site.
   */
  private publishDecision(
    attempt: Awaited<ReturnType<typeof generateGrounded>>,
  ): { publish: true; payload: unknown } | { publish: false } {
    if (!attempt.parse.ok) return { publish: false };
    if (attempt.grounding && !attempt.grounding.ok) return { publish: false };
    return { publish: true, payload: attempt.parse.data };
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

  /**
   * D-20 (P4-2): persist the station card when its precondition holds (method
   * present + View 3 COMPLETE). The card is assembled from the capture + the
   * persisted View 3 — never free prose (INV-10). No card → no row (the
   * refusal path; a pre-existing card from an earlier delivery is left intact
   * only for completed analyses, which converge via INV-11).
   */
  private async upsertStationCard(
    analysisId: string,
    captured: StructuredRecipeInput,
  ): Promise<void> {
    const view3Row = await this.prisma.analysisView.findUnique({
      where: { analysisId_viewNumber: { analysisId, viewNumber: 3 } },
    });
    const parsedView3 = view3Row ? View3PayloadSchema.safeParse(view3Row.payload) : null;
    const card = buildStationCard(captured, parsedView3?.success ? parsedView3.data : null);
    if (!card) {
      return;
    }
    // Q2 Option A (D-23): persist the FROZEN View-8 allergen line of THIS
    // analysis with the card — print never re-derives it from the current
    // effective-dated mapping (ADR §7 amendment 2026-09-11).
    const view8Row = await this.prisma.analysisView.findUnique({
      where: { analysisId_viewNumber: { analysisId, viewNumber: 8 } },
    });
    const parsedView8 = view8Row ? View8PayloadSchema.safeParse(view8Row.payload) : null;
    const allergenLine = parsedView8?.success ? renderAllergenLine(parsedView8.data) : null;
    await this.prisma.analysisStationCard.upsert({
      where: { analysisId },
      create: {
        analysisId,
        mise: card.mise as unknown as Prisma.InputJsonValue,
        sequence: card.sequence as unknown as Prisma.InputJsonValue,
        doNots: card.do_nots as unknown as Prisma.InputJsonValue,
        controlPoints: card.control_points as unknown as Prisma.InputJsonValue,
        productYieldHold: Prisma.JsonNull,
        allergenLine,
        printable: true,
      },
      update: {
        mise: card.mise as unknown as Prisma.InputJsonValue,
        sequence: card.sequence as unknown as Prisma.InputJsonValue,
        doNots: card.do_nots as unknown as Prisma.InputJsonValue,
        controlPoints: card.control_points as unknown as Prisma.InputJsonValue,
        productYieldHold: Prisma.JsonNull,
        allergenLine,
        printable: true,
      },
    });
  }

  /** INV-09: exactly one current analysis per recipe — flip others off first
   *  (order-safe against the partial unique uq_analysis_current), then this on.
   *  D-25 D5: the snapshot chain is linked HERE — the previous current analysis
   *  (same recipe) is captured BEFORE the flip and persisted as the new
   *  analysis's `snapshot_of_analysis_id` (composite self-FK
   *  fk_analysis_snapshot_same_recipe). No `cook_log.analysis_id` column is
   *  added — logs stay on recipe_id; the chain makes last + current reachable. */
  private async finalize(analysisId: string, recipeId: string): Promise<void> {
    const previous = await this.prisma.analysis.findFirst({
      where: { recipeId, isCurrent: true, id: { not: analysisId } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    await this.prisma.$transaction([
      this.prisma.analysis.updateMany({
        where: { recipeId, isCurrent: true, id: { not: analysisId } },
        data: { isCurrent: false },
      }),
      this.prisma.analysis.update({
        where: { id: analysisId },
        data: {
          status: 'complete',
          isCurrent: true,
          snapshotOfAnalysisId: previous?.id ?? null,
        },
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
