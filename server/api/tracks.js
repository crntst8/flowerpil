import express from 'express';
import { getDatabase, getQueries } from '../database/db.js';
import { authMiddleware } from '../middleware/auth.js';
import crossPlatformLinkingService from '../services/crossPlatformLinkingService.js';
import { getSearchAggregatorHealth } from '../services/searchAggregatorService.js';
import {
  addInstagramSource,
  findInstagramProfileForArtist,
  hasInstagramSource,
  parseCustomSources
} from '../services/instagramLinkService.js';

const getInstagramLinkingConfig = () => {
  const db = getDatabase();
  try {
    const row = db.prepare('SELECT config_value FROM admin_system_config WHERE config_key = ?').get('instagram_track_linking_enabled');
    if (!row?.config_value) return { enabled: false };
    const parsed = JSON.parse(row.config_value);
    if (parsed && typeof parsed === 'object') {
      return { enabled: parsed.enabled === true };
    }
  } catch (error) {
    return { enabled: false };
  }
  return { enabled: false };
};

const router = express.Router();

// Get tracks for a playlist
router.get('/playlist/:playlistId', (req, res) => {
  try {
    console.log(`[INFO] API_REQUEST: GET /api/v1/tracks/playlist/${req.params.playlistId}`, { 
      method: 'GET', 
      url: `/api/v1/tracks/playlist/${req.params.playlistId}`, 
      params: req.params, 
      body: req.body 
    });
    
    const queries = getQueries();
    const { playlistId } = req.params;
    
    // Verify playlist exists
    const playlist = queries.getPlaylistById.get(playlistId);
    if (!playlist) {
      return res.status(404).json({
        success: false,
        error: 'Playlist not found'
      });
    }
    
    const tracks = queries.getTracksByPlaylistId.all(playlistId);
    const enrichedTracks = crossPlatformLinkingService.hydrateTracksWithLinkMetadata(tracks);
    
    console.log(`[SUCCESS] API_RESPONSE: GET /api/v1/tracks/playlist/${playlistId} - 200`, {
      method: 'GET',
      url: `/api/v1/tracks/playlist/${playlistId}`,
      status: 200,
      tracksCount: tracks.length
    });
    
    res.json({
      success: true,
      data: enrichedTracks,
      count: enrichedTracks.length
    });
  } catch (error) {
    console.error('Error fetching tracks:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tracks'
    });
  }
});

// Search for tracks (placeholder for future streaming service integration)
router.get('/search', (req, res) => {
  try {
    const { q, service } = req.query;
    
    if (!q?.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required'
      });
    }
    
    // This is a placeholder for future streaming service integration
    // For now, return mock search results
    const mockResults = [
      {
        id: 'mock_1',
        title: q,
        artist: 'Unknown Artist',
        album: 'Unknown Album',
        year: new Date().getFullYear(),
        duration: '3:30',
        service: service || 'manual',
        spotify_id: null,
        apple_id: null,
        tidal_id: null
      }
    ];
    
    res.json({
      success: true,
      data: mockResults,
      query: q,
      service: service || 'manual',
      message: 'Search functionality will be implemented with streaming service APIs'
    });
  } catch (error) {
    console.error('Error searching tracks:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search tracks'
    });
  }
});

// Instagram link availability status
router.get('/instagram-link/status', authMiddleware, async (req, res) => {
  try {
    if (!req.user || !['curator', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const config = getInstagramLinkingConfig();
    const health = await getSearchAggregatorHealth();
    const enabled = config.enabled === true;
    const ready = enabled && health.ok;

    return res.json({
      success: true,
      data: {
        enabled,
        ready,
        reason: enabled ? health.reason : 'disabled',
        providers: health.providers || []
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || 'Failed to load status' });
  }
});

// Link Instagram profiles for all tracks in a playlist
router.post('/playlist/:playlistId/link-instagram', authMiddleware, async (req, res) => {
  try {
    const { playlistId } = req.params;
    const parsedPlaylistId = parseInt(playlistId, 10);
    if (!parsedPlaylistId) {
      return res.status(400).json({ success: false, error: 'Playlist ID is required' });
    }

    if (!req.user || !['curator', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const queries = getQueries();
    const playlist = queries.getPlaylistById.get(parsedPlaylistId);
    if (!playlist) {
      return res.status(404).json({ success: false, error: 'Playlist not found' });
    }

    if (req.user.role === 'curator') {
      if (!req.user.curator_id || playlist.curator_id !== req.user.curator_id) {
        return res.status(403).json({ success: false, error: 'Access denied: playlist not owned' });
      }
    }

    const config = getInstagramLinkingConfig();
    if (!config.enabled) {
      return res.status(403).json({ success: false, error: 'Instagram linking is disabled' });
    }

    const health = await getSearchAggregatorHealth();
    if (!health.ok) {
      return res.status(503).json({ success: false, error: 'Search aggregator is not ready' });
    }

    const { dryRun = false, force = false, limit = null, concurrency = 3 } = req.body || {};
    const maxTracks = Number.isFinite(Number(limit)) ? Number(limit) : null;
    const parallelism = Math.max(1, Math.min(5, Number(concurrency) || 3));

    const tracks = queries.getTracksByPlaylistId.all(parsedPlaylistId) || [];
    const candidates = maxTracks ? tracks.slice(0, maxTracks) : tracks;

    let updated = 0;
    let skipped = 0;
    let failed = 0;
    const results = [];
    const updatedTracks = [];
    const artistCache = new Map();

    let cursor = 0;
    const nextTrack = () => {
      if (cursor >= candidates.length) return null;
      const track = candidates[cursor];
      cursor += 1;
      return track;
    };

    const resolveArtist = async (artist) => {
      const key = String(artist || '').toLowerCase().trim();
      if (!key) return null;
      if (artistCache.has(key)) return artistCache.get(key);
      const url = await findInstagramProfileForArtist(artist);
      artistCache.set(key, url || null);
      return url || null;
    };

    const worker = async () => {
      let track = nextTrack();
      while (track) {
        if (!track?.artist || !track?.id) {
          skipped += 1;
          results.push({ trackId: track?.id || null, status: 'skipped', reason: 'missing_artist' });
          track = nextTrack();
          continue;
        }

        const customSources = parseCustomSources(track.custom_sources);
        if (!force && hasInstagramSource(customSources)) {
          skipped += 1;
          results.push({ trackId: track.id, status: 'skipped', reason: 'already_linked' });
          track = nextTrack();
          continue;
        }

        try {
          const instagramUrl = await resolveArtist(track.artist);
          if (!instagramUrl) {
            failed += 1;
            results.push({ trackId: track.id, status: 'not_found' });
            track = nextTrack();
            continue;
          }

          const nextSources = addInstagramSource(customSources, instagramUrl);
          if (!dryRun) {
            queries.updateTrackCustomSources.run(JSON.stringify(nextSources), track.id);
          }

          updated += 1;
          updatedTracks.push({ id: track.id, custom_sources: nextSources });
          results.push({ trackId: track.id, status: 'linked', instagram_url: instagramUrl });
        } catch (error) {
          failed += 1;
          results.push({ trackId: track.id, status: 'error', error: error?.message || 'Lookup failed' });
        }

        track = nextTrack();
      }
    };

    const workers = Array.from({ length: parallelism }, () => worker());
    await Promise.all(workers);

    return res.json({
      success: true,
      data: {
        updated,
        skipped,
        failed,
        results,
        updated_tracks: updatedTracks,
        dryRun: Boolean(dryRun)
      }
    });
  } catch (error) {
    console.error('Instagram link error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to link Instagram profiles' });
  }
});

// Update track metadata
router.put('/:trackId', authMiddleware, (req, res) => {
  try {
    const { trackId } = req.params;
    const {
      title, artist, album, year, duration,
      spotify_id, apple_id, tidal_id, bandcamp_url, soundcloud_url, label, genre,
      artwork_url, album_artwork_url, isrc, explicit,
      popularity, preview_url, quote,
      apple_music_url, tidal_url, custom_sources, deezer_preview_url
    } = req.body;

    if (!title?.trim() || !artist?.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Title and artist are required'
      });
    }

    // Type conversion and validation
    const sanitizedYear = year && !isNaN(parseInt(year)) ? parseInt(year) : null;
    const sanitizedPopularity = popularity && !isNaN(parseInt(popularity)) ? parseInt(popularity) : null;
    const sanitizedExplicit = explicit === true || explicit === 'true' ? 1 : 0;

    console.log('Track update data types:', {
      title: typeof title, 
      year: typeof year, sanitizedYear: typeof sanitizedYear,
      explicit: typeof explicit, sanitizedExplicit: typeof sanitizedExplicit,
      popularity: typeof popularity, sanitizedPopularity: typeof sanitizedPopularity
    });

    const queries = getQueries();
    
    // Check if track exists
    const existingTrack = queries.getTrackById.get(trackId);
    if (!existingTrack) {
      return res.status(404).json({
        success: false,
        error: 'Track not found'
      });
    }

    // Serialize custom_sources as JSON
    const customSourcesJson = custom_sources && Array.isArray(custom_sources)
      ? JSON.stringify(custom_sources)
      : null;

    // Update track
    queries.updateTrack.run(
      title.trim(),
      artist.trim(),
      album?.trim() || null,
      sanitizedYear,
      duration?.trim() || null,
      spotify_id?.trim() || null,
      apple_id?.trim() || null,
      tidal_id?.trim() || null,
      bandcamp_url?.trim() || null,
      soundcloud_url?.trim() || null,
      label?.trim() || null,
      genre?.trim() || null,
      artwork_url?.trim() || null,
      album_artwork_url?.trim() || null,
      isrc?.trim() || null,
      sanitizedExplicit,
      sanitizedPopularity,
      preview_url?.trim() || null,
      (typeof quote === 'string' && quote.trim().length > 0) ? quote.trim() : null,
      apple_music_url?.trim() || null,
      tidal_url?.trim() || null,
      customSourcesJson,
      deezer_preview_url?.trim() || null,
      trackId
    );

    // Get updated track
    const updatedTrack = queries.getTrackById.get(trackId);
    const enrichedTrack = crossPlatformLinkingService.hydrateTrackWithLinkMetadata(updatedTrack);
    
    res.json({
      success: true,
      data: enrichedTrack,
      message: 'Track updated successfully'
    });
  } catch (error) {
    console.error('Error updating track:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update track'
    });
  }
});

// Remove preview for a track (admin only)
router.delete('/:trackId/preview', authMiddleware, (req, res) => {
  try {
    const { trackId } = req.params;
    
    console.log(`[INFO] API_REQUEST: DELETE /api/v1/tracks/${trackId}/preview`, { 
      method: 'DELETE', 
      url: `/api/v1/tracks/${trackId}/preview`, 
      params: req.params
    });

    const queries = getQueries();
    
    // Check if track exists
    const existingTrack = queries.getTrackById.get(trackId);
    if (!existingTrack) {
      return res.status(404).json({
        success: false,
        error: 'Track not found'
      });
    }

    // Remove all preview-related fields
    queries.removeTrackPreview.run(trackId);

    // Get updated track to confirm removal
    const updatedTrack = queries.getTrackById.get(trackId);
    const enrichedTrack = crossPlatformLinkingService.hydrateTrackWithLinkMetadata(updatedTrack);
    
    console.log(`[SUCCESS] API_RESPONSE: DELETE /api/v1/tracks/${trackId}/preview - 200`, {
      method: 'DELETE',
      url: `/api/v1/tracks/${trackId}/preview`,
      status: 200,
      trackId: trackId
    });
    
    res.json({
      success: true,
      data: enrichedTrack,
      message: 'Preview removed successfully'
    });
  } catch (error) {
    console.error('Error removing track preview:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove preview'
    });
  }
});

export default router;
