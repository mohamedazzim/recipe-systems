// D-17 (P3-3): the API's analysis-enqueue orchestration — READ-ONLY over
// business tables. The API never writes analysis_* (A-17 one-writer BLOCKER);
// it assembles the Q1-labeled job-payload capture (DISPATCH D-17 deliverable 2:
// job-payload approach is the labeled working assumption while Q1 is OPEN —
// SCAFFOLD §7) and hands it to pg-boss.
//
// Gate order (canonical): ownership (INV-17) → D-14 enqueue readiness → 422
// METHOD_REQUIRED (API §5 list-only) → capture → enqueue.

import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { StructuredRecipeInput, View1PayloadSchema, View4PayloadSchema, View5PayloadSchema, View6PayloadSchema } from '@recipe-systems/schemas';
import { PrismaClient } from '@recipe-systems/database';
import { PROMPT_VERSION } from '@recipe-systems/llm-adapter';
import type { Actor } from '../../common/guards/guest-or-jwt.guard';
import { IntakeService } from '../intake/intake.service';
import { RecipeService } from '../recipes/recipe.service';
import { AnalysisQueueService, QueueUnavailableError } from './analysis-queue.service';
import { classifySubstitution, type SubstitutionClass } from './substitution-preview';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** D-19 (P4-1): the RS-US-45 assumption-edit body (View 9 recompute). D-26 I3
 *  adds the Q14 seam: `portions` (RS-US-46, 3|4) — persisted ONLY in the View 9
 *  payload's per_portion (no column; Q14 stays OPEN). */
export interface View9AssumptionDelta {
  fish_class?: 'lean' | 'oily';
  coconut_grams?: number;
  oil_tbsp?: number;
  portions?: 3 | 4;
}

@Injectable()
export class AnalysisService {
  constructor(
    private readonly recipes: RecipeService,
    private readonly intake: IntakeService,
    private readonly queue: AnalysisQueueService,
    @Inject('PRISMA') private readonly prisma: PrismaClient,
  ) {}

  /**
   * Q1-labeled working assumption (DISPATCH D-17 deliverable 2): the captured
   * structured-recipe state is built HERE from the current rows and rides the
   * job payload. The formal snapshot-persistence decision (ERD v14 seam) stays
   * OPEN (SCAFFOLD §7 Q1, due week 5 — BUILD_PLAN §7.2).
   */
  private async buildCapture(actor: Actor, recipeId: string): Promise<StructuredRecipeInput> {
    const recipe = await this.recipes.assertOwned(actor, recipeId);
    const lines = await this.intake.listDraftLines(actor, recipeId);

    const methodSourceTag = recipe.methodSourceTag;
    const methodText = recipe.methodText;

    return {
      structured_recipe: {
        ingredients: lines.map((l) => ({
          id: l.id,
          display_name: l.displayName,
          canonical_name: null, // alias resolution = dictionary (Q5, Track R)
          amount_text: l.amountText,
          quantity: l.amount != null ? Number(l.amount) : null,
          unit: l.unit,
          confirmed_sense: l.confirmedSense,
          category: l.groupName,
          food_id: null, // FK → food_composition_table (Track R)
          include_on_list: l.includeOnList,
        })),
        method_steps:
          methodText != null
            ? [
                {
                  id: 'method-1',
                  text: methodText,
                  // INFERRED (accepted family method) is a matched method —
                  // the prompt vocabulary's METHOD channel (matched=true).
                  source: methodSourceTag === 'METHOD' || methodSourceTag === 'INFERRED' ? 'METHOD' : null,
                },
              ]
            : [],
        method_source: {
          name: methodSourceTag === 'INFERRED' ? recipe.methodInferredSource : null,
          type: null, // video|text not tracked by the D-13 surface
          matched: methodSourceTag === 'INFERRED',
        },
        explicitly_absent: [], // no capture surface records absents yet (C1/P3-4)
        card_metadata: {
          photographed: recipe.photoUri != null,
          legible_issues: [],
        },
      },
    };
  }

  async enqueue(
    actor: Actor,
    recipeId: string,
    mode: 'home' | 'chef',
  ): Promise<{ analysis_id: string; status: 'queued'; prompt_version: string }> {
    await this.recipes.assertOwned(actor, recipeId);

    // D-14 gate — the canonical readiness check (never duplicated).
    const readiness = await this.intake.getEnqueueState(actor, recipeId);
    if (!readiness.can_enqueue) {
      throw new ConflictException({
        code: 'ENQUEUE_BLOCKED',
        message: 'Review flagged lines before analysis',
        details: { blockers: readiness.blockers },
      });
    }

    // API §5: list-only → 422 METHOD_REQUIRED (Views 3 & 7 INCOMPLETE otherwise).
    const method = await this.recipes.getMethodState(actor, recipeId);
    if (method.list_only) {
      throw new UnprocessableEntityException({
        code: 'METHOD_REQUIRED',
        message: 'A method is required before analysis (or accept a matched family method)',
      });
    }

    const captured = await this.buildCapture(actor, recipeId);
    try {
      const analysis_id = await this.queue.enqueue({
        recipe_id: recipeId,
        mode,
        prompt_version: PROMPT_VERSION,
        captured,
      });
      return { analysis_id, status: 'queued', prompt_version: PROMPT_VERSION };
    } catch (err) {
      if (err instanceof QueueUnavailableError) {
        throw new ConflictException({
          code: 'ENQUEUE_UNAVAILABLE',
          message: 'Analysis queue is unavailable — try again later',
        });
      }
      throw err;
    }
  }

  /**
   * D-19 (P4-1) I2: assumption edit → View 9 recompute (RS-US-45). The API
   * validates + enqueues ONLY — the analysis worker performs the recomputation
   * and remains the sole writer of analysis_* (one-writer preserved; the web/API
   * never mutate analysis_view directly). The synchronous 200 of RS-US-45 is
   * satisfied as `recompute_queued` (recorded deviation in HANDOFF §5): the band
   * is persisted by the worker and the UI re-renders on the SSE refresh.
   */
  async recomputeView9(
    actor: Actor,
    analysisId: string,
    delta: View9AssumptionDelta,
  ): Promise<{
    analysis_id: string;
    status: 'recompute_queued';
    assumptions: View9AssumptionDelta;
  }> {
    const analysis = await this.prisma.analysis.findUnique({
      where: { id: analysisId },
      include: { recipe: true },
    });
    if (!analysis) {
      throw new NotFoundException({ code: 'ANALYSIS_NOT_FOUND', message: 'Analysis not found' });
    }
    const owns =
      actor.kind === 'user'
        ? analysis.recipe.accountId === actor.user.accountId
        : analysis.recipe.guestSessionId === actor.guestSessionId;
    if (!owns) {
      throw new NotFoundException({ code: 'ANALYSIS_NOT_FOUND', message: 'Analysis not found' });
    }

    // Q1-labeled working assumption (same as D-17): the recompute input rides
    // the job payload, built from the CURRENT rows.
    const captured = await this.buildCapture(actor, analysis.recipeId);
    try {
      await this.queue.enqueueView9Recompute({
        analysis_id: analysis.id,
        recipe_id: analysis.recipeId,
        delta,
        captured,
      });
    } catch (err) {
      if (err instanceof QueueUnavailableError) {
        throw new ConflictException({
          code: 'ENQUEUE_UNAVAILABLE',
          message: 'Analysis queue is unavailable — try again later',
        });
      }
      throw err;
    }
    return { analysis_id: analysis.id, status: 'recompute_queued', assumptions: delta };
  }

  /**
   * D-25A (C7 / RS-US-18): preview ONE substitution that already exists in the
   * persisted View 4 of the LATEST COMPLETE analysis. READ-ONLY and
   * deterministic — no LLM, no network, no enqueue, no analysis_* writes, no
   * recipe-line writes, no persistence. The classification is derived at
   * preview time from persisted View 1/5/6 evidence + the persisted View 4
   * substitute/consequence (never invented).
   *
   * 404s (canonical): RECIPE_NOT_FOUND (missing/foreign/malformed recipe via
   * assertOwned) · ANALYSIS_NOT_FOUND (no latest complete analysis) ·
   * SUBSTITUTION_NOT_FOUND (the ingredient is not the source of any persisted
   * View 4 substitution, or the id is malformed).
   */
  async previewSubstitution(
    actor: Actor,
    recipeId: string,
    ingredientId: string,
  ): Promise<{
    ingredient_id: string;
    substitute: string;
    classification: SubstitutionClass;
    what_is_lost: string;
  }> {
    const recipe = await this.recipes.assertOwned(actor, recipeId);
    if (!UUID_RE.test(ingredientId)) {
      throw new NotFoundException({
        code: 'SUBSTITUTION_NOT_FOUND',
        message: 'No substitution for that ingredient',
      });
    }
    const analysis = await this.prisma.analysis.findFirst({
      where: { recipeId: recipe.id, isCurrent: true, status: 'complete' },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!analysis) {
      throw new NotFoundException({
        code: 'ANALYSIS_NOT_FOUND',
        message: 'No completed analysis for this recipe',
      });
    }

    const [v1, v4, v5, v6, line] = await Promise.all([
      this.prisma.analysisView.findUnique({
        where: { analysisId_viewNumber: { analysisId: analysis.id, viewNumber: 1 } },
        select: { payload: true },
      }),
      this.prisma.analysisView.findUnique({
        where: { analysisId_viewNumber: { analysisId: analysis.id, viewNumber: 4 } },
        select: { payload: true },
      }),
      this.prisma.analysisView.findUnique({
        where: { analysisId_viewNumber: { analysisId: analysis.id, viewNumber: 5 } },
        select: { payload: true },
      }),
      this.prisma.analysisView.findUnique({
        where: { analysisId_viewNumber: { analysisId: analysis.id, viewNumber: 6 } },
        select: { payload: true },
      }),
      this.prisma.recipeIngredientLine.findUnique({
        where: { id: ingredientId },
        select: { displayName: true, recipeId: true },
      }),
    ]);

    const view4 = v4 ? View4PayloadSchema.safeParse(v4.payload) : null;
    if (!view4?.success) {
      throw new NotFoundException({
        code: 'SUBSTITUTION_NOT_FOUND',
        message: 'No substitution for that ingredient',
      });
    }
    const substitution = view4.data.substitutions.find((s) => s.ingredient_id === ingredientId);
    if (!substitution) {
      throw new NotFoundException({
        code: 'SUBSTITUTION_NOT_FOUND',
        message: 'No substitution for that ingredient',
      });
    }

    // The source line belongs to THIS recipe (a foreign ingredient is never
    // resolved to another recipe's line — it would not be in this View 4).
    const ingredientName =
      line && line.recipeId === recipe.id ? line.displayName : ingredientId;

    const view1 = v1 ? View1PayloadSchema.safeParse(v1.payload) : null;
    const view5 = v5 ? View5PayloadSchema.safeParse(v5.payload) : null;
    const view6 = v6 ? View6PayloadSchema.safeParse(v6.payload) : null;

    const classification = classifySubstitution({
      substitution,
      ingredientName,
      view1: view1?.success ? view1.data : null,
      view5: view5?.success ? view5.data : null,
      view6: view6?.success ? view6.data : null,
    });

    return {
      ingredient_id: ingredientId,
      substitute: substitution.substitute,
      classification,
      what_is_lost: substitution.consequence,
    };
  }
}
