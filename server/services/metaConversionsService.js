import crypto from 'crypto';
import { getDatabase } from '../database/db.js';

const database = getDatabase();

const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v24.0';
const MAX_EVENT_AGE_SECONDS = 7 * 24 * 60 * 60;
const MAX_ATTEMPTS = 6;
const BATCH_LIMIT = 50;
const RETRY_BASE_SECONDS = 30;

let flushInProgress = false;

let insertEventStmt = null;
let fetchPendingStmt = null;
let markSentStmt = null;
let markRetryStmt = null;
let markFailedStmt = null;

try {
  insertEventStmt = database.prepare(`
    INSERT INTO meta_event_queue (
      pixel_id, event_name, event_time, event_id, payload_json, status
    ) VALUES (?, ?, ?, ?, ?, 'pending')
  `);

  fetchPendingStmt = database.prepare(`
    SELECT *
    FROM meta_event_queue
    WHERE status IN ('pending', 'retry')
      AND (next_attempt_at IS NULL OR next_attempt_at <= datetime('now'))
    ORDER BY created_at ASC
    LIMIT ?
  `);

  markSentStmt = database.prepare(`
    UPDATE meta_event_queue
    SET status = 'sent', attempt_count = attempt_count + 1, last_error = NULL, updated_at = datetime('now')
    WHERE id = ?
  `);

  markRetryStmt = database.prepare(`
    UPDATE meta_event_queue
    SET
      status = 'retry',
      attempt_count = attempt_count + 1,
      next_attempt_at = datetime('now', ?),
      last_error = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `);

  markFailedStmt = database.prepare(`
    UPDATE meta_event_queue
    SET
      status = 'failed',
      attempt_count = attempt_count + 1,
      last_error = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `);
} catch (error) {
  console.warn('[Meta CAPI] Failed to prepare queue statements:', error?.message);
}

const normalizeString = (value) => {
  if (value === undefined || value === null) return null;
  return String(value).trim().toLowerCase();
};

const normalizePhone = (value) => {
  if (!value) return null;
  const digits = String(value).replace(/\D+/g, '');
  return digits.length ? digits : null;
};

const hashValue = (value) => {
  if (!value) return null;
  return crypto.createHash('sha256').update(value).digest('hex');
};

const getAccessToken = () => {
  if (process.env.META_SYSTEM_USER_TOKEN) {
    return process.env.META_SYSTEM_USER_TOKEN;
  }
  if (process.env.META_APP_ID && process.env.META_APP_SECRET) {
    return `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`;
  }
  return null;
};

const parsePayload = (row) => {
  try {
    return JSON.parse(row.payload_json);
  } catch (error) {
    return null;
  }
};

const buildRetryOffset = (attemptCount) => {
  const attempt = Math.max(attemptCount, 0);
  const delaySeconds = Math.min(RETRY_BASE_SECONDS * Math.pow(2, attempt), 60 * 60);
  return `+${delaySeconds} seconds`;
};

export const buildUserData = ({ user, req }) => {
  const userData = {};

  const email = normalizeString(user?.email);
  if (email) {
    userData.em = hashValue(email);
  }

  const firstName = normalizeString(user?.first_name || user?.firstName);
  if (firstName) {
    userData.fn = hashValue(firstName);
  }

  const lastName = normalizeString(user?.last_name || user?.lastName);
  if (lastName) {
    userData.ln = hashValue(lastName);
  }

  const phone = normalizePhone(user?.phone || user?.phone_number || user?.phoneNumber);
  if (phone) {
    userData.ph = hashValue(phone);
  }

  if (user?.id) {
    userData.external_id = hashValue(String(user.id));
  }

  const fbp = req.cookies?._fbp;
  if (fbp) {
    userData.fbp = fbp;
  }

  const fbc = req.cookies?._fbc;
  if (fbc) {
    userData.fbc = fbc;
  }

  return userData;
};

export const enqueueMetaEvent = ({ pixelId, payload }) => {
  const eventTime = Number(payload?.event_time);
  const now = Math.floor(Date.now() / 1000);

  if (!pixelId || !payload || !eventTime) {
    return { queued: false, reason: 'invalid_payload' };
  }

  if (eventTime < now - MAX_EVENT_AGE_SECONDS) {
    console.warn('[Meta CAPI] Dropping stale event', {
      pixelId,
      eventTime,
      now
    });
    return { queued: false, reason: 'stale_event' };
  }

  if (!insertEventStmt) {
    return { queued: false, reason: 'db_unavailable' };
  }

  const payloadJson = JSON.stringify(payload);
  const result = insertEventStmt.run(
    pixelId,
    payload.event_name,
    eventTime,
    payload.event_id,
    payloadJson
  );

  return { queued: true, id: result.lastInsertRowid };
};

const sendBatch = async ({ pixelId, events }) => {
  const accessToken = getAccessToken();
  if (!accessToken) {
    return {
      ok: false,
      retryable: false,
      status: 0,
      error: 'Meta access token not configured'
    };
  }

  const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${pixelId}/events`;
  const payload = {
    data: events,
    access_token: accessToken
  };

  if (process.env.META_CAPI_TEST_EVENT_CODE) {
    payload.test_event_code = process.env.META_CAPI_TEST_EVENT_CODE;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  let responseBody = null;
  try {
    responseBody = await response.json();
  } catch (error) {
    responseBody = null;
  }

  if (!response.ok) {
    const message = responseBody?.error?.message || response.statusText || 'Meta CAPI error';
    const retryable = response.status >= 500 || response.status === 429;
    return {
      ok: false,
      retryable,
      status: response.status,
      error: message
    };
  }

  return {
    ok: true,
    status: response.status,
    response: responseBody
  };
};

export const flushMetaQueue = async ({ limit = BATCH_LIMIT } = {}) => {
  if (flushInProgress) {
    return { skipped: true };
  }

  flushInProgress = true;

  try {
    if (!fetchPendingStmt) {
      return { processed: 0, error: 'db_unavailable' };
    }

    const pending = fetchPendingStmt.all(limit);
    if (!pending.length) {
      return { processed: 0 };
    }

    const grouped = pending.reduce((acc, row) => {
      if (!acc[row.pixel_id]) acc[row.pixel_id] = [];
      const payload = parsePayload(row);
      if (payload) {
        acc[row.pixel_id].push({ row, payload });
      } else {
        if (markFailedStmt) {
          markFailedStmt.run('Invalid payload JSON', row.id);
        }
      }
      return acc;
    }, {});

    for (const [pixelId, items] of Object.entries(grouped)) {
      const events = items.map((item) => item.payload);
      const result = await sendBatch({ pixelId, events });

      if (result.ok) {
        items.forEach((item) => {
          if (markSentStmt) {
            markSentStmt.run(item.row.id);
          }
        });
        continue;
      }

      items.forEach((item) => {
        const attempts = (item.row.attempt_count || 0) + 1;
        if (!result.retryable || attempts >= MAX_ATTEMPTS) {
          if (markFailedStmt) {
            markFailedStmt.run(result.error || 'Meta CAPI error', item.row.id);
          }
        } else if (markRetryStmt) {
          const offset = buildRetryOffset(item.row.attempt_count || 0);
          markRetryStmt.run(offset, result.error || 'Meta CAPI error', item.row.id);
        }
      });
    }

    return { processed: pending.length };
  } catch (error) {
    console.error('[Meta CAPI] Failed to flush queue:', error?.message);
    return { processed: 0, error: error?.message };
  } finally {
    flushInProgress = false;
  }
};
