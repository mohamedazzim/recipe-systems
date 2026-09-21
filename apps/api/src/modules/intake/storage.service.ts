// Storage service — S3-compatible object storage for recipe images (ADR §3:
// Postgres stores URIs only, never image blobs). MinIO serves the dev object store
// (infra/docker compose core profile); the same S3 API is the production path.
//
// D-10 decisions: URI format `s3://<bucket>/<key>` (stable reference, greppable);
// file_key `recipes/<uuid>.<ext>`; JPEG/PNG only (B2); 10 MB cap; bucket existence
// is ensured idempotently at startup (HeadBucket → CreateBucket).

import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png'] as const;
export type ImageContentType = (typeof IMAGE_CONTENT_TYPES)[number];

/** Phase 2 bulk-upload document scope — pdf/docx/txt only, 10 MB per file. */
export const DOCUMENT_EXTENSIONS = ['pdf', 'docx', 'txt'] as const;
export type DocumentFileType = (typeof DOCUMENT_EXTENSIONS)[number];
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

const DOCUMENT_CONTENT_TYPES: Record<DocumentFileType, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
};

/** Resolve the document type from the original filename extension (case-insensitive). */
export function documentFileTypeOf(filename: string): DocumentFileType | null {
  const dot = filename.lastIndexOf('.');
  if (dot === -1) return null;
  const ext = filename.slice(dot + 1).toLowerCase();
  return (DOCUMENT_EXTENSIONS as readonly string[]).includes(ext)
    ? (ext as DocumentFileType)
    : null;
}

export interface StoredImage {
  key: string;
  uri: string;
}

@Injectable()
export class StorageService {
  readonly bucket: string;
  private readonly client: S3Client;

  constructor() {
    this.bucket = process.env.S3_BUCKET ?? 'recipe-assets';
    this.client = new S3Client({
      region: 'us-east-1',
      endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
      forcePathStyle: true, // required for MinIO-style path addressing
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY ?? 'minioadmin',
        secretAccessKey: process.env.S3_SECRET_KEY ?? 'minioadmin',
      },
    });
  }

  /** Idempotent bootstrap: create the bucket when it does not exist yet.
   *  NEVER throws — object storage being down at startup is a controlled,
   *  per-request failure (uploads return STORAGE_UPLOAD_FAILED), not a boot crash
   *  (QG4 posture; CI boots the API with no object storage running). */
  async ensureBucket(): Promise<void> {
    try {
      try {
        await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
        return;
      } catch {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      }
    } catch {
      // Degraded start: intake photo uploads will fail per-request until storage is up.
    }
  }

  objectUri(key: string): string {
    return `s3://${this.bucket}/${key}`;
  }

  /** Upload the image; returns the storage key and the persisted URI reference.
   *  Throws ServiceUnavailableException on failure — callers then persist NOTHING
   *  (QG4: object-storage failure = no URI in Postgres). */
  async uploadImage(buffer: Buffer, contentType: ImageContentType): Promise<StoredImage> {
    const ext = contentType === 'image/png' ? 'png' : 'jpg';
    const key = `recipes/${randomUUID()}.${ext}`;
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        }),
      );
    } catch {
      throw new ServiceUnavailableException({
        code: 'STORAGE_UPLOAD_FAILED',
        message: 'Image storage unavailable; nothing was persisted',
      });
    }
    return { key, uri: this.objectUri(key) };
  }

  /** Upload an original recipe document (pdf/docx/txt). The storage key is
   *  server-generated (never the raw filename — path-traversal safe); the
   *  original filename rides S3 object metadata. Throws on failure (QG4). */
  async uploadDocument(
    buffer: Buffer,
    filename: string,
    fileType: DocumentFileType,
  ): Promise<StoredImage> {
    const key = `documents/${randomUUID()}.${fileType}`;
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: DOCUMENT_CONTENT_TYPES[fileType],
          Metadata: { 'original-filename': filename },
        }),
      );
    } catch {
      throw new ServiceUnavailableException({
        code: 'STORAGE_UPLOAD_FAILED',
        message: 'Document storage unavailable; nothing was persisted',
      });
    }
    return { key, uri: this.objectUri(key) };
  }

  /** Best-effort rollback of an uploaded object (QG4: no orphaned object when the
   *  DB write after upload fails). */
  async deleteObject(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch {
      // best-effort: an orphaned object is recoverable; a dangling URI is not allowed
    }
  }

  /**
   * D-22 (D6): observable deletion for the recipe-delete compensating cleanup
   * (ADR §16 — residue must not be hidden). Never throws; `false` = the object
   * could not be confirmed deleted and remains as recoverable residue.
   */
  async tryDeleteObject(key: string): Promise<boolean> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  /** Existence probe (QG4 evidence + integration tests): does the URI's object exist? */
  async objectExists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  /** Read-only fetch for the authenticated asset route — returns the object's
   *  byte stream + stored content type, or null when the object is gone. */
  async getImage(key: string): Promise<{ stream: Readable; contentType: string | null } | null> {
    try {
      const output = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!output.Body) return null;
      return {
        stream: output.Body as Readable,
        contentType: output.ContentType ?? null,
      };
    } catch {
      return null;
    }
  }
}
