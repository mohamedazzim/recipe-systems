// D-17 (P3-3): the API's analysis-enqueue side. The API NEVER writes analysis_*
// rows (A-17 one-writer BLOCKER: the worker is the only writer) — it enqueues a
// pg-boss job carrying the predetermined analysis id + the captured input state
// (Q1-labeled working assumption: job-payload snapshot, DISPATCH D-17
// deliverable 2; Q1 stays OPEN in SCAFFOLD §7). The worker materializes the row
// on delivery. Idempotency (INV-11): the analysis id is generated ONCE here and
// is the business identity (ADR §14) — duplicate deliveries converge on it.
//
// Bootstrap degrades gracefully (CI/unit boots have no pg-boss DB guarantee):
// start() failures surface as ENQUEUE_UNAVAILABLE at request time, never a
// crashed app (QG4 posture, app.module.test.ts parity).

import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
// pg-boss v10 is CJS with `module.exports = PgBoss` (class directly, no
// __esModule). The API tsconfig has no esModuleInterop while the worker's does,
// so a default import works in one and breaks at runtime in the other. The
// namespace + `.default ?? ns` fallback works at runtime under BOTH; a small
// structural constructor type sidesteps the export= typing differences.
import * as pgBossNs from 'pg-boss';
import { randomUUID } from 'crypto';
import { StructuredRecipeInput } from '@recipe-systems/schemas';

export interface BossClient {
  start(): Promise<void>;
  stop(options?: unknown): Promise<void>;
  createQueue(name: string): Promise<void>;
  send(name: string, data: unknown, options?: unknown): Promise<string | null>;
}
type BossCtor = new (options: unknown) => BossClient;

const PgBoss = ((pgBossNs as unknown as { default?: BossCtor }).default ??
  pgBossNs) as unknown as BossCtor;

export const ANALYSIS_QUEUE = 'analysis';
export const ANALYSIS_EVENTS_CHANNEL = 'recipe_analysis_events';

export interface AnalysisJobPayload {
  analysis_id: string;
  recipe_id: string;
  mode: 'home' | 'chef';
  prompt_version: string;
  /** Q1-labeled working assumption: the captured structured-recipe state rides
   *  the job payload (DISPATCH D-17 deliverable 2; BUILD_PLAN §7.2 — the formal
   *  snapshot decision is still OPEN and due by week 5). */
  captured: StructuredRecipeInput;
}

@Injectable()
export class AnalysisQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnalysisQueueService.name);
  private boss: BossClient | null = null;
  private started = false;

  constructor(@Inject('DATABASE_URL') private readonly databaseUrl: string) {}

  async onModuleInit(): Promise<void> {
    try {
      this.boss = new PgBoss({
        connectionString: this.databaseUrl,
        // Q13-labeled pilot defaults (SCAFFOLD §7 Q13 OPEN; revalidated at P7):
        // 3 attempts then failed — permanent errors are classified by the worker
        // and never retried indefinitely (ADR §14).
        retryLimit: 3,
        retryDelay: 2,
        retryBackoff: true,
      });
      await this.boss.start();
      await this.boss.createQueue(ANALYSIS_QUEUE);
      this.started = true;
      this.logger.log('analysis queue ready');
    } catch (err) {
      // Graceful degrade: request-time errors carry ENQUEUE_UNAVAILABLE.
      this.started = false;
      this.logger.warn(`analysis queue unavailable at boot: ${(err as Error).message}`);
    }
  }

  /** Enqueue one analysis job; returns the predetermined analysis id. */
  async enqueue(payload: Omit<AnalysisJobPayload, 'analysis_id'>): Promise<string> {
    if (!this.started || !this.boss) {
      throw new QueueUnavailableError();
    }
    const analysis_id = randomUUID();
    await this.boss.send(ANALYSIS_QUEUE, { ...payload, analysis_id } satisfies AnalysisJobPayload);
    return analysis_id;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.boss && this.started) {
      await this.boss.stop({ graceful: true }).catch(() => undefined);
    }
  }
}

export class QueueUnavailableError extends Error {
  constructor() {
    super('analysis queue unavailable — retry later');
    this.name = 'QueueUnavailableError';
  }
}
