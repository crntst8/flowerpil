import express from 'express';
import Joi from 'joi';
import { getQueries } from '../database/db.js';
import { authMiddleware } from '../middleware/auth.js';
import { logSecurityEvent, SECURITY_EVENTS } from '../utils/securityLogger.js';

const router = express.Router();

// GET /api/v1/profile/me - Get current user profile
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const queries = getQueries();
    const user = queries.getUserById.get(req.user.id);

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User account no longer exists',
        type: 'user_not_found'
      });
    }

    console.log('[PROFILE_ME] Profile retrieved:', {
      timestamp: new Date().toISOString(),
      userId: user.id,
      email: user.email
    });

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.display_name,
        bio: user.bio,
        avatarUrl: user.avatar_url,
        isPrivateSaved: user.is_private_saved === 1,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      }
    });

  } catch (error) {
    console.error('[PROFILE_ME] Error retrieving profile:', error);
    res.status(500).json({
      error: 'Failed to get profile',
      message: 'An error occurred while retrieving profile',
      type: 'server_error'
    });
  }
});

// PUT /api/v1/profile/me - Update current user profile
router.put('/me', authMiddleware, async (req, res) => {
  try {
    const schema = Joi.object({
      displayName: Joi.string().max(120).allow('').optional(),
      bio: Joi.string().max(500).allow('').optional(),
      avatarUrl: Joi.string().uri().allow('').optional(),
      username: Joi.string().alphanum().min(3).max(50).optional(),
      isPrivateSaved: Joi.boolean().optional()
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        message: error.details[0].message,
        type: 'validation_error'
      });
    }

    const queries = getQueries();
    const user = queries.getUserById.get(req.user.id);

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User account no longer exists',
        type: 'user_not_found'
      });
    }

    // Check if username is being changed and if it's available
    if (value.username && value.username !== user.username) {
      const existingUser = queries.getUserByUsername.get(value.username);
      if (existingUser && existingUser.id !== user.id) {
        return res.status(409).json({
          error: 'Username taken',
          message: 'This username is already in use',
          type: 'username_taken'
        });
      }
    }

    // Update profile
    queries.updateUserProfile.run(
      value.displayName !== undefined ? value.displayName : user.display_name,
      value.bio !== undefined ? value.bio : user.bio,
      value.avatarUrl !== undefined ? value.avatarUrl : user.avatar_url,
      value.isPrivateSaved !== undefined ? (value.isPrivateSaved ? 1 : 0) : user.is_private_saved,
      value.username !== undefined ? value.username : user.username,
      user.id
    );

    // Get updated user
    const updatedUser = queries.getUserById.get(user.id);

    // Log profile update
    await logSecurityEvent(SECURITY_EVENTS.ACCOUNT_SETTINGS_CHANGED, {
      ip: req.ip,
      userId: user.id,
      username: user.email,
      userAgent: req.get('User-Agent'),
      details: {
        fieldsUpdated: Object.keys(value)
      }
    });

    console.log('[PROFILE_UPDATE] Profile updated:', {
      timestamp: new Date().toISOString(),
      userId: user.id,
      fieldsUpdated: Object.keys(value)
    });

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        username: updatedUser.username,
        displayName: updatedUser.display_name,
        bio: updatedUser.bio,
        avatarUrl: updatedUser.avatar_url,
        isPrivateSaved: updatedUser.is_private_saved === 1,
        createdAt: updatedUser.created_at,
        updatedAt: updatedUser.updated_at
      }
    });

  } catch (error) {
    console.error('[PROFILE_UPDATE] Error updating profile:', error);
    res.status(500).json({
      error: 'Profile update failed',
      message: 'An error occurred while updating profile',
      type: 'server_error'
    });
  }
});

export default router;