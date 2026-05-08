/**
 * Apple Music URL Matching and Validation
 * 
 * Utilities for Apple Music URL handling, validation,
 * and matching scraped results against track metadata.
 */

/**
 * Validate Apple Music URL format
 */
export function validateAppleMusicUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }
  
  // Support various Apple Music URL formats including album singles
  const patterns = [
    /^https:\/\/music\.apple\.com\/[a-z]{2}\/album\/[^\/]+\/\d+\?i=\d+$/i, // Album track URL with track ID
    /^https:\/\/music\.apple\.com\/[a-z]{2}\/album\/[^\/]+\/\d+$/i,         // Album URL (singles)
    /^https:\/\/music\.apple\.com\/[a-z]{2}\/song\/[^\/]+\/\d+$/i,          // Direct song URL
    /^https:\/\/music\.apple\.com\/album\/[^\/]+\/\d+\?i=\d+$/i,           // Album track without country
    /^https:\/\/music\.apple\.com\/album\/[^\/]+\/\d+$/i,                   // Album without country (singles)
    /^https:\/\/music\.apple\.com\/song\/[^\/]+\/\d+$/i,                    // Song without country
    /^https:\/\/music\.apple\.com\/us\/song\/[^\/]+\/\d+$/i,               // US specific song
    /^https:\/\/music\.apple\.com\/us\/album\/[^\/]+\/\d+$/i               // US specific album (singles)
  ];
  
  return patterns.some(pattern => pattern.test(url));
}

/**
 * Extract Apple Music ID from URL
 */
export function extractAppleMusicId(url) {
  if (!validateAppleMusicUrl(url)) {
    return null;
  }
  
  // Extract the track/song ID from various URL formats
  // For album URLs with track ID: ?i=123456
  const trackIdMatch = url.match(/[?&]i=(\d+)/);
  if (trackIdMatch) {
    return trackIdMatch[1];
  }
  
  // For direct song URLs: /song/name/123456
  const songMatch = url.match(/\/song\/[^\/]+\/(\d+)/);
  if (songMatch) {
    return songMatch[1];
  }
  
  // For album URLs (singles): /album/name/123456
  const albumMatch = url.match(/\/album\/[^\/]+\/(\d+)(?:\?.*)?$/);
  if (albumMatch) {
    return albumMatch[1];
  }
  
  return null;
}

/**
 * Normalize Apple Music URL for consistency
 */
export function normalizeAppleMusicUrl(url) {
  if (!validateAppleMusicUrl(url)) {
    return null;
  }
  
  const id = extractAppleMusicId(url);
  if (!id) {
    return null;
  }
  
  // For development, return the original URL to maintain compatibility
  // Later we can change this to a standardized format if needed
  return url;
}

/**
 * Calculate match confidence between scraped result and original track
 */
export function calculateMatchConfidence(originalTrack, scrapedResult) {
  if (!originalTrack || !scrapedResult) {
    return 0;
  }
  
  const original = {
    artist: normalizeString(originalTrack.artist || ''),
    title: normalizeString(originalTrack.title || ''),
    album: normalizeString(originalTrack.album || '')
  };
  
  const scraped = {
    artist: normalizeString(scrapedResult.artist || scrapedResult.artistName || ''),
    title: normalizeString(scrapedResult.title || scrapedResult.name || ''),
    album: normalizeString(scrapedResult.album || scrapedResult.albumName || '')
  };
  
  let confidence = 0;
  let totalChecks = 0;
  
  // Artist name matching (40% weight)
  if (original.artist && scraped.artist) {
    const artistMatch = calculateStringMatch(original.artist, scraped.artist);
    confidence += artistMatch * 0.4;
    totalChecks += 0.4;
  }
  
  // Title matching (50% weight)
  if (original.title && scraped.title) {
    const titleMatch = calculateStringMatch(original.title, scraped.title);
    confidence += titleMatch * 0.5;
    totalChecks += 0.5;
  }
  
  // Album matching (10% weight, bonus if available)
  if (original.album && scraped.album) {
    const albumMatch = calculateStringMatch(original.album, scraped.album);
    confidence += albumMatch * 0.1;
    totalChecks += 0.1;
  }
  
  // Normalize by total weight of checks performed
  if (totalChecks > 0) {
    confidence = (confidence / totalChecks) * 100;
  }
  
  return Math.round(confidence);
}

/**
 * Normalize string for comparison
 */
function normalizeString(str) {
  if (!str || typeof str !== 'string') {
    return '';
  }
  
  return str
    .toLowerCase()
    .trim()
    // Remove common punctuation and special characters
    .replace(/['"''""„‚«»‹›()[\]{}]/g, '')
    // Remove feat/featuring variations
    .replace(/\b(?:feat\.?|featuring|ft\.?)\s+[^,]*$/i, '')
    // Remove remix/version indicators
    .replace(/\s*[-–—]\s*(?:remix|version|edit|extended|radio|clean|explicit).*$/i, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate string similarity using fuzzy matching
 */
function calculateStringMatch(str1, str2) {
  if (!str1 || !str2) {
    return 0;
  }
  
  if (str1 === str2) {
    return 1;
  }
  
  // Use Levenshtein distance for fuzzy matching
  const distance = levenshteinDistance(str1, str2);
  const maxLength = Math.max(str1.length, str2.length);
  
  if (maxLength === 0) {
    return 1;
  }
  
  const similarity = 1 - (distance / maxLength);
  
  // Boost exact word matches
  const words1 = str1.split(' ');
  const words2 = str2.split(' ');
  const commonWords = words1.filter(word => words2.includes(word)).length;
  const wordBonus = commonWords / Math.max(words1.length, words2.length);
  
  return Math.min(1, similarity + (wordBonus * 0.2));
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1, str2) {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

/**
 * Extract track information from Apple Music page metadata
 */
export function extractTrackFromApplePage(pageData) {
  if (!pageData) {
    return null;
  }
  
  try {
    // Look for JSON-LD structured data
    if (pageData.jsonLd) {
      const musicData = pageData.jsonLd.find(item => 
        item['@type'] === 'MusicRecording' || item['@type'] === 'Product'
      );
      
      if (musicData) {
        return {
          title: musicData.name,
          artist: musicData.byArtist?.name || musicData.author?.name,
          album: musicData.inAlbum?.name,
          url: musicData.url || musicData['@id'],
          duration: parseDuration(musicData.duration),
          releaseDate: musicData.datePublished || musicData.inAlbum?.datePublished
        };
      }
    }
    
    // Fallback to meta tags and page parsing
    return {
      title: pageData.title,
      artist: pageData.artist,
      album: pageData.album,
      url: pageData.url,
      duration: pageData.duration,
      releaseDate: pageData.releaseDate
    };
    
  } catch (error) {
    console.error('Failed to extract track from Apple page:', error);
    return null;
  }
}

/**
 * Parse duration string to milliseconds
 */
function parseDuration(durationStr) {
  if (!durationStr) {
    return null;
  }
  
  // Parse ISO 8601 duration (PT3M45S)
  const isoMatch = durationStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
  if (isoMatch) {
    const hours = parseInt(isoMatch[1] || 0, 10);
    const minutes = parseInt(isoMatch[2] || 0, 10);
    const seconds = parseFloat(isoMatch[3] || 0);
    return (hours * 3600 + minutes * 60 + seconds) * 1000;
  }
  
  // Parse MM:SS format
  const timeMatch = durationStr.match(/(\d+):(\d+)/);
  if (timeMatch) {
    const minutes = parseInt(timeMatch[1], 10);
    const seconds = parseInt(timeMatch[2], 10);
    return (minutes * 60 + seconds) * 1000;
  }
  
  return null;
}