import { LRUCache } from 'lru-cache';
import logger from './logger.js';

const CACHE_ENABLED = process.env.DISABLE_MEMORY_CACHE !== 'true';

const CACHE_CONFIG = {
  feed: { max: 100, ttl: parseInt(process.env.CACHE_FEED_TTL, 10) || 300000 },      // 5 min
  playlist: { max: 500, ttl: parseInt(process.env.CACHE_PLAYLIST_TTL, 10) || 900000 },  // 15 min
  tracks: { max: 500, ttl: parseInt(process.env.CACHE_PLAYLIST_TTL, 10) || 900000 },    // 15 min
  curator: { max: 200, ttl: parseInt(process.env.CACHE_CURATOR_TTL, 10) || 1800000 }   // 30 min
};

const metrics = {
  feedHits: 0,
  feedMisses: 0,
  playlistHits: 0,
  playlistMisses: 0,
  tracksHits: 0,
  tracksMisses: 0,
  curatorHits: 0,
  curatorMisses: 0,
  invalidations: 0,
  lastResetAt: Date.now()
};

export const feedCache = new LRUCache(CACHE_CONFIG.feed);
export const playlistCache = new LRUCache(CACHE_CONFIG.playlist);
export const tracksCache = new LRUCache(CACHE_CONFIG.tracks);
export const curatorCache = new LRUCache(CACHE_CONFIG.curator);

/**
 * Synchronous cache-aside helper (matches better-sqlite3 sync pattern)
 * @param {LRUCache} cache - The cache instance to use
 * @param {string} key - Cache key
 * @param {Function} fetchFn - Synchronous function to fetch data on cache miss
 * @param {string} cacheName - Name of cache for metrics (feed, playlist, tracks, curator)
 * @returns {*} Cached or freshly fetched data
 */
export const cacheAside = (cache, key, fetchFn, cacheName = 'unknown') => {
  if (!CACHE_ENABLED) return fetchFn();

  const cached = cache.get(key);
  if (cached !== undefined) {
    metrics[`${cacheName}Hits`]++;
    return cached;
  }

  metrics[`${cacheName}Misses`]++;
  const fresh = fetchFn();
  if (fresh !== null && fresh !== undefined) {
    cache.set(key, fresh);
  }
  return fresh;
};

/**
 * Invalidate feed cache (used for visibility/config changes)
 * @param {string} reason - Reason for invalidation
 */
export const invalidateFeed = (reason = 'unknown') => {
  if (!CACHE_ENABLED) return;
  feedCache.clear();
  metrics.invalidations++;
  logger.info('MEMORY_CACHE', 'Invalidated feed cache', { reason });
};

/**
 * Invalidate playlist-related cache entries
 * @param {number|string} playlistId - Playlist ID to invalidate
 */
export const invalidatePlaylist = (playlistId) => {
  if (!CACHE_ENABLED) return;
  playlistCache.delete(`playlist:${playlistId}`);
  tracksCache.delete(`tracks:${playlistId}`);
  feedCache.clear();
  metrics.invalidations++;
  logger.info('MEMORY_CACHE', 'Invalidated playlist', { playlistId });
};

/**
 * Invalidate curator-related cache entries
 * @param {number|string} curatorId - Curator ID to invalidate
 */
export const invalidateCurator = (curatorId) => {
  if (!CACHE_ENABLED) return;
  curatorCache.delete(`curator:${curatorId}`);
  feedCache.clear();
  metrics.invalidations++;
  logger.info('MEMORY_CACHE', 'Invalidated curator', { curatorId });
};

/**
 * Invalidate curator and all their playlists
 * @param {number|string} curatorId - Curator ID to invalidate
 * @param {Array<number|string>} playlistIds - Array of playlist IDs to invalidate
 */
export const invalidateCuratorPlaylists = (curatorId, playlistIds = []) => {
  if (!CACHE_ENABLED) return;
  invalidateCurator(curatorId);
  playlistIds.forEach((pid) => {
    playlistCache.delete(`playlist:${pid}`);
    tracksCache.delete(`tracks:${pid}`);
  });
  logger.info('MEMORY_CACHE', 'Invalidated curator playlists', { curatorId, playlistCount: playlistIds.length });
};

/**
 * Clear all caches (for emergency or maintenance)
 */
export const clearAllCaches = () => {
  feedCache.clear();
  playlistCache.clear();
  tracksCache.clear();
  curatorCache.clear();
  logger.warn('MEMORY_CACHE', 'All caches cleared');
};

/**
 * Get cache statistics for monitoring
 * @returns {Object} Cache statistics
 */
export const getCacheStats = () => {
  const hitRate = (h, m) => (h + m > 0 ? (h / (h + m) * 100).toFixed(2) : '0.00');
  return {
    enabled: CACHE_ENABLED,
    uptime: Date.now() - metrics.lastResetAt,
    caches: {
      feed: {
        size: feedCache.size,
        max: CACHE_CONFIG.feed.max,
        ttl: CACHE_CONFIG.feed.ttl,
        hits: metrics.feedHits,
        misses: metrics.feedMisses,
        hitRate: hitRate(metrics.feedHits, metrics.feedMisses)
      },
      playlist: {
        size: playlistCache.size,
        max: CACHE_CONFIG.playlist.max,
        ttl: CACHE_CONFIG.playlist.ttl,
        hits: metrics.playlistHits,
        misses: metrics.playlistMisses,
        hitRate: hitRate(metrics.playlistHits, metrics.playlistMisses)
      },
      tracks: {
        size: tracksCache.size,
        max: CACHE_CONFIG.tracks.max,
        ttl: CACHE_CONFIG.tracks.ttl,
        hits: metrics.tracksHits,
        misses: metrics.tracksMisses,
        hitRate: hitRate(metrics.tracksHits, metrics.tracksMisses)
      },
      curator: {
        size: curatorCache.size,
        max: CACHE_CONFIG.curator.max,
        ttl: CACHE_CONFIG.curator.ttl,
        hits: metrics.curatorHits,
        misses: metrics.curatorMisses,
        hitRate: hitRate(metrics.curatorHits, metrics.curatorMisses)
      }
    },
    totalInvalidations: metrics.invalidations
  };
};
