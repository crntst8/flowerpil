import appleMusicApiService from './appleMusicApiService.js';
import { getDatabase } from '../database/db.js';
import logger from '../utils/logger.js';

const STATUS = {
  PENDING: 'pending',
  RESOLVING: 'resolving',
  WAITING_AUTH: 'waiting_auth',
  RESOLVED: 'resolved',
  FAILED: 'failed'
};

const MAX_ATTEMPTS = parseInt(process.env.APPLE_SHARE_URL_MAX_ATTEMPTS || '60', 10);
const BASE_DELAY_MS = parseInt(process.env.APPLE_SHARE_URL_BASE_DELAY_MS || '30000', 10);
const BACKOFF_MULTIPLIER = parseFloat(process.env.APPLE_SHARE_URL_BACKOFF || '1.8');
const MAX_DELAY_MS = parseInt(process.env.APPLE_SHARE_URL_MAX_DELAY_MS || '900000', 10);
const POLL_INTERVAL_MS = parseInt(process.env.APPLE_SHARE_URL_POLL_INTERVAL_MS || '60000', 10);
const STARTUP_SEED_DELAY_MS = parseInt(process.env.APPLE_SHARE_URL_SEED_DELAY_MS || '5000', 10);
const BATCH_SIZE = parseInt(process.env.APPLE_SHARE_URL_BATCH_SIZE || '3', 10);

let resolverInterval = null;
let seededExisting = false;
let processingBatch = false;

const getDb = () => getDatabase();

const nowPlus = (ms) => new Date(Date.now() + Math.max(0, ms)).toISOString();

const computeBackoffMs = (attempt) => {
  const base = BASE_DELAY_MS * Math.pow(BACKOFF_MULTIPLIER, Math.max(0, attempt - 1));
  return Math.min(MAX_DELAY_MS, Math.max(BASE_DELAY_MS, Math.round(base)));
};

const fetchAppleAuthToken = () => {
  const db = getDb();
  const row = db.prepare('SELECT access_token, expires_at FROM oauth_tokens WHERE platform = ? ORDER BY id DESC LIMIT 1').get('apple');
  if (!row || !row.access_token) {
    return { token: null, expired: false };
  }
  if (row.expires_at) {
    const expired = new Date(row.expires_at) <= new Date();
    return { token: expired ? null : row.access_token, expired };
  }
  return { token: row.access_token, expired: false };
};

const isLibraryId = (id) => appleMusicApiService.isLibraryPlaylistId(id);
const isCatalogId = (id) => appleMusicApiService.isCatalogPlaylistId(id);

const deriveLibraryIdFromUrls = (urls = []) => {
  for (const url of urls) {
    if (!url) continue;
    const id = appleMusicApiService.extractPlaylistIdFromUrl(url);
    if (isLibraryId(id)) {
      return id;
    }
  }
  return null;
};

export const enqueueAppleShareResolution = ({
  playlistId,
  playlistTitle,
  appleLibraryId,
  storefront = 'us',
  delayMs = BASE_DELAY_MS
}) => {
  if (!playlistId || !appleLibraryId) {
    return;
  }

  const trimmedId = appleLibraryId.trim();
  if (!trimmedId || isCatalogId(trimmedId)) {
    // Already a share ID, nothing to resolve
    return;
  }

  if (!isLibraryId(trimmedId)) {
    logger.warn('APPLE_SHARE_RESOLVER', 'Skipping enqueue for unexpected Apple playlist identifier', {
      playlistId,
      identifier: trimmedId
    });
    return;
  }

  const db = getDb();
  const nextAttemptAt = nowPlus(delayMs ?? BASE_DELAY_MS);

  const existing = db.prepare('SELECT id FROM apple_share_resolutions WHERE playlist_id = ?').get(playlistId);
  if (existing) {
    db.prepare(`
      UPDATE apple_share_resolutions
      SET apple_library_id = ?,
          apple_storefront = ?,
          playlist_title = COALESCE(?, playlist_title),
          status = ?,
          attempt_count = 0,
          last_attempted_at = NULL,
          next_attempt_at = ?,
          resolved_url = NULL,
          error = NULL
      WHERE playlist_id = ?
    `).run(trimmedId, storefront, playlistTitle || null, STATUS.PENDING, nextAttemptAt, playlistId);
  } else {
    db.prepare(`
      INSERT INTO apple_share_resolutions (
        playlist_id,
        apple_library_id,
        apple_storefront,
        playlist_title,
        status,
        attempt_count,
        next_attempt_at
      ) VALUES (?, ?, ?, ?, ?, 0, ?)
    `).run(playlistId, trimmedId, storefront, playlistTitle || null, STATUS.PENDING, nextAttemptAt);
  }
};

const markJobFailed = (jobId, errorMessage) => {
  const db = getDb();
  db.prepare(`
    UPDATE apple_share_resolutions
    SET status = ?,
        error = ?,
        next_attempt_at = NULL
    WHERE id = ?
  `).run(STATUS.FAILED, errorMessage || 'Unable to resolve Apple share URL', jobId);
};

const scheduleRetry = (jobId, attempt, errorMessage) => {
  const db = getDb();
  const delayMs = computeBackoffMs(attempt + 1);
  db.prepare(`
    UPDATE apple_share_resolutions
    SET status = ?,
        error = ?,
        next_attempt_at = ?,
        attempt_count = ?,
        last_attempted_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(STATUS.PENDING, errorMessage || null, nowPlus(delayMs), attempt, jobId);
};

const markWaitingForAuth = (jobId, attempt, errorMessage) => {
  const db = getDb();
  const delayMs = computeBackoffMs(Math.max(1, attempt));
  db.prepare(`
    UPDATE apple_share_resolutions
    SET status = ?,
        error = ?,
        next_attempt_at = ?,
        attempt_count = ?,
        last_attempted_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    STATUS.WAITING_AUTH,
    errorMessage || 'Apple auth token missing or expired',
    nowPlus(delayMs),
    Math.max(0, attempt - 1),
    jobId
  );
};

const markResolved = (job, url) => {
  const db = getDb();
  db.prepare(`
    UPDATE apple_share_resolutions
    SET status = ?,
        resolved_url = ?,
        error = NULL,
        next_attempt_at = NULL,
        last_attempted_at = CURRENT_TIMESTAMP,
        attempt_count = ?
    WHERE id = ?
  `).run(STATUS.RESOLVED, url, job.attempt_count, job.id);

  try {
    db.prepare('UPDATE playlists SET apple_url = ?, exported_apple_url = ? WHERE id = ?').run(url, url, job.playlist_id);
  } catch (error) {
    logger.error('APPLE_SHARE_RESOLVER', 'Failed to persist resolved Apple share URL to playlist', {
      playlistId: job.playlist_id,
      error: error.message
    });
  }
};

const processJob = async (job) => {
  const db = getDb();
  const claim = db.prepare(`
    UPDATE apple_share_resolutions
    SET status = ?,
        attempt_count = attempt_count + 1,
        last_attempted_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status IN (?, ?)
  `);
  const { changes } = claim.run(STATUS.RESOLVING, job.id, STATUS.PENDING, STATUS.WAITING_AUTH);
  if (!changes) {
    return;
  }

  const fresh = db.prepare('SELECT * FROM apple_share_resolutions WHERE id = ?').get(job.id);
  const attemptNumber = fresh?.attempt_count || job.attempt_count + 1;

  const { token, expired } = fetchAppleAuthToken();
  if (!token) {
    logger.warn('APPLE_SHARE_RESOLVER', 'Apple Music auth token unavailable for share resolution', {
      playlistId: job.playlist_id,
      expired
    });
    if (attemptNumber >= MAX_ATTEMPTS) {
      markJobFailed(job.id, expired ? 'Apple auth token expired' : 'Missing Apple auth token');
    } else {
      markWaitingForAuth(job.id, attemptNumber, expired ? 'Apple auth token expired' : 'Missing Apple auth token');
    }
    return;
  }

  try {
    const resolved = await appleMusicApiService.resolvePlaylistShareUrl(
      token,
      fresh.apple_library_id,
      fresh.playlist_title || 'playlist'
    );

    if (appleMusicApiService.isShareUrl(resolved)) {
      logger.info('APPLE_SHARE_RESOLVER', 'Resolved Apple share URL', {
        playlistId: job.playlist_id,
        url: resolved,
        attempts: attemptNumber
      });
      markResolved(fresh, resolved);
      return;
    }

    if (attemptNumber >= MAX_ATTEMPTS) {
      markJobFailed(job.id, 'Exceeded maximum attempts without finding share URL');
      return;
    }

    scheduleRetry(job.id, attemptNumber, 'Share URL not ready yet');
  } catch (error) {
    logger.warn('APPLE_SHARE_RESOLVER', 'Apple share resolution attempt failed', {
      playlistId: job.playlist_id,
      attempt: attemptNumber,
      error: error.message
    });
    if (attemptNumber >= MAX_ATTEMPTS) {
      markJobFailed(job.id, error.message);
      return;
    }
    scheduleRetry(job.id, attemptNumber, error.message);
  }
};

const processPendingJobs = async () => {
  if (processingBatch) {
    return;
  }
  processingBatch = true;
  try {
    const db = getDb();
    const jobs = db.prepare(`
      SELECT * FROM apple_share_resolutions
      WHERE status IN (?, ?)
        AND (next_attempt_at IS NULL OR datetime(next_attempt_at) <= datetime('now'))
      ORDER BY next_attempt_at ASC
      LIMIT ?
    `).all(STATUS.PENDING, STATUS.WAITING_AUTH, BATCH_SIZE);

    for (const job of jobs) {
      await processJob(job);
    }
  } finally {
    processingBatch = false;
  }
};

const seedExistingPlaylists = () => {
  if (seededExisting) {
    return;
  }
  seededExisting = true;

  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT id, title, apple_url, exported_apple_url
      FROM playlists
      WHERE (apple_url LIKE '%/p.%' OR apple_url LIKE '%/library/%' OR exported_apple_url LIKE '%/p.%' OR exported_apple_url LIKE '%/library/%')
    `).all();

    for (const row of rows) {
      const libraryId = deriveLibraryIdFromUrls([row.exported_apple_url, row.apple_url]);
      if (!libraryId) {
        continue;
      }
      enqueueAppleShareResolution({
        playlistId: row.id,
        playlistTitle: row.title,
        appleLibraryId: libraryId,
        delayMs: STARTUP_SEED_DELAY_MS
      });
    }
  } catch (error) {
    logger.warn('APPLE_SHARE_RESOLVER', 'Failed to seed apple share jobs from existing playlists', {
      error: error.message
    });
  }
};

export const startAppleShareUrlResolver = () => {
  if (resolverInterval) {
    return;
  }

  try {
    const db = getDb();
    db.prepare(`
      UPDATE apple_share_resolutions
      SET status = ?,
          next_attempt_at = datetime('now'),
          error = NULL
      WHERE status = ?
    `).run(STATUS.PENDING, STATUS.RESOLVING);
  } catch (error) {
    logger.warn('APPLE_SHARE_RESOLVER', 'Failed to reset in-flight apple share jobs on startup', {
      error: error.message
    });
  }

  seedExistingPlaylists();
  resolverInterval = setInterval(() => {
    processPendingJobs().catch((error) => {
      logger.error('APPLE_SHARE_RESOLVER', 'Unhandled error while processing Apple share jobs', {
        error: error.message
      });
    });
  }, POLL_INTERVAL_MS);

  // Kick off immediate run shortly after startup to avoid long waits
  setTimeout(() => {
    processPendingJobs().catch((error) => {
      logger.error('APPLE_SHARE_RESOLVER', 'Initial Apple share processing run failed', {
        error: error.message
      });
    });
  }, Math.min(STARTUP_SEED_DELAY_MS, 10000));
};

export const stopAppleShareUrlResolver = () => {
  if (resolverInterval) {
    clearInterval(resolverInterval);
    resolverInterval = null;
  }
};

export default {
  enqueueAppleShareResolution,
  startAppleShareUrlResolver,
  stopAppleShareUrlResolver
};
