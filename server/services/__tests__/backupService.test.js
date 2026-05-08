import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { gunzipSync } from 'zlib';
import Database from 'better-sqlite3';

// Mock S3 client before importing the service
const mockSend = vi.fn();
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(() => ({ send: mockSend })),
  PutObjectCommand: vi.fn((params) => ({ _type: 'PutObject', ...params })),
  ListObjectsV2Command: vi.fn((params) => ({ _type: 'ListObjects', ...params })),
  DeleteObjectsCommand: vi.fn((params) => ({ _type: 'DeleteObjects', ...params })),
}));

// Mock logger to avoid noise
vi.mock('../../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Use a temp file-based SQLite DB (backup API requires a real file)
const TMP_DIR = '/tmp/flowerpil-test-backup';
const TEST_DB_PATH = path.join(TMP_DIR, 'test.db');

// Point the service at our test DB
process.env.DATABASE_PATH = TEST_DB_PATH;
process.env.R2_ACCOUNT_ID = 'test-account';
process.env.R2_ACCESS_KEY_ID = 'test-key';
process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
process.env.R2_BACKUP_BUCKET = 'test-bucket';

let backupService;

beforeEach(async () => {
  // Fresh temp dir + DB for each test
  fs.mkdirSync(TMP_DIR, { recursive: true });
  // Use a standalone test table (not the prod playlists schema)
  const db = new Database(TEST_DB_PATH);
  db.exec('CREATE TABLE IF NOT EXISTS backup_test (id INTEGER PRIMARY KEY, value TEXT)');
  db.exec("INSERT INTO backup_test (value) VALUES ('backup-verification-token')");
  db.close();

  mockSend.mockReset();
  // Default: ListObjects returns empty (no existing backups)
  mockSend.mockResolvedValue({ Contents: [] });

  // Re-import to pick up fresh env + reset module state
  backupService = await import('../backupService.js');
  backupService._resetForTesting();
});

afterEach(() => {
  // Clean up temp files
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}
  try { fs.unlinkSync('/tmp/flowerpil-backup.db'); } catch {}
  try { fs.unlinkSync('/tmp/flowerpil-backup.db.gz'); } catch {}
});

describe('backupService', () => {
  describe('performBackup', () => {
    it('creates a valid gzipped SQLite backup and uploads to R2', async () => {
      let uploadedBody = null;
      let uploadedKey = null;

      mockSend.mockImplementation((command) => {
        if (command._type === 'PutObject') {
          uploadedBody = command.Body;
          uploadedKey = command.Key;
          return Promise.resolve({});
        }
        // ListObjects for pruning
        return Promise.resolve({ Contents: [] });
      });

      const result = await backupService.performBackup();

      expect(result.success).toBe(true);
      expect(result.key).toMatch(/^db\/backup-.*\.db\.gz$/);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);

      // Verify the upload was called with a non-empty gzip buffer
      expect(uploadedKey).toBe(result.key);
      expect(uploadedBody).toBeInstanceOf(Buffer);
      expect(uploadedBody.length).toBeGreaterThan(0);

      // Decompress and verify it's a valid SQLite database
      const decompressed = gunzipSync(uploadedBody);
      expect(decompressed.slice(0, 16).toString()).toContain('SQLite format');

      // Open the decompressed backup and verify data
      const verifyPath = path.join(TMP_DIR, 'verify.db');
      fs.writeFileSync(verifyPath, decompressed);
      const verifyDb = new Database(verifyPath, { readonly: true });
      const rows = verifyDb.prepare('SELECT value FROM backup_test').all();
      verifyDb.close();

      expect(rows).toHaveLength(1);
      expect(rows[0].value).toBe('backup-verification-token');
    });

    it('cleans up temp files even on R2 upload failure', async () => {
      mockSend.mockImplementation((command) => {
        if (command._type === 'PutObject') {
          return Promise.reject(new Error('R2 upload failed'));
        }
        return Promise.resolve({ Contents: [] });
      });

      const result = await backupService.performBackup();

      expect(result.success).toBe(false);
      expect(result.error).toBe('R2 upload failed');
      expect(fs.existsSync('/tmp/flowerpil-backup.db')).toBe(false);
      expect(fs.existsSync('/tmp/flowerpil-backup.db.gz')).toBe(false);
    });
  });

  describe('pruneOldBackups', () => {
    it('deletes backups beyond MAX_BACKUPS, keeping newest', async () => {
      const now = Date.now();
      const objects = Array.from({ length: 7 }, (_, i) => ({
        Key: `db/backup-2026-02-${String(20 + i).padStart(2, '0')}.db.gz`,
        LastModified: new Date(now - (6 - i) * 86400000), // oldest first
        Size: 8000000,
      }));

      let deletedKeys = null;

      const mockClient = {
        send: vi.fn((command) => {
          if (command._type === 'ListObjects') {
            return Promise.resolve({ Contents: objects, IsTruncated: false });
          }
          if (command._type === 'DeleteObjects') {
            deletedKeys = command.Delete.Objects.map(o => o.Key);
            return Promise.resolve({});
          }
          return Promise.resolve({});
        }),
      };

      await backupService.pruneOldBackups(mockClient);

      // Should delete the 2 oldest (7 total - 5 max = 2 to delete)
      expect(deletedKeys).toHaveLength(2);
      // Oldest keys should be deleted (sorted newest-first, so slice(5) = last 2)
      expect(deletedKeys).toContain('db/backup-2026-02-20.db.gz');
      expect(deletedKeys).toContain('db/backup-2026-02-21.db.gz');
    });

    it('does nothing when backups are within limit', async () => {
      const mockClient = {
        send: vi.fn(() => Promise.resolve({
          Contents: [
            { Key: 'db/backup-a.db.gz', LastModified: new Date(), Size: 100 },
            { Key: 'db/backup-b.db.gz', LastModified: new Date(), Size: 100 },
          ],
        })),
      };

      await backupService.pruneOldBackups(mockClient);

      // Only called once (ListObjects), never DeleteObjects
      expect(mockClient.send).toHaveBeenCalledTimes(1);
    });

    it('handles paginated listing and batches delete requests', async () => {
      const now = Date.now();
      const objects = Array.from({ length: 1507 }, (_, i) => ({
        Key: `db/backup-2026-02-${String(i).padStart(4, '0')}.db.gz`,
        LastModified: new Date(now - i * 60000),
        Size: 8000000,
      }));

      const firstPage = objects.slice(0, 1000);
      const secondPage = objects.slice(1000);

      const deleteBatchSizes = [];
      let listCalls = 0;

      const mockClient = {
        send: vi.fn((command) => {
          if (command._type === 'ListObjects') {
            listCalls += 1;
            if (!command.ContinuationToken) {
              return Promise.resolve({
                Contents: firstPage,
                IsTruncated: true,
                NextContinuationToken: 'page-2',
              });
            }

            if (command.ContinuationToken === 'page-2') {
              return Promise.resolve({
                Contents: secondPage,
                IsTruncated: false,
              });
            }
          }

          if (command._type === 'DeleteObjects') {
            deleteBatchSizes.push(command.Delete.Objects.length);
            return Promise.resolve({});
          }

          return Promise.resolve({});
        }),
      };

      await backupService.pruneOldBackups(mockClient);

      expect(listCalls).toBe(2);
      expect(deleteBatchSizes).toHaveLength(2);
      expect(deleteBatchSizes[0]).toBe(1000);
      expect(deleteBatchSizes[1]).toBe(502);
    });
  });

  describe('triggerBackup debounce', () => {
    it('fires backup on first call', async () => {
      backupService._resetForTesting();

      backupService.triggerBackup();
      await new Promise(r => setTimeout(r, 150));

      expect(mockSend).toHaveBeenCalled();
    });

    it('skips backup when called again within debounce window', async () => {
      backupService._resetForTesting();

      // Run a full backup to set lastBackupTime
      mockSend.mockResolvedValue({ Contents: [] });
      const firstRun = await backupService.performBackup();
      expect(firstRun.success).toBe(true);

      // Clear mock call history, then call triggerBackup which should be debounced
      mockSend.mockClear();
      backupService.triggerBackup();

      // Wait for any async work to settle
      await new Promise(r => setTimeout(r, 100));

      // No S3 calls should have been made - backup was debounced
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('getBackupStatus', () => {
    it('returns backup list with size summary', async () => {
      mockSend
        .mockResolvedValueOnce({
          Contents: [
            { Key: 'db/backup-2026-02-26.db.gz', LastModified: new Date('2026-02-26'), Size: 8000000 },
          ],
          IsTruncated: true,
          NextContinuationToken: 'page-2',
        })
        .mockResolvedValueOnce({
          Contents: [
            { Key: 'db/backup-2026-02-25.db.gz', LastModified: new Date('2026-02-25'), Size: 7500000 },
          ],
          IsTruncated: false,
        });

      const status = await backupService.getBackupStatus();

      expect(status.count).toBe(2);
      expect(parseFloat(status.totalSizeMB)).toBeCloseTo(14.78, 1);
      expect(status.lastBackupKey).toBe('db/backup-2026-02-26.db.gz');
      expect(status.backups).toHaveLength(2);
    });

    it('handles R2 errors gracefully', async () => {
      mockSend.mockRejectedValue(new Error('Network error'));

      const status = await backupService.getBackupStatus();

      expect(status.count).toBe(0);
      expect(status.error).toBe('Network error');
    });
  });

  describe('constants', () => {
    it('exports expected config values', () => {
      expect(backupService.BACKUP_PREFIX).toBe('db/backup-');
      expect(backupService.MAX_BACKUPS).toBe(5);
      expect(backupService.DEBOUNCE_MS).toBe(300000);
    });
  });
});
