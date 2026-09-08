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

// D-10 decision: intake endpoints accept no title (API doc §3 has no title input).
// `title` is NOT NULL on `recipe`; placeholder until a later unit makes it editable.
export const UNTITLED_RECIPE = 'Untitled recipe';

export interface IntakeRecipeOptions {
  rawText?: string | null;
  photoUri?: string | null;
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

  /** INV-17: the actor must own the recipe. 404 for missing AND foreign rows. */
  async assertOwned(actor: Actor, recipeId: string): Promise<Recipe> {
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
}
