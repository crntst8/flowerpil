import express from 'express';
import Joi from 'joi';
import crypto from 'crypto';
import { getQueries } from '../database/db.js';
import { authMiddleware } from '../middleware/auth.js';
import { generateUniqueSlug } from '../utils/slugGenerator.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Helper function to generate unique share slug
const generateShareSlug = () => {
  return crypto.randomBytes(4).toString('hex'); // 8 characters
};

// Helper function to check list ownership
const checkListOwnership = (list, userId, res) => {
  if (!list) {
    return res.status(404).json({
      error: 'List not found',
      message: 'The specified list does not exist',
      type: 'list_not_found'
    });
  }

  if (list.user_id !== userId) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'You do not have permission to access this list',
      type: 'forbidden'
    });
  }

  return null;
};

// POST /api/v1/lists - Create new list
router.post('/', authMiddleware, async (req, res) => {
  try {
    const schema = Joi.object({
      title: Joi.string().min(1).max(100).required(),
      description: Joi.string().max(500).allow('', null).optional(),
      is_private: Joi.number().integer().valid(0, 1).default(0),
      cover_art_url: Joi.string().uri().allow('', null).optional()
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        message: error.details[0].message,
        type: 'validation_error'
      });
    }

    const { title, description, is_private, cover_art_url } = value;
    const queries = getQueries();

    // Generate unique share slug
    let share_slug;
    let attempts = 0;
    const maxAttempts = 10;

    do {
      share_slug = generateShareSlug();
      const existing = queries.getListBySlug.get(share_slug);
      if (!existing) break;
      attempts++;
    } while (attempts < maxAttempts);

    if (attempts >= maxAttempts) {
      return res.status(500).json({
        error: 'Failed to generate unique slug',
        message: 'Unable to generate a unique identifier for the list',
        type: 'server_error'
      });
    }

    // Create list
    const result = queries.createList.run(
      req.user.id,
      title,
      description || null,
      is_private,
      cover_art_url || null,
      share_slug
    );

    const list = queries.getListById.get(result.lastInsertRowid);

    // Create share_page entry for the list
    try {
      const shareSlug = await generateUniqueSlug();
      queries.createSharePage.run('list', list.id, req.user.id, shareSlug);

      logger.info('LIST', 'List and share page created', {
        userId: req.user.id,
        listId: list.id,
        title: list.title,
        shareSlug: shareSlug
      });
    } catch (shareError) {
      logger.warn('LIST', 'Failed to create share page for list', shareError);
      // Continue anyway - list was created successfully
    }

    res.status(201).json({
      success: true,
      list: list
    });

  } catch (error) {
    logger.error('API_ERROR', 'Error creating list', error);
    res.status(500).json({
      error: 'Failed to create list',
      message: 'An error occurred while creating the list',
      type: 'server_error'
    });
  }
});

// GET /api/v1/lists - Get user's lists
router.get('/', authMiddleware, async (req, res) => {
  try {
    const schema = Joi.object({
      offset: Joi.number().integer().min(0).default(0),
      limit: Joi.number().integer().min(1).max(100).default(50)
    });

    const { error, value } = schema.validate(req.query);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        message: error.details[0].message,
        type: 'validation_error'
      });
    }

    const { offset, limit } = value;
    const queries = getQueries();

    // Get all user lists
    const allLists = queries.listUserLists.all(req.user.id);

    // Apply pagination
    const paginatedLists = allLists.slice(offset, offset + limit);

    // Add track counts to each list
    const listsWithCounts = paginatedLists.map(list => {
      const { count } = queries.getListItemCount.get(list.id);
      return {
        ...list,
        trackCount: count
      };
    });

    logger.info('LIST', 'Retrieved user lists', {
      userId: req.user.id,
      count: listsWithCounts.length,
      total: allLists.length
    });

    res.json({
      success: true,
      lists: listsWithCounts,
      pagination: {
        offset: offset,
        limit: limit,
        total: allLists.length,
        hasMore: offset + paginatedLists.length < allLists.length
      }
    });

  } catch (error) {
    logger.error('API_ERROR', 'Error listing user lists', error);
    res.status(500).json({
      error: 'Failed to list user lists',
      message: 'An error occurred while retrieving your lists',
      type: 'server_error'
    });
  }
});

// GET /api/v1/lists/:id - Get single list with items
router.get('/:id', authMiddleware, async (req, res) => {
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

    const { id } = value;
    const queries = getQueries();

    // Get list
    const list = queries.getListById.get(id);

    // Check ownership
    const ownershipError = checkListOwnership(list, req.user.id, res);
    if (ownershipError) return;

    // Get list items (tracks)
    const tracks = queries.getListItems.all(id);

    // Get track count
    const { count } = queries.getListItemCount.get(id);

    logger.info('LIST', 'Retrieved list with items', {
      userId: req.user.id,
      listId: list.id,
      trackCount: count
    });

    res.json({
      success: true,
      list: list,
      tracks: tracks,
      trackCount: count
    });

  } catch (error) {
    logger.error('API_ERROR', 'Error getting list', error);
    res.status(500).json({
      error: 'Failed to get list',
      message: 'An error occurred while retrieving the list',
      type: 'server_error'
    });
  }
});

// PUT /api/v1/lists/:id - Update list metadata
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
      is_private: Joi.number().integer().valid(0, 1).optional(),
      cover_art_url: Joi.string().uri().allow('', null).optional()
    }).min(1); // At least one field must be provided

    const { error: bodyError, value: bodyValue } = bodySchema.validate(req.body);
    if (bodyError) {
      return res.status(400).json({
        error: 'Validation failed',
        message: bodyError.details[0].message,
        type: 'validation_error'
      });
    }

    const { id } = paramsValue;
    const queries = getQueries();

    // Get list
    const list = queries.getListById.get(id);

    // Check ownership
    const ownershipError = checkListOwnership(list, req.user.id, res);
    if (ownershipError) return;

    // Merge updated fields with existing values
    const updatedTitle = bodyValue.title !== undefined ? bodyValue.title : list.title;
    const updatedDescription = bodyValue.description !== undefined ? (bodyValue.description || null) : list.description;
    const updatedIsPrivate = bodyValue.is_private !== undefined ? bodyValue.is_private : list.is_private;
    const updatedCoverArtUrl = bodyValue.cover_art_url !== undefined ? (bodyValue.cover_art_url || null) : list.cover_art_url;

    // Update list
    queries.updateList.run(
      updatedTitle,
      updatedDescription,
      updatedIsPrivate,
      updatedCoverArtUrl,
      id,
      req.user.id
    );

    // Get updated list
    const updatedList = queries.getListById.get(id);

    logger.info('LIST', 'List updated', {
      userId: req.user.id,
      listId: id,
      updatedFields: Object.keys(bodyValue)
    });

    res.json({
      success: true,
      list: updatedList
    });

  } catch (error) {
    logger.error('API_ERROR', 'Error updating list', error);
    res.status(500).json({
      error: 'Failed to update list',
      message: 'An error occurred while updating the list',
      type: 'server_error'
    });
  }
});

// DELETE /api/v1/lists/:id - Delete list
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

    const { id } = value;
    const queries = getQueries();

    // Get list
    const list = queries.getListById.get(id);

    // Check ownership
    const ownershipError = checkListOwnership(list, req.user.id, res);
    if (ownershipError) return;

    // Delete list (CASCADE will delete list_items automatically)
    const result = queries.deleteList.run(id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({
        error: 'List not found',
        message: 'The specified list could not be deleted',
        type: 'list_not_found'
      });
    }

    logger.info('LIST', 'List deleted', {
      userId: req.user.id,
      listId: id,
      title: list.title
    });

    res.json({
      success: true,
      message: 'List deleted successfully'
    });

  } catch (error) {
    logger.error('API_ERROR', 'Error deleting list', error);
    res.status(500).json({
      error: 'Failed to delete list',
      message: 'An error occurred while deleting the list',
      type: 'server_error'
    });
  }
});

// POST /api/v1/lists/:id/items - Add track to list
router.post('/:id/items', authMiddleware, async (req, res) => {
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
      trackId: Joi.number().integer().positive().required()
    });

    const { error: bodyError, value: bodyValue } = bodySchema.validate(req.body);
    if (bodyError) {
      return res.status(400).json({
        error: 'Validation failed',
        message: bodyError.details[0].message,
        type: 'validation_error'
      });
    }

    const { id } = paramsValue;
    const { trackId } = bodyValue;
    const queries = getQueries();

    // Get list
    const list = queries.getListById.get(id);

    // Check ownership
    const ownershipError = checkListOwnership(list, req.user.id, res);
    if (ownershipError) return;

    // Verify track exists
    const track = queries.getTrackById.get(trackId);
    if (!track) {
      return res.status(404).json({
        error: 'Track not found',
        message: 'The specified track does not exist',
        type: 'track_not_found'
      });
    }

    // Get max position and increment
    const { max_position } = queries.getMaxListItemPosition.get(id);
    const newPosition = max_position + 1;

    // Add track to list (INSERT OR IGNORE handles duplicates)
    const result = queries.addListItem.run(id, trackId, newPosition);

    if (result.changes === 0) {
      return res.json({
        success: true,
        message: 'Track already in list',
        alreadyAdded: true
      });
    }

    logger.info('LIST', 'Track added to list', {
      userId: req.user.id,
      listId: id,
      trackId: trackId,
      position: newPosition
    });

    res.status(201).json({
      success: true,
      message: 'Track added to list successfully',
      item: {
        list_id: id,
        track_id: trackId,
        position: newPosition
      }
    });

  } catch (error) {
    logger.error('API_ERROR', 'Error adding track to list', error);
    res.status(500).json({
      error: 'Failed to add track to list',
      message: 'An error occurred while adding the track to the list',
      type: 'server_error'
    });
  }
});

// DELETE /api/v1/lists/:id/items/:trackId - Remove track from list
router.delete('/:id/items/:trackId', authMiddleware, async (req, res) => {
  try {
    const schema = Joi.object({
      id: Joi.number().integer().positive().required(),
      trackId: Joi.number().integer().positive().required()
    });

    const { error, value } = schema.validate({
      id: parseInt(req.params.id),
      trackId: parseInt(req.params.trackId)
    });

    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        message: error.details[0].message,
        type: 'validation_error'
      });
    }

    const { id, trackId } = value;
    const queries = getQueries();

    // Get list
    const list = queries.getListById.get(id);

    // Check ownership
    const ownershipError = checkListOwnership(list, req.user.id, res);
    if (ownershipError) return;

    // Remove track from list
    const result = queries.removeListItem.run(id, trackId);

    if (result.changes === 0) {
      return res.status(404).json({
        error: 'Track not in list',
        message: 'The specified track is not in this list',
        type: 'track_not_in_list'
      });
    }

    logger.info('LIST', 'Track removed from list', {
      userId: req.user.id,
      listId: id,
      trackId: trackId
    });

    res.json({
      success: true,
      message: 'Track removed from list successfully'
    });

  } catch (error) {
    logger.error('API_ERROR', 'Error removing track from list', error);
    res.status(500).json({
      error: 'Failed to remove track from list',
      message: 'An error occurred while removing the track from the list',
      type: 'server_error'
    });
  }
});

export default router;
