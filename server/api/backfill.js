// server/api/backfill.js
import express from 'express';
import { authMiddleware, requireAdmin } from '../middleware/auth.js';
import backfillSchedulerService from '../services/backfillSchedulerService.js';

const router = express.Router();

// All routes require admin authentication
router.use(authMiddleware, requireAdmin);

// Get scheduler status
router.get('/status', (req, res) => {
  try {
    const status = backfillSchedulerService.getStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get cross-link global stats
router.get('/cross-links/stats', (req, res) => {
  try {
    const stats = backfillSchedulerService.getCrossLinkGlobalStats();
    const total = stats.total_tracks || 1;
    res.json({
      success: true,
      data: {
        ...stats,
        apple_coverage: Math.round((stats.apple_links / total) * 100),
        tidal_coverage: Math.round((stats.tidal_links / total) * 100),
        spotify_coverage: Math.round((stats.spotify_links / total) * 100),
        youtube_coverage: Math.round((stats.youtube_links / total) * 100)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get preview global stats
router.get('/previews/stats', (req, res) => {
  try {
    const stats = backfillSchedulerService.getPreviewGlobalStats();
    const total = stats.total_tracks || 1;
    res.json({
      success: true,
      data: {
        ...stats,
        preview_coverage: Math.round(((stats.with_deezer_preview + stats.with_soundcloud) / total) * 100)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Manually trigger cross-link backfill
router.post('/cross-links/run', async (req, res) => {
  try {
    if (backfillSchedulerService.isRunningCrossLinks) {
      return res.status(409).json({
        success: false,
        error: 'Cross-link backfill already running'
      });
    }

    // Run in background, return immediately
    backfillSchedulerService.runCrossLinkBackfill().catch(err => {
      console.error('Cross-link backfill error:', err);
    });

    res.json({
      success: true,
      message: 'Cross-link backfill started'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Manually trigger preview backfill
router.post('/previews/run', async (req, res) => {
  try {
    if (backfillSchedulerService.isRunningPreviews) {
      return res.status(409).json({
        success: false,
        error: 'Preview backfill already running'
      });
    }

    // Run in background, return immediately
    backfillSchedulerService.runPreviewBackfill().catch(err => {
      console.error('Preview backfill error:', err);
    });

    res.json({
      success: true,
      message: 'Preview backfill started'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Reset attempt counters
router.post('/reset-attempts', (req, res) => {
  try {
    const { type = 'both', trackId } = req.body;

    if (trackId) {
      backfillSchedulerService.resetTrackAttempts(trackId, type);
      res.json({ success: true, message: `Reset ${type} attempts for track ${trackId}` });
    } else {
      backfillSchedulerService.resetAllAttempts(type);
      res.json({ success: true, message: `Reset ${type} attempts for all tracks` });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
