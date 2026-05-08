/**
 * Admin API endpoints for link-out modal management
 * Route: /api/v1/admin/linkout
 */

import express from 'express';
import { getDatabase } from '../../database/db.js';
import { apiLoggingMiddleware } from '../../middleware/logging.js';
import { authMiddleware } from '../../middleware/auth.js';

const router = express.Router();

// Apply logging and auth middleware to all linkout admin routes
router.use(apiLoggingMiddleware);
router.use(authMiddleware); // Admin only

const db = getDatabase();

/**
 * GET /api/v1/admin/linkout/config
 * Get current linkout configuration
 */
router.get('/config', (_req, res) => {
  try {
    const config = db.prepare(`
      SELECT
        id,
        variant_a_headline,
        variant_a_link,
        variant_b_headline,
        variant_b_link,
        signup_mode,
        target_playlist_id,
        enabled,
        created_at,
        updated_at
      FROM linkout_config
      ORDER BY id DESC
      LIMIT 1
    `).get();

    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'No linkout configuration found'
      });
    }

    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error(`[PM2_ERROR] Admin linkout config fetch error: ${JSON.stringify({
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);

    res.status(500).json({
      success: false,
      error: 'Failed to fetch linkout configuration'
    });
  }
});

/**
 * PUT /api/v1/admin/linkout/config
 * Update linkout configuration
 *
 * Body: {
 *   variantAHeadline: string,
 *   variantALink: string,
 *   variantBHeadline: string,
 *   variantBLink: string,
 *   enabled: boolean
 * }
 */
router.put('/config', (req, res) => {
  try {
  const {
      variantAHeadline,
      variantALink,
      variantBHeadline,
      variantBLink,
      enabled,
      signupMode,
      targetPlaylistId
    } = req.body;

    // Validate required fields
    if (!variantAHeadline || !variantALink || !variantBHeadline || !variantBLink) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    // Validate enabled is a boolean
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'enabled must be a boolean'
      });
    }

    const normalizedSignupMode = signupMode || 'link';
    const allowedSignupModes = new Set(['link', 'contextual', 'target']);
    if (!allowedSignupModes.has(normalizedSignupMode)) {
      return res.status(400).json({
        success: false,
        error: 'signupMode must be one of: link, contextual, target'
      });
    }

    let parsedTargetPlaylistId = null;
    if (targetPlaylistId !== undefined && targetPlaylistId !== null && `${targetPlaylistId}`.trim() !== '') {
      const parsed = parseInt(targetPlaylistId, 10);
      if (!Number.isFinite(parsed)) {
        return res.status(400).json({
          success: false,
          error: 'targetPlaylistId must be a valid number'
        });
      }
      parsedTargetPlaylistId = parsed;
    }

    if (normalizedSignupMode === 'target' && !parsedTargetPlaylistId) {
      return res.status(400).json({
        success: false,
        error: 'targetPlaylistId is required when signupMode is target'
      });
    }

    // Check if config exists
    const existingConfig = db.prepare('SELECT id FROM linkout_config ORDER BY id DESC LIMIT 1').get();

    if (existingConfig) {
      // Update existing config
      db.prepare(`
        UPDATE linkout_config
        SET
          variant_a_headline = ?,
          variant_a_link = ?,
          variant_b_headline = ?,
          variant_b_link = ?,
          signup_mode = ?,
          target_playlist_id = ?,
          enabled = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        variantAHeadline,
        variantALink,
        variantBHeadline,
        variantBLink,
        normalizedSignupMode,
        parsedTargetPlaylistId,
        enabled ? 1 : 0,
        existingConfig.id
      );
    } else {
      // Insert new config
      db.prepare(`
        INSERT INTO linkout_config (
          variant_a_headline,
          variant_a_link,
          variant_b_headline,
          variant_b_link,
          signup_mode,
          target_playlist_id,
          enabled
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        variantAHeadline,
        variantALink,
        variantBHeadline,
        variantBLink,
        normalizedSignupMode,
        parsedTargetPlaylistId,
        enabled ? 1 : 0
      );
    }

    res.json({
      success: true,
      message: 'Linkout configuration updated successfully'
    });
  } catch (error) {
    console.error(`[PM2_ERROR] Admin linkout config update error: ${JSON.stringify({
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);

    res.status(500).json({
      success: false,
      error: 'Failed to update linkout configuration'
    });
  }
});

/**
 * GET /api/v1/admin/linkout/analytics
 * Get aggregated analytics data for the linkout modal
 *
 * Query params:
 *   days: number (default 30) - number of days to include in analytics
 */
router.get('/analytics', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;

    // Get analytics for variant A
    const variantAStats = db.prepare(`
      SELECT
        COUNT(CASE WHEN event_type = 'impression' THEN 1 END) as impressions,
        COUNT(CASE WHEN event_type = 'click' THEN 1 END) as clicks,
        COUNT(CASE WHEN event_type = 'dismiss' THEN 1 END) as dismissals,
        AVG(CASE WHEN event_type = 'click' AND time_to_action IS NOT NULL THEN time_to_action END) as avg_time_to_click,
        AVG(CASE WHEN event_type = 'dismiss' AND time_to_action IS NOT NULL THEN time_to_action END) as avg_time_to_dismiss
      FROM linkout_analytics
      WHERE variant = 'A'
        AND created_at >= datetime('now', '-' || ? || ' days')
    `).get(days);

    // Get analytics for variant B
    const variantBStats = db.prepare(`
      SELECT
        COUNT(CASE WHEN event_type = 'impression' THEN 1 END) as impressions,
        COUNT(CASE WHEN event_type = 'click' THEN 1 END) as clicks,
        COUNT(CASE WHEN event_type = 'dismiss' THEN 1 END) as dismissals,
        AVG(CASE WHEN event_type = 'click' AND time_to_action IS NOT NULL THEN time_to_action END) as avg_time_to_click,
        AVG(CASE WHEN event_type = 'dismiss' AND time_to_action IS NOT NULL THEN time_to_action END) as avg_time_to_dismiss
      FROM linkout_analytics
      WHERE variant = 'B'
        AND created_at >= datetime('now', '-' || ? || ' days')
    `).get(days);

    // Calculate click-through rates and dismissal rates
    const variantA = {
      impressions: variantAStats.impressions || 0,
      clicks: variantAStats.clicks || 0,
      dismissals: variantAStats.dismissals || 0,
      clickThroughRate: variantAStats.impressions > 0
        ? ((variantAStats.clicks / variantAStats.impressions) * 100).toFixed(2)
        : 0,
      dismissalRate: variantAStats.impressions > 0
        ? ((variantAStats.dismissals / variantAStats.impressions) * 100).toFixed(2)
        : 0,
      avgTimeToClick: variantAStats.avg_time_to_click
        ? Math.round(variantAStats.avg_time_to_click)
        : null,
      avgTimeToDismiss: variantAStats.avg_time_to_dismiss
        ? Math.round(variantAStats.avg_time_to_dismiss)
        : null
    };

    const variantB = {
      impressions: variantBStats.impressions || 0,
      clicks: variantBStats.clicks || 0,
      dismissals: variantBStats.dismissals || 0,
      clickThroughRate: variantBStats.impressions > 0
        ? ((variantBStats.clicks / variantBStats.impressions) * 100).toFixed(2)
        : 0,
      dismissalRate: variantBStats.impressions > 0
        ? ((variantBStats.dismissals / variantBStats.impressions) * 100).toFixed(2)
        : 0,
      avgTimeToClick: variantBStats.avg_time_to_click
        ? Math.round(variantBStats.avg_time_to_click)
        : null,
      avgTimeToDismiss: variantBStats.avg_time_to_dismiss
        ? Math.round(variantBStats.avg_time_to_dismiss)
        : null
    };

    res.json({
      success: true,
      data: {
        period: {
          days: days,
          startDate: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date().toISOString()
        },
        variantA,
        variantB,
        totals: {
          impressions: variantA.impressions + variantB.impressions,
          clicks: variantA.clicks + variantB.clicks,
          dismissals: variantA.dismissals + variantB.dismissals
        }
      }
    });
  } catch (error) {
    console.error(`[PM2_ERROR] Admin linkout analytics fetch error: ${JSON.stringify({
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);

    res.status(500).json({
      success: false,
      error: 'Failed to fetch linkout analytics'
    });
  }
});

export default router;
