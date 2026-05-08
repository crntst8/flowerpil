import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware } from '../middleware/auth.js';
import { uploadToR2 } from '../utils/r2Storage.js';
import { getEnabledFormats } from '../config/imageFeatures.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE_UPLOAD_DIR = join(__dirname, '../../storage/uploads');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_SIZE = 2 * 1024 * 1024; // 2MB for videos
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/svg+xml'];
const ALLOWED_VIDEO_TYPES = ['video/webm', 'video/mp4'];

// Valid subdirectories for different types of uploads
const VALID_SUBDIRS = {
  'playlists': 'playlists',
  'curators': 'curators',
  'releases': 'releases',
  'bio-pages': 'bio-pages',
  'search-editorials': 'search-editorials',
  'features': 'features',
  'general': ''  // root uploads directory
};

const TYPE_CONFIG = {
  default: {
    sizes: [
      { name: 'original', width: 1200, height: 1200, quality: 95 },
      { name: 'large', width: 800, height: 800, quality: 85 },
      { name: 'medium', width: 400, height: 400, quality: 85 },
      { name: 'small', width: 200, height: 200, quality: 85 }
    ],
    fit: 'cover',
    background: null,
    primarySize: 'large'
  },
  'search-editorials': {
    sizes: [
      { name: 'original', width: 1200, height: 1200, quality: 95 },
      { name: 'large', width: 800, height: 800, quality: 90 },
      { name: 'medium', width: 600, height: 600, quality: 88 },
      { name: 'small', width: 320, height: 320, quality: 85 }
    ],
    fit: 'cover',
    background: null,
    primarySize: 'medium'
  }
};

// Ensure upload directories exist
const ensureUploadDir = (subdir = '') => {
  const uploadDir = subdir ? join(BASE_UPLOAD_DIR, subdir) : BASE_UPLOAD_DIR;
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  return uploadDir;
};

// Initialize base directory
ensureUploadDir();

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
      cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and SVG images are allowed.'));
    }
  }
});

// Configure multer for video uploads
const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_VIDEO_SIZE
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_VIDEO_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only WebM and MP4 videos are allowed.'));
    }
  }
});

// Image processing and optimization
// Enhanced to support multiple format generation (Phase 1)
const processImage = async (buffer, options = {}) => {
  const {
    width = 800,
    height = 800,
    quality = 85,
    formats = getEnabledFormats(), // Now supports multiple formats
    fit = 'cover',
    background = null,
    density
  } = options;

  try {
    const resizeBackground = background ?? (fit === 'contain' ? { r: 0, g: 0, b: 0, alpha: 0 } : undefined);

    // Process each format
    const results = {};

    for (const format of formats) {
      let pipeline = density ? sharp(buffer, { density }) : sharp(buffer);

      // Apply resize
      pipeline = pipeline.resize(width, height, {
        fit,
        position: 'center',
        background: resizeBackground
      });

      // Apply format-specific compression
      if (format === 'png') {
        pipeline = pipeline.png({
          compressionLevel: 9,
          adaptiveFiltering: true
        });
      } else if (format === 'webp') {
        pipeline = pipeline.webp({
          quality,
          alphaQuality: quality,
          effort: 4 // 0-6, higher = better compression but slower
        });
      } else if (format === 'avif') {
        // AVIF can use lower quality settings due to superior compression
        const avifQuality = Math.max(60, quality - 20);
        pipeline = pipeline.avif({
          quality: avifQuality,
          effort: 4, // 0-9, higher = better compression
          chromaSubsampling: '4:2:0'
        });
      } else {
        // Default to JPEG
        pipeline = pipeline.jpeg({
          quality,
          progressive: true,
          mozjpeg: true
        });
      }

      results[format] = await pipeline.toBuffer();
    }

    return results;
  } catch (error) {
    throw new Error(`Image processing failed: ${error.message}`);
  }
};

// Upload image endpoint
router.post('/image', authMiddleware, (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      console.error('Multer error:', err);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          success: false,
          error: 'File size too large. Maximum size is 10MB.'
        });
      }
      if (err.message.includes('Invalid file type')) {
        return res.status(400).json({
          success: false,
          error: err.message
        });
      }
      return res.status(400).json({
        success: false,
        error: 'Upload error: ' + err.message
      });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image file provided'
      });
    }

    const { buffer, originalname, mimetype } = req.file;
    
    // Determine configuration based on upload type
    const typeKey = req.query.type && VALID_SUBDIRS[req.query.type] !== undefined
      ? req.query.type
      : 'general';
    const subdir = VALID_SUBDIRS[typeKey];
    const typeConfig = TYPE_CONFIG[typeKey] || TYPE_CONFIG.default;

    // Ensure the target directory exists
    const uploadDir = ensureUploadDir(subdir);

    // Determine output format and filename
    const isSvg = mimetype === 'image/svg+xml';
    const baseFormat = typeConfig.format
      || (isSvg || mimetype === 'image/png' ? 'png' : 'jpeg');
    const outputFormat = baseFormat;
    const fileExtension = outputFormat === 'jpeg' ? 'jpg' : outputFormat;
    const filename = `${uuidv4()}.${fileExtension}`;
    const baseFilename = filename.split('.')[0];

    const processedImages = {};

    // Phase 1: Generate multiple formats for each size (PARALLEL)
    const sizeProcessingPromises = typeConfig.sizes.map(async (size) => {
      const formatBuffers = await processImage(buffer, {
        width: size.width,
        height: size.height,
        quality: size.quality ?? (size.name === 'original' ? 95 : 85),
        formats: getEnabledFormats(), // Generate all enabled formats
        fit: typeConfig.fit || 'cover',
        background: typeConfig.background ?? null,
        density: typeConfig.density && isSvg ? typeConfig.density : undefined
      });

      // Upload each format to R2 (PARALLEL)
      const uploadPromises = Object.entries(formatBuffers).map(async ([format, processedBuffer]) => {
        const extension = format === 'jpeg' ? 'jpg' : format;
        const sizeFilename = size.name === 'original'
          ? `${baseFilename}.${extension}`
          : `${baseFilename}_${size.name}.${extension}`;

        // Upload to R2
        const r2Key = subdir ? `${subdir}/${sizeFilename}` : sizeFilename;
        const contentType = `image/${format === 'jpeg' ? 'jpeg' : format}`;
        const imageUrl = await uploadToR2(processedBuffer, r2Key, contentType);

        return {
          format,
          data: {
            filename: sizeFilename,
            url: imageUrl,
            width: size.width,
            height: size.height,
            size: processedBuffer.length,
            format
          }
        };
      });

      const uploadResults = await Promise.all(uploadPromises);

      // Build format map for this size
      const formatMap = {};
      for (const { format, data } of uploadResults) {
        formatMap[format] = data;
      }

      return {
        sizeName: size.name,
        formats: formatMap
      };
    });

    // Wait for all sizes to complete
    const sizeResults = await Promise.all(sizeProcessingPromises);

    // Build processedImages object
    for (const { sizeName, formats } of sizeResults) {
      processedImages[sizeName] = formats;
    }

    // Primary URL is the JPEG variant of the primary size (backward compatible)
    const primarySizeKey = typeConfig.primarySize || 'large';
    const primaryUrl = processedImages[primarySizeKey]?.jpeg?.url
      || processedImages.original?.jpeg?.url
      || null;

    res.json({
      success: true,
      data: {
        original_name: originalname,
        mime_type: mimetype,
        images: processedImages,
        primary_url: primaryUrl,
        created_at: new Date().toISOString()
      },
      message: 'Image uploaded and processed successfully'
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        error: 'File size too large. Maximum size is 10MB.'
      });
    }
    
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload image'
    });
  }
});

// Upload video endpoint
router.post('/video', authMiddleware, (req, res, next) => {
  videoUpload.single('video')(req, res, (err) => {
    if (err) {
      console.error('Multer video error:', err);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          success: false,
          error: 'File size too large. Maximum size is 2MB for videos.'
        });
      }
      if (err.message.includes('Invalid file type')) {
        return res.status(400).json({
          success: false,
          error: err.message
        });
      }
      return res.status(400).json({
        success: false,
        error: 'Upload error: ' + err.message
      });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No video file provided'
      });
    }

    const { buffer, originalname, mimetype } = req.file;

    // Determine subdirectory based on upload type
    const typeKey = req.query.type && VALID_SUBDIRS[req.query.type] !== undefined
      ? req.query.type
      : 'general';
    const subdir = VALID_SUBDIRS[typeKey];

    // Ensure the target directory exists
    ensureUploadDir(subdir);

    // Generate filename with extension
    const extension = mimetype === 'video/webm' ? 'webm' : 'mp4';
    const filename = `${uuidv4()}.${extension}`;

    // Upload to R2 (no processing needed for video)
    const r2Key = subdir ? `${subdir}/${filename}` : filename;
    const videoUrl = await uploadToR2(buffer, r2Key, mimetype);

    res.json({
      success: true,
      data: {
        original_name: originalname,
        mime_type: mimetype,
        url: videoUrl,
        filename,
        size: buffer.length,
        created_at: new Date().toISOString()
      },
      message: 'Video uploaded successfully'
    });

  } catch (error) {
    console.error('Video upload error:', error);

    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        error: 'File size too large. Maximum size is 2MB for videos.'
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload video'
    });
  }
});

// Delete image endpoint
router.delete('/image/:filename', authMiddleware, (req, res) => {
  try {
    const { filename } = req.params;
    
    if (!filename || filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid filename'
      });
    }
    
    // Delete all sizes of the image
    const baseFilename = filename.split('.')[0];
    const extension = filename.split('.')[1];
    
    const sizesToDelete = [
      filename, // original
      `${baseFilename}_large.${extension}`,
      `${baseFilename}_medium.${extension}`,
      `${baseFilename}_small.${extension}`
    ];
    
    let deletedCount = 0;
    
    for (const file of sizesToDelete) {
      const filepath = join(UPLOAD_DIR, file);
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
        deletedCount++;
      }
    }
    
    if (deletedCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Image not found'
      });
    }
    
    res.json({
      success: true,
      message: `Deleted ${deletedCount} image files`,
      deleted_files: deletedCount
    });
    
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete image'
    });
  }
});

// Get image info endpoint
router.get('/image/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    
    if (!filename || filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid filename'
      });
    }
    
    const filepath = join(UPLOAD_DIR, filename);
    
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({
        success: false,
        error: 'Image not found'
      });
    }
    
    const stats = fs.statSync(filepath);
    
    res.json({
      success: true,
      data: {
        filename,
        url: `/uploads/${filename}`,
        size: stats.size,
        created_at: stats.birthtime,
        modified_at: stats.mtime
      }
    });
    
  } catch (error) {
    console.error('Get image info error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get image info'
    });
  }
});

export default router;
