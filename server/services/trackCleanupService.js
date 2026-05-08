import { getDatabase } from '../database/db.js';
import logger from '../utils/logger.js';
import slackService from './SlackNotificationService.js';

const DEFAULT_MAX_AGE_HOURS = Number.parseInt(process.env.LINKING_PENDING_MAX_AGE_HOURS || '24', 10);
const CLEANUP_INTERVAL_MS = Number.parseInt(process.env.LINKING_DEADLETTER_INTERVAL_MS || `${10 * 60 * 1000}`, 10);
const ALERT_THRESHOLD = Number.parseInt(process.env.LINKING_DEADLETTER_ALERT_THRESHOLD || '10', 10);

class TrackCleanupService {
  constructor() {
    this.db = getDatabase();
    this.interval = null;
  }

  markExpiredPendingTracks(maxAgeHours = DEFAULT_MAX_AGE_HOURS) {
    const ageHours = Number.isFinite(maxAgeHours) && maxAgeHours > 0 ? maxAgeHours : DEFAULT_MAX_AGE_HOURS;
    const result = this.db.prepare(`
      UPDATE tracks
      SET linking_status = 'failed',
          linking_error = 'max_age_exceeded',
          linking_max_age_exceeded = 1,
          linking_lease_owner = NULL,
          linking_lease_expires = NULL,
          linking_updated_at = CURRENT_TIMESTAMP
      WHERE linking_status = 'pending'
        AND COALESCE(linking_updated_at, created_at, CURRENT_TIMESTAMP) < datetime('now', ?)
    `).run(`-${ageHours} hours`);

    const expired = result.changes || 0;

    if (expired > 0) {
      logger.warn('TRACK_CLEANUP', 'Expired pending tracks moved to dead-letter', {
        expired,
        maxAgeHours: ageHours
      });

      if (expired >= ALERT_THRESHOLD) {
        this.sendAlert(expired, ageHours).catch((error) => {
          logger.error('TRACK_CLEANUP', 'Failed to send dead-letter alert', { error: error?.message });
        });
      }
    }

    return { expired, maxAgeHours: ageHours };
  }

  async sendAlert(count, maxAgeHours) {
    const severity = count >= ALERT_THRESHOLD * 2 ? 'critical' : 'warning';
    const summary = `${count} tracks exceeded ${maxAgeHours}h pending threshold and were moved to dead-letter`;
    await slackService.notifySystemAlert({ severity, text: summary });
  }

  start() {
    if (this.interval) {
      return this.interval;
    }

    const run = () => {
      try {
        this.markExpiredPendingTracks();
      } catch (error) {
        logger.error('TRACK_CLEANUP', 'Cleanup run failed', { error: error?.message });
      }
    };

    run();
    this.interval = setInterval(run, CLEANUP_INTERVAL_MS);
    if (typeof this.interval.unref === 'function') {
      this.interval.unref();
    }

    logger.info('TRACK_CLEANUP', 'Track cleanup service started', {
      intervalMs: CLEANUP_INTERVAL_MS,
      maxAgeHours: DEFAULT_MAX_AGE_HOURS,
      alertThreshold: ALERT_THRESHOLD
    });

    return this.interval;
  }
}

const trackCleanupService = new TrackCleanupService();

export const startTrackCleanup = () => trackCleanupService.start();
export default trackCleanupService;
