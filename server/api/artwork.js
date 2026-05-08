import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import iTunesArtworkService from '../services/itunesArtworkService.js';
import { getQueries, getDatabase } from '../database/db.js';
import { authMiddleware } from '../middleware/auth.js';
import { uploadToR2 } from '../utils/r2Storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();
const itunesService = new iTunesArtworkService();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 50 // Max 50 files at once
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, WebP) are allowed'), false);
    }
  }
});

// Search iTunes for track artwork
router.get('/search', async (req, res) => {
  try {
    const { artist, track, album, limit = 5 } = req.query;

    if (!artist || (!track && !album)) {
      return res.status(400).json({
        success: false,
        error: 'Artist and either track or album parameters are required'
      });
    }

    let results;
    if (track) {
      results = await itunesService.searchTrackArtwork(artist, track, parseInt(limit));
    } else {
      results = await itunesService.searchAlbumArtwork(artist, album, parseInt(limit));
    }

    res.json({
      success: true,
      data: results,
      query: { artist, track, album },
      count: results.length
    });

  } catch (error) {
    console.error('Error searching artwork:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search for artwork',
      details: error.message
    });
  }
});

// Download and save artwork from iTunes
router.post('/download', authMiddleware, async (req, res) => {
  try {
    const { artworkUrl, trackId, size = 'large', filename } = req.body;

    if (!artworkUrl || !trackId) {
      return res.status(400).json({
        success: false,
        error: 'artworkUrl and trackId are required'
      });
    }

    // Download artwork from iTunes
    const artworkData = await itunesService.downloadArtwork(artworkUrl, size);
    
    // Generate filename if not provided
    const finalFilename = filename || `track-${trackId}-${Date.now()}.jpg`;
    
    // Process and save the artwork
    const savedFilename = await processAndSaveArtwork(artworkData.buffer, finalFilename);
    
    // Update track with artwork URL
    if (trackId !== 'preview') {
      const queries = getQueries();
      queries.updateTrack.run(
        null, null, null, null, null, // Keep existing track data (title, artist, album, year, duration)
        null, null, null, null, null, // Keep existing IDs (spotify_id, apple_id, tidal_id, bandcamp_url, soundcloud_url)
        null, null, // Keep existing metadata (label, genre)
        savedFilename, // Update artwork_url
        null, null, null, null, null, null, // Keep other metadata (album_artwork_url, isrc, explicit, popularity, preview_url, quote)
        null, null, null, null, // Keep URLs (apple_music_url, tidal_url, custom_sources, deezer_preview_url)
        trackId
      );
    }

    res.json({
      success: true,
      data: {
        filename: savedFilename,
        originalSize: artworkData.size,
        contentType: artworkData.contentType
      },
      message: 'Artwork downloaded and saved successfully'
    });

  } catch (error) {
    console.error('Error downloading artwork:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to download artwork',
      details: error.message
    });
  }
});

// Bulk upload artwork with automatic matching
router.post('/bulk-upload', authMiddleware, upload.array('artwork', 50), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files uploaded'
      });
    }

    const playlistId = req.body.playlistId;
    if (!playlistId) {
      return res.status(400).json({
        success: false,
        error: 'playlistId is required'
      });
    }

    // Get playlist tracks for matching
    const queries = getQueries();
    const tracks = queries.getTracksByPlaylistId.all(playlistId);

    const results = [];
    const processedFiles = [];

    for (const file of req.files) {
      try {
        // Extract artist and title from filename
        const { artist, title } = parseFilename(file.originalname);
        
        // Find matching track
        const matchedTrack = findMatchingTrack(tracks, artist, title);
        
        if (matchedTrack) {
          // Process and save the artwork
          const savedFilename = await processAndSaveArtwork(
            file.buffer, 
            `track-${matchedTrack.id}-${Date.now()}.jpg`
          );
          
          // Update track with artwork
          queries.updateTrack.run(
            matchedTrack.title, matchedTrack.artist, matchedTrack.album,
            matchedTrack.year, matchedTrack.duration,
            matchedTrack.spotify_id, matchedTrack.apple_id, matchedTrack.tidal_id,
            matchedTrack.bandcamp_url, matchedTrack.soundcloud_url,
            matchedTrack.label, matchedTrack.genre,
            savedFilename, // Update artwork_url
            matchedTrack.album_artwork_url, matchedTrack.isrc,
            matchedTrack.explicit, matchedTrack.popularity, matchedTrack.preview_url,
            matchedTrack.quote,
            matchedTrack.apple_music_url, matchedTrack.tidal_url, matchedTrack.custom_sources,
            matchedTrack.deezer_preview_url,
            matchedTrack.id
          );

          results.push({
            filename: file.originalname,
            matched: true,
            track: {
              id: matchedTrack.id,
              artist: matchedTrack.artist,
              title: matchedTrack.title
            },
            savedAs: savedFilename
          });
        } else {
          results.push({
            filename: file.originalname,
            matched: false,
            parsed: { artist, title },
            reason: 'No matching track found'
          });
        }

        processedFiles.push(file.originalname);

      } catch (error) {
        console.error(`Error processing file ${file.originalname}:`, error);
        results.push({
          filename: file.originalname,
          matched: false,
          error: error.message
        });
      }
    }

    const successCount = results.filter(r => r.matched).length;
    
    res.json({
      success: true,
      data: {
        results,
        summary: {
          total: req.files.length,
          successful: successCount,
          failed: req.files.length - successCount
        }
      },
      message: `Processed ${req.files.length} files, ${successCount} successfully matched`
    });

  } catch (error) {
    console.error('Error in bulk upload:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process bulk upload',
      details: error.message
    });
  }
});

// Get artwork for a specific track
router.get('/track/:trackId', async (req, res) => {
  try {
    const { trackId } = req.params;
    const queries = getQueries();
    
    const track = queries.getTrackById?.get(trackId);
    if (!track) {
      return res.status(404).json({
        success: false,
        error: 'Track not found'
      });
    }

    res.json({
      success: true,
      data: {
        trackId: track.id,
        artworkUrl: track.artwork_url,
        albumArtworkUrl: track.album_artwork_url,
        hasArtwork: !!(track.artwork_url || track.album_artwork_url)
      }
    });
  } catch (error) {
    console.error('Error getting track artwork:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get track artwork'
    });
  }
});

// Upload artwork for playlists (used by curator/admin tools)
router.post('/playlist-upload', authMiddleware, upload.single('artwork'), async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({
        success: false,
        error: 'No artwork file provided'
      });
    }

    const playlistIdRaw = req.body?.playlistId || req.body?.playlist_id;
    const playlistId = Number.parseInt(playlistIdRaw, 10);
    const baseName = (req.body?.filename || req.file.originalname || `playlist-${Date.now()}`)
      .replace(/\.[^/.]+$/, '')
      .trim() || `playlist-${Date.now()}`;

    const savedUrl = await processAndSaveArtwork(req.file.buffer, `${baseName}.jpg`, {
      prefix: 'playlists',
      sizes: [
        { suffix: '', width: 1200, height: 1200 },
        { suffix: '_large', width: 800, height: 800 },
        { suffix: '_medium', width: 400, height: 400 },
        { suffix: '_small', width: 200, height: 200 }
      ]
    });

    if (Number.isFinite(playlistId)) {
      try {
        const db = getDatabase();
        db.prepare('UPDATE playlists SET image = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(savedUrl, playlistId);
      } catch (updateError) {
        console.warn('[ARTWORK] Uploaded image but failed to attach to playlist', {
          playlistId,
          error: updateError?.message
        });
      }
    }

    const variants = {
      original: savedUrl,
      large: savedUrl.replace(/(\.[^./]+)$/, '_large$1'),
      medium: savedUrl.replace(/(\.[^./]+)$/, '_medium$1'),
      small: savedUrl.replace(/(\.[^./]+)$/, '_small$1')
    };

    res.json({
      success: true,
      data: {
        image: savedUrl,
        variants,
        playlist_id: Number.isFinite(playlistId) ? playlistId : null
      }
    });
  } catch (error) {
    console.error('Error uploading playlist artwork:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload artwork'
    });
  }
});

// Helper function to process and save artwork in multiple sizes
async function processAndSaveArtwork(buffer, filename, options = {}) {
  const {
    prefix = 'tracks',
    extension = '.jpg',
    sizes = [
      { suffix: '', width: 600, height: 600 },      // Default size
      { suffix: '_lg', width: 800, height: 800 },   // Large
      { suffix: '_md', width: 300, height: 300 },   // Medium
      { suffix: '_sm', width: 150, height: 150 }    // Small
    ]
  } = options;

  const baseName = filename.replace(/\.[^/.]+$/, '');

  for (const sizeConfig of sizes) {
    const processedBuffer = await sharp(buffer)
      .resize(sizeConfig.width, sizeConfig.height, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({
        quality: 85,
        progressive: true
      })
      .toBuffer();

    const r2Key = `${prefix}/${baseName}${sizeConfig.suffix}${extension}`;
    await uploadToR2(processedBuffer, r2Key, 'image/jpeg');
  }

  return `${process.env.R2_PUBLIC_URL}/${prefix}/${baseName}${extension}`;
}

// Helper function to parse filename for artist and title
function parseFilename(filename) {
  // Remove extension
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
  
  // Common patterns for naming:
  // "Artist - Title"
  // "Artist_Title" 
  // "Artist Title"
  
  let artist = '';
  let title = '';
  
  if (nameWithoutExt.includes(' - ')) {
    [artist, title] = nameWithoutExt.split(' - ', 2);
  } else if (nameWithoutExt.includes('_')) {
    [artist, title] = nameWithoutExt.split('_', 2);
  } else {
    // Assume first word is artist, rest is title
    const parts = nameWithoutExt.split(' ');
    if (parts.length > 1) {
      artist = parts[0];
      title = parts.slice(1).join(' ');
    } else {
      title = nameWithoutExt;
    }
  }
  
  return {
    artist: artist.trim(),
    title: title.trim()
  };
}

// Helper function to find matching track
function findMatchingTrack(tracks, artist, title) {
  const normalizeString = (str) => 
    str.toLowerCase().replace(/[^\w\s]/g, '').trim();
  
  const normArtist = normalizeString(artist);
  const normTitle = normalizeString(title);
  
  // Try exact matches first
  for (const track of tracks) {
    const trackArtist = normalizeString(track.artist || '');
    const trackTitle = normalizeString(track.title || '');
    
    if (trackArtist === normArtist && trackTitle === normTitle) {
      return track;
    }
  }
  
  // Try partial matches
  for (const track of tracks) {
    const trackArtist = normalizeString(track.artist || '');
    const trackTitle = normalizeString(track.title || '');
    
    const artistMatch = trackArtist.includes(normArtist) || normArtist.includes(trackArtist);
    const titleMatch = trackTitle.includes(normTitle) || normTitle.includes(trackTitle);
    
    if (artistMatch && titleMatch) {
      return track;
    }
  }
  
  return null;
}

export default router;
