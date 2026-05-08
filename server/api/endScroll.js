import express from 'express';
import { getDatabase } from '../database/db.js';

const router = express.Router();
const db = getDatabase();

/**
 * Helper to normalize image paths (similar to public-playlists.js)
 */
const isRemoteUrl = (value) => typeof value === 'string' && /^https?:\/\//i.test(value);

const normalizeImagePath = (value) => {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (isRemoteUrl(trimmed)) return trimmed;
  if (trimmed.startsWith('/uploads/')) return trimmed;
  const withoutLeading = trimmed.replace(/^\/+/, '');
  return `/uploads/${withoutLeading}`;
};

const buildImageVariant = (value, size = 'original') => {
  const normalized = normalizeImagePath(value);
  if (!normalized) return null;

  if (isRemoteUrl(normalized)) {
    try {
      const url = new URL(normalized);
      const pathname = url.pathname;
      const extIndex = pathname.lastIndexOf('.');

      if (extIndex === -1) return normalized;

      const base = pathname.slice(0, extIndex).replace(/_(large|medium|small|original)$/i, '');
      const ext = pathname.slice(extIndex);

      const sizeSuffix = (!size || size === 'original') ? '' : `_${size}`;
      return `${url.origin}${base}${sizeSuffix}${ext}`;
    } catch (error) {
      return normalized;
    }
  }

  const extIndex = normalized.lastIndexOf('.');
  if (extIndex === -1) return normalized;

  const base = normalized.slice(0, extIndex).replace(/_(large|medium|small|original)$/i, '');
  const ext = normalized.slice(extIndex);

  if (!size || size === 'original') return `${base}${ext}`;
  return `${base}_${size}${ext}`;
};

/**
 * Transform playlist to public format
 */
const toPublicPlaylist = (playlist, flags = []) => ({
  id: playlist.id,
  title: playlist.title,
  curator_name: playlist.curator_name || null,
  curator_type: playlist.curator_type || null,
  publish_date: playlist.publish_date || null,
  published_at: playlist.published_at || null,
  tags: typeof playlist.tags === 'string' ? playlist.tags : '',
  flags: Array.isArray(flags) ? flags : [],
  image_url_large: buildImageVariant(playlist.image, 'large'),
  image_url_medium: buildImageVariant(playlist.image, 'medium'),
  image_url_small: buildImageVariant(playlist.image, 'small')
});

const sortMap = {
  'popular': 'p.id DESC',
  'random': 'RANDOM()',
  'recent': 'p.publish_date DESC'
};

/**
 * Build related playlists for a given config and playlist
 * - Manual IDs first
 * - Tag-based selection
 * - Global pool fallback (only when config is global)
 */
const fetchRelatedPlaylists = (config, playlistId, dbInstance) => {
  let relatedPlaylists = [];

  if (config.manual_playlist_ids) {
    try {
      let playlistIds = JSON.parse(config.manual_playlist_ids);
      if (Array.isArray(playlistIds) && playlistIds.length > 0) {
        if (playlistIds.length > 100) {
          console.warn('[END_SCROLL] Too many manual playlists specified, truncating to 100');
          playlistIds = playlistIds.slice(0, 100);
        }

        const placeholders = playlistIds.map(() => '?').join(',');
        const query = `
          SELECT p.*
          FROM playlists p
          WHERE p.id IN (${placeholders})
            AND p.published = 1
            AND p.id != ?
          LIMIT ?
        `;
        relatedPlaylists = dbInstance.prepare(query).all(...playlistIds, playlistId, config.max_playlists);
      }
    } catch (error) {
      console.error('[END_SCROLL] Failed to parse manual_playlist_ids:', error);
    }
  }

  // Tag-based match
  if (relatedPlaylists.length === 0) {
    const sortClause = sortMap[config.sort_order] || sortMap.recent;
    relatedPlaylists = dbInstance.prepare(`
      SELECT DISTINCT p.*
      FROM playlists p
      JOIN playlist_flag_assignments pfa ON p.id = pfa.playlist_id
      WHERE pfa.flag_id IN (
        SELECT flag_id FROM playlist_flag_assignments
        WHERE playlist_id = ?
      )
      AND p.id != ?
      AND p.published = 1
      ORDER BY ${sortClause}
      LIMIT ?
    `).all(playlistId, playlistId, config.max_playlists);
  }

  // Global pool fallback when using the global config
  if (relatedPlaylists.length === 0 && !config.playlist_id && !config.tag_id) {
    const sortClause = sortMap[config.sort_order] || sortMap.recent;
    relatedPlaylists = dbInstance.prepare(`
      SELECT p.*
      FROM playlists p
      WHERE p.published = 1
        AND p.id != ?
      ORDER BY ${sortClause}
      LIMIT ?
    `).all(playlistId, config.max_playlists);
  }

  return relatedPlaylists;
};

/**
 * GET /api/v1/end-scroll/:playlistId
 * Returns end-scroll configuration and related playlists for a given playlist
 */
router.get('/:playlistId', (req, res) => {
  try {
    const playlistId = parseInt(req.params.playlistId, 10);

    if (!playlistId || isNaN(playlistId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid playlist ID'
      });
    }

    // Priority: Manual override > Tag-based rules > Global default
    let config = null;

    // 1. Check for manual override (playlist-specific config)
    config = db.prepare(`
      SELECT * FROM end_scroll_config
      WHERE playlist_id = ? AND enabled = 1
      ORDER BY id DESC
      LIMIT 1
    `).get(playlistId);

    // 2. If no manual override, check for tag-based rules
    if (!config) {
      const tagConfigs = db.prepare(`
        SELECT esc.*
        FROM end_scroll_config esc
        JOIN playlist_flag_assignments pfa ON esc.tag_id = pfa.flag_id
        WHERE pfa.playlist_id = ?
          AND esc.tag_id IS NOT NULL
          AND esc.enabled = 1
        ORDER BY esc.id DESC
        LIMIT 1
      `).get(playlistId);

      config = tagConfigs;
    }

    // 3. Fall back to global default
    if (!config) {
      config = db.prepare(`
        SELECT * FROM end_scroll_config
        WHERE playlist_id IS NULL AND tag_id IS NULL AND enabled = 1
        ORDER BY id DESC
        LIMIT 1
      `).get();
    }

    // If no config found or disabled, return disabled state
    if (!config || !config.enabled) {
      return res.json({
        config: {
          enabled: false
        },
        relatedPlaylists: [],
        variant: 'default'
      });
    }

    // Fetch related playlists
    let relatedPlaylists = fetchRelatedPlaylists(config, playlistId, db);

    // If tag/per-playlist config yields no results, fall back to global config and rebuild
    if (relatedPlaylists.length === 0 && (config.tag_id || config.playlist_id)) {
      const globalConfig = db.prepare(`
        SELECT * FROM end_scroll_config
        WHERE playlist_id IS NULL AND tag_id IS NULL AND enabled = 1
        ORDER BY id DESC
        LIMIT 1
      `).get();

      if (globalConfig) {
        config = globalConfig;
        relatedPlaylists = fetchRelatedPlaylists(config, playlistId, db);
      }
    }

    // Fetch flags for each playlist
    const playlistsWithFlags = relatedPlaylists.map(playlist => {
      const flags = db.prepare(`
        SELECT cpf.*
        FROM custom_playlist_flags cpf
        JOIN playlist_flag_assignments pfa ON cpf.id = pfa.flag_id
        WHERE pfa.playlist_id = ?
      `).all(playlist.id);

      return toPublicPlaylist(playlist, flags);
    });

    // A/B testing logic
    let variant = 'default';
    if (config.ab_testing_enabled && config.variant_a_cta && config.variant_b_cta) {
      variant = Math.random() < 0.5 ? 'A' : 'B';
    }

    res.json({
      config: {
        enabled: config.enabled,
        cta_text: config.cta_text,
        variant_a_cta: config.variant_a_cta,
        variant_b_cta: config.variant_b_cta,
        ab_testing_enabled: config.ab_testing_enabled,
        max_playlists: config.max_playlists
      },
      relatedPlaylists: playlistsWithFlags,
      variant
    });
  } catch (error) {
    console.error(`[PM2_ERROR] End-scroll config fetch error: ${JSON.stringify({
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
 * POST /api/v1/end-scroll/track
 * Tracks end-scroll analytics events (impression, click, scroll_back)
 *
 * Body: {
 *   playlist_id: number,
 *   variant: 'A' | 'B' | 'default',
 *   event_type: 'impression' | 'click' | 'scroll_back',
 *   clicked_playlist_id: number (optional, for click events),
 *   user_fingerprint: string (optional)
 * }
 */
router.post('/track', (req, res) => {
  try {
    const {
      playlist_id,
      event_type,
      clicked_playlist_id,
      user_fingerprint
    } = req.body || {};

    // Default missing/legacy clients to 'default' variant
    const variant = (req.body && req.body.variant) ? req.body.variant : 'default';

    // Validate required fields
    if (!playlist_id || !event_type) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: playlist_id and event_type'
      });
    }

    // Validate variant
    if (!['A', 'B', 'default'].includes(variant)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid variant. Must be A, B, or default'
      });
    }

    // Validate event type
    if (!['impression', 'click', 'scroll_back'].includes(event_type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid event_type. Must be impression, click, or scroll_back'
      });
    }

    // Insert analytics event
    db.prepare(`
      INSERT INTO end_scroll_analytics (
        playlist_id,
        variant,
        event_type,
        clicked_playlist_id,
        user_fingerprint
      ) VALUES (?, ?, ?, ?, ?)
    `).run(
      playlist_id,
      variant,
      event_type,
      clicked_playlist_id || null,
      user_fingerprint || null
    );

    res.json({
      success: true
    });
  } catch (error) {
    console.error(`[PM2_ERROR] End-scroll track error: ${JSON.stringify({
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);

    res.status(500).json({
      success: false,
      error: 'Failed to track end-scroll event'
    });
  }
});

export default router;
