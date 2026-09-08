// Intake controller — the BFF HTTP surface for D-10 intake (API doc §3:
// POST /recipes/parse-text, POST /recipes/upload). Per Q4 (resolved 2026-09-08):
// this controller EXPOSES endpoints and orchestrates; all recipe_input and
// recipe_ingredient_line mutations go through the Intake module only.

import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
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
import { RecipeService } from '../recipes/recipe.service';
import { IntakeService, toWireLine } from './intake.service';
import { IMAGE_CONTENT_TYPES, ImageContentType, MAX_IMAGE_BYTES, StorageService } from './storage.service';

const parseTextSchema = z.object({ text: z.string().min(1) });

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
    return {
      recipe: {
        raw_text: rawText,
        lines: lines.map(toWireLine),
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
    // Compensation on DB failure: remove the just-uploaded object (no orphan) and, if no
    // intake row attached, the empty recipe row (D-10K).
    let recipeId: string | null = null;
    try {
      const recipe = await this.recipes.createForIntake(actor, { photoUri: stored.uri });
      recipeId = recipe.id;
      const input = await this.intake.recordPhoto(actor, recipe.id, stored.uri);
      return { recipe_id: recipe.id, image_id: input.id, file_key: stored.key };
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
  }
}
