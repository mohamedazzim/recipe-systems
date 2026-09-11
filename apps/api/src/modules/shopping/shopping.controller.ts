// D-30 (Track S) — the shopping HTTP surface (one-writer: ShoppingService is
// the sole writer of the shopping tables). Guests may shop their session-owned
// recipes (GuestOrJwt + the canonical assertOwned); writes ride CsrfGuard.
//
//   POST   /recipes/:recipeId/shopping-list    generate a new snapshot (E1/E3/Q2)
//   GET    /recipes/:recipeId/shopping-list    latest snapshot + current state (E2 reopen)
//   PATCH  /recipes/:recipeId/shopping-state   { shopping_key, state: have|need } (E2)

import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { ActorRequest, GuestOrJwtGuard } from '../../common/guards/guest-or-jwt.guard';
import { ShoppingService } from './shopping.service';

const shoppingStateSchema = z
  .object({
    shopping_key: z.string().uuid(),
    state: z.enum(['have', 'need']),
  })
  .strict();

@Controller('recipes')
export class ShoppingController {
  constructor(private readonly shopping: ShoppingService) {}

  /** E1/E3 + Q2 Option A: generate the grouped snapshot from the active lines. */
  @Post(':recipeId/shopping-list')
  @UseGuards(GuestOrJwtGuard, CsrfGuard)
  async generate(@Req() req: ActorRequest, @Param('recipeId') recipeId: string) {
    return this.shopping.generate(req.actor!, recipeId);
  }

  /** E2 reopen: the latest snapshot with the CURRENT have/need state. */
  @Get(':recipeId/shopping-list')
  @UseGuards(GuestOrJwtGuard)
  async latest(@Req() req: ActorRequest, @Param('recipeId') recipeId: string) {
    return this.shopping.latest(req.actor!, recipeId);
  }

  /** E2: have/need toggle for one active line (canonical upsert). */
  @Patch(':recipeId/shopping-state')
  @UseGuards(GuestOrJwtGuard, CsrfGuard)
  async setState(
    @Req() req: ActorRequest,
    @Param('recipeId') recipeId: string,
    @Body() body: unknown,
  ) {
    const parsed = shoppingStateSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'INVALID_SHOPPING_STATE',
        message: 'Invalid shopping state body: shopping_key must be a UUID and state must be have|need',
      });
    }
    return this.shopping.setState(req.actor!, recipeId, {
      shopping_key: parsed.data.shopping_key,
      state: parsed.data.state,
    });
  }
}
