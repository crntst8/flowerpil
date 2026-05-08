/**
 * Top 10 Export Service
 * Exports Top 10 playlists to DSP platforms using admin tokens
 */

import { getDatabase } from '../database/db.js';
import SpotifyService from './spotifyService.js';
import tidalService from './tidalService.js';
import appleMusicApiService from './appleMusicApiService.js';
import logger from '../utils/logger.js';

const spotifyService = new SpotifyService();

/**
 * Get export token for a platform (admin/Flowerpil tokens only)
 * @param {string} platform - Platform name (spotify, apple, tidal)
 * @returns {Object|null} Token object or null if not found
 */
function getExportToken(platform) {
  const db = getDatabase();

  const token = db.prepare(`
    SELECT * FROM export_oauth_tokens
    WHERE platform = ?
      AND account_type = 'flowerpil'
      AND owner_curator_id IS NULL
      AND is_active = 1
    ORDER BY last_validated_at DESC NULLS LAST, id DESC
    LIMIT 1
  `).get(platform);

  return token;
}

/**
 * Check if token is expired
 * @param {Object} token - Token object
 * @returns {boolean}
 */
function isTokenExpired(token) {
  if (!token || !token.expires_at) return false;
  return new Date(token.expires_at) <= new Date();
}

/**
 * Format tracks for Spotify export
 * @param {Array} tracks - Top 10 tracks
 * @returns {Array} Spotify URIs
 */
function formatTracksForSpotify(tracks) {
  return tracks
    .filter(track => track.spotify_url)
    .map(track => {
      // Extract Spotify ID from URL
      const match = track.spotify_url.match(/track\/([a-zA-Z0-9]+)/);
      return match ? `spotify:track:${match[1]}` : null;
    })
    .filter(Boolean);
}

/**
 * Export Top 10 to Spotify
 * @param {number} top10Id - Top 10 playlist ID
 * @param {Object} top10 - Top 10 playlist data
 * @returns {Promise<Object>} Export result
 */
export async function exportTop10ToSpotify(top10Id, top10) {
  try {
    // Get Flowerpil admin token
    const token = getExportToken('spotify');

    if (!token) {
      throw new Error('No Spotify admin token available');
    }

    if (isTokenExpired(token)) {
      throw new Error('Spotify admin token is expired');
    }

    // Parse tracks
    const tracks = typeof top10.tracks === 'string' ? JSON.parse(top10.tracks) : top10.tracks;

    // Format track URIs for Spotify
    const trackUris = formatTracksForSpotify(tracks);

    if (trackUris.length === 0) {
      throw new Error('No Spotify tracks available to export');
    }

    // Create playlist on Spotify using admin account
    const playlistData = {
      name: top10.title || 'My Top 10 of 2025',
      description: top10.description || `${top10.title} - Made with Flowerpil`,
      public: true
    };

    const createdPlaylist = await spotifyService.createPlaylist(token.access_token, playlistData);

    // Add tracks to playlist
    await spotifyService.addTracksToPlaylist(token.access_token, createdPlaylist.id, trackUris);

    // Get playlist URL
    const playlistUrl = createdPlaylist.external_urls?.spotify || `https://open.spotify.com/playlist/${createdPlaylist.id}`;

    // Update top10_playlists with export URL
    const db = getDatabase();
    db.prepare(`
      UPDATE top10_playlists
      SET spotify_export_url = ?, export_completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(playlistUrl, top10Id);

    logger.info('TOP10_EXPORT', 'Spotify export successful', {
      top10Id,
      playlistUrl,
      trackCount: trackUris.length
    });

    return {
      success: true,
      platform: 'spotify',
      url: playlistUrl,
      trackCount: trackUris.length
    };

  } catch (error) {
    logger.error('TOP10_EXPORT', 'Spotify export failed', {
      top10Id,
      error: error.message
    });

    return {
      success: false,
      platform: 'spotify',
      error: error.message
    };
  }
}

/**
 * Export Top 10 to Apple Music
 * @param {number} top10Id - Top 10 playlist ID
 * @param {Object} top10 - Top 10 playlist data
 * @returns {Promise<Object>} Export result
 */
export async function exportTop10ToApple(top10Id, top10) {
  try {
    // Get Flowerpil admin token
    const token = getExportToken('apple');

    if (!token) {
      throw new Error('No Apple Music admin token available');
    }

    // Parse tracks
    const tracks = typeof top10.tracks === 'string' ? JSON.parse(top10.tracks) : top10.tracks;

    // Extract Apple Music track IDs
    const appleTrackIds = tracks
      .filter(track => track.apple_music_url)
      .map(track => {
        // Extract Apple Music ID from URL
        const match = track.apple_music_url.match(/\?i=(\d+)/);
        return match ? match[1] : null;
      })
      .filter(Boolean);

    if (appleTrackIds.length === 0) {
      throw new Error('No Apple Music tracks available to export');
    }

    // Create playlist on Apple Music using admin account
    const playlistData = {
      attributes: {
        name: top10.title || 'My Top 10 of 2025',
        description: top10.description || `${top10.title} - Made with Flowerpil`
      },
      relationships: {
        tracks: {
          data: appleTrackIds.map(id => ({
            id,
            type: 'songs'
          }))
        }
      }
    };

    const createdPlaylist = await appleMusicApiService.createPlaylist(token.access_token, playlistData);
    const playlistUrl = `https://music.apple.com/playlist/${createdPlaylist.id}`;

    // Update top10_playlists with export URL
    const db = getDatabase();
    db.prepare(`
      UPDATE top10_playlists
      SET apple_export_url = ?, export_completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(playlistUrl, top10Id);

    logger.info('TOP10_EXPORT', 'Apple Music export successful', {
      top10Id,
      playlistUrl,
      trackCount: appleTrackIds.length
    });

    return {
      success: true,
      platform: 'apple',
      url: playlistUrl,
      trackCount: appleTrackIds.length
    };

  } catch (error) {
    logger.error('TOP10_EXPORT', 'Apple Music export failed', {
      top10Id,
      error: error.message
    });

    return {
      success: false,
      platform: 'apple',
      error: error.message
    };
  }
}

/**
 * Export Top 10 to Tidal
 * @param {number} top10Id - Top 10 playlist ID
 * @param {Object} top10 - Top 10 playlist data
 * @returns {Promise<Object>} Export result
 */
export async function exportTop10ToTidal(top10Id, top10) {
  try {
    // Get Flowerpil admin token
    const token = getExportToken('tidal');

    if (!token) {
      throw new Error('No Tidal admin token available');
    }

    if (isTokenExpired(token)) {
      throw new Error('Tidal admin token is expired');
    }

    // Parse tracks
    const tracks = typeof top10.tracks === 'string' ? JSON.parse(top10.tracks) : top10.tracks;

    // Extract Tidal track IDs
    const tidalTrackIds = tracks
      .filter(track => track.tidal_url)
      .map(track => {
        // Extract Tidal ID from URL
        const match = track.tidal_url.match(/track\/(\d+)/);
        return match ? match[1] : null;
      })
      .filter(Boolean);

    if (tidalTrackIds.length === 0) {
      throw new Error('No Tidal tracks available to export');
    }

    // Create playlist on Tidal using admin account
    const playlistData = {
      title: top10.title || 'My Top 10 of 2025',
      description: top10.description || `${top10.title} - Made with Flowerpil`
    };

    const createdPlaylist = await tidalService.createPlaylist(token.access_token, playlistData);

    // Add tracks to playlist
    await tidalService.addTracksToPlaylist(token.access_token, createdPlaylist.uuid, tidalTrackIds);

    const playlistUrl = `https://tidal.com/browse/playlist/${createdPlaylist.uuid}`;

    // Update top10_playlists with export URL
    const db = getDatabase();
    db.prepare(`
      UPDATE top10_playlists
      SET tidal_export_url = ?, export_completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(playlistUrl, top10Id);

    logger.info('TOP10_EXPORT', 'Tidal export successful', {
      top10Id,
      playlistUrl,
      trackCount: tidalTrackIds.length
    });

    return {
      success: true,
      platform: 'tidal',
      url: playlistUrl,
      trackCount: tidalTrackIds.length
    };

  } catch (error) {
    logger.error('TOP10_EXPORT', 'Tidal export failed', {
      top10Id,
      error: error.message
    });

    return {
      success: false,
      platform: 'tidal',
      error: error.message
    };
  }
}

/**
 * Export Top 10 to multiple platforms
 * @param {number} top10Id - Top 10 playlist ID
 * @param {Array<string>} platforms - Array of platforms to export to
 * @returns {Promise<Object>} Export results
 */
export async function exportTop10(top10Id, platforms = []) {
  const db = getDatabase();
  const top10 = db.prepare('SELECT * FROM top10_playlists WHERE id = ?').get(top10Id);

  if (!top10) {
    throw new Error('Top 10 not found');
  }

  if (!top10.is_published) {
    throw new Error('Top 10 must be published before exporting');
  }

  const tracks = typeof top10.tracks === 'string' ? JSON.parse(top10.tracks) : top10.tracks;
  if (tracks.length !== 10) {
    throw new Error('Top 10 must have exactly 10 tracks');
  }

  const results = {};

  // Export to each requested platform
  for (const platform of platforms) {
    switch (platform.toLowerCase()) {
      case 'spotify':
        results.spotify = await exportTop10ToSpotify(top10Id, top10);
        break;
      case 'apple':
        results.apple = await exportTop10ToApple(top10Id, top10);
        break;
      case 'tidal':
        results.tidal = await exportTop10ToTidal(top10Id, top10);
        break;
      default:
        results[platform] = {
          success: false,
          platform,
          error: 'Unsupported platform'
        };
    }
  }

  // Check if all exports succeeded
  const allSucceeded = Object.values(results).every(r => r.success);
  const anySucceeded = Object.values(results).some(r => r.success);

  return {
    top10Id,
    platforms,
    results,
    allSucceeded,
    anySucceeded
  };
}

export default {
  exportTop10ToSpotify,
  exportTop10ToApple,
  exportTop10ToTidal,
  exportTop10
};
