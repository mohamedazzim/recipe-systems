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
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { Actor } from '../../common/guards/guest-or-jwt.guard';
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

@Controller('recipes')
export class RecipesController {
  constructor(private readonly recipes: RecipeService) {}

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
