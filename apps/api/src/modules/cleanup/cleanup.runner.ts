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

  constructor(private readonly cleanup: CleanupService) {}

  async onModuleInit(): Promise<void> {
    const intervalMs = cleanupIntervalSeconds() * 1000;
    const run = async (): Promise<void> => {
      try {
        await this.cleanup.cleanupExpiredGuests();
      } catch (err) {
        // A failed sweep is observable and retried on the next tick; never
        // crashes the API process.
        this.logger.error(`guest cleanup sweep failed: ${(err as Error).message}`);
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
