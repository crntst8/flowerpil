import { getDatabase } from '../database/db.js';
import logger from '../utils/logger.js';
import { logAdminAction } from '../utils/auditLogger.js';

export const SCRIPTS = {
  // Release stuck import locks (from systemHealthMonitor.js)
  RELEASE_IMPORT_LOCKS: {
    name: 'Release Import Locks',
    risk: 'LOW',
    async execute() {
      const db = getDatabase();
      const result = db.prepare(`
        UPDATE playlist_import_schedules
        SET lock_owner = NULL, lock_expires_at = NULL
        WHERE lock_expires_at IS NOT NULL
          AND datetime(lock_expires_at) <= datetime('now')
      `).run();
      return { success: true, message: `Released ${result.changes} locks` };
    }
  },

  // Reset stalled exports (from systemHealthMonitor.js)
  RESET_EXPORTS: {
    name: 'Reset Stalled Exports',
    risk: 'LOW',
    async execute() {
      const db = getDatabase();
      const result = db.prepare(`
        UPDATE export_requests
        SET status = 'pending', updated_at = CURRENT_TIMESTAMP
        WHERE status = 'processing'
          AND datetime(updated_at, '+30 minutes') < datetime('now')
      `).run();
      return { success: true, message: `Reset ${result.changes} exports` };
    }
  },

  // Database health check
  CHECK_DATABASE: {
    name: 'Database Health Check',
    risk: 'LOW',
    async execute() {
      const db = getDatabase();
      const integrity = db.prepare('PRAGMA integrity_check').get();
      const pageCount = db.prepare('PRAGMA page_count').get();
      const pageSize = db.prepare('PRAGMA page_size').get();

      return {
        success: integrity.integrity_check === 'ok',
        message: 'Health check complete',
        details: {
          integrity: integrity.integrity_check,
          sizeMB: (pageCount.page_count * pageSize.page_size / 1024 / 1024).toFixed(2)
        }
      };
    }
  },

  // Token refresh (requires external API)
  REFRESH_TOKENS: {
    name: 'Refresh Expired Tokens',
    risk: 'MEDIUM',
    async execute() {
      // Placeholder - requires integration with token refresh worker
      return {
        success: false,
        message: 'Manual token refresh required',
        instructions: 'Check DSP tokens in admin panel'
      };
    }
  },

  // Worker health check
  CHECK_WORKER_HEALTH: {
    name: 'Worker Health Check',
    risk: 'LOW',
    async execute() {
      const db = getDatabase();
      const staleThreshold = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const workers = db.prepare(`
        SELECT worker_id, last_seen, status
        FROM dsp_worker_heartbeats
        WHERE last_seen < ?
      `).all(staleThreshold);

      return {
        success: workers.length === 0,
        message: `Found ${workers.length} stale workers`,
        staleWorkers: workers
      };
    }
  }
};

export async function executeScript(scriptName, adminUser, errorReportId, req = null) {
  const script = SCRIPTS[scriptName];
  if (!script) throw new Error('Unknown script');

  logger.info('Executing rectification script', { scriptName, admin: adminUser.email });

  // Audit log
  await logAdminAction({
    userId: adminUser.id,
    username: adminUser.username || adminUser.email,
    action: 'RECTIFICATION_SCRIPT',
    resourceType: 'error_report',
    resourceId: errorReportId,
    data: { scriptName, risk: script.risk },
    req,
    statusCode: 200
  });

  try {
    const result = await script.execute();

    // Update error report
    const db = getDatabase();
    db.prepare(`
      UPDATE error_reports
      SET fix_applied = 1, fix_result = ?
      WHERE id = ?
    `).run(JSON.stringify(result), errorReportId);

    return result;
  } catch (error) {
    logger.error('Script execution failed', { scriptName, error });
    throw error;
  }
}







