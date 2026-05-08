// server/services/backfillSchedulerService.js
import cron from 'node-cron';
import { getDatabase, getQueries } from '../database/db.js';
import crossPlatformLinkingService from './crossPlatformLinkingService.js';
import DeezerPreviewService from './deezerPreviewService.js';
import logger from '../utils/logger.js';

const MAX_ATTEMPTS = 2;
const BATCH_SIZE = 50;

class BackfillSchedulerService {
  constructor() {
    this.crossLinkJob = null;
    this.previewJob = null;
    this.isRunningCrossLinks = false;
    this.isRunningPreviews = false;
    this.deezerService = new DeezerPreviewService();
    this.lastCrossLinkRun = null;
    this.lastPreviewRun = null;
    this.lastCrossLinkStats = null;
    this.lastPreviewStats = null;
  }

  /**
   * Start the hourly scheduled jobs
   */
  start() {
    // Run cross-link backfill every hour at minute 0
    this.crossLinkJob = cron.schedule('0 * * * *', () => {
      this.runCrossLinkBackfill();
    });

    // Run preview backfill every hour at minute 30
    this.previewJob = cron.schedule('30 * * * *', () => {
      this.runPreviewBackfill();
    });

    logger.info('BACKFILL_SCHEDULER', 'Backfill scheduler started', {
      crossLinks: 'hourly at :00',
      previews: 'hourly at :30'
    });
  }

  /**
   * Stop the scheduled jobs
   */
  stop() {
    if (this.crossLinkJob) {
      this.crossLinkJob.stop();
      this.crossLinkJob = null;
    }
    if (this.previewJob) {
      this.previewJob.stop();
      this.previewJob = null;
    }
    logger.info('BACKFILL_SCHEDULER', 'Backfill scheduler stopped');
  }

  /**
   * Get tracks missing cross-links from published playlists
   */
  getTracksNeedingCrossLinks() {
    const db = getDatabase();
    return db.prepare(`
      SELECT t.id, t.artist, t.title, t.album, t.isrc, t.spotify_id,
             t.apple_music_url, t.tidal_url, t.youtube_music_url,
             t.linking_attempts, p.id as playlist_id, p.title as playlist_title
      FROM tracks t
      JOIN playlists p ON t.playlist_id = p.id
      WHERE p.published = 1
        AND (t.linking_attempts IS NULL OR t.linking_attempts < ?)
        AND (
          t.apple_music_url IS NULL OR
          t.tidal_url IS NULL OR
          (t.spotify_id IS NULL OR TRIM(t.spotify_id) = '') OR
          (t.youtube_music_url IS NULL OR TRIM(t.youtube_music_url) = '')
        )
      ORDER BY t.linking_attempts ASC NULLS FIRST, t.linking_last_attempt ASC NULLS FIRST
      LIMIT ?
    `).all(MAX_ATTEMPTS, BATCH_SIZE);
  }

  /**
   * Get tracks missing previews from published playlists
   */
  getTracksNeedingPreviews() {
    const db = getDatabase();
    return db.prepare(`
      SELECT t.id, t.artist, t.title, t.album, t.isrc,
             t.deezer_preview_url, t.preview_attempts,
             p.id as playlist_id, p.title as playlist_title
      FROM tracks t
      JOIN playlists p ON t.playlist_id = p.id
      WHERE p.published = 1
        AND (t.preview_attempts IS NULL OR t.preview_attempts < ?)
        AND (t.deezer_preview_url IS NULL OR TRIM(t.deezer_preview_url) = '')
        AND (t.soundcloud_url IS NULL OR TRIM(t.soundcloud_url) = '')
      ORDER BY t.preview_attempts ASC NULLS FIRST, t.preview_last_attempt ASC NULLS FIRST
      LIMIT ?
    `).all(MAX_ATTEMPTS, BATCH_SIZE);
  }

  /**
   * Update track linking attempt count
   */
  incrementLinkingAttempt(trackId, success) {
    const db = getDatabase();
    if (success) {
      // Reset attempts on success
      db.prepare(`
        UPDATE tracks SET
          linking_attempts = 0,
          linking_last_attempt = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(trackId);
    } else {
      // Increment attempts on failure
      db.prepare(`
        UPDATE tracks SET
          linking_attempts = COALESCE(linking_attempts, 0) + 1,
          linking_last_attempt = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(trackId);
    }
  }

  /**
   * Update track preview attempt count
   */
  incrementPreviewAttempt(trackId, success) {
    const db = getDatabase();
    if (success) {
      // Reset attempts on success
      db.prepare(`
        UPDATE tracks SET
          preview_attempts = 0,
          preview_last_attempt = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(trackId);
    } else {
      // Increment attempts on failure
      db.prepare(`
        UPDATE tracks SET
          preview_attempts = COALESCE(preview_attempts, 0) + 1,
          preview_last_attempt = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(trackId);
    }
  }

  /**
   * Run cross-link backfill for all published playlists
   */
  async runCrossLinkBackfill() {
    if (this.isRunningCrossLinks) {
      logger.warn('BACKFILL_SCHEDULER', 'Cross-link backfill already running, skipping');
      return { skipped: true, reason: 'already_running' };
    }

    this.isRunningCrossLinks = true;
    this.lastCrossLinkRun = new Date();
    const stats = { processed: 0, success: 0, failed: 0, skipped: 0 };

    try {
      const tracks = this.getTracksNeedingCrossLinks();
      logger.info('BACKFILL_SCHEDULER', `Starting cross-link backfill for ${tracks.length} tracks`);

      for (const track of tracks) {
        try {
          const result = await crossPlatformLinkingService.linkTrack(track.id, {
            forceRefresh: false,
            tidalRetryAttempts: 1
          });

          if (result && (result.apple || result.tidal || result.spotify || result.youtube)) {
            stats.success++;
            this.incrementLinkingAttempt(track.id, true);
          } else {
            stats.failed++;
            this.incrementLinkingAttempt(track.id, false);
          }
          stats.processed++;

          // Rate limiting delay
          await this.delay(200);
        } catch (error) {
          logger.error('BACKFILL_SCHEDULER', `Cross-link failed for track ${track.id}`, {
            error: error.message,
            track: `${track.artist} - ${track.title}`
          });
          stats.failed++;
          this.incrementLinkingAttempt(track.id, false);
          stats.processed++;
        }
      }

      this.lastCrossLinkStats = stats;
      logger.info('BACKFILL_SCHEDULER', 'Cross-link backfill completed', stats);
      return stats;
    } finally {
      this.isRunningCrossLinks = false;
    }
  }

  /**
   * Run preview backfill for all published playlists
   */
  async runPreviewBackfill() {
    if (this.isRunningPreviews) {
      logger.warn('BACKFILL_SCHEDULER', 'Preview backfill already running, skipping');
      return { skipped: true, reason: 'already_running' };
    }

    this.isRunningPreviews = true;
    this.lastPreviewRun = new Date();
    const stats = { processed: 0, success: 0, failed: 0, skipped: 0 };
    const queries = getQueries();

    try {
      const tracks = this.getTracksNeedingPreviews();
      logger.info('BACKFILL_SCHEDULER', `Starting preview backfill for ${tracks.length} tracks`);

      for (const track of tracks) {
        try {
          const previewData = await this.deezerService.getPreviewForTrack(track);

          if (previewData && previewData.url) {
            queries.updateTrackPreview.run(
              previewData.deezer_id,
              previewData.url,
              previewData.source,
              previewData.confidence,
              track.id
            );
            stats.success++;
            this.incrementPreviewAttempt(track.id, true);
          } else {
            stats.failed++;
            this.incrementPreviewAttempt(track.id, false);
          }
          stats.processed++;

          // Rate limiting delay
          await this.delay(200);
        } catch (error) {
          logger.error('BACKFILL_SCHEDULER', `Preview failed for track ${track.id}`, {
            error: error.message,
            track: `${track.artist} - ${track.title}`
          });
          stats.failed++;
          this.incrementPreviewAttempt(track.id, false);
          stats.processed++;
        }
      }

      this.lastPreviewStats = stats;
      logger.info('BACKFILL_SCHEDULER', 'Preview backfill completed', stats);
      return stats;
    } finally {
      this.isRunningPreviews = false;
    }
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      crossLinks: {
        running: this.isRunningCrossLinks,
        lastRun: this.lastCrossLinkRun,
        lastStats: this.lastCrossLinkStats,
        scheduled: this.crossLinkJob ? 'hourly at :00' : 'stopped'
      },
      previews: {
        running: this.isRunningPreviews,
        lastRun: this.lastPreviewRun,
        lastStats: this.lastPreviewStats,
        scheduled: this.previewJob ? 'hourly at :30' : 'stopped'
      }
    };
  }

  /**
   * Get global stats for cross-links across all published playlists
   */
  getCrossLinkGlobalStats() {
    const db = getDatabase();
    return db.prepare(`
      SELECT
        COUNT(*) as total_tracks,
        COUNT(CASE WHEN t.apple_music_url IS NOT NULL THEN 1 END) as apple_links,
        COUNT(CASE WHEN t.tidal_url IS NOT NULL THEN 1 END) as tidal_links,
        COUNT(CASE WHEN t.spotify_id IS NOT NULL AND TRIM(t.spotify_id) != '' THEN 1 END) as spotify_links,
        COUNT(CASE WHEN t.youtube_music_url IS NOT NULL AND TRIM(t.youtube_music_url) != '' THEN 1 END) as youtube_links,
        COUNT(CASE WHEN t.linking_attempts >= ? THEN 1 END) as max_attempts_reached,
        COUNT(CASE WHEN
          t.apple_music_url IS NULL OR
          t.tidal_url IS NULL OR
          (t.spotify_id IS NULL OR TRIM(t.spotify_id) = '') OR
          (t.youtube_music_url IS NULL OR TRIM(t.youtube_music_url) = '')
        THEN 1 END) as missing_any_link
      FROM tracks t
      JOIN playlists p ON t.playlist_id = p.id
      WHERE p.published = 1
    `).get(MAX_ATTEMPTS);
  }

  /**
   * Get global stats for previews across all published playlists
   */
  getPreviewGlobalStats() {
    const db = getDatabase();
    return db.prepare(`
      SELECT
        COUNT(*) as total_tracks,
        COUNT(CASE WHEN t.deezer_preview_url IS NOT NULL AND TRIM(t.deezer_preview_url) != '' THEN 1 END) as with_deezer_preview,
        COUNT(CASE WHEN t.soundcloud_url IS NOT NULL AND TRIM(t.soundcloud_url) != '' THEN 1 END) as with_soundcloud,
        COUNT(CASE WHEN t.preview_attempts >= ? THEN 1 END) as max_attempts_reached,
        COUNT(CASE WHEN
          (t.deezer_preview_url IS NULL OR TRIM(t.deezer_preview_url) = '') AND
          (t.soundcloud_url IS NULL OR TRIM(t.soundcloud_url) = '')
        THEN 1 END) as missing_preview
      FROM tracks t
      JOIN playlists p ON t.playlist_id = p.id
      WHERE p.published = 1
    `).get(MAX_ATTEMPTS);
  }

  /**
   * Reset attempt counter for a specific track
   */
  resetTrackAttempts(trackId, type = 'both') {
    const db = getDatabase();
    if (type === 'crosslinks' || type === 'both') {
      db.prepare('UPDATE tracks SET linking_attempts = 0 WHERE id = ?').run(trackId);
    }
    if (type === 'previews' || type === 'both') {
      db.prepare('UPDATE tracks SET preview_attempts = 0 WHERE id = ?').run(trackId);
    }
  }

  /**
   * Reset attempt counters for all tracks (admin action)
   */
  resetAllAttempts(type = 'both') {
    const db = getDatabase();
    if (type === 'crosslinks' || type === 'both') {
      db.prepare('UPDATE tracks SET linking_attempts = 0').run();
    }
    if (type === 'previews' || type === 'both') {
      db.prepare('UPDATE tracks SET preview_attempts = 0').run();
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const backfillSchedulerService = new BackfillSchedulerService();
export default backfillSchedulerService;
