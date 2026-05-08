import express from 'express';
import Joi from 'joi';
import crypto from 'crypto';
import { getDatabase } from '../database/db.js';
import { authMiddleware, requireAdmin } from '../middleware/auth.js';
import { top10CreateLimiter, top10ImportLimiter } from '../middleware/rateLimiting.js';
import logger from '../utils/logger.js';
import { importFromUrl } from '../services/top10ImportService.js';
import { exportTop10 } from '../services/top10ExportService.js';
import { linkTop10Tracks, getLinkingProgress } from '../services/top10LinkingService.js';
import { sendCustomPlaintextEmail, sendTop10PublishEmail } from '../utils/emailService.js';

const router = express.Router();
const adminAuthMiddleware = [authMiddleware, requireAdmin];

// Helper function to generate slug from display name
const generateSlug = (displayName) => {
  // Convert to lowercase, replace spaces with hyphens
  let slug = displayName.toLowerCase().trim().replace(/\s+/g, '-');
  // Remove any characters that aren't alphanumeric or hyphens
  slug = slug.replace(/[^a-z0-9-]/g, '');
  return slug;
};

// Helper function to generate slug with collision handling
const generateUniqueSlug = (db, displayName) => {
  const baseSlug = generateSlug(displayName);
  let slug = baseSlug;
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    // Check if slug exists
    const existing = db.prepare('SELECT id FROM top10_playlists WHERE slug = ?').get(slug);
    if (!existing) {
      return slug;
    }

    // Append random 4-char suffix
    const suffix = crypto.randomBytes(2).toString('hex'); // 4 characters
    slug = `${baseSlug}-${suffix}`;
    attempts++;
  }

  throw new Error('Failed to generate unique slug after 3 attempts');
};

const resolveTop10BaseUrl = () => {
  const base = process.env.BASE_URL || process.env.FRONTEND_URL || 'https://flowerpil.com';
  return base.replace(/\/$/, '');
};

const buildTop10PublicUrl = (slug) => {
  return `${resolveTop10BaseUrl()}/top10/${slug}`;
};

const generateReferralCode = (length = 14) => {
  return crypto.randomBytes(Math.ceil(length * 0.75))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
    .slice(0, length)
    .toUpperCase();
};

const resolveArtistCuratedTag = (db) => {
  try {
    const row = db.prepare(`
      SELECT text, color
      FROM custom_playlist_flags
      WHERE lower(text) = 'artist curated'
         OR lower(url_slug) = 'artist-curated'
      LIMIT 1
    `).get();

    return {
      text: row?.text || 'Artist Curated',
      color: row?.color || '#667eea'
    };
  } catch (error) {
    logger.warn('TOP10', 'Failed to resolve artist curated tag', {
      error: error?.message || error
    });
    return { text: 'Artist Curated', color: '#667eea' };
  }
};

const resolveTop10Artwork = (top10, tracks) => {
  if (top10?.cover_image_url) return top10.cover_image_url;
  if (!Array.isArray(tracks)) return '';

  const byPosition = tracks.find((track) => track?.position === 1 && track?.artwork_url);
  if (byPosition?.artwork_url) return byPosition.artwork_url;

  const firstArtwork = tracks.find((track) => track?.artwork_url);
  return firstArtwork?.artwork_url || '';
};

const getOrCreateReferralCode = (db, email, displayName) => {
  if (!email) return null;
  const existing = db.prepare(`
    SELECT code, status
    FROM curator_referrals
    WHERE lower(email) = lower(?)
    ORDER BY created_at DESC
    LIMIT 1
  `).get(email);

  if (existing?.code && existing.status === 'unused') {
    return existing.code;
  }

  const name = displayName && displayName.trim() ? displayName.trim() : 'Top 10 Curator';
  const curatorType = 'curator';
  const maxAttempts = 5;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const code = generateReferralCode(14);
    const collision = db.prepare('SELECT id FROM curator_referrals WHERE code = ?').get(code);
    if (collision) continue;

    db.prepare(`
      INSERT INTO curator_referrals (
        code, curator_name, curator_type, email,
        issued_by_user_id, issued_by_curator_id
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(code, name, curatorType, email, null, null);

    return code;
  }

  throw new Error('Failed to generate referral code');
};

// Helper to check if user owns a top10
const checkTop10Ownership = (top10, userId, res) => {
  if (!top10) {
    return res.status(404).json({
      error: 'Top 10 not found',
      message: 'The specified Top 10 does not exist',
      type: 'top10_not_found'
    });
  }

  if (top10.user_id !== userId) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'You do not have permission to access this Top 10',
      type: 'forbidden'
    });
  }

  return null;
};

const shouldDeleteTop10User = (db, userId) => {
  const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(userId);
  if (!user?.email) return false;

  const adminUser = db.prepare(`
    SELECT id
    FROM admin_users
    WHERE lower(username) = lower(?)
    LIMIT 1
  `).get(user.email);

  return !adminUser;
};

// Helper to parse JSON tracks safely
const parseTracks = (tracksJson) => {
  try {
    return typeof tracksJson === 'string' ? JSON.parse(tracksJson) : tracksJson;
  } catch (e) {
    return [];
  }
};

// Helper to fetch the latest Top 10 for a user
const getUserTop10 = (db, userId) => {
  const top10 = db.prepare(`
    SELECT * FROM top10_playlists
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(userId);

  if (top10) {
    top10.tracks = parseTracks(top10.tracks);
  }

  return top10;
};

// Helper to hash IP for privacy
const hashIp = (ip) => {
  return crypto.createHash('sha256').update(ip).digest('hex');
};

// ============================================================================
// PUBLIC ROUTES
// ============================================================================

// GET /api/v1/top10/featured - Get featured Top 10 lists
router.get('/featured', async (req, res) => {
  try {
    const schema = Joi.object({
      limit: Joi.number().integer().min(1).max(50).default(10)
    });

    const { error, value } = schema.validate(req.query);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        message: error.details[0].message,
        type: 'validation_error'
      });
    }

    const db = getDatabase();
    const top10s = db.prepare(`
      SELECT
        t.id, t.user_id, t.title, t.description, t.cover_image_url,
        t.tracks, t.published_at, t.slug, t.view_count, t.share_count,
        u.display_name, u.avatar_url
      FROM top10_playlists t
      JOIN users u ON t.user_id = u.id
      WHERE t.is_published = 1 AND t.featured = 1
      ORDER BY t.published_at DESC
      LIMIT ?
    `).all(value.limit);

    // Parse tracks JSON
    const formattedTop10s = top10s.map(t10 => ({
      ...t10,
      tracks: parseTracks(t10.tracks)
    }));

    res.json({
      success: true,
      top10s: formattedTop10s
    });

  } catch (error) {
    logger.error('API_ERROR', 'Error fetching featured Top 10s', error);
    res.status(500).json({
      error: 'Failed to fetch featured Top 10s',
      message: 'An error occurred while retrieving featured Top 10s',
      type: 'server_error'
    });
  }
});

// GET /api/v1/top10/browse - Get all published Top 10s for public browse page
router.get('/browse', async (req, res) => {
  try {
    const db = getDatabase();
    const top10s = db.prepare(`
      SELECT
        t.id, t.slug, t.view_count, t.published_at, t.tracks,
        u.display_name
      FROM top10_playlists t
      JOIN users u ON t.user_id = u.id
      WHERE t.is_published = 1
      ORDER BY t.published_at DESC
    `).all();

    // Format response with all artist names
    const formattedTop10s = top10s.map(t10 => {
      const tracks = parseTracks(t10.tracks);
      const artists = tracks
        .sort((a, b) => a.position - b.position)
        .map(t => t.artist)
        .filter(Boolean);

      return {
        slug: t10.slug,
        display_name: t10.display_name,
        view_count: t10.view_count || 0,
        published_at: t10.published_at,
        artists: artists
      };
    });

    res.json({
      success: true,
      top10s: formattedTop10s,
      count: formattedTop10s.length
    });

  } catch (error) {
    logger.error('API_ERROR', 'Error fetching Top 10 browse list', error);
    res.status(500).json({
      error: 'Failed to fetch Top 10 list',
      message: 'An error occurred while retrieving the Top 10 list',
      type: 'server_error'
    });
  }
});

// GET /api/v1/top10/me - Get current user's Top 10 with profile
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const db = getDatabase();
    const top10 = getUserTop10(db, req.user.id);

    if (!top10) {
      return res.status(404).json({
        error: 'No Top 10 found',
        message: 'You have not created a Top 10 yet',
        type: 'no_top10'
      });
    }

    const user = db.prepare('SELECT id, email, display_name, avatar_url, bio FROM users WHERE id = ?').get(req.user.id);

    res.json({
      success: true,
      top10,
      user
    });
  } catch (error) {
    logger.error('API_ERROR', 'Error fetching user Top 10', error);
    res.status(500).json({
      error: 'Failed to fetch your Top 10',
      message: 'An error occurred while retrieving your Top 10',
      type: 'server_error'
    });
  }
});

// GET /api/v1/top10/recent - Get recent published Top 10s
router.get('/recent', async (req, res) => {
  try {
    const schema = Joi.object({
      limit: Joi.number().integer().min(1).max(50).default(20),
      offset: Joi.number().integer().min(0).default(0)
    });

    const { error, value } = schema.validate(req.query);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        message: error.details[0].message,
        type: 'validation_error'
      });
    }

    const db = getDatabase();
    const top10s = db.prepare(`
      SELECT
        t.id, t.user_id, t.title, t.description, t.cover_image_url,
        t.tracks, t.published_at, t.slug, t.view_count, t.share_count,
        u.display_name, u.avatar_url
      FROM top10_playlists t
      JOIN users u ON t.user_id = u.id
      WHERE t.is_published = 1
      ORDER BY t.published_at DESC
      LIMIT ? OFFSET ?
    `).all(value.limit, value.offset);

    const total = db.prepare(`
      SELECT COUNT(*) as count
      FROM top10_playlists
      WHERE is_published = 1
    `).get();

    // Parse tracks JSON
    const formattedTop10s = top10s.map(t10 => ({
      ...t10,
      tracks: parseTracks(t10.tracks)
    }));

    res.json({
      success: true,
      top10s: formattedTop10s,
      pagination: {
        offset: value.offset,
        limit: value.limit,
        total: total.count,
        hasMore: value.offset + top10s.length < total.count
      }
    });

  } catch (error) {
    logger.error('API_ERROR', 'Error fetching recent Top 10s', error);
    res.status(500).json({
      error: 'Failed to fetch recent Top 10s',
      message: 'An error occurred while retrieving recent Top 10s',
      type: 'server_error'
    });
  }
});

// GET /api/v1/top10/:slug - Get published Top 10 by slug
router.get('/:slug', async (req, res) => {
  try {
    const schema = Joi.object({
      slug: Joi.string().required()
    });

    const { error, value } = schema.validate({ slug: req.params.slug });
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        message: error.details[0].message,
        type: 'validation_error'
      });
    }

    const db = getDatabase();
    const top10 = db.prepare(`
      SELECT
        t.id, t.user_id, t.title, t.description, t.cover_image_url,
        t.tracks, t.published_at, t.slug, t.view_count, t.share_count,
        t.spotify_export_url, t.apple_export_url, t.tidal_export_url,
        t.numbering_preference,
        u.display_name, u.avatar_url, u.bio
      FROM top10_playlists t
      JOIN users u ON t.user_id = u.id
      WHERE t.slug = ? AND t.is_published = 1
    `).get(value.slug);

    if (!top10) {
      return res.status(404).json({
        error: 'Top 10 not found',
        message: 'The specified Top 10 does not exist or is not published',
        type: 'top10_not_found'
      });
    }

    // Parse tracks JSON
    top10.tracks = parseTracks(top10.tracks);

    res.json({
      success: true,
      top10: top10
    });

  } catch (error) {
    logger.error('API_ERROR', 'Error fetching Top 10 by slug', error);
    res.status(500).json({
      error: 'Failed to fetch Top 10',
      message: 'An error occurred while retrieving the Top 10',
      type: 'server_error'
    });
  }
});

// POST /api/v1/top10/:id/view - Increment view count (rate limited by IP)
router.post('/:id/view', async (req, res) => {
  try {
    const schema = Joi.object({
      id: Joi.number().integer().positive().required()
    });

    const { error, value } = schema.validate({ id: parseInt(req.params.id) });
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        message: error.details[0].message,
        type: 'validation_error'
      });
    }

    const db = getDatabase();
    const ipHash = hashIp(req.ip);
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Check if this IP has viewed in the last 24 hours
    const existingView = db.prepare(`
      SELECT id FROM view_tracking
      WHERE top10_id = ? AND ip_hash = ? AND viewed_at > ?
    `).get(value.id, ipHash, twentyFourHoursAgo);

    if (!existingView) {
      // Record the view
      db.prepare(`
        INSERT INTO view_tracking (top10_id, ip_hash)
        VALUES (?, ?)
      `).run(value.id, ipHash);

      // Increment view count
      db.prepare(`
        UPDATE top10_playlists
        SET view_count = view_count + 1
        WHERE id = ?
      `).run(value.id);

      logger.info('TOP10', 'View recorded', {
        top10Id: value.id,
        ipHash: ipHash.substring(0, 8)
      });
    }

    res.json({
      success: true,
      message: 'View recorded'
    });

  } catch (error) {
    logger.error('API_ERROR', 'Error recording view', error);
    res.status(500).json({
      error: 'Failed to record view',
      message: 'An error occurred while recording the view',
      type: 'server_error'
    });
  }
});

// ============================================================================ 
// AUTHENTICATED ROUTES
// ============================================================================

// GET /api/v1/top10/me/playlist - Legacy alias for current user's Top 10
router.get('/me/playlist', authMiddleware, async (req, res) => {
  try {
    const db = getDatabase();
    const top10 = getUserTop10(db, req.user.id);

    if (!top10) {
      return res.status(404).json({
        error: 'No Top 10 found',
        message: 'You have not created a Top 10 yet',
        type: 'no_top10'
      });
    }

    res.json({
      success: true,
      top10: top10
    });

  } catch (error) {
    logger.error('API_ERROR', 'Error fetching user Top 10', error);
    res.status(500).json({
      error: 'Failed to fetch your Top 10',
      message: 'An error occurred while retrieving your Top 10',
      type: 'server_error'
    });
  }
});

// POST /api/v1/top10 - Create user Top 10 (limit 1 per user)
router.post('/', authMiddleware, top10CreateLimiter, async (req, res) => {
  try {
    console.log('TOP10_CREATE: Creating Top 10', {
      userId: req.user.id,
      body: JSON.stringify(req.body)
    });

    const schema = Joi.object({
      title: Joi.string().min(1).max(100).default('My Top 10 of 2025'),
      description: Joi.string().max(500).allow('', null).optional(),
      cover_image_url: Joi.string().uri().allow('', null).optional(),
      numbering_preference: Joi.string().valid('desc', 'asc', 'none').default('desc').optional(),
      tracks: Joi.array().max(10).items(
        Joi.object({
          position: Joi.number().integer().min(1).max(10).required(),
          title: Joi.string().allow('').required(),
          artist: Joi.string().allow('').required(),
          album: Joi.string().allow('', null).optional(),
          year: Joi.number().integer().allow(null).optional(),
          duration: Joi.string().allow('', null).optional(),
          artwork_url: Joi.string().uri().allow('', null).optional(),
          blurb: Joi.string().allow('', null).optional(),
          isrc: Joi.string().allow('', null).optional(),
          spotify_url: Joi.string().uri().allow('', null).optional(),
          apple_music_url: Joi.string().uri().allow('', null).optional(),
          tidal_url: Joi.string().uri().allow('', null).optional(),
          youtube_url: Joi.string().uri().allow('', null).optional(),
          soundcloud_url: Joi.string().uri().allow('', null).optional(),
          bandcamp_url: Joi.string().uri().allow('', null).optional(),
          qobuz_url: Joi.string().uri().allow('', null).optional(),
          custom_url: Joi.string().uri().allow('', null).optional(),
          custom_platform_name: Joi.string().allow('', null).optional()
        }).unknown(true)
      ).optional().default([])
    }).unknown(true);

    const { error, value } = schema.validate(req.body);
    if (error) {
      console.log('TOP10_CREATE: Validation failed', {
        userId: req.user.id,
        error: error.details[0].message,
        body: JSON.stringify(req.body),
        details: JSON.stringify(error.details)
      });
      return res.status(400).json({
        error: 'Validation failed',
        message: error.details[0].message,
        type: 'validation_error'
      });
    }

    console.log('TOP10_CREATE: Validation passed');

    const db = getDatabase();
    console.log('TOP10_CREATE: Got database');

    // Check if user already has a Top 10
    const existing = db.prepare(`
      SELECT id FROM top10_playlists
      WHERE user_id = ?
    `).get(req.user.id);

    console.log('TOP10_CREATE: Checked existing', { existing });

    if (existing) {
      console.log('TOP10_CREATE: User already has top10, returning error');
      return res.status(400).json({
        error: 'Top 10 already exists',
        message: 'You can only create one Top 10 playlist',
        type: 'top10_exists'
      });
    }

    console.log('TOP10_CREATE: Inserting into database');

    // Create Top 10
    const result = db.prepare(`
      INSERT INTO top10_playlists (user_id, title, description, cover_image_url, tracks)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      req.user.id,
      value.title,
      value.description || null,
      value.cover_image_url || null,
      JSON.stringify(value.tracks)
    );

    console.log('TOP10_CREATE: Inserted, getting top10');

    const top10 = db.prepare('SELECT * FROM top10_playlists WHERE id = ?').get(result.lastInsertRowid);
    top10.tracks = parseTracks(top10.tracks);

    console.log('TOP10_CREATE: Updating user');

    // Update user's top10_playlist_id
    db.prepare(`
      UPDATE users
      SET top10_playlist_id = ?
      WHERE id = ?
    `).run(top10.id, req.user.id);

    console.log('TOP10_CREATE: Sending response');

    res.status(201).json({
      success: true,
      top10: top10
    });

    console.log('TOP10_CREATE: Response sent');

  } catch (error) {
    logger.error('API_ERROR', 'Error creating Top 10', error);
    res.status(500).json({
      error: 'Failed to create Top 10',
      message: 'An error occurred while creating your Top 10',
      type: 'server_error'
    });
  }
});

// PUT /api/v1/top10/:id - Update Top 10 metadata
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const paramsSchema = Joi.object({
      id: Joi.number().integer().positive().required()
    });

    const { error: paramsError, value: paramsValue } = paramsSchema.validate({ id: parseInt(req.params.id) });
    if (paramsError) {
      return res.status(400).json({
        error: 'Validation failed',
        message: paramsError.details[0].message,
        type: 'validation_error'
      });
    }

    const bodySchema = Joi.object({
      title: Joi.string().min(1).max(100).optional(),
      description: Joi.string().max(500).allow('', null).optional(),
      cover_image_url: Joi.string().uri().allow('', null).optional(),
      numbering_preference: Joi.string().valid('desc', 'asc', 'none').optional()
    }).min(1);

    const { error: bodyError, value: bodyValue } = bodySchema.validate(req.body);
    if (bodyError) {
      return res.status(400).json({
        error: 'Validation failed',
        message: bodyError.details[0].message,
        type: 'validation_error'
      });
    }

    const db = getDatabase();
    const top10 = db.prepare('SELECT * FROM top10_playlists WHERE id = ?').get(paramsValue.id);

    const ownershipError = checkTop10Ownership(top10, req.user.id, res);
    if (ownershipError) return;

    // Build update query dynamically
    const updates = [];
    const values = [];

    if (bodyValue.title !== undefined) {
      updates.push('title = ?');
      values.push(bodyValue.title);
    }
    if (bodyValue.description !== undefined) {
      updates.push('description = ?');
      values.push(bodyValue.description || null);
    }
    if (bodyValue.cover_image_url !== undefined) {
      updates.push('cover_image_url = ?');
      values.push(bodyValue.cover_image_url || null);
    }
    if (bodyValue.numbering_preference !== undefined) {
      updates.push('numbering_preference = ?');
      values.push(bodyValue.numbering_preference);
    }

    values.push(paramsValue.id);

    db.prepare(`
      UPDATE top10_playlists
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...values);

    const updated = db.prepare('SELECT * FROM top10_playlists WHERE id = ?').get(paramsValue.id);
    updated.tracks = parseTracks(updated.tracks);

    logger.info('TOP10', 'Top 10 updated', {
      userId: req.user.id,
      top10Id: paramsValue.id
    });

    res.json({
      success: true,
      top10: updated
    });

  } catch (error) {
    logger.error('API_ERROR', 'Error updating Top 10', error);
    res.status(500).json({
      error: 'Failed to update Top 10',
      message: 'An error occurred while updating your Top 10',
      type: 'server_error'
    });
  }
});

// DELETE /api/v1/top10/:id - Delete Top 10
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const schema = Joi.object({
      id: Joi.number().integer().positive().required()
    });

    const { error, value } = schema.validate({ id: parseInt(req.params.id) });
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        message: error.details[0].message,
        type: 'validation_error'
      });
    }

    const db = getDatabase();
    const top10 = db.prepare('SELECT * FROM top10_playlists WHERE id = ?').get(value.id);

    const ownershipError = checkTop10Ownership(top10, req.user.id, res);
    if (ownershipError) return;

    const deleteUser = shouldDeleteTop10User(db, top10.user_id);

    if (top10.slug) {
      const linkUrl = `/top10/${top10.slug}`;
      db.prepare(`
        UPDATE landing_page_links
        SET published = 0,
            updated_at = CURRENT_TIMESTAMP
        WHERE url = ?
      `).run(linkUrl);
    }

    // Delete Top 10 (CASCADE will delete view_tracking automatically)
    db.prepare('DELETE FROM top10_playlists WHERE id = ?').run(value.id);

    // Clear user's top10_playlist_id
    db.prepare(`
      UPDATE users
      SET top10_playlist_id = NULL
      WHERE id = ?
    `).run(req.user.id);

    if (deleteUser) {
      db.prepare('DELETE FROM users WHERE id = ?').run(top10.user_id);
    }

    logger.info('TOP10', 'Top 10 deleted', {
      userId: req.user.id,
      top10Id: value.id
    });

    res.json({
      success: true,
      message: 'Top 10 deleted successfully'
    });

  } catch (error) {
    logger.error('API_ERROR', 'Error deleting Top 10', error);
    res.status(500).json({
      error: 'Failed to delete Top 10',
      message: 'An error occurred while deleting your Top 10',
      type: 'server_error'
    });
  }
});

// POST /api/v1/top10/:id/publish - Publish Top 10 (validates 10 tracks, generates slug)
router.post('/:id/publish', authMiddleware, top10CreateLimiter, async (req, res) => {
  try {
    const paramsSchema = Joi.object({
      id: Joi.number().integer().positive().required()
    });
    const bodySchema = Joi.object({
      attemptedDspImport: Joi.boolean().optional()
    });

    const { error: paramsError, value } = paramsSchema.validate({ id: parseInt(req.params.id) });
    if (paramsError) {
      return res.status(400).json({
        error: 'Validation failed',
        message: paramsError.details[0].message,
        type: 'validation_error'
      });
    }

    const { error: bodyError, value: bodyValue } = bodySchema.validate(req.body);
    if (bodyError) {
      return res.status(400).json({
        error: 'Validation failed',
        message: bodyError.details[0].message,
        type: 'validation_error'
      });
    }

    const { attemptedDspImport } = bodyValue;

    const db = getDatabase();
    const top10 = db.prepare('SELECT * FROM top10_playlists WHERE id = ?').get(value.id);

    const ownershipError = checkTop10Ownership(top10, req.user.id, res);
    if (ownershipError) return;

    // Parse and validate tracks
    const tracks = parseTracks(top10.tracks);
    if (tracks.length !== 10) {
      return res.status(400).json({
        error: 'Invalid track count',
        message: 'You need exactly 10 tracks to publish',
        type: 'invalid_track_count'
      });
    }

    // Get user's display_name + email for slug generation + email delivery
    const user = db.prepare('SELECT display_name, email FROM users WHERE id = ?').get(req.user.id);

    // Generate unique slug
    let slug;
    try {
      slug = generateUniqueSlug(db, user.display_name);
    } catch (slugError) {
      return res.status(500).json({
        error: 'Failed to generate slug',
        message: 'Could not generate a unique URL for your Top 10',
        type: 'slug_generation_failed'
      });
    }

    // Publish Top 10
    db.prepare(`
      UPDATE top10_playlists
      SET is_published = 1, published_at = CURRENT_TIMESTAMP, slug = ?
      WHERE id = ?
    `).run(slug, value.id);

    const published = db.prepare('SELECT * FROM top10_playlists WHERE id = ?').get(value.id);
    published.tracks = parseTracks(published.tracks);

    logger.info('TOP10', 'Top 10 published', {
      userId: req.user.id,
      top10Id: value.id,
      slug: slug
    });

    const publicUrl = `/top10/${slug}`;
    const publicLink = buildTop10PublicUrl(slug);

    // Only generate referral code if all conditions are met:
    // 1. User has email
    // 2. User has display_name
    // 3. User attempted a DSP URL import during onboarding
    let referralCode = null;
    const shouldGenerateReferral = user?.email && user?.display_name && attemptedDspImport === true;

    if (shouldGenerateReferral) {
      try {
        referralCode = getOrCreateReferralCode(db, user.email, user.display_name);
      } catch (referralError) {
        logger.error('TOP10', 'Failed to generate referral code', referralError, {
          userId: req.user.id,
          top10Id: value.id
        });
      }
    } else {
      logger.info('TOP10', 'Skipping referral code generation', {
        userId: req.user.id,
        top10Id: value.id,
        hasEmail: Boolean(user?.email),
        hasDisplayName: Boolean(user?.display_name),
        attemptedDspImport: attemptedDspImport
      });
    }

    if (user?.email && referralCode) {
      try {
        await sendTop10PublishEmail({
          email: user.email,
          displayName: user.display_name,
          publicUrl: publicLink,
          referralCode
        });
      } catch (emailError) {
        logger.error('TOP10', 'Failed to send Top 10 publish email', emailError, {
          userId: req.user.id,
          top10Id: value.id,
          email: user.email
        });
      }
    }

    res.json({
      success: true,
      top10: published,
      publicUrl
    });

  } catch (error) {
    logger.error('API_ERROR', 'Error publishing Top 10', error);
    res.status(500).json({
      error: 'Failed to publish Top 10',
      message: 'An error occurred while publishing your Top 10',
      type: 'server_error'
    });
  }
});

// POST /api/v1/top10/:id/unpublish - Unpublish Top 10
router.post('/:id/unpublish', authMiddleware, async (req, res) => {
  try {
    const schema = Joi.object({
      id: Joi.number().integer().positive().required()
    });

    const { error, value } = schema.validate({ id: parseInt(req.params.id) });
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        message: error.details[0].message,
        type: 'validation_error'
      });
    }

    const db = getDatabase();
    const top10 = db.prepare('SELECT * FROM top10_playlists WHERE id = ?').get(value.id);

    const ownershipError = checkTop10Ownership(top10, req.user.id, res);
    if (ownershipError) return;

    // Unpublish Top 10
    db.prepare(`
      UPDATE top10_playlists
      SET is_published = 0
      WHERE id = ?
    `).run(value.id);

    const unpublished = db.prepare('SELECT * FROM top10_playlists WHERE id = ?').get(value.id);
    unpublished.tracks = parseTracks(unpublished.tracks);

    logger.info('TOP10', 'Top 10 unpublished', {
      userId: req.user.id,
      top10Id: value.id
    });

    res.json({
      success: true,
      top10: unpublished
    });

  } catch (error) {
    logger.error('API_ERROR', 'Error unpublishing Top 10', error);
    res.status(500).json({
      error: 'Failed to unpublish Top 10',
      message: 'An error occurred while unpublishing your Top 10',
      type: 'server_error'
    });
  }
});

// PUT /api/v1/top10/:id/tracks - Update all tracks (reorder, edit blurbs)
router.put('/:id/tracks', authMiddleware, async (req, res) => {
  try {
    const paramsSchema = Joi.object({
      id: Joi.number().integer().positive().required()
    });

    const { error: paramsError, value: paramsValue } = paramsSchema.validate({ id: parseInt(req.params.id) });
    if (paramsError) {
      return res.status(400).json({
        error: 'Validation failed',
        message: paramsError.details[0].message,
        type: 'validation_error'
      });
    }

    // Validate tracks array (max 10 tracks)
    // Note: title/artist allow empty strings to handle edge cases from imports
    // Note: .unknown(true) allows extra fields from import enrichment
    const bodySchema = Joi.object({
      tracks: Joi.array().max(10).items(
        Joi.object({
          position: Joi.number().integer().min(1).max(10).required(),
          title: Joi.string().allow('').required(),
          artist: Joi.string().allow('').required(),
          album: Joi.string().allow('', null).optional(),
          year: Joi.number().integer().allow(null).optional(),
          duration: Joi.string().allow('', null).optional(),
          artwork_url: Joi.string().uri().allow('', null).optional(),
          blurb: Joi.string().allow('', null).optional(),
          isrc: Joi.string().allow('', null).optional(),
          spotify_url: Joi.string().uri().allow('', null).optional(),
          apple_music_url: Joi.string().uri().allow('', null).optional(),
          tidal_url: Joi.string().uri().allow('', null).optional(),
          youtube_url: Joi.string().uri().allow('', null).optional(),
          soundcloud_url: Joi.string().uri().allow('', null).optional(),
          bandcamp_url: Joi.string().uri().allow('', null).optional(),
          qobuz_url: Joi.string().uri().allow('', null).optional(),
          custom_url: Joi.string().uri().allow('', null).optional(),
          custom_platform_name: Joi.string().allow('', null).optional()
        }).unknown(true)
      ).required()
    }).unknown(true);

    const { error: bodyError, value: bodyValue } = bodySchema.validate(req.body);
    if (bodyError) {
      logger.error('TOP10_TRACKS', 'Validation failed for PUT tracks', {
        message: bodyError.details[0].message,
        path: bodyError.details[0].path,
        type: bodyError.details[0].type,
        context: JSON.stringify(bodyError.details[0].context),
        userId: req.user.id,
        top10Id: paramsValue.id
      });
      return res.status(400).json({
        error: 'Validation failed',
        message: bodyError.details[0].message,
        type: 'validation_error'
      });
    }

    const db = getDatabase();
    const top10 = db.prepare('SELECT * FROM top10_playlists WHERE id = ?').get(paramsValue.id);

    const ownershipError = checkTop10Ownership(top10, req.user.id, res);
    if (ownershipError) return;

    // Update tracks
    db.prepare(`
      UPDATE top10_playlists
      SET tracks = ?
      WHERE id = ?
    `).run(JSON.stringify(bodyValue.tracks), paramsValue.id);

    const updated = db.prepare('SELECT * FROM top10_playlists WHERE id = ?').get(paramsValue.id);
    updated.tracks = parseTracks(updated.tracks);

    logger.info('TOP10', 'Tracks updated', {
      userId: req.user.id,
      top10Id: paramsValue.id,
      trackCount: bodyValue.tracks.length
    });

    res.json({
      success: true,
      top10: updated
    });

  } catch (error) {
    logger.error('API_ERROR', 'Error updating tracks', error);
    res.status(500).json({
      error: 'Failed to update tracks',
      message: 'An error occurred while updating tracks',
      type: 'server_error'
    });
  }
});

// POST /api/v1/top10/import - Import tracks from DSP URL
router.post('/import', authMiddleware, top10ImportLimiter, async (req, res) => {
  try {
    const schema = Joi.object({
      url: Joi.string().uri().required()
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        message: error.details[0].message,
        type: 'validation_error'
      });
    }

    const { url } = value;

    // Import tracks from URL using top10ImportService
    try {
      const tracks = await importFromUrl(url);

      if (!tracks || tracks.length === 0) {
        return res.status(400).json({
          error: 'No tracks found',
          message: 'The playlist or album appears to be empty',
          type: 'empty_playlist'
        });
      }

      res.json({
        success: true,
        tracks,
        count: tracks.length,
        message: `Successfully imported ${tracks.length} track${tracks.length > 1 ? 's' : ''}`
      });

    } catch (importError) {
      // Handle specific import errors
      const errorMessage = importError.message || 'Failed to import tracks';
      const normalizedMessage = errorMessage.toLowerCase();

      // Check for specific error types
      if (normalizedMessage.includes('not yet implemented') || normalizedMessage.includes('not supported')) {
        return res.status(501).json({
          error: 'Import not supported',
          message: errorMessage,
          type: 'not_implemented'
        });
      }

      if (normalizedMessage.includes('unsupported') || normalizedMessage.includes('invalid url')) {
        return res.status(400).json({
          error: 'Invalid URL',
          message: errorMessage,
          type: 'invalid_url'
        });
      }

      if (normalizedMessage.includes('rate limit')) {
        return res.status(429).json({
          error: 'Rate limited',
          message: 'Too many import requests. Please try again later.',
          type: 'rate_limit'
        });
      }

      if (normalizedMessage.includes('private')) {
        return res.status(400).json({
          error: 'Private playlist',
          message: 'This playlist is private and cannot be imported',
          type: 'playlist_private'
        });
      }

      // Platform API configuration errors
      if (normalizedMessage.includes('apple music') && (normalizedMessage.includes('team_id') || normalizedMessage.includes('key_id'))) {
        return res.status(503).json({
          error: 'Apple Music not configured',
          message: 'Apple Music imports are not available. Please use Spotify or add tracks manually.',
          type: 'platform_not_configured'
        });
      }

      if (normalizedMessage.includes('youtube api key') || normalizedMessage.includes('youtube_api_key')) {
        return res.status(503).json({
          error: 'YouTube not configured',
          message: 'YouTube imports are not available. Please use Spotify or add tracks manually.',
          type: 'platform_not_configured'
        });
      }

      if (normalizedMessage.includes('soundcloud') && normalizedMessage.includes('not configured')) {
        return res.status(503).json({
          error: 'SoundCloud not configured',
          message: 'SoundCloud imports are not available. Please use Spotify or add tracks manually.',
          type: 'platform_not_configured'
        });
      }

      // Generic import error
      throw importError;
    }

  } catch (error) {
    logger.error('API_ERROR', 'Error importing tracks', error);
    res.status(500).json({
      error: 'Failed to import tracks',
      message: 'An error occurred while importing tracks',
      type: 'server_error'
    });
  }
});

// POST /api/v1/top10/:id/link - Cross-link tracks to DSPs
router.post('/:id/link', authMiddleware, async (req, res) => {
  try {
    const paramsSchema = Joi.object({
      id: Joi.number().integer().positive().required()
    });

    const { error: paramsError, value: paramsValue } = paramsSchema.validate({ id: parseInt(req.params.id) });
    if (paramsError) {
      return res.status(400).json({
        error: 'Validation failed',
        message: paramsError.details[0].message,
        type: 'validation_error'
      });
    }

    const bodySchema = Joi.object({
      forceRefresh: Joi.boolean().default(false)
    });

    const { error: bodyError, value: bodyValue } = bodySchema.validate(req.body);
    if (bodyError) {
      return res.status(400).json({
        error: 'Validation failed',
        message: bodyError.details[0].message,
        type: 'validation_error'
      });
    }

    const db = getDatabase();
    const top10 = db.prepare('SELECT id, user_id FROM top10_playlists WHERE id = ?').get(paramsValue.id);

    const ownershipError = checkTop10Ownership(top10, req.user.id, res);
    if (ownershipError) return ownershipError;

    logger.info('TOP10_LINK', 'Starting cross-linking', {
      top10Id: paramsValue.id,
      userId: req.user.id,
      forceRefresh: bodyValue.forceRefresh
    });

    // Run cross-linking
    const result = await linkTop10Tracks(paramsValue.id, {
      forceRefresh: bodyValue.forceRefresh
    });

    res.json({
      success: true,
      message: 'Cross-linking completed',
      stats: result.results
    });

  } catch (error) {
    logger.error('API_ERROR', 'Error cross-linking Top 10 tracks', error);
    res.status(500).json({
      error: 'Failed to cross-link tracks',
      message: 'An error occurred while cross-linking tracks to DSPs',
      type: 'server_error'
    });
  }
});

// GET /api/v1/top10/:id/link/progress - Get cross-linking progress
router.get('/:id/link/progress', authMiddleware, async (req, res) => {
  try {
    const schema = Joi.object({
      id: Joi.number().integer().positive().required()
    });

    const { error, value } = schema.validate({ id: parseInt(req.params.id) });
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        message: error.details[0].message,
        type: 'validation_error'
      });
    }

    const db = getDatabase();
    const top10 = db.prepare('SELECT id, user_id FROM top10_playlists WHERE id = ?').get(value.id);

    const ownershipError = checkTop10Ownership(top10, req.user.id, res);
    if (ownershipError) return ownershipError;

    const progress = getLinkingProgress(value.id);

    res.json({
      success: true,
      progress
    });

  } catch (error) {
    logger.error('API_ERROR', 'Error getting linking progress', error);
    res.status(500).json({
      error: 'Failed to get linking progress',
      message: 'An error occurred while retrieving linking progress',
      type: 'server_error'
    });
  }
});

// POST /api/v1/top10/:id/tracks - Add track (manual or from DSP)
router.post('/:id/tracks', authMiddleware, async (req, res) => {
  try {
    const paramsSchema = Joi.object({
      id: Joi.number().integer().positive().required()
    });

    const { error: paramsError, value: paramsValue } = paramsSchema.validate({ id: parseInt(req.params.id) });
    if (paramsError) {
      return res.status(400).json({
        error: 'Validation failed',
        message: paramsError.details[0].message,
        type: 'validation_error'
      });
    }

    const bodySchema = Joi.object({
      position: Joi.number().integer().min(1).max(10).required(),
      title: Joi.string().allow('').required(),
      artist: Joi.string().allow('').required(),
      album: Joi.string().allow('', null).optional(),
      year: Joi.number().integer().allow(null).optional(),
      duration: Joi.string().allow('', null).optional(),
      artwork_url: Joi.string().uri().allow('', null).optional(),
      blurb: Joi.string().allow('', null).optional(),
      isrc: Joi.string().allow('', null).optional(),
      spotify_url: Joi.string().uri().allow('', null).optional(),
      apple_music_url: Joi.string().uri().allow('', null).optional(),
      tidal_url: Joi.string().uri().allow('', null).optional(),
      youtube_url: Joi.string().uri().allow('', null).optional(),
      soundcloud_url: Joi.string().uri().allow('', null).optional(),
      bandcamp_url: Joi.string().uri().allow('', null).optional(),
      qobuz_url: Joi.string().uri().allow('', null).optional(),
      custom_url: Joi.string().uri().allow('', null).optional(),
      custom_platform_name: Joi.string().allow('', null).optional()
    }).unknown(true);

    const { error: bodyError, value: bodyValue } = bodySchema.validate(req.body);
    if (bodyError) {
      return res.status(400).json({
        error: 'Validation failed',
        message: bodyError.details[0].message,
        type: 'validation_error'
      });
    }

    const db = getDatabase();
    const top10 = db.prepare('SELECT * FROM top10_playlists WHERE id = ?').get(paramsValue.id);

    const ownershipError = checkTop10Ownership(top10, req.user.id, res);
    if (ownershipError) return;

    // Get current tracks
    const tracks = parseTracks(top10.tracks);

    // Check if we already have 10 tracks
    if (tracks.length >= 10) {
      return res.status(400).json({
        error: 'Maximum tracks reached',
        message: 'You can only have 10 tracks in your Top 10',
        type: 'max_tracks_reached'
      });
    }

    // Check if position is already taken
    const positionTaken = tracks.some(t => t.position === bodyValue.position);
    if (positionTaken) {
      return res.status(400).json({
        error: 'Position taken',
        message: `Position ${bodyValue.position} is already occupied`,
        type: 'position_taken'
      });
    }

    // Add track
    tracks.push(bodyValue);

    // Update tracks
    db.prepare(`
      UPDATE top10_playlists
      SET tracks = ?
      WHERE id = ?
    `).run(JSON.stringify(tracks), paramsValue.id);

    const updated = db.prepare('SELECT * FROM top10_playlists WHERE id = ?').get(paramsValue.id);
    updated.tracks = parseTracks(updated.tracks);

    logger.info('TOP10', 'Track added', {
      userId: req.user.id,
      top10Id: paramsValue.id,
      position: bodyValue.position
    });

    res.status(201).json({
      success: true,
      top10: updated
    });

  } catch (error) {
    logger.error('API_ERROR', 'Error adding track', error);
    res.status(500).json({
      error: 'Failed to add track',
      message: 'An error occurred while adding the track',
      type: 'server_error'
    });
  }
});

// DELETE /api/v1/top10/:id/tracks/:position - Remove track at position
router.delete('/:id/tracks/:position', authMiddleware, async (req, res) => {
  try {
    const schema = Joi.object({
      id: Joi.number().integer().positive().required(),
      position: Joi.number().integer().min(1).max(10).required()
    });

    const { error, value } = schema.validate({
      id: parseInt(req.params.id),
      position: parseInt(req.params.position)
    });

    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        message: error.details[0].message,
        type: 'validation_error'
      });
    }

    const db = getDatabase();
    const top10 = db.prepare('SELECT * FROM top10_playlists WHERE id = ?').get(value.id);

    const ownershipError = checkTop10Ownership(top10, req.user.id, res);
    if (ownershipError) return;

    // Get current tracks and remove the track at position
    let tracks = parseTracks(top10.tracks);
    const initialLength = tracks.length;
    tracks = tracks.filter(t => t.position !== value.position);

    if (tracks.length === initialLength) {
      return res.status(404).json({
        error: 'Track not found',
        message: `No track found at position ${value.position}`,
        type: 'track_not_found'
      });
    }

    // Update tracks
    db.prepare(`
      UPDATE top10_playlists
      SET tracks = ?
      WHERE id = ?
    `).run(JSON.stringify(tracks), value.id);

    const updated = db.prepare('SELECT * FROM top10_playlists WHERE id = ?').get(value.id);
    updated.tracks = parseTracks(updated.tracks);

    logger.info('TOP10', 'Track removed', {
      userId: req.user.id,
      top10Id: value.id,
      position: value.position
    });

    res.json({
      success: true,
      top10: updated
    });

  } catch (error) {
    logger.error('API_ERROR', 'Error removing track', error);
    res.status(500).json({
      error: 'Failed to remove track',
      message: 'An error occurred while removing the track',
      type: 'server_error'
    });
  }
});

// POST /api/v1/top10/:id/export - Request DSP export using admin tokens
router.post('/:id/export', authMiddleware, async (req, res) => {
  try {
    const paramsSchema = Joi.object({
      id: Joi.number().integer().positive().required()
    });

    const { error: paramsError, value: paramsValue } = paramsSchema.validate({ id: parseInt(req.params.id) });
    if (paramsError) {
      return res.status(400).json({
        error: 'Validation failed',
        message: paramsError.details[0].message,
        type: 'validation_error'
      });
    }

    const bodySchema = Joi.object({
      platforms: Joi.array().items(Joi.string().valid('spotify', 'apple', 'tidal')).min(1).max(3).required()
    });

    const { error: bodyError, value: bodyValue } = bodySchema.validate(req.body);
    if (bodyError) {
      return res.status(400).json({
        error: 'Validation failed',
        message: bodyError.details[0].message,
        type: 'validation_error'
      });
    }

    const db = getDatabase();
    const top10 = db.prepare('SELECT * FROM top10_playlists WHERE id = ?').get(paramsValue.id);

    const ownershipError = checkTop10Ownership(top10, req.user.id, res);
    if (ownershipError) return;

    // Check if published
    if (!top10.is_published) {
      return res.status(400).json({
        error: 'Not published',
        message: 'You must publish your Top 10 before exporting',
        type: 'not_published'
      });
    }

    // Check track count
    const tracks = parseTracks(top10.tracks);
    if (tracks.length !== 10) {
      return res.status(400).json({
        error: 'Invalid track count',
        message: 'You need exactly 10 tracks to export',
        type: 'invalid_track_count'
      });
    }

    // Check rate limit (1 export per day)
    if (top10.export_requested_at) {
      const lastExport = new Date(top10.export_requested_at);
      const now = new Date();
      const hoursSinceLastExport = (now - lastExport) / (1000 * 60 * 60);

      if (hoursSinceLastExport < 24) {
        return res.status(429).json({
          error: 'Rate limit exceeded',
          message: 'You can only export once per day',
          type: 'rate_limit'
        });
      }
    }

    // Update export_requested_at
    db.prepare(`
      UPDATE top10_playlists
      SET export_requested_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(paramsValue.id);

    logger.info('TOP10', 'Export requested', {
      userId: req.user.id,
      top10Id: paramsValue.id,
      platforms: bodyValue.platforms
    });

    // Perform export using top10ExportService
    try {
      const exportResult = await exportTop10(paramsValue.id, bodyValue.platforms);

      // Return detailed results
      const successfulExports = Object.entries(exportResult.results)
        .filter(([_, result]) => result.success)
        .map(([platform, result]) => ({
          platform,
          url: result.url,
          trackCount: result.trackCount
        }));

      const failedExports = Object.entries(exportResult.results)
        .filter(([_, result]) => !result.success)
        .map(([platform, result]) => ({
          platform,
          error: result.error
        }));

      if (exportResult.allSucceeded) {
        return res.json({
          success: true,
          message: `Successfully exported to ${successfulExports.length} platform${successfulExports.length > 1 ? 's' : ''}`,
          exports: successfulExports
        });
      } else if (exportResult.anySucceeded) {
        return res.json({
          success: true,
          partial: true,
          message: `Exported to ${successfulExports.length} of ${bodyValue.platforms.length} platform${bodyValue.platforms.length > 1 ? 's' : ''}`,
          exports: successfulExports,
          failures: failedExports
        });
      } else {
        return res.status(500).json({
          success: false,
          error: 'All exports failed',
          message: 'Failed to export to any platform',
          failures: failedExports,
          type: 'export_failed'
        });
      }

    } catch (exportError) {
      logger.error('TOP10_EXPORT', 'Export failed', {
        top10Id: paramsValue.id,
        error: exportError.message
      });

      return res.status(500).json({
        success: false,
        error: 'Export failed',
        message: exportError.message || 'An error occurred during export',
        type: 'export_error'
      });
    }

  } catch (error) {
    logger.error('API_ERROR', 'Error requesting export', error);
    res.status(500).json({
      error: 'Failed to request export',
      message: 'An error occurred while requesting export',
      type: 'server_error'
    });
  }
});

// GET /api/v1/top10/:id/export-status - Check export status
router.get('/:id/export-status', authMiddleware, async (req, res) => {
  try {
    const schema = Joi.object({
      id: Joi.number().integer().positive().required()
    });

    const { error, value } = schema.validate({ id: parseInt(req.params.id) });
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        message: error.details[0].message,
        type: 'validation_error'
      });
    }

    const db = getDatabase();
    const top10 = db.prepare('SELECT * FROM top10_playlists WHERE id = ?').get(value.id);

    const ownershipError = checkTop10Ownership(top10, req.user.id, res);
    if (ownershipError) return;

    res.json({
      success: true,
      export_status: {
        requested_at: top10.export_requested_at,
        completed_at: top10.export_completed_at,
        spotify_url: top10.spotify_export_url,
        apple_url: top10.apple_export_url,
        tidal_url: top10.tidal_export_url,
        is_complete: !!top10.export_completed_at
      }
    });

  } catch (error) {
    logger.error('API_ERROR', 'Error checking export status', error);
    res.status(500).json({
      error: 'Failed to check export status',
      message: 'An error occurred while checking export status',
      type: 'server_error'
    });
  }
});

// POST /api/v1/top10/:id/invite - Generate invite link
router.post('/:id/invite', authMiddleware, async (req, res) => {
  try {
    const schema = Joi.object({
      id: Joi.number().integer().positive().required()
    });

    const { error, value } = schema.validate({ id: parseInt(req.params.id) });
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        message: error.details[0].message,
        type: 'validation_error'
      });
    }

    const db = getDatabase();
    const top10 = db.prepare('SELECT * FROM top10_playlists WHERE id = ?').get(value.id);

    const ownershipError = checkTop10Ownership(top10, req.user.id, res);
    if (ownershipError) return;

    // Generate invite link (using slug if published, otherwise a generic link)
    const inviteUrl = top10.is_published && top10.slug
      ? `${process.env.BASE_URL || 'https://flowerpil.com'}/top10/${top10.slug}`
      : `${process.env.BASE_URL || 'https://flowerpil.com'}/top10/start`;

    res.json({
      success: true,
      invite_url: inviteUrl
    });

  } catch (error) {
    logger.error('API_ERROR', 'Error generating invite link', error);
    res.status(500).json({
      error: 'Failed to generate invite link',
      message: 'An error occurred while generating the invite link',
      type: 'server_error'
    });
  }
});

// ============================================================================
// ADMIN ROUTES
// ============================================================================

// GET /api/v1/admin/top10 - List all Top 10s with search/filters
router.get('/admin/list', adminAuthMiddleware, async (req, res) => {
  try {
    const schema = Joi.object({
      limit: Joi.number().integer().min(1).max(100).default(50),
      offset: Joi.number().integer().min(0).default(0),
      search: Joi.string().allow('').optional(),
      published: Joi.string().valid('all', 'published', 'unpublished').default('all')
    });

    const { error, value } = schema.validate(req.query);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        message: error.details[0].message,
        type: 'validation_error'
      });
    }

    const db = getDatabase();

    // Build WHERE clause
    let whereClause = '';
    const params = [];

    if (value.published === 'published') {
      whereClause = 'WHERE t.is_published = 1';
    } else if (value.published === 'unpublished') {
      whereClause = 'WHERE t.is_published = 0';
    }

    if (value.search) {
      const searchClause = whereClause ? 'AND' : 'WHERE';
      whereClause += ` ${searchClause} (t.title LIKE ? OR u.display_name LIKE ? OR u.email LIKE ?)`;
      const searchTerm = `%${value.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    const top10s = db.prepare(`
      SELECT
        t.*, u.display_name, u.email, u.avatar_url,
        au.id AS curator_admin_id,
        au.created_at AS curator_created_at
      FROM top10_playlists t
      JOIN users u ON t.user_id = u.id
      LEFT JOIN admin_users au
        ON lower(au.username) = lower(u.email)
        AND au.role = 'curator'
      ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, value.limit, value.offset);

    const total = db.prepare(`
      SELECT COUNT(*) as count
      FROM top10_playlists t
      JOIN users u ON t.user_id = u.id
      ${whereClause}
    `).get(...params);

    // Parse tracks JSON
    const formattedTop10s = top10s.map(t10 => {
      const tracks = parseTracks(t10.tracks);
      const trackCount = tracks.length;
      const isPublished = t10.is_published === 1;
      const hasCurator = Boolean(t10.curator_admin_id);
      const publishedAt = t10.published_at ? new Date(t10.published_at) : null;
      const curatorAt = t10.curator_created_at ? new Date(t10.curator_created_at) : null;
      const convertedAfterPublish = Boolean(
        publishedAt
          && curatorAt
          && !Number.isNaN(publishedAt.getTime())
          && !Number.isNaN(curatorAt.getTime())
          && curatorAt.getTime() >= publishedAt.getTime()
      );
      let conversionStatus = 'signed_up_only';
      let conversionLabel = 'Signed up only';

      if (isPublished && hasCurator && convertedAfterPublish) {
        conversionStatus = 'published_curator';
        conversionLabel = 'Published + Curator';
      } else if (isPublished) {
        conversionStatus = 'published';
        conversionLabel = 'Published';
      } else if (trackCount > 0) {
        conversionStatus = 'imported_not_published';
        conversionLabel = 'Imported, not published';
      }

      return {
        ...t10,
        tracks,
        track_count: trackCount,
        conversion_status: conversionStatus,
        conversion_label: conversionLabel,
        curator_signup_at: t10.curator_created_at
      };
    });

    res.json({
      success: true,
      top10s: formattedTop10s,
      pagination: {
        offset: value.offset,
        limit: value.limit,
        total: total.count,
        hasMore: value.offset + top10s.length < total.count
      }
    });

  } catch (error) {
    logger.error('API_ERROR', 'Error listing Top 10s (admin)', error);
    res.status(500).json({
      error: 'Failed to list Top 10s',
      message: 'An error occurred while retrieving Top 10s',
      type: 'server_error'
    });
  }
});

// POST /api/v1/admin/top10/bulk-email - Send plaintext email to all Top 10 users
router.post('/admin/bulk-email', adminAuthMiddleware, async (req, res) => {
  try {
    const schema = Joi.object({
      subject: Joi.string().trim().min(1).max(200).required(),
      message: Joi.string().trim().min(1).max(10000).required()
    });

    const { error, value } = schema.validate(req.body || {});
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        message: error.details[0].message,
        type: 'validation_error'
      });
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

    const db = getDatabase();
    const rows = db.prepare(`
      SELECT DISTINCT u.email AS email
      FROM top10_playlists t
      JOIN users u ON t.user_id = u.id
      WHERE u.email IS NOT NULL AND TRIM(u.email) <> ''
    `).all();

    const seen = new Set();
    const recipients = [];
    const invalid = [];

    for (const row of rows) {
      const raw = typeof row?.email === 'string' ? row.email.trim() : '';
      if (!raw) continue;
      const normalized = raw.toLowerCase();
      if (seen.has(normalized)) continue;
      seen.add(normalized);

      if (!emailPattern.test(raw)) {
        invalid.push(raw);
        continue;
      }

      recipients.push(raw);
    }

    if (recipients.length === 0) {
      return res.json({
        success: true,
        recipient_count: 0,
        invalid_count: invalid.length,
        sent_count: 0,
        failed_count: 0
      });
    }

    const adminEmail = typeof req.user?.email === 'string' ? req.user.email.trim() : '';
    const fallbackTo = process.env.EMAIL_BULK_TO || process.env.EMAIL_FROM_SIGNUP || 'hello@flowerpil.io';
    const toAddress = emailPattern.test(adminEmail) ? adminEmail : fallbackTo;

    const batchSize = 50;
    let sentCount = 0;
    const failures = [];

    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      try {
        await sendCustomPlaintextEmail({
          to: toAddress,
          bcc: batch,
          subject: value.subject,
          text: value.message
        });
        sentCount += batch.length;
      } catch (batchError) {
        for (const email of batch) {
          try {
            await sendCustomPlaintextEmail({
              to: email,
              subject: value.subject,
              text: value.message
            });
            sentCount += 1;
          } catch (emailError) {
            failures.push({
              email,
              error: emailError?.message || String(emailError)
            });
          }
        }
      }
    }

    logger.info('ADMIN', 'Top10 bulk email sent', {
      adminId: req.user?.id,
      recipientCount: recipients.length,
      invalidCount: invalid.length,
      sentCount,
      failedCount: failures.length
    });

    res.json({
      success: true,
      recipient_count: recipients.length,
      invalid_count: invalid.length,
      sent_count: sentCount,
      failed_count: failures.length,
      failures: failures.slice(0, 25)
    });
  } catch (error) {
    logger.error('API_ERROR', 'Error sending Top 10 bulk email (admin)', error);
    res.status(500).json({
      error: 'Failed to send bulk email',
      message: 'An error occurred while sending the bulk email',
      type: 'server_error'
    });
  }
});

// GET /api/v1/admin/top10/:id - Get Top 10 details
router.get('/admin/:id', adminAuthMiddleware, async (req, res) => {
  try {
    const schema = Joi.object({
      id: Joi.number().integer().positive().required()
    });

    const { error, value } = schema.validate({ id: parseInt(req.params.id) });
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        message: error.details[0].message,
        type: 'validation_error'
      });
    }

    const db = getDatabase();
    const top10 = db.prepare(`
      SELECT
        t.*, u.display_name, u.email, u.avatar_url, u.bio
      FROM top10_playlists t
      JOIN users u ON t.user_id = u.id
      WHERE t.id = ?
    `).get(value.id);

    if (!top10) {
      return res.status(404).json({
        error: 'Top 10 not found',
        message: 'The specified Top 10 does not exist',
        type: 'top10_not_found'
      });
    }

    top10.tracks = parseTracks(top10.tracks);

    res.json({
      success: true,
      top10: top10
    });

  } catch (error) {
    logger.error('API_ERROR', 'Error fetching Top 10 (admin)', error);
    res.status(500).json({
      error: 'Failed to fetch Top 10',
      message: 'An error occurred while retrieving the Top 10',
      type: 'server_error'
    });
  }
});

// PUT /api/v1/admin/top10/:id/feature - Feature/unfeature on homepage
router.put('/admin/:id/feature', adminAuthMiddleware, async (req, res) => {
  try {
    const paramsSchema = Joi.object({
      id: Joi.number().integer().positive().required()
    });

    const { error: paramsError, value: paramsValue } = paramsSchema.validate({ id: parseInt(req.params.id) });
    if (paramsError) {
      return res.status(400).json({
        error: 'Validation failed',
        message: paramsError.details[0].message,
        type: 'validation_error'
      });
    }

    const bodySchema = Joi.object({
      featured: Joi.number().integer().valid(0, 1).required()
    });

    const { error: bodyError, value: bodyValue } = bodySchema.validate(req.body);
    if (bodyError) {
      return res.status(400).json({
        error: 'Validation failed',
        message: bodyError.details[0].message,
        type: 'validation_error'
      });
    }

    const db = getDatabase();
    const top10 = db.prepare('SELECT * FROM top10_playlists WHERE id = ?').get(paramsValue.id);

    if (!top10) {
      return res.status(404).json({
        error: 'Top 10 not found',
        message: 'The specified Top 10 does not exist',
        type: 'top10_not_found'
      });
    }

    if (bodyValue.featured === 1) {
      if (!top10.is_published || !top10.slug) {
        return res.status(400).json({
          error: 'Top 10 not published',
          message: 'Publish this Top 10 before featuring it on the landing page',
          type: 'not_published'
        });
      }

      const user = db.prepare('SELECT display_name FROM users WHERE id = ?').get(top10.user_id);
      const displayName = user?.display_name || 'Anonymous';
      const tracks = parseTracks(top10.tracks);
      const image = resolveTop10Artwork(top10, tracks);
      const artistTag = resolveArtistCuratedTag(db);
      const linkUrl = `/top10/${top10.slug}`;
      const title = top10.title || 'Top 10 of 2025';
      const subtitle = displayName;

      const existingLink = db.prepare(`
        SELECT id, priority
        FROM landing_page_links
        WHERE url = ?
        LIMIT 1
      `).get(linkUrl);

      const priority = existingLink?.priority ?? 0;

      if (existingLink?.id) {
        db.prepare(`
          UPDATE landing_page_links
          SET title = ?, subtitle = ?, url = ?, image = ?, tags = ?,
              content_tag = ?, content_tag_color = ?, published = ?, priority = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          title,
          subtitle,
          linkUrl,
          image,
          '',
          artistTag.text,
          artistTag.color,
          1,
          priority,
          existingLink.id
        );
      } else {
        db.prepare(`
          INSERT INTO landing_page_links (
            title, subtitle, url, image, tags, content_tag, content_tag_color, published, priority
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          title,
          subtitle,
          linkUrl,
          image,
          '',
          artistTag.text,
          artistTag.color,
          1,
          priority
        );
      }
    }

    db.prepare(`
      UPDATE top10_playlists
      SET featured = ?
      WHERE id = ?
    `).run(bodyValue.featured, paramsValue.id);

    if (bodyValue.featured === 0 && top10.slug) {
      const linkUrl = `/top10/${top10.slug}`;
      db.prepare(`
        UPDATE landing_page_links
        SET published = 0,
            updated_at = CURRENT_TIMESTAMP
        WHERE url = ?
      `).run(linkUrl);
    }

    const updated = db.prepare('SELECT * FROM top10_playlists WHERE id = ?').get(paramsValue.id);
    updated.tracks = parseTracks(updated.tracks);

    logger.info('ADMIN', 'Top 10 feature status updated', {
      adminId: req.user?.id,
      top10Id: paramsValue.id,
      featured: bodyValue.featured
    });

    res.json({
      success: true,
      top10: updated
    });

  } catch (error) {
    logger.error('API_ERROR', 'Error updating feature status', error);
    res.status(500).json({
      error: 'Failed to update feature status',
      message: 'An error occurred while updating the feature status',
      type: 'server_error'
    });
  }
});

// DELETE /api/v1/admin/top10/:id - Delete Top 10 (admin)
// Query params:
//   purgeUser=true - Also delete the associated user (allows email re-signup)
router.delete('/admin/:id', adminAuthMiddleware, async (req, res) => {
  try {
    const schema = Joi.object({
      id: Joi.number().integer().positive().required(),
      purgeUser: Joi.boolean().default(false)
    });

    const { error, value } = schema.validate({
      id: parseInt(req.params.id),
      purgeUser: req.query.purgeUser === 'true'
    });
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        message: error.details[0].message,
        type: 'validation_error'
      });
    }

    const db = getDatabase();
    const top10 = db.prepare('SELECT * FROM top10_playlists WHERE id = ?').get(value.id);

    if (!top10) {
      return res.status(404).json({
        error: 'Top 10 not found',
        message: 'The specified Top 10 does not exist',
        type: 'top10_not_found'
      });
    }

    // Get user info before deletion
    const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(top10.user_id);
    let userPurged = false;

    // Clear user's top10_playlist_id first (foreign key constraint)
    db.prepare(`
      UPDATE users
      SET top10_playlist_id = NULL
      WHERE top10_playlist_id = ?
    `).run(value.id);

    if (top10.slug) {
      const linkUrl = `/top10/${top10.slug}`;
      db.prepare(`
        UPDATE landing_page_links
        SET published = 0,
            updated_at = CURRENT_TIMESTAMP
        WHERE url = ?
      `).run(linkUrl);
    }

    // Delete Top 10
    db.prepare('DELETE FROM top10_playlists WHERE id = ?').run(value.id);

    // Optionally purge the user entirely (for testing/fresh signups)
    if (value.purgeUser && user) {
      // Safety check: don't delete if user is a curator/admin
      const isCurator = db.prepare(`
        SELECT id FROM admin_users
        WHERE lower(username) = lower(?)
      `).get(user.email);

      if (isCurator) {
        logger.warn('ADMIN', 'Skipping user purge - user is a curator', {
          adminId: req.admin.id,
          userId: user.id,
          email: user.email
        });
      } else {
        // Delete unused referral codes for this email (not cascaded)
        db.prepare(`
          DELETE FROM curator_referrals
          WHERE lower(email) = lower(?) AND status = 'unused'
        `).run(user.email);

        // Delete user (CASCADE will clean up email_codes, view_tracking, etc.)
        db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
        userPurged = true;

        logger.info('ADMIN', 'User purged for fresh signup', {
          adminId: req.admin.id,
          userId: user.id,
          email: user.email
        });
      }
    }

    logger.info('ADMIN', 'Top 10 deleted', {
      adminId: req.user?.id,
      top10Id: value.id,
      userId: top10.user_id,
      userPurged
    });

    res.json({
      success: true,
      message: userPurged
        ? 'Top 10 and user deleted successfully (email can now re-signup)'
        : 'Top 10 deleted successfully',
      userPurged
    });

  } catch (error) {
    logger.error('API_ERROR', 'Error deleting Top 10 (admin)', error);
    res.status(500).json({
      error: 'Failed to delete Top 10',
      message: 'An error occurred while deleting the Top 10',
      type: 'server_error'
    });
  }
});

// POST /api/v1/admin/top10/:id/export - Manually trigger export
router.post('/admin/:id/export', adminAuthMiddleware, async (req, res) => {
  try {
    const paramsSchema = Joi.object({
      id: Joi.number().integer().positive().required()
    });

    const { error: paramsError, value: paramsValue } = paramsSchema.validate({ id: parseInt(req.params.id) });
    if (paramsError) {
      return res.status(400).json({
        error: 'Validation failed',
        message: paramsError.details[0].message,
        type: 'validation_error'
      });
    }

    const bodySchema = Joi.object({
      platforms: Joi.array().items(Joi.string().valid('spotify', 'apple', 'tidal')).min(1).max(3).required()
    });

    const { error: bodyError, value: bodyValue } = bodySchema.validate(req.body);
    if (bodyError) {
      return res.status(400).json({
        error: 'Validation failed',
        message: bodyError.details[0].message,
        type: 'validation_error'
      });
    }

    logger.info('ADMIN', 'Manual export triggered', {
      adminId: req.user?.id,
      top10Id: paramsValue.id,
      platforms: bodyValue.platforms
    });

    // Perform export using top10ExportService (admin override - no rate limit)
    try {
      const exportResult = await exportTop10(paramsValue.id, bodyValue.platforms);

      // Return detailed results
      const successfulExports = Object.entries(exportResult.results)
        .filter(([_, result]) => result.success)
        .map(([platform, result]) => ({
          platform,
          url: result.url,
          trackCount: result.trackCount
        }));

      const failedExports = Object.entries(exportResult.results)
        .filter(([_, result]) => !result.success)
        .map(([platform, result]) => ({
          platform,
          error: result.error
        }));

      if (exportResult.allSucceeded) {
        return res.json({
          success: true,
          message: `Successfully exported to ${successfulExports.length} platform${successfulExports.length > 1 ? 's' : ''}`,
          exports: successfulExports
        });
      } else if (exportResult.anySucceeded) {
        return res.json({
          success: true,
          partial: true,
          message: `Exported to ${successfulExports.length} of ${bodyValue.platforms.length} platform${bodyValue.platforms.length > 1 ? 's' : ''}`,
          exports: successfulExports,
          failures: failedExports
        });
      } else {
        return res.status(500).json({
          success: false,
          error: 'All exports failed',
          message: 'Failed to export to any platform',
          failures: failedExports,
          type: 'export_failed'
        });
      }

    } catch (exportError) {
      logger.error('ADMIN_EXPORT', 'Admin export failed', {
        top10Id: paramsValue.id,
        error: exportError.message
      });

      return res.status(500).json({
        success: false,
        error: 'Export failed',
        message: exportError.message || 'An error occurred during export',
        type: 'export_error'
      });
    }

  } catch (error) {
    logger.error('API_ERROR', 'Error triggering export (admin)', error);
    res.status(500).json({
      error: 'Failed to trigger export',
      message: 'An error occurred while triggering the export',
      type: 'server_error'
    });
  }
});

// GET /api/v1/top10/purgatory-status - Check if user is in "purgatory" state
// (published Top 10 but not yet a full curator)
router.get('/purgatory-status', authMiddleware, async (req, res) => {
  try {
    const userRole = req.user.role;

    // Only regular 'user' role can be in purgatory (curators/admins are already converted)
    if (userRole !== 'user') {
      return res.json({ isPurgatory: false });
    }

    const db = getDatabase();
    const userId = req.user.id;

    // Check if user has a published Top 10
    const publishedTop10 = db.prepare(`
      SELECT id FROM top10_playlists
      WHERE user_id = ? AND is_published = 1
      LIMIT 1
    `).get(userId);

    if (!publishedTop10) {
      return res.json({ isPurgatory: false });
    }

    // Check if user has an unused referral code
    const user = db.prepare('SELECT email FROM users WHERE id = ?').get(userId);
    const referral = db.prepare(`
      SELECT code, status FROM curator_referrals
      WHERE lower(email) = lower(?) AND status = 'unused'
      ORDER BY created_at DESC LIMIT 1
    `).get(user?.email);

    return res.json({
      isPurgatory: true,
      hasReferralCode: Boolean(referral?.code)
    });

  } catch (error) {
    logger.error('API_ERROR', 'Error checking purgatory status', error);
    res.status(500).json({
      error: 'Failed to check status',
      message: 'An error occurred while checking your status',
      type: 'server_error'
    });
  }
});

// Export router
export default router;
