import express from 'express';
import Joi from 'joi';
import { authMiddleware } from '../middleware/auth.js';
import { getQueries } from '../database/db.js';
import { ensureExportRequest, getExportRequestsForPlaylist, mapExportRequestRow, parseAccountPreferencesField } from '../services/exportRequestService.js';

const router = express.Router();

router.use(authMiddleware);

const createSchema = Joi.object({
  playlist_id: Joi.number().integer().positive().required(),
  destinations: Joi.array()
    .items(Joi.string().valid('spotify', 'apple', 'tidal', 'youtube_music'))
    .min(1)
    .required(),
  requested_by: Joi.string().valid('curator', 'system').optional(),
  reset_progress: Joi.boolean().optional(),
  account_preferences: Joi.object().pattern(
    Joi.string().valid('spotify', 'apple', 'tidal', 'youtube_music'),
    Joi.object({
      account_type: Joi.string().valid('flowerpil', 'curator').required(),
      owner_curator_id: Joi.number().integer().positive().allow(null).optional()
    })
  ).optional()
});

router.post('/', (req, res) => {
  try {
    const { error, value } = createSchema.validate(req.body || {}, { abortEarly: false, stripUnknown: true });
    if (error) {
      return res.status(400).json({ success: false, error: error.details.map((d) => d.message).join(', ') });
    }

    const {
      playlist_id: playlistId,
      destinations,
      requested_by: requestedByOverride,
      reset_progress: resetProgress,
      account_preferences: accountPreferences
    } = value;
    const queries = getQueries();
    const playlist = queries.getPlaylistById.get(playlistId);

    if (!playlist) {
      return res.status(404).json({ success: false, error: 'Playlist not found' });
    }

    if (req.user.role === 'curator') {
      if (!req.user.curator_id || Number(req.user.curator_id) !== Number(playlist.curator_id)) {
        return res.status(403).json({ success: false, error: 'You can only queue exports for your own playlists' });
      }
    }

    const requestedBy = requestedByOverride || (req.user.role === 'admin' ? 'system' : 'curator');

    const record = ensureExportRequest({
      playlistId,
      destinations,
      requestedBy,
      resetProgress: resetProgress !== undefined ? resetProgress : requestedBy !== 'system',
      accountPreferences,
      curatorId: req.user.curator_id || null
    });

    return res.status(201).json({ success: true, data: record });
  } catch (err) {
    console.error('[EXPORT_REQUESTS_CREATE] Error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to create export request' });
  }
});

router.get('/playlist/:playlistId', (req, res) => {
  try {
    const playlistId = Number.parseInt(req.params.playlistId, 10);
    if (!Number.isInteger(playlistId) || playlistId <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid playlist id' });
    }

    const queries = getQueries();
    const playlist = queries.getPlaylistById.get(playlistId);
    if (!playlist) {
      return res.status(404).json({ success: false, error: 'Playlist not found' });
    }

    if (req.user.role === 'curator') {
      if (!req.user.curator_id || Number(req.user.curator_id) !== Number(playlist.curator_id)) {
        return res.status(403).json({ success: false, error: 'You can only view export requests for your own playlists' });
      }
    }

    const rows = getExportRequestsForPlaylist(playlistId);
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[EXPORT_REQUESTS_LIST] Error:', err);
    return res.status(500).json({ success: false, error: 'Failed to load export requests' });
  }
});

router.get('/:id', (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid request id' });
    }

    const queries = getQueries();
    const row = queries.findExportRequestById.get(id);
    if (!row) {
      return res.status(404).json({ success: false, error: 'Export request not found' });
    }

    if (req.user.role === 'curator') {
      const playlist = queries.getPlaylistById.get(row.playlist_id);
      if (!playlist || Number(playlist.curator_id) !== Number(req.user.curator_id)) {
        return res.status(403).json({ success: false, error: 'You can only view your own export requests' });
      }
    }

    return res.json({ success: true, data: mapExportRequestRow(row) });
  } catch (err) {
    console.error('[EXPORT_REQUESTS_GET] Error:', err);
    return res.status(500).json({ success: false, error: 'Failed to load export request' });
  }
});

// POST /api/v1/export-requests/:id/execute - Execute export (admin only)
router.post('/:id/execute', async (req, res) => {
  try {
    // Admin-only endpoint
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid request id' });
    }

    const queries = getQueries();
    const request = queries.getExportRequestById.get(id);

    if (!request) {
      return res.status(404).json({ success: false, error: 'Export request not found' });
    }

    const playlist = queries.getPlaylistById.get(request.playlist_id);
    if (!playlist) {
      return res.status(404).json({ success: false, error: 'Playlist not found' });
    }

    const curator = playlist.curator_id ? queries.getCuratorById.get(playlist.curator_id) : null;

    // Parse destinations
    const destinations = JSON.parse(request.destinations || '[]');
    if (destinations.length === 0) {
      return res.status(400).json({ success: false, error: 'No destinations specified' });
    }

    // Update status to in_progress
    queries.updateExportRequestStatus.run('in_progress', null, id);

    // Import runPlaylistExport from playlist-export
    const { runPlaylistExport } = await import('../services/playlistExportRunner.js');

    const results = {};
    const accountPreferences = parseAccountPreferencesField(request.account_preferences);
    let hasError = false;

    // Execute export for each platform
    for (const platform of destinations) {
      try {
        const pref = accountPreferences?.[platform] || null;
        const { result } = await runPlaylistExport({
          playlistId: request.playlist_id,
          platform,
          isPublic: true,
          allowDraftExport: false,
          exportRequestId: id,
          description: curator ? `Curated by ${curator.name} on flowerpil.io` : undefined,
          accountPreference: pref,
          mode: pref?.mode || 'replace_existing'
        });

        results[platform] = {
          success: true,
          url: result.playlistUrl || result.url
        };
      } catch (error) {
        console.error(`[EXPORT_REQUEST_EXECUTE] Failed to export to ${platform}:`, error);
        results[platform] = {
          success: false,
          error: error.message
        };
        hasError = true;
      }
    }

    // Update export request with results
    const finalStatus = hasError ? 'failed' : 'completed';
    queries.updateExportRequestResults.run(JSON.stringify(results), id);
    queries.updateExportRequestStatus.run(
      finalStatus,
      hasError ? 'Some platforms failed to export' : null,
      id
    );

    return res.json({
      success: true,
      data: {
        status: finalStatus,
        results
      }
    });
  } catch (err) {
    console.error('[EXPORT_REQUESTS_EXECUTE] Error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to execute export' });
  }
});

// POST /api/v1/export-requests/:id/mark-failed - Mark export as failed (admin only)
router.post('/:id/mark-failed', async (req, res) => {
  try {
    // Admin-only endpoint
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid request id' });
    }

    const { failed_tracks, admin_note } = req.body;

    if (!admin_note || typeof admin_note !== 'string' || !admin_note.trim()) {
      return res.status(400).json({ success: false, error: 'Admin note is required' });
    }

    const queries = getQueries();
    const request = queries.findExportRequestById.get(id);

    if (!request) {
      return res.status(404).json({ success: false, error: 'Export request not found' });
    }

    // Use direct database access to update all fields
    const { getDatabase } = await import('../database/db.js');
    const db = getDatabase();

    db.prepare(`
      UPDATE export_requests
      SET status = 'failed',
          failed_tracks = ?,
          admin_note = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      failed_tracks ? JSON.stringify(failed_tracks) : null,
      admin_note.trim(),
      id
    );

    // TODO: Send email notification (scaffolding)
    // await notificationService.sendExportFailed(id);

    return res.json({
      success: true,
      message: 'Export request marked as failed'
    });
  } catch (err) {
    console.error('[EXPORT_REQUESTS_MARK_FAILED] Error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to mark export as failed' });
  }
});

export default router;
