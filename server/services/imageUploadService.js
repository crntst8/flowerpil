/**
 * Image Upload Service
 * Handles avatar and cover image uploads for Top 10 feature
 * Resizes, compresses, and uploads to R2 storage
 */

import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { uploadToR2 } from '../utils/r2Storage.js';
import logger from '../utils/logger.js';

// Constants
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const TARGET_SIZE = 500 * 1024; // 500KB target after compression
const MAX_DIMENSION = 1200; // Max width/height for avatars
const AVATAR_SIZES = {
  large: 1200,
  medium: 600,
  small: 300
};

/**
 * Validate image buffer
 * @param {Buffer} buffer - Image buffer
 * @throws {Error} If image is invalid
 */
async function validateImage(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error('Invalid image buffer');
  }

  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error('Image file size exceeds 10MB limit');
  }

  try {
    const metadata = await sharp(buffer).metadata();

    if (!metadata.format) {
      throw new Error('Unable to determine image format');
    }

    const validFormats = ['jpeg', 'jpg', 'png', 'webp', 'gif'];
    if (!validFormats.includes(metadata.format.toLowerCase())) {
      throw new Error(`Unsupported image format: ${metadata.format}. Supported formats: ${validFormats.join(', ')}`);
    }

    return metadata;
  } catch (error) {
    throw new Error(`Invalid image file: ${error.message}`);
  }
}

/**
 * Compress image to target size
 * @param {Buffer} buffer - Image buffer
 * @param {number} quality - Initial quality (1-100)
 * @returns {Promise<Buffer>} Compressed buffer
 */
async function compressImage(buffer, quality = 85) {
  let compressed = await sharp(buffer)
    .jpeg({ quality, progressive: true })
    .toBuffer();

  // If still too large, reduce quality iteratively
  let currentQuality = quality;
  while (compressed.length > TARGET_SIZE && currentQuality > 60) {
    currentQuality -= 5;
    compressed = await sharp(buffer)
      .jpeg({ quality: currentQuality, progressive: true })
      .toBuffer();
  }

  return compressed;
}

/**
 * Resize image to specific dimensions
 * @param {Buffer} buffer - Image buffer
 * @param {number} width - Target width
 * @param {number} height - Target height
 * @returns {Promise<Buffer>} Resized buffer
 */
async function resizeImage(buffer, width, height) {
  return await sharp(buffer)
    .resize(width, height, {
      fit: 'cover',
      position: 'center'
    })
    .toBuffer();
}

/**
 * Upload avatar with multiple sizes
 * @param {Buffer} buffer - Image buffer
 * @param {number} userId - User ID
 * @returns {Promise<string>} Primary avatar URL
 */
export async function uploadAvatar(buffer, userId) {
  try {
    // Validate image
    await validateImage(buffer);

    // Generate unique ID for this avatar
    const uuid = uuidv4();
    const uploads = [];
    let primaryUrl = null;

    // Process and upload each size
    for (const [sizeName, dimension] of Object.entries(AVATAR_SIZES)) {
      // Resize
      const resized = await resizeImage(buffer, dimension, dimension);

      // Compress
      const compressed = await compressImage(resized);

      // Upload to R2
      const key = `avatars/${uuid}_${sizeName}.jpg`;
      const url = await uploadToR2(compressed, key, 'image/jpeg');

      uploads.push(url);

      // Use large size as primary URL
      if (sizeName === 'large') {
        primaryUrl = url;
      }

      logger.info('IMAGE_UPLOAD', `Avatar ${sizeName} uploaded`, {
        userId,
        size: sizeName,
        dimension,
        fileSize: compressed.length,
        url
      });
    }

    logger.info('IMAGE_UPLOAD', 'Avatar upload complete', {
      userId,
      uuid,
      primaryUrl,
      sizes: Object.keys(AVATAR_SIZES).length
    });

    return primaryUrl;

  } catch (error) {
    logger.error('IMAGE_UPLOAD', 'Avatar upload failed', {
      userId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Upload cover image for Top 10
 * @param {Buffer} buffer - Image buffer
 * @param {number} top10Id - Top 10 playlist ID
 * @returns {Promise<string>} Cover image URL
 */
export async function uploadCoverImage(buffer, top10Id) {
  try {
    // Validate image
    await validateImage(buffer);

    // Generate unique ID
    const uuid = uuidv4();

    // Resize to max dimension (maintain aspect ratio)
    const metadata = await sharp(buffer).metadata();
    let resized = buffer;

    if (metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) {
      resized = await sharp(buffer)
        .resize(MAX_DIMENSION, MAX_DIMENSION, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .toBuffer();
    }

    // Compress
    const compressed = await compressImage(resized);

    // Upload to R2
    const key = `top10/covers/${uuid}.jpg`;
    const url = await uploadToR2(compressed, key, 'image/jpeg');

    logger.info('IMAGE_UPLOAD', 'Cover image uploaded', {
      top10Id,
      uuid,
      fileSize: compressed.length,
      url
    });

    return url;

  } catch (error) {
    logger.error('IMAGE_UPLOAD', 'Cover image upload failed', {
      top10Id,
      error: error.message
    });
    throw error;
  }
}

/**
 * Process and upload image from URL
 * @param {string} imageUrl - Source image URL
 * @param {string} type - Image type ('avatar' or 'cover')
 * @param {number} entityId - User ID or Top 10 ID
 * @returns {Promise<string>} Uploaded image URL
 */
export async function uploadImageFromUrl(imageUrl, type, entityId) {
  try {
    // Fetch image from URL
    const response = await fetch(imageUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload based on type
    if (type === 'avatar') {
      return await uploadAvatar(buffer, entityId);
    } else if (type === 'cover') {
      return await uploadCoverImage(buffer, entityId);
    } else {
      throw new Error(`Invalid image type: ${type}`);
    }

  } catch (error) {
    logger.error('IMAGE_UPLOAD', 'Image upload from URL failed', {
      imageUrl,
      type,
      entityId,
      error: error.message
    });
    throw error;
  }
}

export default {
  uploadAvatar,
  uploadCoverImage,
  uploadImageFromUrl,
  resizeImage,
  compressImage
};
