import express from 'express';
import Joi from 'joi';
import { authMiddleware, requireAdmin } from '../../middleware/auth.js';
import { getQueries } from '../../database/db.js';
import SpotifyService from '../../services/spotifyService.js';
import { startTransfer } from '../../services/playlistTransferRunner.js';
import { exportTransferResultsAsCSV, exportTransferResultsAsJSON } from '../../services/transferExportService.js';

const router = express.Router();
const queries = getQueries();
const spotifyService = new SpotifyService();

router.use(authMiddleware, requireAdmin);

const createSchema = Joi.object({
  sourceUrl: Joi.string().uri().required(),
  destinations: Joi.array().items(Joi.string().valid('apple', 'tidal')).min(1).required(),
  options: Joi.object({
    matchThreshold: Joi.number().integer().min(60).max(95).default(75)
  }).default({})
});

const listSchema = Joi.object({
  limit: Joi.number().integer().min(1).max(200).default(50),
  offset: Joi.number().integer().min(0).default(0),
  status: Joi.string().valid('pending', 'auth_required', 'fetching', 'processing', 'completed', 'failed', 'cancelled').optional()
});

const mapJobRow = (row) => {
  const destinations = (() => {
    try {
      const parsed = typeof row.destinations === 'string' ? JSON.parse(row.destinations) : row.destinations;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();

  const results = (() => {
    try {
      return row.results ? JSON.parse(row.results) : {};
    } catch {
      return {};
    }
  })();

  const trackResults = (() => {
    try {
      return row.track_results ? JSON.parse(row.track_results) : [];
    } catch {
      return [];
    }
  })();

  return {
    id: row.id,
    source_platform: row.source_platform,
    source_playlist_id: row.source_playlist_id,
    source_playlist_name: row.source_playlist_name,
    destinations,
    status: row.status,
    totals: {
      total_tracks: row.total_tracks,
      tracks_processed: row.tracks_processed,
      tracks_matched: row.tracks_matched,
      tracks_failed: row.tracks_failed
    },
    results,
    track_results: trackResults,
    last_error: row.last_error,
    created_at: row.created_at,
    updated_at: row.updated_at,
    started_at: row.started_at,
    completed_at: row.completed_at,
    match_threshold: row.match_threshold,
    use_enhanced_matching: Boolean(row.use_enhanced_matching)
  };
};

router.post('/', (req, res) => {
  const { error, value } = createSchema.validate(req.body || {}, { abortEarly: false });
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  const { sourceUrl, destinations, options } = value;
  const playlistId = spotifyService.extractPlaylistId(sourceUrl);
  if (!playlistId) {
    return res.status(400).json({ error: 'Invalid Spotify playlist URL' });
  }

  try {
    const result = queries.insertTransferJob.run(
      'spotify',
      playlistId,
      null,
      JSON.stringify(destinations),
      'pending',
      options.matchThreshold,
      1,
      req.user?.username || 'admin'
    );

    const jobId = result.lastInsertRowid;
    startTransfer(jobId);

    return res.json({ success: true, data: { id: jobId } });
  } catch (err) {
    console.error('[ADMIN_TRANSFERS] Failed to create transfer job', err);
    return res.status(500).json({ error: 'Failed to create transfer job' });
  }
});

router.get('/', (req, res) => {
  const { error, value } = listSchema.validate(req.query || {}, { abortEarly: false });
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  const { limit, offset, status } = value;

  try {
    const rows = status
      ? queries.listTransferJobsByStatus.all(status, limit, offset)
      : queries.listTransferJobs.all(limit, offset);

    const data = rows.map(mapJobRow);
    return res.json({ success: true, data });
  } catch (err) {
    console.error('[ADMIN_TRANSFERS] Failed to list transfer jobs', err);
    return res.status(500).json({ error: 'Failed to list transfer jobs' });
  }
});

router.get('/:id', (req, res) => {
  const jobId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(jobId) || jobId <= 0) {
    return res.status(400).json({ error: 'Invalid job id' });
  }

  try {
    const row = queries.getTransferJobById.get(jobId);
    if (!row) {
      return res.status(404).json({ error: 'Transfer job not found' });
    }

    return res.json({ success: true, data: mapJobRow(row) });
  } catch (err) {
    console.error('[ADMIN_TRANSFERS] Failed to fetch job', err);
    return res.status(500).json({ error: 'Failed to load transfer job' });
  }
});

router.get('/:id/export', (req, res) => {
  const jobId = Number.parseInt(req.params.id, 10);
  const format = (req.query.format || 'csv').toString().toLowerCase();

  if (!Number.isInteger(jobId) || jobId <= 0) {
    return res.status(400).json({ error: 'Invalid job id' });
  }

  try {
    if (format === 'json') {
      const body = exportTransferResultsAsJSON(jobId);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="transfer-${jobId}.json"`);
      return res.send(body);
    }

    const body = exportTransferResultsAsCSV(jobId);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="transfer-${jobId}.csv"`);
    return res.send(body);
  } catch (err) {
    const status = err.statusCode || 500;
    const message = status === 404 ? err.message : 'Failed to export transfer results';
    console.error('[ADMIN_TRANSFERS] Export failed', err);
    return res.status(status).json({ error: message });
  }
});

router.delete('/:id', (req, res) => {
  const jobId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(jobId) || jobId <= 0) {
    return res.status(400).json({ error: 'Invalid job id' });
  }

  try {
    const row = queries.getTransferJobById.get(jobId);
    if (!row) {
      return res.status(404).json({ error: 'Transfer job not found' });
    }

    const cancellable = new Set(['pending', 'fetching', 'processing', 'auth_required']);
    if (!cancellable.has(row.status)) {
      return res.status(400).json({ error: `Cannot cancel job in status ${row.status}` });
    }

    queries.updateTransferJobStatus.run('cancelled', 'cancelled', 'cancelled', jobId);
    return res.json({ success: true });
  } catch (err) {
    console.error('[ADMIN_TRANSFERS] Failed to cancel job', err);
    return res.status(500).json({ error: 'Failed to cancel transfer job' });
  }
});

export default router;
