import express from 'express';
import Joi from 'joi';
import { authMiddleware } from '../middleware/auth.js';
import { validateCSRFToken } from '../middleware/csrfProtection.js';
import { testerFeedbackLimiter } from '../middleware/rateLimiting.js';
import logger from '../utils/logger.js';
import { getQueries } from '../database/db.js';
import {
  ensureTesterAccess,
  isTesterFeedbackEnabled,
  createFeedbackEntries
} from '../services/testerFeedbackService.js';
import { enqueueFeedbackSync } from '../services/testerFeedbackSyncService.js';

const router = express.Router();

const feedbackSchema = Joi.object({
  entries: Joi.array()
    .items(Joi.object({
      action_id: Joi.string().trim().max(64).required(),
      url: Joi.string().uri({ allowRelative: true }).max(2048).required(),
      message: Joi.string().max(4000).required(),
      metadata: Joi.object().optional(),
      route: Joi.string().optional(),
      userAgent: Joi.string().optional()
    }))
    .min(1)
    .max(10)
    .required()
});

router.post('/batch', authMiddleware, validateCSRFToken, testerFeedbackLimiter, async (req, res) => {
  try {
    if (!isTesterFeedbackEnabled()) {
      return res.status(403).json({
        error: 'Tester feedback disabled',
        request_id: req.requestId
      });
    }

    ensureTesterAccess(req.user);

    const { error, value } = feedbackSchema.validate(req.body || {}, { abortEarly: false });
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map((detail) => detail.message),
        request_id: req.requestId
      });
    }

    const queries = getQueries();
    let curatorRecord = null;
    if (req.user.curator_id) {
      try {
        curatorRecord = queries.getCuratorById.get(req.user.curator_id);
      } catch (curatorError) {
        logger.warn('TESTER_FEEDBACK', 'Failed to load curator for feedback metadata', {
          error: curatorError?.message,
          userId: req.user.id,
          curatorId: req.user.curator_id
        });
      }
    }

    const inserted = createFeedbackEntries({
      user: req.user,
      entries: value.entries,
      requestId: req.requestId,
      curator: curatorRecord
    });

    const acknowledgedCount = inserted.length;
    const acceptedCount = inserted.filter((entry) => !entry.duplicate).length;
    const actionIds = inserted.map((entry) => entry.action_id);

    if (acknowledgedCount > 0) {
      enqueueFeedbackSync();
    }

    logger.info('TESTER_FEEDBACK', 'Feedback batch accepted', {
      userId: req.user.id,
      curatorId: req.user.curator_id,
      accepted: acceptedCount,
      duplicates: acknowledgedCount - acceptedCount,
      request_id: req.requestId
    });

    return res.status(201).json({
      success: true,
      accepted: acceptedCount,
      action_ids: actionIds,
      request_id: req.requestId
    });
  } catch (error) {
    if (error?.code === 'TESTER_ONLY') {
      return res.status(403).json({
        error: 'Tester access required',
        request_id: req.requestId
      });
    }

    if (error?.code === 'FEATURE_DISABLED') {
      return res.status(403).json({
        error: 'Tester feedback disabled',
        request_id: req.requestId
      });
    }

    logger.error('TESTER_FEEDBACK', 'Failed to capture feedback batch', error, {
      userId: req.user?.id,
      request_id: req.requestId
    });

    return res.status(500).json({
      error: 'Failed to record feedback',
      request_id: req.requestId
    });
  }
});

export default router;
