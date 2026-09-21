import { BadRequestException, ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { Actor } from '../../common/guards/guest-or-jwt.guard';
import { IngestionQueueUnavailableError } from './ingestion.queue.service';
import { IngestionService } from './ingestion.service';

const userActor: Actor = {
  kind: 'user',
  user: { accountId: 'acc-1', email: 'chef@test.dev', sub: 's1' },
};
const guestActor: Actor = { kind: 'guest', guestSessionId: 'gs-1', expiresAt: new Date() };

function mockFile(name: string, size = 1024): Express.Multer.File {
  return {
    originalname: name,
    buffer: Buffer.alloc(size),
    mimetype: 'application/octet-stream',
    size,
  } as Express.Multer.File;
}

const NOW = new Date('2026-09-21T00:00:00.000Z');

function setup() {
  const prisma: any = {
    documentIngestion: {
      create: jest.fn(async (args: { data: Record<string, unknown> }) => ({
        id: 'ing-1',
        ...args.data,
        rawText: null,
        createdAt: NOW,
        updatedAt: NOW,
      })),
      delete: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      update: jest.fn(async (args: { where?: { id?: string }; data: Record<string, unknown> }) => ({
        id: args.where?.id ?? 'ing-1',
        status: args.data.status ?? 'ready',
        rawText: 'Chicken Biryani\n500 g chicken',
        errorCode: args.data.errorCode ?? null,
        errorMessage: args.data.errorMessage ?? null,
        createdAt: NOW,
        updatedAt: NOW,
      })),
    },
    documentRecipeDraft: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const storage = {
    uploadDocument: jest.fn(async () => ({
      key: 'documents/00000000-0000-4000-8000-000000000000.pdf',
      uri: 's3://recipe-assets/documents/00000000-0000-4000-8000-000000000000.pdf',
    })),
    deleteObject: jest.fn(async () => undefined),
  };
  const queue = { enqueue: jest.fn(async () => undefined), enqueueExtraction: jest.fn(async () => undefined) };
  const svc = new IngestionService(prisma, storage as never, queue as never);
  return { prisma, storage, queue, svc };
}

describe('IngestionService.ingestDocument', () => {
  it.each(['pdf', 'docx', 'txt'])('accepts %s, stores it, and returns the queued record', async (ext) => {
    const { prisma, storage, queue, svc } = setup();
    const wire = await svc.ingestDocument(userActor, mockFile(`recipe.${ext}`));

    expect(storage.uploadDocument).toHaveBeenCalledWith(
      expect.any(Buffer),
      `recipe.${ext}`,
      ext,
    );
    expect(prisma.documentIngestion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId: 'acc-1',
        guestSessionId: null,
        fileType: ext,
        status: 'queued',
      }),
    });
    expect(queue.enqueue).toHaveBeenCalledWith('ing-1');
    expect(wire.ingestion_id).toBe('ing-1');
    expect(wire.status).toBe('queued');
    expect(wire.has_text).toBe(false);
  });

  it('records the guest owner for a guest actor', async () => {
    const { prisma, svc } = setup();
    await svc.ingestDocument(guestActor, mockFile('recipe.txt'));
    expect(prisma.documentIngestion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ accountId: null, guestSessionId: 'gs-1' }),
    });
  });

  it.each(['jpg', 'png', 'exe', ''])('rejects unsupported extension %s before storage', async (name) => {
    const { storage, queue, svc } = setup();
    await expect(svc.ingestDocument(userActor, mockFile(name || 'noext'))).rejects.toThrow(BadRequestException);
    expect(storage.uploadDocument).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('rejects documents over 10 MB', async () => {
    const { storage, svc } = setup();
    await expect(
      svc.ingestDocument(userActor, mockFile('big.pdf', 10 * 1024 * 1024 + 1)),
    ).rejects.toMatchObject({ response: { code: 'DOCUMENT_TOO_LARGE' } });
    expect(storage.uploadDocument).not.toHaveBeenCalled();
  });

  it('rolls back the record + object when the queue is unavailable (503)', async () => {
    const { prisma, storage, queue, svc } = setup();
    queue.enqueue.mockRejectedValue(new IngestionQueueUnavailableError());
    await expect(svc.ingestDocument(userActor, mockFile('recipe.pdf'))).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(prisma.documentIngestion.delete).toHaveBeenCalledWith({ where: { id: 'ing-1' } });
    expect(storage.deleteObject).toHaveBeenCalled();
  });
});

describe('IngestionService.getStatus', () => {
  it('returns the record for its owner', async () => {
    const { prisma, svc } = setup();
    prisma.documentIngestion.findUnique.mockResolvedValue({
      id: 'ing-1',
      accountId: 'acc-1',
      guestSessionId: null,
      originalFilename: 'recipe.pdf',
      fileType: 'pdf',
      fileSizeBytes: 1024,
      status: 'ready',
      rawText: 'extracted text',
      errorCode: null,
      errorMessage: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const wire = await svc.getStatus(userActor, 'ing-1');
    expect(wire.status).toBe('ready');
    expect(wire.has_text).toBe(true);
  });

  it('404s for a missing ingestion', async () => {
    const { prisma, svc } = setup();
    prisma.documentIngestion.findUnique.mockResolvedValue(null);
    await expect(svc.getStatus(userActor, 'missing')).rejects.toThrow(NotFoundException);
  });

  it('404s (indistinguishably) for a foreign ingestion', async () => {
    const { prisma, svc } = setup();
    prisma.documentIngestion.findUnique.mockResolvedValue({
      id: 'ing-1',
      accountId: 'someone-else',
      guestSessionId: null,
      status: 'ready',
    });
    await expect(svc.getStatus(userActor, 'ing-1')).rejects.toThrow(NotFoundException);
  });
});

describe('IngestionService.extractStructure (Phase 3)', () => {
  it('transitions a ready document to extracting_structure and enqueues extraction', async () => {
    const { prisma, queue, svc } = setup();
    const readyRow = {
      id: 'ing-1',
      accountId: 'acc-1',
      guestSessionId: null,
      originalFilename: 'recipe.pdf',
      fileType: 'pdf',
      fileSizeBytes: 1024,
      status: 'ready',
      rawText: 'Chicken Biryani\n500 g chicken',
      errorCode: null,
      errorMessage: null,
      createdAt: NOW,
      updatedAt: NOW,
    };
    prisma.documentIngestion.findUnique
      .mockResolvedValueOnce(readyRow)
      .mockResolvedValue({ ...readyRow, status: 'extracting_structure' });

    const wire = await svc.extractStructure(userActor, 'ing-1');

    expect(prisma.documentIngestion.update).toHaveBeenCalledWith({
      where: { id: 'ing-1' },
      data: { status: 'extracting_structure', errorCode: null, errorMessage: null },
    });
    expect(queue.enqueueExtraction).toHaveBeenCalledWith('ing-1');
    expect(wire.status).toBe('extracting_structure');
  });

  it('rejects extraction when the document is not ready', async () => {
    const { prisma, queue, svc } = setup();
    prisma.documentIngestion.findUnique.mockResolvedValue({
      id: 'ing-1',
      accountId: 'acc-1',
      guestSessionId: null,
      status: 'extracting',
    });
    await expect(svc.extractStructure(userActor, 'ing-1')).rejects.toThrow(ConflictException);
    expect(queue.enqueueExtraction).not.toHaveBeenCalled();
  });

  it('reverts to ready + 503 when the extraction queue is unavailable', async () => {
    const { prisma, queue, svc } = setup();
    prisma.documentIngestion.findUnique.mockResolvedValue({
      id: 'ing-1',
      accountId: 'acc-1',
      guestSessionId: null,
      status: 'ready',
      rawText: 'text',
    });
    queue.enqueueExtraction.mockRejectedValue(new IngestionQueueUnavailableError());

    await expect(svc.extractStructure(userActor, 'ing-1')).rejects.toThrow(ServiceUnavailableException);
    expect(prisma.documentIngestion.update).toHaveBeenLastCalledWith({
      where: { id: 'ing-1' },
      data: { status: 'ready' },
    });
  });
});

describe('IngestionService.getDrafts (Phase 3)', () => {
  it('returns the persisted source-faithful drafts', async () => {
    const { prisma, svc } = setup();
    prisma.documentIngestion.findUnique.mockResolvedValue({
      id: 'ing-1',
      accountId: 'acc-1',
      guestSessionId: null,
      status: 'draft_ready',
    });
    prisma.documentRecipeDraft.findMany.mockResolvedValue([
      {
        id: 'draft-1',
        draftIndex: 0,
        title: 'Chicken Biryani',
        titleNeedsReview: false,
        needsReview: false,
        payload: { title: 'Chicken Biryani', title_needs_review: false, ingredients: [], method_steps: [], needs_review: false, notes: [] },
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);

    const drafts = await svc.getDrafts(userActor, 'ing-1');
    expect(drafts).toHaveLength(1);
    expect(drafts[0].draft_id).toBe('draft-1');
    expect(drafts[0].title).toBe('Chicken Biryani');
  });

  it('404s for a foreign ingestion', async () => {
    const { prisma, svc } = setup();
    prisma.documentIngestion.findUnique.mockResolvedValue({
      id: 'ing-1',
      accountId: 'someone-else',
      guestSessionId: null,
      status: 'draft_ready',
    });
    await expect(svc.getDrafts(userActor, 'ing-1')).rejects.toThrow(NotFoundException);
  });
});
