import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import logger from '../utils/logger.js';
import SoundcloudService from '../services/soundcloudService.js';

const router = express.Router();

const validateUrl = (url) => {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  if (!trimmed.includes('soundcloud.com')) return null;
  return trimmed;
};

router.use(authMiddleware);

// POST /api/v1/soundcloud/import
router.post('/import', async (req, res) => {
  const start = Date.now();
  const rawUrl = validateUrl(req.body?.url || req.query?.url);

  if (!rawUrl) {
    return res.status(400).json({ success: false, error: 'Valid SoundCloud URL is required' });
  }

  try {
    logger.info('SOUNDCLOUD_IMPORT', 'Importing SoundCloud resource', { url: rawUrl, userId: req.user?.id });
    const result = await SoundcloudService.importFromUrl(rawUrl);

    if (!result?.tracks || result.tracks.length === 0) {
      return res.status(404).json({ success: false, error: 'No tracks found in SoundCloud resource' });
    }

    const durationMs = Date.now() - start;
    logger.info('SOUNDCLOUD_IMPORT', 'Import complete', {
      url: rawUrl,
      trackCount: result.tracks.length,
      type: result.type,
      durationMs
    });

    return res.json({
      success: true,
      data: {
        tracks: result.tracks,
        playlist: result.playlist || null,
        summary: {
          type: result.type,
          tracks: result.tracks.length,
          duration_ms: durationMs
        }
      }
    });
  } catch (error) {
    logger.error('SOUNDCLOUD_IMPORT', 'Failed to import SoundCloud resource', {
      url: rawUrl,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to import SoundCloud resource'
    });
  }
});

// POST /api/v1/soundcloud/resolve
router.post('/resolve', async (req, res) => {
  const rawUrl = validateUrl(req.body?.url || req.query?.url);
  if (!rawUrl) {
    return res.status(400).json({ success: false, error: 'Valid SoundCloud URL is required' });
  }

  try {
    const resolved = await SoundcloudService.resolveUrl(rawUrl);

    if (!resolved || resolved.kind !== 'track') {
      return res.status(400).json({ success: false, error: 'Only SoundCloud track URLs are supported here' });
    }

    const track = await SoundcloudService.buildTrack(resolved);

    return res.json({ success: true, data: track });
  } catch (error) {
    logger.error('SOUNDCLOUD_RESOLVE', 'Failed to resolve SoundCloud URL', {
      url: rawUrl,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({ success: false, error: error.message || 'Failed to resolve SoundCloud URL' });
  }
});

export default router;
