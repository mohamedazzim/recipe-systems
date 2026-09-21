// Phase 3 structured-recipe extraction handler — the ONLY writer of the
// document_ingestion lifecycle transitions ready → extracting_structure →
// draft_ready/extraction_failed and the ONLY writer of document_recipe_draft.
//
// The model is an EXTRACTOR, never a generator: its output is validated against
// the frozen DocumentExtractionSchema (parseDocumentExtraction) and persisted
// VERBATIM as a draft. A malformed/empty/invalid output is a controlled
// `extraction_failed` — never silently repaired, never published as a recipe.

import { Prisma, PrismaClient } from '@recipe-systems/database';
import {
  EXTRACTION_PROMPT_VERSION,
  LlmAdapter,
  LlmPermanentProviderError,
  parseDocumentExtraction,
} from '@recipe-systems/llm-adapter';

export const DOCUMENT_EXTRACTION_QUEUE = 'document-extraction';

export interface DocumentExtractionJobData {
  ingestion_id: string;
}

export class DocumentExtractionJobHandler {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly adapter: LlmAdapter,
  ) {}

  async handle(data: DocumentExtractionJobData): Promise<void> {
    const ingestion = await this.prisma.documentIngestion.findUnique({
      where: { id: data.ingestion_id },
    });
    if (!ingestion) return; // never materialized — nothing to extract
    if (ingestion.status === 'draft_ready') return; // idempotent redelivery
    if (!ingestion.rawText) {
      await this.markFailed(ingestion.id, 'NO_RAW_TEXT', 'No source text available to extract from.');
      return;
    }

    await this.prisma.documentIngestion.update({
      where: { id: ingestion.id },
      data: { status: 'extracting_structure', errorCode: null, errorMessage: null },
    });

    try {
      const raw = await this.adapter.extractRecipeText({
        source_text: ingestion.rawText,
        prompt_version: this.promptVersion,
        model_version: this.modelVersion,
      });
      const parsed = parseDocumentExtraction(raw);
      if (!parsed.ok) {
        throw new InvalidExtractionError(parsed.errors.join('; '));
      }

      // Persist drafts — replace any prior drafts for this ingestion so a
      // re-extraction converges (INV-11 parity: idempotent, no duplicates).
      await this.prisma.$transaction(async (tx) => {
        await tx.documentRecipeDraft.deleteMany({ where: { ingestionId: ingestion.id } });
        for (let i = 0; i < parsed.data.recipes.length; i += 1) {
          const recipe = parsed.data.recipes[i];
          await tx.documentRecipeDraft.create({
            data: {
              ingestionId: ingestion.id,
              draftIndex: i,
              title: recipe.title,
              titleNeedsReview: recipe.title_needs_review,
              needsReview: recipe.needs_review,
              payload: recipe as unknown as Prisma.InputJsonValue,
            },
          });
        }
      });

      await this.prisma.documentIngestion.update({
        where: { id: ingestion.id },
        data: { status: 'draft_ready' },
      });
    } catch (err) {
      if (err instanceof LlmPermanentProviderError) {
        await this.markFailed(ingestion.id, 'EXTRACTION_FAILED', err.message);
        return;
      }
      if (err instanceof InvalidExtractionError) {
        await this.markFailed(ingestion.id, 'INVALID_EXTRACTION', err.message);
        return;
      }
      // Transient (network/timeout/provider 5xx) → controlled failure; the user
      // re-triggers extraction. The job itself does not throw (no pg-boss retry
      // storm — extraction is fast and deterministic-ish, unlike analysis).
      const message = err instanceof Error ? err.message : 'Document extraction failed.';
      await this.markFailed(ingestion.id, 'EXTRACTION_FAILED', message);
    }
  }

  private get modelVersion(): string {
    return this.adapter.modelVersion ?? this.adapter.providerName;
  }

  private get promptVersion(): string {
    return EXTRACTION_PROMPT_VERSION;
  }

  private async markFailed(id: string, code: string, message: string): Promise<void> {
    await this.prisma.documentIngestion.update({
      where: { id },
      data: { status: 'extraction_failed', errorCode: code, errorMessage: message },
    });
  }
}

class InvalidExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidExtractionError';
  }
}
