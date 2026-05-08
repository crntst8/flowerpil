/**
 * Public User Limits Middleware
 * Rate limiting for public user imports (2 per 24h)
 */

import { getQueries } from '../database/db.js';
import { getPublicUserImportLimit, isPublicSignupEnabled } from '../services/featureFlagService.js';
import { logSecurityEvent, SECURITY_EVENTS } from '../utils/securityLogger.js';

/**
 * Check if user is a public user type
 * @param {Object} user - User object from request
 * @returns {boolean}
 */
const isPublicUser = (user) => {
  if (!user) return false;
  // Admin users and curators are not public users
  if (user.role === 'admin' || user.role === 'curator') return false;
  // Check user_type field for users table
  return user.user_type === 'public';
};

/**
 * Middleware to check and enforce import limits for public users
 * Returns 429 if limit exceeded, otherwise attaches logging helper
 */
export const publicUserImportLimiter = async (req, res, next) => {
  // Skip if public users feature is disabled
  if (!isPublicSignupEnabled()) {
    return next();
  }

  const user = req.user;

  // Skip for non-public users (curators, admins)
  if (!isPublicUser(user)) {
    return next();
  }

  // Check user status - suspended/revoked users cannot import
  if (user.status === 'suspended' || user.status === 'revoked') {
    return res.status(403).json({
      success: false,
      error: 'Your account has been suspended. Please contact support.'
    });
  }

  try {
    const queries = getQueries();
    const limit = getPublicUserImportLimit();

    // Get import count in last 24 hours
    const result = queries.getUserImportCountLast24h.get(user.id);
    const currentCount = result?.count || 0;

    if (currentCount >= limit) {
      // Log the limit hit event
      try {
        logSecurityEvent(SECURITY_EVENTS.PUBLIC_USER_IMPORT_LIMIT_HIT, {
          userId: user.id,
          email: user.email,
          currentCount,
          limit,
          ipAddress: req.ip
        });
      } catch (logError) {
        console.error('[publicUserLimits] Failed to log security event:', logError.message);
      }

      return res.status(429).json({
        success: false,
        error: `Import limit reached. You can import ${limit} playlists per 24 hours. Try again later.`,
        limit,
        current: currentCount,
        retryAfter: '24 hours'
      });
    }

    // Attach helper to log successful imports
    req.logPublicUserImport = (importType, sourcePlatform, itemCount = 1) => {
      try {
        queries.insertUserImportLog.run(user.id, importType, sourcePlatform, itemCount);
      } catch (error) {
        console.error('[publicUserLimits] Failed to log import:', error.message);
      }
    };

    // Attach current usage info
    req.publicUserImportInfo = {
      current: currentCount,
      limit,
      remaining: limit - currentCount
    };

    next();
  } catch (error) {
    console.error('[publicUserLimits] Error checking import limits:', error.message);
    // Don't block on errors - fail open but log
    next();
  }
};

/**
 * Middleware to check if user account is active and not suspended
 * Apply to any route that should be blocked for suspended users
 */
export const requireActiveAccount = async (req, res, next) => {
  const user = req.user;

  if (!user) {
    return next();
  }

  // Skip for non-public users
  if (!isPublicUser(user)) {
    return next();
  }

  if (!user.is_active) {
    return res.status(403).json({
      success: false,
      error: 'Your account is inactive. Please contact support.'
    });
  }

  if (user.status === 'suspended' || user.status === 'revoked') {
    return res.status(403).json({
      success: false,
      error: 'Your account has been suspended. Please contact support.'
    });
  }

  next();
};

export default {
  publicUserImportLimiter,
  requireActiveAccount
};
