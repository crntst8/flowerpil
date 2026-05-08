import logger from '../utils/logger.js';
import SpotifyService from './spotifyService.js';
import tidalService, { searchTidalByTrack } from './tidalService.js';
import appleMusicApiService from './appleMusicApiService.js';
import { searchAppleMusicByTrack } from './appleMusicService.js';
import bandcampService, { validateBandcampTrackUrl } from './bandcampService.js';

const spotifyService = new SpotifyService();

const DEFAULT_APPLE_STOREFRONT = (process.env.APPLE_MUSIC_STOREFRONT || 'us').toLowerCase();
const DEFAULT_TIDAL_COUNTRY_CODE = (process.env.TIDAL_COUNTRY_CODE || 'AU').toUpperCase();
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || null;

let soundcloudServicePromise = null;
const getSoundcloudService = async () => {
  if (!soundcloudServicePromise) {
    soundcloudServicePromise = import('./soundcloudService.js')
      .then((mod) => mod.default)
      .catch((error) => {
        soundcloudServicePromise = null;
        const message = String(error?.message || '');
        if (message.includes('SoundCloud client credentials are required') || message.includes('SOUNDCLOUD_CLIENT_ID')) {
          const err = new Error('SoundCloud is not configured on this server (missing SoundCloud client credentials)');
          err.code = 'SOUNDCLOUD_NOT_CONFIGURED';
          err.cause = error;
          throw err;
        }
        throw error;
      });
  }
  return soundcloudServicePromise;
};

const msToDuration = (ms) => {
  if (!ms && ms !== 0) return '';
  const totalSeconds = Math.max(0, Math.round(Number(ms) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const parseIsoDurationSeconds = (iso) => {
  if (!iso || typeof iso !== 'string') return null;
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  const hours = parseInt(m[1] || '0', 10);
  const mins = parseInt(m[2] || '0', 10);
  const secs = parseInt(m[3] || '0', 10);
  const total = (hours * 3600) + (mins * 60) + secs;
  return Number.isFinite(total) ? total : null;
};

const safeYear = (value) => {
  const n = typeof value === 'number' ? value : Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const normalizeWhitespace = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const normalizeCustomSources = (sources) => {
  if (!sources) return [];
  if (typeof sources === 'string') {
    try {
      const parsed = JSON.parse(sources);
      return normalizeCustomSources(parsed);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(sources)) return [];
  return sources
    .map((s) => ({
      name: normalizeWhitespace(s?.name || ''),
      url: normalizeWhitespace(s?.url || '')
    }))
    .filter((s) => s.name && s.url);
};

const withCustomSource = (track, source) => {
  const next = { ...(track || {}) };
  const sources = normalizeCustomSources(next.custom_sources);
  const name = normalizeWhitespace(source?.name || '');
  const url = normalizeWhitespace(source?.url || '');
  if (name && url) {
    const exists = sources.some((s) => s.name.toLowerCase() === name.toLowerCase() && s.url === url);
    if (!exists) sources.push({ name, url });
  }
  next.custom_sources = sources;
  return next;
};

const buildBasicTrack = (partial = {}) => ({
  title: normalizeWhitespace(partial.title || ''),
  artist: normalizeWhitespace(partial.artist || ''),
  album: normalizeWhitespace(partial.album || ''),
  year: safeYear(partial.year),
  duration: normalizeWhitespace(partial.duration || ''),
  isrc: normalizeWhitespace(partial.isrc || '') || null,
  explicit: Boolean(partial.explicit),
  popularity: Number.isFinite(Number(partial.popularity)) ? Number(partial.popularity) : null,
  preview_url: normalizeWhitespace(partial.preview_url || '') || null,
  artwork_url: normalizeWhitespace(partial.artwork_url || '') || null,
  album_artwork_url: normalizeWhitespace(partial.album_artwork_url || '') || null,
  spotify_id: partial.spotify_id || null,
  apple_id: partial.apple_id || null,
  tidal_id: partial.tidal_id || null,
  spotify_url: partial.spotify_url || null,
  apple_music_url: partial.apple_music_url || null,
  tidal_url: partial.tidal_url || null,
  youtube_url: partial.youtube_url || null,
  soundcloud_url: partial.soundcloud_url || null,
  bandcamp_url: partial.bandcamp_url || null,
  qobuz_url: partial.qobuz_url || null,
  custom_sources: normalizeCustomSources(partial.custom_sources || [])
});

export const detectUrlTarget = (input) => {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw) return { platform: null, kind: null, normalizedUrl: null };

  // Spotify URIs
  const spotifyTrackUri = raw.match(/^spotify:track:([a-zA-Z0-9]+)$/i);
  if (spotifyTrackUri) return { platform: 'spotify', kind: 'track', normalizedUrl: raw };
  const spotifyPlaylistUri = raw.match(/^spotify:playlist:([a-zA-Z0-9]+)$/i);
  if (spotifyPlaylistUri) return { platform: 'spotify', kind: 'playlist', normalizedUrl: raw };

  // Bandcamp (track-only)
  if (validateBandcampTrackUrl(raw)) {
    return { platform: 'bandcamp', kind: 'track', normalizedUrl: raw };
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return { platform: null, kind: null, normalizedUrl: raw };
  }

  const hostname = (parsed.hostname || '').toLowerCase();
  const pathname = parsed.pathname || '';

  // Spotify
  if (hostname === 'open.spotify.com') {
    if (/^\/track\/[a-zA-Z0-9]+/i.test(pathname)) return { platform: 'spotify', kind: 'track', normalizedUrl: parsed.toString() };
    if (/^\/playlist\/[a-zA-Z0-9]+/i.test(pathname)) return { platform: 'spotify', kind: 'playlist', normalizedUrl: parsed.toString() };
  }

  // SoundCloud (track or playlist)
  if (hostname.endsWith('soundcloud.com') || hostname === 'on.soundcloud.com') {
    // SoundCloud doesn't cleanly distinguish by URL; treat as "auto" and resolve via API.
    return { platform: 'soundcloud', kind: 'auto', normalizedUrl: parsed.toString() };
  }

  // Qobuz
  if (hostname.endsWith('qobuz.com')) {
    if (/\/playlist\//i.test(pathname)) return { platform: 'qobuz', kind: 'playlist', normalizedUrl: parsed.toString() };
    if (/\/track\//i.test(pathname)) return { platform: 'qobuz', kind: 'track', normalizedUrl: parsed.toString() };
  }

  // TIDAL
  if (hostname === 'tidal.com') {
    if (/\/playlist\//i.test(pathname)) return { platform: 'tidal', kind: 'playlist', normalizedUrl: parsed.toString() };
    if (/\/track\//i.test(pathname)) return { platform: 'tidal', kind: 'track', normalizedUrl: parsed.toString() };
  }

  // Apple Music
  if (hostname === 'music.apple.com') {
    if (parsed.searchParams.get('i')) return { platform: 'apple', kind: 'track', normalizedUrl: parsed.toString() };
    if (/\/song\/\d+/i.test(pathname)) return { platform: 'apple', kind: 'track', normalizedUrl: parsed.toString() };
    if (/\/playlist\//i.test(pathname)) return { platform: 'apple', kind: 'playlist', normalizedUrl: parsed.toString() };
  }

  // YouTube
  if (hostname === 'youtu.be' || hostname.endsWith('youtube.com')) {
    const listId = parsed.searchParams.get('list');
    const videoId = parsed.searchParams.get('v') || (hostname === 'youtu.be' ? pathname.replace(/^\/+/, '').split('/')[0] : null);
    if (listId && !videoId) return { platform: 'youtube', kind: 'playlist', normalizedUrl: parsed.toString() };
    if (videoId) return { platform: 'youtube', kind: 'track', normalizedUrl: parsed.toString() };
    if (/^\/playlist$/i.test(pathname) && listId) return { platform: 'youtube', kind: 'playlist', normalizedUrl: parsed.toString() };
  }

  return { platform: null, kind: null, normalizedUrl: parsed.toString() };
};

const extractSpotifyTrackId = (url) => {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  const uriMatch = trimmed.match(/^spotify:track:([a-zA-Z0-9]+)/i);
  if (uriMatch) return uriMatch[1];
  const webMatch = trimmed.match(/^https?:\/\/open\.spotify\.com\/track\/([a-zA-Z0-9]+)/i);
  if (webMatch) return webMatch[1];
  return null;
};

const extractSpotifyPlaylistId = (url) => spotifyService.extractPlaylistId(url);

const extractTidalTrackId = (url) => tidalService.extractTrackId(url);

const extractTidalPlaylistId = (url) => {
  if (!url || typeof url !== 'string') return null;
  let parsed;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  const hostname = (parsed.hostname || '').toLowerCase();
  if (!/(^|\.)tidal\.com$/.test(hostname)) return null;
  const segments = (parsed.pathname || '').split('/').filter(Boolean);
  const playlistIndex = segments.findIndex((segment) => segment.toLowerCase() === 'playlist');
  if (playlistIndex === -1) return null;
  const candidate = segments[playlistIndex + 1] || '';
  if (!candidate) return null;
  return /^[a-zA-Z0-9-]+$/.test(candidate) ? candidate : null;
};

const extractAppleStorefrontFromUrl = (url, fallback = DEFAULT_APPLE_STOREFRONT) => {
  try {
    const parsed = new URL(url);
    const segments = (parsed.pathname || '').split('/').filter(Boolean);
    const maybe = (segments[0] || '').toLowerCase();
    return /^[a-z]{2}$/.test(maybe) ? maybe : fallback;
  } catch {
    return fallback;
  }
};

const extractAppleSongIdFromUrl = (url) => {
  try {
    const parsed = new URL(url);
    const queryId = parsed.searchParams.get('i');
    if (queryId && /^\d+$/.test(queryId)) return queryId;
    const segments = (parsed.pathname || '').split('/').filter(Boolean);
    const songIndex = segments.findIndex((seg) => seg.toLowerCase() === 'song');
    if (songIndex >= 0) {
      const candidate = segments[songIndex + 1] || null;
      if (candidate && /^\d+$/.test(candidate)) return candidate;
    }
    return null;
  } catch {
    return null;
  }
};

const extractYouTubeIds = (url) => {
  try {
    const parsed = new URL(url);
    const hostname = (parsed.hostname || '').toLowerCase();
    const pathname = parsed.pathname || '';
    const list = parsed.searchParams.get('list') || null;
    const v = parsed.searchParams.get('v') || null;
    const shortId = hostname === 'youtu.be' ? pathname.replace(/^\/+/, '').split('/')[0] : null;
    const video = v || shortId || null;
    return { playlistId: list, videoId: video };
  } catch {
    return { playlistId: null, videoId: null };
  }
};

const youtubeRequest = async (path, params) => {
  if (!YOUTUBE_API_KEY) {
    const error = new Error('YouTube API key missing (YOUTUBE_API_KEY)');
    error.code = 'YOUTUBE_API_KEY_MISSING';
    throw error;
  }
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  Object.entries(params || {}).forEach(([key, val]) => {
    if (val === undefined || val === null || val === '') return;
    url.searchParams.set(key, String(val));
  });
  url.searchParams.set('key', YOUTUBE_API_KEY);

  const resp = await fetch(url.toString(), { method: 'GET' });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    // Parse common YouTube API errors into user-friendly messages
    const lowerText = text.toLowerCase();
    if (lowerText.includes('api_key_http_referrer_blocked') || lowerText.includes('referer')) {
      throw new Error('YouTube imports are temporarily unavailable due to API configuration. Please use Spotify or add tracks manually.');
    }
    if (lowerText.includes('api_key_invalid') || lowerText.includes('invalid') || lowerText.includes('token')) {
      throw new Error('YouTube imports are temporarily unavailable. Please use Spotify or add tracks manually.');
    }
    if (resp.status === 404 || lowerText.includes('not found') || lowerText.includes('playlistnotfound')) {
      throw new Error('YouTube playlist not found. Note: YouTube Music album links are not supported - please use a playlist link instead.');
    }
    throw new Error(`YouTube API error ${resp.status}: ${text}`);
  }
  return resp.json();
};

const parseYouTubeTitle = (rawTitle, channelTitle) => {
  const title = normalizeWhitespace(rawTitle || '');
  if (!title) return { artist: normalizeWhitespace(channelTitle || ''), title: '' };

  // common: "Artist - Track"
  const hyphenMatch = title.split(' - ');
  if (hyphenMatch.length >= 2) {
    const artist = normalizeWhitespace(hyphenMatch[0]);
    const trackTitle = normalizeWhitespace(hyphenMatch.slice(1).join(' - '));
    if (artist && trackTitle) return { artist, title: trackTitle };
  }

  return { artist: normalizeWhitespace(channelTitle || ''), title };
};

const enrichWithPreferredDspMatch = async (track, { storefront = DEFAULT_APPLE_STOREFRONT } = {}) => {
  const base = buildBasicTrack(track);

  // Bandcamp must never be enriched via other DSPs.
  if (base.bandcamp_url) {
    return base;
  }

  if (base.spotify_id || base.tidal_id || base.apple_id) {
    return base;
  }

  try {
    const spotifyMatch = await spotifyService.searchByTrack({
      title: base.title,
      artist: base.artist,
      album: base.album,
      duration: base.duration,
      isrc: base.isrc || null
    });

    if (spotifyMatch?.id) {
      const token = await spotifyService.getClientCredentialsToken();
      const response = await spotifyService.makeRateLimitedRequest({
        method: 'get',
        url: `${spotifyService.baseURL}/tracks/${spotifyMatch.id}`,
        headers: { Authorization: `Bearer ${token}` }
      });
      const full = response?.data || null;
      const artists = Array.isArray(full?.artists) ? full.artists.map((a) => a.name).filter(Boolean).join(', ') : base.artist;
      const album = full?.album?.name || base.album || '';
      const year = full?.album?.release_date ? safeYear(String(full.album.release_date).slice(0, 4)) : base.year;
      const artwork = full?.album?.images?.[0]?.url || base.album_artwork_url || base.artwork_url || null;
      const isrc = full?.external_ids?.isrc || base.isrc || null;

      return buildBasicTrack({
        ...base,
        spotify_id: String(full.id || spotifyMatch.id),
        spotify_url: full?.external_urls?.spotify || spotifyMatch.url || `https://open.spotify.com/track/${spotifyMatch.id}`,
        title: full?.name || base.title,
        artist: artists || base.artist,
        album,
        year,
        album_artwork_url: artwork,
        artwork_url: base.artwork_url || artwork,
        preview_url: full?.preview_url || base.preview_url,
        explicit: Boolean(full?.explicit) || base.explicit,
        popularity: Number.isFinite(full?.popularity) ? full.popularity : base.popularity,
        isrc
      });
    }
  } catch (error) {
    logger.warn('URL_IMPORT_MATCH', 'Spotify match failed, falling back', { error: error.message, title: base.title, artist: base.artist });
  }

  try {
    const tidalMatch = await searchTidalByTrack({
      title: base.title,
      artist: base.artist,
      album: base.album,
      duration: base.duration,
      isrc: base.isrc || null
    });
    if (tidalMatch?.id) {
      return buildBasicTrack({
        ...base,
        tidal_id: String(tidalMatch.id),
        tidal_url: tidalMatch.url || `https://tidal.com/browse/track/${tidalMatch.id}`,
        title: tidalMatch.title || base.title,
        artist: tidalMatch.artist || base.artist,
        album: tidalMatch.album || base.album,
        isrc: tidalMatch.isrc || base.isrc || null
      });
    }
  } catch (error) {
    logger.warn('URL_IMPORT_MATCH', 'Tidal match failed, falling back', { error: error.message, title: base.title, artist: base.artist });
  }

  try {
    const appleMatch = await searchAppleMusicByTrack({
      title: base.title,
      artist: base.artist,
      album: base.album,
      duration: base.duration,
      isrc: base.isrc || null
    }, { storefront });
    if (appleMatch?.id) {
      return buildBasicTrack({
        ...base,
        apple_id: String(appleMatch.id),
        apple_music_url: appleMatch.url || base.apple_music_url || null,
        title: appleMatch.title || base.title,
        artist: appleMatch.artist || base.artist,
        album: appleMatch.album || base.album,
        isrc: appleMatch.isrc || base.isrc || null
      });
    }
  } catch (error) {
    logger.warn('URL_IMPORT_MATCH', 'Apple match failed', { error: error.message, title: base.title, artist: base.artist });
  }

  return base;
};

export async function resolveTrackFromUrl(url, { match = true } = {}) {
  const { platform, kind, normalizedUrl } = detectUrlTarget(url);
  const targetUrl = normalizedUrl || url;

  if (!platform) {
    throw new Error('Unsupported track URL');
  }
  if (platform !== 'soundcloud' && kind !== 'track') {
    throw new Error('Unsupported track URL');
  }

  if (platform === 'bandcamp') {
    const data = await bandcampService.resolveTrackUrl(targetUrl);
    const base = buildBasicTrack({
      ...data,
      bandcamp_url: data.bandcamp_url || targetUrl
    });
    return withCustomSource(base, { name: 'Bandcamp', url: base.bandcamp_url });
  }

  if (platform === 'soundcloud') {
    const soundcloudService = await getSoundcloudService();
    const resolved = await soundcloudService.resolveUrl(targetUrl);
    if (!resolved || resolved.kind !== 'track') {
      throw new Error('Only SoundCloud track URLs are supported');
    }
    const scTrack = await soundcloudService.buildTrack(resolved);
    const base = buildBasicTrack({ ...scTrack, soundcloud_url: scTrack?.soundcloud_url || targetUrl });
    const withSource = withCustomSource(base, { name: 'SoundCloud', url: base.soundcloud_url || targetUrl });
    return match ? enrichWithPreferredDspMatch(withSource) : withSource;
  }

  if (platform === 'spotify') {
    const trackId = extractSpotifyTrackId(targetUrl);
    if (!trackId) throw new Error('Invalid Spotify track URL');

    let token;
    try {
      token = await spotifyService.getClientCredentialsToken();
    } catch (error) {
      logger.error('Spotify token retrieval failed during URL import', { error: error.message });
      throw new Error(`Spotify authentication failed: ${error.message}`);
    }

    let response;
    try {
      response = await spotifyService.makeRateLimitedRequest({
        method: 'get',
        url: `${spotifyService.baseURL}/tracks/${trackId}`,
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (error) {
      if (error.response?.status === 429) {
        logger.warn('Spotify rate limit hit during URL import', { trackId });
        throw new Error('Spotify API rate limit exceeded. Please try again later.');
      }
      if (error.response?.status === 404) {
        throw new Error('Spotify track not found');
      }
      logger.error('Spotify track lookup failed', { trackId, error: error.message });
      throw new Error(`Spotify track lookup failed: ${error.message}`);
    }

    const t = response?.data || null;
    if (!t?.id) throw new Error('Spotify track not found');

    const base = buildBasicTrack({
      title: t.name || '',
      artist: Array.isArray(t.artists) ? t.artists.map((a) => a.name).filter(Boolean).join(', ') : '',
      album: t.album?.name || '',
      year: t.album?.release_date ? safeYear(String(t.album.release_date).slice(0, 4)) : null,
      duration: msToDuration(t.duration_ms),
      spotify_id: String(t.id),
      spotify_url: t.external_urls?.spotify || `https://open.spotify.com/track/${t.id}`,
      isrc: t.external_ids?.isrc || null,
      explicit: Boolean(t.explicit),
      popularity: Number.isFinite(t.popularity) ? t.popularity : null,
      preview_url: t.preview_url || null,
      album_artwork_url: t.album?.images?.[0]?.url || null,
      artwork_url: t.album?.images?.[0]?.url || null
    });

    return match ? enrichWithPreferredDspMatch(base) : base;
  }

  if (platform === 'tidal') {
    const trackId = extractTidalTrackId(targetUrl);
    if (!trackId) throw new Error('Invalid TIDAL track URL');
    const t = await tidalService.getTrackById(trackId);
    if (!t?.id) throw new Error('TIDAL track not found');

    const base = buildBasicTrack({
      title: t.title || '',
      artist: t.artist || '',
      album: t.album || '',
      year: t.releaseDate ? safeYear(String(t.releaseDate).slice(0, 4)) : null,
      duration: typeof t.duration === 'number' ? msToDuration(t.duration * 1000) : '',
      tidal_id: String(t.id),
      tidal_url: t.url || `https://tidal.com/browse/track/${t.id}`,
      isrc: t.isrc || null
    });

    return match ? enrichWithPreferredDspMatch(base) : base;
  }

  if (platform === 'qobuz') {
    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch {
      parsed = null;
    }
    const segments = parsed ? (parsed.pathname || '').split('/').filter(Boolean) : [];
    const numeric = [...segments].reverse().find((s) => /^\d+$/.test(s)) || null;
    if (!numeric) throw new Error('Invalid Qobuz track URL');

    const api = new URL('https://www.qobuz.com/api.json/0.2/track/get');
    api.searchParams.set('track_id', numeric);
    api.searchParams.set('app_id', '735532640');
    api.searchParams.set('extra', 'album');

    let data = null;
    try {
      const resp = await fetch(api.toString(), { method: 'GET' });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`Qobuz track fetch failed: ${resp.status} ${text}`);
      }
      data = await resp.json();
    } catch (error) {
      logger.warn('URL_IMPORT_QOBUZ', 'Qobuz track fetch failed, falling back to URL hints', { error: error.message });
    }

    const performer = data?.performer || {};
    const album = data?.album || {};
    const artist = performer?.name || album?.artist?.name || '';
    const title = data?.version ? `${data.title} (${data.version})` : (data?.title || '');
    const durationSeconds = typeof data?.duration === 'number' ? data.duration : null;

    const base = withCustomSource(buildBasicTrack({
      title: title || '',
      artist: artist || '',
      album: album?.title || '',
      duration: durationSeconds ? msToDuration(durationSeconds * 1000) : '',
      isrc: data?.isrc || null,
      qobuz_url: targetUrl,
      custom_sources: [{ name: 'Qobuz', url: targetUrl }]
    }), { name: 'Qobuz', url: targetUrl });

    return match ? enrichWithPreferredDspMatch(base) : base;
  }

  if (platform === 'apple') {
    const songId = extractAppleSongIdFromUrl(targetUrl);
    if (!songId) throw new Error('Invalid Apple Music track URL');
    const storefront = extractAppleStorefrontFromUrl(targetUrl);
    let res;
    try {
      res = await appleMusicApiService.apiRequest({
        method: 'get',
        url: `/v1/catalog/${encodeURIComponent(storefront)}/songs/${encodeURIComponent(songId)}`,
        timeout: 8000
      });
    } catch (error) {
      const status = error?.response?.status || null;
      if (status === 400 || status === 404) {
        throw new Error('Invalid Apple Music track URL');
      }
      throw error;
    }
    const item = res?.data?.[0] || null;
    const attr = item?.attributes || {};
    const artworkUrl = attr.artwork?.url
      ? attr.artwork.url.replace('{w}', '600').replace('{h}', '600')
      : null;

    const base = buildBasicTrack({
      title: attr.name || '',
      artist: attr.artistName || '',
      album: attr.albumName || '',
      year: attr.releaseDate ? safeYear(String(attr.releaseDate).slice(0, 4)) : null,
      duration: attr.durationInMillis ? msToDuration(attr.durationInMillis) : '',
      apple_id: String(item.id || songId),
      apple_music_url: attr.url || null,
      isrc: attr.isrc || null,
      explicit: String(attr.contentRating || '').toLowerCase() === 'explicit',
      artwork_url: artworkUrl,
      album_artwork_url: artworkUrl
    });

    return match ? enrichWithPreferredDspMatch(base, { storefront }) : base;
  }

  if (platform === 'youtube') {
    const { videoId } = extractYouTubeIds(targetUrl);
    if (!videoId) throw new Error('Invalid YouTube URL');

    let resolvedTitle = '';
    let channelTitle = '';
    try {
      const data = await youtubeRequest('videos', { part: 'snippet,contentDetails', id: videoId });
      const item = (data?.items || [])[0] || null;
      resolvedTitle = item?.snippet?.title || '';
      channelTitle = item?.snippet?.channelTitle || '';
      const parsed = parseYouTubeTitle(resolvedTitle, channelTitle);
      const durationSeconds = parseIsoDurationSeconds(item?.contentDetails?.duration);
      const base = buildBasicTrack({
        title: parsed.title,
        artist: parsed.artist,
        duration: durationSeconds ? msToDuration(durationSeconds * 1000) : '',
        youtube_url: targetUrl,
        custom_sources: [{ name: 'YouTube', url: targetUrl }]
      });
      return match ? enrichWithPreferredDspMatch(base) : base;
    } catch (error) {
      const parsed = parseYouTubeTitle(resolvedTitle, channelTitle);
      const base = buildBasicTrack({
        title: parsed.title || normalizeWhitespace(videoId),
        artist: parsed.artist || '',
        youtube_url: targetUrl,
        custom_sources: [{ name: 'YouTube', url: targetUrl }]
      });
      return match ? enrichWithPreferredDspMatch(base) : base;
    }
  }

  throw new Error('Unsupported track URL');
}

export async function resolvePlaylistFromUrl(url, { match = true } = {}) {
  const { platform, kind, normalizedUrl } = detectUrlTarget(url);
  const targetUrl = normalizedUrl || url;

  if (!platform) throw new Error('Unsupported playlist URL');
  if (kind !== 'playlist' && kind !== 'auto') throw new Error('Unsupported playlist URL');

  if (platform === 'spotify') {
    const playlistId = extractSpotifyPlaylistId(targetUrl);
    if (!playlistId) throw new Error('Invalid Spotify playlist URL');
    const pl = await spotifyService.getPublicPlaylistDetails(playlistId);
    const tracks = spotifyService.transformTracksForFlowerpil(pl.tracks || []);
    return {
      platform: 'spotify',
      playlist: {
        title: pl?.name || 'Spotify Playlist',
        description: pl?.description || '',
        image: pl?.images?.[0]?.url || '',
        spotify_url: pl?.external_urls?.spotify || targetUrl
      },
      tracks: match ? await Promise.all(tracks.map((t) => enrichWithPreferredDspMatch(t))) : tracks
    };
  }

  if (platform === 'soundcloud') {
    const soundcloudService = await getSoundcloudService();
    const result = await soundcloudService.importFromUrl(targetUrl);
    const tracks = Array.isArray(result?.tracks) ? result.tracks : [];
    const playlist = result?.playlist || null;
    const normalizedPlaylist = playlist ? {
      title: playlist.title || 'SoundCloud',
      description: playlist.description || '',
      image: playlist.image || '',
      soundcloud_url: playlist.soundcloud_url || targetUrl
    } : {
      title: 'SoundCloud import',
      description: '',
      image: '',
      soundcloud_url: targetUrl
    };
    return {
      platform: 'soundcloud',
      playlist: normalizedPlaylist,
      tracks: match ? await Promise.all(tracks.map((t) => enrichWithPreferredDspMatch(withCustomSource(t, { name: 'SoundCloud', url: t.soundcloud_url || targetUrl })))) : tracks
    };
  }

  if (platform === 'tidal') {
    const playlistId = extractTidalPlaylistId(targetUrl);
    if (!playlistId) throw new Error('Invalid TIDAL playlist URL');

    const playlistResp = await tidalService.makeRequest(`/playlists/${encodeURIComponent(playlistId)}`, {
      countryCode: DEFAULT_TIDAL_COUNTRY_CODE,
      include: 'coverArt'
    });
    const playlistData = playlistResp?.data || null;
    const playlistAttr = playlistData?.attributes || {};

    const relResp = await tidalService.makeRequest(`/playlists/${encodeURIComponent(playlistId)}/relationships/items`, {
      countryCode: DEFAULT_TIDAL_COUNTRY_CODE,
      include: 'items'
    });
    const relItems = relResp?.data || [];
    const trackIds = relItems.filter((r) => r?.type === 'tracks').map((r) => r.id);

    let tracksData = { data: [], included: [] };
    if (trackIds.length) {
      tracksData = await tidalService.makeRequest('/tracks', {
        countryCode: DEFAULT_TIDAL_COUNTRY_CODE,
        'filter[id]': trackIds.join(','),
        include: 'artists,albums,coverArt',
        'fields[tracks]': 'title,duration,isrc,explicit',
        'fields[albums]': 'title,name,releaseDate',
        'fields[artists]': 'name'
      });
    }

    const included = Array.isArray(tracksData?.included) ? tracksData.included : [];
    const findIncluded = (type, id) => included.find((r) => r?.type === type && r?.id === id) || null;

    const tracks = (tracksData?.data || []).map((t, idx) => {
      const attr = t?.attributes || {};
      const artistIds = t?.relationships?.artists?.data || [];
      const artists = artistIds
        .map((a) => findIncluded('artists', a?.id)?.attributes?.name)
        .filter(Boolean)
        .join(', ');
      const albumId = t?.relationships?.albums?.data?.[0]?.id;
      const albumRes = albumId ? findIncluded('albums', albumId) : null;
      const albumTitle = albumRes?.attributes?.title || albumRes?.attributes?.name || '';
      const releaseDate = albumRes?.attributes?.releaseDate || null;
      const durationSeconds = parseIsoDurationSeconds(attr.duration);
      return buildBasicTrack({
        position: idx + 1,
        title: attr.title || '',
        artist: artists || '',
        album: albumTitle,
        year: releaseDate ? safeYear(String(releaseDate).slice(0, 4)) : null,
        duration: durationSeconds ? msToDuration(durationSeconds * 1000) : '',
        tidal_id: t?.id ? String(t.id) : null,
        tidal_url: t?.id ? `https://tidal.com/browse/track/${t.id}` : null,
        isrc: attr.isrc || null,
        explicit: Boolean(attr.explicit),
        custom_sources: [{ name: 'TIDAL', url: targetUrl }]
      });
    });

    return {
      platform: 'tidal',
      playlist: {
        title: playlistAttr.title || playlistAttr.name || 'TIDAL Playlist',
        description: playlistAttr.description || '',
        image: null,
        tidal_url: targetUrl
      },
      tracks: match ? await Promise.all(tracks.map((t) => enrichWithPreferredDspMatch(t))) : tracks
    };
  }

  if (platform === 'apple') {
    const playlistId = appleMusicApiService.extractPlaylistIdFromUrl(targetUrl);
    if (!playlistId) throw new Error('Invalid Apple Music playlist URL');
    if (appleMusicApiService.isLibraryPlaylistId(playlistId)) {
      throw new Error('Apple Music playlist is private and requires authentication');
    }
    if (!appleMusicApiService.isCatalogPlaylistId(playlistId)) {
      throw new Error('Invalid Apple Music playlist URL');
    }
    const storefront = extractAppleStorefrontFromUrl(targetUrl);

    let first;
    try {
      first = await appleMusicApiService.apiRequest({
        method: 'get',
        url: `/v1/catalog/${encodeURIComponent(storefront)}/playlists/${encodeURIComponent(playlistId)}`,
        params: { include: 'tracks' },
        timeout: 10000
      });
    } catch (error) {
      const status = error?.response?.status || null;
      if (status === 400 || status === 404) {
        throw new Error('Apple Music playlist is private or invalid');
      }
      throw error;
    }
    const pl = first?.data?.[0] || null;
    const attrs = pl?.attributes || {};

    const tracks = [];
    const pushSongs = (items) => {
      for (const item of items || []) {
        const attr = item?.attributes || {};
        const artworkUrl = attr.artwork?.url
          ? attr.artwork.url.replace('{w}', '600').replace('{h}', '600')
          : null;
        tracks.push(buildBasicTrack({
          position: tracks.length + 1,
          title: attr.name || '',
          artist: attr.artistName || '',
          album: attr.albumName || '',
          year: attr.releaseDate ? safeYear(String(attr.releaseDate).slice(0, 4)) : null,
          duration: attr.durationInMillis ? msToDuration(attr.durationInMillis) : '',
          apple_id: item?.id ? String(item.id) : null,
          apple_music_url: attr.url || null,
          isrc: attr.isrc || null,
          explicit: String(attr.contentRating || '').toLowerCase() === 'explicit',
          artwork_url: artworkUrl,
          album_artwork_url: artworkUrl
        }));
      }
    };

    pushSongs(pl?.relationships?.tracks?.data || []);

    let next = pl?.relationships?.tracks?.next || null;
    let pageGuard = 0;
    while (next && pageGuard < 25) {
      pageGuard += 1;
      const path = next.startsWith('http') ? new URL(next).pathname + new URL(next).search : next;
      const page = await appleMusicApiService.apiRequest({ method: 'get', url: path, timeout: 10000 });
      pushSongs(page?.data || []);
      next = page?.next || null;
    }

    return {
      platform: 'apple',
      playlist: {
        title: attrs.name || 'Apple Music Playlist',
        description: attrs.description?.standard || '',
        image: attrs.artwork?.url || '',
        apple_url: targetUrl
      },
      tracks: match ? await Promise.all(tracks.map((t) => enrichWithPreferredDspMatch(t, { storefront }))) : tracks
    };
  }

  if (platform === 'qobuz') {
    // Best-effort: Qobuz playlist URLs usually contain numeric ids.
    const parsed = new URL(targetUrl);
    const segments = (parsed.pathname || '').split('/').filter(Boolean);
    const numeric = [...segments].reverse().find((s) => /^\d+$/.test(s)) || null;
    if (!numeric) throw new Error('Invalid Qobuz playlist URL');

    const api = new URL('https://www.qobuz.com/api.json/0.2/playlist/get');
    api.searchParams.set('playlist_id', numeric);
    api.searchParams.set('app_id', '735532640');
    api.searchParams.set('extra', 'tracks');
    api.searchParams.set('limit', '500');

    const resp = await fetch(api.toString(), { method: 'GET' });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Qobuz playlist fetch failed: ${resp.status} ${text}`);
    }
    const data = await resp.json();
    const items = data?.tracks?.items || [];
    const tracks = items.map((item, idx) => {
      const performer = item?.performer || {};
      const album = item?.album || {};
      const artist = performer?.name || album?.artist?.name || '';
      const title = item?.version ? `${item.title} (${item.version})` : (item?.title || '');
      const durationSeconds = typeof item?.duration === 'number' ? item.duration : null;
      return withCustomSource(buildBasicTrack({
        position: idx + 1,
        title,
        artist,
        album: album?.title || '',
        duration: durationSeconds ? msToDuration(durationSeconds * 1000) : '',
        isrc: item?.isrc || null,
        custom_sources: [{ name: 'Qobuz', url: targetUrl }]
      }), { name: 'Qobuz', url: targetUrl });
    });

    const playlistTitle = normalizeWhitespace(data?.name || data?.title || 'Qobuz playlist');
    const playlistImage = data?.image?.large || data?.image?.medium || data?.image?.small || '';

    return {
      platform: 'qobuz',
      playlist: {
        title: playlistTitle,
        description: normalizeWhitespace(data?.description || ''),
        image: playlistImage,
        qobuz_url: targetUrl
      },
      tracks: match ? await Promise.all(tracks.map((t) => enrichWithPreferredDspMatch(t))) : tracks
    };
  }

  if (platform === 'youtube') {
    const { playlistId } = extractYouTubeIds(targetUrl);
    if (!playlistId) throw new Error('Invalid YouTube playlist URL');

    const playlistInfo = await youtubeRequest('playlists', { part: 'snippet,contentDetails', id: playlistId, maxResults: 1 });
    const pl = (playlistInfo?.items || [])[0] || null;
    const plSnippet = pl?.snippet || {};

    const videoItems = [];
    let pageToken = null;
    let guard = 0;
    while (guard < 10) {
      guard += 1;
      const page = await youtubeRequest('playlistItems', {
        part: 'snippet,contentDetails',
        playlistId,
        maxResults: 50,
        pageToken
      });
      const items = page?.items || [];
      for (const item of items) {
        const sn = item?.snippet || {};
        if (sn.title && sn.title.toLowerCase() === 'deleted video') continue;
        if (sn.title && sn.title.toLowerCase() === 'private video') continue;
        const vid = item?.contentDetails?.videoId || null;
        if (vid) {
          videoItems.push({
            videoId: vid,
            title: sn.title || '',
            channelTitle: sn.videoOwnerChannelTitle || sn.channelTitle || ''
          });
        }
      }
      pageToken = page?.nextPageToken || null;
      if (!pageToken) break;
    }

    // Batch fetch durations for better matching (best-effort).
    const durations = new Map();
    for (let i = 0; i < videoItems.length; i += 50) {
      const batch = videoItems.slice(i, i + 50);
      const ids = batch.map((b) => b.videoId).filter(Boolean).join(',');
      if (!ids) continue;
      try {
        const videos = await youtubeRequest('videos', { part: 'contentDetails', id: ids });
        for (const item of videos?.items || []) {
          const seconds = parseIsoDurationSeconds(item?.contentDetails?.duration);
          if (seconds !== null) durations.set(item.id, seconds);
        }
      } catch (error) {
        logger.warn('URL_IMPORT_YOUTUBE', 'Failed to fetch YouTube video durations', { error: error.message });
      }
    }

    const tracks = videoItems.map((item, idx) => {
      const parsed = parseYouTubeTitle(item.title, item.channelTitle);
      const seconds = durations.get(item.videoId) || null;
      return buildBasicTrack({
        position: idx + 1,
        title: parsed.title,
        artist: parsed.artist,
        duration: seconds ? msToDuration(seconds * 1000) : '',
        custom_sources: [{ name: 'YouTube', url: `https://www.youtube.com/watch?v=${item.videoId}` }]
      });
    });

    return {
      platform: 'youtube',
      playlist: {
        title: plSnippet.title || 'YouTube playlist',
        description: plSnippet.description || '',
        image: plSnippet.thumbnails?.high?.url || plSnippet.thumbnails?.default?.url || '',
        youtube_url: targetUrl
      },
      tracks: match ? await Promise.all(tracks.map((t) => enrichWithPreferredDspMatch(t))) : tracks
    };
  }

  throw new Error('Unsupported playlist URL');
}

export async function resolveUrlImport(inputUrl, { kind = 'auto', match = true } = {}) {
  const detection = detectUrlTarget(inputUrl);
  const resolvedKind = kind === 'auto' ? detection.kind : kind;

  if (resolvedKind === 'track') {
    const track = await resolveTrackFromUrl(inputUrl, { match });
    return { kind: 'track', platform: detection.platform, track };
  }

  if (resolvedKind === 'playlist' || resolvedKind === 'auto') {
    const playlist = await resolvePlaylistFromUrl(inputUrl, { match });
    return { kind: 'playlist', platform: playlist.platform, playlist: playlist.playlist, tracks: playlist.tracks };
  }

  throw new Error('Unsupported URL import kind');
}
