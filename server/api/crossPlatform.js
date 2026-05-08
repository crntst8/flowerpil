import express from 'express';
import { getQueries, getDatabase } from '../database/db.js';
import crossPlatformLinkingService from '../services/crossPlatformLinkingService.js';
import { testTidalConnection } from '../services/tidalService.js';
import SpotifyService from '../services/spotifyService.js';
import { optionalAuth } from '../middleware/auth.js';
import logger from '../utils/logger.js';
import { getAllowedWorkerKeys, normalizeWorkerHeaderKey } from '../utils/workerAuth.js';

const router = express.Router();

/**
 * Cross-Platform DSP Linking API Routes
 *
 * Provides endpoints for batch playlist linking, individual track linking,
 * job status tracking, and manual override management.
 */

// Attach optional auth so we can enforce curator ownership where needed
router.use(optionalAuth);

// Start batch playlist linking
router.post('/link-playlist', async (req, res) => {
  try {
    const { playlistId, forceRefresh = false } = req.body;
    
    if (!playlistId) {
      return res.status(400).json({
        success: false,
        error: 'Playlist ID is required'
      });
    }
    
    // Verify playlist exists
    const queries = getQueries();
    const playlist = queries.getPlaylistById.get(playlistId);
    if (!playlist) {
      return res.status(404).json({
        success: false,
        error: 'Playlist not found'
      });
    }
    
    // Access control: curators may only operate on their own playlists
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    if (req.user.role === 'curator') {
      if (!req.user.curator_id || playlist.curator_id !== req.user.curator_id) {
        return res.status(403).json({ success: false, error: 'Access denied: playlist not owned' });
      }
    }

    // If distributed mode is enabled, mark tracks as pending for workers and return quickly
    if (String(process.env.LINKING_DISTRIBUTED || '').toLowerCase() === 'on') {
      const db = getDatabase();
      let updated = 0;
      if (forceRefresh) {
        const stmt = db.prepare(`
          UPDATE tracks
          SET apple_music_url = NULL,
              match_confidence_apple = NULL,
              match_source_apple = NULL,
              tidal_url = NULL,
              match_confidence_tidal = NULL,
              match_source_tidal = NULL,
              youtube_music_id = NULL,
              youtube_music_url = NULL,
              match_confidence_youtube = NULL,
              match_source_youtube = NULL,
              linking_status = 'pending',
              linking_error = NULL,
              linking_max_age_exceeded = 0,
              linking_updated_at = CURRENT_TIMESTAMP,
              linking_lease_owner = NULL,
              linking_lease_expires = NULL
          WHERE playlist_id = ?
        `);
        const info = stmt.run(playlistId);
        updated = info.changes || 0;
      } else {
        const stmt = db.prepare(`
          UPDATE tracks
          SET linking_status = 'pending',
              linking_error = NULL,
              linking_max_age_exceeded = 0,
              linking_updated_at = CURRENT_TIMESTAMP,
              linking_lease_owner = NULL,
              linking_lease_expires = NULL
          WHERE playlist_id = ?
            AND linking_status != 'completed'
        `);
        const info = stmt.run(playlistId);
        updated = info.changes || 0;
      }
      return res.json({ success: true, data: { updated, mode: 'distributed' }, message: `Queued ${updated} tracks for linking: ${playlist.title}` });
    }

    logger.info('CROSS_PLATFORM', 'Starting cross-platform linking for playlist', { playlistTitle: playlist.title, playlistId });

    const result = await crossPlatformLinkingService.startPlaylistLinking(playlistId, {
      forceRefresh: Boolean(forceRefresh)
    });

    res.json({
      success: true,
      data: result,
      message: `Cross-platform linking ${result.status} for playlist: ${playlist.title}`
    });

  } catch (error) {
    logger.error('API_ERROR', 'Error starting playlist linking', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to start playlist linking'
    });
  }
});

// Link individual track
router.post('/link-track', async (req, res) => {
  try {
    const { trackId, forceRefresh = false } = req.body;
    
    if (!trackId) {
      return res.status(400).json({
        success: false,
        error: 'Track ID is required'
      });
    }
    
    // Verify track exists
    const queries = getQueries();
    const track = queries.getTrackById.get(trackId);
    if (!track) {
      return res.status(404).json({
        success: false,
        error: 'Track not found'
      });
    }

    // Access control: curators may only operate on tracks in their own playlists
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    if (req.user.role === 'curator') {
      const playlist = queries.getPlaylistById.get(track.playlist_id);
      if (!req.user.curator_id || !playlist || playlist.curator_id !== req.user.curator_id) {
        return res.status(403).json({ success: false, error: 'Access denied: track not owned' });
      }
    }
    
    // If distributed mode is enabled, mark this track as pending for workers
    if (String(process.env.LINKING_DISTRIBUTED || '').toLowerCase() === 'on') {
      const db = getDatabase();
      if (forceRefresh) {
        db.prepare(`
          UPDATE tracks
          SET apple_music_url = NULL,
              match_confidence_apple = NULL,
              match_source_apple = NULL,
              tidal_url = NULL,
              match_confidence_tidal = NULL,
              match_source_tidal = NULL,
              youtube_music_id = NULL,
              youtube_music_url = NULL,
              match_confidence_youtube = NULL,
              match_source_youtube = NULL,
              linking_status = 'pending',
              linking_error = NULL,
              linking_max_age_exceeded = 0,
              linking_updated_at = CURRENT_TIMESTAMP,
              linking_lease_owner = NULL,
              linking_lease_expires = NULL
          WHERE id = ?
        `).run(trackId);
      } else {
        db.prepare(`
          UPDATE tracks
          SET linking_status = 'pending',
              linking_error = NULL,
              linking_max_age_exceeded = 0,
              linking_updated_at = CURRENT_TIMESTAMP,
              linking_lease_owner = NULL,
              linking_lease_expires = NULL
          WHERE id = ?
        `).run(trackId);
      }
      const updatedTrack = queries.getTrackById.get(trackId);
      return res.json({ success: true, data: updatedTrack, message: 'Track queued for linking (distributed)' });
    }

    logger.info('CROSS_PLATFORM', 'Starting cross-platform linking for track', { artist: track.artist, title: track.title, trackId });

    const result = await crossPlatformLinkingService.linkTrack(trackId, {
      forceRefresh: Boolean(forceRefresh)
    });
    
    res.json({
      success: true,
      data: result,
      message: `Cross-platform linking completed for: ${track.artist} - ${track.title}`
    });

  } catch (error) {
    logger.error('API_ERROR', 'Error linking track', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to link track'
    });
  }
});

// Get job status
router.get('/job-status/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    
    const status = crossPlatformLinkingService.getJobStatus(jobId);
    
    if (status.error) {
      return res.status(404).json({
        success: false,
        error: status.error
      });
    }
    
    res.json({
      success: true,
      data: status
    });

  } catch (error) {
    logger.error('API_ERROR', 'Error getting job status', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get job status'
    });
  }
});

// Get playlist linking statistics
router.get('/stats/:playlistId', (req, res) => {
  try {
    const { playlistId } = req.params;
    
    // Verify playlist exists
    const queries = getQueries();
    const playlist = queries.getPlaylistById.get(playlistId);
    if (!playlist) {
      return res.status(404).json({
        success: false,
        error: 'Playlist not found'
      });
    }
    
    // Access control: curators may only view stats for their own playlists
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    if (req.user.role === 'curator') {
      if (!req.user.curator_id || playlist.curator_id !== req.user.curator_id) {
        return res.status(403).json({ success: false, error: 'Access denied: playlist not owned' });
      }
    }

    const stats = crossPlatformLinkingService.getPlaylistLinkingStats(playlistId);
    
    res.json({
      success: true,
      data: {
        playlistId: parseInt(playlistId, 10),
        playlistTitle: playlist.title,
        ...stats
      }
    });

  } catch (error) {
    logger.error('API_ERROR', 'Error getting playlist stats', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get playlist statistics'
    });
  }
});

// Get backfill preview - tracks with partial coverage
router.get('/backfill-preview/:playlistId', (req, res) => {
  try {
    const { playlistId } = req.params;

    // Verify playlist exists
    const queries = getQueries();
    const playlist = queries.getPlaylistById.get(playlistId);
    if (!playlist) {
      return res.status(404).json({
        success: false,
        error: 'Playlist not found'
      });
    }

    // Access control
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    if (req.user.role === 'curator') {
      if (!req.user.curator_id || playlist.curator_id !== req.user.curator_id) {
        return res.status(403).json({ success: false, error: 'Access denied: playlist not owned' });
      }
    }

    const preview = crossPlatformLinkingService.getBackfillPreview(playlistId);

    res.json({
      success: true,
      data: {
        playlistId: parseInt(playlistId, 10),
        playlistTitle: playlist.title,
        ...preview
      }
    });

  } catch (error) {
    logger.error('API_ERROR', 'Error getting backfill preview', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get backfill preview'
    });
  }
});

// Start backfill for tracks with partial coverage
router.post('/backfill-playlist', async (req, res) => {
  try {
    const { playlistId } = req.body;

    if (!playlistId) {
      return res.status(400).json({
        success: false,
        error: 'Playlist ID is required'
      });
    }

    // Verify playlist exists
    const queries = getQueries();
    const playlist = queries.getPlaylistById.get(playlistId);
    if (!playlist) {
      return res.status(404).json({
        success: false,
        error: 'Playlist not found'
      });
    }

    // Access control
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    if (req.user.role === 'curator') {
      if (!req.user.curator_id || playlist.curator_id !== req.user.curator_id) {
        return res.status(403).json({ success: false, error: 'Access denied: playlist not owned' });
      }
    }

    logger.info('CROSS_PLATFORM', 'Starting backfill for playlist', { playlistTitle: playlist.title, playlistId });

    const result = await crossPlatformLinkingService.startBackfillMissingLinks(playlistId);

    res.json({
      success: true,
      data: result,
      message: `Backfill ${result.status} for playlist: ${playlist.title}`
    });

  } catch (error) {
    logger.error('API_ERROR', 'Error starting backfill', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to start backfill'
    });
  }
});

// Manual override for disputed matches
router.post('/manual-override', async (req, res) => {
  try {
    const { trackId, platform, url } = req.body;
    
    if (!trackId || !platform || !url) {
      return res.status(400).json({
        success: false,
        error: 'Track ID, platform, and URL are required'
      });
    }
    
    const validPlatforms = ['apple', 'tidal'];
    if (!validPlatforms.includes(platform)) {
      return res.status(400).json({
        success: false,
        error: 'Platform must be "apple" or "tidal"'
      });
    }
    
    // Verify track exists
    const queries = getQueries();
    const track = queries.getTrackById.get(trackId);
    if (!track) {
      return res.status(404).json({
        success: false,
        error: 'Track not found'
      });
    }
    
    // Validate URL format
    const { validateAppleMusicUrl } = await import('../services/appleMusicService.js');
    const { validateTidalUrl } = await import('../services/tidalService.js');
    
    const isValidUrl = platform === 'apple' 
      ? validateAppleMusicUrl(url)
      : validateTidalUrl(url);
    
    if (!isValidUrl) {
      return res.status(400).json({
        success: false,
        error: `Invalid ${platform === 'apple' ? 'Apple Music' : 'Tidal'} URL format`
      });
    }
    
    crossPlatformLinkingService.setManualOverride(trackId, platform, url);
    
    // Get updated track
    const updatedTrack = queries.getTrackById.get(trackId);
    const enrichedTrack = crossPlatformLinkingService.hydrateTrackWithLinkMetadata(updatedTrack);
    
    res.json({
      success: true,
      data: enrichedTrack,
      message: `Manual override set for ${platform === 'apple' ? 'Apple Music' : 'Tidal'}: ${track.artist} - ${track.title}`
    });

  } catch (error) {
    logger.error('API_ERROR', 'Error setting manual override', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to set manual override'
    });
  }
});

// Flag track for manual review
router.post('/flag-for-review', (req, res) => {
  try {
    const { trackId, reason } = req.body;
    
    if (!trackId || !reason) {
      return res.status(400).json({
        success: false,
        error: 'Track ID and reason are required'
      });
    }
    
    // Verify track exists
    const queries = getQueries();
    const track = queries.getTrackById.get(trackId);
    if (!track) {
      return res.status(404).json({
        success: false,
        error: 'Track not found'
      });
    }
    
    crossPlatformLinkingService.flagTrackForReview(trackId, reason);
    
    // Get updated track
    const updatedTrack = queries.getTrackById.get(trackId);
    const enrichedTrack = crossPlatformLinkingService.hydrateTrackWithLinkMetadata(updatedTrack);
    
    res.json({
      success: true,
      data: enrichedTrack,
      message: `Track flagged for review: ${track.artist} - ${track.title}`
    });

  } catch (error) {
    logger.error('API_ERROR', 'Error flagging track for review', error);
    res.status(500).json({
      success: false,
      error: 'Failed to flag track for review'
    });
  }
});

// Get tracks flagged for review
router.get('/flagged-tracks/:playlistId?', (req, res) => {
  try {
    const { playlistId } = req.params;
    const queries = getQueries();
    
    let flaggedTracks;
    
    if (playlistId) {
      // Get flagged tracks for specific playlist
      flaggedTracks = queries.getDatabase().prepare(`
        SELECT * FROM tracks 
        WHERE playlist_id = ? AND flagged_for_review = 1
        ORDER BY linking_updated_at DESC
      `).all(playlistId);
    } else {
      // Get all flagged tracks
      flaggedTracks = queries.getDatabase().prepare(`
        SELECT t.*, p.title as playlist_title 
        FROM tracks t
        JOIN playlists p ON t.playlist_id = p.id
        WHERE t.flagged_for_review = 1
        ORDER BY t.linking_updated_at DESC
      `).all();
    }
    
    const enrichedFlagged = crossPlatformLinkingService.hydrateTracksWithLinkMetadata(flaggedTracks);

    res.json({
      success: true,
      data: enrichedFlagged,
      count: enrichedFlagged.length
    });

  } catch (error) {
    logger.error('API_ERROR', 'Error getting flagged tracks', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get flagged tracks'
    });
  }
});

// Test service connections
router.get('/test-connections', async (req, res) => {
  try {
    logger.info('CROSS_PLATFORM', 'Testing cross-platform service connections');

    // Apple Music API - always available
    const appleResult = {
      status: 'connected',
      service_type: 'api',
      error: null
    };
    
    // Test Tidal API + Spotify client credentials
    const [tidalStatus, spotifyStatus] = await Promise.allSettled([
      testTidalConnection(),
      (async () => {
        try {
          const sp = new SpotifyService();
          await sp.getClientCredentialsToken();
          return true;
        } catch (e) {
          throw new Error(e?.message || 'Spotify credentials failed');
        }
      })()
    ]);
    
    const results = {
      apple: appleResult,
      tidal: {
        status: tidalStatus.status === 'fulfilled' && tidalStatus.value ? 'connected' : 'failed',
        service_type: 'api',
        error: tidalStatus.status === 'rejected' ? tidalStatus.reason?.message : null
      },
      spotify: {
        status: spotifyStatus.status === 'fulfilled' && spotifyStatus.value ? 'connected' : 'failed',
        service_type: 'api',
        error: spotifyStatus.status === 'rejected' ? spotifyStatus.reason?.message : null
      }
    };
    
    const tidalConnected = results.tidal.status === 'connected';
    const spotifyConnected = results.spotify.status === 'connected';
    
    res.json({
      success: true,
      data: results,
      message: tidalConnected && spotifyConnected
        ? 'All cross-platform services are available'
        : (!tidalConnected && !spotifyConnected)
          ? 'Tidal and Spotify connections failed - Apple scraping available'
          : (!tidalConnected)
            ? 'Tidal API connection failed - Apple and Spotify available'
            : 'Spotify connection failed - Apple and Tidal available'
    });

  } catch (error) {
    logger.error('API_ERROR', 'Error testing service connections', error);
    res.status(500).json({
      success: false,
      error: 'Failed to test service connections'
    });
  }
});

// Get linking history for a track
router.get('/track-history/:trackId', (req, res) => {
  try {
    const { trackId } = req.params;
    const db = getDatabase();

    const track = db.prepare(`
      SELECT 
        *,
        CASE 
          WHEN apple_music_url IS NOT NULL THEN 'linked'
          WHEN match_source_apple = 'manual' THEN 'manual'
          ELSE 'unlinked'
        END as apple_status,
        CASE 
          WHEN tidal_url IS NOT NULL THEN 'linked'
          WHEN match_source_tidal = 'manual' THEN 'manual'
          ELSE 'unlinked'
        END as tidal_status
      FROM tracks 
      WHERE id = ?
    `).get(trackId);

    if (!track) {
      return res.status(404).json({
        success: false,
        error: 'Track not found'
      });
    }

    const enrichedTrack = crossPlatformLinkingService.hydrateTrackWithLinkMetadata(track);

    res.json({
      success: true,
      data: enrichedTrack
    });

  } catch (error) {
    logger.error('API_ERROR', 'Error getting track history', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get track history'
    });
  }
});

// Clean up old jobs
router.post('/cleanup-jobs', (req, res) => {
  try {
    const { maxAgeHours = 24 } = req.body;
    
    crossPlatformLinkingService.cleanupOldJobs(maxAgeHours);
    
    res.json({
      success: true,
      message: `Cleaned up jobs older than ${maxAgeHours} hours`
    });

  } catch (error) {
    logger.error('API_ERROR', 'Error cleaning up jobs', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clean up jobs'
    });
  }
});

/**
 * Worker authentication middleware for distributed linking endpoints
 */
function requireWorkerAuth(req, res, next) {
  const header = normalizeWorkerHeaderKey(req.get('X-Worker-Key'));
  const allowed = getAllowedWorkerKeys();
  if (!allowed.length) {
    return res.status(503).json({ success: false, error: 'Worker auth not configured' });
  }
  if (!header || !allowed.includes(header)) {
    return res.status(401).json({ success: false, error: 'Unauthorized worker' });
  }
  return next();
}

// Worker configuration (polling parameters, rate limits)
router.get('/worker-config', requireWorkerAuth, (req, res) => {
  const rpm = parseInt(process.env.APPLE_MUSIC_RATE_LIMIT || '10', 10);
  const ttlSec = parseInt(process.env.LINKING_LEASE_TTL_SEC || '120', 10);
  const storefront = crossPlatformLinkingService.getAppleStorefront();
  const distributedEnabled = String(process.env.LINKING_DISTRIBUTED || '').toLowerCase() === 'on';

  res.json({
    success: true,
    data: {
      enabled: distributedEnabled,
      apple: { concurrency: 1, rpm, storefront },
      tidal: { concurrency: 3, delayMs: 100 },
      spotify: { concurrency: 3 },
      lease: { ttlSec, renewEverySec: Math.max(30, Math.min(90, Math.floor(ttlSec / 2))) },
      batch: { size: 5 }
    }
  });
});

// Lease a batch of tracks for processing
router.post('/lease', requireWorkerAuth, (req, res) => {
  try {
    const { max = 5, playlistId, workerId } = req.body || {};
    if (!workerId) {
      return res.status(400).json({ success: false, error: 'workerId is required' });
    }
    const limit = Math.max(1, Math.min(50, parseInt(max, 10) || 5));
    const ttlSec = parseInt(process.env.LINKING_LEASE_TTL_SEC || '120', 10);
    const db = getDatabase();

    const leaseTxn = db.transaction((limitParam, playlistFilter, owner) => {
      // Requeue expired leases back to pending
      db.exec(`
        UPDATE tracks
        SET linking_status = 'pending',
            linking_lease_owner = NULL,
            linking_lease_expires = NULL,
            linking_updated_at = CURRENT_TIMESTAMP
        WHERE linking_status = 'processing'
          AND linking_lease_expires IS NOT NULL
          AND linking_lease_expires < datetime('now')
      `);

      // Select candidate tracks
      const selectBase = `
        SELECT id, playlist_id, position, title, artist, album, isrc, duration, year
        FROM tracks
        WHERE linking_status = 'pending'
          AND (linking_lease_expires IS NULL OR linking_lease_expires < datetime('now'))
          ${playlistFilter ? 'AND playlist_id = @playlistId' : ''}
        ORDER BY linking_updated_at IS NULL DESC, linking_updated_at ASC, id ASC
        LIMIT @limit
      `;
      const candidates = db.prepare(selectBase).all({ limit: limitParam, playlistId });

      if (!candidates.length) return [];

      // Lease each selected track (guard with same predicate)
      for (const t of candidates) {
        db.prepare(`
          UPDATE tracks
          SET linking_status = 'processing',
              linking_lease_owner = ?,
              linking_lease_expires = datetime('now', ? || ' seconds'),
              linking_updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND linking_status = 'pending'
            AND (linking_lease_expires IS NULL OR linking_lease_expires < datetime('now'))
        `).run(owner, '+' + ttlSec, t.id);
      }

      return candidates;
    });

    const leased = leaseTxn(limit, !!playlistId, workerId);
    return res.json({ success: true, data: { tracks: leased } });
  } catch (error) {
    logger.error('WORKER', 'Lease error', error);
    return res.status(500).json({ success: false, error: 'Failed to lease tracks' });
  }
});

// Heartbeat to extend lease expiry for in-flight tracks
router.post('/heartbeat', requireWorkerAuth, (req, res) => {
  try {
    const { trackIds = [], workerId, extendSec = 90 } = req.body || {};
    if (!workerId || !Array.isArray(trackIds) || trackIds.length === 0) {
      return res.status(400).json({ success: false, error: 'workerId and trackIds required' });
    }
    const db = getDatabase();
    const extend = Math.max(30, parseInt(extendSec, 10) || 90);
    const stmt = db.prepare(`
      UPDATE tracks
      SET linking_lease_expires = datetime('now', ? || ' seconds')
      WHERE id = ?
        AND linking_lease_owner = ?
        AND linking_status = 'processing'
    `);
    let updated = 0;
    for (const id of trackIds) {
      const info = stmt.run('+' + extend, id, workerId);
      updated += info.changes || 0;
    }
    return res.json({ success: true, data: { updated } });
  } catch (error) {
    logger.error('WORKER', 'Heartbeat error', error);
    return res.status(500).json({ success: false, error: 'Failed to extend leases' });
  }
});

// Release leases (puts tracks back to pending if not terminal)
router.post('/release', requireWorkerAuth, (req, res) => {
  try {
    const { trackIds = [], workerId } = req.body || {};
    if (!workerId || !Array.isArray(trackIds) || trackIds.length === 0) {
      return res.status(400).json({ success: false, error: 'workerId and trackIds required' });
    }
    const db = getDatabase();
    const stmt = db.prepare(`
      UPDATE tracks
      SET linking_lease_owner = NULL,
          linking_lease_expires = NULL,
          linking_status = CASE WHEN linking_status IN ('completed','failed') THEN linking_status ELSE 'pending' END,
          linking_updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
        AND linking_lease_owner = @owner
    `);
    let released = 0;
    for (const id of trackIds) {
      const info = stmt.run({ id, owner: workerId });
      released += info.changes || 0;
    }
    return res.json({ success: true, data: { released } });
  } catch (error) {
    logger.error('WORKER', 'Release error', error);
    return res.status(500).json({ success: false, error: 'Failed to release leases' });
  }
});

// Report results for processed tracks and clear leases
router.post('/report', requireWorkerAuth, async (req, res) => {
  try {
    const { workerId, results = [] } = req.body || {};
    if (!workerId || !Array.isArray(results) || results.length === 0) {
      return res.status(400).json({ success: false, error: 'workerId and results required' });
    }

    const db = getDatabase();
    const MAX_RETRIES = 3;
    let applied = 0;

    for (const r of results) {
      const { trackId, apple, tidal, spotify, youtube, error } = r;
      if (!trackId) continue;

      // Only accept reports from current lease owner
      const track = db.prepare('SELECT linking_lease_owner, linking_retry_count FROM tracks WHERE id = ?').get(trackId);
      if (!track || track.linking_lease_owner !== workerId) continue;

      const retryCount = track.linking_retry_count || 0;

      // Apply successful results
      if (apple && apple.url) {
        crossPlatformLinkingService.updateTrackAppleLink(trackId, apple);
      }
      if (tidal && tidal.url) {
        crossPlatformLinkingService.updateTrackTidalLink(trackId, tidal);
      }
      if (spotify && spotify.id) {
        crossPlatformLinkingService.updateTrackSpotifyId(trackId, spotify);
      }
      if (youtube && (youtube.url || youtube.id || youtube.videoId)) {
        const videoId = youtube.videoId || youtube.id;
        const normalizedYouTube = {
          ...youtube,
          url: youtube.url || (videoId ? `https://music.youtube.com/watch?v=${videoId}` : null)
        };
        if (normalizedYouTube.url) {
          crossPlatformLinkingService.updateTrackYouTubeLink(trackId, normalizedYouTube);
        }
      }

      // Determine if error is retryable (rate limits, timeouts, transient failures)
      const isRetryableError = error && (
        error.includes('429') ||
        error.includes('Too Many Requests') ||
        error.includes('timeout') ||
        error.includes('ETIMEDOUT') ||
        error.includes('ECONNRESET') ||
        error.includes('rate limit')
      );

      // Check if we have partial failures (some platforms missing)
      const hasAppleLink = !!apple?.url;
      const hasTidalLink = !!tidal?.url;
      const hasSpotifyLink = !!spotify?.id;
      const hasYouTubeLink = !!(youtube?.url || youtube?.id || youtube?.videoId);
      const hasAnyLink = hasAppleLink || hasTidalLink || hasSpotifyLink || hasYouTubeLink;
      const hasMissingPlatforms = !hasAppleLink || !hasTidalLink || !hasSpotifyLink || !hasYouTubeLink;
      const canRetry = retryCount < MAX_RETRIES && (isRetryableError || (hasAnyLink && hasMissingPlatforms));

      let status;
      if (canRetry) {
        // Re-queue for retry if we haven't exceeded max retries
        status = 'pending';
        db.prepare(`
          UPDATE tracks
          SET linking_retry_count = ?,
              linking_last_retry_at = CURRENT_TIMESTAMP,
              linking_lease_owner = NULL,
              linking_lease_expires = NULL,
              linking_status = 'pending',
              linking_error = ?,
              linking_max_age_exceeded = 0,
              linking_updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(retryCount + 1, error || null, trackId);

        logger.info('LINKING_RETRY', `Re-queuing track ${trackId} for retry ${retryCount + 1}/${MAX_RETRIES}`, { error });
      } else {
        // Mark as completed or failed based on results
        status = hasAnyLink ? 'completed' : 'failed';
        crossPlatformLinkingService.updateTrackLinkingStatus(trackId, status, error || null);

        // Clear lease
        db.prepare(`
          UPDATE tracks
          SET linking_lease_owner = NULL,
              linking_lease_expires = NULL,
              linking_updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(trackId);

        if (hasMissingPlatforms && hasAnyLink) {
          logger.warn('LINKING_PARTIAL', `Track ${trackId} marked completed with partial links after ${retryCount} retries`);
        }
      }

      applied++;
    }

    return res.json({ success: true, data: { applied } });
  } catch (error) {
    logger.error('WORKER', 'Report error', error);
    return res.status(500).json({ success: false, error: 'Failed to apply report' });
  }
});

export default router;
