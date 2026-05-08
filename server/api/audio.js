import express from 'express';
import { getDatabase } from '../database/db.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import logger from '../utils/logger.js';
import { apiLoggingMiddleware } from '../middleware/logging.js';
import { authMiddleware } from '../middleware/auth.js';
import MetadataService from '../services/metadataService.js';
import MetadataWriter from '../services/metadataWriter_minimal.js';
import audioConversionService from '../services/audioConversionService_esm.js';

const router = express.Router();

// Initialize metadata service
const metadataService = new MetadataService();

// Apply logging middleware to all audio routes
router.use(apiLoggingMiddleware);

// Configure multer for audio file uploads
const audioStorage = multer.memoryStorage();
const audioUpload = multer({
  storage: audioStorage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit for audio files
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['audio/wav', 'audio/flac', 'audio/mpeg', 'audio/mp3', 'audio/aac', 'audio/ogg'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed (WAV, FLAC, MP3, AAC, OGG)'), false);
    }
  }
});

// Database query helpers
const getQueries = () => {
  const db = getDatabase();
  
  return {
    getReleaseById: db.prepare('SELECT * FROM releases WHERE id = ?'),
    getReleaseTrackById: db.prepare('SELECT * FROM release_tracks WHERE id = ?'),
    getReleaseTracks: db.prepare(`
      SELECT * FROM release_tracks 
      WHERE release_id = ? 
      ORDER BY position ASC
    `),
    updateReleaseAudio: db.prepare(`
      UPDATE releases SET 
        audio_file_path = ?, download_enabled = ?, preview_start_time = ?, 
        preview_end_time = ?, preview_only = ?, password_hash = ?
      WHERE id = ?
    `),
    updateTrackAudio: db.prepare(`
      UPDATE release_tracks SET 
        audio_file_path = ?, preview_start_time = ?, preview_end_time = ?, preview_only = ?
      WHERE id = ?
    `)
  };
};

// Utility functions
const processAudioFile = async (buffer, filename) => {
  const uploadsDir = path.join(process.cwd(), 'storage', 'uploads', 'audio');
  
  // Ensure upload directory exists
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  
  const outputPath = path.join(uploadsDir, filename);
  
  // Write audio file to disk
  fs.writeFileSync(outputPath, buffer);
  
  return {
    audioUrl: `/uploads/audio/${filename}`,
    fullPath: outputPath
  };
};

const validateAudioAccess = (release, req) => {
  // Public 30s previews are always allowed
  if (release.preview_only) {
    return { allowed: true, reason: 'preview' };
  }
  
  // Check if password protection is enabled
  if (release.password_hash) {
    const providedPassword = req.headers['x-release-password'];
    if (!providedPassword) {
      return { allowed: false, reason: 'password_required' };
    }
    
    // Simple password check (in production, use proper hashing)
    if (providedPassword !== release.password_hash) {
      return { allowed: false, reason: 'invalid_password' };
    }
  }
  
  // Allow streaming for published releases without authentication
  // Only require authentication for private/unpublished releases
  if (release.is_published) {
    return { allowed: true, reason: 'public_release' };
  }
  
  // Check authentication for unpublished releases
  if (!req.user) {
    return { allowed: false, reason: 'authentication_required' };
  }
  
  return { allowed: true, reason: 'authenticated' };
};

// Routes

// GET /api/v1/releases/:id/stream - Stream audio file (with M4A conversion support)
router.get('/releases/:id/stream', async (req, res) => {
  try {
    const releaseId = parseInt(req.params.id, 10);
    const { format } = req.query; // 'original', 'm4a', or undefined (auto)
    
    if (isNaN(releaseId)) {
      return res.status(400).json({ error: 'Invalid release ID' });
    }
    
    const queries = getQueries();
    const release = queries.getReleaseById.get(releaseId);
    
    if (!release) {
      return res.status(404).json({ error: 'Release not found' });
    }
    
    if (!release.audio_file_path) {
      return res.status(404).json({ error: 'No audio file available for this release' });
    }
    
    // Validate access permissions
    const accessCheck = validateAudioAccess(release, req);
    if (!accessCheck.allowed) {
      if (accessCheck.reason === 'password_required') {
        return res.status(401).json({ error: 'Password required', code: 'PASSWORD_REQUIRED' });
      }
      if (accessCheck.reason === 'invalid_password') {
        return res.status(401).json({ error: 'Invalid password', code: 'INVALID_PASSWORD' });
      }
      if (accessCheck.reason === 'authentication_required') {
        return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
      }
    }
    
    let audioPath;
    let shouldUseM4A = false;
    
    // Determine which format to serve
    if (format === 'original') {
      // Force original format
      audioPath = path.join(process.cwd(), 'storage', release.audio_file_path.replace(/^\//, ''));
    } else if (format === 'm4a') {
      // Force M4A format
      shouldUseM4A = true;
    } else {
      // Auto-detect: prefer M4A for browser playback if available
      const userAgent = req.headers['user-agent'] || '';
      const isBrowser = userAgent.includes('Mozilla') || userAgent.includes('Chrome') || userAgent.includes('Safari');
      
      if (isBrowser && release.browser_format_path && fs.existsSync(release.browser_format_path)) {
        shouldUseM4A = true;
      } else {
        audioPath = path.join(process.cwd(), 'storage', release.audio_file_path.replace(/^\//, ''));
      }
    }
    
    // Handle M4A conversion if needed
    if (shouldUseM4A) {
      const originalPath = path.join(process.cwd(), 'storage', release.audio_file_path.replace(/^\//, ''));
      
      // Check if browser format exists and is current
      if (release.browser_format_path && fs.existsSync(release.browser_format_path)) {
        const isCurrent = await audioConversionService.isBrowserFormatCurrent(release.browser_format_path, originalPath);
        if (isCurrent) {
          audioPath = release.browser_format_path;
        }
      }
      
      // If no valid M4A file, try to convert on-demand
      if (!audioPath) {
        const conversionResult = await audioConversionService.getCachedConversion(releaseId, originalPath, {
          title: release.title,
          artist_name: release.artist_name,
          album: release.album,
          genre: release.genre,
          year: release.year || (release.release_date ? new Date(release.release_date).getFullYear() : null),
          release_date: release.release_date
        });
        
        if (conversionResult.success) {
          audioPath = conversionResult.path;
          
          // Update database with browser format path if this was a new conversion
          if (!conversionResult.cached) {
            const updateQuery = queries.updateRelease;
            // Update just the browser_format_path - we need to get current data first
            const currentRelease = queries.getReleaseById.get(releaseId);
            updateQuery.run(
              currentRelease.title,
              currentRelease.artwork_url,
              currentRelease.release_date,
              currentRelease.release_type,
              currentRelease.pre_order_url,
              currentRelease.pre_save_url,
              currentRelease.info_url,
              currentRelease.featured_kind,
              currentRelease.featured_url,
              currentRelease.featured_duration_sec,
              currentRelease.artist_name,
              currentRelease.attribute_to_curator,
              currentRelease.artist_curator_id,
              currentRelease.hide_attribution,
              currentRelease.audio_file_path,
              currentRelease.download_enabled,
              currentRelease.preview_start_time,
              currentRelease.preview_end_time,
              currentRelease.preview_only,
              currentRelease.password_hash,
              currentRelease.is_published,
              currentRelease.release_type_system,
              currentRelease.description,
              currentRelease.isrc,
              currentRelease.deezer_id,
              currentRelease.deezer_preview_url,
              currentRelease.preview_source,
              currentRelease.preview_confidence,
              currentRelease.preview_updated_at,
              currentRelease.show_in_url,
              currentRelease.album,
              currentRelease.genre,
              currentRelease.track_number,
              currentRelease.total_tracks,
              currentRelease.copyright,
              currentRelease.composer,
              currentRelease.publisher,
              currentRelease.recording_date,
              currentRelease.original_format,
              audioPath, // browser_format_path
              releaseId
            );
          }
        } else {
          // Fallback to original format if conversion failed
          audioPath = originalPath;
        }
      }
    }
    
    // Default to original path if not set
    if (!audioPath) {
      audioPath = path.join(process.cwd(), 'storage', release.audio_file_path.replace(/^\//, ''));
    }
    
    if (!fs.existsSync(audioPath)) {
      return res.status(404).json({ error: 'Audio file not found on server' });
    }
    
    const stat = fs.statSync(audioPath);
    const fileSize = stat.size;
    const range = req.headers.range;
    
    // Support HTTP Range requests for audio seeking
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      
      const stream = fs.createReadStream(audioPath, { start, end });
      
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': getContentType(audioPath),
        'Cache-Control': 'public, max-age=3600',
        'X-Audio-Format': path.extname(audioPath).substring(1)
      });
      
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': getContentType(audioPath),
        'Cache-Control': 'public, max-age=3600',
        'X-Audio-Format': path.extname(audioPath).substring(1)
      });
      
      fs.createReadStream(audioPath).pipe(res);
    }
    
  } catch (error) {
    logger.error('Error streaming audio:', error);
    res.status(500).json({ error: 'Failed to stream audio file' });
  }
});

// GET /api/v1/releases/:id/download - Download audio file with metadata injection
router.get('/releases/:id/download', async (req, res) => {
  try {
    const releaseId = parseInt(req.params.id, 10);
    const format = req.query.format || 'original'; // 'original', 'mp3'
    
    if (isNaN(releaseId)) {
      return res.status(400).json({ error: 'Invalid release ID' });
    }
    
    const queries = getQueries();
    const release = queries.getReleaseById.get(releaseId);
    
    if (!release) {
      return res.status(404).json({ error: 'Release not found' });
    }
    
    if (!release.download_enabled) {
      return res.status(403).json({ error: 'Downloads not enabled for this release' });
    }
    
    if (!release.audio_file_path) {
      return res.status(404).json({ error: 'No audio file available for this release' });
    }
    
    // Validate access permissions (downloads require authentication)
    const accessCheck = validateAudioAccess(release, { ...req, user: req.user || null });
    if (!accessCheck.allowed) {
      if (accessCheck.reason === 'password_required') {
        return res.status(401).json({ error: 'Password required', code: 'PASSWORD_REQUIRED' });
      }
      if (accessCheck.reason === 'invalid_password') {
        return res.status(401).json({ error: 'Invalid password', code: 'INVALID_PASSWORD' });
      }
      return res.status(401).json({ error: 'Authentication required for downloads', code: 'AUTH_REQUIRED' });
    }
    
    const audioPath = path.join(process.cwd(), 'storage', release.audio_file_path.replace(/^\//, ''));
    
    if (!fs.existsSync(audioPath)) {
      return res.status(404).json({ error: 'Audio file not found on server' });
    }
    
    // Create download filename with metadata
    const filename = MetadataWriter.createDownloadFilename(release, format);
    
    try {
      // Use audio conversion service for format conversion with metadata
      const conversionResult = await audioConversionService.convertForDownload(
        releaseId,
        audioPath,
        format,
        {
          title: release.title,
          artist_name: release.artist_name,
          album: release.album,
          genre: release.genre,
          year: release.year || (release.release_date ? new Date(release.release_date).getFullYear() : null),
          release_date: release.release_date,
          track_number: release.track_number,
          total_tracks: release.total_tracks,
          copyright: release.copyright,
          composer: release.composer,
          publisher: release.publisher,
          isrc: release.isrc
        }
      );

      if (conversionResult.success) {
        const downloadPath = conversionResult.path;
        const contentType = format === 'mp3' ? 'audio/mpeg' : 
                           format === 'm4a' ? 'audio/mp4' :
                           getContentType(downloadPath);
        
        logger.info(`Serving ${conversionResult.cached ? 'cached' : 'converted'} ${format} file: ${filename}`);
        
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', contentType);
        res.setHeader('X-Metadata-Injected', 'true');
        res.setHeader('X-Format-Converted', conversionResult.needsConversion ? 'true' : 'false');
        
        // Stream the file
        const stream = fs.createReadStream(downloadPath);
        stream.on('error', (error) => {
          logger.error('Error reading converted file:', error);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to read converted audio file' });
          }
        });
        
        stream.pipe(res);
        return;
      } else {
        logger.warn('Audio conversion failed, falling back to original file:', conversionResult.error);
      }
        
      // Fallback: serve original file if conversion fails
      logger.info(`Serving original file (conversion failed): ${filename}`);
        
      res.setHeader('X-Metadata-Injected', 'false');
      res.setHeader('X-Format-Converted', 'false');
      res.download(audioPath, filename, (error) => {
        if (error) {
          logger.error('Error downloading audio:', error);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to download audio file' });
          }
        }
      });
      
    } catch (conversionError) {
      logger.error('Audio conversion failed, serving original file:', conversionError);
      
      // Fallback to original file if conversion fails
      res.setHeader('X-Metadata-Injected', 'false');
      res.setHeader('X-Format-Converted', 'false');
      res.download(audioPath, filename, (error) => {
        if (error) {
          logger.error('Error downloading audio:', error);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to download audio file' });
          }
        }
      });
    }
    
  } catch (error) {
    logger.error('Error downloading audio:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to download audio file' });
    }
  }
});

// GET /api/v1/releases/:id/download/formats - Get available download formats
router.get('/releases/:id/download/formats', async (req, res) => {
  try {
    const releaseId = parseInt(req.params.id, 10);
    
    if (isNaN(releaseId)) {
      return res.status(400).json({ error: 'Invalid release ID' });
    }
    
    const queries = getQueries();
    const release = queries.getReleaseById.get(releaseId);
    
    if (!release) {
      return res.status(404).json({ error: 'Release not found' });
    }
    
    // Get available download formats
    const availableFormats = MetadataWriter.getAvailableFormats(release);
    
    res.json({
      success: true,
      formats: availableFormats,
      downloadEnabled: release.download_enabled || false
    });
    
  } catch (error) {
    logger.error('Error fetching download formats:', error);
    res.status(500).json({ error: 'Failed to fetch download formats' });
  }
});

// POST /api/v1/releases/:id/audio - Upload audio file for release
router.post('/releases/:id/audio', authMiddleware, audioUpload.single('audio'), async (req, res) => {
  try {
    const releaseId = parseInt(req.params.id, 10);
    
    if (isNaN(releaseId)) {
      return res.status(400).json({ error: 'Invalid release ID' });
    }
    
    const queries = getQueries();
    const release = queries.getReleaseById.get(releaseId);
    
    if (!release) {
      return res.status(404).json({ error: 'Release not found' });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }
    
    // Process audio file
    const timestamp = Date.now();
    const extension = path.extname(req.file.originalname) || '.mp3';
    const filename = `release-${releaseId}-${timestamp}${extension}`;
    const fileResult = await processAudioFile(req.file.buffer, filename);
    
    // Extract metadata from uploaded audio file
    let metadata = null;
    try {
      metadata = await metadataService.extractMetadata(fileResult.fullPath);
      logger.info(`Metadata extracted for release ${releaseId}:`, {
        success: metadata.extraction_success,
        title: metadata.title,
        artist: metadata.artist_name,
        album: metadata.album
      });
    } catch (error) {
      logger.error(`Metadata extraction failed for release ${releaseId}:`, error);
    }
    
    // Extract settings from request body
    const downloadEnabled = req.body.download_enabled === 'true' || req.body.download_enabled === true;
    const previewStartTime = parseInt(req.body.preview_start_time || 0, 10);
    const previewEndTime = parseInt(req.body.preview_end_time || 30, 10);
    const previewOnly = req.body.preview_only === 'true' || req.body.preview_only === true;
    const passwordHash = req.body.password || null;
    
    // Update release with audio information
    queries.updateReleaseAudio.run(
      fileResult.audioUrl,
      downloadEnabled,
      previewStartTime,
      previewEndTime,
      previewOnly,
      passwordHash,
      releaseId
    );
    
    // Update release with extracted metadata if available
    if (metadata && metadata.extraction_success) {
      try {
        const db = getDatabase();
        await metadataService.updateReleaseWithMetadata(db, releaseId, metadata);
        logger.info(`Release ${releaseId} updated with extracted metadata`);
      } catch (error) {
        logger.error(`Failed to update release ${releaseId} with metadata:`, error);
      }
    }
    
    // Fetch updated release
    const updatedRelease = queries.getReleaseById.get(releaseId);
    
    res.json({
      success: true,
      data: updatedRelease,
      metadata: metadata ? {
        extracted: metadata.extraction_success,
        title: metadata.title,
        artist: metadata.artist_name,
        album: metadata.album,
        genre: metadata.genre,
        year: metadata.year,
        originalFormat: metadata.original_format
      } : null,
      message: 'Audio file uploaded successfully'
    });
    
  } catch (error) {
    logger.error('Error uploading audio:', error);
    res.status(500).json({ error: 'Failed to upload audio file' });
  }
});

// GET /api/v1/releases/:id/tracks - Get tracks for multi-track releases
router.get('/releases/:id/tracks', async (req, res) => {
  try {
    const releaseId = parseInt(req.params.id, 10);
    
    if (isNaN(releaseId)) {
      return res.status(400).json({ error: 'Invalid release ID' });
    }
    
    const queries = getQueries();
    const release = queries.getReleaseById.get(releaseId);
    
    if (!release) {
      return res.status(404).json({ error: 'Release not found' });
    }
    
    const tracks = queries.getReleaseTracks.all(releaseId);
    
    res.json({
      success: true,
      data: tracks,
      count: tracks.length
    });
    
  } catch (error) {
    logger.error('Error fetching release tracks:', error);
    res.status(500).json({ error: 'Failed to fetch release tracks' });
  }
});

// POST /api/v1/audio/extract-metadata - Extract metadata from audio file without saving
router.post('/audio/extract-metadata', authMiddleware, audioUpload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }
    
    // Create temporary file
    const tempDir = path.join(process.cwd(), 'storage', 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const tempFilename = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}${path.extname(req.file.originalname)}`;
    const tempPath = path.join(tempDir, tempFilename);
    
    // Write temporary file
    fs.writeFileSync(tempPath, req.file.buffer);
    
    try {
      // Extract metadata
      const metadata = await metadataService.extractMetadata(tempPath);
      
      // Clean up temporary file
      fs.unlinkSync(tempPath);
      
      res.json({
        success: true,
        metadata: {
          extracted: metadata.extraction_success,
          title: metadata.title,
          artist_name: metadata.artist_name,
          album: metadata.album,
          genre: metadata.genre,
          year: metadata.year,
          track_number: metadata.track_number,
          total_tracks: metadata.total_tracks,
          copyright: metadata.copyright,
          composer: metadata.composer,
          publisher: metadata.publisher,
          recording_date: metadata.recording_date,
          original_format: metadata.original_format,
          isrc: metadata.isrc,
          duration: metadata.duration
        }
      });
      
    } catch (extractionError) {
      // Clean up temporary file even on error
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      throw extractionError;
    }
    
  } catch (error) {
    logger.error('Error extracting metadata:', error);
    res.status(500).json({ 
      error: 'Failed to extract metadata',
      details: error.message 
    });
  }
});

// Helper function to determine content type from file extension
const getContentType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.mp3':
      return 'audio/mpeg';
    case '.wav':
      return 'audio/wav';
    case '.flac':
      return 'audio/flac';
    case '.aac':
      return 'audio/aac';
    case '.ogg':
      return 'audio/ogg';
    default:
      return 'audio/mpeg';
  }
};

export default router;