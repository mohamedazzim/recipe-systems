import { LlmPermanentProviderError } from '@recipe-systems/llm-adapter';
import { DocumentExtractionJobHandler } from './extraction-job.handler';

function validExtraction() {
  return {
    recipes: [
      {
        title: 'Chicken Biryani',
        title_needs_review: false,
        ingredients: [
          {
            name: 'chicken',
            quantity: '500 g',
            unit: 'g',
            preparation: null,
            source: '500 g chicken',
            needs_review: false,
          },
        ],
        method_steps: [{ text: 'Cook the chicken.', source: 'Cook the chicken.', needs_review: false }],
        needs_review: false,
        notes: [],
      },
    ],
  };
}

function setup() {
  const prisma: unknown = {
    documentIngestion: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
    documentRecipeDraft: { deleteMany: jest.fn(), create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  };
  const adapter = {
    providerName: 'deepseek',
    modelVersion: 'deepseek:test',
    generate: jest.fn(),
    extractRecipeText: jest.fn(),
  };
  const handler = new DocumentExtractionJobHandler(prisma as never, adapter as never);
  return { prisma: prisma as { documentIngestion: { findUnique: jest.Mock; update: jest.Mock }; documentRecipeDraft: { deleteMany: jest.Mock; create: jest.Mock } }, adapter, handler };
}

function ingestion(status = 'ready', rawText: string | null = 'Chicken Biryani\n500 g chicken\nCook the chicken.') {
  return { id: 'ing-1', status, rawText };
}

describe('DocumentExtractionJobHandler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('ready → extracting_structure → draft_ready with persisted drafts', async () => {
    const { prisma, adapter, handler } = setup();
    prisma.documentIngestion.findUnique.mockResolvedValue(ingestion());
    (adapter.extractRecipeText as jest.Mock).mockResolvedValue(validExtraction());

    await handler.handle({ ingestion_id: 'ing-1' });

    expect(prisma.documentIngestion.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'ing-1' },
      data: { status: 'extracting_structure', errorCode: null, errorMessage: null },
    });
    expect(prisma.documentRecipeDraft.deleteMany).toHaveBeenCalledWith({ where: { ingestionId: 'ing-1' } });
    expect(prisma.documentRecipeDraft.create).toHaveBeenCalledTimes(1);
    expect(prisma.documentIngestion.update).toHaveBeenLastCalledWith({
      where: { id: 'ing-1' },
      data: { status: 'draft_ready' },
    });
  });

  it('marks INVALID_EXTRACTION when the model output is malformed (never published)', async () => {
    const { prisma, adapter, handler } = setup();
    prisma.documentIngestion.findUnique.mockResolvedValue(ingestion());
    (adapter.extractRecipeText as jest.Mock).mockResolvedValue({ recipes: [{ title: 42 }] });

    await handler.handle({ ingestion_id: 'ing-1' });

    expect(prisma.documentIngestion.update).toHaveBeenLastCalledWith({
      where: { id: 'ing-1' },
      data: expect.objectContaining({ status: 'extraction_failed', errorCode: 'INVALID_EXTRACTION' }),
    });
    expect(prisma.documentRecipeDraft.create).not.toHaveBeenCalled();
  });

  it('marks EXTRACTION_FAILED on a permanent provider error (no invented data)', async () => {
    const { prisma, adapter, handler } = setup();
    prisma.documentIngestion.findUnique.mockResolvedValue(ingestion());
    (adapter.extractRecipeText as jest.Mock).mockRejectedValue(new LlmPermanentProviderError('no key'));

    await handler.handle({ ingestion_id: 'ing-1' });

    expect(prisma.documentIngestion.update).toHaveBeenLastCalledWith({
      where: { id: 'ing-1' },
      data: expect.objectContaining({ status: 'extraction_failed', errorCode: 'EXTRACTION_FAILED' }),
    });
  });

  it('is idempotent for an already draft_ready document', async () => {
    const { prisma, adapter, handler } = setup();
    prisma.documentIngestion.findUnique.mockResolvedValue(ingestion('draft_ready'));

    await handler.handle({ ingestion_id: 'ing-1' });

    expect(adapter.extractRecipeText).not.toHaveBeenCalled();
    expect(prisma.documentIngestion.update).not.toHaveBeenCalled();
  });

  it('marks NO_RAW_TEXT when the source has no raw text', async () => {
    const { prisma, handler } = setup();
    prisma.documentIngestion.findUnique.mockResolvedValue(ingestion('ready', null));

    await handler.handle({ ingestion_id: 'ing-1' });

    expect(prisma.documentIngestion.update).toHaveBeenLastCalledWith({
      where: { id: 'ing-1' },
      data: expect.objectContaining({ status: 'extraction_failed', errorCode: 'NO_RAW_TEXT' }),
    });
  });
});
