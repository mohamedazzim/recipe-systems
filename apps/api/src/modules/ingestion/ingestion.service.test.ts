import { BadRequestException, ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { RecipeExtraction } from '@recipe-systems/schemas';
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
      // BUG-019: the extraction claim is now a conditional updateMany. The double
      // reports a successful claim by default; a test can force { count: 0 } to assert
      // the 409.
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
      findFirst: jest.fn(),
      update: jest.fn(async (args: { where?: { id?: string }; data: Record<string, unknown> }) => ({
        id: args.where?.id ?? 'draft-1',
        ...args.data,
        draftIndex: 0,
        title: 'Chicken Biryani',
        titleNeedsReview: false,
        needsReview: false,
        payload: { title: 'Chicken Biryani' },
        status: (args.data.status as string | undefined) ?? 'draft',
        recipeId: null,
        confirmedAt: null,
        createdAt: NOW,
        updatedAt: NOW,
      })),
      updateMany: jest.fn(),
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
  const recipes = {
    createForIntake: jest.fn(),
    attachMethod: jest.fn(),
    saveRecipe: jest.fn(),
    deleteRecipeInternal: jest.fn(async () => []),
  };
  const intake = {
    recordFormLines: jest.fn(),
  };
  const svc = new IngestionService(
    prisma,
    storage as never,
    queue as never,
    recipes as never,
    intake as never,
  );
  return { prisma, storage, queue, recipes, intake, svc };
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

    // BUG-019: the transition is now the atomic claim, so it is an updateMany with the
    // status in the WHERE — that predicate is what makes a concurrent second caller
    // match zero rows instead of both enqueueing.
    expect(prisma.documentIngestion.updateMany).toHaveBeenCalledWith({
      where: { id: 'ing-1', status: { in: ['ready', 'extraction_failed'] } },
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

  it('allows re-extraction after a prior extraction_failed (Retry path)', async () => {
    const { prisma, queue, svc } = setup();
    const failedRow = {
      id: 'ing-1',
      accountId: 'acc-1',
      guestSessionId: null,
      originalFilename: 'recipe.pdf',
      fileType: 'pdf',
      fileSizeBytes: 1024,
      status: 'extraction_failed',
      rawText: 'Chicken Biryani\n500 g chicken',
      errorCode: 'INVALID_EXTRACTION',
      errorMessage: 'No valid recipe structure',
      createdAt: NOW,
      updatedAt: NOW,
    };
    prisma.documentIngestion.findUnique
      .mockResolvedValueOnce(failedRow)
      .mockResolvedValue({ ...failedRow, status: 'extracting_structure' });

    const wire = await svc.extractStructure(userActor, 'ing-1');

    // BUG-019: the transition is now the atomic claim, so it is an updateMany with the
    // status in the WHERE — that predicate is what makes a concurrent second caller
    // match zero rows instead of both enqueueing.
    expect(prisma.documentIngestion.updateMany).toHaveBeenCalledWith({
      where: { id: 'ing-1', status: { in: ['ready', 'extraction_failed'] } },
      data: { status: 'extracting_structure', errorCode: null, errorMessage: null },
    });
    expect(queue.enqueueExtraction).toHaveBeenCalledWith('ing-1');
    expect(wire.status).toBe('extracting_structure');
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

// ───────────────────────── Phase 4 helpers ─────────────────────────

function ownedIngestion() {
  return { id: 'ing-1', accountId: 'acc-1', guestSessionId: null, status: 'draft_ready' };
}

function fullPayload(): RecipeExtraction {
  return {
    title: 'Chicken Biryani',
    title_needs_review: false,
    ingredients: [
      {
        name: 'chicken',
        quantity: '500',
        unit: 'g',
        preparation: null,
        source: '500 g chicken',
        needs_review: false,
      },
    ],
    method_steps: [{ text: 'Cook the chicken.', source: 'Cook the chicken.', needs_review: false }],
    needs_review: false,
    notes: [],
  };
}

function draftRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'draft-1',
    ingestionId: 'ing-1',
    draftIndex: 0,
    title: 'Chicken Biryani',
    titleNeedsReview: false,
    needsReview: false,
    payload: fullPayload(),
    userPayload: null,
    status: 'draft',
    recipeId: null,
    confirmedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('IngestionService.updateDraft (Phase 4)', () => {
  const edit = {
    title: 'Spicy Biryani',
    title_needs_review: false,
    ingredients: [
      {
        name: 'red onions',
        quantity: '3',
        unit: null,
        preparation: null,
        provenance: 'user_corrected',
        source: 'onions',
        needs_review: false,
      },
      {
        name: 'ginger',
        quantity: null,
        unit: null,
        preparation: null,
        provenance: 'user_added',
        source: 'FAKE', // must be stripped — user-added rows never fabricate evidence
        needs_review: false,
      },
    ],
    method_steps: [],
  };

  it('persists user edits and strips fabricated source from user-added rows', async () => {
    const { prisma, svc } = setup();
    prisma.documentIngestion.findUnique.mockResolvedValue(ownedIngestion());
    prisma.documentRecipeDraft.findFirst.mockResolvedValue(draftRow());

    const wire = await svc.updateDraft(userActor, 'ing-1', 'draft-1', edit as never);

    const updateCall = prisma.documentRecipeDraft.update.mock.calls[0][0];
    const saved = updateCall.data.userPayload;
    expect(saved.title).toBe('Spicy Biryani');
    expect(saved.ingredients[1].source).toBeNull(); // user_added source forced null
    expect(wire.status).toBe('draft');
  });

  it('rejects edits to a confirmed draft', async () => {
    const { prisma, svc } = setup();
    prisma.documentIngestion.findUnique.mockResolvedValue(ownedIngestion());
    prisma.documentRecipeDraft.findFirst.mockResolvedValue(
      draftRow({ status: 'confirmed', recipeId: 'recipe-1' }),
    );
    await expect(svc.updateDraft(userActor, 'ing-1', 'draft-1', edit as never)).rejects.toThrow(
      ConflictException,
    );
  });

  it('404s for a missing draft', async () => {
    const { prisma, svc } = setup();
    prisma.documentIngestion.findUnique.mockResolvedValue(ownedIngestion());
    prisma.documentRecipeDraft.findFirst.mockResolvedValue(null);
    await expect(svc.updateDraft(userActor, 'ing-1', 'draft-1', edit as never)).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('IngestionService.confirmDraft (Phase 4)', () => {
  it('creates a real recipe through the existing path and marks the draft confirmed', async () => {
    const { prisma, recipes, intake, svc } = setup();
    prisma.documentIngestion.findUnique.mockResolvedValue(ownedIngestion());
    prisma.documentRecipeDraft.findFirst.mockResolvedValue(draftRow());
    prisma.documentRecipeDraft.updateMany.mockResolvedValue({ count: 1 });
    recipes.createForIntake.mockResolvedValue({ id: 'recipe-1' });

    const res = await svc.confirmDraft(userActor, 'ing-1', 'draft-1');

    expect(recipes.createForIntake).toHaveBeenCalled();
    expect(intake.recordFormLines).toHaveBeenCalledWith(
      userActor,
      'recipe-1',
      expect.arrayContaining([expect.objectContaining({ displayName: 'chicken' })]),
    );
    expect(recipes.attachMethod).toHaveBeenCalledWith(
      userActor,
      'recipe-1',
      expect.objectContaining({ mode: 'paste' }),
    );
    expect(recipes.saveRecipe).toHaveBeenCalled();
    expect(prisma.documentRecipeDraft.update).toHaveBeenCalledWith({
      where: { id: 'draft-1' },
      data: expect.objectContaining({ status: 'confirmed', recipeId: 'recipe-1' }),
    });
    expect(res).toEqual({ recipe_id: 'recipe-1', status: 'confirmed' });
  });

  it('is idempotent: a confirmed draft returns its existing recipe', async () => {
    const { prisma, recipes, svc } = setup();
    prisma.documentIngestion.findUnique.mockResolvedValue(ownedIngestion());
    prisma.documentRecipeDraft.findFirst.mockResolvedValue(
      draftRow({ status: 'confirmed', recipeId: 'recipe-1' }),
    );
    const res = await svc.confirmDraft(userActor, 'ing-1', 'draft-1');
    expect(res).toEqual({ recipe_id: 'recipe-1', status: 'already_confirmed' });
    expect(recipes.createForIntake).not.toHaveBeenCalled();
  });

  it('blocks confirmation while review flags remain', async () => {
    const { prisma, recipes, svc } = setup();
    prisma.documentIngestion.findUnique.mockResolvedValue(ownedIngestion());
    const row = draftRow();
    row.payload = {
      ...fullPayload(),
      ingredients: [
        {
          name: 'onions',
          quantity: null,
          unit: null,
          preparation: null,
          source: 'onions',
          needs_review: true,
        },
      ],
    };
    prisma.documentRecipeDraft.findFirst.mockResolvedValue(row);

    await expect(svc.confirmDraft(userActor, 'ing-1', 'draft-1')).rejects.toMatchObject({
      response: { code: 'UNRESOLVED_REVIEW' },
    });
    expect(recipes.createForIntake).not.toHaveBeenCalled();
  });

  it('compensates a failed creation (revert claim + delete partial recipe)', async () => {
    const { prisma, recipes, intake, svc } = setup();
    prisma.documentIngestion.findUnique.mockResolvedValue(ownedIngestion());
    prisma.documentRecipeDraft.findFirst.mockResolvedValue(draftRow());
    prisma.documentRecipeDraft.updateMany.mockResolvedValue({ count: 1 });
    recipes.createForIntake.mockResolvedValue({ id: 'recipe-1' });
    intake.recordFormLines.mockRejectedValue(new Error('boom'));

    await expect(svc.confirmDraft(userActor, 'ing-1', 'draft-1')).rejects.toThrow('boom');
    expect(prisma.documentRecipeDraft.update).toHaveBeenCalledWith({
      where: { id: 'draft-1' },
      data: { status: 'draft' },
    });
    expect(recipes.deleteRecipeInternal).toHaveBeenCalledWith('recipe-1');
  });
});
