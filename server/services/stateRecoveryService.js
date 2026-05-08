import cron from 'node-cron';
import { getDatabase } from '../database/db.js';
import logger from '../utils/logger.js';
import slackService from './SlackNotificationService.js';

/**
 * State Recovery Service
 *
 * Automatically recovers from stale system state caused by worker crashes,
 * network failures, or orphaned database records.
 *
 * Recovery tasks:
 * - Requeue expired linking leases (tracks stuck in 'processing')
 * - Cleanup stale worker heartbeats (offline workers)
 * - Reset stuck export requests (exports stuck 'in_progress')
 *
 * Runs every 10 minutes via cron job.
 * Sends Slack alerts when recovery thresholds are exceeded.
 */

// Configuration from environment variables or defaults
const CRON_SCHEDULE = process.env.STATE_RECOVERY_CRON || '*/10 * * * *'; // Every 10 minutes
const LEASE_EXPIRE_MARGIN_MINUTES = Number.parseInt(process.env.LEASE_EXPIRE_MARGIN_MINUTES || '5', 10);
const HEARTBEAT_STALE_MINUTES = Number.parseInt(process.env.HEARTBEAT_STALE_MINUTES || '10', 10);
const EXPORT_STUCK_MINUTES = Number.parseInt(process.env.EXPORT_STUCK_MINUTES || '30', 10);

// Alert thresholds
const EXPIRED_LEASE_ALERT_THRESHOLD = Number.parseInt(process.env.EXPIRED_LEASE_ALERT_THRESHOLD || '10', 10);
const STUCK_EXPORT_ALERT_THRESHOLD = Number.parseInt(process.env.STUCK_EXPORT_ALERT_THRESHOLD || '5', 10);

class StateRecoveryService {
  constructor() {
    this.db = getDatabase();
    this.cronJob = null;
    this.isRunning = false;
    this.lastRun = null;
    this.stats = {
      totalRuns: 0,
      leasesRecovered: 0,
      heartbeatsCleaned: 0,
      exportsReset: 0,
      errors: 0
    };
  }

  /**
   * Requeue tracks with expired leases
   * Tracks stuck in 'processing' with expired leases are moved back to 'pending'
   */
  requeueExpiredLeases() {
    try {
      const result = this.db.prepare(`
        UPDATE tracks
        SET linking_status = 'pending',
            linking_lease_owner = NULL,
            linking_lease_expires = NULL,
            linking_updated_at = CURRENT_TIMESTAMP
        WHERE linking_status = 'processing'
          AND linking_lease_expires < datetime('now', ?)
      `).run(`-${LEASE_EXPIRE_MARGIN_MINUTES} minutes`);

      const recovered = result.changes || 0;
      this.stats.leasesRecovered += recovered;

      if (recovered > 0) {
        logger.warn('STATE_RECOVERY', 'Auto-recovered expired leases', {
          recovered,
          marginMinutes: LEASE_EXPIRE_MARGIN_MINUTES
        });

        // Send alert if threshold exceeded
        if (recovered >= EXPIRED_LEASE_ALERT_THRESHOLD) {
          this.sendLeaseAlert(recovered).catch((error) => {
            logger.error('STATE_RECOVERY', 'Failed to send lease recovery alert', {
              error: error?.message
            });
          });
        }
      } else {
        logger.debug('STATE_RECOVERY', 'No expired leases to recover');
      }

      return { recovered };
    } catch (error) {
      logger.error('STATE_RECOVERY', 'Failed to requeue expired leases', {
        error: error?.message,
        stack: error?.stack
      });
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Cleanup stale worker heartbeats
   * Remove heartbeat records for workers that haven't checked in recently
   */
  cleanupStaleHeartbeats() {
    try {
      const result = this.db.prepare(`
        DELETE FROM dsp_worker_heartbeats
        WHERE last_seen < datetime('now', ?)
      `).run(`-${HEARTBEAT_STALE_MINUTES} minutes`);

      const removed = result.changes || 0;
      this.stats.heartbeatsCleaned += removed;

      if (removed > 0) {
        logger.info('STATE_RECOVERY', 'Removed stale worker heartbeats', {
          removed,
          staleAfterMinutes: HEARTBEAT_STALE_MINUTES
        });
      } else {
        logger.debug('STATE_RECOVERY', 'No stale heartbeats to clean');
      }

      return { removed };
    } catch (error) {
      logger.error('STATE_RECOVERY', 'Failed to cleanup stale heartbeats', {
        error: error?.message,
        stack: error?.stack
      });
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Reset stuck export requests
   * Export requests stuck in 'in_progress' for too long are reset to 'pending'
   */
  resetStuckExportRequests() {
    try {
      const result = this.db.prepare(`
        UPDATE export_requests
        SET status = 'pending',
            updated_at = CURRENT_TIMESTAMP
        WHERE status = 'in_progress'
          AND updated_at < datetime('now', ?)
      `).run(`-${EXPORT_STUCK_MINUTES} minutes`);

      const reset = result.changes || 0;
      this.stats.exportsReset += reset;

      if (reset > 0) {
        logger.warn('STATE_RECOVERY', 'Reset stuck export requests', {
          reset,
          stuckAfterMinutes: EXPORT_STUCK_MINUTES
        });

        // Send alert if threshold exceeded
        if (reset >= STUCK_EXPORT_ALERT_THRESHOLD) {
          this.sendExportAlert(reset).catch((error) => {
            logger.error('STATE_RECOVERY', 'Failed to send export recovery alert', {
              error: error?.message
            });
          });
        }
      } else {
        logger.debug('STATE_RECOVERY', 'No stuck export requests to reset');
      }

      return { reset };
    } catch (error) {
      logger.error('STATE_RECOVERY', 'Failed to reset stuck export requests', {
        error: error?.message,
        stack: error?.stack
      });
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Send Slack alert for expired lease recovery
   */
  async sendLeaseAlert(count) {
    const severity = count >= EXPIRED_LEASE_ALERT_THRESHOLD * 2 ? 'critical' : 'warning';
    const text = `Auto-recovered ${count} expired linking leases`;
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🔄 Linking Lease Recovery',
          emoji: true
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${count} tracks* were stuck in 'processing' with expired leases and have been automatically moved back to 'pending'.`
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Recovered:*\n${count} tracks`
          },
          {
            type: 'mrkdwn',
            text: `*Lease Margin:*\n${LEASE_EXPIRE_MARGIN_MINUTES} minutes`
          }
        ]
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: '💡 This is automatic recovery. Consider investigating if this happens frequently.'
          }
        ]
      }
    ];

    await slackService.notifySystemAlert({ severity, text, blocks });
  }

  /**
   * Send Slack alert for stuck export recovery
   */
  async sendExportAlert(count) {
    const severity = count >= STUCK_EXPORT_ALERT_THRESHOLD * 2 ? 'critical' : 'warning';
    const text = `Reset ${count} stuck export requests`;
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🔄 Export Request Recovery',
          emoji: true
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${count} export requests* were stuck in 'in_progress' and have been automatically reset to 'pending'.`
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Reset:*\n${count} requests`
          },
          {
            type: 'mrkdwn',
            text: `*Stuck After:*\n${EXPORT_STUCK_MINUTES} minutes`
          }
        ]
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: '💡 This is automatic recovery. Consider investigating if this happens frequently.'
          }
        ]
      }
    ];

    await slackService.notifySystemAlert({ severity, text, blocks });
  }

  /**
   * Run all recovery tasks
   * Returns summary of recovery actions taken
   */
  async runRecovery() {
    if (this.isRunning) {
      logger.warn('STATE_RECOVERY', 'Recovery already in progress, skipping this cycle');
      return null;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      logger.info('STATE_RECOVERY', 'Starting recovery cycle');

      const results = {
        leasesRecovered: 0,
        heartbeatsCleaned: 0,
        exportsReset: 0,
        errors: []
      };

      // Task 1: Requeue expired leases
      try {
        const leaseResult = this.requeueExpiredLeases();
        results.leasesRecovered = leaseResult.recovered;
      } catch (error) {
        results.errors.push({ task: 'requeueExpiredLeases', error: error.message });
      }

      // Task 2: Cleanup stale heartbeats
      try {
        const heartbeatResult = this.cleanupStaleHeartbeats();
        results.heartbeatsCleaned = heartbeatResult.removed;
      } catch (error) {
        results.errors.push({ task: 'cleanupStaleHeartbeats', error: error.message });
      }

      // Task 3: Reset stuck export requests
      try {
        const exportResult = this.resetStuckExportRequests();
        results.exportsReset = exportResult.reset;
      } catch (error) {
        results.errors.push({ task: 'resetStuckExportRequests', error: error.message });
      }

      const duration = Date.now() - startTime;
      this.lastRun = new Date().toISOString();
      this.stats.totalRuns++;

      logger.info('STATE_RECOVERY', 'Recovery cycle completed', {
        duration: `${duration}ms`,
        ...results,
        totalRuns: this.stats.totalRuns
      });

      return results;
    } catch (error) {
      logger.error('STATE_RECOVERY', 'Recovery cycle failed', {
        error: error?.message,
        stack: error?.stack
      });
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Start the cron-based recovery service
   */
  start() {
    if (this.cronJob) {
      logger.warn('STATE_RECOVERY', 'Recovery service already started');
      return;
    }

    // Validate cron schedule
    if (!cron.validate(CRON_SCHEDULE)) {
      throw new Error(`Invalid cron schedule: ${CRON_SCHEDULE}`);
    }

    // Schedule the cron job
    this.cronJob = cron.schedule(CRON_SCHEDULE, async () => {
      try {
        await this.runRecovery();
      } catch (error) {
        logger.error('STATE_RECOVERY', 'Scheduled recovery failed', {
          error: error?.message
        });
      }
    });

    // Run immediately on startup
    this.runRecovery().catch((error) => {
      logger.error('STATE_RECOVERY', 'Initial recovery run failed', {
        error: error?.message
      });
    });

    logger.info('STATE_RECOVERY', 'State recovery service started', {
      schedule: CRON_SCHEDULE,
      leaseMargin: `${LEASE_EXPIRE_MARGIN_MINUTES} minutes`,
      heartbeatStale: `${HEARTBEAT_STALE_MINUTES} minutes`,
      exportStuck: `${EXPORT_STUCK_MINUTES} minutes`,
      leaseAlertThreshold: EXPIRED_LEASE_ALERT_THRESHOLD,
      exportAlertThreshold: STUCK_EXPORT_ALERT_THRESHOLD
    });
  }

  /**
   * Stop the cron-based recovery service
   */
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      logger.info('STATE_RECOVERY', 'State recovery service stopped');
    }
  }

  /**
   * Get service status and statistics
   */
  getStatus() {
    return {
      isRunning: !!this.cronJob,
      lastRun: this.lastRun,
      stats: { ...this.stats },
      config: {
        schedule: CRON_SCHEDULE,
        leaseExpireMarginMinutes: LEASE_EXPIRE_MARGIN_MINUTES,
        heartbeatStaleMinutes: HEARTBEAT_STALE_MINUTES,
        exportStuckMinutes: EXPORT_STUCK_MINUTES,
        expiredLeaseAlertThreshold: EXPIRED_LEASE_ALERT_THRESHOLD,
        stuckExportAlertThreshold: STUCK_EXPORT_ALERT_THRESHOLD
      }
    };
  }
}

// Export singleton instance
const stateRecoveryService = new StateRecoveryService();

export const startStateRecovery = () => stateRecoveryService.start();
export const stopStateRecovery = () => stateRecoveryService.stop();
export const runManualRecovery = () => stateRecoveryService.runRecovery();
export const getRecoveryStatus = () => stateRecoveryService.getStatus();

export default stateRecoveryService;
