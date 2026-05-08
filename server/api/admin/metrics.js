import express from 'express';
import { authMiddleware, requireAdmin } from '../../middleware/auth.js';
import { metrics } from '../../utils/metrics.js';
import logger from '../../utils/logger.js';

const router = express.Router();

router.use(authMiddleware, requireAdmin);

/**
 * GET /api/v1/admin/metrics
 * Returns all collected metrics with statistics
 * Query params:
 *   - format: 'json' (default) or 'prometheus'
 */
router.get('/', (req, res) => {
  try {
    const format = req.query.format || 'json';

    if (format === 'prometheus') {
      // Return Prometheus text format
      const prometheusMetrics = metrics.getPrometheusMetrics();
      res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      return res.send(prometheusMetrics);
    }

    // Return JSON format (default)
    const metricsData = metrics.getMetrics();

    return res.json({
      success: true,
      data: metricsData
    });
  } catch (error) {
    logger.error({
      event: 'admin_metrics_error',
      error: error.message,
      stack: error.stack
    }, 'Failed to retrieve metrics');

    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve metrics'
    });
  }
});

/**
 * POST /api/v1/admin/metrics/reset
 * Reset all metrics (useful for testing or clearing accumulated data)
 */
router.post('/reset', (req, res) => {
  try {
    metrics.reset();

    logger.info({
      event: 'metrics_reset',
      admin_id: req.user?.id,
      admin_email: req.user?.email
    }, 'Metrics reset by admin');

    return res.json({
      success: true,
      message: 'All metrics have been reset'
    });
  } catch (error) {
    logger.error({
      event: 'metrics_reset_error',
      error: error.message,
      stack: error.stack
    }, 'Failed to reset metrics');

    return res.status(500).json({
      success: false,
      error: 'Failed to reset metrics'
    });
  }
});

export default router;
