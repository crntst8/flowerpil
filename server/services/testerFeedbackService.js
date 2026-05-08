import { getQueries, getDatabase } from '../database/db.js';

const ENV_FEATURE_ENABLED = () => String(process.env.FEATURE_TESTER_FEEDBACK || '').toLowerCase() === 'true';
const APP_ENV = process.env.NODE_ENV || 'development';
const SYNC_BATCH_SIZE = Number.parseInt(process.env.TESTER_FEEDBACK_SYNC_BATCH || '25', 10);
const TESTER_FEEDBACK_CONFIG_KEY = 'tester_feedback_sitewide';

const database = getDatabase();
let testerFeedbackConfigStmt = null;

try {
  testerFeedbackConfigStmt = database.prepare(`
    SELECT config_value
    FROM admin_system_config
    WHERE config_key = ?
    LIMIT 1
  `);
} catch (error) {
  console.warn('[TesterFeedback] Failed to prepare tester feedback config query:', error?.message);
}

const safeParse = (value, fallback = null) => {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
};

const readTesterFeedbackConfig = () => {
  if (!testerFeedbackConfigStmt) return null;
  try {
    const row = testerFeedbackConfigStmt.get(TESTER_FEEDBACK_CONFIG_KEY);
    if (!row || !row.config_value) return null;
    const parsed = safeParse(row.config_value, null);
    if (parsed && typeof parsed.enabled === 'boolean') {
      return parsed.enabled;
    }
    if (typeof parsed === 'boolean') {
      return parsed;
    }
    return null;
  } catch (error) {
    console.warn('[TesterFeedback] Failed to read tester feedback config:', error?.message);
    return null;
  }
};

export const isTesterFeedbackEnabled = () => {
  const configValue = readTesterFeedbackConfig();
  if (typeof configValue === 'boolean') {
    return configValue;
  }
  return ENV_FEATURE_ENABLED();
};

export const ensureTesterAccess = (user) => {
  if (!isTesterFeedbackEnabled()) {
    const error = new Error('Tester feedback feature disabled');
    error.code = 'FEATURE_DISABLED';
    throw error;
  }
  if (!user || !user.tester) {
    const error = new Error('Tester access required');
    error.code = 'TESTER_ONLY';
    throw error;
  }
};

const buildMetadataPayload = ({
  entry,
  baseRequestId,
  user,
  curator,
  receivedAt
}) => {
  const metadata = {
    ...entry.metadata,
    request_context: {
      request_id: baseRequestId,
      received_at: receivedAt,
      route: entry.route || null
    },
    client: {
      user_agent: entry.metadata?.user_agent || entry.userAgent || null,
      locale: entry.metadata?.locale || null,
      platform: entry.metadata?.platform || null,
      submitted_at: entry.metadata?.submitted_at || null,
      typing_started_at: entry.metadata?.typing_started_at || null
    },
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      curator_id: user.curator_id || null,
      curator_name: curator?.name || user.curator_name || null,
      tester: true
    },
    app: {
      env: APP_ENV,
      version: process.env.npm_package_version || null
    }
  };

  return metadata;
};

export const createFeedbackEntries = ({ user, entries, requestId, curator }) => {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [];
  }

  const queries = getQueries();
  const inserted = [];
  const receivedAt = new Date().toISOString();

  for (const rawEntry of entries) {
    if (!rawEntry || typeof rawEntry !== 'object') continue;
    const actionId = String(rawEntry.action_id || rawEntry.actionId || '').trim();
    const url = String(rawEntry.url || '').trim();
    const message = (rawEntry.message || '').toString().trim();

    if (!actionId || !url || !message) continue;

    const metadata = buildMetadataPayload({
      entry: {
        ...rawEntry,
        metadata: rawEntry.metadata || {}
      },
      baseRequestId: requestId,
      user,
      curator,
      receivedAt
    });

    try {
      const result = queries.insertTesterFeedback.run(
        user.id,
        user.curator_id || null,
        requestId,
        actionId,
        url,
        message,
        JSON.stringify(metadata)
      );

      inserted.push({
        id: result.lastInsertRowid,
        action_id: actionId,
        request_id: requestId,
        url,
        message,
        metadata,
        duplicate: false
      });
    } catch (error) {
      const messageText = String(error?.message || '').toLowerCase();
      if (messageText.includes('unique') && messageText.includes('action')) {
        const existing = queries.getTesterFeedbackByAction.get(actionId);
        inserted.push({
          id: existing?.id ?? null,
          action_id: actionId,
          request_id: existing?.request_id ?? requestId,
          url: existing?.url ?? url,
          message: existing?.message ?? message,
          metadata: existing ? safeParse(existing.metadata, {}) : metadata,
          duplicate: true
        });
        continue;
      }
      throw error;
    }
  }

  return inserted;
};

export const getFeedbackByAction = (actionId) => {
  if (!actionId) return null;
  const queries = getQueries();
  const row = queries.getTesterFeedbackByAction.get(actionId);
  if (!row) return null;
  return {
    ...row,
    metadata: safeParse(row.metadata, {})
  };
};

export const getUnsyncedFeedback = (limit = SYNC_BATCH_SIZE) => {
  const queries = getQueries();
  const rows = queries.getTesterFeedbackForSync.all(Math.max(1, limit));
  return rows.map((row) => ({
    ...row,
    metadata: safeParse(row.metadata, {})
  }));
};

export const markFeedbackSynced = (id) => {
  if (!id) return;
  const queries = getQueries();
  queries.setTesterFeedbackSynced.run(id);
};

export const recordSyncAttempt = (id) => {
  if (!id) return;
  const queries = getQueries();
  queries.updateTesterFeedbackSyncAttempt.run(id);
};
