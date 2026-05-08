import { searchAggregator } from './searchAggregatorService.js';

const INSTAGRAM_HOSTS = new Set([
  'instagram.com',
  'www.instagram.com',
  'm.instagram.com'
]);

const RESERVED_PATHS = new Set([
  'p',
  'reel',
  'reels',
  'tv',
  'explore',
  'stories',
  'accounts',
  'about',
  'help',
  'press',
  'developers',
  'developer',
  'api',
  'privacy',
  'legal',
  'directory',
  'tag',
  'tags',
  'music',
  'business',
  'ads',
  'web',
  'community',
  'topics'
]);

const normalizeWhitespace = (value) => String(value || '').replace(/\s+/g, ' ').trim();

export const parseCustomSources = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
};

export const hasInstagramSource = (sources) => {
  const list = parseCustomSources(sources);
  return list.some((source) => {
    const name = String(source?.name || '').toLowerCase();
    const url = String(source?.url || '').toLowerCase();
    return name === 'instagram' || url.includes('instagram.com');
  });
};

export const addInstagramSource = (sources, url) => {
  const list = parseCustomSources(sources)
    .map((source) => ({
      name: normalizeWhitespace(source?.name || ''),
      url: normalizeWhitespace(source?.url || '')
    }))
    .filter((source) => source.name && source.url);

  const exists = list.some((source) => {
    const name = source.name.toLowerCase();
    const sourceUrl = source.url.toLowerCase();
    return name === 'instagram' && sourceUrl === url.toLowerCase();
  });

  if (!exists) {
    list.push({ name: 'Instagram', url });
  }

  return list;
};

export const normalizeInstagramProfileUrl = (rawUrl) => {
  if (!rawUrl || typeof rawUrl !== 'string') return null;

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (![...INSTAGRAM_HOSTS].some((allowed) => host === allowed)) return null;

  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length !== 1) return null;

  const handle = segments[0].trim();
  if (!handle) return null;
  if (RESERVED_PATHS.has(handle.toLowerCase())) return null;

  return `https://www.instagram.com/${handle}/`;
};

export const findInstagramProfileForArtist = async (artist) => {
  const normalizedArtist = normalizeWhitespace(artist);
  if (!normalizedArtist) return null;

  const query = `site:instagram.com ${normalizedArtist} instagram`;
  const results = await searchAggregator({ query, limit: 6, maxResults: 12 });

  for (const result of results) {
    const profile = normalizeInstagramProfileUrl(result?.url);
    if (profile) return profile;
  }

  return null;
};
