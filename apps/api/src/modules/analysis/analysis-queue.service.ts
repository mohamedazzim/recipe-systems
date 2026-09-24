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
// D-19 (P4-1): the RS-US-45 assumption-edit recompute queue (View 9 only;
// consumed by the worker — the API never writes analysis_*).
export const VIEW9_RECOMPUTE_QUEUE = 'view9-recompute';
export const ANALYSIS_EVENTS_CHANNEL = 'recipe_analysis_events';

// How long a queued/active analysis job may live before pg-boss expires it.
// MUST match ANALYSIS_JOB_EXPIRE_SECONDS in apps/analysis-worker/src/main.ts.
//
// Why it is set HERE, on the sender: pg-boss resolves a job's expire_in at SEND
// time (send option → queue.expire_seconds → sender's expireInDefault → the
// built-in '15 minutes'). Neither side ever created the queue with expire_seconds
// and the API is the sender, so the 15-minute default was in force no matter what
// the worker's constructor said — and a single long pass (DeepSeek has taken ~16
// minutes) expired WHILE RUNNING and was redelivered, doubling provider spend.
export const ANALYSIS_JOB_EXPIRE_SECONDS = 4 * 60 * 60;

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

/** D-19 (P4-1): RS-US-45 assumption edit — recompute View 9 only. D-26 I3
 *  adds the Q14 seam: `portions` (RS-US-46, 3|4) rides the job payload and
 *  persists ONLY in the View 9 payload's per_portion — no column. */
export interface View9RecomputePayload {
  analysis_id: string;
  recipe_id: string;
  delta: {
    fish_class?: 'lean' | 'oily';
    coconut_grams?: number;
    oil_tbsp?: number;
    portions?: 3 | 4;
  };
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
      await this.boss.createQueue(VIEW9_RECOMPUTE_QUEUE);
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
    await this.boss.send(
      ANALYSIS_QUEUE,
      { ...payload, analysis_id } satisfies AnalysisJobPayload,
      { expireInSeconds: ANALYSIS_JOB_EXPIRE_SECONDS },
    );
    return analysis_id;
  }

  /** D-19 (P4-1): enqueue the View 9 recompute (RS-US-45). The API never writes
   *  analysis_* — the worker consumes this queue and persists the payload. */
  async enqueueView9Recompute(payload: View9RecomputePayload): Promise<void> {
    if (!this.started || !this.boss) {
      throw new QueueUnavailableError();
    }
    await this.boss.send(VIEW9_RECOMPUTE_QUEUE, payload, {
      expireInSeconds: ANALYSIS_JOB_EXPIRE_SECONDS,
    });
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
