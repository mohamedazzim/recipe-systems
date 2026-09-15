// Intake controller — the BFF HTTP surface for intake + parse review (API doc §3:
// POST /recipes/parse-text, POST /recipes/upload, and the RS-US-08 review routes).
// Per Q4 (resolved 2026-09-08): this controller EXPOSES endpoints and orchestrates;
// all recipe_input and recipe_ingredient_line mutations go through the Intake module only.
// D-12 (text scope, decision trace HANDOFF §5 2026-09-09): review routes are JwtAuthGuard
// per the API doc's "Auth: Bearer" labels (D-12A); intake routes stay "Bearer or guest".

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  ServiceUnavailableException,
  UnprocessableEntityException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { Actor, ActorRequest, GuestOrJwtGuard } from '../../common/guards/guest-or-jwt.guard';
import { AuthedRequest, JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RecipeService } from '../recipes/recipe.service';
import { IntakeService, LinePatch } from './intake.service';
import { IMAGE_CONTENT_TYPES, ImageContentType, MAX_IMAGE_BYTES, StorageService } from './storage.service';

const parseTextSchema = z.object({ text: z.string().min(1) });

// D-12 wire contract (API doc §3 PATCH body + D-12D expected_updated_at token)
// D-14C: needs_review accepts literal `false` only — clearing a flag is an explicit
// user confirmation; clients can never set needs_review (OCR/D-11 owns true).
const patchLineSchema = z
  .object({
    display_name: z.string().min(1).max(255).optional(),
    amount: z.string().max(128).nullable().optional(),
    unit: z.string().max(64).nullable().optional(),
    quantity: z.number().finite().nonnegative().nullable().optional(),
    category: z.string().max(64).nullable().optional(),
    confirmed_sense: z.string().max(255).nullable().optional(),
    include_on_list: z.boolean().optional(),
    is_header: z.boolean().optional(),
    merge_with_next: z.boolean().optional(),
    needs_review: z.literal(false).optional(),
    expected_updated_at: z.string().min(1),
  })
  .strict();

const EDIT_FIELDS = [
  'display_name',
  'amount',
  'unit',
  'quantity',
  'category',
  'confirmed_sense',
  'include_on_list',
  'is_header',
] as const;

const addLineSchema = z
  .object({
    display_name: z.string().min(1).max(255),
    amount: z.string().max(128).nullable().optional(),
    unit: z.string().max(64).nullable().optional(),
    quantity: z.number().finite().nonnegative().nullable().optional(),
    category: z.string().max(64).nullable().optional(),
    confirmed_sense: z.string().max(255).nullable().optional(),
    include_on_list: z.boolean().optional(),
  })
  .strict();

const splitLineSchema = z
  .object({
    split_point: z.number().int().min(1),
    expected_updated_at: z.string().min(1),
  })
  .strict();

@Controller('recipes')
export class IntakeController {
  constructor(
    private readonly recipes: RecipeService,
    private readonly intake: IntakeService,
    private readonly storage: StorageService,
  ) {}

  /** B1: paste a recipe — raw row + verbatim draft lines (API doc §3 RS-US-06). */
  @Post('parse-text')
  @HttpCode(200)
  @UseGuards(GuestOrJwtGuard, CsrfGuard)
  async parseText(@Req() req: ActorRequest, @Body() body: unknown) {
    const parsed = parseTextSchema.safeParse(body);
    if (!parsed.success || parsed.data.text.trim().length === 0) {
      throw new BadRequestException({
        code: 'INVALID_TEXT',
        message: 'text must be a non-empty string',
      });
    }
    const actor = req.actor!;
    const rawText = parsed.data.text; // interior whitespace/newlines preserved verbatim
    const recipe = await this.recipes.createForIntake(actor, { rawText });
    await this.intake.recordPaste(actor, recipe.id, rawText);
    const lines = await this.intake.listDraftLines(actor, recipe.id);
    const wireLines = await this.intake.resolveWireLines(lines);
    return {
      recipe_id: recipe.id, // D-12I: needed to address the RS-US-08 review routes (upload already returns recipe_id)
      recipe: {
        raw_text: rawText,
        lines: wireLines,
        flags: [], // wrap-around detection is parse-review work (D-12)
      },
    };
  }

  /** B2: upload a card image — object storage URI only, never the blob (API §3 RS-US-07). */
  @Post('upload')
  @UseGuards(GuestOrJwtGuard, CsrfGuard)
  @UseInterceptors(FileInterceptor('file'))
  async upload(@Req() req: ActorRequest, @UploadedFile() file?: Express.Multer.File) {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException({ code: 'INVALID_IMAGE', message: 'JPEG/PNG file required' });
    }
    const contentType = file.mimetype as ImageContentType;
    if (!IMAGE_CONTENT_TYPES.includes(contentType)) {
      throw new BadRequestException({
        code: 'INVALID_IMAGE',
        message: 'Only JPEG/PNG card images are accepted (B2)',
      });
    }
    if (file.buffer.length > MAX_IMAGE_BYTES) {
      throw new BadRequestException({
        code: 'IMAGE_TOO_LARGE',
        message: 'Image exceeds the 10 MB intake limit',
      });
    }
    const actor = req.actor!;

    // QG4 ordering: upload FIRST — on storage failure nothing is persisted in Postgres
    // (no dangling URI can exist because no URI was ever written).
    const stored = await this.storage.uploadImage(file.buffer, contentType);

    // Persist: recipe row (Web API domain, carries photo_uri) + raw input row (Intake).
    // Compensation on DB failure only: remove the just-uploaded object (no orphan) and,
    // if no intake row attached, the empty recipe row (D-10K).
    let recipeId: string | null = null;
    let input: { id: string } | null = null;
    try {
      const recipe = await this.recipes.createForIntake(actor, { photoUri: stored.uri });
      recipeId = recipe.id;
      input = await this.intake.recordPhoto(actor, recipe.id, stored.uri);
    } catch (err) {
      await this.storage.deleteObject(stored.key);
      if (recipeId) {
        try {
          await this.recipes.removeIfIntakeEmpty(actor, recipeId);
        } catch {
          // compensation is best-effort; the intake row never landed
        }
      }
      throw err;
    }

    // D-11: run OCR (Intake-orchestrated) and persist the OCR draft. On provider
    // failure the photo + input row stay DURABLE (no compensation here — nothing
    // OCR-specific was persisted); retry = re-POST.
    const ocr = await this.intake.ocrPhoto(actor, recipeId!, input!.id, file.buffer, contentType);
    if (ocr.status === 'pending') {
      throw new ServiceUnavailableException({
        code: 'OCR_UNAVAILABLE',
        message: 'OCR is unavailable; the photo was saved. Retry the upload.',
      });
    }
    if (ocr.status === 'unreadable') {
      throw new UnprocessableEntityException({
        code: 'OCR_UNREADABLE',
        message: 'No readable recipe text was found in this image.',
      });
    }

    return {
      recipe_id: recipeId,
      image_id: input!.id,
      file_key: stored.key,
      ocr: {
        status: ocr.status,
        draft_line_count: ocr.draft_line_count,
        flagged_count: ocr.flagged_count,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // D-12 parse review (RS-US-08, "Auth: Bearer" per API doc §3 — D-12A)
  // ─────────────────────────────────────────────────────────────────────────────

  private userActor(req: AuthedRequest): Actor {
    return { kind: 'user', user: req.user! };
  }

  private badRequest(code: string, message: string): BadRequestException {
    return new BadRequestException({ code, message });
  }

  /** B3 AC-1: edit OR merge OR mark-header (API doc: `{...}` or `{ merge_with_next: true }`). */
  @Patch(':recipeId/lines/:lineId')
  @UseGuards(JwtAuthGuard, CsrfGuard)
  async patchLine(
    @Req() req: AuthedRequest,
    @Param('recipeId') recipeId: string,
    @Param('lineId') lineId: string,
    @Body() body: unknown,
  ) {
    const parsed = patchLineSchema.safeParse(body);
    if (!parsed.success) {
      throw this.badRequest('INVALID_LINE_EDIT', 'Invalid line edit body');
    }
    const d = parsed.data;
    const actor = this.userActor(req);

    if (d.merge_with_next === true) {
      const hasEditFields = EDIT_FIELDS.some((f) => d[f] !== undefined);
      if (hasEditFields) {
        throw this.badRequest('INVALID_LINE_EDIT', 'merge_with_next must be sent alone');
      }
      const merged = await this.intake.mergeWithNext(actor, recipeId, lineId, d.expected_updated_at);
      return (await this.intake.resolveWireLines([merged]))[0];
    }

    if (d.is_header === true) {
      const deleted = await this.intake.markHeader(actor, recipeId, lineId, d.expected_updated_at);
      return (await this.intake.resolveWireLines([deleted]))[0]; // D-12C: header marked = excluded from the corrected object
    }

    const patch: LinePatch = {};
    if (d.display_name !== undefined) patch.displayName = d.display_name;
    if (d.amount !== undefined) patch.amountText = d.amount;
    if (d.unit !== undefined) patch.unit = d.unit;
    if (d.quantity !== undefined) patch.amount = d.quantity;
    if (d.category !== undefined) patch.groupName = d.category;
    if (d.confirmed_sense !== undefined) patch.confirmedSense = d.confirmed_sense;
    if (d.include_on_list !== undefined) patch.includeOnList = d.include_on_list;
    if (d.needs_review !== undefined) patch.needsReview = d.needs_review; // D-14C: literal false only

    const updated = await this.intake.updateLine(actor, recipeId, lineId, patch, d.expected_updated_at);
    return (await this.intake.resolveWireLines([updated]))[0];
  }

  /** B3 AC-1: delete (soft) — 204 (API doc). */
  @Delete(':recipeId/lines/:lineId')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  async deleteLine(
    @Req() req: AuthedRequest,
    @Param('recipeId') recipeId: string,
    @Param('lineId') lineId: string,
  ): Promise<void> {
    await this.intake.softDeleteLine(this.userActor(req), recipeId, lineId);
  }

  /** B3 AC-1: split a wrap-around line (D-12E: { split_point }). */
  @Post(':recipeId/lines/:lineId/split')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  async splitLine(
    @Req() req: AuthedRequest,
    @Param('recipeId') recipeId: string,
    @Param('lineId') lineId: string,
    @Body() body: unknown,
  ) {
    const parsed = splitLineSchema.safeParse(body);
    if (!parsed.success) {
      throw this.badRequest('INVALID_SPLIT', 'split_point and expected_updated_at are required');
    }
    const [l1, l2] = await this.intake.splitLine(
      this.userActor(req),
      recipeId,
      lineId,
      parsed.data.split_point,
      parsed.data.expected_updated_at,
    );
    return { lines: await this.intake.resolveWireLines([l1, l2]) };
  }

  /** B3 AC-1: add a new ingredient line (appended; 201). */
  @Post(':recipeId/lines')
  @UseGuards(JwtAuthGuard, CsrfGuard)
  async addLine(
    @Req() req: AuthedRequest,
    @Param('recipeId') recipeId: string,
    @Body() body: unknown,
  ) {
    const parsed = addLineSchema.safeParse(body);
    if (!parsed.success) {
      throw this.badRequest('INVALID_LINE_EDIT', 'Invalid new line body');
    }
    const d = parsed.data;
    const line = await this.intake.addLine(this.userActor(req), recipeId, {
      displayName: d.display_name,
      amountText: d.amount,
      unit: d.unit,
      amount: d.quantity,
      groupName: d.category,
      confirmedSense: d.confirmed_sense,
      includeOnList: d.include_on_list,
    });
    return (await this.intake.resolveWireLines([line]))[0];
  }

  /** B3: all active lines (200 { items }). */
  @Get(':recipeId/lines')
  @UseGuards(JwtAuthGuard)
  async getLines(@Req() req: AuthedRequest, @Param('recipeId') recipeId: string) {
    const lines = await this.intake.listDraftLines(this.userActor(req), recipeId);
    return { items: await this.intake.resolveWireLines(lines) };
  }

  /** B3 AC-6: the corrected object analysis will read + review status (D-12G). */
  @Get(':recipeId/parse-preview')
  @UseGuards(JwtAuthGuard)
  async parsePreview(@Req() req: AuthedRequest, @Param('recipeId') recipeId: string) {
    return this.intake.parsePreview(this.userActor(req), recipeId);
  }

  /** D-14 read surface (UI readiness screen): the canonical enqueue-state wire
   *  contract {can_enqueue, blockers}. Read-only; no shadow state (A-14). */
  @Get(':recipeId/enqueue-state')
  @UseGuards(JwtAuthGuard)
  async enqueueState(@Req() req: AuthedRequest, @Param('recipeId') recipeId: string) {
    return this.intake.getEnqueueState(this.userActor(req), recipeId);
  }
}
