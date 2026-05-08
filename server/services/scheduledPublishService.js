import { getDatabase } from '../database/db.js';
import { queueAutoExportForPlaylist } from './autoExportService.js';
import logger from '../utils/logger.js';

let intervalId = null;

function tick() {
  try {
    const db = getDatabase();
    if (!db) return;

    const duePlaylists = db.prepare(`
      SELECT * FROM playlists
      WHERE published = 0
        AND scheduled_publish_at IS NOT NULL
        AND scheduled_publish_at <= datetime('now')
    `).all();

    if (!duePlaylists.length) return;

    for (const playlist of duePlaylists) {
      try {
        // Publish the playlist
        db.prepare(`
          UPDATE playlists
          SET published = 1,
              published_at = COALESCE(published_at, CURRENT_TIMESTAMP),
              scheduled_publish_at = NULL
          WHERE id = ?
        `).run(playlist.id);

        logger.info('SCHEDULED_PUBLISH', `Auto-published playlist ${playlist.id}: "${playlist.title}"`);

        // Queue auto-export
        try {
          queueAutoExportForPlaylist({
            playlistId: playlist.id,
            trigger: 'scheduled_publish',
            resetProgress: true
          });
        } catch (exportErr) {
          logger.error('SCHEDULED_PUBLISH', `Auto-export failed for playlist ${playlist.id}`, {
            error: exportErr.message
          });
        }
      } catch (publishErr) {
        logger.error('SCHEDULED_PUBLISH', `Failed to publish playlist ${playlist.id}`, {
          error: publishErr.message
        });
      }
    }
  } catch (err) {
    logger.error('SCHEDULED_PUBLISH', 'Tick failed', { error: err.message });
  }
}

export function startScheduledPublishService() {
  if (intervalId) return;
  intervalId = setInterval(tick, 60000);
  // Run once on start to catch any missed schedules
  tick();
  logger.info('SCHEDULED_PUBLISH', 'Scheduled publish service started (60s interval)');
}

export function stopScheduledPublishService() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
