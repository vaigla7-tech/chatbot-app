import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { prisma } from "../db";
import { env } from "../env";

/**
 * Private, durable document storage. Two drivers:
 *  - "database": bytes stored in PostgreSQL (StoredFile) - zero extra setup on Railway.
 *  - "s3": any S3-compatible bucket (Railway Buckets, AWS S3, Cloudflare R2).
 * The container filesystem is never used for permanent storage.
 */
export interface StorageDriver {
  put(key: string, data: Buffer, mimeType: string): Promise<void>;
  get(key: string): Promise<{ data: Buffer; mimeType: string } | null>;
  delete(key: string): Promise<void>;
}

const databaseDriver: StorageDriver = {
  async put(key, data, mimeType) {
    await prisma.storedFile.upsert({
      where: { storageKey: key },
      create: { storageKey: key, data: new Uint8Array(data), mimeType, size: data.byteLength },
      update: { data: new Uint8Array(data), mimeType, size: data.byteLength },
    });
  },
  async get(key) {
    const row = await prisma.storedFile.findUnique({ where: { storageKey: key } });
    return row ? { data: Buffer.from(row.data), mimeType: row.mimeType } : null;
  },
  async delete(key) {
    await prisma.storedFile.deleteMany({ where: { storageKey: key } });
  },
};

function s3Driver(): StorageDriver {
  const e = env();
  if (!e.DOCUMENT_STORAGE_BUCKET) throw new Error("DOCUMENT_STORAGE_BUCKET is not configured");
  const bucket = e.DOCUMENT_STORAGE_BUCKET;
  const client = new S3Client({
    region: e.DOCUMENT_STORAGE_REGION ?? "auto",
    endpoint: e.DOCUMENT_STORAGE_ENDPOINT,
    forcePathStyle: Boolean(e.DOCUMENT_STORAGE_ENDPOINT),
    credentials:
      e.DOCUMENT_STORAGE_ACCESS_KEY_ID && e.DOCUMENT_STORAGE_SECRET_ACCESS_KEY
        ? { accessKeyId: e.DOCUMENT_STORAGE_ACCESS_KEY_ID, secretAccessKey: e.DOCUMENT_STORAGE_SECRET_ACCESS_KEY }
        : undefined,
  });
  return {
    async put(key, data, mimeType) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: data, ContentType: mimeType }));
    },
    async get(key) {
      try {
        const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        const bytes = await res.Body?.transformToByteArray();
        return bytes ? { data: Buffer.from(bytes), mimeType: res.ContentType ?? "application/octet-stream" } : null;
      } catch (error) {
        if ((error as { name?: string }).name === "NoSuchKey") return null;
        throw error;
      }
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}

export function storage(): StorageDriver {
  return env().DOCUMENT_STORAGE === "s3" ? s3Driver() : databaseDriver;
}

export function newStorageKey(fileName: string): string {
  const safe = fileName.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "").slice(-80);
  return `documents/${new Date().toISOString().slice(0, 7)}/${randomUUID()}-${safe || "file"}`;
}
