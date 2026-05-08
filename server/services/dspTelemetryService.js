import os from 'os';
import { getDatabase } from '../database/db.js';
import systemHealthMonitor from './systemHealthMonitor.js';

const db = getDatabase();
const ONE_MINUTE = 60 * 1000;

const DEFAULT_STALE_MINUTES = Number.parseInt(process.env.DSP_WORKER_STALE_MINUTES || '5', 10);
const ALERT_SEVERITIES = new Set(['error']);

const insertHeartbeatStmt = db.prepare(`
  INSERT INTO dsp_worker_heartbeats (
    worker_id,
    hostname,
    pid,
    status,
    queue_depth,
    active_requests,
    processed_total,
    failed_total,
    last_error,
    metrics,
    last_seen
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(worker_id) DO UPDATE SET
    hostname = excluded.hostname,
    pid = excluded.pid,
    status = excluded.status,
    queue_depth = excluded.queue_depth,
    active_requests = excluded.active_requests,
    processed_total = excluded.processed_total,
    failed_total = excluded.failed_total,
    last_error = excluded.last_error,
    metrics = excluded.metrics,
    last_seen = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
`);

const insertEventStmt = db.prepare(`
  INSERT INTO dsp_auto_export_events (
    playlist_id,
    curator_id,
    trigger,
    severity,
    outcome,
    reason,
    metadata
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const cleanupHeartbeatsStmt = db.prepare(`
  DELETE FROM dsp_worker_heartbeats
  WHERE last_seen < datetime('now', ?)
`);

const getStatusCountsStmt = db.prepare(`
  SELECT status, COUNT(*) as count
  FROM export_requests
  GROUP BY status
`);

const getPendingRetryCountStmt = db.prepare(`
  SELECT COUNT(*) as count
  FROM export_requests
  WHERE status = 'pending'
    AND job_metadata IS NOT NULL
    AND json_extract(job_metadata, '$.next_retry_at') IS NOT NULL
`);

const getOldestPendingStmt = db.prepare(`
  SELECT id, playlist_id, created_at
  FROM export_requests
  WHERE status = 'pending'
  ORDER BY created_at ASC
  LIMIT 1
`);

const getNewestCompletedStmt = db.prepare(`
  SELECT id, playlist_id, updated_at
  FROM export_requests
  WHERE status = 'completed'
  ORDER BY updated_at DESC
  LIMIT 1
`);

const countPendingStmt = db.prepare(`
  SELECT COUNT(*) as count
  FROM export_requests
  WHERE status = 'pending'
`);

const getActiveDemandCountStmt = db.prepare(`
  SELECT COUNT(*) as count
  FROM export_requests
  WHERE status NOT IN ('completed', 'failed', 'confirmed')
`);

const getHeartbeatsStmt = db.prepare(`
  SELECT *
  FROM dsp_worker_heartbeats
  ORDER BY last_seen DESC
`);

const getRecentFailuresStmt = db.prepare(`
  SELECT id, playlist_id, last_error, updated_at, job_metadata, status
  FROM export_requests
  WHERE status = 'failed'
  ORDER BY updated_at DESC
  LIMIT ?
`);

const listEventsStmt = db.prepare(`
  SELECT *
  FROM dsp_auto_export_events
  WHERE (? IS NULL OR severity = ?)
  ORDER BY created_at DESC
  LIMIT ?
`);

const formatAgeMs = (isoString) => {
  if (!isoString) return null;
  return Date.now() - new Date(isoString).getTime();
};

const safeParseJson = (value, fallback = null) => {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
};

const triggerAlertIfNeeded = (event) => {
  try {
    if (!ALERT_SEVERITIES.has(event.severity)) {
      return;
    }

    const instructions = [
      'Check Admin → System Health → Active Alerts for DSP automation status.',
      'Retry the export manually or use “Reset stalled exports” automation if the queue is stuck.',
      'If the same playlist keeps failing, capture its ID and post in #incidents for engineering help.'
    ];

    systemHealthMonitor.reportIncident({
      key: `dsp-${event.trigger || 'automation'}`,
      title: 'DSP automation error',
      message: `Trigger ${event.trigger || 'unknown'} reported ${event.reason || 'unspecified error'}`,
      severity: event.severity === 'error' ? 'critical' : 'warning',
      instructions,
      stats: {
        playlistId: event.playlist_id,
        trigger: event.trigger,
        reason: event.reason
      },
      audience: 'curator',
      autoResolveMs: 15 * ONE_MINUTE
    });

    const webhook = process.env.DSP_ALERT_WEBHOOK;
    if (!webhook || typeof fetch !== 'function') {
      return;
    }

    const payload = {
      text: `⚠️ Flowerpil DSP automation (${event.severity})\nTrigger: ${event.trigger || 'unknown'}\nReason: ${event.reason || 'n/a'}\nPlaylist: ${event.playlist_id || 'n/a'}`
    };

    setImmediate(() => {
      fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch((err) => {
        console.error('[DSP_ALERT] Failed to send legacy webhook alert', err?.message || err);
      });
    });
  } catch (err) {
    console.error('[DSP_ALERT] Unexpected error while dispatching alert', err?.message || err);
  }
};

export const recordWorkerHeartbeat = ({
  workerId,
  hostname = os.hostname(),
  pid = process.pid,
  status = 'idle',
  queueDepth = 0,
  activeRequests = 0,
  processedTotal = 0,
  failedTotal = 0,
  lastError = null,
  metrics = {}
}) => {
  if (!workerId) return;
  const payload = typeof metrics === 'object' ? metrics : {};

  try {
    insertHeartbeatStmt.run(
      workerId,
      hostname,
      pid,
      status,
      queueDepth,
      activeRequests,
      processedTotal,
      failedTotal,
      lastError,
      JSON.stringify(payload)
    );
  } catch (err) {
    // Don't crash the worker on heartbeat failures (e.g., database locked)
    // Heartbeats are non-critical telemetry
    if (err?.code !== 'SQLITE_BUSY' && !err?.message?.includes('database is locked')) {
      console.warn('[TELEMETRY] Heartbeat write failed:', err?.message || err);
    }
  }
};

export const cleanupStaleHeartbeats = (olderThanMinutes = 60) => {
  const delta = olderThanMinutes > 0 ? `-${olderThanMinutes} minutes` : '-60 minutes';
  try {
    cleanupHeartbeatsStmt.run(delta);
  } catch (err) {
    // Don't crash on cleanup failures (e.g., database locked)
    if (err?.code !== 'SQLITE_BUSY' && !err?.message?.includes('database is locked')) {
      console.warn('[TELEMETRY] Heartbeat cleanup failed:', err?.message || err);
    }
  }
};

export const getWorkerHeartbeats = ({ staleAfterMinutes = DEFAULT_STALE_MINUTES, maxAgeHours = 1 } = {}) => {
  const rows = getHeartbeatsStmt.all();
  const thresholdMs = Math.max(staleAfterMinutes, 1) * 60 * 1000;
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
  const demandRow = getActiveDemandCountStmt.get();
  const queueDemandCount = demandRow?.count || 0;
  const hasQueueDemand = queueDemandCount > 0;

  // Filter out very old records (> maxAgeHours) to prevent clutter
  return rows
    .map((row) => {
      const lastSeenAgeMs = formatAgeMs(row.last_seen);
      const stale = lastSeenAgeMs !== null ? lastSeenAgeMs > thresholdMs : false;
      const dormant = stale && !hasQueueDemand;
      return {
        worker_id: row.worker_id,
        hostname: row.hostname,
        pid: row.pid,
        status: row.status,
        queue_depth: row.queue_depth,
        active_requests: row.active_requests,
        processed_total: row.processed_total,
        failed_total: row.failed_total,
        last_error: row.last_error,
        metrics: safeParseJson(row.metrics, {}),
        last_seen: row.last_seen,
        created_at: row.created_at,
        stale: stale && hasQueueDemand,
        dormant,
        last_seen_age_ms: lastSeenAgeMs
      };
    })
    .filter((worker) => {
      // Only include workers seen within maxAgeHours
      return worker.last_seen_age_ms === null || worker.last_seen_age_ms <= maxAgeMs;
    });
};

export const getQueueStatistics = () => {
  const stats = {
    total: 0,
    pending: 0,
    in_progress: 0,
    completed: 0,
    failed: 0,
    auth_required: 0,
    confirmed: 0,
    pending_retry: 0,
    oldest_pending: null,
    newest_completed: null
  };

  const statusCounts = getStatusCountsStmt.all();
  for (const row of statusCounts) {
    stats[row.status] = row.count;
    stats.total += row.count;
  }

  const pendingRetry = getPendingRetryCountStmt.get();
  stats.pending_retry = pendingRetry?.count || 0;

  const oldestPending = getOldestPendingStmt.get();
  if (oldestPending) {
    stats.oldest_pending = {
      id: oldestPending.id,
      playlist_id: oldestPending.playlist_id,
      created_at: oldestPending.created_at,
      age_ms: formatAgeMs(oldestPending.created_at)
    };
  }

  const newestCompleted = getNewestCompletedStmt.get();
  if (newestCompleted) {
    stats.newest_completed = {
      id: newestCompleted.id,
      playlist_id: newestCompleted.playlist_id,
      updated_at: newestCompleted.updated_at,
      age_ms: formatAgeMs(newestCompleted.updated_at)
    };
  }

  return stats;
};

export const countPendingRequests = () => {
  const row = countPendingStmt.get();
  return row?.count || 0;
};

export const getExportSuccessMetrics = () => {
  // Get all completed exports
  const completedExports = db.prepare(`
    SELECT results, destinations
    FROM export_requests
    WHERE status = 'completed'
  `).all();

  // Get all failed exports
  const failedCount = db.prepare(`
    SELECT COUNT(*) as count
    FROM export_requests
    WHERE status = 'failed'
  `).get()?.count || 0;

  let totalSuccessful = 0;
  let totalFailed = failedCount;
  const platformSuccess = {
    spotify: 0,
    apple: 0,
    tidal: 0
  };

  // Parse results to count successful exports per platform
  for (const record of completedExports) {
    const results = safeParseJson(record.results, {});
    const destinations = safeParseJson(record.destinations, []);

    for (const platform of destinations) {
      const result = results[platform];
      if (result && result.status === 'success') {
        totalSuccessful++;
        if (platformSuccess[platform] !== undefined) {
          platformSuccess[platform]++;
        }
      } else {
        totalFailed++;
      }
    }
  }

  const total = totalSuccessful + totalFailed;
  const successRate = total > 0 ? Math.round((totalSuccessful / total) * 100) : 0;

  return {
    total_exports: total,
    successful: totalSuccessful,
    failed: totalFailed,
    success_rate_percent: successRate,
    by_platform: platformSuccess
  };
};

export const getRecentFailures = (limit = 5) => {
  return getRecentFailuresStmt.all(limit).map((row) => ({
    id: row.id,
    playlist_id: row.playlist_id,
    last_error: row.last_error,
    status: row.status,
    updated_at: row.updated_at,
    metadata: safeParseJson(row.job_metadata, {})
  }));
};

export const logAutoExportEvent = ({
  playlistId = null,
  curatorId = null,
  trigger = 'unknown',
  severity = 'info',
  outcome = 'unknown',
  reason = null,
  metadata = null
} = {}) => {
  insertEventStmt.run(
    playlistId,
    curatorId,
    trigger,
    severity,
    outcome,
    reason,
    metadata ? JSON.stringify(metadata) : null
  );

  triggerAlertIfNeeded({
    severity,
    trigger,
    reason,
    playlist_id: playlistId
  });
};

export const listAutoExportEvents = ({ limit = 20, severity = null } = {}) => {
  return listEventsStmt.all(severity, severity, limit).map((row) => ({
    id: row.id,
    playlist_id: row.playlist_id,
    curator_id: row.curator_id,
    trigger: row.trigger,
    severity: row.severity,
    outcome: row.outcome,
    reason: row.reason,
    metadata: safeParseJson(row.metadata, {}),
    created_at: row.created_at
  }));
};

export default {
  recordWorkerHeartbeat,
  getWorkerHeartbeats,
  getQueueStatistics,
  getRecentFailures,
  listAutoExportEvents,
  logAutoExportEvent,
  cleanupStaleHeartbeats,
  countPendingRequests,
  getExportSuccessMetrics
};
