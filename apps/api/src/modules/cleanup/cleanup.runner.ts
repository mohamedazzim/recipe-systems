// D-27 (P7-3): the scheduled sweep runner. A single-process interval (pilot
// topology: one API container, ADR §18) — the sweep is idempotent and safe to
// retry, so an overlap from a second process is harmless. The interval is
// env-configurable (CLEANUP_INTERVAL_SECONDS) with a labeled pilot default.

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { CleanupService } from './cleanup.service';

export function cleanupIntervalSeconds(): number {
  return Number(process.env.CLEANUP_INTERVAL_SECONDS ?? 3600);
}

@Injectable()
export class CleanupRunner implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CleanupRunner.name);
  private firstTimer: ReturnType<typeof setTimeout> | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  /** BUG-016: in-process overlap guard (see `run`). */
  private running = false;

  constructor(private readonly cleanup: CleanupService) {}

  async onModuleInit(): Promise<void> {
    const intervalMs = cleanupIntervalSeconds() * 1000;
    const run = async (): Promise<void> => {
      // BUG-016: the header's "an overlap from a second process is harmless" argument
      // covers a second *container*, but not a tick landing while this process's
      // previous sweep is still running — the boot sweep and the interval are armed
      // independently, and a shortened CLEANUP_INTERVAL_SECONDS (or a slow storage pass)
      // is enough to stack them. An overlap does not corrupt anything, but the loser
      // hits P2025 on rows the winner already deleted and abandons the remainder of its
      // pass, so the same work runs twice and one pass is partial for nothing. Skipping
      // the tick is strictly better than racing it.
      if (this.running) {
        this.logger.warn('guest cleanup sweep still running — skipping this tick');
        return;
      }
      this.running = true;
      try {
        await this.cleanup.cleanupExpiredGuests();
      } catch (err) {
        // A failed sweep is observable and retried on the next tick; never
        // crashes the API process.
        this.logger.error(`guest cleanup sweep failed: ${(err as Error).message}`);
      } finally {
        this.running = false;
      }
    };

    // First sweep shortly after boot, then on the configured interval.
    this.firstTimer = setTimeout(() => void run(), 30_000);
    this.interval = setInterval(() => void run(), intervalMs);
    this.logger.log(`guest cleanup sweep armed (interval ${cleanupIntervalSeconds()}s)`);
  }

  onModuleDestroy(): void {
    if (this.firstTimer) clearTimeout(this.firstTimer);
    if (this.interval) clearInterval(this.interval);
    this.firstTimer = null;
    this.interval = null;
  }
}
