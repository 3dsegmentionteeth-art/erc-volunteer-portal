import { Client } from 'minio';
import { config } from '../config';
import { logger } from './logger';

// Thin wrapper over the MinIO/S3 client. The bucket lives in dev config today;
// production uses a private bucket + pre-signed URLs (see SECURITY.md).

let client: Client | undefined;
let ensured = false;

function getClient(): Client {
  if (!client) {
    client = new Client({
      endPoint: config.minio.endpoint,
      port: config.minio.port,
      useSSL: config.minio.useSsl,
      accessKey: config.minio.accessKey,
      secretKey: config.minio.secretKey,
    });
  }
  return client;
}

// Idempotent, lazy: called from the first upload so a config/credential change
// is not fatal at boot (DB-only deployments still start without MinIO).
async function ensureBucket(): Promise<void> {
  if (ensured) return;
  const c = getClient();
  const exists = await c.bucketExists(config.minio.bucket);
  if (!exists) {
    await c.makeBucket(config.minio.bucket, 'us-east-1');
    logger.info(`Created object-storage bucket ${config.minio.bucket}`);
  }
  ensured = true;
}

export async function putObject(
  key: string,
  data: Buffer,
  contentType: string,
): Promise<void> {
  await ensureBucket();
  await getClient().putObject(config.minio.bucket, key, data, data.length, { 'Content-Type': contentType });
}

export async function removeObject(key: string): Promise<void> {
  await ensureBucket();
  await getClient().removeObject(config.minio.bucket, key);
}

// Time-limited, private, single-resource URL. The raw object is never exposed
// through the API itself; the SPA downloads via this URL instead.
export async function presignedDownloadUrl(key: string): Promise<string> {
  await ensureBucket();
  return getClient().presignedGetObject(config.minio.bucket, key, config.documents.presignedTtlSeconds);
}

/** True when the object exists (used by tests and the QA smoke path). */
export async function objectExists(key: string): Promise<boolean> {
  try {
    await getClient().statObject(config.minio.bucket, key);
    return true;
  } catch {
    return false;
  }
}