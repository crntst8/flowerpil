import express from 'express';
import Joi from 'joi';
import { getDatabase } from '../database/db.js';
import { authMiddleware } from '../middleware/auth.js';
import logger from '../utils/logger.js';

const router = express.Router();

// PUT /api/v1/users/me/profile - Update user profile (avatar, bio, display_name)
router.put('/me/profile', authMiddleware, async (req, res) => {
  try {
    const schema = Joi.object({
      display_name: Joi.string().min(2).max(50).optional(),
      bio: Joi.string().max(500).allow('', null).optional(),
      avatar_url: Joi.string().uri().allow('', null).optional()
    }).min(1);

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        message: error.details[0].message,
        type: 'validation_error'
      });
    }

    const db = getDatabase();

    // Build update query dynamically
    const updates = [];
    const values = [];

    if (value.display_name !== undefined) {
      // Validate display_name doesn't have special chars
      if (!/^[a-zA-Z0-9\s-]+$/.test(value.display_name)) {
        return res.status(400).json({
          error: 'Invalid display name',
          message: 'Display name can only contain letters, numbers, spaces, and hyphens',
          type: 'invalid_display_name'
        });
      }
      updates.push('display_name = ?');
      values.push(value.display_name);
    }
    if (value.bio !== undefined) {
      updates.push('bio = ?');
      values.push(value.bio || null);
    }
    if (value.avatar_url !== undefined) {
      updates.push('avatar_url = ?');
      values.push(value.avatar_url || null);
    }

    values.push(req.user.id);

    db.prepare(`
      UPDATE users
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...values);

    const updated = db.prepare('SELECT id, email, display_name, avatar_url, bio FROM users WHERE id = ?').get(req.user.id);

    logger.info('USER', 'Profile updated', {
      userId: req.user.id
    });

    res.json({
      success: true,
      user: updated
    });

  } catch (error) {
    logger.error('API_ERROR', 'Error updating profile', error);
    res.status(500).json({
      error: 'Failed to update profile',
      message: 'An error occurred while updating your profile',
      type: 'server_error'
    });
  }
});

// POST /api/v1/users/me/avatar - Upload user avatar image
router.post('/me/avatar', authMiddleware, async (req, res) => {
  try {
    // Image upload logic will be implemented by imageUploadService.js
    // For now, return a placeholder response
    res.status(501).json({
      error: 'Not implemented',
      message: 'Avatar upload is not yet implemented',
      type: 'not_implemented'
    });
  } catch (error) {
    logger.error('API_ERROR', 'Error uploading avatar', error);
    res.status(500).json({
      error: 'Failed to upload avatar',
      message: 'An error occurred while uploading your avatar',
      type: 'server_error'
    });
  }
});

export default router;
