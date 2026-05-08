// Profile Links Derivation Logic
// Automatically derive 4 profile buttons from curator social_links and external_links

/**
 * Platform icon mapping for social links and external links
 */
const PLATFORM_ICONS = {
  // Music Streaming Platforms
  'spotify': { name: 'Spotify', icon: 'spotify', type: 'streaming' },
  'apple': { name: 'Apple Music', icon: 'apple', type: 'streaming' },
  'applemusic': { name: 'Apple Music', icon: 'apple', type: 'streaming' },
  'apple-music': { name: 'Apple Music', icon: 'apple', type: 'streaming' },
  'tidal': { name: 'Tidal', icon: 'tidal', type: 'streaming' },
  'bandcamp': { name: 'Bandcamp', icon: 'bandcamp', type: 'streaming' },
  'youtube': { name: 'YouTube Music', icon: 'youtube', type: 'streaming' },
  'youtubemusic': { name: 'YouTube Music', icon: 'youtube', type: 'streaming' },
  'soundcloud': { name: 'SoundCloud', icon: 'soundcloud', type: 'streaming' },
  'deezer': { name: 'Deezer', icon: 'deezer', type: 'streaming' },
  
  // Social Media Platforms
  'instagram': { name: 'Instagram', icon: 'instagram', type: 'social' },
  'twitter': { name: 'Twitter', icon: 'twitter', type: 'social' },
  'x': { name: 'X (Twitter)', icon: 'twitter', type: 'social' },
  'facebook': { name: 'Facebook', icon: 'facebook', type: 'social' },
  'tiktok': { name: 'TikTok', icon: 'tiktok', type: 'social' },
  'linkedin': { name: 'LinkedIn', icon: 'linkedin', type: 'social' },
  'mastodon': { name: 'Mastodon', icon: 'mastodon', type: 'social' },
  
  // Professional/Website
  'website': { name: 'Website', icon: 'website', type: 'professional' },
  'homepage': { name: 'Website', icon: 'website', type: 'professional' },
  'site': { name: 'Website', icon: 'website', type: 'professional' },
  'www': { name: 'Website', icon: 'website', type: 'professional' },
  'email': { name: 'Email', icon: 'email', type: 'professional' },
  'contact': { name: 'Contact', icon: 'email', type: 'professional' }
};

/**
 * Platform priority order (higher priority appears first)
 */
const PLATFORM_PRIORITY = {
  streaming: 10,    // Music platforms get highest priority
  professional: 8, // Website/email gets high priority
  social: 5        // Social media gets lower priority
};

/**
 * URL pattern matching for automatic platform detection
 */
const URL_PATTERNS = {
  'spotify': /spotify\.com\/(artist|user|playlist)/i,
  'apple': /music\.apple\.com/i,
  'tidal': /tidal\.com/i,
  'bandcamp': /.*\.bandcamp\.com|bandcamp\.com/i,
  'youtube': /youtube\.com\/(channel|user|c\/)|youtu\.be/i,
  'soundcloud': /soundcloud\.com/i,
  'deezer': /deezer\.com/i,
  'instagram': /instagram\.com/i,
  'twitter': /twitter\.com|x\.com/i,
  'facebook': /facebook\.com/i,
  'tiktok': /tiktok\.com/i,
  'linkedin': /linkedin\.com/i
};

/**
 * JSON field parsing utility (from curator response processing pattern)
 */
const parseJsonField = (field, defaultValue = []) => {
  // Handle null, undefined, or empty values
  if (!field) return defaultValue;
  
  // Already an object/array - return as is (but validate if expecting array)
  if (typeof field === 'object') {
    if (Array.isArray(defaultValue)) {
      return Array.isArray(field) ? field : defaultValue;
    }
    return field;
  }
  
  // Handle string JSON
  if (typeof field === 'string') {
    try {
      let parsed = JSON.parse(field);
      
      // Check if we need to parse again (double-encoded JSON)
      if (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed);
        } catch (doubleParseError) {
          return defaultValue;
        }
      }
      
      // Ensure parsed value matches expected type
      if (Array.isArray(defaultValue)) {
        return Array.isArray(parsed) ? parsed : defaultValue;
      }
      return parsed || defaultValue;
    } catch (error) {
      return defaultValue;
    }
  }
  
  return defaultValue;
};

/**
 * Detect platform from URL
 * @param {string} url - URL to analyze
 * @returns {string|null} Platform identifier or null
 */
const detectPlatformFromUrl = (url) => {
  if (!url || typeof url !== 'string') return null;
  
  for (const [platform, pattern] of Object.entries(URL_PATTERNS)) {
    if (pattern.test(url)) {
      return platform;
    }
  }
  
  return null;
};

/**
 * Normalize link object from various input formats
 * @param {object|string} link - Link data (object or string URL)
 * @returns {object} Normalized link object
 */
const normalizeLinkObject = (link) => {
  // Handle string URLs
  if (typeof link === 'string') {
    const platform = detectPlatformFromUrl(link);
    return {
      type: platform || 'website',
      url: link,
      title: platform ? PLATFORM_ICONS[platform]?.name : 'Website',
      icon: platform ? PLATFORM_ICONS[platform]?.icon : 'website'
    };
  }
  
  // Handle object format
  if (typeof link === 'object' && link.url) {
    const detectedPlatform = detectPlatformFromUrl(link.url);
    const explicitPlatform = link.platform || link.type;
    
    // Use explicit platform if valid, otherwise use detected
    let platform = null;
    if (explicitPlatform && PLATFORM_ICONS[explicitPlatform.toLowerCase()]) {
      platform = explicitPlatform.toLowerCase();
    } else if (detectedPlatform) {
      platform = detectedPlatform;
    }
    
    return {
      type: platform || 'website',
      url: link.url,
      title: link.title || link.name || (platform ? PLATFORM_ICONS[platform]?.name : 'Website'),
      icon: platform ? PLATFORM_ICONS[platform]?.icon : 'website'
    };
  }
  
  return null;
};

/**
 * Sort links by platform priority and type
 * @param {array} links - Array of normalized link objects
 * @returns {array} Sorted links
 */
const sortLinksByPriority = (links) => {
  return links.sort((a, b) => {
    const aPlatform = PLATFORM_ICONS[a.type];
    const bPlatform = PLATFORM_ICONS[b.type];
    
    const aPriority = aPlatform ? PLATFORM_PRIORITY[aPlatform.type] || 0 : 0;
    const bPriority = bPlatform ? PLATFORM_PRIORITY[bPlatform.type] || 0 : 0;
    
    // Higher priority first
    if (aPriority !== bPriority) {
      return bPriority - aPriority;
    }
    
    // If same priority, sort alphabetically by title
    return a.title.localeCompare(b.title);
  });
};

/**
 * Derive 4 profile links from curator data
 * Links 1-3: From curator social_links and external_links
 * Link 4: Always curator profile page
 * 
 * @param {object} curator - Curator data with social_links and external_links
 * @returns {array} Array of 4 profile link objects
 */
export const deriveProfileLinks = (curator) => {
  if (!curator || typeof curator !== 'object') {
    return [];
  }
  
  // Parse JSON fields using curator pattern
  const socialLinks = parseJsonField(curator.social_links, []);
  const externalLinks = parseJsonField(curator.external_links, []);
  
  // Normalize all links to consistent format
  const normalizedSocial = socialLinks
    .map(normalizeLinkObject)
    .filter(link => link !== null);
    
  const normalizedExternal = externalLinks
    .map(normalizeLinkObject)
    .filter(link => link !== null);
  
  // Combine and deduplicate by URL
  const allLinks = [...normalizedSocial, ...normalizedExternal];
  const uniqueLinks = [];
  const seenUrls = new Set();
  
  for (const link of allLinks) {
    if (!seenUrls.has(link.url)) {
      seenUrls.add(link.url);
      uniqueLinks.push(link);
    }
  }
  
  // Sort by priority and take first 3
  const sortedLinks = sortLinksByPriority(uniqueLinks);
  const firstThreeLinks = sortedLinks.slice(0, 3);
  
  // Always add curator profile as 4th link (with Flowerpil logo)
  const curatorProfileLink = {
    type: 'curator_profile',
    url: `/curator/${encodeURIComponent(curator.name)}`,
    title: curator.name || 'Curator Profile',
    icon: 'flowerpil-logo', // Special icon for curator profile
    isCuratorProfile: true
  };
  
  // Return exactly 4 links (pad with empty slots if needed)
  const profileLinks = [...firstThreeLinks];
  
  // Fill remaining slots up to 3 with empty placeholders
  while (profileLinks.length < 3) {
    profileLinks.push({
      type: 'empty',
      url: null,
      title: null,
      icon: null,
      isEmpty: true
    });
  }
  
  // Add curator profile as 4th link
  profileLinks.push(curatorProfileLink);
  
  return profileLinks;
};

/**
 * Get profile links with metadata for display
 * @param {object} curator - Curator data
 * @returns {array} Profile links with display metadata
 */
export const getProfileLinksForDisplay = (curator) => {
  const links = deriveProfileLinks(curator);
  
  return links.map((link, index) => ({
    ...link,
    position: index + 1,
    isVisible: !link.isEmpty,
    displayTitle: link.title || `Link ${index + 1}`,
    ariaLabel: link.title ? `Visit ${link.title}` : null,
    target: link.type === 'curator_profile' ? '_self' : '_blank',
    rel: link.type === 'curator_profile' ? null : 'noopener noreferrer'
  }));
};

/**
 * Get analytics identifiers for profile links
 * @param {object} curator - Curator data
 * @returns {array} Links with analytics identifiers
 */
export const getProfileLinksForAnalytics = (curator) => {
  const links = deriveProfileLinks(curator);
  
  return links.map((link, index) => ({
    position: index + 1,
    link_type: 'profile_button',
    link_identifier: link.type === 'curator_profile' ? 'curator_profile' : link.type,
    platform: link.type,
    url: link.url,
    title: link.title,
    isEmpty: link.isEmpty || false
  }));
};

/**
 * Validate curator data for profile links derivation
 * @param {object} curator - Curator data to validate
 * @returns {object} Validation result
 */
export const validateCuratorForProfileLinks = (curator) => {
  const warnings = [];
  const info = [];
  
  if (!curator || typeof curator !== 'object') {
    return {
      isValid: false,
      errors: ['Curator data is required'],
      warnings,
      info
    };
  }
  
  if (!curator.name || typeof curator.name !== 'string') {
    return {
      isValid: false,
      errors: ['Curator name is required for profile links'],
      warnings,
      info
    };
  }
  
  // Check social_links
  const socialLinks = parseJsonField(curator.social_links, []);
  if (socialLinks.length === 0) {
    warnings.push('No social links found - fewer profile buttons will be available');
  } else {
    info.push(`Found ${socialLinks.length} social link(s)`);
  }
  
  // Check external_links
  const externalLinks = parseJsonField(curator.external_links, []);
  if (externalLinks.length === 0) {
    warnings.push('No external links found - fewer profile buttons will be available');
  } else {
    info.push(`Found ${externalLinks.length} external link(s)`);
  }
  
  // Check total available links
  const totalLinks = socialLinks.length + externalLinks.length;
  if (totalLinks === 0) {
    warnings.push('No links found - only curator profile button will be available');
  } else if (totalLinks < 3) {
    info.push(`${totalLinks} link(s) found - ${3 - totalLinks} profile button(s) will be empty`);
  } else {
    info.push(`${Math.min(totalLinks, 3)} profile buttons will be populated`);
  }
  
  return {
    isValid: true,
    errors: [],
    warnings,
    info,
    linkCount: totalLinks,
    availableSlots: Math.min(totalLinks, 3)
  };
};

/**
 * Test profile links derivation with sample curator data
 * @param {object} testCurator - Test curator data
 * @returns {object} Test results
 */
export const testProfileLinksDerivation = (testCurator) => {
  const validation = validateCuratorForProfileLinks(testCurator);
  const links = deriveProfileLinks(testCurator);
  const displayLinks = getProfileLinksForDisplay(testCurator);
  const analyticsLinks = getProfileLinksForAnalytics(testCurator);
  
  return {
    validation,
    rawLinks: links,
    displayLinks,
    analyticsLinks,
    summary: {
      totalLinks: links.length,
      populatedLinks: links.filter(l => !l.isEmpty).length,
      emptySlots: links.filter(l => l.isEmpty).length,
      hasCuratorProfile: links.some(l => l.type === 'curator_profile')
    }
  };
};