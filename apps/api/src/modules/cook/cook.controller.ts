// D-24/D-26 (P6-1 + P7-2) — the cook-log HTTP surface (API doc §8):
//
//   POST   /recipes/:recipeId/cook-logs   log that I cooked it (F1/F2/F4)
//   GET    /recipes/:recipeId/cook-logs   list logs, newest first (F1 AC-2)
//   GET    /recipes/:recipeId/last-cook   reopen summary (F6)
//   PATCH  /cook-logs/:cookLogId          edit rating/note/next-time (RS-US-32/34)
//   POST   /cook-logs/:cookLogId/swaps    record a swap (F3/H5 — D-26)
//
// Writes ride CsrfGuard; reads and writes are GuestOrJwt (the existing
// ownership/session contract — RecipeService.assertOwned answers the
// canonical INV-17 404 for missing, foreign and malformed ids). Non-canonical
// bodies are refused at the boundary (strict zod), never silently accepted.

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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { ActorRequest, GuestOrJwtGuard } from '../../common/guards/guest-or-jwt.guard';
import {
  IMAGE_CONTENT_TYPES,
  MAX_IMAGE_BYTES,
  type ImageContentType,
} from '../intake/storage.service';
import { CookService, NEXT_TIME_MAX, NOTE_MAX, parseCookDate } from './cook.service';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// D-24 + D-26 F4: next_time joins the log body; `swaps` still ride their own
// endpoint (POST /cook-logs/:cookLogId/swaps) — .strict() rejects them here.
const cookLogCreateSchema = z
  .object({
    cook_date: z.string().regex(DATE_RE).optional(),
    rating: z.number().int().min(1).max(5).nullable().optional(),
    note: z.string().max(NOTE_MAX).nullable().optional(),
    next_time: z.string().max(NEXT_TIME_MAX).nullable().optional(),
  })
  .strict();

// RS-US-32 + RS-US-34: rating + note + next-time.
const cookLogPatchSchema = z
  .object({
    rating: z.number().int().min(1).max(5).nullable().optional(),
    note: z.string().max(NOTE_MAX).nullable().optional(),
    next_time: z.string().max(NEXT_TIME_MAX).nullable().optional(),
  })
  .strict();

// F3/H5 (D-26): the canonical swap record (API doc §8).
const swapSchema = z
  .object({
    line_id: z.string().uuid().optional(),
    action: z.enum(['skipped', 'reduced', 'increased', 'swapped']),
    swapped_to: z.string().max(255).nullable().optional(),
    reason: z.enum(['restriction', 'pantry', 'other']).nullable().optional(),
    applied_to_card: z.boolean().optional(),
  })
  .strict();

const invalidLog = (message: string) =>
  new BadRequestException({ code: 'INVALID_COOK_LOG', message });

const invalidSwap = (message: string) =>
  new BadRequestException({ code: 'INVALID_SWAP', message });

@Controller('recipes')
export class CookController {
  constructor(private readonly cook: CookService) {}

  /** F1/F2/F4 — log that I cooked it. 201 + the wire (API §8). */
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
        'Invalid cook log body: cook_date (YYYY-MM-DD, default today), optional rating 1–5, optional note, optional next_time',
      );
    }
    const d = parsed.data;
    if (d.cook_date !== undefined && parseCookDate(d.cook_date) === null) {
      throw invalidLog('cook_date must be a valid YYYY-MM-DD calendar date');
    }
    const note = d.note?.trim() ?? '';
    const nextTime = d.next_time?.trim() ?? '';
    return this.cook.logCook(req.actor!, recipeId, {
      cookDate: d.cook_date,
      rating: d.rating ?? null,
      note: note.length > 0 ? note : null,
      nextTime: nextTime.length > 0 ? nextTime : null,
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

  /** F2/F4 (RS-US-32/RS-US-34) — edit rating / note / next-time. Partial body;
   *  explicit null clears. */
  @Patch(':cookLogId')
  @UseGuards(GuestOrJwtGuard, CsrfGuard)
  async updateCookLog(
    @Req() req: ActorRequest,
    @Param('cookLogId') cookLogId: string,
    @Body() body: unknown,
  ) {
    const parsed = cookLogPatchSchema.safeParse(body);
    if (!parsed.success) {
      throw invalidLog(
        'Invalid cook log update: optional rating 1–5, optional note and/or optional next_time',
      );
    }
    const d = parsed.data;
    const note = d.note === undefined || d.note === null ? d.note : d.note.trim() === '' ? null : d.note.trim();
    const nextTime =
      d.next_time === undefined || d.next_time === null
        ? d.next_time
        : d.next_time.trim() === ''
          ? null
          : d.next_time.trim();
    return this.cook.updateCookLog(req.actor!, cookLogId, {
      rating: d.rating,
      note,
      nextTime,
    });
  }

  /** F3/H5 (D-26) — record a swap (historical, immutable). applied_to_card
   *  applies through the Intake module's line surface. 201 + the wire. */
  @Post(':cookLogId/swaps')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(GuestOrJwtGuard, CsrfGuard)
  async recordSwap(
    @Req() req: ActorRequest,
    @Param('cookLogId') cookLogId: string,
    @Body() body: unknown,
  ) {
    const parsed = swapSchema.safeParse(body);
    if (!parsed.success) {
      throw invalidSwap(
        'Invalid swap body: line_id (optional uuid), action skipped|reduced|increased|swapped, ' +
          'swapped_to, reason restriction|pantry|other, applied_to_card',
      );
    }
    const d = parsed.data;
    return this.cook.recordSwap(req.actor!, cookLogId, {
      lineId: d.line_id,
      action: d.action,
      swappedTo: d.swapped_to ?? null,
      reason: d.reason ?? null,
      appliedToCard: d.applied_to_card,
    });
  }

  /** F5 (D-31) — attach the plate photo (ONE image per log). JPEG/PNG, ≤10 MB.
   *  Never triggers re-analysis. 200 + the wire. */
  @Post(':cookLogId/photo')
  @UseGuards(GuestOrJwtGuard, CsrfGuard)
  @UseInterceptors(FileInterceptor('file'))
  async attachPhoto(
    @Req() req: ActorRequest,
    @Param('cookLogId') cookLogId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException({ code: 'INVALID_IMAGE', message: 'JPEG/PNG file required' });
    }
    const contentType = file.mimetype as ImageContentType;
    if (!IMAGE_CONTENT_TYPES.includes(contentType)) {
      throw new BadRequestException({
        code: 'INVALID_IMAGE',
        message: 'Only JPEG/PNG images are accepted (F5)',
      });
    }
    if (file.buffer.length > MAX_IMAGE_BYTES) {
      throw new BadRequestException({
        code: 'IMAGE_TOO_LARGE',
        message: 'Image exceeds the 10 MB upload limit',
      });
    }
    return this.cook.attachPlatePhoto(req.actor!, cookLogId, file.buffer, contentType);
  }

  /** F5 read surface — the plate photo URI for one log (GuestOrJwt). */
  @Get(':cookLogId/photo')
  @UseGuards(GuestOrJwtGuard)
  async platePhoto(@Req() req: ActorRequest, @Param('cookLogId') cookLogId: string) {
    return this.cook.platePhoto(req.actor!, cookLogId);
  }
}
