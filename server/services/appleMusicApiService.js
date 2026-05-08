import axios from 'axios';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import { isAbsolute, join, dirname as pathDirname } from 'path';
import { fileURLToPath } from 'url';
import {
  DEFAULT_THRESHOLD,
  DEFAULT_WEIGHTS,
  createScoringContext,
  scoreAppleCandidate,
  isCompilationCandidate,
  matchesPreferredAlbum,
  normalizeIsrc,
  coerceDurationMs
} from './apple-music/scoring.js';
import logger from '../utils/logger.js';
import CircuitBreaker from '../utils/CircuitBreaker.js';
import {
  resolveStorefront,
  resolveStorefrontWithFallbacks,
  getStorefrontPriority
} from '../utils/appleStorefront.js';

const CONFIDENCE_THRESHOLD = DEFAULT_THRESHOLD;
const SECONDARY_THRESHOLD = 60;
const MAX_METADATA_RESULTS = 25;
const MAX_ALBUM_LOOKUPS = 7;
const MAX_ALBUM_TRACKS = 100;
const COMPILATION_OVERRIDE_DELTA = 8;
const METADATA_FALLBACK_RATIO = 0.9;
const METADATA_FALLBACK_MIN_SCORE = 50;

const getMetadataFallbackMatch = (candidate, context, weights) => {
  if (!candidate || !context || !weights) {
    return { ok: false, score: 0, max: 0, ratio: 0 };
  }

  const breakdown = candidate.scoreBreakdown || {};
  const score = (breakdown.title || 0)
    + (breakdown.artist || 0)
    + (breakdown.album || 0)
    + (breakdown.duration || 0);

  const max = (context.titleVariants?.length ? weights.title : 0)
    + (context.artistVariants?.length ? weights.artist : 0)
    + (context.albumVariants?.length ? weights.album : 0)
    + (Number.isFinite(context.durationMs) ? weights.duration : 0);

  const ratio = max > 0 ? score / max : 0;

  return {
    ok: max >= METADATA_FALLBACK_MIN_SCORE && ratio >= METADATA_FALLBACK_RATIO,
    score,
    max,
    ratio
  };
};

/**
 * Apple Music API Service
 * - Mints Developer Tokens (ES256)
 * - Uses Music User Token (MUT) for user/library operations
 * - Minimal export implementation: create library playlist and add tracks with catalog song IDs
 *
 * Notes:
 * - Catalog/search endpoints require Developer Token in Authorization
 * - User endpoints also require Music-User-Token header
 */
class AppleMusicApiService {
  constructor() {
    this.baseURL = 'https://api.music.apple.com';
    this.circuitBreaker = CircuitBreaker.getOrCreate('apple-music-api', {
      threshold: Number.parseInt(process.env.APPLE_CB_THRESHOLD || '10', 10),
      timeout: Number.parseInt(process.env.APPLE_CB_TIMEOUT_MS || '300000', 10),
      halfOpenMaxCalls: Number.parseInt(process.env.APPLE_CB_HALF_OPEN_MAX_CALLS || '3', 10),
      onStateChange: (state, meta) => {
        const payload = { ...meta, state };
        if (state === 'open') {
          logger.error('CIRCUIT_APPLE', 'Apple Music circuit opened', payload);
        } else if (state === 'half_open') {
          logger.warn('CIRCUIT_APPLE', 'Apple Music circuit half-open', payload);
        } else {
          logger.info('CIRCUIT_APPLE', 'Apple Music circuit closed', payload);
        }
      }
    });
  }

  extractPlaylistIdFromUrl(url) {
    if (!url || typeof url !== 'string') return null;
    try {
      const parsed = new URL(url.trim());
      const segments = parsed.pathname.split('/').filter(Boolean);
      const last = segments.pop();
      return last ? decodeURIComponent(last) : null;
    } catch (_) {
      const match = String(url).match(/\/(?:playlist|library\/playlist)\/([^/?#]+)/i);
      if (match && match[1]) {
        try {
          return decodeURIComponent(match[1]);
        } catch {
          return match[1];
        }
      }
      return null;
    }
  }

  isLibraryPlaylistId(id) {
    return typeof id === 'string' && /^p\./i.test(id);
  }

  isCatalogPlaylistId(id) {
    return typeof id === 'string' && /^pl\./i.test(id);
  }

  isShareUrl(url) {
    const id = this.extractPlaylistIdFromUrl(url);
    return this.isCatalogPlaylistId(id);
  }

  isLibraryUrl(url) {
    const id = this.extractPlaylistIdFromUrl(url);
    return this.isLibraryPlaylistId(id);
  }

  normalizeMetadataValue(value) {
    if (!value || typeof value !== 'string') return '';
    const normalized = value.normalize?.('NFKD') || value;
    return normalized
      .toLowerCase()
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s&-]/g, ' ')
      .replace(/\b(?:feat\.?|featuring|ft\.?)(.+)$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  stripTitleVersion(title) {
    if (!title || typeof title !== 'string') return '';
    return title
      .replace(/\s*\([^)]*\)/g, '')
      .replace(/\s*\[[^\]]*\]/g, '')
      .replace(/\s+-\s+(?:live|remaster(?:ed)?|demo|version|edit|mix).*$/i, '')
      .trim();
  }

  normalizeStorefront(storefront) {
    return resolveStorefront(storefront);
  }

  buildSearchAttempts({ artist, title, album }, tidalGuidance = {}) {
    const attempts = [];
    const seen = new Set();
    const push = (term, label, viaGuidance = false) => {
      if (!term) return;
      const normalized = term.toLowerCase();
      if (seen.has(normalized)) return;
      seen.add(normalized);
      attempts.push({ term, label, viaGuidance });
    };

    const safeArtist = artist || '';
    const safeTitle = title || '';
    const safeAlbum = album || '';

    const combined = [safeArtist, safeTitle, safeAlbum].filter(Boolean).join(' ').trim();
    push(combined, 'combined');

    const tidalAlbum = tidalGuidance?.album || '';
    const tidalTitle = tidalGuidance?.title || '';

    if (tidalAlbum) {
      const combinedTidal = [safeArtist, safeTitle, tidalAlbum].filter(Boolean).join(' ').trim();
      push(combinedTidal, 'combined_tidal', true);
    }

    const base = [safeArtist, safeTitle].filter(Boolean).join(' ').trim();
    push(base, 'base');

    const strippedTitle = this.stripTitleVersion(safeTitle);
    if (strippedTitle && strippedTitle !== safeTitle) {
      const strippedTerm = [safeArtist, strippedTitle, safeAlbum].filter(Boolean).join(' ').trim();
      push(strippedTerm, 'stripped');
    }

    if (tidalTitle && tidalTitle !== safeTitle) {
      const tidalTitleTerm = [safeArtist, tidalTitle, tidalAlbum || safeAlbum].filter(Boolean).join(' ').trim();
      push(tidalTitleTerm, 'tidal_title', true);
    }

    if (tidalAlbum && tidalAlbum !== safeAlbum) {
      const tidalAlbumTerm = [safeArtist, safeTitle, tidalAlbum].filter(Boolean).join(' ').trim();
      push(tidalAlbumTerm, 'tidal_album', true);
    }

    if (safeAlbum) {
      const albumFocused = [safeTitle, safeAlbum, safeArtist].filter(Boolean).join(' ').trim();
      push(albumFocused, 'album_focus');
    }

    return attempts;
  }

  createCandidateFromSong({ song, attempt, context, weights }) {
    const attrs = song?.attributes || {};
    if (!attrs?.url) return null;

    const candidate = {
      id: song.id,
      url: attrs.url || null,
      artist: attrs.artistName || null,
      title: attrs.name || null,
      album: attrs.albumName || null,
      isrc: attrs.isrc || null,
      durationMs: attrs.durationInMillis,
      attributes: attrs,
      matchStrategy: attempt?.label || 'metadata',
      viaGuidance: Boolean(attempt?.viaGuidance),
      searchTerm: attempt?.term || null
    };

    const scoring = scoreAppleCandidate(context, candidate, { weights });
    candidate.score = scoring.score;
    candidate.confidence = scoring.score;
    candidate.scoreBreakdown = scoring.breakdown;
    candidate.matchFactors = scoring.factors;
    candidate.matchedPreferredAlbum = scoring.matchedPreferredAlbum;
    candidate.source = candidate.viaGuidance ? 'api:metadata:tidal' : 'api:metadata';

    return candidate;
  }

  normalizeShareSlug(title) {
    const base = String(title || 'playlist');
    const normalized = base.normalize?.('NFKD') || base;
    const withoutMarks = Array.from(normalized).filter((ch) => {
      const code = ch.codePointAt(0);
      return code < 0x0300 || code > 0x036F;
    }).join('');
    const stripped = withoutMarks.replace(/[^a-zA-Z0-9\s-]/g, '');
    const compact = stripped.trim().replace(/\s+/g, '-').replace(/-+/g, '-');
    return compact ? compact.toLowerCase() : 'playlist';
  }

  buildShareUrlFromGlobalId(storefront, globalId, title) {
    if (!globalId) return null;
    const region = resolveStorefront(storefront);
    if (this.isLibraryPlaylistId(globalId)) return null;
    if (!this.isCatalogPlaylistId(globalId)) return null;
    const slug = this.normalizeShareSlug(title);
    return `https://music.apple.com/${encodeURIComponent(region)}/playlist/${encodeURIComponent(slug)}/${encodeURIComponent(globalId)}`;
  }

  extractShareUrl(attrs = {}) {
    const direct = attrs?.url || attrs?.shareUrl || attrs?.shareURL || attrs?.webUrl;
    if (this.isShareUrl(direct)) return direct;
    const playParams = attrs?.playParams || {};
    const fromParams = playParams.shareUrl || playParams.shareURL || playParams.webUrl;
    if (this.isShareUrl(fromParams)) return fromParams;
    return null;
  }

  async resolveCatalogShareViaRelationship({ musicUserToken, libraryPlaylistId, storefront, fallbackTitle }) {
    if (!libraryPlaylistId) return null;
    const region = resolveStorefront(storefront);
    try {
      const rel = await this.apiRequest({
        method: 'get',
        url: `/v1/me/library/playlists/${encodeURIComponent(libraryPlaylistId)}/catalog`,
        musicUserToken,
        timeout: 8000
      });
      const catalogItem = rel?.data?.[0];
      const attrs = catalogItem?.attributes || {};
      const direct = this.extractShareUrl(attrs);
      if (direct) return direct;
      const catPlayParams = attrs?.playParams || {};
      const globalId = catalogItem?.id || catPlayParams.catalogId || catPlayParams.id || null;
      if (globalId) {
        return this.buildShareUrlFromGlobalId(region, globalId, attrs?.name || fallbackTitle);
      }
    } catch (_) {}
    return null;
  }

  async getCatalogPlaylistShareUrl(globalId, storefront, fallbackTitle) {
    if (!globalId) return null;
    const region = resolveStorefront(storefront);
    try {
      const cat = await this.apiRequest({
        method: 'get',
        url: `/v1/catalog/${encodeURIComponent(region)}/playlists/${encodeURIComponent(globalId)}`,
        timeout: 8000
      });
      const item = cat?.data?.[0];
      const attrs = item?.attributes || {};
      const direct = this.extractShareUrl(attrs);
      if (direct) return direct;
      return this.buildShareUrlFromGlobalId(region, globalId, attrs?.name || fallbackTitle);
    } catch (_) {}
    return null;
  }

  getConfig() {
    return {
      teamId: process.env.APPLE_MUSIC_TEAM_ID || '',
      keyId: process.env.APPLE_MUSIC_KEY_ID || '',
      privateKey: process.env.APPLE_MUSIC_PRIVATE_KEY || process.env.APPLE_MUSIC_KEY || '',
      privateKeyPath: process.env.APPLE_MUSIC_PRIVATE_KEY_PATH || process.env.APPLE_MUSIC_KEY_PATH || '',
      tokenTTLMin: parseInt(process.env.APPLE_MUSIC_TOKEN_TTL_MIN || '30', 10)
    };
  }

  getPrivateKeyPEM() {
    const { privateKey, privateKeyPath } = this.getConfig();
    if (privateKey && privateKey.includes('BEGIN')) {
      return privateKey.replace(/\\n/g, '\n');
    }
    if (privateKeyPath) {
      const attempts = [];
      const serverDir = pathDirname(fileURLToPath(import.meta.url)); // server/services
      const projectRoot = join(serverDir, '..', '..');
      const pathsToTry = [
        privateKeyPath,
        !isAbsolute(privateKeyPath) ? join(process.cwd(), privateKeyPath) : null,
        !isAbsolute(privateKeyPath) ? join(projectRoot, privateKeyPath) : null
      ].filter(Boolean);

      for (const p of pathsToTry) {
        try {
          const content = fs.readFileSync(p, 'utf8');
          if (content && content.includes('BEGIN')) return content;
        } catch (e) {
          attempts.push(p);
        }
      }
      logger.error('APPLE_MUSIC', 'Private key not found at configured paths', { paths: attempts });
      throw new Error('Apple Music private key not configured. Please check server configuration.');
    }
    throw new Error('Apple Music private key not configured');
  }

  getDeveloperToken() {
    const { teamId, keyId, tokenTTLMin } = this.getConfig();
    if (!teamId || !keyId) {
      throw new Error('Apple Music TEAM_ID or KEY_ID missing');
    }
    const privateKey = this.getPrivateKeyPEM();
    const now = Math.floor(Date.now() / 1000);
    const exp = now + (tokenTTLMin * 60);

    const token = jwt.sign(
      {
        iss: teamId,
        iat: now,
        exp
      },
      privateKey,
      {
        algorithm: 'ES256',
        header: { kid: keyId }
      }
    );

    return { token, expiresAt: new Date(exp * 1000).toISOString() };
  }

  async apiRequest({ method, url, params, data, musicUserToken, timeout, returnFullResponse = false }) {
    const { token } = this.getDeveloperToken();
    const headers = {
      Authorization: `Bearer ${token}`
    };
    if (musicUserToken) headers['Music-User-Token'] = musicUserToken;

    const requestTimeout = typeof timeout === 'number'
      ? timeout
      : parseInt(process.env.APPLE_MUSIC_HTTP_TIMEOUT_MS || '15000', 10);

    const response = await this.circuitBreaker.execute(
      () => axios({
        method,
        url: `${this.baseURL}${url}`,
        params,
        data,
        headers,
        timeout: Number.isFinite(requestTimeout) && requestTimeout > 0 ? requestTimeout : undefined
      }),
      { method, url }
    );
    return returnFullResponse ? response : response.data;
  }

  async searchCatalogTrack({
    track,
    storefront = null,
    tidalGuidance = null,
    weights = DEFAULT_WEIGHTS,
    threshold = CONFIDENCE_THRESHOLD,
    includeIsrcSearch = true,
    tryMultipleStorefronts = true
  } = {}) {
    if (!track || !track.artist || !track.title) {
      return null;
    }

    const primaryRegion = this.normalizeStorefront(storefront);
    const baseTrack = {
      artist: track.artist || '',
      title: track.title || '',
      album: track.album || '',
      isrc: track.isrc || null,
      durationMs: coerceDurationMs(track.durationMs ?? track.duration_ms ?? track.duration)
    };

    const context = createScoringContext(baseTrack, { tidal: tidalGuidance });

    // Try primary storefront first
    const primaryResult = await this._searchSingleStorefront({
      context,
      region: primaryRegion,
      baseTrack,
      tidalGuidance,
      weights,
      threshold,
      includeIsrcSearch
    });

    if (primaryResult && (primaryResult.score ?? 0) >= threshold) {
      return primaryResult;
    }

    // If multi-storefront fallback is enabled and we didn't find a good match, try other regions
    if (tryMultipleStorefronts && (!primaryResult || (primaryResult.score ?? 0) < threshold)) {
      const storefrontPriority = getStorefrontPriority();
      const alternativeStorefronts = storefrontPriority.filter(sf => sf !== primaryRegion);

      logger.debug('APPLE_LINK', 'Trying alternative storefronts for better match', {
        track: `${baseTrack.artist} - ${baseTrack.title}`,
        primaryStorefront: primaryRegion,
        primaryScore: primaryResult?.score ?? null,
        alternativeStorefronts
      });

      for (const altRegion of alternativeStorefronts) {
        try {
          const altResult = await this._searchSingleStorefront({
            context,
            region: altRegion,
            baseTrack,
            tidalGuidance,
            weights,
            threshold,
            includeIsrcSearch
          });

          if (altResult && (altResult.score ?? 0) >= threshold) {
            logger.info('APPLE_LINK', 'Found better match in alternative storefront', {
              track: `${baseTrack.artist} - ${baseTrack.title}`,
              primaryStorefront: primaryRegion,
              selectedStorefront: altRegion,
              primaryScore: primaryResult?.score ?? null,
              selectedScore: altResult.score
            });
            return altResult;
          }

          // Keep track of best result even if below threshold
          if (altResult && (!primaryResult || (altResult.score ?? 0) > (primaryResult.score ?? 0))) {
            primaryResult = altResult;
          }
        } catch (error) {
          logger.debug('APPLE_LINK', 'Alternative storefront search failed', {
            storefront: altRegion,
            error: error.message
          });
        }
      }
    }

    return primaryResult;
  }

  async _searchSingleStorefront({
    context,
    region,
    baseTrack,
    tidalGuidance,
    weights,
    threshold,
    includeIsrcSearch
  }) {
    const candidateById = new Map();
    const addCandidate = (candidate) => {
      if (!candidate || !candidate.id || !candidate.url) return;
      const normalizedCandidate = {
        ...candidate,
        storefront: candidate.storefront || region
      };
      const prior = candidateById.get(normalizedCandidate.id);
      if (!prior || (normalizedCandidate.score ?? 0) > (prior.score ?? 0)) {
        candidateById.set(normalizedCandidate.id, normalizedCandidate);
      }
    };

    const attempts = this.buildSearchAttempts(baseTrack, tidalGuidance || {});
    for (const attempt of attempts) {
      try {
        const params = { term: attempt.term, types: 'songs', limit: MAX_METADATA_RESULTS };
        const data = await this.apiRequest({ method: 'get', url: `/v1/catalog/${encodeURIComponent(region)}/search`, params });
        const results = data?.results?.songs?.data || [];
        for (const song of results) {
          const candidate = this.createCandidateFromSong({ song, attempt, context, weights });
          addCandidate(candidate);
        }
      } catch (error) {
        logger.debug('APPLE_LINK', 'Metadata search attempt failed', {
          storefront: region,
          term: attempt.term,
          label: attempt.label,
          reason: error.message
        });
      }
    }

    let isrcCandidate = null;
    if (includeIsrcSearch && context.isrc) {
      try {
        const viaIsrc = await this.searchCatalogByISRC(context.isrc, region);
        if (viaIsrc && viaIsrc.id) {
          const scored = {
            ...viaIsrc,
            score: 100,
            confidence: 100,
            matchStrategy: 'isrc',
            source: 'api:isrc',
            storefront: region
          };
          addCandidate(scored);
          isrcCandidate = scored;
        }
      } catch (error) {
        logger.debug('APPLE_LINK', 'ISRC lookup failed', {
          storefront: region,
          isrc: context.isrc,
          reason: error.message
        });
      }
    }

    const candidates = Array.from(candidateById.values()).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    let bestCandidate = candidates[0] || null;

    if (isrcCandidate && (!bestCandidate || (isrcCandidate.score ?? 0) >= (bestCandidate.score ?? 0))) {
      bestCandidate = isrcCandidate;
    }

    if (bestCandidate && bestCandidate.matchStrategy !== 'isrc' && isCompilationCandidate(bestCandidate)) {
      const overrideCandidate = candidates.find((candidate) => candidate !== bestCandidate
        && !isCompilationCandidate(candidate)
        && matchesPreferredAlbum(context, candidate)
        && (candidate.score ?? 0) >= threshold);
      if (overrideCandidate && ((bestCandidate.score ?? 0) - (overrideCandidate.score ?? 0) <= COMPILATION_OVERRIDE_DELTA)) {
        const overrideSourceBase = overrideCandidate.source || (overrideCandidate.viaGuidance ? 'api:metadata:tidal' : 'api:metadata');
        const overrideSource = overrideSourceBase.includes(':album_override')
          ? overrideSourceBase
          : `${overrideSourceBase}:album_override`;
        logger.info('APPLE_LINK', 'Compilation result overridden by album-aligned metadata match', {
          storefront: region,
          track: baseTrack.title,
          artist: baseTrack.artist,
          chosenId: overrideCandidate.id,
          previousId: bestCandidate.id,
          bestScore: bestCandidate.score,
          overrideScore: overrideCandidate.score,
          viaGuidance: overrideCandidate.viaGuidance
        });
        bestCandidate = {
          ...overrideCandidate,
          source: overrideSource,
          matchStrategy: `${overrideCandidate.matchStrategy}:album_override`
        };
      }
    }

    let albumFallback = null;
    let fallbackReason = null;
    if (!bestCandidate) {
      fallbackReason = 'no_metadata_match';
    } else if (bestCandidate.matchStrategy !== 'isrc' && (bestCandidate.score ?? 0) < threshold) {
      fallbackReason = 'low_confidence';
    } else if (bestCandidate.matchStrategy !== 'isrc' && isCompilationCandidate(bestCandidate)) {
      fallbackReason = 'compilation';
    }

    if (fallbackReason) {
      logger.debug('APPLE_LINK', 'Invoking Apple album rescue fallback', {
        storefront: region,
        reason: fallbackReason,
        trackTitle: baseTrack.title,
        trackArtist: baseTrack.artist,
        trackAlbum: baseTrack.album || null,
        bestCandidateId: bestCandidate?.id || null,
        bestScore: bestCandidate?.score ?? null
      });

      albumFallback = await this.searchCatalogAlbumForTrack({
        storefront: region,
        track: baseTrack,
        context,
        tidalGuidance,
        weights,
        threshold: Math.max(SECONDARY_THRESHOLD, threshold - 5),
        reason: fallbackReason
      });

      if (albumFallback) {
        const albumIsBetter = !bestCandidate
          || (albumFallback.score ?? 0) > (bestCandidate.score ?? 0)
          || (fallbackReason === 'compilation' && (albumFallback.score ?? 0) >= threshold
            && ((bestCandidate.score ?? 0) - (albumFallback.score ?? 0) <= COMPILATION_OVERRIDE_DELTA));
        if (albumIsBetter) {
          logger.info('APPLE_LINK', 'Album rescue fallback selected Apple match', {
            storefront: region,
            reason: fallbackReason,
            chosenId: albumFallback.id,
            chosenScore: albumFallback.score,
            chosenAlbum: albumFallback.album,
            previousId: bestCandidate?.id || null,
            previousScore: bestCandidate?.score ?? null
          });
          bestCandidate = albumFallback;
        }
      } else {
        logger.debug('APPLE_LINK', 'Album rescue fallback returned no viable candidate', {
          storefront: region,
          reason: fallbackReason,
          trackTitle: baseTrack.title,
          trackArtist: baseTrack.artist
        });
      }
    }

    if (!bestCandidate) {
      return null;
    }

    const finalScore = bestCandidate.score ?? bestCandidate.confidence ?? 0;
    const metadataFallback = getMetadataFallbackMatch(bestCandidate, context, weights);
    if (bestCandidate.matchStrategy !== 'isrc' && finalScore < threshold && !metadataFallback.ok) {
      return null;
    }

    if (bestCandidate.matchStrategy !== 'isrc' && finalScore < threshold && metadataFallback.ok) {
      logger.debug('APPLE_LINK', 'Accepting metadata-only match below primary threshold', {
        storefront: region,
        track: baseTrack.title,
        artist: baseTrack.artist,
        score: finalScore,
        metadataScore: Math.round(metadataFallback.score),
        metadataMax: Math.round(metadataFallback.max),
        metadataRatio: Number(metadataFallback.ratio.toFixed(2))
      });
    }

    const normalizedIsrc = normalizeIsrc(bestCandidate.isrc || bestCandidate.attributes?.isrc || context.isrc);
    const finalSource = (() => {
      if (bestCandidate.source) return bestCandidate.source;
      if (bestCandidate.matchStrategy === 'isrc') return 'api:isrc';
      return bestCandidate.viaGuidance ? 'api:metadata:tidal' : 'api:metadata';
    })();

    return {
      id: bestCandidate.id,
      url: bestCandidate.url,
      artist: bestCandidate.artist,
      title: bestCandidate.title,
      album: bestCandidate.album,
      isrc: normalizedIsrc,
      durationMs: bestCandidate.durationMs ?? null,
      confidence: Math.round(finalScore),
      scoreBreakdown: bestCandidate.scoreBreakdown || null,
      matchFactors: bestCandidate.matchFactors || null,
      matchedPreferredAlbum: bestCandidate.matchedPreferredAlbum || matchesPreferredAlbum(context, bestCandidate),
      source: finalSource,
      matchStrategy: bestCandidate.matchStrategy || 'metadata',
      viaGuidance: bestCandidate.viaGuidance || false,
      storefront: bestCandidate.storefront || region,
      rescueReason: bestCandidate.rescueReason || null
    };
  }

  // Catalog: search song by ISRC (no Music-User-Token required)
  async searchCatalogByISRC(isrc, storefront = null) {
    if (!isrc || String(isrc).trim() === '') return null;
    const region = this.normalizeStorefront(storefront);
    const params = { 'filter[isrc]': String(isrc).trim(), limit: 1 };
    const data = await this.apiRequest({ method: 'get', url: `/v1/catalog/${encodeURIComponent(region)}/songs`, params });
    const song = data?.data?.[0];
    if (!song) return null;
    const attrs = song.attributes || {};
    const normalizedIsrc = normalizeIsrc(attrs.isrc || isrc);
    return {
      id: song.id,
      url: attrs.url || null,
      artist: attrs.artistName || null,
      title: attrs.name || null,
      album: attrs.albumName || null,
      isrc: normalizedIsrc,
      durationMs: attrs.durationInMillis ?? null,
      source: 'api:isrc',
      confidence: 100,
      matchStrategy: 'isrc',
      scoreBreakdown: {
        isrc: 100,
        title: 0,
        album: 0,
        artist: 0,
        duration: 0
      },
      matchFactors: {
        isrc: 1,
        title: 0,
        album: 0,
        artist: 0,
        duration: 0
      },
      matchedPreferredAlbum: false,
      viaGuidance: false,
      storefront: region
    };
  }

  // Catalog: search by metadata (artist + title)
  async searchCatalogByMetadata({ artist, title, album, storefront = null, isrc, durationMs, tidalGuidance } = {}) {
    if (!artist || !title) return null;
    const track = {
      artist,
      title,
      album: album || '',
      isrc: isrc || null,
      durationMs: durationMs || null
    };
    return this.searchCatalogTrack({
      track,
      storefront,
      tidalGuidance,
      weights: DEFAULT_WEIGHTS,
      threshold: CONFIDENCE_THRESHOLD,
      includeIsrcSearch: false
    });
  }

  async searchCatalogAlbumForTrack({
    storefront = null,
    track = {},
    context,
    tidalGuidance,
    weights = DEFAULT_WEIGHTS,
    threshold = SECONDARY_THRESHOLD,
    reason = 'fallback'
  } = {}) {
    const region = this.normalizeStorefront(storefront);
    const artist = track.artist || context?.artist || '';
    const albumHint = track.album || context?.album || tidalGuidance?.album || context?.guidance?.tidal?.album || '';
    const searchTerm = [artist, albumHint].filter(Boolean).join(' ').trim();
    if (!searchTerm) return null;

    try {
      const searchParams = { term: searchTerm, types: 'albums', limit: MAX_ALBUM_LOOKUPS };
      const data = await this.apiRequest({ method: 'get', url: `/v1/catalog/${encodeURIComponent(region)}/search`, params: searchParams });
      const albums = data?.results?.albums?.data || [];
      if (!albums.length) return null;

      let best = null;

      for (const albumItem of albums.slice(0, MAX_ALBUM_LOOKUPS)) {
        const albumId = albumItem?.id;
        if (!albumId) continue;

        let tracksResponse;
        try {
          tracksResponse = await this.apiRequest({
            method: 'get',
            url: `/v1/catalog/${encodeURIComponent(region)}/albums/${encodeURIComponent(albumId)}/tracks`,
            params: { limit: MAX_ALBUM_TRACKS }
          });
        } catch (error) {
          logger.warn('APPLE_LINK', 'Album track fetch failed during rescue', {
            storefront: region,
            albumId,
            reason: error.message
          });
          continue;
        }

        const tracks = tracksResponse?.data || [];
        const albumName = albumItem?.attributes?.name || albumHint || '';

        for (const song of tracks) {
          const candidate = this.createCandidateFromSong({
            song,
            attempt: {
              term: `${albumName} ${context?.title || track.title || ''}`.trim(),
              label: 'album_rescue',
              viaGuidance: Boolean(tidalGuidance?.album)
            },
            context,
            weights
          });
          if (!candidate) continue;

          const candidateScore = candidate.score ?? candidate.confidence ?? 0;
          const enrichedCandidate = {
            ...candidate,
            score: candidateScore,
            confidence: candidateScore,
            matchStrategy: 'album_rescue',
            source: 'api:album-track:rescue',
            storefront: region,
            rescueReason: reason,
            album: candidate.album || albumName,
            albumId,
            albumUrl: albumItem?.attributes?.url || null
          };

          const bestScore = best?.score ?? 0;
          const preferCurrent = candidateScore > bestScore
            || (candidateScore === bestScore && enrichedCandidate.matchedPreferredAlbum && !best?.matchedPreferredAlbum);

          if (preferCurrent) {
            best = enrichedCandidate;
          }
        }
      }

      if (best && (best.score ?? 0) >= threshold) {
        return best;
      }
    } catch (error) {
      logger.warn('APPLE_LINK', 'Album rescue lookup failed', {
        storefront: region,
        reason: error.message,
        trackArtist: artist,
        trackAlbum: albumHint || null
      });
    }

    return null;
  }

  async getUserStorefront(musicUserToken) {
    const fallbacks = getStorefrontPriority();
    try {
      const data = await this.apiRequest({ method: 'get', url: '/v1/me/storefront', musicUserToken });
      const storefront = data?.data?.[0]?.id;
      return resolveStorefrontWithFallbacks(storefront, fallbacks);
    } catch (e) {
      return resolveStorefrontWithFallbacks(null, fallbacks);
    }
  }

  async searchLibraryPlaylistShareUrl(musicUserToken, title, { storefront = null, attempts = 1 } = {}) {
    if (!title) return null;
    const term = String(title).trim();
    for (let i = 0; i < attempts; i++) {
      try {
        const data = await this.apiRequest({ method: 'get', url: `/v1/me/library/search`, params: { term, types: 'playlists', limit: 5 }, musicUserToken });
        const results = data?.results || {};
        const playlists = (results.playlists?.data) || (results['library-playlists']?.data) || [];
        for (const pl of playlists) {
          const attrs = pl?.attributes || {};
          const url = attrs.url || null;
          if (this.isShareUrl(url)) {
            return url;
          }
        }
      } catch (_) {}
      await new Promise(r => setTimeout(r, 1500));
    }
    return null;
  }

  async createPlaylist(musicUserToken, { title, description, isPublic }) {
    // Strip HTML tags from rich text editor output
    const cleanDescription = (description || '')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/p>\s*<p[^>]*>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const payload = {
      attributes: {
        name: title,
        description: cleanDescription
      }
    };
    const data = await this.apiRequest({ method: 'post', url: '/v1/me/library/playlists', data: payload, musicUserToken, timeout: 20000 });
    const pl = data?.data?.[0];

    const attrs = pl?.attributes || {};
    const playlistUrl = this.isShareUrl(attrs.url) ? attrs.url : null;

    return {
      id: pl?.id,
      name: pl?.attributes?.name || title,
      url: playlistUrl
    };
  }

  // Try to resolve a public/shareable Apple Music playlist URL for a library playlist
  async resolvePlaylistShareUrl(musicUserToken, libraryPlaylistId, title = 'playlist') {
    if (!libraryPlaylistId) return null;

    // Load library playlist details – sometimes includes a share URL directly
    let attrs;
    let globalId = null;
    let storefront = resolveStorefront();
    try {
      const lib = await this.apiRequest({ method: 'get', url: `/v1/me/library/playlists/${encodeURIComponent(libraryPlaylistId)}`, musicUserToken, timeout: 8000 });
      const item = lib?.data?.[0];
      attrs = item?.attributes || {};
      const direct = this.extractShareUrl(attrs);
      if (direct) return direct;
      try {
        storefront = await this.getUserStorefront(musicUserToken);
      } catch (_) {
        storefront = resolveStorefront(storefront);
      }
      const playParams = attrs.playParams || {};
      globalId = playParams.globalId || playParams.catalogId || playParams.id || null;
      const relShare = await this.resolveCatalogShareViaRelationship({
        musicUserToken,
        libraryPlaylistId,
        storefront,
        fallbackTitle: title || attrs.name || 'playlist'
      });
      if (relShare) return relShare;
    } catch (_) {
      try {
        storefront = await this.getUserStorefront(musicUserToken);
      } catch (_) {
        storefront = resolveStorefront(storefront);
      }
    }

    if (!globalId) {
      try {
        const searched = await this.searchLibraryPlaylistShareUrl(musicUserToken, title, { storefront, attempts: 3 });
        if (searched) return searched;
      } catch (_) {}
      return null;
    }

    const catalogShare = await this.getCatalogPlaylistShareUrl(globalId, storefront, title || attrs?.name || 'playlist');
    if (catalogShare) return catalogShare;

    return this.buildShareUrlFromGlobalId(storefront, globalId, title || attrs?.name || 'playlist');
  }

  parseDurationToMs(duration) {
    if (duration === null || typeof duration === 'undefined') return null;
    if (typeof duration === 'number' && Number.isFinite(duration)) {
      return Number(duration);
    }
    if (typeof duration === 'string') {
      const trimmed = duration.trim();
      if (!trimmed) return null;
      if (/^\d+$/.test(trimmed)) {
        return Number(trimmed);
      }
      const parts = trimmed.split(':').map(part => part.trim()).filter(Boolean);
      if (parts.length === 2 || parts.length === 3) {
        const nums = parts.map(part => Number(part));
        if (nums.some((n) => Number.isNaN(n))) {
          return null;
        }
        if (parts.length === 3) {
          return (nums[0] * 3600 * 1000) + (nums[1] * 60 * 1000) + (nums[2] * 1000);
        }
        return (nums[0] * 60 * 1000) + (nums[1] * 1000);
      }
    }
    return null;
  }

  async resolveTrackForStorefront(track, storefront, triedIds = new Set()) {
    if (!track) return null;

    const attempted = new Set(Array.from(triedIds).filter(Boolean).map((id) => String(id).trim()));
    if (track.apple_id) {
      attempted.add(String(track.apple_id).trim());
    }
    if (track.apple_music_id) {
      attempted.add(String(track.apple_music_id).trim());
    }

    const region = resolveStorefront(storefront);

    if (track.isrc) {
      try {
        const viaIsrc = await this.searchCatalogByISRC(track.isrc, region);
        if (viaIsrc?.id && !attempted.has(String(viaIsrc.id))) {
          return { id: String(viaIsrc.id), source: 'api:isrc', candidate: viaIsrc };
        }
      } catch (error) {
        logger.debug('APPLE_EXPORT', 'ISRC storefront re-resolve failed', {
          isrc: track.isrc,
          storefront: region,
          error: error.message
        });
      }
    }

    if (track.artist && track.title) {
      const durationMs = track.duration_ms ?? track.durationMs ?? this.parseDurationToMs(track.duration);
      try {
        const viaMetadata = await this.searchCatalogByMetadata({
          artist: track.artist,
          title: track.title,
          album: track.album,
          storefront: region,
          isrc: track.isrc,
          durationMs
        });
        if (viaMetadata?.id && !attempted.has(String(viaMetadata.id))) {
          return { id: String(viaMetadata.id), source: viaMetadata.source || 'api:metadata', candidate: viaMetadata };
        }
      } catch (error) {
        logger.debug('APPLE_EXPORT', 'Metadata storefront re-resolve failed', {
          trackTitle: track.title,
          trackArtist: track.artist,
          storefront: region,
          error: error.message
        });
      }
    }

    return null;
  }

  async addTracksToPlaylist(musicUserToken, playlistId, trackEntries, { storefront } = {}) {
    if (!trackEntries?.length) {
      return {
        acceptedCount: 0,
        acceptedEntries: [],
        failedEntries: []
      };
    }

    const resolvedStorefront = resolveStorefront(storefront);

    const entries = trackEntries
      .map((entry, index) => {
        const track = entry?.track || null;
        const appleId = entry?.appleId ? String(entry.appleId).trim() : null;
        if (!appleId) return null;
        return {
          position: typeof entry?.position === 'number' ? entry.position : index,
          track,
          appleId,
          currentAppleId: appleId,
          accepted: false,
          acceptedAppleId: null,
          attempts: [],
          errors: [],
          reResolved: false
        };
      })
      .filter(Boolean);

    if (!entries.length) {
      return {
        acceptedCount: 0,
        acceptedEntries: [],
        failedEntries: []
      };
    }

    const batchSize = 100;
    const playlistPath = `/v1/me/library/playlists/${encodeURIComponent(playlistId)}/tracks`;

    const tryBatchAdd = async (batchEntries, attemptLabel) => {
      if (!batchEntries.length) return;
      const payload = {
        data: batchEntries.map((entry) => ({ id: entry.currentAppleId, type: 'songs' }))
      };

      try {
        const response = await this.apiRequest({
          method: 'post',
          url: playlistPath,
          data: payload,
          musicUserToken,
          timeout: 20000,
          returnFullResponse: true
        });

        batchEntries.forEach((entry) => {
          entry.accepted = true;
          entry.acceptedAppleId = entry.currentAppleId;
          entry.attempts.push({
            attempt: attemptLabel,
            appleId: entry.currentAppleId,
            status: response?.status || 200
          });
        });
      } catch (error) {
        const response = error?.response;
        const appleErrors = Array.isArray(response?.data?.errors) ? response.data.errors : [];
        const pointerMap = new Map();

        appleErrors.forEach((err) => {
          const pointer = err?.source?.pointer;
          if (pointer && typeof pointer === 'string') {
            const match = pointer.match(/\/data\/(\d+)/);
            if (match) {
              const idx = Number(match[1]);
              if (!Number.isNaN(idx)) {
                const issue = {
                  status: Number(err?.status || response?.status || error?.status) || null,
                  code: err?.code || null,
                  detail: err?.detail || err?.title || error?.message || 'Apple Music rejected track',
                  appleError: err
                };
                if (!pointerMap.has(idx)) pointerMap.set(idx, []);
                pointerMap.get(idx).push(issue);
              }
            }
          }
        });

        batchEntries.forEach((entry, batchIndex) => {
          const issues = pointerMap.get(batchIndex) || [];
          if (!issues.length) {
            issues.push({
              status: response?.status || null,
              code: null,
              detail: error?.message || 'Apple Music request failed',
              appleError: appleErrors[0] || null
            });
          }

          entry.errors.push(...issues);
          entry.attempts.push({
            attempt: attemptLabel,
            appleId: entry.currentAppleId,
            status: response?.status || null,
            errors: issues
          });

          issues.forEach((issue) => {
            logger.warn('APPLE_EXPORT', 'Apple rejected track while adding to playlist', {
              playlistId,
              storefront: resolvedStorefront,
              appleSongId: entry.currentAppleId,
              originalAppleId: entry.appleId,
              trackId: entry.track?.id || null,
              trackTitle: entry.track?.title || null,
              trackArtist: entry.track?.artist || null,
              position: entry.position,
              attempt: attemptLabel,
              status: issue.status,
              code: issue.code,
              detail: issue.detail,
              appleError: issue.appleError
            });
          });
        });

        const status = response?.status;
        if (!status || status >= 500 || status === 401 || status === 403) {
          throw error;
        }
      }
    };

    // Initial batch attempts
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize).filter((entry) => !entry.accepted);
      if (!batch.length) continue;
      await tryBatchAdd(batch, 'initial');
    }

    const needsRetry = entries.filter((entry) => !entry.accepted && !entry.reResolved);
    const retryable = [];

    for (const entry of needsRetry) {
      entry.reResolved = true;
      if (!entry.track) {
        logger.warn('APPLE_EXPORT', 'Unable to re-resolve Apple track without metadata', {
          playlistId,
          storefront: resolvedStorefront,
          appleSongId: entry.currentAppleId,
          position: entry.position
        });
        continue;
      }

      const tried = new Set(entry.attempts.map((attempt) => attempt.appleId));
      if (entry.appleId) tried.add(entry.appleId);
      if (entry.currentAppleId) tried.add(entry.currentAppleId);

      const resolution = await this.resolveTrackForStorefront(entry.track, resolvedStorefront, tried);
      if (resolution?.id && resolution.id !== entry.currentAppleId) {
        entry.currentAppleId = resolution.id;

        logger.info('APPLE_EXPORT', 'Re-resolved Apple track for storefront after rejection', {
          playlistId,
          storefront: resolvedStorefront,
          originalAppleId: entry.appleId,
          resolvedAppleId: resolution.id,
          resolutionSource: resolution.source,
          trackId: entry.track?.id || null,
          trackTitle: entry.track?.title || null,
          trackArtist: entry.track?.artist || null,
          position: entry.position
        });

        retryable.push(entry);
      } else {
        logger.warn('APPLE_EXPORT', 'No storefront-specific match found for rejected Apple track', {
          playlistId,
          storefront: resolvedStorefront,
          originalAppleId: entry.appleId,
          attemptedAppleId: entry.currentAppleId,
          trackId: entry.track?.id || null,
          trackTitle: entry.track?.title || null,
          trackArtist: entry.track?.artist || null,
          position: entry.position
        });
      }
    }

    // Retry with re-resolved IDs
    for (let i = 0; i < retryable.length; i += batchSize) {
      const batch = retryable.slice(i, i + batchSize).filter((entry) => !entry.accepted);
      if (!batch.length) continue;
      await tryBatchAdd(batch, 'storefront_retry');
    }

    const acceptedEntries = entries.filter((entry) => entry.accepted);
    const failedEntries = entries.filter((entry) => !entry.accepted);

    if (failedEntries.length) {
      logger.error('APPLE_EXPORT', 'Some Apple tracks failed to add after storefront retry', null, {
        playlistId,
        storefront: resolvedStorefront,
        failedCount: failedEntries.length,
        attempted: entries.length
      });
    }

    logger.info('APPLE_EXPORT', 'Apple playlist add summary', {
      playlistId,
      storefront: resolvedStorefront,
      attempted: entries.length,
      accepted: acceptedEntries.length,
      failed: failedEntries.length
    });

    return {
      acceptedCount: acceptedEntries.length,
      acceptedEntries,
      failedEntries
    };
  }

  /**
   * Fetch track IDs currently in a library playlist for verification/backfill
   * Uses catalogId when available for consistent comparison with matches.
   */
  async getLibraryPlaylistTrackIds(musicUserToken, playlistId, { limit = 100, maxPages = 20 } = {}) {
    const ids = new Set();

    for (let page = 0; page < maxPages; page++) {
      const offset = page * limit;
      const response = await this.apiRequest({
        method: 'get',
        url: `/v1/me/library/playlists/${encodeURIComponent(playlistId)}/tracks`,
        musicUserToken,
        params: { limit, offset },
        timeout: 10000
      });

      const data = Array.isArray(response?.data) ? response.data : [];
      if (!data.length) break;

      for (const item of data) {
        const attr = item?.attributes || {};
        const playParams = attr?.playParams || {};
        const catalogId = playParams.catalogId || playParams.id || null;
        const libraryId = item?.id ? String(item.id) : null;
        if (catalogId) ids.add(String(catalogId));
        else if (libraryId) ids.add(libraryId);
      }

      if (data.length < limit) break;
    }

    return { ids: Array.from(ids), total: ids.size };
  }

  async exportPlaylist(musicUserToken, playlistData, tracks) {
    try {
      console.log(`🍎 Creating Apple Music playlist: "${playlistData.title}"`);
      const playlist = await this.createPlaylist(musicUserToken, playlistData);
      console.log(`✅ Apple Music playlist created: ${playlist.name} (ID: ${playlist.id})`);

      const validTracks = (tracks || []).filter(t => t.apple_id && String(t.apple_id).trim() !== '');
      let tracksAdded = 0;
      if (validTracks.length > 0 && playlist.id) {
        console.log(`🍎 Adding ${validTracks.length} tracks to Apple Music playlist`);
        let storefront = resolveStorefront();
        try {
          storefront = await this.getUserStorefront(musicUserToken);
        } catch (_) {}

        const trackEntries = validTracks.map((track, index) => ({
          track,
          appleId: String(track.apple_id).trim(),
          position: index
        }));

        const addResult = await this.addTracksToPlaylist(
          musicUserToken,
          playlist.id,
          trackEntries,
          { storefront }
        );

        tracksAdded = addResult?.acceptedCount ?? 0;
        console.log(`✅ Added ${tracksAdded}/${validTracks.length} tracks to Apple Music playlist`);
      }
      // Apple Music library playlists (p.xxx) typically cannot be shared programmatically
      const finalUrl = this.isShareUrl(playlist.url) ? playlist.url : null;
      const shareUrlPending = !finalUrl;

      const result = {
        platform: 'apple',
        playlistId: playlist.id,
        playlistName: playlist.name,
        playlistUrl: finalUrl,
        tracksAdded,
        totalTracks: tracks?.length || 0,
        coverage: tracks?.length ? tracksAdded / tracks.length : 0,
        success: true,
        shareUrlPending
      };

      console.log(`✅ Apple Music export complete: ${tracksAdded}/${tracks?.length || 0} tracks (${Math.round(result.coverage * 100)}% coverage)`);
      return result;
    } catch (error) {
      console.error('❌ Apple Music export failed:', error.message);
      return {
        platform: 'apple',
        success: false,
        error: error.response?.data || error.message,
        tracksAdded: 0,
        totalTracks: tracks?.length || 0
      };
    }
  }

  /**
   * Get user's library playlists
   * @param {string} musicUserToken - User's music token
   * @param {number} limit - Number of playlists to fetch (max 100)
   * @param {number} offset - Offset for pagination
   * @returns {Object} Playlists response
   */
  async getUserLibraryPlaylists(musicUserToken, limit = 100, offset = 0) {
    try {
      console.log('🍎 Fetching Apple Music library playlists...');

      const response = await this.apiRequest({
        method: 'get',
        url: '/v1/me/library/playlists',
        params: { limit, offset },
        musicUserToken
      });

      console.log(`✅ Fetched ${response?.data?.length || 0} Apple Music playlists`);
      return response;

    } catch (error) {
      console.error('❌ Failed to fetch Apple Music library playlists:', error.message);
      throw error;
    }
  }
}

const appleMusicApiService = new AppleMusicApiService();
export default appleMusicApiService;
