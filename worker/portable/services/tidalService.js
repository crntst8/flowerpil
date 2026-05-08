import crypto from 'crypto';

class TidalService {
  constructor() {
    this.baseUrl = 'https://openapi.tidal.com/v2';
    this.tokenUrl = 'https://auth.tidal.com/v1/oauth2/token';
    this.authUrl = 'https://login.tidal.com/authorize';
    this.accessToken = null;
    this.tokenExpiry = null;
    this.rateLimitDelay = 100;
    this.countryCode = 'AU';
  }

  async getAccessToken() {
    const clientId = process.env.TIDAL_CLIENT_ID;
    const clientSecret = process.env.TIDAL_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error('Tidal credentials not configured. Set TIDAL_CLIENT_ID and TIDAL_CLIENT_SECRET.');
    }
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry - 60000) {
      return this.accessToken;
    }
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
    this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;
    return this.accessToken;
  }

  async makeRequest(endpoint, params = {}) {
    const token = await this.getAccessToken();
    const url = new URL(`${this.baseUrl}${endpoint}`);
    const allParams = { countryCode: this.countryCode, ...params };
    Object.entries(allParams).forEach(([k, v]) => { if (v !== null && v !== undefined) url.searchParams.append(k, v); });
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Flowerpil/portable-worker'
      }
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Tidal API error: ${response.status} - ${errorData.errors?.[0]?.detail || response.statusText}`);
    }
    return await response.json();
  }

  findIncludedResource(included, type, id) {
    if (!included || !Array.isArray(included)) return null;
    return included.find((r) => r.type === type && r.id === id) || null;
  }

  async delay(ms) { return new Promise(r => setTimeout(r, ms)); }

  async searchByISRC(isrc) {
    if (!isrc?.trim()) return null;
    const data = await this.makeRequest('/tracks', { 'filter[isrc]': isrc.trim(), include: 'artists,albums' });
    if (data.data && Array.isArray(data.data) && data.data.length > 0) {
      const track = data.data[0];
      const artist = this.findIncludedResource(data.included, 'artists', track.relationships?.artists?.data?.[0]?.id);
      const album = this.findIncludedResource(data.included, 'albums', track.relationships?.albums?.data?.[0]?.id);
      return {
        id: track.id,
        url: `https://tidal.com/browse/track/${track.id}`,
        title: track.attributes?.title || 'Unknown Title',
        artist: artist?.attributes?.name || 'Unknown Artist',
        confidence: 100,
        source: 'isrc',
        isrc: track.attributes?.isrc,
        album: album?.attributes?.title,
        releaseDate: album?.attributes?.releaseDate,
        duration: track.attributes?.duration
      };
    }
    return null;
  }

  async searchByMetadata(artist, title) {
    // Not implemented in v2 catalog; return null
    return null;
  }

  async searchByTrack(track) {
    await this.delay(this.rateLimitDelay);
    if (track.isrc) {
      try {
        const viaIsrc = await this.searchByISRC(track.isrc);
        if (viaIsrc) return viaIsrc;
      } catch (e) {
        // ignore
      }
    }
    return await this.searchByMetadata(track.artist, track.title);
  }
}

const tidalService = new TidalService();
export const searchTidalByTrack = (track) => tidalService.searchByTrack(track);
export default tidalService;

