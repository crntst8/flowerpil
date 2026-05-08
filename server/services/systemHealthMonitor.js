import EventEmitter from 'events';
import logger from '../utils/logger.js';
import slackService from './SlackNotificationService.js';
import { getDatabase } from '../database/db.js';
import {
  recordSystemMetric,
  getRecentSystemMetrics,
  pruneOldSystemMetrics
} from '../database/systemPerformanceRepository.js';

const ONE_MINUTE = 60 * 1000;
const MAX_EVENT_AGE_MS = 60 * ONE_MINUTE;
const DEFAULT_EVAL_INTERVAL = Number.parseInt(process.env.SYSTEM_HEALTH_EVAL_INTERVAL_MS || `${ONE_MINUTE}`, 10);
const ALERT_COOLDOWN_MS = Number.parseInt(process.env.SYSTEM_HEALTH_ALERT_COOLDOWN_MS || `${10 * ONE_MINUTE}`, 10);
const AUTOMATION_COOLDOWN_MS = Number.parseInt(process.env.SYSTEM_HEALTH_AUTOMATION_COOLDOWN_MS || `${15 * ONE_MINUTE}`, 10);

const LATENCY_THRESHOLDS = {
  public: {
    warning: Number.parseInt(process.env.PUBLIC_LATENCY_WARNING_MS || '1500', 10),
    critical: Number.parseInt(process.env.PUBLIC_LATENCY_CRITICAL_MS || '2500', 10)
  },
  curator: {
    warning: Number.parseInt(process.env.CURATOR_LATENCY_WARNING_MS || '1400', 10),
    critical: Number.parseInt(process.env.CURATOR_LATENCY_CRITICAL_MS || '2300', 10)
  }
};

const MIN_LATENCY_REQUESTS = {
  public: Number.parseInt(process.env.PUBLIC_LATENCY_MIN_REQUESTS || '30', 10),
  curator: Number.parseInt(process.env.CURATOR_LATENCY_MIN_REQUESTS || '25', 10)
};

const ERROR_THRESHOLDS = {
  public: {
    warning: Number.parseFloat(process.env.PUBLIC_ERROR_RATE_WARNING || '0.08'),
    critical: Number.parseFloat(process.env.PUBLIC_ERROR_RATE_CRITICAL || '0.12')
  },
  curator: {
    warning: Number.parseFloat(process.env.CURATOR_ERROR_RATE_WARNING || '0.06'),
    critical: Number.parseFloat(process.env.CURATOR_ERROR_RATE_CRITICAL || '0.1')
  }
};

const MIN_ERROR_RATE_REQUESTS = {
  public: Number.parseInt(process.env.PUBLIC_ERROR_MIN_REQUESTS || '60', 10),
  curator: Number.parseInt(process.env.CURATOR_ERROR_MIN_REQUESTS || '30', 10)
};

const IMPORT_BACKLOG_THRESHOLD = Number.parseInt(process.env.IMPORT_BACKLOG_THRESHOLD || '3', 10);
const CONTENT_DSP_THRESHOLD = Number.parseFloat(process.env.CONTENT_DSP_GAP_THRESHOLD || '0.35');
const CONTENT_PREVIEW_THRESHOLD = Number.parseFloat(process.env.CONTENT_PREVIEW_GAP_THRESHOLD || '0.5');

const STAT_WINDOWS = [
  { key: '5m', duration: 5 * ONE_MINUTE, label: '5 minutes' },
  { key: '15m', duration: 15 * ONE_MINUTE, label: '15 minutes' },
  { key: '60m', duration: 60 * ONE_MINUTE, label: '60 minutes' }
];

const DEFAULT_STATS = Object.freeze({
  requestCount: 0,
  errorCount: 0,
  clientErrorCount: 0,
  avgLatencyMs: 0,
  p95LatencyMs: 0,
  slowRequests: 0,
  errorRate: 0,
  clientErrorRate: 0
});

const DEFAULT_WORKER_STALE_MINUTES = Number.parseInt(process.env.DSP_WORKER_STALE_MINUTES || '5', 10);
const WORKER_ALERT_QUEUE_THRESHOLD = Number.parseInt(process.env.WORKER_ALERT_QUEUE_THRESHOLD || '3', 10);
const WORKER_STALE_COUNT_THRESHOLD = Number.parseInt(process.env.WORKER_STALE_COUNT_THRESHOLD || '3', 10);

const slugifyKey = (value = '') => (value || '')
  .toString()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  || `incident-${Date.now()}`;

const determineAudience = (route = '') => {
  if (!route || typeof route !== 'string') {
    return 'public';
  }
  if (route.startsWith('/api/v1/admin') || route.startsWith('/api/v1/curator')) {
    return 'curator';
  }
  return 'public';
};

const automationActions = {
  releaseImportLocks: {
    label: 'Release stale import locks',
    run: (db) => {
      try {
        const result = db.prepare(`
          UPDATE playlist_import_schedules
          SET lock_owner = NULL, lock_expires_at = NULL
          WHERE lock_expires_at IS NOT NULL
            AND datetime(lock_expires_at) <= datetime('now')
        `).run();

        return {
          status: result.changes > 0 ? 'applied' : 'noop',
          detail: result.changes > 0
            ? `Cleared ${result.changes} stale lock${result.changes === 1 ? '' : 's'}`
            : 'No stale locks detected'
        };
      } catch (error) {
        return { status: 'error', detail: error.message };
      }
    }
  },
  resetStuckExports: {
    label: 'Reset stalled exports',
    run: (db) => {
      try {
        const result = db.prepare(`
          UPDATE export_requests
          SET status = 'pending', updated_at = CURRENT_TIMESTAMP
          WHERE status = 'processing'
            AND datetime(updated_at) <= datetime('now', '-30 minutes')
        `).run();

        return {
          status: result.changes > 0 ? 'applied' : 'noop',
          detail: result.changes > 0
            ? `Moved ${result.changes} export${result.changes === 1 ? '' : 's'} back to pending`
            : 'No stalled exports older than 30 minutes'
        };
      } catch (error) {
        return { status: 'error', detail: error.message };
      }
    }
  }
};

class SystemHealthMonitor extends EventEmitter {
  constructor() {
    super();
    this.db = getDatabase();
    this.requestEvents = [];
    this.alertState = new Map();
    this.alertHistory = [];
    this.automationLog = [];
    this.diagnostics = [];
    this.lastSnapshot = null;
    this.lastPrune = 0;
    this.alertCooldowns = new Map();
    this.automationCooldowns = new Map();
    this.incidentTimers = new Map();

    if (DEFAULT_EVAL_INTERVAL > 0) {
      const interval = setInterval(() => {
        try {
          this.evaluate();
        } catch (error) {
          logger.error('SYSTEM_HEALTH', 'Evaluation tick failed', { error: error?.message });
        }
      }, DEFAULT_EVAL_INTERVAL);
      if (typeof interval.unref === 'function') {
        interval.unref();
      }
      this.interval = interval;
    }
  }

  recordRequest({ method, route, duration, statusCode, audience }) {
    const now = Date.now();
    const normalizedAudience = audience || determineAudience(route);
    const cleanDuration = Number.isFinite(duration) ? duration : 0;
    const entry = {
      ts: now,
      method,
      route,
      duration: cleanDuration,
      statusCode: statusCode || 0,
      audience: normalizedAudience
    };

    this.requestEvents.push(entry);
    this.trimOldEvents(now);
    return entry;
  }

  trimOldEvents(now) {
    const threshold = now - MAX_EVENT_AGE_MS;
    if (this.requestEvents.length === 0) {
      return;
    }

    // Drop chunks from the front when list gets large
    const dropUntil = this.requestEvents.findIndex((event) => event.ts >= threshold);
    if (dropUntil > 0) {
      this.requestEvents.splice(0, dropUntil);
    }
  }

  evaluate() {
    const now = Date.now();
    this.trimOldEvents(now);
    const metrics = this.buildWindowMetrics(now);
    const signals = this.collectBackendSignals();

    const snapshot = {
      generatedAt: new Date(now).toISOString(),
      metrics,
      signals,
      activeAlerts: Array.from(this.alertState.values()),
      automation: {
        recent: this.automationLog.slice(-5),
        availableActions: Object.entries(automationActions).map(([key, action]) => ({
          key,
          label: action.label
        }))
      },
      diagnostics: this.diagnostics.slice(-5)
    };

    this.lastSnapshot = snapshot;
    this.emit('snapshot', snapshot);
    this.evaluateAlerts(snapshot);
    this.persistKeyMetrics(snapshot);
    this.pruneMetricsIfNeeded(now);
    return snapshot;
  }

  buildWindowMetrics(now) {
    const windowStats = {};
    for (const window of STAT_WINDOWS) {
      windowStats[window.key] = this.computeStatsForWindow(now - window.duration);
    }
    return { windows: windowStats };
  }

  computeStatsForWindow(cutoffMs) {
    const stats = {
      public: { ...DEFAULT_STATS },
      curator: { ...DEFAULT_STATS }
    };

    const windowEvents = this.requestEvents.filter((event) => event.ts >= cutoffMs);
    const grouped = windowEvents.reduce((acc, event) => {
      const key = event.audience || 'public';
      acc[key] = acc[key] || [];
      acc[key].push(event);
      return acc;
    }, {});

    for (const audience of Object.keys(stats)) {
      const events = grouped[audience] || [];
      if (!events.length) continue;

      const durations = events.map((event) => event.duration).sort((a, b) => a - b);
      const totalDuration = durations.reduce((sum, value) => sum + value, 0);
      const requestCount = events.length;
      const errorCount = events.filter((event) => event.statusCode >= 500).length;
      const clientErrorCount = events.filter((event) => event.statusCode >= 400 && event.statusCode < 500).length;
      const slowThreshold = LATENCY_THRESHOLDS[audience]?.warning || 1500;
      const slowRequests = events.filter((event) => event.duration >= slowThreshold).length;
      const p95Index = Math.max(0, Math.floor(0.95 * (durations.length - 1)));

      stats[audience] = {
        requestCount,
        errorCount,
        clientErrorCount,
        avgLatencyMs: totalDuration / requestCount,
        p95LatencyMs: durations[p95Index] || 0,
        slowRequests,
        errorRate: requestCount ? errorCount / requestCount : 0,
        clientErrorRate: requestCount ? clientErrorCount / requestCount : 0
      };
    }

    return stats;
  }

  collectBackendSignals() {
    const safeCount = (sql) => {
      try {
        const row = this.db.prepare(sql).get();
        return row ? Number(row.count || 0) : 0;
      } catch (error) {
        logger.warn('SYSTEM_HEALTH', 'Failed to execute metric query', { sql, error: error?.message });
        return null;
      }
    };

    const totalTracks = safeCount('SELECT COUNT(1) as count FROM tracks');
    const tracksMissingDSP = safeCount(`
      SELECT COUNT(1) as count FROM tracks
      WHERE (spotify_id IS NULL OR spotify_id = '')
        AND (apple_id IS NULL OR apple_id = '')
        AND (tidal_id IS NULL OR tidal_id = '')
    `);
    const tracksMissingPreview = safeCount(`
      SELECT COUNT(1) as count FROM tracks
      WHERE (preview_url IS NULL OR preview_url = '')
        AND (deezer_preview_url IS NULL OR deezer_preview_url = '')
    `);
    const unresolvedFlags = safeCount(`
      SELECT COUNT(1) as count FROM user_content_flags
      WHERE status IS NULL OR status = 'unresolved'
    `);
    const failedExports = safeCount(`
      SELECT COUNT(1) as count FROM export_requests
      WHERE status IN ('failed', 'error')
    `);
    const stuckExports = safeCount(`
      SELECT COUNT(1) as count FROM export_requests
      WHERE status = 'processing'
        AND datetime(updated_at) <= datetime('now', '-30 minutes')
    `);
    const overdueImports = safeCount(`
      SELECT COUNT(1) as count FROM playlist_import_schedules
      WHERE status = 'active'
        AND (
          next_run_at IS NULL
          OR datetime(next_run_at) <= datetime('now', '-10 minutes')
        )
    `);
    const staleImportLocks = safeCount(`
      SELECT COUNT(1) as count FROM playlist_import_schedules
      WHERE lock_expires_at IS NOT NULL
        AND datetime(lock_expires_at) <= datetime('now')
    `);
    const pendingExports = safeCount(`
      SELECT COUNT(1) as count FROM export_requests
      WHERE status NOT IN ('completed', 'failed', 'confirmed')
    `);

    const dspGapRatio = totalTracks && tracksMissingDSP !== null
      ? tracksMissingDSP / totalTracks
      : null;
    const previewGapRatio = totalTracks && tracksMissingPreview !== null
      ? tracksMissingPreview / totalTracks
      : null;

    let workerSignals = null;
    try {
      const workerRows = this.db.prepare(`
        SELECT worker_id, status, queue_depth, failed_total, last_seen
        FROM dsp_worker_heartbeats
      `).all();
      const staleThresholdMs = Math.max(DEFAULT_WORKER_STALE_MINUTES, 1) * ONE_MINUTE;
      let errorCount = 0;
      let staleCount = 0;
      let dormantCount = 0;
      const queueDemand = pendingExports || 0;
      const hasDemand = queueDemand > 0;
      const workerData = workerRows.map((row) => {
        const ageMs = row.last_seen ? (Date.now() - new Date(row.last_seen).getTime()) : null;
        const stale = typeof ageMs === 'number' ? ageMs > staleThresholdMs : false;
        const dormant = stale && !hasDemand;
        const flaggedStale = stale && hasDemand;
        if (row.status === 'error') {
          errorCount++;
        }
        if (flaggedStale) {
          staleCount++;
        }
        if (dormant) {
          dormantCount++;
        }
        return {
          workerId: row.worker_id,
          status: row.status,
          queueDepth: row.queue_depth,
          failedTotal: row.failed_total,
          lastSeen: row.last_seen,
          ageMs,
          stale: flaggedStale,
          dormant
        };
      });
      workerSignals = {
        total: workerRows.length,
        errorCount,
        staleCount,
        dormantCount,
        queueDemand,
        workers: workerData
      };
    } catch (error) {
      logger.warn('SYSTEM_HEALTH', 'Unable to fetch worker heartbeats', {
        error: error?.message
      });
    }

    return {
      totals: {
        totalTracks
      },
      contentQuality: {
        tracksMissingDSP,
        tracksMissingPreview,
        dspGapRatio,
        previewGapRatio
      },
      backlog: {
        overdueImports,
        staleImportLocks,
        failedExports,
        stuckExports,
        pendingExports: pendingExports ?? 0
      },
      unresolvedFlags,
      workers: workerSignals
    };
  }

  evaluateAlerts(snapshot) {
    const detections = [
      this.detectLatencyAlert('public', snapshot),
      this.detectLatencyAlert('curator', snapshot),
      this.detectErrorRateAlert('public', snapshot),
      this.detectErrorRateAlert('curator', snapshot),
      this.detectWorkerHealth(snapshot)
    ].filter(Boolean);

    const handledKeys = new Set();

    detections.forEach((detection) => {
      handledKeys.add(detection.key);
      this.raiseAlert(detection);
    });

    // Resolve alerts no longer present
    for (const [key, alert] of this.alertState.entries()) {
      if (!handledKeys.has(key)) {
        this.resolveAlert(key, alert);
      }
    }
  }

  detectLatencyAlert(audience, snapshot) {
    const stats = snapshot.metrics?.windows?.['5m']?.[audience];
    const minRequests = MIN_LATENCY_REQUESTS[audience] ?? 10;
    if (!stats || stats.requestCount < minRequests) {
      return null;
    }
    const thresholds = LATENCY_THRESHOLDS[audience];
    const severity = stats.avgLatencyMs >= thresholds.critical
      ? 'critical'
      : stats.avgLatencyMs >= thresholds.warning
        ? 'warning'
        : null;
    if (!severity) {
      return null;
    }
    return {
      key: `${audience}_latency`,
      title: `${audience === 'public' ? 'Public' : 'Curator'} API latency elevated`,
      severity,
      message: `Average latency ${Math.round(stats.avgLatencyMs)}ms over last 5 minutes`,
      audience,
      instructions: [
        'Open Admin → Site Admin → System Health and confirm the latency trend across all windows.',
        'Stop any optional bulk actions (exports/imports) for five minutes to reduce load.',
        'If latency stays high, capture the alert ID and ping #incidents so engineering can inspect PM2 logs.'
      ],
      stats
    };
  }

  detectErrorRateAlert(audience, snapshot) {
    const stats = snapshot.metrics?.windows?.['5m']?.[audience];
    const minRequests = MIN_ERROR_RATE_REQUESTS[audience] ?? 20;
    if (!stats || stats.requestCount < minRequests) {
      return null;
    }
    const thresholds = ERROR_THRESHOLDS[audience];
    const severity = stats.errorRate >= thresholds.critical
      ? 'critical'
      : stats.errorRate >= thresholds.warning
        ? 'warning'
        : null;
    if (!severity) {
      return null;
    }
    return {
      key: `${audience}_error_rate`,
      title: `${audience === 'public' ? 'Public' : 'Curator'} errors rising`,
      severity,
      message: `${(stats.errorRate * 100).toFixed(1)}% of requests failed in the last 5 minutes`,
      audience,
      instructions: [
        'Check Admin → System Health → Active Alerts for failing endpoints.',
        'Retry the last action (or ask the curator to refresh) once before escalating.',
        'If errors persist, DM engineering with the alert ID and describe what the user was doing.'
      ],
      stats
    };
  }

  detectWorkerHealth(snapshot) {
    const workers = snapshot.signals?.workers;
    if (!workers || workers.total === 0) {
      return null;
    }
    const queueDemand = workers.queueDemand || 0;
    const hasErrors = workers.errorCount > 0;
    const hasStalenessWithDemand = workers.staleCount > 0
      && (queueDemand >= WORKER_ALERT_QUEUE_THRESHOLD || workers.staleCount >= WORKER_STALE_COUNT_THRESHOLD);

    if (!hasErrors && !hasStalenessWithDemand) {
      return null;
    }
    const severity = hasErrors || queueDemand >= WORKER_ALERT_QUEUE_THRESHOLD ? 'critical' : 'warning';
    const messageParts = [];
    if (hasErrors) {
      messageParts.push(`${workers.errorCount} worker${workers.errorCount === 1 ? '' : 's'} reporting errors`);
    }
    if (hasStalenessWithDemand) {
      const backlogNote = queueDemand
        ? ` (${queueDemand} open request${queueDemand === 1 ? '' : 's'})`
        : '';
      messageParts.push(`${workers.staleCount} heartbeat${workers.staleCount === 1 ? '' : 's'} stale${backlogNote}`);
    }

    return {
      key: 'worker_health',
      title: 'DSP exporter workers need attention',
      severity,
      message: messageParts.join(' • '),
      audience: 'curator',
      instructions: [
        'Open Admin → System Health to review worker statuses and queue depth.',
        'Use “Reset stalled exports” automation if the queue is stuck.',
        'If a worker stays offline, restart the DSP worker process and share the worker ID in #incidents.'
      ],
      stats: workers
    };
  }

  raiseAlert(alert) {
    const existing = this.alertState.get(alert.key);
    if (existing) {
      this.alertState.set(alert.key, {
        ...existing,
        ...alert,
        lastUpdatedAt: new Date().toISOString()
      });
      return;
    }

    const now = Date.now();
    const cooldown = this.alertCooldowns.get(alert.key) || 0;
    const shouldNotify = now - cooldown >= ALERT_COOLDOWN_MS;

    const alertRecord = {
      id: `${alert.key}-${now}`,
      ...alert,
      startedAt: new Date(now).toISOString(),
      lastUpdatedAt: new Date(now).toISOString()
    };

    this.alertState.set(alert.key, alertRecord);
    this.alertHistory.push(alertRecord);
    recordSystemMetric({
      metricName: `alert_${alert.key}`,
      metricValue: 1,
      tags: { severity: alert.severity, message: alert.message },
      thresholdBreached: true,
      alertSent: shouldNotify
    });

    if (shouldNotify) {
      this.alertCooldowns.set(alert.key, now);
      this.sendSlackAlert(alertRecord);
    }

    if (alert.autoAction) {
      this.runAutomation(alert.autoAction, { reason: alert.key });
    }
  }

  resolveAlert(key, previous) {
    if (!previous) {
      return;
    }
    this.alertState.delete(key);
    const timestamp = new Date().toISOString();
    const timer = this.incidentTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.incidentTimers.delete(key);
    }
    recordSystemMetric({
      metricName: `alert_${key}`,
      metricValue: 0,
      tags: { resolved: true, message: previous?.message },
      thresholdBreached: false,
      alertSent: false
    });

    this.alertHistory.push({
      ...previous,
      resolvedAt: timestamp,
      severity: 'resolved'
    });
  }

  reportIncident({
    key,
    title,
    message,
    severity = 'warning',
    instructions = [],
    stats = null,
    audience = 'internal',
    autoResolveMs = null
  }) {
    const normalizedKey = `incident_${slugifyKey(key || title)}`;
    const detection = {
      key: normalizedKey,
      title: title || 'System incident',
      message: message || 'See Site Admin for details',
      severity,
      instructions,
      stats,
      audience
    };
    this.raiseAlert(detection);
    if (autoResolveMs && Number.isFinite(autoResolveMs) && autoResolveMs > 0) {
      const timer = setTimeout(() => {
        this.resolveIncident(normalizedKey);
      }, autoResolveMs);
      this.incidentTimers.set(normalizedKey, timer);
      if (typeof timer.unref === 'function') {
        timer.unref();
      }
    }
    return normalizedKey;
  }

  resolveIncident(key) {
    const alert = this.alertState.get(key);
    if (!alert) {
      return false;
    }
    this.resolveAlert(key, alert);
    return true;
  }

  sendSlackAlert(alert) {
    if (!slackService.isConfigured()) {
      logger.info('SYSTEM_HEALTH', 'Slack not configured, skipping alert', { alert: alert.key });
      return;
    }

    const instructions = alert.instructions || [];
    const instructionText = instructions
      .map((step, index) => `${index + 1}. ${step}`)
      .join('\n');

    const contextLines = [];
    if (alert.stats?.requestCount) {
      contextLines.push(`Requests analysed: ${alert.stats.requestCount}`);
    }
    if (alert.stats?.avgLatencyMs) {
      contextLines.push(`Avg latency: ${Math.round(alert.stats.avgLatencyMs)}ms`);
      contextLines.push(`p95 latency: ${Math.round(alert.stats.p95LatencyMs)}ms`);
    }
    if (alert.stats?.errorRate) {
      contextLines.push(`Error rate: ${(alert.stats.errorRate * 100).toFixed(2)}%`);
    }

    const textSummary = `System alert (${alert.severity.toUpperCase()}): ${alert.title}`;
    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: `${alert.severity === 'critical' ? '🚨' : '⚠️'} ${alert.title}` }
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Summary:*\n${alert.message}` },
          { type: 'mrkdwn', text: `*Audience:*\n${alert.audience === 'public' ? 'Public site visitors' : 'Curators/Admins'}` }
        ]
      },
      ...(contextLines.length
        ? [{
            type: 'section',
            text: { type: 'mrkdwn', text: `*Key stats:*\n${contextLines.join('\n')}` }
          }]
        : []),
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*What to do now:*\n${instructionText}`
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Alert ID: ${alert.id} • Generated at ${alert.startedAt} • Share this ID with engineering if you need help`
          }
        ]
      }
    ];

    slackService.notifySystemAlert({
      severity: alert.severity,
      text: textSummary,
      blocks
    }).catch((error) => {
      logger.error('SYSTEM_HEALTH', 'Failed to send Slack alert', { error: error?.message });
    });
  }

  persistKeyMetrics(snapshot) {
    try {
      const fiveMinute = snapshot.metrics?.windows?.['5m'];
      if (!fiveMinute) return;

      for (const audience of Object.keys(fiveMinute)) {
        const stats = fiveMinute[audience];
        if (!stats.requestCount) continue;

        recordSystemMetric({
          metricName: `${audience}_avg_latency_ms`,
          metricValue: Math.round(stats.avgLatencyMs),
          tags: { window: '5m', requestCount: stats.requestCount }
        });

        recordSystemMetric({
          metricName: `${audience}_error_rate`,
          metricValue: Number((stats.errorRate * 100).toFixed(2)),
          tags: { window: '5m', requestCount: stats.requestCount }
        });
      }
    } catch (error) {
      logger.error('SYSTEM_HEALTH', 'Failed to persist metrics', { error: error?.message });
    }
  }

  pruneMetricsIfNeeded(now) {
    if (now - this.lastPrune < 6 * ONE_MINUTE) {
      return;
    }
    pruneOldSystemMetrics({ retentionDays: 30 });
    this.lastPrune = now;
  }

  runAutomation(actionKey, context = {}) {
    const action = automationActions[actionKey];
    if (!action) {
      return { status: 'error', detail: `Unknown automation action ${actionKey}` };
    }

    const now = Date.now();
    const cooldown = this.automationCooldowns.get(actionKey) || 0;
    if (now - cooldown < AUTOMATION_COOLDOWN_MS) {
      const info = {
        actionKey,
        status: 'skipped',
        detail: 'Cooldown active',
        reason: context.reason || 'manual',
        timestamp: new Date(now).toISOString()
      };
      this.automationLog.push(info);
      return info;
    }

    const result = action.run(this.db);
    const record = {
      actionKey,
      status: result.status,
      detail: result.detail,
      reason: context.reason || 'manual',
      timestamp: new Date(now).toISOString()
    };
    this.automationLog.push(record);
    this.automationCooldowns.set(actionKey, now);

    logger.info('SYSTEM_HEALTH', 'Automation executed', {
      actionKey,
      status: result.status,
      detail: result.detail
    });

    return record;
  }

  async runDiagnostics(trigger = 'manual') {
    const tasks = [
      {
        key: 'database',
        run: () => {
          try {
            this.db.prepare('SELECT 1').get();
            return { status: 'pass', detail: 'Database reachable' };
          } catch (error) {
            return { status: 'fail', detail: error.message };
          }
        }
      },
      {
        key: 'imports',
        run: () => {
          try {
            const row = this.db.prepare(`
              SELECT
                SUM(CASE WHEN next_run_at IS NULL OR datetime(next_run_at) <= datetime('now', '-10 minutes') THEN 1 ELSE 0 END) AS overdue,
                SUM(CASE WHEN lock_expires_at IS NOT NULL AND datetime(lock_expires_at) <= datetime('now') THEN 1 ELSE 0 END) AS staleLocks
              FROM playlist_import_schedules
              WHERE status = 'active'
            `).get();
            const overdue = Number(row?.overdue || 0);
            if (overdue === 0) {
              return { status: 'pass', detail: 'No overdue imports' };
            }
            return {
              status: overdue > IMPORT_BACKLOG_THRESHOLD ? 'fail' : 'warn',
              detail: `${overdue} import${overdue === 1 ? '' : 's'} overdue • ${row?.staleLocks || 0} stale lock${row?.staleLocks === 1 ? '' : 's'}`
            };
          } catch (error) {
            return { status: 'fail', detail: error.message };
          }
        }
      },
      {
        key: 'exports',
        run: () => {
          try {
            const row = this.db.prepare(`
              SELECT
                SUM(CASE WHEN status IN ('failed', 'error') THEN 1 ELSE 0 END) AS failures,
                SUM(CASE WHEN status = 'processing' AND datetime(updated_at) <= datetime('now', '-30 minutes') THEN 1 ELSE 0 END) AS stuck
              FROM export_requests
            `).get();
            const failures = Number(row?.failures || 0);
            if (failures === 0 && Number(row?.stuck || 0) === 0) {
              return { status: 'pass', detail: 'No failed exports' };
            }
            return {
              status: failures > 0 || Number(row?.stuck || 0) > 0 ? 'warn' : 'pass',
              detail: `${failures} failed • ${row?.stuck || 0} stuck`
            };
          } catch (error) {
            return { status: 'fail', detail: error.message };
          }
        }
      },
      {
        key: 'content',
        run: () => {
          try {
            const totalTracks = this.db.prepare('SELECT COUNT(1) as count FROM tracks').get()?.count || 0;
            if (!totalTracks) {
              return { status: 'pass', detail: 'No tracks indexed yet' };
            }
            const missing = this.db.prepare(`
              SELECT
                SUM(CASE WHEN (spotify_id IS NULL OR spotify_id = '') AND (apple_id IS NULL OR apple_id = '') AND (tidal_id IS NULL OR tidal_id = '') THEN 1 ELSE 0 END) AS noLinks,
                SUM(CASE WHEN (preview_url IS NULL OR preview_url = '') AND (deezer_preview_url IS NULL OR deezer_preview_url = '') THEN 1 ELSE 0 END) AS noPreview
              FROM tracks
            `).get();
            const noLinks = Number(missing?.noLinks || 0);
            const share = noLinks / totalTracks;
            if (share < CONTENT_DSP_THRESHOLD) {
              return { status: 'pass', detail: `${noLinks} / ${totalTracks} tracks missing links` };
            }
            return { status: 'warn', detail: `${Math.round(share * 100)}% of tracks missing DSP links` };
          } catch (error) {
            return { status: 'fail', detail: error.message };
          }
        }
      }
    ];

    const results = tasks.map((task) => ({
      key: task.key,
      ...task.run()
    }));

    const record = {
      trigger,
      timestamp: new Date().toISOString(),
      results
    };
    this.diagnostics.push(record);
    return record;
  }

  getSnapshot() {
    const snapshot = this.lastSnapshot || this.evaluate();
    return {
      ...snapshot,
      recentMetrics: getRecentSystemMetrics({ limit: 20 }),
      automation: {
        ...snapshot.automation,
        recent: this.automationLog.slice(-5)
      }
    };
  }
}

const systemHealthMonitor = new SystemHealthMonitor();

export { determineAudience };
export default systemHealthMonitor;
