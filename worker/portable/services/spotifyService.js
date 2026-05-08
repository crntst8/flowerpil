import axios from 'axios';

class SpotifyService {
  constructor() {
    this.clientId = process.env.SPOTIFY_CLIENT_ID || '';
    this.clientSecret = process.env.SPOTIFY_CLIENT_SECRET || '';
    this.baseURL = 'https://api.spotify.com/v1';
    this.authURL = 'https://accounts.spotify.com';

    // Simple rate limiting (8 req/sec)
    this.requestQueue = [];
    this.isProcessingQueue = false;
    this.lastRequestTime = 0;
    this.requestInterval = 125;

    this.appAccessToken = null;
    this.appTokenExpiry = 0;
  }

  async makeRateLimitedRequest(config, retryCount = 0) {
    const maxRetries = 3;
    const backoffBase = 1000;
    return new Promise((resolve, reject) => {
      this.requestQueue.push(async () => {
        try {
          const now = Date.now();
          const delta = now - this.lastRequestTime;
          if (delta < this.requestInterval) {
            await new Promise(r => setTimeout(r, this.requestInterval - delta));
          }
          this.lastRequestTime = Date.now();
          const response = await axios(config);
          resolve(response);
        } catch (error) {
          if (error.response?.status === 429 && retryCount < maxRetries) {
            const retryAfter = error.response.headers['retry-after']
              ? parseInt(error.response.headers['retry-after']) * 1000
              : backoffBase * Math.pow(2, retryCount);
            setTimeout(async () => {
              try {
                const result = await this.makeRateLimitedRequest(config, retryCount + 1);
                resolve(result);
              } catch (retryError) {
                reject(retryError);
              }
            }, retryAfter);
          } else {
            reject(error);
          }
        }
      });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.isProcessingQueue || this.requestQueue.length === 0) return;
    this.isProcessingQueue = true;
    while (this.requestQueue.length > 0) {
      const job = this.requestQueue.shift();
      await job();
    }
    this.isProcessingQueue = false;
  }

  async getClientCredentialsToken() {
    if (this.appAccessToken && Date.now() < (this.appTokenExpiry - 60_000)) {
      return this.appAccessToken;
    }
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Spotify credentials not configured');
    }
    const params = new URLSearchParams({ grant_type: 'client_credentials' });
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
  }

  async searchByISRC(isrc) {
    if (!isrc || String(isrc).trim() === '') return null;
    try {
      const token = await this.getClientCredentialsToken();
      const response = await this.makeRateLimitedRequest({
        method: 'get',
        url: `${this.baseURL}/search`,
        headers: { 'Authorization': `Bearer ${token}` },
        params: { q: `isrc:${String(isrc).trim()}`, type: 'track', limit: 1 }
      });
      const item = response.data?.tracks?.items?.[0];
      if (!item) return null;
      return {
        id: item.id,
        url: item.external_urls?.spotify || null,
        artist: item.artists?.map(a => a.name).join(', ') || null,
        title: item.name || null,
        album: item.album?.name || null,
        source: 'isrc'
      };
    } catch (e) {
      return null;
    }
  }

  async searchByMetadata(artist, title) {
    if (!artist || !title) return null;
    try {
      const token = await this.getClientCredentialsToken();
      const response = await this.makeRateLimitedRequest({
        method: 'get',
        url: `${this.baseURL}/search`,
        headers: { 'Authorization': `Bearer ${token}` },
        params: { q: `${artist} ${title}`, type: 'track', limit: 1 }
      });
      const item = response.data?.tracks?.items?.[0];
      if (!item) return null;
      return {
        id: item.id,
        url: item.external_urls?.spotify || null,
        artist: item.artists?.map(a => a.name).join(', ') || null,
        title: item.name || null,
        album: item.album?.name || null,
        source: 'metadata'
      };
    } catch (e) {
      return null;
    }
  }

  async searchByTrack(track) {
    if (track?.isrc) {
      const viaIsrc = await this.searchByISRC(track.isrc);
      if (viaIsrc) return viaIsrc;
    }
    return await this.searchByMetadata(track?.artist, track?.title);
  }
}

export default SpotifyService;

