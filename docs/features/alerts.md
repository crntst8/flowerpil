# System Health & Alerts

## Purpose

Monitors API performance, content health, automation results, and DSP worker status in real-time. Surfaces metrics and alerts in the admin panel and sends critical notifications to Slack when thresholds are breached.

## How It Works

SystemHealthMonitor (`server/services/systemHealthMonitor.js`) extends EventEmitter and runs evaluation cycles at intervals defined by SYSTEM_HEALTH_EVAL_INTERVAL_MS (default 1 minute). The monitor maintains an in-memory array of request events with 60-minute retention, trimming old events on each cycle. When recording requests via recordRequest(), it captures method, route, duration, statusCode, and audience (public or curator). `buildWindowMetrics()` produces stats for 5m/15m/60m windows as `metrics.windows['5m'|'15m'|'60m'].public|curator` objects containing requestCount, errorCount, clientErrorCount, avgLatencyMs, p95LatencyMs, slowRequests, errorRate, and clientErrorRate.

Backend signals are collected via collectBackendSignals() which queries the database for content and queue health: totalTracks, tracksMissingDSP, tracksMissingPreview, unresolved user flags, failed/stuck export jobs, overdue import schedules, stale import locks, pending export queue depth, and DSP worker heartbeats (staleness based on DSP_WORKER_STALE_MINUTES, default 5 minutes). Worker signals include counts of error, stale, and dormant workers plus per-worker metadata.

Alert evaluation compares 5m window metrics against thresholds with minimum volume guards. Public API latency triggers warning at ≥1500ms and critical at ≥2500ms once at least 30 requests arrive in 5 minutes. Curator API latency triggers at ≥1400ms warning and ≥2300ms critical with a 25-request minimum. Error rates trigger at ≥8% warning and ≥12% critical for public traffic (≥60 requests) and ≥6% / ≥10% for curator traffic (≥30 requests). Worker alerts fire when workers report errors or when staleness coincides with queue demand (queue ≥ WORKER_ALERT_QUEUE_THRESHOLD or staleCount ≥ WORKER_STALE_COUNT_THRESHOLD). Content gaps and import backlogs are surfaced as signals, not alerts.

When an alert fires, the monitor checks alertCooldowns Map for recent notifications. If the cooldown (default 10 minutes) has passed, it calls SlackNotificationService.notifySystemAlert() with alert details and updates alertState Map. Alerts remain in activeAlerts until metrics fall below thresholds.

Self-healing automation includes releaseImportLocks and resetStuckExports actions. Each action checks automationCooldowns Map (default 15 minutes) before executing. releaseImportLocks clears playlist_import_schedules rows where lock_expires_at ≤ current time. resetStuckExports moves export_requests with status='processing' and updated_at older than 30 minutes back to 'pending'. Results are logged to automationLog array and recorded via recordSystemMetric().

Frontend performance metrics arrive via POST /api/v1/logs/performance with 5% sampling rate. These metrics funnel into system_performance_log table with metric_name, metric_value, tags, and timestamp fields.

## API/Interface

### Admin Endpoints

```
GET /api/v1/admin/site-admin/system-health
```

Returns current health snapshot including metrics, signals, activeAlerts, automation log, diagnostics, and recent metrics.

**Response (shape):**
```json
{
  "generatedAt": "2025-01-15T10:30:00.000Z",
  "metrics": {
    "windows": {
      "5m": {
        "public": {
          "requestCount": 150,
          "errorCount": 2,
          "clientErrorCount": 5,
          "avgLatencyMs": 450,
          "p95LatencyMs": 890,
          "slowRequests": 4,
          "errorRate": 0.013,
          "clientErrorRate": 0.033
        },
        "curator": { /* same shape */ }
      },
      "15m": { /* same shape */ },
      "60m": { /* same shape */ }
    }
  },
  "signals": {
    "totals": { "totalTracks": 12000 },
    "contentQuality": {
      "tracksMissingDSP": 15,
      "tracksMissingPreview": 42,
      "dspGapRatio": 0.12,
      "previewGapRatio": 0.38
    },
    "backlog": {
      "overdueImports": 0,
      "staleImportLocks": 0,
      "failedExports": 1,
      "stuckExports": 0,
      "pendingExports": 3
    },
    "unresolvedFlags": 3,
    "workers": {
      "total": 2,
      "errorCount": 0,
      "staleCount": 0,
      "dormantCount": 1,
      "queueDemand": 3,
      "workers": [{ "workerId": "w1", "stale": false, "queueDepth": 3 }]
    }
  },
  "activeAlerts": [
    {
      "id": "public_latency-1700000000000",
      "key": "public_latency",
      "severity": "warning",
      "message": "Average latency 1650ms over last 5 minutes",
      "audience": "public",
      "instructions": [
        "Open Admin → Site Admin → System Health and confirm the latency trend across all windows.",
        "Stop any optional bulk actions (exports/imports) for five minutes to reduce load.",
        "If latency stays high, capture the alert ID and ping #incidents so engineering can inspect PM2 logs."
      ],
      "startedAt": "2025-01-15T10:25:00.000Z",
      "lastUpdatedAt": "2025-01-15T10:25:00.000Z"
    }
  ],
  "automation": {
    "recent": [
      {
        "actionKey": "releaseImportLocks",
        "status": "applied",
        "detail": "Cleared 2 stale locks",
        "timestamp": "2025-01-15T09:45:00.000Z",
        "reason": "manual"
      }
    ],
    "availableActions": [
      { "key": "releaseImportLocks", "label": "Release stale import locks" },
      { "key": "resetStuckExports", "label": "Reset stalled exports" }
    ]
  },
  "diagnostics": [],
  "recentMetrics": [
    {
      "metric_name": "public_avg_latency_ms",
      "metric_value": 450,
      "tags": { "window": "5m", "requestCount": 150 },
      "threshold_breached": 0
    }
  ]
}
```

```
POST /api/v1/admin/site-admin/system-health/run-diagnostic
```

Executes diagnostic checks and returns updated snapshot.

**Response:**
```json
{
  "diagnostic": {
    "database": { "status": "pass", "detail": "Connection healthy" },
    "imports": { "status": "pass", "detail": "No backlog" },
    "exports": { "status": "pass", "detail": "Queue healthy" },
    "content": { "status": "warn", "detail": "Content gaps detected" }
  },
  "snapshot": { }
}
```

```
POST /api/v1/admin/site-admin/system-health/automation
```

Triggers automation action.

**Request:**
```json
{
  "actionKey": "releaseImportLocks"
}
```

**Response:**
```json
{
  "result": {
    "status": "applied",
    "detail": "Cleared 2 stale locks"
  },
  "snapshot": { }
}
```

### Performance Logging Endpoint

```
POST /api/v1/logs/performance
```

Accepts frontend performance metrics. Caller provides metric (string), value (number), optional tags (string/number), and optional audience (defaults to public). Requests exceeding ±600000 are rejected server-side. Sampling is implemented client-side (see `src/shared/utils/performanceUtils.js`), not enforced by the endpoint.

**Request:**
```json
{
  "metric": "component_first_paint",
  "value": 245.6,
  "audience": "public",
  "tags": {
    "component": "PlaylistView",
    "route": "/playlists/123"
  }
}
```

### SystemHealthMonitor Methods

**recordRequest:**
```javascript
recordRequest({ method, route, duration, statusCode, audience })
// Returns: { ts, method, route, duration, statusCode, audience }
```

**getSnapshot:**
```javascript
getSnapshot()
// Returns: { generatedAt, metrics, signals, activeAlerts, automation, diagnostics, recentMetrics }
```

**runDiagnostics:**
```javascript
runDiagnostics(reason)
// Returns: { database, imports, exports, content }
```

**runAutomation:**
```javascript
runAutomation(actionKey, { reason })
// Returns: { actionKey, status, detail, timestamp, reason }
```

## Database

### system_performance_log Table

Migration: `server/database/migrations/010_admin_performance_tools.js`:56-67

**Schema:**
```sql
CREATE TABLE system_performance_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  metric_name TEXT NOT NULL,
  metric_value REAL NOT NULL,
  server_instance TEXT DEFAULT 'main',
  tags TEXT, -- JSON string
  threshold_breached INTEGER DEFAULT 0,
  alert_sent INTEGER DEFAULT 0,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

**Indexes:**
- idx_sys_perf_metric ON metric_name
- idx_sys_perf_timestamp ON timestamp DESC
- idx_sys_perf_threshold ON threshold_breached

**Queries:**

Insert metric (from `server/database/systemPerformanceRepository.js`:36-76):
```sql
INSERT INTO system_performance_log
(metric_name, metric_value, server_instance, tags, threshold_breached, alert_sent, timestamp)
VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
```

Fetch recent metrics (from `server/database/systemPerformanceRepository.js`:78-107):
```sql
SELECT id, metric_name, metric_value, server_instance, tags, threshold_breached, alert_sent, timestamp
FROM system_performance_log
WHERE metric_name = ? -- optional filter
ORDER BY timestamp DESC
LIMIT ?
```

### Referenced Tables

**playlist_import_schedules** - Queried for lock_expires_at to find stale locks

**export_requests** - Queried for status='processing' with old updated_at timestamps

**dsp_export_heartbeats** - Checked for worker staleness

**tracks** - Counted for missing DSP links and preview URLs

**user_flags** - Counted for unresolved flags

## Integration Points

### Internal Dependencies

- **SlackNotificationService** (`server/services/SlackNotificationService.js`) - notifySystemAlert() method sends formatted alert messages to Slack
- **systemPerformanceRepository** (`server/database/systemPerformanceRepository.js`) - recordSystemMetric(), getRecentSystemMetrics(), pruneOldSystemMetrics()
- **logger** (`server/utils/logger.js`) - Structured logging for health events
- **getDatabase** (`server/database/db.js`) - Database connection for queries

### External Dependencies

- **events** (Node.js built-in) - EventEmitter base class for SystemHealthMonitor
- **Slack Web API** - OAuth tokens and channel posting via SlackNotificationService

### Service Registration

SystemHealthMonitor is imported and used in:
- `server/api/admin/siteAdmin.js`:1190-1236 for health endpoints
- `server/index.js` for middleware integration and request tracking
- `server/services/dspTelemetryService.js` for DSP automation event logging

### Admin UI Integration

Health snapshot displayed in SiteActionsTab under "System Health & Alerts" card with real-time refresh, alert list, automation buttons, and diagnostic runner.

## Configuration

### Environment Variables

**Evaluation & Timing:**
- `SYSTEM_HEALTH_EVAL_INTERVAL_MS` - Evaluation cycle interval (default: 60000)
- `SYSTEM_HEALTH_ALERT_COOLDOWN_MS` - Alert notification cooldown (default: 600000)
- `SYSTEM_HEALTH_AUTOMATION_COOLDOWN_MS` - Automation action cooldown (default: 900000)
- `SERVER_INSTANCE` - Instance identifier for multi-server deployments (default: 'flowerpil-api')

**Latency Thresholds (milliseconds):**
- `PUBLIC_LATENCY_WARNING_MS` - Public API warning threshold (default: 1500)
- `PUBLIC_LATENCY_CRITICAL_MS` - Public API critical threshold (default: 2500)
- `PUBLIC_LATENCY_MIN_REQUESTS` - Minimum requests in window to evaluate latency (default: 30)
- `CURATOR_LATENCY_WARNING_MS` - Curator API warning threshold (default: 1400)
- `CURATOR_LATENCY_CRITICAL_MS` - Curator API critical threshold (default: 2300)
- `CURATOR_LATENCY_MIN_REQUESTS` - Minimum requests in window to evaluate latency (default: 25)

**Error Rate Thresholds (decimal):**
- `PUBLIC_ERROR_RATE_WARNING` - Public API warning rate (default: 0.08)
- `PUBLIC_ERROR_RATE_CRITICAL` - Public API critical rate (default: 0.12)
- `PUBLIC_ERROR_MIN_REQUESTS` - Minimum requests in window to evaluate error rate (default: 60)
- `CURATOR_ERROR_RATE_WARNING` - Curator API warning rate (default: 0.06)
- `CURATOR_ERROR_RATE_CRITICAL` - Curator API critical rate (default: 0.1)
- `CURATOR_ERROR_MIN_REQUESTS` - Minimum requests in window to evaluate error rate (default: 30)

**Content & Queue Thresholds:**
- `IMPORT_BACKLOG_THRESHOLD` - Overdue imports trigger threshold (default: 3)
- `CONTENT_DSP_GAP_THRESHOLD` - Missing DSP links threshold (default: 0.35)
- `CONTENT_PREVIEW_GAP_THRESHOLD` - Missing preview threshold (default: 0.5)
- `DSP_WORKER_STALE_MINUTES` - Worker heartbeat staleness (default: 5)
- `WORKER_ALERT_QUEUE_THRESHOLD` - Minimum queued exports before stale workers alert (default: 3)
- `WORKER_STALE_COUNT_THRESHOLD` - Stale worker count required when queue is small (default: 3)

**Slack Integration:**
- `SLACK_ACCESS_TOKEN` - Bot User OAuth Token (xoxb-...)
- `SLACK_REFRESH_TOKEN` - OAuth refresh token
- `SLACK_CLIENT_ID` - Slack app client ID
- `SLACK_CLIENT_SECRET` - Slack app client secret
- `SLACK_CHANNEL_ID` - Default channel for notifications
- `SLACK_ALERT_CHANNEL_ID` - Override channel for health alerts
- `SLACK_NOTIFICATIONS_ENABLED` - Global enable/disable (default: true)

## Usage Examples

### Recording API Request

From middleware in `server/index.js`:

```javascript
import systemHealthMonitor from './services/systemHealthMonitor.js';

app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    systemHealthMonitor.recordRequest({
      method: req.method,
      route: req.path,
      duration,
      statusCode: res.statusCode,
      audience: req.path.startsWith('/api/v1/admin') ? 'curator' : 'public'
    });
  });

  next();
});
```

### Manual Automation Trigger

From admin panel:

```javascript
import { adminPost } from '@modules/admin/utils/adminApi';

const runAutomation = async (actionKey) => {
  const result = await adminPost('/api/v1/admin/site-admin/system-health/automation', {
    actionKey
  });
  console.log(result.result.status, result.result.detail);
};

runAutomation('releaseImportLocks');
```

### Frontend Performance Reporting

From `src/shared/utils/performanceUtils.js`:

```javascript
export const reportFrontendMetric = async (metricName, metricValue, tags = {}) => {
  if (Math.random() > 0.05) return; // 5% sampling

  try {
    await fetch('/api/v1/logs/performance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metricName, metricValue, tags })
    });
  } catch (err) {
    console.warn('Failed to report metric', err);
  }
};
```

### Checking Alert State

From `server/services/systemHealthMonitor.js`:187-220:

```javascript
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
    }
  };

  this.lastSnapshot = snapshot;
  return snapshot;
}
```

### Self-Healing Automation

From `server/services/systemHealthMonitor.js`:79-124:

```javascript
const automationActions = {
  releaseImportLocks: {
    label: 'Release stale import locks',
    run: (db) => {
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
    }
  },
  resetStuckExports: {
    label: 'Reset stalled exports',
    run: (db) => {
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
    }
  }
};
```

### Recording Custom Metric

From `server/database/systemPerformanceRepository.js`:36-76:

```javascript
import { recordSystemMetric } from '../database/systemPerformanceRepository.js';

recordSystemMetric({
  metricName: 'import_queue_depth',
  metricValue: 12,
  tags: { queue: 'scheduled', priority: 'normal' },
  thresholdBreached: false,
  alertSent: false
});
```
