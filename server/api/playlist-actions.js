import express from 'express';
import fs from 'fs';
import { dirname, join, extname } from 'path';
import { fileURLToPath } from 'url';
import { authMiddleware } from '../middleware/auth.js';
import { getDatabase, getQueries } from '../database/db.js';
import { runOnce } from '../services/playlistSchedulerService.js';
import SpotifyService from '../services/spotifyService.js';
import { importFromSpotify, processSpotifyArtwork } from '../services/playlistImportService.js';
import crossPlatformLinkingService from '../services/crossPlatformLinkingService.js';
import { queueAutoExportForPlaylist } from '../services/autoExportService.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const spotifyService = new SpotifyService();

const ADMIN_ROLES = new Set(['admin', 'super_admin', 'owner', 'staff', 'ops', 'root']);

const isAdminUser = (user = {}) => ADMIN_ROLES.has(String(user.role || '').toLowerCase());

const getCuratorId = (user = {}) => (Number.isInteger(user.curator_id) ? user.curator_id : null);

const scheduleSchemaState = {
  checked: false,
  supportsAdvancedOptions: false
};

const hasAdvancedScheduleColumns = () => {
  if (scheduleSchemaState.checked) {
    return scheduleSchemaState.supportsAdvancedOptions;
  }

  try {
    const db = getDatabase();
    const columns = db.prepare(`PRAGMA table_info('playlist_import_schedules')`).all();
    const names = new Set(columns.map((col) => col.name));
    scheduleSchemaState.supportsAdvancedOptions = names.has('append_position') && names.has('update_source_title');
  } catch (error) {
    scheduleSchemaState.supportsAdvancedOptions = false;
  }

  scheduleSchemaState.checked = true;
  return scheduleSchemaState.supportsAdvancedOptions;
};

const normalizeScheduleRow = (row) => {
  if (!row) return row;
  if (!Object.prototype.hasOwnProperty.call(row, 'append_position')) {
    row.append_position = 'top';
  }
  if (!Object.prototype.hasOwnProperty.call(row, 'update_source_title')) {
    row.update_source_title = 0;
  }
  return row;
};

const parseId = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const getSpotifyAccessToken = () => {
  try {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT access_token, expires_at FROM oauth_tokens
      WHERE platform = ?
      ORDER BY COALESCE(expires_at, datetime('now')) DESC
      LIMIT 1
    `).get('spotify');
    if (!row || !row.access_token) return null;
    if (row.expires_at && new Date(row.expires_at) <= new Date()) return null;
    return row.access_token;
  } catch {
    return null;
  }
};

// Protect all endpoints
router.use(authMiddleware);

// List schedules (optionally by playlistId)
router.get('/schedules', (req, res) => {
  try {
    const db = getDatabase();
    const { playlistId } = req.query;
    const user = req.user || {};
    const isAdmin = isAdminUser(user);
    const curatorId = getCuratorId(user);

    if (!isAdmin && !curatorId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    let rows;
    if (isAdmin) {
      if (playlistId) {
        const parsed = parseId(playlistId);
        if (!parsed) {
          return res.status(400).json({ success: false, error: 'Invalid playlist id' });
        }
        rows = db.prepare('SELECT * FROM playlist_import_schedules WHERE playlist_id = ?').all(parsed);
      } else {
        rows = db.prepare('SELECT * FROM playlist_import_schedules ORDER BY next_run_at ASC NULLS LAST').all();
      }
    } else {
      if (!curatorId) {
        return res.status(403).json({ success: false, error: 'Curator access required' });
      }
      if (playlistId) {
        const parsed = parseId(playlistId);
        if (!parsed) {
          return res.status(400).json({ success: false, error: 'Invalid playlist id' });
        }
        rows = db.prepare(`
          SELECT * FROM playlist_import_schedules
          WHERE playlist_id = ? AND owner_curator_id = ?
          ORDER BY next_run_at ASC NULLS LAST
        `).all(parsed, curatorId);
      } else {
        rows = db.prepare(`
          SELECT * FROM playlist_import_schedules
          WHERE owner_curator_id = ?
          ORDER BY next_run_at ASC NULLS LAST
        `).all(curatorId);
      }
    }
    const normalized = rows.map((row) => normalizeScheduleRow({ ...(row || {}) }));
    res.json({ success: true, data: normalized });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to list schedules' });
  }
});

// Create schedule
router.post('/schedules', (req, res) => {
  try {
    const db = getDatabase();
    const queries = getQueries();
    const {
      playlist_id,
      source = 'spotify',
      mode = 'replace',
      wip_spotify_playlist_id = null,
      frequency,
      frequency_value = null,
      time_utc,
      append_position = 'top',
      update_source_title = false
    } = req.body || {};
    if (!playlist_id || !frequency || !time_utc) return res.status(400).json({ success: false, error: 'Missing required fields' });

    const playlistId = parseId(playlist_id);
    if (!playlistId) {
      return res.status(400).json({ success: false, error: 'Invalid playlist id' });
    }

    // Get the playlist's curator_id to set owner_curator_id
    const playlist = queries.getPlaylistById.get(playlistId);
    if (!playlist) {
      return res.status(404).json({ success: false, error: 'Playlist not found' });
    }

    const user = req.user || {};
    const isAdmin = isAdminUser(user);
    const curatorId = getCuratorId(user);

    if (!isAdmin) {
      if (!curatorId || playlist.curator_id !== curatorId) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }
      const role = String(user.role || '').toLowerCase();
      if (role !== 'curator') {
        return res.status(403).json({ success: false, error: 'Curator access required' });
      }
    }

    const normalizedMode = mode === 'append' ? 'append' : 'replace';
    const normalizedAppendPosition = append_position === 'bottom' ? 'bottom' : 'top';
    const shouldUpdateSourceTitle = update_source_title ? 1 : 0;
    const supportsAdvanced = hasAdvancedScheduleColumns();

    let result;
    if (supportsAdvanced) {
      const stmt = db.prepare(`
        INSERT INTO playlist_import_schedules (
          playlist_id,
          source,
          mode,
          wip_spotify_playlist_id,
          frequency,
          frequency_value,
          time_utc,
          status,
          owner_curator_id,
          append_position,
          update_source_title
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
      `);
      result = stmt.run(
        playlistId,
        source,
        normalizedMode,
        wip_spotify_playlist_id,
        frequency,
        frequency_value,
        time_utc,
        playlist.curator_id,
        normalizedAppendPosition,
        shouldUpdateSourceTitle
      );
    } else {
      const stmt = db.prepare(`
        INSERT INTO playlist_import_schedules (
          playlist_id,
          source,
          mode,
          wip_spotify_playlist_id,
          frequency,
          frequency_value,
          time_utc,
          status,
          owner_curator_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)
      `);
      result = stmt.run(
        playlistId,
        source,
        normalizedMode,
        wip_spotify_playlist_id,
        frequency,
        frequency_value,
        time_utc,
        playlist.curator_id
      );
    }
    const created = db.prepare('SELECT * FROM playlist_import_schedules WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ success: true, data: normalizeScheduleRow({ ...(created || {}) }) });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(400).json({ success: false, error: 'Schedule already exists for this playlist' });
    }
    res.status(500).json({ success: false, error: 'Failed to create schedule' });
  }
});

// Update schedule
router.put('/schedules/:id', (req, res) => {
  try {
    const db = getDatabase();
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: 'Invalid schedule id' });
    }
    const schedule = db.prepare('SELECT * FROM playlist_import_schedules WHERE id = ?').get(id);
    if (!schedule) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }

    const user = req.user || {};
    const isAdmin = isAdminUser(user);
    if (!isAdmin) {
      const curatorId = getCuratorId(user);
      if (!curatorId || schedule.owner_curator_id !== curatorId) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }
    }

    const supportsAdvanced = hasAdvancedScheduleColumns();
    const allowed = supportsAdvanced
      ? [
          'mode',
          'wip_spotify_playlist_id',
          'frequency',
          'frequency_value',
          'time_utc',
          'status',
          'append_position',
          'update_source_title'
        ]
      : [
          'mode',
          'wip_spotify_playlist_id',
          'frequency',
          'frequency_value',
          'time_utc',
          'status'
        ];
    const statusSet = new Set(['active', 'paused', 'failed']);
    const body = req.body || {};
    const sets = [];
    const params = [];
    for (const k of allowed) {
      if (!Object.prototype.hasOwnProperty.call(body, k)) continue;

      let value = body[k];

      if (k === 'mode') {
        const normalized = value === 'append' ? 'append' : value === 'replace' ? 'replace' : null;
        if (!normalized) continue;
        value = normalized;
      } else if (k === 'status') {
        if (typeof value === 'string') {
          value = value.toLowerCase();
        }
        if (!statusSet.has(value)) continue;
      } else if (k === 'append_position' && supportsAdvanced) {
        const normalized = value === 'bottom' ? 'bottom' : value === 'top' ? 'top' : null;
        if (!normalized) continue;
        value = normalized;
      } else if (k === 'update_source_title' && supportsAdvanced) {
        value = value ? 1 : 0;
      }

      sets.push(`${k} = ?`);
      params.push(value);
    }
    if (sets.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });
    params.push(id);
    db.prepare(`UPDATE playlist_import_schedules SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    const row = db.prepare('SELECT * FROM playlist_import_schedules WHERE id = ?').get(id);
    res.json({ success: true, data: normalizeScheduleRow({ ...(row || {}) }) });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to update schedule' });
  }
});

// Delete schedule
router.delete('/schedules/:id', (req, res) => {
  try {
    const db = getDatabase();
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: 'Invalid schedule id' });
    }
    const schedule = db.prepare('SELECT * FROM playlist_import_schedules WHERE id = ?').get(id);
    if (!schedule) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }
    const user = req.user || {};
    const isAdmin = isAdminUser(user);
    if (!isAdmin) {
      const curatorId = getCuratorId(user);
      if (!curatorId || schedule.owner_curator_id !== curatorId) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }
    }
    db.prepare('DELETE FROM playlist_import_schedules WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to delete schedule' });
  }
});

// Run now
router.post('/schedules/:id/run-now', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: 'Invalid schedule id' });
    }
    const db = getDatabase();
    const schedule = db.prepare('SELECT * FROM playlist_import_schedules WHERE id = ?').get(id);
    if (!schedule) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }
    const user = req.user || {};
    const isAdmin = isAdminUser(user);
    if (!isAdmin) {
      const curatorId = getCuratorId(user);
      if (!curatorId || schedule.owner_curator_id !== curatorId) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }
    }
    // fire and forget; return a simple job id
    const jobId = `playlist_${id}_${Date.now()}`;
    runOnce(id).catch(() => {});
    res.status(202).json({ success: true, data: { jobId, message: 'Scheduled import started' } });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to start import' });
  }
});

router.get('/schedules/:id/runs', (req, res) => {
  try {
    const db = getDatabase();
    const queries = getQueries();
    const id = parseInt(req.params.id, 10);
    if (!id) {
      return res.status(400).json({ success: false, error: 'Invalid schedule id' });
    }

    const schedule = db.prepare('SELECT * FROM playlist_import_schedules WHERE id = ?').get(id);
    if (!schedule) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }

    if (req.user?.role === 'curator') {
      const playlist = queries.getPlaylistById.get(schedule.playlist_id);
      if (!playlist || !req.user.curator_id || playlist.curator_id !== req.user.curator_id) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }
    }

    const limitRaw = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 25) : 5;

    const rows = db.prepare(
      'SELECT * FROM playlist_import_runs WHERE schedule_id = ? ORDER BY datetime(started_at) DESC LIMIT ?'
    ).all(id, limit);

    const data = rows.map((row) => ({
      ...row,
      stats: row.stats_json ? (() => {
        try { return JSON.parse(row.stats_json); } catch { return null; }
      })() : null
    }));

    return res.json({ success: true, data });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Failed to fetch run history' });
  }
});

router.post('/import-now', async (req, res) => {
  const startTime = Date.now();
  try {
    const queries = getQueries();
    const db = getDatabase();
    const {
      playlist_id,
      source,
      source_playlist_id = null,
      mode = 'replace',
      update_metadata = true,
      refresh_publish_date = false,
      append_position = 'top'
    } = req.body || {};

    const playlistId = parseInt(playlist_id, 10);
    if (!playlistId || !source) {
      return res.status(400).json({ success: false, error: 'playlist_id and source are required' });
    }

    console.log('[IMPORT] Starting import', {
      playlistId,
      source,
      sourcePlaylistId: source_playlist_id,
      mode,
      userId: req.user?.id,
      curatorId: req.user?.curator_id
    });

    const playlist = queries.getPlaylistById.get(playlistId);
    if (!playlist) {
      return res.status(404).json({ success: false, error: 'Playlist not found' });
    }

    if (req.user?.role === 'curator') {
      if (!req.user.curator_id || playlist.curator_id !== req.user.curator_id) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }
    }

    const normalizedMode = mode === 'append' ? 'append' : 'replace';
    const appendPosition = append_position === 'bottom' ? 'bottom' : 'top';
    const shouldUpdateMetadata = Boolean(update_metadata);
    const shouldRefreshPublishDate = Boolean(refresh_publish_date);

    if (source !== 'spotify') {
      return res.status(400).json({ success: false, error: 'Only Spotify import is supported in this endpoint' });
    }

    // Extract Spotify playlist ID from source_playlist_id or playlist.spotify_url
    let spotifyId = source_playlist_id ? String(source_playlist_id).trim() : '';

    if (!spotifyId && playlist.spotify_url) {
      const url = String(playlist.spotify_url).trim();
      // Handle various Spotify URL formats:
      // - https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M
      // - https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=...
      // - spotify:playlist:37i9dQZF1DXcBWIGoYBM5M
      const match = url.match(/playlist[\/:]([a-zA-Z0-9]+)/);
      if (match && match[1]) {
        spotifyId = match[1];
      }
    }

    if (!spotifyId) {
      return res.status(400).json({
        success: false,
        error: 'Spotify playlist id is required. Ensure the playlist has a valid spotify_url.'
      });
    }

    const token = getSpotifyAccessToken();
    if (!token) {
      return res.status(400).json({ success: false, error: 'Spotify connection required' });
    }

    const importResult = await importFromSpotify({
      playlistId,
      spotifyPlaylistId: spotifyId,
      mode: normalizedMode,
      appendPosition,
      handleDeletions: true,
      curatorToken: token,
      artwork: false,
      returnDetails: shouldUpdateMetadata
    });

    let nextImage = playlist.image;
    let nextSpotifyUrl = playlist.spotify_url;
    let nextTitle = playlist.title;
    let nextDescription = playlist.description;
    let nextShortDescription = playlist.description_short;

    if (shouldUpdateMetadata) {
      const details = importResult?.sourcePlaylist || {};
      if (details.name) nextTitle = details.name;
      if (typeof details.description === 'string') {
        nextDescription = details.description;
        nextShortDescription = spotifyService.truncateDescription(details.description || '');
      }
      if (details.externalUrl) nextSpotifyUrl = details.externalUrl;

      if (details.image) {
        try {
          const artwork = await spotifyService.downloadArtwork(details.image, `playlist-${playlistId}-${Date.now()}.jpg`);
          if (artwork) {
            const stored = await processSpotifyArtwork(artwork, 'playlist');
            if (stored) {
              nextImage = stored;
            }
          }
        } catch {}
      }
    }

    const nextPublishDate = shouldRefreshPublishDate
      ? new Date().toISOString().split('T')[0]
      : playlist.publish_date;

    db.prepare(`
      UPDATE playlists SET
        title = ?,
        description = ?,
        description_short = ?,
        image = ?,
        spotify_url = ?,
        publish_date = ?
      WHERE id = ?
    `).run(
      nextTitle,
      nextDescription || '',
      nextShortDescription || '',
      nextImage || '',
      nextSpotifyUrl || '',
      nextPublishDate || playlist.publish_date,
      playlistId
    );

    try {
      await crossPlatformLinkingService.startPlaylistLinking(playlistId, { forceRefresh: normalizedMode === 'replace' });
    } catch (linkErr) {
      console.warn('[IMPORT] Failed to start linking', { playlistId, error: linkErr?.message });
    }

    try {
      const autoResult = queueAutoExportForPlaylist({
        playlistId,
        trigger: 'import',
        exclude: [source],
        resetProgress: true
      });
      if (!autoResult.queued) {
        console.info('[AUTO_EXPORT] Import trigger skipped', {
          playlistId,
          reason: autoResult.reason
        });
      }
    } catch (autoErr) {
      console.warn('[AUTO_EXPORT] Failed to queue request after import', autoErr?.message || autoErr);
    }

    const duration = Date.now() - startTime;
    console.log('[IMPORT] Import completed', {
      playlistId,
      source,
      tracksAdded: importResult?.tracksAdded || 0,
      tracksTotal: importResult?.tracksTotal || 0,
      durationMs: duration,
      userId: req.user?.id
    });

    return res.json({ success: true, data: { stats: importResult } });
  } catch (e) {
    const duration = Date.now() - startTime;
    console.error('[IMPORT] Import failed', {
      playlistId: req.body?.playlist_id,
      source: req.body?.source,
      error: e.message,
      durationMs: duration,
      userId: req.user?.id
    });
    return res.status(500).json({ success: false, error: e.message || 'Failed to sync playlist' });
  }
});

// DSP helper: list Spotify playlists for the authenticated export token
router.get('/dsp/spotify/playlists', async (req, res) => {
  try {
    const token = getSpotifyAccessToken();
    if (!token) {
      return res.status(401).json({ success: false, error: 'Spotify not connected', code: 'AUTH_REQUIRED' });
    }

    // Fetch all playlists by paginating through results
    const limit = 50;
    let offset = 0;
    let allPlaylists = [];
    let hasMore = true;

    while (hasMore) {
      const data = await spotifyService.getUserPlaylists(token, limit, offset);
      const items = data?.items || [];
      allPlaylists = allPlaylists.concat(items);

      // Check if there are more playlists to fetch
      hasMore = data?.next !== null && items.length === limit;
      offset += limit;

      // Safety limit to prevent infinite loops (e.g., max 1000 playlists)
      if (offset >= 1000) {
        break;
      }
    }

    return res.json({ success: true, data: { items: allPlaylists } });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Failed to fetch Spotify playlists' });
  }
});

export default router;
