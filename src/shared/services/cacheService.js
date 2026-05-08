import { APICache } from '@shared/utils/performanceUtils';

class CacheService {
  constructor() {
    // Different cache instances for different data types
    this.fetchCache = new APICache(2 * 60 * 1000);   // 2 minutes for fetch responses
    this.playlistCache = new APICache(10 * 60 * 1000); // 10 minutes
    this.trackCache = new APICache(15 * 60 * 1000);    // 15 minutes
    this.artworkCache = new APICache(30 * 60 * 1000);  // 30 minutes
    this.spotifyCache = new APICache(5 * 60 * 1000);   // 5 minutes
    this.newMusicCache = new APICache(10 * 60 * 1000); // 10 minutes
    this.genreCache = new APICache(60 * 60 * 1000);    // 60 minutes

    // Set up periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  // Fetch response caching
  getCachedFetch(key) {
    return this.fetchCache.get(key);
  }

  setCachedFetch(key, data, ttl) {
    this.fetchCache.set(key, data, ttl);
  }

  clearFetchCache(filterFn) {
    if (typeof filterFn !== 'function') {
      this.fetchCache.clear();
      return;
    }

    for (const key of this.fetchCache.keys()) {
      if (filterFn(key)) {
        this.fetchCache.delete(key);
      }
    }
  }

  // Playlist caching
  getCachedPlaylist(id) {
    return this.playlistCache.get(`playlist:${id}`);
  }

  setCachedPlaylist(id, data) {
    this.playlistCache.set(`playlist:${id}`, data);
  }

  getCachedPlaylists(filters = {}) {
    const key = `playlists:${JSON.stringify(filters)}`;
    return this.playlistCache.get(key);
  }

  setCachedPlaylists(filters, data) {
    const key = `playlists:${JSON.stringify(filters)}`;
    this.playlistCache.set(key, data);
  }

  // Track caching
  getCachedTracks(playlistId) {
    return this.trackCache.get(`tracks:${playlistId}`);
  }

  setCachedTracks(playlistId, data) {
    this.trackCache.set(`tracks:${playlistId}`, data);
  }

  getCachedTrack(id) {
    return this.trackCache.get(`track:${id}`);
  }

  setCachedTrack(id, data) {
    this.trackCache.set(`track:${id}`, data);
  }

  // Artwork caching
  getCachedArtworkSearch(artist, track) {
    const key = `artwork:${artist}:${track}`;
    return this.artworkCache.get(key);
  }

  setCachedArtworkSearch(artist, track, data) {
    const key = `artwork:${artist}:${track}`;
    this.artworkCache.set(key, data);
  }

  // Spotify caching
  getCachedSpotifyPlaylists(accessToken) {
    // Use a hash of the token for security
    const tokenHash = btoa(accessToken).slice(0, 10);
    return this.spotifyCache.get(`spotify:playlists:${tokenHash}`);
  }

  setCachedSpotifyPlaylists(accessToken, data) {
    const tokenHash = btoa(accessToken).slice(0, 10);
    this.spotifyCache.set(`spotify:playlists:${tokenHash}`, data);
  }

  getCachedSpotifyPlaylist(accessToken, playlistId) {
    const tokenHash = btoa(accessToken).slice(0, 10);
    return this.spotifyCache.get(`spotify:playlist:${tokenHash}:${playlistId}`);
  }

  setCachedSpotifyPlaylist(accessToken, playlistId, data) {
    const tokenHash = btoa(accessToken).slice(0, 10);
    this.spotifyCache.set(`spotify:playlist:${tokenHash}:${playlistId}`, data);
  }

  // NEW MUSIC caching
  getCachedNewMusic() {
    return this.newMusicCache.get('new-music:feed');
  }

  setCachedNewMusic(data) {
    this.newMusicCache.set('new-music:feed', data);
  }

  getCachedNewMusicPosts(filters = {}) {
    const key = `new-music:admin:${JSON.stringify(filters)}`;
    return this.newMusicCache.get(key);
  }

  setCachedNewMusicPosts(filters, data) {
    const key = `new-music:admin:${JSON.stringify(filters)}`;
    this.newMusicCache.set(key, data);
  }

  getCachedNewMusicPost(id) {
    return this.newMusicCache.get(`new-music:post:${id}`);
  }

  setCachedNewMusicPost(id, data) {
    this.newMusicCache.set(`new-music:post:${id}`, data);
  }

  clearNewMusicCache() {
    this.newMusicCache.clear();
    this.clearFetchCache((key) => key.includes('/api/v1/new-music'));
  }

  // Genre catalog caching
  getCachedGenres() {
    return this.genreCache.get('genres:catalog');
  }

  setCachedGenres(data) {
    this.genreCache.set('genres:catalog', data);
  }

  clearGenreCache() {
    this.genreCache.clear();
    this.clearFetchCache((key) => key.includes('/api/v1/genre-categories'));
  }

  // Cache invalidation
  invalidatePlaylist(id) {
    this.playlistCache.delete(`playlist:${id}`);
    this.trackCache.delete(`tracks:${id}`);
    // Also clear related playlist listings
    this.clearPlaylistListings();
    this.clearFetchCache((key) => key.includes(`/api/v1/playlists/${id}`));
  }

  invalidateTrack(id, playlistId) {
    this.trackCache.delete(`track:${id}`);
    if (playlistId) {
      this.trackCache.delete(`tracks:${playlistId}`);
      this.clearFetchCache((key) => key.includes(`/api/v1/tracks/playlist/${playlistId}`));
    }
  }

  clearPlaylistListings() {
    // Clear all playlist listings (they contain many different filter combinations)
    for (const key of this.playlistCache.cache.keys()) {
      if (key.startsWith('playlists:')) {
        this.playlistCache.delete(key);
      }
    }
    this.clearFetchCache((key) => key.includes('/api/v1/playlists'));
  }

  clearSpotifyCache() {
    this.spotifyCache.clear();
  }

  clearArtworkCache() {
    this.artworkCache.clear();
  }

  clearAllCaches() {
    this.fetchCache.clear();
    this.playlistCache.clear();
    this.trackCache.clear();
    this.artworkCache.clear();
    this.spotifyCache.clear();
    this.newMusicCache.clear();
    this.genreCache.clear();
  }

  // Cleanup expired entries
  cleanup() {
    this.fetchCache.cleanup();
    this.playlistCache.cleanup();
    this.trackCache.cleanup();
    this.artworkCache.cleanup();
    this.spotifyCache.cleanup();
    this.newMusicCache.cleanup();
    this.genreCache.cleanup();
  }

  // Get cache statistics
  getStats() {
    return {
      playlists: this.playlistCache.cache.size,
      tracks: this.trackCache.cache.size,
      artwork: this.artworkCache.cache.size,
      spotify: this.spotifyCache.cache.size,
      newMusic: this.newMusicCache.cache.size,
      genres: this.genreCache.cache.size,
      total: this.playlistCache.cache.size + 
             this.trackCache.cache.size + 
             this.artworkCache.cache.size + 
             this.spotifyCache.cache.size +
             this.newMusicCache.cache.size +
             this.genreCache.cache.size
    };
  }

  // Preload critical data
  async preloadPlaylistData(playlistId) {
    try {
      // Check if already cached
      if (this.getCachedPlaylist(playlistId) && this.getCachedTracks(playlistId)) {
        return;
      }

      // Fetch playlist and tracks in parallel with credentials
      const [playlistResponse, tracksResponse] = await Promise.all([
        fetch(`/api/v1/playlists/${playlistId}`, {
          credentials: 'include',
          cache: 'no-store'
        }),
        fetch(`/api/v1/tracks/playlist/${playlistId}`, {
          credentials: 'include',
          cache: 'no-store'
        })
      ]);

      if (playlistResponse.ok && tracksResponse.ok) {
        const [playlistData, tracksData] = await Promise.all([
          playlistResponse.json(),
          tracksResponse.json()
        ]);

        // Cache the results
        this.setCachedPlaylist(playlistId, playlistData.data);
        this.setCachedTracks(playlistId, tracksData.data);
      }
    } catch (error) {
      console.error('Error preloading playlist data:', error);
    }
  }

  // Destroy the service
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clearAllCaches();
  }
}

// Create singleton instance
export const cacheService = new CacheService();

// Enhanced fetch with caching
export async function cachedFetch(url, options = {}) {
  const { cache = true, ttl, ...fetchOptions } = options;

  // Always include credentials for API calls
  const enhancedOptions = {
    credentials: 'include',
    cache: 'no-store',
    ...fetchOptions
  };

  if (!cache) {
    return fetch(url, enhancedOptions);
  }

  // Create cache key from URL and options
  const cacheKey = `fetch:${url}:${JSON.stringify(fetchOptions)}`;

  // Check cache first
  const cached = cacheService.getCachedFetch(cacheKey);
  if (cached) {
    try {
      // Validate cached data before creating Response
      const jsonString = JSON.stringify(cached);
      if (jsonString === 'undefined' || jsonString === 'null') {
        console.warn('Invalid cached data, bypassing cache:', cacheKey);
      } else {
        return new Response(jsonString, {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } catch (error) {
      console.error('Cache JSON stringify error:', error, 'Key:', cacheKey);
      // Fall through to fresh fetch
    }
  }

  try {
    const response = await fetch(url, enhancedOptions);

    if (response.ok) {
      try {
        const data = await response.clone().json();
        cacheService.setCachedFetch(cacheKey, data, ttl);
      } catch (error) {
        console.warn('Failed to cache JSON response for', cacheKey, error);
      }
    }

    return response;
  } catch (error) {
    console.error('Cached fetch error:', error);
    throw error;
  }
}

export default cacheService;
