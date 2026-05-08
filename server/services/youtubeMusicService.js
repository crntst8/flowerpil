import CircuitBreaker from '../utils/CircuitBreaker.js';
import logger from '../utils/logger.js';
import youtubeService from './youtubeService.js';

/**
 * YouTube Music Service
 *
 * HTTP client for the Python ytmusicapi microservice.
 * Uses TV/Device code OAuth flow for authentication.
 * Provides playlist import, export, and track search capabilities.
 */

const parsePositiveNumber = (value, fallback) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeYouTubeMusicUrl = (url, videoId) => {
  if (url) {
    if (url.includes('music.youtube.com')) {
      return url;
    }
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes('youtube.com')) {
        parsed.hostname = 'music.youtube.com';
        return parsed.toString();
      }
    } catch {
      return url.replace('www.youtube.com', 'music.youtube.com').replace('youtube.com', 'music.youtube.com');
    }
  }
  return videoId ? `https://music.youtube.com/watch?v=${videoId}` : null;
};

class YouTubeMusicService {
  constructor() {
    this.baseUrl = process.env.YTMUSIC_API_BASE || 'http://127.0.0.1:3001';
    this.timeout = parsePositiveNumber(process.env.YTMUSIC_TIMEOUT_MS, 30000);
    this.rateLimitDelay = parsePositiveNumber(process.env.YTMUSIC_RATE_LIMIT_DELAY, 100);
    this.metadataMatchThreshold = parsePositiveNumber(process.env.YTMUSIC_METADATA_MATCH_THRESHOLD, 70);

    const createBreaker = (name) => CircuitBreaker.getOrCreate(name, {
      threshold: Number.parseInt(process.env.YTMUSIC_CB_THRESHOLD || '10', 10),
      timeout: Number.parseInt(process.env.YTMUSIC_CB_TIMEOUT_MS || '300000', 10),
      halfOpenMaxCalls: Number.parseInt(process.env.YTMUSIC_CB_HALF_OPEN_MAX_CALLS || '3', 10),
      onStateChange: (state, meta) => {
        const payload = { ...meta, state };
        if (state === 'open') {
          logger.error('CIRCUIT_YTMUSIC', `${name} opened`, payload);
        } else if (state === 'half_open') {
          logger.warn('CIRCUIT_YTMUSIC', `${name} half-open`, payload);
        } else {
          logger.info('CIRCUIT_YTMUSIC', `${name} closed`, payload);
        }
      }
    });

    // Keep search isolated so auth/export failures don't block linking runs.
    this.generalCircuitBreaker = createBreaker('ytmusic-api');
    this.searchCircuitBreaker = createBreaker('ytmusic-search');
  }

  buildOAuthHeader(oauthJson) {
    if (!oauthJson) return null;
    if (typeof oauthJson === 'string') {
      return oauthJson;
    }
    return JSON.stringify(oauthJson);
  }

  /**
   * Make HTTP request to Python microservice
   */
  async makeRequest(endpoint, options = {}) {
    const breaker = endpoint.startsWith('/search')
      ? this.searchCircuitBreaker
      : this.generalCircuitBreaker;

    return breaker.execute(async () => {
      const url = `${this.baseUrl}${endpoint}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await fetch(url, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            ...options.headers
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          const error = new Error(`YouTube Music API error: ${response.status} - ${data.error || response.statusText}`);
          error.status = response.status;
          error.details = data;
          throw error;
        }

        return data;
      } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          const timeoutError = new Error('YouTube Music API request timed out');
          timeoutError.code = 'TIMEOUT';
          throw timeoutError;
        }
        throw error;
      }
    }, { endpoint, method: options.method || 'GET' });
  }

  /**
   * Check if the Python microservice is running
   */
  async healthCheck() {
    try {
      const result = await this.makeRequest('/health');
      return result.status === 'healthy';
    } catch (error) {
      console.error('❌ YouTube Music service health check failed:', error.message);
      return false;
    }
  }

  // ============================================
  // DEVICE CODE OAUTH FLOW
  // ============================================

  /**
   * Start device code OAuth flow
   * Returns user_code and verification_url for user to complete auth
   */
  async startDeviceAuth() {
    console.log('🎵 Starting YouTube Music device auth flow...');

    const result = await this.makeRequest('/auth/device-code', {
      method: 'POST',
      body: JSON.stringify({})
    });

    console.log('✅ Device code obtained. User should visit:', result.verification_url);

    return {
      deviceCode: result.device_code,
      userCode: result.user_code,
      verificationUrl: result.verification_url,
      expiresIn: result.expires_in,
      interval: result.interval || 5
    };
  }

  /**
   * Poll for OAuth token after user enters device code
   */
  async pollDeviceAuth(deviceCode) {
    console.log('🎵 Polling for YouTube Music auth token...');

    const result = await this.makeRequest('/auth/poll', {
      method: 'POST',
      body: JSON.stringify({ device_code: deviceCode })
    });

    if (result.status === 'pending') {
      return { status: 'pending' };
    }

    if (result.status === 'success') {
      console.log('✅ YouTube Music auth successful');
      return {
        status: 'success',
        oauthData: result.oauth_data // JSON blob to store in export_oauth_tokens.access_token
      };
    }

    if (result.status === 'expired') {
      const error = new Error('Device code expired');
      error.code = 'DEVICE_CODE_EXPIRED';
      throw error;
    }

    const error = new Error(result.error || 'Auth polling failed');
    error.code = 'AUTH_POLL_FAILED';
    throw error;
  }

  /**
   * Refresh expired OAuth token
   */
  async refreshToken(oauthJson) {
    console.log('🎵 Refreshing YouTube Music token...');

    const result = await this.makeRequest('/auth/refresh', {
      method: 'POST',
      headers: {
        'X-OAuth-Token': this.buildOAuthHeader(oauthJson)
      },
      body: JSON.stringify({})
    });

    console.log('✅ YouTube Music token refreshed');
    return result.oauth_data;
  }

  /**
   * Validate that an OAuth token is still valid
   */
  async validateToken(oauthJson) {
    try {
      const result = await this.makeRequest('/auth/validate', {
        method: 'POST',
        headers: {
          'X-OAuth-Token': this.buildOAuthHeader(oauthJson)
        },
        body: JSON.stringify({})
      });
      return result.valid === true;
    } catch (error) {
      console.error('❌ YouTube Music token validation failed:', error.message);
      return false;
    }
  }

  // ============================================
  // PLAYLIST OPERATIONS
  // ============================================

  /**
   * Get user's library playlists (requires auth)
   */
  async getUserPlaylists(oauthJson) {
    console.log('🎵 Fetching YouTube Music user playlists...');

    const result = await this.makeRequest('/playlists', {
      method: 'GET',
      headers: {
        'X-OAuth-Token': this.buildOAuthHeader(oauthJson)
      }
    });

    console.log(`✅ Fetched ${result.playlists?.length || 0} YouTube Music playlists`);
    return result.playlists || [];
  }

  /**
   * Get tracks from a specific playlist
   * Auth is optional (only needed for private playlists)
   */
  async getPlaylistTracks(playlistId, oauthJson = null) {
    console.log(`🎵 Fetching tracks for YouTube Music playlist: ${playlistId}`);

    const headers = {};
    if (oauthJson) {
      headers['X-OAuth-Token'] = this.buildOAuthHeader(oauthJson);
    }

    const result = await this.makeRequest(`/playlist/${playlistId}`, {
      method: 'GET',
      headers
    });

    const playlist = result.playlist || {};
    console.log(`✅ Fetched ${result.tracks?.length || 0} tracks from playlist`);
    return {
      playlistId: playlist.id || playlistId,
      title: playlist.title || 'YouTube Music Playlist',
      description: playlist.description || '',
      tracks: result.tracks || [],
      trackCount: playlist.trackCount || (result.tracks || []).length
    };
  }

  /**
   * Import playlist from public YouTube Music URL (no auth required)
   */
  async importPlaylistByUrl(url) {
    console.log(`🎵 Importing YouTube Music playlist from URL: ${url}`);

    const result = await this.makeRequest('/playlist/import-url', {
      method: 'POST',
      body: JSON.stringify({ url })
    });

    const playlist = result.playlist || {};
    console.log(`✅ Imported playlist "${playlist.title || 'YouTube Music Playlist'}" with ${result.tracks?.length || 0} tracks`);
    return {
      title: playlist.title || 'YouTube Music Playlist',
      description: playlist.description || '',
      tracks: result.tracks || [],
      sourceUrl: url,
      playlistId: playlist.id || null
    };
  }

  /**
   * Create a new playlist on YouTube Music
   */
  async createPlaylist(oauthJson, playlistData, tracks = []) {
    console.log(`🎵 Creating YouTube Music playlist: "${playlistData.title}"`);

    const normalizedTracks = tracks
      .map((t) => {
        if (!t || typeof t !== 'object') return null;
        if (t.youtube_music_id) return t;
        const match = t.youtube_music_url?.match(/[?&]v=([^&]+)/);
        if (!match) return t;
        return { ...t, youtube_music_id: match[1] };
      })
      .filter(Boolean);

    const result = await this.makeRequest('/playlist/create', {
      method: 'POST',
      headers: {
        'X-OAuth-Token': this.buildOAuthHeader(oauthJson)
      },
      body: JSON.stringify({
        playlist: {
          title: playlistData.title,
          description: playlistData.description || '',
          isPublic: playlistData.isPublic !== false
        },
        tracks: normalizedTracks
      })
    });

    console.log(`✅ Created YouTube Music playlist: ${result.playlistId}`);
    return {
      playlistId: result.playlistId,
      playlistUrl: result.playlistUrl || (result.playlistId ? `https://music.youtube.com/playlist?list=${result.playlistId}` : null),
      tracksAdded: result.tracksAdded || 0,
      totalTracks: result.totalTracks || normalizedTracks.length,
      failedTracks: result.failedTracks || []
    };
  }

  /**
   * Add tracks to an existing playlist
   */
  async addTracksToPlaylist(oauthJson, playlistId, videoIds) {
    console.log(`🎵 Adding ${videoIds.length} tracks to YouTube Music playlist: ${playlistId}`);

    const result = await this.makeRequest(`/playlist/${playlistId}/tracks`, {
      method: 'POST',
      headers: {
        'X-OAuth-Token': this.buildOAuthHeader(oauthJson)
      },
      body: JSON.stringify({
        tracks: (videoIds || []).map((videoId) => ({ youtube_music_id: videoId }))
      })
    });

    console.log(`✅ Added tracks to playlist`);
    return result.tracksAdded || videoIds.length;
  }

  // ============================================
  // TRACK SEARCH
  // ============================================

  /**
   * Search for a track by ISRC/metadata
   * Used for cross-platform linking
   */
  async searchTrack(track, oauthJson = null) {
    await this.delay(this.rateLimitDelay);

    const queryData = {
      artist: track.artist,
      title: track.title,
      album: track.album || null,
      isrc: track.isrc || null,
      duration_ms: track.duration_ms || track.duration || null
    };

    const headers = {};
    if (oauthJson) {
      headers['X-OAuth-Token'] = this.buildOAuthHeader(oauthJson);
    }

    try {
      const result = await this.makeRequest('/search/track', {
        method: 'POST',
        headers,
        body: JSON.stringify(queryData)
      });

      if (result.videoId) {
        return {
          videoId: result.videoId,
          id: result.videoId,
          url: `https://music.youtube.com/watch?v=${result.videoId}`,
          title: result.title,
          artist: result.artist,
          album: result.album,
          confidence: result.confidence || 80,
          source: result.source || 'search',
          duration: result.duration_ms
        };
      }

      return null;
    } catch (error) {
      console.error(`❌ YouTube Music track search failed:`, error.message);
      return null;
    }
  }

  /**
   * Batch search for multiple tracks
   */
  async searchTracksBatch(tracks, oauthJson = null) {
    console.log(`🎵 Batch searching ${tracks.length} tracks on YouTube Music...`);

    const tracksData = tracks.map(t => ({
      artist: t.artist,
      title: t.title,
      album: t.album || null,
      isrc: t.isrc || null,
      duration_ms: t.duration_ms || t.duration || null
    }));

    const headers = {};
    if (oauthJson) {
      headers['X-OAuth-Token'] = this.buildOAuthHeader(oauthJson);
    }

    try {
      const result = await this.makeRequest('/search/batch', {
        method: 'POST',
        headers,
        body: JSON.stringify({ tracks: tracksData })
      });

      const results = (result.results || []).map(r => {
        if (r.videoId) {
          return {
            videoId: r.videoId,
            id: r.videoId,
            url: `https://music.youtube.com/watch?v=${r.videoId}`,
            title: r.title,
            artist: r.artist,
            album: r.album,
            confidence: r.confidence || 80,
            source: r.source || 'search',
            duration: r.duration_ms
          };
        }
        return null;
      });

      console.log(`✅ Found ${results.filter(Boolean).length}/${tracks.length} tracks on YouTube Music`);
      return results;
    } catch (error) {
      console.error(`❌ YouTube Music batch search failed:`, error.message);
      return tracks.map(() => null);
    }
  }

  /**
   * Search by track object (unified interface for linking worker)
   */
  async searchByTrack(track) {
    const primary = await this.searchTrack(track);
    if (primary) return primary;

    if (!process.env.YOUTUBE_API_KEY) {
      return null;
    }

    try {
      const fallbackTrack = {
        artist: track?.artist,
        title: track?.title,
        album: track?.album || null,
        isrc: track?.isrc || null,
        duration_ms: track?.duration_ms || track?.duration || null
      };

      const fallback = await youtubeService.searchByTrack(fallbackTrack);
      if (!fallback || (!fallback.url && !fallback.videoId && !fallback.id)) {
        return null;
      }

      const videoId = fallback.videoId || fallback.id;
      const url = normalizeYouTubeMusicUrl(fallback.url, videoId);

      return {
        videoId,
        id: videoId,
        url,
        title: fallback.title || track?.title || '',
        artist: fallback.artist || track?.artist || '',
        album: fallback.album || track?.album || null,
        confidence: fallback.confidence || 60,
        source: fallback.source ? `youtube_api:${fallback.source}` : 'youtube_api',
        duration: fallback.duration_ms || fallback.duration || null
      };
    } catch (error) {
      console.error('❌ YouTube fallback search failed:', error.message);
      return null;
    }
  }

  // ============================================
  // EXPORT
  // ============================================

  /**
   * Export complete playlist to YouTube Music
   */
  async exportPlaylist(oauthJson, playlistData, tracks) {
    try {
      // Create playlist with tracks
      const result = await this.createPlaylist(oauthJson, playlistData, tracks);

      const validTracks = tracks.filter(t => t.youtube_music_id || t.youtube_music_url);

      return {
        platform: 'youtube_music',
        playlistUrl: result.playlistUrl,
        playlistId: result.playlistId,
        playlistName: playlistData.title,
        tracksAdded: result.tracksAdded,
        totalTracks: tracks.length,
        coverage: tracks.length > 0 ? validTracks.length / tracks.length : 0,
        success: true,
        missingTracks: tracks.length - validTracks.length
      };
    } catch (error) {
      console.error('❌ YouTube Music export failed:', error.message);
      return {
        platform: 'youtube_music',
        success: false,
        error: error.message,
        tracksAdded: 0,
        totalTracks: tracks.length
      };
    }
  }

  // ============================================
  // URL UTILITIES
  // ============================================

  /**
   * Parse YouTube Music URL to extract playlist/video ID
   */
  parseUrl(url) {
    if (!url || typeof url !== 'string') return null;

    try {
      const parsed = new URL(url.trim());
      const hostname = parsed.hostname.toLowerCase();

      // Check if it's a YouTube Music or YouTube URL
      const isYouTubeMusic = hostname.includes('music.youtube.com');
      const isYouTube = hostname.includes('youtube.com') || hostname.includes('youtu.be');

      if (!isYouTubeMusic && !isYouTube) return null;

      // Playlist URL
      const playlistId = parsed.searchParams.get('list');
      if (playlistId) {
        return { type: 'playlist', id: playlistId };
      }

      // Video/track URL
      const videoId = parsed.searchParams.get('v');
      if (videoId) {
        return { type: 'track', id: videoId };
      }

      // Browse URL (VL prefix for playlists)
      const pathMatch = parsed.pathname.match(/\/browse\/VL([^/]+)/);
      if (pathMatch) {
        return { type: 'playlist', id: pathMatch[1] };
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Validate YouTube Music URL
   */
  isValidUrl(url) {
    return this.parseUrl(url) !== null;
  }

  /**
   * Check if URL is a YouTube Music playlist URL
   */
  isPlaylistUrl(url) {
    const parsed = this.parseUrl(url);
    return parsed?.type === 'playlist';
  }

  /**
   * Rate limiting delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Test connection to Python microservice
   */
  async testConnection() {
    try {
      console.log('🧪 Testing YouTube Music service connection...');
      const healthy = await this.healthCheck();
      if (healthy) {
        console.log('✅ YouTube Music service connection successful');
        return true;
      }
      console.log('❌ YouTube Music service not healthy');
      return false;
    } catch (error) {
      console.error('❌ YouTube Music service connection failed:', error.message);
      return false;
    }
  }
}

// Export singleton instance
const youtubeMusicService = new YouTubeMusicService();

export const searchYouTubeMusicByTrack = (track) => youtubeMusicService.searchByTrack(track);
export const testYouTubeMusicConnection = () => youtubeMusicService.testConnection();

export default youtubeMusicService;
