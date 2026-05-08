import express from 'express';
import { authMiddleware, requireAdmin } from '../../middleware/auth.js';
import { getRecoveryStatus, runManualRecovery } from '../../services/stateRecoveryService.js';
import logger from '../../utils/logger.js';

/**
 * State Recovery Admin API
 *
 * Endpoints for monitoring and manually triggering state recovery operations.
 * Recovery tasks include:
 * - Requeue expired linking leases
 * - Cleanup stale worker heartbeats
 * - Reset stuck export requests
 */

const router = express.Router();

// Apply authentication and admin requirement to all routes
router.use(authMiddleware, requireAdmin);

/**
 * GET /api/v1/admin/state-recovery
 * Get state recovery service status and statistics
 */
router.get('/', (_req, res) => {
  try {
    const status = getRecoveryStatus();

    return res.json({
      success: true,
      data: status
    });
  } catch (error) {
    logger.error('STATE_RECOVERY_API', 'Failed to get recovery status', {
      error: error?.message
    });
    return res.status(500).json({
      success: false,
      error: 'Failed to get recovery status'
    });
  }
});

/**
 * POST /api/v1/admin/state-recovery/trigger
 * Manually trigger a state recovery run
 */
router.post('/trigger', async (req, res) => {
  try {
    logger.info('STATE_RECOVERY_API', 'Manual recovery triggered', {
      admin: req.user?.email || req.user?.username || 'unknown',
      userId: req.user?.id
    });

    const results = await runManualRecovery();

    if (!results) {
      return res.status(409).json({
        success: false,
        error: 'Recovery already in progress'
      });
    }

    return res.json({
      success: true,
      message: 'Recovery completed',
      data: results
    });
  } catch (error) {
    logger.error('STATE_RECOVERY_API', 'Manual recovery failed', {
      error: error?.message,
      admin: req.user?.email || req.user?.username || 'unknown'
    });

    return res.status(500).json({
      success: false,
      error: 'Recovery failed',
      details: error?.message
    });
  }
});

export default router;
