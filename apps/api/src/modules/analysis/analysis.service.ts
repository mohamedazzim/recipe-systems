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
import { StructuredRecipeInput } from '@recipe-systems/schemas';
import { PrismaClient } from '@recipe-systems/database';
import { PROMPT_VERSION } from '@recipe-systems/llm-adapter';
import type { Actor } from '../../common/guards/guest-or-jwt.guard';
import { IntakeService } from '../intake/intake.service';
import { RecipeService } from '../recipes/recipe.service';
import { AnalysisQueueService, QueueUnavailableError } from './analysis-queue.service';

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
}
