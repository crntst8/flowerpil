import express from 'express';
import Joi from 'joi';
import { getLogEntries } from '../../utils/logBuffer.js';
import { getFeedbackByAction } from '../../services/testerFeedbackService.js';
import logger from '../../utils/logger.js';

const router = express.Router();

const requestSchema = Joi.object({
  action_id: Joi.string().optional(),
  request_id: Joi.string().optional(),
  created_at: Joi.string().optional(),
  typing_started_at: Joi.string().optional(),
  pre_window_ms: Joi.number().integer().min(0).max(60000).default(5000),
  post_window_ms: Joi.number().integer().min(0).max(60000).default(5000)
});

const SERVICE_KEY = process.env.LOGGING_SERVICE_KEY || '';

const authorize = (req, res, next) => {
  if (!SERVICE_KEY) {
    return res.status(503).json({ error: 'Logging service key not configured' });
  }
  const headerKey = req.headers['x-logging-service-key'];
  if (!headerKey || headerKey !== SERVICE_KEY) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  return next();
};

router.post('/logs', authorize, async (req, res) => {
  try {
    const { error, value } = requestSchema.validate(req.body || {}, { abortEarly: false });
    if (error) {
      return res.status(400).json({ error: 'Validation failed', details: error.details.map((d) => d.message) });
    }

    let baseRequestId = value.request_id || null;
    let typingStartedAt = value.typing_started_at || null;
    let createdAt = value.created_at || null;

    if (!baseRequestId && value.action_id) {
      const feedbackRecord = getFeedbackByAction(value.action_id);
      if (feedbackRecord) {
        baseRequestId = baseRequestId || feedbackRecord.request_id;
        createdAt = createdAt || feedbackRecord.created_at;
        if (!typingStartedAt) {
          typingStartedAt = feedbackRecord.metadata?.client?.typing_started_at || null;
        }
      }
    }

    const nowMs = Date.now();
    const createdMs = createdAt ? Date.parse(createdAt) : nowMs;
    const typingMs = typingStartedAt ? Date.parse(typingStartedAt) : createdMs;

    const startMs = Math.max(0, typingMs - value.pre_window_ms);
    const endMs = createdMs + value.post_window_ms;

    const logs = getLogEntries({
      requestId: baseRequestId || undefined,
      startMs,
      endMs
    });

    return res.json({
      success: true,
      request_id: baseRequestId,
      start: new Date(startMs).toISOString(),
      end: new Date(endMs).toISOString(),
      entries: logs
    });
  } catch (error) {
    logger.error('TESTER_FEEDBACK_LOGS', 'Failed to collect correlated logs', error, {
      requestId: req.body?.request_id,
      actionId: req.body?.action_id
    });
    return res.status(500).json({ error: 'Failed to collect logs' });
  }
});

export default router;
