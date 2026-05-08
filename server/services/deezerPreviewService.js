import axios from 'axios';

class DeezerPreviewService {
  constructor() {
    this.baseUrl = 'https://api.deezer.com';
    this.requestQueue = [];
    this.isProcessingQueue = false;
    this.lastRequestTime = 0;
    this.requestInterval = 100; // 100ms between requests to be respectful
    this.cache = new Map(); // Simple in-memory cache
    // Reduced cache TTL to 2 hours to respect URL expiration
    // Deezer preview URLs typically expire within a few hours
    this.cacheTTL = 2 * 60 * 60 * 1000; // 2 hours
  }

  // Utility to check if a Deezer URL has expired
  isDeezerUrlExpired(deezerUrl) {
    if (!deezerUrl) return true;

    try {
      const url = new URL(deezerUrl);
      const expParam = url.searchParams.get('hdnea');

      if (!expParam) {
        return true;
      }

      let decodedParam = expParam;
      try {
        decodedParam = decodeURIComponent(expParam);
      } catch (e) {
        decodedParam = expParam;
      }

      const expMatch = decodedParam.match(/exp[=:](\d+)/i);
      if (!expMatch) {
        return true;
      }

      const expTimestamp = parseInt(expMatch[1]);
      const currentTimestamp = Math.floor(Date.now() / 1000);

      // Consider expired if within 10 minutes of expiration
      const bufferSeconds = 600;
      return currentTimestamp >= (expTimestamp - bufferSeconds);
    } catch (error) {
      return true;
    }
  }

  // Fetch fresh preview URL directly from Deezer track endpoint
  async getFreshPreviewUrl(deezerId) {
    try {
      const response = await this.throttledRequest(`/track/${deezerId}`);
      const data = await response.json();

      if (data && data.preview) {
        return {
          url: data.preview,
          source: 'deezer-direct',
          confidence: 100,
          deezer_id: data.id.toString(),
          attribution: 'Preview powered by Deezer'
        };
      }

      return null;
    } catch (error) {
      console.warn(`Failed to fetch fresh URL for Deezer ID ${deezerId}:`, error.message);
      return null;
    }
  }

  // Main method: Match Flowerpil track to Deezer preview
  async getPreviewForTrack(flowerpilTrack) {
    try {
      // Check cache first
      const cacheKey = `${flowerpilTrack.id}_${flowerpilTrack.isrc || 'no-isrc'}`;
      const cached = this.cache.get(cacheKey);

      // Validate cached data: check both TTL and URL expiration
      if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
        // Additional check: ensure the cached URL hasn't expired
        if (cached.data?.url && !this.isDeezerUrlExpired(cached.data.url)) {
          return cached.data;
        }
        // If URL is expired, clear it from cache and fetch fresh
        this.cache.delete(cacheKey);
      }

      let previewData = null;

      // Strategy 0: If we already have a Deezer ID, fetch fresh URL directly from track endpoint
      // This is the fastest and most reliable way to get a fresh signed URL
      if (flowerpilTrack.deezer_id) {
        previewData = await this.getFreshPreviewUrl(flowerpilTrack.deezer_id);
        if (previewData) {
          // Cache the fresh result
          this.cache.set(cacheKey, {
            data: previewData,
            timestamp: Date.now()
          });
          return previewData;
        }
        // If direct fetch failed, fall through to search strategies
      }

      // Strategy 1: Use existing ISRC from Spotify import (highest accuracy)
      if (flowerpilTrack.isrc) {
        const deezerTrack = await this.searchByISRC(flowerpilTrack.isrc);
        if (deezerTrack?.preview) {
          previewData = {
            url: deezerTrack.preview,
            source: 'deezer-isrc',
            confidence: 100,
            deezer_id: deezerTrack.id.toString(),
            attribution: 'Preview powered by Deezer'
          };
        }
      }

      // Strategy 2: Metadata fallback search if ISRC didn't work
      if (!previewData && flowerpilTrack.artist && flowerpilTrack.title) {
        const deezerTrack = await this.searchByMetadata(
          flowerpilTrack.artist, 
          flowerpilTrack.title,
          flowerpilTrack.album
        );
        
        if (deezerTrack?.preview) {
          const confidence = this.calculateMatchConfidence(deezerTrack, flowerpilTrack);
          previewData = {
            url: deezerTrack.preview,
            source: 'deezer-metadata',
            confidence: confidence,
            deezer_id: deezerTrack.id.toString(),
            attribution: 'Preview powered by Deezer'
          };
        }
      }

      // Cache the result (even if null)
      this.cache.set(cacheKey, {
        data: previewData,
        timestamp: Date.now()
      });

      return previewData;
      
    } catch (error) {
      console.error('Deezer preview fetch failed:', error.message);
      return null;
    }
  }

  // Search by ISRC code - primary matching strategy
  async searchByISRC(isrc) {
    try {
      const response = await this.throttledRequest(`/search/track?q=isrc:${isrc}&limit=1`);
      const data = await response.json();
      return data.data && data.data.length > 0 ? data.data[0] : null;
    } catch (error) {
      console.warn(`ISRC search failed for ${isrc}:`, error.message);
      return null;
    }
  }

  // Search by artist, title, and album metadata - fallback strategy
  async searchByMetadata(artist, title, album = null) {
    try {
      // Clean artist, title, and album for better matching
      const cleanArtist = this.cleanSearchTerm(artist);
      const cleanTitle = this.cleanSearchTerm(title);
      const cleanAlbum = album ? this.cleanSearchTerm(album) : null;

      // Strategy 1: Simple combined search (most reliable with Deezer)
      // Deezer's quoted/strict searches are often less reliable than simple keyword matching
      const simpleQuery = encodeURIComponent(`${cleanArtist} ${cleanTitle}`);
      const simpleResponse = await this.throttledRequest(`/search/track?q=${simpleQuery}&limit=20`);
      const simpleData = await simpleResponse.json();

      if (simpleData.data && simpleData.data.length > 0) {
        const match = this.findBestMetadataMatch(simpleData.data, artist, title, album);
        if (match) return match;
      }

      // Strategy 2: Try with album if available and first search didn't work
      if (cleanAlbum) {
        const albumQuery = encodeURIComponent(`${cleanArtist} ${cleanTitle} ${cleanAlbum}`);
        const albumResponse = await this.throttledRequest(`/search/track?q=${albumQuery}&limit=10`);
        const albumData = await albumResponse.json();

        if (albumData.data && albumData.data.length > 0) {
          const match = this.findBestMetadataMatch(albumData.data, artist, title, album);
          if (match) return match;
        }
      }

      // Strategy 3: Try artist name only as last resort (for exact artist matches)
      const artistOnlyQuery = encodeURIComponent(`artist:"${cleanArtist}"`);
      const artistResponse = await this.throttledRequest(`/search/track?q=${artistOnlyQuery}&limit=50`);
      const artistData = await artistResponse.json();

      if (artistData.data && artistData.data.length > 0) {
        return this.findBestMetadataMatch(artistData.data, artist, title, album);
      }

      return null;
    } catch (error) {
      console.warn(`Metadata search failed for ${artist} - ${title}:`, error.message);
      return null;
    }
  }

  // Find best match from metadata search results
  findBestMetadataMatch(tracks, originalArtist, originalTitle, originalAlbum = null) {
    if (!tracks || tracks.length === 0) return null;

    let bestMatch = null;
    let bestScore = 0;

    for (const track of tracks) {
      if (!track.preview) continue; // Skip tracks without previews

      const score = this.calculateMatchScore(track, originalArtist, originalTitle, originalAlbum);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = track;
      }
    }

    // Lower threshold to 65% since Deezer search is inconsistent
    // and we have good fuzzy matching logic
    return bestScore > 0.65 ? bestMatch : null;
  }

  // Calculate match confidence score between Deezer track and Flowerpil track
  calculateMatchConfidence(deezerTrack, flowerpilTrack) {
    const score = this.calculateMatchScore(deezerTrack, flowerpilTrack.artist, flowerpilTrack.title, flowerpilTrack.album);
    // Ensure confidence never exceeds 100%
    return Math.min(Math.round(score * 100), 100);
  }

  // Calculate similarity score between tracks
  calculateMatchScore(deezerTrack, originalArtist, originalTitle, originalAlbum = null) {
    if (!deezerTrack.artist || !deezerTrack.artist.name) return 0;

    const deezerArtist = deezerTrack.artist.name.toLowerCase();
    const deezerTitle = deezerTrack.title.toLowerCase();
    const targetArtist = originalArtist.toLowerCase();
    const targetTitle = originalTitle.toLowerCase();

    // Calculate similarity using string matching
    const artistScore = this.stringSimilarity(deezerArtist, targetArtist);
    const titleScore = this.stringSimilarity(deezerTitle, targetTitle);
    
    // Include album matching if available
    let albumScore = 0;
    let weights = { artist: 0.4, title: 0.6, album: 0 };
    
    if (originalAlbum && deezerTrack.album && deezerTrack.album.title) {
      const deezerAlbum = deezerTrack.album.title.toLowerCase();
      const targetAlbum = originalAlbum.toLowerCase();
      albumScore = this.stringSimilarity(deezerAlbum, targetAlbum);
      
      // Reweight with album consideration
      weights = { artist: 0.3, title: 0.5, album: 0.2 };
    }
    
    return (artistScore * weights.artist) + (titleScore * weights.title) + (albumScore * weights.album);
  }

  // Simple string similarity calculation
  stringSimilarity(str1, str2) {
    // Normalize strings
    const s1 = this.normalizeString(str1);
    const s2 = this.normalizeString(str2);

    if (s1 === s2) return 1;
    if (s1.length === 0 || s2.length === 0) return 0;

    // Check if one string contains the other (partial match)
    if (s1.includes(s2) || s2.includes(s1)) {
      // Fix: Ensure this never exceeds 1.0
      const longer = Math.max(s1.length, s2.length);
      const shorter = Math.min(s1.length, s2.length);
      return (shorter / longer) * 0.8;
    }

    // Levenshtein distance calculation
    const matrix = [];
    for (let i = 0; i <= s2.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= s1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= s2.length; i++) {
      for (let j = 1; j <= s1.length; j++) {
        if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    const distance = matrix[s2.length][s1.length];
    const maxLength = Math.max(s1.length, s2.length);
    return 1 - (distance / maxLength);
  }

  // Normalize string for comparison
  normalizeString(str) {
    return str
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove special characters
      .replace(/\s+/g, ' ')    // Normalize whitespace
      .trim();
  }

  // Clean search terms for better API queries
  cleanSearchTerm(term) {
    return term
      .replace(/[^\w\s&]/g, '') // Keep alphanumeric, spaces, and ampersands
      .replace(/\s+/g, ' ')      // Normalize whitespace
      .trim();
  }

  // Throttled request with simple queue system
  async throttledRequest(endpoint) {
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

          // Use AbortController for timeout handling (fetch doesn't support timeout option)
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);

          try {
            const response = await fetch(`${this.baseUrl}${endpoint}`, {
              method: 'GET',
              headers: {
                'Accept': 'application/json',
                'User-Agent': 'Flowerpil/1.0.0'
              },
              signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            resolve(response);
          } catch (error) {
            clearTimeout(timeoutId);
            throw error;
          }
        } catch (error) {
          reject(error);
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
      try {
        await request();
      } catch (error) {
        console.warn('Queued request failed:', error.message);
      }
    }
    
    this.isProcessingQueue = false;
  }

  // Batch preview fetching for playlist optimization
  async getPreviewsForTracks(tracks) {
    const results = [];
    
    for (const track of tracks) {
      try {
        const preview = await this.getPreviewForTrack(track);
        results.push({
          trackId: track.id,
          preview: preview
        });
      } catch (error) {
        console.warn(`Failed to get preview for track ${track.id}:`, error.message);
        results.push({
          trackId: track.id,
          preview: null
        });
      }
    }
    
    return results;
  }

  // Clear expired cache entries
  clearExpiredCache() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp >= this.cacheTTL) {
        this.cache.delete(key);
      }
    }
  }

  // Get cache statistics
  getCacheStats() {
    return {
      size: this.cache.size,
      ttl: this.cacheTTL,
      hit_rate: 'Not implemented' // Could add hit/miss tracking if needed
    };
  }
}

export default DeezerPreviewService;