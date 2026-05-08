import { generateTemplateStoryImage } from '../../curators/utils/curatorShareImageGenerator';

/**
 * Instagram Story Image Generator
 * Generates 1080x1920px images matching the exact specification in docs/new-music-story-spec.md
 */

// Constants from specification
const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1920;

// Header bar specs
const HEADER_HEIGHT = 300;
const HEADER_BG = '#000000';
const HEADER_MARGIN = 25; // Horizontal margin to expose background

// Footer bar specs
const FOOTER_HEIGHT = 190;
const FOOTER_Y = CANVAS_HEIGHT - FOOTER_HEIGHT;
const FOOTER_BG = '#000000';

// Logo specs (in header, white version) - centered horizontally
const LOGO_SIZE = 120;
const LOGO_X = (CANVAS_WIDTH - LOGO_SIZE) / 2; // Centered
const LOGO_Y = HEADER_HEIGHT - LOGO_SIZE - 35; // 35px from bottom of header

// Header text specs - aligned with logo vertically
// const HEADER_TEXT_X = CANVAS_WIDTH - LOGO_X; // Equal margin to logo (70px from right edge)
// const PLAYLIST_BY_Y = 170; // Moved up to align with logo
// const PLAYLIST_BY_SIZE = 24;
// const CURATOR_NAME_Y = 250; // Increased gap from playlist by (80px gap)
// const CURATOR_NAME_SIZE = 48;

// Artwork specs - moved further down the page, reduced by ~20%
const ARTWORK_BORDER_SIZE = 556; // Reduced from 695
const ARTWORK_BORDER_X = 262;
const ARTWORK_BORDER_Y = 472; // Moved down and centered
const ARTWORK_SIZE = 540; // Reduced from 675
const ARTWORK_X = 270;
const ARTWORK_Y = 480; // Moved down and centered

// Title specs below artwork
const ARTWORK_BORDER_BOTTOM = ARTWORK_BORDER_Y + ARTWORK_BORDER_SIZE;
const TITLE_FONT_SIZE = 92.68;
const TITLE_Y = ARTWORK_BORDER_BOTTOM + 130; // Further away from artwork
const TITLE_OPACITY = 1.0;

// Artist specs (for tracks - appears above title)
const ARTIST_FONT_SIZE = 58; // Slightly smaller than title
const ARTIST_Y = ARTWORK_BORDER_BOTTOM + 115; // Above title with increased gap from artwork
const ARTIST_OPACITY = 1.0;


/**
 * Draws a dashed border rectangle
 */
function drawDashedBorder(ctx, x, y, width, height, color = 'black', lineWidth = 2, dashPattern = [4, 2]) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(dashPattern);
  ctx.strokeRect(x, y, width, height);
  ctx.setLineDash([]); // Reset dash pattern
}

/**
 * Calculates the optimal font size to fit text within maxWidth
 */
function calculateFontSize(ctx, text, maxFontSize, maxWidth, fontFamily = 'Helvetica Neue', fontWeight = '800') {
  let fontSize = maxFontSize;
  
  while (fontSize > 12) {
    ctx.font = `${fontWeight} ${fontSize}pt "${fontFamily}", Arial, sans-serif`;
    const metrics = ctx.measureText(text);
    if (metrics.width <= maxWidth) {
      return fontSize;
    }
    fontSize -= 2;
  }
  
  return fontSize;
}

/**
 * Loads an image from URL with proper handling for local vs external images
 */
function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();

    // Detect if this is an R2 URL (flowerpil CDN)
    const isR2Url = url.includes('images.flowerpil.io') || url.includes('.r2.dev') || url.includes('.r2.cloudflarestorage.com');
    const isExternalUrl = url.startsWith('http://') || url.startsWith('https://');
    const isLocalUrl = url.startsWith('/') || url.includes(window.location.origin);

    // Set crossOrigin for R2 URLs and other external URLs (not same-origin)
    if (isR2Url || (isExternalUrl && !isLocalUrl)) {
      img.crossOrigin = 'anonymous';
    }

    img.onload = () => {
      console.log(`Successfully loaded image: ${img.src}`);
      resolve(img);
    };
    img.onerror = (error) => {
      console.warn(`Failed to load image: ${img.src}`, error);
      resolve(null); // Return null instead of rejecting
    };

    // Construct final URL
    if (url.startsWith('/')) {
      img.src = window.location.origin + url;
    } else {
      img.src = url;
    }

    console.log(`Loading image: ${img.src}`);
  });
}

/**
 * Loads white logo.png from public folder for header
 */
async function loadLogo() {
  try {
    return await loadImage('/logo.png');
  } catch (error) {
    console.warn('Logo not found, proceeding without logo');
    return null;
  }
}

/**
 * Main function to generate Instagram story image
 */
export async function generateStoryImage(item, platformLinks, artistName = '') {
  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext('2d');

  // Set high quality rendering
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Fill background
  ctx.fillStyle = 'rgba(219, 219, 218, 1)';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  try {
    // Draw header bar (black) with margins
    ctx.fillStyle = HEADER_BG;
    ctx.fillRect(HEADER_MARGIN, 0, CANVAS_WIDTH - (HEADER_MARGIN * 2), HEADER_HEIGHT);

    // Draw footer bar (black) with margins
    ctx.fillStyle = FOOTER_BG;
    ctx.fillRect(HEADER_MARGIN, FOOTER_Y, CANVAS_WIDTH - (HEADER_MARGIN * 2), FOOTER_HEIGHT);

    // Load and draw logo in header (white version)
    const logo = await loadLogo();
    if (logo) {
      ctx.drawImage(logo, LOGO_X, LOGO_Y, LOGO_SIZE, LOGO_SIZE);
    }

    // Draw "playlist by" text in header
    // ctx.fillStyle = '#ffffff';
    // ctx.textAlign = 'right';
    // ctx.textBaseline = 'alphabetic';
    // ctx.font = `400 ${PLAYLIST_BY_SIZE}pt 'Helvetica Neue', Arial, sans-serif`;
    // ctx.letterSpacing = '-0.9px';
    // ctx.fillText('playlist by', HEADER_TEXT_X, PLAYLIST_BY_Y);

    // Draw curator name in header
    // if (curatorName) {
    //   ctx.font = `700 ${CURATOR_NAME_SIZE}pt 'Helvetica Neue', Arial, sans-serif`;
    //   ctx.letterSpacing = '-0.9px';
    //   ctx.fillText(curatorName, HEADER_TEXT_X, CURATOR_NAME_Y);
    // }
    
    // Draw artwork border (dashed border)
    drawDashedBorder(ctx, ARTWORK_BORDER_X, ARTWORK_BORDER_Y, ARTWORK_BORDER_SIZE, ARTWORK_BORDER_SIZE, '#000000', 1);
    
    // Load and draw artwork
    if (item.artwork_url) {
      console.log('Attempting to load artwork:', item.artwork_url);
      const artwork = await loadImage(item.artwork_url);
      if (artwork) {
        console.log('Successfully loaded artwork, drawing to canvas');
        ctx.drawImage(artwork, ARTWORK_X, ARTWORK_Y, ARTWORK_SIZE, ARTWORK_SIZE);
      } else {
        console.warn('Failed to load artwork, proceeding without it');
      }
    } else {
      console.log('No artwork URL provided');
    }
    
    // Set text properties
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.letterSpacing = '-1.9px';

    // Calculate max text width (canvas width minus padding on both sides)
    const maxTextWidth = CANVAS_WIDTH - 120; // 60px padding on each side

    // Draw artist name above title if provided
    if (artistName) {
      const artistFontSize = calculateFontSize(ctx, artistName, ARTIST_FONT_SIZE, maxTextWidth, 'Helvetica Neue', '400');
      ctx.font = `400 ${artistFontSize}pt 'Helvetica Neue', Arial, sans-serif`;
      ctx.letterSpacing = '-0.9px';
      ctx.globalAlpha = ARTIST_OPACITY;
      ctx.fillText(artistName, CANVAS_WIDTH / 2, ARTIST_Y);
      ctx.globalAlpha = 1.0;
    }

    // Draw title with dynamic font sizing
    const titleText = item.title || '';
    const titleFontSize = calculateFontSize(ctx, titleText, TITLE_FONT_SIZE, maxTextWidth, 'Helvetica Neue', '700');
    ctx.font = `700 ${titleFontSize}pt 'Helvetica Neue', Arial, sans-serif`;
    ctx.letterSpacing = '-1.9px';
    ctx.globalAlpha = TITLE_OPACITY;
    // Adjust title Y position if artist is present (move it down significantly to avoid overlap)
    const adjustedTitleY = artistName ? TITLE_Y + 110 : TITLE_Y;
    ctx.fillText(titleText, CANVAS_WIDTH / 2, adjustedTitleY);

    // Reset alpha
    ctx.globalAlpha = 1.0;

  } catch (error) {
    console.error('Error generating story image:', error);
  }
  
  // Convert canvas to blob
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob);
    }, 'image/png', 1.0);
  });
}

// Playlist-specific fallback image (logo instead of profile picture)
const FALLBACK_PLAYLIST_IMAGE = '/logo-playlists.png';

/**
 * Normalizes playlist image URL for canvas operations
 * Handles legacy /uploads/ paths and ensures R2 URLs are properly formatted
 */
function normalizePlaylistImageUrl(url) {
  if (!url || typeof url !== 'string') return null;

  const trimmed = url.trim();
  if (!trimmed) return null;

  // Already a full R2 or external URL
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  // Convert legacy /uploads/ paths to R2 URLs
  if (trimmed.startsWith('/uploads/')) {
    const r2Key = trimmed.replace(/^\/uploads\//, '');
    return `https://images.flowerpil.io/${r2Key}`;
  }

  // Relative path without /uploads/ prefix - assume it's in uploads
  if (!trimmed.startsWith('/')) {
    return `https://images.flowerpil.io/${trimmed}`;
  }

  return trimmed;
}

/**
 * Playlist-specific function to generate Instagram story image
 * Uses playlist title and artwork without curator overlays
 */
export async function generatePlaylistStoryImage(playlist) {
  // Try image_url_large first (pre-computed by API), then fall back to other options
  const rawImageUrl = playlist?.image_url_large
    || playlist?.image_url_original
    || playlist?.image
    || null;

  // Normalize the URL for canvas operations (convert legacy paths to R2)
  const imageUrl = normalizePlaylistImageUrl(rawImageUrl);

  console.log('[Playlist IG Share] Playlist artwork URLs:', {
    image_url_large: playlist?.image_url_large,
    image_url_original: playlist?.image_url_original,
    image: playlist?.image,
    rawSelected: rawImageUrl,
    normalizedUrl: imageUrl
  });

  return generateTemplateStoryImage({
    name: playlist?.title || '',
    imageUrl,
    fallbackImage: FALLBACK_PLAYLIST_IMAGE
  });
}

/**
 * Converts legacy /uploads/ paths to R2 URLs
 * This ensures track artwork works with CORS for canvas operations
 */
function convertToR2Url(artworkUrl) {
  if (!artworkUrl) return null;

  // If it's already a full URL, return as-is
  if (artworkUrl.startsWith('http://') || artworkUrl.startsWith('https://')) {
    return artworkUrl;
  }

  // Convert legacy /uploads/ paths to R2 URLs
  if (artworkUrl.startsWith('/uploads/')) {
    const r2Key = artworkUrl.replace(/^\/uploads\//, '');
    return `https://images.flowerpil.io/${r2Key}`;
  }

  // If it's a relative path without /uploads/, assume it's in uploads
  if (!artworkUrl.startsWith('/')) {
    return `https://images.flowerpil.io/${artworkUrl}`;
  }

  return artworkUrl;
}

/**
 * Track-specific function to generate Instagram story image
 * Uses artist name above track title below artwork
 */
export async function generateTrackStoryImage(track, platformLinks) {
  // Transform track data to match the expected format
  // Convert artwork_url to R2 URL if it's a legacy path
  const trackItem = {
    title: track.title,
    artwork_url: convertToR2Url(track.artwork_url)
  };

  console.log('Track artwork URL:', trackItem.artwork_url);

  // Use the existing generateStoryImage function with artist name
  return generateStoryImage(trackItem, platformLinks, track.artist || '');
}
