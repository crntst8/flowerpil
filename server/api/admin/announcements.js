/**
 * Admin API endpoints for announcement management
 * Route: /api/v1/admin/announcements
 */

import express from 'express';
import { getDatabase } from '../../database/db.js';
import { apiLoggingMiddleware } from '../../middleware/logging.js';
import { authMiddleware } from '../../middleware/auth.js';
import { webSocketServer } from '../../websocket/index.js';

const router = express.Router();
const db = getDatabase();

router.use(apiLoggingMiddleware);
router.use(authMiddleware);

// GET all announcements
router.get('/', (_req, res) => {
  try {
    const announcements = db.prepare(`
      SELECT
        a.*,
        ac.blocks,
        ac.variant,
        ac.header_style,
        asch.start_date,
        asch.end_date,
        asch.relative_trigger,
        asch.relative_delay_days,
        asch.manual_override,
        ap.show_mode,
        ap.max_show_count,
        ap.gap_hours
      FROM announcements a
      LEFT JOIN announcement_content ac ON ac.announcement_id = a.id
      LEFT JOIN announcement_schedule asch ON asch.announcement_id = a.id
      LEFT JOIN announcement_persistence ap ON ap.announcement_id = a.id
      ORDER BY a.created_at DESC
    `).all();

    // Group by announcement id to handle A/B variants
    const grouped = {};
    for (const row of announcements) {
      if (!grouped[row.id]) {
        grouped[row.id] = {
          id: row.id,
          title: row.title,
          status: row.status,
          format: row.format,
          placement: row.placement,
          target_pages: row.target_pages ? JSON.parse(row.target_pages) : [],
          priority: row.priority,
          display_delay: row.display_delay || 0,
          show_next_visit_after: row.show_next_visit_after,
          created_by: row.created_by,
          created_at: row.created_at,
          updated_at: row.updated_at,
          schedule: {
            start_date: row.start_date,
            end_date: row.end_date,
            relative_trigger: row.relative_trigger,
            relative_delay_days: row.relative_delay_days,
            manual_override: row.manual_override
          },
          persistence: {
            show_mode: row.show_mode || 'once',
            max_show_count: row.max_show_count,
            gap_hours: row.gap_hours
          },
          variants: []
        };
      }
      if (row.blocks) {
        grouped[row.id].variants.push({
          variant: row.variant,
          blocks: JSON.parse(row.blocks),
          header_style: row.header_style ? JSON.parse(row.header_style) : null
        });
      }
    }

    // Get targets for each announcement
    const targets = db.prepare(`SELECT * FROM announcement_targets`).all();
    for (const target of targets) {
      if (grouped[target.announcement_id]) {
        if (!grouped[target.announcement_id].targets) {
          grouped[target.announcement_id].targets = [];
        }
        grouped[target.announcement_id].targets.push({
          type: target.target_type,
          value: target.target_value
        });
      }
    }

    // Get view stats
    const stats = db.prepare(`
      SELECT
        announcement_id,
        COUNT(*) as views,
        SUM(CASE WHEN dismissed_at IS NOT NULL THEN 1 ELSE 0 END) as dismissals,
        SUM(CASE WHEN cta_clicked IS NOT NULL THEN 1 ELSE 0 END) as cta_clicks
      FROM announcement_views
      GROUP BY announcement_id
    `).all();

    for (const stat of stats) {
      if (grouped[stat.announcement_id]) {
        grouped[stat.announcement_id].stats = {
          views: stat.views,
          dismissals: stat.dismissals,
          cta_clicks: stat.cta_clicks
        };
      }
    }

    res.json({ success: true, data: Object.values(grouped) });
  } catch (error) {
    console.error(`[PM2_ERROR] Admin announcements list error: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to fetch announcements' });
  }
});

// GET single announcement
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;

    const announcement = db.prepare(`
      SELECT * FROM announcements WHERE id = ?
    `).get(id);

    if (!announcement) {
      return res.status(404).json({ success: false, error: 'Announcement not found' });
    }

    // Get variants
    const variants = db.prepare(`
      SELECT * FROM announcement_content WHERE announcement_id = ?
    `).all(id);

    // Get schedule
    const schedule = db.prepare(`
      SELECT * FROM announcement_schedule WHERE announcement_id = ?
    `).get(id);

    // Get persistence
    const persistence = db.prepare(`
      SELECT * FROM announcement_persistence WHERE announcement_id = ?
    `).get(id);

    // Get targets
    const targets = db.prepare(`
      SELECT * FROM announcement_targets WHERE announcement_id = ?
    `).all(id);

    res.json({
      success: true,
      data: {
        ...announcement,
        target_pages: announcement.target_pages ? JSON.parse(announcement.target_pages) : [],
        display_delay: announcement.display_delay || 0,
        show_next_visit_after: announcement.show_next_visit_after,
        variants: variants.map(v => ({
          variant: v.variant,
          blocks: JSON.parse(v.blocks),
          header_style: v.header_style ? JSON.parse(v.header_style) : null
        })),
        schedule: schedule || { manual_override: 0 },
        persistence: persistence || { show_mode: 'once' },
        targets: targets.map(t => ({ type: t.target_type, value: t.target_value }))
      }
    });
  } catch (error) {
    console.error(`[PM2_ERROR] Admin announcement get error: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to fetch announcement' });
  }
});

// POST create announcement
router.post('/', (req, res) => {
  try {
    const {
      title,
      status = 'draft',
      format,
      placement = 'page_specific',
      target_pages = [],
      priority = 5,
      display_delay = 0,
      variants = [],
      schedule = {},
      persistence = {},
      targets = []
    } = req.body;

    if (!title || !format) {
      return res.status(400).json({ success: false, error: 'Title and format are required' });
    }

    const result = db.prepare(`
      INSERT INTO announcements (title, status, format, placement, target_pages, priority, display_delay, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(title, status, format, placement, JSON.stringify(target_pages), priority, display_delay, req.user?.id || null);

    const announcementId = result.lastInsertRowid;

    // Insert variants
    for (const variant of variants) {
      db.prepare(`
        INSERT INTO announcement_content (announcement_id, variant, blocks, header_style)
        VALUES (?, ?, ?, ?)
      `).run(
        announcementId,
        variant.variant || null,
        JSON.stringify(variant.blocks || []),
        variant.header_style ? JSON.stringify(variant.header_style) : null
      );
    }

    // Insert schedule
    db.prepare(`
      INSERT INTO announcement_schedule (announcement_id, start_date, end_date, relative_trigger, relative_delay_days, manual_override)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      announcementId,
      schedule.start_date || null,
      schedule.end_date || null,
      schedule.relative_trigger || null,
      schedule.relative_delay_days || null,
      schedule.manual_override ? 1 : 0
    );

    // Insert persistence
    db.prepare(`
      INSERT INTO announcement_persistence (announcement_id, show_mode, max_show_count, gap_hours)
      VALUES (?, ?, ?, ?)
    `).run(
      announcementId,
      persistence.show_mode || 'once',
      persistence.max_show_count || null,
      persistence.gap_hours || null
    );

    // Insert targets
    for (const target of targets) {
      db.prepare(`
        INSERT INTO announcement_targets (announcement_id, target_type, target_value)
        VALUES (?, ?, ?)
      `).run(announcementId, target.type, target.value);
    }

    const created = db.prepare('SELECT * FROM announcements WHERE id = ?').get(announcementId);
    res.status(201).json({ success: true, data: { ...created, id: announcementId } });
  } catch (error) {
    console.error(`[PM2_ERROR] Admin announcement create error: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to create announcement' });
  }
});

// PUT update announcement
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      status,
      format,
      placement,
      target_pages,
      priority,
      display_delay,
      variants,
      schedule,
      persistence,
      targets
    } = req.body;

    const existing = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Announcement not found' });
    }

    // Update main record
    db.prepare(`
      UPDATE announcements
      SET title = ?, status = ?, format = ?, placement = ?, target_pages = ?, priority = ?, display_delay = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      title ?? existing.title,
      status ?? existing.status,
      format ?? existing.format,
      placement ?? existing.placement,
      target_pages ? JSON.stringify(target_pages) : existing.target_pages,
      priority ?? existing.priority,
      display_delay ?? existing.display_delay ?? 0,
      id
    );

    // Update variants (delete and recreate)
    if (variants) {
      db.prepare('DELETE FROM announcement_content WHERE announcement_id = ?').run(id);
      for (const variant of variants) {
        db.prepare(`
          INSERT INTO announcement_content (announcement_id, variant, blocks, header_style)
          VALUES (?, ?, ?, ?)
        `).run(
          id,
          variant.variant || null,
          JSON.stringify(variant.blocks || []),
          variant.header_style ? JSON.stringify(variant.header_style) : null
        );
      }
    }

    // Update schedule
    if (schedule) {
      db.prepare('DELETE FROM announcement_schedule WHERE announcement_id = ?').run(id);
      db.prepare(`
        INSERT INTO announcement_schedule (announcement_id, start_date, end_date, relative_trigger, relative_delay_days, manual_override)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        id,
        schedule.start_date || null,
        schedule.end_date || null,
        schedule.relative_trigger || null,
        schedule.relative_delay_days || null,
        schedule.manual_override ? 1 : 0
      );
    }

    // Update persistence
    if (persistence) {
      db.prepare('DELETE FROM announcement_persistence WHERE announcement_id = ?').run(id);
      db.prepare(`
        INSERT INTO announcement_persistence (announcement_id, show_mode, max_show_count, gap_hours)
        VALUES (?, ?, ?, ?)
      `).run(
        id,
        persistence.show_mode || 'once',
        persistence.max_show_count || null,
        persistence.gap_hours || null
      );
    }

    // Update targets
    if (targets) {
      db.prepare('DELETE FROM announcement_targets WHERE announcement_id = ?').run(id);
      for (const target of targets) {
        db.prepare(`
          INSERT INTO announcement_targets (announcement_id, target_type, target_value)
          VALUES (?, ?, ?)
        `).run(id, target.type, target.value);
      }
    }

    res.json({ success: true, data: { id } });
  } catch (error) {
    console.error(`[PM2_ERROR] Admin announcement update error: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to update announcement' });
  }
});

// DELETE announcement
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const result = db.prepare('DELETE FROM announcements WHERE id = ?').run(id);

    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Announcement not found' });
    }

    res.json({ success: true, data: { id } });
  } catch (error) {
    console.error(`[PM2_ERROR] Admin announcement delete error: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to delete announcement' });
  }
});

// GET analytics for single announcement
router.get('/:id/analytics', (req, res) => {
  try {
    const { id } = req.params;

    const views = db.prepare(`
      SELECT
        variant_shown,
        COUNT(*) as total_views,
        SUM(view_count) as total_impressions,
        SUM(CASE WHEN dismissed_at IS NOT NULL THEN 1 ELSE 0 END) as dismissals,
        SUM(CASE WHEN cta_clicked IS NOT NULL THEN 1 ELSE 0 END) as cta_clicks
      FROM announcement_views
      WHERE announcement_id = ?
      GROUP BY variant_shown
    `).all(id);

    const ctaBreakdown = db.prepare(`
      SELECT cta_clicked, COUNT(*) as count
      FROM announcement_views
      WHERE announcement_id = ? AND cta_clicked IS NOT NULL
      GROUP BY cta_clicked
    `).all(id);

    res.json({
      success: true,
      data: {
        by_variant: views,
        cta_breakdown: ctaBreakdown
      }
    });
  } catch (error) {
    console.error(`[PM2_ERROR] Admin announcement analytics error: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to fetch analytics' });
  }
});

// Curator tags management
router.get('/curator-tags', (_req, res) => {
  try {
    const tags = db.prepare(`
      SELECT tag, COUNT(*) as curator_count
      FROM curator_tags
      GROUP BY tag
      ORDER BY curator_count DESC
    `).all();
    res.json({ success: true, data: tags });
  } catch (error) {
    console.error(`[PM2_ERROR] Admin curator tags error: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to fetch curator tags' });
  }
});

router.post('/curator-tags', (req, res) => {
  try {
    const { curator_id, tag } = req.body;
    if (!curator_id || !tag) {
      return res.status(400).json({ success: false, error: 'curator_id and tag are required' });
    }
    db.prepare(`
      INSERT OR IGNORE INTO curator_tags (curator_id, tag) VALUES (?, ?)
    `).run(curator_id, tag);
    res.status(201).json({ success: true });
  } catch (error) {
    console.error(`[PM2_ERROR] Admin curator tag create error: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to add tag' });
  }
});

router.delete('/curator-tags/:curatorId/:tag', (req, res) => {
  try {
    const { curatorId, tag } = req.params;
    db.prepare('DELETE FROM curator_tags WHERE curator_id = ? AND tag = ?').run(curatorId, tag);
    res.status(204).send();
  } catch (error) {
    console.error(`[PM2_ERROR] Admin curator tag delete error: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to remove tag' });
  }
});

// POST push announcement to all connected users
router.post('/:id/push', (req, res) => {
  try {
    const { id } = req.params;

    // Get announcement with content
    const announcement = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
    if (!announcement) {
      return res.status(404).json({ success: false, error: 'Announcement not found' });
    }

    // Get content
    const variants = db.prepare(
      'SELECT * FROM announcement_content WHERE announcement_id = ?'
    ).all(id);

    if (variants.length === 0) {
      return res.status(400).json({ success: false, error: 'Announcement has no content' });
    }

    // Get targets to determine which users to send to
    const targets = db.prepare(
      'SELECT * FROM announcement_targets WHERE announcement_id = ?'
    ).all(id);

    // Build the announcement payload
    const content = variants[0];
    const payload = {
      type: 'announcement:push',
      announcement: {
        id: announcement.id,
        format: announcement.format,
        placement: announcement.placement,
        priority: announcement.priority,
        display_delay: announcement.display_delay || 0,
        variant: content.variant,
        blocks: JSON.parse(content.blocks),
        header_style: content.header_style ? JSON.parse(content.header_style) : null
      }
    };

    // Broadcast to all connected clients
    // Note: For targeted push, we'd need to filter by user type
    const targetCount = webSocketServer.broadcast(payload);

    // Record the push
    db.prepare(`
      INSERT INTO announcement_pushes (announcement_id, pushed_by, target_count)
      VALUES (?, ?, ?)
    `).run(id, req.user?.id || null, targetCount);

    res.json({
      success: true,
      data: {
        pushed_to: targetCount,
        message: `Announcement pushed to ${targetCount} connected client(s)`
      }
    });
  } catch (error) {
    console.error(`[PM2_ERROR] Admin announcement push error: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to push announcement' });
  }
});

// POST trigger "show next visit" for all users
router.post('/:id/trigger-next-visit', (req, res) => {
  try {
    const { id } = req.params;

    const existing = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Announcement not found' });
    }

    // Set show_next_visit_after to current timestamp
    db.prepare(`
      UPDATE announcements
      SET show_next_visit_after = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id);

    res.json({
      success: true,
      data: {
        message: 'Next visit trigger set. All users will see this announcement once on their next visit.'
      }
    });
  } catch (error) {
    console.error(`[PM2_ERROR] Admin announcement trigger next visit error: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to trigger next visit' });
  }
});

export default router;
