import express from 'express';
import Joi from 'joi';
import { authMiddleware, requireAdmin } from '../../middleware/auth.js';
import { getDatabase } from '../../database/db.js';
import logger from '../../utils/logger.js';

const router = express.Router();

router.use(authMiddleware, requireAdmin);

const listSchema = Joi.object({
  limit: Joi.number().integer().min(1).max(200).default(100),
  offset: Joi.number().integer().min(0).default(0),
  playlistId: Joi.number().integer().positive().optional(),
  curatorId: Joi.number().integer().positive().optional(),
  search: Joi.string().allow('').optional()
});

const retrySchema = Joi.object({
  trackIds: Joi.array().items(Joi.number().integer().positive()).min(1).required()
});

const mapTrackRow = (row = {}) => {
  const updatedAt = row.linking_updated_at ? new Date(row.linking_updated_at) : null;
  const ageHours = updatedAt && Number.isFinite(updatedAt.getTime())
    ? Math.max(0, Math.floor((Date.now() - updatedAt.getTime()) / (1000 * 60 * 60)))
    : null;

  return {
    id: row.id,
    playlist_id: row.playlist_id,
    playlist_title: row.playlist_title || null,
    curator_id: row.curator_id || null,
    curator_name: row.curator_name || null,
    position: row.position,
    title: row.title,
    artist: row.artist,
    album: row.album || null,
    linking_status: row.linking_status,
    linking_error: row.linking_error,
    linking_updated_at: row.linking_updated_at,
    linking_max_age_exceeded: !!row.linking_max_age_exceeded,
    linking_lease_owner: row.linking_lease_owner || null,
    linking_lease_expires: row.linking_lease_expires || null,
    linking_retry_count: row.linking_retry_count || 0,
    linking_last_retry_at: row.linking_last_retry_at || null,
    age_hours: ageHours
  };
};

router.get('/', (req, res) => {
  try {
    const { value, error } = listSchema.validate(req.query, { abortEarly: false, convert: true });
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { limit, offset, playlistId, curatorId, search } = value;
    const db = getDatabase();

    const filters = ['t.linking_max_age_exceeded = 1'];
    const params = [];

    if (playlistId) {
      filters.push('t.playlist_id = ?');
      params.push(playlistId);
    }

    if (curatorId) {
      filters.push('p.curator_id = ?');
      params.push(curatorId);
    }

    if (search && search.trim().length) {
      const term = `%${search.trim().toLowerCase()}%`;
      filters.push('(LOWER(t.title) LIKE ? OR LOWER(t.artist) LIKE ?)');
      params.push(term, term);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const totalRow = db.prepare(`
      SELECT COUNT(*) AS count
      FROM tracks t
      LEFT JOIN playlists p ON p.id = t.playlist_id
      ${whereClause}
    `).get(...params);
    const total = Number(totalRow?.count || 0);

    const rows = db.prepare(`
      SELECT
        t.id, t.playlist_id, t.position, t.title, t.artist, t.album,
        t.linking_status, t.linking_error, t.linking_updated_at, t.linking_max_age_exceeded,
        t.linking_lease_owner, t.linking_lease_expires, t.linking_retry_count, t.linking_last_retry_at,
        p.title AS playlist_title, p.curator_id,
        c.name AS curator_name
      FROM tracks t
      LEFT JOIN playlists p ON p.id = t.playlist_id
      LEFT JOIN curators c ON c.id = p.curator_id
      ${whereClause}
      ORDER BY t.linking_updated_at IS NULL DESC, t.linking_updated_at DESC, t.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    const tracks = rows.map(mapTrackRow);

    return res.json({
      success: true,
      data: {
        tracks,
        total,
        limit,
        offset
      }
    });
  } catch (err) {
    logger.error('ADMIN_DEADLETTER', 'Failed to load dead-letter tracks', err);
    return res.status(500).json({ error: 'Failed to load dead-letter tracks' });
  }
});

router.post('/retry', (req, res) => {
  try {
    const { value, error } = retrySchema.validate(req.body || {}, { abortEarly: false, convert: true });
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const db = getDatabase();
    const lookupStmt = db.prepare('SELECT linking_max_age_exceeded FROM tracks WHERE id = ?');
    const resetStmt = db.prepare(`
      UPDATE tracks
      SET linking_status = 'pending',
          linking_error = NULL,
          linking_max_age_exceeded = 0,
          linking_lease_owner = NULL,
          linking_lease_expires = NULL,
          linking_retry_count = 0,
          linking_last_retry_at = NULL,
          linking_updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND linking_max_age_exceeded = 1
    `);
    const detailStmt = db.prepare(`
      SELECT
        t.id, t.playlist_id, t.position, t.title, t.artist, t.album,
        t.linking_status, t.linking_error, t.linking_updated_at, t.linking_max_age_exceeded,
        t.linking_lease_owner, t.linking_lease_expires, t.linking_retry_count, t.linking_last_retry_at,
        p.title AS playlist_title, p.curator_id,
        c.name AS curator_name
      FROM tracks t
      LEFT JOIN playlists p ON p.id = t.playlist_id
      LEFT JOIN curators c ON c.id = p.curator_id
      WHERE t.id = ?
    `);

    const updatedIds = [];
    const skipped = [];

    const runRetry = db.transaction((ids) => {
      for (const id of ids) {
        const current = lookupStmt.get(id);
        if (!current) {
          skipped.push({ id, reason: 'not_found' });
          continue;
        }
        if (!current.linking_max_age_exceeded) {
          skipped.push({ id, reason: 'not_dead_letter' });
          continue;
        }

        const info = resetStmt.run(id);
        if (info.changes > 0) {
          updatedIds.push(id);
        }
      }
    });

    runRetry(value.trackIds);

    const refreshed = updatedIds
      .map((id) => detailStmt.get(id))
      .filter(Boolean)
      .map(mapTrackRow);

    if (updatedIds.length) {
      logger.info('ADMIN_DEADLETTER', 'Re-queued dead-letter tracks', {
        updated: updatedIds.length,
        ids: updatedIds.slice(0, 20),
        truncated: updatedIds.length > 20
      });
    }

    return res.json({
      success: true,
      data: {
        updated: refreshed,
        skipped
      }
    });
  } catch (err) {
    logger.error('ADMIN_DEADLETTER', 'Failed to retry dead-letter tracks', err);
    return res.status(500).json({ error: 'Failed to retry dead-letter tracks' });
  }
});

export default router;
