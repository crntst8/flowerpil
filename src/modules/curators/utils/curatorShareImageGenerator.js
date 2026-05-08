/**
 * Curator Profile Instagram Story Image Generator
 * Uses the profile template and spec from docs/mockup/profile-ig.png.
 */

const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1920;

const TEMPLATE_PATH = '/assets/instagram/template-ig-profile.png';

const ORIGINAL_PROFILE_SIZE = 583;
const ORIGINAL_PROFILE_X = 251;
const ORIGINAL_PROFILE_Y = 642;

const PROFILE_SIZE = ORIGINAL_PROFILE_SIZE * 0.8;
const PROFILE_X = ORIGINAL_PROFILE_X + (ORIGINAL_PROFILE_SIZE - PROFILE_SIZE) / 2;
const PROFILE_Y = ORIGINAL_PROFILE_Y + (ORIGINAL_PROFILE_SIZE - PROFILE_SIZE) / 2;

const SHADOW_COLOR = 'rgba(0, 0, 0, 0.3)';
const SHADOW_ANGLE = 171;
const SHADOW_DISTANCE = 25;
const SHADOW_BLUR = 54;

const NAME_FONT_SIZE = 118.32;
const NAME_FONT_WEIGHT = 600;
const NAME_X = 184.15;
const NAME_Y = 1330.08;
const NAME_TRACKING = -60;
const NAME_MIN_SIZE = 72;

const FALLBACK_PROFILE_IMAGE = '/pfp.png';

const R2_HOST_MATCHERS = [
  'images.flowerpil.io',
  '.r2.dev',
  '.r2.cloudflarestorage.com'
];

const degreesToRadians = (degrees) => (degrees * Math.PI) / 180;

const getShadowOffsets = () => {
  const radians = degreesToRadians(SHADOW_ANGLE);
  return {
    x: Math.cos(radians) * SHADOW_DISTANCE,
    y: Math.sin(radians) * SHADOW_DISTANCE,
  };
};

const buildCorsSafeUrl = (url) => {
  if (!url) return url;
  try {
    const resolved = new URL(url, window.location.origin);
    if (!resolved.searchParams.has('cors')) {
      resolved.searchParams.set('cors', '1');
    }
    return resolved.toString();
  } catch (_) {
    return url;
  }
};

const resolveApiBaseUrl = () => {
  const envUrl = typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL;
  if (typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.replace(/\/+$/, '');
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin;
    try {
      const hostname = new URL(origin).hostname;
      if (/localhost|127\.0\.0\.1/.test(hostname)) {
        return 'http://localhost:3000';
      }
      if (/flowerpil\.io$/.test(hostname) || /fpil\.xyz$/.test(hostname)) {
        return 'https://api.flowerpil.io';
      }
    } catch (_) {
      return origin.replace(/\/+$/, '');
    }
    return origin.replace(/\/+$/, '');
  }

  return 'https://api.flowerpil.io';
};

const isR2Url = (url) => {
  if (!url) return false;
  return R2_HOST_MATCHERS.some((matcher) => (matcher.startsWith('.')
    ? url.includes(matcher)
    : url.includes(matcher)));
};

const buildImagesProxyUrl = (url) => {
  if (typeof window === 'undefined' || !window.location?.origin) return null;
  try {
    const parsed = new URL(url, window.location.origin);
    return `${window.location.origin}/images${parsed.pathname}${parsed.search}`;
  } catch (_) {
    return null;
  }
};

const resolveProfileImageUrls = (profileImage, fallbackImage = FALLBACK_PROFILE_IMAGE) => {
  const urls = [];
  const addUrl = (value) => {
    if (!value) return;
    const normalized = buildCorsSafeUrl(value);
    if (!urls.includes(normalized)) {
      urls.push(normalized);
    }
  };

  if (!profileImage) {
    addUrl(fallbackImage);
    return urls;
  }

  const cleaned = String(profileImage).trim();
  if (!cleaned || cleaned === 'null' || cleaned === 'undefined') {
    addUrl(fallbackImage);
    return urls;
  }

  if (cleaned.startsWith('/uploads/')) {
    if (typeof window !== 'undefined' && window.location?.origin) {
      addUrl(`${window.location.origin}${cleaned}`);
    }
    const apiBase = resolveApiBaseUrl();
    addUrl(`${apiBase}${cleaned}`);
    addUrl(fallbackImage);
    return urls;
  }

  if (cleaned.startsWith('/')) {
    if (typeof window !== 'undefined' && window.location?.origin) {
      addUrl(`${window.location.origin}${cleaned}`);
    } else {
      addUrl(cleaned);
    }
    addUrl(fallbackImage);
    return urls;
  }

  if (isR2Url(cleaned)) {
    const proxied = buildImagesProxyUrl(cleaned);
    addUrl(proxied);
  }

  addUrl(cleaned);
  addUrl(fallbackImage);
  return urls;
};

const loadImage = (url) => new Promise((resolve) => {
  const img = new Image();
  const isExternal = /^https?:\/\//i.test(url || '');
  const isLocal = url?.startsWith('/') || url?.includes(window.location.origin);
  const isR2Url = url?.includes('images.flowerpil.io') || url?.includes('.r2.dev') || url?.includes('.r2.cloudflarestorage.com');

  if (isR2Url || (isExternal && !isLocal)) {
    img.crossOrigin = 'anonymous';
  }

  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);

  if (!url) {
    resolve(null);
    return;
  }

  img.src = url.startsWith('/') ? `${window.location.origin}${url}` : url;
});

const drawImageCover = (ctx, img, x, y, width, height) => {
  if (!img) return;

  const imgRatio = img.width / img.height;
  const targetRatio = width / height;

  let srcWidth = img.width;
  let srcHeight = img.height;
  let srcX = 0;
  let srcY = 0;

  if (imgRatio > targetRatio) {
    srcWidth = img.height * targetRatio;
    srcX = (img.width - srcWidth) / 2;
  } else if (imgRatio < targetRatio) {
    srcHeight = img.width / targetRatio;
    srcY = (img.height - srcHeight) / 2;
  }

  ctx.drawImage(img, srcX, srcY, srcWidth, srcHeight, x, y, width, height);
};

const measureTextWithTracking = (ctx, text, tracking) => {
  if (!text) return 0;
  const baseWidth = ctx.measureText(text).width;
  const extraSpacing = tracking * Math.max(text.length - 1, 0);
  return baseWidth + extraSpacing;
};

const drawTextWithTracking = (ctx, text, x, y, tracking) => {
  if (!text) return;
  let currentX = x;
  for (const char of text) {
    ctx.fillText(char, currentX, y);
    currentX += ctx.measureText(char).width + tracking;
  }
};

const drawCenteredTextWithTracking = (ctx, text, centerX, y, tracking) => {
  if (!text) return;
  const textWidth = measureTextWithTracking(ctx, text, tracking);
  const startX = centerX - (textWidth / 2);
  drawTextWithTracking(ctx, text, startX, y, tracking);
};

const calculateNameFontSize = (ctx, text, maxWidth) => {
  let fontSize = NAME_FONT_SIZE;
  while (fontSize > NAME_MIN_SIZE) {
    ctx.font = `${NAME_FONT_WEIGHT} ${fontSize}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    const tracking = (fontSize * NAME_TRACKING) / 1000;
    const measured = measureTextWithTracking(ctx, text, tracking);
    if (measured <= maxWidth) {
      return { fontSize, tracking };
    }
    fontSize -= 4;
  }

  const tracking = (fontSize * NAME_TRACKING) / 1000;
  return { fontSize, tracking };
};

export async function generateTemplateStoryImage({
  name = '',
  imageUrl,
  fallbackImage = FALLBACK_PROFILE_IMAGE
} = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  try {
    const template = await loadImage(TEMPLATE_PATH);
    if (template) {
      ctx.drawImage(template, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

    console.log('[IG Share Debug] Input imageUrl:', imageUrl);
    const profileUrls = resolveProfileImageUrls(imageUrl, fallbackImage);
    console.log('[IG Share Debug] Resolved URLs to try:', profileUrls);
    let profileImage = null;
    for (const profileUrl of profileUrls) {
      console.log('[IG Share Debug] Trying:', profileUrl);
      profileImage = await loadImage(profileUrl);
      console.log('[IG Share Debug] Result:', profileImage ? 'loaded' : 'failed');
      if (profileImage) break;
    }

    const shadowOffsets = getShadowOffsets();
    ctx.save();
    ctx.shadowColor = SHADOW_COLOR;
    ctx.shadowBlur = SHADOW_BLUR;
    ctx.shadowOffsetX = shadowOffsets.x;
    ctx.shadowOffsetY = shadowOffsets.y;
    drawImageCover(ctx, profileImage, PROFILE_X, PROFILE_Y, PROFILE_SIZE, PROFILE_SIZE);
    ctx.restore();

    if (name) {
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';

      const maxWidth = CANVAS_WIDTH - (NAME_X * 2);
      const { fontSize, tracking } = calculateNameFontSize(ctx, name, maxWidth);

      ctx.font = `${NAME_FONT_WEIGHT} ${fontSize}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
      drawCenteredTextWithTracking(ctx, name, CANVAS_WIDTH / 2, NAME_Y, tracking);
    }
  } catch (error) {
    console.error('Share image generation failed:', error);
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png', 1.0);
  });
}

export async function generateCuratorStoryImage(curator) {
  return generateTemplateStoryImage({
    name: curator?.name || '',
    imageUrl: curator?.profile_image,
    fallbackImage: FALLBACK_PROFILE_IMAGE
  });
}
