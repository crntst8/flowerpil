/**
 * Normalization Utilities for Track Matching
 *
 * Provides enhanced text normalization for improving track matching accuracy
 * across different streaming platforms (Spotify, Apple Music, TIDAL).
 */

/**
 * Base text normalization - lowercase, remove accents, trim
 * @param {string} text - Text to normalize
 * @returns {string} Normalized text
 */
export const normalizeText = (text) => {
  if (!text || typeof text !== 'string') return '';

  // Normalize Unicode (NFKD = compatibility decomposition)
  const normalized = text.normalize?.('NFKD') || text;

  return normalized
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritical marks
    .replace(/[^\w\s&-]/g, ' ') // Keep alphanumeric, spaces, &, and -
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim();
};

/**
 * Normalize artist name with common variations
 * @param {string} artist - Artist name to normalize
 * @returns {string} Normalized artist name
 */
export const normalizeArtistName = (artist) => {
  if (!artist || typeof artist !== 'string') return '';

  return normalizeText(artist)
    .replace(/^the\s+/i, '') // Remove leading "The" ("The Beatles" → "beatles")
    .replace(/\s+&\s+/g, ' and ') // "&" → "and"
    .replace(/\s+\+\s+/g, ' and ') // "+" → "and"
    .trim();
};

/**
 * Generate title variants for fuzzy matching
 * Removes parentheticals, brackets, featuring credits, etc.
 * @param {string} title - Track title
 * @returns {string[]} Array of title variants (deduplicated)
 */
export const normalizeTitleVariants = (title) => {
  if (!title || typeof title !== 'string') return [];

  const variants = [];

  // Base normalized version
  const base = normalizeText(title);
  variants.push(base);

  // Without parentheticals: "Song (Remix)" → "Song"
  const noParens = title.replace(/\s*\([^)]*\)/g, '').trim();
  if (noParens !== title) {
    variants.push(normalizeText(noParens));
  }

  // Without square brackets: "Song [Explicit]" → "Song"
  const noBrackets = title.replace(/\s*\[[^\]]*\]/g, '').trim();
  if (noBrackets !== title) {
    variants.push(normalizeText(noBrackets));
  }

  // Without featuring credits: "Song feat. Artist" → "Song"
  const noFeat = title.replace(/\s+(feat\.|featuring|ft\.|with|vs\.?|versus)\s+.*/i, '').trim();
  if (noFeat !== title) {
    variants.push(normalizeText(noFeat));
  }

  // Remove "- Topic" suffix (common in YouTube Music imports)
  const noTopic = title.replace(/\s*-\s*topic\s*$/i, '').trim();
  if (noTopic !== title) {
    variants.push(normalizeText(noTopic));
  }

  // Remove version indicators: "Song - Radio Edit" → "Song"
  const noVersion = title.replace(/\s+-\s+(radio\s+edit|single\s+version|album\s+version|extended\s+version|edit|mix)\s*$/i, '').trim();
  if (noVersion !== title) {
    variants.push(normalizeText(noVersion));
  }

  // Deduplicate and filter out empty strings
  return [...new Set(variants)].filter(v => v.length > 0);
};

/**
 * Generate album variants for fuzzy matching
 * Removes edition suffixes (deluxe, remaster, anniversary, etc.)
 * @param {string} album - Album name
 * @returns {string[]} Array of album variants (deduplicated)
 */
export const normalizeAlbumVariants = (album) => {
  if (!album || typeof album !== 'string') return [];

  const variants = [normalizeText(album)];

  // Common album edition suffixes to remove
  const suffixes = [
    /\s*\(deluxe\s*edition\)/i,
    /\s*\(deluxe\)/i,
    /\s*\(remaster(?:ed)?\)/i,
    /\s*\(anniversary\s*edition\)/i,
    /\s*\(expanded\s*edition\)/i,
    /\s*\(special\s*edition\)/i,
    /\s*\(bonus\s*track\s*version\)/i,
    /\s*\(bonus\s*tracks\)/i,
    /\s*\(explicit\)/i,
    /\s*\d{4}\s+remaster(?:ed)?/i, // "2015 Remastered"
    /\s*-\s*remaster(?:ed)?/i,
    /\s*-\s*deluxe/i,
    /\s*-\s*expanded/i
  ];

  suffixes.forEach(pattern => {
    const cleaned = album.replace(pattern, '').trim();
    if (cleaned !== album && cleaned.length > 0) {
      variants.push(normalizeText(cleaned));
    }
  });

  // Deduplicate
  return [...new Set(variants)].filter(v => v.length > 0);
};

/**
 * Compare two durations with tolerance
 * @param {number} durationMs1 - First duration in milliseconds
 * @param {number} durationMs2 - Second duration in milliseconds
 * @param {number} tolerancePercent - Allowed difference percentage (default 5%)
 * @returns {object|null} Match result with score, or null if invalid input
 */
export const compareDuration = (durationMs1, durationMs2, tolerancePercent = 5) => {
  if (!durationMs1 || !durationMs2) return null;
  if (typeof durationMs1 !== 'number' || typeof durationMs2 !== 'number') return null;

  const diff = Math.abs(durationMs1 - durationMs2);
  const average = (durationMs1 + durationMs2) / 2;
  const percentDiff = (diff / average) * 100;

  return {
    match: percentDiff <= tolerancePercent,
    percentDiff: parseFloat(percentDiff.toFixed(2)),
    diffMs: diff,
    // Score: 100 for exact match, decreases linearly with difference
    // 0% diff = 100 score, 5% diff = 50 score, 10% diff = 0 score
    score: Math.max(0, Math.round(100 - (percentDiff * 10)))
  };
};

/**
 * Split artist string into individual artists
 * Handles common delimiters: &, feat., ,
 * @param {string} artistString - Artist string (potentially multi-artist)
 * @returns {string[]} Array of individual artist names
 */
export const splitArtists = (artistString) => {
  if (!artistString || typeof artistString !== 'string') return [];

  // Split by common delimiters
  const delimiters = /\s*(?:&|feat\.|featuring|ft\.|with|,|\+|vs\.?|versus)\s*/i;

  return artistString
    .split(delimiters)
    .map(artist => artist.trim())
    .filter(artist => artist.length > 0)
    .map(artist => normalizeArtistName(artist));
};

/**
 * Normalize ISRC code to standard 12-character format
 * @param {string} isrc - ISRC code
 * @returns {string|null} Normalized ISRC or null if invalid
 */
export const normalizeIsrc = (isrc) => {
  if (!isrc || typeof isrc !== 'string') return null;

  // Remove any hyphens and spaces
  const cleaned = isrc.replace(/[-\s]/g, '').toUpperCase();

  // ISRC should be exactly 12 characters
  if (cleaned.length !== 12) return null;

  // Validate format: 2 letters + 3 alphanumeric + 7 digits
  const isrcPattern = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;
  if (!isrcPattern.test(cleaned)) return null;

  return cleaned;
};

/**
 * Check if album appears to be a compilation
 * Compilations often have inconsistent artist matching
 * @param {string} album - Album name
 * @returns {boolean} True if likely a compilation
 */
export const isCompilationAlbum = (album) => {
  if (!album || typeof album !== 'string') return false;

  const compilationIndicators = [
    /compilation/i,
    /various\s+artists/i,
    /greatest\s+hits/i,
    /best\s+of/i,
    /the\s+collection/i,
    /anthology/i,
    /soundtrack/i,
    /now\s+that'?s\s+what\s+i\s+call\s+music/i,
    /va\s*$/i, // "VA" at end
    /^va\s/i   // "VA" at start
  ];

  return compilationIndicators.some(pattern => pattern.test(album));
};

/**
 * Clean and normalize metadata for comparison
 * @param {object} track - Track metadata
 * @returns {object} Normalized track metadata
 */
export const normalizeTrackMetadata = (track) => {
  return {
    title: normalizeText(track.title || ''),
    titleVariants: normalizeTitleVariants(track.title || ''),
    artist: normalizeArtistName(track.artist || ''),
    artists: splitArtists(track.artist || ''),
    album: normalizeText(track.album || ''),
    albumVariants: normalizeAlbumVariants(track.album || ''),
    isrc: normalizeIsrc(track.isrc || ''),
    durationMs: track.duration_ms || track.duration || null,
    isCompilation: isCompilationAlbum(track.album || '')
  };
};

/**
 * Calculate text similarity using Levenshtein distance
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Similarity score (0-100)
 */
export const calculateSimilarity = (str1, str2) => {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 100;

  const s1 = normalizeText(str1);
  const s2 = normalizeText(str2);

  if (s1 === s2) return 100;

  // Levenshtein distance implementation
  const len1 = s1.length;
  const len2 = s2.length;
  const matrix = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  const distance = matrix[len1][len2];
  const maxLen = Math.max(len1, len2);

  // Convert distance to similarity score (0-100)
  return Math.round((1 - distance / maxLen) * 100);
};
