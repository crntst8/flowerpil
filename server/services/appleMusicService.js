import { validateAppleMusicUrl } from './apple-music/url-matcher.js';
import appleMusicApiService from './appleMusicApiService.js';

const normalizeStorefront = (value, fallback = 'us') => {
  if (!value) return fallback;
  const trimmed = String(value).trim().toLowerCase();
  return /^[a-z]{2}$/.test(trimmed) ? trimmed : fallback;
};

/**
 * Apple Music Scraping Service
 * 
 * Handles Apple Music integration via web scraping with gamdl and Puppeteer,
 * ISRC-first search strategy, and deep link generation.
 * 
 * Note: Replaces API-based service to avoid $99/year Apple Developer Program cost
 */
class AppleMusicService {
  constructor() {
    this.rateLimitDelay = 50; // Base delay for compatibility
    this.useApiSearch = process.env.APPLE_MUSIC_API_SEARCH !== 'false';
    this.defaultStorefront = normalizeStorefront(process.env.APPLE_MUSIC_STOREFRONT);
  }

  /**
   * Search Apple Music by ISRC (API-only)
   */
  async searchByISRC(isrc, storefront) {
    if (!isrc?.trim()) return null;

    if (!this.useApiSearch) {
      console.warn('⚠️ Apple Music API search is disabled. Enable APPLE_MUSIC_API_SEARCH=true to use ISRC search.');
      return null;
    }

    try {
      const region = this.resolveStorefront(storefront);
      const apiRes = await appleMusicApiService.searchCatalogByISRC(isrc.trim(), region);
      if (apiRes && apiRes.url) {
        return {
          url: apiRes.url,
          id: apiRes.id,
          artist: apiRes.artist,
          title: apiRes.title,
          album: apiRes.album,
          isrc: apiRes.isrc || isrc.trim(),
          durationMs: apiRes.durationMs ?? null,
          confidence: typeof apiRes.confidence === 'number' ? apiRes.confidence : 100,
          source: apiRes.source || 'api:isrc',
          matchStrategy: apiRes.matchStrategy || 'isrc',
          scoreBreakdown: apiRes.scoreBreakdown || null,
          matchFactors: apiRes.matchFactors || null,
          matchedPreferredAlbum: apiRes.matchedPreferredAlbum ?? false,
          viaGuidance: apiRes.viaGuidance || false,
          rescueReason: apiRes.rescueReason || null,
          storefront: apiRes.storefront || region
        };
      }
      return null;
    } catch (e) {
      console.warn(`⚠️ Apple Music API ISRC search failed: ${e.message}`);
      return null;
    }
  }

  /**
   * Search Apple Music by metadata (fallback strategy via scraping)
   */
  async searchByMetadata(artist, title, options = {}) {
    if (!artist?.trim() || !title?.trim()) {
      throw new Error('Artist and title are required for metadata search');
    }

    const trimmedArtist = artist.trim();
    const trimmedTitle = title.trim();
    const trimmedAlbum = typeof options.album === 'string' ? options.album.trim() : options.album;

    // Prefer API when enabled
    if (this.useApiSearch) {
      try {
        const region = this.resolveStorefront(options.storefront);
        const apiRes = await appleMusicApiService.searchCatalogByMetadata({
          artist: trimmedArtist,
          title: trimmedTitle,
          album: trimmedAlbum,
          storefront: region,
          isrc: options.isrc,
          durationMs: options.durationMs
        });
        if (apiRes && apiRes.url) {
          const baseMatchInfo = {
            artist: trimmedArtist,
            title: trimmedTitle,
            album: trimmedAlbum || ''
          };
          const confidence = typeof apiRes.confidence === 'number'
            ? apiRes.confidence
            : calculateMatchConfidence(baseMatchInfo, apiRes);
          return {
            url: apiRes.url,
            id: apiRes.id,
            artist: apiRes.artist,
            title: apiRes.title,
            album: apiRes.album,
            isrc: apiRes.isrc || null,
            durationMs: apiRes.durationMs ?? null,
            confidence,
            source: apiRes.source || 'api:metadata',
            matchStrategy: apiRes.matchStrategy || 'metadata',
            scoreBreakdown: apiRes.scoreBreakdown || null,
            matchFactors: apiRes.matchFactors || null,
            matchedPreferredAlbum: apiRes.matchedPreferredAlbum ?? false,
            viaGuidance: apiRes.viaGuidance || false,
            rescueReason: apiRes.rescueReason || null,
            storefront: apiRes.storefront || region
          };
        }
      } catch (e) {
        console.warn(`⚠️ Apple Music API metadata search failed: ${e.message}`);
      }
    }

    // No scraper fallback - API-only approach
    return null;
  }

  /**
   * Search Apple Music by track (API-only)
   */
  async searchByTrack(track, options = {}) {
    // Add small delay for compatibility
    await this.delay(this.rateLimitDelay);

    if (!this.useApiSearch) {
      console.warn('⚠️ Apple Music API search is disabled. Enable APPLE_MUSIC_API_SEARCH=true to use track search.');
      return null;
    }

    try {
      // API-first strategy: ISRC → metadata
      if (track.isrc) {
        const byIsrc = await this.searchByISRC(track.isrc, options.storefront);
        if (byIsrc) return byIsrc;
      }
      const metadataOptions = {
        album: track.album,
        isrc: track.isrc,
        durationMs: track.duration_ms ?? track.durationMs ?? this.parseDurationToMs(track.duration),
        storefront: options.storefront
      };
      const byMeta = await this.searchByMetadata(track.artist, track.title, metadataOptions);
      if (byMeta) return byMeta;
    } catch (e) {
      console.warn(`⚠️ Apple Music API search failed: ${e.message}`);
    }

    return null;
  }

  resolveStorefront(storefront) {
    return normalizeStorefront(storefront, this.defaultStorefront);
  }

  /**
   * Search for an album by artist and title (for release cross-linking)
   */
  async searchAlbum(artist, title, options = {}) {
    const a = (artist || '').trim();
    const t = (title || '').trim();
    if (!a || !t) return null;

    if (!this.useApiSearch) {
      console.warn('Apple Music API search is disabled for album search');
      return null;
    }

    try {
      const region = this.resolveStorefront(options.storefront);
      const searchTerm = `${a} ${t}`;
      const data = await appleMusicApiService.apiRequest({
        method: 'get',
        url: `/v1/catalog/${encodeURIComponent(region)}/search`,
        params: { term: searchTerm, types: 'albums', limit: 10 }
      });

      const albums = data?.results?.albums?.data || [];
      if (!albums.length) return null;

      // Rank by match quality
      const lcA = a.toLowerCase();
      const lcT = t.toLowerCase();
      const ranked = albums
        .map(album => {
          const attrs = album.attributes || {};
          const albumName = (attrs.name || '').toLowerCase();
          const artistName = (attrs.artistName || '').toLowerCase();
          return {
            album,
            score: (albumName.includes(lcT) ? 1 : 0) + (artistName.includes(lcA) ? 1 : 0)
          };
        })
        .sort((x, y) => y.score - x.score);

      const pick = (ranked[0] || {}).album || albums[0];
      if (!pick) return null;

      const attrs = pick.attributes || {};
      return {
        id: pick.id,
        url: attrs.url || `https://music.apple.com/${region}/album/${pick.id}`,
        title: attrs.name,
        artist: attrs.artistName,
        confidence: (ranked[0]?.score || 0) >= 2 ? 90 : 70,
        source: 'album_search'
      };
    } catch (e) {
      console.warn(`Apple Music album search failed: ${e.message}`);
      return null;
    }
  }

  /**
   * Validate Apple Music URL format
   */
  validateAppleMusicUrl(url) {
    return validateAppleMusicUrl(url);
  }

  parseDurationToMs(duration) {
    if (!duration && duration !== 0) {
      return null;
    }
    if (Number.isFinite(duration)) {
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
        let seconds = 0;
        const nums = parts.map(part => Number(part));
        if (nums.some(n => Number.isNaN(n))) {
          return null;
        }
        if (parts.length === 3) {
          seconds = (nums[0] * 3600) + (nums[1] * 60) + nums[2];
        } else {
          seconds = (nums[0] * 60) + nums[1];
        }
        return seconds * 1000;
      }
    }
    return null;
  }

  /**
   * Rate limiting delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Test Apple Music scraping connection
   */
  async testConnection() {
    try {
      console.log('🧪 Testing Apple Music scraping connection...');
      
      if (!this.enabled) {
        console.log('⚠️  Apple Music scraping is disabled');
        return false;
      }
      
      const success = await this.scraper.testConnection();
      
      if (success) {
        console.log('✅ Apple Music scraping connection successful');
        return true;
      }
      
      throw new Error('Scraping test failed');
      
    } catch (error) {
      console.error('❌ Apple Music scraping connection failed:', error.message);
      return false;
    }
  }

  /**
   * Get scraping service status
   */
  getScrapingStatus() {
    return {
      enabled: this.enabled,
      scraper: this.scraper ? this.scraper.getStatus() : null
    };
  }

  /**
   * Clean up scraping resources
   */
  async cleanup() {
    if (this.scraper) {
      await this.scraper.cleanup();
    }
  }
}

// Export singleton instance and search function
const appleMusicService = new AppleMusicService();

export const searchAppleMusicByTrack = (track, options) => appleMusicService.searchByTrack(track, options);
export const searchAppleMusicByISRC = (isrc) => appleMusicService.searchByISRC(isrc);
export const searchAppleMusicByMetadata = (artist, title, options) => appleMusicService.searchByMetadata(artist, title, options);
export const testAppleMusicConnection = () => appleMusicService.testConnection();
export const validateAppleMusicUrlService = (url) => appleMusicService.validateAppleMusicUrl(url);

export default appleMusicService;
