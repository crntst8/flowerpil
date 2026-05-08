import express from 'express';
import Joi from 'joi';
import { getQueries } from '../database/db.js';
import { authMiddleware } from '../middleware/auth.js';
import logger from '../utils/logger.js';

const router = express.Router();

const activitySchema = Joi.object({
  session_id: Joi.string().max(80).required(),
  event_type: Joi.string().max(40).required(),
  path: Joi.string().max(240).allow('', null),
  from_path: Joi.string().max(240).allow('', null),
  duration_ms: Joi.number().integer().min(0).max(6 * 60 * 60 * 1000).optional(),
  metadata: Joi.object().optional()
});

router.post('/activity', authMiddleware, async (req, res) => {
  try {
    if (!req.user?.curator_id || !req.user?.is_demo) {
      return res.status(403).json({ error: 'Demo account access required' });
    }

    const { error, value } = activitySchema.validate(req.body || {}, { abortEarly: false });
    if (error) {
      return res.status(400).json({ error: error.details?.[0]?.message || 'Invalid payload' });
    }

    const metadataJson = value.metadata ? JSON.stringify(value.metadata) : null;
    const queries = getQueries();
    queries.insertDemoActivity.run(
      req.user.curator_id,
      req.user.id,
      value.session_id,
      value.event_type,
      value.path || null,
      value.from_path || null,
      value.duration_ms ?? null,
      metadataJson
    );

    res.json({ success: true });
  } catch (error) {
    logger.error('DEMO_ACTIVITY', 'Failed to log demo activity', error);
    res.status(500).json({ error: 'Failed to log demo activity' });
  }
});

export default router;
