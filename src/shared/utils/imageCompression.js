// Lightweight, browser-only image compression for uploads.
// Attempts to reduce file size by downscaling and adjusting quality before upload.

export const DEFAULT_IMAGE_LIMIT_BYTES = 2 * 1024 * 1024; // 2MB target

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = src;
});

const toBlob = (canvas, type, quality) => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (blob) {
      resolve(blob);
    } else {
      reject(new Error('Failed to create image blob'));
    }
  }, type, quality);
});

const pickCandidateTypes = (inputType) => {
  const normalized = (inputType || '').toLowerCase();
  // Prefer WebP for better compression; fall back to JPEG; keep PNG only if original is PNG.
  const types = ['image/webp', 'image/jpeg'];
  if (normalized === 'image/png') {
    types.unshift('image/png');
  }
  return types;
};

const formatBytes = (bytes) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / (1024 ** i);
  return `${size.toFixed(size >= 10 || size === Math.floor(size) ? 0 : 1)} ${units[i]}`;
};

/**
 * Compress an image file to stay under a size budget.
 * Returns a new File (or the original) plus compression metadata.
 */
export async function compressImage(file, {
  maxSizeBytes = DEFAULT_IMAGE_LIMIT_BYTES,
  maxWidth = 1600,
  maxHeight = 1600,
  quality = 0.82,
  minQuality = 0.52
} = {}) {
  if (!(file instanceof File)) {
    throw new Error('compressImage expects a File');
  }

  if (file.size <= maxSizeBytes) {
    return { file, didCompress: false, exceeded: false, meta: { originalSize: file.size } };
  }

  const dataUrl = await readFileAsDataUrl(file);
  const img = await loadImage(dataUrl);

  const widthScale = maxWidth ? maxWidth / img.width : 1;
  const heightScale = maxHeight ? maxHeight / img.height : 1;
  const initialScale = Math.min(1, widthScale, heightScale);

  let scale = initialScale || 1;
  let currentQuality = quality;
  let bestBlob = null;
  let bestMeta = null;

  const typeCandidates = pickCandidateTypes(file.type);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const canvas = document.createElement('canvas');
    const targetWidth = Math.max(1, Math.round(img.width * scale));
    const targetHeight = Math.max(1, Math.round(img.height * scale));
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    let candidateBlob = null;
    let candidateType = null;
    for (const type of typeCandidates) {
      try {
        candidateBlob = await toBlob(canvas, type, currentQuality);
        candidateType = type;
        break;
      } catch (_) {
        // Try the next type
      }
    }

    if (!candidateBlob) {
      throw new Error('Image optimization failed');
    }

    bestBlob = candidateBlob;
    bestMeta = {
      width: targetWidth,
      height: targetHeight,
      quality: currentQuality,
      type: candidateType,
      originalSize: file.size,
      compressedSize: candidateBlob.size
    };

    if (candidateBlob.size <= maxSizeBytes) {
      return {
        file: new File([candidateBlob], file.name, { type: candidateBlob.type || file.type }),
        didCompress: true,
        exceeded: false,
        meta: bestMeta
      };
    }

    // Tighter quality first, then downscale a bit more.
    if (currentQuality > minQuality + 0.05) {
      currentQuality = Math.max(minQuality, currentQuality - 0.15);
    } else {
      scale = scale * 0.85;
    }
  }

  return {
    file: bestBlob ? new File([bestBlob], file.name, { type: bestBlob.type || file.type }) : file,
    didCompress: true,
    exceeded: bestBlob ? bestBlob.size > maxSizeBytes : true,
    meta: {
      ...bestMeta,
      message: bestBlob ? `Optimized to ${formatBytes(bestBlob.size)} (target ${formatBytes(maxSizeBytes)})` : 'No optimized blob created'
    }
  };
}

export { formatBytes };
