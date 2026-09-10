// D-17 (P3-3): the worker process — pg-boss consumer (Tech Stack §9). Runs as
// its own process/container; the ONLY writer of analysis_* (ADR §2). NOTIFY is
// a signal only, never durable state (INV-16) — the API replays from Postgres.

import * as pgBossNs from 'pg-boss';
import { Client } from 'pg';
import { prisma } from '@recipe-systems/database';
import {
  AnalysisJobData,
  ANALYSIS_EVENTS_CHANNEL,
  AnalysisJobHandler,
  View9RecomputeJobData,
} from './analysis-job.handler';
import { resolveAdapter } from './adapter';

// pg-boss v10 is CJS with `module.exports = PgBoss` (class directly). The worker
// tsconfig HAS esModuleInterop while the API's does not — the namespace +
// `.default ?? ns` fallback works at runtime under both; the structural
// constructor type sidesteps the export= typing differences.
interface BossClient {
  start(): Promise<void>;
  stop(options?: unknown): Promise<void>;
  createQueue(name: string): Promise<void>;
  work(name: string, handler: (jobs: unknown) => Promise<void>): Promise<void>;
}
type BossCtor = new (options: unknown) => BossClient;

const PgBoss = ((pgBossNs as unknown as { default?: BossCtor }).default ??
  pgBossNs) as unknown as BossCtor;

const DATABASE_URL = process.env.DATABASE_URL ?? '';
const QUEUE_NAME = 'analysis';
// D-19 (P4-1): the RS-US-45 assumption-edit recompute queue (View 9 only).
export const VIEW9_RECOMPUTE_QUEUE = 'view9-recompute';
// Q13-labeled pilot defaults (SCAFFOLD §7 Q13 OPEN; revalidated at P7).
const RETRY_LIMIT = 3;
const RETRY_DELAY = 2; // seconds, exponential backoff on
// Startup sweep: generating rows older than this are crash remnants.
const STALE_GENERATING_MS = 15 * 60 * 1000;

async function createNotifier(databaseUrl: string) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  return async (payload: { analysis_id: string; status: string }): Promise<void> => {
    await client.query('SELECT pg_notify($1, $2)', [
      ANALYSIS_EVENTS_CHANNEL,
      JSON.stringify(payload),
    ]);
  };
}

export async function main(): Promise<void> {
  if (!DATABASE_URL) {
    console.error('analysis-worker: DATABASE_URL is required');
    process.exitCode = 1;
    return;
  }

  const boss = new PgBoss({
    connectionString: DATABASE_URL,
    // Q13-labeled pilot defaults (SCAFFOLD §7 Q13 OPEN; revalidated at P7).
    retryLimit: RETRY_LIMIT,
    retryDelay: RETRY_DELAY,
    retryBackoff: true,
  });
  const notify = await createNotifier(DATABASE_URL);
  const handler = new AnalysisJobHandler(prisma, resolveAdapter(process.env), notify);

  // Crash-mid-job reconciliation BEFORE consuming new work (P3 exit).
  const swept = await handler.sweepStaleGenerating(STALE_GENERATING_MS);
  if (swept > 0) {
    console.log(`analysis-worker: swept ${swept} stale generating rows → failed`);
  }

  await boss.start();
  await boss.createQueue(QUEUE_NAME);
  await boss.createQueue(VIEW9_RECOMPUTE_QUEUE);
  console.log('analysis-worker: consuming queue "analysis" + "view9-recompute"');

  // pg-boss v10.4+ delivers a BATCH (array) to the work handler.
  await boss.work(QUEUE_NAME, async (jobs: unknown) => {
    const batch = (Array.isArray(jobs) ? jobs : [jobs]) as Array<{
      id?: string;
      data?: AnalysisJobData;
    }>;
    for (const job of batch) {
      if (!job || !job.data) continue;
      console.log(`analysis-worker: job ${job.id ?? 'unknown'} for analysis ${job.data.analysis_id}`);
      await handler.handle(job.data);
    }

  // D-19: the View 9 recompute queue — same batch delivery contract.
  await boss.work(VIEW9_RECOMPUTE_QUEUE, async (jobs: unknown) => {
    const batch = (Array.isArray(jobs) ? jobs : [jobs]) as Array<{
      id?: string;
      data?: View9RecomputeJobData;
    }>;
    for (const job of batch) {
      if (!job || !job.data) continue;
      console.log(`analysis-worker: view9-recompute job ${job.id ?? 'unknown'} for analysis ${job.data.analysis_id}`);
      await handler.handleView9Recompute(job.data);
    }
  });
  });

  const shutdown = async (): Promise<void> => {
    console.log('analysis-worker: shutting down');
    await boss.stop({ graceful: true }).catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

void main();
