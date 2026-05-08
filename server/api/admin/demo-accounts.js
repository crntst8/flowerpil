import express from 'express';
import crypto from 'crypto';
import Joi from 'joi';
import { getDatabase, getQueries } from '../../database/db.js';
import { authMiddleware, requireAdmin } from '../../middleware/auth.js';
import { hashPassword, validatePassword } from '../../utils/authUtils.js';
import { logSecurityEvent, SECURITY_EVENTS } from '../../utils/securityLogger.js';
import logger from '../../utils/logger.js';

const router = express.Router();
router.use(authMiddleware, requireAdmin);

const createDemoSchema = Joi.object({
  curatorId: Joi.number().integer().optional(),
  email: Joi.string().email().optional(),
  password: Joi.string().min(10).max(128).optional(),
  curatorName: Joi.string().max(120).optional(),
  curatorType: Joi.string().max(64).default('curator')
});

const normalizeEmail = (value) => (value || '').trim().toLowerCase();

const buildPlaylistSummary = (db, curatorId) => {
  const stats = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN published = 1 THEN 1 ELSE 0 END) AS published,
      MAX(updated_at) AS last_updated
    FROM playlists
    WHERE curator_id = ?
  `).get(curatorId);

  const recent = db.prepare(`
    SELECT id, title, published, updated_at
    FROM playlists
    WHERE curator_id = ?
    ORDER BY updated_at DESC
    LIMIT 5
  `).all(curatorId);

  const total = Number(stats?.total || 0);
  const published = Number(stats?.published || 0);

  return {
    total,
    published,
    drafts: Math.max(total - published, 0),
    last_updated: stats?.last_updated || null,
    recent: (recent || []).map((playlist) => ({
      ...playlist,
      published: Boolean(playlist.published)
    }))
  };
};

const buildActivitySummary = (db, curatorId, days = 7) => {
  const window = `-${Math.max(days, 1)} days`;
  const summary = db.prepare(`
    SELECT
      MAX(created_at) AS last_activity,
      COUNT(DISTINCT session_id) AS sessions,
      SUM(COALESCE(duration_ms, 0)) AS total_time_ms
    FROM demo_account_activity
    WHERE curator_id = ?
      AND created_at >= datetime('now', ?)
  `).get(curatorId, window);

  return {
    last_activity: summary?.last_activity || null,
    sessions: Number(summary?.sessions || 0),
    total_time_ms: Number(summary?.total_time_ms || 0)
  };
};

const buildPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = 14;
  let result = '';
  for (let i = 0; i < bytes; i += 1) {
    const index = crypto.randomInt(0, chars.length);
    result += chars[index];
  }
  return `${result}A1`;
};

router.get('/', async (req, res) => {
  try {
    const db = getDatabase();
    const queries = getQueries();

    const demoCurators = queries.getDemoCurators.all() || [];

    const payload = demoCurators.map((curator) => ({
      curator: {
        id: curator.id,
        name: curator.name,
        type: curator.type,
        profile_type: curator.profile_type,
        profile_visibility: curator.profile_visibility,
        profile_image: curator.profile_image,
        location: curator.location,
        verification_status: curator.verification_status,
        is_demo: Boolean(curator.is_demo)
      },
      admin_user: curator.admin_user_id ? {
        id: curator.admin_user_id,
        username: curator.admin_username,
        last_login: curator.last_login,
        is_active: Boolean(curator.is_active)
      } : null,
      playlists: buildPlaylistSummary(db, curator.id),
      activity: buildActivitySummary(db, curator.id)
    }));

    res.json({ success: true, data: payload });
  } catch (error) {
    logger.error('ADMIN_DEMO', 'Failed to load demo accounts', error);
    res.status(500).json({ error: 'Failed to load demo accounts' });
  }
});

router.get('/:curatorId/activity', async (req, res) => {
  try {
    const db = getDatabase();
    const curatorId = Number.parseInt(req.params.curatorId, 10);
    const days = Math.min(Math.max(Number.parseInt(req.query.days, 10) || 7, 1), 90);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 100, 1), 250);

    if (!Number.isFinite(curatorId)) {
      return res.status(400).json({ error: 'Invalid curator id' });
    }

    const curator = db.prepare('SELECT id, name, is_demo FROM curators WHERE id = ?').get(curatorId);
    if (!curator || !curator.is_demo) {
      return res.status(404).json({ error: 'Demo curator not found' });
    }

    const window = `-${days} days`;
    const events = db.prepare(`
      SELECT id, session_id, event_type, path, from_path, duration_ms, metadata, created_at
      FROM demo_account_activity
      WHERE curator_id = ?
        AND created_at >= datetime('now', ?)
      ORDER BY created_at DESC
      LIMIT ?
    `).all(curatorId, window, limit);

    const totals = db.prepare(`
      SELECT
        COUNT(*) AS events,
        COUNT(DISTINCT session_id) AS sessions,
        SUM(COALESCE(duration_ms, 0)) AS total_time_ms,
        MAX(created_at) AS last_activity
      FROM demo_account_activity
      WHERE curator_id = ?
        AND created_at >= datetime('now', ?)
    `).get(curatorId, window);

    const topPaths = db.prepare(`
      SELECT
        path,
        COUNT(*) AS events,
        SUM(COALESCE(duration_ms, 0)) AS total_time_ms
      FROM demo_account_activity
      WHERE curator_id = ?
        AND created_at >= datetime('now', ?)
        AND path IS NOT NULL
        AND path != ''
      GROUP BY path
      ORDER BY total_time_ms DESC, events DESC
      LIMIT 10
    `).all(curatorId, window);

    const sessions = db.prepare(`
      SELECT
        session_id,
        MIN(created_at) AS started_at,
        MAX(created_at) AS last_seen_at,
        COUNT(*) AS events,
        SUM(COALESCE(duration_ms, 0)) AS total_time_ms
      FROM demo_account_activity
      WHERE curator_id = ?
        AND created_at >= datetime('now', ?)
      GROUP BY session_id
      ORDER BY last_seen_at DESC
      LIMIT 20
    `).all(curatorId, window);

    res.json({
      success: true,
      data: {
        curator: { id: curator.id, name: curator.name },
        totals: {
          events: Number(totals?.events || 0),
          sessions: Number(totals?.sessions || 0),
          total_time_ms: Number(totals?.total_time_ms || 0),
          last_activity: totals?.last_activity || null
        },
        top_paths: topPaths || [],
        sessions: sessions || [],
        events: (events || []).map((event) => {
          let metadata = null;
          if (event.metadata) {
            try {
              metadata = JSON.parse(event.metadata);
            } catch {
              metadata = null;
            }
          }
          return {
            ...event,
            duration_ms: Number(event.duration_ms || 0),
            metadata
          };
        })
      }
    });
  } catch (error) {
    logger.error('ADMIN_DEMO', 'Failed to load demo activity', error);
    res.status(500).json({ error: 'Failed to load demo activity' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { error, value } = createDemoSchema.validate(req.body || {}, { abortEarly: false });
    if (error) {
      return res.status(400).json({ error: error.details?.[0]?.message || 'Invalid payload' });
    }

    const db = getDatabase();
    const queries = getQueries();
    const curatorId = value.curatorId ? Number(value.curatorId) : null;

    if (curatorId) {
      const curator = queries.getCuratorById.get(curatorId);
      if (!curator) {
        return res.status(404).json({ error: 'Curator not found' });
      }

      const updateStmt = db.prepare(`
        UPDATE curators
        SET is_demo = 1,
            profile_visibility = 'private'
        WHERE id = ?
      `);
      updateStmt.run(curatorId);

      let adminUser = db.prepare(`
        SELECT id, username, is_active, last_login
        FROM admin_users
        WHERE curator_id = ?
          AND role = 'curator'
        LIMIT 1
      `).get(curatorId);

      if (!adminUser) {
        const email = normalizeEmail(value.email);
        if (!email || !value.password) {
          return res.status(409).json({
            error: 'Curator has no login account. Provide email and password to create one.'
          });
        }

        const existing = queries.findAdminUserByUsername.get(email);
        if (existing) {
          return res.status(409).json({ error: 'Email already in use' });
        }

        const passwordCheck = validatePassword(value.password);
        if (!passwordCheck.valid) {
          return res.status(400).json({ error: passwordCheck.errors.join(' ') });
        }

        const hashed = await hashPassword(value.password);
        const result = queries.createAdminUser.run(email, hashed, 'curator', 1);
        queries.setCuratorId.run(curatorId, result.lastInsertRowid);

        adminUser = db.prepare(`
          SELECT id, username, is_active, last_login
          FROM admin_users
          WHERE id = ?
        `).get(result.lastInsertRowid);
      }

      await logSecurityEvent(SECURITY_EVENTS.ADMIN_ACTION, {
        ip: req.ip,
        userId: req.user?.id,
        details: {
          action: 'demo_account_marked',
          curatorId
        }
      });

      return res.json({
        success: true,
        data: {
          curatorId,
          admin_user: adminUser || null
        }
      });
    }

    const email = normalizeEmail(value.email);
    const curatorName = (value.curatorName || '').trim();
    const curatorType = (value.curatorType || 'curator').trim();
    const password = value.password;

    if (!email || !curatorName || !password) {
      return res.status(400).json({ error: 'Email, curatorName, and password are required' });
    }

    if (queries.findAdminUserByUsername.get(email)) {
      return res.status(409).json({ error: 'Email already in use' });
    }

    if (queries.getCuratorByName.get(curatorName)) {
      return res.status(409).json({ error: 'Curator name already exists' });
    }

    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) {
      return res.status(400).json({ error: passwordCheck.errors.join(' ') });
    }

    const hashed = await hashPassword(password);

    const curatorResult = queries.insertCurator.run(
      curatorName,
      curatorType,
      curatorType,
      0,
      null,
      null,
      null,
      null,
      null,
      email,
      null,
      null,
      null,
      null,
      null,
      null,
      'verified',
      'private',
      0,
      0,
      'not_yet_implemented',
      null
    );

    const newCuratorId = curatorResult.lastInsertRowid;
    queries.setCuratorDemoStatus.run(1, newCuratorId);

    const userResult = queries.createAdminUser.run(email, hashed, 'curator', 1);
    queries.setCuratorId.run(newCuratorId, userResult.lastInsertRowid);

    await logSecurityEvent(SECURITY_EVENTS.ADMIN_ACTION, {
      ip: req.ip,
      userId: req.user?.id,
      details: {
        action: 'demo_account_created',
        curatorId: newCuratorId
      }
    });

    res.status(201).json({
      success: true,
      data: {
        curatorId: newCuratorId,
        adminUserId: userResult.lastInsertRowid
      }
    });
  } catch (error) {
    logger.error('ADMIN_DEMO', 'Failed to create demo account', error);
    res.status(500).json({ error: 'Failed to create demo account' });
  }
});

router.post('/:curatorId/reset-password', async (req, res) => {
  try {
    const db = getDatabase();
    const queries = getQueries();
    const curatorId = Number.parseInt(req.params.curatorId, 10);

    if (!Number.isFinite(curatorId)) {
      return res.status(400).json({ error: 'Invalid curator id' });
    }

    const curator = queries.getCuratorById.get(curatorId);
    if (!curator || !curator.is_demo) {
      return res.status(404).json({ error: 'Demo curator not found' });
    }

    const adminUser = db.prepare(`
      SELECT id, username
      FROM admin_users
      WHERE curator_id = ?
        AND role = 'curator'
      LIMIT 1
    `).get(curatorId);

    if (!adminUser) {
      return res.status(404).json({ error: 'No curator login found for demo account' });
    }

    const password = buildPassword();
    const hashed = await hashPassword(password);
    queries.updateAdminUserPassword.run(hashed, adminUser.id);

    await logSecurityEvent(SECURITY_EVENTS.ADMIN_ACTION, {
      ip: req.ip,
      userId: req.user?.id,
      details: {
        action: 'demo_password_reset',
        curatorId,
        targetUserId: adminUser.id
      }
    });

    res.json({
      success: true,
      data: {
        curatorId,
        username: adminUser.username,
        password
      }
    });
  } catch (error) {
    logger.error('ADMIN_DEMO', 'Failed to reset demo password', error);
    res.status(500).json({ error: 'Failed to reset demo password' });
  }
});

export default router;
