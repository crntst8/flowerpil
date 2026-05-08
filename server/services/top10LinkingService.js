/**
 * Top 10 Cross-Linking Service
 *
 * Links Top 10 tracks to DSPs (Apple Music, Tidal, Spotify) using the same
 * search algorithms as the main cross-linking service, but for inline JSON tracks.
 */

import { getDatabase } from '../database/db.js';
import logger from '../utils/logger.js';

/**
 * Link all tracks in a Top 10 to DSPs
 * @param {number} top10Id - Top 10 playlist ID
 * @param {Object} options - Linking options
 * @returns {Promise<Object>} Results summary
 */
export async function linkTop10Tracks(top10Id, options = {}) {
  const startTime = Date.now();
  const db = getDatabase();

  try {
    // Get the Top 10 playlist
    const top10 = db.prepare('SELECT id, user_id, tracks FROM top10_playlists WHERE id = ?').get(top10Id);

    if (!top10) {
      throw new Error('Top 10 not found');
    }

    // Parse tracks JSON
    let tracks = [];
    try {
      tracks = typeof top10.tracks === 'string' ? JSON.parse(top10.tracks) : top10.tracks;
    } catch (e) {
      throw new Error('Failed to parse tracks JSON');
    }

    if (!Array.isArray(tracks) || tracks.length === 0) {
      return {
        success: true,
        message: 'No tracks to link',
        stats: { total: 0, linked: 0, errors: [] }
      };
    }

    // Initialize progress tracking in database
    updateLinkingProgress(db, top10Id, {
      status: 'in_progress',
      current_track: 0,
      total_tracks: tracks.length,
      message: 'Starting cross-platform linking...'
    });

    logger.info('TOP10_LINK', 'Starting cross-platform linking for Top 10', {
      top10Id,
      trackCount: tracks.length
    });

    // Import DSP services dynamically
    const { searchAppleMusicByTrack } = await import('./appleMusicService.js');
    const { searchTidalByTrack } = await import('./tidalService.js');
    const { default: SpotifyService } = await import('./spotifyService.js');
    const spotifyService = new SpotifyService();

    const results = {
      total: tracks.length,
      linked: 0,
      appleMusicLinked: 0,
      tidalLinked: 0,
      spotifyLinked: 0,
      errors: []
    };

    // Get Apple Music storefront
    const appleStorefront = await getAppleStorefront(db);

    // Link each track
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];

      // Update progress
      updateLinkingProgress(db, top10Id, {
        status: 'in_progress',
        current_track: i + 1,
        total_tracks: tracks.length,
        message: `Linking "${track.title}" by ${track.artist}...`
      });

      logger.info('TOP10_LINK', 'Linking track', {
        position: track.position,
        artist: track.artist,
        title: track.title
      });

      let hasNewLinks = false;

      // Skip if track already has all links and not forcing refresh
      if (!options.forceRefresh && track.apple_music_url && track.tidal_url && track.spotify_url) {
        logger.info('TOP10_LINK', 'Track already has all links, skipping', {
          position: track.position
        });
        results.linked++;
        continue;
      }

      // Search Apple Music (if not already linked or forcing refresh)
      if (!track.apple_music_url || options.forceRefresh) {
        try {
          await delay(150); // Rate limiting
          logger.info('TOP10_LINK', 'Searching Apple Music', {
            position: track.position
          });

          const appleResult = await searchAppleMusicByTrack(track, { storefront: appleStorefront });

          if (appleResult && appleResult.url) {
            track.apple_music_url = appleResult.url;
            hasNewLinks = true;
            results.appleMusicLinked++;
            logger.info('TOP10_LINK', 'Apple Music link found', {
              position: track.position,
              url: appleResult.url
            });
          }
        } catch (error) {
          logger.error('TOP10_LINK', 'Apple Music search failed', {
            position: track.position,
            error: error.message
          });
          results.errors.push({
            position: track.position,
            platform: 'Apple Music',
            error: error.message
          });
        }
      }

      // Search Tidal (if not already linked or forcing refresh)
      if (!track.tidal_url || options.forceRefresh) {
        try {
          await delay(150); // Rate limiting
          logger.info('TOP10_LINK', 'Searching Tidal', {
            position: track.position
          });

          const tidalResult = await searchTidalByTrack(track);

          if (tidalResult && tidalResult.url) {
            track.tidal_url = tidalResult.url;
            hasNewLinks = true;
            results.tidalLinked++;
            logger.info('TOP10_LINK', 'Tidal link found', {
              position: track.position,
              url: tidalResult.url
            });
          }
        } catch (error) {
          logger.error('TOP10_LINK', 'Tidal search failed', {
            position: track.position,
            error: error.message
          });
          results.errors.push({
            position: track.position,
            platform: 'Tidal',
            error: error.message
          });
        }
      }

      // Search Spotify (if not already linked or forcing refresh)
      if (!track.spotify_url || options.forceRefresh) {
        try {
          await delay(150); // Rate limiting
          logger.info('TOP10_LINK', 'Searching Spotify', {
            position: track.position
          });

          const spotifyResult = await spotifyService.searchByTrack(track);

          if (spotifyResult && spotifyResult.id) {
            // Build Spotify URL from ID
            track.spotify_url = `https://open.spotify.com/track/${spotifyResult.id}`;
            hasNewLinks = true;
            results.spotifyLinked++;
            logger.info('TOP10_LINK', 'Spotify link found', {
              position: track.position,
              url: track.spotify_url
            });
          }
        } catch (error) {
          logger.error('TOP10_LINK', 'Spotify search failed', {
            position: track.position,
            error: error.message
          });
          results.errors.push({
            position: track.position,
            platform: 'Spotify',
            error: error.message
          });
        }
      }

      if (hasNewLinks) {
        results.linked++;
      }
    }

    // Save updated tracks back to database
    db.prepare(`
      UPDATE top10_playlists
      SET tracks = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(JSON.stringify(tracks), top10Id);

    const duration = Date.now() - startTime;

    // Mark linking as complete
    updateLinkingProgress(db, top10Id, {
      status: 'completed',
      current_track: tracks.length,
      total_tracks: tracks.length,
      message: 'Cross-linking complete'
    });

    logger.info('TOP10_LINK', 'Cross-platform linking completed', {
      top10Id,
      duration,
      results
    });

    return {
      success: true,
      results
    };

  } catch (error) {
    // Mark linking as failed
    updateLinkingProgress(db, top10Id, {
      status: 'failed',
      current_track: 0,
      total_tracks: 0,
      message: error.message
    });

    logger.error('TOP10_LINK', 'Cross-platform linking failed', {
      top10Id,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get Apple Music storefront (similar to crossPlatformLinkingService)
 */
async function getAppleStorefront(db) {
  let storefront = process.env.APPLE_MUSIC_STOREFRONT || 'us';

  try {
    const row = db.prepare('SELECT user_info FROM oauth_tokens WHERE platform = ? ORDER BY id DESC LIMIT 1').get('apple');
    if (row?.user_info) {
      try {
        const info = JSON.parse(row.user_info);
        if (info?.storefront && typeof info.storefront === 'string') {
          storefront = info.storefront.trim().toLowerCase() || storefront;
        }
      } catch (error) {
        logger.warn('TOP10_LINK', 'Unable to parse Apple user info for storefront', { error: error.message });
      }
    }
  } catch (error) {
    logger.warn('TOP10_LINK', 'Unable to retrieve Apple storefront from oauth_tokens', { error: error.message });
  }

  storefront = typeof storefront === 'string' ? storefront.trim().toLowerCase() : 'us';
  if (!/^[a-z]{2}$/i.test(storefront)) {
    storefront = 'us';
  }

  return storefront;
}

/**
 * Delay helper for rate limiting
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Update linking progress in database
 */
function updateLinkingProgress(db, top10Id, progress) {
  try {
    const progressJson = JSON.stringify({
      status: progress.status || 'in_progress',
      current_track: progress.current_track || 0,
      total_tracks: progress.total_tracks || 0,
      message: progress.message || '',
      updated_at: new Date().toISOString()
    });

    db.prepare(`
      UPDATE top10_playlists
      SET linking_progress = ?
      WHERE id = ?
    `).run(progressJson, top10Id);
  } catch (error) {
    logger.error('TOP10_LINK', 'Failed to update linking progress', {
      top10Id,
      error: error.message
    });
  }
}

/**
 * Get linking progress for a Top 10
 * @param {number} top10Id - Top 10 playlist ID
 * @returns {Object} Progress information
 */
export function getLinkingProgress(top10Id) {
  const db = getDatabase();

  try {
    const top10 = db.prepare('SELECT linking_progress FROM top10_playlists WHERE id = ?').get(top10Id);

    if (!top10 || !top10.linking_progress) {
      return {
        status: 'idle',
        current_track: 0,
        total_tracks: 0,
        message: ''
      };
    }

    return JSON.parse(top10.linking_progress);
  } catch (error) {
    logger.error('TOP10_LINK', 'Failed to get linking progress', {
      top10Id,
      error: error.message
    });

    return {
      status: 'idle',
      current_track: 0,
      total_tracks: 0,
      message: ''
    };
  }
}

export default {
  linkTop10Tracks,
  getLinkingProgress
};
