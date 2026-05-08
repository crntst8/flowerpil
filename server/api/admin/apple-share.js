import express from 'express';
import { getDatabase, getQueries } from '../../database/db.js';
import { requireAdmin } from '../../middleware/auth.js';
import appleMusicApiService from '../../services/appleMusicApiService.js';
import { enqueueAppleShareResolution } from '../../services/appleShareUrlResolver.js';
import logger from '../../utils/logger.js';

const router = express.Router();
const queries = getQueries();
const db = getDatabase();

/**
 * GET /api/v1/admin/apple-share/pending
 *
 * Get all pending Apple share URL resolutions
 */
router.get('/pending', requireAdmin, (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 200);
    const status = req.query.status || null;

    let sql = `
      SELECT
        asr.*,
        p.title as playlist_title,
        p.curator_id,
        c.name as curator_name
      FROM apple_share_resolutions asr
      LEFT JOIN playlists p ON asr.playlist_id = p.id
      LEFT JOIN curators c ON p.curator_id = c.id
    `;

    const params = [];

    if (status && ['pending', 'resolving', 'waiting_auth', 'resolved', 'failed'].includes(status)) {
      sql += ' WHERE asr.status = ?';
      params.push(status);
    } else {
      // Default: show non-resolved items
      sql += ' WHERE asr.status IN (?, ?, ?)';
      params.push('pending', 'resolving', 'waiting_auth');
    }

    sql += ' ORDER BY asr.created_at DESC LIMIT ?';
    params.push(limit);

    const resolutions = db.prepare(sql).all(...params);

    res.json({
      success: true,
      data: resolutions
    });
  } catch (error) {
    logger.error('ADMIN_APPLE_SHARE', 'Failed to fetch pending resolutions', {
      error: error.message
    });

    res.status(500).json({
      success: false,
      error: 'Failed to fetch pending Apple share resolutions'
    });
  }
});

/**
 * POST /api/v1/admin/apple-share/manual-url
 *
 * Manually set the share URL for a playlist
 *
 * Request body:
 * {
 *   "playlist_id": 42,
 *   "share_url": "https://music.apple.com/us/playlist/pl.xyz"
 * }
 */
router.post('/manual-url', requireAdmin, (req, res) => {
  try {
    const { playlist_id, share_url } = req.body;

    if (!playlist_id || !share_url) {
      return res.status(400).json({
        success: false,
        error: 'playlist_id and share_url are required'
      });
    }

    // Validate share URL format
    const playlistId = appleMusicApiService.extractPlaylistIdFromUrl(share_url);
    if (!playlistId || !appleMusicApiService.isCatalogPlaylistId(playlistId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Apple Music share URL. Must be a catalog playlist URL (pl.xxx)'
      });
    }

    // Check if playlist exists
    const playlist = queries.getPlaylistById.get(playlist_id);
    if (!playlist) {
      return res.status(404).json({
        success: false,
        error: 'Playlist not found'
      });
    }

    // Update playlist with share URL
    db.prepare('UPDATE playlists SET apple_url = ?, exported_apple_url = ? WHERE id = ?')
      .run(share_url, share_url, playlist_id);

    // Update or create resolution record
    const existing = db.prepare('SELECT id FROM apple_share_resolutions WHERE playlist_id = ?')
      .get(playlist_id);

    if (existing) {
      db.prepare(`
        UPDATE apple_share_resolutions
        SET status = 'resolved',
            resolved_url = ?,
            error = 'Manually entered by admin',
            next_attempt_at = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE playlist_id = ?
      `).run(share_url, playlist_id);
    } else {
      // Create resolution record for tracking
      db.prepare(`
        INSERT INTO apple_share_resolutions (
          playlist_id,
          apple_library_id,
          status,
          resolved_url,
          error,
          attempt_count
        ) VALUES (?, ?, 'resolved', ?, 'Manually entered by admin', 0)
      `).run(playlist_id, playlistId, share_url);
    }

    logger.info('ADMIN_APPLE_SHARE', 'Manual share URL recorded', {
      playlistId: playlist_id,
      shareUrl: share_url,
      admin: req.user?.username || 'unknown'
    });

    res.json({
      success: true,
      data: {
        playlist_id,
        share_url,
        message: 'Share URL recorded successfully'
      }
    });
  } catch (error) {
    logger.error('ADMIN_APPLE_SHARE', 'Failed to set manual URL', {
      error: error.message,
      playlistId: req.body?.playlist_id
    });

    res.status(500).json({
      success: false,
      error: 'Failed to set manual share URL'
    });
  }
});

/**
 * POST /api/v1/admin/apple-share/trigger-check/:playlistId
 *
 * Manually trigger a share URL resolution check for a playlist
 */
router.post('/trigger-check/:playlistId', requireAdmin, (req, res) => {
  try {
    const playlistId = parseInt(req.params.playlistId, 10);

    if (isNaN(playlistId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid playlist ID'
      });
    }

    // Get resolution record
    const resolution = db.prepare('SELECT * FROM apple_share_resolutions WHERE playlist_id = ?')
      .get(playlistId);

    if (!resolution) {
      return res.status(404).json({
        success: false,
        error: 'No Apple share resolution found for this playlist'
      });
    }

    if (resolution.status === 'resolved') {
      return res.status(400).json({
        success: false,
        error: 'Share URL already resolved',
        data: {
          resolved_url: resolution.resolved_url
        }
      });
    }

    // Reset to pending with immediate next attempt
    db.prepare(`
      UPDATE apple_share_resolutions
      SET status = 'pending',
          next_attempt_at = datetime('now'),
          error = NULL
      WHERE playlist_id = ?
    `).run(playlistId);

    logger.info('ADMIN_APPLE_SHARE', 'Manual check triggered', {
      playlistId,
      admin: req.user?.username || 'unknown'
    });

    res.json({
      success: true,
      data: {
        playlist_id: playlistId,
        message: 'Share URL check queued. The resolver will process it shortly.'
      }
    });
  } catch (error) {
    logger.error('ADMIN_APPLE_SHARE', 'Failed to trigger check', {
      error: error.message,
      playlistId: req.params.playlistId
    });

    res.status(500).json({
      success: false,
      error: 'Failed to trigger share URL check'
    });
  }
});

/**
 * POST /api/v1/admin/apple-share/mark-failed/:playlistId
 *
 * Mark a resolution as permanently failed (give up)
 */
router.post('/mark-failed/:playlistId', requireAdmin, (req, res) => {
  try {
    const playlistId = parseInt(req.params.playlistId, 10);
    const reason = req.body.reason || 'Marked as failed by admin';

    if (isNaN(playlistId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid playlist ID'
      });
    }

    const resolution = db.prepare('SELECT * FROM apple_share_resolutions WHERE playlist_id = ?')
      .get(playlistId);

    if (!resolution) {
      return res.status(404).json({
        success: false,
        error: 'No Apple share resolution found for this playlist'
      });
    }

    db.prepare(`
      UPDATE apple_share_resolutions
      SET status = 'failed',
          error = ?,
          next_attempt_at = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE playlist_id = ?
    `).run(reason, playlistId);

    logger.info('ADMIN_APPLE_SHARE', 'Resolution marked as failed', {
      playlistId,
      reason,
      admin: req.user?.username || 'unknown'
    });

    res.json({
      success: true,
      data: {
        playlist_id: playlistId,
        message: 'Resolution marked as failed'
      }
    });
  } catch (error) {
    logger.error('ADMIN_APPLE_SHARE', 'Failed to mark as failed', {
      error: error.message,
      playlistId: req.params.playlistId
    });

    res.status(500).json({
      success: false,
      error: 'Failed to mark resolution as failed'
    });
  }
});

/**
 * GET /api/v1/admin/apple-share/stats
 *
 * Get statistics about Apple share URL resolutions
 */
router.get('/stats', requireAdmin, (req, res) => {
  try {
    const stats = {
      pending: 0,
      waiting_auth: 0,
      resolved: 0,
      failed: 0,
      total: 0
    };

    const rows = db.prepare(`
      SELECT status, COUNT(*) as count
      FROM apple_share_resolutions
      GROUP BY status
    `).all();

    rows.forEach(row => {
      stats[row.status] = row.count;
      stats.total += row.count;
    });

    // Average resolution time for recently resolved
    const avgRow = db.prepare(`
      SELECT AVG(
        (julianday(updated_at) - julianday(created_at)) * 24 * 60
      ) as avg_minutes
      FROM apple_share_resolutions
      WHERE status = 'resolved'
        AND datetime(updated_at) > datetime('now', '-7 days')
    `).get();

    stats.avg_resolution_time_minutes = avgRow?.avg_minutes
      ? Math.round(avgRow.avg_minutes)
      : null;

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('ADMIN_APPLE_SHARE', 'Failed to fetch stats', {
      error: error.message
    });

    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics'
    });
  }
});

export default router;
