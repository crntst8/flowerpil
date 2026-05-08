import express from 'express';
import fs from 'fs';
import path from 'path';
import Joi from 'joi';
import { authMiddleware, requireAdmin, requireSuperAdmin } from '../../middleware/auth.js';
import { getDatabase, getQueries } from '../../database/db.js';
import { hashPassword, validatePassword } from '../../utils/authUtils.js';
import logger from '../../utils/logger.js';

const router = express.Router();

router.use(authMiddleware, requireAdmin);

const curatorListSchema = Joi.object({
  search: Joi.string().allow('').optional(),
  type: Joi.string().max(120).optional(),
  verification: Joi.string().max(64).optional(),
  limit: Joi.number().integer().min(1).max(200).default(50),
  offset: Joi.number().integer().min(0).max(5000).default(0),
  sort: Joi.string().valid('name', 'playlists', 'last_login', 'created_at').default('name'),
  order: Joi.string().valid('asc', 'desc').default('asc')
});

const playlistListSchema = Joi.object({
  search: Joi.string().allow('').optional(),
  curator_id: Joi.number().integer().positive().optional(),
  published: Joi.boolean().truthy('true').truthy('1').falsy('false').falsy('0').optional(),
  limit: Joi.number().integer().min(1).max(200).default(50),
  offset: Joi.number().integer().min(0).max(5000).default(0),
  sort: Joi.string().valid('publish_date', 'created_at', 'title', 'tracks', 'flags').default('publish_date'),
  order: Joi.string().valid('asc', 'desc').default('desc')
});

const STAT_QUERIES = {
  curators: 'SELECT COUNT(*) AS value FROM curators',
  playlists: 'SELECT COUNT(*) AS value FROM playlists',
  publishedPlaylists: 'SELECT COUNT(*) AS value FROM playlists WHERE published = 1',
  tracks: 'SELECT COUNT(*) AS value FROM tracks',
  bios: 'SELECT COUNT(*) AS value FROM bio_profiles',
  pendingExports: `SELECT COUNT(*) AS value FROM export_requests WHERE status IN ('pending','in_progress','auth_required')`
};

const PLACEHOLDER_COLORS_PATH = path.join(process.cwd(), 'public', 'placeholder', 'colors.json');
let placeholderPaletteCache = null;

const loadPlaceholderPalette = () => {
  if (placeholderPaletteCache) return placeholderPaletteCache;
  try {
    const raw = fs.readFileSync(PLACEHOLDER_COLORS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const colors = Array.isArray(parsed?.colors) ? parsed.colors : [];
    placeholderPaletteCache = colors
      .filter(color => Number.isFinite(Number(color?.index)))
      .sort((a, b) => Number(a.index) - Number(b.index));
  } catch (error) {
    logger.error('ADMIN', 'Failed to load placeholder colors', { error: error?.message });
    placeholderPaletteCache = [];
  }
  return placeholderPaletteCache;
};

const hashString = (value) => {
  let hash = 0;
  const str = String(value ?? '');
  for (let i = 0; i < str.length; i += 1) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
};

const getDefaultPaletteIndex = (seed, palette) => {
  if (!palette.length) return null;
  const hash = hashString(seed);
  const pick = hash % palette.length;
  return palette[pick]?.index ?? null;
};

const getNextPaletteIndex = (currentIndex, palette) => {
  if (!palette.length) return null;
  const index = Number(currentIndex);
  const currentPosition = palette.findIndex(color => Number(color.index) === index);
  if (currentPosition === -1) return palette[0]?.index ?? null;
  return palette[(currentPosition + 1) % palette.length]?.index ?? null;
};

const parseJsonField = (value, fallback) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  if (typeof value === 'object') {
    if (Array.isArray(fallback)) {
      return Array.isArray(value) ? value : fallback;
    }
    return value;
  }
  if (typeof value === 'string') {
    try {
      let parsed = JSON.parse(value);
      if (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed);
        } catch {
          return fallback;
        }
      }
      if (Array.isArray(fallback)) {
        return Array.isArray(parsed) ? parsed : fallback;
      }
      return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
};

const normalizeFlag = (value, defaultValue = true) => {
  if (value === undefined || value === null) return defaultValue;
  if (value === true || value === false) return value;
  if (value === 1 || value === '1') return true;
  if (value === 0 || value === '0') return false;
  return Boolean(value);
};

router.get('/stats', (req, res) => {
  try {
    const db = getDatabase();
    const stats = {};
    for (const [key, sql] of Object.entries(STAT_QUERIES)) {
      try {
        const row = db.prepare(sql).get();
        stats[key] = row?.value ?? 0;
      } catch (error) {
        console.error(`[ADMIN_DASHBOARD_STATS] Failed to compute ${key}:`, error);
        stats[key] = null;
      }
    }

    return res.json({
      success: true,
      data: {
        ...stats,
        generated_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[ADMIN_DASHBOARD_STATS] Unexpected error:', error);
    return res.status(500).json({ error: 'Failed to load dashboard stats' });
  }
});

router.post('/logout-all', (req, res) => {
  try {
    const db = getDatabase();
    const result = db.prepare(`
      UPDATE admin_users
      SET locked_until = datetime('now', '+1 second')
      WHERE is_active = 1
    `).run();

    return res.json({
      success: true,
      data: {
        affected_accounts: result.changes || 0,
        locked_until: new Date(Date.now() + 1000).toISOString()
      }
    });
  } catch (error) {
    console.error('[ADMIN_DASHBOARD_LOGOUT_ALL] Failed to invalidate sessions:', error);
    return res.status(500).json({ error: 'Failed to logout active admins' });
  }
});

router.get('/curators', (req, res) => {
  const { value, error } = curatorListSchema.validate(req.query, { abortEarly: false });
  if (error) {
    return res.status(400).json({ error: error.details[0]?.message || 'Invalid parameters' });
  }

  const { search, type, verification, limit, offset, sort, order } = value;

  try {
    const db = getDatabase();
    const params = [];
    const whereClauses = [];

    if (search && search.trim()) {
      whereClauses.push(`
        (
          LOWER(c.name) LIKE ?
          OR LOWER(IFNULL(c.bio_short, '')) LIKE ?
          OR LOWER(IFNULL(c.location, '')) LIKE ?
        )
      `);
      const term = `%${search.trim().toLowerCase()}%`;
      params.push(term, term, term);
    }

    if (type) {
      whereClauses.push('(c.type = ? OR c.profile_type = ?)');
      params.push(type, type);
    }

    if (verification) {
      whereClauses.push('c.verification_status = ?');
      params.push(verification);
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const sortColumn = (() => {
      switch (sort) {
        case 'playlists':
          return 'published_playlists';
        case 'last_login':
          return 'last_login';
        case 'created_at':
          return 'c.created_at';
        case 'name':
        default:
          return 'LOWER(c.name)';
      }
    })();

    const sql = `
      WITH published_counts AS (
        SELECT curator_id, COUNT(*) AS published_playlists
        FROM playlists
        WHERE published = 1
        GROUP BY curator_id
      ),
      bio_counts AS (
        SELECT curator_id, COUNT(*) AS bio_count
        FROM bio_profiles
        GROUP BY curator_id
      ),
      admin_activity AS (
        SELECT curator_id, MAX(last_login) AS last_login
        FROM admin_users
        WHERE curator_id IS NOT NULL
        GROUP BY curator_id
      )
      SELECT
        c.id,
        c.name,
        c.type,
        c.profile_type,
        c.tester,
        c.spotify_oauth_approved,
        c.youtube_oauth_approved,
        c.bio_short,
        c.location,
        c.contact_email,
        c.fallback_flower_color_index,
        c.verification_status,
        c.profile_visibility,
        c.created_at,
        COALESCE(published_counts.published_playlists, 0) AS published_playlists,
        COALESCE(bio_counts.bio_count, 0) AS bio_count,
        admin_activity.last_login
      FROM curators c
      LEFT JOIN published_counts ON published_counts.curator_id = c.id
      LEFT JOIN bio_counts ON bio_counts.curator_id = c.id
      LEFT JOIN admin_activity ON admin_activity.curator_id = c.id
      ${whereSql}
      ORDER BY ${sortColumn} ${order.toUpperCase()}
      LIMIT ? OFFSET ?
    `;

    params.push(limit, offset);
    const rows = db.prepare(sql).all(...params);
    const curatorIds = rows.map((row) => row.id);

    let accountsByCurator = new Map();
    if (curatorIds.length) {
      const placeholders = curatorIds.map(() => '?').join(',');
      const accountRows = db.prepare(`
        SELECT id, username, role, is_active, last_login, created_at, curator_id
        FROM admin_users
        WHERE curator_id IN (${placeholders})
      `).all(...curatorIds);
      accountsByCurator = accountRows.reduce((map, account) => {
        const list = map.get(account.curator_id) || [];
        list.push({
          id: account.id,
          username: account.username,
          role: account.role,
          is_active: Boolean(account.is_active),
          last_login: account.last_login,
          created_at: account.created_at
        });
        map.set(account.curator_id, list);
        return map;
      }, new Map());
    }

    const result = rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      profile_type: row.profile_type,
      bio_short: row.bio_short,
      location: row.location,
      contact_email: row.contact_email,
      fallback_flower_color_index: row.fallback_flower_color_index,
      verification_status: row.verification_status,
      profile_visibility: row.profile_visibility,
      published_playlists: row.published_playlists,
      bio_count: row.bio_count,
      last_login: row.last_login,
      created_at: row.created_at,
      tester: Boolean(row.tester),
      spotify_oauth_approved: Boolean(row.spotify_oauth_approved),
      youtube_oauth_approved: Boolean(row.youtube_oauth_approved),
      admin_accounts: accountsByCurator.get(row.id) || []
    }));

    return res.json({ success: true, data: result });
  } catch (err) {
    console.error('[ADMIN_DASHBOARD_CURATORS] Failed to load curator summary:', err);
    return res.status(500).json({ error: 'Failed to load curators' });
  }
});

/**
 * GET /api/v1/admin/dashboard/curators/dormant
 * Get curators who have draft playlists but zero published playlists
 */
router.get('/curators/dormant', (req, res) => {
  try {
    const db = getDatabase();

    const sql = `
      WITH curator_stats AS (
        SELECT
          curator_id,
          COUNT(*) AS total_playlists,
          SUM(CASE WHEN published = 1 THEN 1 ELSE 0 END) AS published_count,
          SUM(CASE WHEN published = 0 THEN 1 ELSE 0 END) AS draft_count,
          MAX(updated_at) AS last_playlist_activity
        FROM playlists
        WHERE curator_id IS NOT NULL
        GROUP BY curator_id
      ),
      admin_activity AS (
        SELECT curator_id, MAX(last_login) AS last_login
        FROM admin_users
        WHERE curator_id IS NOT NULL
        GROUP BY curator_id
      )
      SELECT
        c.id,
        c.name,
        c.contact_email,
        c.created_at,
        cs.draft_count,
        COALESCE(
          MAX(cs.last_playlist_activity, aa.last_login, c.updated_at),
          c.created_at
        ) AS last_activity,
        GROUP_CONCAT(p.title, '||') AS draft_titles
      FROM curators c
      INNER JOIN curator_stats cs ON cs.curator_id = c.id
      LEFT JOIN admin_activity aa ON aa.curator_id = c.id
      LEFT JOIN playlists p ON p.curator_id = c.id AND p.published = 0
      WHERE cs.published_count = 0 AND cs.draft_count > 0
      GROUP BY c.id
      ORDER BY cs.draft_count DESC, c.created_at ASC
    `;

    const rows = db.prepare(sql).all();

    const curators = rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.contact_email,
      createdAt: row.created_at,
      draftCount: row.draft_count,
      lastActivity: row.last_activity,
      draftTitles: row.draft_titles ? row.draft_titles.split('||').filter(Boolean) : []
    }));

    return res.json({
      success: true,
      data: { curators }
    });
  } catch (error) {
    console.error('[ADMIN_DASHBOARD_DORMANT_CURATORS] Failed:', error);
    return res.status(500).json({ error: 'Failed to load dormant curators' });
  }
});

/**
 * POST /api/v1/admin/dashboard/curators/dormant/send-email
 * Send email to dormant curators
 */
router.post('/curators/dormant/send-email', async (req, res) => {
  try {
    const { curatorIds, subject, body } = req.body;

    if (!subject?.trim()) {
      return res.status(400).json({ error: 'Subject is required' });
    }

    if (!body?.trim()) {
      return res.status(400).json({ error: 'Email body is required' });
    }

    if (!Array.isArray(curatorIds) || curatorIds.length === 0) {
      return res.status(400).json({ error: 'At least one curator must be selected' });
    }

    const db = getDatabase();
    const { sendAdminEmail } = await import('../../utils/emailService.js');

    // Get curator emails
    const placeholders = curatorIds.map(() => '?').join(',');
    const curators = db.prepare(`
      SELECT id, name, contact_email
      FROM curators
      WHERE id IN (${placeholders}) AND contact_email IS NOT NULL AND contact_email != ''
    `).all(...curatorIds);

    if (curators.length === 0) {
      return res.status(400).json({ error: 'No valid email addresses found for selected curators' });
    }

    let successCount = 0;
    let failCount = 0;

    for (const curator of curators) {
      try {
        await sendAdminEmail({
          to: curator.contact_email,
          subject: subject.trim(),
          body: body.trim()
        });
        successCount++;
      } catch (emailError) {
        console.error(`[ADMIN_DORMANT_EMAIL] Failed to send to ${curator.contact_email}:`, emailError.message);
        failCount++;
      }
    }

    logger.info('[ADMIN] Sent dormant curator emails', {
      adminUserId: req.user.id,
      totalCurators: curatorIds.length,
      successCount,
      failCount
    });

    return res.json({
      success: true,
      data: {
        sent: successCount,
        failed: failCount,
        total: curators.length
      }
    });
  } catch (error) {
    console.error('[ADMIN_DORMANT_EMAIL] Failed:', error);
    return res.status(500).json({ error: 'Failed to send emails' });
  }
});

router.get('/curators/:id', (req, res) => {
  const curatorId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(curatorId) || curatorId <= 0) {
    return res.status(400).json({ error: 'Invalid curator id' });
  }

  try {
    const db = getDatabase();
    const curator = db.prepare(`
      SELECT
        c.id,
        c.name,
        c.type,
        c.profile_type,
        c.bio,
        c.bio_short,
        c.profile_image,
        c.location,
        c.website_url,
        c.contact_email,
        c.spotify_url,
        c.apple_url,
        c.tidal_url,
        c.bandcamp_url,
        c.social_links,
        c.external_links,
        c.fallback_flower_color_index,
        c.tester,
        c.verification_status,
        c.profile_visibility,
        c.upcoming_releases_enabled,
        c.upcoming_shows_enabled,
        c.dsp_implementation_status,
        c.custom_fields,
        c.created_at,
        c.updated_at
      FROM curators c
      WHERE c.id = ?
    `).get(curatorId);

    if (!curator) {
      return res.status(404).json({ error: 'Curator not found' });
    }

    const adminAccounts = db.prepare(`
      SELECT
        id,
        username,
        role,
        is_active,
        last_login,
        created_at
      FROM admin_users
      WHERE curator_id = ?
      ORDER BY created_at ASC
    `).all(curatorId);

    const playlists = db.prepare(`
      SELECT
        id,
        title,
        publish_date,
        p.published_at,
        created_at,
        updated_at,
        published,
        COALESCE(track_counts.track_count, 0) AS track_count
      FROM playlists p
      LEFT JOIN (
        SELECT playlist_id, COUNT(*) AS track_count
        FROM tracks
        GROUP BY playlist_id
      ) AS track_counts ON track_counts.playlist_id = p.id
      WHERE p.curator_id = ?
      ORDER BY 
        COALESCE(
          p.published_at,
          CASE WHEN p.publish_date IS NOT NULL AND p.publish_date != '' THEN datetime(p.publish_date || ' 00:00:00') END,
          p.created_at
        ) DESC,
        p.id DESC
      LIMIT 200
    `).all(curatorId);

    const bios = db.prepare(`
      SELECT
        id,
        handle,
        is_published,
        updated_at,
        created_at,
        last_handle_change_at
      FROM bio_profiles
      WHERE curator_id = ?
      ORDER BY updated_at DESC, created_at DESC
    `).all(curatorId);

    const normalizedCurator = {
      ...curator,
      tester: Boolean(curator.tester),
      upcoming_releases_enabled: normalizeFlag(curator.upcoming_releases_enabled, true),
      upcoming_shows_enabled: normalizeFlag(curator.upcoming_shows_enabled, true),
      social_links: parseJsonField(curator.social_links, []),
      external_links: parseJsonField(curator.external_links, []),
      custom_fields: parseJsonField(curator.custom_fields, {})
    };

    return res.json({
      success: true,
      data: {
        curator: normalizedCurator,
        admin_accounts: adminAccounts,
        playlists,
        bios
      }
    });
  } catch (error) {
    console.error('[ADMIN_DASHBOARD_CURATOR_DETAILS] Failed:', error);
    return res.status(500).json({ error: 'Failed to load curator details' });
  }
});

router.post('/curators/:id/fallback-flower-color/rotate', (req, res) => {
  const curatorId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(curatorId) || curatorId <= 0) {
    return res.status(400).json({ error: 'Invalid curator id' });
  }

  try {
    const db = getDatabase();
    const curator = db.prepare(`
      SELECT id, fallback_flower_color_index
      FROM curators
      WHERE id = ?
    `).get(curatorId);

    if (!curator) {
      return res.status(404).json({ error: 'Curator not found' });
    }

    const palette = loadPlaceholderPalette();
    if (!palette.length) {
      return res.status(500).json({ error: 'Placeholder palette unavailable' });
    }

    const currentIndex = Number.isFinite(Number(curator.fallback_flower_color_index))
      ? Number(curator.fallback_flower_color_index)
      : getDefaultPaletteIndex(curator.id, palette);
    const nextIndex = getNextPaletteIndex(currentIndex, palette);

    if (!Number.isFinite(Number(nextIndex))) {
      return res.status(500).json({ error: 'Failed to resolve next palette index' });
    }

    db.prepare(`
      UPDATE curators
      SET fallback_flower_color_index = ?
      WHERE id = ?
    `).run(nextIndex, curatorId);

    return res.json({
      success: true,
      data: {
        fallback_flower_color_index: Number(nextIndex)
      }
    });
  } catch (error) {
    logger.error('ADMIN', 'Failed to rotate curator fallback flower color', {
      curatorId,
      error: error?.message
    });
    return res.status(500).json({ error: 'Failed to rotate fallback flower color' });
  }
});

router.post('/curators/:id/force-logout', (req, res) => {
  const curatorId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(curatorId) || curatorId <= 0) {
    return res.status(400).json({ error: 'Invalid curator id' });
  }

  try {
    const db = getDatabase();
    const result = db.prepare(`
      UPDATE admin_users
      SET locked_until = datetime('now', '+1 second')
      WHERE curator_id = ?
    `).run(curatorId);

    if (!result.changes) {
      return res.status(404).json({ error: 'No admin accounts found for curator' });
    }

    return res.json({
      success: true,
      data: {
        affected_accounts: result.changes,
        locked_until: new Date(Date.now() + 1000).toISOString()
      }
    });
  } catch (error) {
    console.error('[ADMIN_DASHBOARD_CURATOR_FORCE_LOGOUT] Failed:', error);
    return res.status(500).json({ error: 'Failed to force logout accounts' });
  }
});

router.post('/curators/:id/password', async (req, res) => {
  const curatorId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(curatorId) || curatorId <= 0) {
    return res.status(400).json({ error: 'Invalid curator id' });
  }

  const { password } = req.body || {};
  const validation = validatePassword(password);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.errors.join('. ') });
  }

  try {
    const newHash = await hashPassword(password);
    const db = getDatabase();
    const result = db.prepare(`
      UPDATE admin_users
      SET password_hash = ?, failed_login_attempts = 0, locked_until = NULL
      WHERE curator_id = ?
    `).run(newHash, curatorId);

    if (!result.changes) {
      return res.status(404).json({ error: 'No admin accounts found for curator' });
    }

    return res.json({
      success: true,
      data: {
        affected_accounts: result.changes
      }
    });
  } catch (error) {
    console.error('[ADMIN_DASHBOARD_CURATOR_RESET_PASSWORD] Failed:', error);
    return res.status(500).json({ error: 'Failed to reset password' });
  }
});

router.get('/playlists', (req, res) => {
  const { value, error } = playlistListSchema.validate(req.query, { abortEarly: false });
  if (error) {
    return res.status(400).json({ error: error.details[0]?.message || 'Invalid parameters' });
  }

  const { search, curator_id: curatorId, published, limit, offset, sort, order } = value;

  try {
    const db = getDatabase();
    const params = [];
    const where = [];

    if (typeof curatorId === 'number') {
      where.push('p.curator_id = ?');
      params.push(curatorId);
    }

    if (typeof published === 'boolean') {
      where.push('p.published = ?');
      params.push(published ? 1 : 0);
    }

    if (search && search.trim()) {
      const term = `%${search.trim().toLowerCase()}%`;
      where.push('(LOWER(p.title) LIKE ? OR LOWER(COALESCE(c.name, \'\')) LIKE ?)');
      params.push(term, term);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const sortColumn = (() => {
      switch (sort) {
        case 'created_at':
          return 'p.created_at';
        case 'title':
          return 'LOWER(p.title)';
        case 'tracks':
          return 'track_counts.track_count';
        case 'flags':
          return 'flag_counts.flag_count';
        case 'publish_date':
        default:
          return 'p.publish_date';
      }
    })();

    const sql = `
      WITH track_counts AS (
        SELECT playlist_id, COUNT(*) AS track_count
        FROM tracks
        GROUP BY playlist_id
      ),
      flag_counts AS (
        SELECT playlist_id, COUNT(*) AS flag_count
        FROM playlist_flag_assignments
        GROUP BY playlist_id
      ),
      content_flags AS (
        SELECT playlist_id, COUNT(*) AS content_flag_count
        FROM user_content_flags
        WHERE playlist_id IS NOT NULL AND status != 'resolved'
        GROUP BY playlist_id
      ),
      latest_exports AS (
        SELECT
          er1.playlist_id,
          er1.status AS export_status,
          er1.destinations AS export_destinations,
          er1.updated_at AS export_updated_at
        FROM export_requests er1
        WHERE er1.created_at = (
          SELECT MAX(er2.created_at)
          FROM export_requests er2
          WHERE er2.playlist_id = er1.playlist_id
        )
      )
      SELECT
        p.id,
        p.title,
        p.publish_date,
        p.created_at,
        p.updated_at,
        p.published,
        p.curator_id,
        COALESCE(c.name, p.curator_name) AS curator_name,
        c.type AS curator_type,
        p.image,
        p.spotify_url,
        p.apple_url,
        p.tidal_url,
        COALESCE(track_counts.track_count, 0) AS track_count,
        COALESCE(flag_counts.flag_count, 0) AS flag_count,
        COALESCE(content_flags.content_flag_count, 0) AS content_flag_count,
        latest_exports.export_status,
        latest_exports.export_destinations,
        latest_exports.export_updated_at
      FROM playlists p
      LEFT JOIN curators c ON p.curator_id = c.id
      LEFT JOIN track_counts ON track_counts.playlist_id = p.id
      LEFT JOIN flag_counts ON flag_counts.playlist_id = p.id
      LEFT JOIN content_flags ON content_flags.playlist_id = p.id
      LEFT JOIN latest_exports ON latest_exports.playlist_id = p.id
      ${whereSql}
      ORDER BY ${sortColumn} ${order.toUpperCase()}, p.id DESC
      LIMIT ? OFFSET ?
    `;

    params.push(limit, offset);
    const rows = db.prepare(sql).all(...params);

    const result = rows.map((row) => ({
      id: row.id,
      title: row.title,
      publish_date: row.publish_date,
      created_at: row.created_at,
      updated_at: row.updated_at,
      published: Boolean(row.published),
      curator_id: row.curator_id,
      curator_name: row.curator_name,
      curator_type: row.curator_type,
      track_count: row.track_count,
      flag_count: row.flag_count,
      content_flag_count: row.content_flag_count,
      image: row.image,
      spotify_url: row.spotify_url,
      apple_url: row.apple_url,
      tidal_url: row.tidal_url,
      export_status: row.export_status || null,
      export_destinations: row.export_destinations || null,
      export_updated_at: row.export_updated_at || null
    }));

    return res.json({ success: true, data: result });
  } catch (err) {
    console.error('[ADMIN_DASHBOARD_PLAYLISTS] Failed to load playlist summary:', err);
    return res.status(500).json({ error: 'Failed to load playlists' });
  }
});

const biosListSchema = Joi.object({
  search: Joi.string().allow('').optional(),
  limit: Joi.number().integer().min(1).max(200).default(50)
});

router.get('/bios', (req, res) => {
  const { value, error } = biosListSchema.validate(req.query, { abortEarly: false });
  if (error) {
    return res.status(400).json({ error: error.details[0]?.message || 'Invalid parameters' });
  }

  const { search, limit } = value;

  try {
    const db = getDatabase();
    const params = [];
    let sql = `
      SELECT
        bp.id,
        bp.handle,
        bp.curator_id,
        bp.is_published,
        bp.updated_at,
        bp.created_at,
        bp.last_handle_change_at,
        COALESCE(c.name, '') AS curator_name
      FROM bio_profiles bp
      LEFT JOIN curators c ON bp.curator_id = c.id
    `;

    if (search && search.trim()) {
      sql += ' WHERE LOWER(bp.handle) LIKE ? OR LOWER(COALESCE(c.name, "")) LIKE ?';
      const term = `%${search.trim().toLowerCase()}%`;
      params.push(term, term);
    }

    sql += ' ORDER BY bp.updated_at DESC, bp.created_at DESC LIMIT ?';
    params.push(limit);

    const rows = db.prepare(sql).all(...params);
    return res.json({
      success: true,
      data: rows
    });
  } catch (err) {
    console.error('[ADMIN_DASHBOARD_BIOS] Failed to load bios:', err);
    return res.status(500).json({ error: 'Failed to load bios' });
  }
});

router.delete('/bios/:id', (req, res) => {
  const bioId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(bioId) || bioId <= 0) {
    return res.status(400).json({ error: 'Invalid bio id' });
  }

  try {
    const db = getDatabase();
    const profile = db.prepare(`
      SELECT id, handle
      FROM bio_profiles
      WHERE id = ?
    `).get(bioId);

    if (!profile) {
      return res.status(404).json({ error: 'Bio profile not found' });
    }

    const result = db.prepare('DELETE FROM bio_profiles WHERE id = ?').run(bioId);
    if (!result.changes) {
      return res.status(500).json({ error: 'Failed to delete bio profile' });
    }

    return res.json({
      success: true,
      data: {
        id: profile.id,
        handle: profile.handle
      }
    });
  } catch (error) {
    console.error('[ADMIN_DASHBOARD_BIOS_DELETE] Failed:', error);
    return res.status(500).json({ error: 'Failed to delete bio profile' });
  }
});

// ========================================
// Spotify Imports
// ========================================

// GET /api/v1/admin/dashboard/spotify-imports - Get all Spotify import requests
router.get('/spotify-imports', (req, res) => {
  try {
    const queries = getQueries();
    const imports = queries.getAllSpotifyImports.all();

    return res.json({
      success: true,
      imports,
      count: imports.length
    });
  } catch (error) {
    logger.error('[ADMIN_ERROR] Failed to fetch Spotify imports:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch Spotify imports'
    });
  }
});

// PUT /api/v1/admin/dashboard/spotify-imports/:id/status - Update Spotify import status
router.put('/spotify-imports/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const validStatuses = ['not_added', 'added'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be "not_added" or "added"'
      });
    }

    const queries = getQueries();
    const importId = parseInt(id, 10);
    const importRow = queries.getSpotifyImportById.get(importId);

    if (!importRow) {
      return res.status(404).json({
        success: false,
        message: 'Spotify import request not found'
      });
    }

    queries.updateSpotifyImportStatus.run(status, notes || null, importId);

    // Once admin marks the request as added, unblock the curator DSP warning immediately
    if (status === 'added' && importRow.curator_id) {
      try {
        queries.updateCuratorDSPStatus.run('implemented', importRow.curator_id);
      } catch (statusError) {
        logger.warn('[ADMIN] Failed to mark curator DSP implemented after Spotify import', {
          importId,
          curatorId: importRow.curator_id,
          error: statusError.message
        });
      }
    }

    logger.info(`[ADMIN] Updated Spotify import ${id} status to ${status}`, {
      adminUserId: req.user.id,
      importId: id,
      status
    });

    return res.json({
      success: true,
      message: 'Status updated successfully'
    });
  } catch (error) {
    logger.error('[ADMIN_ERROR] Failed to update Spotify import status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update status'
    });
  }
});

export default router;
