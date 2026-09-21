import { S3Client } from '@aws-sdk/client-s3';
import { documentFileTypeOf, StorageService } from './storage.service';

jest.mock('@aws-sdk/client-s3', () => {
  class MockS3Client {
    send() {
      return Promise.resolve({});
    }
  }
  return {
    S3Client: MockS3Client,
    HeadBucketCommand: jest.fn((args: any) => ({ name: 'HeadBucket', args })),
    CreateBucketCommand: jest.fn((args: any) => ({ name: 'CreateBucket', args })),
    PutObjectCommand: jest.fn((args: any) => ({ name: 'PutObject', args })),
    DeleteObjectCommand: jest.fn((args: any) => ({ name: 'DeleteObject', args })),
    HeadObjectCommand: jest.fn((args: any) => ({ name: 'HeadObject', args })),
    GetObjectCommand: jest.fn((args: any) => ({ name: 'GetObject', args })),
  };
});

function mockSend() {
  // Shared via the prototype so the StorageService's own instance uses the same mock.
  const send = jest.fn();
  (S3Client.prototype as any).send = send;
  return { send };
}

describe('StorageService', () => {
  it('uploads an image and returns the s3:// URI reference (never the blob)', async () => {
    const { send } = mockSend();
    send.mockResolvedValue({});
    const svc = new StorageService();
    const stored = await svc.uploadImage(Buffer.from('jpeg-bytes'), 'image/jpeg');
    expect(stored.key).toMatch(/^recipes\/[0-9a-f-]+\.jpg$/);
    expect(stored.uri).toBe(`s3://recipe-assets/${stored.key}`);
    const put = send.mock.calls[0][0] as any;
    expect(put.name).toBe('PutObject');
    expect(put.args.Bucket).toBe('recipe-assets');
    expect(put.args.ContentType).toBe('image/jpeg');
    expect(Buffer.isBuffer(put.args.Body)).toBe(true);
  });

  it('uses .png keys for PNG content', async () => {
    const { send } = mockSend();
    send.mockResolvedValue({});
    const svc = new StorageService();
    const stored = await svc.uploadImage(Buffer.from('png-bytes'), 'image/png');
    expect(stored.key).toMatch(/\.png$/);
  });

  it('Phase 2: uploads a document with a server-generated key + original-filename metadata', async () => {
    const { send } = mockSend();
    send.mockResolvedValue({});
    const svc = new StorageService();
    const stored = await svc.uploadDocument(Buffer.from('doc-bytes'), 'Family Recipes.pdf', 'pdf');
    expect(stored.key).toMatch(/^documents\/[0-9a-f-]+\.pdf$/);
    expect(stored.uri).toBe(`s3://recipe-assets/${stored.key}`);
    const put = send.mock.calls[0][0] as any;
    expect(put.args.Bucket).toBe('recipe-assets');
    expect(put.args.ContentType).toBe('application/pdf');
    expect(put.args.Metadata).toEqual({ 'original-filename': 'Family Recipes.pdf' });
    expect(Buffer.isBuffer(put.args.Body)).toBe(true);
  });

  it('Phase 2: documentFileTypeOf resolves case-insensitive extensions and rejects others', () => {
    expect(documentFileTypeOf('a.PDF')).toBe('pdf');
    expect(documentFileTypeOf('b.docx')).toBe('docx');
    expect(documentFileTypeOf('c.txt')).toBe('txt');
    expect(documentFileTypeOf('d.jpg')).toBeNull();
    expect(documentFileTypeOf('noext')).toBeNull();
  });

  it('QG4: upload failure surfaces as STORAGE_UPLOAD_FAILED — callers persist no URI', async () => {
    const { send } = mockSend();
    send.mockRejectedValue(new Error('connection refused'));
    const svc = new StorageService();
    await expect(svc.uploadImage(Buffer.from('x'), 'image/jpeg')).rejects.toMatchObject({
      response: { code: 'STORAGE_UPLOAD_FAILED' },
    });
  });

  it('ensureBucket is idempotent: existing bucket → no CreateBucket', async () => {
    const { send } = mockSend();
    send.mockResolvedValueOnce({});
    const svc = new StorageService();
    await svc.ensureBucket();
    expect(send.mock.calls[0][0].name).toBe('HeadBucket');
    expect(send.mock.calls.some((c: any) => c[0].name === 'CreateBucket')).toBe(false);
  });

  it('ensureBucket creates the bucket when it is missing', async () => {
    const { send } = mockSend();
    send.mockRejectedValueOnce(new Error('NotFound'));
    send.mockResolvedValueOnce({});
    const svc = new StorageService();
    await svc.ensureBucket();
    expect(send.mock.calls[1][0].name).toBe('CreateBucket');
  });

  it('QG4: ensureBucket NEVER throws when storage is down (degraded start, CI-safe boot)', async () => {
    const { send } = mockSend();
    send.mockRejectedValue(new Error('connection refused')); // HeadBucket AND CreateBucket both fail
    const svc = new StorageService();
    await expect(svc.ensureBucket()).resolves.toBeUndefined();
  });

  it('deleteObject is best-effort: storage errors do not propagate (QG4 rollback path)', async () => {
    const { send } = mockSend();
    send.mockRejectedValue(new Error('down'));
    const svc = new StorageService();
    await expect(svc.deleteObject('recipes/x.jpg')).resolves.toBeUndefined();
    expect(send.mock.calls[0][0].name).toBe('DeleteObject');
  });

  it('objectExists probes HeadObject (QG4 evidence probe)', async () => {
    const { send } = mockSend();
    send.mockResolvedValueOnce({});
    const svc = new StorageService();
    await expect(svc.objectExists('recipes/x.jpg')).resolves.toBe(true);
    send.mockRejectedValueOnce(new Error('404'));
    await expect(svc.objectExists('recipes/x.jpg')).resolves.toBe(false);
  });

  it('D6: tryDeleteObject reports observable outcome — true on delete, false on residue', async () => {
    const { send } = mockSend();
    send.mockResolvedValueOnce({});
    const svc = new StorageService();
    await expect(svc.tryDeleteObject('recipes/x.jpg')).resolves.toBe(true);
    expect(send.mock.calls[0][0].name).toBe('DeleteObject');

    send.mockRejectedValueOnce(new Error('down'));
    await expect(svc.tryDeleteObject('recipes/y.jpg')).resolves.toBe(false);
  });

  it('getImage returns the stored bytes + content type (read-only asset route)', async () => {
    const { send } = mockSend();
    const stream = {} as never;
    send.mockResolvedValueOnce({ Body: stream, ContentType: 'image/png' });
    const svc = new StorageService();
    const image = await svc.getImage('recipes/x.png');
    expect(send.mock.calls[0][0].name).toBe('GetObject');
    expect(image).toEqual({ stream, contentType: 'image/png' });

    send.mockResolvedValueOnce({ Body: undefined });
    await expect(svc.getImage('recipes/missing.png')).resolves.toBeNull();
    send.mockRejectedValueOnce(new Error('404'));
    await expect(svc.getImage('recipes/gone.png')).resolves.toBeNull();
  });
});
