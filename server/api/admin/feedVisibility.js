/**
 * Admin API endpoints for feed visibility management
 * Route: /api/v1/admin/feed-visibility
 *
 * Controls which playlists appear on the landing page feed:
 * - Pinned playlists appear first in specified order
 * - Hidden playlists are excluded from landing page (still visible on /playlists)
 * - All other playlists follow chronological order by published_at
 */

import express from 'express';
import { getDatabase, getQueries } from '../../database/db.js';
import { apiLoggingMiddleware } from '../../middleware/logging.js';
import { authMiddleware } from '../../middleware/auth.js';
import { invalidateFeed } from '../../utils/memoryCache.js';

const router = express.Router();

router.use(apiLoggingMiddleware);
router.use(authMiddleware);

const db = getDatabase();

const CONFIG_KEY = 'feed_visibility';
const CONFIG_TYPE = 'system';

const queries = {
  getConfig: db.prepare(`
    SELECT config_value FROM admin_system_config WHERE config_key = ?
  `),

  upsertConfig: db.prepare(`
    INSERT INTO admin_system_config (config_key, config_value, config_type, description, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(config_key) DO UPDATE SET
      config_value = excluded.config_value,
      updated_by = excluded.updated_by,
      updated_at = datetime('now')
  `),

  logOperation: db.prepare(`
    INSERT INTO admin_audit_log
    (admin_user_id, action_type, resource_type, resource_id, details, ip_address, session_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),

  getPublishedPlaylists: db.prepare(`
    SELECT
      p.id,
      p.title,
      p.curator_name,
      p.curator_type,
      p.published_at,
      p.publish_date,
      p.image,
      p.tags
    FROM playlists p
    WHERE p.published = 1
    ORDER BY
      COALESCE(
        p.published_at,
        CASE WHEN p.publish_date IS NOT NULL AND p.publish_date != ''
             THEN datetime(p.publish_date || ' 00:00:00') END,
        p.created_at
      ) DESC,
      p.id DESC
  `)
};

/**
 * Get the current feed visibility config
 */
const getVisibilityConfig = () => {
  try {
    const row = queries.getConfig.get(CONFIG_KEY);
    if (!row?.config_value) {
      return { pinned: [], hidden: [] };
    }
    const parsed = JSON.parse(row.config_value);
    return {
      pinned: Array.isArray(parsed.pinned) ? parsed.pinned : [],
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden : []
    };
  } catch (error) {
    console.error('[FEED_VISIBILITY] Failed to parse config:', error);
    return { pinned: [], hidden: [] };
  }
};

/**
 * GET /api/v1/admin/feed-visibility
 * Get current feed visibility configuration
 */
router.get('/', (req, res) => {
  try {
    const config = getVisibilityConfig();

    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('[FEED_VISIBILITY] GET error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch feed visibility config'
    });
  }
});

/**
 * GET /api/v1/admin/feed-visibility/playlists
 * Get all published playlists with their visibility state
 */
router.get('/playlists', (req, res) => {
  try {
    const config = getVisibilityConfig();
    const pinnedSet = new Set(config.pinned);
    const hiddenSet = new Set(config.hidden);

    const playlists = queries.getPublishedPlaylists.all();

    const playlistsWithState = playlists.map(p => ({
      id: p.id,
      title: p.title,
      curator_name: p.curator_name,
      curator_type: p.curator_type,
      published_at: p.published_at,
      publish_date: p.publish_date,
      image: p.image,
      tags: p.tags,
      visibility: {
        isPinned: pinnedSet.has(p.id),
        isHidden: hiddenSet.has(p.id),
        pinnedPosition: config.pinned.indexOf(p.id)
      }
    }));

    res.json({
      success: true,
      data: {
        playlists: playlistsWithState,
        config
      }
    });
  } catch (error) {
    console.error('[FEED_VISIBILITY] GET playlists error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch playlists'
    });
  }
});

/**
 * PUT /api/v1/admin/feed-visibility
 * Update feed visibility configuration
 */
router.put('/', (req, res) => {
  try {
    const { pinned, hidden } = req.body;

    if (!Array.isArray(pinned) || !Array.isArray(hidden)) {
      return res.status(400).json({
        success: false,
        error: 'pinned and hidden must be arrays of playlist IDs'
      });
    }

    // Validate that IDs are numbers
    const pinnedIds = pinned.map(id => Number(id)).filter(id => Number.isFinite(id));
    const hiddenIds = hidden.map(id => Number(id)).filter(id => Number.isFinite(id));

    // Remove duplicates and ensure no playlist is both pinned and hidden
    const uniquePinned = [...new Set(pinnedIds)];
    const uniqueHidden = [...new Set(hiddenIds)].filter(id => !uniquePinned.includes(id));

    const newConfig = {
      pinned: uniquePinned,
      hidden: uniqueHidden
    };

    // Get old config for audit log
    const oldConfig = getVisibilityConfig();

    // Save to database
    queries.upsertConfig.run(
      CONFIG_KEY,
      JSON.stringify(newConfig),
      CONFIG_TYPE,
      'Feed visibility configuration for landing page',
      req.user.id
    );

    // Log the operation
    queries.logOperation.run(
      req.user.id,
      'update_feed_visibility',
      'system_config',
      CONFIG_KEY,
      JSON.stringify({
        old: oldConfig,
        new: newConfig
      }),
      req.ip,
      req.sessionID || null
    );

    invalidateFeed('feed_visibility_update');

    res.json({
      success: true,
      data: newConfig
    });
  } catch (error) {
    console.error('[FEED_VISIBILITY] PUT error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update feed visibility config'
    });
  }
});

/**
 * POST /api/v1/admin/feed-visibility/pin
 * Pin a playlist to a specific position
 */
router.post('/pin', (req, res) => {
  try {
    const { playlistId, position } = req.body;

    if (!Number.isFinite(Number(playlistId))) {
      return res.status(400).json({
        success: false,
        error: 'playlistId is required'
      });
    }

    const id = Number(playlistId);
    const config = getVisibilityConfig();

    // Remove from hidden if present
    config.hidden = config.hidden.filter(hid => hid !== id);

    // Remove from current position if already pinned
    config.pinned = config.pinned.filter(pid => pid !== id);

    // Add to pinned at specified position (or end if not specified)
    const pos = Number.isFinite(Number(position)) ? Math.max(0, Number(position)) : config.pinned.length;
    config.pinned.splice(pos, 0, id);

    // Save
    queries.upsertConfig.run(
      CONFIG_KEY,
      JSON.stringify(config),
      CONFIG_TYPE,
      'Feed visibility configuration for landing page',
      req.user.id
    );

    invalidateFeed('feed_visibility_pin');

    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('[FEED_VISIBILITY] POST pin error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to pin playlist'
    });
  }
});

/**
 * POST /api/v1/admin/feed-visibility/unpin
 * Remove a playlist from pinned (returns to chronological position)
 */
router.post('/unpin', (req, res) => {
  try {
    const { playlistId } = req.body;

    if (!Number.isFinite(Number(playlistId))) {
      return res.status(400).json({
        success: false,
        error: 'playlistId is required'
      });
    }

    const id = Number(playlistId);
    const config = getVisibilityConfig();

    config.pinned = config.pinned.filter(pid => pid !== id);

    queries.upsertConfig.run(
      CONFIG_KEY,
      JSON.stringify(config),
      CONFIG_TYPE,
      'Feed visibility configuration for landing page',
      req.user.id
    );

    invalidateFeed('feed_visibility_unpin');

    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('[FEED_VISIBILITY] POST unpin error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to unpin playlist'
    });
  }
});

/**
 * POST /api/v1/admin/feed-visibility/hide
 * Hide a playlist from the landing page feed
 */
router.post('/hide', (req, res) => {
  try {
    const { playlistId } = req.body;

    if (!Number.isFinite(Number(playlistId))) {
      return res.status(400).json({
        success: false,
        error: 'playlistId is required'
      });
    }

    const id = Number(playlistId);
    const config = getVisibilityConfig();

    // Remove from pinned if present
    config.pinned = config.pinned.filter(pid => pid !== id);

    // Add to hidden if not already
    if (!config.hidden.includes(id)) {
      config.hidden.push(id);
    }

    queries.upsertConfig.run(
      CONFIG_KEY,
      JSON.stringify(config),
      CONFIG_TYPE,
      'Feed visibility configuration for landing page',
      req.user.id
    );

    invalidateFeed('feed_visibility_hide');

    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('[FEED_VISIBILITY] POST hide error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to hide playlist'
    });
  }
});

/**
 * POST /api/v1/admin/feed-visibility/unhide
 * Show a hidden playlist on the landing page feed again
 */
router.post('/unhide', (req, res) => {
  try {
    const { playlistId } = req.body;

    if (!Number.isFinite(Number(playlistId))) {
      return res.status(400).json({
        success: false,
        error: 'playlistId is required'
      });
    }

    const id = Number(playlistId);
    const config = getVisibilityConfig();

    config.hidden = config.hidden.filter(hid => hid !== id);

    queries.upsertConfig.run(
      CONFIG_KEY,
      JSON.stringify(config),
      CONFIG_TYPE,
      'Feed visibility configuration for landing page',
      req.user.id
    );

    invalidateFeed('feed_visibility_unhide');

    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('[FEED_VISIBILITY] POST unhide error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to unhide playlist'
    });
  }
});

/**
 * POST /api/v1/admin/feed-visibility/reorder
 * Reorder pinned playlists
 */
router.post('/reorder', (req, res) => {
  try {
    const { pinned } = req.body;

    if (!Array.isArray(pinned)) {
      return res.status(400).json({
        success: false,
        error: 'pinned must be an array of playlist IDs'
      });
    }

    const pinnedIds = pinned.map(id => Number(id)).filter(id => Number.isFinite(id));
    const config = getVisibilityConfig();

    config.pinned = [...new Set(pinnedIds)];

    queries.upsertConfig.run(
      CONFIG_KEY,
      JSON.stringify(config),
      CONFIG_TYPE,
      'Feed visibility configuration for landing page',
      req.user.id
    );

    invalidateFeed('feed_visibility_reorder');

    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('[FEED_VISIBILITY] POST reorder error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reorder pinned playlists'
    });
  }
});

// Export the getVisibilityConfig function for use in public-playlists.js
export { getVisibilityConfig };
export default router;
