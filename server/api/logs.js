import express from 'express';
import logger from '../utils/logger.js';
import { recordSystemMetric } from '../database/systemPerformanceRepository.js';

const router = express.Router();

// POST /api/v1/logs/frontend - Receive frontend logs
router.post('/frontend', (req, res) => {
  try {
    const { level, component, message, data, url, userAgent } = req.body;
    
    // Log frontend error/info to backend logs
    logger.info('FRONTEND_LOG', `[${level}] ${component}: ${message}`, {
      ...data,
      url,
      userAgent,
      ip: req.ip,
      timestamp: req.body.timestamp
    });
    
    res.json({ success: true });
  } catch (error) {
    logger.error('LOGS_API', 'Failed to process frontend log', error);
    res.status(500).json({ error: 'Failed to process log' });
  }
});

router.post('/performance', (req, res) => {
  try {
    const { metric, value, tags = {}, audience = 'public' } = req.body || {};
    const numericValue = Number(value);
    if (!metric || typeof metric !== 'string' || !Number.isFinite(numericValue)) {
      return res.status(400).json({ error: 'Metric name and numeric value required' });
    }
    if (Math.abs(numericValue) > 600000) {
      return res.status(400).json({ error: 'Metric value out of range' });
    }

    const sanitizedTags = {};
    Object.entries(tags || {}).forEach(([key, tagValue]) => {
      if (typeof tagValue === 'string' || typeof tagValue === 'number') {
        sanitizedTags[key] = tagValue;
      }
    });
    sanitizedTags.ip = req.ip;
    sanitizedTags.userAgent = req.get('user-agent') || '';

    recordSystemMetric({
      metricName: `frontend_${metric}`,
      metricValue: numericValue,
      tags: {
        audience,
        ...sanitizedTags
      }
    });

    res.json({ success: true });
  } catch (error) {
    logger.error('LOGS_API', 'Failed to process performance metric', error);
    res.status(500).json({ error: 'Failed to capture metric' });
  }
});

export default router;
