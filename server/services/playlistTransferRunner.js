import SpotifyService from './spotifyService.js';
import appleMusicApiService from './appleMusicApiService.js';
import tidalService from './tidalService.js';
import { EnhancedTrackMatcher } from './matching/trackMatcher.js';
import { getDatabase, getQueries } from '../database/db.js';
import { getExportToken, isTokenExpired } from './exportTokenStore.js';
import slackService from './SlackNotificationService.js';
import logger from '../utils/logger.js';

const db = getDatabase();
const queries = getQueries();
const spotifyService = new SpotifyService();

const RUNNING_JOBS = new Set();

const SAFE_JSON_PARSE = (value, fallback) => {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
};

const serialize = (value) => JSON.stringify(value ?? null);

const parseDestinations = (value) => {
  const parsed = SAFE_JSON_PARSE(value, null);
  if (Array.isArray(parsed)) return parsed.map((d) => String(d).toLowerCase());
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);
  }
  return [];
};

const normalizeDurationMs = (duration) => {
  if (!duration && duration !== 0) return null;
  if (typeof duration === 'number') return duration;
  const parsed = Number(duration);
  return Number.isFinite(parsed) ? parsed : null;
};

const baseTrackShape = (track) => ({
  title: track.title || '',
  artist: track.artist || '',
  album: track.album || '',
  isrc: track.isrc || '',
  spotify_id: track.spotify_id || track.id || null,
  spotify_url: track.spotify_url || null,
  duration_ms: normalizeDurationMs(track.duration_ms ?? track.duration),
  position: track.position ?? null
});

const getAppleToken = () => {
  const token = getExportToken('apple', { accountType: 'flowerpil' });
  if (!token) {
    const error = new Error('Apple Music authentication required');
    error.code = 'APPLE_AUTH_REQUIRED';
    return { error, token: null };
  }
  return { token, error: null };
};

const getTidalToken = () => {
  const token = getExportToken('tidal', { accountType: 'flowerpil' });
  if (!token || isTokenExpired(token)) {
    const error = new Error('TIDAL authentication required');
    error.code = 'TIDAL_AUTH_REQUIRED';
    return { error, token: null };
  }
  return { token, error: null };
};

const updateJobStatus = (jobId, status, errorMessage = null) => {
  try {
    queries.updateTransferJobStatus.run(status, status, status, jobId);
    if (errorMessage) {
      queries.updateTransferJobError.run(errorMessage, jobId);
    }
  } catch (err) {
    logger.error?.('TRANSFER_RUNNER', 'Failed to update job status', { jobId, status, error: err.message });
  }
};

const updateJobProgress = (jobId, { total, processed, matched, failed }) => {
  try {
    queries.updateTransferJobProgress.run(total, processed, matched, failed, jobId);
  } catch (err) {
    logger.error?.('TRANSFER_RUNNER', 'Failed to update job progress', { jobId, error: err.message });
  }
};

const persistResults = (jobId, { results, trackResults }) => {
  try {
    if (results) {
      queries.updateTransferJobResults.run(serialize(results), jobId);
    }
    if (trackResults) {
      queries.updateTransferJobTrackResults.run(serialize(trackResults), jobId);
    }
  } catch (err) {
    logger.error?.('TRANSFER_RUNNER', 'Failed to persist results', { jobId, error: err.message });
  }
};

const fetchSpotifyPlaylist = async (playlistId) => {
  const accessToken = await spotifyService.getClientCredentialsToken();
  const details = await spotifyService.getPlaylistDetails(accessToken, playlistId);
  const playlistName = details?.name || 'Spotify Playlist';

  const tracks = Array.isArray(details?.tracks)
    ? details.tracks
    : Array.isArray(details?.tracks?.items)
      ? details.tracks.items
      : [];

  const transformedTracks = tracks.map((item, index) => {
    const track = item.track || item;
    return {
      position: index + 1,
      title: track.name,
      artist: Array.isArray(track.artists) ? track.artists.map((a) => a.name).join(', ') : '',
      album: track.album?.name || '',
      year: track.album?.release_date ? new Date(track.album.release_date).getFullYear() : null,
      duration_ms: track.duration_ms,
      duration: track.duration_ms,
      spotify_id: track.id,
      spotify_url: track.external_urls?.spotify || null,
      album_artwork_url: track.album?.images?.[0]?.url || '',
      isrc: track.external_ids?.isrc || '',
      explicit: !!track.explicit,
      popularity: track.popularity || 0
    };
  });

  return { playlistName, tracks: transformedTracks };
};

const summarizeTrackCounts = (trackResults) => {
  const matched = trackResults.filter((tr) => tr.apple?.matched || tr.tidal?.matched).length;
  const failed = trackResults.length - matched;
  return { matched, failed };
};

const createDestinationPlaylist = async (platform, token, playlistMeta) => {
  if (platform === 'apple') {
    return appleMusicApiService.createPlaylist(token.access_token, playlistMeta);
  }
  if (platform === 'tidal') {
    return tidalService.createPlaylist(token.access_token, playlistMeta);
  }
  throw new Error(`Unsupported platform: ${platform}`);
};

const addTracksToDestination = async (platform, token, playlistId, matches, playlistMeta) => {
  if (!matches.length) {
    return { added: 0, acceptedEntries: [] };
  }

  if (platform === 'apple') {
    const trackEntries = matches.map(({ track, match }, index) => ({
      track,
      appleId: String(match.id),
      position: track.position ?? index
    }));
    const addResult = await appleMusicApiService.addTracksToPlaylist(
      token.access_token,
      playlistId,
      trackEntries,
      { storefront: playlistMeta.storefront }
    );
    return { added: addResult?.acceptedCount || 0, acceptedEntries: addResult?.acceptedEntries || [] };
  }

  if (platform === 'tidal') {
    const tidalIds = matches.map(({ match }) => String(match.id));
    const added = await tidalService.addTracksToPlaylist(token.access_token, playlistId, tidalIds);
    return { added: added || 0, acceptedEntries: tidalIds };
  }

  return { added: 0, acceptedEntries: [] };
};

const fetchExistingTrackIds = async (destination, token, playlistId, playlistMeta) => {
  try {
    if (destination === 'apple') {
      return await appleMusicApiService.getLibraryPlaylistTrackIds(token.access_token, playlistId, {
        storefront: playlistMeta.storefront
      });
    }
    if (destination === 'tidal') {
      return await tidalService.getPlaylistTrackIds(token.access_token, playlistId);
    }
  } catch (error) {
    logger.warn?.('TRANSFER_RUNNER', 'Failed to fetch destination playlist tracks', {
      destination,
      playlistId,
      error: error.message
    });
  }
  return { ids: [], total: 0 };
};

const verifyAndBackfillDestination = async (destination, token, playlistId, matches, playlistMeta) => {
  const expectedIds = [];
  for (const { match } of matches) {
    if (match?.id) {
      expectedIds.push(String(match.id));
    }
  }
  if (!expectedIds.length) {
    return { expected: 0, existing: 0, missingBefore: 0, addedFromRetry: 0, remainingMissing: 0 };
  }

  const expectedSet = new Set(expectedIds);
  const existing = await fetchExistingTrackIds(destination, token, playlistId, playlistMeta);
  const existingSet = new Set((existing?.ids || []).map((id) => String(id)));

  const missing = [...expectedSet].filter((id) => !existingSet.has(id));
  if (!missing.length) {
    return {
      expected: expectedSet.size,
      existing: existingSet.size,
      missingBefore: 0,
      addedFromRetry: 0,
      remainingMissing: 0
    };
  }

  const retryMatches = matches.filter(({ match }) => match?.id && missing.includes(String(match.id)));
  let addedFromRetry = 0;

  if (retryMatches.length) {
    logger.info?.('TRANSFER_RUNNER', 'Retrying missing tracks for destination', {
      destination,
      playlistId,
      missingCount: retryMatches.length
    });

    const retryResult = await addTracksToDestination(destination, token, playlistId, retryMatches, playlistMeta);
    addedFromRetry = retryResult?.added || 0;
  }

  const finalExisting = await fetchExistingTrackIds(destination, token, playlistId, playlistMeta);
  const finalExistingSet = new Set((finalExisting?.ids || []).map((id) => String(id)));
  const remainingMissing = [...expectedSet].filter((id) => !finalExistingSet.has(id)).length;

  return {
    expected: expectedSet.size,
    existing: finalExistingSet.size,
    missingBefore: missing.length,
    addedFromRetry,
    remainingMissing
  };
};

const buildResultForPlatform = (platform, playlist, addResult, totalTracks, verification) => {
  const tracksAdded = verification?.existing ?? addResult?.added ?? 0;
  return {
    platform,
    status: verification?.remainingMissing > 0 ? 'partial' : 'success',
    playlistUrl: playlist?.url || null,
    playlistId: playlist?.id || null,
    playlistName: playlist?.name || null,
    tracksAdded,
    totalTracks,
    coverage: totalTracks ? tracksAdded / totalTracks : 0,
    acceptedEntries: addResult?.acceptedEntries || [],
    verification
  };
};

export const runTransfer = async (jobId) => {
  if (!jobId) return;
  if (RUNNING_JOBS.has(jobId)) {
    logger.info?.('TRANSFER_RUNNER', 'Job already running, skipping duplicate start', { jobId });
    return;
  }

  RUNNING_JOBS.add(jobId);
  const startTime = Date.now();

  try {
    const jobRow = queries.getTransferJobById.get(jobId);
    if (!jobRow) {
      throw new Error(`Transfer job ${jobId} not found`);
    }

    const destinations = parseDestinations(jobRow.destinations);
    if (!destinations.length) {
      updateJobStatus(jobId, 'failed', 'No destinations selected');
      return;
    }

    updateJobStatus(jobId, 'fetching');

    const { playlistName, tracks } = await fetchSpotifyPlaylist(jobRow.source_playlist_id);
    try {
      db.prepare('UPDATE playlist_transfer_jobs SET source_playlist_name = ? WHERE id = ?').run(playlistName, jobId);
    } catch (err) {
      logger.warn?.('TRANSFER_RUNNER', 'Failed to persist source playlist name', { jobId, error: err.message });
    }
    if (!tracks.length) {
      updateJobStatus(jobId, 'failed', 'No tracks found on source playlist');
      return;
    }

    updateJobProgress(jobId, {
      total: tracks.length,
      processed: 0,
      matched: 0,
      failed: 0
    });

    const matchers = {
      apple: new EnhancedTrackMatcher('apple', { threshold: jobRow.match_threshold }),
      tidal: new EnhancedTrackMatcher('tidal', { threshold: jobRow.match_threshold })
    };
    const relaxedThreshold = Math.max(60, (jobRow.match_threshold || 75) - 10);
    const relaxedMatchers = {
      apple: new EnhancedTrackMatcher('apple', { threshold: relaxedThreshold }),
      tidal: new EnhancedTrackMatcher('tidal', { threshold: relaxedThreshold })
    };

    const trackResults = [];
    const matchesByDestination = {
      apple: [],
      tidal: []
    };

    updateJobStatus(jobId, 'processing');

    for (let i = 0; i < tracks.length; i++) {
      const latestStatus = queries.getTransferJobById.get(jobId)?.status;
      if (latestStatus === 'cancelled') {
        logger.info?.('TRANSFER_RUNNER', 'Job cancelled, stopping runner', { jobId });
        return;
      }

      const track = tracks[i];
      const base = baseTrackShape(track);

      for (const destination of destinations) {
        const matcher = matchers[destination];
        if (!matcher) continue;

        let matchResult = null;
        try {
          matchResult = await matcher.matchTrack(track, { threshold: jobRow.match_threshold });
        } catch (err) {
          logger.warn?.('TRANSFER_RUNNER', 'Match failed for track', {
            destination,
            track: track.title,
            error: err.message
          });
        }

        if ((!matchResult || !matchResult.matched) && relaxedThreshold < matcher.threshold) {
          try {
            const relaxedMatcher = relaxedMatchers[destination];
            matchResult = await relaxedMatcher.matchTrack(track, { threshold: relaxedThreshold });
            if (matchResult?.matched) {
              logger.info?.('TRANSFER_RUNNER', 'Relaxed match succeeded', {
                destination,
                track: track.title,
                strategy: matchResult?.strategy,
                confidence: matchResult?.confidence
              });
            }
          } catch (err) {
            logger.warn?.('TRANSFER_RUNNER', 'Relaxed match failed for track', {
              destination,
              track: track.title,
              error: err.message
            });
          }
        }

        const formattedResult = {
          matched: Boolean(matchResult?.matched),
          confidence: matchResult?.confidence || 0,
          strategy: matchResult?.strategy || null,
          url: matchResult?.url || null,
          id: matchResult?.id || null,
          tier: matchResult?.tier || null,
          cached: Boolean(matchResult?.cached),
          reason: matchResult?.reason || null
        };

        base[destination] = formattedResult;

        if (formattedResult.matched && matchResult?.id) {
          matchesByDestination[destination].push({ track, match: matchResult });
        }
      }

      trackResults.push(base);

      if ((i + 1) % 10 === 0 || i === tracks.length - 1) {
        const counts = summarizeTrackCounts(trackResults);
        updateJobProgress(jobId, {
          total: tracks.length,
          processed: i + 1,
          matched: counts.matched,
          failed: counts.failed
        });
        persistResults(jobId, { trackResults });
      }
    }

    const results = {};

    for (const destination of destinations) {
      const matches = matchesByDestination[destination];
      const totalTracks = tracks.length;

      let playlistMeta = {
        title: playlistName,
        description: `Transfer from Spotify (${totalTracks} tracks)`,
        isPublic: true,
        storefront: 'us'
      };

      let token = null;
      let authError = null;

      if (destination === 'apple') {
        ({ token, error: authError } = getAppleToken());
      } else if (destination === 'tidal') {
        ({ token, error: authError } = getTidalToken());
      }

      if (authError) {
        results[destination] = { platform: destination, status: 'auth_required', error: authError.message };
        continue;
      }

      try {
        const playlist = await createDestinationPlaylist(destination, token, playlistMeta);
        const addResult = await addTracksToDestination(destination, token, playlist.id, matches, playlistMeta);
        let verification = null;

        try {
          verification = await verifyAndBackfillDestination(
            destination,
            token,
            playlist.id,
            matches,
            playlistMeta
          );
        } catch (verifyErr) {
          logger.warn?.('TRANSFER_RUNNER', 'Verification/backfill failed', {
            destination,
            playlistId: playlist.id,
            error: verifyErr.message
          });
        }

        results[destination] = buildResultForPlatform(
          destination,
          playlist,
          addResult,
          totalTracks,
          verification
        );
      } catch (error) {
        logger.error?.('TRANSFER_RUNNER', 'Destination processing failed', {
          destination,
          error: error.message
        });
        results[destination] = { platform: destination, status: 'error', error: error.message };
      }
    }

    const hasSuccess = Object.values(results).some((res) => res?.status === 'success' || res?.status === 'partial');
    const authRequired = Object.values(results).some((res) => res?.status === 'auth_required');

    const counts = summarizeTrackCounts(trackResults);
    updateJobProgress(jobId, {
      total: tracks.length,
      processed: tracks.length,
      matched: counts.matched,
      failed: counts.failed
    });

    persistResults(jobId, { results, trackResults });
    if (!hasSuccess && authRequired) {
      updateJobStatus(jobId, 'auth_required', 'Authentication required for one or more destinations');
    } else {
      updateJobStatus(jobId, 'completed');
    }

    try {
      await slackService.sendTransferCompleteNotification(
        { ...jobRow, source_playlist_name: playlistName, destinations },
        { results, stats: { matched: counts.matched, failed: counts.failed, total: tracks.length }, durationMs: Date.now() - startTime }
      );
    } catch (err) {
      logger.warn?.('TRANSFER_RUNNER', 'Slack notification failed', { error: err.message });
    }
  } catch (error) {
    logger.error?.('TRANSFER_RUNNER', 'Transfer failed', { jobId, error: error.message });
    updateJobStatus(jobId, 'failed', error.message);
  } finally {
    RUNNING_JOBS.delete(jobId);
  }
};

export const startTransfer = (jobId) => {
  setImmediate(() => {
    runTransfer(jobId).catch((err) => {
      logger.error?.('TRANSFER_RUNNER', 'Unhandled error in transfer runner', { jobId, error: err.message });
    });
  });
};

export default {
  runTransfer,
  startTransfer
};
