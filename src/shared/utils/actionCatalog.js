/**
 * Action Catalog - Schema constants for behavior tracking
 * Shared between frontend tracker and backend validation
 */

export const FEATURE_KEYS = {
  LANDING_FEED: 'landing_feed',
  PLAYLIST_VIEW: 'playlist_view',
  PLAYLIST_TRACK: 'playlist_track',
  CURATOR_CREATE: 'curator_create',
  CURATOR_LIBRARY: 'curator_library',
};

export const ACTION_TYPES = ['click', 'start', 'complete', 'error', 'performance', 'dropoff'];

export const ACTION_TYPE = {
  CLICK: 'click',
  START: 'start',
  COMPLETE: 'complete',
  ERROR: 'error',
  PERFORMANCE: 'performance',
  DROPOFF: 'dropoff',
};

export const VALIDATION = {
  FEATURE_KEY_MAX: 64,
  FEATURE_KEY_PATTERN: /^[a-z_]+$/,
  ACTION_NAME_MAX: 64,
  TARGET_KEY_MAX: 64,
  TARGET_TEXT_MAX: 50,
  DURATION_MS_MIN: 0,
  DURATION_MS_MAX: 300000,
  VALUE_NUM_MIN: -1000000,
  VALUE_NUM_MAX: 1000000,
  METADATA_MAX_KEYS: 10,
  METADATA_VALUE_MAX: 200,
  METADATA_JSON_MAX: 2048,
  BATCH_MAX: 25,
  SENSITIVE_KEYS: ['email', 'token', 'password', 'auth', 'cookie', 'secret', 'key', 'ssn', 'phone'],
};
