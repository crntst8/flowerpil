import { isTesterFeedbackEnabled, getUnsyncedFeedback, markFeedbackSynced, recordSyncAttempt } from './testerFeedbackService.js';

const SYNC_INTERVAL_MS = Number.parseInt(process.env.TESTER_FEEDBACK_SYNC_INTERVAL || '60000', 10);
const SYNC_BATCH_SIZE = Number.parseInt(process.env.TESTER_FEEDBACK_SYNC_BATCH || '25', 10);
const LOGGING_BASE_URL = (process.env.LOGGING_SERVER_BASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.LOGGING_SERVICE_KEY || '';

let syncTimer = null;
let isSyncing = false;

const canSync = () => isTesterFeedbackEnabled() && !!LOGGING_BASE_URL;

const scheduleTimer = () => {
  if (!canSync()) return;
  if (syncTimer) return;
  syncTimer = setInterval(() => {
    flushFeedback().catch((error) => {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[TESTER_FEEDBACK_SYNC] Periodic flush failed', error?.message);
      }
    });
  }, SYNC_INTERVAL_MS);
  syncTimer.unref?.();
};

const buildPayload = (entries) => {
  return entries.map((entry) => ({
    id: entry.id,
    action_id: entry.action_id,
    request_id: entry.request_id,
    user_id: entry.user_id,
    curator_id: entry.curator_id,
    url: entry.url,
    message: entry.message,
    metadata: entry.metadata,
    created_at: entry.created_at
  }));
};

export const flushFeedback = async () => {
  if (!canSync() || isSyncing) {
    return;
  }

  isSyncing = true;
  let batch = [];
  try {
    batch = getUnsyncedFeedback(SYNC_BATCH_SIZE);
    if (!batch.length) {
      return;
    }

    const response = await fetch(`${LOGGING_BASE_URL}/ingest/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(SERVICE_KEY ? { 'x-logging-service-key': SERVICE_KEY } : {})
      },
      body: JSON.stringify({ entries: buildPayload(batch) })
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Remote logging server responded with ${response.status} ${response.statusText} ${text}`);
    }

    for (const entry of batch) {
      markFeedbackSynced(entry.id);
    }
  } catch (error) {
    for (const entry of batch) {
      recordSyncAttempt(entry.id);
    }
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[TESTER_FEEDBACK_SYNC] Flush failed', error?.message);
    }
  } finally {
    isSyncing = false;
  }
};

export const enqueueFeedbackSync = () => {
  if (!canSync()) return;
  scheduleTimer();
  flushFeedback().catch((error) => {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[TESTER_FEEDBACK_SYNC] Immediate flush failed', error?.message);
    }
  });
};

export const startFeedbackSync = () => {
  if (!canSync()) return;
  scheduleTimer();
};
