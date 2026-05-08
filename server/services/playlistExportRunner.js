import { getQueries, getDatabase } from '../database/db.js';
import SpotifyService from './spotifyService.js';
import tidalService from './tidalService.js';
import appleMusicApiService from './appleMusicApiService.js';
import youtubeMusicService from './youtubeMusicService.js';
import ExportValidationService from './ExportValidationService.js';
import { getDestinationsFromStoredValue, parseResultsField, parseAccountPreferencesField } from './exportRequestService.js';
import { getPlatformCapabilities } from './platformCapabilities.js';
import slackService from './SlackNotificationService.js';

let _queries, _db;
const resolveQueries = () => { if (!_queries) _queries = getQueries(); return _queries; };
const resolveDb = () => { if (!_db) _db = getDatabase(); return _db; };

const exportValidationService = new ExportValidationService();
const spotifyService = new SpotifyService();

/**
 * Get export token for a given platform with enhanced v2 schema support
 *
 * @param {string} platform - Platform identifier ('spotify', 'tidal', 'apple')
 * @param {Object} options - Token selection options
 * @param {string} options.accountType - Account type: 'flowerpil' (default) or 'curator'
 * @param {number|null} options.curatorId - Curator ID for curator-owned tokens
 * @param {boolean} options.preferActive - Prefer active tokens (default: true)
 * @returns {Object|null} Token object or null if not found
 */
const getExportToken = (platform, options = {}) => {
  const {
    accountType = 'flowerpil',
    curatorId = null,
    preferActive = true
  } = options;

  if (accountType === 'curator' && !curatorId) {
    return null;
  }

  // Build query with v2 schema support
  let sql = `
    SELECT * FROM export_oauth_tokens
    WHERE platform = ?
      AND account_type = ?
  `;
  const params = [platform, accountType];

  // Filter by curator ID if specified (for curator-owned tokens)
  if (curatorId) {
    sql += ` AND owner_curator_id = ?`;
    params.push(curatorId);
  } else if (accountType === 'flowerpil') {
    // Flowerpil tokens should have null owner_curator_id
    sql += ` AND owner_curator_id IS NULL`;
  }

  // Prefer active tokens (primary over backup)
  if (preferActive) {
    sql += ` AND is_active = 1`;
  }

  // Order by: most recently validated first, then newest by ID
  sql += ` ORDER BY last_validated_at DESC NULLS LAST, id DESC LIMIT 1`;

  const stmt = resolveDb().prepare(sql);
  return stmt.get(...params);
};

const isTokenExpired = (token) => {
  if (!token || !token.expires_at) return false;
  return new Date(token.expires_at) <= new Date();
};

const buildYouTubeMusicOAuthJson = (oauthToken) => {
  if (!oauthToken) {
    const err = new Error('Missing YouTube Music token. Please authenticate.');
    err.code = 'AUTH_REQUIRED';
    err.statusCode = 401;
    throw err;
  }

  const rawAccess = oauthToken.access_token ? String(oauthToken.access_token).trim() : '';
  if (rawAccess.startsWith('{')) {
    try {
      const parsed = JSON.parse(rawAccess);
      if (parsed?.access_token && parsed?.refresh_token) {
        return parsed;
      }
    } catch (_) {
      // Fall through to standard format
    }
  }

  if (!oauthToken.access_token || !oauthToken.refresh_token) {
    const err = new Error('YouTube Music token incomplete. Please re-authenticate.');
    err.code = 'AUTH_DATA_MISSING';
    err.statusCode = 500;
    throw err;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresAtEpoch = oauthToken.expires_at
    ? Math.floor(new Date(oauthToken.expires_at).getTime() / 1000)
    : null;
  const expiresIn = expiresAtEpoch ? Math.max(0, expiresAtEpoch - nowSeconds) : 3600;

  return {
    access_token: oauthToken.access_token,
    refresh_token: oauthToken.refresh_token,
    token_type: 'Bearer',
    expires_in: expiresIn,
    expires_at: expiresAtEpoch,
    scope: 'https://www.googleapis.com/auth/youtube'
  };
};

// scheduleAppleShareUrlResolution removed - URL resolution not possible via API
// Manual sharing in Apple Music app required, Slack notification sent instead

export const markRequestInProgress = (requestId) => {
  if (!requestId) return;
  try {
    resolveQueries().updateExportRequestStatus.run('in_progress', null, requestId);
  } catch (err) {
    console.warn('[EXPORT_REQUEST] Failed to mark request in progress', err?.message);
  }
};

export const updateRequestProgress = (requestRow, platform, outcome) => {
  if (!requestRow || !requestRow.id) return;
  try {
    const destinations = getDestinationsFromStoredValue(requestRow.destinations);
    const results = parseResultsField(requestRow.results);
    results[platform] = outcome;
    resolveQueries().updateExportRequestResults.run(JSON.stringify(results), requestRow.id);

    const total = destinations.length;
    const successCount = destinations.filter((dest) => results[dest]?.status === 'success').length;
    const failureCount = destinations.filter((dest) => results[dest]?.status === 'error').length;

    if (total === 0) {
      resolveQueries().updateExportRequestStatus.run('failed', 'No destinations recorded on request', requestRow.id);
      return;
    }

    if (successCount === total) {
      resolveQueries().updateExportRequestStatus.run('completed', null, requestRow.id);
      return;
    }

    if (failureCount > 0 && successCount + failureCount === total) {
      const latestError = destinations
        .map((dest) => results[dest]?.error)
        .filter(Boolean)
        .slice(-1)[0] || outcome.error || 'One or more exports failed';
      resolveQueries().updateExportRequestStatus.run('failed', latestError, requestRow.id);
      return;
    }

    resolveQueries().updateExportRequestStatus.run('in_progress', null, requestRow.id);
  } catch (err) {
    console.warn('[EXPORT_REQUEST] Failed to update request progress', err?.message);
  }
};

const handleExportFailureInternal = (requestRow, platform, error) => {
  if (!requestRow) return;
  const outcome = {
    status: 'error',
    error: error.message,
    occurred_at: new Date().toISOString(),
    platform
  };
  updateRequestProgress(requestRow, platform, outcome);
};

const ensureAuthToken = (platform, { accountType = 'flowerpil', curatorId = null } = {}) => {
  const oauthToken = getExportToken(platform, { accountType, curatorId });
  if (!oauthToken || (platform !== 'apple' && isTokenExpired(oauthToken))) {
    const error = new Error('Platform authentication required');
    error.code = 'AUTH_REQUIRED';
    error.details = { accountType, curatorId };
    if (platform === 'spotify') {
      error.authUrl = spotifyService.getAuthURL(null, true);
    } else if (platform === 'tidal') {
      error.authUrl = tidalService.getAuthURL();
    }
    return { token: null, error };
  }
  return { token: oauthToken, error: null };
};

export const runPlaylistExport = async ({
  playlistId,
  platform,
  isPublic = true,
  allowDraftExport = false,
  exportRequestId = null,
  accountPreference = null,
  mode = null
}) => {
  const startTime = Date.now();
  const exportRequestRow = exportRequestId ? resolveQueries().findExportRequestById.get(exportRequestId) : null;
  if (exportRequestId && !exportRequestRow) {
    const error = new Error('Export request not found');
    error.statusCode = 404;
    throw error;
  }
  if (exportRequestRow && Number(exportRequestRow.playlist_id) !== Number(playlistId)) {
    const error = new Error('Export request does not belong to playlist');
    error.statusCode = 400;
    throw error;
  }

  if (exportRequestRow) {
    markRequestInProgress(exportRequestRow.id);
  }

  const eligibility = await exportValidationService.validatePlaylistEligibility(playlistId, {
    allowUnpublishedDrafts: allowDraftExport
  });

  if (!eligibility.eligible) {
    const error = new Error(eligibility.error || 'Playlist not eligible for export');
    error.code = eligibility.code || 'NOT_ELIGIBLE';
    error.statusCode = 400;
    throw error;
  }

  const playlist = eligibility.playlist;
  const tracks = resolveQueries().getTracksByPlaylistId.all(playlistId);
  const playlistData = { ...playlist, isPublic };

  let resolvedAccountPreference = accountPreference;
  if (!resolvedAccountPreference && exportRequestRow?.account_preferences) {
    const parsedPrefs = parseAccountPreferencesField(exportRequestRow.account_preferences);
    resolvedAccountPreference = parsedPrefs?.[platform] || null;
  }

  const requestedAccountType = resolvedAccountPreference?.account_type === 'curator' ? 'curator' : 'flowerpil';
  let requestedCuratorId = requestedAccountType === 'curator'
    ? Number(resolvedAccountPreference?.owner_curator_id) || Number(exportRequestRow?.curator_id) || Number(playlist?.curator_id) || null
    : null;

  if (Number.isNaN(requestedCuratorId)) {
    requestedCuratorId = null;
  }

  let accountFallbackUsed = false;
  let resolvedAccountType = requestedAccountType;
  let resolvedOwnerCuratorId = requestedCuratorId || null;

  let { token: oauthToken, error: authError } = ensureAuthToken(platform, {
    accountType: requestedAccountType,
    curatorId: requestedCuratorId
  });

  if (authError && requestedAccountType === 'curator') {
    console.warn(
      `[EXPORT] Curator token unavailable for playlist ${playlistId} (${requestedCuratorId || 'unknown'}); falling back to Flowerpil account`
    );
    accountFallbackUsed = true;
    resolvedAccountType = 'flowerpil';
    resolvedOwnerCuratorId = null;
    ({ token: oauthToken, error: authError } = ensureAuthToken(platform, {
      accountType: 'flowerpil',
      curatorId: null
    }));
  }

  if (authError) {
    authError.statusCode = 401;
    throw authError;
  }

  // Prepare job metadata for tracking
  const jobMetadata = {
    token_id: oauthToken?.id || null,
    account_type: oauthToken?.account_type || resolvedAccountType,
    account_label: oauthToken?.account_label || 'unknown',
    requested_account_type: requestedAccountType,
    requested_owner_curator_id: requestedCuratorId || null,
    resolved_account_type: resolvedAccountType,
    resolved_owner_curator_id: resolvedOwnerCuratorId,
    account_fallback_used: accountFallbackUsed,
    platform,
    initiated_at: new Date().toISOString(),
    playlist_id: playlistId
  };

  // Resolve export mode from parameter, account preferences, or default
  const resolvedMode = mode
    || resolvedAccountPreference?.mode
    || 'replace_existing';

  // Resolve managed export state
  let managedExport = null;
  try {
    managedExport = resolveQueries().findPlaylistDspExport?.get(playlistId, platform) || null;
  } catch (_) {
    // Table may not exist yet; treat as no managed export
  }

  const capabilities = getPlatformCapabilities(platform);

  // Only sync in-place if the managed export belongs to the same account we resolved.
  // If the account changed (e.g. curator fallback to flowerpil), create a new export instead.
  const ownershipMatches = managedExport
    && managedExport.account_type === resolvedAccountType
    && (resolvedAccountType === 'flowerpil'
      || String(managedExport.owner_curator_id) === String(resolvedOwnerCuratorId));

  const shouldSync = resolvedMode === 'replace_existing'
    && capabilities.canReplace
    && managedExport?.remote_playlist_id
    && ownershipMatches;

  // Create snapshot before mutation only when we will actually sync in-place.
  // If ownership doesn't match, we'll create a new export, so snapshotting the
  // old remote playlist as rollback state for the new one would be incorrect.
  let snapshotId = null;
  if (shouldSync) {
    try {
      const rollbackCapability = capabilities.canReplace ? 'full' : 'audit_only';
      const insertInfo = resolveQueries().createExportSnapshot.run(
        playlistId,
        platform,
        managedExport.id,
        resolvedMode,
        exportRequestId || null,
        resolvedAccountType,
        resolvedOwnerCuratorId,
        managedExport.remote_playlist_id,
        managedExport.remote_playlist_url,
        JSON.stringify({ title: playlist.title, track_count: tracks.length }),
        null, // remote_state - could be populated by reading remote tracks
        rollbackCapability,
        'created'
      );
      snapshotId = Number(insertInfo.lastInsertRowid);
    } catch (snapErr) {
      console.warn('[EXPORT] Snapshot creation failed (non-fatal):', snapErr.message);
    }
  }

  let result;
  try {
    if (shouldSync && platform === 'spotify') {
      // Sync existing Spotify playlist (replace-in-place)
      result = await spotifyService.syncPlaylist(
        oauthToken.access_token,
        managedExport.remote_playlist_id,
        playlistData,
        tracks
      );
    } else if (shouldSync && platform === 'tidal') {
      // Sync existing TIDAL playlist (replace-in-place)
      result = await tidalService.syncPlaylist(
        oauthToken.access_token,
        managedExport.remote_playlist_id,
        playlistData,
        tracks
      );
    } else if (platform === 'spotify') {
      let userInfo;
      try {
        userInfo = oauthToken.user_info ? JSON.parse(oauthToken.user_info) : null;
      } catch (error) {
        const err = new Error('Invalid user information stored. Please re-authenticate.');
        err.code = 'AUTH_DATA_CORRUPTED';
        err.statusCode = 500;
        throw err;
      }

      if (!userInfo || !userInfo.id) {
        const err = new Error('User information missing. Please re-authenticate.');
        err.code = 'AUTH_DATA_MISSING';
        err.statusCode = 500;
        throw err;
      }

      result = await spotifyService.exportPlaylist(
        oauthToken.access_token,
        userInfo.id,
        playlistData,
        tracks
      );
    } else if (platform === 'tidal') {
      result = await tidalService.exportPlaylist(
        oauthToken.access_token,
        playlistData,
        tracks
      );
    } else if (platform === 'apple') {
      result = await appleMusicApiService.exportPlaylist(
        oauthToken.access_token,
        playlistData,
        tracks
      );
    } else if (platform === 'youtube_music') {
      const oauthJson = buildYouTubeMusicOAuthJson(oauthToken);
      result = await youtubeMusicService.exportPlaylist(
        oauthJson,
        playlistData,
        tracks
      );
    } else {
      const error = new Error('Unsupported platform');
      error.statusCode = 400;
      throw error;
    }
  } catch (error) {
    handleExportFailureInternal(exportRequestRow, platform, error);

    // Persist failure metadata
    if (exportRequestRow) {
      const executionTimeMs = Date.now() - startTime;
      const failureMetadata = {
        ...jobMetadata,
        failed_at: new Date().toISOString(),
        execution_time_ms: executionTimeMs,
        success: false,
        error_code: error.code || 'UNKNOWN',
        error_message: error.message
      };

      try {
        resolveQueries().updateExportRequestJobMetadata.run(
          JSON.stringify(failureMetadata),
          exportRequestRow.id
        );
      } catch (metaErr) {
        console.warn('[EXPORT] Failed to persist failure metadata:', metaErr.message);
      }
    }

    throw error;
  }

  try {
    // Store returned URL directly without validation/normalization
    const urlToPersist = (() => {
      if (!result || !result.success || !result.playlistUrl) return null;
      // Store whatever URL is returned from the export
      return result.playlistUrl;
    })();

    if (urlToPersist) {
      const pl = resolveQueries().getPlaylistById.get(playlistId);
      if (pl) {
        // Only write to exported_*_url. Preserve the source *_url field
        // (which may hold an imported/pasted URL) to keep source and export state separate.
        const urlField = platform === 'spotify' ? 'spotify_url'
          : platform === 'tidal' ? 'tidal_url'
          : platform === 'apple' ? 'apple_url'
          : platform === 'youtube_music' ? 'youtube_music_url' : null;
        const exportedField = platform === 'spotify' ? 'exported_spotify_url'
          : platform === 'tidal' ? 'exported_tidal_url'
          : platform === 'apple' ? 'exported_apple_url'
          : platform === 'youtube_music' ? 'exported_youtube_music_url' : null;

        if (exportedField) {
          // Always update the exported_*_url
          const stmtExported = resolveDb().prepare(`UPDATE playlists SET ${exportedField} = ? WHERE id = ?`);
          stmtExported.run(urlToPersist, playlistId);

          // Only set the source *_url if it was empty (don't overwrite imported URLs)
          if (urlField && !pl[urlField]) {
            const stmtSource = resolveDb().prepare(`UPDATE playlists SET ${urlField} = ? WHERE id = ?`);
            stmtSource.run(urlToPersist, playlistId);
          }
        }
      }
    }
  } catch (persistErr) {
    console.error('[EXPORT] Failed to persist exported playlist URL:', persistErr.message);
  }

  // Upsert managed export state for forward compatibility
  if (result?.success && result?.playlistUrl) {
    try {
      const remoteId = result.playlistId || null;
      resolveQueries().upsertPlaylistDspExport.run(
        playlistId,
        platform,
        resolvedAccountType,
        resolvedOwnerCuratorId,
        remoteId,
        result.playlistUrl,
        playlistData.title || null,
        'active',
        snapshotId
      );
    } catch (upsertErr) {
      console.warn('[EXPORT] Failed to upsert managed export state:', upsertErr.message);
    }
  }

  // Update snapshot status if one was created
  if (snapshotId && result?.success) {
    try {
      resolveDb().prepare('UPDATE playlist_export_snapshots SET status = ? WHERE id = ?').run('applied', snapshotId);
    } catch (_) {
      // non-fatal
    }
  }

  if (platform === 'apple' && result?.success) {
    // Apple Music API creates library playlists (p.xxx) which cannot be shared programmatically
    // The only way to get a public share URL is manual sharing in the Apple Music app
    if (!result.playlistUrl) {
      const appleLibraryId = result.playlistId;
      const playlistTitle = playlistData.title || playlist.title || 'playlist';

      // Send Slack notification for manual sharing
      // Note: Notification failures do not break export workflow
      try {
        // Get curator information for notification
        const curator = playlist.curator_id
          ? resolveQueries().getCuratorById.get(playlist.curator_id)
          : null;
        const curatorName = curator?.name || 'Unknown Curator';

        slackService.notifyAppleExportSuccess({
          playlistId,
          playlistTitle,
          curatorName,
          appleLibraryId,
          storefront: 'us' // TODO: Could extract from user_info if needed
        }).catch(notifyError => {
          console.warn('[EXPORT] Slack notification failed (non-critical):', notifyError.message);
        });
      } catch (error) {
        console.warn('[EXPORT] Failed to send Slack notification (non-critical):', error.message);
      }

      // Mark as pending manual share (no automated resolution possible)
      result.shareUrlPending = true;
    } else if (typeof result.shareUrlPending === 'undefined') {
      result.shareUrlPending = false;
    }
  }

  if (exportRequestRow) {
    const outcome = {
      status: 'success',
      playlistUrl: result?.playlistUrl || null,
      exported_at: new Date().toISOString(),
      platform
    };
    updateRequestProgress(exportRequestRow, platform, outcome);

    // Persist job metadata for operational tracking
    const executionTimeMs = Date.now() - startTime;
    const finalMetadata = {
      ...jobMetadata,
      completed_at: new Date().toISOString(),
      execution_time_ms: executionTimeMs,
      tracks_exported: result?.tracksAdded || 0,
      success: true
    };

    try {
      resolveQueries().updateExportRequestJobMetadata.run(
        JSON.stringify(finalMetadata),
        exportRequestRow.id
      );
    } catch (metaErr) {
      console.warn('[EXPORT] Failed to persist job metadata:', metaErr.message);
    }
  }

  return { result, playlist, playlistData };
};

export const handleExportFailure = handleExportFailureInternal;

export const getExportAuthToken = getExportToken;
export const exportValidation = exportValidationService;
