import express from 'express';
import crypto from 'crypto';
import { getDatabase, getQueries } from '../../database/db.js';
import {
  normalizeHex,
  generateGenreColor,
  slugifyGenreId,
  formatGenreLabel,
  getGenreCategoryConfig
} from '../../utils/genreCategories.js';
import {
  sendPasswordResetEmail,
  sendSignupConfirmationEmail,
  sendReferralSubmissionEmail,
  generateVerificationCode
} from '../../utils/emailService.js';
import { logSecurityEvent, SECURITY_EVENTS } from '../../utils/securityLogger.js';
import logger from '../../utils/logger.js';
import { invalidateFeed } from '../../utils/memoryCache.js';
import systemHealthMonitor from '../../services/systemHealthMonitor.js';
import slackService from '../../services/SlackNotificationService.js';
import crossPlatformLinkingService from '../../services/crossPlatformLinkingService.js';
import { ensureExportRequest } from '../../services/exportRequestService.js';
import SpotifyService from '../../services/spotifyService.js';
import { authMiddleware, requireAdmin } from '../../middleware/auth.js';
import {
  getWritingRolloutConfig,
  setWritingRolloutConfig
} from '../../services/writingRolloutService.js';

const router = express.Router();
const spotifyService = new SpotifyService();

const UPSERT_CONFIG_SQL = `
  INSERT INTO admin_system_config (config_key, config_value, updated_by, updated_at)
  VALUES (?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(config_key) DO UPDATE SET 
    config_value = excluded.config_value,
    updated_at = CURRENT_TIMESTAMP
`;

const MAX_SEARCH_EDITORIALS = 4;
const PASSWORD_RESET_LINK_BASE = process.env.PASSWORD_RESET_LINK_BASE || 'https://flowerpil.io/reset-password';
const PASSWORD_RESET_EXP_MINUTES = Number.parseInt(process.env.PASSWORD_RESET_EXP_MINUTES || '60', 10);
const TEST_EMAIL_PURPOSES = new Set(['signup', 'password_reset', 'referral']);
const EMAIL_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DEFAULT_PERFECT_SUNDAYS_CONFIG = {
  title: 'Perfect Sundays',
  description: '',
  playlist_ids: [],
  mega_playlist_links: {
    spotify: '',
    apple: '',
    tidal: ''
  },
  megaplaylist_title: 'megaplaylist',
  megaplaylist_image: '',
  default_curator_name: 'Perfect Sundays'
};

const ADMIN_EXPORT_DESTINATIONS = ['tidal', 'apple'];
const ADMIN_ACCOUNT_PREFERENCES = {
  tidal: { account_type: 'flowerpil', owner_curator_id: null },
  apple: { account_type: 'flowerpil', owner_curator_id: null }
};

const buildTestPasswordResetLink = (token) => {
  const separator = PASSWORD_RESET_LINK_BASE.includes('?') ? '&' : '?';
  return `${PASSWORD_RESET_LINK_BASE}${separator}token=${encodeURIComponent(token)}`;
};

// Ensure required tables/columns for playlist tags exist
function ensurePlaylistTagSchema(db) {
  // Create tables if not exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS custom_playlist_flags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#ffffff',
      text_color TEXT NOT NULL DEFAULT '#ffffff',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER,
      FOREIGN KEY (created_by) REFERENCES admin_users(id)
    );
    CREATE TABLE IF NOT EXISTS playlist_flag_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playlist_id INTEGER NOT NULL,
      flag_id INTEGER NOT NULL,
      assigned_by INTEGER,
      assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (playlist_id, flag_id),
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
      FOREIGN KEY (flag_id) REFERENCES custom_playlist_flags(id) ON DELETE CASCADE,
      FOREIGN KEY (assigned_by) REFERENCES admin_users(id)
    );
  `);

  // Backfill missing columns for older databases
  try {
    const columns = db.prepare(`PRAGMA table_info(custom_playlist_flags)`).all();
    const colNames = columns.map(c => c.name);
    if (!colNames.includes('text_color')) {
      db.prepare(`ALTER TABLE custom_playlist_flags ADD COLUMN text_color TEXT NOT NULL DEFAULT '#ffffff'`).run();
    }
    if (!colNames.includes('created_by')) {
      db.prepare(`ALTER TABLE custom_playlist_flags ADD COLUMN created_by INTEGER`).run();
    }
    if (!colNames.includes('created_at')) {
      db.prepare(`ALTER TABLE custom_playlist_flags ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`).run();
    }

    // Backfill playlist_flag_assignments columns
    const pfaCols = db.prepare(`PRAGMA table_info(playlist_flag_assignments)`).all();
    const pfaNames = pfaCols.map(c => c.name);
    if (!pfaNames.includes('assigned_at')) {
      db.prepare(`ALTER TABLE playlist_flag_assignments ADD COLUMN assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP`).run();
    }
    if (!pfaNames.includes('assigned_by')) {
      db.prepare(`ALTER TABLE playlist_flag_assignments ADD COLUMN assigned_by INTEGER`).run();
    }

    // Ensure uniqueness on (playlist_id, flag_id) to support ON CONFLICT
    try {
      // Remove duplicates, preserving the smallest id per (playlist_id, flag_id)
      db.prepare(`
        DELETE FROM playlist_flag_assignments
        WHERE id NOT IN (
          SELECT MIN(id) FROM playlist_flag_assignments GROUP BY playlist_id, flag_id
        )
      `).run();
    } catch {}
    try {
      db.prepare(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_pfa_playlist_flag_unique
        ON playlist_flag_assignments(playlist_id, flag_id)
      `).run();
    } catch {}
  } catch {}
}

function ensureSearchEditorialSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS search_editorials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      image_url TEXT,
      preset_query TEXT,
      target_url TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_search_editorials_active_sort
      ON search_editorials(active, sort_order ASC, updated_at DESC);
    CREATE TRIGGER IF NOT EXISTS trg_search_editorials_updated
    AFTER UPDATE ON search_editorials
    BEGIN
      UPDATE search_editorials
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = NEW.id;
    END;
  `);
  try {
    const columns = db.prepare(`PRAGMA table_info(search_editorials)`).all();
    if (!columns.some(col => col.name === 'target_url')) {
      db.prepare('ALTER TABLE search_editorials ADD COLUMN target_url TEXT').run();
    }
  } catch (error) {
    logger.error('ADMIN', 'Failed to ensure search_editorials.target_url column', error);
  }
}

const parsePerfectSundaysConfig = (row) => {
  if (!row?.config_value) return { ...DEFAULT_PERFECT_SUNDAYS_CONFIG };

  try {
    const parsed = JSON.parse(row.config_value);
    const playlistIds = Array.isArray(parsed.playlist_ids)
      ? parsed.playlist_ids
          .map((id) => Number.parseInt(id, 10))
          .filter((id) => Number.isFinite(id))
      : [];

    const megaplaylistTitle = typeof parsed?.megaplaylist_title === 'string'
      ? parsed.megaplaylist_title.trim() || DEFAULT_PERFECT_SUNDAYS_CONFIG.megaplaylist_title
      : DEFAULT_PERFECT_SUNDAYS_CONFIG.megaplaylist_title;
    const megaplaylistImage = typeof parsed?.megaplaylist_image === 'string'
      ? parsed.megaplaylist_image.trim()
      : DEFAULT_PERFECT_SUNDAYS_CONFIG.megaplaylist_image;

    return {
      ...DEFAULT_PERFECT_SUNDAYS_CONFIG,
      ...parsed,
      megaplaylist_title: megaplaylistTitle,
      megaplaylist_image: megaplaylistImage,
      playlist_ids: playlistIds,
      mega_playlist_links: {
        ...DEFAULT_PERFECT_SUNDAYS_CONFIG.mega_playlist_links,
        ...(parsed?.mega_playlist_links || {})
      }
    };
  } catch (error) {
    logger.warn('ADMIN', 'Failed to parse perfect_sundays_page config, using defaults', { error: error?.message });
    return { ...DEFAULT_PERFECT_SUNDAYS_CONFIG };
  }
};

const normalizeSpotifyPlaylistId = (value) => {
  if (!value) return null;
  const str = String(value).trim();
  if (!str) return null;
  const match = str.match(/playlist[/:]([a-zA-Z0-9]+)/);
  if (match?.[1]) return match[1];
  if (/^[a-zA-Z0-9]{10,}$/.test(str)) return str;
  return null;
};

const resolveSpotifyPlaylistId = (playlist = {}, db) => {
  try {
    const schedule = db.prepare(`
      SELECT wip_spotify_playlist_id
      FROM playlist_import_schedules
      WHERE playlist_id = ?
      LIMIT 1
    `).get(playlist.id);

    const candidates = [
      schedule?.wip_spotify_playlist_id,
      playlist?.spotify_url,
      playlist?.exported_spotify_url
    ];

    for (const candidate of candidates) {
      const parsed = normalizeSpotifyPlaylistId(candidate);
      if (parsed) return parsed;
    }
  } catch (error) {
    logger.warn('PERFECT_SUNDAYS_RECOVERY', 'Failed to resolve Spotify playlist id', {
      playlistId: playlist?.id,
      error: error?.message
    });
  }

  return null;
};

const resolveSpotifyToken = async (db) => {
  const now = new Date();

  try {
    const exportToken = db.prepare(`
      SELECT access_token, expires_at
      FROM export_oauth_tokens
      WHERE platform = 'spotify' AND is_active = 1
      ORDER BY COALESCE(expires_at, datetime('now')) DESC
      LIMIT 1
    `).get();

    if (exportToken?.access_token && (!exportToken.expires_at || new Date(exportToken.expires_at) > now)) {
      return { token: exportToken.access_token, source: 'export_oauth_tokens' };
    }
  } catch (error) {
    logger.warn('PERFECT_SUNDAYS_RECOVERY', 'Failed to read export_oauth_tokens', { error: error?.message });
  }

  try {
    const oauthToken = db.prepare(`
      SELECT access_token, expires_at
      FROM oauth_tokens
      WHERE platform = 'spotify'
      ORDER BY COALESCE(expires_at, datetime('now')) DESC
      LIMIT 1
    `).get();

    if (oauthToken?.access_token && (!oauthToken.expires_at || new Date(oauthToken.expires_at) > now)) {
      return { token: oauthToken.access_token, source: 'oauth_tokens' };
    }
  } catch (error) {
    logger.warn('PERFECT_SUNDAYS_RECOVERY', 'Failed to read oauth_tokens', { error: error?.message });
  }

  try {
    const clientToken = await spotifyService.getClientCredentialsToken();
    if (clientToken) {
      return { token: clientToken, source: 'client_credentials' };
    }
  } catch (error) {
    logger.warn('PERFECT_SUNDAYS_RECOVERY', 'Failed to fetch client credentials token', { error: error?.message });
  }

  return { token: null, source: null };
};

const fetchSpotifyTracksForPlaylist = async ({ spotifyId, db }) => {
  if (!spotifyId) {
    return { tracks: [], source: 'spotify', tokenSource: null, error: 'Missing Spotify playlist id' };
  }

  const attemptFetch = async (token, tokenSource) => {
    const details = await spotifyService.getPlaylistDetails(token, spotifyId);
    const rawTracks = Array.isArray(details?.tracks?.items) ? details.tracks.items : details?.tracks || [];
    const tracks = spotifyService.transformTracksForFlowerpil(rawTracks);
    const total = Array.isArray(details?.tracks?.items) ? details.tracks.items.length : tracks.length;
    return { tracks, meta: { total, snapshotId: details?.snapshot_id || null }, tokenSource };
  };

  let lastError = null;
  const primaryToken = await resolveSpotifyToken(db);

  if (primaryToken.token) {
    try {
      const result = await attemptFetch(primaryToken.token, primaryToken.source);
      return {
        tracks: result.tracks,
        source: 'spotify',
        tokenSource: result.tokenSource,
        meta: result.meta
      };
    } catch (error) {
      lastError = error;
      logger.warn('PERFECT_SUNDAYS_RECOVERY', 'Spotify fetch failed, attempting fallback', {
        spotifyId,
        tokenSource: primaryToken.source,
        error: error?.message
      });
    }
  }

  if (primaryToken.source !== 'client_credentials') {
    try {
      const fallbackToken = await spotifyService.getClientCredentialsToken();
      const result = await attemptFetch(fallbackToken, 'client_credentials');
      return {
        tracks: result.tracks,
        source: 'spotify',
        tokenSource: result.tokenSource,
        meta: result.meta
      };
    } catch (error) {
      lastError = error;
      logger.warn('PERFECT_SUNDAYS_RECOVERY', 'Spotify fallback fetch failed', {
        spotifyId,
        error: error?.message
      });
    }
  }

  return {
    tracks: [],
    source: 'spotify',
    tokenSource: primaryToken.source,
    error: lastError?.message || 'Unable to fetch from Spotify'
  };
};

const findLocalTrackFallback = (playlistId, playlist, queries, db) => {
  if (!playlist) return [];

  const urls = [playlist.spotify_url, playlist.exported_spotify_url].filter(Boolean);
  const seen = new Set();
  let bestTracks = [];

  for (const url of urls) {
    try {
      const matches = db.prepare(`
        SELECT id
        FROM playlists
        WHERE id != ?
          AND (
            (spotify_url IS NOT NULL AND spotify_url = ?)
            OR (exported_spotify_url IS NOT NULL AND exported_spotify_url = ?)
          )
        ORDER BY updated_at DESC
        LIMIT 5
      `).all(playlistId, url, url);

      for (const row of matches) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        const candidateTracks = queries.getTracksByPlaylistId.all(row.id) || [];
        if (candidateTracks.length > bestTracks.length) {
          bestTracks = candidateTracks;
        }
      }
    } catch (error) {
      logger.warn('PERFECT_SUNDAYS_RECOVERY', 'Failed to search for local track fallback', {
        playlistId,
        error: error?.message
      });
    }
  }

  return bestTracks;
};

const normalizeKeyPart = (value) => (value || '').toString().trim().toLowerCase();
const buildTrackKey = (track) => {
  if (!track) return null;
  if (track.spotify_id) {
    return `sp:${normalizeKeyPart(track.spotify_id)}`;
  }
  const title = normalizeKeyPart(track.title);
  const artist = normalizeKeyPart(track.artist);
  if (title && artist) {
    return `meta:${title}::${artist}`;
  }
  return null;
};

const appendTracksToPlaylist = (playlistId, tracks, queries, db, startPosition = 1, wrapTransaction = true) => {
  if (!Array.isArray(tracks) || tracks.length === 0) return 0;

  const run = () => {
    let pos = startPosition;
    for (const track of tracks) {
      const customSourcesJson = Array.isArray(track?.custom_sources)
        ? JSON.stringify(track.custom_sources)
        : track?.custom_sources || null;
      const linkingStatus = 'pending';

      queries.insertTrack.run(
        playlistId,
        pos++,
        track.title || '',
        track.artist || '',
        track.album || '',
        track.year || null,
        track.duration || '',
        track.spotify_id || null,
        track.apple_id || null,
        track.tidal_id || null,
        track.youtube_music_id || null,
        track.youtube_music_url || null,
        track.bandcamp_url || null,
        track.soundcloud_url || null,
        track.label || null,
        track.genre || null,
        track.artwork_url || null,
        track.album_artwork_url || null,
        track.isrc || null,
        track.explicit ? 1 : 0,
        track.popularity || null,
        track.preview_url || null,
        linkingStatus,
        customSourcesJson
      );
    }
  };

  if (wrapTransaction) {
    const tx = db.transaction(run);
    tx();
  } else {
    run();
  }

  return tracks.length;
};

const rewriteTracksForPlaylist = (playlistId, tracks, queries, db) => {
  if (!Array.isArray(tracks)) return 0;
  const tx = db.transaction(() => {
    queries.deleteTracksByPlaylistId.run(playlistId);
    appendTracksToPlaylist(playlistId, tracks, queries, db, 1, false);
  });
  tx();
  return tracks.length;
};

const normalizeTrackPositions = (playlistId, queries, db) => {
  const tracks = queries.getTracksByPlaylistId.all(playlistId) || [];
  if (tracks.length === 0) return 0;

  const sorted = [...tracks].sort((a, b) => {
    const posDiff = (a.position || 0) - (b.position || 0);
    if (posDiff !== 0) return posDiff;
    return (a.id || 0) - (b.id || 0);
  });

  const tx = db.transaction(() => {
    const stmt = db.prepare('UPDATE tracks SET position = ? WHERE id = ?');
    let position = 1;
    for (const track of sorted) {
      if (track?.id) {
        stmt.run(position, track.id);
      }
      position += 1;
    }
  });
  tx();

  return sorted.length;
};

const confirmPerfectSundaysTracks = async (playlistIds = []) => {
  const db = getDatabase();
  const queries = getQueries();

  const results = {
    total: playlistIds.length,
    success: [],
    failed: [],
    updated: 0,
    addedTracks: 0,
    details: [],
    stats: {
      actions: {},
      tokenSources: {},
      usedFallbacks: 0,
      sourceUnavailable: 0,
      linkingFailures: 0,
      exportFailures: 0,
      emptySources: 0
    }
  };

  for (const playlistId of playlistIds) {
    const detail = {
      playlistId,
      action: 'pending',
      existingCount: 0,
      sourceCount: 0,
      missingCount: 0,
      addedCount: 0
    };

    try {
      const playlist = queries.getPlaylistById.get(playlistId);
      if (!playlist) {
        detail.error = 'Playlist not found';
        results.failed.push({ playlistId, reason: detail.error });
        results.details.push(detail);
        results.stats.sourceUnavailable += 1;
        continue;
      }

      const existingTracks = queries.getTracksByPlaylistId.all(playlistId) || [];
      detail.existingCount = existingTracks.length;

      const spotifyId = resolveSpotifyPlaylistId(playlist, db);
      const spotifyResult = spotifyId
        ? await fetchSpotifyTracksForPlaylist({ spotifyId, db })
        : { tracks: [], source: null, tokenSource: null, meta: null };

      let sourceTracks = Array.isArray(spotifyResult.tracks) ? spotifyResult.tracks : [];
      detail.source = spotifyResult.source || (spotifyId ? 'spotify' : null);
      detail.tokenSource = spotifyResult.tokenSource || null;
      detail.sourceCount = sourceTracks.length;
      detail.spotifyId = spotifyId || null;

      if (!sourceTracks.length) {
        const fallbackTracks = findLocalTrackFallback(playlistId, playlist, queries, db);
        if (fallbackTracks.length) {
          const ordered = [...fallbackTracks].sort((a, b) => (a.position || 0) - (b.position || 0));
          sourceTracks = ordered.map((track) => ({ ...track }));
          detail.source = detail.source || 'flowerpil';
          detail.usedLocalFallback = true;
          detail.sourceCount = sourceTracks.length;
          results.stats.usedFallbacks += 1;
        }
      }

      if (!sourceTracks.length) {
        if (existingTracks.length === 0) {
          detail.error = 'No source tracks found and playlist is empty';
          results.failed.push({ playlistId, reason: detail.error });
          results.stats.emptySources += 1;
          results.stats.sourceUnavailable += 1;
        } else {
          detail.action = 'source_unavailable_existing_tracks_present';
          detail.warning = 'Source unavailable; left existing tracks untouched';
          results.success.push(playlistId);
        }
        results.details.push(detail);
        continue;
      }

      const existingKeys = new Set(existingTracks.map(buildTrackKey).filter(Boolean));
      const missingTracks = [];
      const seenMissing = new Set();

      for (const track of sourceTracks) {
        const key = buildTrackKey(track);
        if (!key) continue;
        if (!existingKeys.has(key) && !seenMissing.has(key)) {
          missingTracks.push(track);
          seenMissing.add(key);
        }
      }

      detail.missingCount = missingTracks.length;

      if (existingTracks.length === 0) {
        detail.action = 'imported_all';
        detail.addedCount = rewriteTracksForPlaylist(playlistId, sourceTracks, queries, db);
      } else if (missingTracks.length > 0) {
        const startPosition = existingTracks.reduce((max, track) => Math.max(max, Number(track.position) || 0), 0) + 1;
        detail.action = 'appended_missing';
        detail.addedCount = appendTracksToPlaylist(playlistId, missingTracks, queries, db, startPosition);
        normalizeTrackPositions(playlistId, queries, db);
      } else {
        detail.action = 'in_sync';
      }

      const changed = detail.addedCount > 0;

      if (changed) {
        try {
          await crossPlatformLinkingService.startPlaylistLinking(playlistId, { forceRefresh: true });
          detail.linked = true;
        } catch (linkError) {
          detail.linkingError = linkError?.message;
          results.stats.linkingFailures += 1;
          logger.warn('PERFECT_SUNDAYS_RECOVERY', 'Failed to start cross-linking after track recovery', {
            playlistId,
            error: linkError?.message
          });
        }

        try {
          ensureExportRequest({
            playlistId,
            destinations: ADMIN_EXPORT_DESTINATIONS,
            requestedBy: 'system',
            resetProgress: true,
            accountPreferences: ADMIN_ACCOUNT_PREFERENCES,
            curatorId: playlist.curator_id
          });
          detail.exportsQueued = true;
        } catch (exportError) {
          detail.exportError = exportError?.message;
          results.stats.exportFailures += 1;
          logger.warn('PERFECT_SUNDAYS_RECOVERY', 'Failed to queue exports after track recovery', {
            playlistId,
            error: exportError?.message
          });
        }
      }

      results.success.push(playlistId);
      if (changed) results.updated += 1;
      results.addedTracks += detail.addedCount || 0;
      results.details.push(detail);

      const actionKey = detail.action || 'unknown';
      results.stats.actions[actionKey] = (results.stats.actions[actionKey] || 0) + 1;
      const tokenKey = detail.tokenSource || 'unknown';
      results.stats.tokenSources[tokenKey] = (results.stats.tokenSources[tokenKey] || 0) + 1;
    } catch (error) {
      detail.error = error?.message || 'Unknown error';
      results.failed.push({ playlistId, reason: detail.error });
      results.details.push(detail);
      results.stats.sourceUnavailable += 1;
    }
  }

  results.message = `Processed ${results.total} playlist(s); ${results.updated} updated, ${results.failed.length} failed, ${results.addedTracks} track(s) added`;
  results.stats.total = results.total;
  results.stats.updated = results.updated;
  results.stats.addedTracks = results.addedTracks;
  results.stats.failed = results.failed.length;
  return results;
};

router.post('/test-email', async (req, res) => {
  let normalizedPurpose = '';
  let targetEmail = '';

  try {
    const { purpose, emailOverride } = req.body || {};
    normalizedPurpose = typeof purpose === 'string' ? purpose.trim().toLowerCase() : '';

    if (!TEST_EMAIL_PURPOSES.has(normalizedPurpose)) {
      return res.status(400).json({
        error: 'Invalid purpose',
        message: 'Purpose must be one of signup, password_reset, or referral',
        allowedPurposes: Array.from(TEST_EMAIL_PURPOSES)
      });
    }

    const fallbackEmail = (req.user?.email || req.user?.username || '').trim();
    const override = typeof emailOverride === 'string' ? emailOverride.trim() : '';
    targetEmail = override || fallbackEmail;

    if (!targetEmail) {
      return res.status(400).json({
        error: 'Missing email',
        message: 'Provide emailOverride when your account is not associated with an email address'
      });
    }

    if (!EMAIL_ADDRESS_PATTERN.test(targetEmail)) {
      return res.status(400).json({
        error: 'Invalid email',
        message: 'Provide a valid email address for testing'
      });
    }

    let sendResult = null;
    let responseDetails = {};

    if (normalizedPurpose === 'signup') {
      const confirmationCode = generateVerificationCode();
      sendResult = await sendSignupConfirmationEmail({
        email: targetEmail,
        confirmationCode
      });
      responseDetails = { confirmationCode };
    } else if (normalizedPurpose === 'password_reset') {
      const token = crypto.randomBytes(32).toString('hex');
      const resetLink = buildTestPasswordResetLink(token);
      sendResult = await sendPasswordResetEmail({
        email: targetEmail,
        resetLink,
        expiresMinutes: PASSWORD_RESET_EXP_MINUTES
      });
      responseDetails = { expiresMinutes: PASSWORD_RESET_EXP_MINUTES };
    } else if (normalizedPurpose === 'referral') {
      const referralCode = `REF-${generateVerificationCode()}`;
      sendResult = await sendReferralSubmissionEmail({
        email: targetEmail,
        referralCode,
        issuerName: 'Flowerpil Site Admin'
      });
      responseDetails = { referralCode };
    }

    const mockMode = sendResult?.messageId === 'mock-message';

    await logSecurityEvent(SECURITY_EVENTS.ADMIN_ACTION, {
      ip: req.ip,
      userId: req.user?.id,
      username: req.user?.username,
      endpoint: '/api/v1/admin/site-admin/test-email',
      details: {
        action: 'test_email_send',
        purpose: normalizedPurpose,
        targetEmail,
        mockMode
      }
    });

    res.json({
      success: true,
      purpose: normalizedPurpose,
      recipient: targetEmail,
      messageId: sendResult?.messageId || null,
      mockMode,
      details: responseDetails
    });
  } catch (error) {
    logger.error('SITE_ADMIN_TEST_EMAIL', 'Failed to send test email', error);

    try {
      await logSecurityEvent(SECURITY_EVENTS.ADMIN_ACTION, {
        ip: req.ip,
        userId: req.user?.id,
        username: req.user?.username,
        endpoint: '/api/v1/admin/site-admin/test-email',
        details: {
          action: 'test_email_send_failed',
          purpose: normalizedPurpose || req.body?.purpose,
          targetEmail,
          error: error?.message || String(error)
        }
      });
    } catch (logError) {
      logger.error('SITE_ADMIN_TEST_EMAIL', 'Failed to log security event', logError);
    }

    res.status(500).json({
      error: 'Failed to send test email',
      message: 'Unable to dispatch test email - see server logs for details'
    });
  }
});

// POST /api/v1/admin/site-admin/test-slack-notification
// Test individual Slack notification types
router.post('/test-slack-notification', async (req, res) => {
  try {
    const { notificationType } = req.body;

    const validTypes = ['spotify_access_request', 'apple_export_success', 'apple_resolution_failed', 'system_alert', 'error_report'];

    if (!notificationType || !validTypes.includes(notificationType)) {
      return res.status(400).json({
        error: 'Invalid notification type',
        message: `Must be one of: ${validTypes.join(', ')}`,
        validTypes
      });
    }

    let result;
    let testData = {};

    switch (notificationType) {
      case 'spotify_access_request':
        testData = {
          curatorName: 'Test Curator',
          curatorEmail: 'test@example.com',
          spotifyEmail: 'test.spotify@example.com',
          curatorId: 999
        };
        result = await slackService.notifySpotifyAccessRequest(testData);
        break;

      case 'apple_export_success':
        testData = {
          playlistId: 'test-playlist-123',
          playlistTitle: 'Test Playlist',
          curatorName: 'Test Curator',
          appleLibraryId: 'p.test123',
          storefront: 'us'
        };
        result = await slackService.notifyAppleExportSuccess(testData);
        break;

      case 'apple_resolution_failed':
        testData = {
          playlistId: 'test-playlist-123',
          playlistTitle: 'Test Playlist',
          attempts: 3,
          error: 'Test error message'
        };
        result = await slackService.notifyAppleResolutionFailed(testData);
        break;

      case 'system_alert':
        testData = {
          severity: 'warning',
          text: 'Test system alert notification'
        };
        result = await slackService.notifySystemAlert(testData);
        break;

      case 'error_report':
        testData = {
          curatorName: 'Test Curator',
          curatorEmail: 'test@example.com',
          curatorId: 999,
          errorLocation: '/api/v1/playlists',
          errorMessage: 'Test error occurred during playlist export',
          cause: 'External API timeout - Spotify API took longer than 30 seconds to respond',
          timestamp: new Date()
        };
        result = await slackService.notifyErrorReport(testData);
        break;

      default:
        return res.status(400).json({
          error: 'Unsupported notification type',
          notificationType
        });
    }

    await logSecurityEvent(SECURITY_EVENTS.ADMIN_ACTION, {
      ip: req.ip,
      userId: req.user?.id,
      username: req.user?.username,
      endpoint: '/api/v1/admin/site-admin/test-slack-notification',
      details: {
        action: 'test_slack_notification',
        notificationType,
        testData
      }
    });

    res.json({
      success: true,
      notificationType,
      testData,
      result: result ? {
        ok: result.ok,
        ts: result.ts,
        channel: result.channel,
        message: result.message
      } : null,
      message: result ? 'Test notification sent successfully' : 'Notification method returned null (may not be configured)'
    });
  } catch (error) {
    logger.error('SITE_ADMIN_TEST_SLACK', 'Failed to send test Slack notification', error);

    try {
      await logSecurityEvent(SECURITY_EVENTS.ADMIN_ACTION, {
        ip: req.ip,
        userId: req.user?.id,
        username: req.user?.username,
        endpoint: '/api/v1/admin/site-admin/test-slack-notification',
        details: {
          action: 'test_slack_notification_failed',
          notificationType: req.body?.notificationType,
          error: error?.message || String(error)
        }
      });
    } catch (logError) {
      logger.error('SITE_ADMIN_TEST_SLACK', 'Failed to log security event', logError);
    }

    const errorMessage = error?.message || 'Unable to dispatch test notification - see server logs for details';
    
    res.status(500).json({
      error: 'Failed to send test Slack notification',
      message: errorMessage,
      details: error?.details || null,
      // Provide helpful context for common issues
      troubleshooting: errorMessage.includes('not configured') ? {
        hint: 'You need to install the Slack app to your workspace and get a Bot User OAuth Token',
        steps: [
          '1. Go to https://api.slack.com/apps',
          '2. Select your app',
          '3. Go to OAuth & Permissions',
          '4. Install app to workspace',
          '5. Copy the Bot User OAuth Token (starts with xoxb-)',
          '6. Set SPOTIFY_BOT_SLACK_ACCESS_TOKEN in environment'
        ]
      } : null
    });
  }
});

// POST /api/v1/admin/site-admin/cross-link-dry-run
router.post('/cross-link-dry-run', async (req, res) => {
  const rawBody = req.body || {};
  const artist = typeof rawBody.artist === 'string' ? rawBody.artist.trim() : '';
  const title = typeof rawBody.title === 'string' ? rawBody.title.trim() : '';
  const album = typeof rawBody.album === 'string' ? rawBody.album.trim() : '';
  const isrc = typeof rawBody.isrc === 'string' ? rawBody.isrc.trim() : '';
  const durationValue = rawBody.duration_ms ?? rawBody.duration;
  const parsedDuration = Number.parseInt(durationValue, 10);

  if (!isrc && !(artist && title)) {
    return res.status(400).json({
      error: 'Invalid track data',
      message: 'Provide artist + title or ISRC'
    });
  }

  const payload = {
    artist,
    title,
    album: album || null,
    isrc: isrc || null
  };

  if (Number.isFinite(parsedDuration) && parsedDuration > 0) {
    payload.duration_ms = parsedDuration;
  }

  try {
    const result = await crossPlatformLinkingService.dryRunLinkTrack(payload);

    await logSecurityEvent(SECURITY_EVENTS.ADMIN_ACTION, {
      ip: req.ip,
      userId: req.user?.id,
      username: req.user?.username,
      endpoint: '/api/v1/admin/site-admin/cross-link-dry-run',
      details: {
        action: 'cross_link_dry_run',
        query: payload,
        hasLinks: result.hasLinks,
        durationMs: result.durationMs
      }
    });

    res.json({
      success: true,
      result
    });
  } catch (error) {
    logger.error('SITE_ADMIN_DRY_RUN', 'Dry run cross-linker failed', error);

    try {
      await logSecurityEvent(SECURITY_EVENTS.ADMIN_ACTION, {
        ip: req.ip,
        userId: req.user?.id,
        username: req.user?.username,
        endpoint: '/api/v1/admin/site-admin/cross-link-dry-run',
        details: {
          action: 'cross_link_dry_run_failed',
          query: payload,
          error: error?.message || String(error)
        }
      });
    } catch (logError) {
      logger.error('SITE_ADMIN_DRY_RUN', 'Failed to log security event', logError);
    }

    res.status(500).json({
      error: 'Failed to run dry run',
      message: error?.message || 'Unable to perform dry run - see server logs for details'
    });
  }
});

// Get all curator types with their current colors
router.get('/curator-types', async (req, res) => {
  try {
    const db = getDatabase();
    
    // Get all curator type configs (both predefined and custom)
    const configQuery = `
      SELECT config_key, config_value 
      FROM admin_system_config 
      WHERE config_key LIKE 'curator_type_%'
    `;
    
    const configs = db.prepare(configQuery).all();
    const types = {};
    const colors = {};
    
    // Process config entries
    configs.forEach(config => {
      if (config.config_key.startsWith('curator_type_color_')) {
        const typeId = config.config_key.replace('curator_type_color_', '');
        colors[typeId] = config.config_value;
      } else if (config.config_key.startsWith('curator_type_')) {
        const typeId = config.config_key.replace('curator_type_', '');
        types[typeId] = config.config_value;
      }
    });
    
    // Default curator types (predefined)
    const defaultTypes = [
      { id: 'curator', label: 'Curator' },
      { id: 'label', label: 'Label' },
      { id: 'label-ar', label: 'Label A&R' },
      { id: 'artist-manager', label: 'Artist Manager' },
      { id: 'musician', label: 'Musician' },
      { id: 'dj', label: 'DJ' },
      { id: 'magazine', label: 'Magazine' },
      { id: 'blog', label: 'Blog' },
      { id: 'podcast', label: 'Podcast' },
      { id: 'venue', label: 'Venue' },
      { id: 'radio-station', label: 'Radio Station' },
      { id: 'producer', label: 'Producer' }
    ];
    
    // Combine default types with custom types
    const allTypes = [...defaultTypes];
    
    // Add custom types that aren't in defaults
    Object.entries(types).forEach(([id, label]) => {
      if (!defaultTypes.find(type => type.id === id)) {
        allTypes.push({ id, label, custom: true });
      }
    });
    
    res.json({ types: allTypes, colors });
  } catch (error) {
    logger.error('API_ERROR', 'Error fetching curator types', error);
    res.status(500).json({ error: 'Failed to fetch curator types' });
  }
});

router.get('/bio-handles', async (req, res) => {
  try {
    const db = getDatabase();

    const profiles = db.prepare(`
      SELECT bp.id, bp.handle, bp.curator_id, bp.is_published, bp.updated_at,
             bp.last_handle_change_at, c.name AS curator_name
      FROM bio_profiles bp
      LEFT JOIN curators c ON bp.curator_id = c.id
      ORDER BY LOWER(bp.handle)
    `).all();

    const reservations = db.prepare(`
      SELECT id, handle, reserved_for, status, reason, reserved_at,
             expires_at, assigned_at, notes
      FROM bio_handle_reservations
      ORDER BY LOWER(handle)
    `).all();

    const profileData = profiles.map((profile) => {
      let nextHandleChangeAt = null;
      if (profile.last_handle_change_at) {
        const lastChange = new Date(profile.last_handle_change_at);
        if (!Number.isNaN(lastChange.getTime())) {
          nextHandleChangeAt = new Date(lastChange.getTime() + 24 * 60 * 60 * 1000).toISOString();
        }
      }

      return {
        ...profile,
        is_published: Boolean(profile.is_published),
        next_handle_change_at: nextHandleChangeAt
      };
    });

    res.json({
      profiles: profileData,
      reservations
    });
  } catch (error) {
    logger.error('API_ERROR', 'Error fetching bio handles', error);
    res.status(500).json({ error: 'Failed to fetch bio handles' });
  }
});

// Delete bio handle/profile
router.delete('/bio-handles/:id', async (req, res) => {
  try {
    const db = getDatabase();
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Bio profile ID is required' });
    }

    // Get the profile details before deleting for logging
    const profile = db.prepare('SELECT id, handle, curator_id FROM bio_profiles WHERE id = ?').get(id);

    if (!profile) {
      return res.status(404).json({ error: 'Bio profile not found' });
    }

    // Delete the bio profile (CASCADE will handle related records)
    const deleteQuery = 'DELETE FROM bio_profiles WHERE id = ?';
    const result = db.prepare(deleteQuery).run(id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Bio profile not found' });
    }

    logger.info('ADMIN', 'Deleted bio profile', { handle: profile.handle, id: profile.id });

    res.json({
      success: true,
      deleted: {
        id: profile.id,
        handle: profile.handle
      }
    });
  } catch (error) {
    logger.error('API_ERROR', 'Error deleting bio handle', error);
    res.status(500).json({ error: 'Failed to delete bio handle' });
  }
});

// Update curator type color
router.post('/curator-type-color', async (req, res) => {
  try {
    const db = getDatabase();
    const { typeId, color } = req.body;
    
    if (!typeId || !color) {
      return res.status(400).json({ error: 'Type ID and color are required' });
    }
    
    const configKey = `curator_type_color_${typeId}`;
    db.prepare(UPSERT_CONFIG_SQL).run(configKey, color, req.user?.id || null);

    res.json({ success: true });
  } catch (error) {
    logger.error('API_ERROR', 'Error updating curator type color', error);
    res.status(500).json({ error: 'Failed to update curator type color' });
  }
});

// Add new curator type
router.post('/curator-types', async (req, res) => {
  try {
    const db = getDatabase();
    const { id, label, color = '#ffffff' } = req.body;
    
    if (!id?.trim() || !label?.trim()) {
      return res.status(400).json({ error: 'Type ID and label are required' });
    }
    
    // Store the curator type definition in admin config
    const typeConfigKey = `curator_type_${id}`;
    const colorConfigKey = `curator_type_color_${id}`;
    
    db.prepare(UPSERT_CONFIG_SQL).run(typeConfigKey, label, req.user?.id || null);
    db.prepare(UPSERT_CONFIG_SQL).run(colorConfigKey, color, req.user?.id || null);

    res.json({ success: true, curatorType: { id, label, color } });
  } catch (error) {
    logger.error('API_ERROR', 'Error adding curator type', error);
    res.status(500).json({ error: 'Failed to add curator type' });
  }
});

router.get('/search-editorials', async (req, res) => {
  try {
    const db = getDatabase();
    ensureSearchEditorialSchema(db);
    const items = db.prepare(`
      SELECT id, title, description, image_url, preset_query, target_url, sort_order, active
      FROM search_editorials
      WHERE active = 1
      ORDER BY sort_order ASC, updated_at DESC
    `).all();
    res.json({ items });
  } catch (error) {
    logger.error('API_ERROR', 'Error loading search editorials', error);
    res.status(500).json({ error: 'Failed to load search editorials' });
  }
});

router.post('/search-editorials', async (req, res) => {
  try {
    const db = getDatabase();
    ensureSearchEditorialSchema(db);

    const payload = Array.isArray(req.body?.items) ? req.body.items.slice(0, MAX_SEARCH_EDITORIALS) : null;
    if (!payload) {
      return res.status(400).json({ error: 'items array is required' });
    }

    if (payload.length > MAX_SEARCH_EDITORIALS) {
      return res.status(400).json({ error: `Limit ${MAX_SEARCH_EDITORIALS} entries` });
    }

    const normalizedItems = [];
    for (let index = 0; index < payload.length; index += 1) {
      const item = payload[index] ?? {};
      const title = String(item.title ?? '').trim();
      if (!title) {
        return res.status(400).json({ error: `Card ${index + 1} is missing a title` });
      }

      const descriptionRaw = item.description ?? '';
      const description = descriptionRaw === null || descriptionRaw === undefined
        ? null
        : String(descriptionRaw).trim();

      const imageUrlRaw = item.image_url ?? item.imageUrl ?? '';
      const image_url = imageUrlRaw ? String(imageUrlRaw).trim() : null;

      const presetRaw = item.preset_query ?? item.presetQuery ?? '';
      const preset_query = presetRaw ? String(presetRaw).trim() : null;

      const targetRaw = item.target_url ?? item.targetUrl ?? '';
      const target_url = targetRaw ? String(targetRaw).trim() : null;

      normalizedItems.push({
        id: item.id ?? null,
        title,
        description: description?.length ? description : null,
        image_url: image_url && image_url.length ? image_url : null,
        preset_query: preset_query && preset_query.length ? preset_query : null,
        target_url: target_url && target_url.length ? target_url : null,
        sort_order: index
      });
    }

    const updateStmt = db.prepare(`
      UPDATE search_editorials
      SET title = ?, description = ?, image_url = ?, preset_query = ?, target_url = ?, sort_order = ?, active = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    const insertStmt = db.prepare(`
      INSERT INTO search_editorials (title, description, image_url, preset_query, target_url, sort_order, active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `);

    const transaction = db.transaction(() => {
      db.prepare('UPDATE search_editorials SET active = 0').run();
      normalizedItems.forEach((item) => {
        if (item.id) {
          const result = updateStmt.run(
            item.title,
            item.description,
            item.image_url,
            item.preset_query,
            item.target_url,
            item.sort_order,
            item.id
          );
          if (result.changes === 0) {
            const insertResult = insertStmt.run(
              item.title,
              item.description,
              item.image_url,
              item.preset_query,
              item.target_url,
              item.sort_order
            );
            item.id = insertResult.lastInsertRowid;
          }
        } else {
          const insertResult = insertStmt.run(
            item.title,
            item.description,
            item.image_url,
            item.preset_query,
            item.target_url,
            item.sort_order
          );
          item.id = insertResult.lastInsertRowid;
        }
      });
    });

    transaction();

    const items = db.prepare(`
      SELECT id, title, description, image_url, preset_query, target_url, sort_order, active
      FROM search_editorials
      WHERE active = 1
      ORDER BY sort_order ASC, updated_at DESC
    `).all();

    res.json({ items });
  } catch (error) {
    logger.error('API_ERROR', 'Error saving search editorials', error);
    res.status(500).json({ error: error.message || 'Failed to save search editorials' });
  }
});

// Update curator type
router.put('/curator-types/:id', async (req, res) => {
  try {
    const db = getDatabase();
    const { id } = req.params;
    const { label, color } = req.body;
    
    if (!label?.trim()) {
      return res.status(400).json({ error: 'Label is required' });
    }
    
    const typeConfigKey = `curator_type_${id}`;
    const colorConfigKey = `curator_type_color_${id}`;
    
    db.prepare(UPSERT_CONFIG_SQL).run(typeConfigKey, label, req.user?.id || null);
    if (color) {
      db.prepare(UPSERT_CONFIG_SQL).run(colorConfigKey, color, req.user?.id || null);
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('API_ERROR', 'Error updating curator type', error);
    res.status(500).json({ error: 'Failed to update curator type' });
  }
});

// Genre Category Management
router.get('/genre-categories', async (req, res) => {
  try {
    const db = getDatabase();
    const { list } = getGenreCategoryConfig(db);
    res.json({ categories: list });
  } catch (error) {
    logger.error('API_ERROR', 'Error fetching genre categories', error);
    res.status(500).json({ error: 'Failed to fetch genre categories' });
  }
});

router.post('/genre-categories', async (req, res) => {
  try {
    const db = getDatabase();
    const { id: providedId, label: providedLabel, color: providedColor } = req.body || {};

    const resolvedLabel = formatGenreLabel(providedLabel || providedId || '');
    const resolvedId = slugifyGenreId(providedId || providedLabel || '');

    if (!resolvedId || !resolvedLabel) {
      return res.status(400).json({ error: 'Genre id or label is required' });
    }

    const { list } = getGenreCategoryConfig(db);
    if (list.some(category => category.id === resolvedId)) {
      return res.status(409).json({ error: `Genre category "${resolvedId}" already exists` });
    }

    const existingColors = list.map(category => category.color).filter(Boolean);
    const color = normalizeHex(providedColor) || generateGenreColor(existingColors, resolvedId);

    db.prepare(UPSERT_CONFIG_SQL).run(`genre_category_${resolvedId}`, resolvedLabel, req.user?.id || null);
    db.prepare(UPSERT_CONFIG_SQL).run(`genre_category_color_${resolvedId}`, color, req.user?.id || null);

    res.json({ success: true, category: { id: resolvedId, label: resolvedLabel, color } });
  } catch (error) {
    logger.error('API_ERROR', 'Error adding genre category', error);
    res.status(500).json({ error: 'Failed to add genre category' });
  }
});

router.post('/genre-categories/bulk', async (req, res) => {
  try {
    const db = getDatabase();
    const { text } = req.body || {};
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Bulk import text is required' });
    }

    const lines = text
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      return res.status(400).json({ error: 'No genre names found in input' });
    }

    const dbData = getGenreCategoryConfig(db);
    const existingIds = new Set(dbData.list.map(category => category.id));
    const accepted = [];
    const skipped = [];
    const colors = dbData.list.map(category => category.color).filter(Boolean);

    const transaction = db.transaction((entries) => {
      entries.forEach((entry) => {
        const { id, label } = entry;
        const color = generateGenreColor(colors, id);
        colors.push(color);
        db.prepare(UPSERT_CONFIG_SQL).run(`genre_category_${id}`, label, req.user?.id || null);
        db.prepare(UPSERT_CONFIG_SQL).run(`genre_category_color_${id}`, color, req.user?.id || null);
      });
    });

    lines.forEach((raw) => {
      const id = slugifyGenreId(raw);
      const label = formatGenreLabel(raw);

      if (!id || !label) {
        skipped.push({ value: raw, reason: 'empty after normalization' });
        return;
      }

      if (existingIds.has(id) || accepted.some(entry => entry.id === id)) {
        skipped.push({ value: raw, reason: 'duplicate id' });
        return;
      }

      accepted.push({ id, label });
      existingIds.add(id);
    });

    if (accepted.length > 0) {
      transaction(accepted);
    }

    res.json({
      success: true,
      added: accepted,
      skipped
    });
  } catch (error) {
    logger.error('API_ERROR', 'Error bulk adding genre categories', error);
    res.status(500).json({ error: 'Failed to bulk add genre categories' });
  }
});

router.put('/genre-categories/:id', async (req, res) => {
  try {
    const db = getDatabase();
    const { id } = req.params;
    const { label, color } = req.body || {};

    if (!label && !color) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    if (label) {
      const normalizedLabel = formatGenreLabel(label);
      if (!normalizedLabel) {
        return res.status(400).json({ error: 'Label cannot be empty' });
      }
      db.prepare(UPSERT_CONFIG_SQL).run(`genre_category_${id}`, normalizedLabel, req.user?.id || null);
    }

    if (color) {
      db.prepare(UPSERT_CONFIG_SQL).run(`genre_category_color_${id}`, normalizeHex(color), req.user?.id || null);
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('API_ERROR', 'Error updating genre category', error);
    res.status(500).json({ error: 'Failed to update genre category' });
  }
});

router.delete('/genre-categories/:id', async (req, res) => {
  try {
    const db = getDatabase();
    const { id } = req.params;

    const deleteQuery = `DELETE FROM admin_system_config WHERE config_key IN (?, ?)`;
    db.prepare(deleteQuery).run(`genre_category_${id}`, `genre_category_color_${id}`);

    res.json({ success: true });
  } catch (error) {
    logger.error('API_ERROR', 'Error deleting genre category', error);
    res.status(500).json({ error: 'Failed to delete genre category' });
  }
});

// Delete curator type
router.delete('/curator-types/:id', async (req, res) => {
  try {
    const db = getDatabase();
    const { id } = req.params;
    
    // Check if this type is being used by any curators
    const usageQuery = `SELECT COUNT(*) as count FROM playlists WHERE curator_type = ?`;
    const usageCount = db.prepare(usageQuery).get(id);
    
    if (usageCount.count > 0) {
      return res.status(400).json({ 
        error: `Cannot delete curator type "${id}" - it is used by ${usageCount.count} playlist(s)` 
      });
    }
    
    // Delete the curator type and color config
    const deleteQuery = `DELETE FROM admin_system_config WHERE config_key IN (?, ?)`;
    db.prepare(deleteQuery).run(`curator_type_${id}`, `curator_type_color_${id}`);

    res.json({ success: true });
  } catch (error) {
    logger.error('API_ERROR', 'Error deleting curator type', error);
    res.status(500).json({ error: 'Failed to delete curator type' });
  }
});

// Get latest page order
router.get('/latest-page-order', async (req, res) => {
  try {
    const db = getDatabase();
    // Get current order from playlists table, ordered by sort_order
    const query = `
      SELECT id, title, sort_order
      FROM playlists
      WHERE published = 1
      ORDER BY sort_order ASC, created_at DESC
      LIMIT 20
    `;
    
    const items = db.prepare(query).all();

    res.json({ order: items });
  } catch (error) {
    logger.error('API_ERROR', 'Error fetching latest page order', error);
    res.status(500).json({ error: 'Failed to fetch latest page order' });
  }
});

// Update latest page order
router.post('/latest-page-order', async (req, res) => {
  try {
    const db = getDatabase();
    const { order } = req.body;
    
    if (!Array.isArray(order)) {
      return res.status(400).json({ error: 'Order must be an array' });
    }
    
    // Update sort_order for each item
    const updateQuery = `UPDATE playlists SET sort_order = ? WHERE id = ?`;
    const stmt = db.prepare(updateQuery);
    
    db.transaction(() => {
      order.forEach((item, index) => {
        stmt.run(index + 1, item.id);
      });
    })();

    res.json({ success: true });
  } catch (error) {
    logger.error('API_ERROR', 'Error updating latest page order', error);
    res.status(500).json({ error: 'Failed to update latest page order' });
  }
});

// Reset latest page order to default (by publish date)
router.post('/latest-page-order/reset', async (req, res) => {
  try {
    const db = getDatabase();
    
    // Reset all sort_order values to 0 to trigger default ordering by publish_date
    const resetQuery = `UPDATE playlists SET sort_order = 0 WHERE published = 1`;
    db.prepare(resetQuery).run();

    res.json({ success: true, message: 'Order reset to default (by publish date)' });
  } catch (error) {
    logger.error('API_ERROR', 'Error resetting latest page order', error);
    res.status(500).json({ error: 'Failed to reset latest page order' });
  }
});

// Get custom flags
router.get('/custom-flags', async (req, res) => {
  try {
    const db = getDatabase();
    ensurePlaylistTagSchema(db);
    // Check if custom_flags table exists, if not return empty array
    const tableExistsQuery = `
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='custom_playlist_flags'
    `;
    
    const tableExists = db.prepare(tableExistsQuery).get();
    
    if (!tableExists) {
      // Already created above by ensurePlaylistTagSchema
    } else {
      // Column backfill handled by ensurePlaylistTagSchema
    }
    
    const query = `SELECT * FROM custom_playlist_flags ORDER BY created_at DESC`;
    const flags = db.prepare(query).all();

    res.json({ flags });
  } catch (error) {
    logger.error('API_ERROR', 'Error fetching playlist tags', error);
    res.status(500).json({ error: 'Failed to fetch playlist tags' });
  }
});

// Create custom flag (content tag)
router.post('/custom-flags', async (req, res) => {
  try {
    const db = getDatabase();
    ensurePlaylistTagSchema(db);
    const { text, color, textColor, description, allow_self_assign } = req.body;

    if (!text?.trim()) {
      return res.status(400).json({ error: 'Flag text is required' });
    }

    // Generate unique slug
    const { generateUniqueSlug } = await import('../../utils/slugify.js');
    const urlSlug = generateUniqueSlug(text);

    const insertQuery = `
      INSERT INTO custom_playlist_flags (
        text, color, text_color, description, allow_self_assign, url_slug,
        created_by, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;

    const result = db.prepare(insertQuery).run(
      text.trim(),
      color || '#ffffff',
      textColor || '#ffffff',
      description?.trim() || null,
      allow_self_assign ? 1 : 0,
      urlSlug,
      req.user?.id || null
    );

    const newFlag = {
      id: result.lastInsertRowid,
      text: text.trim(),
      color: color || '#ffffff',
      text_color: textColor || '#ffffff',
      description: description?.trim() || null,
      allow_self_assign: allow_self_assign ? 1 : 0,
      url_slug: urlSlug,
      created_at: new Date().toISOString()
    };

    res.json(newFlag);
  } catch (error) {
    logger.error('API_ERROR', 'Error creating playlist tag', error);
    res.status(500).json({ error: 'Failed to create playlist tag' });
  }
});

// Update custom flag (content tag)
router.put('/custom-flags/:id', async (req, res) => {
  try {
    const db = getDatabase();
    ensurePlaylistTagSchema(db);
    const { id } = req.params;
    const { text, color, textColor, description, allow_self_assign } = req.body;

    const existing = db.prepare('SELECT * FROM custom_playlist_flags WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Tag not found' });

    const newText = (text ?? existing.text).trim();
    if (!newText) return res.status(400).json({ error: 'Tag text is required' });

    // Regenerate slug only if text changed
    let newSlug = existing.url_slug;
    if (text && text.trim() !== existing.text) {
      const { generateUniqueSlug } = await import('../../utils/slugify.js');
      newSlug = generateUniqueSlug(text, parseInt(id));
    }

    const update = db.prepare(`
      UPDATE custom_playlist_flags
      SET text = ?, color = ?, text_color = ?, description = ?,
          allow_self_assign = ?, url_slug = ?
      WHERE id = ?
    `);

    update.run(
      newText,
      color ?? existing.color,
      textColor ?? existing.text_color,
      description !== undefined ? (description?.trim() || null) : existing.description,
      allow_self_assign !== undefined ? (allow_self_assign ? 1 : 0) : existing.allow_self_assign,
      newSlug,
      id
    );

    const updated = db.prepare('SELECT * FROM custom_playlist_flags WHERE id = ?').get(id);
    res.json({ success: true, tag: updated });
  } catch (error) {
    logger.error('API_ERROR', 'Error updating playlist tag', error);
    res.status(500).json({ error: 'Failed to update playlist tag' });
  }
});

// Delete custom flag
router.delete('/custom-flags/:id', async (req, res) => {
  try {
    const db = getDatabase();
    ensurePlaylistTagSchema(db);
    const { id } = req.params;
    
    const deleteQuery = `DELETE FROM custom_playlist_flags WHERE id = ?`;
    const result = db.prepare(deleteQuery).run(id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Flag not found' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('API_ERROR', 'Error deleting playlist tag', error);
    res.status(500).json({ error: 'Failed to delete playlist tag' });
  }
});

// Get playlist flag assignments
router.get('/playlist-flags/:playlistId', async (req, res) => {
  try {
    const db = getDatabase();
    ensurePlaylistTagSchema(db);
    const { playlistId } = req.params;
    
    const query = `
      SELECT pfa.*, cpf.text, cpf.color, cpf.text_color 
      FROM playlist_flag_assignments pfa
      JOIN custom_playlist_flags cpf ON pfa.flag_id = cpf.id
      WHERE pfa.playlist_id = ?
      ORDER BY pfa.assigned_at DESC
    `;
    
    const assignments = db.prepare(query).all(playlistId);

    res.json({ assignments });
  } catch (error) {
    logger.error('API_ERROR', 'Error fetching playlist tag assignments', error);
    res.status(500).json({ error: 'Failed to fetch playlist tag assignments' });
  }
});

// Assign flag to playlist
router.post('/playlist-flags', async (req, res) => {
  try {
    const db = getDatabase();
    ensurePlaylistTagSchema(db);
    const { playlistId, flagId } = req.body;
    
    if (!playlistId || !flagId) {
      return res.status(400).json({ error: 'Playlist ID and flag ID are required' });
    }
    
    // Check if playlist exists
    const playlistCheck = db.prepare('SELECT id FROM playlists WHERE id = ?').get(playlistId);
    if (!playlistCheck) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    
    // Check if flag exists
    const flagCheck = db.prepare('SELECT id FROM custom_playlist_flags WHERE id = ?').get(flagId);
    if (!flagCheck) {
      return res.status(404).json({ error: 'Flag not found' });
    }
    
    const insertQuery = `
      INSERT INTO playlist_flag_assignments (playlist_id, flag_id, assigned_by)
      VALUES (?, ?, ?)
      ON CONFLICT(playlist_id, flag_id) DO NOTHING
    `;
    
    const result = db.prepare(insertQuery).run(playlistId, flagId, req.user?.id || null);
    
    if (result.changes === 0) {
      return res.status(409).json({ error: 'Flag already assigned to this playlist' });
    }

    res.json({ success: true, assignmentId: result.lastInsertRowid });
  } catch (error) {
    logger.error('API_ERROR', 'Error assigning tag to playlist', error);
    res.status(500).json({ error: 'Failed to assign tag to playlist' });
  }
});

// Remove flag from playlist
router.delete('/playlist-flags/:playlistId/:flagId', async (req, res) => {
  try {
    const db = getDatabase();
    ensurePlaylistTagSchema(db);
    const { playlistId, flagId } = req.params;
    
    const deleteQuery = `DELETE FROM playlist_flag_assignments WHERE playlist_id = ? AND flag_id = ?`;
    const result = db.prepare(deleteQuery).run(playlistId, flagId);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Flag assignment not found' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('API_ERROR', 'Error removing tag from playlist', error);
    res.status(500).json({ error: 'Failed to remove tag from playlist' });
  }
});

// Get all playlists for flag assignment interface
router.get('/playlists-for-flags', async (req, res) => {
  try {
    const db = getDatabase();
    ensurePlaylistTagSchema(db);

    const query = `
      SELECT p.id, p.title, p.curator_name, p.published, p.publish_date, p.published_at,
             COUNT(pfa.flag_id) as flag_count
      FROM playlists p
      LEFT JOIN playlist_flag_assignments pfa ON p.id = pfa.playlist_id
      WHERE p.published = 1
      GROUP BY p.id
      ORDER BY 
        COALESCE(
          p.published_at,
          CASE WHEN p.publish_date IS NOT NULL AND p.publish_date != '' THEN datetime(p.publish_date || ' 00:00:00') END,
          p.created_at
        ) DESC,
        p.id DESC
      LIMIT 50
    `;

    const playlists = db.prepare(query).all();

    res.json({ playlists });
  } catch (error) {
    logger.error('API_ERROR', 'Error fetching playlists for tags', error);
    res.status(500).json({ error: 'Failed to fetch playlists for tags' });
  }
});

// Bulk assign tag to multiple playlists
router.post('/playlist-flags/bulk', async (req, res) => {
  try {
    const db = getDatabase();
    ensurePlaylistTagSchema(db);
    const { playlist_ids, flag_id } = req.body;

    // Validation
    if (!Array.isArray(playlist_ids) || playlist_ids.length === 0) {
      return res.status(400).json({ error: 'playlist_ids must be a non-empty array' });
    }

    if (!flag_id) {
      return res.status(400).json({ error: 'flag_id is required' });
    }

    // Enforce maximum batch size
    if (playlist_ids.length > 100) {
      return res.status(400).json({
        error: 'Maximum 100 playlists per bulk operation',
        provided: playlist_ids.length
      });
    }

    // Verify flag exists
    const flag = db.prepare('SELECT id FROM custom_playlist_flags WHERE id = ?').get(flag_id);
    if (!flag) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    // Verify all playlists exist
    const placeholders = playlist_ids.map(() => '?').join(',');
    const playlists = db.prepare(
      `SELECT id FROM playlists WHERE id IN (${placeholders})`
    ).all(...playlist_ids);

    if (playlists.length !== playlist_ids.length) {
      const foundIds = playlists.map(p => p.id);
      const missingIds = playlist_ids.filter(id => !foundIds.includes(id));
      return res.status(404).json({
        error: 'Some playlists not found',
        missing_ids: missingIds
      });
    }

    // Perform bulk insert (ignore duplicates)
    const insertStmt = db.prepare(`
      INSERT INTO playlist_flag_assignments (playlist_id, flag_id, assigned_by, assigned_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(playlist_id, flag_id) DO NOTHING
    `);

    let assigned = 0;
    let skipped = 0;

    db.transaction(() => {
      playlist_ids.forEach(playlistId => {
        const result = insertStmt.run(playlistId, flag_id, req.user?.id || null);
        if (result.changes > 0) {
          assigned++;
        } else {
          skipped++;
        }
      });
    })();

    res.json({
      success: true,
      assigned,
      skipped,
      message: `Assigned tag to ${assigned} playlist${assigned !== 1 ? 's' : ''} (${skipped} already had tag)`
    });

  } catch (error) {
    logger.error('API_ERROR', 'Error bulk assigning tags', error);
    res.status(500).json({ error: 'Failed to bulk assign tags' });
  }
});

router.get('/system-health', (req, res) => {
  try {
    const snapshot = systemHealthMonitor.getSnapshot();
    res.json(snapshot);
  } catch (error) {
    logger.error('ADMIN_HEALTH', 'Failed to load system health snapshot', {
      error: error?.message
    });
    res.status(500).json({ error: 'Unable to load system health snapshot' });
  }
});

router.post('/system-health/run-diagnostic', async (req, res) => {
  try {
    const diagnostic = await systemHealthMonitor.runDiagnostics('manual');
    res.json({
      diagnostic,
      snapshot: systemHealthMonitor.getSnapshot()
    });
  } catch (error) {
    logger.error('ADMIN_HEALTH', 'System diagnostic failed', {
      error: error?.message
    });
    res.status(500).json({ error: 'Diagnostic failed', detail: error.message });
  }
});

router.post('/system-health/automation', (req, res) => {
  const { actionKey } = req.body || {};
  if (!actionKey) {
    return res.status(400).json({ error: 'Missing actionKey' });
  }

  try {
    const result = systemHealthMonitor.runAutomation(actionKey, { reason: 'manual' });
    res.json({
      result,
      snapshot: systemHealthMonitor.getSnapshot()
    });
  } catch (error) {
    logger.error('ADMIN_HEALTH', 'Automation trigger failed', {
      actionKey,
      error: error?.message
    });
    res.status(500).json({ error: 'Automation failed', detail: error.message });
  }
});

router.get('/perfect-sundays', async (_req, res) => {
  try {
    const db = getDatabase();
    const row = db
      .prepare('SELECT config_value, updated_at FROM admin_system_config WHERE config_key = ?')
      .get('perfect_sundays_page');

    const config = parsePerfectSundaysConfig(row);

    res.json({
      success: true,
      config,
      updated_at: row?.updated_at || null
    });
  } catch (error) {
    logger.error('ADMIN', 'Failed to fetch Perfect Sundays config', error);
    res.status(500).json({ error: 'Failed to load Perfect Sundays config' });
  }
});

router.post('/perfect-sundays', async (req, res) => {
  try {
    const db = getDatabase();
    const {
      title,
      description,
      playlist_ids,
      mega_playlist_links,
      megaplaylist_title,
      megaplaylist_image,
      default_curator_name
    } = req.body || {};

    if (title !== undefined && typeof title !== 'string') {
      return res.status(400).json({ error: 'Title must be a string' });
    }

    if (description !== undefined && typeof description !== 'string') {
      return res.status(400).json({ error: 'Description must be a string' });
    }

    if (default_curator_name !== undefined && typeof default_curator_name !== 'string') {
      return res.status(400).json({ error: 'default_curator_name must be a string' });
    }

    if (megaplaylist_title !== undefined && typeof megaplaylist_title !== 'string') {
      return res.status(400).json({ error: 'megaplaylist_title must be a string' });
    }

    if (megaplaylist_image !== undefined && typeof megaplaylist_image !== 'string') {
      return res.status(400).json({ error: 'megaplaylist_image must be a string' });
    }

    const normalizedPlaylistIds = Array.isArray(playlist_ids)
      ? Array.from(
        new Set(
          playlist_ids
            .map((id) => Number.parseInt(id, 10))
            .filter((id) => Number.isFinite(id))
        )
      )
      : [];

    const links = {
      ...DEFAULT_PERFECT_SUNDAYS_CONFIG.mega_playlist_links,
      ...(typeof mega_playlist_links === 'object' && mega_playlist_links !== null ? mega_playlist_links : {})
    };

    Object.keys(links).forEach((key) => {
      if (links[key] !== undefined && typeof links[key] !== 'string') {
        links[key] = DEFAULT_PERFECT_SUNDAYS_CONFIG.mega_playlist_links[key];
      }
      if (typeof links[key] === 'string') {
        links[key] = links[key].trim();
      }
    });

    const payload = {
      ...DEFAULT_PERFECT_SUNDAYS_CONFIG,
      title: typeof title === 'string' ? title.trim() : DEFAULT_PERFECT_SUNDAYS_CONFIG.title,
      description: typeof description === 'string' ? description : DEFAULT_PERFECT_SUNDAYS_CONFIG.description,
      playlist_ids: normalizedPlaylistIds,
      mega_playlist_links: links,
      megaplaylist_title: typeof megaplaylist_title === 'string'
        ? megaplaylist_title.trim() || DEFAULT_PERFECT_SUNDAYS_CONFIG.megaplaylist_title
        : DEFAULT_PERFECT_SUNDAYS_CONFIG.megaplaylist_title,
      megaplaylist_image: typeof megaplaylist_image === 'string'
        ? megaplaylist_image.trim()
        : DEFAULT_PERFECT_SUNDAYS_CONFIG.megaplaylist_image,
      default_curator_name: typeof default_curator_name === 'string'
        ? default_curator_name.trim() || DEFAULT_PERFECT_SUNDAYS_CONFIG.default_curator_name
        : DEFAULT_PERFECT_SUNDAYS_CONFIG.default_curator_name
    };

    db.prepare(UPSERT_CONFIG_SQL).run(
      'perfect_sundays_page',
      JSON.stringify(payload),
      req.user?.id || null
    );

    invalidateFeed('perfect_sundays_update');

    logger.info('ADMIN', 'Updated Perfect Sundays config', {
      userId: req.user?.id,
      playlistCount: payload.playlist_ids.length
    });

    // Auto-publish all Perfect Sundays playlists
    if (normalizedPlaylistIds.length > 0) {
      const placeholders = normalizedPlaylistIds.map(() => '?').join(',');
      const updatePublished = db.prepare(
        `UPDATE playlists SET published = 1 WHERE id IN (${placeholders})`
      );
      const updateResult = updatePublished.run(...normalizedPlaylistIds);
      logger.info('PERFECT_SUNDAYS', 'Auto-published Perfect Sundays playlists', {
        playlistIds: normalizedPlaylistIds,
        changedCount: updateResult.changes
      });
    }

    // Trigger cross-linking and auto-export for all Perfect Sundays playlists
    if (normalizedPlaylistIds.length > 0) {
      setImmediate(async () => {
        try {
          const queries = getQueries();

          for (const playlistId of normalizedPlaylistIds) {
            try {
              const playlist = queries.getPlaylistById.get(playlistId);

              if (!playlist) {
                logger.warn('PERFECT_SUNDAYS', 'Playlist not found for cross-linking/export', { playlistId });
                continue;
              }

              // Trigger cross-platform linking
              try {
                await crossPlatformLinkingService.startPlaylistLinking(playlistId, {
                  forceRefresh: false
                });
                logger.info('PERFECT_SUNDAYS', 'Triggered cross-linking', { playlistId });
              } catch (linkError) {
                logger.error('PERFECT_SUNDAYS', 'Failed to trigger cross-linking', {
                  playlistId,
                  error: linkError?.message
                });
              }

              // Queue export to admin TIDAL and Apple Music accounts
              try {
                const adminDestinations = ['tidal', 'apple'];
                const accountPrefs = {
                  tidal: { account_type: 'flowerpil', owner_curator_id: null },
                  apple: { account_type: 'flowerpil', owner_curator_id: null }
                };

                ensureExportRequest({
                  playlistId,
                  destinations: adminDestinations,
                  requestedBy: 'system',
                  resetProgress: false,
                  accountPreferences: accountPrefs,
                  curatorId: playlist.curator_id
                });

                logger.info('PERFECT_SUNDAYS', 'Queued export to admin accounts', {
                  playlistId,
                  destinations: adminDestinations
                });
              } catch (exportError) {
                logger.error('PERFECT_SUNDAYS', 'Failed to queue export', {
                  playlistId,
                  error: exportError?.message
                });
              }
            } catch (playlistError) {
              logger.error('PERFECT_SUNDAYS', 'Failed to process playlist', {
                playlistId,
                error: playlistError?.message
              });
            }
          }
        } catch (error) {
          logger.error('PERFECT_SUNDAYS', 'Failed to process playlists for linking/export', {
            error: error?.message
          });
        }

        // Schedule auto-retry for any failures after 30 seconds
        setTimeout(async () => {
          try {
            const queries = getQueries();

            for (const playlistId of normalizedPlaylistIds) {
              try {
                const playlist = queries.getPlaylistById.get(playlistId);
                if (!playlist) continue;

                // Check track linking status
                const tracks = queries.getTracksByPlaylistId.all(playlistId);
                const needsLinking = tracks.some(t =>
                  !t.spotify_id || !t.apple_id || !t.tidal_id
                );

                if (needsLinking) {
                  logger.info('PERFECT_SUNDAYS', 'Auto-retry: Re-triggering cross-linking', { playlistId });
                  await crossPlatformLinkingService.startPlaylistLinking(playlistId, {
                    forceRefresh: false
                  });
                }

                // Check export status
                const recentExports = db.prepare(`
                  SELECT * FROM export_requests
                  WHERE playlist_id = ?
                  AND created_at > datetime('now', '-5 minutes')
                  AND status = 'failed'
                `).all(playlistId);

                if (recentExports.length > 0) {
                  logger.info('PERFECT_SUNDAYS', 'Auto-retry: Re-queueing failed exports', { playlistId });
                  const adminDestinations = ['tidal', 'apple'];
                  const accountPrefs = {
                    tidal: { account_type: 'flowerpil', owner_curator_id: null },
                    apple: { account_type: 'flowerpil', owner_curator_id: null }
                  };

                  ensureExportRequest({
                    playlistId,
                    destinations: adminDestinations,
                    requestedBy: 'system',
                    resetProgress: true,
                    accountPreferences: accountPrefs,
                    curatorId: playlist.curator_id
                  });
                }
              } catch (retryError) {
                logger.error('PERFECT_SUNDAYS', 'Auto-retry failed for playlist', {
                  playlistId,
                  error: retryError?.message
                });
              }
            }
          } catch (error) {
            logger.error('PERFECT_SUNDAYS', 'Auto-retry failed', {
              error: error?.message
            });
          }
        }, 30000);
      });
    }

    res.json({ success: true, config: payload });
  } catch (error) {
    logger.error('ADMIN', 'Failed to save Perfect Sundays config', error);
    res.status(500).json({ error: 'Failed to save Perfect Sundays config' });
  }
});

// Perfect Sundays recovery: re-trigger exports and cross-linking
router.post('/perfect-sundays/recovery', async (req, res) => {
  try {
    const { action, playlistIds } = req.body;

    if (!Array.isArray(playlistIds) || playlistIds.length === 0) {
      return res.status(400).json({ error: 'playlistIds array is required' });
    }

    const allowedActions = new Set(['re-export', 're-link', 'both', 'confirm-tracks']);
    if (!allowedActions.has(action)) {
      return res.status(400).json({ error: 'action must be re-export, re-link, confirm-tracks, or both' });
    }

    if (action === 'confirm-tracks') {
      const summary = await confirmPerfectSundaysTracks(playlistIds);
      return res.json(summary);
    }

    const queries = getQueries();
    const results = {
      success: [],
      failed: [],
      total: playlistIds.length
    };

    for (const playlistId of playlistIds) {
      try {
        const playlist = queries.getPlaylistById.get(playlistId);

        if (!playlist) {
          results.failed.push({ playlistId, reason: 'Playlist not found' });
          continue;
        }

        // Re-trigger cross-linking
        if (action === 're-link' || action === 'both') {
          try {
            await crossPlatformLinkingService.startPlaylistLinking(playlistId, {
              forceRefresh: true
            });
            logger.info('PERFECT_SUNDAYS_RECOVERY', 'Re-triggered cross-linking', { playlistId });
          } catch (linkError) {
            logger.error('PERFECT_SUNDAYS_RECOVERY', 'Failed to re-trigger cross-linking', {
              playlistId,
              error: linkError?.message
            });
            if (action === 're-link') {
              results.failed.push({ playlistId, reason: `Cross-linking failed: ${linkError?.message}` });
              continue;
            }
          }
        }

        // Re-trigger exports
        if (action === 're-export' || action === 'both') {
          try {
            // Check if all required URLs already exist
            const urlFieldMap = {
              spotify: 'spotify_url',
              apple: 'apple_url',
              tidal: 'tidal_url'
            };

            const missingDestinations = ADMIN_EXPORT_DESTINATIONS.filter(dest => {
              const urlField = urlFieldMap[dest];
              const url = playlist[urlField];
              return !url || url.trim() === '';
            });

            if (missingDestinations.length === 0) {
              logger.info('PERFECT_SUNDAYS_RECOVERY', 'Skipping export - all URLs already exist', {
                playlistId,
                apple_url: playlist.apple_url,
                tidal_url: playlist.tidal_url
              });
            } else {
              // Only export to destinations that are missing
              ensureExportRequest({
                playlistId,
                destinations: missingDestinations,
                requestedBy: 'system',
                resetProgress: true,
                accountPreferences: ADMIN_ACCOUNT_PREFERENCES,
                curatorId: playlist.curator_id
              });

              logger.info('PERFECT_SUNDAYS_RECOVERY', 'Re-queued export to admin accounts', {
                playlistId,
                destinations: missingDestinations,
                skipped: ADMIN_EXPORT_DESTINATIONS.filter(d => !missingDestinations.includes(d))
              });
            }
          } catch (exportError) {
            logger.error('PERFECT_SUNDAYS_RECOVERY', 'Failed to re-queue export', {
              playlistId,
              error: exportError?.message
            });
            results.failed.push({ playlistId, reason: `Export failed: ${exportError?.message}` });
            continue;
          }
        }

        results.success.push(playlistId);
      } catch (error) {
        logger.error('PERFECT_SUNDAYS_RECOVERY', 'Failed to process playlist', {
          playlistId,
          error: error?.message
        });
        results.failed.push({ playlistId, reason: error?.message });
      }
    }

    logger.info('PERFECT_SUNDAYS_RECOVERY', 'Recovery completed', {
      action,
      total: results.total,
      success: results.success.length,
      failed: results.failed.length
    });

    res.json(results);
  } catch (error) {
    logger.error('PERFECT_SUNDAYS_RECOVERY', 'Recovery failed', error);
    res.status(500).json({ error: 'Recovery operation failed' });
  }
});

// Get about page content
router.get('/about-content', async (req, res) => {
  try {
    const db = getDatabase();

    const config = db.prepare(`
      SELECT config_value
      FROM admin_system_config
      WHERE config_key = 'about_page_content'
    `).get();

    if (!config) {
      // Return default empty structure
      return res.json({
        topText: '',
        items: [],
        headerConfig: {
          showHeader: false,
          title: '',
          subtitle: '',
          backgroundColor: '#667eea'
        }
      });
    }

    try {
      const content = JSON.parse(config.config_value);
      // Ensure headerConfig exists in legacy data
      if (!content.headerConfig) {
        content.headerConfig = {
          showHeader: false,
          title: '',
          subtitle: '',
          backgroundColor: '#667eea'
        };
      }
      res.json(content);
    } catch (parseError) {
      logger.error('API_ERROR', 'Error parsing about page content', parseError);
      // Return default on parse error
      res.json({
        topText: '',
        items: [],
        headerConfig: {
          showHeader: false,
          title: '',
          subtitle: '',
          backgroundColor: '#667eea'
        }
      });
    }
  } catch (error) {
    logger.error('API_ERROR', 'Error fetching about page content', error);
    res.status(500).json({ error: 'Failed to fetch about page content' });
  }
});

// Save about page content
router.post('/about-content', async (req, res) => {
  try {
    const db = getDatabase();
    const { topText, items, headerConfig } = req.body;

    // Validate structure
    if (topText !== undefined && typeof topText !== 'string') {
      return res.status(400).json({ error: 'topText must be a string' });
    }

    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'items must be an array' });
    }

    // Validate headerConfig (optional)
    if (headerConfig !== undefined) {
      if (typeof headerConfig !== 'object' || headerConfig === null) {
        return res.status(400).json({ error: 'headerConfig must be an object' });
      }

      if (headerConfig.showHeader !== undefined && typeof headerConfig.showHeader !== 'boolean') {
        return res.status(400).json({ error: 'headerConfig.showHeader must be a boolean' });
      }

      if (headerConfig.title !== undefined && typeof headerConfig.title !== 'string') {
        return res.status(400).json({ error: 'headerConfig.title must be a string' });
      }

      if (headerConfig.subtitle !== undefined && typeof headerConfig.subtitle !== 'string') {
        return res.status(400).json({ error: 'headerConfig.subtitle must be a string' });
      }

      if (headerConfig.backgroundColor !== undefined && typeof headerConfig.backgroundColor !== 'string') {
        return res.status(400).json({ error: 'headerConfig.backgroundColor must be a string' });
      }
    }

    // Validate each item
    const validatedItems = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      if (!item.id || typeof item.id !== 'string') {
        return res.status(400).json({ error: `Item ${i + 1} is missing a valid id` });
      }

      if (!item.title || typeof item.title !== 'string' || !item.title.trim()) {
        return res.status(400).json({ error: `Item ${i + 1} is missing a valid title` });
      }

      if (!item.bodyHtml || typeof item.bodyHtml !== 'string') {
        return res.status(400).json({ error: `Item ${i + 1} is missing valid bodyHtml` });
      }

      // Validate media fields (all optional)
      if (item.mediaUrl !== undefined && typeof item.mediaUrl !== 'string') {
        return res.status(400).json({ error: `Item ${i + 1} has invalid mediaUrl` });
      }

      if (item.mediaType !== undefined && !['image', 'video', ''].includes(item.mediaType)) {
        return res.status(400).json({ error: `Item ${i + 1} has invalid mediaType` });
      }

      if (item.mediaPosition !== undefined && !['top', 'bottom', 'left', 'right', ''].includes(item.mediaPosition)) {
        return res.status(400).json({ error: `Item ${i + 1} has invalid mediaPosition` });
      }

      if (item.mediaAspectRatio !== undefined && typeof item.mediaAspectRatio !== 'string') {
        return res.status(400).json({ error: `Item ${i + 1} has invalid mediaAspectRatio` });
      }

      if (item.mediaFallbackUrl !== undefined && typeof item.mediaFallbackUrl !== 'string') {
        return res.status(400).json({ error: `Item ${i + 1} has invalid mediaFallbackUrl` });
      }

      // Validate spacing fields (all optional)
      const spacingFields = ['paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'lineHeight'];
      for (const field of spacingFields) {
        if (item[field] !== undefined && typeof item[field] !== 'string') {
          return res.status(400).json({ error: `Item ${i + 1} has invalid ${field}` });
        }
      }

      const validatedItem = {
        id: item.id,
        title: item.title.trim(),
        bodyHtml: item.bodyHtml,
        order: i
      };

      // Add media fields if present
      if (item.mediaUrl) validatedItem.mediaUrl = item.mediaUrl;
      if (item.mediaType) validatedItem.mediaType = item.mediaType;
      if (item.mediaPosition) validatedItem.mediaPosition = item.mediaPosition;
      if (item.mediaAspectRatio) validatedItem.mediaAspectRatio = item.mediaAspectRatio;
      if (item.mediaFallbackUrl) validatedItem.mediaFallbackUrl = item.mediaFallbackUrl;

      // Add spacing fields if present
      if (item.paddingTop) validatedItem.paddingTop = item.paddingTop;
      if (item.paddingBottom) validatedItem.paddingBottom = item.paddingBottom;
      if (item.paddingLeft) validatedItem.paddingLeft = item.paddingLeft;
      if (item.paddingRight) validatedItem.paddingRight = item.paddingRight;
      if (item.lineHeight) validatedItem.lineHeight = item.lineHeight;

      validatedItems.push(validatedItem);
    }

    const content = {
      topText: topText || '',
      items: validatedItems,
      headerConfig: headerConfig || {
        showHeader: false,
        title: '',
        subtitle: '',
        backgroundColor: '#667eea'
      }
    };

    // Save to database
    db.prepare(UPSERT_CONFIG_SQL).run(
      'about_page_content',
      JSON.stringify(content),
      req.user?.id || null
    );

    logger.info('ADMIN', 'Updated about page content', {
      userId: req.user?.id,
      itemCount: validatedItems.length,
      hasCustomHeader: headerConfig?.showHeader || false
    });

    res.json({ success: true, content });
  } catch (error) {
    logger.error('API_ERROR', 'Error saving about page content', error);
    res.status(500).json({ error: 'Failed to save about page content' });
  }
});

// ==================== Landing Page Links ====================

// ==================== Writing Rollout ====================

router.get('/writing-rollout', authMiddleware, requireAdmin, (req, res) => {
  try {
    const db = getDatabase();
    const rollout = getWritingRolloutConfig(db);

    res.json({
      success: true,
      data: rollout
    });
  } catch (error) {
    logger.error('ADMIN', 'Failed to fetch writing rollout config', error);
    res.status(500).json({ success: false, error: 'Failed to fetch writing rollout config' });
  }
});

router.get('/writing-rollout/curators', authMiddleware, requireAdmin, (req, res) => {
  try {
    const db = getDatabase();
    const search = String(req.query.search || '').trim().toLowerCase();
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 80, 1), 200);

    const whereSql = search
      ? `WHERE LOWER(c.name) LIKE ? OR LOWER(IFNULL(c.type, '')) LIKE ? OR LOWER(IFNULL(c.profile_type, '')) LIKE ?`
      : '';
    const params = search ? [`%${search}%`, `%${search}%`, `%${search}%`, limit] : [limit];

    const rows = db.prepare(`
      SELECT
        c.id,
        c.name,
        c.type,
        c.profile_type,
        c.tester,
        COUNT(au.id) AS curator_account_count
      FROM curators c
      LEFT JOIN admin_users au
        ON au.curator_id = c.id
        AND au.role = 'curator'
        AND au.is_active = 1
      ${whereSql}
      GROUP BY c.id
      HAVING curator_account_count > 0
      ORDER BY LOWER(c.name) ASC
      LIMIT ?
    `).all(...params);

    res.json({
      success: true,
      data: rows.map((row) => ({
        id: row.id,
        name: row.name,
        type: row.type,
        profile_type: row.profile_type,
        tester: Boolean(row.tester),
        has_curator_account: Number(row.curator_account_count) > 0
      }))
    });
  } catch (error) {
    logger.error('ADMIN', 'Failed to fetch writing rollout curators', error);
    res.status(500).json({ success: false, error: 'Failed to fetch curator list' });
  }
});

router.put('/writing-rollout', authMiddleware, requireAdmin, (req, res) => {
  try {
    const db = getDatabase();
    const next = setWritingRolloutConfig(req.body || {}, req.user?.id || null, db);

    invalidateFeed('writing_rollout_update');

    logger.info('ADMIN', 'Updated writing rollout config', {
      adminUserId: req.user?.id || null,
      phase: next.phase,
      pilotCuratorCount: Array.isArray(next.pilot_curator_ids) ? next.pilot_curator_ids.length : 0
    });

    res.json({
      success: true,
      data: next
    });
  } catch (error) {
    logger.error('ADMIN', 'Failed to update writing rollout config', error);
    res.status(500).json({ success: false, error: 'Failed to update writing rollout config' });
  }
});

// ==================== Landing Page Links ====================

// Get all landing page links
router.get('/landing-page-links', (req, res) => {
  try {
    const queries = getQueries();
    const links = queries.getAllLandingPageLinks.all();
    res.json({ links });
  } catch (error) {
    logger.error('ADMIN', 'Failed to fetch landing page links', error);
    res.status(500).json({ error: 'Failed to fetch landing page links' });
  }
});

// Prune stale Top 10 landing page links (missing top10_playlists rows)
router.post('/landing-page-links/prune-top10', (req, res) => {
  try {
    const db = getDatabase();
    const links = db.prepare(`
      SELECT id, url, published
      FROM landing_page_links
      WHERE url LIKE '%/top10/%'
    `).all();

    const slugPattern = /\/top10\/([^/?#]+)/i;
    const skippedSlugs = new Set(['start']);
    const staleIds = [];

    for (const link of links) {
      const rawUrl = typeof link.url === 'string' ? link.url.trim() : '';
      if (!rawUrl) continue;

      const match = rawUrl.match(slugPattern);
      if (!match) continue;

      const slug = match[1];
      if (!slug || skippedSlugs.has(slug.toLowerCase())) continue;

      const existing = db.prepare('SELECT id FROM top10_playlists WHERE slug = ? LIMIT 1').get(slug);
      if (!existing) {
        staleIds.push(link.id);
      }
    }

    let unpublishedCount = 0;
    if (staleIds.length) {
      const updateStmt = db.prepare(`
        UPDATE landing_page_links
        SET published = 0,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND published <> 0
      `);

      const transaction = db.transaction((ids) => {
        for (const id of ids) {
          const info = updateStmt.run(id);
          unpublishedCount += info.changes || 0;
        }
      });

      transaction(staleIds);
    }

    logger.info('ADMIN', 'Pruned stale Top 10 landing page links', {
      userId: req.user?.id,
      scanned: links.length,
      stale: staleIds.length,
      unpublished: unpublishedCount
    });

    res.json({
      success: true,
      scanned: links.length,
      stale: staleIds.length,
      unpublished: unpublishedCount
    });
  } catch (error) {
    logger.error('ADMIN', 'Failed to prune stale Top 10 links', error);
    res.status(500).json({ error: 'Failed to prune stale Top 10 links' });
  }
});

// Get single landing page link
router.get('/landing-page-links/:id', (req, res) => {
  try {
    const { id } = req.params;
    const queries = getQueries();
    const link = queries.getLandingPageLinkById.get(id);

    if (!link) {
      return res.status(404).json({ error: 'Link not found' });
    }

    res.json({ link });
  } catch (error) {
    logger.error('ADMIN', 'Failed to fetch landing page link', error);
    res.status(500).json({ error: 'Failed to fetch landing page link' });
  }
});

// Create landing page link
router.post('/landing-page-links', (req, res) => {
  try {
    const {
      title,
      subtitle = '',
      url,
      image = '',
      tags = '',
      content_tag = '',
      content_tag_color = '#667eea',
      published = 0,
      priority = 0
    } = req.body;

    if (!title || !url) {
      return res.status(400).json({ error: 'Title and URL are required' });
    }

    const queries = getQueries();
    const result = queries.insertLandingPageLink.run(
      title,
      subtitle,
      url,
      image,
      tags,
      content_tag,
      content_tag_color,
      published ? 1 : 0,
      priority
    );

    const newLink = queries.getLandingPageLinkById.get(result.lastInsertRowid);

    logger.info('ADMIN', 'Created landing page link', {
      userId: req.user?.id,
      linkId: result.lastInsertRowid,
      title
    });

    res.json({ link: newLink });
  } catch (error) {
    logger.error('ADMIN', 'Failed to create landing page link', error);
    res.status(500).json({ error: 'Failed to create landing page link' });
  }
});

// Update landing page link
router.put('/landing-page-links/:id', (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      subtitle = '',
      url,
      image = '',
      tags = '',
      content_tag = '',
      content_tag_color = '#667eea',
      published = 0,
      priority = 0
    } = req.body;

    if (!title || !url) {
      return res.status(400).json({ error: 'Title and URL are required' });
    }

    const queries = getQueries();

    // Check if link exists
    const existing = queries.getLandingPageLinkById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Link not found' });
    }

    queries.updateLandingPageLink.run(
      title,
      subtitle,
      url,
      image,
      tags,
      content_tag,
      content_tag_color,
      published ? 1 : 0,
      priority,
      id
    );

    const updatedLink = queries.getLandingPageLinkById.get(id);

    logger.info('ADMIN', 'Updated landing page link', {
      userId: req.user?.id,
      linkId: id,
      title
    });

    res.json({ link: updatedLink });
  } catch (error) {
    logger.error('ADMIN', 'Failed to update landing page link', error);
    res.status(500).json({ error: 'Failed to update landing page link' });
  }
});

// Delete landing page link
router.delete('/landing-page-links/:id', (req, res) => {
  try {
    const { id } = req.params;
    const queries = getQueries();

    // Check if link exists
    const existing = queries.getLandingPageLinkById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Link not found' });
    }

    queries.deleteLandingPageLink.run(id);

    logger.info('ADMIN', 'Deleted landing page link', {
      userId: req.user?.id,
      linkId: id,
      title: existing.title
    });

    res.json({ success: true });
  } catch (error) {
    logger.error('ADMIN', 'Failed to delete landing page link', error);
    res.status(500).json({ error: 'Failed to delete landing page link' });
  }
});

// ==================== Artwork Populator ====================

// Populate missing track artwork using Spotify API
router.post('/populate-artwork', async (req, res) => {
  try {
    const { playlistId, dryRun = false } = req.body;
    const db = getDatabase();

    logger.info('ADMIN', 'Populate artwork requested', {
      userId: req.user?.id,
      playlistId: playlistId || 'all',
      dryRun
    });

    // Find tracks missing artwork that have spotify_id
    let query = `
      SELECT id, playlist_id, title, artist, spotify_id
      FROM tracks
      WHERE artwork_url IS NULL
        AND spotify_id IS NOT NULL
        AND spotify_id != ''
    `;
    const params = [];

    if (playlistId) {
      query += ' AND playlist_id = ?';
      params.push(playlistId);
    }

    query += ' LIMIT 500'; // Safety limit

    const tracksToProcess = db.prepare(query).all(...params);

    if (tracksToProcess.length === 0) {
      return res.json({
        success: true,
        message: 'No tracks found needing artwork',
        processed: 0,
        updated: 0,
        failed: 0,
        errors: []
      });
    }

    if (dryRun) {
      return res.json({
        success: true,
        dryRun: true,
        message: `Would process ${tracksToProcess.length} tracks`,
        tracks: tracksToProcess.slice(0, 20).map(t => ({
          id: t.id,
          title: t.title,
          artist: t.artist,
          spotify_id: t.spotify_id
        })),
        totalCount: tracksToProcess.length
      });
    }

    // Get Spotify token
    const token = await spotifyService.getClientCredentialsToken();

    // Process in batches of 50 (Spotify API limit)
    const batchSize = 50;
    const results = { processed: 0, updated: 0, failed: 0, errors: [] };
    const updateStmt = db.prepare(`
      UPDATE tracks
      SET artwork_url = ?, album_artwork_url = ?
      WHERE id = ?
    `);

    for (let i = 0; i < tracksToProcess.length; i += batchSize) {
      const batch = tracksToProcess.slice(i, i + batchSize);
      const spotifyIds = batch.map(t => t.spotify_id).join(',');

      try {
        const response = await spotifyService.makeRateLimitedRequest({
          method: 'get',
          url: `${spotifyService.baseURL}/tracks?ids=${spotifyIds}`,
          headers: { Authorization: `Bearer ${token}` }
        });

        const spotifyTracks = response?.data?.tracks || [];
        const spotifyMap = new Map();
        for (const st of spotifyTracks) {
          if (st?.id) {
            spotifyMap.set(st.id, st.album?.images?.[0]?.url || null);
          }
        }

        for (const track of batch) {
          results.processed++;
          const artworkUrl = spotifyMap.get(track.spotify_id);

          if (artworkUrl) {
            updateStmt.run(artworkUrl, artworkUrl, track.id);
            results.updated++;
          } else {
            results.failed++;
            results.errors.push({
              trackId: track.id,
              title: track.title,
              reason: 'No artwork found in Spotify response'
            });
          }
        }

        // Small delay between batches to be nice to Spotify
        if (i + batchSize < tracksToProcess.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } catch (batchError) {
        logger.error('ADMIN', 'Artwork batch fetch failed', {
          batchStart: i,
          error: batchError.message
        });
        for (const track of batch) {
          results.processed++;
          results.failed++;
          results.errors.push({
            trackId: track.id,
            title: track.title,
            reason: batchError.message
          });
        }
      }
    }

    logger.info('ADMIN', 'Populate artwork completed', {
      userId: req.user?.id,
      playlistId: playlistId || 'all',
      ...results,
      errorCount: results.errors.length
    });

    // Limit errors in response
    res.json({
      success: true,
      ...results,
      errors: results.errors.slice(0, 10)
    });
  } catch (error) {
    logger.error('ADMIN', 'Populate artwork failed', { error: error.message });
    res.status(500).json({ error: 'Failed to populate artwork', details: error.message });
  }
});

export default router;
