import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import logger from '../utils/logger.js';
import sharp from 'sharp';
import { join } from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import {
  validateQobuzUrl,
  scrapeQobuzPlaylist,
  matchQobuzTracks
} from '../services/qobuzService.js';
import SpotifyService from '../services/spotifyService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

/**
 * Helper: Parse duration string (MM:SS or HH:MM:SS) to milliseconds
 */
function parseDurationToMs(duration) {
  if (!duration) return null;
  if (typeof duration === 'number') return duration;
  const parts = String(duration).trim().split(':').map(p => parseInt(p, 10));
  if (parts.length === 2) {
    return (parts[0] * 60 + parts[1]) * 1000;
  } else if (parts.length === 3) {
    return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  }
  return null;
}

/**
 * Helper: Process and save image from URL to /storage/uploads
 */
async function processAndSaveImageFromUrl(imageUrl) {
  if (!imageUrl) return null;

  try {
    const resp = await fetch(imageUrl);
    if (!resp.ok) return null;

    const buffer = Buffer.from(await resp.arrayBuffer());
    const uploadsDir = join(__dirname, '../../storage/uploads');

    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
    const sizes = [
      { suffix: '', width: 800, height: 800 },
      { suffix: '_md', width: 400, height: 400 },
      { suffix: '_sm', width: 200, height: 200 }
    ];

    for (const size of sizes) {
      const outputPath = join(uploadsDir, `${filename.replace('.jpg', size.suffix + '.jpg')}`);
      await sharp(buffer)
        .resize(size.width, size.height, { fit: 'cover', position: 'center' })
        .jpeg({ quality: 85 })
        .toFile(outputPath);
    }

    return filename;
  } catch (error) {
    console.warn(`⚠️  Failed to process image from URL: ${error.message}`);
    return null;
  }
}

/**
 * GET /api/v1/qobuz/validate-url
 * Validate Qobuz URL format
 */
router.get('/validate-url', (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL parameter is required'
      });
    }

    const validation = validateQobuzUrl(url);

    res.json({
      success: true,
      data: validation
    });
  } catch (error) {
    console.error('Error validating Qobuz URL:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate URL'
    });
  }
});

/**
 * GET /api/v1/qobuz/playlist-info/:playlistId
 * Get basic info about a Qobuz playlist (track count, etc.) from cached data
 */
router.get('/playlist-info/:playlistId', (req, res) => {
  try {
    const { playlistId } = req.params;

    // Check if cached data exists
    const cachePath = join(__dirname, '../../data/qobuz', `${playlistId}.json`);

    try {
      const data = fs.readFileSync(cachePath, 'utf-8');
      const tracks = JSON.parse(data);

      res.json({
        success: true,
        data: {
          playlistId,
          trackCount: Array.isArray(tracks) ? tracks.length : 0,
          cached: true
        }
      });
    } catch (cacheError) {
      // No cached data available
      res.json({
        success: true,
        data: {
          playlistId,
          trackCount: null,
          cached: false
        }
      });
    }
  } catch (error) {
    console.error('Error fetching playlist info:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch playlist info'
    });
  }
});

/**
 * POST /api/v1/qobuz/import
 * Import tracks from Qobuz playlist URL
 *
 * Body: { url: string, curatorId: number, playlistId?: number }
 *
 * Returns: { tracks: [...], skipped: [...], summary: {...} }
 */
router.post('/import', authMiddleware, async (req, res) => {
  const startTime = Date.now();
  const { url, curatorId, playlistId } = req.body;

  logger.info('QOBUZ_IMPORT', 'Starting Qobuz playlist import', {
    url,
    curatorId,
    playlistId: playlistId || 'new'
  });

  try {
    // Validate URL
    const validation = validateQobuzUrl(url);
    if (!validation.valid) {
      logger.warn('QOBUZ_IMPORT', 'Invalid Qobuz URL', { url });
      return res.status(400).json({
        success: false,
        error: 'Invalid Qobuz URL format. Expected: https://www.qobuz.com/{region}/playlists/{name}/{id} or https://widget.qobuz.com/playlist/{id} or https://open.qobuz.com/playlist/{id}'
      });
    }

    // Step 1: Scrape Qobuz playlist
    logger.info('QOBUZ_IMPORT', 'Scraping Qobuz playlist', { playlistId: validation.playlistId });
    const qobuzTracks = await scrapeQobuzPlaylist(url);

    if (!qobuzTracks || qobuzTracks.length === 0) {
      logger.warn('QOBUZ_IMPORT', 'No tracks found in Qobuz playlist', { url });
      return res.status(404).json({
        success: false,
        error: 'No tracks found in Qobuz playlist'
      });
    }

    logger.info('QOBUZ_IMPORT', `Found ${qobuzTracks.length} tracks in Qobuz playlist`);

    // Step 2: Match tracks across DSPs
    logger.info('QOBUZ_IMPORT', 'Starting cross-platform matching');
    const matchResults = await matchQobuzTracks(qobuzTracks, url);

    // Step 3: Transform matched tracks to Flowerpil format
    logger.info('QOBUZ_IMPORT', `Transforming ${matchResults.matched.length} matched tracks`);

    // Fetch full track details from Spotify for all matched tracks
    const spotifyService = new SpotifyService();
    
    const processedTracks = await Promise.all(
      matchResults.matched.map(async (matchResult, index) => {
        const { spotifyTrack, appleMatch, tidalMatch, qobuzUrl, qobuzTrack } = matchResult;

        // Fetch full track details if we only have simplified data
        let fullTrack = spotifyTrack;
        if (spotifyTrack.id && (!spotifyTrack.name || !spotifyTrack.artists)) {
          try {
            const token = await spotifyService.getClientCredentialsToken();
            const trackResponse = await fetch(`https://api.spotify.com/v1/tracks/${spotifyTrack.id}`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (trackResponse.ok) {
              fullTrack = await trackResponse.json();
            }
          } catch (error) {
            console.warn(`Failed to fetch full track details for ${spotifyTrack.id}:`, error.message);
            // Fall back to simplified data
            fullTrack = spotifyTrack;
          }
        }

        // Extract track data with fallbacks: Spotify full track > Spotify simplified > Qobuz original
        const trackName = fullTrack.name || fullTrack.title || qobuzTrack?.title || '';
        const trackArtists = fullTrack.artists?.map(a => a.name).join(', ') || fullTrack.artist || qobuzTrack?.artist || '';
        const trackAlbum = fullTrack.album?.name || qobuzTrack?.album || '';
        const trackYear = fullTrack.album?.release_date ? parseInt(fullTrack.album.release_date.substring(0, 4)) : null;
        const trackDuration = fullTrack.duration_ms || (qobuzTrack?.duration ? parseDurationToMs(qobuzTrack.duration) : null);
        const trackIsrc = fullTrack.external_ids?.isrc || null;
        const trackExplicit = fullTrack.explicit || false;
        const trackPreviewUrl = fullTrack.preview_url || null;
        const trackArtworkUrl = fullTrack.album?.images?.[0]?.url || null;

        // Validate we have required fields
        if (!trackName || !trackArtists) {
          logger.warn('QOBUZ_IMPORT', 'Track missing title or artist', {
            spotifyId: spotifyTrack.id,
            qobuzTitle: qobuzTrack?.title,
            qobuzArtist: qobuzTrack?.artist,
            spotifyName: fullTrack.name,
            spotifyTitle: fullTrack.title
          });
        }

        // Process artwork from Spotify
        let artworkUrl = null;
        if (trackArtworkUrl) {
          try {
            const artworkFilename = await processAndSaveImageFromUrl(trackArtworkUrl);
            if (artworkFilename) {
              artworkUrl = `/uploads/${artworkFilename}`;
            }
          } catch (artworkError) {
            console.warn(`Failed to process artwork for ${trackName}:`, artworkError.message);
          }
        }

        // Build track object in Flowerpil format
        // Ensure we always have title and artist - use Qobuz data as final fallback
        const finalTitle = trackName || qobuzTrack?.title || 'Unknown Title';
        const finalArtist = trackArtists || qobuzTrack?.artist || 'Unknown Artist';
        
        return {
          position: index + 1,
          title: finalTitle,
          artist: finalArtist,
          album: trackAlbum || qobuzTrack?.album || '',
          year: trackYear,
          duration: trackDuration,
          spotify_id: spotifyTrack.id,
          apple_id: appleMatch?.id || null,
          apple_music_url: appleMatch?.url || null,
          match_confidence_apple: appleMatch?.confidence || null,
          match_source_apple: appleMatch?.source || null,
          tidal_id: tidalMatch?.id || null,
          tidal_url: tidalMatch?.url || null,
          match_confidence_tidal: tidalMatch?.confidence || null,
          match_source_tidal: tidalMatch?.source || null,
          qobuz_url: qobuzUrl,
          label: fullTrack.album?.label || null,
          genre: fullTrack.genres?.[0] || null,
          artwork_url: artworkUrl,
          album_artwork_url: trackArtworkUrl,
          isrc: trackIsrc,
          explicit: trackExplicit,
          preview_url: trackPreviewUrl,
          linking_status: 'completed'
        };
      })
    );

    const duration = Date.now() - startTime;
    const summary = {
      total: qobuzTracks.length,
      matched: matchResults.matched.length,
      skipped: matchResults.skipped.length,
      successRate: matchResults.matched.length / qobuzTracks.length
    };

    logger.success('QOBUZ_IMPORT', 'Qobuz import completed successfully', {
      ...summary,
      duration: `${duration}ms`
    });

    // Return processed tracks, warnings, and summary
    res.json({
      success: true,
      data: {
        tracks: processedTracks,
        skipped: matchResults.skipped,
        summary
      },
      message: `Successfully imported ${processedTracks.length} of ${qobuzTracks.length} tracks from Qobuz`
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('QOBUZ_IMPORT', 'Qobuz import failed', error, {
      url,
      duration: `${duration}ms`
    });

    // Handle specific error cases
    if (error.message.includes('Invalid Qobuz URL')) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    if (error.message.includes('Python script failed')) {
      return res.status(500).json({
        success: false,
        error: 'Failed to scrape Qobuz playlist. The URL may be invalid or the playlist may be unavailable.',
        details: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to import Qobuz playlist',
      details: error.message
    });
  }
});

export default router;
