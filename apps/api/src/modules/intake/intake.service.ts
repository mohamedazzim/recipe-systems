// Intake service — the SOLE logical writer of `recipe_input` and
// `recipe_ingredient_line` (Q4 resolved 2026-09-08; one-writer rule ADR §2; INV-03).
//
// IMMUTABILITY (D-10 done criterion): `recipe_input` rows are write-once. This service
// intentionally exposes NO update/delete/upsert method for recipe_input — the absence is
// grep-provable and enforced by the "recipe_input immutability" regression gate.
//
// D-12 (parse review, TEXT scope — decision trace HANDOFF §5 2026-09-09): every
// draft-line mutation (edit/add/delete/split/merge, header marking, sense confirmation)
// lives here, under the Intake writer boundary. Stale-edit rejection is optimistic
// locking on `updated_at` (D-12D). `is_header: true` soft-deletes the line (D-12C:
// ERD v13 has no header column; Recipe_Systems §12 — corrected object has no headers).

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient, RecipeIngredientLine, RecipeInput } from '@recipe-systems/database';
import type { Actor } from '../../common/guards/guest-or-jwt.guard';
import { RecipeService } from '../recipes/recipe.service';

/**
 * Wire shape per API doc §3 + D-12B: `id` and `updated_at` added for line addressing and
 * the stale-edit token; `amount` = amount_text (display), `quantity` = parsed amount,
 * `category` = group_name; `canonical_name` stays null until D-29; `is_header` is always
 * false for active lines (headers are excluded from the corrected object — D-12C).
 */
export interface WireLine {
  id: string;
  display_name: string;
  canonical_name: string | null;
  amount: string | null;
  unit: string | null;
  quantity: number | null;
  category: string | null;
  is_header: boolean;
  include_on_list: boolean;
  confirmed_sense: string | null;
  updated_at: string;
}

export function splitRawLines(rawText: string): string[] {
  // D-12 segmentation: one draft line per newline-delimited raw line OR per
  // semicolon-delimited clause (single-line pastes like
  // "1 lb ground beef; 1 onion, chopped; ..." segment into distinct draft
  // lines). Semantic-free: no amount/unit/sense resolution happens here
  // (those stay in later D-12 stages), and the raw input itself is NEVER
  // mutated — recordPaste stores the original text byte-for-byte before
  // segmentation.
  return rawText
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function toWireLine(line: RecipeIngredientLine): WireLine {
  return {
    id: line.id,
    display_name: line.displayName,
    canonical_name: null, // alias resolution lands with the dictionary (Track R / D-29)
    amount: line.amountText,
    unit: line.unit,
    quantity: line.amount != null ? Number(line.amount) : null,
    category: line.groupName,
    is_header: false, // headers never appear in the corrected object (D-12C)
    include_on_list: line.includeOnList,
    confirmed_sense: line.confirmedSense,
    updated_at: line.updatedAt.toISOString(),
  };
}

/** D-12 line patch fields (wire names already mapped by the controller). */
export interface LinePatch {
  displayName?: string;
  amountText?: string | null;
  unit?: string | null;
  amount?: number | null; // wire "quantity"
  groupName?: string | null; // wire "category"
  confirmedSense?: string | null;
  includeOnList?: boolean;
  /** D-14C: explicit review confirmation. Literal `false` only — clients can never SET
   *  needs_review (OCR/D-11 owns true); clearing is a deliberate user action, never
   *  automatic and never implied by another edit (D-14: no auto-clear). */
  needsReview?: false;
}

/** D-14A: the single enqueue-completeness check (A-14: P3's enqueue must reuse THIS —
 *  no duplicate implementations). Read-only; the canonical flag only (no shadow state).
 *  Field names are the WIRE shape (snake_case, same convention as D-13 MethodState). */
export interface EnqueueState {
  can_enqueue: boolean;
  blockers: Array<{ line_id: string; display_name: string }>;
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
          needsReview: false, // low-confidence flagging is OCR work (D-11, deferred)
          includeOnList: true,
        },
      }),
    );
    return Promise.all(creates);
  }

  /** Non-deleted draft lines in card order. */
  async listDraftLines(actor: Actor, recipeId: string): Promise<RecipeIngredientLine[]> {
    await this.assertOwned(actor, recipeId);
    return this.prisma.recipeIngredientLine.findMany({
      where: { recipeId, deletedAt: null },
      orderBy: { lineNo: 'asc' },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // D-12 parse review (text scope) — all mutations stay inside Intake (Q4)
  // ─────────────────────────────────────────────────────────────────────────────

  /** Load an ACTIVE line of a recipe the actor owns; missing/foreign → 404 (INV-17 shape). */
  private async getOwnedLine(actor: Actor, recipeId: string, lineId: string): Promise<RecipeIngredientLine> {
    await this.assertOwned(actor, recipeId);
    const line = await this.prisma.recipeIngredientLine.findFirst({
      where: { id: lineId, recipeId, deletedAt: null },
    });
    if (!line) {
      throw new NotFoundException({ code: 'LINE_NOT_FOUND', message: 'Line not found' });
    }
    return line;
  }

  /** D-12D: optimistic lock on updated_at — the client echoes the value it read. */
  private assertNotStale(line: RecipeIngredientLine, expectedUpdatedAt: string): void {
    if (Date.parse(expectedUpdatedAt) !== line.updatedAt.getTime()) {
      throw new ConflictException({
        code: 'STALE_EDIT',
        message: 'This line changed since you loaded it — reload and merge your edit',
        details: { current_line: toWireLine(line) },
      });
    }
  }

  /** B3 AC-1: edit a line's review fields (amount parsing fields are user-provided). */
  async updateLine(
    actor: Actor,
    recipeId: string,
    lineId: string,
    patch: LinePatch,
    expectedUpdatedAt: string,
  ): Promise<RecipeIngredientLine> {
    const line = await this.getOwnedLine(actor, recipeId, lineId);
    this.assertNotStale(line, expectedUpdatedAt);
    const data: Prisma.RecipeIngredientLineUpdateInput = {
      displayName: patch.displayName,
      amountText: patch.amountText,
      unit: patch.unit,
      groupName: patch.groupName,
      confirmedSense: patch.confirmedSense,
      includeOnList: patch.includeOnList,
    };
    if (patch.amount !== undefined) {
      data.amount = patch.amount === null ? null : new Prisma.Decimal(patch.amount);
    }
    if (patch.needsReview === false) {
      // D-14C: explicit user confirmation — the ONLY path that clears the flag.
      data.needsReview = false;
    }
    return this.prisma.recipeIngredientLine.update({ where: { id: lineId }, data });
  }

  /** B3 AC-2 header marking (D-12C): is_header=true → soft-delete (excluded from the
   *  corrected object; the raw text stays byte-unchanged in recipe_input). */
  async markHeader(
    actor: Actor,
    recipeId: string,
    lineId: string,
    expectedUpdatedAt: string,
  ): Promise<RecipeIngredientLine> {
    const line = await this.getOwnedLine(actor, recipeId, lineId);
    this.assertNotStale(line, expectedUpdatedAt);
    return this.prisma.recipeIngredientLine.update({
      where: { id: lineId },
      data: { deletedAt: new Date() },
    });
  }

  /** B3 AC-1 delete — soft-delete (C-28 trigger keeps shopping state consistent). */
  async softDeleteLine(actor: Actor, recipeId: string, lineId: string): Promise<void> {
    await this.getOwnedLine(actor, recipeId, lineId);
    await this.prisma.recipeIngredientLine.update({
      where: { id: lineId },
      data: { deletedAt: new Date() },
    });
  }

  /** D-12E: split a wrap-around line at a 1-based character count. Original soft-deleted;
   *  two fresh draft lines with NEW shopping_keys (C-39) at the original position;
   *  review flags inherited, parse fields reset; downstream line_nos shifted +1. */
  async splitLine(
    actor: Actor,
    recipeId: string,
    lineId: string,
    splitPoint: number,
    expectedUpdatedAt: string,
  ): Promise<[RecipeIngredientLine, RecipeIngredientLine]> {
    const line = await this.getOwnedLine(actor, recipeId, lineId);
    this.assertNotStale(line, expectedUpdatedAt);
    if (splitPoint < 1 || splitPoint >= line.displayName.length) {
      throw new BadRequestException({
        code: 'INVALID_SPLIT',
        message: 'split_point must leave two non-empty halves',
      });
    }
    const first = line.displayName.slice(0, splitPoint).trim();
    const second = line.displayName.slice(splitPoint).trim();
    if (!first || !second) {
      throw new BadRequestException({
        code: 'INVALID_SPLIT',
        message: 'split_point must leave two non-empty halves',
      });
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.recipeIngredientLine.update({ where: { id: lineId }, data: { deletedAt: new Date() } });
      await this.shiftLineNos(tx, recipeId, line.lineNo, +1);
      const [l1, l2] = await Promise.all([
        tx.recipeIngredientLine.create({
          data: {
            recipeId,
            shoppingKey: randomUUID(),
            lineNo: line.lineNo,
            displayName: first,
            sourceTag: 'CARD',
            needsReview: line.needsReview, // review flag inherited — never silently cleared
            includeOnList: line.includeOnList,
          },
        }),
        tx.recipeIngredientLine.create({
          data: {
            recipeId,
            shoppingKey: randomUUID(),
            lineNo: line.lineNo + 1,
            displayName: second,
            sourceTag: 'CARD',
            needsReview: line.needsReview,
            includeOnList: line.includeOnList,
          },
        }),
      ]);
      return [l1, l2] as [RecipeIngredientLine, RecipeIngredientLine];
    });
  }

  /** D-12F: merge with the NEXT active line. display_name = line1 + ' ' + line2 (verbatim);
   *  new shopping_key (C-39); needs_review = OR of both (conservative); ocr_confidence
   *  never carried (fresh draft — no fabricated confidence); downstream line_nos −1. */
  async mergeWithNext(
    actor: Actor,
    recipeId: string,
    lineId: string,
    expectedUpdatedAt: string,
  ): Promise<RecipeIngredientLine> {
    const line = await this.getOwnedLine(actor, recipeId, lineId);
    this.assertNotStale(line, expectedUpdatedAt);
    const next = await this.prisma.recipeIngredientLine.findFirst({
      where: { recipeId, deletedAt: null, lineNo: { gt: line.lineNo } },
      orderBy: { lineNo: 'asc' },
    });
    if (!next) {
      throw new BadRequestException({
        code: 'NOTHING_TO_MERGE',
        message: 'No next line to merge with',
      });
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.recipeIngredientLine.update({ where: { id: line.id }, data: { deletedAt: new Date() } });
      await tx.recipeIngredientLine.update({ where: { id: next.id }, data: { deletedAt: new Date() } });
      await this.shiftLineNos(tx, recipeId, next.lineNo, -1);
      return tx.recipeIngredientLine.create({
        data: {
          recipeId,
          shoppingKey: randomUUID(),
          lineNo: line.lineNo,
          displayName: `${line.displayName} ${next.displayName}`,
          sourceTag: 'CARD',
          needsReview: line.needsReview || next.needsReview,
          includeOnList: line.includeOnList,
        },
      });
    });
  }

  /** B3 AC-1 add: append a new ingredient line at the end (API doc gives no position). */
  async addLine(
    actor: Actor,
    recipeId: string,
    patch: LinePatch & { displayName: string },
  ): Promise<RecipeIngredientLine> {
    await this.assertOwned(actor, recipeId);
    const max = await this.prisma.recipeIngredientLine.aggregate({
      where: { recipeId },
      _max: { lineNo: true },
    });
    const data: Prisma.RecipeIngredientLineUncheckedCreateInput = {
      recipeId,
      shoppingKey: randomUUID(),
      lineNo: (max._max.lineNo ?? 0) + 1,
      displayName: patch.displayName,
      sourceTag: 'CARD',
      needsReview: false,
      includeOnList: patch.includeOnList ?? true,
      amountText: patch.amountText ?? null,
      unit: patch.unit ?? null,
      groupName: patch.groupName ?? null,
      confirmedSense: patch.confirmedSense ?? null,
    };
    if (patch.amount !== undefined && patch.amount !== null) {
      data.amount = new Prisma.Decimal(patch.amount);
    }
    return this.prisma.recipeIngredientLine.create({ data });
  }

  /** D-14A / INV-05: the enqueue completeness check. ACTIVE = `deletedAt IS NULL`
   *  (soft-deleted lines never block). Reads the canonical `needs_review` flag only —
   *  no shadow state (A-14). Read-only; ownership enforced via assertOwned (INV-17). */
  async getEnqueueState(actor: Actor, recipeId: string): Promise<EnqueueState> {
    const lines = await this.listDraftLines(actor, recipeId);
    const blockers = lines
      .filter((l) => l.needsReview)
      .map((l) => ({ line_id: l.id, display_name: l.displayName }));
    return { can_enqueue: blockers.length === 0, blockers };
  }

  /** B3 AC-6: the corrected object analysis will read + review status (D-12G);
   *  D-14B: + the shared enqueue state so the UI sees what blocks, line by line. */
  async parsePreview(
    actor: Actor,
    recipeId: string,
  ): Promise<{ status: 'draft' | 'confirmed'; lines: WireLine[]; enqueue: EnqueueState }> {
    const lines = await this.listDraftLines(actor, recipeId);
    const status = lines.some((l) => l.needsReview) ? 'draft' : 'confirmed';
    const enqueue = await this.getEnqueueState(actor, recipeId);
    return { status, lines: lines.map(toWireLine), enqueue };
  }

  /** Shift active line_nos strictly after `afterLineNo` by `delta` (+1/-1) against the
   *  partial unique index (recipe_id, line_no) WHERE deleted_at IS NULL. Order matters:
   *  +1 shifts DOWNWARD (desc) so each row lands in a just-vacated slot; −1 shifts UPWARD
   *  (asc) so each row lands in the vacated slot below it. The opposite order collides. */
  private async shiftLineNos(
    tx: Prisma.TransactionClient,
    recipeId: string,
    afterLineNo: number,
    delta: 1 | -1,
  ): Promise<void> {
    const downstream = await tx.recipeIngredientLine.findMany({
      where: { recipeId, deletedAt: null, lineNo: { gt: afterLineNo } },
      orderBy: { lineNo: delta === 1 ? 'desc' : 'asc' },
    });
    for (const l of downstream) {
      await tx.recipeIngredientLine.update({
        where: { id: l.id },
        data: { lineNo: l.lineNo + delta },
      });
    }
  }
}
