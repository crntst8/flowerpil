import express from 'express';
import crypto from 'crypto';
import { getDatabase, getQueries } from '../database/db.js';
import { authRateLimit } from '../middleware/auth.js';

const router = express.Router();
const db = getDatabase();
const queries = getQueries();

const AUTO_REFERRAL_CODE_LENGTH = 14;

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const generateReferralCode = (length = AUTO_REFERRAL_CODE_LENGTH) => (
  crypto.randomBytes(Math.ceil(length * 0.75))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
    .slice(0, length)
    .toUpperCase()
);

/**
 * GET /api/v1/linkout/config
 * Returns the active linkout modal configuration if enabled
 */
router.get('/config', (_req, res) => {
  try {
    const config = db.prepare(`
      SELECT
        variant_a_headline,
        variant_a_link,
        variant_b_headline,
        variant_b_link,
        signup_mode,
        target_playlist_id,
        enabled
      FROM linkout_config
      ORDER BY id DESC
      LIMIT 1
    `).get();

    if (!config || !config.enabled) {
      return res.json({
        success: true,
        data: {
          enabled: false
        }
      });
    }

    res.json({
      success: true,
      data: {
        enabled: true,
        variantA: {
          headline: config.variant_a_headline,
          link: config.variant_a_link
        },
        variantB: {
          headline: config.variant_b_headline,
          link: config.variant_b_link
        },
        signupMode: config.signup_mode || 'link',
        targetPlaylistId: config.target_playlist_id || null
      }
    });
  } catch (error) {
    console.error(`[PM2_ERROR] Linkout config fetch error: ${JSON.stringify({
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);

    res.status(500).json({
      success: false,
      error: 'Failed to fetch linkout configuration'
    });
  }
});

/**
 * GET /api/v1/linkout/playlist/:id
 * Returns playlist context for linkout auto-referral behavior
 */
router.get('/playlist/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid playlist id'
      });
    }

    const playlist = queries.getPlaylistById.get(id);
    if (!playlist || !playlist.published) {
      return res.json({
        success: true,
        data: {
          autoReferralEnabled: false
        }
      });
    }

    const autoReferralEnabled = Boolean(playlist.auto_referral_enabled);
    if (!autoReferralEnabled) {
      return res.json({
        success: true,
        data: {
          autoReferralEnabled: false
        }
      });
    }

    return res.json({
      success: true,
      data: {
        autoReferralEnabled: true,
        playlistId: playlist.id,
        playlistTitle: playlist.title,
        curatorId: playlist.curator_id,
        curatorName: playlist.curator_name,
        curatorType: playlist.curator_type
      }
    });
  } catch (error) {
    console.error(`[PM2_ERROR] Linkout playlist fetch error: ${JSON.stringify({
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);

    return res.status(500).json({
      success: false,
      error: 'Failed to fetch playlist context'
    });
  }
});

/**
 * POST /api/v1/linkout/referral
 * Creates or returns an unused referral code for a playlist auto-referral CTA
 *
 * Body: {
 *   playlistId: number,
 *   email: string
 * }
 */
router.post('/referral', authRateLimit, (req, res) => {
  try {
    const { playlistId, email } = req.body || {};
    const id = parseInt(playlistId, 10);
    const normalizedEmail = typeof email === 'string' ? email.trim() : '';

    if (!Number.isFinite(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid playlist id'
      });
    }

    if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        error: 'Valid email is required'
      });
    }

    const playlist = queries.getPlaylistById.get(id);
    if (!playlist || !playlist.published || !playlist.auto_referral_enabled) {
      return res.status(404).json({
        success: false,
        error: 'Playlist is not eligible for auto-referral'
      });
    }

    if (!playlist.curator_id) {
      return res.status(400).json({
        success: false,
        error: 'Playlist curator not found'
      });
    }

    const existing = db.prepare(`
      SELECT code, status
      FROM curator_referrals
      WHERE lower(email) = lower(?)
        AND status = 'unused'
        AND issued_by_curator_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(normalizedEmail, playlist.curator_id);

    if (existing?.code) {
      return res.json({
        success: true,
        data: {
          code: existing.code,
          email: normalizedEmail,
          curator_name: playlist.curator_name,
          curator_type: playlist.curator_type,
          reused: true
        }
      });
    }

    const curatorName = playlist.curator_name || 'Pending';
    const curatorType = playlist.curator_type || 'curator';

    let code = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = generateReferralCode();
      const collision = queries.getReferralByCode.get(candidate);
      if (!collision) {
        code = candidate;
        break;
      }
    }

    if (!code) {
      return res.status(500).json({
        success: false,
        error: 'Failed to generate referral code'
      });
    }

    queries.createReferral.run(
      code,
      curatorName,
      curatorType,
      normalizedEmail,
      null,
      playlist.curator_id
    );

    return res.json({
      success: true,
      data: {
        code,
        email: normalizedEmail,
        curator_name: curatorName,
        curator_type: curatorType
      }
    });
  } catch (error) {
    console.error(`[PM2_ERROR] Linkout referral create error: ${JSON.stringify({
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);

    return res.status(500).json({
      success: false,
      error: 'Failed to create referral'
    });
  }
});

/**
 * POST /api/v1/linkout/track
 * Tracks linkout modal events (impression, click, dismiss)
 *
 * Body: {
 *   variant: 'A' | 'B',
 *   eventType: 'impression' | 'click' | 'dismiss',
 *   timeToAction: number (optional, milliseconds),
 *   userFingerprint: string (optional)
 * }
 */
router.post('/track', (req, res) => {
  try {
    const { variant, eventType, timeToAction, userFingerprint } = req.body;

    // Validate required fields
    if (!variant || !eventType) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: variant and eventType'
      });
    }

    // Validate variant
    if (!['A', 'B'].includes(variant)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid variant. Must be A or B'
      });
    }

    // Validate event type
    if (!['impression', 'click', 'dismiss'].includes(eventType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid eventType. Must be impression, click, or dismiss'
      });
    }

    // Insert analytics event
    db.prepare(`
      INSERT INTO linkout_analytics (
        variant,
        event_type,
        time_to_action,
        user_fingerprint
      ) VALUES (?, ?, ?, ?)
    `).run(
      variant,
      eventType,
      timeToAction || null,
      userFingerprint || null
    );

    res.json({
      success: true
    });
  } catch (error) {
    console.error(`[PM2_ERROR] Linkout track error: ${JSON.stringify({
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })}`);

    res.status(500).json({
      success: false,
      error: 'Failed to track linkout event'
    });
  }
});

export default router;
