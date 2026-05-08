/**
 * Track Lookup Service
 * Provides database-first track lookups to reduce external API calls.
 * Used by Top 10 imports and inline preview endpoint.
 */

import { getQueries } from '../database/db.js';
import logger from '../utils/logger.js';

/**
 * Extract Spotify track ID from URL or return ID if already extracted
 * @param {string} spotifyIdOrUrl - Spotify ID or URL
 * @returns {string|null} Spotify track ID
 */
function extractSpotifyId(spotifyIdOrUrl) {
  if (!spotifyIdOrUrl) return null;
  const str = String(spotifyIdOrUrl).trim();

  // Already an ID (22 chars, alphanumeric)
  if (/^[a-zA-Z0-9]{22}$/.test(str)) return str;

  // Extract from URL
  const match = str.match(/track\/([a-zA-Z0-9]{22})/);
  return match ? match[1] : null;
}

/**
 * Find track by ISRC (International Standard Recording Code)
 * @param {string} isrc - ISRC code
 * @returns {Object|null} Track object or null
 */
export async function findTrackByIsrc(isrc) {
  if (!isrc) return null;
  const queries = getQueries();
  const normalizedIsrc = String(isrc).trim().toUpperCase();

  try {
    const track = queries.findTrackByIsrc.get(normalizedIsrc);
    if (track) {
      logger.debug('TRACK_LOOKUP', 'Found by ISRC', { isrc: normalizedIsrc, track_id: track.id });
    }
    return track || null;
  } catch (error) {
    logger.error('TRACK_LOOKUP', 'ISRC lookup failed', { isrc: normalizedIsrc, error: error.message });
    return null;
  }
}

/**
 * Find track by Spotify ID
 * @param {string} spotifyIdOrUrl - Spotify track ID or URL
 * @returns {Object|null} Track object or null
 */
export async function findTrackBySpotifyId(spotifyIdOrUrl) {
  const spotifyId = extractSpotifyId(spotifyIdOrUrl);
  if (!spotifyId) return null;
  const queries = getQueries();

  try {
    const track = queries.findTrackBySpotifyId.get(spotifyId);
    if (track) {
      logger.debug('TRACK_LOOKUP', 'Found by Spotify ID', { spotify_id: spotifyId, track_id: track.id });
    }
    return track || null;
  } catch (error) {
    logger.error('TRACK_LOOKUP', 'Spotify ID lookup failed', { spotify_id: spotifyId, error: error.message });
    return null;
  }
}

/**
 * Find track by title and artist (case-insensitive)
 * @param {string} title - Track title
 * @param {string} artist - Artist name
 * @returns {Object|null} Track object or null
 */
export async function findTrackByMetadata(title, artist) {
  if (!title || !artist) return null;
  const queries = getQueries();
  const normalizedTitle = String(title).trim();
  const normalizedArtist = String(artist).trim();

  try {
    const track = queries.findTrackByTitleArtist.get(normalizedTitle, normalizedArtist);
    if (track) {
      logger.debug('TRACK_LOOKUP', 'Found by metadata', { title: normalizedTitle, artist: normalizedArtist, track_id: track.id });
    }
    return track || null;
  } catch (error) {
    logger.error('TRACK_LOOKUP', 'Metadata lookup failed', { title: normalizedTitle, artist: normalizedArtist, error: error.message });
    return null;
  }
}

/**
 * Find track with valid preview data
 * Tries ISRC first, then falls back to title/artist match
 * @param {string} title - Track title
 * @param {string} artist - Artist name
 * @param {string} isrc - Optional ISRC code
 * @returns {Object|null} Track object with preview data or null
 */
export async function findTrackWithPreview(title, artist, isrc) {
  const queries = getQueries();

  // Try ISRC first (most reliable)
  if (isrc) {
    try {
      const track = queries.findTrackWithPreviewByIsrc.get(String(isrc).trim().toUpperCase());
      if (track) {
        logger.info('TRACK_CACHE', 'Preview cache hit by ISRC', { isrc, track_id: track.id });
        return track;
      }
    } catch (error) {
      logger.warn('TRACK_LOOKUP', 'ISRC preview lookup failed', { isrc, error: error.message });
    }
  }

  // Fall back to metadata match
  if (title && artist) {
    try {
      const track = queries.findTrackWithPreviewByMetadata.get(
        String(title).trim(),
        String(artist).trim()
      );
      if (track) {
        logger.info('TRACK_CACHE', 'Preview cache hit by metadata', { title, artist, track_id: track.id });
        return track;
      }
    } catch (error) {
      logger.warn('TRACK_LOOKUP', 'Metadata preview lookup failed', { title, artist, error: error.message });
    }
  }

  logger.debug('TRACK_CACHE', 'Preview cache miss', { title, artist, isrc });
  return null;
}

/**
 * Enrich an inline track object with data from database
 * Merges missing platform URLs, artwork, ISRC from matched DB track
 * @param {Object} inlineTrack - Track object from Top 10 import
 * @returns {Object} Enriched track object
 */
export async function enrichTrackFromDatabase(inlineTrack) {
  if (!inlineTrack) return inlineTrack;

  // Try to find matching track in database
  let dbTrack = null;

  // Priority 1: ISRC lookup
  if (inlineTrack.isrc) {
    dbTrack = await findTrackByIsrc(inlineTrack.isrc);
  }

  // Priority 2: Spotify ID lookup
  if (!dbTrack && inlineTrack.spotify_url) {
    dbTrack = await findTrackBySpotifyId(inlineTrack.spotify_url);
  }

  // Priority 3: Metadata lookup (less reliable)
  if (!dbTrack && inlineTrack.title && inlineTrack.artist) {
    dbTrack = await findTrackByMetadata(inlineTrack.title, inlineTrack.artist);
  }

  if (!dbTrack) {
    return inlineTrack;
  }

  logger.info('TRACK_ENRICHMENT', 'Enriching track from database', {
    title: inlineTrack.title,
    artist: inlineTrack.artist,
    db_track_id: dbTrack.id
  });

  // Merge missing data from database track
  return {
    ...inlineTrack,
    // Only fill in missing values, don't overwrite existing
    isrc: inlineTrack.isrc || dbTrack.isrc || null,
    artwork_url: inlineTrack.artwork_url || dbTrack.artwork_url || dbTrack.album_artwork_url || '',
    apple_music_url: inlineTrack.apple_music_url || dbTrack.apple_music_url || null,
    tidal_url: inlineTrack.tidal_url || dbTrack.tidal_url || null,
    soundcloud_url: inlineTrack.soundcloud_url || dbTrack.soundcloud_url || null,
    bandcamp_url: inlineTrack.bandcamp_url || dbTrack.bandcamp_url || null,
    qobuz_url: inlineTrack.qobuz_url || dbTrack.qobuz_url || null,
    // Store reference to DB track for preview lookups
    _db_track_id: dbTrack.id,
    _enriched_from_db: true
  };
}

export default {
  findTrackByIsrc,
  findTrackBySpotifyId,
  findTrackByMetadata,
  findTrackWithPreview,
  enrichTrackFromDatabase
};
