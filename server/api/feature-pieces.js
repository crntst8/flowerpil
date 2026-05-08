import express from 'express';
import { getDatabase, getQueries } from '../database/db.js';
import multer from 'multer';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';
import { apiLoggingMiddleware } from '../middleware/logging.js';
import { authMiddleware, requireAnyRole } from '../middleware/auth.js';
import { uploadToR2 } from '../utils/r2Storage.js';
import {
  getWritingRolloutConfig,
  getWritingPermissions
} from '../services/writingRolloutService.js';

const router = express.Router();

router.use(apiLoggingMiddleware);

const authCuratorOrAdmin = [authMiddleware, requireAnyRole(['curator', 'admin'])];

// Configure multer for image uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

const toInt = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const toBoolInt = (value) => {
  if (value === true || value === 'true' || value === 1 || value === '1') return 1;
  return 0;
};

const generateSlug = (title) => {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

const parseContentBlocks = (raw) => {
  try {
    if (Array.isArray(raw)) return raw;
    return JSON.parse(raw || '[]');
  } catch {
    return [];
  }
};

const withParsedBlocks = (piece, queries) => {
  if (!piece) return null;
  const flags = queries.getFeaturePieceFlags?.all ? queries.getFeaturePieceFlags.all(piece.id) : [];
  return {
    ...piece,
    content_blocks: parseContentBlocks(piece.content_blocks),
    flags: Array.isArray(flags) ? flags : []
  };
};

const withParsedBlocksList = (pieces, queries) => {
  if (!Array.isArray(pieces)) return [];
  return pieces.map((piece) => withParsedBlocks(piece, queries));
};

const getPermissionsForRequest = (req) => {
  const db = getDatabase();
  const rollout = getWritingRolloutConfig(db);
  const permissions = getWritingPermissions(req.user, rollout);
  return { rollout, permissions };
};

const canManagePiece = (req, piece) => {
  if (!req?.user || !piece) return false;
  if (req.user.role === 'admin') return true;
  if (req.user.role !== 'curator') return false;
  return Number(req.user.curator_id) === Number(piece.curator_id);
};

const scopePiecesForUser = (req, pieces) => {
  if (!req?.user) return [];
  if (req.user.role === 'admin') return pieces;
  if (req.user.role === 'curator') {
    return pieces.filter((piece) => Number(piece.curator_id) === Number(req.user.curator_id));
  }
  return [];
};

const processAndUploadImage = async (buffer, filename) => {
  const sizes = [
    { name: 'original', width: 1600, height: 900, quality: 95 },
    { name: 'large', width: 1200, height: 675, quality: 90 },
    { name: 'medium', width: 800, height: 450, quality: 85 }
  ];

  const results = {};

  for (const size of sizes) {
    const processedBuffer = await sharp(buffer)
      .resize(size.width, size.height, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: size.quality, progressive: true })
      .toBuffer();

    const sizeFilename = size.name === 'original'
      ? `${filename}.jpg`
      : `${filename}_${size.name}.jpg`;

    const r2Key = `features/${sizeFilename}`;
    const imageUrl = await uploadToR2(processedBuffer, r2Key, 'image/jpeg');

    results[size.name] = {
      url: imageUrl,
      width: size.width,
      height: size.height
    };
  }

  return results;
};

const ensureDefaultFeatureFlag = (queries, userId) => {
  try {
    const db = getDatabase();
    let flag = db.prepare(`
      SELECT id
      FROM custom_playlist_flags
      WHERE LOWER(text) = LOWER('Feature')
      LIMIT 1
    `).get();

    if (!flag) {
      const result = db.prepare(`
        INSERT INTO custom_playlist_flags (text, color, text_color, created_by)
        VALUES (?, ?, ?, ?)
      `).run('Feature', '#78862C', '#000000', userId || null);
      flag = { id: result.lastInsertRowid };
    }

    return flag?.id || null;
  } catch (error) {
    logger.warn('FEATURE_PIECES', 'Failed to ensure default Feature tag', { error: error?.message });
    return null;
  }
};

// GET /api/v1/feature-pieces/access - Access + rollout state for current user
router.get('/access', ...authCuratorOrAdmin, (req, res) => {
  try {
    const { rollout, permissions } = getPermissionsForRequest(req);

    res.json({
      success: true,
      data: {
        ...permissions,
        pilot_curator_ids: req.user.role === 'admin' ? rollout.pilot_curator_ids : undefined
      }
    });
  } catch (error) {
    logger.error('ERROR', 'Failed to fetch writing access', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch writing access'
    });
  }
});

// GET /api/v1/feature-pieces/feed - Public feed cards (homepage)
router.get('/feed', async (_req, res) => {
  try {
    const queries = getQueries();
    const rollout = getWritingRolloutConfig();

    if (!rollout.show_in_home_feed) {
      return res.json({ success: true, data: [] });
    }

    const pieces = queries.getPublishedFeaturePiecesForHomepage.all();

    res.json({
      success: true,
      data: withParsedBlocksList(pieces, queries)
    });
  } catch (error) {
    logger.error('ERROR', 'Failed to fetch feature feed pieces', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch feature feed pieces'
    });
  }
});

// GET /api/v1/feature-pieces/sidebar - Public sidebar listing (navigation)
router.get('/sidebar', async (req, res) => {
  try {
    const queries = getQueries();
    const rollout = getWritingRolloutConfig();
    const limit = Math.min(Math.max(toInt(req.query.limit) || 8, 1), 24);

    if (!rollout.show_sidebar_nav) {
      return res.json({ success: true, data: [] });
    }

    const pieces = queries.getPublishedFeaturePieces.all().slice(0, limit).map((piece) => ({
      id: piece.id,
      slug: piece.slug,
      title: piece.title,
      author_name: piece.author_name || piece.curator_name || null,
      metadata_type: piece.metadata_type,
      metadata_date: piece.metadata_date,
      published_at: piece.published_at,
      view_count: piece.view_count || 0
    }));

    res.json({ success: true, data: pieces });
  } catch (error) {
    logger.error('ERROR', 'Failed to fetch feature sidebar items', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch feature sidebar items'
    });
  }
});

// GET /api/v1/feature-pieces - Get all published feature pieces
router.get('/', async (_req, res) => {
  try {
    const queries = getQueries();
    const pieces = queries.getPublishedFeaturePieces.all();

    res.json({
      success: true,
      data: withParsedBlocksList(pieces, queries)
    });
  } catch (error) {
    logger.error('ERROR', 'Failed to fetch feature pieces', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch feature pieces'
    });
  }
});

// GET /api/v1/feature-pieces/mine - Curator/admin scoped list
router.get('/mine', ...authCuratorOrAdmin, async (req, res) => {
  try {
    const queries = getQueries();
    const { permissions } = getPermissionsForRequest(req);

    if (!permissions.can_access_dashboard) {
      return res.status(403).json({
        success: false,
        error: 'Writing access is not enabled for this account'
      });
    }

    let pieces = [];
    if (req.user.role === 'admin') {
      const curatorId = toInt(req.query.curator_id);
      pieces = curatorId ? queries.getFeaturePiecesByCurator.all(curatorId) : queries.getAllFeaturePieces.all();
    } else {
      pieces = queries.getFeaturePiecesByCurator.all(req.user.curator_id);
    }

    res.json({
      success: true,
      data: withParsedBlocksList(pieces, queries)
    });
  } catch (error) {
    logger.error('ERROR', 'Failed to fetch scoped feature pieces', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch feature pieces'
    });
  }
});

// GET /api/v1/feature-pieces/analytics - Curator/admin analytics
router.get('/analytics', ...authCuratorOrAdmin, async (req, res) => {
  try {
    const queries = getQueries();
    const { permissions } = getPermissionsForRequest(req);

    if (!permissions.can_access_dashboard) {
      return res.status(403).json({
        success: false,
        error: 'Writing access is not enabled for this account'
      });
    }

    let pieces = [];
    if (req.user.role === 'admin') {
      const curatorId = toInt(req.query.curator_id);
      pieces = curatorId ? queries.getFeaturePiecesByCurator.all(curatorId) : queries.getAllFeaturePieces.all();
    } else {
      pieces = queries.getFeaturePiecesByCurator.all(req.user.curator_id);
    }

    const scoped = scopePiecesForUser(req, pieces);
    const published = scoped.filter((piece) => piece.status === 'published');
    const draft = scoped.filter((piece) => piece.status !== 'published');
    const totalViews = scoped.reduce((sum, piece) => sum + (piece.view_count || 0), 0);

    const topPieces = [...scoped]
      .sort((a, b) => (b.view_count || 0) - (a.view_count || 0))
      .slice(0, 10)
      .map((piece) => ({
        id: piece.id,
        slug: piece.slug,
        title: piece.title,
        status: piece.status,
        view_count: piece.view_count || 0,
        updated_at: piece.updated_at,
        published_at: piece.published_at,
        featured_on_homepage: Boolean(piece.featured_on_homepage)
      }));

    res.json({
      success: true,
      data: {
        totals: {
          pieces: scoped.length,
          published: published.length,
          drafts: draft.length,
          views: totalViews,
          avg_views_per_piece: scoped.length ? Math.round(totalViews / scoped.length) : 0
        },
        top_pieces: topPieces
      }
    });
  } catch (error) {
    logger.error('ERROR', 'Failed to fetch feature analytics', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch analytics'
    });
  }
});

// GET /api/v1/feature-pieces/drafts - Get scoped drafts
router.get('/drafts', ...authCuratorOrAdmin, async (req, res) => {
  try {
    const queries = getQueries();
    const { permissions } = getPermissionsForRequest(req);

    if (!permissions.can_access_dashboard) {
      return res.status(403).json({
        success: false,
        error: 'Writing access is not enabled for this account'
      });
    }

    const pieces = req.user.role === 'admin'
      ? queries.getDraftFeaturePieces.all()
      : queries.getFeaturePiecesByCurator.all(req.user.curator_id).filter((piece) => piece.status === 'draft');

    res.json({
      success: true,
      data: withParsedBlocksList(scopePiecesForUser(req, pieces), queries)
    });
  } catch (error) {
    logger.error('ERROR', 'Failed to fetch draft feature pieces', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch draft feature pieces'
    });
  }
});

// GET /api/v1/feature-pieces/all - Get scoped pieces
router.get('/all', ...authCuratorOrAdmin, async (req, res) => {
  try {
    const queries = getQueries();
    const { permissions } = getPermissionsForRequest(req);

    if (!permissions.can_access_dashboard) {
      return res.status(403).json({
        success: false,
        error: 'Writing access is not enabled for this account'
      });
    }

    const pieces = req.user.role === 'admin'
      ? queries.getAllFeaturePieces.all()
      : queries.getFeaturePiecesByCurator.all(req.user.curator_id);

    res.json({
      success: true,
      data: withParsedBlocksList(scopePiecesForUser(req, pieces), queries)
    });
  } catch (error) {
    logger.error('ERROR', 'Failed to fetch all feature pieces', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch feature pieces'
    });
  }
});

// GET /api/v1/feature-pieces/id/:id - Get feature piece by ID (editor)
router.get('/id/:id', ...authCuratorOrAdmin, async (req, res) => {
  try {
    const queries = getQueries();
    const { permissions } = getPermissionsForRequest(req);
    const id = toInt(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Invalid feature piece ID'
      });
    }

    if (!permissions.can_access_dashboard) {
      return res.status(403).json({
        success: false,
        error: 'Writing access is not enabled for this account'
      });
    }

    const piece = queries.getFeaturePieceById.get(id);

    if (!piece) {
      return res.status(404).json({
        success: false,
        error: 'Feature piece not found'
      });
    }

    if (!canManagePiece(req, piece)) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to access this feature piece'
      });
    }

    res.json({
      success: true,
      data: withParsedBlocks(piece, queries)
    });
  } catch (error) {
    logger.error('ERROR', 'Failed to fetch feature piece by ID', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch feature piece'
    });
  }
});

// POST /api/v1/feature-pieces - Create new feature piece
router.post('/', ...authCuratorOrAdmin, async (req, res) => {
  try {
    const queries = getQueries();
    const { permissions } = getPermissionsForRequest(req);

    if (!permissions.can_access_dashboard) {
      return res.status(403).json({
        success: false,
        error: 'Writing access is not enabled for this account'
      });
    }

    const {
      title,
      subtitle,
      author_name,
      curator_id,
      excerpt,
      metadata_type,
      metadata_date,
      hero_image,
      hero_image_caption,
      seo_title,
      seo_description,
      canonical_url,
      newsletter_cta_label,
      newsletter_cta_url,
      featured_on_homepage,
      homepage_display_order,
      content_blocks
    } = req.body;

    if (!title || !String(title).trim()) {
      return res.status(400).json({
        success: false,
        error: 'Title is required'
      });
    }

    let ownerCuratorId = null;
    if (req.user.role === 'curator') {
      ownerCuratorId = toInt(req.user.curator_id);
      if (!ownerCuratorId) {
        return res.status(400).json({
          success: false,
          error: 'Curator account is missing curator_id'
        });
      }
    } else {
      ownerCuratorId = toInt(curator_id);
    }

    let slug = generateSlug(title);
    let slugExists = queries.getFeaturePieceBySlug.get(slug);
    let counter = 1;
    while (slugExists) {
      slug = `${generateSlug(title)}-${counter}`;
      slugExists = queries.getFeaturePieceBySlug.get(slug);
      counter += 1;
    }

    const blocksJson = JSON.stringify(Array.isArray(content_blocks) ? content_blocks : []);

    const result = queries.insertFeaturePiece.run(
      slug,
      String(title).trim(),
      subtitle || null,
      author_name || req.user.curator_name || null,
      ownerCuratorId,
      excerpt || null,
      metadata_type || 'Feature',
      metadata_date || null,
      hero_image || null,
      hero_image_caption || null,
      seo_title || null,
      seo_description || null,
      canonical_url || null,
      newsletter_cta_label || null,
      newsletter_cta_url || null,
      toBoolInt(featured_on_homepage),
      toInt(homepage_display_order) || 0,
      blocksJson,
      'draft'
    );

    const newPiece = queries.getFeaturePieceById.get(result.lastInsertRowid);

    const defaultFlagId = ensureDefaultFeatureFlag(queries, req.user?.id || null);
    if (defaultFlagId && queries.assignFeaturePieceFlag) {
      try {
        queries.assignFeaturePieceFlag.run(result.lastInsertRowid, defaultFlagId, req.user?.id || null);
      } catch (assignError) {
        logger.warn('FEATURE_PIECES', 'Failed to auto-assign Feature tag', { error: assignError?.message });
      }
    }

    logger.info('FEATURE_PIECES', 'Feature piece created', {
      id: result.lastInsertRowid,
      title,
      slug,
      userId: req.user?.id,
      curatorId: ownerCuratorId
    });

    res.status(201).json({
      success: true,
      data: withParsedBlocks(newPiece, queries)
    });
  } catch (error) {
    logger.error('ERROR', 'Failed to create feature piece', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to create feature piece'
    });
  }
});

// PUT /api/v1/feature-pieces/:id - Update feature piece
router.put('/:id', ...authCuratorOrAdmin, async (req, res) => {
  try {
    const queries = getQueries();
    const { permissions } = getPermissionsForRequest(req);
    const id = toInt(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Invalid feature piece ID'
      });
    }

    if (!permissions.can_access_dashboard) {
      return res.status(403).json({
        success: false,
        error: 'Writing access is not enabled for this account'
      });
    }

    const {
      title,
      subtitle,
      author_name,
      curator_id,
      excerpt,
      metadata_type,
      metadata_date,
      hero_image,
      hero_image_caption,
      seo_title,
      seo_description,
      canonical_url,
      newsletter_cta_label,
      newsletter_cta_url,
      featured_on_homepage,
      homepage_display_order,
      content_blocks,
      slug: customSlug
    } = req.body;

    const existingPiece = queries.getFeaturePieceById.get(id);
    if (!existingPiece) {
      return res.status(404).json({
        success: false,
        error: 'Feature piece not found'
      });
    }

    if (!canManagePiece(req, existingPiece)) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to update this feature piece'
      });
    }

    if (!title || !String(title).trim()) {
      return res.status(400).json({
        success: false,
        error: 'Title is required'
      });
    }

    let nextCuratorId = existingPiece.curator_id;
    if (req.user.role === 'admin') {
      nextCuratorId = toInt(curator_id);
    }

    let slug = customSlug || generateSlug(title);
    let slugExists = queries.getFeaturePieceBySlug.get(slug);
    if (slugExists && slugExists.id !== id) {
      let counter = 1;
      const baseSlug = slug;
      while (slugExists && slugExists.id !== id) {
        slug = `${baseSlug}-${counter}`;
        slugExists = queries.getFeaturePieceBySlug.get(slug);
        counter += 1;
      }
    }

    const blocksJson = JSON.stringify(Array.isArray(content_blocks) ? content_blocks : []);

    queries.updateFeaturePiece.run(
      slug,
      String(title).trim(),
      subtitle || null,
      author_name || req.user.curator_name || existingPiece.author_name || null,
      nextCuratorId,
      excerpt || null,
      metadata_type || 'Feature',
      metadata_date || null,
      hero_image || null,
      hero_image_caption || null,
      seo_title || null,
      seo_description || null,
      canonical_url || null,
      newsletter_cta_label || null,
      newsletter_cta_url || null,
      toBoolInt(featured_on_homepage),
      toInt(homepage_display_order) || 0,
      blocksJson,
      id
    );

    const updatedPiece = queries.getFeaturePieceById.get(id);

    logger.info('FEATURE_PIECES', 'Feature piece updated', {
      id,
      title,
      slug,
      userId: req.user?.id
    });

    res.json({
      success: true,
      data: withParsedBlocks(updatedPiece, queries)
    });
  } catch (error) {
    logger.error('ERROR', 'Failed to update feature piece', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to update feature piece'
    });
  }
});

// DELETE /api/v1/feature-pieces/:id - Delete feature piece
router.delete('/:id', ...authCuratorOrAdmin, async (req, res) => {
  try {
    const queries = getQueries();
    const { permissions } = getPermissionsForRequest(req);
    const id = toInt(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Invalid feature piece ID'
      });
    }

    if (!permissions.can_access_dashboard) {
      return res.status(403).json({
        success: false,
        error: 'Writing access is not enabled for this account'
      });
    }

    const piece = queries.getFeaturePieceById.get(id);
    if (!piece) {
      return res.status(404).json({
        success: false,
        error: 'Feature piece not found'
      });
    }

    if (!canManagePiece(req, piece)) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to delete this feature piece'
      });
    }

    queries.deleteFeaturePiece.run(id);

    logger.info('FEATURE_PIECES', 'Feature piece deleted', {
      id,
      title: piece.title,
      userId: req.user?.id
    });

    res.json({
      success: true,
      message: 'Feature piece deleted successfully'
    });
  } catch (error) {
    logger.error('ERROR', 'Failed to delete feature piece', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to delete feature piece'
    });
  }
});

// POST /api/v1/feature-pieces/:id/publish - Publish feature piece
router.post('/:id/publish', ...authCuratorOrAdmin, async (req, res) => {
  try {
    const queries = getQueries();
    const { permissions } = getPermissionsForRequest(req);
    const id = toInt(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Invalid feature piece ID'
      });
    }

    if (!permissions.can_publish) {
      return res.status(403).json({
        success: false,
        error: 'Writing publish access is not enabled for this account'
      });
    }

    const piece = queries.getFeaturePieceById.get(id);
    if (!piece) {
      return res.status(404).json({
        success: false,
        error: 'Feature piece not found'
      });
    }

    if (!canManagePiece(req, piece)) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to publish this feature piece'
      });
    }

    queries.publishFeaturePiece.run(id);

    const updatedPiece = queries.getFeaturePieceById.get(id);

    logger.info('FEATURE_PIECES', 'Feature piece published', {
      id,
      title: piece.title,
      slug: piece.slug,
      userId: req.user?.id
    });

    res.json({
      success: true,
      data: withParsedBlocks(updatedPiece, queries)
    });
  } catch (error) {
    logger.error('ERROR', 'Failed to publish feature piece', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to publish feature piece'
    });
  }
});

// POST /api/v1/feature-pieces/:id/unpublish - Unpublish feature piece
router.post('/:id/unpublish', ...authCuratorOrAdmin, async (req, res) => {
  try {
    const queries = getQueries();
    const { permissions } = getPermissionsForRequest(req);
    const id = toInt(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Invalid feature piece ID'
      });
    }

    if (!permissions.can_publish) {
      return res.status(403).json({
        success: false,
        error: 'Writing publish access is not enabled for this account'
      });
    }

    const piece = queries.getFeaturePieceById.get(id);
    if (!piece) {
      return res.status(404).json({
        success: false,
        error: 'Feature piece not found'
      });
    }

    if (!canManagePiece(req, piece)) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to unpublish this feature piece'
      });
    }

    queries.unpublishFeaturePiece.run(id);

    const updatedPiece = queries.getFeaturePieceById.get(id);

    logger.info('FEATURE_PIECES', 'Feature piece unpublished', {
      id,
      title: piece.title,
      userId: req.user?.id
    });

    res.json({
      success: true,
      data: withParsedBlocks(updatedPiece, queries)
    });
  } catch (error) {
    logger.error('ERROR', 'Failed to unpublish feature piece', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to unpublish feature piece'
    });
  }
});

// POST /api/v1/feature-pieces/upload-image - Upload image for feature piece
router.post('/upload-image', ...authCuratorOrAdmin, (req, res, next) => {
  const { permissions } = getPermissionsForRequest(req);
  if (!permissions.can_access_dashboard) {
    return res.status(403).json({
      success: false,
      error: 'Writing access is not enabled for this account'
    });
  }

  upload.single('image')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          success: false,
          error: 'File size too large. Maximum size is 10MB.'
        });
      }
      if (err.message.includes('Invalid file type') || err.message.includes('Only image')) {
        return res.status(400).json({
          success: false,
          error: err.message
        });
      }
      return res.status(400).json({
        success: false,
        error: `Upload error: ${err.message}`
      });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image file provided'
      });
    }

    const { buffer, originalname } = req.file;
    const filename = `${uuidv4()}`;

    const images = await processAndUploadImage(buffer, filename);

    logger.info('FEATURE_PIECES', 'Image uploaded', {
      originalName: originalname,
      filename,
      userId: req.user?.id
    });

    res.json({
      success: true,
      data: {
        original_name: originalname,
        images,
        url: images.large?.url || images.original?.url
      }
    });
  } catch (error) {
    logger.error('ERROR', 'Failed to upload feature piece image', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to upload image'
    });
  }
});

// GET /api/v1/feature-pieces/:slug - Get feature piece by slug (public)
router.get('/:slug', async (req, res) => {
  try {
    const queries = getQueries();
    const { slug } = req.params;

    if (/^\d+$/.test(slug) || ['drafts', 'all', 'id', 'upload-image', 'mine', 'analytics', 'feed', 'sidebar', 'access'].includes(slug)) {
      return res.status(404).json({
        success: false,
        error: 'Feature piece not found'
      });
    }

    const piece = queries.getFeaturePieceBySlug.get(slug);

    if (!piece || piece.status !== 'published') {
      return res.status(404).json({
        success: false,
        error: 'Feature piece not found'
      });
    }

    if (queries.incrementFeaturePieceViews) {
      queries.incrementFeaturePieceViews.run(piece.id);
    }

    const refreshedPiece = queries.getFeaturePieceBySlug.get(slug) || piece;

    res.json({
      success: true,
      data: withParsedBlocks(refreshedPiece, queries)
    });
  } catch (error) {
    logger.error('ERROR', 'Failed to fetch feature piece by slug', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch feature piece'
    });
  }
});

export default router;
