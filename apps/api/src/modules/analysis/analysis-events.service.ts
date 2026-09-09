// D-17 (P3-3): NOTIFY → SSE spine (Tech Stack §13; INV-16 — NOTIFY is a
// signal, never durable state). The API LISTENs on the worker's channel and
// fans events out to per-analysis SSE subscribers. On connect, the SSE route
// first replays the CURRENT Postgres state (snapshot) and then streams live
// events — so a dropped NOTIFY always recovers via reconnect-and-reload from
// Postgres (A-17 QG4 cell).
//
// Read-only: this module only reads analysis_* (the worker is the sole writer).

import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventEmitter } from 'events';
import { Client } from 'pg';
import { PrismaClient } from '@recipe-systems/database';
import { ANALYSIS_EVENTS_CHANNEL } from './analysis-queue.service';

export interface AnalysisEvent {
  analysis_id: string;
  status: string;
}

@Injectable()
export class AnalysisEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnalysisEventsService.name);
  private readonly emitter = new EventEmitter();
  private client: Client | null = null;
  private listening = false;

  constructor(
    @Inject('DATABASE_URL') private readonly databaseUrl: string,
    @Inject('PRISMA') private readonly prisma: PrismaClient,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      this.client = new Client({ connectionString: this.databaseUrl });
      await this.client.connect();
      await this.client.query(`LISTEN "${ANALYSIS_EVENTS_CHANNEL}"`);
      this.client.on('notification', (msg) => {
        if (msg.channel !== ANALYSIS_EVENTS_CHANNEL || !msg.payload) return;
        try {
          const event = JSON.parse(msg.payload) as AnalysisEvent;
          if (event.analysis_id && event.status) {
            this.emitter.emit(`analysis:${event.analysis_id}`, event);
          }
        } catch {
          this.logger.warn('malformed NOTIFY payload ignored (signal only — INV-16)');
        }
      });
      this.listening = true;
      this.logger.log('analysis event listener ready');
    } catch (err) {
      this.listening = false;
      this.logger.warn(`analysis event listener unavailable at boot: ${(err as Error).message}`);
    }
  }

  /** Read-only snapshot of an analysis row (SSE connect-replay, INV-16). */
  async snapshot(analysisId: string) {
    const analysis = await this.prisma.analysis.findUnique({
      where: { id: analysisId },
      select: {
        id: true,
        status: true,
        mode: true,
        isCurrent: true,
        promptVersion: true,
        modelVersion: true,
        createdAt: true,
      },
    });
    return analysis;
  }

  subscribe(analysisId: string, listener: (event: AnalysisEvent) => void): () => void {
    const channel = `analysis:${analysisId}`;
    this.emitter.on(channel, listener);
    return () => this.emitter.off(channel, listener);
  }

  get ready(): boolean {
    return this.listening;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.end().catch(() => undefined);
    }
  }
}
