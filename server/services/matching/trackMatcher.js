/**
 * Enhanced Track Matcher
 *
 * Multi-tier matching strategy for cross-platform track matching.
 * Uses conservative thresholds for higher accuracy over recall.
 *
 * Tier 1: ISRC Match (100% confidence)
 * Tier 2: Exact Metadata (Artist + Title + Album)
 * Tier 3: Title Variants (without parentheticals, feat., etc.)
 * Tier 4: Album Variants (deluxe, remaster editions)
 * Tier 5: Artist Variants (The Beatles vs Beatles)
 */

import {
  normalizeText,
  normalizeArtistName,
  normalizeTitleVariants,
  normalizeAlbumVariants,
  splitArtists,
  normalizeIsrc,
  compareDuration,
  normalizeTrackMetadata,
  calculateSimilarity
} from './normalizationUtils.js';

import {
  detectEdgeCases,
  adjustConfidenceForEdgeCases,
  getThresholdAdjustment,
  shouldExcludeFromMatching
} from './edgeCaseHandlers.js';

import appleMusicApiService from '../appleMusicApiService.js';
import tidalService from '../tidalService.js';
import { getDatabase, getQueries } from '../../database/db.js';

const DEFAULT_THRESHOLD = 75; // Conservative threshold (user choice: higher accuracy)

/**
 * Enhanced Track Matcher Class
 */
export class EnhancedTrackMatcher {
  constructor(platform, options = {}) {
    if (!['apple', 'tidal'].includes(platform)) {
      throw new Error(`Invalid platform: ${platform}. Must be 'apple' or 'tidal'`);
    }

    this.platform = platform;
    this.threshold = options.threshold || DEFAULT_THRESHOLD;
    this.useCache = options.useCache !== false; // Default to true
    this.storefront = options.storefront || 'us'; // For Apple Music

    // Platform-specific services
    this.appleService = appleMusicApiService;
    this.tidalService = tidalService;

    // Stats tracking
    this.stats = {
      attempted: 0,
      matched: 0,
      failed: 0,
      cached: 0,
      tier1: 0, // ISRC
      tier2: 0, // Exact metadata
      tier3: 0, // Title variants
      tier4: 0, // Album variants
      tier5: 0  // Artist variants
    };
  }

  /**
   * Main entry point for matching a track
   * @param {object} spotifyTrack - Track from Spotify
   * @param {object} options - Matching options
   * @returns {object} Match result with confidence score
   */
  async matchTrack(spotifyTrack, options = {}) {
    this.stats.attempted++;

    // Check if track should be excluded
    const exclusion = shouldExcludeFromMatching(spotifyTrack);
    if (exclusion.exclude) {
      this.stats.failed++;
      return {
        matched: false,
        confidence: 0,
        strategy: 'excluded',
        tier: 0,
        reason: exclusion.reason
      };
    }

    // Detect edge cases and adjust threshold
    const edgeCases = detectEdgeCases(spotifyTrack);
    const thresholdAdjustment = getThresholdAdjustment(edgeCases);
    const adjustedThreshold = Math.min(95, this.threshold + thresholdAdjustment);

    // Normalize track metadata
    const normalized = normalizeTrackMetadata(spotifyTrack);

    // Check cache first (local track_match_cache table)
    if (this.useCache) {
      const cachedResult = await this.checkCache(spotifyTrack);
      if (cachedResult && cachedResult.confidence >= adjustedThreshold) {
        this.stats.cached++;
        this.stats.matched++;
        return cachedResult;
      }
    }

    // TIER 1: ISRC Match
    if (normalized.isrc) {
      const isrcResult = await this.matchByISRC(normalized.isrc);
      if (isrcResult && isrcResult.confidence === 100) {
        this.stats.tier1++;
        this.stats.matched++;
        await this.cacheResult(spotifyTrack, isrcResult);
        return isrcResult;
      }
    }

    // TIER 2: Exact Metadata Match
    const exactResult = await this.matchByExactMetadata(normalized);
    if (exactResult && exactResult.confidence >= adjustedThreshold) {
      this.stats.tier2++;
      this.stats.matched++;
      await this.cacheResult(spotifyTrack, exactResult);
      return exactResult;
    }

    // TIER 3: Title Variants
    for (const titleVariant of normalized.titleVariants) {
      const variantResult = await this.matchByTitleVariant(
        normalized.artist,
        titleVariant,
        normalized.album,
        normalized.durationMs
      );

      if (variantResult && variantResult.confidence >= adjustedThreshold) {
        // Adjust for edge cases
        const adjusted = adjustConfidenceForEdgeCases(
          variantResult.confidence,
          edgeCases,
          variantResult
        );

        if (adjusted >= adjustedThreshold) {
          variantResult.confidence = adjusted;
          this.stats.tier3++;
          this.stats.matched++;
          await this.cacheResult(spotifyTrack, variantResult);
          return variantResult;
        }
      }
    }

    // TIER 4: Album Variants
    for (const albumVariant of normalized.albumVariants) {
      const albumResult = await this.matchByAlbumVariant(
        normalized.artist,
        normalized.title,
        albumVariant,
        normalized.durationMs
      );

      if (albumResult && albumResult.confidence >= adjustedThreshold) {
        const adjusted = adjustConfidenceForEdgeCases(
          albumResult.confidence,
          edgeCases,
          albumResult
        );

        if (adjusted >= adjustedThreshold) {
          albumResult.confidence = adjusted;
          this.stats.tier4++;
          this.stats.matched++;
          await this.cacheResult(spotifyTrack, albumResult);
          return albumResult;
        }
      }
    }

    // TIER 5: Artist Variants
    const primaryArtist = normalized.artists[0] || normalized.artist;
    const artistResult = await this.matchByArtistVariant(
      primaryArtist,
      normalized.title,
      normalized.durationMs
    );

    if (artistResult && artistResult.confidence >= adjustedThreshold) {
      const adjusted = adjustConfidenceForEdgeCases(
        artistResult.confidence,
        edgeCases,
        artistResult
      );

      if (adjusted >= adjustedThreshold) {
        artistResult.confidence = adjusted;
        this.stats.tier5++;
        this.stats.matched++;
        await this.cacheResult(spotifyTrack, artistResult);
        return artistResult;
      }
    }

    // No match found
    this.stats.failed++;
    return {
      matched: false,
      confidence: 0,
      strategy: 'none',
      tier: 0,
      attempts: [exactResult, ...normalized.titleVariants.map((_, i) => i)].length
    };
  }

  /**
   * Check cache for previously matched track
   */
  async checkCache(spotifyTrack) {
    try {
      const queries = getQueries();
      const spotifyId = spotifyTrack.spotify_id || spotifyTrack.id;

      if (!spotifyId) return null;

      // Look up in match cache table
      const cached = queries.getTrackMatchCacheBySpotifyId?.get(spotifyId);
      if (!cached) return null;

      const platformUrl = this.platform === 'apple' ? cached.apple_music_url : cached.tidal_url;
      const platformId = this.platform === 'apple' ? cached.apple_music_id : cached.tidal_id;
      const confidence = this.platform === 'apple' ? cached.match_confidence_apple : cached.match_confidence_tidal;
      const strategy = this.platform === 'apple' ? cached.match_source_apple : cached.match_source_tidal;

      if (!platformUrl && !platformId) return null;

      return {
        matched: true,
        confidence: confidence || 90,
        strategy: strategy || 'cache',
        tier: 0,
        url: platformUrl,
        id: platformId,
        cached: true
      };
    } catch (error) {
      // Cache lookup failed, continue with matching
      console.warn('Cache lookup failed:', error.message);
      return null;
    }
  }

  /**
   * Cache match result in track_match_cache table
   */
  async cacheResult(spotifyTrack, matchResult) {
    try {
      const db = getDatabase();
      const spotifyId = spotifyTrack.spotify_id || spotifyTrack.id;

      if (!spotifyId || !matchResult.matched) return;

      // Prepare platform-specific fields
      const appleUrl = this.platform === 'apple' ? matchResult.url : null;
      const appleId = this.platform === 'apple' ? matchResult.id : null;
      const appleConfidence = this.platform === 'apple' ? matchResult.confidence : null;
      const appleSource = this.platform === 'apple' ? matchResult.strategy : null;

      const tidalUrl = this.platform === 'tidal' ? matchResult.url : null;
      const tidalId = this.platform === 'tidal' ? matchResult.id : null;
      const tidalConfidence = this.platform === 'tidal' ? matchResult.confidence : null;
      const tidalSource = this.platform === 'tidal' ? matchResult.strategy : null;

      // Insert or update cached match results for this Spotify track
      const stmt = db.prepare(`
        INSERT INTO track_match_cache (
          spotify_id,
          apple_music_url,
          apple_music_id,
          match_confidence_apple,
          match_source_apple,
          tidal_url,
          tidal_id,
          match_confidence_tidal,
          match_source_tidal,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(spotify_id) DO UPDATE SET
          apple_music_url = COALESCE(excluded.apple_music_url, apple_music_url),
          apple_music_id = COALESCE(excluded.apple_music_id, apple_music_id),
          match_confidence_apple = COALESCE(excluded.match_confidence_apple, match_confidence_apple),
          match_source_apple = COALESCE(excluded.match_source_apple, match_source_apple),
          tidal_url = COALESCE(excluded.tidal_url, tidal_url),
          tidal_id = COALESCE(excluded.tidal_id, tidal_id),
          match_confidence_tidal = COALESCE(excluded.match_confidence_tidal, match_confidence_tidal),
          match_source_tidal = COALESCE(excluded.match_source_tidal, match_source_tidal),
          updated_at = CURRENT_TIMESTAMP
      `);

      stmt.run(
        spotifyId,
        appleUrl,
        appleId,
        appleConfidence,
        appleSource,
        tidalUrl,
        tidalId,
        tidalConfidence,
        tidalSource
      );
    } catch (error) {
      console.warn('Failed to cache result:', error.message);
    }
  }

  /**
   * TIER 1: Match by ISRC
   */
  async matchByISRC(isrc) {
    if (!isrc) return null;

    try {
      let result;

      if (this.platform === 'apple') {
        result = await this.appleService.searchCatalogByISRC(isrc, this.storefront);
      } else if (this.platform === 'tidal') {
        result = await this.tidalService.searchByISRC(isrc);
      }

      if (result && result.id) {
        return {
          matched: true,
          confidence: 100,
          strategy: 'isrc',
          tier: 1,
          ...result
        };
      }
    } catch (error) {
      console.warn(`ISRC match failed for ${isrc}:`, error.message);
    }

    return null;
  }

  /**
   * TIER 2: Match by exact metadata (artist + title + album)
   */
  async matchByExactMetadata(normalized) {
    try {
      let result;

      if (this.platform === 'apple') {
        result = await this.appleService.searchCatalogTrack({
          track: {
            title: normalized.title,
            artist: normalized.artist,
            album: normalized.album,
            duration_ms: normalized.durationMs
          },
          storefront: this.storefront
        });
      } else if (this.platform === 'tidal') {
        result = await this.tidalService.searchByMetadata(
          normalized.artist,
          normalized.title,
          { album: normalized.album, duration: normalized.durationMs }
        );
      }

      if (result && result.confidence >= this.threshold) {
        return {
          matched: true,
          confidence: result.confidence,
          strategy: 'exact_metadata',
          tier: 2,
          ...result
        };
      }
    } catch (error) {
      console.warn('Exact metadata match failed:', error.message);
    }

    return null;
  }

  /**
   * TIER 3: Match by title variant
   */
  async matchByTitleVariant(artist, titleVariant, album, durationMs) {
    try {
      let result;

      if (this.platform === 'apple') {
        result = await this.appleService.searchCatalogTrack({
          track: {
            title: titleVariant,
            artist: artist,
            album: album,
            duration_ms: durationMs
          },
          storefront: this.storefront
        });
      } else if (this.platform === 'tidal') {
        result = await this.tidalService.searchByMetadata(
          artist,
          titleVariant,
          { album, duration: durationMs }
        );
      }

      if (result && result.confidence >= this.threshold - 5) {
        // Slightly lower threshold for variants
        return {
          matched: true,
          confidence: result.confidence,
          strategy: 'title_variant',
          tier: 3,
          ...result
        };
      }
    } catch (error) {
      console.warn('Title variant match failed:', error.message);
    }

    return null;
  }

  /**
   * TIER 4: Match by album variant
   */
  async matchByAlbumVariant(artist, title, albumVariant, durationMs) {
    try {
      let result;

      if (this.platform === 'apple') {
        result = await this.appleService.searchCatalogTrack({
          track: {
            title: title,
            artist: artist,
            album: albumVariant,
            duration_ms: durationMs
          },
          storefront: this.storefront
        });
      } else if (this.platform === 'tidal') {
        result = await this.tidalService.searchByMetadata(
          artist,
          title,
          { album: albumVariant, duration: durationMs }
        );
      }

      if (result && result.confidence >= this.threshold - 5) {
        return {
          matched: true,
          confidence: result.confidence,
          strategy: 'album_variant',
          tier: 4,
          ...result
        };
      }
    } catch (error) {
      console.warn('Album variant match failed:', error.message);
    }

    return null;
  }

  /**
   * TIER 5: Match by artist variant
   */
  async matchByArtistVariant(artistVariant, title, durationMs) {
    try {
      let result;

      if (this.platform === 'apple') {
        result = await this.appleService.searchCatalogTrack({
          track: {
            title: title,
            artist: artistVariant,
            duration_ms: durationMs
          },
          storefront: this.storefront
        });
      } else if (this.platform === 'tidal') {
        result = await this.tidalService.searchByMetadata(
          artistVariant,
          title,
          { duration: durationMs }
        );
      }

      if (result && result.confidence >= this.threshold - 10) {
        // Even more lenient for artist variants
        return {
          matched: true,
          confidence: result.confidence,
          strategy: 'artist_variant',
          tier: 5,
          ...result
        };
      }
    } catch (error) {
      console.warn('Artist variant match failed:', error.message);
    }

    return null;
  }

  /**
   * Get matching statistics
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.attempted > 0
        ? Math.round((this.stats.matched / this.stats.attempted) * 100)
        : 0
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      attempted: 0,
      matched: 0,
      failed: 0,
      cached: 0,
      tier1: 0,
      tier2: 0,
      tier3: 0,
      tier4: 0,
      tier5: 0
    };
  }
}

export default EnhancedTrackMatcher;
