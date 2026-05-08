import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Slack Bot Configuration Loader
 *
 * Loads bot configurations from .env.slack (local dev) or process.env (production)
 * Supports multiple bots with standardized naming convention:
 * - {BOT_NAME}_APP_ID
 * - {BOT_NAME}_CLIENT_ID
 * - {BOT_NAME}_CLIENT_SECRET
 * - {BOT_NAME}_ACCESS_TOKEN
 * - {BOT_NAME}_REFRESH_TOKEN (optional)
 * - {BOT_NAME}_CHANNEL_ID
 */

const BOT_NAMES = [
  'ERROR_REPORTING',
  'SPOTIFY',
  'APPLE_EXPORT',
  'DEPLOYMENT',
  'SYSTEM_ALERTS'
];

/**
 * Parse .env.slack file if it exists
 * @returns {Object} Parsed environment variables
 */
function loadEnvSlackFile() {
  const envSlackPath = path.join(__dirname, '../../.env.slack');

  if (!fs.existsSync(envSlackPath)) {
    logger.debug('SLACK_BOT_LOADER', '.env.slack file not found, using process.env only');
    return {};
  }

  try {
    const content = fs.readFileSync(envSlackPath, 'utf8');
    const lines = content.split('\n');
    const env = {};

    for (const line of lines) {
      // Skip comments and empty lines
      if (line.trim().startsWith('#') || !line.trim()) {
        continue;
      }

      // Parse KEY=VALUE
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim();
        // Only set if value is not empty
        if (value) {
          env[key] = value;
        }
      }
    }

    logger.info('SLACK_BOT_LOADER', 'Loaded Slack bot configuration from .env.slack', {
      keysLoaded: Object.keys(env).length
    });

    return env;
  } catch (error) {
    logger.error('SLACK_BOT_LOADER', 'Failed to parse .env.slack file', {
      error: error.message
    });
    return {};
  }
}

/**
 * Get environment variable, preferring .env.slack over process.env
 * @param {string} key - Environment variable name
 * @param {Object} envSlack - Parsed .env.slack variables
 * @returns {string|undefined}
 */
function getEnvVar(key, envSlack) {
  // Prefer .env.slack for local dev, fallback to process.env for production
  return envSlack[key] || process.env[key];
}

/**
 * Load a single bot configuration
 * @param {string} botName - Bot name (e.g., 'ERROR_REPORTING')
 * @param {Object} envSlack - Parsed .env.slack variables
 * @returns {Object|null} Bot configuration or null if not configured
 */
function loadBotConfig(botName, envSlack) {
  const appId = getEnvVar(`${botName}_APP_ID`, envSlack);
  const clientId = getEnvVar(`${botName}_CLIENT_ID`, envSlack);
  const clientSecret = getEnvVar(`${botName}_CLIENT_SECRET`, envSlack);
  const accessToken = getEnvVar(`${botName}_ACCESS_TOKEN`, envSlack);
  const refreshToken = getEnvVar(`${botName}_REFRESH_TOKEN`, envSlack);
  const channelId = getEnvVar(`${botName}_CHANNEL_ID`, envSlack);

  // Check if bot is configured (require minimum credentials)
  const isConfigured = Boolean(
    clientId &&
    clientSecret &&
    accessToken &&
    channelId
  );

  if (!isConfigured) {
    return null;
  }

  return {
    name: botName,
    appId: appId || null,
    clientId,
    clientSecret,
    accessToken,
    refreshToken: refreshToken || null,
    channelId,
    isConfigured: true
  };
}

/**
 * Load all Slack bot configurations
 * @returns {Object} Map of bot name to configuration
 */
function loadAllBots() {
  const envSlack = loadEnvSlackFile();
  const bots = {};

  for (const botName of BOT_NAMES) {
    const config = loadBotConfig(botName, envSlack);
    if (config) {
      bots[botName] = config;
      logger.info('SLACK_BOT_LOADER', `Loaded ${botName} bot configuration`, {
        hasRefreshToken: Boolean(config.refreshToken),
        channelId: config.channelId.substring(0, 8) + '...'
      });
    } else {
      logger.debug('SLACK_BOT_LOADER', `${botName} bot not configured`);
      bots[botName] = null;
    }
  }

  // Support legacy environment variables for backward compatibility
  const legacyConfig = loadLegacyConfig(envSlack);
  if (legacyConfig) {
    logger.info('SLACK_BOT_LOADER', 'Loaded legacy Slack configuration for backward compatibility');
  }

  return {
    bots,
    legacy: legacyConfig
  };
}

/**
 * Load legacy Slack configuration for backward compatibility
 * @param {Object} envSlack - Parsed .env.slack variables
 * @returns {Object|null}
 */
function loadLegacyConfig(envSlack) {
  const accessToken = getEnvVar('SLACK_ACCESS_TOKEN', envSlack);
  const refreshToken = getEnvVar('SLACK_REFRESH_TOKEN', envSlack);
  const clientId = getEnvVar('SLACK_CLIENT_ID', envSlack);
  const clientSecret = getEnvVar('SLACK_CLIENT_SECRET', envSlack);
  const channelId = getEnvVar('SLACK_CHANNEL_ID', envSlack);
  const alertChannelId = getEnvVar('SLACK_ALERT_CHANNEL_ID', envSlack);
  const curatorActionsChannelId = getEnvVar('SLACK_CURATOR_ACTIONS_CHANNEL_ID', envSlack);

  // Spotify bot legacy config
  const spotifyBotClientId = getEnvVar('SPOTIFY_BOT_SLACK_CLIENT_ID', envSlack);
  const spotifyBotClientSecret = getEnvVar('SPOTIFY_BOT_SLACK_CLIENT_SECRET', envSlack);
  const spotifyBotChannelId = getEnvVar('SPOTIFY_BOT_SLACK_CHANNEL_ID', envSlack);
  const spotifyBotAccessToken = getEnvVar('SPOTIFY_BOT_SLACK_ACCESS_TOKEN', envSlack);
  const spotifyBotRefreshToken = getEnvVar('SPOTIFY_BOT_SLACK_REFRESH_TOKEN', envSlack);

  const isConfigured = Boolean(accessToken && clientId && clientSecret);

  if (!isConfigured) {
    return null;
  }

  return {
    accessToken,
    refreshToken,
    clientId,
    clientSecret,
    channelId,
    alertChannelId,
    curatorActionsChannelId,
    spotifyBot: {
      clientId: spotifyBotClientId,
      clientSecret: spotifyBotClientSecret,
      channelId: spotifyBotChannelId,
      accessToken: spotifyBotAccessToken,
      refreshToken: spotifyBotRefreshToken
    }
  };
}

// Load configurations on module initialization
const slackBotConfig = loadAllBots();

/**
 * Get a specific bot configuration
 * @param {string} botName - Bot name (e.g., 'ERROR_REPORTING')
 * @returns {Object|null}
 */
export function getBotConfig(botName) {
  return slackBotConfig.bots[botName] || null;
}

/**
 * Get legacy configuration
 * @returns {Object|null}
 */
export function getLegacyConfig() {
  return slackBotConfig.legacy;
}

/**
 * Get all configured bots
 * @returns {Object}
 */
export function getAllBots() {
  return slackBotConfig.bots;
}

/**
 * Check if a specific bot is configured
 * @param {string} botName - Bot name
 * @returns {boolean}
 */
export function isBotConfigured(botName) {
  return slackBotConfig.bots[botName] !== null;
}

export default {
  getBotConfig,
  getLegacyConfig,
  getAllBots,
  isBotConfigured,
  BOT_NAMES
};
