/**
 * Matching Algorithm Service
 * 
 * Implements advanced fuzzy matching algorithms for cross-platform track matching
 * with confidence scoring, text normalization, and similarity calculations.
 */

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1, str2) {
  const matrix = [];
  
  // Initialize matrix
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  // Fill matrix
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
 * Calculate similarity percentage between two strings using Levenshtein distance
 */
function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  
  const maxLength = Math.max(str1.length, str2.length);
  if (maxLength === 0) return 100;
  
  const distance = levenshteinDistance(str1, str2);
  return ((maxLength - distance) / maxLength) * 100;
}

/**
 * Normalize text for comparison
 */
function normalizeText(text) {
  if (!text) return '';
  
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\b(feat|ft|featuring|vs|versus|with|and|&)\b/g, '') // Remove collaborator keywords
    .replace(/\b(the|a|an)\b/g, '') // Remove articles
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Extract artist variations for better matching
 */
function extractArtistVariations(artist) {
  if (!artist) return [];
  
  const variations = [artist];
  const normalized = normalizeText(artist);
  
  if (normalized !== artist.toLowerCase()) {
    variations.push(normalized);
  }
  
  // Handle common patterns
  if (artist.includes('&')) {
    variations.push(artist.replace('&', 'and'));
    variations.push(artist.replace('&', ''));
  }
  
  if (artist.includes(' and ')) {
    variations.push(artist.replace(' and ', ' & '));
    variations.push(artist.replace(' and ', ' '));
  }
  
  // Handle featuring patterns
  const featMatch = artist.match(/^(.+?)\s+(feat\.?|ft\.?|featuring)\s+(.+)$/i);
  if (featMatch) {
    variations.push(featMatch[1]); // Main artist only
    variations.push(featMatch[3]); // Featured artist only
  }
  
  return [...new Set(variations)]; // Remove duplicates
}

/**
 * Extract title variations for better matching
 */
function extractTitleVariations(title) {
  if (!title) return [];
  
  const variations = [title];
  const normalized = normalizeText(title);
  
  if (normalized !== title.toLowerCase()) {
    variations.push(normalized);
  }
  
  // Handle common patterns
  const remixMatch = title.match(/^(.+?)\s+\(([^)]+)\)$/);
  if (remixMatch) {
    variations.push(remixMatch[1]); // Without parentheses
    
    // Check if parentheses contain remix/version info
    const parentheses = remixMatch[2].toLowerCase();
    if (parentheses.includes('remix') || parentheses.includes('edit') || parentheses.includes('version')) {
      variations.push(remixMatch[1]); // Original version likely more important
    }
  }
  
  // Handle featuring in title
  const featMatch = title.match(/^(.+?)\s+(feat\.?|ft\.?|featuring)\s+(.+)$/i);
  if (featMatch) {
    variations.push(featMatch[1]); // Without featuring
  }
  
  return [...new Set(variations)]; // Remove duplicates
}

/**
 * Calculate match confidence between original track and candidate
 */
export function calculateMatchConfidence(originalTrack, candidateTrack) {
  const original = {
    artist: (originalTrack.artist || '').toLowerCase(),
    title: (originalTrack.title || '').toLowerCase(),
    album: (originalTrack.album || '').toLowerCase()
  };
  
  const candidate = {
    artist: (candidateTrack.artist || '').toLowerCase(),
    title: (candidateTrack.title || '').toLowerCase(),
    album: (candidateTrack.album || '').toLowerCase()
  };
  
  // Get variations for better matching
  const originalArtistVariations = extractArtistVariations(original.artist);
  const originalTitleVariations = extractTitleVariations(original.title);
  const candidateArtistVariations = extractArtistVariations(candidate.artist);
  const candidateTitleVariations = extractTitleVariations(candidate.title);
  
  // Calculate best artist similarity
  let bestArtistSimilarity = 0;
  for (const origArtist of originalArtistVariations) {
    for (const candArtist of candidateArtistVariations) {
      const similarity = calculateSimilarity(origArtist, candArtist);
      bestArtistSimilarity = Math.max(bestArtistSimilarity, similarity);
    }
  }
  
  // Calculate best title similarity
  let bestTitleSimilarity = 0;
  for (const origTitle of originalTitleVariations) {
    for (const candTitle of candidateTitleVariations) {
      const similarity = calculateSimilarity(origTitle, candTitle);
      bestTitleSimilarity = Math.max(bestTitleSimilarity, similarity);
    }
  }
  
  // Calculate album similarity (bonus points)
  const albumSimilarity = original.album && candidate.album 
    ? calculateSimilarity(normalizeText(original.album), normalizeText(candidate.album))
    : 0;
  
  // Weighted confidence calculation
  const artistWeight = 0.4;   // 40% weight
  const titleWeight = 0.5;    // 50% weight
  const albumWeight = 0.1;    // 10% weight (bonus)
  
  const baseConfidence = (bestArtistSimilarity * artistWeight) + 
                        (bestTitleSimilarity * titleWeight) + 
                        (albumSimilarity * albumWeight);
  
  // Apply bonuses and penalties
  let finalConfidence = baseConfidence;
  
  // Exact match bonuses
  if (bestArtistSimilarity === 100) finalConfidence += 5;
  if (bestTitleSimilarity === 100) finalConfidence += 5;
  if (albumSimilarity === 100) finalConfidence += 3;
  
  // Strong match bonuses
  if (bestArtistSimilarity >= 90 && bestTitleSimilarity >= 90) {
    finalConfidence += 10;
  }
  
  // Penalties for very low matches
  if (bestArtistSimilarity < 60) finalConfidence -= 20;
  if (bestTitleSimilarity < 60) finalConfidence -= 20;
  
  // Length difference penalty (extreme cases)
  const artistLengthDiff = Math.abs(original.artist.length - candidate.artist.length);
  const titleLengthDiff = Math.abs(original.title.length - candidate.title.length);
  
  if (artistLengthDiff > 20) finalConfidence -= 5;
  if (titleLengthDiff > 20) finalConfidence -= 5;
  
  // Ensure confidence is within bounds
  return Math.max(0, Math.min(100, Math.round(finalConfidence)));
}

/**
 * Batch calculate confidence for multiple candidates
 */
export function calculateBatchConfidence(originalTrack, candidates) {
  return candidates.map(candidate => ({
    ...candidate,
    confidence: calculateMatchConfidence(originalTrack, candidate)
  })).sort((a, b) => b.confidence - a.confidence);
}

/**
 * Determine if a match meets quality thresholds
 */
export function isHighQualityMatch(confidence, source = 'metadata') {
  const thresholds = {
    isrc: 95,      // ISRC matches should be near-perfect
    metadata: 70,  // Metadata matches need good confidence
    manual: 0      // Manual overrides bypass thresholds
  };
  
  return confidence >= (thresholds[source] || thresholds.metadata);
}

/**
 * Get match quality description
 */
export function getMatchQuality(confidence) {
  if (confidence >= 95) return 'excellent';
  if (confidence >= 85) return 'very-good';
  if (confidence >= 75) return 'good';
  if (confidence >= 65) return 'fair';
  if (confidence >= 50) return 'poor';
  return 'very-poor';
}

/**
 * Advanced fuzzy search with confidence scoring
 */
export function fuzzySearch(query, candidates, options = {}) {
  const {
    artistField = 'artist',
    titleField = 'title',
    albumField = 'album',
    minConfidence = 50,
    maxResults = 10
  } = options;
  
  const results = candidates.map(candidate => {
    const candidateTrack = {
      artist: candidate[artistField] || '',
      title: candidate[titleField] || '',
      album: candidate[albumField] || ''
    };
    
    const confidence = calculateMatchConfidence(query, candidateTrack);
    
    return {
      ...candidate,
      confidence,
      quality: getMatchQuality(confidence)
    };
  })
  .filter(result => result.confidence >= minConfidence)
  .sort((a, b) => b.confidence - a.confidence)
  .slice(0, maxResults);
  
  return results;
}

/**
 * Test matching algorithm with sample data
 */
export function testMatchingAlgorithm() {
  const testCases = [
    {
      name: 'Exact Match',
      original: { artist: 'Billie Eilish', title: 'bad guy' },
      candidate: { artist: 'Billie Eilish', title: 'bad guy' },
      expectedMin: 95
    },
    {
      name: 'Case Insensitive',
      original: { artist: 'BILLIE EILISH', title: 'BAD GUY' },
      candidate: { artist: 'billie eilish', title: 'bad guy' },
      expectedMin: 95
    },
    {
      name: 'Featuring Variation',
      original: { artist: 'Dua Lipa', title: 'Levitating (feat. DaBaby)' },
      candidate: { artist: 'Dua Lipa', title: 'Levitating' },
      expectedMin: 80
    },
    {
      name: 'Punctuation Difference',
      original: { artist: "Guns N' Roses", title: "Sweet Child O' Mine" },
      candidate: { artist: "Guns N Roses", title: "Sweet Child O Mine" },
      expectedMin: 85
    },
    {
      name: 'Poor Match',
      original: { artist: 'Taylor Swift', title: 'Shake It Off' },
      candidate: { artist: 'Ed Sheeran', title: 'Shape of You' },
      expectedMin: 0
    }
  ];
  
  console.log('🧪 Testing matching algorithm...');
  
  const results = testCases.map(testCase => {
    const confidence = calculateMatchConfidence(testCase.original, testCase.candidate);
    const passed = confidence >= testCase.expectedMin;
    
    console.log(`${passed ? '✅' : '❌'} ${testCase.name}: ${confidence}% (expected ≥${testCase.expectedMin}%)`);
    
    return {
      ...testCase,
      confidence,
      passed
    };
  });
  
  const passed = results.filter(r => r.passed).length;
  console.log(`📊 Matching algorithm test results: ${passed}/${results.length} passed`);
  
  return results.every(r => r.passed);
}