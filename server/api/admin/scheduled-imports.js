import express from 'express';
import { authMiddleware, requireAdmin } from '../../middleware/auth.js';
import { getDatabase } from '../../database/db.js';

const router = express.Router();

router.use(authMiddleware, requireAdmin);

const STATUS_FILTERS = new Set(['all', 'active', 'paused', 'failed']);

const coerceStatusFilter = (value) => {
  const normalized = String(value ?? 'all').toLowerCase();
  return STATUS_FILTERS.has(normalized) ? normalized : 'all';
};

const coerceLimit = (value, fallback = 50) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), 200);
};

const coerceOffset = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(parsed, 0);
};

router.get('/', (req, res) => {
  try {
    const db = getDatabase();
    const statusFilter = coerceStatusFilter(req.query.status);
    const search = String(req.query.search ?? '').trim().toLowerCase();
    const limit = coerceLimit(req.query.limit);
    const offset = coerceOffset(req.query.offset);

    const whereClauses = [];
    const params = [];

    if (statusFilter !== 'all') {
      whereClauses.push('s.status = ?');
      params.push(statusFilter);
    }

    if (search) {
      whereClauses.push(`
        (
          LOWER(IFNULL(p.title, '')) LIKE ?
          OR LOWER(IFNULL(c.name, '')) LIKE ?
          OR CAST(s.playlist_id AS TEXT) = ?
        )
      `);
      const like = `%${search}%`;
      params.push(like, like, search);
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const baseColumns = `
      s.id,
      s.playlist_id,
      s.source,
      s.mode,
      s.frequency,
      s.frequency_value,
      s.time_utc,
      s.next_run_at,
      s.last_run_at,
      s.status,
      s.owner_curator_id,
      s.append_position,
      s.update_source_title,
      p.title AS playlist_title,
      p.curator_id,
      p.curator_name,
      p.published AS playlist_published,
      c.name AS curator_name,
      c.profile_type AS curator_type
    `;

    const countRow = db
      .prepare(`
        SELECT COUNT(*) AS total
        FROM playlist_import_schedules s
        LEFT JOIN playlists p ON p.id = s.playlist_id
        LEFT JOIN curators c ON c.id = p.curator_id
        ${whereSql}
      `)
      .get(...params);

    const rows = db
      .prepare(`
        SELECT ${baseColumns}
        FROM playlist_import_schedules s
        LEFT JOIN playlists p ON p.id = s.playlist_id
        LEFT JOIN curators c ON c.id = p.curator_id
        ${whereSql}
        ORDER BY
          CASE WHEN s.next_run_at IS NULL THEN 1 ELSE 0 END,
          datetime(s.next_run_at) ASC
        LIMIT ? OFFSET ?
      `)
      .all(...params, limit, offset);

    const scheduleIds = rows.map((row) => row.id);
    const runsBySchedule = new Map();

    if (scheduleIds.length) {
      const placeholders = scheduleIds.map(() => '?').join(',');
      const runRows = db
        .prepare(`
          SELECT schedule_id, status, started_at, finished_at, error, stats_json
          FROM playlist_import_runs
          WHERE schedule_id IN (${placeholders})
          ORDER BY schedule_id ASC, datetime(started_at) DESC
        `)
        .all(...scheduleIds);

      for (const run of runRows) {
        const entry = runsBySchedule.get(run.schedule_id) || [];
        entry.push(run);
        runsBySchedule.set(run.schedule_id, entry);
      }
    }

    const items = rows.map((row) => {
      const runs = runsBySchedule.get(row.id) || [];
      const totalRuns = runs.length;
      const totalFailures = runs.filter((run) => run.status === 'failed').length;
      const lastRun = runs[0] || null;
      const lastSuccess = runs.find((run) => run.status === 'success') || null;

      let failuresSinceSuccess = 0;
      for (const run of runs) {
        if (run.status === 'success') break;
        if (run.status === 'failed') failuresSinceSuccess += 1;
      }

      return {
        ...row,
        last_run_status: lastRun?.status || null,
        last_run_error: lastRun?.error || null,
        last_run_started_at: lastRun?.started_at || null,
        total_runs: totalRuns,
        total_failures: totalFailures,
        last_success_at: lastSuccess?.started_at || null,
        failures_since_success: failuresSinceSuccess
      };
    });

    return res.json({
      success: true,
      data: {
        items,
        total: countRow?.total ?? 0,
        limit,
        offset
      }
    });
  } catch (error) {
    console.error('[ADMIN_SCHEDULED_IMPORTS] Failed to load schedules:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to load scheduled imports'
    });
  }
});

export default router;

