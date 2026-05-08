import express from 'express';
import { authMiddleware, requireAdmin } from '../../middleware/auth.js';
import {
  getWorkerHeartbeats,
  getQueueStatistics
} from '../../services/dspTelemetryService.js';
import { getDatabase } from '../../database/db.js';
import {
  getDestinationsFromStoredValue,
  parseResultsField
} from '../../services/exportRequestService.js';
import logger from '../../utils/logger.js';

const router = express.Router();
const db = getDatabase();

const PLATFORMS = ['spotify', 'apple', 'tidal'];

const inferWorkerType = (workerId = '') => {
  const id = String(workerId).toLowerCase();
  if (id.includes('link')) return 'linking';
  if (id.includes('export')) return 'export';
  if (id.includes('token')) return 'token-refresh';
  if (id.includes('refresh')) return 'token-refresh';
  return 'unknown';
};

const normalizeWorkerStatus = (worker) => {
  if (worker.stale) return 'offline';
  const status = (worker.status || '').toLowerCase();
  if (status === 'stopping' || status === 'offline') return status;
  if ((worker.active_requests || 0) > 0) return 'active';
  return status || 'idle';
};

const computePlatformHealth = (workers) => {
  const now = Date.now();
  const latestHeartbeatAt = workers.reduce((max, worker) => {
    const ts = worker.last_seen ? new Date(worker.last_seen).getTime() : null;
    if (Number.isFinite(ts)) {
      return max === null ? ts : Math.max(max, ts);
    }
    return max;
  }, null);

  const platformStats = PLATFORMS.reduce((acc, platform) => {
    acc[platform] = {
      success: 0,
      failure: 0,
      lastActivity: null
    };
    return acc;
  }, {});

  try {
    const rows = db.prepare(`
      SELECT destinations, results, status, last_error, updated_at
      FROM export_requests
      ORDER BY updated_at DESC
      LIMIT 200
    `).all();

    for (const row of rows) {
      const destinations = getDestinationsFromStoredValue(row.destinations);
      const results = parseResultsField(row.results);
      const updatedAtMs = row.updated_at ? new Date(row.updated_at).getTime() : null;
      const rowStatus = row.status || '';
      const rowFailed = rowStatus === 'failed' || !!row.last_error;

      for (const dest of destinations) {
        if (!platformStats[dest]) continue;
        const result = results?.[dest];
        const ok = result?.status === 'success' || (!rowFailed && rowStatus === 'completed');

        if (ok) {
          platformStats[dest].success += 1;
        } else {
          platformStats[dest].failure += 1;
        }

        if (Number.isFinite(updatedAtMs)) {
          platformStats[dest].lastActivity = platformStats[dest].lastActivity === null
            ? updatedAtMs
            : Math.max(platformStats[dest].lastActivity, updatedAtMs);
        }
      }
    }
  } catch (error) {
    logger.warn('WORKER_HEALTH', 'Failed to compute platform stats', { error: error?.message });
  }

  const platformHealth = {};
  for (const platform of PLATFORMS) {
    const stats = platformStats[platform];
    const total = stats.success + stats.failure;
    const errorRate = total > 0 ? stats.failure / total : 0;
    const lastSeenAgeMs = latestHeartbeatAt ? now - latestHeartbeatAt : null;

    let status = 'ok';
    if ((lastSeenAgeMs !== null && lastSeenAgeMs > 300000) || errorRate > 0.25) {
      status = 'down';
    } else if ((lastSeenAgeMs !== null && lastSeenAgeMs > 60000) || errorRate > 0.05) {
      status = 'degraded';
    }

    platformHealth[platform] = status;
  }

  return platformHealth;
};

router.use(authMiddleware, requireAdmin);

router.get('/', (_req, res) => {
  try {
    const now = Date.now();
    const heartbeatRows = getWorkerHeartbeats();
    const workers = heartbeatRows.map((worker) => {
      const lastSeenIso = worker.last_seen ? new Date(worker.last_seen).toISOString() : null;
      const createdAtIso = worker.created_at ? new Date(worker.created_at).toISOString() : null;
      const createdMs = worker.created_at ? new Date(worker.created_at).getTime() : null;
      const uptimeSeconds = Number.isFinite(createdMs) ? Math.max(0, Math.round((now - createdMs) / 1000)) : null;
      const processed = Number(worker.processed_total || 0);
      const failed = Number(worker.failed_total || 0);
      const attempts = processed + failed;
      const errorRate = attempts > 0 ? failed / attempts : 0;

      return {
        id: worker.worker_id,
        type: inferWorkerType(worker.worker_id),
        status: normalizeWorkerStatus(worker),
        lastSeen: lastSeenIso,
        uptime: uptimeSeconds,
        queueDepth: worker.queue_depth ?? 0,
        activeRequests: worker.active_requests ?? 0,
        processedTotal: processed,
        failedTotal: failed,
        errorRate,
        lastError: worker.last_error || null
      };
    });

    const queueStatsRaw = getQueueStatistics();
    const queueStats = {
      pending: queueStatsRaw.pending || 0,
      processing: queueStatsRaw.in_progress || 0,
      completed: queueStatsRaw.completed || 0,
      failed: queueStatsRaw.failed || 0
    };

    const platformHealth = computePlatformHealth(heartbeatRows);

    return res.json({
      success: true,
      data: {
        workers,
        queueStats,
        platformHealth
      }
    });
  } catch (error) {
    logger.error('WORKER_HEALTH', 'Failed to load worker health', error);
    return res.status(500).json({ error: 'Failed to load worker health' });
  }
});

export default router;
