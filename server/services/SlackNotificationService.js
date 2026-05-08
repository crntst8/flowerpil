import axios from 'axios';
import logger from '../utils/logger.js';
import { getBotConfig, getLegacyConfig, isBotConfigured } from '../utils/slackBotLoader.js';

/**
 * Slack Notification Service
 *
 * Handles Slack API integration with modular bot system.
 * Features:
 * - Modular bot configuration (.env.slack or environment variables)
 * - Automatic token refresh when access token expires
 * - Error handling and retries
 * - Message formatting for different notification types
 * - Backward compatibility with legacy configuration
 *
 * Bot types:
 * - ERROR_REPORTING: User errors, latency, server errors
 * - SPOTIFY: Spotify access requests during curator onboarding
 * - APPLE_EXPORT: Apple Music export notifications
 * - DEPLOYMENT: Deployment notifications
 * - SYSTEM_ALERTS: System health alerts, performance monitoring
 */
class SlackNotificationService {
  constructor() {
    // Load bot configurations
    this.errorReportingBot = getBotConfig('ERROR_REPORTING');
    this.spotifyBot = getBotConfig('SPOTIFY');
    this.appleExportBot = getBotConfig('APPLE_EXPORT');
    this.deploymentBot = getBotConfig('DEPLOYMENT');
    this.systemAlertsBot = getBotConfig('SYSTEM_ALERTS');

    // Load legacy configuration for backward compatibility
    const legacy = getLegacyConfig();
    if (legacy) {
      this.accessToken = legacy.accessToken;
      this.refreshToken = legacy.refreshToken;
      this.clientId = legacy.clientId;
      this.clientSecret = legacy.clientSecret;
      this.channelId = legacy.channelId;
      this.alertChannelId = legacy.alertChannelId || this.channelId;
      this.curatorActionsChannelId = legacy.curatorActionsChannelId || this.channelId;

      // Legacy Spotify bot
      if (!this.spotifyBot && legacy.spotifyBot.accessToken) {
        this.spotifyBotClientId = legacy.spotifyBot.clientId || this.clientId;
        this.spotifyBotClientSecret = legacy.spotifyBot.clientSecret || this.clientSecret;
        this.spotifyBotChannelId = legacy.spotifyBot.channelId || this.curatorActionsChannelId || this.channelId;
        this.spotifyBotAccessToken = legacy.spotifyBot.accessToken || this.accessToken;
        this.spotifyBotRefreshToken = legacy.spotifyBot.refreshToken || this.refreshToken;
      }
    }

    this.enabled = process.env.SLACK_NOTIFICATIONS_ENABLED !== 'false';

    // Slack API endpoints
    this.apiBaseUrl = 'https://slack.com/api';
    this.tokenUrl = 'https://slack.com/api/oauth.v2.access';

    // Log configured bots
    const configuredBots = [];
    if (this.errorReportingBot) configuredBots.push('ERROR_REPORTING');
    if (this.spotifyBot) configuredBots.push('SPOTIFY');
    if (this.appleExportBot) configuredBots.push('APPLE_EXPORT');
    if (this.deploymentBot) configuredBots.push('DEPLOYMENT');
    if (this.systemAlertsBot) configuredBots.push('SYSTEM_ALERTS');

    logger.info('SLACK_SERVICE', 'Initialized with bot configurations', {
      configuredBots,
      hasLegacyConfig: Boolean(legacy),
      enabled: this.enabled
    });
  }

  /**
   * Check if legacy Slack notifications are properly configured
   */
  isConfigured() {
    if (!this.enabled) {
      return false;
    }

    const required = [
      this.accessToken,
      this.refreshToken,
      this.clientId,
      this.clientSecret,
      this.channelId
    ];

    const configured = required.every(val => val && val.length > 0);

    if (!configured) {
      logger.warn('SLACK_SERVICE', 'Legacy Slack notifications not fully configured', {
        hasAccessToken: !!this.accessToken,
        hasRefreshToken: !!this.refreshToken,
        hasClientId: !!this.clientId,
        hasClientSecret: !!this.clientSecret,
        hasChannelId: !!this.channelId,
        hasAlertChannel: !!this.alertChannelId
      });
    }

    return configured;
  }

  /**
   * Refresh access token for a bot
   * @param {Object} bot - Bot configuration
   * @param {string} botName - Bot name for logging
   * @returns {Promise<string>} New access token
   */
  async refreshBotAccessToken(bot, botName = 'bot') {
    if (!bot || !bot.refreshToken || !bot.clientId || !bot.clientSecret) {
      throw new Error(`Missing ${botName} credentials for token refresh`);
    }

    try {
      logger.info('SLACK_SERVICE', `Refreshing ${botName} access token`);

      const response = await axios.post(this.tokenUrl, null, {
        params: {
          client_id: bot.clientId,
          client_secret: bot.clientSecret,
          grant_type: 'refresh_token',
          refresh_token: bot.refreshToken
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      if (!response.data.ok) {
        throw new Error(`Slack token refresh failed: ${response.data.error}`);
      }

      const newAccessToken = response.data.access_token;
      const newRefreshToken = response.data.refresh_token || bot.refreshToken;

      // Update in-memory token
      bot.accessToken = newAccessToken;
      bot.refreshToken = newRefreshToken;

      // Log for admin to update environment variables
      logger.warn('SLACK_SERVICE', `${botName} access token refreshed - UPDATE ENVIRONMENT VARIABLES`, {
        botName,
        newAccessToken: `${newAccessToken.substring(0, 20)}...`,
        newRefreshToken: newRefreshToken === bot.refreshToken ? 'unchanged' : `${newRefreshToken.substring(0, 20)}...`,
        instructions: 'Update in .env.slack (local) or /etc/environment (production)',
        expiresInSeconds: response.data.expires_in || 'unknown'
      });

      return newAccessToken;
    } catch (error) {
      logger.error('SLACK_SERVICE', `Failed to refresh ${botName} access token`, {
        error: error.message,
        hasRefreshToken: !!bot.refreshToken
      });
      throw error;
    }
  }

  /**
   * Refresh the Slack access token using refresh token (legacy)
   */
  async refreshAccessToken() {
    if (!this.refreshToken || !this.clientId || !this.clientSecret) {
      throw new Error('Missing Slack credentials for token refresh');
    }

    try {
      logger.info('SLACK_SERVICE', 'Refreshing Slack access token (legacy)');

      const response = await axios.post(this.tokenUrl, null, {
        params: {
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'refresh_token',
          refresh_token: this.refreshToken
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      if (!response.data.ok) {
        throw new Error(`Slack token refresh failed: ${response.data.error}`);
      }

      const newAccessToken = response.data.access_token;
      const newRefreshToken = response.data.refresh_token || this.refreshToken;

      // Update in-memory token
      this.accessToken = newAccessToken;
      this.refreshToken = newRefreshToken;

      logger.warn('SLACK_SERVICE', 'Slack access token refreshed - UPDATE ENVIRONMENT VARIABLES', {
        newAccessToken: `${newAccessToken.substring(0, 20)}...`,
        newRefreshToken: newRefreshToken === this.refreshToken ? 'unchanged' : `${newRefreshToken.substring(0, 20)}...`,
        instructions: 'Update SLACK_ACCESS_TOKEN in /etc/environment (production) or .env (development)',
        expiresInSeconds: response.data.expires_in || 'unknown'
      });

      return newAccessToken;
    } catch (error) {
      logger.error('SLACK_SERVICE', 'Failed to refresh Slack access token', {
        error: error.message,
        hasRefreshToken: !!this.refreshToken
      });
      throw error;
    }
  }

  /**
   * Send a message to Slack using a specific bot
   * @param {Object} bot - Bot configuration
   * @param {string} botName - Bot name for logging
   * @param {string} text - Message text
   * @param {Array} blocks - Slack blocks
   * @param {Object} options - Additional options
   * @returns {Promise<Object>}
   */
  async sendBotMessage(bot, botName, text, blocks = null, options = {}) {
    if (!bot || !bot.isConfigured) {
      logger.warn('SLACK_SERVICE', `${botName} bot not configured`);
      return null;
    }

    const channel = options.channelId || bot.channelId;
    if (!channel) {
      logger.warn('SLACK_SERVICE', `${botName} bot channel not configured`);
      return null;
    }

    try {
      return await this._sendMessageWithToken(bot.accessToken, text, blocks, channel);
    } catch (error) {
      // If token expired or invalid, try refreshing
      if (this._isTokenError(error)) {
        logger.info('SLACK_SERVICE', `${botName} access token invalid, attempting refresh`);

        try {
          const newToken = await this.refreshBotAccessToken(bot, botName);
          return await this._sendMessageWithToken(newToken, text, blocks, channel);
        } catch (refreshError) {
          logger.error('SLACK_SERVICE', `Failed to send ${botName} message after token refresh`, {
            error: refreshError.message
          });
          throw refreshError;
        }
      }

      throw error;
    }
  }

  /**
   * Send a message to the configured Slack channel (legacy)
   * Automatically retries with token refresh if token is expired
   */
  async sendMessage(text, blocks = null, options = {}) {
    if (!this.enabled) {
      logger.debug('SLACK_SERVICE', 'Notifications disabled, skipping message');
      return null;
    }

    if (!this.isConfigured()) {
      logger.warn('SLACK_SERVICE', 'Cannot send message, Slack not configured');
      return null;
    }

    const channel = options.channelId || this.channelId;
    if (!channel) {
      logger.warn('SLACK_SERVICE', 'Slack channel not configured for message dispatch');
      return null;
    }

    try {
      return await this._sendMessageWithToken(this.accessToken, text, blocks, channel);
    } catch (error) {
      // If token expired or invalid, try refreshing
      if (this._isTokenError(error)) {
        logger.info('SLACK_SERVICE', 'Access token invalid, attempting refresh');

        try {
          const newToken = await this.refreshAccessToken();
          return await this._sendMessageWithToken(newToken, text, blocks, channel);
        } catch (refreshError) {
          logger.error('SLACK_SERVICE', 'Failed to send message after token refresh', {
            error: refreshError.message
          });
          throw refreshError;
        }
      }

      throw error;
    }
  }

  /**
   * Internal method to send message with specific token
   */
  async _sendMessageWithToken(token, text, blocks, channel) {
    const payload = {
      channel,
      text: text
    };

    if (blocks) {
      payload.blocks = blocks;
    }

    try {
      const response = await axios.post(
        `${this.apiBaseUrl}/chat.postMessage`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.data.ok) {
        throw new Error(`Slack API error: ${response.data.error}`);
      }

      logger.debug('SLACK_SERVICE', 'Message sent successfully', {
        channel,
        timestamp: response.data.ts
      });

      return response.data;
    } catch (error) {
      if (error.response) {
        const slackError = error.response.data?.error || 'unknown_error';
        const errorMessage = `Slack API error: ${slackError}`;

        logger.error('SLACK_SERVICE', errorMessage, {
          status: error.response.status,
          slackError,
          channel
        });

        const apiError = new Error(errorMessage);
        apiError.slackError = slackError;
        apiError.status = error.response.status;
        throw apiError;
      }
      throw error;
    }
  }

  /**
   * Check if error indicates token issues
   */
  _isTokenError(error) {
    if (!error.slackError) {
      return false;
    }

    const tokenErrors = [
      'invalid_auth',
      'token_expired',
      'token_revoked',
      'account_inactive',
      'not_authed'
    ];

    return tokenErrors.includes(error.slackError);
  }

  /**
   * Send error report notification using ERROR_REPORTING bot
   */
  async notifyErrorReport({ curatorName, curatorEmail, curatorId, errorLocation, errorMessage, cause, timestamp }) {
    if (!this.errorReportingBot) {
      logger.debug('SLACK_SERVICE', 'ERROR_REPORTING bot not configured');
      return null;
    }

    // Format timestamp as [xx:xxAM/PM - DD/MM]
    const date = timestamp ? new Date(timestamp) : new Date();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const formattedTime = `${displayHours}:${displayMinutes}${ampm} - ${day}/${month}`;

    const text = `Error Report\n\n` +
      `Curator Name: ${curatorName || 'N/A'}\n` +
      `Curator Email: ${curatorEmail || 'N/A'}\n` +
      `Curator ID: ${curatorId || 'N/A'}\n` +
      `Date/Time: ${formattedTime}\n` +
      `Error Location: ${errorLocation || 'N/A'}\n` +
      `Error Message: ${errorMessage || 'N/A'}\n` +
      `Cause: ${cause || 'Unknown'}`;

    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: 'Error Report',
          emoji: true
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Curator Name:*\n${curatorName || 'N/A'}`
          },
          {
            type: 'mrkdwn',
            text: `*Curator Email:*\n${curatorEmail || 'N/A'}`
          },
          {
            type: 'mrkdwn',
            text: `*Curator ID:*\n${curatorId || 'N/A'}`
          },
          {
            type: 'mrkdwn',
            text: `*Date/Time:*\n${formattedTime}`
          },
          {
            type: 'mrkdwn',
            text: `*Error Location:*\n${errorLocation || 'N/A'}`
          }
        ]
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Error Message:*\n\`\`\`${errorMessage || 'N/A'}\`\`\``
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Cause:*\n${cause || 'Unknown'}`
        }
      }
    ];

    try {
      logger.info('SLACK_SERVICE', 'Sending error report notification', {
        curatorId,
        errorLocation
      });

      const result = await this.sendBotMessage(this.errorReportingBot, 'ERROR_REPORTING', text, blocks);

      logger.info('SLACK_SERVICE', 'Error report notification sent successfully', {
        curatorId,
        errorLocation,
        messageTimestamp: result?.ts
      });

      return result;
    } catch (error) {
      logger.error('SLACK_SERVICE', 'Failed to send error report notification', {
        curatorId,
        errorLocation,
        error: error.message
      });
      // Don't throw - notification failure should not break error reporting workflow
      return null;
    }
  }

  /**
   * Format and send Apple Music export success notification
   */
  async notifyAppleExportSuccess({ playlistId, playlistTitle, curatorName, appleLibraryId, storefront = 'us' }) {
    // Use APPLE_EXPORT bot if configured, otherwise fall back to legacy
    const bot = this.appleExportBot || (this.isConfigured() ? 'legacy' : null);

    if (!bot) {
      logger.debug('SLACK_SERVICE', 'Skipping Apple export notification, no bot configured');
      return null;
    }

    // Construct admin dashboard URL
    const dashboardUrl = `${process.env.PUBLIC_URL || 'https://api.flowerpil.io'}/admin?playlist=${playlistId}`;

    // Apple Music library URL for reference
    const libraryUrl = `https://music.apple.com/${storefront}/library/playlist/${appleLibraryId}`;

    const text = `🎵 Apple Music Export Ready for Sharing\n\n` +
      `Playlist: "${playlistTitle}" (ID: ${playlistId})\n` +
      `Curator: ${curatorName}\n` +
      `Needs URL\n\n` +
      `🔗 View in Admin Dashboard: ${dashboardUrl}`;

    // Rich formatting with Slack blocks
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🎵 Apple Music Export Ready',
          emoji: true
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Playlist:*\n${playlistTitle}`
          },
          {
            type: 'mrkdwn',
            text: `*Playlist ID:*\n${playlistId}`
          },
          {
            type: 'mrkdwn',
            text: `*Curator:*\n${curatorName}`
          },
          {
            type: 'mrkdwn',
            text: `*Library ID:*\n\`${appleLibraryId}\``
          }
        ]
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '⚠️ *Action Required:* Sign into Apple Music as `@flowerpil` and manually share this playlist to generate a public share URL.'
        }
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'View in Admin Dashboard',
              emoji: true
            },
            url: dashboardUrl,
            style: 'primary'
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Open in Apple Music',
              emoji: true
            },
            url: libraryUrl
          }
        ]
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `💡 After sharing, the system will automatically detect the public URL within a few minutes.`
          }
        ]
      }
    ];

    try {
      logger.info('SLACK_SERVICE', 'Sending Apple export notification', {
        playlistId,
        playlistTitle,
        curatorName
      });

      let result;
      if (bot === 'legacy') {
        result = await this.sendMessage(text, blocks);
      } else {
        result = await this.sendBotMessage(this.appleExportBot, 'APPLE_EXPORT', text, blocks);
      }

      logger.info('SLACK_SERVICE', 'Apple export notification sent successfully', {
        playlistId,
        messageTimestamp: result?.ts
      });

      return result;
    } catch (error) {
      logger.error('SLACK_SERVICE', 'Failed to send Apple export notification', {
        playlistId,
        playlistTitle,
        error: error.message
      });
      // Don't throw - notification failure should not break export workflow
      return null;
    }
  }

  /**
   * Send notification for failed Apple share URL resolution
   */
  async notifyAppleResolutionFailed({ playlistId, playlistTitle, attempts, error }) {
    // Use APPLE_EXPORT bot if configured, otherwise fall back to legacy
    const bot = this.appleExportBot || (this.isConfigured() ? 'legacy' : null);

    if (!bot) {
      return null;
    }

    const dashboardUrl = `${process.env.PUBLIC_URL || 'https://api.flowerpil.io'}/admin?playlist=${playlistId}`;

    const text = `❌ Apple Share URL Resolution Failed\n\n` +
      `Playlist: "${playlistTitle}" (ID: ${playlistId})\n` +
      `Attempts: ${attempts}\n` +
      `Error: ${error}\n\n` +
      `Manual intervention required.\n\n` +
      `🔗 View in Admin Dashboard: ${dashboardUrl}`;

    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '❌ Apple Share URL Resolution Failed',
          emoji: true
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Playlist:*\n${playlistTitle}`
          },
          {
            type: 'mrkdwn',
            text: `*Playlist ID:*\n${playlistId}`
          },
          {
            type: 'mrkdwn',
            text: `*Attempts:*\n${attempts}`
          },
          {
            type: 'mrkdwn',
            text: `*Error:*\n${error}`
          }
        ]
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '⚠️ *Manual intervention required.* Check if the playlist was shared correctly in Apple Music.'
        }
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'View in Admin Dashboard',
              emoji: true
            },
            url: dashboardUrl,
            style: 'danger'
          }
        ]
      }
    ];

    try {
      logger.info('SLACK_SERVICE', 'Sending Apple resolution failure notification', {
        playlistId,
        playlistTitle,
        attempts
      });

      let result;
      if (bot === 'legacy') {
        result = await this.sendMessage(text, blocks);
      } else {
        result = await this.sendBotMessage(this.appleExportBot, 'APPLE_EXPORT', text, blocks);
      }

      return result;
    } catch (notifyError) {
      logger.error('SLACK_SERVICE', 'Failed to send resolution failure notification', {
        playlistId,
        error: notifyError.message
      });
      return null;
    }
  }

  /**
   * Notify system health alerts
   */
  async notifySystemAlert({ severity = 'warning', text, blocks }) {
    // Use SYSTEM_ALERTS bot if configured, otherwise fall back to legacy alert channel
    const bot = this.systemAlertsBot || (this.isConfigured() ? 'legacy' : null);

    if (!bot) {
      logger.debug('SLACK_SERVICE', 'Skipping system alert, no bot configured');
      return null;
    }

    const prefix = severity === 'critical' ? '🚨' : '⚠️';
    const summary = text || 'System alert';

    if (bot === 'legacy') {
      const targetChannel = this.alertChannelId || this.channelId;
      return this.sendMessage(`${prefix} ${summary}`, blocks, { channelId: targetChannel });
    } else {
      return this.sendBotMessage(this.systemAlertsBot, 'SYSTEM_ALERTS', `${prefix} ${summary}`, blocks);
    }
  }

  /**
   * Notify completion of a playlist transfer job
   */
  async sendTransferCompleteNotification(job, summary = {}) {
    const bot = this.systemAlertsBot || (this.isConfigured() ? 'legacy' : null);
    if (!bot) {
      logger.debug('SLACK_SERVICE', 'Skipping transfer notification, no bot configured');
      return null;
    }

    const destinations = Array.isArray(job.destinations) ? job.destinations : [];
    const results = summary.results || {};
    const stats = summary.stats || {};
    const durationMs = summary.durationMs || 0;
    const durationSec = Math.max(1, Math.round(durationMs / 1000));

    const successDestinations = Object.entries(results)
      .filter(([, val]) => val?.status !== 'error' && val?.status !== 'auth_required')
      .map(([key]) => key);

    const failedDestinations = Object.entries(results)
      .filter(([, val]) => val?.status === 'error')
      .map(([key]) => key);

    const header = `✅ Playlist transfer completed: ${job.source_playlist_name || job.source_playlist_id || 'Spotify playlist'}`;
    const summaryText = [
      `• Destinations: ${destinations.join(', ') || 'none'}`,
      `• Matched: ${stats.matched ?? 0}/${stats.total ?? job.total_tracks ?? 0}`,
      `• Duration: ${durationSec}s`
    ];

    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: 'Playlist Transfer Complete',
          emoji: true
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${job.source_playlist_name || 'Spotify playlist'}*\nDestinations: ${destinations.join(', ') || 'none'}`
        }
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Matched*\n${stats.matched ?? 0}/${stats.total ?? job.total_tracks ?? 0}` },
          { type: 'mrkdwn', text: `*Failed*\n${stats.failed ?? 0}` },
          { type: 'mrkdwn', text: `*Duration*\n${durationSec}s` }
        ]
      }
    ];

    if (successDestinations.length || failedDestinations.length) {
      blocks.push({
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: successDestinations.length ? `✅ ${successDestinations.join(', ')}` : 'No successful destinations' },
          { type: 'mrkdwn', text: failedDestinations.length ? `⚠️ ${failedDestinations.join(', ')}` : 'No failures' }
        ]
      });
    }

    if (results) {
      Object.entries(results).forEach(([platform, result]) => {
        const link = result?.playlistUrl ? `<${result.playlistUrl}|Open>` : 'N/A';
        blocks.push({
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*${platform.toUpperCase()}*\n${result?.status || 'unknown'}` },
            { type: 'mrkdwn', text: `*Tracks Added*\n${result?.tracksAdded ?? 0}` },
            { type: 'mrkdwn', text: `*Link*\n${link}` }
          ]
        });
      });
    }

    const text = `${header}\n${summaryText.join('\n')}`;

    if (bot === 'legacy') {
      const targetChannel = this.alertChannelId || this.channelId;
      return this.sendMessage(text, blocks, { channelId: targetChannel });
    }

    return this.sendBotMessage(this.systemAlertsBot, 'SYSTEM_ALERTS', text, blocks);
  }

  /**
   * Check if Spotify bot is configured
   */
  isSpotifyBotConfigured() {
    // Check new bot configuration first
    if (this.spotifyBot) {
      return true;
    }

    // Fall back to legacy configuration
    const hasBotCredentials =
      this.spotifyBotClientId &&
      this.spotifyBotClientSecret &&
      this.spotifyBotChannelId &&
      this.spotifyBotAccessToken;

    return hasBotCredentials &&
           this.spotifyBotClientId.length > 0 &&
           this.spotifyBotClientSecret.length > 0 &&
           this.spotifyBotChannelId.length > 0 &&
           this.spotifyBotAccessToken.length > 0;
  }

  /**
   * Refresh Spotify bot access token (legacy)
   */
  async refreshSpotifyBotToken() {
    if (!this.spotifyBotRefreshToken || !this.spotifyBotClientId || !this.spotifyBotClientSecret) {
      throw new Error('Missing Spotify bot Slack credentials for token refresh');
    }

    try {
      logger.info('SLACK_SERVICE', 'Refreshing Spotify bot Slack access token');

      const response = await axios.post(this.tokenUrl, null, {
        params: {
          client_id: this.spotifyBotClientId,
          client_secret: this.spotifyBotClientSecret,
          grant_type: 'refresh_token',
          refresh_token: this.spotifyBotRefreshToken
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      if (!response.data.ok) {
        throw new Error(`Slack token refresh failed: ${response.data.error}`);
      }

      const newAccessToken = response.data.access_token;
      const newRefreshToken = response.data.refresh_token || this.spotifyBotRefreshToken;

      // Update in-memory token
      this.spotifyBotAccessToken = newAccessToken;
      this.spotifyBotRefreshToken = newRefreshToken;

      logger.warn('SLACK_SERVICE', 'Spotify bot Slack access token refreshed - UPDATE ENVIRONMENT VARIABLES', {
        newAccessToken: `${newAccessToken.substring(0, 20)}...`,
        newRefreshToken: newRefreshToken === this.spotifyBotRefreshToken ? 'unchanged' : `${newRefreshToken.substring(0, 20)}...`,
        instructions: 'Update SPOTIFY_BOT_SLACK_ACCESS_TOKEN in /etc/environment (production) or .env (development)',
        expiresInSeconds: response.data.expires_in || 'unknown'
      });

      return newAccessToken;
    } catch (error) {
      logger.error('SLACK_SERVICE', 'Failed to refresh Spotify bot Slack access token', {
        error: error.message,
        hasRefreshToken: !!this.spotifyBotRefreshToken
      });
      throw error;
    }
  }

  /**
   * Send message using Spotify bot credentials (legacy or new)
   */
  async sendSpotifyBotMessage(text, blocks = null, options = {}) {
    // Try new bot configuration first
    if (this.spotifyBot) {
      return this.sendBotMessage(this.spotifyBot, 'SPOTIFY', text, blocks, options);
    }

    // Fall back to legacy Spotify bot
    if (!this.isSpotifyBotConfigured()) {
      const missing = [];
      if (!this.spotifyBotClientId) missing.push('SPOTIFY_BOT_SLACK_CLIENT_ID');
      if (!this.spotifyBotClientSecret) missing.push('SPOTIFY_BOT_SLACK_CLIENT_SECRET');
      if (!this.spotifyBotChannelId) missing.push('SPOTIFY_BOT_SLACK_CHANNEL_ID');
      if (!this.spotifyBotAccessToken) missing.push('SPOTIFY_BOT_SLACK_ACCESS_TOKEN');

      logger.warn('SLACK_SERVICE', 'Cannot send Spotify bot message, bot not configured', {
        missing: missing.join(', ')
      });
      throw new Error(`Spotify bot not configured. Missing: ${missing.join(', ')}`);
    }

    const channel = options.channelId || this.spotifyBotChannelId;
    if (!channel) {
      logger.warn('SLACK_SERVICE', 'Spotify bot Slack channel not configured');
      return null;
    }

    try {
      return await this._sendMessageWithToken(this.spotifyBotAccessToken, text, blocks, channel);
    } catch (error) {
      // If token expired or invalid, try refreshing
      if (this._isTokenError(error)) {
        logger.info('SLACK_SERVICE', 'Spotify bot access token invalid, attempting refresh');

        try {
          const newToken = await this.refreshSpotifyBotToken();
          return await this._sendMessageWithToken(newToken, text, blocks, channel);
        } catch (refreshError) {
          logger.error('SLACK_SERVICE', 'Failed to send Spotify bot message after token refresh', {
            error: refreshError.message
          });
          throw refreshError;
        }
      }

      throw error;
    }
  }

  /**
   * Send notification for Spotify access request during onboarding
   */
  async notifySpotifyAccessRequest({ curatorName, curatorEmail, spotifyEmail, curatorId }) {
    if (!this.isSpotifyBotConfigured()) {
      const missing = [];
      if (!this.spotifyBot && !this.spotifyBotClientId) missing.push('SPOTIFY_BOT_SLACK_CLIENT_ID or SPOTIFY_CLIENT_ID');
      if (!this.spotifyBot && !this.spotifyBotClientSecret) missing.push('SPOTIFY_BOT_SLACK_CLIENT_SECRET or SPOTIFY_CLIENT_SECRET');
      if (!this.spotifyBot && !this.spotifyBotChannelId) missing.push('SPOTIFY_BOT_SLACK_CHANNEL_ID or SPOTIFY_CHANNEL_ID');
      if (!this.spotifyBot && !this.spotifyBotAccessToken) missing.push('SPOTIFY_BOT_SLACK_ACCESS_TOKEN or SPOTIFY_ACCESS_TOKEN');

      const errorMsg = `Spotify bot Slack credentials not configured. Missing: ${missing.join(', ')}. To get an access token, install the Slack app to your workspace and copy the Bot User OAuth Token (starts with xoxb-).`;
      logger.warn('SLACK_SERVICE', 'Cannot send Spotify access request notification', { missing });
      throw new Error(errorMsg);
    }

    const dashboardUrl = `${process.env.PUBLIC_URL || 'https://flowerpil.io'}/admin/curators/${curatorId}`;

    const text = `🎵 New Spotify Access Request\n\n` +
      `Curator: ${curatorName}\n` +
      `Email: ${curatorEmail}\n` +
      `Spotify Email: ${spotifyEmail}\n\n` +
      `Action Required: Add ${spotifyEmail} to Spotify Developer Dashboard.\n\n` +
      `🔗 Admin Panel: ${dashboardUrl}`;

    // Rich formatting with Slack blocks
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🎵 New Spotify Access Request',
          emoji: true
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Curator:*\n${curatorName}`
          },
          {
            type: 'mrkdwn',
            text: `*Curator Email:*\n${curatorEmail}`
          },
          {
            type: 'mrkdwn',
            text: `*Spotify Email:*\n${spotifyEmail}`
          },
          {
            type: 'mrkdwn',
            text: `*Curator ID:*\n${curatorId}`
          }
        ]
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `⚠️ *Action Required:* Add \`${spotifyEmail}\` to the Spotify Developer Dashboard to enable Spotify integration for this curator.`
        }
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'View in Admin Panel',
              emoji: true
            },
            url: dashboardUrl,
            style: 'primary'
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Spotify Developer Dashboard',
              emoji: true
            },
            url: 'https://developer.spotify.com/dashboard'
          }
        ]
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `💡 After adding the email to Spotify Developer Dashboard, update the curator's Spotify status in the admin panel.`
          }
        ]
      }
    ];

    try {
      logger.info('SLACK_SERVICE', 'Sending Spotify access request notification', {
        curatorName,
        curatorEmail,
        spotifyEmail
      });

      // Use appropriate bot method
      const result = await this.sendSpotifyBotMessage(text, blocks, {
        channelId: this.spotifyBot?.channelId || this.spotifyBotChannelId
      });

      logger.info('SLACK_SERVICE', 'Spotify access request notification sent successfully', {
        curatorId,
        channel: this.spotifyBot?.channelId || this.spotifyBotChannelId,
        messageTimestamp: result?.ts
      });

      return result;
    } catch (error) {
      logger.error('SLACK_SERVICE', 'Failed to send Spotify access request notification', {
        curatorId,
        curatorName,
        error: error.message
      });
      // Don't throw - notification failure should not break onboarding workflow
      return null;
    }
  }

  /**
   * Get bot configuration status for admin testing
   */
  getBotStatus() {
    return {
      errorReporting: {
        configured: Boolean(this.errorReportingBot),
        channelId: this.errorReportingBot?.channelId
      },
      spotify: {
        configured: Boolean(this.spotifyBot || this.isSpotifyBotConfigured()),
        channelId: this.spotifyBot?.channelId || this.spotifyBotChannelId
      },
      appleExport: {
        configured: Boolean(this.appleExportBot),
        channelId: this.appleExportBot?.channelId
      },
      deployment: {
        configured: Boolean(this.deploymentBot),
        channelId: this.deploymentBot?.channelId
      },
      systemAlerts: {
        configured: Boolean(this.systemAlertsBot),
        channelId: this.systemAlertsBot?.channelId
      },
      legacy: {
        configured: this.isConfigured(),
        channelId: this.channelId
      }
    };
  }
}

// Export singleton instance
const slackService = new SlackNotificationService();
export default slackService;
