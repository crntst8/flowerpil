/**
 * Image URL Utility Functions
 * Phase 2: Responsive Image Delivery
 *
 * Provides functions to generate responsive image URLs with format variants
 */

const R2_HOST_MATCHERS = [
  'images.flowerpil.io',
  '.r2.dev',
  '.r2.cloudflarestorage.com'
];

const UPLOADS_PREFIX = '/uploads/';

const mapExtensionToFormat = (ext) => {
  if (!ext) return null;
  const lower = ext.toLowerCase();
  if (lower === '.jpg' || lower === '.jpeg') return 'jpeg';
  if (lower === '.png') return 'png';
  if (lower === '.webp') return 'webp';
  if (lower === '.avif') return 'avif';
  return null;
};

const resolveApiBaseUrl = () => {
  const envUrl = typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL;
  if (typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.replace(/\/+$/, '');
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin;
    const hostname = (() => {
      try {
        return new URL(origin).hostname;
      } catch (error) {
        console.warn('Failed to parse window origin for API base:', origin, error);
        return '';
      }
    })();

    if (/localhost|127\.0\.0\.1/.test(hostname)) {
      return 'http://localhost:3000';
    }

    if (/flowerpil\.io$/.test(hostname) || /fpil\.xyz$/.test(hostname)) {
      return 'https://api.flowerpil.io';
    }

    return origin.replace(/\/+$/, '');
  }

  return 'https://api.flowerpil.io';
};

const isR2Host = (hostname) => {
  if (!hostname) return false;
  return R2_HOST_MATCHERS.some((matcher) => {
    if (matcher.startsWith('.')) {
      return hostname.endsWith(matcher);
    }
    return hostname === matcher;
  });
};

const buildVariantUrl = (origin, basePath, suffixes, extension, search = '') => {
  const variants = Array.isArray(suffixes) && suffixes.length ? suffixes : [''];

  for (const suffix of variants) {
    const candidate = `${basePath}${suffix}${extension}`;
    if (candidate) {
      return `${origin}${candidate}${search}`;
    }
  }

  return `${origin}${basePath}${extension}${search}`;
};

/**
 * Generate responsive image URLs with all format and size variants
 * @param {string} baseUrl - Base image URL (e.g., https://images.flowerpil.io/playlists/uuid_large.jpg)
 * @returns {Object|null} URLs organized by format and size
 *
 * @example
 * const urls = getResponsiveImageUrls('https://images.flowerpil.io/playlists/abc123_large.jpg');
 * // Returns:
 * {
 *   jpeg: {
 *     large: 'https://images.flowerpil.io/playlists/abc123_large.jpg',
 *     medium: 'https://images.flowerpil.io/playlists/abc123_medium.jpg',
 *     small: 'https://images.flowerpil.io/playlists/abc123_small.jpg',
 *     original: 'https://images.flowerpil.io/playlists/abc123.jpg'
 *   },
 *   webp: { ... },
 *   avif: { ... }
 * }
 */
export function getResponsiveImageUrls(baseUrl) {
  if (!baseUrl || typeof baseUrl !== 'string') return null;

  try {
    let fullUrl = baseUrl;
    let uploadsPath = false;

    if (baseUrl.startsWith('/')) {
      if (baseUrl.startsWith(UPLOADS_PREFIX)) {
        fullUrl = `${resolveApiBaseUrl()}${baseUrl}`;
        uploadsPath = true;
      } else if (typeof window !== 'undefined' && window.location?.origin) {
        fullUrl = `${window.location.origin}${baseUrl}`;
      }
    }

    const url = new URL(fullUrl);
    uploadsPath ||= url.pathname.startsWith(UPLOADS_PREFIX);

    const pathname = url.pathname;
    const extIndex = pathname.lastIndexOf('.');
    if (extIndex === -1) return null;

    const ext = pathname.substring(extIndex);
    const formatFromExt = mapExtensionToFormat(ext) || 'jpeg';
    const basePathWithoutExt = pathname.substring(0, extIndex);
    const cleanBasePath = basePathWithoutExt.replace(/_(large|medium|small|original|lg|md|sm)$/i, '');

    const origin = `${url.protocol}//${url.host}`;
    const r2Host = isR2Host(url.hostname);
    const supportsVariants = r2Host || uploadsPath;

    const formats = r2Host ? ['jpeg', 'webp', 'avif'] : [formatFromExt];
    const sizes = ['original', 'large', 'medium', 'small'];
    const urls = {};

    formats.forEach((format) => {
      const formatExt = format === 'jpeg' ? '.jpg' : `.${format}`;
      urls[format] = {};

      sizes.forEach((size) => {
        if (!supportsVariants) {
          urls[format][size] = `${origin}${pathname}${url.search}`;
          return;
        }

        const suffixCandidates = (() => {
          if (size === 'original') return [''];

          if (r2Host) {
            if (size === 'large') return ['_large', '_lg', ''];
            if (size === 'medium') return ['_medium', '_md', ''];
            if (size === 'small') return ['_small', '_sm', ''];
          }

          if (uploadsPath) {
            if (size === 'large') return ['', '_large', '_lg'];
            if (size === 'medium') return ['_md', '_medium', ''];
            if (size === 'small') return ['_sm', '_small', ''];
          }

          return [''];
        })();

        urls[format][size] = buildVariantUrl(
          origin,
          cleanBasePath,
          suffixCandidates,
          formatExt,
          url.search
        );
      });
    });

    if (!urls.jpeg) {
      const firstFormatKey = Object.keys(urls)[0];
      if (firstFormatKey) {
        urls.jpeg = urls[firstFormatKey];
      }
    }

    return urls;
  } catch (error) {
    console.warn('Failed to parse image URL:', baseUrl, error);
    return null;
  }
}

/**
 * Get image URL for a specific size and format
 * @param {string} baseUrl - Base image URL
 * @param {string} size - Size variant (small, medium, large, original)
 * @param {string} format - Format (jpeg, webp, avif)
 * @returns {string|null} Image URL
 */
export function getImageUrl(baseUrl, size = 'large', format = 'jpeg') {
  const urls = getResponsiveImageUrls(baseUrl);
  if (!urls) return baseUrl;

  return urls[format]?.[size] || baseUrl;
}

/**
 * Predefined sizes attributes for common use cases
 * Use these in the ResponsiveImage component's sizes prop
 */
export const IMAGE_SIZES = {
  /**
   * Full viewport width
   * Use for hero images and full-width banners
   */
  FULL_WIDTH: '100vw',

  /**
   * Small card image
   * Full width on mobile, half width on tablet, 400px on desktop
   */
  CARD_SMALL: '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 400px',

  /**
   * Medium card image
   * Full width on mobile, half width on tablet, 600px on desktop
   */
  CARD_MEDIUM: '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 600px',

  /**
   * Large card image
   * Full width on mobile, half width on tablet, 800px on desktop
   */
  CARD_LARGE: '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 800px',

  /**
   * Thumbnail image (fixed size)
   */
  THUMBNAIL: '200px',

  /**
   * Small thumbnail (fixed size)
   */
  THUMBNAIL_SMALL: '80px',

  /**
   * Profile image
   * 100px on mobile, 150px on desktop
   */
  PROFILE: '(max-width: 640px) 100px, 150px',

  /**
   * Profile image large
   * 150px on mobile, 200px on desktop
   */
  PROFILE_LARGE: '(max-width: 640px) 150px, 200px',

  /**
   * Hero image (full width)
   */
  HERO: '100vw',

  /**
   * Grid item (3 columns)
   * 33vw on desktop, 50vw on tablet, 100vw on mobile
   */
  GRID_3_COL: '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw',

  /**
   * Grid item (4 columns)
   * 25vw on desktop, 50vw on tablet, 100vw on mobile
   */
  GRID_4_COL: '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw'
};

/**
 * Check if browser supports a specific image format
 * @param {string} format - Format to check (webp, avif)
 * @returns {Promise<boolean>}
 */
export async function supportsImageFormat(format) {
  if (format === 'jpeg' || format === 'png') return true;

  // Check for cached result
  const cacheKey = `imageFormat_${format}`;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached !== null) {
    return cached === 'true';
  }

  // Test format support
  try {
    if (format === 'webp') {
      const canvas = document.createElement('canvas');
      const supported = canvas.toDataURL('image/webp').startsWith('data:image/webp');
      sessionStorage.setItem(cacheKey, String(supported));
      return supported;
    }

    if (format === 'avif') {
      // AVIF detection via small base64 image
      const avifData = 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgANogQEAwgMg8f8D///8WfhwB8+ErK42A=';

      const supported = await new Promise(resolve => {
        const img = new Image();
        img.onload = img.onerror = () => resolve(img.height === 2);
        img.src = avifData;
      });

      sessionStorage.setItem(cacheKey, String(supported));
      return supported;
    }

    return false;
  } catch (error) {
    console.warn(`Failed to detect ${format} support:`, error);
    return false;
  }
}

/**
 * Get the best supported format for the current browser
 * @returns {Promise<string>} Best format (avif, webp, or jpeg)
 */
export async function getBestSupportedFormat() {
  // Check for cached result
  const cached = sessionStorage.getItem('bestImageFormat');
  if (cached) return cached;

  // Test formats in order of preference (best compression first)
  const formats = ['avif', 'webp', 'jpeg'];

  for (const format of formats) {
    const supported = await supportsImageFormat(format);
    if (supported) {
      sessionStorage.setItem('bestImageFormat', format);
      return format;
    }
  }

  return 'jpeg'; // Fallback
}

/**
 * Extract image dimensions from URL if available
 * @param {string} url - Image URL
 * @returns {Object|null} Dimensions {width, height} or null
 */
export function extractDimensionsFromUrl(url) {
  // Check if URL contains dimension information (common pattern)
  const match = url.match(/[_-](\d+)x(\d+)[._-]/);
  if (match) {
    return {
      width: parseInt(match[1], 10),
      height: parseInt(match[2], 10)
    };
  }

  // Check for size suffix and infer dimensions
  if (url.includes('_small') || url.includes('_sm')) {
    return { width: 200, height: 200 };
  } else if (url.includes('_medium') || url.includes('_md')) {
    return { width: 400, height: 400 };
  } else if (url.includes('_large') || url.includes('_lg')) {
    return { width: 800, height: 800 };
  }

  return null;
}

/**
 * Build srcset string from image URLs
 * @param {Object} urls - URLs by size from getResponsiveImageUrls()
 * @returns {string} srcset attribute value
 */
export function buildSrcSet(urls) {
  if (!urls) return '';

  const entries = [];
  const sizeWidths = {
    small: 200,
    medium: 400,
    large: 800
    // NOTE: 'original' excluded because not all images have a base file without suffix
    // Images generated from playlists only have _small, _medium, _large variants
  };

  Object.entries(urls).forEach(([size, url]) => {
    const width = sizeWidths[size];
    if (width && url) {
      entries.push(`${url} ${width}w`);
    }
  });

  return entries.join(', ');
}
