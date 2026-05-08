/**
 * Admin DSP Token Management API
 *
 * Endpoints for monitoring and managing OAuth tokens for DSP platforms
 * (Spotify, Apple Music, TIDAL, YouTube Music).
 */

import express from 'express';
import Joi from 'joi';
import { authMiddleware, requireAdmin } from '../../middleware/auth.js';
import tokenHealthService from '../../services/tokenHealthService.js';
import { getDatabase } from '../../database/db.js';
import {
  getQueueStatistics,
  getRecentFailures,
  getWorkerHeartbeats,
  listAutoExportEvents,
  getExportSuccessMetrics
} from '../../services/dspTelemetryService.js';

const router = express.Router();
const db = getDatabase();

// All routes require admin authentication
router.use(authMiddleware, requireAdmin);

/**
 * GET /api/v1/admin/dsp/metrics
 *
 * Surface queue depth, worker snapshot, recent failures, and auto-export events.
 */
router.get('/metrics', (req, res) => {
  try {
    const queue = getQueueStatistics();
    const workers = getWorkerHeartbeats();
    const recentFailures = getRecentFailures(5);
    const events = listAutoExportEvents({ limit: 20 });
    const successMetrics = getExportSuccessMetrics();

    return res.json({
      success: true,
      data: {
        queue,
        workers: {
          total: workers.length,
          stale: workers.filter((w) => w.stale).length,
          heartbeats: workers
        },
        recent_failures: recentFailures,
        auto_export_events: events,
        success_metrics: successMetrics
      }
    });
  } catch (error) {
    console.error('[ADMIN_DSP_METRICS] Failed to load metrics:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to load DSP metrics'
    });
  }
});

/**
 * GET /api/v1/admin/dsp/workers
 *
 * Detailed worker heartbeat data.
 */
router.get('/workers', (req, res) => {
  try {
    const workers = getWorkerHeartbeats();
    return res.json({
      success: true,
      data: workers
    });
  } catch (error) {
    console.error('[ADMIN_DSP_WORKERS] Failed to load worker status:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to load worker status'
    });
  }
});

/**
 * GET /api/v1/admin/dsp/tokens
 *
 * List all DSP OAuth tokens with health status
 *
 * Query params:
 * - platform: Filter by platform (spotify, tidal, apple, youtube_music)
 * - health_status: Filter by health status (healthy, expiring, expired, revoked, unknown)
 * - is_active: Filter by active status (1 or 0)
 */
router.get('/tokens', async (req, res) => {
  try {
    const schema = Joi.object({
      platform: Joi.string().valid('spotify', 'tidal', 'apple', 'youtube_music').optional(),
      health_status: Joi.string().valid('healthy', 'expiring', 'expired', 'revoked', 'unknown').optional(),
      is_active: Joi.number().integer().valid(0, 1).optional()
    });

    const { error, value } = schema.validate(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.details[0].message
      });
    }

    const { platform, health_status, is_active } = value;

    // Build query
    let sql = 'SELECT * FROM export_oauth_tokens WHERE 1=1';
    const params = [];

    if (platform) {
      sql += ' AND platform = ?';
      params.push(platform);
    }

    if (health_status) {
      sql += ' AND health_status = ?';
      params.push(health_status);
    }

    if (is_active !== undefined) {
      sql += ' AND is_active = ?';
      params.push(is_active);
    }

    sql += ' ORDER BY platform, is_active DESC, account_label';

    const tokens = db.prepare(sql).all(...params);

    // Sanitize tokens (don't expose actual tokens)
    const sanitizedTokens = tokens.map(token => ({
      id: token.id,
      platform: token.platform,
      account_type: token.account_type,
      account_label: token.account_label,
      owner_curator_id: token.owner_curator_id,
      health_status: token.health_status,
      is_active: token.is_active,
      expires_at: token.expires_at,
      refresh_expires_at: token.refresh_expires_at,
      last_validated_at: token.last_validated_at,
      created_at: token.created_at,
      updated_at: token.updated_at,
      // Calculated fields
      expires_in_hours: token.expires_at ?
        Math.round((new Date(token.expires_at) - new Date()) / (1000 * 60 * 60)) : null,
      has_refresh_token: !!token.refresh_token,
      user_info: token.user_info ? JSON.parse(token.user_info) : null
    }));

    return res.json({
      success: true,
      data: sanitizedTokens,
      count: sanitizedTokens.length
    });

  } catch (err) {
    console.error('[ADMIN_DSP_TOKENS] Error listing tokens:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to list tokens'
    });
  }
});

/**
 * GET /api/v1/admin/dsp/tokens/health
 *
 * Get comprehensive health report for all tokens
 */
router.get('/tokens/health', async (req, res) => {
  try {
    const report = tokenHealthService.getHealthReport();

    return res.json({
      success: true,
      data: {
        summary: report.summary,
        platforms: report.byPlatform,
        tokens: report.tokens.map(token => ({
          id: token.id,
          platform: token.platform,
          account_type: token.account_type,
          account_label: token.account_label,
          is_active: token.is_active,
          health_status: token.health_status,
          expiry_urgency: token.expiry_urgency,
          expires_at: token.expires_at,
          expires_in_hours: token.expires_at ?
            Math.round((new Date(token.expires_at) - new Date()) / (1000 * 60 * 60)) : null,
          last_validated_at: token.last_validated_at
        }))
      }
    });

  } catch (err) {
    console.error('[ADMIN_DSP_TOKENS] Error getting health report:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to get health report'
    });
  }
});

/**
 * POST /api/v1/admin/dsp/tokens/:id/validate
 *
 * Validate a specific token by making an API call
 */
router.post('/tokens/:id/validate', async (req, res) => {
  try {
    const tokenId = parseInt(req.params.id, 10);
    if (isNaN(tokenId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid token ID'
      });
    }

    const result = await tokenHealthService.validateTokenWithAPI(tokenId);

    return res.json({
      success: true,
      data: {
        token_id: tokenId,
        valid: result.valid,
        error: result.error || null,
        user_info: result.userInfo || null,
        validated_at: new Date().toISOString()
      }
    });

  } catch (err) {
    console.error('[ADMIN_DSP_TOKENS] Error validating token:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to validate token'
    });
  }
});

/**
 * POST /api/v1/admin/dsp/tokens/refresh-health
 *
 * Refresh health status for all tokens based on expiration
 */
router.post('/tokens/refresh-health', async (req, res) => {
  try {
    const result = tokenHealthService.refreshAllTokenHealthStatuses();

    return res.json({
      success: true,
      data: {
        updated: result.updated,
        unchanged: result.unchanged,
        total: result.total,
        timestamp: new Date().toISOString()
      }
    });

  } catch (err) {
    console.error('[ADMIN_DSP_TOKENS] Error refreshing health:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to refresh health status'
    });
  }
});

/**
 * GET /api/v1/admin/dsp/tokens/:id
 *
 * Get details for a specific token
 */
router.get('/tokens/:id', async (req, res) => {
  try {
    const tokenId = parseInt(req.params.id, 10);
    if (isNaN(tokenId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid token ID'
      });
    }

    const token = db.prepare('SELECT * FROM export_oauth_tokens WHERE id = ?').get(tokenId);

    if (!token) {
      return res.status(404).json({
        success: false,
        error: 'Token not found'
      });
    }

    // Sanitize token
    const sanitizedToken = {
      id: token.id,
      platform: token.platform,
      account_type: token.account_type,
      account_label: token.account_label,
      owner_curator_id: token.owner_curator_id,
      health_status: token.health_status,
      is_active: token.is_active,
      expires_at: token.expires_at,
      refresh_expires_at: token.refresh_expires_at,
      last_validated_at: token.last_validated_at,
      created_at: token.created_at,
      updated_at: token.updated_at,
      expires_in_hours: token.expires_at ?
        Math.round((new Date(token.expires_at) - new Date()) / (1000 * 60 * 60)) : null,
      has_refresh_token: !!token.refresh_token,
      user_info: token.user_info ? JSON.parse(token.user_info) : null,
      // Partial token preview (for verification)
      access_token_preview: token.access_token ? `${token.access_token.substring(0, 10)}...` : null
    };

    return res.json({
      success: true,
      data: sanitizedToken
    });

  } catch (err) {
    console.error('[ADMIN_DSP_TOKENS] Error getting token:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to get token details'
    });
  }
});

/**
 * PATCH /api/v1/admin/dsp/tokens/:id
 *
 * Update token metadata (health_status, is_active, account_label)
 */
router.patch('/tokens/:id', async (req, res) => {
  try {
    const tokenId = parseInt(req.params.id, 10);
    if (isNaN(tokenId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid token ID'
      });
    }

    const schema = Joi.object({
      health_status: Joi.string().valid('healthy', 'expiring', 'expired', 'revoked', 'unknown').optional(),
      is_active: Joi.number().integer().valid(0, 1).optional(),
      account_label: Joi.string().max(100).optional()
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.details[0].message
      });
    }

    const { health_status, is_active, account_label } = value;

    // Check token exists
    const token = db.prepare('SELECT * FROM export_oauth_tokens WHERE id = ?').get(tokenId);
    if (!token) {
      return res.status(404).json({
        success: false,
        error: 'Token not found'
      });
    }

    // Build update query
    const updates = [];
    const params = [];

    if (health_status !== undefined) {
      updates.push('health_status = ?');
      params.push(health_status);
    }

    if (is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(is_active);
    }

    if (account_label !== undefined) {
      updates.push('account_label = ?');
      params.push(account_label);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(tokenId);

    const sql = `UPDATE export_oauth_tokens SET ${updates.join(', ')} WHERE id = ?`;
    const result = db.prepare(sql).run(...params);

    if (result.changes === 0) {
      return res.status(500).json({
        success: false,
        error: 'Failed to update token'
      });
    }

    // Return updated token
    const updatedToken = db.prepare('SELECT * FROM export_oauth_tokens WHERE id = ?').get(tokenId);

    return res.json({
      success: true,
      data: {
        id: updatedToken.id,
        platform: updatedToken.platform,
        account_label: updatedToken.account_label,
        health_status: updatedToken.health_status,
        is_active: updatedToken.is_active,
        updated_at: updatedToken.updated_at
      }
    });

  } catch (err) {
    console.error('[ADMIN_DSP_TOKENS] Error updating token:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to update token'
    });
  }
});

/**
 * DELETE /api/v1/admin/dsp/tokens/:id
 *
 * Delete a token (use with caution)
 */
router.delete('/tokens/:id', async (req, res) => {
  try {
    const tokenId = parseInt(req.params.id, 10);
    if (isNaN(tokenId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid token ID'
      });
    }

    // Check token exists
    const token = db.prepare('SELECT * FROM export_oauth_tokens WHERE id = ?').get(tokenId);
    if (!token) {
      return res.status(404).json({
        success: false,
        error: 'Token not found'
      });
    }

    // Prevent deletion of active tokens
    if (token.is_active === 1) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete active token. Set is_active=0 first.'
      });
    }

    const result = db.prepare('DELETE FROM export_oauth_tokens WHERE id = ?').run(tokenId);

    if (result.changes === 0) {
      return res.status(500).json({
        success: false,
        error: 'Failed to delete token'
      });
    }

    return res.json({
      success: true,
      data: {
        deleted_token_id: tokenId,
        platform: token.platform,
        account_label: token.account_label
      }
    });

  } catch (err) {
    console.error('[ADMIN_DSP_TOKENS] Error deleting token:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete token'
    });
  }
});

export default router;
