import { Buffer } from 'buffer';

const TOKEN_BUFFER_MS = 60 * 1000; // Refresh 1 minute before expiry

const buildBasicAuthHeader = (clientId, clientSecret) => {
  const raw = `${clientId}:${clientSecret}`;
  const encoded = Buffer.from(raw).toString('base64');
  return `Basic ${encoded}`;
};

const msToDuration = (ms) => {
  if (!ms || Number.isNaN(ms)) return '';
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

export class SoundcloudService {
  constructor({ clientId, clientSecret, callbackUrl } = {}) {
    this.clientId = clientId || process.env.SOUNDCLOUD_CLIENT_ID;
    this.clientSecret = clientSecret || process.env.SOUNDCLOUD_CLIENT_SECRET;
    this.callbackUrl = callbackUrl || process.env.SOUNDCLOUD_CALLBACK_URL;
    this.cachedToken = null;

    if (!this.clientId || !this.clientSecret) {
      throw new Error('SoundCloud client credentials are required');
    }
  }

  async getClientCredentialsToken(force = false) {
    if (!force && this.cachedToken && this.cachedToken.expiresAt > Date.now() + TOKEN_BUFFER_MS) {
      if (!this.cachedToken.accessToken) {
        // Cached token exists but is invalid, force refresh
        return this.getClientCredentialsToken(true);
      }
      return this.cachedToken.accessToken;
    }

    if (!this.clientId || !this.clientSecret) {
      throw new Error('SoundCloud client credentials are not configured. Check SOUNDCLOUD_CLIENT_ID and SOUNDCLOUD_CLIENT_SECRET environment variables.');
    }

    const body = new URLSearchParams({ grant_type: 'client_credentials' });

    const resp = await fetch('https://secure.soundcloud.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json; charset=utf-8',
        Authorization: buildBasicAuthHeader(this.clientId, this.clientSecret)
      },
      body
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`SoundCloud token request failed: ${resp.status} ${text}`);
    }

    const json = await resp.json();
    
    if (!json.access_token) {
      throw new Error('SoundCloud token response missing access_token');
    }

    const expiresInMs = (json.expires_in || 3600) * 1000;
    this.cachedToken = {
      accessToken: json.access_token,
      refreshToken: json.refresh_token || null,
      expiresAt: Date.now() + expiresInMs
    };

    return this.cachedToken.accessToken;
  }

  async fetchWithAuth(url, options = {}) {
    // Ensure we have a valid token
    const token = await this.getClientCredentialsToken();
    if (!token || typeof token !== 'string') {
      throw new Error('SoundCloud access token is missing or invalid');
    }

    let currentUrl = url;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      // Note: When using OAuth tokens, client_id is not needed in query string
      // The Authorization header is sufficient for authenticated requests

      // Rebuild headers for each request to ensure Authorization is always present
      // especially important when following redirects
      const baseHeaders = {
        Accept: 'application/json; charset=utf-8',
        Authorization: `OAuth ${token}`, // SoundCloud expects "OAuth" scheme
        'User-Agent': 'Flowerpil/1.0',
        ...(options.headers || {})
      };

      const resp = await fetch(currentUrl, {
        ...options,
        headers: baseHeaders,
        redirect: 'manual' // preserve Authorization across redirects by following manually
      });

      // Manually follow redirects so we keep the Authorization header
      if (resp.status >= 300 && resp.status < 400) {
        const location = resp.headers.get('location');
        if (location) {
          currentUrl = new URL(location, currentUrl).toString();
          continue;
        }
      }

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`SoundCloud API error ${resp.status}: ${text}`);
      }

      return resp.json();
    }

    throw new Error('SoundCloud API redirect loop');
  }

  async resolveUrl(permalink) {
    if (!permalink) throw new Error('URL is required');

    const url = new URL('https://api.soundcloud.com/resolve');
    url.searchParams.set('url', permalink);
    // Note: When using OAuth tokens, client_id is not needed in query string
    // The Authorization header is sufficient

    return this.fetchWithAuth(url.toString());
  }

  async fetchTranscodingUrl(transcoding) {
    if (!transcoding?.url) return null;
    try {
      const url = new URL(transcoding.url);
      // Note: When using OAuth tokens, client_id is not needed in query string
      // The Authorization header is sufficient for authenticated requests
      const json = await this.fetchWithAuth(url.toString());
      return json?.url || null;
    } catch (err) {
      return null;
    }
  }

  // Fetch audio stream with authentication (returns Response object, not JSON)
  async fetchStreamWithAuth(url, options = {}) {
    // Ensure we have a valid token
    const token = await this.getClientCredentialsToken();
    if (!token || typeof token !== 'string') {
      throw new Error('SoundCloud access token is missing or invalid');
    }

    let currentUrl = url;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      // Rebuild headers for each request to ensure Authorization is always present
      // Use more specific Accept header to avoid 406 errors
      const baseHeaders = {
        Accept: 'audio/mpeg, audio/*, */*',
        Authorization: `OAuth ${token}`, // SoundCloud expects "OAuth" scheme
        'User-Agent': 'Flowerpil/1.0',
        ...(options.headers || {})
      };

      const resp = await fetch(currentUrl, {
        ...options,
        headers: baseHeaders,
        redirect: 'manual' // preserve Authorization across redirects by following manually
      });

      // Manually follow redirects so we keep the Authorization header
      if (resp.status >= 300 && resp.status < 400) {
        const location = resp.headers.get('location');
        if (location) {
          currentUrl = new URL(location, currentUrl).toString();
          continue;
        }
      }

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`SoundCloud stream error ${resp.status}: ${text}`);
      }

      return resp;
    }

    throw new Error('SoundCloud stream redirect loop');
  }

  async getStreamUrlForTrack(track) {
    const trackId = track?.id;
    if (!trackId) return null;

    // Prefer media transcodings if present on the resolved track
    const transcodings = track?.media?.transcodings;
    if (Array.isArray(transcodings) && transcodings.length > 0) {
      // Prefer progressive MP3
      const progressive = transcodings.find(t => t?.format?.protocol === 'progressive') || transcodings[0];
      const url = await this.fetchTranscodingUrl(progressive);
      if (url) return url;
    }

    // Fallback: use /streams endpoint
    try {
      const streams = await this.fetchWithAuth(`https://api.soundcloud.com/tracks/${trackId}/streams`);
      const candidates = [streams?.http_mp3_128_url, streams?.hls_mp3_128_url, streams?.preview_mp3_128_url];
      return candidates.find(Boolean) || null;
    } catch (_) {
      return null;
    }
  }

  transformTrack(scTrack, { includePreview = true } = {}) {
    if (!scTrack) return null;

    const title = scTrack.title || 'Untitled';
    const artist = scTrack.user?.username || scTrack.user?.full_name || scTrack.user?.permalink || '';
    const durationMs = typeof scTrack.duration === 'number' ? scTrack.duration : null;
    const year = scTrack.release_year || (scTrack.release_date ? new Date(scTrack.release_date).getFullYear() : null);

    const artwork = scTrack.artwork_url || scTrack.user?.avatar_url || '';

    const base = {
      id: scTrack.id || `sc_${Date.now()}`,
      title,
      artist,
      album: scTrack.publisher_metadata?.album_title || '',
      year: year || null,
      duration: durationMs ? msToDuration(durationMs) : '',
      soundcloud_url: scTrack.permalink_url || scTrack.permalink || '',
      artwork_url: artwork,
      album_artwork_url: artwork,
      preview_url: null,
      spotify_id: null,
      apple_id: null,
      tidal_id: null,
      bandcamp_url: null,
      explicit: Boolean(scTrack?.explicit === true || scTrack?.publisher_metadata?.explicit === true),
      custom_sources: []
    };

    base.preview_url = includePreview && scTrack ? scTrack.preview_url || null : null;

    return base;
  }

  async buildTrack(scTrack) {
    const track = this.transformTrack(scTrack, { includePreview: false });
    if (!track) return null;

    try {
      const stream = await this.getStreamUrlForTrack(scTrack);
      if (stream) {
        track.preview_url = stream;
      }
    } catch (_) {
      // best-effort
    }

    return track;
  }

  async importFromUrl(permalink) {
    const resolved = await this.resolveUrl(permalink);

    if (!resolved) {
      throw new Error('SoundCloud resource not found');
    }

    if (resolved.kind === 'track') {
      const track = await this.buildTrack(resolved);
      return {
        type: 'track',
        playlist: null,
        tracks: track ? [{ ...track, position: 1 }] : []
      };
    }

    if (resolved.kind === 'playlist' || resolved.kind === 'system-playlist') {
      const tracks = Array.isArray(resolved.tracks) ? resolved.tracks : [];
      const built = [];
      for (let i = 0; i < tracks.length; i += 1) {
        const scTrack = tracks[i];
        const builtTrack = await this.buildTrack(scTrack);
        if (builtTrack) {
          built.push({ ...builtTrack, position: i + 1 });
        }
      }

      return {
        type: 'playlist',
        playlist: {
          title: resolved.title || resolved.permalink || 'SoundCloud Playlist',
          description: resolved.description || '',
          image: resolved.artwork_url || resolved.user?.avatar_url || '',
          soundcloud_url: resolved.permalink_url || resolved.permalink || permalink
        },
        tracks: built
      };
    }

    throw new Error('Unsupported SoundCloud resource');
  }
}

// Create singleton - will throw if credentials are missing
// This ensures the service is properly configured at startup
const singleton = new SoundcloudService({});
export default singleton;
