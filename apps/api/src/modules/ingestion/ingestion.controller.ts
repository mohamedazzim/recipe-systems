// Phase 2 ingestion HTTP surface. POST uploads + enqueues one document; GET
// polls its lifecycle status. Auth: Bearer or guest (GuestOrJwtGuard), CSRF on
// the mutating route — the same mechanisms as the existing intake routes.

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DraftEditSchema } from '@recipe-systems/schemas';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { ActorRequest, GuestOrJwtGuard } from '../../common/guards/guest-or-jwt.guard';
import { IngestionService } from './ingestion.service';
import { MAX_DOCUMENT_BYTES } from '../intake/storage.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller('recipes/import')
export class IngestionController {
  constructor(private readonly ingestion: IngestionService) {}

  /** Phase 2: store the original document + create a `queued` record; the
   *  worker extracts source-faithful raw text asynchronously. */
  @Post('documents')
  @UseGuards(GuestOrJwtGuard, CsrfGuard)
  // BUG-014: limit at the interceptor, so Multer aborts the stream instead of
  // buffering the whole body in memory before the handler's size check runs.
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_DOCUMENT_BYTES } }))
  async uploadDocument(@Req() req: ActorRequest, @UploadedFile() file?: Express.Multer.File) {
    return this.ingestion.ingestDocument(req.actor!, file!);
  }

  /** Poll one document's lifecycle (queued → extracting → ready/failed). */
  @Get('documents/:id')
  @UseGuards(GuestOrJwtGuard)
  async getDocument(@Req() req: ActorRequest, @Param('id') id: string) {
    if (!UUID_RE.test(id)) {
      throw new NotFoundException({
        code: 'INGESTION_NOT_FOUND',
        message: 'Document ingestion not found',
      });
    }
    return this.ingestion.getStatus(req.actor!, id);
  }

  /** Phase 3: trigger source-faithful structured extraction on a ready document. */
  @Post('documents/:id/extract')
  @HttpCode(200)
  @UseGuards(GuestOrJwtGuard, CsrfGuard)
  async extract(@Req() req: ActorRequest, @Param('id') id: string) {
    if (!UUID_RE.test(id)) {
      throw new NotFoundException({
        code: 'INGESTION_NOT_FOUND',
        message: 'Document ingestion not found',
      });
    }
    return this.ingestion.extractStructure(req.actor!, id);
  }

  /** Phase 3: return the source-faithful drafts for review (not final recipes). */
  @Get('documents/:id/drafts')
  @UseGuards(GuestOrJwtGuard)
  async getDrafts(@Req() req: ActorRequest, @Param('id') id: string) {
    if (!UUID_RE.test(id)) {
      throw new NotFoundException({
        code: 'INGESTION_NOT_FOUND',
        message: 'Document ingestion not found',
      });
    }
    return { drafts: await this.ingestion.getDrafts(req.actor!, id) };
  }

  /** Phase 4: persist the user's authoritative edits for one draft. */
  @Patch('documents/:id/drafts/:draftId')
  @UseGuards(GuestOrJwtGuard, CsrfGuard)
  async updateDraft(
    @Req() req: ActorRequest,
    @Param('id') id: string,
    @Param('draftId') draftId: string,
    @Body() body: unknown,
  ) {
    if (!UUID_RE.test(id)) {
      throw new NotFoundException({ code: 'INGESTION_NOT_FOUND', message: 'Document ingestion not found' });
    }
    if (!UUID_RE.test(draftId)) {
      throw new NotFoundException({ code: 'DRAFT_NOT_FOUND', message: 'Recipe draft not found' });
    }
    const parsed = DraftEditSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'INVALID_DRAFT',
        message: 'Draft must contain { title, title_needs_review, ingredients, method_steps }',
      });
    }
    return this.ingestion.updateDraft(req.actor!, id, draftId, parsed.data);
  }

  /** Phase 4: explicitly confirm the draft and create a real recipe. */
  @Post('documents/:id/drafts/:draftId/confirm')
  @HttpCode(200)
  @UseGuards(GuestOrJwtGuard, CsrfGuard)
  async confirmDraft(
    @Req() req: ActorRequest,
    @Param('id') id: string,
    @Param('draftId') draftId: string,
  ) {
    if (!UUID_RE.test(id)) {
      throw new NotFoundException({ code: 'INGESTION_NOT_FOUND', message: 'Document ingestion not found' });
    }
    if (!UUID_RE.test(draftId)) {
      throw new NotFoundException({ code: 'DRAFT_NOT_FOUND', message: 'Recipe draft not found' });
    }
    return this.ingestion.confirmDraft(req.actor!, id, draftId);
  }
}
