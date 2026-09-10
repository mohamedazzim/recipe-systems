// Recipe service — the Web API's writer of the `recipe` table (one-writer rule, ADR §2).
// Intake (D-10) creates recipes through this service and delegates raw-input and
// draft-line persistence to the Intake module (Q4 resolved 2026-09-08: the BFF exposes
// endpoints, Intake owns recipe_input / recipe_ingredient_line writes).
//
// Ownership enforcement (D-09/D-10): every intake-created recipe carries exactly one
// owner (chk_recipe_owner_xor); `assertOwned` answers 404 for both missing and foreign
// recipes so recipe existence never leaks across accounts/guest sessions (INV-17).

import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient, Recipe } from '@recipe-systems/database';
import type { Actor } from '../../common/guards/guest-or-jwt.guard';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// D-10 decision: intake endpoints accept no title (API doc §3 has no title input).
// `title` is NOT NULL on `recipe`; placeholder until a later unit makes it editable.
export const UNTITLED_RECIPE = 'Untitled recipe';

export interface IntakeRecipeOptions {
  rawText?: string | null;
  photoUri?: string | null;
}

/** D-13 (B4): the method-attach modes the API surface exposes (API doc §4). */
export type MethodAttachInput =
  | { mode: 'none' }
  | { mode: 'paste'; methodText: string }
  | { mode: 'inferred'; methodText: string; methodSource: string };

/** D-13 (B4): the wire response — `list_only` is the flag P3 asserts for Views 3/7 INCOMPLETE. */
export interface MethodState {
  method_tag: 'METHOD' | 'INFERRED' | null;
  method_source: string | null;
  list_only: boolean;
}

/**
 * D-13D/G (HANDOFF §5): the persisted contract is `method_text` + `method_source_tag`
 * (CARD/METHOD/INFERRED/UNKNOWN vocabulary) + `method_inferred_source` (required when
 * INFERRED). D-13 writes METHOD (paste) and INFERRED (accepted family match) only.
 */
function toMethodState(recipe: Recipe): MethodState {
  const tag = recipe.methodSourceTag === 'METHOD' || recipe.methodSourceTag === 'INFERRED'
    ? recipe.methodSourceTag
    : null;
  return {
    method_tag: tag,
    method_source: tag === 'INFERRED' ? recipe.methodInferredSource : null,
    list_only: tag === null,
  };
}

@Injectable()
export class RecipeService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  /** Create the recipe row that an intake event will attach to (ADR §4 step 2). */
  async createForIntake(actor: Actor, opts: IntakeRecipeOptions = {}): Promise<Recipe> {
    const data: Prisma.RecipeUncheckedCreateInput = {
      title: UNTITLED_RECIPE,
      rawText: opts.rawText ?? null,
      photoUri: opts.photoUri ?? null,
    };
    if (actor.kind === 'user') {
      data.accountId = actor.user.accountId;
    } else {
      data.guestSessionId = actor.guestSessionId;
    }
    return this.prisma.recipe.create({ data });
  }

  /** INV-17: the actor must own the recipe. 404 for missing AND foreign rows.
   *  QA-B4 fix: non-UUID ids are format-guarded BEFORE Prisma — a malformed id
   *  is a clean 404 (same as missing), never a Prisma P2023 → 500. */
  async assertOwned(actor: Actor, recipeId: string): Promise<Recipe> {
    if (!UUID_RE.test(recipeId)) {
      throw new NotFoundException({ code: 'RECIPE_NOT_FOUND', message: 'Recipe not found' });
    }
    const recipe = await this.prisma.recipe.findUnique({ where: { id: recipeId } });
    if (!recipe) {
      throw new NotFoundException({ code: 'RECIPE_NOT_FOUND', message: 'Recipe not found' });
    }
    const owns =
      actor.kind === 'user'
        ? recipe.accountId === actor.user.accountId
        : recipe.guestSessionId === actor.guestSessionId;
    if (!owns) {
      throw new NotFoundException({ code: 'RECIPE_NOT_FOUND', message: 'Recipe not found' });
    }
    return recipe;
  }

  /** Compensation path (D-10K): remove an intake-created recipe ONLY when no intake
   *  rows ever attached — used when a photo intake fails after the recipe row landed. */
  async removeIfIntakeEmpty(actor: Actor, recipeId: string): Promise<void> {
    const recipe = await this.assertOwned(actor, recipeId);
    const inputCount = await this.prisma.recipeInput.count({ where: { recipeId: recipe.id } });
    if (inputCount === 0) {
      await this.prisma.recipe.delete({ where: { id: recipe.id } });
    }
  }

  /**
   * D-13 (B4 / RS-US-09): set or attach a method on the corrected object.
   * - `none`     → clears all three method columns (list-only: Views 3/7 INCOMPLETE flag).
   * - `paste`    → user-provided method text, tag METHOD (no inferred source).
   * - `inferred` → accepted matched family method, tag INFERRED + named source (ERD: required).
   * One-writer rule (ADR §2): this service is the sole writer of the `recipe` table.
   */
  async attachMethod(actor: Actor, recipeId: string, input: MethodAttachInput): Promise<MethodState> {
    await this.assertOwned(actor, recipeId);
    const data: Prisma.RecipeUncheckedUpdateInput = {};
    switch (input.mode) {
      case 'none':
        data.methodText = null;
        data.methodSourceTag = null;
        data.methodInferredSource = null;
        break;
      case 'paste':
        data.methodText = input.methodText;
        data.methodSourceTag = 'METHOD';
        data.methodInferredSource = null;
        break;
      case 'inferred':
        data.methodText = input.methodText;
        data.methodSourceTag = 'INFERRED';
        data.methodInferredSource = input.methodSource;
        break;
    }
    const updated = await this.prisma.recipe.update({ where: { id: recipeId }, data });
    return toMethodState(updated);
  }

  /** D-17 (P3-3): read-only method state — the API §5 422 METHOD_REQUIRED gate
   *  (list-only analysis) and the job-payload capture both read this. */
  async getMethodState(actor: Actor, recipeId: string): Promise<MethodState> {
    const recipe = await this.assertOwned(actor, recipeId);
    return toMethodState(recipe);
  }
}
