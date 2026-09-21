import { DocumentExtractionError } from './extract';
import { DocumentIngestionJobHandler } from './ingestion-job.handler';

jest.mock('./s3', () => ({
  ...jest.requireActual('./s3'),
  getDocumentObject: jest.fn(),
}));
jest.mock('./extract', () => ({
  ...jest.requireActual('./extract'),
  extractDocumentText: jest.fn(),
}));

import { getDocumentObject } from './s3';
import { extractDocumentText } from './extract';

const getDoc = getDocumentObject as jest.MockedFunction<typeof getDocumentObject>;
const extract = extractDocumentText as jest.MockedFunction<typeof extractDocumentText>;

function setup() {
  const update = jest.fn().mockResolvedValue({});
  const findUnique = jest.fn();
  const prisma: unknown = { documentIngestion: { findUnique, update } };
  const handler = new DocumentIngestionJobHandler(prisma as never);
  return { update, findUnique, handler };
}

function record(status = 'queued') {
  return {
    id: 'ing-1',
    storageKey: 'documents/00000000-0000-4000-8000-000000000000.pdf',
    fileType: 'pdf',
    status,
    rawText: null,
  };
}

describe('DocumentIngestionJobHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('queued → extracting → ready with the extracted raw text', async () => {
    const { update, findUnique, handler } = setup();
    findUnique.mockResolvedValue(record('queued'));
    getDoc.mockResolvedValue({ buffer: Buffer.from('x'), contentType: 'application/pdf' });
    extract.mockResolvedValue('Fish 500g');

    await handler.handle({ ingestion_id: 'ing-1' });

    expect(update).toHaveBeenNthCalledWith(1, {
      where: { id: 'ing-1' },
      data: { status: 'extracting', errorCode: null, errorMessage: null },
    });
    const [fileType, buf] = extract.mock.calls[0] as [string, Buffer];
    expect(fileType).toBe('pdf');
    expect(buf.toString()).toBe('x');
    expect(update).toHaveBeenNthCalledWith(2, {
      where: { id: 'ing-1' },
      data: { status: 'ready', rawText: 'Fish 500g' },
    });
  });

  it('marks failed when the stored object cannot be read', async () => {
    const { update, findUnique, handler } = setup();
    findUnique.mockResolvedValue(record('queued'));
    getDoc.mockResolvedValue(null);

    await handler.handle({ ingestion_id: 'ing-1' });

    expect(update).toHaveBeenLastCalledWith({
      where: { id: 'ing-1' },
      data: {
        status: 'failed',
        errorCode: 'STORAGE_READ_FAILED',
        errorMessage: 'The stored document could not be read.',
      },
    });
    expect(extract).not.toHaveBeenCalled();
  });

  it('marks failed with the extraction error code (no invented text)', async () => {
    const { update, findUnique, handler } = setup();
    findUnique.mockResolvedValue(record('queued'));
    getDoc.mockResolvedValue({ buffer: Buffer.from('x'), contentType: 'application/pdf' });
    extract.mockRejectedValue(new DocumentExtractionError('NO_TEXT_EXTRACTED', 'No text could be extracted.'));

    await handler.handle({ ingestion_id: 'ing-1' });

    expect(update).toHaveBeenLastCalledWith({
      where: { id: 'ing-1' },
      data: { status: 'failed', errorCode: 'NO_TEXT_EXTRACTED', errorMessage: 'No text could be extracted.' },
    });
  });

  it('is idempotent for an already-ready document', async () => {
    const { update, findUnique, handler } = setup();
    findUnique.mockResolvedValue(record('ready'));

    await handler.handle({ ingestion_id: 'ing-1' });

    expect(update).not.toHaveBeenCalled();
    expect(extract).not.toHaveBeenCalled();
  });

  it('no-ops for a missing document', async () => {
    const { update, findUnique, handler } = setup();
    findUnique.mockResolvedValue(null);

    await handler.handle({ ingestion_id: 'missing' });

    expect(update).not.toHaveBeenCalled();
  });
});
