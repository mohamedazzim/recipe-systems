// D-23 (P5-2) — the print HTTP surface (read-only snapshot rendering).
//
//   GET /recipes/:recipeId/print/shopping-list   ?format=html → the same
//   GET /recipes/:recipeId/print/station-card    template (SCAFFOLD §4);
//                                                default → application/pdf
//
// Ownership: GuestOrJwt + the canonical assertOwned (INV-17 404s for missing,
// foreign and malformed ids). PDF render failures surface the canonical
// retryable 503 (PDF_RENDER_FAILED).

import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { GuestOrJwtGuard, ActorRequest } from '../../common/guards/guest-or-jwt.guard';
import { PrintService } from './print.service';

@Controller('recipes')
export class PrintController {
  constructor(private readonly print: PrintService) {}

  @Get(':recipeId/print/shopping-list')
  @UseGuards(GuestOrJwtGuard)
  async shoppingList(
    @Req() req: ActorRequest,
    @Param('recipeId') recipeId: string,
    @Query('format') format: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const out = await this.print.shoppingListPrint(
      req.actor!,
      recipeId,
      format === 'html' ? 'html' : 'pdf',
    );
    if (out.pdf) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${out.filename}"`);
      res.send(out.pdf);
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(out.html);
  }

  @Get(':recipeId/print/station-card')
  @UseGuards(GuestOrJwtGuard)
  async stationCard(
    @Req() req: ActorRequest,
    @Param('recipeId') recipeId: string,
    @Query('format') format: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const out = await this.print.stationCardPrint(
      req.actor!,
      recipeId,
      format === 'html' ? 'html' : 'pdf',
    );
    if (out.pdf) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${out.filename}"`);
      res.send(out.pdf);
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(out.html);
  }

  /** E6 + I5 (D-31): the home-mode one-pager (snapshot-only). */
  @Get(':recipeId/print/one-pager')
  @UseGuards(GuestOrJwtGuard)
  async onePager(
    @Req() req: ActorRequest,
    @Param('recipeId') recipeId: string,
    @Query('format') format: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const out = await this.print.onePagerPrint(
      req.actor!,
      recipeId,
      format === 'html' ? 'html' : 'pdf',
    );
    if (out.pdf) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${out.filename}"`);
      res.send(out.pdf);
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(out.html);
  }
}
