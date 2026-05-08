import logger from '../utils/logger.js';
import { getDatabase } from './db.js';

const DEFAULT_INSTANCE = process.env.SERVER_INSTANCE || 'flowerpil-api';

let schemaEnsured = false;

const ensureSchema = (db) => {
  if (schemaEnsured) {
    return;
  }

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS system_performance_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metric_name TEXT NOT NULL,
        metric_value REAL NOT NULL,
        server_instance TEXT DEFAULT 'main',
        tags TEXT,
        threshold_breached INTEGER DEFAULT 0,
        alert_sent INTEGER DEFAULT 0,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_sys_perf_metric ON system_performance_log(metric_name);
      CREATE INDEX IF NOT EXISTS idx_sys_perf_timestamp ON system_performance_log(timestamp DESC);
    `);
    schemaEnsured = true;
  } catch (error) {
    logger.error('SYSTEM_METRICS', 'Failed to ensure system_performance_log schema', {
      error: error?.message
    });
  }
};

export const recordSystemMetric = ({
  metricName,
  metricValue,
  tags = null,
  thresholdBreached = false,
  alertSent = false
}) => {
  try {
    const db = getDatabase();
    ensureSchema(db);

    const payload = typeof tags === 'object' && tags !== null
      ? JSON.stringify(tags)
      : tags;

    db.prepare(`
      INSERT INTO system_performance_log (
        metric_name,
        metric_value,
        server_instance,
        tags,
        threshold_breached,
        alert_sent,
        timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      metricName,
      metricValue,
      DEFAULT_INSTANCE,
      payload,
      thresholdBreached ? 1 : 0,
      alertSent ? 1 : 0
    );
  } catch (error) {
    logger.error('SYSTEM_METRICS', 'Failed to record system metric', {
      metricName,
      metricValue,
      error: error?.message
    });
  }
};

export const getRecentSystemMetrics = ({ metricName = null, limit = 50 } = {}) => {
  try {
    const db = getDatabase();
    ensureSchema(db);

    const baseQuery = `
      SELECT id, metric_name, metric_value, server_instance, tags, threshold_breached, alert_sent, timestamp
      FROM system_performance_log
      ${metricName ? 'WHERE metric_name = ?' : ''}
      ORDER BY timestamp DESC
      LIMIT ?
    `;

    const rows = metricName
      ? db.prepare(baseQuery).all(metricName, limit)
      : db.prepare(baseQuery).all(limit);

    return rows.map((row) => ({
      id: row.id,
      metricName: row.metric_name,
      metricValue: row.metric_value,
      serverInstance: row.server_instance,
      tags: parseTags(row.tags),
      thresholdBreached: Boolean(row.threshold_breached),
      alertSent: Boolean(row.alert_sent),
      timestamp: row.timestamp
    }));
  } catch (error) {
    logger.error('SYSTEM_METRICS', 'Failed to fetch recent metrics', {
      metricName,
      error: error?.message
    });
    return [];
  }
};

export const pruneOldSystemMetrics = ({ retentionDays = 30 } = {}) => {
  try {
    const db = getDatabase();
    ensureSchema(db);
    db.prepare(`
      DELETE FROM system_performance_log
      WHERE timestamp <= datetime('now', ?)
    `).run(`-${Math.max(1, retentionDays)} days`);
  } catch (error) {
    logger.error('SYSTEM_METRICS', 'Failed to prune old metrics', {
      retentionDays,
      error: error?.message
    });
  }
};

const parseTags = (raw) => {
  if (!raw) {
    return null;
  }

  if (typeof raw === 'object') {
    return raw;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
};
