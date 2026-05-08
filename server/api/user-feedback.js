import express from 'express';
import Joi from 'joi';
import { authMiddleware, requireAdmin } from '../middleware/auth.js';
import { validateCSRFToken } from '../middleware/csrfProtection.js';
import logger from '../utils/logger.js';
import { sendAdminEmail } from '../utils/emailService.js';
import { 
  createUserReport, 
  getUserReports, 
  resolveUserReport 
} from '../services/userFeedbackService.js';

const router = express.Router();

const reportSchema = Joi.object({
  page_url: Joi.string().uri({ allowRelative: true }).max(2048).required(),
  content: Joi.string().max(4000).required(),
  metadata: Joi.object().optional()
});

// Submit feedback (Authenticated Curators)
router.post('/', authMiddleware, validateCSRFToken, async (req, res) => {
  try {
    const { error, value } = reportSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const reportId = createUserReport({
      userId: req.user.id,
      pageUrl: value.page_url,
      content: value.content,
      metadata: value.metadata
    });

    logger.info('USER_FEEDBACK', 'New user report created', {
        userId: req.user.id,
        reportId
    });

    res.status(201).json({ success: true, id: reportId });
  } catch (error) {
    logger.error('USER_FEEDBACK', 'Failed to create report', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: List reports
router.get('/admin', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { status = 'open', limit = 50, offset = 0 } = req.query;
    const reports = getUserReports({ status, limit, offset });
    res.json({ success: true, data: reports });
  } catch (error) {
    logger.error('USER_FEEDBACK', 'Failed to list reports', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Resolve report
router.put('/admin/:id/resolve', authMiddleware, requireAdmin, async (req, res) => {
    try {
        resolveUserReport(req.params.id);
        res.json({ success: true });
    } catch (error) {
        logger.error('USER_FEEDBACK', 'Failed to resolve report', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Admin: Reply via Email
router.post('/admin/:id/reply', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const { subject, body, recipientEmail } = req.body;
        
        if (!subject || !body || !recipientEmail) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Use sendAdminEmail utility
        await sendAdminEmail({
            to: recipientEmail,
            subject: subject,
            body: body,
            replyTo: 'dev@flowerpil.com'
        });

        res.json({ success: true });
    } catch (error) {
        logger.error('USER_FEEDBACK', 'Failed to send reply', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
