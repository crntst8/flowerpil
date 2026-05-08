/**
 * Public User API
 * Endpoints for public user account management and export access requests
 */

import express from 'express';
import { getQueries } from '../database/db.js';
import { authMiddleware } from '../middleware/auth.js';
import { isPublicSignupEnabled } from '../services/featureFlagService.js';
import {
  checkExportEligibility,
  canRequestExportAccess,
  ELIGIBILITY_STATUS
} from '../services/exportEligibilityService.js';
import { logSecurityEvent, SECURITY_EVENTS } from '../utils/securityLogger.js';

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * GET /api/v1/user/export-eligibility
 * Check current user's export eligibility status
 */
router.get('/export-eligibility', (req, res) => {
  const user = req.user;

  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  const eligibility = checkExportEligibility(user);
  const requestStatus = canRequestExportAccess(user);

  return res.json({
    success: true,
    data: {
      eligible: eligibility.eligible,
      status: eligibility.status,
      message: eligibility.message,
      playlistCount: eligibility.playlistCount,
      threshold: eligibility.threshold,
      canRequest: requestStatus.canRequest,
      requestReason: requestStatus.reason
    }
  });
});

/**
 * POST /api/v1/user/request-export-access
 * Submit a request for export access (requires meeting threshold)
 */
router.post('/request-export-access', async (req, res) => {
  // Check if public users feature is enabled
  if (!isPublicSignupEnabled()) {
    return res.status(404).json({
      success: false,
      error: 'Feature not available'
    });
  }

  const user = req.user;

  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  // Check if user can request access
  const requestStatus = canRequestExportAccess(user);

  if (!requestStatus.canRequest) {
    return res.status(400).json({
      success: false,
      error: requestStatus.reason
    });
  }

  try {
    const queries = getQueries();

    // Create the access request
    queries.createExportAccessRequest.run(user.id);

    // Get the request for queue position
    const request = queries.getExportAccessRequestByUser.get(user.id);
    const pendingCount = queries.countPendingExportAccessRequests.get();

    // Log security event
    try {
      logSecurityEvent(SECURITY_EVENTS.PUBLIC_USER_EXPORT_REQUEST, {
        userId: user.id,
        email: user.email,
        ipAddress: req.ip
      });
    } catch (logError) {
      console.error('[public-user] Failed to log security event:', logError.message);
    }

    // TODO: Send Slack notification to admin channel
    // This would integrate with the existing Slack bot system

    return res.json({
      success: true,
      data: {
        requestId: request?.id,
        queuePosition: pendingCount?.count || 1,
        message: 'Your export access request has been submitted for review'
      }
    });
  } catch (error) {
    console.error('[public-user] Error creating export access request:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to submit export access request'
    });
  }
});

/**
 * GET /api/v1/user/export-request-status
 * Check the status of the user's export access request
 */
router.get('/export-request-status', (req, res) => {
  const user = req.user;

  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  try {
    const queries = getQueries();
    const request = queries.getExportAccessRequestByUser.get(user.id);

    if (!request) {
      return res.json({
        success: true,
        data: {
          hasRequest: false,
          message: 'No export access request found'
        }
      });
    }

    return res.json({
      success: true,
      data: {
        hasRequest: true,
        status: request.status,
        createdAt: request.created_at,
        reviewedAt: request.reviewed_at,
        reviewReason: request.review_reason
      }
    });
  } catch (error) {
    console.error('[public-user] Error checking request status:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to check request status'
    });
  }
});

/**
 * GET /api/v1/user/import-usage
 * Get the user's import usage for the last 24 hours
 */
router.get('/import-usage', (req, res) => {
  const user = req.user;

  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  // Non-public users have unlimited imports
  if (user.user_type !== 'public') {
    return res.json({
      success: true,
      data: {
        unlimited: true,
        message: 'Your account has unlimited imports'
      }
    });
  }

  try {
    const queries = getQueries();
    const count = queries.getUserImportCountLast24h.get(user.id);
    const logs = queries.getUserImportLogsLast24h.all(user.id);

    const limit = parseInt(process.env.PUBLIC_USER_IMPORT_LIMIT || '2', 10);

    return res.json({
      success: true,
      data: {
        unlimited: false,
        current: count?.count || 0,
        limit,
        remaining: Math.max(0, limit - (count?.count || 0)),
        imports: logs.map(log => ({
          type: log.import_type,
          platform: log.source_platform,
          createdAt: log.created_at
        }))
      }
    });
  } catch (error) {
    console.error('[public-user] Error getting import usage:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to get import usage'
    });
  }
});

export default router;
