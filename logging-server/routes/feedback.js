import express from 'express';
import Joi from 'joi';
import db from '../db.js';

const router = express.Router();
const insertStatement = db.prepare(`
  INSERT INTO feedback (
    action_id, request_id, user_id, curator_id, curator_name, user_email,
    url, message, metadata, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(action_id) DO UPDATE SET
    request_id=excluded.request_id,
    user_id=excluded.user_id,
    curator_id=excluded.curator_id,
    curator_name=excluded.curator_name,
    user_email=excluded.user_email,
    url=excluded.url,
    message=excluded.message,
    metadata=excluded.metadata,
    created_at=excluded.created_at
`);

const ingestSchema = Joi.object({
  entries: Joi.array().items(Joi.object({
    id: Joi.number().optional(),
    action_id: Joi.string().required(),
    request_id: Joi.string().allow(null, ''),
    user_id: Joi.number().allow(null),
    curator_id: Joi.number().allow(null),
    curator_name: Joi.string().allow(null, ''),
    user_email: Joi.string().allow(null, ''),
    url: Joi.string().required(),
    message: Joi.string().required(),
    metadata: Joi.object().optional(),
    created_at: Joi.string().allow(null, '')
  })).min(1).required()
});

router.post('/ingest/feedback', (req, res) => {
  const { error, value } = ingestSchema.validate(req.body || {}, { abortEarly: false });
  if (error) {
    console.warn('[LoggingServer] Ingest validation failed', error.details.map((d) => d.message));
    return res.status(400).json({ error: 'Validation failed', details: error.details.map((d) => d.message) });
  }

  const entries = value.entries;
  const now = new Date().toISOString();
  const metaExtractor = (entry, metadata) => {
    const meta = metadata && typeof metadata === 'object' ? metadata : {};
    const userMeta = meta.user || {};
    return {
      curatorName: entry.curator_name || userMeta.curator_name || null,
      userEmail: entry.user_email || userMeta.email || null
    };
  };

  const transaction = db.transaction((items) => {
    for (const entry of items) {
      const metadata = entry.metadata || {};
      const { curatorName, userEmail } = metaExtractor(entry, metadata);
      insertStatement.run(
        entry.action_id,
        entry.request_id || null,
        entry.user_id || null,
        entry.curator_id || null,
        curatorName,
        userEmail,
        entry.url,
        entry.message,
        JSON.stringify(metadata),
        entry.created_at || now
      );
    }
  });

  try {
    transaction(entries);
    console.log(`[LoggingServer] Ingested ${entries.length} feedback entries`);
    return res.json({ success: true, count: entries.length });
  } catch (err) {
    console.error('[LoggingServer] Failed to store feedback batch', err);
    return res.status(500).json({ error: 'Failed to store feedback', detail: err?.message });
  }
});

const listSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(20),
  email: Joi.string().optional(),
  url: Joi.string().optional(),
  request_id: Joi.string().optional(),
  from: Joi.string().optional(),
  to: Joi.string().optional(),
  search: Joi.string().optional()
});

router.get('/api/feedback', (req, res) => {
  const { error, value } = listSchema.validate(req.query || {});
  if (error) {
    return res.status(400).json({ error: 'Validation failed', details: error.details.map((d) => d.message) });
  }

  const filters = [];
  const params = [];

  if (value.email) {
    filters.push('user_email LIKE ?');
    params.push(`%${value.email}%`);
  }
  if (value.url) {
    filters.push('url LIKE ?');
    params.push(`%${value.url}%`);
  }
  if (value.request_id) {
    filters.push('request_id = ?');
    params.push(value.request_id);
  }
  if (value.from) {
    filters.push('(created_at IS NULL OR created_at >= ?)');
    params.push(value.from);
  }
  if (value.to) {
    filters.push('(created_at IS NULL OR created_at <= ?)');
    params.push(value.to);
  }
  if (value.search) {
    filters.push('(message LIKE ? OR metadata LIKE ? OR url LIKE ? OR curator_name LIKE ? OR user_email LIKE ?)');
    const term = `%${value.search}%`;
    params.push(term, term, term, term, term);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const offset = (value.page - 1) * value.pageSize;

  const totalStmt = db.prepare(`SELECT COUNT(*) as count FROM feedback ${whereClause}`);
  const total = totalStmt.get(...params)?.count || 0;

  const listStmt = db.prepare(`
    SELECT * FROM feedback
    ${whereClause}
    ORDER BY datetime(created_at) DESC, received_at DESC
    LIMIT ? OFFSET ?
  `);

  const rows = listStmt.all(...params, value.pageSize, offset).map((row) => ({
    ...row,
    metadata: row.metadata ? JSON.parse(row.metadata) : {}
  }));

  return res.json({
    success: true,
    data: rows,
    pagination: {
      page: value.page,
      pageSize: value.pageSize,
      total,
      totalPages: Math.ceil(total / value.pageSize)
    }
  });
});

const LOG_SOURCE_BASE_URL = (process.env.LOG_SOURCE_BASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.LOGGING_SERVICE_KEY || '';

router.get('/api/feedback/:actionId/logs', async (req, res) => {
  if (!LOG_SOURCE_BASE_URL) {
    return res.status(503).json({ error: 'Log source not configured' });
  }
  const record = db.prepare('SELECT * FROM feedback WHERE action_id = ?').get(req.params.actionId);
  if (!record) {
    return res.status(404).json({ error: 'Feedback not found' });
  }
  const metadata = record.metadata ? JSON.parse(record.metadata) : {};

  try {
    const response = await fetch(`${LOG_SOURCE_BASE_URL}/api/v1/internal/tester-feedback/logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(SERVICE_KEY ? { 'x-logging-service-key': SERVICE_KEY } : {})
      },
      body: JSON.stringify({
        action_id: record.action_id,
        request_id: record.request_id,
        created_at: record.created_at,
        typing_started_at: metadata?.client?.typing_started_at,
        pre_window_ms: 7000,
        post_window_ms: 5000
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch logs', detail: data.error || response.statusText });
    }

    return res.json({ success: true, logs: data.entries || [], request_id: data.request_id });
  } catch (error) {
    return res.status(500).json({ error: 'Log fetch failed', detail: error?.message });
  }
});

router.delete('/api/feedback', (req, res) => {
  try {
    const { before } = req.query || {};
    let changes = 0;
    if (before) {
      const stmt = db.prepare('DELETE FROM feedback WHERE created_at IS NULL OR created_at <= ?');
      const result = stmt.run(before);
      changes = result.changes || 0;
    } else {
      const stmt = db.prepare('DELETE FROM feedback');
      const result = stmt.run();
      changes = result.changes || 0;
    }
    return res.json({ success: true, deleted: changes });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to clear feedback', detail: error?.message });
  }
});

export default router;
