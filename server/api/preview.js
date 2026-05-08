import express from 'express';
import { Readable } from 'stream';
import { getQueries } from '../database/db.js';
import DeezerPreviewService from '../services/deezerPreviewService.js';
import SoundcloudService from '../services/soundcloudService.js';
import { authMiddleware } from '../middleware/auth.js';
import { findTrackWithPreview } from '../services/trackLookupService.js';
import logger from '../utils/logger.js';

// Utility to check if Deezer URL has expired
function isDeezerUrlExpired(deezerUrl) {
  if (!deezerUrl) return true;

  try {
    const url = new URL(deezerUrl);
    const expParam = url.searchParams.get('hdnea');

    // If no hdnea parameter, treat as potentially expired for safety
    if (!expParam) {
      console.log('No hdnea parameter found in Deezer URL, treating as expired');
      return true;
    }

    // Try to decode the parameter if it's URL encoded
    let decodedParam = expParam;
    try {
      // Deezer URLs may have the hdnea parameter URL-encoded
      decodedParam = decodeURIComponent(expParam);
    } catch (e) {
      // If decode fails, use original
      decodedParam = expParam;
    }

    // Extract expiration timestamp from hdnea parameter
    // Pattern: exp=1234567890 (Unix timestamp)
    const expMatch = decodedParam.match(/exp[=:](\d+)/i);
    if (!expMatch) {
      // If we can't find expiration info, treat as expired for safety
      console.log('Could not parse expiration from hdnea parameter, treating as expired');
      return true;
    }

    const expTimestamp = parseInt(expMatch[1]);
    const currentTimestamp = Math.floor(Date.now() / 1000);

    // Consider expired if within 10 minutes of expiration to be safe
    const bufferSeconds = 600;
    const isExpired = currentTimestamp >= (expTimestamp - bufferSeconds);

    if (isExpired) {
      console.log(`Deezer URL expired: current=${currentTimestamp}, expiration=${expTimestamp}`);
    }

    return isExpired;
  } catch (error) {
    console.warn('Error parsing Deezer URL expiration:', error.message);
    return true; // Assume expired if we can't parse
  }
}

// Utility to check if preview data needs refresh based on update time
function needsPreviewRefresh(track) {
  if (!track.deezer_preview_url) return true;

  // Check URL expiration first
  if (isDeezerUrlExpired(track.deezer_preview_url)) return true;

  // Also check database timestamp - refresh if older than 12 hours
  if (track.preview_updated_at) {
    const updatedAt = new Date(track.preview_updated_at);
    const hoursAgo = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60);

    if (hoursAgo > 12) {
      console.log(`Preview data is ${hoursAgo.toFixed(1)} hours old, refreshing`);
      return true;
    }
  }

  return false;
}

const router = express.Router();
const deezerService = new DeezerPreviewService();

// Proxy endpoint for Deezer preview streams to bypass region restrictions
router.get('/stream/:trackId', async (req, res) => {
  try {
    const queries = getQueries();
    const { trackId } = req.params;
    
    // Get track from database
    let track = queries.getTrackById.get(trackId);
    if (!track) {
      return res.status(404).json({
        success: false,
        error: 'Track not found'
      });
    }

    // Check if track has SoundCloud preview URL (prioritize SoundCloud)
    if (track.soundcloud_url && track.preview_url) {
      const isSoundcloudUrl = track.preview_url.includes('soundcloud.com') || 
                              track.preview_url.includes('soundcloud') ||
                              track.preview_url.startsWith('https://api.soundcloud.com');
      
      if (isSoundcloudUrl) {
        try {
          // Always get fresh stream URL from SoundCloud service
          // The stored preview_url might be an API endpoint, not a direct stream URL
          let streamUrl;
          let response;

          try {
            // Resolve the track to get fresh stream URL
            const resolved = await SoundcloudService.resolveUrl(track.soundcloud_url);
            if (!resolved || !resolved.id) {
              throw new Error('Could not resolve SoundCloud URL');
            }

            streamUrl = await SoundcloudService.getStreamUrlForTrack(resolved);
            if (!streamUrl) {
              throw new Error('Could not get stream URL from SoundCloud service');
            }

            // Fetch the stream with authentication
            response = await SoundcloudService.fetchStreamWithAuth(streamUrl, {
              headers: {
                'Accept-Encoding': 'identity'
              }
            });
          } catch (scError) {
            console.warn(`SoundCloud service fetch failed for track ${trackId}:`, scError.message);
            return res.status(404).json({
              success: false,
              error: 'SoundCloud preview stream unavailable'
            });
          }

          if (!response || !response.ok) {
            console.warn(`SoundCloud stream fetch failed for track ${trackId}: ${response?.status}`);
            return res.status(response?.status === 403 ? 404 : response?.status || 500).json({
              success: false,
              error: 'SoundCloud preview stream unavailable'
            });
          }

          // Proxy the SoundCloud stream
          res.set({
            'Content-Type': response.headers.get('content-type') || 'audio/mpeg',
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'private, max-age=300, must-revalidate',
            'Access-Control-Allow-Origin': '*'
          });

          const nodeStream = Readable.fromWeb(response.body);
          nodeStream.pipe(res);
          return;
        } catch (error) {
          console.error(`Error streaming SoundCloud preview for track ${trackId}:`, error);
          return res.status(500).json({
            success: false,
            error: `Failed to stream SoundCloud preview: ${error.message}`
          });
        }
      }
    }

    // Check if we need to refresh the preview URL
    let deezerUrl = track.deezer_preview_url;
    let shouldRefresh = needsPreviewRefresh(track);

    // If URL is expired or missing, try to get a fresh one
    if (shouldRefresh) {
      console.log(`Preview URL expired or missing for track ${trackId}, fetching fresh URL`);

      // Clear the service cache for this track to ensure we get fresh data
      const cacheKey = `${track.id}_${track.isrc || 'no-isrc'}`;
      deezerService.cache.delete(cacheKey);

      const previewData = await deezerService.getPreviewForTrack(track);
      if (previewData) {
        // Update database with fresh preview data
        queries.updateTrackPreview.run(
          previewData.deezer_id,
          previewData.url,
          previewData.source,
          previewData.confidence,
          trackId
        );
        deezerUrl = previewData.url;
        console.log(`✅ Successfully refreshed URL for track ${trackId}`);
      } else {
        return res.status(404).json({
          success: false,
          error: 'Preview not available for this track'
        });
      }
    }

    // Attempt to fetch the audio stream from Deezer
    let response;
    try {
      response = await fetch(deezerUrl, {
        headers: {
          'User-Agent': 'Flowerpil/1.0.0',
          'Accept': 'audio/*',
          'Accept-Encoding': 'identity'
        }
      });
    } catch (fetchError) {
      console.warn(`Deezer fetch failed for track ${trackId}:`, fetchError.message);
      return res.status(503).json({
        success: false,
        error: 'Preview service temporarily unavailable'
      });
    }

    // Handle 403/expired URL case with fallback retry
    if (!response.ok) {
      if (response.status === 403 && !shouldRefresh) {
        console.log(`Deezer URL returned 403 for track ${trackId}, attempting refresh`);

        // Clear the service cache for this track to ensure we get fresh data
        const cacheKey = `${track.id}_${track.isrc || 'no-isrc'}`;
        deezerService.cache.delete(cacheKey);

        // Try to get a fresh URL on 403 error
        const previewData = await deezerService.getPreviewForTrack(track);
        if (previewData) {
          // Update database with fresh preview data
          queries.updateTrackPreview.run(
            previewData.deezer_id,
            previewData.url,
            previewData.source,
            previewData.confidence,
            trackId
          );

          // Retry with fresh URL
          try {
            response = await fetch(previewData.url, {
              headers: {
                'User-Agent': 'Flowerpil/1.0.0',
                'Accept': 'audio/*',
                'Accept-Encoding': 'identity'
              }
            });
            console.log(`✅ Successfully recovered from 403 for track ${trackId}`);
          } catch (retryError) {
            console.warn(`Retry fetch failed for track ${trackId}:`, retryError.message);
            return res.status(503).json({
              success: false,
              error: 'Preview service temporarily unavailable'
            });
          }
        }
      }

      // If still not ok after potential retry
      if (!response.ok) {
        console.warn(`Deezer stream failed for track ${trackId}: ${response.status}`);
        return res.status(response.status === 403 ? 404 : response.status).json({
          success: false,
          error: 'Preview stream unavailable'
        });
      }
    }

    // Set appropriate headers for audio streaming
    // Note: Short cache time (5 min) because Deezer URLs expire frequently
    res.set({
      'Content-Type': response.headers.get('content-type') || 'audio/mpeg',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=300, must-revalidate',
      'Access-Control-Allow-Origin': '*'
    });

    // Convert Web ReadableStream to Node.js stream and pipe
    const nodeStream = Readable.fromWeb(response.body);
    nodeStream.pipe(res);

  } catch (error) {
    console.error('Error streaming preview:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to stream preview'
    });
  }
});

// Get preview for specific track
router.get('/:trackId', async (req, res) => {
  try {
    const queries = getQueries();
    const { trackId } = req.params;
    
    // Get track from database
    const track = queries.getTrackById.get(trackId);
    if (!track) {
      return res.status(404).json({
        success: false,
        error: 'Track not found'
      });
    }

    // Check if track has SoundCloud preview URL (from import)
    // SoundCloud previews take precedence since they're direct from the source
    if (track.soundcloud_url && track.preview_url) {
      // Check if preview_url is a SoundCloud URL
      const isSoundcloudUrl = track.preview_url.includes('soundcloud.com') || 
                              track.preview_url.includes('soundcloud') ||
                              track.preview_url.startsWith('https://api.soundcloud.com');
      
      if (isSoundcloudUrl) {
        return res.json({
          success: true,
          data: {
            url: `/api/v1/preview/stream/${trackId}`,
            source: 'soundcloud',
            confidence: 100,
            attribution: 'Preview powered by SoundCloud',
            cached: false,
            duration_limit: 30 // 30-second preview limit for SoundCloud
          }
        });
      }
    }

    // Check if we have cached preview data that's still fresh (< 24 hours)
    if (track.deezer_preview_url && track.preview_updated_at) {
      const updatedAt = new Date(track.preview_updated_at);
      const hoursAgo = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60);
      
      if (hoursAgo < 24) {
        return res.json({
          success: true,
          data: {
            url: `/api/v1/preview/stream/${trackId}`,
            source: track.preview_source,
            confidence: track.preview_confidence,
            deezer_id: track.deezer_id,
            attribution: 'Preview powered by Deezer',
            cached: true
          }
        });
      }
    }

    // Fetch fresh preview from Deezer
    const previewData = await deezerService.getPreviewForTrack(track);
    
    if (previewData) {
      // Update database with new preview data
      queries.updateTrackPreview.run(
        previewData.deezer_id,
        previewData.url,
        previewData.source,
        previewData.confidence,
        trackId
      );
      
      res.json({
        success: true,
        data: {
          ...previewData,
          url: `/api/v1/preview/stream/${trackId}`,
          cached: false
        }
      });
    } else {
      // No preview found - still update database to avoid repeated API calls
      queries.updateTrackPreview.run(null, null, null, null, trackId);
      
      res.json({
        success: true,
        data: null,
        message: 'No preview available for this track'
      });
    }

  } catch (error) {
    console.error('Error fetching preview:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch preview'
    });
  }
});

// Get preview for inline track data (for Top 10 tracks without IDs)
router.post('/inline', async (req, res) => {
  try {
    const { artist, title, isrc } = req.body;

    if (!artist || !title) {
      return res.status(400).json({
        success: false,
        error: 'Artist and title are required'
      });
    }

    // Check database for cached preview first (track-overlap-cache feature)
    const cachedTrack = await findTrackWithPreview(title, artist, isrc);

    if (cachedTrack && cachedTrack.deezer_preview_url && !isDeezerUrlExpired(cachedTrack.deezer_preview_url)) {
      logger.info('PREVIEW_CACHE', 'Cache hit for inline preview', {
        title, artist, track_id: cachedTrack.id
      });
      return res.json({
        success: true,
        data: {
          url: `/api/v1/preview/stream/${cachedTrack.id}`,
          source: cachedTrack.preview_source || 'database',
          confidence: cachedTrack.preview_confidence || 100,
          deezer_id: cachedTrack.deezer_id,
          attribution: 'Preview powered by Deezer',
          cached: true,
          from_database: true
        }
      });
    }

    // Create track object compatible with DeezerPreviewService
    const trackData = {
      artist,
      title,
      isrc: isrc || null
    };

    // Fall back to Deezer API
    const previewData = await deezerService.getPreviewForTrack(trackData);

    if (previewData) {
      res.json({
        success: true,
        data: {
          url: previewData.url,
          source: previewData.source,
          confidence: previewData.confidence,
          deezer_id: previewData.deezer_id,
          attribution: 'Preview powered by Deezer',
          cached: false
        }
      });
    } else {
      res.json({
        success: true,
        data: null,
        message: 'No preview available for this track'
      });
    }

  } catch (error) {
    console.error('Error fetching inline preview:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch preview'
    });
  }
});

// Batch preview fetching for playlist
router.post('/batch', authMiddleware, async (req, res) => {
  try {
    const queries = getQueries();
    const { trackIds, playlistId } = req.body;
    
    if (!trackIds && !playlistId) {
      return res.status(400).json({
        success: false,
        error: 'Either trackIds array or playlistId is required'
      });
    }

    let tracks;
    if (playlistId) {
      // Get all tracks for playlist
      tracks = queries.getTracksByPlaylistId.all(playlistId);
    } else {
      // Get specific tracks by IDs
      tracks = trackIds.map(id => queries.getTrackById.get(id)).filter(Boolean);
    }

    if (tracks.length === 0) {
      return res.json({
        success: true,
        data: [],
        message: 'No tracks found'
      });
    }

    // Process tracks in smaller batches to avoid overwhelming the API
    const results = [];
    const batchSize = 5;
    
    for (let i = 0; i < tracks.length; i += batchSize) {
      const batch = tracks.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (track) => {
          try {
            // Check for cached data first
            if (track.deezer_preview_url && track.preview_updated_at) {
              const updatedAt = new Date(track.preview_updated_at);
              const hoursAgo = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60);
              
              if (hoursAgo < 24) {
                return {
                  trackId: track.id,
                  preview: {
                    url: `/api/v1/preview/stream/${track.id}`,
                    source: track.preview_source,
                    confidence: track.preview_confidence,
                    deezer_id: track.deezer_id,
                    attribution: 'Preview powered by Deezer',
                    cached: true
                  }
                };
              }
            }

            // Fetch fresh preview
            const previewData = await deezerService.getPreviewForTrack(track);
            
            if (previewData) {
              // Update database
              queries.updateTrackPreview.run(
                previewData.deezer_id,
                previewData.url,
                previewData.source,
                previewData.confidence,
                track.id
              );
            } else {
              // Mark as no preview available
              queries.updateTrackPreview.run(null, null, null, null, track.id);
            }
            
            return {
              trackId: track.id,
              preview: previewData ? { ...previewData, url: `/api/v1/preview/stream/${track.id}`, cached: false } : null
            };
          } catch (error) {
            console.warn(`Failed to get preview for track ${track.id}:`, error.message);
            return {
              trackId: track.id,
              preview: null,
              error: error.message
            };
          }
        })
      );
      
      results.push(...batchResults);
      
      // Small delay between batches to be respectful to API
      if (i + batchSize < tracks.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    res.json({
      success: true,
      data: results,
      processed: results.length,
      total: tracks.length
    });

  } catch (error) {
    console.error('Error in batch preview fetch:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch batch previews'
    });
  }
});

// Get preview statistics for a playlist
router.get('/stats/:playlistId', (req, res) => {
  try {
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
    
    const stats = queries.getTrackPreviewStats.get(playlistId);
    
    res.json({
      success: true,
      data: {
        ...stats,
        coverage: stats.total_tracks > 0 ? Math.round((stats.with_previews / stats.total_tracks) * 100) : 0,
        isrc_match_rate: stats.with_previews > 0 ? Math.round((stats.isrc_matches / stats.with_previews) * 100) : 0
      }
    });

  } catch (error) {
    console.error('Error fetching preview stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch preview statistics'
    });
  }
});

// Force refresh previews for tracks without them or with expired data
router.post('/refresh/:playlistId', authMiddleware, async (req, res) => {
  try {
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
    
    // Get tracks without previews or with expired previews
    const tracksNeedingRefresh = queries.getTracksWithoutPreviews.all(playlistId);
    const expiredTracks = queries.getTracksWithExpiredPreviews.all();
    
    // Combine and deduplicate
    const allTracksToRefresh = [...tracksNeedingRefresh];
    expiredTracks.forEach(track => {
      if (track.playlist_id == playlistId && !allTracksToRefresh.find(t => t.id === track.id)) {
        allTracksToRefresh.push(track);
      }
    });
    
    if (allTracksToRefresh.length === 0) {
      return res.json({
        success: true,
        message: 'All tracks have fresh previews',
        refreshed: 0
      });
    }
    
    // Process in batches
    let refreshed = 0;
    const batchSize = 5;
    
    for (let i = 0; i < allTracksToRefresh.length; i += batchSize) {
      const batch = allTracksToRefresh.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (track) => {
          try {
            const previewData = await deezerService.getPreviewForTrack(track);
            
            if (previewData) {
              queries.updateTrackPreview.run(
                previewData.deezer_id,
                previewData.url,
                previewData.source,
                previewData.confidence,
                track.id
              );
              refreshed++;
            } else {
              queries.updateTrackPreview.run(null, null, null, null, track.id);
            }
          } catch (error) {
            console.warn(`Failed to refresh preview for track ${track.id}:`, error.message);
          }
        })
      );
      
      // Delay between batches
      if (i + batchSize < allTracksToRefresh.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    
    res.json({
      success: true,
      message: `Refreshed ${refreshed} out of ${allTracksToRefresh.length} tracks`,
      refreshed: refreshed,
      attempted: allTracksToRefresh.length
    });

  } catch (error) {
    console.error('Error refreshing previews:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh previews'
    });
  }
});

export default router;
