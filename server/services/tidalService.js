import crypto from 'crypto';
import CircuitBreaker from '../utils/CircuitBreaker.js';
import logger from '../utils/logger.js';
import DistributedRateLimiter from '../utils/DistributedRateLimiter.js';

const normalizeIsrc = (isrc) => {
  if (!isrc) return null;
  const cleaned = String(isrc).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!cleaned) return null;
  if (cleaned.length === 12) return cleaned;
  if (cleaned.length > 12) return cleaned.slice(0, 12);
  return cleaned.length >= 10 ? cleaned : null;
};

const normalizeString = (value) => {
  if (!value) return '';
  return value
    .toString()
    .toLowerCase()
    .replace(/[()\[\]{}.,'"!]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const splitArtists = (value) => {
  const normalized = normalizeString(value);
  if (!normalized) return [];
  return normalized
    .split(/\s*(?:,|&| feat\.?| ft\.?| with)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
};

const sharedWordScore = (a, b) => {
  if (!a || !b) return 0;
  const wordsA = new Set(a.split(' '));
  const wordsB = new Set(b.split(' '));
  let matches = 0;
  wordsA.forEach((word) => {
    if (word.length > 2 && wordsB.has(word)) matches += 1;
  });
  if (matches >= 3) return 30;
  if (matches === 2) return 20;
  if (matches === 1) return 10;
  return 0;
};

const toSeconds = (value) => {
  if (value == null) return null;
  if (typeof value === 'number') {
    if (value > 1000 && value < 1000000) return Math.round(value / 1000);
    return Math.round(value);
  }
  const parsed = parseFloat(String(value));
  if (Number.isNaN(parsed)) return null;
  if (parsed > 1000) return Math.round(parsed / 1000);
  return Math.round(parsed);
};

const parsePositiveNumber = (value, fallback) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const DEFAULT_TIDAL_COUNTRY_FALLBACKS = ['US', 'GB', 'CA'];
const TIDAL_PLAYLIST_DESCRIPTION_MAX_LENGTH = 500;
const TIDAL_PLAYLIST_EXPORT_SUFFIX = 'Exported from Flowerpil';
const TIDAL_PLAYLIST_NAME_FALLBACK = 'Flowerpil Export';

const normalizeCountryCode = (value) => {
  if (!value) return null;
  const trimmed = String(value).trim().toUpperCase();
  return /^[A-Z]{2}$/.test(trimmed) ? trimmed : null;
};

const parseCountryList = (value) => {
  if (!value) return [];
  return String(value)
    .split(/[,\s]+/)
    .map(part => normalizeCountryCode(part))
    .filter(Boolean);
};

const buildSearchTerms = ({ artist, title, album } = {}) => {
  const terms = new Set();
  const base = [artist, title].filter(Boolean).join(' ').trim();
  if (base) terms.add(base);
  const withAlbum = [artist, title, album].filter(Boolean).join(' ').trim();
  if (withAlbum && withAlbum !== base) terms.add(withAlbum);
  return Array.from(terms);
};

const scoreTitleMatch = (target, candidate) => {
  if (!target || !candidate) return 0;
  if (target === candidate) return 50;
  if (candidate.includes(target) || target.includes(candidate)) return 40;
  return Math.min(30, sharedWordScore(target, candidate));
};

const scoreArtistMatch = (target, candidate) => {
  if (!target || !candidate) return 0;
  const targetArtists = splitArtists(target);
  const candidateArtists = splitArtists(candidate);
  if (!targetArtists.length || !candidateArtists.length) return 0;
  let best = 0;
  for (const t of targetArtists) {
    for (const c of candidateArtists) {
      if (!t || !c) continue;
      if (t === c) {
        best = Math.max(best, 30);
      } else {
        best = Math.max(best, Math.min(30, sharedWordScore(t, c)));
      }
    }
  }
  return best;
};

const scoreAlbumMatch = (target, candidate) => {
  if (!target || !candidate) return 0;
  if (target === candidate) return 10;
  if (candidate.includes(target) || target.includes(candidate)) return 6;
  return Math.min(10, Math.round(sharedWordScore(target, candidate) * 0.3));
};

const scoreDurationMatch = (targetSeconds, candidateSeconds) => {
  if (!targetSeconds || !candidateSeconds) return 0;
  const diff = Math.abs(targetSeconds - candidateSeconds);
  if (diff <= 2) return 10;
  if (diff <= 5) return 7;
  if (diff <= 10) return 4;
  return 0;
};

const scoreMetadataCandidate = ({ target, candidate }) => {
  const normalizedCandidate = {
    title: normalizeString(candidate.title),
    artist: normalizeString(candidate.artist),
    album: normalizeString(candidate.album)
  };
  const titleScore = scoreTitleMatch(target.title, normalizedCandidate.title);
  const artistScore = scoreArtistMatch(target.artist, normalizedCandidate.artist);
  const albumScore = scoreAlbumMatch(target.album, normalizedCandidate.album);
  const durationScore = scoreDurationMatch(target.durationSeconds, candidate.durationSeconds);
  const score = clamp(titleScore + artistScore + albumScore + durationScore, 0, 100);
  return {
    score,
    breakdown: {
      title: titleScore,
      artist: artistScore,
      album: albumScore,
      duration: durationScore
    }
  };
};

const buildTidalPlaylistDescription = (value) => {
  if (typeof value !== 'string') return null;
  // Strip HTML tags from rich text editor output
  const stripped = value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
  const trimmed = stripped.trim();
  if (!trimmed) return null;

  const separator = '\n\n';
  const maxBaseLength = TIDAL_PLAYLIST_DESCRIPTION_MAX_LENGTH - TIDAL_PLAYLIST_EXPORT_SUFFIX.length - separator.length;

  if (maxBaseLength <= 0) {
    return TIDAL_PLAYLIST_EXPORT_SUFFIX.slice(0, TIDAL_PLAYLIST_DESCRIPTION_MAX_LENGTH);
  }

  const boundedBase = trimmed.slice(0, maxBaseLength).trimEnd();
  if (!boundedBase) {
    return TIDAL_PLAYLIST_EXPORT_SUFFIX.slice(0, TIDAL_PLAYLIST_DESCRIPTION_MAX_LENGTH);
  }

  return `${boundedBase}${separator}${TIDAL_PLAYLIST_EXPORT_SUFFIX}`;
};

const buildTidalPlaylistAttributes = (playlistData = {}) => {
  const title = typeof playlistData?.title === 'string' ? playlistData.title.trim() : '';
  const description = buildTidalPlaylistDescription(playlistData?.description);

  const attributes = {
    name: title || TIDAL_PLAYLIST_NAME_FALLBACK,
    accessType: playlistData?.isPublic !== false ? 'PUBLIC' : 'UNLISTED'
  };

  if (description) {
    attributes.description = description;
  }

  return attributes;
};

/**
 * Tidal API Service
 * 
 * Handles Tidal API integration with OAuth 2.1 + PKCE authentication,
 * ISRC-first search strategy, deep link generation, and playlist export.
 */
class TidalService {
  constructor() {
    this.baseUrl = 'https://openapi.tidal.com/v2';
    this.tokenUrl = 'https://auth.tidal.com/v1/oauth2/token';
    this.authUrl = 'https://login.tidal.com/authorize';  // Changed to login.tidal.com

    // Determine base URL for redirects (prefer env vars, fall back to FRONTEND_URL in dev)
    const getRedirectBase = () => {
      if (process.env.NODE_ENV === 'development' && process.env.FRONTEND_URL) {
        return process.env.FRONTEND_URL;
      }
      return 'https://flowerpil.io';
    };

    const redirectBase = getRedirectBase();
    this.redirectUri = process.env.TIDAL_REDIRECT_URI || `${redirectBase}/auth/tidal/callback`;
    this.exportRedirectUri = process.env.TIDAL_EXPORT_REDIRECT_URI || `${redirectBase}/auth/tidal/export/callback`;
    this.accessToken = null;
    this.tokenExpiry = null;
    this.accessTokenPromise = null;
    // TIDAL rate limiting: 2 requests/sec to stay well under their limits
    // Their API returns 429 aggressively, so we need conservative throttling
    this.rateLimitDelay = parsePositiveNumber(process.env.TIDAL_RATE_LIMIT_DELAY_MS, 500);
    this.countryCode = normalizeCountryCode(process.env.TIDAL_COUNTRY_CODE) || 'AU';
    const fallbackEnv = parseCountryList(process.env.TIDAL_COUNTRY_CODE_FALLBACKS);
    const defaultFallbacks = DEFAULT_TIDAL_COUNTRY_FALLBACKS.filter(code => code !== this.countryCode);
    this.countryCodeFallbacks = fallbackEnv.length ? fallbackEnv : defaultFallbacks;
    this.metadataMatchThreshold = parsePositiveNumber(process.env.TIDAL_METADATA_MATCH_THRESHOLD, 70);
    this.backoffUntil = 0;
    // Token bucket: capacity=2 allows small bursts, refill=2/sec sustains ~2 req/sec
    this.rateLimiter = new DistributedRateLimiter('tidal', {
      capacity: parsePositiveNumber(process.env.TIDAL_BUCKET_CAPACITY, 2),
      refillRate: parsePositiveNumber(process.env.TIDAL_BUCKET_REFILL_RATE, 2)
    });
    this.rateLimiterMaxWaitMs = Math.max(0, Number.parseInt(process.env.TIDAL_BUCKET_MAX_WAIT_MS || '60000', 10) || 60000);
    this.circuitBreaker = CircuitBreaker.getOrCreate('tidal-api', {
      threshold: Number.parseInt(process.env.TIDAL_CB_THRESHOLD || '10', 10),
      timeout: Number.parseInt(process.env.TIDAL_CB_TIMEOUT_MS || '300000', 10),
      halfOpenMaxCalls: Number.parseInt(process.env.TIDAL_CB_HALF_OPEN_MAX_CALLS || '3', 10),
      onStateChange: (state, meta) => {
        const payload = { ...meta, state };
        if (state === 'open') {
          logger.error('CIRCUIT_TIDAL', 'Tidal circuit opened', payload);
        } else if (state === 'half_open') {
          logger.warn('CIRCUIT_TIDAL', 'Tidal circuit half-open', payload);
        } else {
          logger.info('CIRCUIT_TIDAL', 'Tidal circuit closed', payload);
        }
      }
    });
  }

  async waitForRateLimitSlot() {
    const now = Date.now();
    const until = this.backoffUntil || 0;
    if (until > now) {
      await this.delay(until - now);
    }
    if (!this.rateLimiter) return;
    const acquired = await this.rateLimiter.acquire(1, this.rateLimiterMaxWaitMs);
    if (!acquired) {
      const error = new Error('Tidal rate limiter timeout');
      error.code = 'TIDAL_RATE_LIMIT_TIMEOUT';
      throw error;
    }
  }

  getCountryCodeCandidates(preferred = null) {
    const primary = normalizeCountryCode(preferred) || this.countryCode;
    const ordered = [primary, ...(this.countryCodeFallbacks || [])];
    return Array.from(new Set(ordered)).filter(Boolean);
  }

  /**
   * Get OAuth access token using client credentials flow
   */
  async getAccessToken() {
    const clientId = process.env.TIDAL_CLIENT_ID;
    const clientSecret = process.env.TIDAL_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      throw new Error('Tidal credentials not configured. Set TIDAL_CLIENT_ID and TIDAL_CLIENT_SECRET environment variables.');
    }
    
    // Check if token exists and is not expired
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry - 60000) {
      return this.accessToken;
    }

    if (this.accessTokenPromise) {
      return this.accessTokenPromise;
    }

    this.accessTokenPromise = (async () => {
      console.log('🌊 Requesting new Tidal access token...');

      const response = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
        },
        body: 'grant_type=client_credentials'
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Tidal auth failed: ${response.status} - ${errorData.error_description || response.statusText}`);
      }

      const data = await response.json();

      this.accessToken = data.access_token;
      this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000; // Subtract 1 minute buffer

      console.log('✅ Tidal access token obtained successfully');
      return this.accessToken;
    })()
      .catch((error) => {
        console.error('❌ Failed to get Tidal access token:', error.message);
        throw error;
      })
      .finally(() => {
        this.accessTokenPromise = null;
      });

    return this.accessTokenPromise;
  }

  /**
   * Make authenticated request to Tidal API
   */
  async makeRequest(endpoint, params = {}) {
    return this.circuitBreaker.execute(async () => {
      const token = await this.getAccessToken();
      const url = new URL(`${this.baseUrl}${endpoint}`);
      
      // Add default parameters
      const allParams = {
        countryCode: this.countryCode,
        ...params
      };
      
      // Add query parameters
      Object.entries(allParams).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          url.searchParams.append(key, value);
        }
      });

      const maxAttempts = 4;
      const retryableStatuses = new Set([429, 503, 504]);
      let lastError = null;
      
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          await this.waitForRateLimitSlot();
          const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
              'User-Agent': 'Flowerpil/1.0.0'
            }
          });
          const rawBody = await response.text();
          let data = {};
          if (rawBody) {
            try {
              data = JSON.parse(rawBody);
            } catch (parseError) {
              data = {};
            }
          }

          if (response.ok) {
            return data;
          }

          const detail = data?.errors?.[0]?.detail || response.statusText;
          const error = new Error(`Tidal API error: ${response.status} - ${detail}`);
          error.status = response.status;
          error.details = data;
          if (rawBody && Object.keys(data).length === 0) {
            error.rawBody = rawBody;
          }
          const retryAfter = response.headers?.get('retry-after');
          if (retryAfter) {
            const retryMs = Number(retryAfter) * 1000;
            if (!Number.isNaN(retryMs) && retryMs > 0) {
              error.retryAfter = retryMs;
            }
          }

          lastError = error;

          if (retryableStatuses.has(error.status) && attempt < maxAttempts) {
            // Use longer backoff for 429s to avoid cascading retries
            const baseWait = error.status === 429 ? 2000 : 500;
            const wait = Math.min(
              30000, // Allow up to 30s backoff for rate limits
              error.retryAfter ?? baseWait * Math.pow(2, attempt - 1)
            );
            this.backoffUntil = Math.max(this.backoffUntil, Date.now() + wait);
            console.warn(`⚠️  Tidal API request throttled (${response.status}). Retrying in ${wait}ms (attempt ${attempt}/${maxAttempts})`);
            await this.delay(wait);
            continue;
          }

          throw error;

        } catch (error) {
          lastError = error;
          if (!retryableStatuses.has(error.status) || !Number.isInteger(error.status) || attempt >= maxAttempts) {
            console.error('❌ Tidal API request failed:', error.message);
            throw error;
          }

          // Use longer backoff for 429s to avoid cascading retries
          const baseWait = error.status === 429 ? 2000 : 500;
          const wait = Math.min(
            30000, // Allow up to 30s backoff for rate limits
            error.retryAfter ?? baseWait * Math.pow(2, attempt - 1)
          );
          this.backoffUntil = Math.max(this.backoffUntil, Date.now() + wait);
          console.warn(`⚠️  Tidal API request failed with retryable status (${error.status}). Waiting ${wait}ms before retry ${attempt + 1}/${maxAttempts}`);
          await this.delay(wait);
        }
      }

      if (lastError) {
        console.error('❌ Tidal API request failed:', lastError.message);
        throw lastError;
      }
    }, { endpoint, params });
  }

  /**
   * Search Tidal by ISRC (primary strategy)
   */
  async searchByISRC(isrc, options = {}) {
    const normalizedIsrc = normalizeIsrc(isrc);
    if (!normalizedIsrc) {
      console.log('⚠️  Skipping Tidal ISRC search: invalid code provided');
      return null;
    }

    const attempts = normalizedIsrc.length === 12 ? [normalizedIsrc] : [normalizedIsrc, normalizedIsrc.padEnd(12, '0').slice(0, 12)];
    const countryCodes = this.getCountryCodeCandidates(options.countryCode);

    for (const candidateIsrc of attempts) {
      for (const countryCode of countryCodes) {
        console.log(`🔍 Searching Tidal by ISRC: ${candidateIsrc} (country ${countryCode})`);

        try {
          const data = await this.makeRequest('/tracks', {
            'filter[isrc]': candidateIsrc,
            include: 'artists,albums',
            countryCode
          });

          if (data.data && Array.isArray(data.data) && data.data.length > 0) {
            const track = data.data[0];
            const artist = this.findIncludedResource(data.included, 'artists', track.relationships?.artists?.data?.[0]?.id);
            const album = this.findIncludedResource(data.included, 'albums', track.relationships?.albums?.data?.[0]?.id);

            const result = {
              id: track.id,
              url: `https://tidal.com/browse/track/${track.id}`,
              title: track.attributes?.title || 'Unknown Title',
              artist: artist?.attributes?.name || 'Unknown Artist',
              confidence: 100,
              source: `isrc|country:${countryCode}`,
              isrc: track.attributes?.isrc,
              album: album?.attributes?.title,
              releaseDate: album?.attributes?.releaseDate,
              duration: track.attributes?.duration,
              countryCode
            };

            console.log(`✅ Tidal ISRC match found: ${result.artist} - ${result.title} (${countryCode})`);
            return result;
          }

          console.log(`❌ No Tidal ISRC match for: ${candidateIsrc} (${countryCode})`);
        } catch (error) {
          console.error(`❌ Tidal ISRC search failed for ${candidateIsrc} (${countryCode}):`, error.message);
          if (error.status === 429) {
            throw error;
          }
        }
      }
    }

    return null;
  }

  /**
   * Search Tidal by metadata (fallback strategy)
   *
   * Uses /searchResults/{query} with include=tracks,artists,albums.
   */
  async searchByMetadata(artist, title, options = {}) {
    if (!artist?.trim() || !title?.trim()) return null;

    const album = options.album || '';
    const durationSeconds = toSeconds(options.durationMs ?? options.duration);
    const target = {
      artist: normalizeString(artist),
      title: normalizeString(title),
      album: normalizeString(album),
      durationSeconds
    };

    const terms = buildSearchTerms({ artist, title, album });
    if (!terms.length) return null;

    const countryCodes = this.getCountryCodeCandidates(options.countryCode);

    for (const countryCode of countryCodes) {
      const candidatesById = new Map();

      for (const term of terms) {
        try {
          await this.delay(this.rateLimitDelay);
          const data = await this.makeRequest(`/searchResults/${encodeURIComponent(term)}`, {
            include: 'tracks,artists,albums',
            countryCode
          });

          const included = Array.isArray(data?.included) ? data.included : [];
          const relatedTrackIds = new Set(
            (data?.data?.relationships?.tracks?.data || [])
              .map(entry => entry?.id)
              .filter(Boolean)
          );

          const tracks = included.filter(item =>
            item.type === 'tracks' && (!relatedTrackIds.size || relatedTrackIds.has(item.id))
          );

          for (const track of tracks) {
            const trackId = track?.id;
            if (!trackId) continue;
            const artistRef = track?.relationships?.artists?.data?.[0]?.id;
            const albumRef = track?.relationships?.albums?.data?.[0]?.id;
            const artistRes = this.findIncludedResource(included, 'artists', artistRef);
            const albumRes = this.findIncludedResource(included, 'albums', albumRef);

            const candidate = {
              id: trackId,
              url: `https://tidal.com/browse/track/${trackId}`,
              title: track.attributes?.title || '',
              artist: artistRes?.attributes?.name || '',
              album: albumRes?.attributes?.title || '',
              isrc: track.attributes?.isrc || null,
              durationSeconds: toSeconds(track.attributes?.duration)
            };

            const { score, breakdown } = scoreMetadataCandidate({ target, candidate });
            const previous = candidatesById.get(trackId);
            if (!previous || score > previous.score) {
              candidatesById.set(trackId, {
                ...candidate,
                score,
                scoreBreakdown: breakdown,
                matchedTerm: term
              });
            }
          }
        } catch (error) {
          console.warn(`⚠️  Tidal metadata search failed for "${term}" (${countryCode}):`, error.message);
          if (error.status === 429) {
            throw error;
          }
        }
      }

      if (!candidatesById.size) {
        continue;
      }

      const best = Array.from(candidatesById.values())
        .sort((a, b) => b.score - a.score)[0];

      if (!best || best.score < this.metadataMatchThreshold) {
        continue;
      }

      return {
        id: best.id,
        url: best.url,
        title: best.title || 'Unknown Title',
        artist: best.artist || 'Unknown Artist',
        album: best.album || null,
        isrc: best.isrc || null,
        duration: best.durationSeconds ?? null,
        confidence: Math.round(best.score),
        source: `metadata:searchResults|country:${countryCode}`,
        matchStrategy: 'metadata',
        scoreBreakdown: best.scoreBreakdown || null,
        countryCode
      };
    }

    return null;
  }


  /**
   * Search Tidal by track (unified interface)
   * Uses ISRC first, then metadata fallback when needed.
   */
  async searchByTrack(track) {
    await this.delay(this.rateLimitDelay);

    try {
      if (track?.isrc) {
        const isrcResult = await this.searchByISRC(track.isrc);
        if (isrcResult) return isrcResult;
      }
      if (track?.artist && track?.title) {
        return await this.searchByMetadata(track.artist, track.title, {
          album: track.album,
          durationMs: track.duration_ms ?? track.durationMs ?? track.duration
        });
      }
      return null;
    } catch (error) {
      if (error.status === 429) {
        throw error;
      }
      return null;
    }
  }

  /**
   * Search for an album by artist and title (for release cross-linking)
   */
  async searchAlbum(artist, title, options = {}) {
    const a = (artist || '').trim();
    const t = (title || '').trim();
    if (!a || !t) return null;

    const countryCodes = this.getCountryCodeCandidates(options.countryCode);
    const searchTerm = `${a} ${t}`;

    for (const countryCode of countryCodes) {
      try {
        await this.delay(this.rateLimitDelay);
        const data = await this.makeRequest(`/searchResults/${encodeURIComponent(searchTerm)}`, {
          include: 'albums,artists',
          countryCode
        });

        const included = Array.isArray(data?.included) ? data.included : [];
        const relatedAlbumIds = new Set(
          (data?.data?.relationships?.albums?.data || [])
            .map(entry => entry?.id)
            .filter(Boolean)
        );

        const albums = included.filter(item =>
          item.type === 'albums' && (!relatedAlbumIds.size || relatedAlbumIds.has(item.id))
        );

        if (!albums.length) continue;

        // Rank by match quality
        const lcA = a.toLowerCase();
        const lcT = t.toLowerCase();
        const ranked = albums
          .map(album => {
            const attrs = album.attributes || {};
            const albumTitle = (attrs.title || '').toLowerCase();
            // Get artist name from relationships
            const artistRef = album?.relationships?.artists?.data?.[0]?.id;
            const artistRes = this.findIncludedResource(included, 'artists', artistRef);
            const artistName = (artistRes?.attributes?.name || '').toLowerCase();
            return {
              album,
              artistName: artistRes?.attributes?.name || '',
              score: (albumTitle.includes(lcT) ? 1 : 0) + (artistName.includes(lcA) ? 1 : 0)
            };
          })
          .sort((x, y) => y.score - x.score);

        const pick = ranked[0];
        if (!pick) continue;

        const attrs = pick.album.attributes || {};
        return {
          id: pick.album.id,
          url: `https://tidal.com/album/${pick.album.id}`,
          title: attrs.title,
          artist: pick.artistName,
          confidence: (pick.score || 0) >= 2 ? 90 : 70,
          source: 'album_search'
        };
      } catch (error) {
        console.warn(`TIDAL album search failed for "${searchTerm}" (${countryCode}):`, error.message);
        if (error.status === 429) {
          throw error;
        }
      }
    }

    return null;
  }

  /**
   * Validate Tidal URL format
   */
  validateTidalUrl(url) {
    return Boolean(this.extractTrackId(url));
  }

  /**
   * Extract track ID from Tidal URL
   */
  extractTrackId(url) {
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
    const trackIndex = segments.findIndex((segment) => segment.toLowerCase() === 'track');
    if (trackIndex === -1) return null;
    const candidate = segments[trackIndex + 1] || '';
    return /^\d+$/.test(candidate) ? candidate : null;
  }

  /**
   * Get track details by ID
   */
  async getTrackById(trackId) {
    try {
      const data = await this.makeRequest(`/tracks/${trackId}`, {
        include: 'artists,albums'
      });
      
      if (data.data) {
        const track = data.data;
        
        // Find artist and album from included resources
        const artist = this.findIncludedResource(data.included, 'artists', track.relationships?.artists?.data?.[0]?.id);
        const album = this.findIncludedResource(data.included, 'albums', track.relationships?.albums?.data?.[0]?.id);
        
        return {
          id: track.id,
          url: `https://tidal.com/browse/track/${track.id}`,
          title: track.attributes?.title || 'Unknown Title',
          artist: artist?.attributes?.name || 'Unknown Artist',
          album: album?.attributes?.title,
          isrc: track.attributes?.isrc,
          duration: track.attributes?.duration,
          releaseDate: album?.attributes?.releaseDate
        };
      }
      
      return null;
      
    } catch (error) {
      console.error(`❌ Failed to get Tidal track ${trackId}:`, error.message);
      throw error;
    }
  }

  /**
   * Helper method to find included resources by type and ID
   * Used for JSON:API relationship resolution
   */
  findIncludedResource(included, type, id) {
    if (!included || !Array.isArray(included) || !id) {
      return null;
    }
    
    return included.find(resource => 
      resource.type === type && resource.id === id
    );
  }

  /**
   * Rate limiting delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Test Tidal API connection
   */
  async testConnection() {
    try {
      console.log('🧪 Testing Tidal API connection...');
      
      // Test by searching for a track with a known ISRC
      const data = await this.makeRequest('/tracks', {
        'filter[isrc]': 'USUM71907597', // Billie Eilish - bad guy
        limit: 1
      });
      
      if (data.data && Array.isArray(data.data) && data.data.length > 0) {
        console.log('✅ Tidal API connection successful');
        return true;
      }
      
      // If no ISRC match, try getting any tracks to test basic connectivity
      const basicTest = await this.makeRequest('/tracks', {
        limit: 1
      });
      
      if (basicTest.data && Array.isArray(basicTest.data)) {
        console.log('✅ Tidal API basic connection successful');
        return true;
      }
      
      throw new Error('Invalid API response format');
      
    } catch (error) {
      console.error('❌ Tidal API connection failed:', error.message);
      return false;
    }
  }

  // PLAYLIST EXPORT METHODS

  /**
   * Generate PKCE code verifier and challenge for OAuth 2.1
   * @returns {Object} Object with code_verifier and code_challenge
   */
  generatePKCEPair() {
    // Generate code verifier (43-128 characters, URL-safe base64)
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    
    // Generate code challenge (SHA256 hash of verifier, URL-safe base64)
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

    return {
      code_verifier: codeVerifier,
      code_challenge: codeChallenge
    };
  }

  /**
   * Generate OAuth authorization URL for user authentication with PKCE
   * @param {string} state - Random state parameter for CSRF protection
   * @returns {Object} Object with auth URL, code verifier, and state
   */
  getAuthURL(state = null, useExportRedirect = false) {
    const clientId = process.env.TIDAL_CLIENT_ID;
    
    if (!clientId) {
      throw new Error('Tidal Client ID not configured');
    }

    // Generate PKCE pair
    const pkceData = this.generatePKCEPair();

    const scopes = [
      'user.read',
      'playlists.read',
      'playlists.write',
      'search.read'
    ].join(' ');

    const authState = state || Math.random().toString(36).substring(7);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      scope: scopes,
      redirect_uri: useExportRedirect ? this.exportRedirectUri : this.redirectUri,
      state: authState,
      code_challenge_method: 'S256',
      code_challenge: pkceData.code_challenge
    });

    return {
      authUrl: `${this.authUrl}?${params.toString()}`,
      codeVerifier: pkceData.code_verifier,
      state: authState
    };
  }

  /**
   * Exchange authorization code for user access token with PKCE
   * @param {string} code - Authorization code from OAuth callback
   * @param {string} codeVerifier - PKCE code verifier
   * @param {boolean} useExportRedirect - Whether to use export redirect URI
   * @returns {Object} Token response with access token
   */
  async getUserAccessToken(code, codeVerifier, useExportRedirect = false) {
    const clientId = process.env.TIDAL_CLIENT_ID;
    const clientSecret = process.env.TIDAL_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      throw new Error('Tidal credentials not configured');
    }

    if (!codeVerifier) {
      throw new Error('PKCE code verifier is required for TIDAL OAuth 2.1');
    }

    const redirectUri = useExportRedirect ? this.exportRedirectUri : this.redirectUri;

    console.log('🌊 TIDAL: Getting user access token with PKCE:', {
      useExportRedirect,
      redirectUri,
      tokenUrl: this.tokenUrl,
      clientId: clientId ? `${clientId.substring(0, 8)}...` : 'missing',
      hasPKCE: !!codeVerifier
    });

    try {
      const response = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier
        }).toString()
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ TIDAL: Token exchange failed:', {
          status: response.status,
          statusText: response.statusText,
          errorData
        });
        throw new Error(`Tidal user token exchange failed: ${response.status} - ${errorData.error_description || response.statusText}`);
      }

      const data = await response.json();
      console.log('✅ Tidal user access token obtained successfully with PKCE');
      return data;
      
    } catch (error) {
      console.error('❌ Failed to get Tidal user access token:', error.message);
      throw error;
    }
  }

  /**
   * Refresh user access token using refresh token
   * @param {string} refreshToken - Refresh token
   * @returns {Object} Token response with new access token
   */
  async refreshAccessToken(refreshToken) {
    const clientId = process.env.TIDAL_CLIENT_ID;
    const clientSecret = process.env.TIDAL_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('Tidal credentials not configured');
    }

    if (!refreshToken) {
      throw new Error('Refresh token is required');
    }

    console.log('🌊 TIDAL: Refreshing access token...');

    try {
      const response = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken
        }).toString()
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ TIDAL: Token refresh failed:', {
          status: response.status,
          statusText: response.statusText,
          errorData
        });

        // Check if refresh token is invalid/revoked
        if (response.status === 400 && errorData.error === 'invalid_grant') {
          throw new Error('REFRESH_TOKEN_INVALID: Refresh token has been revoked or is invalid');
        }

        throw new Error(`Tidal token refresh failed: ${response.status} - ${errorData.error_description || response.statusText}`);
      }

      const data = await response.json();
      console.log('✅ Tidal access token refreshed successfully');

      // Tidal returns a new access token and may return a new refresh token
      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token || refreshToken,
        expires_in: data.expires_in, // Seconds until expiration
        scope: data.scope
      };

    } catch (error) {
      console.error('❌ Failed to refresh Tidal access token:', error.message);
      throw error;
    }
  }

  /**
   * Make authenticated request to Tidal API with user token
   * @param {string} userAccessToken - User's access token
   * @param {string} endpoint - API endpoint
   * @param {string} method - HTTP method
   * @param {Object} data - Request body data
   * @returns {Object} API response
   */
  async makeUserRequest(userAccessToken, endpoint, method = 'GET', data = null, params = null) {
    // Use v2 API for all user operations (consistent with documentation)
    const url = new URL(`${this.baseUrl}${endpoint}`);
    
    // Add default country code for requests (required by TIDAL API)
    url.searchParams.append('countryCode', this.countryCode);
    // Append any provided query params
    if (params && typeof params === 'object') {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && String(value).length > 0) {
          url.searchParams.append(key, String(value));
        }
      }
    }
    
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${userAccessToken}`,
        'Accept': 'application/vnd.api+json',
        'Content-Type': method === 'POST' ? 'application/vnd.api+json' : 'application/json',
        'User-Agent': 'Flowerpil/1.0.0'
      }
    };

    if (data && method === 'POST') {
      options.body = JSON.stringify(data);
    }

    const maxAttempts = 5;
    const retryableStatuses = new Set([429, 503, 504]);
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(url.toString(), options);
        
        if (response.ok) {
          // Handle empty responses (common for successful POST operations like adding tracks)
          const contentLength = response.headers.get('content-length');
          const contentType = response.headers.get('content-type');
          
          if (contentLength === '0' || !contentType || !contentType.includes('json')) {
            // Return empty object for successful operations with no JSON response
            return {};
          }
          
          const responseData = await response.json().catch(error => {
            console.warn('❌ Failed to parse JSON response, returning empty object:', error.message);
            return {};
          });
          return responseData;
        }

        const errorData = await response.json().catch(() => ({}));
        const status = response.status;
        const detail = errorData.errors?.[0]?.detail || errorData.error_description || response.statusText;
        const error = new Error(`Tidal API error: ${status} - ${detail}`);
        error.status = status;
        error.details = errorData;
        const retryAfter = response.headers?.get('retry-after');
        if (retryAfter) {
          const retryMs = Number(retryAfter) * 1000;
          if (!Number.isNaN(retryMs) && retryMs > 0) {
            error.retryAfter = retryMs;
          }
        }

        lastError = error;

        if (retryableStatuses.has(status) && attempt < maxAttempts) {
          // Use longer backoff for 429s to avoid cascading retries
          const baseWait = status === 429 ? 2000 : 500;
          const wait = Math.min(
            30000, // Allow up to 30s backoff for rate limits
            error.retryAfter ?? baseWait * Math.pow(2, attempt - 1)
          );
          console.warn('⚠️  Tidal user API request throttled:', {
            status,
            statusText: response.statusText,
            url: url.toString(),
            method,
            attempt,
            waitMs: wait
          });
          await this.delay(wait);
          continue;
        }

        throw error;
        
      } catch (error) {
        lastError = error;
        if (!retryableStatuses.has(error.status) || attempt >= maxAttempts) {
          console.error('❌ Tidal user API request failed:', error.message);
          throw error;
        }

        // Use longer backoff for 429s to avoid cascading retries
        const baseWait = error.status === 429 ? 2000 : 500;
        const wait = Math.min(
          30000, // Allow up to 30s backoff for rate limits
          error.retryAfter ?? baseWait * Math.pow(2, attempt - 1)
        );
        console.warn(`⚠️  Tidal user API retry ${attempt + 1}/${maxAttempts} after ${wait}ms (status ${error.status})`);
        await this.delay(wait);
      }
    }

    if (lastError) {
      console.error('❌ Tidal user API request failed after retries:', lastError.message);
      throw lastError;
    }
  }

  /**
   * Create a new playlist on Tidal
   * @param {string} userAccessToken - User's access token
   * @param {Object} playlistData - Playlist metadata
   * @returns {Object} Created playlist information
   */
  async createPlaylist(userAccessToken, playlistData) {
    try {
      const attributes = buildTidalPlaylistAttributes(playlistData);
      console.log(`🌊 Creating Tidal playlist: "${attributes.name}"`);
      
      const data = {
        data: {
          type: 'playlists',
          attributes
        }
      };

      const response = await this.makeUserRequest(
        userAccessToken, 
        '/playlists', 
        'POST', 
        data
      );

      if (response.data) {
        const result = {
          id: response.data.id,
          url: `https://tidal.com/browse/playlist/${response.data.id}`,
          name: response.data.attributes.name || response.data.attributes.title
        };

        console.log(`✅ Tidal playlist created: ${result.name} (ID: ${result.id})`);
        return result;
      }

      throw new Error('Invalid response format from Tidal');
      
    } catch (error) {
      console.error('❌ Failed to create Tidal playlist:', error.message);
      throw new Error(`Failed to create Tidal playlist: ${error.message}`);
    }
  }

  /**
   * Add tracks to a Tidal playlist
   * @param {string} userAccessToken - User's access token
   * @param {string} playlistId - Tidal playlist ID
   * @param {Array} tidalIds - Array of Tidal track IDs
   * @returns {void}
   */
  async addTracksToPlaylist(userAccessToken, playlistId, tidalIds) {
    if (!tidalIds || tidalIds.length === 0) {
      return 0;
    }

    try {
      // TIDAL API v2 accepts up to 20 tracks per request
      const BATCH_SIZE = 20;
      const batches = [];
      for (let i = 0; i < tidalIds.length; i += BATCH_SIZE) {
        batches.push(tidalIds.slice(i, i + BATCH_SIZE));
      }

      console.log(`🌊 Adding ${tidalIds.length} tracks to Tidal playlist in ${batches.length} batches`);
      
      for (let i = 0; i < batches.length; i++) {
        const batchIds = batches[i];
        const tracks = batchIds.map(id => ({
          type: 'tracks',
          id: id.toString()
        }));

        const data = { data: tracks };

        console.log(`🌊 Adding batch ${i + 1}/${batches.length} (${tracks.length} tracks)`);

        await this.makeUserRequest(
          userAccessToken,
          `/playlists/${playlistId}/relationships/items`,
          'POST',
          data
        );

        // Add small delay between batches to respect rate limits
        if (i < batches.length - 1) {
          await this.delay(this.rateLimitDelay);
        }
      }

      console.log(`✅ Added ${tidalIds.length} tracks to Tidal playlist in ${batches.length} batches`);
      return tidalIds.length;
      
    } catch (error) {
      console.error('❌ Failed to add tracks to Tidal playlist:', error.message);
      throw new Error(`Failed to add tracks to Tidal playlist: ${error.message}`);
    }
  }

  /**
   * Fetch playlist track IDs for verification/backfill
   * @param {string} userAccessToken
   * @param {string} playlistId
   * @param {object} options
   * @returns {{ ids: string[], total: number }}
   */
  async getPlaylistTrackIds(userAccessToken, playlistId, { limit = 200, maxPages = 10 } = {}) {
    const collected = new Set();
    let total = 0;

    for (let page = 0; page < maxPages; page++) {
      const offset = page * limit;
      const response = await this.makeUserRequest(
        userAccessToken,
        `/playlists/${playlistId}/relationships/items`,
        'GET',
        null,
        {
          limit,
          offset,
          include: 'tracks'
        }
      );

      const data = Array.isArray(response?.data) ? response.data : [];
      const included = Array.isArray(response?.included) ? response.included : [];

      data.forEach((item) => {
        if (item?.type === 'tracks' && item?.id) {
          collected.add(String(item.id));
        }
      });

      included.forEach((item) => {
        if (item?.type === 'tracks' && item?.id) {
          collected.add(String(item.id));
        }
      });

      const pageTotal = data.length;
      total += pageTotal;

      // If we received fewer than the limit, we've reached the end
      if (pageTotal < limit) {
        break;
      }
    }

    return { ids: Array.from(collected), total };
  }

  /**
   * Sync (replace-in-place) an existing TIDAL playlist.
   * Removes all existing items and re-adds, then updates metadata.
   */
  async syncPlaylist(userAccessToken, remotePlaylistId, playlistData, tracks) {
    try {
      // Update playlist metadata (title, description, access type)
      const attributes = buildTidalPlaylistAttributes(playlistData);
      await this.makeUserRequest(
        userAccessToken,
        `/playlists/${remotePlaylistId}`,
        'PATCH',
        {
          data: {
            type: 'playlists',
            id: remotePlaylistId,
            attributes
          }
        }
      );

      // Remove all existing items first
      const existing = await this.getPlaylistTrackIds(userAccessToken, remotePlaylistId);
      if (existing.ids.length > 0) {
        const deleteData = {
          data: existing.ids.map(id => ({ type: 'tracks', id: id.toString() }))
        };
        await this.makeUserRequest(
          userAccessToken,
          `/playlists/${remotePlaylistId}/relationships/items`,
          'DELETE',
          deleteData
        );
      }

      // Filter valid tracks
      const validTracks = tracks.filter(t => {
        if (t.tidal_id && t.tidal_id.trim() !== '') return true;
        if (t.tidal_url && t.tidal_url.trim() !== '') {
          return !!t.tidal_url.match(/\/track\/(\d+)/);
        }
        return false;
      });

      const tidalIds = validTracks.map(t => {
        if (t.tidal_id && t.tidal_id.trim() !== '') return t.tidal_id;
        const match = t.tidal_url.match(/\/track\/(\d+)/);
        return match ? match[1] : null;
      }).filter(Boolean);

      let tracksActuallyAdded = 0;
      if (tidalIds.length > 0) {
        tracksActuallyAdded = await this.addTracksToPlaylist(userAccessToken, remotePlaylistId, tidalIds);
      }

      const playlistUrl = `https://tidal.com/browse/playlist/${remotePlaylistId}`;
      console.log(`[TIDAL_SYNC] Synced playlist ${remotePlaylistId}: ${tracksActuallyAdded} tracks`);

      return {
        platform: 'tidal',
        playlistUrl,
        playlistId: remotePlaylistId,
        playlistName: playlistData.title,
        tracksAdded: tracksActuallyAdded,
        totalTracks: tracks.length,
        coverage: tracks.length > 0 ? tracksActuallyAdded / tracks.length : 0,
        success: true,
        synced: true,
        missingTracks: tracks.filter(t => !t.tidal_id || t.tidal_id.trim() === '').length
      };
    } catch (error) {
      console.error('[TIDAL_SYNC] Sync failed:', error.message);
      throw new Error(`Failed to sync TIDAL playlist: ${error.message}`);
    }
  }

  /**
   * Export complete playlist to Tidal
   * @param {string} userAccessToken - User's access token
   * @param {Object} playlistData - Flowerpil playlist data
   * @param {Array} tracks - Array of track objects
   * @returns {Object} Export result
   */
  async exportPlaylist(userAccessToken, playlistData, tracks) {
    let playlist = null;

    try {
      // Create empty playlist first
      playlist = await this.createPlaylist(userAccessToken, playlistData);
    } catch (error) {
      console.error('❌ Tidal playlist creation failed:', error.message);
      return {
        platform: 'tidal',
        success: false,
        error: error.message,
        tracksAdded: 0,
        totalTracks: tracks.length
      };
    }

    // Filter tracks with tidal_id or extractable tidal_url
    const validTracks = tracks.filter(t => {
      if (t.tidal_id && t.tidal_id.trim() !== '') {
        return true;
      }
      if (t.tidal_url && t.tidal_url.trim() !== '') {
        const match = t.tidal_url.match(/\/track\/(\d+)/);
        return !!match;
      }
      return false;
    });

    let tracksActuallyAdded = 0;
    let trackError = null;

    if (validTracks.length > 0) {
      console.log(`🌊 Adding ${validTracks.length} tracks to Tidal playlist`);
      const tidalIds = validTracks.map(t => {
        if (t.tidal_id && t.tidal_id.trim() !== '') {
          return t.tidal_id;
        } else if (t.tidal_url && t.tidal_url.trim() !== '') {
          const match = t.tidal_url.match(/\/track\/(\d+)/);
          return match ? match[1] : null;
        }
        return null;
      }).filter(id => id !== null);

      try {
        tracksActuallyAdded = await this.addTracksToPlaylist(userAccessToken, playlist.id, tidalIds);
      } catch (error) {
        console.error('❌ Tidal track addition failed:', error.message);
        trackError = error.message;
        // Continue - playlist was created, return URL even if tracks failed
      }
    }

    const result = {
      platform: 'tidal',
      playlistUrl: playlist.url,
      playlistId: playlist.id,
      playlistName: playlist.name,
      tracksAdded: tracksActuallyAdded,
      totalTracks: tracks.length,
      coverage: tracks.length > 0 ? tracksActuallyAdded / tracks.length : 0,
      success: !trackError,
      missingTracks: tracks.filter(t => !t.tidal_id || t.tidal_id.trim() === '').length
    };

    if (trackError) {
      result.error = trackError;
      result.partialSuccess = true; // Playlist created but tracks failed
      console.log(`⚠️ Tidal export partial: playlist created but tracks failed - ${playlist.url}`);
    } else {
      console.log(`✅ Tidal export complete: ${result.tracksAdded}/${result.totalTracks} tracks (${Math.round(result.coverage * 100)}% coverage)`);
    }

    return result;
  }

  /**
   * Validate that user access token has required export scopes
   * @param {string} userAccessToken - User's access token
   * @returns {boolean} Whether token has export permissions
   */
  async validateExportPermissions(userAccessToken) {
    try {
      // Try to make a simple authenticated request to validate token
      const response = await this.makeUserRequest(
        userAccessToken,
        '/users/me',
        'GET'
      );

      return true; // If we got here, token is valid
    } catch (error) {
      if (error.message.includes('401') || error.message.includes('403')) {
        return false; // Token invalid or insufficient permissions
      }
      throw error; // Other errors
    }
  }

  /**
   * Get user's playlists
   * @param {string} userAccessToken - User's access token
   * @param {number} limit - Number of playlists to fetch per page
   * @param {number} offset - Offset for pagination
   * @returns {Object} Playlists response
   */
  async getUserPlaylists(userAccessToken, limit = 50, offset = 0) {
    try {
      console.log('🌊 Fetching TIDAL user playlists...');

      // First, get the user's ID (required for filter[owners.id])
      const userInfo = await this.makeUserRequest(
        userAccessToken,
        '/users/me',
        'GET'
      );

      const userId = userInfo?.data?.id;
      if (!userId) {
        throw new Error('Could not retrieve user ID from TIDAL');
      }

      console.log(`🌊 Fetching playlists for TIDAL user: ${userId}`);

      // Fetch playlists filtered by owner (the authenticated user)
      const response = await this.makeUserRequest(
        userAccessToken,
        '/playlists',
        'GET',
        null,
        {
          limit,
          offset,
          'filter[owners.id]': userId
        }
      );

      console.log(`✅ Fetched ${response?.data?.length || 0} TIDAL playlists`);
      return response;

    } catch (error) {
      console.error('❌ Failed to fetch TIDAL user playlists:', error.message);
      throw error;
    }
  }
}

// Export singleton instance and search function
const tidalService = new TidalService();

export const searchTidalByTrack = (track) => tidalService.searchByTrack(track);
export const searchTidalByISRC = (isrc) => tidalService.searchByISRC(isrc);
export const searchTidalByMetadata = (artist, title) => tidalService.searchByMetadata(artist, title);
export const testTidalConnection = () => tidalService.testConnection();
export const validateTidalUrl = (url) => tidalService.validateTidalUrl(url);
export const getTidalTrackById = (trackId) => tidalService.getTrackById(trackId);
export const getTidalPlaylistTrackIds = (userAccessToken, playlistId, options) =>
  tidalService.getPlaylistTrackIds(userAccessToken, playlistId, options);

export default tidalService;
export {
  TidalService,
  buildTidalPlaylistAttributes,
  buildTidalPlaylistDescription,
  TIDAL_PLAYLIST_DESCRIPTION_MAX_LENGTH,
  TIDAL_PLAYLIST_EXPORT_SUFFIX
};
