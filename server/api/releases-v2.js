import express from 'express';
import { getDatabase } from '../database/db.js';
import logger from '../utils/logger.js';
import { apiLoggingMiddleware } from '../middleware/logging.js';
import { authMiddleware, requireAnyRole } from '../middleware/auth.js';
import { validateCSRFToken } from '../middleware/csrfProtection.js';
import { hashPassword, verifyPassword, generateToken } from '../utils/authUtils.js';

const router = express.Router();

// Apply logging middleware
router.use(apiLoggingMiddleware);

// Valid release types
const RELEASE_TYPES = ['single', 'double-single', 'EP', 'album', 'live album', 'remix', 'remaster'];

// Valid platform keys for action row
const PLATFORM_KEYS = ['spotify', 'apple_music', 'tidal', 'bandcamp', 'youtube_music', 'amazon_music', 'deezer', 'website', 'custom'];

// Valid asset types
const ASSET_TYPES = ['press_image', 'hero_image', 'clip'];

const RELEASE_PROFILE_TYPES = new Set([
  'label',
  'label-ar',
  'label-services',
  'artist',
  'band',
  'artist-manager',
  'artist-management',
  'artist-booker',
  'musician',
  'dj'
]);

const isAdminRole = (role) => role === 'admin' || role === 'super_admin';

const canManageCurator = (user, curatorId) => {
  if (!user) return false;
  if (isAdminRole(user.role)) return true;
  return user.role === 'curator' && Number(user.curator_id) === Number(curatorId);
};

const canManageRelease = (user, release) => {
  if (!user || !release) return false;
  if (isAdminRole(user.role)) return true;
  return user.role === 'curator' && Number(user.curator_id) === Number(release.curator_id);
};

const curatorHasReleaseAccess = (curator) => {
  if (!curator) return false;
  if (Number(curator.upcoming_releases_enabled) !== 1) return false;
  const profileType = curator.profile_type || curator.type;
  return RELEASE_PROFILE_TYPES.has(profileType);
};

// Utility functions
const sanitizeReleaseData = (data) => {
  return {
    curator_id: data.curator_id ? parseInt(data.curator_id, 10) : null,
    artist_name: String(data.artist_name || '').trim(),
    title: String(data.title || '').trim(),
    release_type: RELEASE_TYPES.includes(data.release_type) ? data.release_type : 'single',
    release_date: data.release_date || null,
    post_date: data.post_date || null,
    genres: data.genres ? JSON.stringify(Array.isArray(data.genres) ? data.genres : []) : null,
    description: data.description ? String(data.description).trim() : null,
    video_url: data.video_url || null,
    artwork_url: data.artwork_url || null,
    is_published: data.is_published ? 1 : 0,
    artist_bio_topline: data.artist_bio_topline || null,
    artist_bio_subtext: data.artist_bio_subtext || null,
    artist_bio_image_url: data.artist_bio_image_url || null,
    show_video: data.show_video !== false ? 1 : 0,
    show_images: data.show_images !== false ? 1 : 0,
    show_about: data.show_about !== false ? 1 : 0,
    show_shows: data.show_shows !== false ? 1 : 0,
    sort_order: Number.isFinite(Number(data.sort_order)) ? parseInt(data.sort_order, 10) : 0
  };
};

const hasOwn = (data, key) => Object.prototype.hasOwnProperty.call(data, key);

const normalizeOptionalString = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
};

const sanitizeReleaseUpdate = (data = {}) => {
  const sanitized = {};

  if (hasOwn(data, 'artist_name')) {
    sanitized.artist_name = String(data.artist_name || '').trim();
  }

  if (hasOwn(data, 'title')) {
    sanitized.title = String(data.title || '').trim();
  }

  if (hasOwn(data, 'release_type')) {
    sanitized.release_type = RELEASE_TYPES.includes(data.release_type) ? data.release_type : 'single';
  }

  if (hasOwn(data, 'release_date')) {
    sanitized.release_date = data.release_date || null;
  }

  if (hasOwn(data, 'post_date')) {
    sanitized.post_date = data.post_date || null;
  }

  if (hasOwn(data, 'genres')) {
    if (data.genres === null) {
      sanitized.genres = null;
    } else if (Array.isArray(data.genres)) {
      sanitized.genres = JSON.stringify(data.genres);
    } else {
      sanitized.genres = JSON.stringify([]);
    }
  }

  if (hasOwn(data, 'description')) {
    sanitized.description = normalizeOptionalString(data.description);
  }

  if (hasOwn(data, 'video_url')) {
    sanitized.video_url = normalizeOptionalString(data.video_url);
  }

  if (hasOwn(data, 'artwork_url')) {
    sanitized.artwork_url = normalizeOptionalString(data.artwork_url);
  }

  if (hasOwn(data, 'is_published')) {
    sanitized.is_published = data.is_published ? 1 : 0;
  }

  if (hasOwn(data, 'artist_bio_topline')) {
    sanitized.artist_bio_topline = normalizeOptionalString(data.artist_bio_topline);
  }

  if (hasOwn(data, 'artist_bio_subtext')) {
    sanitized.artist_bio_subtext = normalizeOptionalString(data.artist_bio_subtext);
  }

  if (hasOwn(data, 'artist_bio_image_url')) {
    sanitized.artist_bio_image_url = normalizeOptionalString(data.artist_bio_image_url);
  }

  if (hasOwn(data, 'show_video')) {
    sanitized.show_video = data.show_video !== false ? 1 : 0;
  }

  if (hasOwn(data, 'show_images')) {
    sanitized.show_images = data.show_images !== false ? 1 : 0;
  }

  if (hasOwn(data, 'show_about')) {
    sanitized.show_about = data.show_about !== false ? 1 : 0;
  }

  if (hasOwn(data, 'show_shows')) {
    sanitized.show_shows = data.show_shows !== false ? 1 : 0;
  }

  if (hasOwn(data, 'sort_order')) {
    sanitized.sort_order = Number.isFinite(Number(data.sort_order)) ? parseInt(data.sort_order, 10) : 0;
  }

  return sanitized;
};

const sanitizeActionData = (actions) => {
  if (!Array.isArray(actions)) return [];
  return actions
    .filter(a => a && a.url)
    .map((action, index) => ({
      platform_key: PLATFORM_KEYS.includes(action.platform_key) ? action.platform_key : 'custom',
      label: action.label ? String(action.label).trim() : null,
      url: String(action.url).trim(),
      preview_url: action.preview_url ? String(action.preview_url).trim() : null,
      icon_mode: action.icon_mode || 'platform',
      sort_order: typeof action.sort_order === 'number' ? action.sort_order : index
    }))
    .slice(0, 20); // Max 20 action links
};

const sanitizeAssetData = (assets) => {
  if (!Array.isArray(assets)) return [];
  return assets
    .filter(a => a && a.url && ASSET_TYPES.includes(a.asset_type))
    .map((asset, index) => ({
      asset_type: asset.asset_type,
      url: String(asset.url).trim(),
      attribution: asset.attribution ? String(asset.attribution).trim() : null,
      allow_download: asset.allow_download !== false ? 1 : 0,
      sort_order: typeof asset.sort_order === 'number' ? asset.sort_order : index
    }))
    .slice(0, 50); // Max 50 assets
};

// Database query helpers
const getQueries = () => {
  const db = getDatabase();

  return {
    // Release queries
    getReleaseById: db.prepare('SELECT * FROM releases WHERE id = ?'),

    getReleasesByCurator: db.prepare(`
      SELECT * FROM releases
      WHERE curator_id = ?
      ORDER BY sort_order ASC, release_date ASC
    `),

    getNextReleaseSortOrder: db.prepare(`
      SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order
      FROM releases
      WHERE curator_id = ?
    `),

    getReleaseWithCurator: db.prepare(`
      SELECT r.*, c.name as curator_name, c.profile_image as curator_image,
        c.bio as curator_bio, c.bio_short as curator_bio_short
      FROM releases r
      LEFT JOIN curators c ON r.curator_id = c.id
      WHERE r.id = ?
    `),

    insertRelease: db.prepare(`
      INSERT INTO releases (
        curator_id, artist_name, title, release_type, release_date, post_date,
        genres, description, video_url, artwork_url, is_published, password_hash,
        artist_bio_topline, artist_bio_subtext, artist_bio_image_url,
        show_video, show_images, show_about, show_shows, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),

    updateRelease: db.prepare(`
      UPDATE releases SET
        artist_name = ?, title = ?, release_type = ?, release_date = ?, post_date = ?,
        genres = ?, description = ?, video_url = ?, artwork_url = ?, is_published = ?,
        artist_bio_topline = ?, artist_bio_subtext = ?, artist_bio_image_url = ?,
        show_video = ?, show_images = ?, show_about = ?, show_shows = ?, sort_order = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `),

    updateReleasePassword: db.prepare(`
      UPDATE releases SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `),

    setPublishedAt: db.prepare(`
      UPDATE releases SET published_at = CURRENT_TIMESTAMP WHERE id = ? AND published_at IS NULL
    `),

    deleteRelease: db.prepare('DELETE FROM releases WHERE id = ?'),

    // Action queries
    getActionsByRelease: db.prepare(`
      SELECT * FROM release_actions WHERE release_id = ? ORDER BY sort_order ASC
    `),

    insertAction: db.prepare(`
      INSERT INTO release_actions (release_id, platform_key, label, url, preview_url, icon_mode, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),

    deleteActionsByRelease: db.prepare('DELETE FROM release_actions WHERE release_id = ?'),

    // Asset queries
    getAssetsByRelease: db.prepare(`
      SELECT * FROM release_assets WHERE release_id = ? ORDER BY sort_order ASC
    `),

    insertAsset: db.prepare(`
      INSERT INTO release_assets (release_id, asset_type, url, attribution, allow_download, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `),

    deleteAssetsByRelease: db.prepare('DELETE FROM release_assets WHERE release_id = ?'),

    // Release shows queries (direct per-release shows)
    getShowsByRelease: db.prepare(`
      SELECT * FROM release_shows WHERE release_id = ? ORDER BY sort_order ASC, show_date ASC
    `),

    insertShow: db.prepare(`
      INSERT INTO release_shows (release_id, show_date, venue, city, country, ticket_url, notes, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),

    deleteShowsByRelease: db.prepare('DELETE FROM release_shows WHERE release_id = ?'),

    // Curator queries
    getCuratorById: db.prepare('SELECT id, name, profile_type, type, upcoming_releases_enabled FROM curators WHERE id = ?')
  };
};

// Helper to format release with related data
const formatRelease = (release, actions = [], assets = [], shows = []) => {
  if (!release) return null;

  return {
    ...release,
    genres: release.genres ? JSON.parse(release.genres) : [],
    is_published: Boolean(release.is_published),
    has_password: Boolean(release.password_hash),
    show_video: Boolean(release.show_video),
    show_images: Boolean(release.show_images),
    show_about: Boolean(release.show_about),
    show_shows: release.show_shows !== 0,
    actions,
    assets,
    shows
  };
};

// Sanitize show data for release
const sanitizeShowData = (shows) => {
  if (!Array.isArray(shows)) return [];
  return shows
    .filter(s => s && s.show_date)
    .map((show, index) => ({
      show_date: String(show.show_date).trim(),
      venue: show.venue ? String(show.venue).trim() : null,
      city: show.city ? String(show.city).trim() : null,
      country: show.country ? String(show.country).trim() : null,
      ticket_url: show.ticket_url ? String(show.ticket_url).trim() : null,
      notes: show.notes ? String(show.notes).trim() : null,
      sort_order: typeof show.sort_order === 'number' ? show.sort_order : index
    }))
    .slice(0, 100); // Max 100 shows per release
};

// ============================================================================
// PUBLIC ENDPOINTS
// ============================================================================

// GET /api/v1/releases/:id/public - Get public release (with password check)
router.get('/releases/:id/public', async (req, res) => {
  try {
    const releaseId = parseInt(req.params.id, 10);

    if (isNaN(releaseId)) {
      return res.status(400).json({ error: 'Invalid release ID' });
    }

    const queries = getQueries();
    const release = queries.getReleaseWithCurator.get(releaseId);

    if (!release) {
      return res.status(404).json({ error: 'Release not found' });
    }

    const isPublished = Boolean(release.is_published);

    if (!isPublished && !release.password_hash) {
      return res.status(404).json({ error: 'Release not found' });
    }

    // Check if password protected
    if (release.password_hash) {
      // Check for access token in header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          error: 'Password required',
          requires_password: true
        });
      }

      // Verify token
      try {
        const jwt = await import('jsonwebtoken');
        const token = authHeader.split(' ')[1];
        const decoded = jwt.default.verify(token, process.env.JWT_SECRET || 'dev-secret');

        if (decoded.releaseId !== releaseId || decoded.type !== 'release_access') {
          return res.status(401).json({ error: 'Invalid access token' });
        }
      } catch (tokenError) {
        return res.status(401).json({
          error: 'Password required',
          requires_password: true
        });
      }
    }

    // Get related data
    const actions = queries.getActionsByRelease.all(releaseId);
    const assets = queries.getAssetsByRelease.all(releaseId);
    const shows = queries.getShowsByRelease.all(releaseId);

    // Remove password_hash from response
    const { password_hash, ...publicRelease } = release;

    res.json({
      success: true,
      data: formatRelease(publicRelease, actions, assets, shows)
    });
  } catch (error) {
    logger.error('Error fetching public release:', error);
    res.status(500).json({ error: 'Failed to fetch release' });
  }
});

// POST /api/v1/releases/:id/verify-password - Verify password for access
router.post('/releases/:id/verify-password', async (req, res) => {
  try {
    const releaseId = parseInt(req.params.id, 10);
    const { password } = req.body;

    if (isNaN(releaseId)) {
      return res.status(400).json({ error: 'Invalid release ID' });
    }

    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const queries = getQueries();
    const release = queries.getReleaseById.get(releaseId);

    if (!release) {
      return res.status(404).json({ error: 'Release not found' });
    }

    if (!release.password_hash) {
      return res.json({ success: true, access: 'public' });
    }

    const isValid = await verifyPassword(password, release.password_hash);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Generate short-lived access token
    const jwt = await import('jsonwebtoken');
    const accessToken = jwt.default.sign(
      { releaseId, type: 'release_access' },
      process.env.JWT_SECRET || 'dev-secret',
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      accessToken
    });
  } catch (error) {
    logger.error('Error verifying release password:', error);
    res.status(500).json({ error: 'Failed to verify password' });
  }
});

// GET /api/v1/releases/feed - Get published releases for homepage feed
router.get('/releases/feed', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const db = getDatabase();

    const releases = db.prepare(`
      SELECT
        r.id, r.artist_name, r.title, r.release_type, r.release_date, r.post_date,
        r.published_at, r.genres, r.artwork_url, r.created_at,
        c.name as curator_name, c.profile_type as curator_type
      FROM releases r
      LEFT JOIN curators c ON r.curator_id = c.id
      WHERE r.is_published = 1 AND r.password_hash IS NULL
      ORDER BY COALESCE(r.post_date, r.published_at, r.created_at) DESC
      LIMIT ?
    `).all(limit);

    const formattedReleases = releases.map(release => ({
      ...release,
      genres: release.genres ? JSON.parse(release.genres) : [],
      contentType: 'release',
      sortDate: new Date(release.post_date || release.published_at || release.created_at || Date.now())
    }));

    res.json({
      success: true,
      data: formattedReleases,
      count: formattedReleases.length
    });
  } catch (error) {
    logger.error('Error fetching releases feed:', error);
    res.status(500).json({ error: 'Failed to fetch releases feed' });
  }
});

// ============================================================================
// AUTHENTICATED ENDPOINTS
// ============================================================================

// GET /api/v1/releases/:id - Get release for admin/curator editing
router.get('/releases/:id', authMiddleware, requireAnyRole(['admin', 'curator']), async (req, res) => {
  try {
    const releaseId = parseInt(req.params.id, 10);

    if (isNaN(releaseId)) {
      return res.status(400).json({ error: 'Invalid release ID' });
    }

    const queries = getQueries();
    const release = queries.getReleaseById.get(releaseId);

    if (!release) {
      return res.status(404).json({ error: 'Release not found' });
    }

    if (!canManageRelease(req.user, release)) {
      return res.status(403).json({ error: 'Not authorized to view this release' });
    }

    const actions = queries.getActionsByRelease.all(releaseId);
    const assets = queries.getAssetsByRelease.all(releaseId);
    const shows = queries.getShowsByRelease.all(releaseId);

    res.json({
      success: true,
      data: formatRelease(release, actions, assets, shows)
    });
  } catch (error) {
    logger.error('Error fetching release:', error);
    res.status(500).json({ error: 'Failed to fetch release' });
  }
});

// GET /api/v1/curators/:id/releases - Get all releases for a curator
router.get('/curators/:id/releases', authMiddleware, requireAnyRole(['admin', 'curator']), async (req, res) => {
  try {
    const curatorId = parseInt(req.params.id, 10);

    if (isNaN(curatorId)) {
      return res.status(400).json({ error: 'Invalid curator ID' });
    }

    const queries = getQueries();

    // Verify curator exists
    const curator = queries.getCuratorById.get(curatorId);
    if (!curator) {
      return res.status(404).json({ error: 'Curator not found' });
    }

    if (!canManageCurator(req.user, curatorId)) {
      return res.status(403).json({ error: 'Not authorized to view releases for this curator' });
    }

    if (req.user.role === 'curator' && !curatorHasReleaseAccess(curator)) {
      return res.status(403).json({ error: 'Releases are not enabled for this curator' });
    }

    const releases = queries.getReleasesByCurator.all(curatorId);

    // Get related data for each release
    const releasesWithData = releases.map(release => {
      const actions = queries.getActionsByRelease.all(release.id);
      const assets = queries.getAssetsByRelease.all(release.id);
      const shows = queries.getShowsByRelease.all(release.id);
      return formatRelease(release, actions, assets, shows);
    });

    res.json({
      success: true,
      data: releasesWithData,
      count: releasesWithData.length
    });
  } catch (error) {
    logger.error('Error fetching curator releases:', error);
    res.status(500).json({ error: 'Failed to fetch releases' });
  }
});

// POST /api/v1/curators/:id/releases - Create new release
router.post('/curators/:id/releases', authMiddleware, requireAnyRole(['admin', 'curator']), validateCSRFToken, async (req, res) => {
  try {
    const curatorId = parseInt(req.params.id, 10);

    if (isNaN(curatorId)) {
      return res.status(400).json({ error: 'Invalid curator ID' });
    }

    const queries = getQueries();
    const db = getDatabase();

    // Verify curator exists
    const curator = queries.getCuratorById.get(curatorId);
    if (!curator) {
      return res.status(404).json({ error: 'Curator not found' });
    }

    if (!canManageCurator(req.user, curatorId)) {
      return res.status(403).json({ error: 'Not authorized to create releases for this curator' });
    }

    if (req.user.role === 'curator' && !curatorHasReleaseAccess(curator)) {
      return res.status(403).json({ error: 'Releases are not enabled for this curator' });
    }

    const releaseData = sanitizeReleaseData({ ...req.body, curator_id: curatorId });
    const actions = sanitizeActionData(req.body.actions || []);
    const assets = sanitizeAssetData(req.body.assets || []);
    const shows = sanitizeShowData(req.body.shows || []);

    // Validation
    if (!releaseData.artist_name) {
      return res.status(400).json({ error: 'Artist name is required' });
    }

    if (!releaseData.title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    // Handle password
    let passwordHash = null;
    if (req.body.password) {
      passwordHash = await hashPassword(req.body.password);
    }

    let sortOrder = releaseData.sort_order;
    if (!hasOwn(req.body || {}, 'sort_order')) {
      const nextOrder = queries.getNextReleaseSortOrder.get(curatorId);
      sortOrder = nextOrder?.next_order ?? 0;
    }

    // Begin transaction
    const transaction = db.transaction(() => {
      // Insert release
      const result = queries.insertRelease.run(
        releaseData.curator_id,
        releaseData.artist_name,
        releaseData.title,
        releaseData.release_type,
        releaseData.release_date,
        releaseData.post_date,
        releaseData.genres,
        releaseData.description,
        releaseData.video_url,
        releaseData.artwork_url,
        releaseData.is_published,
        passwordHash,
        releaseData.artist_bio_topline,
        releaseData.artist_bio_subtext,
        releaseData.artist_bio_image_url,
        releaseData.show_video,
        releaseData.show_images,
        releaseData.show_about,
        releaseData.show_shows,
        sortOrder
      );

      const releaseId = result.lastInsertRowid;

      // Insert actions
      actions.forEach(action => {
        queries.insertAction.run(
          releaseId,
          action.platform_key,
          action.label,
          action.url,
          action.preview_url,
          action.icon_mode,
          action.sort_order
        );
      });

      // Insert assets
      assets.forEach(asset => {
        queries.insertAsset.run(
          releaseId,
          asset.asset_type,
          asset.url,
          asset.attribution,
          asset.allow_download,
          asset.sort_order
        );
      });

      // Insert shows
      shows.forEach(show => {
        queries.insertShow.run(
          releaseId,
          show.show_date,
          show.venue,
          show.city,
          show.country,
          show.ticket_url,
          show.notes,
          show.sort_order
        );
      });

      return releaseId;
    });

    const releaseId = transaction();

    // If created as published, set published_at timestamp
    if (releaseData.is_published) {
      queries.setPublishedAt.run(releaseId);
    }

    // Fetch the created release with data
    const newRelease = queries.getReleaseById.get(releaseId);
    const newActions = queries.getActionsByRelease.all(releaseId);
    const newAssets = queries.getAssetsByRelease.all(releaseId);
    const newShows = queries.getShowsByRelease.all(releaseId);

    res.status(201).json({
      success: true,
      data: formatRelease(newRelease, newActions, newAssets, newShows)
    });
  } catch (error) {
    logger.error('Error creating release:', error);
    res.status(500).json({ error: 'Failed to create release' });
  }
});

// PUT /api/v1/releases/:id - Update release
router.put('/releases/:id', authMiddleware, requireAnyRole(['admin', 'curator']), validateCSRFToken, async (req, res) => {
  try {
    const releaseId = parseInt(req.params.id, 10);

    if (isNaN(releaseId)) {
      return res.status(400).json({ error: 'Invalid release ID' });
    }

    const queries = getQueries();
    const db = getDatabase();

    const existingRelease = queries.getReleaseById.get(releaseId);
    if (!existingRelease) {
      return res.status(404).json({ error: 'Release not found' });
    }

    if (!canManageRelease(req.user, existingRelease)) {
      return res.status(403).json({ error: 'Not authorized to edit this release' });
    }

    const releaseUpdates = sanitizeReleaseUpdate(req.body);

    // Begin transaction
    const transaction = db.transaction(() => {
      queries.updateRelease.run(
        hasOwn(releaseUpdates, 'artist_name') ? releaseUpdates.artist_name : existingRelease.artist_name,
        hasOwn(releaseUpdates, 'title') ? releaseUpdates.title : existingRelease.title,
        hasOwn(releaseUpdates, 'release_type') ? releaseUpdates.release_type : existingRelease.release_type,
        hasOwn(releaseUpdates, 'release_date') ? releaseUpdates.release_date : existingRelease.release_date,
        hasOwn(releaseUpdates, 'post_date') ? releaseUpdates.post_date : existingRelease.post_date,
        hasOwn(releaseUpdates, 'genres') ? releaseUpdates.genres : existingRelease.genres,
        hasOwn(releaseUpdates, 'description') ? releaseUpdates.description : existingRelease.description,
        hasOwn(releaseUpdates, 'video_url') ? releaseUpdates.video_url : existingRelease.video_url,
        hasOwn(releaseUpdates, 'artwork_url') ? releaseUpdates.artwork_url : existingRelease.artwork_url,
        hasOwn(releaseUpdates, 'is_published') ? releaseUpdates.is_published : existingRelease.is_published,
        hasOwn(releaseUpdates, 'artist_bio_topline') ? releaseUpdates.artist_bio_topline : existingRelease.artist_bio_topline,
        hasOwn(releaseUpdates, 'artist_bio_subtext') ? releaseUpdates.artist_bio_subtext : existingRelease.artist_bio_subtext,
        hasOwn(releaseUpdates, 'artist_bio_image_url') ? releaseUpdates.artist_bio_image_url : existingRelease.artist_bio_image_url,
        hasOwn(releaseUpdates, 'show_video') ? releaseUpdates.show_video : existingRelease.show_video,
        hasOwn(releaseUpdates, 'show_images') ? releaseUpdates.show_images : existingRelease.show_images,
        hasOwn(releaseUpdates, 'show_about') ? releaseUpdates.show_about : existingRelease.show_about,
        hasOwn(releaseUpdates, 'show_shows') ? releaseUpdates.show_shows : (existingRelease.show_shows ?? 1),
        hasOwn(releaseUpdates, 'sort_order') ? releaseUpdates.sort_order : existingRelease.sort_order,
        releaseId
      );
    });

    transaction();

    // Set published_at when transitioning to published state
    const newIsPublished = hasOwn(releaseUpdates, 'is_published') ? releaseUpdates.is_published : existingRelease.is_published;
    if (newIsPublished && !existingRelease.published_at) {
      queries.setPublishedAt.run(releaseId);
    }

    // Fetch updated release
    const updatedRelease = queries.getReleaseById.get(releaseId);
    const actions = queries.getActionsByRelease.all(releaseId);
    const assets = queries.getAssetsByRelease.all(releaseId);
    const shows = queries.getShowsByRelease.all(releaseId);

    res.json({
      success: true,
      data: formatRelease(updatedRelease, actions, assets, shows)
    });
  } catch (error) {
    logger.error('Error updating release:', error);
    res.status(500).json({ error: 'Failed to update release' });
  }
});

// PUT /api/v1/releases/:id/password - Update release password
router.put('/releases/:id/password', authMiddleware, requireAnyRole(['admin', 'curator']), validateCSRFToken, async (req, res) => {
  try {
    const releaseId = parseInt(req.params.id, 10);
    const { password } = req.body; // null/empty to remove password

    if (isNaN(releaseId)) {
      return res.status(400).json({ error: 'Invalid release ID' });
    }

    const queries = getQueries();

    const existingRelease = queries.getReleaseById.get(releaseId);
    if (!existingRelease) {
      return res.status(404).json({ error: 'Release not found' });
    }

    if (!canManageRelease(req.user, existingRelease)) {
      return res.status(403).json({ error: 'Not authorized to update this release' });
    }

    let passwordHash = null;
    if (password) {
      passwordHash = await hashPassword(password);
    }

    queries.updateReleasePassword.run(passwordHash, releaseId);

    res.json({
      success: true,
      has_password: Boolean(passwordHash)
    });
  } catch (error) {
    logger.error('Error updating release password:', error);
    res.status(500).json({ error: 'Failed to update password' });
  }
});

// DELETE /api/v1/releases/:id - Delete release
router.delete('/releases/:id', authMiddleware, requireAnyRole(['admin', 'curator']), validateCSRFToken, async (req, res) => {
  try {
    const releaseId = parseInt(req.params.id, 10);

    if (isNaN(releaseId)) {
      return res.status(400).json({ error: 'Invalid release ID' });
    }

    const queries = getQueries();
    const db = getDatabase();

    const existingRelease = queries.getReleaseById.get(releaseId);
    if (!existingRelease) {
      return res.status(404).json({ error: 'Release not found' });
    }

    if (!canManageRelease(req.user, existingRelease)) {
      return res.status(403).json({ error: 'Not authorized to delete this release' });
    }

    // Delete (cascade handles related tables)
    const transaction = db.transaction(() => {
      queries.deleteRelease.run(releaseId);
    });

    transaction();

    res.json({
      success: true,
      message: 'Release deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting release:', error);
    res.status(500).json({ error: 'Failed to delete release' });
  }
});

// POST /api/v1/releases/:id/actions - Bulk update action links
router.post('/releases/:id/actions', authMiddleware, requireAnyRole(['admin', 'curator']), validateCSRFToken, async (req, res) => {
  try {
    const releaseId = parseInt(req.params.id, 10);
    const actions = sanitizeActionData(req.body.actions || []);

    if (isNaN(releaseId)) {
      return res.status(400).json({ error: 'Invalid release ID' });
    }

    const queries = getQueries();
    const db = getDatabase();

    const existingRelease = queries.getReleaseById.get(releaseId);
    if (!existingRelease) {
      return res.status(404).json({ error: 'Release not found' });
    }

    if (!canManageRelease(req.user, existingRelease)) {
      return res.status(403).json({ error: 'Not authorized to update this release' });
    }

    // Begin transaction - delete all and re-insert
    const transaction = db.transaction(() => {
      queries.deleteActionsByRelease.run(releaseId);

      actions.forEach(action => {
        queries.insertAction.run(
          releaseId,
          action.platform_key,
          action.label,
          action.url,
          action.preview_url,
          action.icon_mode,
          action.sort_order
        );
      });
    });

    transaction();

    const newActions = queries.getActionsByRelease.all(releaseId);

    res.json({
      success: true,
      data: newActions
    });
  } catch (error) {
    logger.error('Error updating release actions:', error);
    res.status(500).json({ error: 'Failed to update actions' });
  }
});

// POST /api/v1/releases/:id/assets - Bulk update assets
router.post('/releases/:id/assets', authMiddleware, requireAnyRole(['admin', 'curator']), validateCSRFToken, async (req, res) => {
  try {
    const releaseId = parseInt(req.params.id, 10);
    const assets = sanitizeAssetData(req.body.assets || []);

    if (isNaN(releaseId)) {
      return res.status(400).json({ error: 'Invalid release ID' });
    }

    const queries = getQueries();
    const db = getDatabase();

    const existingRelease = queries.getReleaseById.get(releaseId);
    if (!existingRelease) {
      return res.status(404).json({ error: 'Release not found' });
    }

    if (!canManageRelease(req.user, existingRelease)) {
      return res.status(403).json({ error: 'Not authorized to update this release' });
    }

    // Begin transaction - delete all and re-insert
    const transaction = db.transaction(() => {
      queries.deleteAssetsByRelease.run(releaseId);

      assets.forEach(asset => {
        queries.insertAsset.run(
          releaseId,
          asset.asset_type,
          asset.url,
          asset.attribution,
          asset.allow_download,
          asset.sort_order
        );
      });
    });

    transaction();

    const newAssets = queries.getAssetsByRelease.all(releaseId);

    res.json({
      success: true,
      data: newAssets
    });
  } catch (error) {
    logger.error('Error updating release assets:', error);
    res.status(500).json({ error: 'Failed to update assets' });
  }
});

// POST /api/v1/releases/:id/shows - Bulk update release shows
router.post('/releases/:id/shows', authMiddleware, requireAnyRole(['admin', 'curator']), validateCSRFToken, async (req, res) => {
  try {
    const releaseId = parseInt(req.params.id, 10);
    const shows = sanitizeShowData(req.body.shows || []);

    if (isNaN(releaseId)) {
      return res.status(400).json({ error: 'Invalid release ID' });
    }

    const queries = getQueries();
    const db = getDatabase();

    const existingRelease = queries.getReleaseById.get(releaseId);
    if (!existingRelease) {
      return res.status(404).json({ error: 'Release not found' });
    }

    if (!canManageRelease(req.user, existingRelease)) {
      return res.status(403).json({ error: 'Not authorized to update this release' });
    }

    // Begin transaction - delete all and re-insert
    const transaction = db.transaction(() => {
      queries.deleteShowsByRelease.run(releaseId);

      shows.forEach(show => {
        queries.insertShow.run(
          releaseId,
          show.show_date,
          show.venue,
          show.city,
          show.country,
          show.ticket_url,
          show.notes,
          show.sort_order
        );
      });
    });

    transaction();

    const newShows = queries.getShowsByRelease.all(releaseId);

    res.json({
      success: true,
      data: newShows
    });
  } catch (error) {
    logger.error('Error updating release shows:', error);
    res.status(500).json({ error: 'Failed to update shows' });
  }
});

// ============================================================================
// CROSS-PLATFORM LINKING
// ============================================================================

// POST /api/v1/releases/:id/find-links - Find cross-platform links for a release (on-demand)
router.post('/releases/:id/find-links', authMiddleware, requireAnyRole(['admin', 'curator']), validateCSRFToken, async (req, res) => {
  try {
    const db = getDatabase();
    const releaseId = parseInt(req.params.id, 10);

    if (!Number.isFinite(releaseId)) {
      return res.status(400).json({ error: 'Invalid release ID' });
    }

    // Get release details
    const release = db.prepare('SELECT * FROM releases WHERE id = ?').get(releaseId);
    if (!release) {
      return res.status(404).json({ error: 'Release not found' });
    }

    // Authorization check
    if (!canManageRelease(req.user, release)) {
      return res.status(403).json({ error: 'Not authorized to manage this release' });
    }

    // Need artist and title to search
    if (!release.artist_name || !release.title) {
      return res.status(400).json({
        error: 'Release must have artist name and title to find cross-platform links'
      });
    }

    // Get existing actions
    const existingActions = db.prepare(
      'SELECT * FROM release_actions WHERE release_id = ? ORDER BY sort_order'
    ).all(releaseId);

    // Find cross-platform links with status
    const result = await findCrossLinks(
      { artist_name: release.artist_name, title: release.title },
      null, // No source provider to skip
      existingActions,
      { includeStatus: true }
    );

    res.json({
      success: true,
      data: {
        found_links: result.links,
        status: result.status,
        existing_platforms: existingActions.map(a => a.platform_key)
      }
    });
  } catch (error) {
    logger.error('Error finding cross-platform links:', error);
    res.status(500).json({ error: 'Failed to find cross-platform links' });
  }
});

// POST /api/v1/releases/find-links - Find cross-platform links without saving (preview)
router.post('/releases/find-links', authMiddleware, requireAnyRole(['admin', 'curator']), validateCSRFToken, async (req, res) => {
  try {
    const { artist_name, title, existing_platforms = [] } = req.body;

    if (!artist_name || !title) {
      return res.status(400).json({
        error: 'Artist name and title are required'
      });
    }

    // Create mock existing actions from platform list
    const existingActions = existing_platforms.map(p => ({ platform_key: p }));

    // Find cross-platform links with status
    const result = await findCrossLinks(
      { artist_name, title },
      null,
      existingActions,
      { includeStatus: true }
    );

    res.json({
      success: true,
      data: {
        found_links: result.links,
        status: result.status
      }
    });
  } catch (error) {
    logger.error('Error finding cross-platform links:', error);
    res.status(500).json({ error: 'Failed to find cross-platform links' });
  }
});

// ============================================================================
// IMPORT ENDPOINTS
// ============================================================================

// POST /api/v1/releases/import/url - Import release metadata from any supported DSP URL
router.post('/releases/import/url', authMiddleware, requireAnyRole(['admin', 'curator']), validateCSRFToken, async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Parse URL to determine platform
    const { parseUrl } = await import('../services/urlParsing.js');
    const parsed = parseUrl(url);

    if (!parsed) {
      return res.status(400).json({
        error: 'Unsupported URL',
        details: 'Please provide a valid Spotify, Apple Music, Tidal, Bandcamp, or YouTube Music URL'
      });
    }

    const { provider, type } = parsed;

    // Only support album/track URLs for releases
    if (type && !['album', 'track', 'song'].includes(type)) {
      return res.status(400).json({
        error: 'Invalid URL type',
        details: 'Please provide an album or track URL'
      });
    }

    let metadata = null;
    const suggestedActions = [];

    // Fetch metadata based on provider
    if (provider === 'spotify') {
      const SpotifyService = (await import('../services/spotifyService.js')).default;
      const spotify = new SpotifyService();

      if (type === 'album' || parsed.type === 'album') {
        metadata = await spotify.getAlbumDetails(parsed.id);
      } else {
        metadata = await spotify.getTrackDetails(parsed.id);
      }

      if (metadata?.spotify_url) {
        suggestedActions.push({
          platform_key: 'spotify',
          label: 'Spotify',
          url: metadata.spotify_url,
          icon_mode: 'platform',
          sort_order: 0
        });
      }
    } else if (provider === 'apple') {
      const appleMusicService = (await import('../services/appleMusicService.js')).default;

      // For Apple Music, we need the storefront and album ID
      const storefront = parsed.storefront || 'us';
      const albumId = parsed.albumId || parsed.id;

      try {
        const result = await appleMusicService.getAlbumByAppleId(albumId, storefront);
        if (result) {
          metadata = {
            title: result.name || result.title,
            artist_name: result.artistName || result.artist,
            release_date: result.releaseDate,
            artwork_url: result.artworkUrl || result.artwork?.url?.replace('{w}x{h}', '1000x1000'),
            genres: result.genreNames || [],
            release_type: 'album'
          };
          suggestedActions.push({
            platform_key: 'apple_music',
            label: 'Apple Music',
            url: result.url || url,
            icon_mode: 'platform',
            sort_order: 0
          });
        }
      } catch (err) {
        logger.warn('Apple Music lookup failed:', err.message);
      }
    } else if (provider === 'tidal') {
      const tidalService = (await import('../services/tidalService.js')).default;

      try {
        const result = await tidalService.getAlbumById(parsed.id);
        if (result) {
          metadata = {
            title: result.title,
            artist_name: result.artists?.map(a => a.name).join(', ') || result.artist,
            release_date: result.releaseDate,
            artwork_url: result.cover ? `https://resources.tidal.com/images/${result.cover.replace(/-/g, '/')}/750x750.jpg` : null,
            genres: [],
            release_type: 'album'
          };
          suggestedActions.push({
            platform_key: 'tidal',
            label: 'TIDAL',
            url: `https://tidal.com/album/${parsed.id}`,
            icon_mode: 'platform',
            sort_order: 0
          });
        }
      } catch (err) {
        logger.warn('TIDAL lookup failed:', err.message);
      }
    } else if (provider === 'bandcamp') {
      // Bandcamp requires scraping - add the URL as an action link
      suggestedActions.push({
        platform_key: 'bandcamp',
        label: 'Bandcamp',
        url: url,
        icon_mode: 'platform',
        sort_order: 0
      });
      // Return minimal metadata
      metadata = {
        title: '',
        artist_name: '',
        release_type: parsed.type === 'album' ? 'album' : 'single'
      };
    } else if (provider === 'youtube') {
      suggestedActions.push({
        platform_key: 'youtube_music',
        label: 'YouTube',
        url: url,
        icon_mode: 'platform',
        sort_order: 0
      });
      metadata = {
        title: '',
        artist_name: '',
        release_type: 'single',
        video_url: url
      };
    }

    if (!metadata) {
      return res.status(400).json({
        error: 'Could not fetch metadata',
        details: `Unable to retrieve release information from ${provider}`
      });
    }

    // Try to find cross-platform links if we have enough metadata
    if (metadata.title && metadata.artist_name) {
      const crossLinkResults = await findCrossLinks(metadata, provider, suggestedActions);
      suggestedActions.push(...crossLinkResults);
    }

    // Dedupe and sort actions
    const seenPlatforms = new Set();
    const uniqueActions = suggestedActions.filter(action => {
      if (seenPlatforms.has(action.platform_key)) return false;
      seenPlatforms.add(action.platform_key);
      return true;
    }).map((action, index) => ({ ...action, sort_order: index }));

    res.json({
      success: true,
      data: {
        ...metadata,
        suggested_actions: uniqueActions
      }
    });
  } catch (error) {
    logger.error('Error importing from URL:', error);
    res.status(500).json({
      error: 'Failed to import',
      details: error.message
    });
  }
});

// Legacy Spotify-only import (kept for backwards compatibility)
router.post('/releases/import/spotify', authMiddleware, requireAnyRole(['admin', 'curator']), validateCSRFToken, async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'Spotify URL is required' });
    }

    const SpotifyService = (await import('../services/spotifyService.js')).default;
    const spotify = new SpotifyService();

    let albumId = spotify.extractAlbumId(url);
    let trackId = null;

    if (!albumId) {
      trackId = spotify.extractTrackId(url);
    }

    if (!albumId && !trackId) {
      return res.status(400).json({
        error: 'Invalid Spotify URL',
        details: 'Please provide a valid Spotify album or track URL'
      });
    }

    let metadata;
    if (albumId) {
      metadata = await spotify.getAlbumDetails(albumId);
    } else {
      metadata = await spotify.getTrackDetails(trackId);
    }

    if (metadata.spotify_url) {
      metadata.suggested_actions = [{
        platform_key: 'spotify',
        label: 'Spotify',
        url: metadata.spotify_url,
        icon_mode: 'platform',
        sort_order: 0
      }];
    }

    res.json({
      success: true,
      data: metadata
    });
  } catch (error) {
    logger.error('Error importing from Spotify:', error);
    res.status(500).json({
      error: 'Failed to import from Spotify',
      details: error.message
    });
  }
});

// Helper function to find cross-platform links for albums/releases
async function findCrossLinks(metadata, sourceProvider, existingActions, options = {}) {
  const results = [];
  const status = {};
  const existingPlatforms = new Set(existingActions.map(a => a.platform_key));

  try {
    // Search on platforms we don't already have
    const searchPromises = [];
    const platformOrder = [];

    // Spotify
    if (!existingPlatforms.has('spotify') && sourceProvider !== 'spotify') {
      platformOrder.push('spotify');
      const SpotifyService = (await import('../services/spotifyService.js')).default;
      const spotify = new SpotifyService();
      searchPromises.push(
        spotify.searchAlbum(metadata.artist_name, metadata.title)
          .then(result => {
            if (result?.url) {
              return { platform_key: 'spotify', label: 'Spotify', url: result.url, icon_mode: 'platform' };
            }
            return null;
          })
          .catch(() => null)
      );
    } else {
      status.spotify = existingPlatforms.has('spotify') ? 'exists' : 'skipped';
    }

    // Apple Music
    if (!existingPlatforms.has('apple_music') && sourceProvider !== 'apple') {
      platformOrder.push('apple_music');
      const appleMusicService = (await import('../services/appleMusicService.js')).default;
      searchPromises.push(
        appleMusicService.searchAlbum(metadata.artist_name, metadata.title)
          .then(result => {
            if (result?.url) {
              return { platform_key: 'apple_music', label: 'Apple Music', url: result.url, icon_mode: 'platform' };
            }
            return null;
          })
          .catch(() => null)
      );
    } else {
      status.apple_music = existingPlatforms.has('apple_music') ? 'exists' : 'skipped';
    }

    // TIDAL
    if (!existingPlatforms.has('tidal') && sourceProvider !== 'tidal') {
      platformOrder.push('tidal');
      const tidalService = (await import('../services/tidalService.js')).default;
      searchPromises.push(
        tidalService.searchAlbum(metadata.artist_name, metadata.title)
          .then(result => {
            if (result?.url) {
              return { platform_key: 'tidal', label: 'TIDAL', url: result.url, icon_mode: 'platform' };
            }
            return null;
          })
          .catch(() => null)
      );
    } else {
      status.tidal = existingPlatforms.has('tidal') ? 'exists' : 'skipped';
    }

    // YouTube Music - search for album/release
    if (!existingPlatforms.has('youtube_music') && sourceProvider !== 'youtube') {
      platformOrder.push('youtube_music');
      const youtubeService = (await import('../services/youtubeService.js')).default;
      searchPromises.push(
        youtubeService.searchByMetadata({
          title: metadata.title,
          artist: metadata.artist_name,
          duration_ms: null
        })
          .then(result => {
            if (result?.url) {
              // Convert YouTube URL to YouTube Music URL
              const ytMusicUrl = result.url.replace('youtube.com', 'music.youtube.com');
              return { platform_key: 'youtube_music', label: 'YouTube Music', url: ytMusicUrl, icon_mode: 'platform' };
            }
            return null;
          })
          .catch(() => null)
      );
    } else {
      status.youtube_music = existingPlatforms.has('youtube_music') ? 'exists' : 'skipped';
    }

    // Deezer - search for album
    if (!existingPlatforms.has('deezer')) {
      platformOrder.push('deezer');
      searchPromises.push(
        searchDeezerAlbum(metadata.artist_name, metadata.title)
          .then(result => {
            if (result?.url) {
              return {
                platform_key: 'deezer',
                label: 'Deezer',
                url: result.url,
                preview_url: result.preview_url || null,
                icon_mode: 'platform'
              };
            }
            return null;
          })
          .catch(() => null)
      );
    } else {
      status.deezer = 'exists';
    }

    const searchResults = await Promise.allSettled(searchPromises);
    for (let i = 0; i < searchResults.length; i++) {
      const result = searchResults[i];
      const platform = platformOrder[i];
      if (result.status === 'fulfilled' && result.value) {
        results.push(result.value);
        status[platform] = 'found';
      } else {
        status[platform] = 'not_found';
      }
    }
  } catch (err) {
    logger.warn('Cross-link search failed:', err.message);
  }

  return options.includeStatus ? { links: results, status } : results;
}

// Helper function to fetch preview URL from album tracks
async function fetchDeezerAlbumPreview(albumId) {
  try {
    const axios = (await import('axios')).default;
    const response = await axios.get(`https://api.deezer.com/album/${albumId}/tracks?limit=5`, {
      timeout: 10000
    });

    if (response.data?.data?.length > 0) {
      // Find first track with a preview URL
      for (const track of response.data.data) {
        if (track.preview) {
          return track.preview;
        }
      }
    }
    return null;
  } catch (err) {
    logger.warn('Deezer album tracks fetch failed:', err.message);
    return null;
  }
}

// Helper function to search Deezer for albums
async function searchDeezerAlbum(artist, title) {
  try {
    const axios = (await import('axios')).default;
    const cleanArtist = artist.replace(/[^\w\s]/g, '').trim();
    const cleanTitle = title.replace(/[^\w\s]/g, '').trim();
    const query = encodeURIComponent(`${cleanArtist} ${cleanTitle}`);

    const response = await axios.get(`https://api.deezer.com/search/album?q=${query}&limit=10`, {
      timeout: 10000
    });

    if (response.data?.data?.length > 0) {
      // Find best match by comparing artist and title
      const normalizedArtist = cleanArtist.toLowerCase();
      const normalizedTitle = cleanTitle.toLowerCase();

      for (const album of response.data.data) {
        const albumArtist = (album.artist?.name || '').toLowerCase();
        const albumTitle = (album.title || '').toLowerCase();

        // Check if artist and title match reasonably well
        const artistMatch = albumArtist.includes(normalizedArtist) || normalizedArtist.includes(albumArtist);
        const titleMatch = albumTitle.includes(normalizedTitle) || normalizedTitle.includes(albumTitle);

        if (artistMatch && titleMatch) {
          // Fetch preview URL from album tracks
          const previewUrl = await fetchDeezerAlbumPreview(album.id);
          return {
            url: album.link,
            preview_url: previewUrl,
            id: album.id,
            title: album.title,
            artist: album.artist?.name
          };
        }
      }

      // Fallback to first result if no good match
      const first = response.data.data[0];
      const previewUrl = await fetchDeezerAlbumPreview(first.id);
      return {
        url: first.link,
        preview_url: previewUrl,
        id: first.id,
        title: first.title,
        artist: first.artist?.name
      };
    }

    return null;
  } catch (err) {
    logger.warn('Deezer album search failed:', err.message);
    return null;
  }
}

export default router;
