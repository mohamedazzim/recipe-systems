// Phase 2 ingestion HTTP surface. POST uploads + enqueues one document; GET
// polls its lifecycle status. Auth: Bearer or guest (GuestOrJwtGuard), CSRF on
// the mutating route — the same mechanisms as the existing intake routes.

import {
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { ActorRequest, GuestOrJwtGuard } from '../../common/guards/guest-or-jwt.guard';
import { IngestionService } from './ingestion.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller('recipes/import')
export class IngestionController {
  constructor(private readonly ingestion: IngestionService) {}

  /** Phase 2: store the original document + create a `queued` record; the
   *  worker extracts source-faithful raw text asynchronously. */
  @Post('documents')
  @UseGuards(GuestOrJwtGuard, CsrfGuard)
  @UseInterceptors(FileInterceptor('file'))
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
}
