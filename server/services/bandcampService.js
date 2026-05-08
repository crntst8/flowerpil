import logger from '../utils/logger.js';

const CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes
const FETCH_TIMEOUT_MS = 12000;

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

function isAllowedBandcampHostname(hostname) {
  if (!hostname) return false;
  const lower = hostname.toLowerCase();
  return lower === 'bandcamp.com' || lower.endsWith('.bandcamp.com');
}

function validateBandcampTrackUrl(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) return null;
  if (!isAllowedBandcampHostname(parsed.hostname)) return null;
  if (parsed.port && !['80', '443'].includes(parsed.port)) return null;
  if (!/\/track\//i.test(parsed.pathname)) return null;
  return parsed.toString();
}

function bandcampSlugToWords(value) {
  if (!value) return '';
  return decodeURIComponent(String(value))
    .replace(/\+/g, ' ')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractUrlHints(bandcampUrl) {
  let parsed;
  try {
    parsed = new URL(bandcampUrl);
  } catch {
    return { artist_hint: null, title_hint: null, bandcamp_artist_slug: null, bandcamp_track_slug: null };
  }

  const hostname = (parsed.hostname || '').toLowerCase();
  const suffix = '.bandcamp.com';
  const artistSlug = hostname.endsWith(suffix) ? hostname.slice(0, -suffix.length) : null;

  const parts = (parsed.pathname || '').split('/').filter(Boolean);
  const trackIndex = parts.findIndex((p) => p.toLowerCase() === 'track');
  const trackSlug = trackIndex >= 0 ? parts[trackIndex + 1] : null;

  const artistHint = artistSlug ? bandcampSlugToWords(artistSlug) : null;
  const titleHint = trackSlug ? bandcampSlugToWords(trackSlug) : null;

  return {
    artist_hint: artistHint || null,
    title_hint: titleHint || null,
    bandcamp_artist_slug: artistSlug || null,
    bandcamp_track_slug: trackSlug || null,
  };
}

function decodeHtmlEntities(value) {
  if (!value) return '';
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, num) => {
      const codePoint = Number(num);
      if (!Number.isFinite(codePoint)) return _;
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return _;
      }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const codePoint = Number.parseInt(hex, 16);
      if (!Number.isFinite(codePoint)) return _;
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return _;
      }
    });
}

function stripTags(value) {
  if (!value) return '';
  return value.replace(/<[^>]+>/g, '');
}

function normalizeText(value) {
  return decodeHtmlEntities(stripTags(value))
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMetaProperty(html, property) {
  if (!html) return null;
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i');
  const m = html.match(rx);
  return m?.[1] ? decodeHtmlEntities(m[1]).trim() : null;
}

function extractFirstMatch(html, regex) {
  if (!html) return null;
  const m = html.match(regex);
  return m?.[1] ?? null;
}

function normalizeCreditsLines(innerHtml) {
  if (!innerHtml) return [];
  const withBreaks = innerHtml.replace(/<br\s*\/?>/gi, '\n');
  const text = decodeHtmlEntities(stripTags(withBreaks));
  return text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function parseReleaseInfo(creditsLines) {
  const joined = creditsLines.join(' ');
  const m = joined.match(/\b(track|album)\s+released\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})\b/i);
  if (!m?.[2]) return { release_date: null, release_date_raw: null, release_year: null };

  const raw = m[2].trim();
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) {
    const yearMatch = raw.match(/(\d{4})/);
    return {
      release_date: null,
      release_date_raw: raw,
      release_year: yearMatch ? Number(yearMatch[1]) : null,
    };
  }

  const d = new Date(parsed);
  const iso = d.toISOString().slice(0, 10);
  return {
    release_date: iso,
    release_date_raw: raw,
    release_year: d.getUTCFullYear(),
  };
}

class BandcampService {
  constructor() {
    this.cache = new Map();
  }

  async resolveTrackUrl(url) {
    const validated = validateBandcampTrackUrl(url);
    if (!validated) {
      throw new Error('Valid Bandcamp track URL is required');
    }

    const cacheKey = `bandcamp:track:${validated}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return { ...cached.data, diagnostics: { cache_hit: true } };
    }

    const startedAt = Date.now();

    const urlHints = extractUrlHints(validated);

    let canonicalUrl = validated;
    let html = '';
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      let resp;
      try {
        resp = await fetch(validated, {
          method: 'GET',
          redirect: 'follow',
          headers: DEFAULT_HEADERS,
          signal: controller.signal,
        });
        canonicalUrl = resp?.url || validated;
        html = await resp.text();
      } finally {
        clearTimeout(timeout);
      }

      if (!resp?.ok) {
        const status = resp?.status || 500;
        throw new Error(`Bandcamp responded with ${status}`);
      }
    } catch (error) {
      const fallback = {
        title: urlHints.title_hint || '',
        artist: urlHints.artist_hint || '',
        album: null,
        year: null,
        artwork_url: null,
        spotify_id: null,
        spotify_url: null,
        isrc: null,
        bandcamp_url: canonicalUrl,
        bandcamp_artist_slug: urlHints.bandcamp_artist_slug,
        bandcamp_track_slug: urlHints.bandcamp_track_slug,
        release_date: null,
        release_date_raw: null,
        credits_lines: [],
        diagnostics: {
          fetched_ms: Date.now() - startedAt,
          cache_hit: false,
          strategy: 'url_fallback_no_page',
          error: error?.message || 'Failed to fetch Bandcamp page',
        },
      };

      this.cache.set(cacheKey, { timestamp: Date.now(), data: fallback });
      return fallback;
    }

    const trackTitleHtml = extractFirstMatch(html, /<h2[^>]*class=["'][^"']*\btrackTitle\b[^"']*["'][^>]*>([\s\S]*?)<\/h2>/i);
    const titleFromDom = normalizeText(trackTitleHtml);

    const albumTitleHtml = extractFirstMatch(html, /<h3[^>]*class=["'][^"']*\balbumTitle\b[^"']*["'][^>]*>([\s\S]*?)<\/h3>/i);
    const fromAlbum = normalizeText(extractFirstMatch(albumTitleHtml || '', /<span[^>]*class=["'][^"']*\bfromAlbum\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i));

    let artistFromDom = null;
    if (albumTitleHtml) {
      const byAnchor = extractFirstMatch(albumTitleHtml, /\bby\b[\s\S]*?<a[^>]*>([^<]+)<\/a>\s*<\/span>\s*$/i)
        || extractFirstMatch(albumTitleHtml, /\bby\b[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
      artistFromDom = normalizeText(byAnchor);
    }

    const ogTitle = extractMetaProperty(html, 'og:title');
    const ogImage = extractMetaProperty(html, 'og:image');

    let title = titleFromDom;
    let artist = artistFromDom;
    let album = fromAlbum || null;

    if ((!title || !artist) && ogTitle) {
      const parts = ogTitle.split(/\s*,\s*by\s*/i);
      if (!title && parts[0]) title = parts[0].trim();
      if (!artist && parts[1]) artist = parts[1].trim();
    }

    // Artwork: prefer popupImage href (largest), fallback to og:image
    const tralbumArtHtml = extractFirstMatch(html, /<div[^>]*id=["']tralbumArt["'][^>]*>([\s\S]*?)<\/div>/i);
    const popupHref = extractFirstMatch(tralbumArtHtml || '', /<a[^>]*class=["'][^"']*\bpopupImage\b[^"']*["'][^>]*href=["']([^"']+)["']/i);
    const imgSrc = extractFirstMatch(tralbumArtHtml || '', /<img[^>]*src=["']([^"']+)["']/i);
    let artwork_url = decodeHtmlEntities((popupHref || ogImage || imgSrc || '')).trim() || null;

    // Credits
    const creditsHtml = extractFirstMatch(
      html,
      /<div[^>]*class=["'][^"']*\btralbumData\b[^"']*\btralbum-credits\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
    );
    const credits_lines = normalizeCreditsLines(creditsHtml);
    const releaseInfo = parseReleaseInfo(credits_lines);

    // 2) Fallback to URL hints for missing pieces
    if (!title && urlHints.title_hint) title = urlHints.title_hint;
    if (!artist && urlHints.artist_hint) artist = urlHints.artist_hint;

    let isrc = null;

    const resolved = {
      title: title || '',
      artist: artist || '',
      album,
      year: releaseInfo.release_year || null,
      artwork_url,
      spotify_id: null,
      spotify_url: null,
      isrc,
      bandcamp_url: canonicalUrl,
      bandcamp_artist_slug: urlHints.bandcamp_artist_slug,
      bandcamp_track_slug: urlHints.bandcamp_track_slug,
      release_date: releaseInfo.release_date,
      release_date_raw: releaseInfo.release_date_raw,
      credits_lines,
      diagnostics: {
        fetched_ms: Date.now() - startedAt,
        cache_hit: false,
        strategy: html ? 'bandcamp_page_parse' : 'url_fallback_no_page',
      }
    };

    this.cache.set(cacheKey, { timestamp: Date.now(), data: resolved });
    return resolved;
  }
}

const bandcampService = new BandcampService();

export default bandcampService;
export { validateBandcampTrackUrl };
