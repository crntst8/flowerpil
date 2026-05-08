import os from 'os';
import process from 'process';

/**
 * Configuration management for portable linking worker
 * Validates and provides all configuration with sensible defaults
 */

const normalizeStorefront = (value) => {
  if (!value) return 'us';
  const trimmed = String(value).trim().toLowerCase();
  return /^[a-z]{2}$/.test(trimmed) ? trimmed : 'us';
};

const parseBoolean = (value, defaultValue = false) => {
  if (value === undefined || value === null) return defaultValue;
  const str = String(value).toLowerCase();
  return str === 'true' || str === '1' || str === 'yes';
};

const parseInteger = (value, defaultValue, min, max) => {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) return defaultValue;
  if (min !== undefined && parsed < min) return min;
  if (max !== undefined && parsed > max) return max;
  return parsed;
};

/**
 * Get and validate configuration from environment variables
 * @returns {Object} Validated configuration object
 * @throws {Error} If required configuration is missing
 */
export function getConfig() {
  const config = {
    // Worker identity
    workerId: process.env.LINKING_WORKER_ID || `${os.hostname()}-${process.pid}`,

    // API connection
    apiBase: (process.env.LINKING_API_BASE || process.env.API_BASE || '').replace(/\/$/, ''),
    workerKey: process.env.LINKING_WORKER_KEY || (process.env.LINKING_WORKER_KEYS || '').split(',')[0]?.trim(),

    // Operational settings
    playlistId: process.env.LINKING_PLAYLIST_ID ? parseInt(process.env.LINKING_PLAYLIST_ID, 10) : null,
    batchSize: parseInteger(process.env.LINKING_BATCH_SIZE, 5, 1, 50),
    pollIntervalMs: parseInteger(process.env.LINKING_POLL_INTERVAL_MS, 100, 10, 5000),
    heartbeatIntervalSec: parseInteger(process.env.LINKING_HEARTBEAT_INTERVAL_SEC, 60, 10, 300),

    // TLS settings
    tlsRejectUnauthorized: parseBoolean(process.env.NODE_TLS_REJECT_UNAUTHORIZED, false),

    // Health check settings
    healthCheckEnabled: parseBoolean(process.env.HEALTH_CHECK_ENABLED, true),
    healthCheckPort: parseInteger(process.env.HEALTH_CHECK_PORT, 3001, 1024, 65535),

    // Logging settings
    logLevel: process.env.LOG_LEVEL || 'info', // debug, info, warn, error
    logFormat: process.env.LOG_FORMAT || 'json', // json or text

    // Metrics settings
    metricsEnabled: parseBoolean(process.env.METRICS_ENABLED, true),

    // Graceful shutdown
    shutdownTimeoutMs: parseInteger(process.env.SHUTDOWN_TIMEOUT_MS, 30000, 1000, 300000),

    // Platform credentials - Spotify
    spotify: {
      clientId: process.env.SPOTIFY_CLIENT_ID || '',
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET || '',
      enabled: !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET),
    },

    // Platform credentials - Tidal
    tidal: {
      clientId: process.env.TIDAL_CLIENT_ID || '',
      clientSecret: process.env.TIDAL_CLIENT_SECRET || '',
      enabled: !!(process.env.TIDAL_CLIENT_ID && process.env.TIDAL_CLIENT_SECRET),
    },

    // Platform credentials - Apple Music
    apple: {
      teamId: process.env.APPLE_MUSIC_TEAM_ID || '',
      keyId: process.env.APPLE_MUSIC_KEY_ID || '',
      privateKey: process.env.APPLE_MUSIC_PRIVATE_KEY || '',
      privateKeyPath: process.env.APPLE_MUSIC_PRIVATE_KEY_PATH || '',
      storefront: normalizeStorefront(process.env.APPLE_MUSIC_STOREFRONT),
      enabled: !!(
        process.env.APPLE_MUSIC_TEAM_ID &&
        process.env.APPLE_MUSIC_KEY_ID &&
        (process.env.APPLE_MUSIC_PRIVATE_KEY || process.env.APPLE_MUSIC_PRIVATE_KEY_PATH)
      ),
    },
  };

  return config;
}

/**
 * Validate required configuration
 * @param {Object} config - Configuration object to validate
 * @throws {Error} If validation fails
 */
export function validateConfig(config) {
  const errors = [];

  // Required fields
  if (!config.apiBase) {
    errors.push('LINKING_API_BASE or API_BASE is required');
  }

  if (!config.workerKey) {
    errors.push('LINKING_WORKER_KEY or LINKING_WORKER_KEYS is required');
  }

  // Validate API base URL format
  if (config.apiBase && !config.apiBase.match(/^https?:\/\//)) {
    errors.push('LINKING_API_BASE must be a valid HTTP/HTTPS URL');
  }

  // Warn if no platforms are enabled
  const enabledPlatforms = [];
  if (config.spotify.enabled) enabledPlatforms.push('Spotify');
  if (config.tidal.enabled) enabledPlatforms.push('Tidal');
  if (config.apple.enabled) enabledPlatforms.push('Apple Music');

  if (enabledPlatforms.length === 0) {
    errors.push('At least one platform (Spotify, Tidal, or Apple Music) credentials should be configured');
  }

  // Validate log level
  const validLogLevels = ['debug', 'info', 'warn', 'error'];
  if (!validLogLevels.includes(config.logLevel)) {
    errors.push(`LOG_LEVEL must be one of: ${validLogLevels.join(', ')}`);
  }

  // Validate log format
  const validLogFormats = ['json', 'text'];
  if (!validLogFormats.includes(config.logFormat)) {
    errors.push(`LOG_FORMAT must be one of: ${validLogFormats.join(', ')}`);
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}`);
  }

  return {
    valid: true,
    warnings: enabledPlatforms.length < 3 ? [
      `Only ${enabledPlatforms.length}/3 platforms enabled: ${enabledPlatforms.join(', ')}`
    ] : []
  };
}

/**
 * Print configuration summary (without sensitive data)
 * @param {Object} config - Configuration to summarize
 * @returns {Object} Safe configuration summary
 */
export function getConfigSummary(config) {
  return {
    workerId: config.workerId,
    apiBase: config.apiBase,
    playlistId: config.playlistId || 'all',
    batchSize: config.batchSize,
    platforms: {
      spotify: config.spotify.enabled ? 'enabled' : 'disabled',
      tidal: config.tidal.enabled ? 'enabled' : 'disabled',
      apple: config.apple.enabled ? 'enabled' : 'disabled',
    },
    settings: {
      healthCheckEnabled: config.healthCheckEnabled,
      healthCheckPort: config.healthCheckPort,
      metricsEnabled: config.metricsEnabled,
      logLevel: config.logLevel,
      logFormat: config.logFormat,
    }
  };
}
