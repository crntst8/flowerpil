/**
 * Feature Flag Service
 * Centralizes feature flag logic for public user system
 */

import { getDatabase } from '../database/db.js';

export const FLAGS = {
  PUBLIC_USERS_ENABLED: 'PUBLIC_USERS_ENABLED',
  INVITE_ONLY_MODE: 'INVITE_ONLY_MODE',
  DISABLE_PUBLIC_EXPORTS: 'DISABLE_PUBLIC_EXPORTS'
};

export const LIMITS = {
  PUBLIC_USER_IMPORT_LIMIT: 'PUBLIC_USER_IMPORT_LIMIT',
  PUBLIC_USER_EXPORT_PLAYLIST_THRESHOLD: 'PUBLIC_USER_EXPORT_PLAYLIST_THRESHOLD'
};

/**
 * Get a boolean feature flag value
 * @param {string} flagKey - The flag key to check
 * @param {boolean} defaultValue - Default value if not set
 * @returns {boolean}
 */
export const getFlag = (flagKey, defaultValue = false) => {
  const envValue = process.env[flagKey];
  if (envValue === undefined || envValue === null || envValue === '') {
    return defaultValue;
  }
  return envValue === 'true' || envValue === true;
};

/**
 * Get a numeric limit value
 * @param {string} limitKey - The limit key to check
 * @param {number} defaultValue - Default value if not set
 * @returns {number}
 */
export const getLimit = (limitKey, defaultValue = 0) => {
  const envValue = process.env[limitKey];
  if (envValue === undefined || envValue === null || envValue === '') {
    return defaultValue;
  }
  const parsed = parseInt(envValue, 10);
  return isNaN(parsed) ? defaultValue : parsed;
};

/**
 * Check if public signup is enabled
 */
export const isPublicSignupEnabled = () =>
  getFlag(FLAGS.PUBLIC_USERS_ENABLED, false);

/**
 * Check if invite-only mode is active
 */
export const isInviteOnly = () =>
  getFlag(FLAGS.INVITE_ONLY_MODE, true);

/**
 * Check if public exports are disabled globally
 */
export const arePublicExportsDisabled = () =>
  getFlag(FLAGS.DISABLE_PUBLIC_EXPORTS, false);

/**
 * Check if open signup is enabled (no referral code required)
 * This is stored in admin_system_config and takes precedence over INVITE_ONLY_MODE
 * @returns {boolean}
 */
export const isOpenSignupEnabled = () => {
  try {
    const db = getDatabase();
    const config = db.prepare(`
      SELECT config_value FROM admin_system_config
      WHERE config_key = 'open_signup_enabled'
    `).get();

    if (config?.config_value) {
      const parsed = JSON.parse(config.config_value);
      return parsed?.enabled === true;
    }
    return false;
  } catch (error) {
    console.error('[FeatureFlagService] Error checking open signup:', error);
    return false;
  }
};

/**
 * Get the import limit for public users (per 24h)
 */
export const getPublicUserImportLimit = () =>
  getLimit(LIMITS.PUBLIC_USER_IMPORT_LIMIT, 2);

/**
 * Get the playlist count threshold for export eligibility
 */
export const getExportPlaylistThreshold = () =>
  getLimit(LIMITS.PUBLIC_USER_EXPORT_PLAYLIST_THRESHOLD, 6);

/**
 * Get all feature flags as an object for frontend consumption
 * @returns {Object} Feature flags object
 */
export const getAllFlags = () => ({
  publicUsersEnabled: isPublicSignupEnabled(),
  inviteOnlyMode: isInviteOnly(),
  openSignupEnabled: isOpenSignupEnabled(),
  publicExportsDisabled: arePublicExportsDisabled(),
  publicUserImportLimit: getPublicUserImportLimit(),
  exportPlaylistThreshold: getExportPlaylistThreshold()
});

export default {
  FLAGS,
  LIMITS,
  getFlag,
  getLimit,
  isPublicSignupEnabled,
  isInviteOnly,
  isOpenSignupEnabled,
  arePublicExportsDisabled,
  getPublicUserImportLimit,
  getExportPlaylistThreshold,
  getAllFlags
};
