const DEFAULT_WEIGHTS = Object.freeze({
  isrc: 40,
  title: 25,
  album: 20,
  artist: 10,
  duration: 5
});

const DEFAULT_THRESHOLD = 70;
const COMPILATION_KEYWORDS = [
  'soundtrack',
  'motion picture',
  'original score',
  'original cast',
  'various artists',
  'compilation',
  'anthology',
  'greatest hits',
  'karaoke',
  'tribute'
];

const stripDiacritics = (value) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

const normalizeIsrc = (value) => {
  if (!value) return null;
  const normalized = stripDiacritics(String(value).trim().toUpperCase()).replace(/[^A-Z0-9]/g, '');
  if (!normalized) return null;
  if (normalized.length === 12) return normalized;
  if (normalized.length > 12) return normalized.slice(0, 12);
  return normalized.length >= 10 ? normalized.padEnd(12, '0').slice(0, 12) : normalized;
};

const coerceDurationMs = (value) => {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value >= 1000 && value < 1_000_000 ? Math.round(value) : Math.round(value * (value < 600 ? 1000 : 1));
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) {
      const asInt = Number(trimmed);
      return asInt >= 1000 && asInt < 1_000_000 ? asInt : asInt * 1000;
    }
    const parts = trimmed.split(':').map((segment) => Number(segment));
    if (parts.every((segment) => Number.isFinite(segment))) {
      let seconds = 0;
      if (parts.length === 3) {
        seconds = (parts[0] * 3600) + (parts[1] * 60) + parts[2];
      } else if (parts.length === 2) {
        seconds = (parts[0] * 60) + parts[1];
      }
      return seconds > 0 ? seconds * 1000 : null;
    }
  }
  return null;
};

const stripVersionTokens = (value) => {
  if (!value) return '';
  return value
    .replace(/\s*[-–—]\s*(?:live|remaster(?:ed)?|version|edit|mix|karaoke|instrumental).*$/i, '')
    .replace(/\((?:live|remaster(?:ed)?|version|edit|mix|karaoke|instrumental)[^)]*\)/gi, '')
    .trim();
};

const stripFeaturing = (value) => {
  if (!value) return '';
  return value.replace(/\b(feat\.?|featuring|ft\.?|vs\.?|versus)\b.*$/i, '').trim();
};

const normalizeText = (value) => {
  if (!value) return '';
  const noFeaturing = stripFeaturing(value);
  const base = stripVersionTokens(noFeaturing);
  const normalized = stripDiacritics(base)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized;
};

const splitArtists = (value) => {
  const normalized = normalizeText(value);
  if (!normalized) return [];
  return normalized
    .split(/\s*(?:,|&| and | feat | ft )\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
};

const buildTitleVariants = (value) => {
  const variants = new Set();
  if (!value) return [];
  const base = value.trim();
  const normalized = normalizeText(base);
  if (normalized) variants.add(normalized);
  const withoutParens = stripVersionTokens(base.replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, ''));
  const normalizedWithoutParens = normalizeText(withoutParens);
  if (normalizedWithoutParens) variants.add(normalizedWithoutParens);
  const hyphenSplit = base.split(/\s+-\s+/)[0];
  const normalizedHyphen = normalizeText(hyphenSplit);
  if (normalizedHyphen) variants.add(normalizedHyphen);
  return Array.from(variants).filter(Boolean);
};

const buildAlbumVariants = (value) => {
  const variants = new Set();
  if (value) {
    const normalized = normalizeText(value);
    if (normalized) variants.add(normalized);
    const stripped = stripVersionTokens(value.replace(/\((?:deluxe|expanded|remaster(?:ed)?)[^)]*\)/gi, ''));
    const normalizedStripped = normalizeText(stripped);
    if (normalizedStripped) variants.add(normalizedStripped);
  }
  return Array.from(variants).filter(Boolean);
};

const buildArtistVariants = (value) => {
  const variants = new Set();
  if (value) {
    const normalized = normalizeText(value);
    if (normalized) variants.add(normalized);
    splitArtists(value).forEach((variant) => { if (variant) variants.add(variant); });
  }
  return Array.from(variants).filter(Boolean);
};

const dedupe = (list) => Array.from(new Set(list.filter(Boolean)));

const levenshtein = (a, b) => {
  if (a === b) return 0;
  const matrix = Array.from({ length: b.length + 1 }, () => new Array(a.length + 1).fill(0));
  for (let i = 0; i <= b.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= a.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i += 1) {
    for (let j = 1; j <= a.length; j += 1) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
};

const similarityRatio = (a, b) => {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const distance = levenshtein(a, b);
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return Math.max(0, 1 - (distance / max));
};

const computeMatchFactor = (candidates, target) => {
  if (!target) return 0;
  const normalizedTarget = normalizeText(target);
  if (!normalizedTarget) return 0;
  let best = 0;
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (candidate === normalizedTarget) return 1;
    const ratio = similarityRatio(candidate, normalizedTarget);
    if (ratio > best) best = ratio;
  }
  return Math.max(0, Math.min(1, best));
};

const computeDurationFactor = (expected, candidate) => {
  if (!Number.isFinite(expected) || !Number.isFinite(candidate)) return 0;
  const delta = Math.abs(expected - candidate);
  if (delta <= 1500) return 1;
  if (delta <= 3500) return 0.7;
  if (delta <= 6000) return 0.35;
  if (delta <= 9000) return 0.15;
  return 0;
};

const createScoringContext = (track = {}, guidance = {}) => {
  const tidal = guidance?.tidal || null;
  const context = {
    artist: track.artist || '',
    title: track.title || '',
    album: track.album || '',
    isrc: normalizeIsrc(track.isrc),
    durationMs: coerceDurationMs(track.durationMs ?? track.duration_ms ?? track.duration),
    artistVariants: buildArtistVariants(track.artist),
    titleVariants: buildTitleVariants(track.title),
    albumVariants: buildAlbumVariants(track.album),
    preferredAlbum: normalizeText(track.album) || null,
    guidance: {}
  };

  if (tidal) {
    if (tidal.isrc && !context.isrc) {
      context.isrc = normalizeIsrc(tidal.isrc);
    }
    if (tidal.title) {
      context.titleVariants.push(...buildTitleVariants(tidal.title));
    }
    if (tidal.artist) {
      context.artistVariants.push(...buildArtistVariants(tidal.artist));
    }
    if (tidal.album) {
      const tidalAlbumVariants = buildAlbumVariants(tidal.album);
      context.albumVariants.push(...tidalAlbumVariants);
      const primaryTidalAlbum = tidalAlbumVariants[0] || null;
      if (primaryTidalAlbum) {
        context.guidance.tidalAlbum = primaryTidalAlbum;
        if (!context.preferredAlbum) {
          context.preferredAlbum = primaryTidalAlbum;
        }
      }
    }
    const tidalDurationMs = coerceDurationMs(tidal.durationMs ?? tidal.duration);
    if (tidalDurationMs && !context.durationMs) {
      context.durationMs = tidalDurationMs;
    }
    context.guidance.tidal = {
      album: tidal.album || null,
      title: tidal.title || null,
      durationMs: tidal.durationMs ?? tidal.duration ?? null
    };
  }

  context.artistVariants = dedupe(context.artistVariants);
  context.titleVariants = dedupe(context.titleVariants);
  context.albumVariants = dedupe(context.albumVariants);

  return context;
};

const scoreAppleCandidate = (context, candidate = {}, options = {}) => {
  const weights = { ...DEFAULT_WEIGHTS, ...(options.weights || {}) };
  const candidateArtist = candidate.artist || candidate.artistName || '';
  const candidateTitle = candidate.title || candidate.name || '';
  const candidateAlbum = candidate.album || candidate.albumName || '';
  const candidateIsrc = normalizeIsrc(candidate.isrc || candidate.isrcCode || candidate.playParams?.catalogId);
  const candidateDurationMs = coerceDurationMs(
    candidate.durationMs
    ?? candidate.duration
    ?? candidate.durationInMillis
    ?? candidate.attributes?.durationInMillis
  );

  const isrcFactor = context.isrc && candidateIsrc
    ? (context.isrc === candidateIsrc ? 1 : 0)
    : 0;

  const titleFactor = computeMatchFactor(context.titleVariants, candidateTitle);
  const artistFactor = computeMatchFactor(context.artistVariants, candidateArtist);
  const albumFactor = computeMatchFactor(context.albumVariants, candidateAlbum);
  const durationFactor = computeDurationFactor(context.durationMs, candidateDurationMs);

  const contributions = {
    isrc: weights.isrc * isrcFactor,
    title: weights.title * titleFactor,
    album: weights.album * albumFactor,
    artist: weights.artist * artistFactor,
    duration: weights.duration * durationFactor
  };

  const score = Object.values(contributions).reduce((sum, value) => sum + value, 0);

  return {
    score: Math.round(score),
    rawScore: score,
    breakdown: contributions,
    factors: { isrc: isrcFactor, title: titleFactor, album: albumFactor, artist: artistFactor, duration: durationFactor },
    candidateDurationMs,
    matchedPreferredAlbum: Boolean(context.preferredAlbum && normalizeText(candidateAlbum) === context.preferredAlbum)
  };
};

const isCompilationCandidate = (candidate = {}) => {
  const attrs = candidate.attributes || {};
  if (attrs.isCompilation === true) return true;
  const album = String(candidate.album || attrs.albumName || '').toLowerCase();
  const artist = String(candidate.artist || attrs.artistName || '').toLowerCase();
  if (!album && !artist) return false;
  if (/various artists/.test(artist)) return true;
  return COMPILATION_KEYWORDS.some((keyword) => album.includes(keyword));
};

const matchesPreferredAlbum = (context, candidate = {}) => {
  const album = normalizeText(candidate.album || candidate.attributes?.albumName);
  if (!album) return false;
  if (context.preferredAlbum && album === context.preferredAlbum) {
    return true;
  }
  if (context.guidance?.tidalAlbum && album === context.guidance.tidalAlbum) {
    return true;
  }
  return false;
};

export {
  DEFAULT_THRESHOLD,
  DEFAULT_WEIGHTS,
  coerceDurationMs,
  createScoringContext,
  isCompilationCandidate,
  matchesPreferredAlbum,
  normalizeIsrc,
  scoreAppleCandidate
};
