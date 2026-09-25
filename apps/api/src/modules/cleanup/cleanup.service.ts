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

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaClient } from '@recipe-systems/database';
import { RecipeService } from '../recipes/recipe.service';
import { StorageService } from '../intake/storage.service';

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
    /** BUG-015: the guest's document-ingestion objects. Optional for the same reason
     *  RecipeService's storage is — the sweep still runs unwired, and residue is
     *  reported rather than thrown. */
    @Optional() private readonly storage?: StorageService,
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

      // BUG-015: the guest's uploaded documents. `document_ingestion.guest_session_id`
      // cascades, so deleting the session removes the ROWS — and with them the only record of
      // where their objects live. The objects themselves were never deleted, so every guest
      // upload leaked its stored document for the life of the bucket. Collect the keys first,
      // then delete the session, then remove the objects: the order the recipe path already
      // uses, and for the same reason — a failure here leaves reported residue rather than an
      // object no surviving row refers to.
      const documents = await this.prisma.documentIngestion.findMany({
        where: { guestSessionId: session.id },
        select: { storageKey: true },
      });
      await this.prisma.guestSession.delete({ where: { id: session.id } });
      if (this.storage) {
        for (const document of documents) {
          const ok = await this.storage.tryDeleteObject(document.storageKey);
          if (!ok) residue += 1;
        }
      }
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
