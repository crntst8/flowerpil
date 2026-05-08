import express from 'express';
import Joi from 'joi';
import { optionalAuth } from '../middleware/auth.js';
import logger from '../utils/logger.js';
import { detectUrlTarget, resolveTrackFromUrl, resolvePlaylistFromUrl } from '../services/urlImportService.js';
import SpotifyService from '../services/spotifyService.js';
import { searchTidalByTrack } from '../services/tidalService.js';
import { searchAppleMusicByTrack } from '../services/appleMusicService.js';

const router = express.Router();

const resolveSchema = Joi.object({
  url: Joi.string().trim().min(5).required()
});

// Cross-link a single track to all missing platforms
async function crossLinkTrack(track, spotifyService) {
  const out = { ...track };

  // Fill Spotify if missing
  if (!out.spotify_id) {
    try {
      const match = out.isrc
        ? await spotifyService.searchByISRC(out.isrc)
        : null;
      const result = match || (out.artist && out.title
        ? await spotifyService.searchByMetadata(out.artist, out.title)
        : null);
      if (result?.id) {
        out.spotify_id = String(result.id);
        out.spotify_url = result.url || `https://open.spotify.com/track/${result.id}`;
      }
    } catch {}
  }

  // Fill TIDAL if missing
  if (!out.tidal_id) {
    try {
      const match = await searchTidalByTrack({
        title: out.title, artist: out.artist, album: out.album,
        duration: out.duration, isrc: out.isrc || null
      });
      if (match?.id) {
        out.tidal_id = String(match.id);
        out.tidal_url = match.url || `https://tidal.com/browse/track/${match.id}`;
      }
    } catch {}
  }

  // Fill Apple Music if missing
  if (!out.apple_id) {
    try {
      const match = await searchAppleMusicByTrack({
        title: out.title, artist: out.artist, album: out.album,
        duration: out.duration, isrc: out.isrc || null
      });
      if (match?.id) {
        out.apple_id = String(match.id);
        out.apple_music_url = match.url || null;
      }
    } catch {}
  }

  return out;
}

// POST /api/v1/quick-import/resolve
router.post('/resolve', optionalAuth, async (req, res) => {
  const { error, value } = resolveSchema.validate(req.body || {}, { abortEarly: false });
  if (error) {
    return res.status(400).json({ success: false, error: error.details?.[0]?.message || 'Invalid payload' });
  }

  const detected = detectUrlTarget(value.url);
  if (!detected?.platform) {
    return res.status(400).json({ success: false, error: 'Unsupported URL format' });
  }

  const startTime = Date.now();

  try {
    // Single track resolution
    if (detected.kind === 'track') {
      const track = await resolveTrackFromUrl(value.url, { match: true });
      // resolveTrackFromUrl with match:true only finds ONE preferred DSP;
      // cross-link the remaining platforms
      const spotifyService = new SpotifyService();
      const crossLinked = await crossLinkTrack(track, spotifyService);
      const totalTime = Date.now() - startTime;

      logger.info('QUICK_IMPORT', 'Resolved single track', {
        platform: detected.platform,
        url: value.url,
        totalTimeMs: totalTime,
        userId: req.user?.id || null
      });

      return res.json({
        success: true,
        data: {
          kind: 'track',
          platform: detected.platform,
          url: detected.normalizedUrl || value.url,
          track: crossLinked,
          stats: { totalTimeMs: totalTime }
        }
      });
    }

    // Playlist resolution (fetch tracks without cross-matching -- it only finds one DSP anyway)
    const result = await resolvePlaylistFromUrl(value.url, { match: false });
    const rawTracks = (result.tracks || []).slice(0, 50);

    // Cross-link every track to Spotify + TIDAL + Apple Music in parallel
    const spotifyService = new SpotifyService();
    const enrichedTracks = await Promise.all(
      rawTracks.map((t) => crossLinkTrack(t, spotifyService))
    );

    const totalTime = Date.now() - startTime;

    logger.info('QUICK_IMPORT', 'Resolved playlist', {
      platform: result.platform,
      url: value.url,
      trackCount: enrichedTracks.length,
      totalTimeMs: totalTime,
      userId: req.user?.id || null
    });

    return res.json({
      success: true,
      data: {
        kind: 'playlist',
        platform: result.platform,
        url: detected.normalizedUrl || value.url,
        playlist: {
          title: result.playlist?.title || 'Unknown',
          description: result.playlist?.description || '',
          image: result.playlist?.image || null,
          trackCount: enrichedTracks.length
        },
        tracks: enrichedTracks.map((t, idx) => ({
          ...t,
          position: idx + 1
        })),
        stats: {
          totalTimeMs: totalTime
        }
      }
    });
  } catch (err) {
    logger.error('QUICK_IMPORT', 'Resolution failed', {
      url: value.url,
      platform: detected.platform,
      error: err.message,
      userId: req.user?.id || null
    });
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to resolve URL',
      platform: detected.platform
    });
  }
});

export default router;
