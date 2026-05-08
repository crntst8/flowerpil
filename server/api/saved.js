import express from 'express';
import Joi from 'joi';
import { getQueries } from '../database/db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// GET /api/v1/saved/check/:trackId - Check if a track is saved
router.get('/check/:trackId', authMiddleware, async (req, res) => {
  try {
    const schema = Joi.object({
      trackId: Joi.number().integer().positive().required()
    });

    const { error, value } = schema.validate({ trackId: parseInt(req.params.trackId) });
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        message: error.details[0].message,
        type: 'validation_error'
      });
    }

    const { trackId } = value;
    const queries = getQueries();

    // Check if track is saved
    const saved = queries.checkTrackSaved.get(req.user.id, trackId);

    res.json({
      success: true,
      saved: !!saved,
      trackId: trackId
    });

  } catch (error) {
    console.error('[SAVED_CHECK] Error checking saved status:', error);
    res.status(500).json({
      error: 'Failed to check saved status',
      message: 'An error occurred while checking if track is saved',
      type: 'server_error'
    });
  }
});

// GET /api/v1/saved - List user's saved tracks
router.get('/', authMiddleware, async (req, res) => {
  try {
    const schema = Joi.object({
      offset: Joi.number().integer().min(0).default(0),
      limit: Joi.number().integer().min(1).max(100).default(20)
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

    // Get saved tracks
    const tracks = queries.listSavedTracks.all(req.user.id, limit, offset);

    // Get total count
    const { count } = queries.getSavedTrackCount.get(req.user.id);

    console.log('[SAVED_LIST] Retrieved saved tracks:', {
      timestamp: new Date().toISOString(),
      userId: req.user.id,
      count: tracks.length,
      total: count
    });

    res.json({
      success: true,
      tracks: tracks,
      pagination: {
        offset: offset,
        limit: limit,
        total: count,
        hasMore: offset + tracks.length < count
      }
    });

  } catch (error) {
    console.error('[SAVED_LIST] Error listing saved tracks:', error);
    res.status(500).json({
      error: 'Failed to list saved tracks',
      message: 'An error occurred while retrieving saved tracks',
      type: 'server_error'
    });
  }
});

// POST /api/v1/saved/:trackId - Save a track
router.post('/:trackId', authMiddleware, async (req, res) => {
  try {
    const schema = Joi.object({
      trackId: Joi.number().integer().positive().required()
    });

    const { error, value } = schema.validate({ trackId: parseInt(req.params.trackId) });
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        message: error.details[0].message,
        type: 'validation_error'
      });
    }

    const { trackId } = value;
    const queries = getQueries();

    // Verify track exists
    const track = queries.getTrackById.get(trackId);
    if (!track) {
      return res.status(404).json({
        error: 'Track not found',
        message: 'The specified track does not exist',
        type: 'track_not_found'
      });
    }

    // Check if already saved
    const existing = queries.checkTrackSaved.get(req.user.id, trackId);
    if (existing) {
      return res.json({
        success: true,
        message: 'Track already saved',
        alreadySaved: true
      });
    }

    // Save track
    queries.addSavedTrack.run(req.user.id, trackId);

    console.log('[SAVED_ADD] Track saved:', {
      timestamp: new Date().toISOString(),
      userId: req.user.id,
      trackId: trackId,
      trackTitle: track.title,
      trackArtist: track.artist
    });

    res.json({
      success: true,
      message: 'Track saved successfully',
      track: {
        id: track.id,
        title: track.title,
        artist: track.artist
      }
    });

  } catch (error) {
    console.error('[SAVED_ADD] Error saving track:', error);
    res.status(500).json({
      error: 'Failed to save track',
      message: 'An error occurred while saving the track',
      type: 'server_error'
    });
  }
});

// DELETE /api/v1/saved/:trackId - Unsave a track
router.delete('/:trackId', authMiddleware, async (req, res) => {
  try {
    const schema = Joi.object({
      trackId: Joi.number().integer().positive().required()
    });

    const { error, value } = schema.validate({ trackId: parseInt(req.params.trackId) });
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        message: error.details[0].message,
        type: 'validation_error'
      });
    }

    const { trackId } = value;
    const queries = getQueries();

    // Remove from saved tracks
    const result = queries.removeSavedTrack.run(req.user.id, trackId);

    if (result.changes === 0) {
      return res.status(404).json({
        error: 'Not saved',
        message: 'Track was not in your saved collection',
        type: 'not_found'
      });
    }

    console.log('[SAVED_REMOVE] Track unsaved:', {
      timestamp: new Date().toISOString(),
      userId: req.user.id,
      trackId: trackId
    });

    res.json({
      success: true,
      message: 'Track removed from saved collection'
    });

  } catch (error) {
    console.error('[SAVED_REMOVE] Error removing saved track:', error);
    res.status(500).json({
      error: 'Failed to remove track',
      message: 'An error occurred while removing the track',
      type: 'server_error'
    });
  }
});

export default router;