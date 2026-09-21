// Document-ingestion enqueue side (Phase 2). Mirrors AnalysisQueueService: the
// API never performs extraction itself — it stores the document, creates the
// `queued` record, and enqueues a job for the analysis worker (the SAME pg-boss
// mechanism, a NEW queue). Bootstrap degrades gracefully (QG4): a down queue
// surfaces as INGESTION_QUEUE_UNAVAILABLE at request time, never a boot crash.

import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as pgBossNs from 'pg-boss';

export const DOCUMENT_INGESTION_QUEUE = 'document-ingestion';

export interface BossClient {
  start(): Promise<void>;
  stop(options?: unknown): Promise<void>;
  createQueue(name: string): Promise<void>;
  send(name: string, data: unknown, options?: unknown): Promise<string | null>;
}
type BossCtor = new (options: unknown) => BossClient;

const PgBoss = ((pgBossNs as unknown as { default?: BossCtor }).default ??
  pgBossNs) as unknown as BossCtor;

@Injectable()
export class IngestionQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IngestionQueueService.name);
  private boss: BossClient | null = null;
  private started = false;

  constructor(@Inject('DATABASE_URL') private readonly databaseUrl: string) {}

  async onModuleInit(): Promise<void> {
    try {
      this.boss = new PgBoss({
        connectionString: this.databaseUrl,
        // Same Q13-labeled pilot defaults as analysis (SCAFFOLD §7 Q13 OPEN).
        retryLimit: 3,
        retryDelay: 2,
        retryBackoff: true,
      });
      await this.boss.start();
      await this.boss.createQueue(DOCUMENT_INGESTION_QUEUE);
      this.started = true;
      this.logger.log('document ingestion queue ready');
    } catch (err) {
      this.started = false;
      this.logger.warn(`document ingestion queue unavailable at boot: ${(err as Error).message}`);
    }
  }

  async enqueue(ingestionId: string): Promise<void> {
    if (!this.started || !this.boss) {
      throw new IngestionQueueUnavailableError();
    }
    await this.boss.send(DOCUMENT_INGESTION_QUEUE, { ingestion_id: ingestionId });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.boss && this.started) {
      await this.boss.stop({ graceful: true }).catch(() => undefined);
    }
  }
}

export class IngestionQueueUnavailableError extends Error {
  constructor() {
    super('document ingestion queue unavailable — retry later');
    this.name = 'IngestionQueueUnavailableError';
  }
}
