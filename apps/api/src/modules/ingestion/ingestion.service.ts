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
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaClient } from '@recipe-systems/database';
import type { DraftEdit, RecipeExtraction } from '@recipe-systems/schemas';
import type { Actor } from '../../common/guards/guest-or-jwt.guard';
import { formRawText, IntakeService, type FormLineEntry } from '../intake/intake.service';
import {
  documentFileTypeOf,
  MAX_DOCUMENT_BYTES,
  StorageService,
} from '../intake/storage.service';
import { RecipeService } from '../recipes/recipe.service';
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

/** Phase 3: one source-faithful recipe draft, still NOT a confirmed recipe.
 *  Phase 4: `payload` is the immutable model extraction; `user_payload` is the
 *  authoritative user-edited state; `status` + `recipe_id` track confirmation. */
export interface DocumentDraftWire {
  draft_id: string;
  draft_index: number;
  title: string | null;
  title_needs_review: boolean;
  needs_review: boolean;
  payload: RecipeExtraction;
  user_payload: DraftEdit | null;
  status: 'draft' | 'confirming' | 'confirmed';
  recipe_id: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Phase 4: the confirmation result — the created recipe id (normal recipe). */
export interface ConfirmDraftWire {
  recipe_id: string;
  status: 'confirmed' | 'already_confirmed';
}

/** The document_recipe_draft row shape this service reads (Prisma-generated). */
interface DocumentDraftRow {
  id: string;
  ingestionId: string;
  draftIndex: number;
  title: string | null;
  titleNeedsReview: boolean;
  needsReview: boolean;
  payload: unknown;
  userPayload: unknown;
  status: string;
  recipeId: string | null;
  confirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class IngestionService {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly storage: StorageService,
    private readonly queue: IngestionQueueService,
    /** Phase 4: the EXISTING recipe creation path (never duplicated here). */
    private readonly recipes: RecipeService,
    /** Phase 4: the EXISTING intake writer for recipe_input + ingredient lines. */
    private readonly intake: IntakeService,
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

  /** Phase 3: trigger structured extraction on a `ready` document (re-extract
   *  allowed after a prior `extraction_failed` — the Retry path). */
  async extractStructure(actor: Actor, ingestionId: string): Promise<DocumentIngestionWire> {
    const ingestion = await this.loadOwned(actor, ingestionId);
    // Fast path — same shape and message as before, so the ordinary "not ready" case is
    // rejected before we touch the row.
    if (ingestion.status !== 'ready' && ingestion.status !== 'extraction_failed') {
      throw new ConflictException({
        code: 'NOT_READY_FOR_EXTRACTION',
        message: `Extraction is only available when the document is ready or previously failed (current: ${ingestion.status})`,
      });
    }

    // BUG-019: the CLAIM is the UPDATE, not a read followed by an update. That check
    // alone let two concurrent calls (a double-click on Extract) both pass and both
    // enqueue extraction jobs — which then each delete and recreate the drafts, with one
    // failure marking `extraction_failed` after the other had succeeded. As a
    // conditional write the loser matches zero rows, which is the 409 below.
    //
    // BUG-032: remember what we transitioned FROM, so an enqueue failure restores
    // exactly that. The revert used to hard-code 'ready', clobbering the
    // `extraction_failed` state the retry path depends on.
    const preStatus = ingestion.status;
    const claimed = await this.prisma.documentIngestion.updateMany({
      where: { id: ingestion.id, status: { in: ['ready', 'extraction_failed'] } },
      data: { status: 'extracting_structure', errorCode: null, errorMessage: null },
    });
    if (claimed.count === 0) {
      throw new ConflictException({
        code: 'NOT_READY_FOR_EXTRACTION',
        message: `Extraction is already in progress for this document (current: ${ingestion.status})`,
      });
    }

    try {
      await this.queue.enqueueExtraction(ingestion.id);
    } catch (err) {
      // Restore the PRE-TRANSITION status so the retry path still works.
      await this.prisma.documentIngestion.update({
        where: { id: ingestion.id },
        data: { status: preStatus },
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
    return drafts.map((d) => this.toDraftWire(d));
  }

  /** Phase 4: persist the user's authoritative edits. The model payload is
   *  never overwritten — edits land in user_payload; user-added rows must not
   *  fabricate source evidence (source forced null). */
  async updateDraft(
    actor: Actor,
    ingestionId: string,
    draftId: string,
    edit: DraftEdit,
  ): Promise<DocumentDraftWire> {
    const draft = await this.loadOwnedDraft(actor, ingestionId, draftId);
    if (draft.status !== 'draft') {
      throw new ConflictException({
        code: 'DRAFT_NOT_EDITABLE',
        message: 'This draft has already been confirmed and can no longer be edited',
      });
    }
    const sanitized: DraftEdit = {
      title: edit.title?.trim() ? edit.title.trim() : null,
      title_needs_review: edit.title_needs_review,
      ingredients: edit.ingredients.map((i) => ({
        name: i.name.trim(),
        quantity: i.quantity ?? null,
        unit: i.unit ?? null,
        preparation: i.preparation ?? null,
        provenance: i.provenance,
        // No fabricated source evidence for user-added rows (provenance rule).
        source: i.provenance === 'user_added' ? null : i.source ?? null,
        needs_review: i.needs_review,
      })),
      method_steps: edit.method_steps.map((s) => ({
        text: s.text.trim(),
        provenance: s.provenance,
        source: s.provenance === 'user_added' ? null : s.source ?? null,
        needs_review: s.needs_review,
      })),
    };
    // BUG-007: the write carries the status predicate as well as the id. The read-time
    // check above is a fast path that gives a clean 409 in the ordinary case, but on its own
    // it is check-then-write: a confirm can claim the draft between the read and this
    // statement, and the edit would then land on a draft already being turned into a recipe
    // — silently changing what the user is about to confirm. With the predicate in the
    // WHERE, P2025 means the claim won and the edit is refused.
    const updated = await this.prisma.documentRecipeDraft
      .update({
        where: { id: draft.id, status: 'draft' },
        data: { userPayload: sanitized },
      })
      .catch((err: { code?: string }) => {
        if (err?.code === 'P2025') {
          throw new ConflictException({
            code: 'DRAFT_NOT_EDITABLE',
            message: 'This draft has already been confirmed and can no longer be edited',
          });
        }
        throw err;
      });
    return this.toDraftWire(updated);
  }

  /** Phase 4: explicitly confirm the draft and create a REAL recipe through the
   *  existing recipe-creation path (RecipeService.createForIntake + IntakeService
   *  for the lines + attachMethod + saveRecipe). Idempotent: a second confirm
   *  returns the already-created recipe; a failed create is fully compensated so
   *  a retry never duplicates. */
  async confirmDraft(
    actor: Actor,
    ingestionId: string,
    draftId: string,
  ): Promise<ConfirmDraftWire> {
    const draft = await this.loadOwnedDraft(actor, ingestionId, draftId);

    // Idempotency: a confirmed draft is a no-op returning its existing recipe.
    if (draft.status === 'confirmed' && draft.recipeId) {
      return { recipe_id: draft.recipeId, status: 'already_confirmed' };
    }

    let effective = this.effectiveDraft(draft);
    this.assertConfirmable(effective);

    // Claim the draft so concurrent confirms serialize (no duplicate recipes).
    const claimed = await this.prisma.documentRecipeDraft.updateMany({
      where: { id: draft.id, status: 'draft' },
      data: { status: 'confirming' },
    });
    if (claimed.count === 0) {
      const current = await this.prisma.documentRecipeDraft.findUnique({
        where: { id: draft.id },
      });
      if (current?.status === 'confirmed' && current.recipeId) {
        return { recipe_id: current.recipeId, status: 'already_confirmed' };
      }
      throw new ConflictException({
        code: 'CONFIRM_IN_PROGRESS',
        message: 'Confirmation is already in progress — try again shortly',
      });
    }

    // BUG-007: rebuild from the draft as it is AFTER the claim, not from the earlier read.
    // Building from the pre-claim read meant an edit committed between that read and the
    // claim was silently dropped — the review screen showed the user's correction and the
    // recipe this confirm created did not contain it. The write predicate above now stops an
    // edit crossing the claim; this re-read makes the confirm build from the state that
    // actually committed. Re-asserted because the content can differ from the fast-path
    // check, and an emptied draft must never reach recipe creation.
    effective = this.effectiveDraft(await this.loadOwnedDraft(actor, ingestionId, draftId));
    this.assertConfirmable(effective);

    const entries: FormLineEntry[] = effective.ingredients.map((i) => ({
      displayName: i.preparation ? `${i.name}, ${i.preparation}` : i.name,
      amountText: i.quantity ?? null,
      unit: i.unit ?? null,
      amount: null, // quantity is free text; never parsed here
      groupName: null,
    }));
    const rawText = formRawText(entries);
    const methodText =
      effective.method_steps.length > 0
        ? effective.method_steps.map((s) => s.text).join('\n\n')
        : null;
    const title = effective.title?.trim() || null;

    let recipeId: string | null = null;
    try {
      const recipe = await this.recipes.createForIntake(actor, { rawText });
      recipeId = recipe.id;
      await this.intake.recordFormLines(actor, recipe.id, entries);
      if (methodText) {
        await this.recipes.attachMethod(actor, recipe.id, { mode: 'paste', methodText });
      }
      await this.recipes.saveRecipe(actor, recipe.id, title ? { title } : {});

      await this.prisma.documentRecipeDraft.update({
        where: { id: draft.id },
        data: { status: 'confirmed', recipeId: recipe.id, confirmedAt: new Date() },
      });
      return { recipe_id: recipe.id, status: 'confirmed' };
    } catch (err) {
      // Revert the claim (retryable) + fully remove the partial recipe subtree.
      await this.prisma.documentRecipeDraft
        .update({ where: { id: draft.id }, data: { status: 'draft' } })
        .catch(() => undefined);
      if (recipeId) {
        await this.recipes.deleteRecipeInternal(recipeId).catch(() => undefined);
      }
      throw err;
    }
  }

  /** The authoritative draft: user edits win, else the immutable extraction. */
  private effectiveDraft(draft: DocumentDraftRow): DraftEdit {
    if (draft.userPayload) {
      return draft.userPayload as DraftEdit;
    }
    const payload = draft.payload as RecipeExtraction;
    return {
      title: payload.title,
      title_needs_review: payload.title_needs_review,
      ingredients: payload.ingredients.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        preparation: i.preparation,
        provenance: 'source',
        source: i.source,
        needs_review: i.needs_review,
      })),
      method_steps: payload.method_steps.map((s) => ({
        text: s.text,
        provenance: 'source',
        source: s.source,
        needs_review: s.needs_review,
      })),
    };
  }

  /** Confirmation gate (spec §9): unresolved review flags block creation —
   *  never silently ignore ambiguity. */
  private assertConfirmable(effective: DraftEdit): void {
    const blockers: string[] = [];
    if (effective.title_needs_review) blockers.push('title');
    if (effective.ingredients.some((i) => i.needs_review)) blockers.push('ingredient');
    if (effective.method_steps.some((s) => s.needs_review)) blockers.push('method step');
    if (blockers.length > 0) {
      throw new UnprocessableEntityException({
        code: 'UNRESOLVED_REVIEW',
        message: `Resolve the flagged ${blockers.join(', ')} review items before creating the recipe`,
      });
    }
  }

  /** Load one draft, enforcing document ownership + draft existence (INV-17). */
  private async loadOwnedDraft(
    actor: Actor,
    ingestionId: string,
    draftId: string,
  ): Promise<DocumentDraftRow> {
    const ingestion = await this.loadOwned(actor, ingestionId);
    const draft = await this.prisma.documentRecipeDraft.findFirst({
      where: { id: draftId, ingestionId: ingestion.id },
    });
    if (!draft) {
      throw new NotFoundException({
        code: 'DRAFT_NOT_FOUND',
        message: 'Recipe draft not found',
      });
    }
    return draft;
  }

  private toDraftWire(d: DocumentDraftRow): DocumentDraftWire {
    return {
      draft_id: d.id,
      draft_index: d.draftIndex,
      title: d.title,
      title_needs_review: d.titleNeedsReview,
      needs_review: d.needsReview,
      payload: d.payload as RecipeExtraction,
      user_payload: (d.userPayload as DraftEdit | null) ?? null,
      status: d.status as DocumentDraftWire['status'],
      recipe_id: d.recipeId,
      confirmed_at: d.confirmedAt ? d.confirmedAt.toISOString() : null,
      created_at: d.createdAt.toISOString(),
      updated_at: d.updatedAt.toISOString(),
    };
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
