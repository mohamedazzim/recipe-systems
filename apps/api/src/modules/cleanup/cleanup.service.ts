// D-27 (P7-3): guest-session expiry cleanup (Q11-labeled pilot default
// GUEST_TTL_SECONDS=86400, set at D-08) + Q15-labeled photo retention (the
// existing recipe-delete compensating storage cleanup is reused — nothing new
// is invented). Q11 and Q15 stay OPEN; this sweep operates the labeled pilot
// defaults only.
//
// Canonical ownership rules: only EXPIRED, UNCLAIMED guest sessions are
// removed, together with the recipes they own (and every child aggregate via
// the DB-level ON DELETE CASCADE) plus their object-storage assets. Claimed
// sessions are audit records and are never swept. The sweep is idempotent and
// safe to retry (ADR §16).

import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@recipe-systems/database';
import { RecipeService } from '../recipes/recipe.service';

export interface CleanupReport {
  expired_sessions_found: number;
  sessions_removed: number;
  recipes_removed: number;
  storage_residue_keys: number;
}

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly recipes: RecipeService,
  ) {}

  /** Q11-labeled sweep: remove expired, unclaimed guest aggregates. */
  async cleanupExpiredGuests(now: Date = new Date()): Promise<CleanupReport> {
    const expired = await this.prisma.guestSession.findMany({
      where: { expiresAt: { lte: now }, claimedAt: null },
      select: { id: true },
    });

    let recipesRemoved = 0;
    let residue = 0;

    for (const session of expired) {
      const owned = await this.prisma.recipe.findMany({
        where: { guestSessionId: session.id },
        select: { id: true },
      });
      for (const recipe of owned) {
        const failed = await this.recipes.deleteRecipeInternal(recipe.id);
        recipesRemoved += 1;
        residue += failed.length;
      }
      await this.prisma.guestSession.delete({ where: { id: session.id } });
    }

    if (expired.length > 0) {
      this.logger.warn(
        `guest cleanup: removed ${expired.length} expired unclaimed sessions, ` +
          `${recipesRemoved} recipes, storage residue ${residue} keys (retry-safe)`,
      );
    }

    return {
      expired_sessions_found: expired.length,
      sessions_removed: expired.length,
      recipes_removed: recipesRemoved,
      storage_residue_keys: residue,
    };
  }
}
