import express from 'express';
import crypto from 'crypto';
import { getQueries } from '../database/db.js';

const router = express.Router();

// Hard gate: only allow in non-production environments
router.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }
  next();
});

// Simple code generator (URL-safe)
function generateCode(length = 12) {
  return crypto.randomBytes(Math.ceil(length * 0.75))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
    .slice(0, length);
}

// POST /api/v1/dev/referrals/issue
// Body: { email, curator_name, curator_type }
router.post('/referrals/issue', (req, res) => {
  try {
    const { email, curator_name, curator_type } = req.body || {};
    if (!email) {
      return res.status(400).json({ error: 'email is required' });
    }

    const code = generateCode(14);
    const queries = getQueries();

    // issuer fields set to null in dev
    queries.createReferral.run(code, curator_name || 'Dev Curator', curator_type || 'artist', email, null, null);

    return res.status(201).json({ success: true, code });
  } catch (err) {
    console.error('[DEV_REFERRALS_ISSUE] Error:', err);
    return res.status(500).json({ error: 'Failed to issue referral' });
  }
});

export default router;

