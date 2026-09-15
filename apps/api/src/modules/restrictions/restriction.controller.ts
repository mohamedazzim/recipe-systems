// D-26 (P7-2) — the restriction HTTP surface (API doc §9, H1/H3):
//
//   GET  /me/restriction-profile                    (Bearer — H1 TC-02 null-safe)
//   PUT  /me/restriction-profile                    (Bearer + CSRF — strict)
//   GET  /restriction-vocabulary                    (GuestOrJwt — read-only)
//   GET  /analysis/:analysisId/restriction-highlight (Bearer — H3 conflicts-first)
//
// The profile is account-only by construction (Bearer routes; the wire never
// leaks another account's rows). The highlight 404s for missing AND foreign
// analyses (INV-17 shape). Non-canonical bodies are refused at the boundary.

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { GuestOrJwtGuard } from '../../common/guards/guest-or-jwt.guard';
import { AuthedRequest, JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PILOT_DIET_PATTERNS, RestrictionService } from './restriction.service';

const putSchema = z
  .object({
    allergens: z.array(z.string().min(1).max(64)).max(64),
    diet_patterns: z
      .array(z.enum(PILOT_DIET_PATTERNS))
      .max(PILOT_DIET_PATTERNS.length),
    label_pack: z.enum(['US', 'EU']),
  })
  .strict();

const invalid = (message: string) =>
  new BadRequestException({ code: 'INVALID_RESTRICTION_PROFILE', message });

@Controller()
export class RestrictionProfileController {
  constructor(private readonly restrictions: RestrictionService) {}

  /** H1 — GET the account profile (nulls when never configured — optional). */
  @Get('me/restriction-profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Req() req: AuthedRequest) {
    return this.restrictions.getProfile(req.user!.accountId);
  }

  /** H1 — create/update. Strict canonical validation at the boundary. */
  @Put('me/restriction-profile')
  @UseGuards(JwtAuthGuard, CsrfGuard)
  async putProfile(@Req() req: AuthedRequest, @Body() body: unknown) {
    const parsed = putSchema.safeParse(body);
    if (!parsed.success) {
      throw invalid(
        'Invalid restriction profile: allergens (canonical codes), diet_patterns ' +
          `(pilot vocabulary: ${PILOT_DIET_PATTERNS.join(', ')}), label_pack US|EU`,
      );
    }
    return this.restrictions.putProfile(req.user!.accountId, {
      allergens: parsed.data.allergens,
      dietPatterns: parsed.data.diet_patterns,
      labelPack: parsed.data.label_pack,
    });
  }
}

@Controller()
export class RestrictionVocabularyController {
  constructor(private readonly restrictions: RestrictionService) {}

  /** Read-only canonical vocabulary for the profile editor (H1 UI). */
  @Get('restriction-vocabulary')
  @UseGuards(GuestOrJwtGuard)
  async vocabulary() {
    return this.restrictions.vocabulary();
  }
}

@Controller('analysis')
export class RestrictionHighlightController {
  constructor(private readonly restrictions: RestrictionService) {}

  /** H3 — conflicts first; unknown never a pass. Bearer-only (profiles are
   *  account-only); guests get an empty highlight. */
  @Get(':analysisId/restriction-highlight')
  @UseGuards(JwtAuthGuard)
  async highlight(
    @Req() req: AuthedRequest,
    @Param('analysisId') analysisId: string,
  ) {
    const actor = { kind: 'user' as const, user: req.user! };
    return this.restrictions.highlight(actor, analysisId);
  }
}
