import { parseUrl } from './urlParsing.js';
import SpotifyService from './spotifyService.js';
import appleMusicService from './appleMusicService.js';
import tidalService from './tidalService.js';
import deezerPreviewService from './deezerPreviewService.js';
import youtubeService from './youtubeService.js';
import axios from 'axios';
import { getDatabase } from '../database/db.js';

/**
 * Link Resolver Service
 * Stateless resolver that orchestrates provider lookups for a single URL
 * Optionally persists results into cross_links table
 */
class LinkResolverService {
  constructor() {
    this.cache = new Map();
    this.cacheTTL = 20 * 60 * 1000; // 20 minutes
    this.spotifyService = new SpotifyService();
    this.appleMusicService = appleMusicService;
    this.tidalService = tidalService;
    this.deezerService = deezerPreviewService;
    this.youtubeService = youtubeService;
  }

  /**
   * Resolve a DSP URL to normalized entity + multi-platform links
   * @param {string} url - The DSP URL to resolve
   * @param {Object} options - { persist: boolean, trackId: number }
   * @returns {Object} Resolved entity with links
   */
  async resolveUrl(url, options = {}) {
    const startTime = Date.now();
    const { persist = false, trackId = null } = options;

    // Check cache
    const cacheKey = `resolve:${url}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return {
        ...cached.data,
        diagnostics: {
          ...cached.data.diagnostics,
          cache_hit: true
        }
      };
    }

    // Parse URL
    const parsed = parseUrl(url);
    if (!parsed) {
      throw new Error('Unsupported or invalid URL format');
    }

    const { provider, id, type } = parsed;

    // Only support track resolution for now
    if (type && type !== 'track' && type !== 'song') {
      throw new Error(`Only track URLs are supported (got: ${type})`);
    }

    let entity = null;
    let links = {};
    let providersConsulted = [provider];

    // Step 1: Fetch canonical entity from source provider
    try {
      entity = await this.fetchEntityFromProvider(provider, parsed);
    } catch (error) {
      throw new Error(`Failed to fetch entity from ${provider}: ${error.message}`);
    }

    if (!entity) {
      throw new Error(`Could not retrieve track details from ${provider}`);
    }

    // Add source link
    links[provider] = { url, id };

    // Step 2: Fan-out lookups if ISRC present
    if (entity.isrc) {
      const fanOutResults = await Promise.allSettled([
        provider !== 'spotify' ? this.spotifyService.searchByISRC(entity.isrc) : Promise.resolve(null),
        provider !== 'apple' ? this.appleMusicService.searchByISRC(entity.isrc) : Promise.resolve(null),
        provider !== 'tidal' ? this.tidalService.searchByISRC(entity.isrc) : Promise.resolve(null),
        provider !== 'youtube' ? this.youtubeService.searchByISRC(entity.isrc) : Promise.resolve(null),
        this.deezerService.searchByISRC(entity.isrc)
      ]);

      providersConsulted.push('spotify', 'apple', 'tidal', 'youtube', 'deezer');

      // Spotify
      if (fanOutResults[0].status === 'fulfilled' && fanOutResults[0].value) {
        const spot = fanOutResults[0].value;
        links.spotify = { url: spot.url, id: spot.id };
      }

      // Apple
      if (fanOutResults[1].status === 'fulfilled' && fanOutResults[1].value) {
        const apple = fanOutResults[1].value;
        links.apple = { url: apple.url, id: apple.id };
      }

      // TIDAL
      if (fanOutResults[2].status === 'fulfilled' && fanOutResults[2].value) {
        const tidal = fanOutResults[2].value;
        links.tidal = { url: tidal.url, id: tidal.id };
      }

      // YouTube
      if (fanOutResults[3].status === 'fulfilled' && fanOutResults[3].value) {
        const yt = fanOutResults[3].value;
        links.youtube = { url: yt.url, id: yt.videoId };
      }

      // Deezer preview
      if (fanOutResults[4].status === 'fulfilled' && fanOutResults[4].value) {
        const deezer = fanOutResults[4].value;
        links.deezer_preview = { url: deezer.preview };
      }
    } else {
      // Step 3: Fallback to metadata search
      const metaResults = await Promise.allSettled([
        provider !== 'spotify' ? this.spotifyService.searchByMetadata(entity.artist, entity.title) : Promise.resolve(null),
        provider !== 'apple' ? this.appleMusicService.searchByMetadata(entity.artist, entity.title) : Promise.resolve(null),
        provider !== 'tidal' ? this.tidalService.searchByMetadata(entity.artist, entity.title) : Promise.resolve(null),
        provider !== 'youtube' ? this.youtubeService.searchByMetadata({ title: entity.title, artist: entity.artist, duration_ms: entity.duration_ms }) : Promise.resolve(null)
      ]);

      providersConsulted.push('spotify', 'apple', 'tidal', 'youtube');

      if (metaResults[0].status === 'fulfilled' && metaResults[0].value) {
        const spot = metaResults[0].value;
        links.spotify = { url: spot.url, id: spot.id };
      }
      if (metaResults[1].status === 'fulfilled' && metaResults[1].value) {
        const apple = metaResults[1].value;
        links.apple = { url: apple.url, id: apple.id };
      }
      if (metaResults[2].status === 'fulfilled' && metaResults[2].value) {
        const tidal = metaResults[2].value;
        links.tidal = { url: tidal.url, id: tidal.id };
      }
      if (metaResults[3].status === 'fulfilled' && metaResults[3].value) {
        const yt = metaResults[3].value;
        links.youtube = { url: yt.url, id: yt.videoId };
      }
    }

    // Calculate overall confidence
    const confidence = this.calculateConfidence(entity, links);

    const result = {
      entity,
      links,
      confidence,
      diagnostics: {
        matched_on: entity.isrc ? 'isrc' : 'metadata',
        providers_consulted: [...new Set(providersConsulted)],
        latency_ms_total: Date.now() - startTime,
        cache_hit: false
      }
    };

    // Cache result
    this.cache.set(cacheKey, { data: result, timestamp: Date.now() });

    // Optional: persist to cross_links
    if (persist && trackId) {
      await this.persistToCrossLinks(trackId, links);
    }

    return result;
  }

  /**
   * Fetch entity details from source provider
   * @param {string} provider - Provider name
   * @param {Object} parsed - Parsed URL object
   * @returns {Object} Normalized entity
   */
  async fetchEntityFromProvider(provider, parsed) {
    switch (provider) {
      case 'spotify':
        return await this.fetchFromSpotify(parsed.id);

      case 'apple':
        return await this.fetchFromApple(parsed);

      case 'tidal':
        return await this.fetchFromTidal(parsed.id);

      case 'youtube':
        return await this.fetchFromYouTube(parsed.id);

      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Fetch track from Spotify
   */
  async fetchFromSpotify(trackId) {
    const token = await this.spotifyService.getClientCredentialsToken();
    const response = await axios.get(`https://api.spotify.com/v1/tracks/${trackId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const track = response.data;
    return {
      kind: 'track',
      title: track.name,
      artist: track.artists.map(a => a.name).join(', '),
      album: track.album?.name,
      duration_ms: track.duration_ms,
      isrc: track.external_ids?.isrc,
      artwork: track.album?.images?.[0] ? {
        url: track.album.images[0].url,
        width: track.album.images[0].width,
        height: track.album.images[0].height
      } : undefined
    };
  }

  /**
   * Fetch track from Apple Music
   */
  async fetchFromApple(parsed) {
    // Use Apple Music API if available
    const storefront = parsed.storefront || 'us';
    const trackId = parsed.trackId || parsed.id;

    try {
      // Try API first
      const result = await this.appleMusicService.searchByMetadata('', ''); // Placeholder - we need catalog lookup
      // For now, return basic structure
      return {
        kind: 'track',
        title: 'Unknown',
        artist: 'Unknown',
        album: undefined,
        duration_ms: undefined,
        isrc: undefined,
        artwork: undefined
      };
    } catch (error) {
      throw new Error('Apple Music lookup not fully implemented');
    }
  }

  /**
   * Fetch track from TIDAL
   */
  async fetchFromTidal(trackId) {
    const token = await this.tidalService.getAccessToken();
    const response = await axios.get(`https://openapi.tidal.com/v2/tracks/${trackId}`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { countryCode: 'US' }
    });

    const track = response.data.resource;
    return {
      kind: 'track',
      title: track.title,
      artist: track.artists?.map(a => a.name).join(', ') || '',
      album: track.album?.title,
      duration_ms: track.duration ? track.duration * 1000 : undefined,
      isrc: track.isrc,
      artwork: track.album?.imageCover?.[0] ? {
        url: track.album.imageCover[0].url
      } : undefined
    };
  }

  /**
   * Fetch track from YouTube
   */
  async fetchFromYouTube(videoId) {
    const response = await axios.get(`https://www.googleapis.com/youtube/v3/videos`, {
      params: {
        part: 'snippet,contentDetails',
        id: videoId,
        key: this.youtubeService.apiKey
      }
    });

    const video = response.data?.items?.[0];
    if (!video) {
      throw new Error('YouTube video not found');
    }

    // Parse title to extract artist/title (basic heuristic)
    const title = video.snippet.title;
    const parts = title.split('-');
    const artist = parts.length > 1 ? parts[0].trim() : video.snippet.channelTitle;
    const trackTitle = parts.length > 1 ? parts.slice(1).join('-').trim() : title;

    const durationMs = this.youtubeService.parseDuration(video.contentDetails?.duration);

    return {
      kind: 'track',
      title: trackTitle,
      artist,
      album: undefined,
      duration_ms: durationMs,
      isrc: undefined, // YouTube doesn't provide ISRC
      artwork: video.snippet.thumbnails?.high ? {
        url: video.snippet.thumbnails.high.url,
        width: video.snippet.thumbnails.high.width,
        height: video.snippet.thumbnails.high.height
      } : undefined
    };
  }

  /**
   * Calculate overall confidence score
   */
  calculateConfidence(entity, links) {
    const linkCount = Object.keys(links).length;
    const hasIsrc = !!entity.isrc;

    if (hasIsrc && linkCount >= 4) return 0.95;
    if (hasIsrc && linkCount >= 3) return 0.90;
    if (hasIsrc && linkCount >= 2) return 0.85;
    if (linkCount >= 3) return 0.80;
    if (linkCount >= 2) return 0.70;
    return 0.60;
  }

  /**
   * Persist links to cross_links table
   */
  async persistToCrossLinks(trackId, links) {
    const db = getDatabase();
    const now = new Date().toISOString();

    const upsert = db.prepare(`
      INSERT INTO cross_links (track_id, platform, url, confidence, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(track_id, platform) DO UPDATE SET
        url = excluded.url,
        confidence = excluded.confidence,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
    `);

    for (const [platform, data] of Object.entries(links)) {
      if (platform === 'deezer_preview') continue; // Skip preview-only

      upsert.run(
        trackId,
        platform,
        data.url,
        100, // Default confidence for persisted links
        JSON.stringify(data),
        now,
        now
      );
    }
  }
}

// Export singleton instance
const linkResolverService = new LinkResolverService();

export default linkResolverService;
export { linkResolverService };
