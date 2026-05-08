import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, requireAnyRole, requireRole } from '../middleware/auth.js';
import { uploadToR2, deleteFromR2, extractR2Key } from '../utils/r2Storage.js';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { S3Client } from '@aws-sdk/client-s3';

const router = express.Router();

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/png', 'image/svg+xml', 'image/webp'];
const ICON_SIZE = 512; // Single 512×512px size for all icons
const R2_ICON_PREFIX = 'icons/';

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PNG, SVG, and WebP images are allowed for icons.'));
    }
  }
});

// R2 Client for listing icons
const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME;

/**
 * POST /api/v1/uploads/icon
 * Upload a new icon to R2 storage
 *
 * - Accepts PNG/SVG/WebP files up to 10MB
 * - Resizes to 512×512px with transparent background
 * - Converts to PNG format
 * - Uploads single asset to R2: icons/{uuid}.png
 * - Returns R2 URL
 */
router.post('/upload', authMiddleware, requireAnyRole(['admin', 'curator']), upload.single('icon'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const uuid = uuidv4();
    const filename = `${uuid}.png`;
    const r2Key = `${R2_ICON_PREFIX}${filename}`;

    // Process image with Sharp
    // - Resize to 512×512px
    // - Fit: contain (don't crop, maintain aspect ratio)
    // - Background: transparent
    // - Format: PNG (lossless)
    // - Compression: 9 (maximum)
    const processedBuffer = await sharp(req.file.buffer)
      .resize(ICON_SIZE, ICON_SIZE, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png({
        quality: 100,
        compressionLevel: 9,
        palette: true // Optimize for icons with limited colors
      })
      .toBuffer();

    // Upload to R2
    const iconUrl = await uploadToR2(processedBuffer, r2Key, 'image/png');

    res.json({
      success: true,
      url: iconUrl,
      size: ICON_SIZE,
      format: 'png',
      filename: filename
    });

  } catch (error) {
    console.error('Icon upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload icon'
    });
  }
});

/**
 * GET /api/v1/icons/library
 * List all available icons from R2 storage
 *
 * Returns:
 * - All icons from R2 icons/ prefix
 * - Sorted: preset icons first (alphabetical), then uploaded icons (newest first)
 */
router.get('/library', authMiddleware, async (req, res) => {
  try {
    // List all objects in icons/ prefix
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: R2_ICON_PREFIX
    });

    const response = await r2Client.send(command);
    const icons = [];

    if (response.Contents) {
      for (const object of response.Contents) {
        const key = object.Key;
        const filename = key.replace(R2_ICON_PREFIX, '');

        // Skip if it's just the directory itself
        if (!filename || filename === '') continue;

        const isPreset = filename.startsWith('preset-');
        const url = `${process.env.R2_PUBLIC_URL}/${key}`;

        icons.push({
          key: key,
          filename: filename,
          url: url,
          type: isPreset ? 'preset' : 'uploaded',
          size: object.Size,
          lastModified: object.LastModified
        });
      }
    }

    // Sort: presets first (alphabetical), then uploaded (newest first)
    icons.sort((a, b) => {
      if (a.type === 'preset' && b.type !== 'preset') return -1;
      if (a.type !== 'preset' && b.type === 'preset') return 1;

      if (a.type === 'preset') {
        return a.filename.localeCompare(b.filename);
      } else {
        return new Date(b.lastModified) - new Date(a.lastModified);
      }
    });

    res.json({
      success: true,
      icons: icons,
      count: icons.length
    });

  } catch (error) {
    console.error('Icon library error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch icon library'
    });
  }
});

/**
 * DELETE /api/v1/icons/:filename
 * Delete an icon from R2 storage
 *
 * - Removes icon from R2
 * - Updates any playlists using this icon to NULL
 * - Only admins can delete icons
 */
router.delete('/:filename', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { filename } = req.params;

    // Prevent deletion of preset icons
    if (filename.startsWith('preset-')) {
      return res.status(403).json({
        success: false,
        error: 'Cannot delete preset icons'
      });
    }

    const r2Key = `${R2_ICON_PREFIX}${filename}`;
    const iconUrl = `${process.env.R2_PUBLIC_URL}/${r2Key}`;

    // Delete from R2
    const deleted = await deleteFromR2(r2Key);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Icon not found'
      });
    }

    // Update database: set custom_action_icon to NULL for any playlists using this icon
    const db = req.db;
    const updateResult = await db.run(
      'UPDATE playlists SET custom_action_icon = NULL WHERE custom_action_icon = ?',
      [iconUrl]
    );

    res.json({
      success: true,
      message: 'Icon deleted successfully',
      playlistsUpdated: updateResult.changes || 0
    });

  } catch (error) {
    console.error('Icon deletion error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete icon'
    });
  }
});

export default router;
