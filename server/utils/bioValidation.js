// Bio Page Validation Utilities
// Comprehensive validation for handles, content, and user input

import { DEFAULT_THEME } from '../../src/shared/constants/bioThemes.js';

// Reserved handles from Phase 0 specifications (200+ terms)
const RESERVED_HANDLES = [
  // System & Infrastructure
  'admin', 'api', 'www', 'mail', 'ftp', 'sftp', 'ssl', 'tls',
  'cdn', 'static', 'assets', 'uploads', 'download', 'downloads',
  'file', 'files', 'image', 'images', 'media', 'video', 'videos', 
  'audio', 'public', 'private', 'secure', 'cache', 'temp', 'tmp',
  'backup', 'logs', 'status', 'health',
  
  // Authentication & User Management
  'login', 'logout', 'signin', 'signup', 'register', 'auth', 'oauth',
  'account', 'profile', 'user', 'users', 'member', 'members',
  'dashboard', 'settings', 'preferences', 'config', 'configuration',
  'password', 'reset', 'forgot', 'verify', 'verification', 'activate',
  'activation', 'token', 'session', 'sessions',
  
  // Business & Legal
  'about', 'contact', 'help', 'support', 'faq', 'terms', 'privacy',
  'legal', 'policy', 'policies', 'dmca', 'copyright', 'trademark',
  'license', 'licenses', 'billing', 'payment', 'payments', 'invoice',
  'invoices', 'subscribe', 'subscription', 'unsubscribe', 'newsletter',
  
  // Content & Commerce
  'blog', 'news', 'article', 'articles', 'post', 'posts', 'page',
  'pages', 'home', 'index', 'search', 'browse', 'category', 'categories',
  'tag', 'tags', 'archive', 'archives', 'feed', 'rss', 'atom', 'xml',
  'shop', 'store', 'cart', 'checkout', 'order', 'orders', 'product',
  
  // Development & Testing
  'dev', 'development', 'test', 'testing', 'stage', 'staging', 
  'preview', 'demo', 'sample', 'example', 'sandbox', 'beta',
  'alpha', 'rc', 'release', 'version', 'v1', 'v2', 'latest', 'stable',
  
  // Platform Specific
  'flowerpil', 'pil', 'bio', 'curator', 'curators', 'artist', 'artists',
  'playlist', 'playlists', 'music', 'track', 'tracks', 'album', 'albums',
  'release', 'releases', 'label', 'labels',
  
  // Social & Communication
  'social', 'share', 'follow', 'followers', 'following', 'like', 'likes',
  'favorite', 'favorites', 'bookmark', 'bookmarks', 'comment', 'comments',
  'message', 'messages', 'notification',
  
  // Common Internet Terms
  'email', 'e-mail', 'username', 'handle', 'url', 'link', 'links',
  'redirect', 'forward', 'proxy', 'mirror', 'clone', 'copy', 'duplicate',
  'backup', 'restore', 'import', 'export', 'sync', 'update',
  
  // Abuse Prevention
  'spam', 'abuse', 'report', 'flag', 'ban', 'banned', 'block', 'blocked',
  'delete', 'deleted', 'remove', 'removed', 'suspend', 'suspended'
];

// Handle validation rules
export const HANDLE_VALIDATION_RULES = {
  minLength: 3,
  maxLength: 30,
  pattern: /^[a-z0-9-]+$/,         // Lowercase letters, numbers, hyphens only
  noConsecutiveHyphens: /--/,      // No double hyphens
  noLeadingHyphen: /^-/,           // No leading hyphen
  noTrailingHyphen: /-$/           // No trailing hyphen
};

const MAX_FEATURED_LINKS = 9;

/**
 * Validate bio page handle
 * @param {string} handle - Handle to validate
 * @returns {object} Validation result with errors
 */
export const validateHandle = (handle) => {
  const errors = [];
  
  if (!handle || typeof handle !== 'string') {
    errors.push('Handle is required');
    return { isValid: false, errors, handle: null };
  }
  
  const cleanHandle = handle.toLowerCase().trim();
  
  // Length validation
  if (cleanHandle.length < HANDLE_VALIDATION_RULES.minLength) {
    errors.push(`Handle must be at least ${HANDLE_VALIDATION_RULES.minLength} characters`);
  }
  
  if (cleanHandle.length > HANDLE_VALIDATION_RULES.maxLength) {
    errors.push(`Handle must be no more than ${HANDLE_VALIDATION_RULES.maxLength} characters`);
  }
  
  // Character validation
  if (!HANDLE_VALIDATION_RULES.pattern.test(cleanHandle)) {
    errors.push('Handle can only contain lowercase letters, numbers, and hyphens');
  }
  
  // Hyphen validation
  if (HANDLE_VALIDATION_RULES.noConsecutiveHyphens.test(cleanHandle)) {
    errors.push('Handle cannot contain consecutive hyphens');
  }
  
  if (HANDLE_VALIDATION_RULES.noLeadingHyphen.test(cleanHandle)) {
    errors.push('Handle cannot start with a hyphen');
  }
  
  if (HANDLE_VALIDATION_RULES.noTrailingHyphen.test(cleanHandle)) {
    errors.push('Handle cannot end with a hyphen');
  }
  
  // Reserved word check
  if (isReservedHandle(cleanHandle)) {
    errors.push('This handle is reserved and cannot be used');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    handle: cleanHandle
  };
};

/**
 * Check if handle is reserved
 * @param {string} handle - Handle to check
 * @returns {boolean} True if reserved
 */
export const isReservedHandle = (handle) => {
  return RESERVED_HANDLES.includes(handle.toLowerCase());
};

/**
 * Check handle availability in database
 * @param {string} handle - Handle to check
 * @param {object} queries - Database queries object
 * @param {number} excludeId - Bio profile ID to exclude (for updates)
 * @returns {object} Availability result
 */
export const checkHandleAvailability = async (handle, queries, excludeId = null) => {
  const validation = validateHandle(handle);
  
  if (!validation.isValid) {
    return { 
      available: false, 
      reason: 'invalid', 
      errors: validation.errors,
      handle: validation.handle 
    };
  }
  
  if (isReservedHandle(validation.handle)) {
    return { 
      available: false, 
      reason: 'reserved',
      handle: validation.handle 
    };
  }
  
  // Check database for existing handles
  const existing = queries.checkHandleAvailability.get(validation.handle);
  
  if (existing && (!excludeId || existing.id !== excludeId)) {
    return { 
      available: false, 
      reason: 'taken',
      handle: validation.handle 
    };
  }

  if (queries.getHandleReservationByHandle) {
    const reservation = queries.getHandleReservationByHandle.get(validation.handle);
    if (reservation) {
      const status = reservation.status || 'reserved';
      const expiresAt = reservation.expires_at ? new Date(reservation.expires_at) : null;
      const isExpired = expiresAt ? expiresAt.getTime() < Date.now() : false;

      if (status !== 'released' && !isExpired) {
        return {
          available: false,
          reason: status === 'assigned' ? 'assigned' : 'reserved',
          handle: validation.handle
        };
      }
    }
  }
  
  return { 
    available: true, 
    handle: validation.handle 
  };
};

/**
 * Generate handle suggestions based on partial input
 * @param {string} partial - Partial handle
 * @param {object} queries - Database queries object
 * @returns {array} Array of suggested handles
 */
export const suggestHandles = async (partial, queries) => {
  const suggestions = [];
  const baseHandle = partial.toLowerCase().replace(/[^a-z0-9-]/g, '').substring(0, 25);
  
  if (baseHandle.length < 2) {
    return suggestions;
  }
  
  // Try base handle
  const baseCheck = await checkHandleAvailability(baseHandle, queries);
  if (baseCheck.available) {
    suggestions.push(baseHandle);
  }
  
  // Try with suffixes
  const suffixes = ['music', 'official', '2025', 'bio', 'page'];
  for (const suffix of suffixes) {
    const candidate = `${baseHandle}-${suffix}`;
    if (candidate.length <= HANDLE_VALIDATION_RULES.maxLength) {
      const check = await checkHandleAvailability(candidate, queries);
      if (check.available) {
        suggestions.push(candidate);
      }
    }
  }
  
  // Try with numbers
  for (let i = 2; i <= 10; i++) {
    const candidate = `${baseHandle}${i}`;
    if (candidate.length <= HANDLE_VALIDATION_RULES.maxLength) {
      const check = await checkHandleAvailability(candidate, queries);
      if (check.available) {
        suggestions.push(candidate);
      }
    }
  }
  
  return suggestions.slice(0, 5);
};

/**
 * Sanitize bio profile data for database storage
 * @param {object} data - Raw bio profile data
 * @returns {object} Sanitized data
 */
export const sanitizeBioProfileData = (data) => {
  const sanitized = {
    // Handle validation (will be validated separately)
    handle: data.handle ? String(data.handle).toLowerCase().trim() : '',
    
    // Curator ID validation
    curator_id: data.curator_id ? parseInt(data.curator_id, 10) : null,
    
    // JSON field sanitization
    display_settings: data.display_settings ? 
      JSON.stringify(sanitizeDisplaySettings(data.display_settings)) : null,
      
    theme_settings: data.theme_settings ? 
      JSON.stringify(sanitizeThemeSettings(data.theme_settings)) : null,
      
    seo_metadata: data.seo_metadata ? 
      JSON.stringify(sanitizeSeoMetadata(data.seo_metadata)) : null,
      
    draft_content: data.draft_content ? 
      JSON.stringify(sanitizeContentData(data.draft_content)) : null,
    
    // Boolean conversion to integer
    is_published: data.is_published ? 1 : 0,
    
    // Version number validation
    version_number: data.version_number ? Math.max(1, parseInt(data.version_number, 10)) : 1
  };
  
  return sanitized;
};

/**
 * Sanitize display settings JSON
 * @param {object} settings - Raw display settings
 * @returns {object} Sanitized settings
 */
const sanitizeDisplaySettings = (settings) => {
  const defaults = {
    showBio: true,
    showLocation: true,
    showSocialLinks: true,
    showFeaturedLinks: true,
    showAnalytics: false,
    showProfilePicture: true,
    profileLinksVisibility: {}
  };

  if (typeof settings !== 'object' || !settings) {
    return defaults;
  }

  return {
    showBio: Boolean(settings.showBio !== false),
    showLocation: Boolean(settings.showLocation !== false),
    showSocialLinks: Boolean(settings.showSocialLinks !== false),
    showFeaturedLinks: Boolean(settings.showFeaturedLinks !== false),
    showAnalytics: Boolean(settings.showAnalytics === true),
    showProfilePicture: Boolean(settings.showProfilePicture !== false),
    profileLinksVisibility: (settings.profileLinksVisibility && typeof settings.profileLinksVisibility === 'object')
      ? settings.profileLinksVisibility
      : {}
  };
};

/**
 * Sanitize theme settings JSON
 * @param {object} theme - Raw theme settings
 * @returns {object} Sanitized theme
 */
const sanitizeThemeSettings = (theme) => {
  const defaults = {
    paletteId: 'flowerpil-default',
    customColors: null
  };
  
  if (typeof theme !== 'object' || !theme) {
    return defaults;
  }
  
  const sanitized = {
    paletteId: typeof theme.paletteId === 'string' ? 
      theme.paletteId.substring(0, 50) : defaults.paletteId,
    customColors: null
  };
  
  // Validate custom colors if provided
  if (theme.customColors && typeof theme.customColors === 'object') {
    const colors = theme.customColors;
    const validatedColors = {};

    // Validate each color individually and include if valid
    if (isValidColor(colors.background)) {
      validatedColors.background = colors.background;
    }
    if (isValidColor(colors.text)) {
      validatedColors.text = colors.text;
    }
    if (isValidColor(colors.link)) {
      validatedColors.link = colors.link;
    } else if (colors.link !== undefined) {
      validatedColors.link = DEFAULT_THEME.link;
    }
    if (isValidColor(colors.border)) {
      validatedColors.border = colors.border;
    }
    if (isValidColor(colors.accent)) {
      validatedColors.accent = colors.accent;
    } else if (colors.accent !== undefined) {
      // Provide fallback if accent was attempted but invalid
      validatedColors.accent = DEFAULT_THEME.accent;
    }
    if (isValidColor(colors.featuredLinkBg)) {
      validatedColors.featuredLinkBg = colors.featuredLinkBg;
    } else if (colors.featuredLinkBg !== undefined) {
      // Provide fallback if featuredLinkBg was attempted but invalid
      validatedColors.featuredLinkBg = DEFAULT_THEME.featuredLinkBg;
    }

    // Only set customColors if we have at least background, text, and border
    if (validatedColors.background && validatedColors.text && validatedColors.border) {
      sanitized.customColors = validatedColors;
    }
  }
  
  return sanitized;
};

/**
 * Sanitize SEO metadata JSON
 * @param {object} seo - Raw SEO metadata
 * @returns {object} Sanitized SEO data
 */
const sanitizeSeoMetadata = (seo) => {
  if (typeof seo !== 'object' || !seo) {
    return {};
  }
  
  return {
    title: seo.title ? String(seo.title).substring(0, 60).trim() : null,
    description: seo.description ? String(seo.description).substring(0, 160).trim() : null,
    keywords: Array.isArray(seo.keywords) ? 
      seo.keywords.slice(0, 10).map(k => String(k).substring(0, 30).trim()) : null
  };
};

/**
 * Sanitize content data JSON  
 * @param {object} content - Raw content data
 * @returns {object} Sanitized content
 */
const sanitizeContentData = (content) => {
  if (typeof content !== 'object' || !content) {
    return {};
  }
  
  return {
    bio: content.bio ? String(content.bio).substring(0, 2000).trim() : null,
    customBio: content.customBio ? String(content.customBio).substring(0, 500).trim() : null,
    featuredLinks: Array.isArray(content.featuredLinks)
      ? content.featuredLinks
          .slice(0, MAX_FEATURED_LINKS)
          .map(sanitizeFeaturedLink)
          .filter(Boolean)
      : []
  };
};

/**
 * Sanitize featured link data
 * @param {object} link - Raw featured link
 * @returns {object} Sanitized link
 */
const sanitizeFeaturedLink = (link) => {
  if (typeof link !== 'object' || !link) {
    return null;
  }

  const requestedType = typeof link.link_type === 'string' ? link.link_type : 'url';
  const allowedType = requestedType === 'playlist' ? 'playlist' : 'url';

  const sanitized = {
    position: Math.max(1, Math.min(MAX_FEATURED_LINKS, parseInt(link.position, 10) || 1)),
    link_type: allowedType,
    title: link.title ? String(link.title).substring(0, 100).trim() : '',
    description: link.description ? String(link.description).substring(0, 200).trim() : '',
    is_enabled: Boolean(link.is_enabled !== false)
  };

  const trimmedUrl = link.url ? String(link.url).substring(0, 500).trim() : '';
  const trimmedImage = link.image_url ? String(link.image_url).substring(0, 500).trim() : null;

  if (allowedType === 'playlist') {
    const playlistId = link.playlist_id ? parseInt(link.playlist_id, 10) : null;

    if (playlistId) {
      sanitized.playlist_id = playlistId;
      sanitized.url = trimmedUrl || `/playlists/${playlistId}`;
      sanitized.image_url = trimmedImage;
    } else {
      // Fallback to external link when playlist selection is incomplete
      sanitized.link_type = 'url';
      sanitized.url = trimmedUrl;
      sanitized.image_url = trimmedImage;
    }
  } else {
    sanitized.url = trimmedUrl;
    sanitized.image_url = trimmedImage;
  }

  return sanitized;
};

/**
 * Validate hex color format
 * @param {string} color - Color string to validate
 * @returns {boolean} True if valid hex color
 */
const isValidHexColor = (color) => {
  if (typeof color !== 'string') return false;

  // Allow 3-digit hex colors (#abc)
  if (/^#[0-9A-Fa-f]{3}$/.test(color)) return true;

  // Allow 6-digit hex colors (#aabbcc)
  if (/^#[0-9A-Fa-f]{6}$/.test(color)) return true;

  return false;
};

const isValidColor = (color) => {
  if (typeof color !== 'string') return false;

  // Allow hex colors
  if (isValidHexColor(color)) return true;

  // Allow rgb/rgba colors (flexible spacing)
  if (/^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+)?\s*\)$/.test(color)) return true;

  // Allow named colors (basic CSS colors)
  const namedColors = ['transparent', 'inherit', 'initial', 'unset'];
  if (namedColors.includes(color.toLowerCase())) return true;

  return false;
};
