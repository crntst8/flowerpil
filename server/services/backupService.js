import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { createReadStream, createWriteStream, promises as fs } from 'fs';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import path from 'path';
import logger from '../utils/logger.js';

export const BACKUP_BUCKET = process.env.R2_BACKUP_BUCKET || 'flowerpil-backups';
export const BACKUP_PREFIX = 'db/backup-';
export const MAX_BACKUPS = 5;
export const DEBOUNCE_MS = 5 * 60 * 1000; // 5 minutes
const LIST_PAGE_SIZE = 1000;
const DELETE_BATCH_SIZE = 1000;
const DB_PATH = process.env.DATABASE_PATH?.startsWith('./')
  ? path.resolve(process.cwd(), process.env.DATABASE_PATH)
  : (process.env.DATABASE_PATH || path.resolve(process.cwd(), 'data/flowerpil.db'));
const TMP_BACKUP_PATH = '/tmp/flowerpil-backup.db';
const TMP_GZ_PATH = '/tmp/flowerpil-backup.db.gz';

let r2Client = null;
let lastBackupTime = 0;
let backupInProgress = false;

function getR2Client() {
  if (!r2Client) {
    r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return r2Client;
}

async function listAllBackupObjects(client) {
  const objects = [];
  let continuationToken;

  do {
    const response = await client.send(new ListObjectsV2Command({
      Bucket: BACKUP_BUCKET,
      Prefix: BACKUP_PREFIX,
      MaxKeys: LIST_PAGE_SIZE,
      ContinuationToken: continuationToken,
    }));

    if (Array.isArray(response.Contents) && response.Contents.length > 0) {
      objects.push(...response.Contents);
    }

    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return objects;
}

export async function performBackup() {
  const startTime = Date.now();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const r2Key = `${BACKUP_PREFIX}${timestamp}.db.gz`;

  try {
    // 1. Use better-sqlite3 backup API (safe, no locks on source)
    const Database = (await import('better-sqlite3')).default;
    const sourceDb = new Database(DB_PATH, { readonly: true });
    await sourceDb.backup(TMP_BACKUP_PATH);
    sourceDb.close();

    // 2. Gzip the backup
    await pipeline(
      createReadStream(TMP_BACKUP_PATH),
      createGzip({ level: 6 }),
      createWriteStream(TMP_GZ_PATH)
    );

    // 3. Upload to R2
    const gzBuffer = await fs.readFile(TMP_GZ_PATH);
    const client = getR2Client();
    await client.send(new PutObjectCommand({
      Bucket: BACKUP_BUCKET,
      Key: r2Key,
      Body: gzBuffer,
      ContentType: 'application/gzip',
    }));

    const sizeMB = (gzBuffer.length / (1024 * 1024)).toFixed(2);
    const durationMs = Date.now() - startTime;

    logger.info('DB_BACKUP', 'Backup uploaded to R2', {
      key: r2Key,
      sizeMB,
      durationMs,
    });

    // 4. Prune old backups (keep last N)
    await pruneOldBackups(client);

    // 5. Clean up temp files
    await fs.unlink(TMP_BACKUP_PATH).catch(() => {});
    await fs.unlink(TMP_GZ_PATH).catch(() => {});

    lastBackupTime = Date.now();
    return { success: true, key: r2Key, sizeMB, durationMs };
  } catch (err) {
    logger.error('DB_BACKUP', 'Backup failed', { error: err.message });
    // Clean up temp files on failure
    await fs.unlink(TMP_BACKUP_PATH).catch(() => {});
    await fs.unlink(TMP_GZ_PATH).catch(() => {});
    return { success: false, error: err.message };
  }
}

export async function pruneOldBackups(client) {
  try {
    const objects = (await listAllBackupObjects(client))
      .sort((a, b) => b.LastModified - a.LastModified);

    if (objects.length <= MAX_BACKUPS) return;

    const toDelete = objects.slice(MAX_BACKUPS);
    let deletedCount = 0;

    for (let index = 0; index < toDelete.length; index += DELETE_BATCH_SIZE) {
      const batch = toDelete.slice(index, index + DELETE_BATCH_SIZE);

      await client.send(new DeleteObjectsCommand({
        Bucket: BACKUP_BUCKET,
        Delete: {
          Objects: batch.map(obj => ({ Key: obj.Key })),
          Quiet: true,
        },
      }));

      deletedCount += batch.length;
    }

    logger.info('DB_BACKUP', 'Pruned old backups', {
      deleted: deletedCount,
      remaining: MAX_BACKUPS,
    });
  } catch (err) {
    logger.warn('DB_BACKUP', 'Failed to prune old backups', { error: err.message });
  }
}

/**
 * Trigger a database backup to R2. Debounced (5-min window) and fire-and-forget safe.
 * Call without await after data-changing operations.
 */
export function triggerBackup() {
  const now = Date.now();
  if (now - lastBackupTime < DEBOUNCE_MS) {
    return;
  }
  if (backupInProgress) {
    return;
  }

  backupInProgress = true;
  performBackup()
    .catch(err => {
      logger.error('DB_BACKUP', 'Unhandled backup error', { error: err.message });
    })
    .finally(() => {
      backupInProgress = false;
    });
}

/**
 * Returns status info about recent backups (for admin dashboard if needed).
 */
export async function getBackupStatus() {
  try {
    const client = getR2Client();
    const objects = (await listAllBackupObjects(client))
      .sort((a, b) => b.LastModified - a.LastModified);

    const totalSizeBytes = objects.reduce((sum, obj) => sum + (obj.Size || 0), 0);

    return {
      count: objects.length,
      totalSizeMB: (totalSizeBytes / (1024 * 1024)).toFixed(2),
      lastBackup: objects[0]?.LastModified || null,
      lastBackupKey: objects[0]?.Key || null,
      backups: objects.map(obj => ({
        key: obj.Key,
        size: obj.Size,
        lastModified: obj.LastModified,
      })),
    };
  } catch (err) {
    logger.error('DB_BACKUP', 'Failed to get backup status', { error: err.message });
    return { count: 0, totalSizeMB: '0', lastBackup: null, backups: [], error: err.message };
  }
}

/** Reset internal debounce/lock state. Test-only. */
export function _resetForTesting() {
  lastBackupTime = 0;
  backupInProgress = false;
  r2Client = null;
}
