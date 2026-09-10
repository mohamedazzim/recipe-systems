// D-13 (B4 / RS-US-09): method attach — the recipe-domain write surface (one-writer rule,
// ADR §2: RecipeService is the sole writer of `recipe`; Q4: Intake remains the sole writer
// of `recipe_ingredient_line` — this controller writes no lines).
//
// Canonical contract (API doc §4):
//   PATCH /recipes/:recipeId/method  Auth: Bearer (BFF session cookie)
//   Body: { "method": "none"|"paste"|"inferred", "method_text"?: string,
//           "method_source"?: string, "accept_inferred"?: boolean }
//   200:  { "method_tag": "METHOD"|"INFERRED"|null, "method_source": string|null,
//           "list_only": boolean }
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
  Get,
  Param,
  Patch,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
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
  async library(@Req() req: AuthedRequest) {
    const actor: Actor = { kind: 'user', user: req.user! };
    const recipes = await this.recipes.listLibrary(actor);
    return { recipes };
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
