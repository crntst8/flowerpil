import axios from 'axios';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import CircuitBreaker from '../utils/CircuitBreaker.js';
import logger from '../utils/logger.js';
import { incrementApiCall, incrementError, setCacheHitRate } from '../utils/metrics.js';
import { getCacheValue, setCacheValue } from '../utils/redisCache.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..', '..');
const UPLOADS_ROOT = path.join(PROJECT_ROOT, 'storage', 'uploads');
const MAX_SPOTIFY_IMAGE_BYTES = 256000; // Spotify cover max size (256 KB)
const fsPromises = fs.promises;

const spotifyCircuitBreaker = CircuitBreaker.getOrCreate('spotify-api', {
  threshold: Number.parseInt(process.env.SPOTIFY_CB_THRESHOLD || '10', 10),
  timeout: Number.parseInt(process.env.SPOTIFY_CB_TIMEOUT_MS || '300000', 10),
  halfOpenMaxCalls: Number.parseInt(process.env.SPOTIFY_CB_HALF_OPEN_MAX_CALLS || '3', 10),
  onStateChange: (state, meta) => {
    const payload = {
      ...meta,
      state
    };
    if (state === 'open') {
      logger.error('CIRCUIT_SPOTIFY', 'Spotify circuit opened', payload);
    } else if (state === 'half_open') {
      logger.warn('CIRCUIT_SPOTIFY', 'Spotify circuit half-open', payload);
    } else {
      logger.info('CIRCUIT_SPOTIFY', 'Spotify circuit closed', payload);
    }
  }
});

class SpotifyService {
  constructor() {
    this.clientId = process.env.SPOTIFY_CLIENT_ID;
    this.clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

    // Determine base URL for redirects (prefer env vars, fall back to FRONTEND_URL in dev)
    const getRedirectBase = () => {
      if (process.env.NODE_ENV === 'development' && process.env.FRONTEND_URL) {
        return process.env.FRONTEND_URL;
      }
      return 'https://flowerpil.io';
    };

    const redirectBase = getRedirectBase();
    this.redirectUri = process.env.SPOTIFY_REDIRECT_URI || `${redirectBase}/auth/spotify/callback`;
    this.exportRedirectUri = process.env.SPOTIFY_EXPORT_REDIRECT_URI || `${redirectBase}/auth/spotify/export/callback`;
    this.baseURL = 'https://api.spotify.com/v1';
    this.authURL = 'https://accounts.spotify.com';

    // Rate limiting: 8 requests per second with exponential backoff
    this.requestQueue = [];
    this.isProcessingQueue = false;
    this.lastRequestTime = 0;
    this.requestInterval = 125; // 8 requests per second = 125ms between requests

    // App-only client credentials token cache (for search/read)
    this.appAccessToken = null;
    this.appTokenExpiry = 0;

    // Search result cache (in-memory)
    this.searchCache = new Map();
    this.redisSearchCacheNamespace = 'spotify:search';
    this.searchCacheTTL = 300000; // 5 minutes
    this.searchCacheMaxSize = 10000;
    this.searchCacheHits = 0;
    this.searchCacheMisses = 0;
  }

  // Generate OAuth authorization URL
  getAuthURL(state = null, includeExportScopes = false) {
    const scopes = [
      'playlist-read-private',
      'playlist-read-collaborative'
    ];

    // Add export scopes if requested
    if (includeExportScopes) {
      scopes.push('playlist-modify-public', 'playlist-modify-private');
    }

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      scope: scopes.join(' '),
      redirect_uri: includeExportScopes ? this.exportRedirectUri : this.redirectUri,
      state: state || Math.random().toString(36).substring(7)
    });

    return `${this.authURL}/authorize?${params.toString()}`;
  }

  // Rate-limited Spotify API request with exponential backoff
  async makeRateLimitedRequest(config, retryCount = 0) {
    const maxRetries = 3;
    const backoffBase = 1000; // 1 second base delay

    if (!spotifyCircuitBreaker.canExecute()) {
      return Promise.reject(spotifyCircuitBreaker.buildOpenError({
        method: config.method || 'GET',
        url: config.url
      }));
    }

    return new Promise((resolve, reject) => {
      this.requestQueue.push(async () => {
        try {
          // Ensure minimum time between requests
          const now = Date.now();
          const timeSinceLastRequest = now - this.lastRequestTime;
          if (timeSinceLastRequest < this.requestInterval) {
            await new Promise(resolve => setTimeout(resolve, this.requestInterval - timeSinceLastRequest));
          }
          
          this.lastRequestTime = Date.now();
          const response = await spotifyCircuitBreaker.execute(
            () => axios(config),
            { method: config.method || 'GET', url: config.url }
          );

          // Track successful API call
          const endpoint = config.url?.split('?')[0] || 'unknown';
          incrementApiCall('spotify', endpoint);

          resolve(response);
        } catch (error) {
          if (error.code === 'CIRCUIT_OPEN' || error.code === 'CIRCUIT_HALF_OPEN') {
            logger.warn('CIRCUIT_SPOTIFY', 'Request short-circuited', {
              method: config.method || 'GET',
              url: config.url,
              reason: error.meta?.reason,
              nextAttemptAt: error.meta?.nextAttemptAt
            });
            reject(error);
            return;
          }
          // Handle rate limiting (429) with exponential backoff
          if (error.response?.status === 429 && retryCount < maxRetries) {
            const retryAfter = error.response.headers['retry-after']
              ? parseInt(error.response.headers['retry-after']) * 1000
              : backoffBase * Math.pow(2, retryCount);

            // Rate limited, retrying with exponential backoff
            incrementError('spotify_rate_limit', 'warning');

            setTimeout(async () => {
              try {
                const result = await this.makeRateLimitedRequest(config, retryCount + 1);
                resolve(result);
              } catch (retryError) {
                reject(retryError);
              }
            }, retryAfter);
          } else {
            // Track error
            const errorType = error.response?.status
              ? `spotify_${error.response.status}`
              : 'spotify_unknown_error';
            incrementError(errorType, 'error');
            reject(error);
          }
        }
      });
      
      this.processQueue();
    });
  }

  // Process the request queue sequentially
  async processQueue() {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }
    
    this.isProcessingQueue = true;
    
    while (this.requestQueue.length > 0) {
      const request = this.requestQueue.shift();
      await request();
    }
    
    this.isProcessingQueue = false;
  }

  // Exchange authorization code for access token
  async getAccessToken(code, useExportRedirect = false) {
    try {
      const redirectUri = useExportRedirect ? this.exportRedirectUri : this.redirectUri;
      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri
      });

      // Create Basic Auth header with client credentials
      const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

      logger.info('SPOTIFY_AUTH', 'Token exchange', {
        redirect_uri: redirectUri,
        useExportRedirect,
        exportRedirectUri: this.exportRedirectUri,
        regularRedirectUri: this.redirectUri
      });

      const response = await axios.post(`${this.authURL}/api/token`, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`
        }
      });

      logger.success('SPOTIFY_AUTH', 'Token exchange successful');
      return response.data;
    } catch (error) {
      logger.error('SPOTIFY_AUTH', 'Token exchange failed', error, {
        redirectUri,
        errorData: error.response?.data,
        status: error.response?.status
      });
      throw new Error(`Failed to get access token: ${error.response?.data?.error_description || error.message}`);
    }
  }

  // Get app access token using client credentials flow (no user auth)
  async getClientCredentialsToken() {
    // Cache and reuse token until near expiry
    if (this.appAccessToken && Date.now() < (this.appTokenExpiry - 60_000)) {
      return this.appAccessToken;
    }

    try {
      const params = new URLSearchParams({
        grant_type: 'client_credentials'
      });
      const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

      const response = await axios.post(`${this.authURL}/api/token`, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`
        }
      });

      const data = response.data || {};
      this.appAccessToken = data.access_token;
      this.appTokenExpiry = Date.now() + (data.expires_in ? data.expires_in * 1000 : 3_000_000);
      return this.appAccessToken;
    } catch (error) {
      throw new Error(`Failed to get Spotify client credentials token: ${error.response?.data?.error_description || error.message}`);
    }
  }

  // Refresh user access token using refresh token
  async refreshAccessToken(refreshToken) {
    if (!refreshToken) {
      throw new Error('Refresh token is required');
    }

    try {
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      });

      const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

      logger.info('SPOTIFY_AUTH', 'Refreshing access token');

      const response = await axios.post(`${this.authURL}/api/token`, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`
        }
      });

      logger.success('SPOTIFY_AUTH', 'Token refresh successful');

      const data = response.data;

      // Spotify may or may not return a new refresh token
      // If not returned, the old one is still valid
      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token || refreshToken,
        expires_in: data.expires_in, // Seconds until expiration
        scope: data.scope
      };
    } catch (error) {
      logger.error('SPOTIFY_AUTH', 'Token refresh failed', error, {
        errorData: error.response?.data,
        status: error.response?.status
      });

      // Check if refresh token is invalid/revoked
      if (error.response?.status === 400 && error.response?.data?.error === 'invalid_grant') {
        throw new Error('REFRESH_TOKEN_INVALID: Refresh token has been revoked or is invalid');
      }

      throw new Error(`Failed to refresh Spotify access token: ${error.response?.data?.error_description || error.message}`);
    }
  }

  // Get user's playlists
  async getUserPlaylists(accessToken, limit = 50, offset = 0) {
    try {
      const response = await this.makeRateLimitedRequest({
        method: 'get',
        url: `${this.baseURL}/me/playlists`,
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        params: {
          limit,
          offset
        }
      });

      return response.data;
    } catch (error) {
      const status = error.response?.status;
      if (status === 401) {
        logger.error('SPOTIFY_API', 'Token expired or invalid when fetching playlists');
      } else {
        logger.error('SPOTIFY_API', 'Failed to fetch playlists', error, {
          status,
          message: error.message
        });
      }

      const playlistError = new Error('Failed to fetch playlists');
      playlistError.status = status;
      playlistError.details = error.response?.data || error.message;
      throw playlistError;
    }
  }

  // Get playlist details including tracks with batch processing
  async getPlaylistDetails(accessToken, playlistId) {
    try {
      // Fetch playlist info and first batch of tracks
      const [playlistResponse, tracksResponse] = await Promise.all([
        this.makeRateLimitedRequest({
          method: 'get',
          url: `${this.baseURL}/playlists/${playlistId}`,
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }),
        this.makeRateLimitedRequest({
          method: 'get',
          url: `${this.baseURL}/playlists/${playlistId}/tracks`,
          headers: { 'Authorization': `Bearer ${accessToken}` },
          params: { limit: 100 }
        })
      ]);

      const playlist = playlistResponse.data;
      let tracks = tracksResponse.data.items;
      let nextUrl = tracksResponse.data.next;

      // Handle pagination for tracks if needed
      while (nextUrl) {
        const nextResponse = await this.makeRateLimitedRequest({
          method: 'get',
          url: nextUrl,
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        tracks = tracks.concat(nextResponse.data.items);
        nextUrl = nextResponse.data.next;
      }

      // Filter out local tracks and extract unique album IDs for batch processing
      const validTracks = tracks.filter(item => item.track && !item.track.is_local);
      const albumIds = [...new Set(validTracks.map(item => item.track.album?.id).filter(Boolean))];
      
      // Batch fetch album metadata in chunks of 20 (Spotify's limit)
      const albumData = await this.fetchAlbumsInBatches(accessToken, albumIds);
      
      // Merge album data with tracks
      const enrichedTracks = validTracks.map(item => ({
        ...item,
        track: {
          ...item.track,
          album: albumData[item.track.album?.id] || item.track.album
        }
      }));

      return {
        ...playlist,
        tracks: enrichedTracks
      };
    } catch (error) {
      throw new Error('Failed to fetch playlist details');
    }
  }

  // URL PARSING METHODS

  /**
   * Extract playlist ID from Spotify URL
   * @param {string} url - Spotify playlist URL
   * @returns {string|null} Playlist ID or null if invalid
   */
  extractPlaylistId(url) {
    if (!url || typeof url !== 'string') {
      return null;
    }

    const trimmedUrl = url.trim();

    // Pattern 1: https://open.spotify.com/playlist/{id}?...
    const webPattern = /^https?:\/\/open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)/i;
    const webMatch = trimmedUrl.match(webPattern);
    if (webMatch) {
      return webMatch[1];
    }

    // Pattern 2: spotify:playlist:{id}
    const uriPattern = /^spotify:playlist:([a-zA-Z0-9]+)/i;
    const uriMatch = trimmedUrl.match(uriPattern);
    if (uriMatch) {
      return uriMatch[1];
    }

    return null;
  }

  /**
   * Get public playlist details using client credentials (no user auth)
   * @param {string} playlistId - Spotify playlist ID
   * @returns {Object} Playlist details with tracks
   */
  async getPublicPlaylistDetails(playlistId) {
    try {
      const token = await this.getClientCredentialsToken();
      return await this.getPlaylistDetails(token, playlistId);
    } catch (error) {
      // Check if it's a private playlist (403 Forbidden)
      if (error.response?.status === 403) {
        throw new Error('This playlist is private and cannot be imported without authentication');
      }
      throw error;
    }
  }

  // Normalize search query for cache key
  normalizeSearchQuery(artist, title, isrc = null) {
    if (isrc) {
      // ISRC is already unique, just normalize case
      return `isrc:${String(isrc).toLowerCase().trim()}`;
    }

    // Normalize metadata search
    const normalizedArtist = (artist || '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .split(/[,&]/) // Split by comma or ampersand for multiple artists
      .map(a => a.trim())
      .filter(Boolean)
      .sort()
      .join('|');

    const normalizedTitle = (title || '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ');

    return `meta:${normalizedArtist}:${normalizedTitle}`;
  }

  // Get cached search result or null
  async getCachedSearch(cacheKey) {
    const logCacheHitRate = () => {
      // Log cache hit rate periodically and update metrics
      const totalRequests = this.searchCacheHits + this.searchCacheMisses;
      if (totalRequests % 100 === 0) {
        const hitRate = (this.searchCacheHits / totalRequests * 100).toFixed(1);
        const hitRateDecimal = this.searchCacheHits / totalRequests;

        logger.info('SPOTIFY_CACHE', `Search cache hit rate: ${hitRate}% (${this.searchCacheHits}/${totalRequests})`, {
          hitRate: parseFloat(hitRate),
          hits: this.searchCacheHits,
          misses: this.searchCacheMisses,
          cacheSize: this.searchCache.size
        });

        // Update metrics gauge
        setCacheHitRate('spotify_search', hitRateDecimal);
      }
    };

    const cached = this.searchCache.get(cacheKey);
    if (cached) {
      // Check if expired
      if (Date.now() > cached.expires) {
        this.searchCache.delete(cacheKey);
      } else {
        this.searchCacheHits++;
        logCacheHitRate();
        return cached.result;
      }
    }

    const redisResult = await getCacheValue(this.redisSearchCacheNamespace, cacheKey);
    if (redisResult !== undefined) {
      this.searchCacheHits++;

      // Enforce max cache size with simple FIFO eviction
      if (this.searchCache.size >= this.searchCacheMaxSize) {
        const firstKey = this.searchCache.keys().next().value;
        if (firstKey) {
          this.searchCache.delete(firstKey);
        }
      }

      this.searchCache.set(cacheKey, {
        result: redisResult,
        expires: Date.now() + this.searchCacheTTL
      });

      logCacheHitRate();
      return redisResult;
    }

    this.searchCacheMisses++;
    return null;
  }

  // Store search result in cache
  setCachedSearch(cacheKey, result) {
    // Enforce max cache size with simple FIFO eviction
    if (this.searchCache.size >= this.searchCacheMaxSize) {
      // Remove oldest entry (first key in Map)
      const firstKey = this.searchCache.keys().next().value;
      if (firstKey) {
        this.searchCache.delete(firstKey);
      }
    }

    this.searchCache.set(cacheKey, {
      result,
      expires: Date.now() + this.searchCacheTTL
    });

    void setCacheValue(this.redisSearchCacheNamespace, cacheKey, result, this.searchCacheTTL);
  }

  // SEARCH METHODS (for cross-linking)

  // Search Spotify tracks by ISRC (highest confidence)
  async searchByISRC(isrc) {
    if (!isrc || !String(isrc).trim()) return null;

    // Check cache first
    const cacheKey = this.normalizeSearchQuery(null, null, isrc);
    const cached = await this.getCachedSearch(cacheKey);
    if (cached !== null) {
      return cached;
    }

    const token = await this.getClientCredentialsToken();
    try {
      const response = await this.makeRateLimitedRequest({
        method: 'get',
        url: `${this.baseURL}/search`,
        headers: { 'Authorization': `Bearer ${token}` },
        params: { q: `isrc:${encodeURIComponent(String(isrc).trim())}`, type: 'track', limit: 5 }
      });
      const items = response.data?.tracks?.items || [];
      if (!items.length) {
        // Cache null result to avoid repeated failed searches
        this.setCachedSearch(cacheKey, null);
        return null;
      }
      const t = items[0];
      const result = {
        id: t.id,
        url: `https://open.spotify.com/track/${t.id}`,
        title: t.name,
        artist: (t.artists || []).map(a => a.name).join(', '),
        confidence: 100,
        source: 'isrc',
        isrc: t.external_ids?.isrc || isrc,
        artwork_url: t.album?.images?.[0]?.url || null
      };

      // Cache successful result
      this.setCachedSearch(cacheKey, result);
      return result;
    } catch (error) {
      // On search error, return null to allow fallback (don't cache errors)
      return null;
    }
  }

  // Search Spotify tracks by metadata (fallback)
  async searchByMetadata(artist, title) {
    const a = (artist || '').trim();
    const ti = (title || '').trim();
    if (!a || !ti) return null;

    // Check cache first
    const cacheKey = this.normalizeSearchQuery(a, ti);
    const cached = await this.getCachedSearch(cacheKey);
    if (cached !== null) {
      return cached;
    }

    const token = await this.getClientCredentialsToken();
    try {
      const q = `track:${ti} artist:${a}`;
      const response = await this.makeRateLimitedRequest({
        method: 'get',
        url: `${this.baseURL}/search`,
        headers: { 'Authorization': `Bearer ${token}` },
        params: { q, type: 'track', limit: 10 }
      });
      const items = response.data?.tracks?.items || [];
      if (!items.length) {
        // Cache null result to avoid repeated failed searches
        this.setCachedSearch(cacheKey, null);
        return null;
      }
      // naive ranking: prefer exact-ish matches on lowercased strings
      const lcA = a.toLowerCase();
      const lcT = ti.toLowerCase();
      const ranked = items
        .map(t => ({
          t,
          score: (
            (t.name || '').toLowerCase().includes(lcT) ? 1 : 0
          ) + (
            ((t.artists || []).map(x => x.name.toLowerCase()).join(' ')).includes(lcA) ? 1 : 0
          )
        }))
        .sort((x, y) => y.score - x.score);
      const pick = (ranked[0] || {}).t || items[0];
      if (!pick) {
        // Cache null result
        this.setCachedSearch(cacheKey, null);
        return null;
      }
      const result = {
        id: pick.id,
        url: `https://open.spotify.com/track/${pick.id}`,
        title: pick.name,
        artist: (pick.artists || []).map(a => a.name).join(', '),
        confidence: (ranked[0]?.score || 0) >= 2 ? 90 : 70,
        source: 'metadata',
        isrc: pick.external_ids?.isrc || null,
        artwork_url: pick.album?.images?.[0]?.url || null
      };

      // Cache successful result
      this.setCachedSearch(cacheKey, result);
      return result;
    } catch (error) {
      return null;
    }
  }

  // Unified search by track object ({ artist, title, isrc })
  async searchByTrack(track) {
    // Try ISRC first
    if (track?.isrc) {
      const viaIsrc = await this.searchByISRC(track.isrc);
      if (viaIsrc) return viaIsrc;
    }
    // Fallback to metadata
    return await this.searchByMetadata(track?.artist, track?.title);
  }

  // Search for an album by artist and title (for release cross-linking)
  async searchAlbum(artist, title) {
    const a = (artist || '').trim();
    const t = (title || '').trim();
    if (!a || !t) return null;

    const cacheKey = this.normalizeSearchQuery(`album:${a}`, t);
    const cached = await this.getCachedSearch(cacheKey);
    if (cached !== null) {
      return cached;
    }

    const token = await this.getClientCredentialsToken();
    try {
      const q = `album:${t} artist:${a}`;
      const response = await this.makeRateLimitedRequest({
        method: 'get',
        url: `${this.baseURL}/search`,
        headers: { 'Authorization': `Bearer ${token}` },
        params: { q, type: 'album', limit: 10 }
      });
      const items = response.data?.albums?.items || [];
      if (!items.length) {
        this.setCachedSearch(cacheKey, null);
        return null;
      }
      // Rank results by how well they match artist and title
      const lcA = a.toLowerCase();
      const lcT = t.toLowerCase();
      const ranked = items
        .map(album => ({
          album,
          score: (
            (album.name || '').toLowerCase().includes(lcT) ? 1 : 0
          ) + (
            ((album.artists || []).map(x => x.name.toLowerCase()).join(' ')).includes(lcA) ? 1 : 0
          )
        }))
        .sort((x, y) => y.score - x.score);
      const pick = (ranked[0] || {}).album || items[0];
      if (!pick) {
        this.setCachedSearch(cacheKey, null);
        return null;
      }
      const result = {
        id: pick.id,
        url: `https://open.spotify.com/album/${pick.id}`,
        title: pick.name,
        artist: (pick.artists || []).map(a => a.name).join(', '),
        confidence: (ranked[0]?.score || 0) >= 2 ? 90 : 70,
        source: 'album_search'
      };
      this.setCachedSearch(cacheKey, result);
      return result;
    } catch (error) {
      return null;
    }
  }

  // Fetch albums in batches of 20 with rate limiting
  async fetchAlbumsInBatches(accessToken, albumIds) {
    if (albumIds.length === 0) return {};

    const albumData = {};
    const batchSize = 20;

    for (let i = 0; i < albumIds.length; i += batchSize) {
      const batch = albumIds.slice(i, i + batchSize);

      try {
        const response = await this.makeRateLimitedRequest({
          method: 'get',
          url: `${this.baseURL}/albums`,
          headers: { 'Authorization': `Bearer ${accessToken}` },
          params: { ids: batch.join(',') }
        });

        response.data.albums.forEach(album => {
          if (album) {
            albumData[album.id] = album;
          }
        });
      } catch (error) {
        // Continue with other batches even if one fails
      }
    }

    return albumData;
  }

  /**
   * Get audio features for multiple tracks (batch endpoint)
   * @param {string} accessToken - Spotify access token
   * @param {Array<string>} trackIds - Array of Spotify track IDs (max 100)
   * @returns {Object} Audio features data
   */
  async getAudioFeatures(accessToken, trackIds) {
    if (!trackIds || trackIds.length === 0) return { audio_features: [] };

    // Spotify API limit is 100 tracks per request
    const batch = trackIds.slice(0, 100);

    try {
      const response = await this.makeRateLimitedRequest({
        method: 'get',
        url: `${this.baseURL}/audio-features`,
        headers: { 'Authorization': `Bearer ${accessToken}` },
        params: { ids: batch.join(',') }
      });

      return response.data; // Returns { audio_features: [...] }
    } catch (error) {
      console.error('Failed to fetch audio features:', error);
      return { audio_features: [] };
    }
  }

  /**
   * Get artist details including genres (batch endpoint)
   * @param {string} accessToken - Spotify access token
   * @param {Array<string>} artistIds - Array of Spotify artist IDs (max 50)
   * @returns {Object} Artist data with genres
   */
  async getArtists(accessToken, artistIds) {
    if (!artistIds || artistIds.length === 0) return { artists: [] };

    // Spotify API limit is 50 artists per request
    const batch = artistIds.slice(0, 50);

    try {
      const response = await this.makeRateLimitedRequest({
        method: 'get',
        url: `${this.baseURL}/artists`,
        headers: { 'Authorization': `Bearer ${accessToken}` },
        params: { ids: batch.join(',') }
      });

      return response.data; // Returns { artists: [...] }
    } catch (error) {
      console.error('Failed to fetch artists:', error);
      return { artists: [] };
    }
  }

  /**
   * Batch fetch audio features for large playlists
   * @param {string} accessToken - Spotify access token
   * @param {Array<string>} trackIds - Array of track IDs (any length)
   * @returns {Array} Array of audio feature objects
   */
  async fetchAudioFeaturesInBatches(accessToken, trackIds) {
    if (trackIds.length === 0) return [];

    const features = [];
    const batchSize = 100;

    for (let i = 0; i < trackIds.length; i += batchSize) {
      const batch = trackIds.slice(i, i + batchSize);
      const result = await this.getAudioFeatures(accessToken, batch);
      features.push(...(result.audio_features || []));
    }

    return features;
  }

  /**
   * Batch fetch artist data for large playlists
   * @param {string} accessToken - Spotify access token
   * @param {Array<string>} artistIds - Array of unique artist IDs
   * @returns {Object} Map of artistId -> artist data
   */
  async fetchArtistsInBatches(accessToken, artistIds) {
    if (artistIds.length === 0) return {};

    const artistMap = {};
    const batchSize = 50;

    for (let i = 0; i < artistIds.length; i += batchSize) {
      const batch = artistIds.slice(i, i + batchSize);
      const result = await this.getArtists(accessToken, batch);

      (result.artists || []).forEach(artist => {
        if (artist && artist.id) {
          artistMap[artist.id] = artist;
        }
      });
    }

    return artistMap;
  }

  // Transform Spotify tracks to Flowerpil format (tracks only)
  transformTracksForFlowerpil(spotifyTracks) {
    return spotifyTracks.map((item, index) => {
      const track = item.track;
      return {
        position: index + 1, // Will be overridden with correct position in API
        title: track.name,
        artist: track.artists.map(artist => artist.name).join(', '),
        album: track.album?.name || '',
        year: track.album?.release_date ? new Date(track.album.release_date).getFullYear() : null,
        duration: this.convertMsToTime(track.duration_ms),
        spotify_id: track.id,
        apple_id: null,
        tidal_id: null,
        label: track.album?.label || '',
        genre: track.album?.genres?.join(', ') || '', // Album genres
        artwork_url: track.album?.images?.[0]?.url || '', // Use album artwork directly for top10
        album_artwork_url: track.album?.images?.[0]?.url || '', // Large image URL for download
        spotify_url: track.external_urls?.spotify || '', // Add Spotify URL for DSP linking
        isrc: track.external_ids?.isrc || '',
        explicit: track.explicit || false,
        popularity: track.popularity || 0,
        preview_url: track.preview_url || ''
      };
    });
  }

  // Transform Spotify playlist to Flowerpil format
  transformPlaylistForFlowerpil(spotifyPlaylist, curatorName, curatorType = 'artist') {
    const tracks = this.transformTracksForFlowerpil(spotifyPlaylist.tracks);

    return {
      playlist: {
        title: spotifyPlaylist.name,
        description: spotifyPlaylist.description || '',
        description_short: this.truncateDescription(spotifyPlaylist.description || ''),
        curator_name: curatorName,
        curator_type: curatorType,
        image: spotifyPlaylist.images?.[0]?.url || '',
        spotify_url: spotifyPlaylist.external_urls?.spotify || '',
        apple_url: '',
        tidal_url: '',
        published: true,
        publish_date: new Date().toISOString().split('T')[0]
      },
      tracks
    };
  }

  // Convert milliseconds to MM:SS format
  convertMsToTime(ms) {
    if (!ms) return '';
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  // Truncate description for short version
  truncateDescription(description, maxLength = 150) {
    if (!description || description.length <= maxLength) return description;
    return description.substring(0, maxLength).replace(/\s+\S*$/, '') + '...';
  }

  // Download and process artwork
  async downloadArtwork(imageUrl, filename) {
    if (!imageUrl) return null;
    
    try {
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 10000
      });
      
      return {
        buffer: Buffer.from(response.data),
        contentType: response.headers['content-type'] || 'image/jpeg',
        filename
      };
    } catch (error) {
      return null;
    }
  }

  // PLAYLIST EXPORT METHODS

  /**
   * Get current user profile information
   * @param {string} accessToken - Spotify access token
   * @returns {Object} User profile information
   */
  async getUserProfile(accessToken) {
    try {
      const response = await this.makeRateLimitedRequest({
        method: 'get',
        url: `${this.baseURL}/me`,
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      return response.data;
    } catch (error) {
      throw new Error(`Failed to get user profile: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Create a new playlist on Spotify
   * @param {string} accessToken - Spotify access token
   * @param {string} userId - Spotify user ID
   * @param {Object} playlistData - Playlist metadata
   * @returns {Object} Created playlist information
   */
  async createPlaylist(accessToken, userId, playlistData) {
    try {
      // Sanitize and clean description - strip HTML tags, REMOVE ALL NEWLINES (Spotify API may not support them)
      let description = 'Exported from Flowerpil';
      if (playlistData.description && playlistData.description.trim()) {
        const cleanDesc = playlistData.description
          .trim()
          .replace(/<br\s*\/?>/gi, ' ')  // Replace <br> with space
          .replace(/<\/p>\s*<p[^>]*>/gi, ' ')  // Replace paragraph breaks with space
          .replace(/<[^>]+>/g, '')  // Strip all remaining HTML tags
          .replace(/&amp;/g, '&')  // Decode common HTML entities
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&nbsp;/g, ' ')
          .replace(/\r\n/g, ' ')  // Replace newlines with spaces
          .replace(/\r/g, ' ')    // Replace newlines with spaces
          .replace(/\n/g, ' ')    // Replace newlines with spaces
          .replace(/\s+/g, ' ')   // Collapse multiple spaces
          // Remove emojis and other problematic unicode characters
          .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
          .trim();  // Trim again after cleaning

        if (cleanDesc) {
          description = `${cleanDesc} - Exported from Flowerpil`;
        }
      }

      // Start with minimal payload
      const requestData = {
        name: playlistData.title || 'Untitled Playlist',
        public: playlistData.isPublic !== false
      };

      // Add description
      if (description) {
        requestData.description = description;
      }

      logger.info('SPOTIFY_PLAYLIST', 'Creating playlist with data', {
        userId,
        requestData,
        requestDataJSON: JSON.stringify(requestData),
        url: `${this.baseURL}/me/playlists`
      });

      const response = await this.makeRateLimitedRequest({
        method: 'post',
        url: `${this.baseURL}/me/playlists`,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        data: requestData
      });

      return {
        id: response.data.id,
        url: response.data.external_urls.spotify,
        name: response.data.name,
        snapshot_id: response.data.snapshot_id
      };
    } catch (error) {
      logger.error('SPOTIFY_PLAYLIST', 'Playlist creation failed', error, {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        headers: error.response?.headers,
        message: error.message,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          data: error.config?.data
        }
      });
      throw new Error(`Failed to create Spotify playlist: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Add tracks to a Spotify playlist in batches
   * @param {string} accessToken - Spotify access token
   * @param {string} playlistId - Spotify playlist ID
   * @param {Array} spotifyIds - Array of Spotify track IDs
   * @returns {void}
   */
  async addTracksToPlaylist(accessToken, playlistId, spotifyIds) {
    if (!spotifyIds || spotifyIds.length === 0) {
      return 0;
    }

    const uris = spotifyIds.map(id => `spotify:track:${id}`);
    const batchSize = 100; // Spotify API limit

    for (let i = 0; i < uris.length; i += batchSize) {
      const batch = uris.slice(i, i + batchSize);

      try {
        await this.makeRateLimitedRequest({
          method: 'post',
          url: `${this.baseURL}/playlists/${playlistId}/tracks`,
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          data: { uris: batch }
        });

        console.log(`✅ Added batch ${Math.floor(i / batchSize) + 1} (${batch.length} tracks) to Spotify playlist`);
      } catch (error) {
        console.error(`❌ Failed to add batch ${Math.floor(i / batchSize) + 1}:`, error.response?.data || error.message);
        throw new Error(`Failed to add tracks to Spotify playlist: ${error.response?.data?.error?.message || error.message}`);
      }
    }
    
    return spotifyIds.length;
  }

  buildImageCandidatePaths(relativePath) {
    // Normalise uploaded artwork paths so we can test base and resized variants
    if (!relativePath || typeof relativePath !== 'string') {
      return [];
    }

    const normalized = relativePath
      .replace(/\\/g, '/')
      .replace(/^https?:\/\/[^/]+/i, '')
      .replace(/^\/+/, '');

    const cleanPath = normalized
      .replace(/^(?:storage\/)?uploads\//i, '')
      .replace(/^storage\/uplaods\//i, '')
      .replace(/^\//, '')
      .replace(/^[.\/]+/, '');

    const parsed = path.parse(cleanPath);
    const variantBase = parsed.name.replace(/_(large|medium|small|md|sm)$/i, '');
    const candidates = new Set();

    if (cleanPath) {
      candidates.add(cleanPath);
    }

    const variantSuffixes = ['', '_large', '_medium', '_small', '_md', '_sm'];
    variantSuffixes.forEach(suffix => {
      if (!parsed.ext) return;
      const name = `${variantBase}${suffix}${parsed.ext}`;
      if (!name) return;
      const candidate = parsed.dir ? path.join(parsed.dir, name) : name;
      candidates.add(candidate.replace(/^\//, ''));
    });

    if (parsed.name && parsed.ext) {
      const originalName = parsed.dir ? path.join(parsed.dir, `${parsed.name}${parsed.ext}`) : `${parsed.name}${parsed.ext}`;
      candidates.add(originalName.replace(/^\//, ''));
    }

    return Array.from(candidates).filter(Boolean);
  }

  async loadPlaylistImageBuffer(imagePath) {
    if (!imagePath || typeof imagePath !== 'string') {
      return null;
    }

    let sanitized = imagePath.trim();
    if (!sanitized) {
      return null;
    }

    sanitized = sanitized.split('?')[0].split('#')[0];

    const looksLikeRemote = /^https?:\/\//i.test(sanitized);

    if (looksLikeRemote && !sanitized.includes('/uploads/')) {
      try {
        const response = await axios.get(sanitized, { responseType: 'arraybuffer' });
        return Buffer.from(response.data);
      } catch (error) {
        console.error('❌ SpotifyService: Failed to fetch remote playlist cover:', error.message);
        return null;
      }
    }

    if (looksLikeRemote) {
      try {
        const parsed = new URL(sanitized);
        if (parsed.pathname) {
          sanitized = parsed.pathname;
        }
      } catch (error) {
        // Ignore URL parse errors and continue with raw string
      }
    }

    const relativePath = sanitized
      .replace(/\\/g, '/')
      .replace(/^https?:\/\/[^/]+/i, '')
      .replace(/^\/+/, '')
      .replace(/^storage\/uplaods\//i, '')
      .replace(/^(?:storage\/)?uploads\//i, '');

    const candidates = this.buildImageCandidatePaths(relativePath);

    for (const candidate of candidates) {
      const absolutePath = path.join(UPLOADS_ROOT, candidate);
      if (!absolutePath.startsWith(UPLOADS_ROOT)) {
        continue;
      }

      if (fs.existsSync(absolutePath)) {
        try {
          return await fsPromises.readFile(absolutePath);
        } catch (error) {
          console.error('❌ SpotifyService: Failed to read playlist cover:', error.message);
          return null;
        }
      }
    }

    if (looksLikeRemote) {
      try {
        const response = await axios.get(imagePath, { responseType: 'arraybuffer' });
        return Buffer.from(response.data);
      } catch (error) {
        console.error('❌ SpotifyService: Remote cover fetch fallback failed:', error.message);
      }
    }

    console.warn('⚠️ SpotifyService: Playlist cover image not found for export', { imagePath });
    return null;
  }

  async prepareSpotifyCoverBuffer(imageBuffer) {
    if (!imageBuffer) {
      return null;
    }

    const qualitySteps = [90, 80, 70, 60, 50, 40];

    for (const quality of qualitySteps) {
      try {
        const processed = await sharp(imageBuffer)
          .resize(640, 640, { fit: 'cover', position: 'center' })
          .jpeg({ quality, chromaSubsampling: '4:4:4' })
          .toBuffer();

        if (processed.length <= MAX_SPOTIFY_IMAGE_BYTES) {
          return processed;
        }
      } catch (error) {
        console.error('❌ SpotifyService: Failed to process cover image for Spotify:', error.message);
        break;
      }
    }

    try {
      const fallback = await sharp(imageBuffer)
        .resize(512, 512, { fit: 'cover', position: 'center' })
        .jpeg({ quality: 60, chromaSubsampling: '4:4:4' })
        .toBuffer();

      if (fallback.length <= MAX_SPOTIFY_IMAGE_BYTES) {
        return fallback;
      }
    } catch (error) {
      console.error('❌ SpotifyService: Fallback cover processing failed:', error.message);
    }

    console.warn('⚠️ SpotifyService: Processed cover still exceeds Spotify size limit');
    return null;
  }

  async tryUpdatePlaylistCover(accessToken, playlistId, playlistData) {
    if (!playlistData || !playlistData.image) {
      return false;
    }

    try {
      const rawImage = await this.loadPlaylistImageBuffer(playlistData.image);
      if (!rawImage) {
        return false;
      }

      const prepared = await this.prepareSpotifyCoverBuffer(rawImage);
      if (!prepared) {
        return false;
      }

      await this.makeRateLimitedRequest({
        method: 'put',
        url: `${this.baseURL}/playlists/${playlistId}/images`,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'image/jpeg',
          'Content-Length': prepared.length
        },
        data: prepared
      });

      console.log('🖼️ Spotify cover image uploaded successfully');
      return true;
    } catch (error) {
      console.error('❌ SpotifyService: Failed to upload playlist cover:', error.response?.data || error.message);
      return false;
    }
  }

  /**
   * Export complete playlist to Spotify
   * @param {string} accessToken - Spotify access token
   * @param {string} userId - Spotify user ID
   * @param {Object} playlistData - Flowerpil playlist data
   * @param {Array} tracks - Array of track objects
   * @returns {Object} Export result
   */
  /**
   * Sync (replace-in-place) an existing Spotify playlist.
   * Updates metadata and replaces all tracks.
   */
  async syncPlaylist(accessToken, remotePlaylistId, playlistData, tracks) {
    try {
      // Update playlist metadata
      let description = 'Exported from Flowerpil';
      if (playlistData.description && playlistData.description.trim()) {
        const cleanDesc = playlistData.description
          .trim()
          .replace(/<br\s*\/?>/gi, ' ')
          .replace(/<\/p>\s*<p[^>]*>/gi, ' ')
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
          .replace(/\r\n/g, ' ').replace(/\r/g, ' ').replace(/\n/g, ' ')
          .replace(/\s+/g, ' ')
          .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
          .trim();
        if (cleanDesc) description = `${cleanDesc} - Exported from Flowerpil`;
      }

      await this.makeRateLimitedRequest({
        method: 'put',
        url: `${this.baseURL}/playlists/${remotePlaylistId}`,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        data: {
          name: playlistData.title || 'Untitled Playlist',
          public: playlistData.isPublic !== false,
          description
        }
      });

      // Upload cover art
      const coverUploaded = await this.tryUpdatePlaylistCover(accessToken, remotePlaylistId, playlistData);

      // Filter valid tracks
      const validTracks = tracks.filter(t => t.spotify_id && t.spotify_id.trim() !== '');
      const uris = validTracks.map(id => `spotify:track:${id.spotify_id}`);

      // Replace all tracks using PUT (clears and sets in one call for first 100)
      const batchSize = 100;
      if (uris.length > 0) {
        // First batch replaces all existing tracks
        await this.makeRateLimitedRequest({
          method: 'put',
          url: `${this.baseURL}/playlists/${remotePlaylistId}/tracks`,
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          data: { uris: uris.slice(0, batchSize) }
        });

        // Subsequent batches appended
        for (let i = batchSize; i < uris.length; i += batchSize) {
          const batch = uris.slice(i, i + batchSize);
          await this.makeRateLimitedRequest({
            method: 'post',
            url: `${this.baseURL}/playlists/${remotePlaylistId}/tracks`,
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            data: { uris: batch }
          });
        }
      } else {
        // Clear all tracks
        await this.makeRateLimitedRequest({
          method: 'put',
          url: `${this.baseURL}/playlists/${remotePlaylistId}/tracks`,
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          data: { uris: [] }
        });
      }

      const playlistUrl = `https://open.spotify.com/playlist/${remotePlaylistId}`;
      console.log(`[SPOTIFY_SYNC] Synced playlist ${remotePlaylistId}: ${validTracks.length} tracks`);

      return {
        platform: 'spotify',
        playlistUrl,
        playlistId: remotePlaylistId,
        playlistName: playlistData.title,
        tracksAdded: validTracks.length,
        totalTracks: tracks.length,
        coverage: tracks.length > 0 ? validTracks.length / tracks.length : 0,
        success: true,
        coverUploaded,
        synced: true,
        missingTracks: tracks.filter(t => !t.spotify_id || t.spotify_id.trim() === '').length
      };
    } catch (error) {
      console.error('[SPOTIFY_SYNC] Sync failed:', error.message);
      throw new Error(`Failed to sync Spotify playlist: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async exportPlaylist(accessToken, userId, playlistData, tracks) {
    try {
      // Create empty playlist
      console.log(`🎵 Creating Spotify playlist: "${playlistData.title}"`);
      const playlist = await this.createPlaylist(accessToken, userId, playlistData);

      // Attempt to upload cover art before adding tracks
      const coverUploaded = await this.tryUpdatePlaylistCover(accessToken, playlist.id, playlistData);

      // Filter and add tracks with spotify_id
      const validTracks = tracks.filter(t => t.spotify_id && t.spotify_id.trim() !== '');
      
      if (validTracks.length > 0) {
        console.log(`🎵 Adding ${validTracks.length} tracks to Spotify playlist`);
        const spotifyIds = validTracks.map(t => t.spotify_id);
        await this.addTracksToPlaylist(accessToken, playlist.id, spotifyIds);
      }

      const result = {
        platform: 'spotify',
        playlistUrl: playlist.url,
        playlistId: playlist.id,
        playlistName: playlist.name,
        tracksAdded: validTracks.length,
        totalTracks: tracks.length,
        coverage: tracks.length > 0 ? validTracks.length / tracks.length : 0,
        success: true,
        coverUploaded,
        missingTracks: tracks.filter(t => !t.spotify_id || t.spotify_id.trim() === '').length
      };

      console.log(`✅ Spotify export complete: ${result.tracksAdded}/${result.totalTracks} tracks (${Math.round(result.coverage * 100)}% coverage)`);
      return result;

    } catch (error) {
      console.error('❌ Spotify export failed:', error.message);
      return {
        platform: 'spotify',
        success: false,
        error: error.message,
        tracksAdded: 0,
        totalTracks: tracks.length,
        coverUploaded: false
      };
    }
  }

  /**
   * Extract album ID from Spotify URL
   * @param {string} url - Spotify album URL
   * @returns {string|null} Album ID or null if invalid
   */
  extractAlbumId(url) {
    if (!url) return null;

    // Handle various Spotify URL formats:
    // https://open.spotify.com/album/4hq2OaK0JRLJhFrjXBe6TH
    // https://open.spotify.com/album/4hq2OaK0JRLJhFrjXBe6TH?si=xxx
    // spotify:album:4hq2OaK0JRLJhFrjXBe6TH

    const patterns = [
      /^https?:\/\/open\.spotify\.com\/album\/([a-zA-Z0-9]+)/i,
      /^spotify:album:([a-zA-Z0-9]+)$/i
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }

    return null;
  }

  /**
   * Extract track ID from Spotify URL
   * @param {string} url - Spotify track URL
   * @returns {string|null} Track ID or null if invalid
   */
  extractTrackId(url) {
    if (!url) return null;

    const patterns = [
      /^https?:\/\/open\.spotify\.com\/track\/([a-zA-Z0-9]+)/i,
      /^spotify:track:([a-zA-Z0-9]+)$/i
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }

    return null;
  }

  /**
   * Map Spotify album type to release type
   * @param {string} albumType - Spotify album_type field
   * @param {number} totalTracks - Number of tracks
   * @returns {string} Normalized release type
   */
  mapAlbumType(albumType, totalTracks = 1) {
    switch (albumType?.toLowerCase()) {
      case 'single':
        return totalTracks === 2 ? 'double-single' : 'single';
      case 'ep':
        return 'EP';
      case 'album':
        return 'album';
      case 'compilation':
        return 'album';
      default:
        return 'single';
    }
  }

  /**
   * Get album details from Spotify
   * @param {string} albumId - Spotify album ID
   * @returns {Object} Album metadata for release form
   */
  async getAlbumDetails(albumId) {
    if (!albumId) {
      throw new Error('Album ID is required');
    }

    try {
      const token = await this.getClientCredentialsToken();

      const response = await this.makeRateLimitedRequest({
        method: 'get',
        url: `${this.baseURL}/albums/${albumId}`,
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const album = response.data;

      // Extract artist names
      const artistName = album.artists?.map(a => a.name).join(', ') || '';

      // Get release date (Spotify returns YYYY, YYYY-MM, or YYYY-MM-DD)
      let releaseDate = album.release_date || null;
      if (releaseDate && releaseDate.length === 4) {
        releaseDate = `${releaseDate}-01-01`;
      } else if (releaseDate && releaseDate.length === 7) {
        releaseDate = `${releaseDate}-01`;
      }

      return {
        title: album.name || '',
        artist_name: artistName,
        release_date: releaseDate,
        release_type: this.mapAlbumType(album.album_type, album.total_tracks),
        artwork_url: album.images?.[0]?.url || null,
        spotify_url: album.external_urls?.spotify || null,
        genres: album.genres || [],
        label: album.label || null,
        total_tracks: album.total_tracks || 0,
        popularity: album.popularity || 0,
        copyrights: album.copyrights?.map(c => c.text) || []
      };
    } catch (error) {
      logger.error('SPOTIFY_API', 'Failed to fetch album details', error, {
        albumId,
        status: error.response?.status,
        message: error.message
      });

      if (error.response?.status === 404) {
        throw new Error('Album not found on Spotify');
      }

      throw new Error(`Failed to fetch album details: ${error.message}`);
    }
  }

  /**
   * Get track details from Spotify (for single track releases)
   * @param {string} trackId - Spotify track ID
   * @returns {Object} Track metadata for release form
   */
  async getTrackDetails(trackId) {
    if (!trackId) {
      throw new Error('Track ID is required');
    }

    try {
      const token = await this.getClientCredentialsToken();

      const response = await this.makeRateLimitedRequest({
        method: 'get',
        url: `${this.baseURL}/tracks/${trackId}`,
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const track = response.data;

      // Extract artist names
      const artistName = track.artists?.map(a => a.name).join(', ') || '';

      // Get album info for release date
      const album = track.album || {};
      let releaseDate = album.release_date || null;
      if (releaseDate && releaseDate.length === 4) {
        releaseDate = `${releaseDate}-01-01`;
      } else if (releaseDate && releaseDate.length === 7) {
        releaseDate = `${releaseDate}-01`;
      }

      return {
        title: track.name || '',
        artist_name: artistName,
        release_date: releaseDate,
        release_type: 'single',
        artwork_url: album.images?.[0]?.url || null,
        spotify_url: track.external_urls?.spotify || null,
        genres: [], // Tracks don't have genres, would need artist lookup
        total_tracks: 1,
        popularity: track.popularity || 0
      };
    } catch (error) {
      logger.error('SPOTIFY_API', 'Failed to fetch track details', error, {
        trackId,
        status: error.response?.status,
        message: error.message
      });

      if (error.response?.status === 404) {
        throw new Error('Track not found on Spotify');
      }

      throw new Error(`Failed to fetch track details: ${error.message}`);
    }
  }

  /**
   * Validate that access token has required export scopes
   * @param {string} accessToken - Spotify access token
   * @returns {boolean} Whether token has export permissions
   */
  async validateExportPermissions(accessToken) {
    try {
      // Try to get user's playlists - this requires appropriate scopes
      const response = await this.makeRateLimitedRequest({
        method: 'get',
        url: `${this.baseURL}/me/playlists`,
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        params: { limit: 1 }
      });

      // If we can read playlists, check if we can create one (this will fail if no modify permissions)
      return true; // Basic validation passed, actual permissions tested during export
    } catch (error) {
      if (error.response?.status === 401) {
        return false; // Token invalid or expired
      }
      if (error.response?.status === 403) {
        return false; // Insufficient permissions
      }
      throw error; // Other errors
    }
  }
}

export default SpotifyService;
