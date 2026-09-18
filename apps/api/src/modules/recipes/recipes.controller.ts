// D-13 (B4 / RS-US-09): method attach — the recipe-domain write surface (one-writer rule,
// ADR §2: RecipeService is the sole writer of `recipe`; Q4: Intake remains the sole writer
// of `recipe_ingredient_line` — this controller writes no lines).
//
// Canonical contract (API doc §4):
//   PATCH /recipes/:recipeId/method  Auth: Bearer (BFF session cookie)
//   Body: { "method": "none"|"paste"|"inferred", "method_text"?: string,
//           "method_source"?: string, "accept_inferred"?: boolean }
//   200:  { "method_tag": "METHOD"|"INFERRED"|null, "method_source": string|null,
//           "method_text": string|null, "list_only": boolean }
// Guest method selection is handled client-side on the ephemeral draft (API doc §4) —
// hence JwtAuthGuard only, not GuestOrJwt.
//
// D-13 decisions recorded in HANDOFF §5 2026-09-09 (D-13A..J):
//   - paste    → tag METHOD; method_text required non-empty (D-13C)
//   - inferred → tag INFERRED + named source REQUIRED (ERD: method_inferred_source);
//                source-less INFERRED is a MAJOR (A-13) → 400 (D-13D)
//   - none     → clears all three method columns → list_only true (D-13E)
//   - accept_inferred accepted but redundant with method:"inferred" (D-13F)
//   - method_source only meaningful for INFERRED (D-13G)

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Put,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { Actor, ActorRequest, GuestOrJwtGuard } from '../../common/guards/guest-or-jwt.guard';
import { AuthedRequest, JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RecipeService } from './recipe.service';

const METHOD_TEXT_MAX = 20_000;
const METHOD_SOURCE_MAX = 2_000;

const methodAttachSchema = z.object({
  method: z.enum(['none', 'paste', 'inferred']),
  method_text: z.string().max(METHOD_TEXT_MAX).optional(),
  method_source: z.string().max(METHOD_SOURCE_MAX).optional(),
  accept_inferred: z.boolean().optional(),
});

// D-22 (D1): save accepts an optional editable title; omitted/blank → the default
// (family) is applied by the service (AC-2 default name = family, editable).
const saveSchema = z
  .object({ title: z.string().min(1).max(255).optional() })
  .strict();

// D-22 (D6 / RS-US-24): deletion REQUIRES an explicit confirmation in the body —
// the canonical anti-foot-gun contract (API doc §5: `{ "confirm": true }`).
const deleteSchema = z.object({ confirm: z.literal(true) }).strict();

// D-25 (D3): free-text tags — wholesale replace; each tag ≤100 chars, ≤20 tags.
const tagsSchema = z
  .object({ tags: z.array(z.string().min(1).max(100)).max(20) })
  .strict();

@Controller('recipes')
export class RecipesController {
  constructor(private readonly recipes: RecipeService) {}

  /**
   * D-22 (D2): the account library — persistent DB rows, never browser state.
   * Rows carry exactly the canonical D2 AC-1 fields: name, date, family,
   * cook-log indicator. Bearer-only by design (D-22D): the library is
   * account-owned; guests keep their session-local surface.
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  async library(@Req() req: AuthedRequest, @Query('q') q?: string) {
    const actor: Actor = { kind: 'user', user: req.user! };
    const recipes =
      q !== undefined && q.trim().length > 0
        ? await this.recipes.search(actor, q)
        : await this.recipes.listLibrary(actor);
    return { recipes };
  }

  /** Read-only asset route (2026-09-18 dashboard cards): the recipe's stored
   *  card photo bytes. Bearer-only like the library; INV-17 ownership-gated
   *  (404 for missing AND foreign recipes). */
  @Get(':recipeId/photo')
  @UseGuards(JwtAuthGuard)
  async recipePhoto(
    @Req() req: AuthedRequest,
    @Param('recipeId') recipeId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const actor: Actor = { kind: 'user', user: req.user! };
    const photo = await this.recipes.photoBytes(actor, recipeId);
    if (!photo) {
      throw new NotFoundException({
        code: 'PHOTO_NOT_FOUND',
        message: 'No photo stored for this recipe',
      });
    }
    res.setHeader('Content-Type', photo.contentType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    return new StreamableFile(photo.stream);
  }

  /** D-25 (D3): the recipe's persisted free-text tags (read-only). */
  @Get(':recipeId/tags')
  @UseGuards(JwtAuthGuard)
  async tags(@Req() req: AuthedRequest, @Param('recipeId') recipeId: string) {
    const actor: Actor = { kind: 'user', user: req.user! };
    return { tags: await this.recipes.listTags(actor, recipeId) };
  }

  /** D-25 (D3): replace the recipe's tag set. The recipes module is the sole
   *  recipe_tag writer (QG2 gate 2g). */
  @Put(':recipeId/tags')
  @UseGuards(JwtAuthGuard, CsrfGuard)
  async setTags(
    @Req() req: AuthedRequest,
    @Param('recipeId') recipeId: string,
    @Body() body: unknown,
  ) {
    const parsed = tagsSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'INVALID_TAGS',
        message: 'tags must be an array of at most 20 strings, each at most 100 characters',
      });
    }
    const actor: Actor = { kind: 'user', user: req.user! };
    return { tags: await this.recipes.setTags(actor, recipeId, parsed.data.tags) };
  }

  /**
   * D-22 (D6 / RS-US-24): hard-delete a recipe (cascade: images, analyses,
   * lists, logs, tags). Bearer-only per the API doc §5 contract; body
   * `{confirm: true}` is mandatory (AC-1). 204 No Content. INV-17: 404 for
   * missing AND foreign AND malformed ids; a repeated delete is the same 404.
   */
  @Delete(':recipeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  async deleteRecipe(
    @Req() req: AuthedRequest,
    @Param('recipeId') recipeId: string,
    @Body() body: unknown,
  ): Promise<void> {
    const parsed = deleteSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'CONFIRM_REQUIRED',
        message: 'Recipe deletion requires the confirmation body { confirm: true }',
      });
    }
    const actor: Actor = { kind: 'user', user: req.user! };
    await this.recipes.deleteRecipe(actor, recipeId);
  }

  /**
   * D-22 (D1): Save — normalizes the name (default = identification family,
   * editable) and confirms the persisted artifact set. Guests may save
   * (A1 TC-02 seam): the QA-B2 claim moves the row — and its save state — onto
   * the account, which is the resume-save path. INV-17 404 missing AND foreign.
   */
  @Put(':recipeId/save')
  @UseGuards(GuestOrJwtGuard, CsrfGuard)
  async save(
    @Req() req: ActorRequest,
    @Param('recipeId') recipeId: string,
    @Body() body: unknown,
  ) {
    const parsed = saveSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'INVALID_SAVE',
        message: 'Invalid save body: title must be a string of at most 255 characters',
      });
    }
    return this.recipes.saveRecipe(req.actor!, recipeId, { title: parsed.data.title });
  }

  /** Read-only method-state hydration (same canonical wire shape as the PATCH
   *  200). Added so the web workspace can reopen on the persisted method without
   *  a write-on-mount workaround — a previous build PATCHed method:none on mount
   *  and destroyed the saved method on every reopen. Delegates to the existing
   *  D-17 RecipeService.getMethodState; no writer changes. */
  @Get(':recipeId/method')
  @UseGuards(JwtAuthGuard)
  async getMethod(@Req() req: AuthedRequest, @Param('recipeId') recipeId: string) {
    const actor: Actor = { kind: 'user', user: req.user! };
    return this.recipes.getMethodState(actor, recipeId);
  }

  /** B4 TC-01/02/03: set or attach a method (None / Paste / Accept INFERRED). */
  @Patch(':recipeId/method')
  @UseGuards(JwtAuthGuard, CsrfGuard)
  async attachMethod(
    @Req() req: AuthedRequest,
    @Param('recipeId') recipeId: string,
    @Body() body: unknown,
  ) {
    const parsed = methodAttachSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'INVALID_METHOD',
        message: 'Invalid method body: method must be none|paste|inferred',
      });
    }
    const d = parsed.data;
    const text = d.method_text?.trim() ?? '';
    const source = d.method_source?.trim() ?? '';

    if (d.method === 'paste' && text.length === 0) {
      throw new BadRequestException({
        code: 'INVALID_METHOD',
        message: 'method_text is required when method is "paste"',
      });
    }
    if (d.method === 'inferred') {
      if (text.length === 0) {
        throw new BadRequestException({
          code: 'INVALID_METHOD',
          message: 'method_text is required when method is "inferred"',
        });
      }
      // ERD §5: method_inferred_source is required when tag = INFERRED.
      // A-13: a source-less INFERRED is a MAJOR — refuse at the boundary.
      if (source.length === 0) {
        throw new BadRequestException({
          code: 'INVALID_METHOD',
          message: 'method_source (named source) is required when method is "inferred"',
        });
      }
    }

    const actor: Actor = { kind: 'user', user: req.user! };
    return this.recipes.attachMethod(actor, recipeId, {
      mode: d.method,
      methodText: text,
      methodSource: source,
    });
  }
}
