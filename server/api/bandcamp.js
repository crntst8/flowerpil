import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import logger from '../utils/logger.js';
import bandcampService, { validateBandcampTrackUrl } from '../services/bandcampService.js';

const router = express.Router();

router.use(authMiddleware);

// POST /api/v1/bandcamp/resolve
router.post('/resolve', async (req, res) => {
  const rawUrl = req.body?.url || req.query?.url;
  const url = validateBandcampTrackUrl(rawUrl);
  if (!url) {
    return res.status(400).json({ success: false, error: 'Valid Bandcamp track URL is required' });
  }

  try {
    logger.info('BANDCAMP_RESOLVE', 'Resolving Bandcamp track URL', { url, userId: req.user?.id });
    const data = await bandcampService.resolveTrackUrl(url);
    return res.json({ success: true, data });
  } catch (error) {
    logger.error('BANDCAMP_RESOLVE', 'Failed to resolve Bandcamp track URL', {
      url,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({ success: false, error: error.message || 'Failed to resolve Bandcamp track URL' });
  }
});

export default router;

