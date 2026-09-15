// D-27 (P7-3): the reviewer veto surface (API §5 extension). Bearer-only —
// a guest can never veto. State-changing → CSRF applies (Tech Stack §15).

import { Controller, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthedRequest, JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { ReviewsService } from './reviews.service';

@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  /** G2 TC-01: veto the live View 5 regional sentence of one analysis. */
  @Post('analysis/:analysisId/view-5/veto')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  async vetoView5(@Req() req: AuthedRequest, @Param('analysisId') analysisId: string) {
    return this.reviews.vetoView5(req.user!, analysisId);
  }
}
