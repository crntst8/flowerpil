import slackService from './SlackNotificationService.js';
import logger from '../utils/logger.js';

/**
 * Error Alert Service
 *
 * Sends error alerts to Slack using the ERROR_REPORTING bot.
 * Excludes deployment, Apple Export, and Spotify errors (those use their own bots).
 * Formats error messages according to ERROR_REPORTING bot specifications.
 */
class ErrorAlertService {
  constructor() {
    this.cooldowns = new Map();
    this.cooldownMs = 10 * 60 * 1000; // 10 minutes
  }

  /**
   * Determine error location from context
   * @param {Object} errorReport - Error report object
   * @returns {string}
   */
  getErrorLocation(errorReport) {
    const ctx = errorReport.context_data ? JSON.parse(errorReport.context_data) : {};

    // Try various context fields to determine location
    if (ctx.route || ctx.endpoint) {
      return ctx.route || ctx.endpoint;
    }

    if (ctx.url) {
      return ctx.url;
    }

    if (ctx.workerName) {
      return `Worker: ${ctx.workerName}`;
    }

    if (ctx.origin) {
      return ctx.origin;
    }

    // Fall back to error type
    return errorReport.error_type || 'Unknown';
  }

  /**
   * Extract curator information from context
   * @param {Object} errorReport - Error report object
   * @returns {Object} Curator information
   */
  getCuratorInfo(errorReport) {
    const ctx = errorReport.context_data ? JSON.parse(errorReport.context_data) : {};

    return {
      curatorName: ctx.curatorName || ctx.curator_name || null,
      curatorEmail: ctx.curatorEmail || ctx.curator_email || ctx.email || null,
      curatorId: ctx.curatorId || ctx.curator_id || ctx.userId || ctx.user_id || null
    };
  }

  /**
   * Interpret error cause from error classification and context
   * @param {Object} errorReport - Error report object
   * @returns {string}
   */
  interpretCause(errorReport) {
    const classification = errorReport.classification;
    const errorMsg = errorReport.error_message;
    const ctx = errorReport.context_data ? JSON.parse(errorReport.context_data) : {};

    // Provide human-readable interpretation based on error classification
    switch (classification) {
      case 'STALE_IMPORT_LOCK':
        return 'Import process acquired a lock but failed to complete within the timeout window. Stale locks have been automatically released.';

      case 'TOKEN_EXPIRED':
        return 'API authentication token has expired. User needs to re-authenticate or tokens need to be refreshed.';

      case 'STALLED_EXPORT':
        return 'Export request was stuck in processing state for over 30 minutes. May indicate worker crash or API timeout.';

      case 'WORKER_TIMEOUT':
        return `Background worker "${ctx.workerName || 'unknown'}" exceeded maximum execution time and was terminated.`;

      case 'DATABASE_ERROR':
        return 'SQLite database operation failed. May indicate database corruption, locked database, or query syntax error.';

      case 'UNCAUGHT_EXCEPTION':
        return `Unhandled exception in server process (PID: ${ctx.pid || 'unknown'}). Application may have crashed.`;

      case 'UNHANDLED_REJECTION':
        return 'Unhandled Promise rejection. Async operation failed without proper error handling.';

      case 'WORKER_FAILURE':
        return `Background worker "${ctx.workerName || 'unknown'}" encountered an error and failed to complete its task.`;

      default:
        // Try to interpret from error message
        if (errorMsg.includes('401') || errorMsg.includes('Unauthorized')) {
          return 'Authentication failed. Credentials may be invalid or expired.';
        }
        if (errorMsg.includes('403') || errorMsg.includes('Forbidden')) {
          return 'Access denied. User does not have permission for this resource.';
        }
        if (errorMsg.includes('404') || errorMsg.includes('Not Found')) {
          return 'Requested resource was not found. May have been deleted or URL is incorrect.';
        }
        if (errorMsg.includes('429') || errorMsg.includes('Rate limit')) {
          return 'API rate limit exceeded. Too many requests in a short time period.';
        }
        if (errorMsg.includes('500') || errorMsg.includes('Internal Server')) {
          return 'Internal server error. Backend service encountered an unexpected condition.';
        }
        if (errorMsg.includes('503') || errorMsg.includes('Service Unavailable')) {
          return 'Service temporarily unavailable. External API may be down for maintenance.';
        }
        if (errorMsg.includes('timeout') || errorMsg.includes('ETIMEDOUT')) {
          return 'Operation timed out. Network connection or external service too slow to respond.';
        }
        if (errorMsg.includes('ECONNREFUSED')) {
          return 'Connection refused. Target service is not running or firewall blocking connection.';
        }

        return 'See error message and server logs for details.';
    }
  }

  /**
   * Determine if this error should be excluded from ERROR_REPORTING bot
   * (e.g., deployment, Apple Export, Spotify errors use their own bots)
   * @param {Object} errorReport - Error report object
   * @returns {boolean}
   */
  shouldExcludeFromErrorReporting(errorReport) {
    const ctx = errorReport.context_data ? JSON.parse(errorReport.context_data) : {};
    const errorType = errorReport.error_type;
    const classification = errorReport.classification;

    // Exclude deployment-related errors (they have their own bot)
    if (errorType === 'DEPLOYMENT' || ctx.deployment || ctx.cicd) {
      return true;
    }

    // Exclude Apple Export errors (they use notifyAppleExportSuccess/notifyAppleResolutionFailed)
    if (classification === 'APPLE_EXPORT' || ctx.appleExport || ctx.apple_music_export) {
      return true;
    }

    // Exclude Spotify-specific errors (they use notifySpotifyAccessRequest)
    if (classification === 'SPOTIFY_AUTH' || ctx.spotifyAuth || ctx.spotify_onboarding) {
      return true;
    }

    return false;
  }

  /**
   * Send error alert to Slack
   * @param {Object} errorReport - Error report object
   * @returns {Promise<Object>}
   */
  async sendAlert(errorReport) {
    // Check if this error should be excluded from ERROR_REPORTING bot
    if (this.shouldExcludeFromErrorReporting(errorReport)) {
      logger.debug('ERROR_ALERT', 'Error excluded from ERROR_REPORTING bot, uses dedicated bot', {
        classification: errorReport.classification,
        errorType: errorReport.error_type
      });
      return { skipped: true, reason: 'uses_dedicated_bot' };
    }

    // Check cooldown to prevent spam
    const key = errorReport.classification;
    if (this.cooldowns.has(key)) {
      const lastAlert = this.cooldowns.get(key);
      if (Date.now() - lastAlert < this.cooldownMs) {
        return { skipped: true, reason: 'cooldown' };
      }
    }

    // Extract curator information
    const curatorInfo = this.getCuratorInfo(errorReport);

    // Get error location
    const errorLocation = this.getErrorLocation(errorReport);

    // Interpret the cause
    const cause = this.interpretCause(errorReport);

    // Prepare notification data for ERROR_REPORTING bot
    const notificationData = {
      curatorName: curatorInfo.curatorName,
      curatorEmail: curatorInfo.curatorEmail,
      curatorId: curatorInfo.curatorId,
      errorLocation,
      errorMessage: errorReport.error_message,
      cause,
      timestamp: errorReport.last_seen_at
    };

    try {
      // Send to ERROR_REPORTING bot
      const result = await slackService.notifyErrorReport(notificationData);

      if (result) {
        this.cooldowns.set(key, Date.now());
        return { sent: true };
      } else {
        // ERROR_REPORTING bot not configured, fall back to legacy system alert
        logger.debug('ERROR_ALERT', 'ERROR_REPORTING bot not configured, using legacy system alert');
        return await this.sendLegacyAlert(errorReport);
      }
    } catch (error) {
      logger.error('Failed to send error alert', { error });
      return { sent: false, error };
    }
  }

  /**
   * Send alert using legacy system alert method (fallback)
   * @param {Object} errorReport - Error report object
   * @returns {Promise<Object>}
   */
  async sendLegacyAlert(errorReport) {
    const severity = errorReport.severity.toLowerCase();
    const emoji = { critical: '🚨', high: '⚠️', medium: '⚡', low: 'ℹ️' }[severity] || '❗';

    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${emoji} *${errorReport.classification}*\n${errorReport.error_message}`
        }
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Severity:*\n${errorReport.severity}` },
          { type: 'mrkdwn', text: `*Occurrences:*\n${errorReport.occurrences || 1}` },
          { type: 'mrkdwn', text: `*Type:*\n${errorReport.error_type}` },
          { type: 'mrkdwn', text: `*Time:*\n${new Date(errorReport.last_seen_at).toLocaleString()}` }
        ]
      }
    ];

    if (errorReport.suggested_fix) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Suggested Fix:* \`${errorReport.suggested_fix}\`\nExecute in admin panel`
        }
      });
    }

    const baseUrl = process.env.PUBLIC_URL || process.env.BASE_URL || 'https://flowerpil.io';
    blocks.push({
      type: 'actions',
      elements: [{
        type: 'button',
        text: { type: 'plain_text', text: 'View in Admin' },
        url: `${baseUrl}/admin/errors`,
        style: severity === 'critical' ? 'danger' : 'primary'
      }]
    });

    try {
      await slackService.notifySystemAlert({
        severity,
        text: `${emoji} ${errorReport.classification}`,
        blocks
      });

      return { sent: true, legacy: true };
    } catch (error) {
      logger.error('Failed to send legacy Slack alert', { error });
      return { sent: false, error };
    }
  }
}

export const errorAlertService = new ErrorAlertService();
