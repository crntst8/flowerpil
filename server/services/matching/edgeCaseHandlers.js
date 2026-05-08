/**
 * Edge Case Handlers for Track Matching
 *
 * Detects and handles special track types (remixes, live versions, acoustic, etc.)
 * that require adjusted confidence scoring to prevent incorrect matches.
 */

/**
 * Detect various edge cases in a track title
 * @param {object} track - Track object with title, artist, album fields
 * @returns {object} Object with boolean flags for each edge case
 */
export const detectEdgeCases = (track) => {
  if (!track || !track.title) {
    return {
      isRemix: false,
      isLive: false,
      isAcoustic: false,
      isInstrumental: false,
      isKaraoke: false,
      isCover: false,
      isRadioEdit: false,
      isExtended: false,
      isClean: false,
      isExplicit: false,
      hasVersion: false,
      isCompilation: false
    };
  }

  const title = track.title.toLowerCase();
  const album = (track.album || '').toLowerCase();

  return {
    // Remix detection
    isRemix: /\b(remix|rmx|rework|edit|bootleg)\b/i.test(title),

    // Live version detection
    isLive: /\b(live|concert|tour)\b/i.test(title) ||
            /\blive\s+at\b/i.test(title) ||
            /\blive\s+from\b/i.test(title) ||
            /\blive\s+in\b/i.test(title),

    // Acoustic version detection
    isAcoustic: /\bacoustic\b/i.test(title),

    // Instrumental version detection
    isInstrumental: /\binstrumental\b/i.test(title),

    // Karaoke version detection
    isKaraoke: /\bkaraoke\b/i.test(title),

    // Cover version detection
    isCover: /\bcover\b/i.test(title) ||
             /\bin the style of\b/i.test(title) ||
             /\btribute\b/i.test(title),

    // Radio edit detection
    isRadioEdit: /\bradio\s+edit\b/i.test(title) ||
                 /\bradio\s+version\b/i.test(title),

    // Extended version detection
    isExtended: /\bextended\b/i.test(title) ||
                /\bextended\s+version\b/i.test(title) ||
                /\bextended\s+mix\b/i.test(title),

    // Clean version detection
    isClean: /\bclean\b/i.test(title) ||
             /\[clean\]/i.test(title),

    // Explicit version detection
    isExplicit: track.explicit === true ||
                /\bexplicit\b/i.test(title) ||
                /\[explicit\]/i.test(title),

    // Generic version indicator
    hasVersion: /\bversion\b/i.test(title),

    // Compilation album
    isCompilation: /\b(compilation|various\s+artists|greatest\s+hits|best\s+of|soundtrack)\b/i.test(album)
  };
};

/**
 * Adjust confidence score based on edge case mismatches
 * @param {number} baseConfidence - Original confidence score (0-100)
 * @param {object} sourceEdgeCases - Edge cases from source track
 * @param {object} candidateTrack - Candidate track to compare against
 * @returns {number} Adjusted confidence score (0-100)
 */
export const adjustConfidenceForEdgeCases = (baseConfidence, sourceEdgeCases, candidateTrack) => {
  if (!candidateTrack || !candidateTrack.title) return baseConfidence;

  let adjusted = baseConfidence;
  const candidateTitle = candidateTrack.title.toLowerCase();

  // Penalize if source is a remix but candidate is not
  if (sourceEdgeCases.isRemix && !/\b(remix|rmx|rework|edit)\b/i.test(candidateTitle)) {
    adjusted -= 20;
  }

  // Penalize heavily if source is live but candidate is not
  // Live versions are significantly different from studio versions
  if (sourceEdgeCases.isLive && !/\b(live|concert|tour)\b/i.test(candidateTitle)) {
    adjusted -= 25;
  }

  // Penalize if source is acoustic but candidate is not
  if (sourceEdgeCases.isAcoustic && !/\bacoustic\b/i.test(candidateTitle)) {
    adjusted -= 15;
  }

  // Penalize if source is instrumental but candidate is not
  if (sourceEdgeCases.isInstrumental && !/\binstrumental\b/i.test(candidateTitle)) {
    adjusted -= 20;
  }

  // Penalize if source is karaoke but candidate is not
  if (sourceEdgeCases.isKaraoke && !/\bkaraoke\b/i.test(candidateTitle)) {
    adjusted -= 30; // Karaoke is very different
  }

  // Penalize if source is cover but candidate is not
  if (sourceEdgeCases.isCover && !/\bcover\b/i.test(candidateTitle)) {
    adjusted -= 25;
  }

  // Slight penalty for version mismatch (radio edit, extended, etc.)
  if (sourceEdgeCases.isRadioEdit && !/\bradio\s+edit\b/i.test(candidateTitle)) {
    adjusted -= 10;
  }

  if (sourceEdgeCases.isExtended && !/\bextended\b/i.test(candidateTitle)) {
    adjusted -= 10;
  }

  // Bonus if both have the same edge case (confirms match)
  if (sourceEdgeCases.isRemix && /\b(remix|rmx|rework)\b/i.test(candidateTitle)) {
    adjusted += 10;
  }

  if (sourceEdgeCases.isLive && /\b(live|concert|tour)\b/i.test(candidateTitle)) {
    adjusted += 10;
  }

  if (sourceEdgeCases.isAcoustic && /\bacoustic\b/i.test(candidateTitle)) {
    adjusted += 10;
  }

  // Ensure score stays within bounds
  return Math.max(0, Math.min(100, adjusted));
};

/**
 * Determine if two tracks are likely different versions of the same song
 * @param {object} track1 - First track
 * @param {object} track2 - Second track
 * @returns {object} Analysis result with compatibility score
 */
export const analyzeVersionCompatibility = (track1, track2) => {
  const edge1 = detectEdgeCases(track1);
  const edge2 = detectEdgeCases(track2);

  // Count edge case mismatches
  const edgeCaseKeys = [
    'isRemix', 'isLive', 'isAcoustic', 'isInstrumental',
    'isKaraoke', 'isCover', 'isRadioEdit', 'isExtended'
  ];

  let matches = 0;
  let mismatches = 0;

  edgeCaseKeys.forEach(key => {
    if (edge1[key] === edge2[key]) {
      matches++;
    } else if (edge1[key] || edge2[key]) {
      // One has the edge case, the other doesn't
      mismatches++;
    }
  });

  // Calculate compatibility score (0-100)
  const totalChecks = edgeCaseKeys.length;
  const compatibilityScore = Math.round((matches / totalChecks) * 100);

  return {
    compatible: mismatches === 0,
    compatibilityScore,
    matches,
    mismatches,
    edge1,
    edge2,
    warnings: generateVersionWarnings(edge1, edge2)
  };
};

/**
 * Generate human-readable warnings about version mismatches
 * @param {object} edge1 - Edge cases from first track
 * @param {object} edge2 - Edge cases from second track
 * @returns {string[]} Array of warning messages
 */
const generateVersionWarnings = (edge1, edge2) => {
  const warnings = [];

  if (edge1.isRemix !== edge2.isRemix) {
    warnings.push('One track is a remix, the other is not');
  }

  if (edge1.isLive !== edge2.isLive) {
    warnings.push('One track is a live version, the other is not');
  }

  if (edge1.isAcoustic !== edge2.isAcoustic) {
    warnings.push('One track is acoustic, the other is not');
  }

  if (edge1.isInstrumental !== edge2.isInstrumental) {
    warnings.push('One track is instrumental, the other is not');
  }

  if (edge1.isKaraoke !== edge2.isKaraoke) {
    warnings.push('One track is karaoke, the other is not');
  }

  if (edge1.isCover !== edge2.isCover) {
    warnings.push('One track is a cover version, the other is not');
  }

  return warnings;
};

/**
 * Check if a track should be excluded from automated matching
 * @param {object} track - Track to check
 * @returns {object} Exclusion result with reason
 */
export const shouldExcludeFromMatching = (track) => {
  if (!track || !track.title) {
    return { exclude: true, reason: 'Missing title' };
  }

  const edgeCases = detectEdgeCases(track);

  // Karaoke versions should generally be manually reviewed
  if (edgeCases.isKaraoke) {
    return { exclude: true, reason: 'Karaoke version - requires manual review' };
  }

  // Cover versions can be tricky - consider excluding
  if (edgeCases.isCover) {
    return { exclude: true, reason: 'Cover version - requires manual review' };
  }

  return { exclude: false, reason: null };
};

/**
 * Get recommended match threshold adjustment based on edge cases
 * @param {object} edgeCases - Detected edge cases
 * @returns {number} Threshold adjustment (-20 to +10)
 */
export const getThresholdAdjustment = (edgeCases) => {
  // If the track has complex edge cases, we should be more conservative
  // and require a higher confidence threshold

  let adjustment = 0;

  // Increase threshold (be more conservative) for:
  if (edgeCases.isLive) adjustment += 5;
  if (edgeCases.isRemix) adjustment += 3;
  if (edgeCases.isAcoustic) adjustment += 3;
  if (edgeCases.isCover) adjustment += 10;
  if (edgeCases.isKaraoke) adjustment += 15;

  // Decrease threshold (be more lenient) for:
  // Standard versions with just clean/explicit markers
  if (!edgeCases.isRemix && !edgeCases.isLive && !edgeCases.isAcoustic &&
      !edgeCases.isInstrumental && !edgeCases.isKaraoke && !edgeCases.isCover) {
    adjustment -= 2; // Slightly more lenient for standard tracks
  }

  return adjustment;
};
