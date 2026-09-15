// D-24 (P6-1) — the cook-loop writer (F1/F2/F6, API doc §8). The API cook
// module is the SOLE writer of cook_log_* (one-writer rule, ADR §2) — the
// new QG2 gate proves no cook_log writes exist outside this module. Reads of
// cook_log elsewhere (library indicator, delete asset cleanup) remain allowed.
//
// Wire contract (API doc §8, endpoints specified by dispatch unit D-24):
//   POST   /recipes/:recipeId/cook-logs  → 201 CookLogWire (cook_date default
//                                          today, editable; rating 1–5 optional;
//                                          note optional — F1/F2)
//   GET    /recipes/:recipeId/cook-logs  → 200 { items: CookLogWire[] }
//   PATCH  /cook-logs/:cookLogId         → 200 CookLogWire (rating/note only,
//                                          RS-US-32; next-time editing is
//                                          F4/D-26 — not this unit)
//   GET    /recipes/:recipeId/last-cook  → 200 LastCookWire (F6 reopen surface)
//
// NON-GOALS (DISPATCH D-24): swaps (F3), the next-time FIELD (F4), plate
// photos (F5) — those endpoints are D-26/D-31 and are not implemented here.
// next_time_instruction is only SURFACED when a row carries it (F4/D-26 will
// write it); D-24 never writes it.
//
// Ownership: every route rides RecipeService.assertOwned (INV-17) — 404 for
// missing, foreign and malformed ids; the log's existence never leaks.

import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@recipe-systems/database';
import type { Actor } from '../../common/guards/guest-or-jwt.guard';
import { IntakeService } from '../intake/intake.service';
import { RecipeService } from '../recipes/recipe.service';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** F2 note bound — free text, private, no artificial field invention (ERD §8 TEXT). */
export const NOTE_MAX = 10_000;

/** F4 (D-26) next-time bound — a printed station-card line, not prose. */
export const NEXT_TIME_MAX = 1_000;

/** API §8 POST body — the D-24 slice plus the F4 next-time write (D-26): no
 *  `swaps` on the log body (swaps ride POST /cook-logs/:cookLogId/swaps). */
export interface CookLogInput {
  /** YYYY-MM-DD; omitted → today (F1 AC-1, TC-01). */
  cookDate?: string;
  /** 1–5 optional (F2 AC-1/AC-2). */
  rating?: number | null;
  /** Free text, private (F2 AC-2). */
  note?: string | null;
  /** F4 dedicated next-time line (tagged COOK LOG on the card, never CARD). */
  nextTime?: string | null;
}

/** API §8 PATCH body — rating/note (RS-US-32) + next-time (RS-US-34, F4). */
export interface CookLogPatch {
  rating?: number | null;
  note?: string | null;
  nextTime?: string | null;
}

/** API §8 swap body (F3/H5). */
export interface SwapInput {
  lineId?: string;
  action: 'skipped' | 'reduced' | 'increased' | 'swapped';
  swappedTo?: string | null;
  reason?: 'restriction' | 'pantry' | 'other' | null;
  appliedToCard?: boolean;
}

export interface SwapWire {
  swap_id: string;
  cook_log_id: string;
  line_id: string | null;
  ingredient_name_snapshot: string;
  action: 'skipped' | 'reduced' | 'increased' | 'swapped';
  swapped_to: string | null;
  reason: 'restriction' | 'pantry' | 'other' | null;
  applied_to_card: boolean;
  created_at: string;
}

export interface CookLogWire {
  cook_log_id: string;
  recipe_id: string;
  cook_date: string;
  rating: number | null;
  note: string | null;
  next_time: string | null;
  created_at: string;
}

export interface LastCookWire {
  last_cooked_at: string | null;
  rating: number | null;
  next_time: string | null;
}

/** Server-local today as YYYY-MM-DD (the cook_date default, F1 TC-01). */
export function localToday(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Strict YYYY-MM-DD calendar-date parse — `2026-02-31` → null (a regex
 *  alone passes impossible dates). Returns a UTC-midnight Date. */
export function parseCookDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return date;
}

/** `@db.Date` columns come back as UTC-midnight Dates — the wire is the date part. */
function dateToWire(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type LogRow = {
  id: string;
  recipeId: string;
  cookedAt: Date;
  rating: number | null;
  note: string | null;
  nextTimeInstruction: string | null;
  createdAt: Date;
};

function toWire(row: LogRow): CookLogWire {
  return {
    cook_log_id: row.id,
    recipe_id: row.recipeId,
    cook_date: dateToWire(row.cookedAt),
    rating: row.rating,
    note: row.note,
    next_time: row.nextTimeInstruction,
    created_at: row.createdAt.toISOString(),
  };
}

const invalidLog = (message: string) =>
  new BadRequestException({ code: 'INVALID_COOK_LOG', message });

@Injectable()
export class CookService {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly recipes: RecipeService,
    private readonly intake: IntakeService,
  ) {}

  /** F1/F2/F4 — log that I cooked it. A NEW row per session (F1 AC-2: multiple
   *  logs kept, never merged). cook_date defaults to today, editable. */
  async logCook(actor: Actor, recipeId: string, input: CookLogInput): Promise<CookLogWire> {
    await this.recipes.assertOwned(actor, recipeId);
    // Service-level defense behind the controller's zod boundary (same refusal).
    const cookedAt = input.cookDate === undefined ? null : parseCookDate(input.cookDate);
    if (input.cookDate !== undefined && cookedAt === null) {
      throw invalidLog('cook_date must be a valid YYYY-MM-DD calendar date');
    }
    if (input.rating !== undefined && input.rating !== null) {
      if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
        throw invalidLog('rating must be a whole number 1–5 (or omitted)');
      }
    }
    const created = await this.prisma.cookLog.create({
      data: {
        recipeId,
        cookedAt: cookedAt ?? parseCookDate(localToday())!,
        rating: input.rating ?? null,
        note: input.note ?? null,
        nextTimeInstruction: input.nextTime ?? null,
      },
    });
    return toWire(created);
  }

  /** F1 AC-3 / reopen — all logs, newest cook first (the ERD's own index
   *  ix_cook_log_recipe_date orders recipe_id, cooked_at DESC). */
  async listCookLogs(actor: Actor, recipeId: string): Promise<CookLogWire[]> {
    await this.recipes.assertOwned(actor, recipeId);
    const rows = await this.prisma.cookLog.findMany({
      where: { recipeId },
      orderBy: [{ cookedAt: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(toWire);
  }

  /** F6 — the reopen summary: last cooked date + rating + next-time line
   *  (surfaced when present; only F4/D-26 writes it). Null-safe for recipes
   *  with no logs yet. */
  async lastCook(actor: Actor, recipeId: string): Promise<LastCookWire> {
    await this.recipes.assertOwned(actor, recipeId);
    const row = await this.prisma.cookLog.findFirst({
      where: { recipeId },
      orderBy: [{ cookedAt: 'desc' }, { createdAt: 'desc' }],
      select: { cookedAt: true, rating: true, nextTimeInstruction: true },
    });
    return {
      last_cooked_at: row ? dateToWire(row.cookedAt) : null,
      rating: row?.rating ?? null,
      next_time: row?.nextTimeInstruction ?? null,
    };
  }

  /** F2/F4 (RS-US-32/RS-US-34) — edit rating / note / next-time on an existing
   *  log. Partial body: omitted fields stay; explicit null clears. Ownership
   *  rides the log's recipe through assertOwned — a foreign log is a canonical
   *  404 with no existence leak. */
  async updateCookLog(actor: Actor, cookLogId: string, patch: CookLogPatch): Promise<CookLogWire> {
    if (!UUID_RE.test(cookLogId)) {
      throw new NotFoundException({ code: 'COOK_LOG_NOT_FOUND', message: 'Cook log not found' });
    }
    const log = await this.prisma.cookLog.findUnique({ where: { id: cookLogId } });
    if (!log) {
      throw new NotFoundException({ code: 'COOK_LOG_NOT_FOUND', message: 'Cook log not found' });
    }
    await this.recipes.assertOwned(actor, log.recipeId);
    // An empty partial body is a canonical no-op — the unchanged log comes
    // back (Prisma forbids an empty update data object).
    if (patch.rating === undefined && patch.note === undefined && patch.nextTime === undefined) {
      return toWire(log);
    }
    const data: Prisma.CookLogUpdateInput = {};
    if (patch.rating !== undefined) data.rating = patch.rating ?? null;
    if (patch.note !== undefined) data.note = patch.note ?? null;
    if (patch.nextTime !== undefined) data.nextTimeInstruction = patch.nextTime ?? null;
    const updated = await this.prisma.cookLog.update({ where: { id: cookLogId }, data });
    return toWire(updated);
  }

  /**
   * F3/H5 (D-26) — record a swap against a cook log. The row is a HISTORICAL
   * RECORD (no update/delete surface exists anywhere — immutability). Recording
   * NEVER touches the card; `applied_to_card: true` applies through the INTAKE
   * module's line-edit surface (Q4 one-writer preserved: skipped → soft-delete;
   * reduced/increased/swapped → amount_text edit with the current updated_at).
   * D-26G-labeled assumption: an applied `swapped`/`reduced`/`increased` edits
   * amount_text only — the full swap record rides this row (auditable).
   */
  async recordSwap(actor: Actor, cookLogId: string, input: SwapInput): Promise<SwapWire> {
    if (!UUID_RE.test(cookLogId)) {
      throw new NotFoundException({ code: 'COOK_LOG_NOT_FOUND', message: 'Cook log not found' });
    }
    const log = await this.prisma.cookLog.findUnique({ where: { id: cookLogId } });
    if (!log) {
      throw new NotFoundException({ code: 'COOK_LOG_NOT_FOUND', message: 'Cook log not found' });
    }
    await this.recipes.assertOwned(actor, log.recipeId);

    let line: { id: string; shoppingKey: string; displayName: string; amountText: string | null; updatedAt: Date } | null = null;
    if (input.lineId !== undefined) {
      const row = await this.prisma.recipeIngredientLine.findFirst({
        where: { id: input.lineId, recipeId: log.recipeId, deletedAt: null },
        select: { id: true, shoppingKey: true, displayName: true, amountText: true, updatedAt: true },
      });
      if (!row) {
        throw new BadRequestException({
          code: 'INVALID_SWAP',
          message: 'line_id must reference a live line of the same recipe',
        });
      }
      line = row;
    }
    const swappedTo = input.swappedTo?.trim() || null;
    const applied = input.appliedToCard === true;
    if (applied && line === null) {
      throw new BadRequestException({
        code: 'INVALID_SWAP',
        message: 'applied_to_card requires a line_id',
      });
    }
    if (applied && input.action !== 'skipped' && swappedTo === null) {
      throw new BadRequestException({
        code: 'INVALID_SWAP',
        message: 'applied reduced/increased/swapped requires swapped_to',
      });
    }

    const created = await this.prisma.cookLogSwap.create({
      data: {
        cookLogId: log.id,
        shoppingKey: line?.shoppingKey ?? null,
        ingredientNameSnapshot: line?.displayName ?? input.swappedTo?.trim() ?? '',
        changeType: input.action,
        originalValue: line?.amountText ?? null,
        actualValue: swappedTo,
        appliedToRecipe: applied,
      },
    });

    // Apply through Intake (Q4 one-writer) — AFTER the record lands (record-first).
    if (applied && line) {
      if (input.action === 'skipped') {
        await this.intake.softDeleteLine(actor, log.recipeId, line.id);
      } else {
        await this.intake.updateLine(
          actor,
          log.recipeId,
          line.id,
          { amountText: swappedTo },
          line.updatedAt.toISOString(),
        );
      }
    }

    return {
      swap_id: created.id,
      cook_log_id: created.cookLogId,
      line_id: line?.id ?? null,
      ingredient_name_snapshot: created.ingredientNameSnapshot,
      action: created.changeType as SwapWire['action'],
      swapped_to: created.actualValue,
      reason: input.reason ?? null,
      applied_to_card: created.appliedToRecipe,
      created_at: created.createdAt.toISOString(),
    };
  }
}
