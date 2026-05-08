/**
 * Top 10 Import Service
 * Imports tracks from various DSP platforms for Top 10 playlists
 * Limits imports to first 10 tracks only
 */

import { parseUrl } from './urlParsing.js';
import { detectUrlTarget, resolveUrlImport } from './urlImportService.js';
import { matchQobuzTracks, scrapeQobuzPlaylist, validateQobuzUrl } from './qobuzService.js';
import SpotifyService from './spotifyService.js';
import logger from '../utils/logger.js';
import { enrichTrackFromDatabase } from './trackLookupService.js';

const spotifyService = new SpotifyService();
const MAX_TOP10_TRACKS = 10;

const normalizeYear = (track) => {
  if (Number.isFinite(track?.year)) return track.year;
  if (Number.isFinite(track?.release_year)) return track.release_year;
  if (typeof track?.year === 'string') {
    const parsed = parseInt(track.year, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  const releaseDate = track?.album?.release_date || track?.release_date || null;
  if (releaseDate && typeof releaseDate === 'string') {
    const parsed = parseInt(releaseDate.slice(0, 4), 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const normalizeDurationValue = (value) => {
  if (!Number.isFinite(value)) return null;
  const ms = value >= 60000 ? value : value * 1000;
  return formatDuration(ms);
};

const normalizeDuration = (track) => {
  if (Number.isFinite(track?.duration_ms)) {
    return formatDuration(track.duration_ms);
  }
  if (typeof track?.duration === 'number') {
    return normalizeDurationValue(track.duration);
  }
  if (typeof track?.duration === 'string') {
    const trimmed = track.duration.trim();
    if (!trimmed) return null;
    if (/^\d+:\d{2}$/.test(trimmed)) return trimmed;
    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber)) return normalizeDurationValue(asNumber);
    return trimmed;
  }
  return null;
};

const getCustomSourceUrl = (track, name) => {
  const sources = Array.isArray(track?.custom_sources) ? track.custom_sources : [];
  const target = (name || '').toLowerCase();
  const match = sources.find((source) => (source?.name || '').toLowerCase() === target);
  return match?.url || null;
};

const normalizeArtist = (track) => {
  if (track?.artist) return track.artist;
  if (Array.isArray(track?.artists)) {
    const names = track.artists.map((artist) => artist?.name || artist).filter(Boolean);
    return names.join(', ');
  }
  return track?.artists?.[0]?.name || '';
};

const normalizeAlbum = (track) => {
  if (track?.album_name) return track.album_name;
  if (typeof track?.album === 'string') return track.album;
  if (track?.album?.name) return track.album.name;
  return null;
};

const normalizeArtwork = (track) => {
  return track.artwork_url
    || track.album_artwork_url
    || track.cover_art
    || track.images?.[0]?.url
    || track.album?.images?.[0]?.url
    || '';
};

/**
 * Transform track data to Top 10 format
 * @param {Object} track - Track data from DSP
 * @param {number} position - Position in Top 10 (1-10)
 * @returns {Object} Formatted track for Top 10
 */
function transformToTop10Track(track, position) {
  const youtubeUrl = track.youtube_url || getCustomSourceUrl(track, 'youtube');
  return {
    position,
    title: track.title || track.name || '',
    artist: normalizeArtist(track),
    album: normalizeAlbum(track),
    year: normalizeYear(track),
    duration: normalizeDuration(track),
    artwork_url: normalizeArtwork(track),
    blurb: null, // User will add blurbs later
    isrc: track.isrc || null, // ISRC for cross-platform linking
    spotify_url: track.spotify_url || track.external_urls?.spotify || null,
    apple_music_url: track.apple_music_url || null,
    tidal_url: track.tidal_url || null,
    youtube_url: youtubeUrl || null,
    soundcloud_url: track.soundcloud_url || getCustomSourceUrl(track, 'soundcloud') || null,
    bandcamp_url: track.bandcamp_url || getCustomSourceUrl(track, 'bandcamp') || null,
    qobuz_url: track.qobuz_url || getCustomSourceUrl(track, 'qobuz') || null,
    custom_url: null,
    custom_platform_name: null
  };
}

/**
 * Format duration from milliseconds to MM:SS
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 */
function formatDuration(ms) {
  if (!ms || isNaN(ms)) return null;
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * Enrich Top 10 tracks with data from database (track-overlap-cache feature)
 * Adds missing platform URLs and artwork from existing tracks table
 * @param {Array} tracks - Array of transformed Top 10 tracks
 * @returns {Promise<Array>} Enriched tracks
 */
async function enrichTop10Tracks(tracks) {
  return Promise.all(
    tracks.map(async (track) => {
      try {
        return await enrichTrackFromDatabase(track);
      } catch (error) {
        logger.warn('TOP10_IMPORT', 'Enrichment failed', {
          title: track.title,
          error: error.message
        });
        return track;
      }
    })
  );
}

async function searchSpotifyTrackByMetadata(accessToken, track) {
  if (!accessToken) return null;
  const isrc = track?.isrc ? String(track.isrc).trim() : '';
  const title = track?.title ? String(track.title).trim() : '';
  const artist = track?.artist ? String(track.artist).trim() : '';

  const search = async (query) => {
    const response = await spotifyService.makeRateLimitedRequest({
      method: 'get',
      url: `${spotifyService.baseURL}/search`,
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { q: query, type: 'track', limit: 10 }
    });
    return response?.data?.tracks?.items || [];
  };

  let items = [];
  if (isrc) {
    items = await search(`isrc:${encodeURIComponent(isrc)}`);
  }

  if (!items.length && title && artist) {
    items = await search(`track:${title} artist:${artist}`);
  }

  if (!items.length) return null;

  const nonCompilation = items.find((item) => item?.album?.album_type && item.album.album_type !== 'compilation');
  return nonCompilation || items[0] || null;
}

async function enrichAppleTrackWithSpotify(track, accessToken) {
  if (!track?.title || !track?.artist) return track;
  try {
    const spotifyTrack = await searchSpotifyTrackByMetadata(accessToken, track);
    if (!spotifyTrack) return track;

    const spotifyArtwork = spotifyTrack?.album?.images?.[0]?.url || null;
    const spotifyDuration = formatDuration(spotifyTrack?.duration_ms);
    const spotifyAlbum = spotifyTrack?.album?.name || null;

    return {
      ...track,
      album: track.album || spotifyAlbum || null,
      artwork_url: track.artwork_url || spotifyArtwork || '',
      duration: spotifyDuration || track.duration,
      spotify_url: track.spotify_url || spotifyTrack?.external_urls?.spotify || null
    };
  } catch (error) {
    logger.warn('TOP10_IMPORT', 'Spotify search failed for Apple track', {
      title: track.title,
      artist: track.artist,
      error: error?.message
    });
    return track;
  }
}

const shouldAttemptSpotifyArtworkFallback = (track) => {
  if (track?.bandcamp_url) return false;
  if (track?.artwork_url) return false;
  const hasIsrc = track?.isrc ? String(track.isrc).trim() : '';
  const title = track?.title ? String(track.title).trim() : '';
  const artist = track?.artist ? String(track.artist).trim() : '';
  return Boolean(hasIsrc || (title && artist));
};

async function enrichTrackWithSpotifyArtwork(track, accessToken) {
  if (!accessToken || !shouldAttemptSpotifyArtworkFallback(track)) return track;
  try {
    const spotifyTrack = await searchSpotifyTrackByMetadata(accessToken, track);
    if (!spotifyTrack) return track;
    const spotifyArtwork = spotifyTrack?.album?.images?.[0]?.url || null;
    const spotifyAlbum = spotifyTrack?.album?.name || null;
    return {
      ...track,
      album: track.album || spotifyAlbum || null,
      artwork_url: track.artwork_url || spotifyArtwork || ''
    };
  } catch (error) {
    logger.warn('TOP10_IMPORT', 'Spotify artwork fallback failed', {
      title: track?.title,
      artist: track?.artist,
      error: error?.message
    });
    return track;
  }
}

/**
 * Main import function - routes to appropriate platform
 * @param {string} url - DSP URL to import from
 * @param {Object} options - Import options
 * @returns {Promise<Array>} Array of tracks (max 10)
 */
export async function importFromUrl(url, options = {}) {
  try {
    const detection = detectUrlTarget(url);
    const normalizedUrl = detection?.normalizedUrl || url?.trim();

    if (detection?.platform) {
      logger.info('TOP10_IMPORT', 'Starting import', {
        provider: detection.platform,
        type: detection.kind,
        url: normalizedUrl
      });

      if (detection.platform === 'qobuz' && detection.kind === 'playlist') {
        return await importFromQobuzPlaylist(normalizedUrl, options);
      }

      return await importFromResolvedUrl(normalizedUrl, {
        kind: detection.kind || 'auto',
        match: options.match
      });
    }

    const parsed = parseUrl(url);
    if (parsed?.provider === 'spotify' && parsed.type === 'album') {
      logger.info('TOP10_IMPORT', 'Starting import', {
        provider: parsed.provider,
        type: parsed.type,
        id: parsed.id
      });
      return await importFromSpotify(parsed, options);
    }

    throw new Error('Unsupported or invalid URL');
  } catch (error) {
    logger.error('TOP10_IMPORT', 'Import failed', error);
    throw error;
  }
}

async function importFromResolvedUrl(url, options = {}) {
  const result = await resolveUrlImport(url, {
    kind: options.kind || 'auto',
    match: options.match !== false
  });
  const tracks = result?.kind === 'track' ? [result.track] : (result?.tracks || []);
  const transformed = tracks.slice(0, MAX_TOP10_TRACKS).map((track, index) => transformToTop10Track(track, index + 1));

  // Enrich with Spotify artwork if needed
  let enriched = transformed;
  const needsArtwork = transformed.some((track) => !track.artwork_url);
  if (needsArtwork) {
    const accessToken = await spotifyService.getClientCredentialsToken().catch(() => null);
    if (accessToken) {
      enriched = await Promise.all(transformed.map((track) => enrichTrackWithSpotifyArtwork(track, accessToken)));
    }
  }

  // Enrich with database data (track-overlap-cache)
  return enrichTop10Tracks(enriched);
}

async function fetchSpotifyTrack(accessToken, trackId) {
  if (!trackId) return null;
  const response = await spotifyService.makeRateLimitedRequest({
    method: 'get',
    url: `${spotifyService.baseURL}/tracks/${trackId}`,
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return response?.data || null;
}

async function fetchSpotifyAlbum(accessToken, albumId) {
  if (!albumId) return null;
  const response = await spotifyService.makeRateLimitedRequest({
    method: 'get',
    url: `${spotifyService.baseURL}/albums/${albumId}`,
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return response?.data || null;
}

async function importFromQobuzPlaylist(url) {
  const validation = validateQobuzUrl(url);
  if (!validation.valid) {
    throw new Error('Invalid Qobuz URL format');
  }

  const qobuzTracks = await scrapeQobuzPlaylist(url);
  if (!qobuzTracks || qobuzTracks.length === 0) {
    throw new Error('No tracks found in Qobuz playlist');
  }

  const limitedTracks = qobuzTracks.slice(0, MAX_TOP10_TRACKS).map((track, index) => ({
    ...track,
    __index: index
  }));
  const matchResults = await matchQobuzTracks(limitedTracks, url);
  const matchedByIndex = new Map();

  for (const match of matchResults.matched || []) {
    const idx = match?.qobuzTrack?.__index;
    if (Number.isInteger(idx)) {
      matchedByIndex.set(idx, match);
    }
  }

  const accessToken = await spotifyService.getClientCredentialsToken().catch(() => null);

  const merged = await Promise.all(limitedTracks.map(async (track, index) => {
    const match = matchedByIndex.get(index);
    if (!match?.spotifyTrack?.id || !accessToken) {
      return transformToTop10Track({
        title: track.title || '',
        artist: track.artist || '',
        album: track.album || null,
        duration: track.duration || null,
        isrc: track.isrc || null,
        qobuz_url: url
      }, index + 1);
    }

    let fullTrack = match.spotifyTrack;
    if (!fullTrack?.name || !fullTrack?.artists) {
      try {
        fullTrack = await fetchSpotifyTrack(accessToken, match.spotifyTrack.id);
      } catch {
        fullTrack = match.spotifyTrack;
      }
    }

    return transformToTop10Track({
      title: fullTrack?.name || track.title || '',
      artist: Array.isArray(fullTrack?.artists)
        ? fullTrack.artists.map((artist) => artist?.name).filter(Boolean).join(', ')
        : (fullTrack?.artist || track.artist || ''),
      album: fullTrack?.album?.name || track.album || '',
      year: fullTrack?.album?.release_date ? parseInt(fullTrack.album.release_date.slice(0, 4), 10) : null,
      duration_ms: fullTrack?.duration_ms,
      artwork_url: fullTrack?.album?.images?.[0]?.url || null,
      spotify_id: fullTrack?.id || match.spotifyTrack.id,
      spotify_url: fullTrack?.external_urls?.spotify || match.spotifyTrack.url || null,
      isrc: fullTrack?.external_ids?.isrc || track.isrc || null,
      qobuz_url: url
    }, index + 1);
  }));

  // Enrich with database data (track-overlap-cache)
  return enrichTop10Tracks(merged);
}

/**
 * Import from Spotify
 * @param {Object} parsed - Parsed URL info
 * @param {Object} options - Import options (may include access token)
 * @returns {Promise<Array>} Array of tracks (max 10)
 */
export async function importFromSpotify(parsed, options = {}) {
  try {
    const { type, id } = parsed;

    // For Spotify, we need an access token
    // Check if we have a curator token or use app-only auth
    const accessToken = options.accessToken || await spotifyService.getClientCredentialsToken();

    let tracks = [];

    if (type === 'playlist') {
      const details = await spotifyService.getPlaylistDetails(accessToken, id);
      tracks = spotifyService.transformTracksForFlowerpil(details.tracks);
    } else if (type === 'album') {
      const albumData = await fetchSpotifyAlbum(accessToken, id);
      const albumTracks = albumData?.tracks?.items || [];
      tracks = albumTracks.map((track) => ({
        title: track?.name || '',
        artist: Array.isArray(track?.artists)
          ? track.artists.map((artist) => artist?.name).filter(Boolean).join(', ')
          : '',
        album: albumData?.name || '',
        year: albumData?.release_date ? parseInt(albumData.release_date.slice(0, 4), 10) : null,
        duration_ms: track?.duration_ms,
        artwork_url: albumData?.images?.[0]?.url || null,
        spotify_id: track?.id || null,
        spotify_url: track?.external_urls?.spotify || (track?.id ? `https://open.spotify.com/track/${track.id}` : null),
        explicit: Boolean(track?.explicit),
        preview_url: track?.preview_url || null
      }));
    } else if (type === 'track') {
      const trackData = await fetchSpotifyTrack(accessToken, id);
      if (trackData) {
        tracks = [trackData];
      }
    }

    const transformed = tracks.slice(0, MAX_TOP10_TRACKS).map((track, index) => transformToTop10Track(track, index + 1));
    // Enrich with database data (track-overlap-cache)
    return enrichTop10Tracks(transformed);

  } catch (error) {
    logger.error('TOP10_IMPORT', 'Spotify import failed', error);
    throw new Error(`Failed to import from Spotify: ${error.message}`);
  }
}

/**
 * Import from Apple Music
 * @param {Object} parsed - Parsed URL info
 * @param {Object} options - Import options
 * @returns {Promise<Array>} Array of tracks (max 10)
 */
export async function importFromApple(parsed, options = {}) {
  try {
    const tracks = await importFromResolvedUrl(parsed.url, options);
    const accessToken = await spotifyService.getClientCredentialsToken().catch(() => null);
    if (!accessToken) return tracks;

    const enriched = await Promise.all(
      tracks.map((track) => enrichAppleTrackWithSpotify(track, accessToken))
    );
    return enriched;
  } catch (error) {
    logger.error('TOP10_IMPORT', 'Apple Music import failed', error);
    throw new Error(`Failed to import from Apple Music: ${error.message}`);
  }
}

/**
 * Import from Tidal
 * @param {Object} parsed - Parsed URL info
 * @param {Object} options - Import options
 * @returns {Promise<Array>} Array of tracks (max 10)
 */
export async function importFromTidal(parsed, options = {}) {
  try {
    return await importFromResolvedUrl(parsed.url, options);
  } catch (error) {
    logger.error('TOP10_IMPORT', 'Tidal import failed', error);
    throw new Error(`Failed to import from Tidal: ${error.message}`);
  }
}

/**
 * Import from Qobuz
 * @param {Object} parsed - Parsed URL info
 * @param {Object} options - Import options
 * @returns {Promise<Array>} Array of tracks (max 10)
 */
export async function importFromQobuz(parsed, options = {}) {
  try {
    if (parsed.type === 'playlist') {
      return await importFromQobuzPlaylist(parsed.url, options);
    }
    return await importFromResolvedUrl(parsed.url, options);
  } catch (error) {
    logger.error('TOP10_IMPORT', 'Qobuz import failed', error);
    throw new Error(`Failed to import from Qobuz: ${error.message}`);
  }
}

/**
 * Import from SoundCloud
 * @param {Object} parsed - Parsed URL info
 * @param {Object} options - Import options
 * @returns {Promise<Array>} Array of tracks (max 10)
 */
export async function importFromSoundCloud(parsed, options = {}) {
  try {
    return await importFromResolvedUrl(parsed.url, options);
  } catch (error) {
    logger.error('TOP10_IMPORT', 'SoundCloud import failed', error);
    throw new Error(`Failed to import from SoundCloud: ${error.message}`);
  }
}

/**
 * Import from YouTube
 * @param {Object} parsed - Parsed URL info
 * @param {Object} options - Import options
 * @returns {Promise<Array>} Array of tracks (max 10)
 */
export async function importFromYoutube(parsed, options = {}) {
  try {
    return await importFromResolvedUrl(parsed.url, options);
  } catch (error) {
    logger.error('TOP10_IMPORT', 'YouTube import failed', error);
    throw new Error(`Failed to import from YouTube: ${error.message}`);
  }
}

/**
 * Import from Bandcamp
 * @param {Object} parsed - Parsed URL info
 * @param {Object} options - Import options
 * @returns {Promise<Array>} Array of tracks (max 10)
 */
export async function importFromBandcamp(parsed, options = {}) {
  try {
    return await importFromResolvedUrl(parsed.url, options);
  } catch (error) {
    logger.error('TOP10_IMPORT', 'Bandcamp import failed', error);
    throw new Error(`Failed to import from Bandcamp: ${error.message}`);
  }
}

export default {
  importFromUrl,
  importFromSpotify,
  importFromApple,
  importFromTidal,
  importFromQobuz,
  importFromSoundCloud,
  importFromYoutube,
  importFromBandcamp
};
