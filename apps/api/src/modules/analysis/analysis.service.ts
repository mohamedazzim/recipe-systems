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
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { StructuredRecipeInput } from '@recipe-systems/schemas';
import { PROMPT_VERSION } from '@recipe-systems/llm-adapter';
import type { Actor } from '../../common/guards/guest-or-jwt.guard';
import { IntakeService } from '../intake/intake.service';
import { RecipeService } from '../recipes/recipe.service';
import { AnalysisQueueService, QueueUnavailableError } from './analysis-queue.service';

@Injectable()
export class AnalysisService {
  constructor(
    private readonly recipes: RecipeService,
    private readonly intake: IntakeService,
    private readonly queue: AnalysisQueueService,
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
}
