import { BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
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
    },
  };
  const storage = {
    uploadDocument: jest.fn(async () => ({
      key: 'documents/00000000-0000-4000-8000-000000000000.pdf',
      uri: 's3://recipe-assets/documents/00000000-0000-4000-8000-000000000000.pdf',
    })),
    deleteObject: jest.fn(async () => undefined),
  };
  const queue = { enqueue: jest.fn(async () => undefined) };
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
