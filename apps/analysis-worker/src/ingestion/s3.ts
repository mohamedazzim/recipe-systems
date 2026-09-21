// S3 object read for the ingestion worker. Reuses the SAME storage system and
// the SAME @aws-sdk/client-s3 SDK + env vars as the API's StorageService — this
// is a read-only fetch, not a second storage abstraction.

import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

export interface StoredDocument {
  buffer: Buffer;
  contentType: string | null;
}

export function ingestionBucket(): string {
  return process.env.S3_BUCKET ?? 'recipe-assets';
}

export function createS3Client(): S3Client {
  return new S3Client({
    region: 'us-east-1',
    endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
    forcePathStyle: true, // required for MinIO-style path addressing
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? 'minioadmin',
      secretAccessKey: process.env.S3_SECRET_KEY ?? 'minioadmin',
    },
  });
}

/** Read the stored document bytes. Returns null when the object is gone or
 *  storage is unavailable (the handler then marks the ingestion `failed`). */
export async function getDocumentObject(key: string): Promise<StoredDocument | null> {
  try {
    const client = createS3Client();
    const output = await client.send(new GetObjectCommand({ Bucket: ingestionBucket(), Key: key }));
    if (!output.Body) return null;
    const bytes = await output.Body.transformToByteArray();
    return {
      buffer: Buffer.from(bytes),
      contentType: output.ContentType ?? null,
    };
  } catch {
    return null;
  }
}
