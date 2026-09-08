// Intake service — the SOLE logical writer of `recipe_input` and
// `recipe_ingredient_line` (Q4 resolved 2026-09-08; one-writer rule ADR §2; INV-03).
//
// IMMUTABILITY (D-10 done criterion): `recipe_input` rows are write-once. This service
// intentionally exposes NO update/delete/upsert method for recipe_input — the absence is
// grep-provable and enforced by the "recipe_input immutability" regression gate.
// Draft-line creation is intentionally minimal: each non-empty raw line becomes one draft
// row with the as-written text as display_name (B1: mixed units, "to taste", vernacular
// names preserved verbatim). Parsing/amounts/senses land in D-12 (B3 parse review).

import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient, RecipeIngredientLine, RecipeInput } from '@recipe-systems/database';
import type { Actor } from '../../common/guards/guest-or-jwt.guard';
import { RecipeService } from '../recipes/recipe.service';

/** Wire shape per API doc §3 parse-text 200 (fields not yet parsed stay null/false). */
export interface WireLine {
  display_name: string;
  canonical_name: string | null;
  amount: number | null;
  unit: string | null;
  quantity: number | null;
  category: string | null;
  is_header: boolean;
  include_on_list: boolean;
  confirmed_sense: string | null;
}

export function splitRawLines(rawText: string): string[] {
  return rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function toWireLine(line: RecipeIngredientLine): WireLine {
  return {
    display_name: line.displayName,
    canonical_name: null, // alias resolution lands with the dictionary (Track R / D-12)
    amount: null, // amount parsing is D-12 (B3) work; drafts carry the raw text only
    unit: null,
    quantity: null,
    category: null,
    is_header: false, // header marking is a parse-review action (D-12)
    include_on_list: line.includeOnList,
    confirmed_sense: null,
  };
}

@Injectable()
export class IntakeService {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly recipes: RecipeService,
  ) {}

  /** INV-17 + D-10 ownership enforcement: intake never writes rows for a recipe the
   *  actor does not own. */
  private assertOwned(actor: Actor, recipeId: string): Promise<void> {
    return this.recipes.assertOwned(actor, recipeId).then(() => undefined);
  }

  /** B1 paste: raw row (untouched text) + one draft line per non-empty raw line. */
  async recordPaste(actor: Actor, recipeId: string, rawText: string): Promise<RecipeInput> {
    await this.assertOwned(actor, recipeId);
    return this.prisma.$transaction(async (tx) => {
      const input = await tx.recipeInput.create({
        data: { recipeId, inputType: 'paste', rawText },
      });
      await this.createDraftLinesInTx(tx, recipeId, rawText);
      return input;
    });
  }

  /** B2 photo: raw row carrying ONLY the object-storage URI (ADR §3 — never the blob). */
  async recordPhoto(actor: Actor, recipeId: string, photoUri: string): Promise<RecipeInput> {
    await this.assertOwned(actor, recipeId);
    return this.prisma.recipeInput.create({
      data: { recipeId, inputType: 'photo', photoUri },
    });
  }

  /** B5 form: same persisted object as paste/photo (ERD chk_recipe_input_type).
   *  Service-level only for D-10: API doc §3 defines no form HTTP route yet. */
  async recordForm(actor: Actor, recipeId: string, rawText: string): Promise<RecipeInput> {
    await this.assertOwned(actor, recipeId);
    return this.prisma.recipeInput.create({
      data: { recipeId, inputType: 'form', rawText },
    });
  }

  /** Draft-line creation through the Intake module ONLY (Q4). */
  async createDraftLines(actor: Actor, recipeId: string, rawText: string): Promise<RecipeIngredientLine[]> {
    await this.assertOwned(actor, recipeId);
    return this.prisma.$transaction(async (tx) => this.createDraftLinesInTx(tx, recipeId, rawText));
  }

  private createDraftLinesInTx(
    tx: Prisma.TransactionClient,
    recipeId: string,
    rawText: string,
  ): Promise<RecipeIngredientLine[]> {
    const rawLines = splitRawLines(rawText);
    const creates = rawLines.map((text, index) =>
      tx.recipeIngredientLine.create({
        data: {
          recipeId,
          shoppingKey: randomUUID(),
          lineNo: index + 1,
          displayName: text, // verbatim: B1 mixed units / "to taste" / vernacular names
          sourceTag: 'CARD', // D-10 decision: draft lines carry the card's own words
          needsReview: false, // low-confidence flagging is OCR work (D-11)
          includeOnList: true,
        },
      }),
    );
    return Promise.all(creates);
  }

  /** Non-deleted draft lines in card order (used by the D-10 parse-text response). */
  async listDraftLines(actor: Actor, recipeId: string): Promise<RecipeIngredientLine[]> {
    await this.assertOwned(actor, recipeId);
    return this.prisma.recipeIngredientLine.findMany({
      where: { recipeId, deletedAt: null },
      orderBy: { lineNo: 'asc' },
    });
  }
}
