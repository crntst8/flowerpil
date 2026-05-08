/**
 * Export Eligibility Service
 * Determines if a user is eligible to export playlists to DSPs
 */

import { getQueries, getDatabase } from '../database/db.js';
import {
  arePublicExportsDisabled,
  getExportPlaylistThreshold,
  isPublicSignupEnabled
} from './featureFlagService.js';

export const ELIGIBILITY_STATUS = {
  ELIGIBLE: 'eligible',
  NOT_PUBLIC_USER: 'not_public_user',
  EXPORTS_DISABLED: 'exports_disabled',
  SUSPENDED: 'suspended',
  REVOKED: 'revoked',
  UNLOCKED: 'unlocked',
  THRESHOLD_NOT_MET: 'threshold_not_met',
  PENDING_APPROVAL: 'pending_approval'
};

/**
 * Check if a user is eligible to export playlists
 * @param {Object} user - User object
 * @returns {Object} { eligible: boolean, status: string, message: string, playlistCount?: number, threshold?: number }
 */
export const checkExportEligibility = (user) => {
  // Non-public users (curators/admins) are always eligible
  if (!user || user.role === 'admin' || user.role === 'curator') {
    return {
      eligible: true,
      status: ELIGIBILITY_STATUS.NOT_PUBLIC_USER,
      message: 'Curators and admins have full export access'
    };
  }

  // Check if user is a public user type
  if (user.user_type !== 'public') {
    return {
      eligible: true,
      status: ELIGIBILITY_STATUS.NOT_PUBLIC_USER,
      message: 'Account has full export access'
    };
  }

  // Check global disable switch
  if (arePublicExportsDisabled()) {
    return {
      eligible: false,
      status: ELIGIBILITY_STATUS.EXPORTS_DISABLED,
      message: 'Exports are temporarily disabled for all users'
    };
  }

  // Check user status (suspended/revoked = blocked)
  if (user.status === 'suspended') {
    return {
      eligible: false,
      status: ELIGIBILITY_STATUS.SUSPENDED,
      message: 'Your account has been suspended. Please contact support.'
    };
  }

  if (user.status === 'revoked') {
    return {
      eligible: false,
      status: ELIGIBILITY_STATUS.REVOKED,
      message: 'Your export privileges have been revoked. Please contact support.'
    };
  }

  // Check if admin has unlocked exports for this user
  if (user.exports_unlocked) {
    return {
      eligible: true,
      status: ELIGIBILITY_STATUS.UNLOCKED,
      message: 'Exports unlocked by administrator'
    };
  }

  // Check published playlist count vs threshold
  const threshold = getExportPlaylistThreshold();
  const publishedCount = getPublishedPlaylistCount(user.id);

  if (publishedCount < threshold) {
    return {
      eligible: false,
      status: ELIGIBILITY_STATUS.THRESHOLD_NOT_MET,
      message: `Publish ${threshold - publishedCount} more playlists to unlock exports`,
      playlistCount: publishedCount,
      threshold
    };
  }

  // Threshold met but not yet unlocked - requires admin approval
  return {
    eligible: false,
    status: ELIGIBILITY_STATUS.PENDING_APPROVAL,
    message: 'You are eligible for exports. Request access for admin approval.',
    playlistCount: publishedCount,
    threshold
  };
};

/**
 * Get count of published playlists for a user
 * @param {number} userId - User ID
 * @returns {number}
 */
export const getPublishedPlaylistCount = (userId) => {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT COUNT(*) as count
      FROM playlists
      WHERE curator_id = ? AND published = 1
    `);
    const result = stmt.get(userId);
    return result?.count || 0;
  } catch (error) {
    console.error('[exportEligibility] Error getting playlist count:', error.message);
    return 0;
  }
};

/**
 * Check if a user can request export access
 * @param {Object} user - User object
 * @returns {Object} { canRequest: boolean, reason: string }
 */
export const canRequestExportAccess = (user) => {
  const eligibility = checkExportEligibility(user);

  // Can only request if pending approval
  if (eligibility.status === ELIGIBILITY_STATUS.PENDING_APPROVAL) {
    // Check if already has pending request
    try {
      const queries = getQueries();
      const existingRequest = queries.getExportAccessRequestByUser.get(user.id);

      if (existingRequest && existingRequest.status === 'pending') {
        return {
          canRequest: false,
          reason: 'You already have a pending export access request'
        };
      }

      return {
        canRequest: true,
        reason: 'You are eligible to request export access'
      };
    } catch (error) {
      console.error('[exportEligibility] Error checking request status:', error.message);
      return {
        canRequest: false,
        reason: 'Unable to check request status. Please try again.'
      };
    }
  }

  if (eligibility.eligible) {
    return {
      canRequest: false,
      reason: 'You already have export access'
    };
  }

  return {
    canRequest: false,
    reason: eligibility.message
  };
};

/**
 * Express middleware to check export eligibility
 */
export const requireExportEligibility = (req, res, next) => {
  // Skip if public users feature is disabled
  if (!isPublicSignupEnabled()) {
    return next();
  }

  const user = req.user;
  const eligibility = checkExportEligibility(user);

  if (!eligibility.eligible) {
    return res.status(403).json({
      success: false,
      error: eligibility.message,
      eligibility: {
        status: eligibility.status,
        playlistCount: eligibility.playlistCount,
        threshold: eligibility.threshold
      }
    });
  }

  // Attach eligibility info to request
  req.exportEligibility = eligibility;
  next();
};

export default {
  ELIGIBILITY_STATUS,
  checkExportEligibility,
  getPublishedPlaylistCount,
  canRequestExportAccess,
  requireExportEligibility
};
