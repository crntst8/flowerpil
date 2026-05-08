import os from 'os';
import { getDatabase } from '../database/db.js';
import { importFromSpotify } from './playlistImportService.js';
import { crossPlatformLinkingService } from './crossPlatformLinkingService.js';
import { queueAutoExportForPlaylist } from './autoExportService.js';

const ownerId = `${os.hostname()}:${process.pid}`;

function computeNextRunAt({ frequency, frequency_value, time_utc }, now = new Date()) {
  const [hh, mm] = (time_utc || '00:00').split(':').map(n => parseInt(n, 10));
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hh || 0, mm || 0, 0));
  const addDays = (d) => new Date(base.getTime() + d * 86400000);

  const dowIdx = { sun:0, mon:1, tue:2, wed:3, thu:4, fri:5, sat:6 };

  if (frequency === 'daily') {
    return addDays(1).toISOString();
  }
  if (frequency === 'monthly') {
    const d = new Date(base);
    d.setUTCMonth(d.getUTCMonth() + 1);
    return d.toISOString();
  }
  if (frequency === 'every_x_date') {
    const day = Math.max(1, Math.min(31, parseInt(frequency_value || '1', 10) || 1));
    let d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day, hh || 0, mm || 0, 0));
    if (d <= now) d.setUTCMonth(d.getUTCMonth() + 1);
    return d.toISOString();
  }
  if (frequency === 'every_x_dow') {
    const list = String(frequency_value || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const today = now.getUTCDay();
    for (let i = 1; i <= 7; i++) {
      const cand = (today + i) % 7;
      const key = Object.keys(dowIdx).find(k => dowIdx[k] === cand);
      if (list.includes(key)) {
        return addDays(i).toISOString();
      }
    }
    return addDays(1).toISOString();
  }
  // default fallback daily
  return addDays(1).toISOString();
}

async function getSpotifyAccessToken(db, curatorId = null) {
  try {
    let row;

    if (curatorId) {
      // For curator imports, get the curator's own Spotify token from export_oauth_tokens
      row = db.prepare(`
        SELECT access_token, expires_at FROM export_oauth_tokens
        WHERE platform = 'spotify'
          AND account_type = 'curator'
          AND owner_curator_id = ?
          AND is_active = 1
        ORDER BY COALESCE(expires_at, datetime('now')) DESC
        LIMIT 1
      `).get(curatorId);

      if (!row) {
        console.warn(`[SPOTIFY_TOKEN] No active Spotify token found for curator ${curatorId}`);
        return null;
      }
    } else {
      // For admin/flowerpil imports, get the flowerpil Spotify token
      row = db.prepare(`
        SELECT access_token, expires_at FROM export_oauth_tokens
        WHERE platform = 'spotify'
          AND account_type = 'flowerpil'
          AND is_active = 1
        ORDER BY COALESCE(expires_at, datetime('now')) DESC
        LIMIT 1
      `).get();

      if (!row) {
        console.warn('[SPOTIFY_TOKEN] No active flowerpil Spotify token found');
        return null;
      }
    }

    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      console.warn(`[SPOTIFY_TOKEN] Token expired for ${curatorId ? `curator ${curatorId}` : 'flowerpil'}`);
      return null;
    }

    console.log(`[SPOTIFY_TOKEN] Found valid token for ${curatorId ? `curator ${curatorId}` : 'flowerpil'}`);
    return row.access_token;
  } catch (error) {
    console.error(`[SPOTIFY_TOKEN] Error fetching token for ${curatorId ? `curator ${curatorId}` : 'flowerpil'}:`, error);
    return null;
  }
}

export function start({ tickMs = 60000, maxConcurrent = 5 } = {}) {
  const db = getDatabase();
  const queue = new Set();

  async function tick() {
    try {
      const now = new Date();
      const due = db.prepare(`
        SELECT * FROM playlist_import_schedules
        WHERE status = 'active'
          AND (next_run_at IS NULL OR datetime(next_run_at) <= datetime('now'))
          AND (lock_expires_at IS NULL OR datetime(lock_expires_at) <= datetime('now'))
        LIMIT 20
      `).all();
      for (const sched of due) {
        if (queue.size >= maxConcurrent) break;
        // try acquire lock
        const res = db.prepare(`
          UPDATE playlist_import_schedules
          SET lock_owner = ?, lock_expires_at = datetime('now', '+5 minutes')
          WHERE id = ? AND (lock_expires_at IS NULL OR datetime(lock_expires_at) <= datetime('now'))
        `).run(ownerId, sched.id);
        if (res.changes === 0) continue;
        queue.add(sched.id);
        (async () => {
          let accessToken = await getSpotifyAccessToken(db, sched.owner_curator_id);
          // Fall back to flowerpil token if curator doesn't have one
          if (!accessToken && sched.owner_curator_id) {
            accessToken = await getSpotifyAccessToken(db, null);
          }
          const startedAt = new Date();
          let status = 'success';
          let stats = null;
          let error = null;
          try {
            if (sched.source !== 'spotify') throw new Error('Unsupported source');

            const playlistRow = db.prepare('SELECT id, published, spotify_url FROM playlists WHERE id = ?').get(sched.playlist_id);
            const useId = sched.wip_spotify_playlist_id || ((playlistRow?.spotify_url || '').split('/').pop());
            if (!useId) throw new Error('Missing spotify playlist id');

            const appendPosition = sched.append_position === 'bottom' ? 'bottom' : 'top';
            const shouldUpdateTitle = Boolean(sched.update_source_title);

            stats = await importFromSpotify({
              playlistId: sched.playlist_id,
              spotifyPlaylistId: useId,
              mode: sched.mode,
              appendPosition,
              handleDeletions: true,
              curatorToken: accessToken,
              artwork: false,
              returnDetails: shouldUpdateTitle
            });

            if (playlistRow) {
              const updates = [];
              const params = [];
              if (playlistRow.published) {
                const today = new Date().toISOString().split('T')[0];
                updates.push('publish_date = ?');
                params.push(today);
              }
              if (shouldUpdateTitle && stats?.sourcePlaylist?.name) {
                updates.push('title = ?');
                params.push(stats.sourcePlaylist.name);
              }
              if (updates.length) {
                updates.push("updated_at = datetime('now')");
                params.push(sched.playlist_id);
                db.prepare(`UPDATE playlists SET ${updates.join(', ')} WHERE id = ?`).run(...params);
              }
            }

            const autoResult = queueAutoExportForPlaylist({
              playlistId: sched.playlist_id,
              trigger: 'import_schedule',
              exclude: [sched.source],
              resetProgress: true,
              changeSummary: stats
            });
            if (!autoResult.queued) {
              console.info('[AUTO_EXPORT] Schedule trigger skipped', {
                playlistId: sched.playlist_id,
                reason: autoResult.reason
              });
            }
          } catch (e) {
            status = 'failed';
            error = e.message;
          }
          const finishedAt = new Date();
          db.prepare(`
            INSERT INTO playlist_import_runs (schedule_id, playlist_id, started_at, finished_at, status, stats_json, error)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(sched.id, sched.playlist_id, startedAt.toISOString(), finishedAt.toISOString(), status, stats ? JSON.stringify(stats) : null, error);
          // update schedule times
          const nextRun = computeNextRunAt({ frequency: sched.frequency, frequency_value: sched.frequency_value, time_utc: sched.time_utc }, new Date());
          db.prepare(`UPDATE playlist_import_schedules SET last_run_at = ?, next_run_at = ?, lock_owner = NULL, lock_expires_at = NULL WHERE id = ?`).run(finishedAt.toISOString(), nextRun, sched.id);
          // trigger cross-platform linking best-effort
          try { crossPlatformLinkingService.startPlaylistLinking(sched.playlist_id); } catch {}
          queue.delete(sched.id);
        })();
      }
    } catch {
      // noop
    }
  }

  // kick initial
  setTimeout(tick, 2500);
  return setInterval(tick, tickMs);
}

export async function runOnce(scheduleId) {
  const db = getDatabase();
  const sched = db.prepare('SELECT * FROM playlist_import_schedules WHERE id = ?').get(scheduleId);
  if (!sched) throw new Error('Schedule not found');
  let token = await getSpotifyAccessToken(db, sched.owner_curator_id);
  if (!token && sched.owner_curator_id) {
    token = await getSpotifyAccessToken(db, null);
  }
  const playlistRow = db.prepare('SELECT id, published, spotify_url FROM playlists WHERE id = ?').get(sched.playlist_id);
  const useId = sched.wip_spotify_playlist_id || ((playlistRow?.spotify_url || '').split('/').pop());
  if (!useId) throw new Error('Missing spotify playlist id');
  const appendPosition = sched.append_position === 'bottom' ? 'bottom' : 'top';
  const shouldUpdateTitle = Boolean(sched.update_source_title);
  const startedAt = new Date();
  const stats = await importFromSpotify({
    playlistId: sched.playlist_id,
    spotifyPlaylistId: useId,
    mode: sched.mode,
    appendPosition,
    handleDeletions: true,
    curatorToken: token,
    artwork: false,
    returnDetails: shouldUpdateTitle
  });
  const finishedAt = new Date();

  if (playlistRow) {
    const updates = [];
    const params = [];
    if (playlistRow.published) {
      const today = new Date().toISOString().split('T')[0];
      updates.push('publish_date = ?');
      params.push(today);
    }
    if (shouldUpdateTitle && stats?.sourcePlaylist?.name) {
      updates.push('title = ?');
      params.push(stats.sourcePlaylist.name);
    }
    if (updates.length) {
      updates.push("updated_at = datetime('now')");
      params.push(sched.playlist_id);
      db.prepare(`UPDATE playlists SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }
  }

  const autoResult = queueAutoExportForPlaylist({
    playlistId: sched.playlist_id,
    trigger: 'import_schedule_manual',
    exclude: [sched.source],
    resetProgress: true,
    changeSummary: stats
  });
  if (!autoResult.queued) {
    console.info('[AUTO_EXPORT] Manual schedule trigger skipped', {
      playlistId: sched.playlist_id,
      reason: autoResult.reason
    });
  }
  db.prepare(`
    INSERT INTO playlist_import_runs (schedule_id, playlist_id, started_at, finished_at, status, stats_json, error)
    VALUES (?, ?, ?, ?, 'success', ?, NULL)
  `).run(
    sched.id,
    sched.playlist_id,
    startedAt.toISOString(),
    finishedAt.toISOString(),
    stats ? JSON.stringify(stats) : null
  );
  const nextRun = computeNextRunAt({ frequency: sched.frequency, frequency_value: sched.frequency_value, time_utc: sched.time_utc }, new Date());
  db.prepare(`UPDATE playlist_import_schedules SET last_run_at = ?, next_run_at = ? WHERE id = ?`).run(finishedAt.toISOString(), nextRun, sched.id);
  try { crossPlatformLinkingService.startPlaylistLinking(sched.playlist_id); } catch {}
  return stats;
}

export default { start, runOnce };
