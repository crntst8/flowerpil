import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { deleteFromR2, extractR2Key } from './r2Storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const STORAGE_PATH = join(__dirname, '../../storage/uploads');

/**
 * Extract filename from a URL path
 * Handles paths like '/uploads/filename.jpg' or '/uploads/subdir/filename.jpg'
 */
const extractFilenameFromUrl = (imageUrl) => {
  if (!imageUrl || typeof imageUrl !== 'string') return null;

  // Trim whitespace
  const trimmedUrl = imageUrl.trim();
  if (!trimmedUrl) return null;

  // Must start with /uploads
  if (!trimmedUrl.startsWith('/uploads')) return null;

  // Remove leading slash and 'uploads' prefix
  const urlPath = trimmedUrl.replace(/^\/+uploads\/+/, '');

  // If nothing left after removing prefix, invalid
  if (!urlPath) return null;

  // Extract just the filename (last part after any slashes)
  const filename = urlPath.split('/').pop();

  // Must have a filename with extension
  if (!filename || !filename.includes('.')) return null;

  // Security: prevent path traversal
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return null;
  }

  return filename;
};

/**
 * Get all size variants of an image file
 * Handles both R2 keys (with subdirectories) and local filenames
 * e.g., for "playlists/1234-abc.jpg" returns ["playlists/1234-abc.jpg", "playlists/1234-abc_large.jpg", ...]
 * e.g., for "1234-abc.jpg" returns ["1234-abc.jpg", "1234-abc_md.jpg", "1234-abc_sm.jpg"]
 */
const getImageVariants = (key) => {
  if (!key) return [];

  const ext = path.extname(key);
  const basename = path.basename(key, ext);
  const directory = path.dirname(key);
  const hasDirectory = directory && directory !== '.';

  // Generate variants with new naming (_large, _medium, _small) and legacy (_md, _sm)
  const variants = [
    key, // original
    hasDirectory ? `${directory}/${basename}_large${ext}` : `${basename}_large${ext}`,
    hasDirectory ? `${directory}/${basename}_medium${ext}` : `${basename}_medium${ext}`,
    hasDirectory ? `${directory}/${basename}_small${ext}` : `${basename}_small${ext}`,
    // Legacy variants
    hasDirectory ? `${directory}/${basename}_md${ext}` : `${basename}_md${ext}`,
    hasDirectory ? `${directory}/${basename}_sm${ext}` : `${basename}_sm${ext}`
  ];

  return variants;
};

/**
 * Delete image files from storage (R2 or local)
 * @param {string} imageUrl - The image URL from the database
 * @returns {Object} - Results of deletion attempt
 */
export const deleteImageFiles = async (imageUrl) => {
  const result = {
    success: false,
    deletedFiles: [],
    errors: [],
    totalDeleted: 0
  };

  try {
    // Check if R2 URL
    const r2Key = extractR2Key(imageUrl);

    if (r2Key) {
      // R2 deletion
      const variants = getImageVariants(r2Key);

      for (const variant of variants) {
        try {
          const deleted = await deleteFromR2(variant);
          if (deleted) {
            result.deletedFiles.push(variant);
            result.totalDeleted++;
          }
        } catch (error) {
          result.errors.push(`Failed to delete ${variant}: ${error.message}`);
        }
      }
    } else {
      // Legacy local file deletion
      const filename = extractFilenameFromUrl(imageUrl);
      if (!filename) {
        result.errors.push('Invalid image URL or filename');
        return result;
      }

      const variants = getImageVariants(filename);

      for (const variant of variants) {
        const filePath = join(STORAGE_PATH, variant);

        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            result.deletedFiles.push(variant);
            result.totalDeleted++;
          }
        } catch (error) {
          result.errors.push(`Failed to delete ${variant}: ${error.message}`);
        }
      }
    }

    result.success = result.totalDeleted > 0;

  } catch (error) {
    result.errors.push(`File cleanup error: ${error.message}`);
  }

  return result;
};

/**
 * Delete multiple image files
 * @param {string[]} imageUrls - Array of image URLs
 * @returns {Object} - Combined results
 */
export const deleteMultipleImageFiles = async (imageUrls) => {
  const results = {
    success: true,
    totalDeleted: 0,
    deletedFiles: [],
    errors: []
  };

  for (const imageUrl of imageUrls) {
    const result = await deleteImageFiles(imageUrl);
    results.totalDeleted += result.totalDeleted;
    results.deletedFiles.push(...result.deletedFiles);
    results.errors.push(...result.errors);

    if (!result.success && result.errors.length > 0) {
      results.success = false;
    }
  }

  return results;
};