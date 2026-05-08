import logger from './logger.js';

const TIME_KEYWORDS = [
  'new',
  'latest',
  'fresh',
  'just added',
  'just-added',
  'recent',
  'today',
  'this week',
  'this-month',
  'this month'
];

const YEAR_REGEX = /\b(19|20)\d{2}\b/;
const MAX_TOKEN_COUNT = 6;

const sanitizeToAscii = (value = '') => {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/ig, ' ')
    .toLowerCase();
};

export const normalizeQuery = (input = '') => {
  if (typeof input !== 'string') {
    return String(input ?? '').trim();
  }
  return input.trim();
};

export const tokenizeQuery = (input = '') => {
  const ascii = sanitizeToAscii(input);
  return ascii
    .split(/\s+/)
    .map(token => token.trim())
    .filter(Boolean)
    .slice(0, MAX_TOKEN_COUNT);
};

export const buildFtsMatch = (input = '', columns = []) => {
  const tokens = tokenizeQuery(input);
  if (!tokens.length) {
    const fallback = sanitizeToAscii(input).replace(/\s+/g, '');
    if (!fallback.length) {
      return '';
    }
    return columns.length
      ? columns.map(col => `${col}:${fallback}*`).join(' OR ')
      : fallback;
  }

  const uniqueColumns = Array.from(new Set(columns.filter(Boolean)));
  const baseSegments = tokens.map(token => `${token}*`);

  if (!uniqueColumns.length) {
    return baseSegments.join(' AND ');
  }

  const columnClauses = uniqueColumns.map(col => (
    baseSegments.map(segment => `${col}:${segment}`).join(' AND ')
  ));

  if (columnClauses.length === 1) {
    return columnClauses[0];
  }

  return `(${columnClauses.join(') OR (')})`;
};

export const computeRecencyScore = (latestTrackDate, fallbackDate) => {
  const reference = latestTrackDate || fallbackDate;
  if (!reference) return 0;
  const timestamp = Date.parse(reference);
  if (Number.isNaN(timestamp)) return 0;

  const diffDays = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
  if (diffDays <= 0) return 1;

  const halfLifeDays = 90;
  const score = Math.exp(-diffDays / halfLifeDays);
  return Math.min(1, Math.max(0, score));
};

export const computeTitleBoost = (title = '', tokens = []) => {
  if (!title || !tokens.length) return 0;
  const lower = title.toLowerCase();
  return tokens.some(token => lower.includes(token)) ? 1 : 0;
};

export const computeTagBoost = (tags = '', tokens = []) => {
  if (!tags || !tokens.length) return 0;
  const normalized = tags.toLowerCase();
  let matches = 0;
  tokens.forEach(token => {
    if (normalized.includes(token)) {
      matches += 1;
    }
  });
  if (!matches) return 0;
  return Math.min(1, matches / tokens.length);
};

export const computeFinalScore = ({ bm25 = null, recency = 0, titleBoost = 0, tagBoost = 0 }) => {
  const normalizedBm25 = (typeof bm25 === 'number' && Number.isFinite(bm25))
    ? 1 / (bm25 + 1)
    : 0;

  const clampedRecency = Math.min(1, Math.max(0, recency));
  const clampedTitle = titleBoost ? 1 : 0;
  const clampedTag = Math.min(1, Math.max(0, tagBoost));

  const finalScore = (0.55 * normalizedBm25)
    + (0.25 * clampedRecency)
    + (0.1 * clampedTitle)
    + (0.1 * clampedTag);
  return Number(finalScore.toFixed(4));
};

const safeTry = (label, fn) => {
  try {
    return fn();
  } catch (error) {
    try { logger.warn(`[search] ${label} probe failed`, { error: error.message }); } catch {}
    return null;
  }
};

export const inferIntent = ({ query, tokens = [], probes = {} }) => {
  const normalized = sanitizeToAscii(query);

  if (!normalized.length) {
    return { intent: 'mixed', confidence: 0 };
  }

  if (
    TIME_KEYWORDS.some(keyword => normalized.includes(keyword))
    || YEAR_REGEX.test(normalized)
    || tokens.some(token => YEAR_REGEX.test(token))
  ) {
    return { intent: 'time_period', confidence: 0.7 };
  }

  if (probes.genre) {
    const genreMatch = safeTry('genre', () => probes.genre(buildFtsMatch(query, ['normalized_name'])));
    if (genreMatch) {
      return { intent: 'genre', confidence: 0.75, data: genreMatch };
    }
  }

  if (probes.artist) {
    const artistMatch = safeTry('artist', () => probes.artist(buildFtsMatch(query, ['normalized_name'])));
    if (artistMatch) {
      return { intent: 'artist', confidence: 0.75, data: artistMatch };
    }
  }

  if (probes.track) {
    const trackMatch = safeTry('track', () => probes.track(buildFtsMatch(query, ['title'])));
    if (trackMatch) {
      return { intent: 'song', confidence: 0.65, data: trackMatch };
    }
  }

  return { intent: 'mixed', confidence: 0.4 };
};
