/**
 * Public API endpoints for announcements
 * Route: /api/v1/announcements
 */

import express from 'express';
import { getDatabase } from '../database/db.js';
import { apiLoggingMiddleware } from '../middleware/logging.js';
import { optionalAuth } from '../middleware/auth.js';

const router = express.Router();
const db = getDatabase();

router.use(apiLoggingMiddleware);
router.use(optionalAuth);

// Helper: Check if user matches targeting rules
function matchesTargets(targets, user) {
  if (!targets || targets.length === 0) return true; // No targets = show to all

  // Check for user_type targets first
  const userTypeTargets = targets.filter(t => t.target_type === 'user_type');
  if (userTypeTargets.length > 0) {
    // Map user data to target values
    const userTypes = [];

    // Unauthenticated users
    if (!user.id || user.type === 'anonymous') {
      userTypes.push('unauthenticated');
    } else {
      // Authenticated users - check their role
      if (user.type === 'curator' || user.role === 'curator') userTypes.push('curator');
      if (user.type === 'admin' || user.role === 'admin' || user.isAdmin) userTypes.push('admin');
    }

    // Check if any user type matches
    const matchesUserType = userTypeTargets.some(t => userTypes.includes(t.target_value));
    if (matchesUserType) return true;
  }

  // Check other target types
  for (const target of targets) {
    if (target.target_type === 'user_type') continue; // Already handled above

    if (target.target_type === 'curator_id' && user.id && String(user.id) === target.target_value) return true;
    if (target.target_type === 'tag' && user.id) {
      const hasTag = db.prepare(
        'SELECT 1 FROM curator_tags WHERE curator_id = ? AND tag = ?'
      ).get(user.id, target.target_value);
      if (hasTag) return true;
    }
  }

  // If we have user_type targets but none matched, return false
  if (userTypeTargets.length > 0) return false;

  return false;
}

// Helper: Check schedule
function isScheduleValid(schedule, user) {
  if (!schedule) return true;
  if (schedule.manual_override) return true;

  const now = new Date();

  // Check absolute dates
  if (schedule.start_date && new Date(schedule.start_date) > now) return false;
  if (schedule.end_date && new Date(schedule.end_date) < now) return false;

  // Check relative trigger
  if (schedule.relative_trigger && schedule.relative_delay_days) {
    let triggerDate = null;
    if (schedule.relative_trigger === 'signup' && user.created_at) {
      triggerDate = new Date(user.created_at);
    }
    // Add more triggers as needed

    if (triggerDate) {
      const showAfter = new Date(triggerDate);
      showAfter.setDate(showAfter.getDate() + schedule.relative_delay_days);
      if (now < showAfter) return false;
    }
  }

  return true;
}

// Helper: Check persistence rules
function checkPersistence(persistence, view, showNextVisitAfter) {
  // Check "show next visit" override - if set and user's last view is before it, show once
  if (showNextVisitAfter && view) {
    const triggerTime = new Date(showNextVisitAfter);
    const lastSeen = view.last_seen_at ? new Date(view.last_seen_at) : null;

    // If user's last view was before the trigger, show once
    if (lastSeen && lastSeen < triggerTime) {
      return true; // Override persistence, show once
    }
  }

  if (!persistence || persistence.show_mode === 'once') {
    return !view || !view.dismissed_permanently;
  }

  if (persistence.show_mode === 'until_cta') {
    return !view || !view.cta_clicked;
  }

  if (persistence.show_mode === 'max_times') {
    if (!view) return true;
    if (view.dismissed_permanently) return false;
    if (view.view_count >= (persistence.max_show_count || 1)) return false;

    // Check gap
    if (persistence.gap_hours && view.last_seen_at) {
      const lastSeen = new Date(view.last_seen_at);
      const gapMs = persistence.gap_hours * 60 * 60 * 1000;
      if (Date.now() - lastSeen.getTime() < gapMs) return false;
    }
    return true;
  }

  // Cooldown mode: show again after gap_hours, no max count
  // Note: dismissed_permanently is intentionally NOT checked here because
  // cooldown mode should repeat forever per the spec
  if (persistence.show_mode === 'cooldown') {
    if (!view) return true;

    // Check if enough time has passed since last dismissal
    if (persistence.gap_hours && view.dismissed_at) {
      const dismissedAt = new Date(view.dismissed_at);
      const gapMs = persistence.gap_hours * 60 * 60 * 1000;
      if (Date.now() - dismissedAt.getTime() < gapMs) return false;
    }
    return true;
  }

  return true;
}

// GET active announcements for current user/page
router.get('/active', (req, res) => {
  try {
    const { page } = req.query;
    const user = req.user || { id: null, type: 'anonymous' };

    // Get all active announcements
    const announcements = db.prepare(`
      SELECT a.*,
        asch.start_date, asch.end_date, asch.relative_trigger, asch.relative_delay_days, asch.manual_override,
        ap.show_mode, ap.max_show_count, ap.gap_hours
      FROM announcements a
      LEFT JOIN announcement_schedule asch ON asch.announcement_id = a.id
      LEFT JOIN announcement_persistence ap ON ap.announcement_id = a.id
      WHERE a.status = 'active'
      ORDER BY a.priority DESC
    `).all();

    const result = [];

    for (const announcement of announcements) {
      // Check placement
      if (announcement.placement === 'page_specific') {
        const targetPages = announcement.target_pages ? JSON.parse(announcement.target_pages) : [];
        if (targetPages.length > 0 && !targetPages.includes(page)) continue;
      }

      // Get targets
      const targets = db.prepare(
        'SELECT * FROM announcement_targets WHERE announcement_id = ?'
      ).all(announcement.id);

      // Check targeting
      if (!matchesTargets(targets, user)) continue;

      // Check schedule
      const schedule = {
        start_date: announcement.start_date,
        end_date: announcement.end_date,
        relative_trigger: announcement.relative_trigger,
        relative_delay_days: announcement.relative_delay_days,
        manual_override: announcement.manual_override
      };
      if (!isScheduleValid(schedule, user)) continue;

      // Get user's view record
      const view = user.id ? db.prepare(
        'SELECT * FROM announcement_views WHERE announcement_id = ? AND user_id = ?'
      ).get(announcement.id, user.id) : null;

      // Check persistence
      const persistence = {
        show_mode: announcement.show_mode,
        max_show_count: announcement.max_show_count,
        gap_hours: announcement.gap_hours
      };
      if (!checkPersistence(persistence, view, announcement.show_next_visit_after)) continue;

      // Get content variant
      const variants = db.prepare(
        'SELECT * FROM announcement_content WHERE announcement_id = ?'
      ).all(announcement.id);

      let content = variants[0]; // Default to first
      if (variants.length > 1 && user.id) {
        // A/B split based on user id
        const variantIndex = user.id % variants.length;
        content = variants[variantIndex];
      }

      if (content) {
        result.push({
          id: announcement.id,
          format: announcement.format,
          placement: announcement.placement,
          priority: announcement.priority,
          display_delay: announcement.display_delay || 0,
          variant: content.variant,
          blocks: JSON.parse(content.blocks),
          header_style: content.header_style ? JSON.parse(content.header_style) : null
        });
      }
    }

    res.json({ success: true, data: result });
  } catch (error) {
    console.error(`[PM2_ERROR] Announcements active error: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to fetch announcements' });
  }
});

// POST record view
router.post('/:id/view', (req, res) => {
  try {
    const { id } = req.params;
    const { variant } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.json({ success: true }); // Anonymous users - don't track
    }

    const existing = db.prepare(
      'SELECT * FROM announcement_views WHERE announcement_id = ? AND user_id = ?'
    ).get(id, userId);

    if (existing) {
      db.prepare(`
        UPDATE announcement_views
        SET view_count = view_count + 1, last_seen_at = CURRENT_TIMESTAMP
        WHERE announcement_id = ? AND user_id = ?
      `).run(id, userId);
    } else {
      db.prepare(`
        INSERT INTO announcement_views (announcement_id, user_id, variant_shown)
        VALUES (?, ?, ?)
      `).run(id, userId, variant);
    }

    res.json({ success: true });
  } catch (error) {
    console.error(`[PM2_ERROR] Announcement view error: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to record view' });
  }
});

// POST record dismissal
router.post('/:id/dismiss', (req, res) => {
  try {
    const { id } = req.params;
    const { button, permanent } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.json({ success: true });
    }

    const existing = db.prepare(
      'SELECT * FROM announcement_views WHERE announcement_id = ? AND user_id = ?'
    ).get(id, userId);

    if (existing) {
      db.prepare(`
        UPDATE announcement_views
        SET dismissed_at = CURRENT_TIMESTAMP,
            cta_clicked = COALESCE(?, cta_clicked),
            dismissed_permanently = ?
        WHERE announcement_id = ? AND user_id = ?
      `).run(button || null, permanent ? 1 : 0, id, userId);
    } else {
      db.prepare(`
        INSERT INTO announcement_views (announcement_id, user_id, dismissed_at, cta_clicked, dismissed_permanently)
        VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?)
      `).run(id, userId, button || null, permanent ? 1 : 0);
    }

    res.json({ success: true });
  } catch (error) {
    console.error(`[PM2_ERROR] Announcement dismiss error: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to record dismissal' });
  }
});

export default router;
