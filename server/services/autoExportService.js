import { getQueries } from '../database/db.js';
import { ensureExportRequest, normalizeDestinationsForStorage } from './exportRequestService.js';
import { logAutoExportEvent } from './dspTelemetryService.js';
import logger from '../utils/logger.js';

const SUPPORTED_PLATFORMS = ['spotify', 'apple', 'tidal', 'youtube_music'];

// Export protection settings
const EXPORT_COOLDOWN_MINUTES = 5; // Minimum time between exports for same playlist
const MAX_EXPORTS_PER_HOUR = 6; // Maximum export attempts per playlist per hour
const COMPLETED_COOLDOWN_MINUTES = 2; // Don't re-export if completed within this window

let queries;
const resolveQueries = () => {
  if (!queries) queries = getQueries();
  return queries;
};

// Legacy platform URL field map (fallback when playlist_dsp_exports has no rows).
const PLATFORM_URL_FIELDS = {
  spotify:       { url: 'spotify_url',       exportedUrl: 'exported_spotify_url' },
  apple:         { url: 'apple_url',         exportedUrl: 'exported_apple_url' },
  tidal:         { url: 'tidal_url',         exportedUrl: 'exported_tidal_url' },
  youtube_music: { url: 'youtube_music_url', exportedUrl: 'exported_youtube_music_url' },
};

/**
 * Detect platforms whose URL was set by import (not by our export flow).
 * Checks the managed export table first; falls back to legacy URL fields.
 */
const getImportedPlatforms = (playlist) => {
  const q = resolveQueries();
  const imported = [];

  // Try the managed export table first
  let managedExports = [];
  try {
    managedExports = q.findPlaylistDspExports?.all(playlist.id) || [];
  } catch (_) {
    // Table may not exist yet during migration; fall through to legacy check
  }

  const managedPlatforms = new Set(managedExports.map(e => e.platform));

  for (const [platform, fields] of Object.entries(PLATFORM_URL_FIELDS)) {
    const hasUrl = !!playlist[fields.url];
    if (!hasUrl) continue;

    // If a managed export record exists for this platform, it was exported by us
    if (managedPlatforms.has(platform)) continue;

    // Legacy fallback: check exported_*_url fields
    const hasExportedUrl = !!playlist[fields.exportedUrl];
    if (!hasExportedUrl) {
      imported.push(platform);
    }
  }
  return imported;
};

const sanitizePlatform = (value) => {
  if (!value || typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return SUPPORTED_PLATFORMS.includes(normalized) ? normalized : null;
};

const buildAccountPreferences = (destinations = []) => {
  const prefs = {};
  for (const dest of destinations) {
    prefs[dest] = {
      account_type: 'flowerpil',
      owner_curator_id: null
    };
  }
  return prefs;
};

const collectFlowerpilDestinations = (curatorId, { exclude = [] } = {}) => {
  if (!curatorId) return [];

  const excludeSet = new Set(
    (exclude || [])
      .map(sanitizePlatform)
      .filter(Boolean)
  );

  const rows = resolveQueries().getCuratorDSPAccounts.all(curatorId) || [];

  // Build a map of curator's DSP account settings
  const curatorSettings = new Map();
  for (const row of rows) {
    const platform = sanitizePlatform(row.platform);
    if (platform) {
      curatorSettings.set(platform, row.uses_flowerpil_account === 1);
    }
  }

  const destinations = new Set();
  const skippedReasons = {};

  // Spotify: default to flowerpil unless curator explicitly opted out (uses_flowerpil_account = 0)
  // If no entry exists, default to flowerpil account
  if (excludeSet.has('spotify')) {
    skippedReasons.spotify = 'excluded';
  } else {
    const hasSpotifyEntry = curatorSettings.has('spotify');
    const usesFlowerpil = curatorSettings.get('spotify');
    if (!hasSpotifyEntry || usesFlowerpil) {
      destinations.add('spotify');
    } else {
      skippedReasons.spotify = 'curator_uses_own_account';
    }
  }

  // TIDAL: always uses flowerpil account (curators don't manage their own TIDAL exports)
  if (excludeSet.has('tidal')) {
    skippedReasons.tidal = 'excluded';
  } else {
    destinations.add('tidal');
  }

  // Apple: only if curator explicitly opted in (uses_flowerpil_account = 1)
  // Apple requires curator's own account typically, so no default
  if (excludeSet.has('apple')) {
    skippedReasons.apple = 'excluded';
  } else if (curatorSettings.get('apple') === true) {
    destinations.add('apple');
  } else {
    skippedReasons.apple = curatorSettings.has('apple') ? 'curator_uses_own_account' : 'not_configured';
  }

  // Log destination selection for traceability
  logger.info('AUTO_EXPORT', 'Destination selection', {
    curatorId,
    selectedPlatforms: Array.from(destinations),
    skippedPlatforms: skippedReasons
  });

  if (destinations.size === 0) return [];

  return normalizeDestinationsForStorage(Array.from(destinations));
};

const toFiniteNumber = (value, fallback = null) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const hasMeaningfulPlaylistChanges = (summary) => {
  if (!summary || typeof summary !== 'object') {
    return true;
  }

  const added = toFiniteNumber(summary.added, 0);
  const deleted = toFiniteNumber(summary.deleted, 0);
  const totalBefore = toFiniteNumber(summary.total_before);
  const totalAfter = toFiniteNumber(summary.total_after);

  if (added > 0 || deleted > 0) {
    return true;
  }

  if (totalBefore !== null && totalAfter !== null && totalBefore !== totalAfter) {
    return true;
  }

  return false;
};

const recordEvent = ({
  playlist,
  trigger,
  severity,
  outcome,
  reason,
  metadata = {}
}) => {
  logAutoExportEvent({
    playlistId: playlist?.id || null,
    curatorId: playlist?.curator_id || null,
    trigger,
    severity,
    outcome,
    reason,
    metadata
  });
};

/**
 * Check if playlist export is in cooldown (recently exported or in progress)
 * Returns { blocked: boolean, reason: string, details: object }
 */
const checkExportCooldown = (playlistId) => {
  const q = resolveQueries();
  try {
    // Check for any recent exports (completed, in_progress, pending)
    const recentExports = q.findRecentExportsForPlaylist.all(
      playlistId,
      `-${EXPORT_COOLDOWN_MINUTES} minutes`
    );

    if (recentExports.length > 0) {
      const latest = recentExports[0];

      // If there's an active export (pending/in_progress), block
      if (['pending', 'in_progress', 'auth_required'].includes(latest.status)) {
        return {
          blocked: true,
          reason: 'export_already_active',
          details: {
            request_id: latest.id,
            status: latest.status,
            updated_at: latest.updated_at
          }
        };
      }

      // If completed recently, check the shorter cooldown
      if (latest.status === 'completed') {
        const completedRecentlyCheck = q.findRecentExportsForPlaylist.all(
          playlistId,
          `-${COMPLETED_COOLDOWN_MINUTES} minutes`
        );
        const recentCompleted = completedRecentlyCheck.find(r => r.status === 'completed');

        if (recentCompleted) {
          return {
            blocked: true,
            reason: 'recently_completed',
            details: {
              request_id: recentCompleted.id,
              completed_at: recentCompleted.updated_at,
              cooldown_minutes: COMPLETED_COOLDOWN_MINUTES
            }
          };
        }
      }
    }

    // Check rate limit (max exports per hour)
    const hourlyCount = q.countRecentExportsForPlaylist.get(playlistId);
    if (hourlyCount && hourlyCount.count >= MAX_EXPORTS_PER_HOUR) {
      return {
        blocked: true,
        reason: 'rate_limit_exceeded',
        details: {
          exports_this_hour: hourlyCount.count,
          max_per_hour: MAX_EXPORTS_PER_HOUR
        }
      };
    }

    return { blocked: false };
  } catch (error) {
    console.warn('[AUTO_EXPORT] Cooldown check failed, allowing export:', error?.message);
    return { blocked: false }; // Fail open - allow export if check fails
  }
};

export const queueAutoExportForPlaylist = ({
  playlistId,
  trigger = 'publish',
  exclude = [],
  resetProgress = true,
  changeSummary = null
} = {}) => {
  if (!playlistId) {
    recordEvent({
      playlist: null,
      trigger,
      severity: 'error',
      outcome: 'skipped',
      reason: 'missing_playlist_id'
    });
    return { queued: false, reason: 'missing_playlist_id' };
  }

  const playlist = resolveQueries().getPlaylistById.get(playlistId);
  if (!playlist) {
    recordEvent({
      playlist: { id: playlistId },
      trigger,
      severity: 'warning',
      outcome: 'skipped',
      reason: 'playlist_not_found'
    });
    return { queued: false, reason: 'playlist_not_found' };
  }

  if (!playlist.curator_id) {
    recordEvent({
      playlist,
      trigger,
      severity: 'error',
      outcome: 'skipped',
      reason: 'missing_curator'
    });
    return { queued: false, reason: 'missing_curator' };
  }

  if (!playlist.published) {
    recordEvent({
      playlist,
      trigger,
      severity: 'warning',
      outcome: 'skipped',
      reason: 'playlist_not_published'
    });
    return { queued: false, reason: 'playlist_not_published' };
  }

  // Skip platforms whose URL was set by import (not by our export).
  // The imported URL already serves as the playlist link — re-exporting would create a duplicate.
  const importedPlatforms = getImportedPlatforms(playlist);
  const mergedExclude = [...(exclude || []), ...importedPlatforms];

  if (importedPlatforms.length) {
    logger.info('AUTO_EXPORT', 'Skipping imported platforms', {
      playlistId,
      importedPlatforms
    });
  }

  const destinations = collectFlowerpilDestinations(playlist.curator_id, { exclude: mergedExclude });
  if (!destinations.length) {
    recordEvent({
      playlist,
      trigger,
      severity: 'warning',
      outcome: 'skipped',
      reason: 'no_flowerpil_destinations',
      metadata: { exclude }
    });
    return { queued: false, reason: 'no_flowerpil_destinations' };
  }

  if (!hasMeaningfulPlaylistChanges(changeSummary)) {
    recordEvent({
      playlist,
      trigger,
      severity: 'info',
      outcome: 'skipped',
      reason: 'no_playlist_changes_detected',
      metadata: {
        destinations,
        change_summary: changeSummary || {}
      }
    });
    return {
      queued: false,
      reason: 'no_playlist_changes_detected'
    };
  }

  // Check cooldown and rate limits to prevent loops/duplicates
  const cooldownCheck = checkExportCooldown(playlistId);
  if (cooldownCheck.blocked) {
    recordEvent({
      playlist,
      trigger,
      severity: 'info',
      outcome: 'skipped',
      reason: cooldownCheck.reason,
      metadata: {
        destinations,
        ...cooldownCheck.details
      }
    });
    console.log('[AUTO_EXPORT] Export blocked by cooldown/rate limit', {
      playlistId,
      trigger,
      reason: cooldownCheck.reason,
      details: cooldownCheck.details
    });
    return {
      queued: false,
      reason: cooldownCheck.reason,
      details: cooldownCheck.details
    };
  }

  try {
    const request = ensureExportRequest({
      playlistId,
      destinations,
      requestedBy: 'system',
      resetProgress,
      accountPreferences: buildAccountPreferences(destinations),
      curatorId: playlist.curator_id
    });

    recordEvent({
      playlist,
      trigger,
      severity: 'info',
      outcome: 'queued',
      reason: null,
      metadata: {
        request_id: request?.id,
        destinations,
        resetProgress
      }
    });

    return {
      queued: true,
      trigger,
      playlistId,
      destinations,
      request
    };
  } catch (error) {
    console.error('[AUTO_EXPORT] Failed to queue export request', {
      playlistId,
      trigger,
      error: error?.message || error
    });

    recordEvent({
      playlist,
      trigger,
      severity: 'error',
      outcome: 'failed',
      reason: 'ensure_export_request_failed',
      metadata: {
        message: error?.message,
        destinations
      }
    });

    return { queued: false, reason: 'ensure_export_request_failed', error };
  }
};

export default {
  queueAutoExportForPlaylist
};
