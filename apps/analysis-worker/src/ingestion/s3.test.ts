import { S3Client } from '@aws-sdk/client-s3';
import { getDocumentObject, ingestionBucket } from './s3';

jest.mock('@aws-sdk/client-s3', () => {
  class MockS3Client {
    send() {
      return Promise.resolve({});
    }
  }
  return {
    S3Client: MockS3Client,
    GetObjectCommand: jest.fn((args: unknown) => ({ name: 'GetObject', args })),
  };
});

describe('s3 (ingestion worker)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('ingestionBucket defaults to recipe-assets', () => {
    expect(ingestionBucket()).toBe('recipe-assets');
  });

  it('getDocumentObject returns the stored bytes + content type', async () => {
    const send = jest.fn().mockResolvedValue({
      Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
      ContentType: 'application/pdf',
    });
    (S3Client.prototype as unknown as { send: unknown }).send = send;

    const doc = await getDocumentObject('documents/x.pdf');

    expect(send.mock.calls[0][0].name).toBe('GetObject');
    expect(Buffer.isBuffer(doc!.buffer)).toBe(true);
    expect(doc!.buffer.toString('hex')).toBe('010203');
    expect(doc!.contentType).toBe('application/pdf');
  });

  it('getDocumentObject returns null when storage is unavailable', async () => {
    (S3Client.prototype as unknown as { send: unknown }).send = jest
      .fn()
      .mockRejectedValue(new Error('down'));
    await expect(getDocumentObject('documents/x.pdf')).resolves.toBeNull();
  });

  it('getDocumentObject returns null when the object has no body', async () => {
    (S3Client.prototype as unknown as { send: unknown }).send = jest
      .fn()
      .mockResolvedValue({ Body: undefined });
    await expect(getDocumentObject('documents/x.pdf')).resolves.toBeNull();
  });
});
