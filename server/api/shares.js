import express from 'express';
import { getQueries } from '../database/db.js';
import { authMiddleware } from '../middleware/auth.js';
import { generateUniqueSlug } from '../utils/slugGenerator.js';

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * POST /api/v1/shares - Create a new share page
 * Body: { entity_type: 'song'|'list'|'saved', entity_id: number }
 */
router.post('/', async (req, res) => {
  const { entity_type, entity_id } = req.body;
  const queries = getQueries();

  try {
    // Validate entity_type
    if (!['song', 'list', 'saved'].includes(entity_type)) {
      return res.status(400).json({ error: 'Invalid entity_type. Must be: song, list, or saved' });
    }

    // Validate entity exists and user owns it
    if (entity_type === 'list') {
      const list = queries.getListById.get(entity_id);
      if (!list) {
        return res.status(404).json({ error: 'List not found' });
      }
      if (list.user_id !== req.user.id) {
        return res.status(403).json({ error: 'You do not own this list' });
      }
    } else if (entity_type === 'song') {
      const track = queries.getTrackById.get(entity_id);
      if (!track) {
        return res.status(404).json({ error: 'Song not found' });
      }
      // For songs, we don't check ownership (any user can share a song from the platform)
    } else if (entity_type === 'saved') {
      // For saved tracks, entity_id should be the user's ID
      if (entity_id !== req.user.id) {
        return res.status(403).json({ error: 'You can only create share pages for your own saved tracks' });
      }
    }

    // Generate unique slug
    const slug = await generateUniqueSlug();

    // Create share page
    const result = queries.createSharePage.run(entity_type, entity_id, req.user.id, slug);

    // Construct full URL
    const baseUrl = process.env.FRONTEND_URL || 'https://flowerpil.io';
    const urlPrefix = entity_type === 'list' ? 'l' : entity_type === 'saved' ? 'p' : 's';
    const url = `${baseUrl}/${urlPrefix}/${slug}`;

    res.status(201).json({
      slug,
      url,
      entity_type,
      entity_id,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error creating share page:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/v1/shares/:slug - Revoke a share page (soft delete)
 */
router.delete('/:slug', (req, res) => {
  const { slug } = req.params;
  const queries = getQueries();

  try {
    // Get share page to verify ownership
    const sharePage = queries.getSharePageBySlug.get(slug);
    if (!sharePage) {
      return res.status(404).json({ error: 'Share not found' });
    }

    // Verify ownership
    if (sharePage.owner_user_id !== req.user.id) {
      return res.status(403).json({ error: 'You do not own this share' });
    }

    // Revoke share (soft delete)
    queries.revokeSharePage.run(slug);

    res.json({ success: true, message: 'Share revoked successfully' });
  } catch (error) {
    console.error('Error revoking share page:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/v1/shares - List all active shares for the current user
 */
router.get('/', (req, res) => {
  const queries = getQueries();

  try {
    const shares = queries.getSharePagesByOwner.all(req.user.id);

    // Construct full URLs for each share
    const baseUrl = process.env.FRONTEND_URL || 'https://flowerpil.io';
    const sharesWithUrls = shares.map((share) => {
      const urlPrefix = share.entity_type === 'list' ? 'l' : share.entity_type === 'saved' ? 'p' : 's';
      return {
        ...share,
        url: `${baseUrl}/${urlPrefix}/${share.slug}`,
      };
    });

    res.json({ shares: sharesWithUrls });
  } catch (error) {
    console.error('Error listing shares:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
