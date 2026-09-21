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
    if (ingestion.status === 'ready') return; // idempotent redelivery (INV-11 parity)

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
