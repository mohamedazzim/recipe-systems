// Phase 2 document-ingestion handler — the ONLY writer of document_ingestion
// lifecycle transitions (queued → extracting → ready/failed). Kept deliberately
// separate from recipe analysis: no ingredient/method identification, no LLM,
// no recipe rows. One document = one independent unit; a failure here only
// marks THIS document failed and never affects others.

import { PrismaClient } from '@recipe-systems/database';
import { DocumentExtractionError, DocumentFileType, extractDocumentText } from './extract';
import { getDocumentObject } from './s3';

export const DOCUMENT_INGESTION_QUEUE = 'document-ingestion';

export interface DocumentIngestionJobData {
  ingestion_id: string;
}

export class DocumentIngestionJobHandler {
  constructor(private readonly prisma: PrismaClient) {}

  async handle(data: DocumentIngestionJobData): Promise<void> {
    const ingestion = await this.prisma.documentIngestion.findUnique({
      where: { id: data.ingestion_id },
    });
    if (!ingestion) return; // never materialized — nothing to process

    // BUG-020: this handler owns ONLY queued → extracting → ready/failed. Skipping just
    // `ready` meant a redelivered job rewound a row that had already moved on — Phase 3 sets
    // `extracting_structure`, and a completed extraction sets `draft_ready` or
    // `extraction_failed` — back to `extracting`, which re-ran OCR over a document whose
    // structure was already being drafted. A redelivery is only idempotent if it declines to
    // touch states this handler never sets. `failed` is deliberately allowed through: that is
    // the retry path the comment below describes.
    if (
      ingestion.status !== 'queued' &&
      ingestion.status !== 'extracting' &&
      ingestion.status !== 'failed'
    ) {
      return;
    }

    // queued → extracting (re-delivery of a failed row also re-enters here).
    await this.prisma.documentIngestion.update({
      where: { id: ingestion.id },
      data: { status: 'extracting', errorCode: null, errorMessage: null },
    });

    const object = await getDocumentObject(ingestion.storageKey);
    if (!object) {
      await this.markFailed(
        ingestion.id,
        'STORAGE_READ_FAILED',
        'The stored document could not be read.',
      );
      return;
    }

    try {
      const rawText = await extractDocumentText(ingestion.fileType as DocumentFileType, object.buffer);
      await this.prisma.documentIngestion.update({
        where: { id: ingestion.id },
        data: { status: 'ready', rawText },
      });
    } catch (err) {
      const code = err instanceof DocumentExtractionError ? err.code : 'EXTRACTION_FAILED';
      const message = err instanceof Error ? err.message : 'Document extraction failed.';
      await this.markFailed(ingestion.id, code, message);
    }
  }

  private async markFailed(id: string, code: string, message: string): Promise<void> {
    await this.prisma.documentIngestion.update({
      where: { id },
      data: { status: 'failed', errorCode: code, errorMessage: message },
    });
  }
}
