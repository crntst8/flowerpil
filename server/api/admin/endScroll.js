/**
 * Admin API endpoints for end-scroll management
 * Route: /api/v1/admin/end-scroll
 */

import express from 'express';
import { getDatabase } from '../../database/db.js';
import { apiLoggingMiddleware } from '../../middleware/logging.js';
import { authMiddleware } from '../../middleware/auth.js';

const router = express.Router();

// Apply logging and auth middleware to all end-scroll admin routes
router.use(apiLoggingMiddleware);
router.use(authMiddleware); // Admin only

const db = getDatabase();

/**
 * GET /api/v1/admin/end-scroll/config
 * Get all end-scroll configurations
 */
router.get('/config', (_req, res) => {
  try {
    const configs = db.prepare(`
      SELECT
        esc.*,
        p.title as playlist_title,
        cpf.text as tag_text
      FROM end_scroll_config esc
      LEFT JOIN playlists p ON esc.playlist_id = p.id
      LEFT JOIN custom_playlist_flags cpf ON esc.tag_id = cpf.id
      ORDER BY esc.created_at DESC
    `).all();

    res.json({
      success: true,
      data: configs
    });
  } catch (error) {
    console.error(`[PM2_ERROR] Admin end-scroll config fetch error: ${JSON.stringify({
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);

    res.status(500).json({
      success: false,
      error: 'Failed to fetch end-scroll configurations'
    });
  }
});

/**
 * GET /api/v1/admin/end-scroll/config/:id
 * Get specific end-scroll configuration by ID
 */
router.get('/config/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid configuration ID'
      });
    }

    const config = db.prepare(`
      SELECT
        esc.*,
        p.title as playlist_title,
        cpf.text as tag_text
      FROM end_scroll_config esc
      LEFT JOIN playlists p ON esc.playlist_id = p.id
      LEFT JOIN custom_playlist_flags cpf ON esc.tag_id = cpf.id
      WHERE esc.id = ?
    `).get(id);

    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'Configuration not found'
      });
    }

    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error(`[PM2_ERROR] Admin end-scroll config fetch error: ${JSON.stringify({
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);

    res.status(500).json({
      success: false,
      error: 'Failed to fetch end-scroll configuration'
    });
  }
});

/**
 * POST /api/v1/admin/end-scroll/config
 * Create new end-scroll configuration
 *
 * Body: {
 *   playlist_id: number | null,
 *   tag_id: number | null,
 *   enabled: boolean,
 *   cta_text: string,
 *   variant_a_cta: string | null,
 *   variant_b_cta: string | null,
 *   ab_testing_enabled: boolean,
 *   manual_playlist_ids: string (JSON array),
 *   sort_order: 'recent' | 'popular' | 'random',
 *   max_playlists: number
 * }
 */
router.post('/config', (req, res) => {
  try {
    const {
      playlist_id,
      tag_id,
      enabled,
      cta_text,
      variant_a_cta,
      variant_b_cta,
      ab_testing_enabled,
      manual_playlist_ids,
      sort_order,
      max_playlists
    } = req.body;

    // Validate required fields
    if (cta_text === undefined || cta_text === null) {
      return res.status(400).json({
        success: false,
        error: 'cta_text is required'
      });
    }

    // Validate sort_order
    if (sort_order && !['recent', 'popular', 'random'].includes(sort_order)) {
      return res.status(400).json({
        success: false,
        error: 'sort_order must be recent, popular, or random'
      });
    }

    // Validate manual_playlist_ids if provided
    if (manual_playlist_ids) {
      try {
        const parsed = JSON.parse(manual_playlist_ids);
        if (!Array.isArray(parsed)) {
          return res.status(400).json({
            success: false,
            error: 'manual_playlist_ids must be a JSON array'
          });
        }
      } catch (error) {
        return res.status(400).json({
          success: false,
          error: 'manual_playlist_ids must be valid JSON'
        });
      }
    }

    // Insert new config
    const result = db.prepare(`
      INSERT INTO end_scroll_config (
        playlist_id,
        tag_id,
        enabled,
        cta_text,
        variant_a_cta,
        variant_b_cta,
        ab_testing_enabled,
        manual_playlist_ids,
        sort_order,
        max_playlists
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      playlist_id || null,
      tag_id || null,
      enabled ? 1 : 0,
      cta_text,
      variant_a_cta || null,
      variant_b_cta || null,
      ab_testing_enabled ? 1 : 0,
      manual_playlist_ids || null,
      sort_order || 'recent',
      max_playlists || 10
    );

    res.json({
      success: true,
      data: {
        id: result.lastInsertRowid
      }
    });
  } catch (error) {
    console.error(`[PM2_ERROR] Admin end-scroll config create error: ${JSON.stringify({
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);

    res.status(500).json({
      success: false,
      error: 'Failed to create end-scroll configuration'
    });
  }
});

/**
 * PUT /api/v1/admin/end-scroll/config/:id
 * Update existing end-scroll configuration
 */
router.put('/config/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid configuration ID'
      });
    }

    const {
      playlist_id,
      tag_id,
      enabled,
      cta_text,
      variant_a_cta,
      variant_b_cta,
      ab_testing_enabled,
      manual_playlist_ids,
      sort_order,
      max_playlists
    } = req.body;

    // Validate required fields
    if (cta_text === undefined || cta_text === null) {
      return res.status(400).json({
        success: false,
        error: 'cta_text is required'
      });
    }

    // Validate sort_order
    if (sort_order && !['recent', 'popular', 'random'].includes(sort_order)) {
      return res.status(400).json({
        success: false,
        error: 'sort_order must be recent, popular, or random'
      });
    }

    // Validate manual_playlist_ids if provided
    if (manual_playlist_ids) {
      try {
        const parsed = JSON.parse(manual_playlist_ids);
        if (!Array.isArray(parsed)) {
          return res.status(400).json({
            success: false,
            error: 'manual_playlist_ids must be a JSON array'
          });
        }
      } catch (error) {
        return res.status(400).json({
          success: false,
          error: 'manual_playlist_ids must be valid JSON'
        });
      }
    }

    // Check if config exists
    const existing = db.prepare('SELECT id FROM end_scroll_config WHERE id = ?').get(id);

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Configuration not found'
      });
    }

    // Update config
    db.prepare(`
      UPDATE end_scroll_config
      SET
        playlist_id = ?,
        tag_id = ?,
        enabled = ?,
        cta_text = ?,
        variant_a_cta = ?,
        variant_b_cta = ?,
        ab_testing_enabled = ?,
        manual_playlist_ids = ?,
        sort_order = ?,
        max_playlists = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      playlist_id || null,
      tag_id || null,
      enabled ? 1 : 0,
      cta_text,
      variant_a_cta || null,
      variant_b_cta || null,
      ab_testing_enabled ? 1 : 0,
      manual_playlist_ids || null,
      sort_order || 'recent',
      max_playlists || 10,
      id
    );

    res.json({
      success: true,
      message: 'Configuration updated successfully'
    });
  } catch (error) {
    console.error(`[PM2_ERROR] Admin end-scroll config update error: ${JSON.stringify({
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);

    res.status(500).json({
      success: false,
      error: 'Failed to update end-scroll configuration'
    });
  }
});

/**
 * DELETE /api/v1/admin/end-scroll/config/:id
 * Delete end-scroll configuration
 */
router.delete('/config/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid configuration ID'
      });
    }

    // Check if config exists
    const existing = db.prepare('SELECT id FROM end_scroll_config WHERE id = ?').get(id);

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Configuration not found'
      });
    }

    // Delete config
    db.prepare('DELETE FROM end_scroll_config WHERE id = ?').run(id);

    res.json({
      success: true,
      message: 'Configuration deleted successfully'
    });
  } catch (error) {
    console.error(`[PM2_ERROR] Admin end-scroll config delete error: ${JSON.stringify({
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);

    res.status(500).json({
      success: false,
      error: 'Failed to delete end-scroll configuration'
    });
  }
});

/**
 * GET /api/v1/admin/end-scroll/analytics
 * Get aggregated analytics data for end-scroll feature
 *
 * Query params:
 *   days: number (default 30) - number of days to include in analytics
 */
router.get('/analytics', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;

    // Get analytics for each variant (A, B, default)
    const getVariantStats = (variant) => {
      const stats = db.prepare(`
        SELECT
          COUNT(CASE WHEN event_type = 'impression' THEN 1 END) as impressions,
          COUNT(CASE WHEN event_type = 'click' THEN 1 END) as clicks,
          COUNT(CASE WHEN event_type = 'scroll_back' THEN 1 END) as scroll_backs
        FROM end_scroll_analytics
        WHERE variant = ?
          AND created_at >= datetime('now', '-' || ? || ' days')
      `).get(variant, days);

      return {
        impressions: stats.impressions || 0,
        clicks: stats.clicks || 0,
        scrollBacks: stats.scroll_backs || 0,
        ctr: stats.impressions > 0
          ? parseFloat(((stats.clicks / stats.impressions) * 100).toFixed(2))
          : 0,
        scrollBackRate: stats.impressions > 0
          ? parseFloat(((stats.scroll_backs / stats.impressions) * 100).toFixed(2))
          : 0
      };
    };

    const variantA = getVariantStats('A');
    const variantB = getVariantStats('B');
    const variantDefault = getVariantStats('default');

    // Get most clicked playlists
    const mostClicked = db.prepare(`
      SELECT
        p.id,
        p.title,
        COUNT(*) as click_count
      FROM end_scroll_analytics esa
      JOIN playlists p ON esa.clicked_playlist_id = p.id
      WHERE esa.event_type = 'click'
        AND esa.created_at >= datetime('now', '-' || ? || ' days')
      GROUP BY p.id, p.title
      ORDER BY click_count DESC
      LIMIT 10
    `).all(days);

    res.json({
      success: true,
      data: {
        period: {
          days: days,
          startDate: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date().toISOString()
        },
        byVariant: {
          A: variantA,
          B: variantB,
          default: variantDefault
        },
        totalImpressions: variantA.impressions + variantB.impressions + variantDefault.impressions,
        totalClicks: variantA.clicks + variantB.clicks + variantDefault.clicks,
        mostClickedPlaylists: mostClicked
      }
    });
  } catch (error) {
    console.error(`[PM2_ERROR] Admin end-scroll analytics fetch error: ${JSON.stringify({
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);

    res.status(500).json({
      success: false,
      error: 'Failed to fetch end-scroll analytics'
    });
  }
});

export default router;
