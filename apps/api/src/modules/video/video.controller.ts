// RS-US (chef mode): the video walkthrough HTTP surface (API doc §3 conventions).
//
//   GET  /recipes/:recipeId/video-walkthrough   Auth: Bearer — read persisted.
//   POST /recipes/:recipeId/video-walkthrough   Auth: Bearer — start generating.
//
// Generation is ASYNC: POST returns `generating` immediately (the provider work
// is ~40s, well past the edge ceiling) and the screen re-reads the GET until it
// is `ready` or `failed`. The service is the only writer of `recipe_video`.

import { Controller, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { AuthedRequest, JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { VideoService } from './video.service';

@Controller('recipes')
export class VideoController {
  constructor(private readonly video: VideoService) {}

  /** The persisted walkthrough (never generates). */
  @Get(':recipeId/video-walkthrough')
  @UseGuards(JwtAuthGuard)
  async get(@Req() req: AuthedRequest, @Param('recipeId') recipeId: string) {
    return this.video.get({ kind: 'user', user: req.user! }, recipeId);
  }

  /** Start (or resume) generation. Returns immediately with `generating`. */
  @Post(':recipeId/video-walkthrough')
  @HttpCode(202)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  async start(@Req() req: AuthedRequest, @Param('recipeId') recipeId: string) {
    return this.video.start({ kind: 'user', user: req.user! }, recipeId);
  }
}
