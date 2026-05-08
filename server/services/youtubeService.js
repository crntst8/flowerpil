import axios from 'axios';

const DEFAULT_403_COOLDOWN_MS = 30 * 60 * 1000;
const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * YouTube Data API v3 Service
 * Searches for tracks by ISRC and metadata with confidence scoring
 */
class YouTubeService {
  constructor() {
    this.apiKey = process.env.YOUTUBE_API_KEY;
    this.baseURL = 'https://www.googleapis.com/youtube/v3';
    this.requestQueue = [];
    this.isProcessingQueue = false;
    this.lastRequestTime = 0;
    this.requestInterval = 100; // Rate limiting: 10 req/sec conservative
    this.cache = new Map();
    this.cacheTTL = 20 * 60 * 1000; // 20 minutes
    this.cooldownDurationMs = parsePositiveInt(process.env.YOUTUBE_403_COOLDOWN_MS, DEFAULT_403_COOLDOWN_MS);
    this.cooldownUntil = 0;
    this.cooldownSuppressedCalls = 0;
  }

  getErrorStatus(error) {
    const status = Number(error?.response?.status || error?.status || 0);
    return Number.isFinite(status) && status > 0 ? status : null;
  }

  is403Error(error) {
    return this.getErrorStatus(error) === 403;
  }

  isCooldownActive() {
    return this.cooldownUntil > Date.now();
  }

  closeCooldownWindowIfExpired() {
    if (!this.cooldownUntil || this.isCooldownActive()) {
      return;
    }

    if (this.cooldownSuppressedCalls > 0) {
      console.info('[YOUTUBE_403_COOLDOWN_CLOSED]', {
        suppressedCalls: this.cooldownSuppressedCalls
      });
    }

    this.cooldownUntil = 0;
    this.cooldownSuppressedCalls = 0;
  }

  shouldShortCircuitForCooldown() {
    this.closeCooldownWindowIfExpired();
    if (!this.isCooldownActive()) {
      return false;
    }

    this.cooldownSuppressedCalls += 1;
    return true;
  }

  open403Cooldown(context = 'unknown') {
    const now = Date.now();
    const wasActive = this.isCooldownActive();

    this.cooldownUntil = Math.max(this.cooldownUntil, now + this.cooldownDurationMs);
    if (wasActive) {
      return;
    }

    this.cooldownSuppressedCalls = 0;
    console.warn('[YOUTUBE_403_COOLDOWN_OPEN]', {
      context,
      cooldownMs: this.cooldownDurationMs,
      until: new Date(this.cooldownUntil).toISOString()
    });
  }

  /**
   * Rate-limited API request
   */
  async makeRateLimitedRequest(config) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push(async () => {
        try {
          const now = Date.now();
          const timeSinceLastRequest = now - this.lastRequestTime;
          if (timeSinceLastRequest < this.requestInterval) {
            await new Promise(res => setTimeout(res, this.requestInterval - timeSinceLastRequest));
          }

          this.lastRequestTime = Date.now();
          const response = await axios(config);
          resolve(response);
        } catch (error) {
          reject(error);
        }
      });

      this.processQueue();
    });
  }

  /**
   * Process request queue sequentially
   */
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

  /**
   * Search YouTube by ISRC (highest confidence)
   * @param {string} isrc - International Standard Recording Code
   * @returns {Object|null} YouTube result with url, videoId, confidence
   */
  async searchByISRC(isrc) {
    if (!isrc || !String(isrc).trim()) return null;
    if (!this.apiKey) {
      console.warn('⚠️  YouTube API key not configured');
      return null;
    }

    const cleanIsrc = String(isrc).trim();
    const cacheKey = `isrc:${cleanIsrc}`;

    if (this.shouldShortCircuitForCooldown()) {
      return null;
    }

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    try {
      const response = await this.makeRateLimitedRequest({
        method: 'get',
        url: `${this.baseURL}/search`,
        params: {
          part: 'snippet',
          q: cleanIsrc,
          type: 'video',
          videoCategoryId: '10', // Music category
          maxResults: 10,
          key: this.apiKey
        }
      });

      const items = response.data?.items || [];
      if (!items.length) {
        this.cache.set(cacheKey, { data: null, timestamp: Date.now() });
        return null;
      }

      // Rank results: prefer official, topic, and artist channels
      const ranked = items.map(item => {
        const title = item.snippet?.title || '';
        const channelTitle = item.snippet?.channelTitle || '';
        const videoId = item.id?.videoId;

        let score = 0;

        // Boost official/topic channels
        if (channelTitle.includes('- Topic') || channelTitle.includes('VEVO')) {
          score += 30;
        }
        if (title.toLowerCase().includes('official')) {
          score += 20;
        }
        if (title.toLowerCase().includes('audio') || title.toLowerCase().includes('lyric')) {
          score += 10;
        }

        return {
          videoId,
          title,
          channelTitle,
          score
        };
      }).sort((a, b) => b.score - a.score);

      const best = ranked[0];
      if (!best || !best.videoId) {
        this.cache.set(cacheKey, { data: null, timestamp: Date.now() });
        return null;
      }

      // Get video details for duration
      const detailsResponse = await this.makeRateLimitedRequest({
        method: 'get',
        url: `${this.baseURL}/videos`,
        params: {
          part: 'contentDetails,snippet',
          id: best.videoId,
          key: this.apiKey
        }
      });

      const videoDetails = detailsResponse.data?.items?.[0];
      const durationMs = videoDetails ? this.parseDuration(videoDetails.contentDetails?.duration) : null;

      const result = {
        url: `https://www.youtube.com/watch?v=${best.videoId}`,
        videoId: best.videoId,
        title: best.title,
        channel: best.channelTitle,
        duration_ms: durationMs,
        confidence: 95, // ISRC match is high confidence
        source: 'isrc'
      };

      this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;

    } catch (error) {
      if (this.is403Error(error)) {
        this.open403Cooldown('searchByISRC');
        return null;
      }
      console.error('❌ YouTube ISRC search failed:', error.message);
      return null;
    }
  }

  /**
   * Search YouTube by metadata (fallback)
   * @param {Object} params - { title, artist, duration_ms? }
   * @returns {Object|null} YouTube result with url, videoId, confidence
   */
  async searchByMetadata({ title, artist, duration_ms }) {
    if (!title?.trim() || !artist?.trim()) return null;
    if (!this.apiKey) {
      console.warn('⚠️  YouTube API key not configured');
      return null;
    }

    const query = `${artist.trim()} ${title.trim()} audio`;
    const cacheKey = `meta:${artist}:${title}`;

    if (this.shouldShortCircuitForCooldown()) {
      return null;
    }

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    try {
      const response = await this.makeRateLimitedRequest({
        method: 'get',
        url: `${this.baseURL}/search`,
        params: {
          part: 'snippet',
          q: query,
          type: 'video',
          videoCategoryId: '10', // Music category
          maxResults: 10,
          key: this.apiKey
        }
      });

      const items = response.data?.items || [];
      if (!items.length) {
        this.cache.set(cacheKey, { data: null, timestamp: Date.now() });
        return null;
      }

      // Rank by title/artist match + channel quality
      const titleLower = title.toLowerCase();
      const artistLower = artist.toLowerCase();

      const ranked = items.map(item => {
        const videoTitle = (item.snippet?.title || '').toLowerCase();
        const channelTitle = item.snippet?.channelTitle || '';
        const videoId = item.id?.videoId;

        let score = 0;

        // Title match
        if (videoTitle.includes(titleLower)) score += 40;
        // Artist match
        if (videoTitle.includes(artistLower) || channelTitle.toLowerCase().includes(artistLower)) score += 30;
        // Channel quality
        if (channelTitle.includes('- Topic') || channelTitle.includes('VEVO')) score += 20;
        if (videoTitle.includes('official')) score += 10;
        if (videoTitle.includes('audio') || videoTitle.includes('lyric')) score += 5;

        return {
          videoId,
          title: item.snippet?.title,
          channelTitle,
          score
        };
      }).sort((a, b) => b.score - a.score);

      const best = ranked[0];
      if (!best || !best.videoId || best.score < 50) {
        this.cache.set(cacheKey, { data: null, timestamp: Date.now() });
        return null;
      }

      // Get video details for duration matching
      const detailsResponse = await this.makeRateLimitedRequest({
        method: 'get',
        url: `${this.baseURL}/videos`,
        params: {
          part: 'contentDetails,snippet',
          id: best.videoId,
          key: this.apiKey
        }
      });

      const videoDetails = detailsResponse.data?.items?.[0];
      const durationMs = videoDetails ? this.parseDuration(videoDetails.contentDetails?.duration) : null;

      // Duration matching for confidence boost
      let confidence = best.score >= 70 ? 85 : 70;
      if (duration_ms && durationMs) {
        const diff = Math.abs(duration_ms - durationMs);
        if (diff <= 1500) {
          confidence = Math.min(95, confidence + 10);
        } else if (diff <= 3000) {
          confidence = Math.max(60, confidence - 5);
        } else {
          confidence = Math.max(50, confidence - 15);
        }
      }

      const result = {
        url: `https://www.youtube.com/watch?v=${best.videoId}`,
        videoId: best.videoId,
        title: best.title,
        channel: best.channelTitle,
        duration_ms: durationMs,
        confidence,
        source: 'metadata'
      };

      this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;

    } catch (error) {
      if (this.is403Error(error)) {
        this.open403Cooldown('searchByMetadata');
        return null;
      }
      console.error('❌ YouTube metadata search failed:', error.message);
      return null;
    }
  }

  /**
   * Parse ISO 8601 duration to milliseconds
   * @param {string} duration - e.g., "PT3M45S"
   * @returns {number|null}
   */
  parseDuration(duration) {
    if (!duration) return null;

    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return null;

    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    const seconds = parseInt(match[3] || '0', 10);

    return (hours * 3600 + minutes * 60 + seconds) * 1000;
  }

  /**
   * Unified search by track object
   * @param {Object} track - { artist, title, isrc?, duration_ms? }
   * @returns {Object|null}
   */
  async searchByTrack(track) {
    if (this.shouldShortCircuitForCooldown()) {
      return null;
    }

    // Try ISRC first
    if (track?.isrc) {
      const viaIsrc = await this.searchByISRC(track.isrc);
      if (viaIsrc) return viaIsrc;
    }

    // Fallback to metadata
    return await this.searchByMetadata({
      title: track?.title,
      artist: track?.artist,
      duration_ms: track?.duration_ms
    });
  }

  /**
   * Test YouTube API connection
   * @returns {boolean}
   */
  async testConnection() {
    if (!this.apiKey) {
      console.warn('⚠️  YouTube API key not configured');
      return false;
    }

    try {
      await this.makeRateLimitedRequest({
        method: 'get',
        url: `${this.baseURL}/search`,
        params: {
          part: 'snippet',
          q: 'test',
          type: 'video',
          maxResults: 1,
          key: this.apiKey
        }
      });
      console.log('✅ YouTube API connection successful');
      return true;
    } catch (error) {
      console.error('❌ YouTube API connection failed:', error.message);
      return false;
    }
  }
}

// Export singleton instance
const youtubeService = new YouTubeService();

export default youtubeService;
export { YouTubeService, youtubeService };
