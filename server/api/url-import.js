import express from 'express';
import Joi from 'joi';
import { authMiddleware } from '../middleware/auth.js';
import { publicUserImportLimiter } from '../middleware/publicUserLimits.js';
import { getQueries } from '../database/db.js';
import logger from '../utils/logger.js';
import { detectUrlTarget, resolveTrackFromUrl } from '../services/urlImportService.js';
import { startUrlImportJob } from '../services/urlImportRunner.js';

const router = express.Router();
const queries = new Proxy({}, {
  get(_target, property) {
    return getQueries()[property];
  }
});

router.use(authMiddleware);

const createJobSchema = Joi.object({
  url: Joi.string().trim().min(5).required(),
  playlist_id: Joi.number().integer().min(1).allow(null).optional(),
  mode: Joi.string().valid('append', 'replace').default('append'),
  append_position: Joi.string().valid('top', 'bottom').default('bottom'),
  update_metadata: Joi.boolean().default(true),
  draft_session_id: Joi.string().trim().max(128).allow(null).optional()
});

const resolveTrackSchema = Joi.object({
  url: Joi.string().trim().min(5).required(),
  match: Joi.boolean().default(true)
});

router.post('/detect', (req, res) => {
  const url = String(req.body?.url || '').trim();
  const detected = detectUrlTarget(url);
  return res.json({ success: true, data: detected });
});

// POST /api/v1/url-import/jobs
router.post('/jobs', publicUserImportLimiter, (req, res) => {
  const { error, value } = createJobSchema.validate(req.body || {}, { abortEarly: false });
  if (error) {
    return res.status(400).json({ success: false, error: error.details?.[0]?.message || 'Invalid payload' });
  }

  const ownerCuratorId = req.user?.curator_id;
  if (!ownerCuratorId) {
    return res.status(403).json({ success: false, error: 'Curator account required' });
  }

  const detected = detectUrlTarget(value.url);
  if (!detected?.platform) {
    return res.status(400).json({ success: false, error: 'Unsupported URL' });
  }

  if (detected.kind !== 'playlist' && detected.kind !== 'auto') {
    return res.status(400).json({ success: false, error: 'Only playlist URLs are supported in background imports' });
  }

  try {
    const normalizedUrl = detected.normalizedUrl || value.url;

    // Dedupe: check for a recent job with identical params within 30s window
    const existingJob = queries.findRecentImportJob.get(
      ownerCuratorId,
      normalizedUrl,
      value.playlist_id || null,
      value.mode,
      value.append_position,
      value.update_metadata ? 1 : 0
    );

    if (existingJob) {
      logger.info('URL_IMPORT_JOB', 'Deduplicated URL import job', {
        existingJobId: existingJob.id,
        curatorId: ownerCuratorId,
        url: normalizedUrl
      });
      return res.json({ success: true, data: { jobId: existingJob.id } });
    }

    const result = queries.insertUrlImportJob.run(
      ownerCuratorId,
      value.playlist_id || null,
      'playlist',
      detected.platform,
      normalizedUrl,
      value.mode,
      value.append_position,
      value.update_metadata ? 1 : 0,
      'pending',
      value.draft_session_id || null
    );

    const jobId = result.lastInsertRowid;

    logger.info('URL_IMPORT_JOB', 'Enqueued URL import job', {
      jobId,
      curatorId: ownerCuratorId,
      platform: detected.platform,
      url: normalizedUrl,
      playlistId: value.playlist_id || null
    });

    // Log import for public user rate limiting
    if (req.logPublicUserImport) {
      req.logPublicUserImport('playlist', detected.platform, 1);
    }

    startUrlImportJob(jobId);
    return res.json({ success: true, data: { jobId } });
  } catch (err) {
    logger.error('URL_IMPORT_JOB', 'Failed to enqueue URL import job', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to create import job' });
  }
});

// GET /api/v1/url-import/jobs/:id
router.get('/jobs/:id', (req, res) => {
  const jobId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(jobId) || jobId <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid job id' });
  }

  try {
    const job = queries.getUrlImportJobById.get(jobId);
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    const ownerCuratorId = req.user?.curator_id;
    if (req.user?.role === 'curator' && ownerCuratorId && job.owner_curator_id !== ownerCuratorId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const safeResult = (() => {
      try {
        return job.result_json ? JSON.parse(job.result_json) : null;
      } catch {
        return null;
      }
    })();

    return res.json({
      success: true,
      data: {
        id: job.id,
        owner_curator_id: job.owner_curator_id,
        target_playlist_id: job.target_playlist_id || null,
        kind: job.kind,
        source_platform: job.source_platform,
        source_url: job.source_url,
        mode: job.mode,
        append_position: job.append_position,
        update_metadata: Boolean(job.update_metadata),
        status: job.status,
        progress: {
          total: job.total_items || 0,
          processed: job.processed_items || 0
        },
        result: safeResult,
        last_error: job.last_error || null,
        created_at: job.created_at,
        updated_at: job.updated_at,
        started_at: job.started_at,
        completed_at: job.completed_at
      }
    });
  } catch (err) {
    logger.error('URL_IMPORT_JOB', 'Failed to load URL import job', { jobId, error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to load job' });
  }
});

// POST /api/v1/url-import/test-playlist
// Test endpoint for validating platform URL imports - fetches playlist and enriches with Spotify metadata
router.post('/test-playlist', async (req, res) => {
  const url = String(req.body?.url || '').trim();
  if (!url) {
    return res.status(400).json({ success: false, error: 'URL is required' });
  }

  const detected = detectUrlTarget(url);
  if (!detected?.platform) {
    return res.status(400).json({ success: false, error: 'Unsupported URL format' });
  }

  if (detected.kind !== 'playlist' && detected.kind !== 'auto') {
    return res.status(400).json({ success: false, error: 'URL does not appear to be a playlist' });
  }

  const startTime = Date.now();

  try {
    // Import the playlist resolution function
    const { resolvePlaylistFromUrl } = await import('../services/urlImportService.js');

    // Fetch playlist without cross-platform matching first (faster)
    const result = await resolvePlaylistFromUrl(url, { match: false });
    const fetchTime = Date.now() - startTime;

    // For non-Spotify sources, enrich tracks with Spotify metadata for accuracy
    let enrichedTracks = result.tracks || [];
    let enrichmentStats = { total: enrichedTracks.length, enriched: 0, failed: 0 };

    if (result.platform !== 'spotify' && enrichedTracks.length > 0) {
      const SpotifyService = (await import('../services/spotifyService.js')).default;
      const spotifyService = new SpotifyService();

      const enrichPromises = enrichedTracks.slice(0, 50).map(async (track) => {
        try {
          // Search Spotify by ISRC first, then metadata
          let spotifyMatch = null;
          if (track.isrc) {
            spotifyMatch = await spotifyService.searchByISRC(track.isrc);
          }
          if (!spotifyMatch && track.artist && track.title) {
            spotifyMatch = await spotifyService.searchByMetadata(track.artist, track.title);
          }

          if (spotifyMatch) {
            enrichmentStats.enriched++;
            return {
              ...track,
              spotify_id: spotifyMatch.id,
              spotify_url: spotifyMatch.url,
              // Use Spotify metadata as more accurate source
              _spotify_title: spotifyMatch.title,
              _spotify_artist: spotifyMatch.artist,
              _match_confidence: spotifyMatch.confidence,
              _match_source: spotifyMatch.source
            };
          }
          return track;
        } catch (err) {
          enrichmentStats.failed++;
          return track;
        }
      });

      enrichedTracks = await Promise.all(enrichPromises);
      // Append any tracks beyond the first 50 (unenriched)
      if (result.tracks.length > 50) {
        enrichedTracks = [...enrichedTracks, ...result.tracks.slice(50)];
      }
    }

    const totalTime = Date.now() - startTime;

    return res.json({
      success: true,
      data: {
        platform: result.platform,
        url: detected.normalizedUrl || url,
        playlist: {
          title: result.playlist?.title || 'Unknown',
          description: result.playlist?.description || '',
          image: result.playlist?.image || null,
          trackCount: enrichedTracks.length
        },
        tracks: enrichedTracks.map((t, idx) => ({
          position: idx + 1,
          title: t.title || '',
          artist: t.artist || '',
          album: t.album || '',
          duration: t.duration || '',
          isrc: t.isrc || null,
          spotify_id: t.spotify_id || null,
          apple_id: t.apple_id || null,
          tidal_id: t.tidal_id || null,
          // Spotify enrichment data (if applicable)
          _spotify_title: t._spotify_title || null,
          _spotify_artist: t._spotify_artist || null,
          _match_confidence: t._match_confidence || null,
          _match_source: t._match_source || null
        })),
        stats: {
          fetchTimeMs: fetchTime,
          totalTimeMs: totalTime,
          enrichment: result.platform !== 'spotify' ? enrichmentStats : null
        }
      }
    });
  } catch (err) {
    logger.error('URL_IMPORT_TEST', 'Playlist test failed', {
      url,
      platform: detected.platform,
      error: err.message,
      userId: req.user?.id
    });
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch playlist',
      platform: detected.platform
    });
  }
});

// POST /api/v1/url-import/resolve-track
router.post('/resolve-track', async (req, res) => {
  const { error, value } = resolveTrackSchema.validate(req.body || {}, { abortEarly: false });
  if (error) {
    return res.status(400).json({ success: false, error: error.details?.[0]?.message || 'Invalid payload' });
  }

  try {
    const track = await resolveTrackFromUrl(value.url, { match: value.match });
    return res.json({ success: true, data: track });
  } catch (err) {
    logger.error('URL_IMPORT_RESOLVE', 'Failed to resolve track URL', {
      url: value.url,
      error: err.message,
      userId: req.user?.id
    });
    return res.status(500).json({ success: false, error: err.message || 'Failed to resolve track URL' });
  }
});

export default router;
