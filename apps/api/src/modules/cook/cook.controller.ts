// D-24 (P6-1) — the cook-log HTTP surface (API doc §8, specified by this unit):
//
//   POST   /recipes/:recipeId/cook-logs   log that I cooked it (F1/F2)
//   GET    /recipes/:recipeId/cook-logs   list logs, newest first (F1 AC-2)
//   GET    /recipes/:recipeId/last-cook   reopen summary (F6)
//   PATCH  /cook-logs/:cookLogId          edit rating/note (RS-US-32)
//
// Writes ride CsrfGuard; reads and writes are GuestOrJwt (the existing
// ownership/session contract — RecipeService.assertOwned answers the
// canonical INV-17 404 for missing, foreign and malformed ids). Non-canonical
// bodies — including `next_time` and `swaps` (F4/F3 → D-26) — are refused at
// the boundary (strict zod), never silently accepted.

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { ActorRequest, GuestOrJwtGuard } from '../../common/guards/guest-or-jwt.guard';
import { CookService, NOTE_MAX, parseCookDate } from './cook.service';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// D-24 slice only: no next_time (F4/D-26), no swaps (F3/D-26) — .strict() rejects them.
const cookLogCreateSchema = z
  .object({
    cook_date: z.string().regex(DATE_RE).optional(),
    rating: z.number().int().min(1).max(5).nullable().optional(),
    note: z.string().max(NOTE_MAX).nullable().optional(),
  })
  .strict();

// RS-US-32 slice only: rating + note. next-time editing is RS-US-34 (D-26).
const cookLogPatchSchema = z
  .object({
    rating: z.number().int().min(1).max(5).nullable().optional(),
    note: z.string().max(NOTE_MAX).nullable().optional(),
  })
  .strict();

const invalidLog = (message: string) =>
  new BadRequestException({ code: 'INVALID_COOK_LOG', message });

@Controller('recipes')
export class CookController {
  constructor(private readonly cook: CookService) {}

  /** F1/F2 — log that I cooked it. 201 + the wire (API §8). */
  @Post(':recipeId/cook-logs')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(GuestOrJwtGuard, CsrfGuard)
  async logCook(
    @Req() req: ActorRequest,
    @Param('recipeId') recipeId: string,
    @Body() body: unknown,
  ) {
    const parsed = cookLogCreateSchema.safeParse(body);
    if (!parsed.success) {
      throw invalidLog(
        'Invalid cook log body: cook_date (YYYY-MM-DD, default today), optional rating 1–5, optional note',
      );
    }
    const d = parsed.data;
    if (d.cook_date !== undefined && parseCookDate(d.cook_date) === null) {
      throw invalidLog('cook_date must be a valid YYYY-MM-DD calendar date');
    }
    const note = d.note?.trim() ?? '';
    return this.cook.logCook(req.actor!, recipeId, {
      cookDate: d.cook_date,
      rating: d.rating ?? null,
      note: note.length > 0 ? note : null,
    });
  }

  /** F1 AC-2 — all logs for the recipe, newest cook first. */
  @Get(':recipeId/cook-logs')
  @UseGuards(GuestOrJwtGuard)
  async listCookLogs(@Req() req: ActorRequest, @Param('recipeId') recipeId: string) {
    const items = await this.cook.listCookLogs(req.actor!, recipeId);
    return { items };
  }

  /** F6 — the reopen summary (last cooked date, rating, next-time line). */
  @Get(':recipeId/last-cook')
  @UseGuards(GuestOrJwtGuard)
  async lastCook(@Req() req: ActorRequest, @Param('recipeId') recipeId: string) {
    return this.cook.lastCook(req.actor!, recipeId);
  }
}

@Controller('cook-logs')
export class CookLogController {
  constructor(private readonly cook: CookService) {}

  /** F2 (RS-US-32) — edit rating / note. Partial body; explicit null clears.
   *  next_time is F4/D-26 and refused here. */
  @Patch(':cookLogId')
  @UseGuards(GuestOrJwtGuard, CsrfGuard)
  async updateCookLog(
    @Req() req: ActorRequest,
    @Param('cookLogId') cookLogId: string,
    @Body() body: unknown,
  ) {
    const parsed = cookLogPatchSchema.safeParse(body);
    if (!parsed.success) {
      throw invalidLog('Invalid cook log update: optional rating 1–5 and/or optional note');
    }
    const d = parsed.data;
    const note = d.note === undefined || d.note === null ? d.note : d.note.trim() === '' ? null : d.note.trim();
    return this.cook.updateCookLog(req.actor!, cookLogId, {
      rating: d.rating,
      note,
    });
  }
}
