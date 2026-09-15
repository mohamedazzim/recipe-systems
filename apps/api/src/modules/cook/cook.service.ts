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
import { RecipeService } from '../recipes/recipe.service';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** F2 note bound — free text, private, no artificial field invention (ERD §8 TEXT). */
export const NOTE_MAX = 10_000;

/** API §8 POST body — the D-24 slice: no `next_time` (F4/D-26), no `swaps` (F3/D-26). */
export interface CookLogInput {
  /** YYYY-MM-DD; omitted → today (F1 AC-1, TC-01). */
  cookDate?: string;
  /** 1–5 optional (F2 AC-1/AC-2). */
  rating?: number | null;
  /** Free text, private (F2 AC-2). */
  note?: string | null;
}

/** API §8 PATCH body — rating/note only (RS-US-32). */
export interface CookLogPatch {
  rating?: number | null;
  note?: string | null;
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
  ) {}

  /** F1/F2 — log that I cooked it. A NEW row per session (F1 AC-2: multiple
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

  /** F2 (RS-US-32) — edit rating / note on an existing log. Partial body:
   *  omitted fields stay; explicit null clears. Ownership rides the log's
   *  recipe through assertOwned — a foreign log is a canonical 404 with no
   *  existence leak. next_time editing is F4/D-26 (rejected at the boundary). */
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
    if (patch.rating === undefined && patch.note === undefined) {
      return toWire(log);
    }
    const data: Prisma.CookLogUpdateInput = {};
    if (patch.rating !== undefined) data.rating = patch.rating ?? null;
    if (patch.note !== undefined) data.note = patch.note ?? null;
    const updated = await this.prisma.cookLog.update({ where: { id: cookLogId }, data });
    return toWire(updated);
  }
}
