import jwt from 'jsonwebtoken';
import axios from 'axios';
import fs from 'fs';
import { isAbsolute, join } from 'path';

/**
 * Minimal Apple Music API Service for Portable Worker
 * Only includes catalog search functionality (ISRC and metadata)
 */
class AppleMusicApiService {
  constructor() {
    this.baseURL = 'https://api.music.apple.com';
  }

  getConfig() {
    return {
      teamId: process.env.APPLE_MUSIC_TEAM_ID || '',
      keyId: process.env.APPLE_MUSIC_KEY_ID || '',
      privateKey: process.env.APPLE_MUSIC_PRIVATE_KEY || '',
      privateKeyPath: process.env.APPLE_MUSIC_PRIVATE_KEY_PATH || '',
      tokenTTLMin: parseInt(process.env.APPLE_MUSIC_TOKEN_TTL_MIN || '30', 10)
    };
  }

  getPrivateKeyPEM() {
    const { privateKey, privateKeyPath } = this.getConfig();

    // Try inline key first
    if (privateKey && privateKey.includes('BEGIN')) {
      return privateKey.replace(/\\n/g, '\n');
    }

    // Try reading from file
    if (privateKeyPath) {
      const pathsToTry = [
        privateKeyPath,
        !isAbsolute(privateKeyPath) ? join(process.cwd(), privateKeyPath) : null
      ].filter(Boolean);

      for (const p of pathsToTry) {
        try {
          const content = fs.readFileSync(p, 'utf8');
          if (content && content.includes('BEGIN')) return content;
        } catch (e) {
          // Continue to next path
        }
      }
      throw new Error(`Apple Music private key not found at: ${privateKeyPath}`);
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

  async apiRequest({ method, url, params, timeout }) {
    const { token } = this.getDeveloperToken();
    const headers = {
      Authorization: `Bearer ${token}`
    };

    const requestTimeout = typeof timeout === 'number'
      ? timeout
      : parseInt(process.env.APPLE_MUSIC_HTTP_TIMEOUT_MS || '15000', 10);

    const response = await axios({
      method,
      url: `${this.baseURL}${url}`,
      params,
      headers,
      timeout: Number.isFinite(requestTimeout) && requestTimeout > 0 ? requestTimeout : undefined
    });

    return response.data;
  }

  normalizeStorefront(storefront) {
    if (!storefront) return 'us';
    if (typeof storefront === 'string') {
      const trimmed = storefront.trim().toLowerCase();
      return /^[a-z]{2}$/i.test(trimmed) ? trimmed : 'us';
    }
    return 'us';
  }

  async searchCatalogByISRC(isrc, storefront = 'us') {
    if (!isrc || String(isrc).trim() === '') return null;

    const region = this.normalizeStorefront(storefront);
    const params = { 'filter[isrc]': String(isrc).trim(), limit: 1 };

    const data = await this.apiRequest({
      method: 'get',
      url: `/v1/catalog/${encodeURIComponent(region)}/songs`,
      params
    });

    const song = data?.data?.[0];
    if (!song) return null;

    const attrs = song.attributes || {};
    return {
      id: song.id,
      url: attrs.url || null,
      artist: attrs.artistName || null,
      title: attrs.name || null,
      album: attrs.albumName || null,
      isrc: attrs.isrc || isrc,
      durationMs: attrs.durationInMillis ?? null,
      source: 'api:isrc',
      confidence: 100,
      matchStrategy: 'isrc',
      storefront: region
    };
  }

  async searchCatalogByMetadata({ artist, title, album, storefront = 'us', isrc, durationMs } = {}) {
    if (!artist || !title) return null;

    const region = this.normalizeStorefront(storefront);
    const searchTerm = [artist, title, album].filter(Boolean).join(' ').trim();

    if (!searchTerm) return null;

    const params = {
      term: searchTerm,
      types: 'songs',
      limit: 5
    };

    const data = await this.apiRequest({
      method: 'get',
      url: `/v1/catalog/${encodeURIComponent(region)}/search`,
      params
    });

    const results = data?.results?.songs?.data || [];
    if (!results.length) return null;

    // Return first result (basic matching, no scoring)
    const song = results[0];
    const attrs = song.attributes || {};

    return {
      id: song.id,
      url: attrs.url || null,
      artist: attrs.artistName || null,
      title: attrs.name || null,
      album: attrs.albumName || null,
      isrc: attrs.isrc || isrc || null,
      durationMs: attrs.durationInMillis ?? durationMs ?? null,
      source: 'api:metadata',
      confidence: 85, // Basic confidence
      matchStrategy: 'metadata',
      storefront: region
    };
  }
}

const appleMusicApiService = new AppleMusicApiService();
export default appleMusicApiService;
