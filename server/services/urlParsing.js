/**
 * URL Parsing Service
 * Extracts provider type and IDs from DSP URLs
 */

const PROVIDER_PATTERNS = {
  spotify: {
    regex: /(?:open\.spotify\.com|spotify:)(\/|:)(track|album|playlist)(\/|:)([a-zA-Z0-9]+)/,
    groups: { type: 2, id: 4 }
  },
  apple: {
    regex: /music\.apple\.com\/([a-z]{2})\/(album|song|playlist)\/[^/]+\/([a-zA-Z0-9._-]+)(?:\?i=(\d+))?/,
    groups: { storefront: 1, type: 2, albumId: 3, trackId: 4 }
  },
  tidal: {
    regex: /tidal\.com\/(browse\/)?(track|album|playlist)\/(\d+)/,
    groups: { type: 2, id: 3 }
  },
  youtube: {
    regex: /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/,
    groups: { id: 1 }
  },
  qobuz: {
    regex: /(?:www\.)?(?:qobuz\.com\/[a-z]{2}-[a-z]{2}\/(playlist|album)\/[^/]+\/|open\.qobuz\.com\/(playlist|album)\/)([a-zA-Z0-9_-]+)/i,
    groups: { type: 1, altType: 2, id: 3 }
  },
  soundcloud: {
    regex: /soundcloud\.com\/([^/]+)\/(?:sets\/)?([^/\?]+)/,
    groups: { artist: 1, trackOrSet: 2 }
  },
  bandcamp: {
    regex: /(?:[^.]+\.)?bandcamp\.com\/(album|track)\/([^/\?]+)/i,
    groups: { type: 1, slug: 2 }
  }
};

/**
 * Parse a DSP URL to extract provider and metadata
 * @param {string} url - The URL to parse
 * @returns {Object|null} Parsed URL info or null if unrecognized
 */
export function parseUrl(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }

  const normalized = url.trim();

  for (const [provider, pattern] of Object.entries(PROVIDER_PATTERNS)) {
    const match = normalized.match(pattern.regex);
    if (match) {
      const result = {
        provider,
        url: normalized,
        raw: normalized
      };

      // Extract groups based on provider
      switch (provider) {
        case 'spotify':
          result.type = match[pattern.groups.type];
          result.id = match[pattern.groups.id];
          break;

        case 'apple':
          result.storefront = match[pattern.groups.storefront];
          result.type = match[pattern.groups.type];
          result.albumId = match[pattern.groups.albumId];
          result.trackId = match[pattern.groups.trackId];
          result.id = result.trackId || result.albumId;
          break;

        case 'tidal':
          result.type = match[pattern.groups.type];
          result.id = match[pattern.groups.id];
          break;

        case 'youtube':
          result.type = 'track'; // YouTube links are always treated as tracks
          result.id = match[pattern.groups.id];
          break;

        case 'qobuz':
          result.type = match[pattern.groups.type] || match[pattern.groups.altType];
          result.id = match[pattern.groups.id];
          break;

        case 'soundcloud':
          result.artist = match[pattern.groups.artist];
          result.trackOrSet = match[pattern.groups.trackOrSet];
          // Determine if it's a set (playlist) based on URL structure
          result.type = normalized.includes('/sets/') ? 'playlist' : 'track';
          result.id = `${result.artist}/${result.trackOrSet}`;
          break;

        case 'bandcamp':
          result.type = match[pattern.groups.type];
          result.slug = match[pattern.groups.slug];
          result.id = result.slug;
          break;
      }

      return result;
    }
  }

  return null;
}

/**
 * Validate if a URL is a supported DSP URL
 * @param {string} url - The URL to validate
 * @returns {boolean}
 */
export function isValidDSPUrl(url) {
  return parseUrl(url) !== null;
}

/**
 * Get supported provider names
 * @returns {string[]}
 */
export function getSupportedProviders() {
  return Object.keys(PROVIDER_PATTERNS);
}

export default {
  parseUrl,
  isValidDSPUrl,
  getSupportedProviders
};
