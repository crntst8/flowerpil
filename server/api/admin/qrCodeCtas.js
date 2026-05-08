/**
 * Admin API endpoints for QR Code CTA management with A/B testing
 * Route: /api/v1/admin/qr-ctas
 */

import express from 'express';
import { getDatabase } from '../../database/db.js';
import { apiLoggingMiddleware } from '../../middleware/logging.js';
import { authMiddleware } from '../../middleware/auth.js';

const router = express.Router();
const db = getDatabase();

// Middleware for admin-only access
router.use(apiLoggingMiddleware);
router.use(authMiddleware);

// GET /api/v1/admin/qr-ctas - List all QR code CTAs
router.get('/', (_req, res) => {
  try {
    const ctas = db.prepare('SELECT * FROM qr_code_ctas ORDER BY created_at DESC').all();
    res.json({ success: true, data: ctas });
  } catch (error) {
    console.error(`[PM2_ERROR] Admin list QR CTAs error: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to fetch QR code CTAs' });
  }
});

// GET /api/v1/admin/qr-ctas/analytics - Get A/B test analytics
router.get('/analytics', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const ctaId = req.query.ctaId; // Optional: filter by specific CTA

    const whereClause = ctaId
      ? `WHERE cta_id = ? AND created_at >= datetime('now', '-' || ? || ' days')`
      : `WHERE created_at >= datetime('now', '-' || ? || ' days')`;
    const params = ctaId ? [ctaId, days] : [days];

    // Get analytics for variant A
    const variantAStats = db.prepare(`
      SELECT
        COUNT(CASE WHEN event_type = 'impression' THEN 1 END) as impressions,
        COUNT(CASE WHEN event_type = 'click' THEN 1 END) as clicks,
        COUNT(CASE WHEN event_type = 'dismiss' THEN 1 END) as dismissals,
        AVG(CASE WHEN event_type = 'click' AND time_to_action IS NOT NULL THEN time_to_action END) as avg_time_to_click,
        AVG(CASE WHEN event_type = 'dismiss' AND time_to_action IS NOT NULL THEN time_to_action END) as avg_time_to_dismiss
      FROM qr_cta_analytics
      ${whereClause} AND variant = 'A'
    `).get(...params);

    // Get analytics for variant B
    const variantBStats = db.prepare(`
      SELECT
        COUNT(CASE WHEN event_type = 'impression' THEN 1 END) as impressions,
        COUNT(CASE WHEN event_type = 'click' THEN 1 END) as clicks,
        COUNT(CASE WHEN event_type = 'dismiss' THEN 1 END) as dismissals,
        AVG(CASE WHEN event_type = 'click' AND time_to_action IS NOT NULL THEN time_to_action END) as avg_time_to_click,
        AVG(CASE WHEN event_type = 'dismiss' AND time_to_action IS NOT NULL THEN time_to_action END) as avg_time_to_dismiss
      FROM qr_cta_analytics
      ${whereClause} AND variant = 'B'
    `).get(...params);

    // Calculate click-through rates and dismissal rates
    const variantA = {
      impressions: variantAStats.impressions || 0,
      clicks: variantAStats.clicks || 0,
      dismissals: variantAStats.dismissals || 0,
      clickThroughRate: variantAStats.impressions > 0
        ? ((variantAStats.clicks / variantAStats.impressions) * 100).toFixed(2)
        : '0.00',
      dismissalRate: variantAStats.impressions > 0
        ? ((variantAStats.dismissals / variantAStats.impressions) * 100).toFixed(2)
        : '0.00',
      avgTimeToClick: variantAStats.avg_time_to_click
        ? Math.round(variantAStats.avg_time_to_click)
        : null,
      avgTimeToDismiss: variantAStats.avg_time_to_dismiss
        ? Math.round(variantAStats.avg_time_to_dismiss)
        : null
    };

    const variantB = {
      impressions: variantBStats.impressions || 0,
      clicks: variantBStats.clicks || 0,
      dismissals: variantBStats.dismissals || 0,
      clickThroughRate: variantBStats.impressions > 0
        ? ((variantBStats.clicks / variantBStats.impressions) * 100).toFixed(2)
        : '0.00',
      dismissalRate: variantBStats.impressions > 0
        ? ((variantBStats.dismissals / variantBStats.impressions) * 100).toFixed(2)
        : '0.00',
      avgTimeToClick: variantBStats.avg_time_to_click
        ? Math.round(variantBStats.avg_time_to_click)
        : null,
      avgTimeToDismiss: variantBStats.avg_time_to_dismiss
        ? Math.round(variantBStats.avg_time_to_dismiss)
        : null
    };

    res.json({
      success: true,
      data: {
        period: {
          days: days,
          startDate: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date().toISOString()
        },
        variantA,
        variantB,
        totals: {
          impressions: variantA.impressions + variantB.impressions,
          clicks: variantA.clicks + variantB.clicks,
          dismissals: variantA.dismissals + variantB.dismissals
        }
      }
    });
  } catch (error) {
    console.error(`[PM2_ERROR] Admin QR CTA analytics fetch error: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to fetch QR CTA analytics' });
  }
});

// POST /api/v1/admin/qr-ctas - Create a new QR code CTA with A/B variants
router.post('/', (req, res) => {
  try {
    const {
      name,
      enabled,
      target_curator_id,
      variant_a_headline,
      variant_a_link,
      variant_a_cta_text,
      variant_b_headline,
      variant_b_link,
      variant_b_cta_text,
      // Legacy fields for backwards compat
      headline,
      cta_link,
      cta_text
    } = req.body;

    // Require name and at least variant A fields (or legacy fields)
    const hasVariantA = variant_a_headline && variant_a_link && variant_a_cta_text;
    const hasLegacy = headline && cta_link && cta_text;

    if (!name || (!hasVariantA && !hasLegacy)) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    // Use variant A or fall back to legacy
    const aHeadline = variant_a_headline || headline;
    const aLink = variant_a_link || cta_link;
    const aCtaText = variant_a_cta_text || cta_text;
    // Use variant B or default to same as A
    const bHeadline = variant_b_headline || aHeadline;
    const bLink = variant_b_link || aLink;
    const bCtaText = variant_b_cta_text || aCtaText;

    const result = db.prepare(`
      INSERT INTO qr_code_ctas (
        name, headline, cta_link, cta_text, enabled, target_curator_id,
        variant_a_headline, variant_a_link, variant_a_cta_text,
        variant_b_headline, variant_b_link, variant_b_cta_text,
        assignment_counter
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      name,
      aHeadline, aLink, aCtaText, // Legacy fields
      enabled ? 1 : 0,
      target_curator_id || null,
      aHeadline, aLink, aCtaText,
      bHeadline, bLink, bCtaText
    );

    const newCtaId = result.lastInsertRowid;
    const newCta = db.prepare('SELECT * FROM qr_code_ctas WHERE id = ?').get(newCtaId);

    res.status(201).json({ success: true, data: newCta });
  } catch (error) {
    console.error(`[PM2_ERROR] Admin create QR CTA error: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to create QR code CTA' });
  }
});

// PUT /api/v1/admin/qr-ctas/:id - Update a QR code CTA with A/B variants
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      enabled,
      target_curator_id,
      variant_a_headline,
      variant_a_link,
      variant_a_cta_text,
      variant_b_headline,
      variant_b_link,
      variant_b_cta_text,
      // Legacy fields for backwards compat
      headline,
      cta_link,
      cta_text
    } = req.body;

    // Require name and at least variant A fields (or legacy fields)
    const hasVariantA = variant_a_headline && variant_a_link && variant_a_cta_text;
    const hasLegacy = headline && cta_link && cta_text;

    if (!name || (!hasVariantA && !hasLegacy)) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    // Use variant A or fall back to legacy
    const aHeadline = variant_a_headline || headline;
    const aLink = variant_a_link || cta_link;
    const aCtaText = variant_a_cta_text || cta_text;
    // Use variant B or default to same as A
    const bHeadline = variant_b_headline || aHeadline;
    const bLink = variant_b_link || aLink;
    const bCtaText = variant_b_cta_text || aCtaText;

    const result = db.prepare(`
      UPDATE qr_code_ctas
      SET name = ?, headline = ?, cta_link = ?, cta_text = ?,
          enabled = ?, target_curator_id = ?,
          variant_a_headline = ?, variant_a_link = ?, variant_a_cta_text = ?,
          variant_b_headline = ?, variant_b_link = ?, variant_b_cta_text = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name,
      aHeadline, aLink, aCtaText, // Legacy fields
      enabled ? 1 : 0,
      target_curator_id || null,
      aHeadline, aLink, aCtaText,
      bHeadline, bLink, bCtaText,
      id
    );

    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'QR code CTA not found' });
    }

    const updatedCta = db.prepare('SELECT * FROM qr_code_ctas WHERE id = ?').get(id);
    res.json({ success: true, data: updatedCta });
  } catch (error) {
    console.error(`[PM2_ERROR] Admin update QR CTA error: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to update QR code CTA' });
  }
});

// DELETE /api/v1/admin/qr-ctas/:id - Delete a QR code CTA
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const result = db.prepare('DELETE FROM qr_code_ctas WHERE id = ?').run(id);

    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'QR code CTA not found' });
    }

    res.status(204).send();
  } catch (error) {
    console.error(`[PM2_ERROR] Admin delete QR CTA error: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to delete QR code CTA' });
  }
});

export default router;
