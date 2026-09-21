// Phase 2 document ingestion service — the API-side writer of the
// document_ingestion record's CREATION (the worker owns lifecycle transitions).
// A document is NOT a recipe: no recipe/line/method/analysis rows are created.
// Source-faithful extraction happens in the worker, never here.

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaClient } from '@recipe-systems/database';
import type { RecipeExtraction } from '@recipe-systems/schemas';
import type { Actor } from '../../common/guards/guest-or-jwt.guard';
import {
  documentFileTypeOf,
  MAX_DOCUMENT_BYTES,
  StorageService,
} from '../intake/storage.service';
import {
  IngestionQueueService,
  IngestionQueueUnavailableError,
} from './ingestion.queue.service';

export type DocumentIngestionStatus =
  | 'queued'
  | 'extracting'
  | 'ready'
  | 'failed'
  | 'extracting_structure'
  | 'draft_ready'
  | 'extraction_failed';

export interface DocumentIngestionWire {
  ingestion_id: string;
  original_filename: string;
  file_type: string;
  file_size_bytes: number;
  status: DocumentIngestionStatus;
  has_text: boolean;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

/** Phase 3: one source-faithful recipe draft, still NOT a confirmed recipe. */
export interface DocumentDraftWire {
  draft_id: string;
  draft_index: number;
  title: string | null;
  title_needs_review: boolean;
  needs_review: boolean;
  payload: RecipeExtraction;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class IngestionService {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly storage: StorageService,
    private readonly queue: IngestionQueueService,
  ) {}

  /** Store the original document + create the `queued` record + enqueue extraction. */
  async ingestDocument(actor: Actor, file: Express.Multer.File): Promise<DocumentIngestionWire> {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException({
        code: 'INVALID_DOCUMENT',
        message: 'A PDF, DOCX, or TXT document is required',
      });
    }
    const originalFilename = file.originalname || 'document';
    const fileType = documentFileTypeOf(originalFilename);
    if (!fileType) {
      throw new BadRequestException({
        code: 'INVALID_DOCUMENT',
        message: 'Only PDF, DOCX, or TXT documents are accepted',
      });
    }
    if (file.buffer.length > MAX_DOCUMENT_BYTES) {
      throw new BadRequestException({
        code: 'DOCUMENT_TOO_LARGE',
        message: 'Document exceeds the 10 MB intake limit',
      });
    }

    // QG4 ordering: store FIRST — on storage failure nothing is persisted in Postgres.
    const stored = await this.storage.uploadDocument(file.buffer, originalFilename, fileType);

    const ingestion = await this.prisma.documentIngestion.create({
      data: {
        accountId: actor.kind === 'user' ? actor.user.accountId : null,
        guestSessionId: actor.kind === 'guest' ? actor.guestSessionId : null,
        originalFilename,
        fileType,
        fileSizeBytes: file.buffer.length,
        storageKey: stored.key,
        storageUri: stored.uri,
        status: 'queued',
      },
    }).catch(async (err) => {
      // DB write after upload failed → remove the just-uploaded object (no orphan).
      await this.storage.deleteObject(stored.key);
      throw err;
    });

    try {
      await this.queue.enqueue(ingestion.id);
    } catch (err) {
      // Enqueue failure → roll back (record + object) and surface a retryable 503.
      await this.prisma.documentIngestion.delete({ where: { id: ingestion.id } }).catch(() => undefined);
      await this.storage.deleteObject(stored.key);
      if (err instanceof IngestionQueueUnavailableError) {
        throw new ServiceUnavailableException({
          code: 'INGESTION_QUEUE_UNAVAILABLE',
          message: 'Document ingestion is unavailable — try again later',
        });
      }
      throw err;
    }

    return this.toWire(ingestion);
  }

  /** Polled by the web client to observe queued → extracting → ready/failed. */
  async getStatus(actor: Actor, ingestionId: string): Promise<DocumentIngestionWire> {
    const ingestion = await this.loadOwned(actor, ingestionId);
    return this.toWire(ingestion);
  }

  /** Phase 3: trigger structured extraction on a `ready` document. */
  async extractStructure(actor: Actor, ingestionId: string): Promise<DocumentIngestionWire> {
    const ingestion = await this.loadOwned(actor, ingestionId);
    if (ingestion.status !== 'ready') {
      throw new ConflictException({
        code: 'NOT_READY_FOR_EXTRACTION',
        message: `Extraction is only available when the document is ready (current: ${ingestion.status})`,
      });
    }

    // Transition to extracting_structure BEFORE enqueue so the poll shows progress.
    await this.prisma.documentIngestion.update({
      where: { id: ingestion.id },
      data: { status: 'extracting_structure', errorCode: null, errorMessage: null },
    });

    try {
      await this.queue.enqueueExtraction(ingestion.id);
    } catch (err) {
      // Revert to ready on enqueue failure so the user can retry.
      await this.prisma.documentIngestion.update({
        where: { id: ingestion.id },
        data: { status: 'ready' },
      }).catch(() => undefined);
      if (err instanceof IngestionQueueUnavailableError) {
        throw new ServiceUnavailableException({
          code: 'EXTRACTION_QUEUE_UNAVAILABLE',
          message: 'Recipe extraction is unavailable — try again later',
        });
      }
      throw err;
    }

    const updated = await this.prisma.documentIngestion.findUnique({ where: { id: ingestion.id } });
    return this.toWire(updated!);
  }

  /** Phase 3: return the source-faithful drafts for review (never final recipes). */
  async getDrafts(actor: Actor, ingestionId: string): Promise<DocumentDraftWire[]> {
    const ingestion = await this.loadOwned(actor, ingestionId);
    const drafts = await this.prisma.documentRecipeDraft.findMany({
      where: { ingestionId: ingestion.id },
      orderBy: { draftIndex: 'asc' },
    });
    return drafts.map((d) => ({
      draft_id: d.id,
      draft_index: d.draftIndex,
      title: d.title,
      title_needs_review: d.titleNeedsReview,
      needs_review: d.needsReview,
      payload: d.payload as RecipeExtraction,
      created_at: d.createdAt.toISOString(),
      updated_at: d.updatedAt.toISOString(),
    }));
  }

  /** Load a document, enforcing ownership (INV-17: missing AND foreign 404). */
  private async loadOwned(
    actor: Actor,
    ingestionId: string,
  ): Promise<{
    id: string;
    accountId: string | null;
    guestSessionId: string | null;
    originalFilename: string;
    fileType: string;
    fileSizeBytes: number;
    status: string;
    rawText: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    createdAt: Date;
    updatedAt: Date;
  }> {
    const ingestion = await this.prisma.documentIngestion.findUnique({
      where: { id: ingestionId },
    });
    if (!ingestion) {
      throw new NotFoundException({
        code: 'INGESTION_NOT_FOUND',
        message: 'Document ingestion not found',
      });
    }
    this.assertOwned(actor, ingestion);
    return ingestion;
  }

  /** INV-17 parity: missing AND foreign ingests are indistinguishable 404s. */
  private assertOwned(
    actor: Actor,
    ingestion: { accountId: string | null; guestSessionId: string | null },
  ): void {
    const owned =
      actor.kind === 'user'
        ? ingestion.accountId === actor.user.accountId
        : ingestion.guestSessionId === actor.guestSessionId;
    if (!owned) {
      throw new NotFoundException({
        code: 'INGESTION_NOT_FOUND',
        message: 'Document ingestion not found',
      });
    }
  }

  private toWire(ingestion: {
    id: string;
    originalFilename: string;
    fileType: string;
    fileSizeBytes: number;
    status: string;
    rawText: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): DocumentIngestionWire {
    return {
      ingestion_id: ingestion.id,
      original_filename: ingestion.originalFilename,
      file_type: ingestion.fileType,
      file_size_bytes: ingestion.fileSizeBytes,
      status: ingestion.status as DocumentIngestionStatus,
      has_text: ingestion.rawText !== null,
      error_code: ingestion.errorCode,
      error_message: ingestion.errorMessage,
      created_at: ingestion.createdAt.toISOString(),
      updated_at: ingestion.updatedAt.toISOString(),
    };
  }
}
