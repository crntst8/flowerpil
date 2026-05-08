import express from 'express';
import Joi from 'joi';
import { authMiddleware, requireAdmin } from '../../middleware/auth.js';
import { getDatabase, getQueries } from '../../database/db.js';
import { dispatchExportRequests } from '../../services/exportQueueDispatcher.js';

const router = express.Router();

router.use(authMiddleware, requireAdmin);

const statusFilterSchema = Joi.object({
  status: Joi.string().valid('pending', 'auth_required', 'in_progress', 'completed', 'failed', 'confirmed').optional(),
  search: Joi.string().allow('').optional(),
  limit: Joi.number().integer().min(1).max(200).optional()
});

const bulkExportSchema = Joi.object({
  request_ids: Joi.array().items(Joi.number().integer().positive()).min(1).required()
});

const confirmSchema = Joi.object({
  dest_results: Joi.object({
    spotify_url: Joi.string().uri().optional(),
    apple_url: Joi.string().uri().optional(),
    tidal_url: Joi.string().uri().optional()
  }).default({})
});

const parseJsonField = (value, fallback) => {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
};

const parseDestinations = (value) => {
  const parsed = parseJsonField(value, null);
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
};

const mapRequestRow = (row) => ({
  id: row.id,
  playlist_id: row.playlist_id,
  requested_by: row.requested_by,
  destinations: parseDestinations(row.destinations),
  status: row.status,
  results: parseJsonField(row.results, {}),
  last_error: row.last_error || null,
  created_at: row.created_at,
  updated_at: row.updated_at,
  playlist_title: row.playlist_title || null,
  curator_id: row.curator_id || null,
  curator_name: row.curator_name || null
});

router.get('/', (req, res) => {
  try {
    const {
      value: { status, search, limit = 100 },
      error
    } = statusFilterSchema.validate(req.query, { abortEarly: false });

    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const db = getDatabase();
    const params = [];
    let sql = `
      SELECT er.*, p.title AS playlist_title, p.curator_id, c.name AS curator_name
      FROM export_requests er
      LEFT JOIN playlists p ON er.playlist_id = p.id
      LEFT JOIN curators c ON p.curator_id = c.id
      WHERE 1=1
    `;

    if (status) {
      sql += ' AND er.status = ?';
      params.push(status);
    }

    if (search && search.trim().length) {
      const term = `%${search.trim().toLowerCase()}%`;
      sql += ` AND (
        LOWER(p.title) LIKE ?
        OR LOWER(c.name) LIKE ?
        OR CAST(er.playlist_id AS TEXT) LIKE ?
      )`;
      params.push(term, term, `%${search.trim()}%`);
    }

    sql += `
      ORDER BY
        CASE 
          WHEN er.status IN ('pending', 'auth_required', 'in_progress') THEN 0
          ELSE 1
        END,
        er.created_at DESC
      LIMIT ?
    `;
    params.push(limit);

    const rows = db.prepare(sql).all(...params);
    const data = rows.map(mapRequestRow);

    return res.json({ success: true, data });
  } catch (err) {
    console.error('[ADMIN_REQUESTS_LIST] Error:', err);
    return res.status(500).json({ error: 'Failed to load export requests' });
  }
});

router.post('/bulk-export', (req, res) => {
  try {
    const { error, value } = bulkExportSchema.validate(req.body || {});
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { request_ids: requestIds } = value;
    const queries = getQueries();
    const db = getDatabase();

    const updated = [];
    const skipped = [];

    db.exec('BEGIN');
    try {
      for (const id of requestIds) {
        const row = queries.getExportRequestById.get(id);
        if (!row) {
          skipped.push({ id, reason: 'not_found' });
          continue;
        }
        // Allow exporting from any state - admin can force retry
        queries.updateExportRequestStatus.run('in_progress', null, id);
        updated.push(id);
      }
      db.exec('COMMIT');
    } catch (inner) {
      db.exec('ROLLBACK');
      throw inner;
    }

    const refreshed = updated.map((id) => {
      const row = queries.getExportRequestById.get(id);
      return row ? mapRequestRow(row) : null;
    }).filter(Boolean);

    if (updated.length) {
      setImmediate(() => {
        dispatchExportRequests(updated, { actor: 'admin' })
          .catch((err) => console.error('[EXPORT_QUEUE] Dispatch error:', err));
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
    console.error('[ADMIN_REQUESTS_BULK_EXPORT] Error:', err);
    return res.status(500).json({ error: 'Failed to queue exports' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const requestId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(requestId) || requestId <= 0) {
      return res.status(400).json({ error: 'Invalid request id' });
    }

    const queries = getQueries();
    const existing = queries.getExportRequestById.get(requestId);
    if (!existing) {
      return res.status(404).json({ error: 'Export request not found' });
    }

    const deletableStatuses = new Set(['completed', 'confirmed', 'failed']);
    if (!deletableStatuses.has(existing.status)) {
      return res.status(400).json({
        error: `Only completed or failed requests can be removed (current status: ${existing.status})`
      });
    }

    const db = getDatabase();
    const result = db.prepare('DELETE FROM export_requests WHERE id = ?').run(requestId);
    return res.json({
      success: true,
      data: {
        deleted: result.changes > 0,
        id: requestId
      }
    });
  } catch (err) {
    console.error('[ADMIN_REQUESTS_DELETE] Error:', err);
    return res.status(500).json({ error: 'Failed to delete export request' });
  }
});

router.post('/:id/confirm', (req, res) => {
  try {
    const { error, value } = confirmSchema.validate(req.body || {});
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const requestId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(requestId) || requestId <= 0) {
      return res.status(400).json({ error: 'Invalid request id' });
    }

    const queries = getQueries();
    const db = getDatabase();
    const row = queries.getExportRequestById.get(requestId);
    if (!row) {
      return res.status(404).json({ error: 'Export request not found' });
    }

    if (row.status !== 'completed') {
      return res.status(400).json({ error: `Cannot confirm request in status ${row.status}` });
    }

    const requestedDestinations = parseDestinations(row.destinations);
    const currentResults = parseJsonField(row.results, {});
    const missingResults = requestedDestinations.filter((dest) => currentResults?.[dest]?.status !== 'success');
    if (missingResults.length > 0 && (!value.dest_results || Object.keys(value.dest_results).length === 0)) {
      return res.status(400).json({
        error: `Results missing for destinations: ${missingResults.join(', ')}`
      });
    }

    const results = {
      ...(parseJsonField(row.results, {}) || {}),
      ...value.dest_results,
      confirmed_at: new Date().toISOString()
    };

    db.exec('BEGIN');
    try {
      queries.updateExportRequestStatus.run('confirmed', null, requestId);
      queries.updateExportRequestResults.run(JSON.stringify(results), requestId);

      // Update playlist exported URL fields if provided
      const playlistId = row.playlist_id;
      if (playlistId && value.dest_results) {
        const playlistUpdates = [];
        if (value.dest_results.spotify_url) {
          playlistUpdates.push({ column: 'exported_spotify_url', value: value.dest_results.spotify_url });
        }
        if (value.dest_results.apple_url) {
          playlistUpdates.push({ column: 'exported_apple_url', value: value.dest_results.apple_url });
        }
        if (value.dest_results.tidal_url) {
          playlistUpdates.push({ column: 'exported_tidal_url', value: value.dest_results.tidal_url });
        }
        if (playlistUpdates.length) {
          const setClauses = playlistUpdates.map((u) => `${u.column} = ?`).join(', ');
          const values = playlistUpdates.map((u) => u.value);
          values.push(playlistId);
          db.prepare(`UPDATE playlists SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values);
        }
      }

      db.exec('COMMIT');
    } catch (inner) {
      db.exec('ROLLBACK');
      throw inner;
    }

    const refreshed = queries.getExportRequestById.get(requestId);
    return res.json({
      success: true,
      data: refreshed ? mapRequestRow(refreshed) : null
    });
  } catch (err) {
    console.error('[ADMIN_REQUESTS_CONFIRM] Error:', err);
    return res.status(500).json({ error: 'Failed to confirm export request' });
  }
});

export default router;
