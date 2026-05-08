import express from 'express';
import Joi from 'joi';
import crypto from 'crypto';
import { getQueries } from '../../database/db.js';
import { authMiddleware, requireAdmin } from '../../middleware/auth.js';
import { sendReferralSubmissionEmail } from '../../utils/emailService.js';

const router = express.Router();

// All admin referral routes require authenticated admin
router.use(authMiddleware, requireAdmin);

const issueSchema = Joi.object({
  email: Joi.string().email().required(),
  curator_name: Joi.string().max(120).optional(),
  curator_type: Joi.string().max(64).optional(),
  tester: Joi.boolean().optional()
});

function generateCode(length = 14) {
  return crypto.randomBytes(Math.ceil(length * 0.75))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
    .slice(0, length)
    .toUpperCase();
}

// POST /api/v1/admin/referrals/issue
router.post('/issue', async (req, res) => {
  try {
    const { error, value } = issueSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { email, curator_name, curator_type, tester } = value;

    // Validate curator_type against admin-defined + defaults (best-effort)
    let finalType = curator_type;
    try {
      const { getDatabase } = await import('../../database/db.js');
      const db = getDatabase();
      const configs = db.prepare(`
        SELECT config_key FROM admin_system_config 
        WHERE config_key LIKE 'curator_type_%' AND config_key NOT LIKE 'curator_type_color_%'
      `).all();
      const defaultTypes = ['curator','label','label-ar','artist-manager','musician','dj','magazine','blog','podcast','venue','radio-station','producer'];
      const customTypes = configs.map(c => c.config_key.replace('curator_type_',''));
      const allowed = new Set([...defaultTypes, ...customTypes]);
      if (finalType && !allowed.has(finalType)) {
        return res.status(400).json({ error: 'Invalid curator type' });
      }
    } catch (_) {
      // On error, fall through without blocking
    }

    const baseCode = generateCode(14);
    const code = tester ? `TESTER-${baseCode}` : baseCode;
    const queries = getQueries();
    const nameParam = curator_name && curator_name.trim() ? curator_name.trim() : 'Pending';
    const typeParam = (finalType && finalType.trim()) ? finalType.trim() : 'curator';
    queries.createReferral.run(code, nameParam, typeParam, email, req.user.id, null);

    let emailSent = true;
    try {
      await sendReferralSubmissionEmail({
        email,
        referralCode: code,
        inviteeName: nameParam,
        issuerName: req.user?.username || 'Flowerpil Team'
      });
    } catch (emailError) {
      emailSent = false;
      console.error('[ADMIN_REFERRALS_ISSUE] Failed to send referral email', {
        error: emailError?.message || emailError,
        email,
        code
      });
    }

    return res.status(201).json({ success: true, data: { code, email, curator_name: nameParam, curator_type: typeParam, emailSent, tester: !!tester } });
  } catch (err) {
    console.error('[ADMIN_REFERRALS_ISSUE] Error:', err);
    return res.status(500).json({ error: 'Failed to issue referral' });
  }
});

// GET /api/v1/admin/referrals
router.get('/', async (req, res) => {
  try {
    const { limit = 50, status } = req.query;
    const queries = getQueries();
    let list = queries.adminListAllReferrals.all();
    if (status) {
      list = list.filter(r => r.status === status);
    }
    const lim = Math.max(1, Math.min(parseInt(limit, 10) || 50, 200));

    // Enrich with issuer labels (admin username or curator name)
    try {
      const { getDatabase } = await import('../../database/db.js');
      const db = getDatabase();
      const adminIds = [...new Set(list.map(r => r.issued_by_user_id).filter(Boolean))];
      const curatorIds = [...new Set(list.map(r => r.issued_by_curator_id).filter(Boolean))];

      const adminMap = new Map();
      const curatorMap = new Map();
      if (adminIds.length) {
        const placeholders = adminIds.map(() => '?').join(',');
        const rows = db.prepare(`SELECT id, username FROM admin_users WHERE id IN (${placeholders})`).all(...adminIds);
        rows.forEach(r => adminMap.set(r.id, r.username));
      }
      if (curatorIds.length) {
        const placeholders = curatorIds.map(() => '?').join(',');
        const rows = db.prepare(`SELECT id, name FROM curators WHERE id IN (${placeholders})`).all(...curatorIds);
        rows.forEach(r => curatorMap.set(r.id, r.name));
      }

      list = list.map(r => {
        let issued_by_label = '';
        if (r.issued_by_curator_id && curatorMap.has(r.issued_by_curator_id)) {
          issued_by_label = `curator: ${curatorMap.get(r.issued_by_curator_id)}`;
        } else if (r.issued_by_user_id && adminMap.has(r.issued_by_user_id)) {
          issued_by_label = `admin: ${adminMap.get(r.issued_by_user_id)}`;
        }
        return { ...r, issued_by_label };
      });
    } catch (_) {}

    return res.json({ success: true, data: list.slice(0, lim) });
  } catch (err) {
    console.error('[ADMIN_REFERRALS_LIST] Error:', err);
    return res.status(500).json({ error: 'Failed to list referrals' });
  }
});

// DELETE /api/v1/admin/referrals/:code - Remove a referral by code
router.delete('/:code', (req, res) => {
  try {
    const code = req.params.code;
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Invalid referral code' });
    }
    const queries = getQueries();
    const result = queries.deleteReferralByCode.run(code);
    return res.json({ success: true, deleted: result.changes || 0 });
  } catch (err) {
    console.error('[ADMIN_REFERRALS_DELETE] Error:', err);
    return res.status(500).json({ error: 'Failed to delete referral' });
  }
});

export default router;
