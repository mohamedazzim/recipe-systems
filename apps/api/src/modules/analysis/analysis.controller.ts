// D-17 (P3-3): analysis enqueue + read surfaces (API §5). The API NEVER writes
// analysis_* (A-17 one-writer BLOCKER — the worker is the sole writer): these
// routes enqueue via pg-boss and READ rows. The full completed-envelope shape
// (identification, station card, claim_tags) is D-18's contract — here the read
// surface returns the persisted rows as-is.
//
// D-17 readings (recorded in H-17): the API doc's §5 200 shape is the COMPLETED
// analysis contract; the async enqueue returns { analysis_id, status: 'queued' }.
// The block error code ENQUEUE_BLOCKED carries the D-14 blockers.

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { Response } from 'express';
import { PrismaClient } from '@recipe-systems/database';
import { ActorRequest, GuestOrJwtGuard, Actor } from '../../common/guards/guest-or-jwt.guard';
import { AuthedRequest, JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { AnalysisService } from './analysis.service';
import { AnalysisEventsService } from './analysis-events.service';

const analyseSchema = z.object({ mode: z.enum(['home', 'chef']) }).strict();
// D-19 (P4-1): RS-US-45 assumption-edit body. At least one field is required.
const view9AssumptionsSchema = z
  .object({
    fish_class: z.enum(['lean', 'oily']).optional(),
    coconut_grams: z.number().positive().max(5000).optional(),
    oil_tbsp: z.number().positive().max(100).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'at least one assumption (fish_class, coconut_grams, oil_tbsp) is required',
  });
// D-26 (P7-2): RS-US-46 portions body (I3 / Q14 seam — 3|4 only, no persistence
// column; the count lives in the View 9 payload's per_portion).
const portionsSchema = z.object({ portions: z.union([z.literal(3), z.literal(4)]) }).strict();
const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

@Controller()
export class AnalysisController {
  constructor(
    private readonly analysis: AnalysisService,
    private readonly events: AnalysisEventsService,
    @Inject('PRISMA') private readonly prisma: PrismaClient,
  ) {}

  private actorOf(req: ActorRequest) {
    // The guard attaches the resolved Actor (user OR guest) to the request.
    return req.actor!;
  }

  /** D-20 (P4-2): the frozen station-card wire shape (D-05 StationCardSchema). */
  private stationCardWire(card: {
    id: string;
    analysisId: string;
    mise: unknown;
    sequence: unknown;
    doNots: unknown;
    controlPoints: unknown;
    productYieldHold: unknown;
    printable: boolean;
  }) {
    return {
      station_card_id: card.id,
      analysis_id: card.analysisId,
      mise: card.mise,
      sequence: card.sequence,
      do_nots: card.doNots,
      control_points: card.controlPoints,
      product_yield_hold: card.productYieldHold ?? null,
      printable: card.printable,
    };
  }

  /**
   * D-20 (P4-2): the persisted station card for one analysis (API §5).
   * INV-17: 404 for missing AND foreign. A valid analysis WITHOUT a card (the
   * worker's refusal path — no method / View 3 INCOMPLETE) is
   * 404 STATION_CARD_NOT_FOUND — the card was never generated, never fabricated.
   */
  @Get('analysis/:analysisId/station-card')
  @UseGuards(GuestOrJwtGuard)
  async getStationCard(@Req() req: ActorRequest, @Param('analysisId') analysisId: string) {
    if (!UUID_RE.test(analysisId)) {
      throw new NotFoundException({ code: 'ANALYSIS_NOT_FOUND', message: 'Analysis not found' });
    }
    const actor = this.actorOf(req);
    const analysis = await this.prisma.analysis.findUnique({
      where: { id: analysisId },
      include: { recipe: true },
    });
    if (!analysis) {
      throw new NotFoundException({ code: 'ANALYSIS_NOT_FOUND', message: 'Analysis not found' });
    }
    const owns =
      actor.kind === 'user'
        ? analysis.recipe.accountId === actor.user.accountId
        : analysis.recipe.guestSessionId === actor.guestSessionId;
    if (!owns) {
      throw new NotFoundException({ code: 'ANALYSIS_NOT_FOUND', message: 'Analysis not found' });
    }
    const card = await this.prisma.analysisStationCard.findUnique({ where: { analysisId } });
    if (!card) {
      throw new NotFoundException({
        code: 'STATION_CARD_NOT_FOUND',
        message: 'No station card for this analysis (no method was attached or the process is incomplete)',
      });
    }
    return this.stationCardWire(card);
  }

  /** RS-US-13: enqueue the full nine-view analysis. Auth: Bearer or guest. */
  @Post('recipes/:recipeId/analyse')
  @HttpCode(200) // the enqueue ACK is not a resource creation — the analysis row is the worker's (A-17)
  @UseGuards(GuestOrJwtGuard, CsrfGuard)
  async analyse(
    @Req() req: ActorRequest,
    @Param('recipeId') recipeId: string,
    @Body() body: unknown,
  ) {
    const parsed = analyseSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'INVALID_ANALYSE_BODY',
        message: 'mode must be home|chef',
      });
    }
    const actor = this.actorOf(req);
    return this.analysis.enqueue(actor, recipeId, parsed.data.mode);
  }

  /**
   * D-19 (P4-1) RS-US-45: edit View 9 assumptions (fish class, coconut grams,
   * oil tablespoons) → deterministic recompute of the band. Auth: Bearer.
   * The API enqueues ONLY — the worker recomputes and persists (one-writer).
   */
  @Patch('analysis/:analysisId/view-9/assumptions')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  async patchView9Assumptions(
    @Req() req: AuthedRequest,
    @Param('analysisId') analysisId: string,
    @Body() body: unknown,
  ) {
    if (!UUID_RE.test(analysisId)) {
      throw new NotFoundException({ code: 'ANALYSIS_NOT_FOUND', message: 'Analysis not found' });
    }
    const parsed = view9AssumptionsSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'INVALID_ASSUMPTIONS',
        message:
          'body must be { fish_class?: "lean"|"oily", coconut_grams?: number, oil_tbsp?: number } with at least one field',
      });
    }
    const actor: Actor = { kind: 'user', user: req.user! };
    return this.analysis.recomputeView9(actor, analysisId, parsed.data);
  }

  /**
   * D-26 (P7-2) RS-US-46 (I3 / Q14 seam): set portions → per-bowl band. The
   * portion count persists ONLY in the View 9 payload's per_portion (the
   * frozen View9PayloadSchema) — NO persisted column; Q14 stays OPEN (ERD
   * §15.6/§17; BUILD_PLAN §7.8). Auth: Bearer; API enqueues only.
   */
  @Patch('analysis/:analysisId/view-9/portions')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  async patchView9Portions(
    @Req() req: AuthedRequest,
    @Param('analysisId') analysisId: string,
    @Body() body: unknown,
  ) {
    if (!UUID_RE.test(analysisId)) {
      throw new NotFoundException({ code: 'ANALYSIS_NOT_FOUND', message: 'Analysis not found' });
    }
    const parsed = portionsSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'INVALID_PORTIONS',
        message: 'body must be { portions: 3 | 4 }',
      });
    }
    const actor: Actor = { kind: 'user', user: req.user! };
    return this.analysis.recomputeView9(actor, analysisId, { portions: parsed.data.portions });
  }

  /** Read-only status + views of one analysis (INV-17: 404 for missing AND foreign). */
  @Get('analysis/:analysisId')
  @UseGuards(GuestOrJwtGuard)
  async getAnalysis(@Req() req: ActorRequest, @Param('analysisId') analysisId: string) {
    // Format-guard BEFORE any Prisma call: a non-UUID id must be a clean 404,
    // never a Prisma P2023 → 500.
    if (!UUID_RE.test(analysisId)) {
      throw new NotFoundException({ code: 'ANALYSIS_NOT_FOUND', message: 'Analysis not found' });
    }
    const actor = this.actorOf(req);
    const analysis = await this.prisma.analysis.findUnique({
      where: { id: analysisId },
      include: { recipe: true },
    });
    if (!analysis) {
      throw new NotFoundException({ code: 'ANALYSIS_NOT_FOUND', message: 'Analysis not found' });
    }
    const owns =
      actor.kind === 'user'
        ? analysis.recipe.accountId === actor.user.accountId
        : analysis.recipe.guestSessionId === actor.guestSessionId;
    if (!owns) {
      throw new NotFoundException({ code: 'ANALYSIS_NOT_FOUND', message: 'Analysis not found' });
    }
    const views = await this.prisma.analysisView.findMany({
      where: { analysisId },
      orderBy: { viewNumber: 'asc' },
    });
    const card = await this.prisma.analysisStationCard.findUnique({ where: { analysisId } });
    return {
      analysis_id: analysis.id,
      status: analysis.status,
      mode: analysis.mode,
      is_latest: analysis.isCurrent,
      prompt_version: analysis.promptVersion,
      model_version: analysis.modelVersion,
      created_at: analysis.createdAt.toISOString(),
      views: views.map((v) => ({
        view_number: v.viewNumber,
        view_key: v.viewKey,
        status: v.status,
        payload: v.payload,
      })),
      station_card: card ? this.stationCardWire(card) : null,
    };
  }

  /** API doc §5 (RS-US-13): the latest analysis for a recipe — the workspace
   *  reopens to the current result. Read-only; same assembly as getAnalysis;
   *  INV-17: 404 for missing AND foreign (no existence leak). */
  @Get('recipes/:recipeId/analysis')
  @UseGuards(GuestOrJwtGuard)
  async latestAnalysis(@Req() req: ActorRequest, @Param('recipeId') recipeId: string) {
    if (!UUID_RE.test(recipeId)) {
      throw new NotFoundException({ code: 'ANALYSIS_NOT_FOUND', message: 'Analysis not found' });
    }
    const actor = this.actorOf(req);
    const recipe = await this.prisma.recipe.findUnique({ where: { id: recipeId } });
    if (!recipe) {
      throw new NotFoundException({ code: 'ANALYSIS_NOT_FOUND', message: 'Analysis not found' });
    }
    const owns =
      actor.kind === 'user'
        ? recipe.accountId === actor.user.accountId
        : recipe.guestSessionId === actor.guestSessionId;
    if (!owns) {
      throw new NotFoundException({ code: 'ANALYSIS_NOT_FOUND', message: 'Analysis not found' });
    }
    const analysis = await this.prisma.analysis.findFirst({
      where: { recipeId, isCurrent: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!analysis) {
      throw new NotFoundException({ code: 'ANALYSIS_NOT_FOUND', message: 'Analysis not found' });
    }
    const views = await this.prisma.analysisView.findMany({
      where: { analysisId: analysis.id },
      orderBy: { viewNumber: 'asc' },
    });
    const card = await this.prisma.analysisStationCard.findUnique({
      where: { analysisId: analysis.id },
    });
    return {
      analysis_id: analysis.id,
      status: analysis.status,
      mode: analysis.mode,
      is_latest: analysis.isCurrent,
      prompt_version: analysis.promptVersion,
      model_version: analysis.modelVersion,
      created_at: analysis.createdAt.toISOString(),
      views: views.map((v) => ({
        view_number: v.viewNumber,
        view_key: v.viewKey,
        status: v.status,
        payload: v.payload,
      })),
      station_card: card ? this.stationCardWire(card) : null,
    };
  }

  /**
   * SSE status stream (Tech Stack §13): snapshot replay on connect, then live
   * NOTIFY-driven events — a dropped NOTIFY always recovers via the snapshot
   * (INV-16; A-17 QG4 cell).
   */
  @Get('analysis/:analysisId/events')
  @UseGuards(GuestOrJwtGuard)
  async streamEvents(
    @Req() req: ActorRequest,
    @Param('analysisId') analysisId: string,
    @Res() res: Response,
  ): Promise<void> {
    const actor = this.actorOf(req);
    if (!UUID_RE.test(analysisId)) {
      throw new NotFoundException({ code: 'ANALYSIS_NOT_FOUND', message: 'Analysis not found' });
    }
    // INV-17 + the queued-before-materialization case: the worker creates the
    // analysis row at delivery time, so a client subscribing right after a 200
    // enqueue ACK may arrive before the row exists. The SSE channel is
    // signal-only (INV-16) — no content ever flows — so a not-yet-materialized
    // analysis streams from `queued` state instead of 404ing the connect.
    const analysis = await this.prisma.analysis.findUnique({
      where: { id: analysisId },
      include: { recipe: true },
    });
    let snapshot: { id: string; status: string; isCurrent: boolean } | null = null;
    if (analysis) {
      const owns =
        actor.kind === 'user'
          ? analysis.recipe.accountId === actor.user.accountId
          : analysis.recipe.guestSessionId === actor.guestSessionId;
      if (!owns) {
        throw new NotFoundException({ code: 'ANALYSIS_NOT_FOUND', message: 'Analysis not found' });
      }
      snapshot = await this.events.snapshot(analysisId);
    }

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const write = (event: string, data: unknown): void => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Connect-replay: current Postgres state first (reload-from-Postgres, INV-16).
    write('snapshot', {
      analysis_id: analysisId,
      status: snapshot?.status ?? 'queued',
      is_latest: snapshot?.isCurrent ?? false,
    });

    const unsubscribe = this.events.subscribe(analysisId, (event) => {
      write('status', event);
    });

    const heartbeat = setInterval(() => {
      res.write(': keep-alive\n\n');
    }, 25_000);

    res.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  }
}
