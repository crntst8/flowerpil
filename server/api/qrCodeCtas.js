/**
 * Public API endpoint for fetching QR Code CTAs with A/B testing
 * Route: /api/v1/qr-ctas
 */

import express from 'express';
import { getDatabase } from '../database/db.js';
import { apiLoggingMiddleware } from '../middleware/logging.js';

const router = express.Router();
const db = getDatabase();

router.use(apiLoggingMiddleware);

/**
 * Determine which variant to serve based on round-robin assignment
 * @param {Object} cta - The CTA record
 * @param {string|null} requestedVariant - Optional variant from client (A or B)
 * @returns {string} - 'A' or 'B'
 */
function assignVariant(cta, requestedVariant) {
  // If client already has an assigned variant, respect it
  if (requestedVariant === 'A' || requestedVariant === 'B') {
    return requestedVariant;
  }

  // Round-robin assignment: even = A, odd = B
  const counter = cta.assignment_counter || 0;
  const variant = counter % 2 === 0 ? 'A' : 'B';

  // Increment the counter for next assignment
  db.prepare('UPDATE qr_code_ctas SET assignment_counter = assignment_counter + 1 WHERE id = ?').run(cta.id);

  return variant;
}

/**
 * Get variant-specific CTA data
 */
function getVariantData(cta, variant) {
  if (variant === 'A') {
    return {
      id: cta.id,
      variant: 'A',
      headline: cta.variant_a_headline || cta.headline,
      link: cta.variant_a_link || cta.cta_link,
      cta_text: cta.variant_a_cta_text || cta.cta_text,
      name: cta.name
    };
  } else {
    return {
      id: cta.id,
      variant: 'B',
      headline: cta.variant_b_headline || cta.headline,
      link: cta.variant_b_link || cta.cta_link,
      cta_text: cta.variant_b_cta_text || cta.cta_text,
      name: cta.name
    };
  }
}

/**
 * Record an analytics event
 */
function recordEvent(ctaId, variant, eventType, playlistId, timeToAction = null) {
  try {
    db.prepare(`
      INSERT INTO qr_cta_analytics (cta_id, variant, event_type, playlist_id, time_to_action)
      VALUES (?, ?, ?, ?, ?)
    `).run(ctaId, variant, eventType, playlistId, timeToAction);
  } catch (error) {
    console.error(`[PM2_ERROR] Failed to record QR CTA analytics: ${error.message}`);
  }
}

// GET /api/v1/qr-ctas?playlistId=<ID>&variant=<A|B> - Get the active CTA for a playlist
router.get('/', (req, res) => {
  try {
    const { playlistId, variant: requestedVariant } = req.query;
    if (!playlistId) {
      return res.status(400).json({ success: false, error: 'playlistId is required' });
    }

    const playlist = db.prepare('SELECT curator_id FROM playlists WHERE id = ?').get(playlistId);
    if (!playlist) {
      return res.status(404).json({ success: false, error: 'Playlist not found' });
    }

    let cta = null;

    // 1. Look for a curator-specific CTA
    if (playlist.curator_id) {
      cta = db.prepare(
        'SELECT * FROM qr_code_ctas WHERE target_curator_id = ? AND enabled = 1'
      ).get(playlist.curator_id);
    }

    // 2. If no curator-specific CTA, look for a global one
    if (!cta) {
      cta = db.prepare(
        'SELECT * FROM qr_code_ctas WHERE target_curator_id IS NULL AND enabled = 1'
      ).get();
    }

    if (cta) {
      // Assign variant (respects client-stored variant or assigns via round-robin)
      const variant = assignVariant(cta, requestedVariant);

      // Record impression event in analytics table
      recordEvent(cta.id, variant, 'impression', parseInt(playlistId, 10));

      // Also increment legacy impressions counter for backwards compat
      db.prepare('UPDATE qr_code_ctas SET impressions = impressions + 1 WHERE id = ?').run(cta.id);

      // Return variant-specific data
      const variantData = getVariantData(cta, variant);
      variantData.playlist_id = parseInt(playlistId, 10);

      res.json({ success: true, data: variantData });
    } else {
      res.json({ success: true, data: null });
    }
  } catch (error) {
    console.error(`[PM2_ERROR] Public QR CTA fetch error: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to fetch QR code CTA' });
  }
});

// POST /api/v1/qr-ctas/:id/track - Track click or dismiss events with timing
router.post('/:id/track', (req, res) => {
  try {
    const { id } = req.params;
    const { variant, eventType, timeToAction, playlistId } = req.body;

    if (!variant || !eventType) {
      return res.status(400).json({ success: false, error: 'variant and eventType are required' });
    }

    if (!['click', 'dismiss'].includes(eventType)) {
      return res.status(400).json({ success: false, error: 'eventType must be click or dismiss' });
    }

    const cta = db.prepare('SELECT id FROM qr_code_ctas WHERE id = ?').get(id);
    if (!cta) {
      return res.status(404).json({ success: false, error: 'QR code CTA not found' });
    }

    // Record the event
    recordEvent(parseInt(id, 10), variant, eventType, playlistId || null, timeToAction || null);

    // Also increment legacy clicks counter for backwards compat
    if (eventType === 'click') {
      db.prepare('UPDATE qr_code_ctas SET clicks = clicks + 1 WHERE id = ?').run(id);
    }

    res.status(204).send();
  } catch (error) {
    console.error(`[PM2_ERROR] QR CTA track error: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to track event' });
  }
});

// Legacy endpoint - redirect to new track endpoint
// POST /api/v1/qr-ctas/:id/click
router.post('/:id/click', (req, res) => {
  try {
    const { id } = req.params;
    const result = db.prepare('UPDATE qr_code_ctas SET clicks = clicks + 1 WHERE id = ?').run(id);

    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'QR code CTA not found' });
    }

    res.status(204).send();
  } catch (error) {
    console.error(`[PM2_ERROR] QR CTA click track error: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to track click' });
  }
});

export default router;
