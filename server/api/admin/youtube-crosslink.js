import express from 'express';
import Joi from 'joi';
import { authMiddleware, requireAdmin } from '../../middleware/auth.js';
import { getDatabase } from '../../database/db.js';
import { crossPlatformLinkingService } from '../../services/crossPlatformLinkingService.js';

const router = express.Router();

router.use(authMiddleware, requireAdmin);

// Validation schemas
const dryRunSchema = Joi.object({
  playlistId: Joi.number().integer().positive().optional(),
  siteWide: Joi.boolean().optional(),
  batchSize: Joi.number().integer().min(1).max(50).default(10)
}).or('playlistId', 'siteWide');

const resultsQuerySchema = Joi.object({
  status: Joi.string().valid('pending', 'approved', 'rejected', 'overridden', 'all').default('all'),
  playlistId: Joi.number().integer().positive().optional(),
  jobId: Joi.string().optional(),
  hasMatch: Joi.boolean().optional(),
  search: Joi.string().allow('').optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(50)
});

const overrideSchema = Joi.object({
  stagingId: Joi.number().integer().positive().required(),
  videoId: Joi.string().allow('').optional(),
  url: Joi.string().uri().optional(),
  reason: Joi.string().max(500).optional()
}).or('videoId', 'url');

const bulkApproveSchema = Joi.object({
  stagingIds: Joi.array().items(Joi.number().integer().positive()).optional(),
  approveAll: Joi.boolean().optional()
}).or('stagingIds', 'approveAll');

const applySchema = Joi.object({
  stagingIds: Joi.array().items(Joi.number().integer().positive()).optional(),
  applyAll: Joi.boolean().optional(),
  status: Joi.string().valid('approved', 'overridden').optional()
});

const settingsSchema = Joi.object({
  youtube_auto_link_enabled: Joi.boolean().required()
});

/**
 * POST /dry-run
 * Start YouTube cross-link dry run
 */
router.post('/dry-run', async (req, res) => {
  try {
    const { value, error } = dryRunSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const result = await crossPlatformLinkingService.startYouTubeDryRun({
      playlistId: value.playlistId,
      siteWide: value.siteWide,
      batchSize: value.batchSize
    });

    return res.json({ success: true, ...result });
  } catch (error) {
    console.error('YouTube dry run error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /job/:jobId
 * Get dry run job progress
 */
router.get('/job/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    const progress = crossPlatformLinkingService.getYouTubeDryRunProgress(jobId);

    if (!progress) {
      return res.status(404).json({ error: 'Job not found' });
    }

    return res.json({ success: true, data: progress });
  } catch (error) {
    console.error('Get job progress error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /results
 * Get staged dry run results with pagination
 */
router.get('/results', (req, res) => {
  try {
    const { value, error } = resultsQuerySchema.validate(req.query);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { status, playlistId, jobId, hasMatch, search, page, limit } = value;
    const offset = (page - 1) * limit;
    const db = getDatabase();

    // Build query
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (status && status !== 'all') {
      whereClause += ' AND s.status = ?';
      params.push(status);
    }

    if (playlistId) {
      whereClause += ' AND s.playlist_id = ?';
      params.push(playlistId);
    }

    if (jobId) {
      whereClause += ' AND s.job_id = ?';
      params.push(jobId);
    }

    if (hasMatch !== undefined) {
      if (hasMatch) {
        whereClause += ' AND s.youtube_video_id IS NOT NULL';
      } else {
        whereClause += ' AND s.youtube_video_id IS NULL';
      }
    }

    if (search && search.trim()) {
      whereClause += ' AND (s.artist LIKE ? OR s.title LIKE ? OR s.youtube_title LIKE ?)';
      const searchPattern = `%${search.trim()}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    // Get total count
    const countSql = `SELECT COUNT(*) as total FROM youtube_crosslink_staging s ${whereClause}`;
    const { total } = db.prepare(countSql).get(...params);

    // Get paginated results
    const sql = `
      SELECT
        s.*,
        p.title as playlist_title
      FROM youtube_crosslink_staging s
      LEFT JOIN playlists p ON s.playlist_id = p.id
      ${whereClause}
      ORDER BY s.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const results = db.prepare(sql).all(...params, limit, offset);

    return res.json({
      success: true,
      data: results,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get results error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /stats
 * Get staging statistics
 */
router.get('/stats', (req, res) => {
  try {
    const stats = crossPlatformLinkingService.getYouTubeStagingStats();
    return res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Get stats error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /override
 * Set manual override for a staging entry
 */
router.post('/override', (req, res) => {
  try {
    const { value, error } = overrideSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    crossPlatformLinkingService.setYouTubeStagingOverride(
      value.stagingId,
      value.videoId || null,
      value.url || null,
      value.reason || null
    );

    // Fetch updated entry
    const db = getDatabase();
    const updated = db.prepare('SELECT * FROM youtube_crosslink_staging WHERE id = ?').get(value.stagingId);

    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Override error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /bulk-approve
 * Approve multiple staging entries or all pending matched entries
 */
router.post('/bulk-approve', (req, res) => {
  try {
    const { value, error } = bulkApproveSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    let approved;
    if (value.approveAll) {
      approved = crossPlatformLinkingService.bulkApproveAllYouTubeStaging();
    } else {
      approved = crossPlatformLinkingService.bulkApproveYouTubeStaging(value.stagingIds);
    }

    return res.json({ success: true, approved });
  } catch (error) {
    console.error('Bulk approve error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /apply
 * Apply approved/overridden entries to tracks table
 */
router.post('/apply', async (req, res) => {
  try {
    const { value, error } = applySchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const result = await crossPlatformLinkingService.applyYouTubeStagingEntries(
      value.stagingIds || [],
      value.applyAll || false,
      value.status || null
    );

    return res.json({ success: true, ...result });
  } catch (error) {
    console.error('Apply error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /staging/:id/status
 * Update staging entry status
 */
router.patch('/staging/:id/status', (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    crossPlatformLinkingService.updateYouTubeStagingStatus(parseInt(id, 10), status);

    const db = getDatabase();
    const updated = db.prepare('SELECT * FROM youtube_crosslink_staging WHERE id = ?').get(id);

    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Update status error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /staging/:id
 * Delete a staging entry
 */
router.delete('/staging/:id', (req, res) => {
  try {
    const { id } = req.params;
    const deleted = crossPlatformLinkingService.deleteYouTubeStagingEntry(parseInt(id, 10));

    if (!deleted) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Delete staging error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /settings
 * Get YouTube auto-link settings
 */
router.get('/settings', (req, res) => {
  try {
    const enabled = crossPlatformLinkingService.isYouTubeAutoLinkEnabled();
    return res.json({
      success: true,
      data: {
        youtube_auto_link_enabled: enabled
      }
    });
  } catch (error) {
    console.error('Get settings error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /settings
 * Update YouTube auto-link settings
 */
router.post('/settings', (req, res) => {
  try {
    const { value, error } = settingsSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    crossPlatformLinkingService.setYouTubeAutoLinkEnabled(value.youtube_auto_link_enabled);

    return res.json({
      success: true,
      data: {
        youtube_auto_link_enabled: value.youtube_auto_link_enabled
      }
    });
  } catch (error) {
    console.error('Update settings error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /playlists
 * Get playlists for dropdown selection
 */
router.get('/playlists', (req, res) => {
  try {
    const db = getDatabase();
    const playlists = db.prepare(`
      SELECT
        p.id,
        p.title,
        c.name as curator_name,
        (SELECT COUNT(*) FROM tracks t WHERE t.playlist_id = p.id) as track_count,
        (SELECT COUNT(*) FROM tracks t
         WHERE t.playlist_id = p.id
           AND (t.youtube_music_id IS NULL OR t.youtube_music_id = '')
           AND (t.youtube_music_url IS NULL OR t.youtube_music_url = '')
        ) as missing_youtube_count
      FROM playlists p
      LEFT JOIN curators c ON p.curator_id = c.id
      WHERE p.is_published = 1
      ORDER BY p.title
    `).all();

    return res.json({ success: true, data: playlists });
  } catch (error) {
    console.error('Get playlists error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /clear-applied
 * Clear old applied staging entries
 */
router.post('/clear-applied', (req, res) => {
  try {
    const { olderThanDays = 30 } = req.body;
    const cleared = crossPlatformLinkingService.clearAppliedYouTubeStaging(olderThanDays);

    return res.json({ success: true, cleared });
  } catch (error) {
    console.error('Clear applied error:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
