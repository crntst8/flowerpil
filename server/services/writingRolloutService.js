import { getDatabase } from '../database/db.js';

export const WRITING_ROLLOUT_CONFIG_KEY = 'writing_rollout';

export const DEFAULT_WRITING_ROLLOUT = {
  phase: 'pilot',
  pilot_curator_ids: [],
  show_in_home_feed: false,
  show_sidebar_nav: false
};

const VALID_PHASES = new Set(['pilot', 'public']);

const toInt = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeIdList = (values) => {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const normalized = [];

  for (const value of values) {
    const parsed = toInt(value);
    if (!parsed || parsed <= 0 || seen.has(parsed)) continue;
    seen.add(parsed);
    normalized.push(parsed);
  }

  return normalized;
};

export const normalizeWritingRolloutConfig = (value) => {
  const source = value && typeof value === 'object' ? value : {};
  const phase = VALID_PHASES.has(source.phase) ? source.phase : DEFAULT_WRITING_ROLLOUT.phase;

  const pilotCuratorIds = normalizeIdList(source.pilot_curator_ids);

  const showInHomeFeed = phase === 'public'
    ? source.show_in_home_feed !== false
    : source.show_in_home_feed === true;

  const showSidebarNav = phase === 'public'
    ? source.show_sidebar_nav !== false
    : source.show_sidebar_nav === true;

  return {
    phase,
    pilot_curator_ids: pilotCuratorIds,
    show_in_home_feed: showInHomeFeed,
    show_sidebar_nav: showSidebarNav
  };
};

export const getWritingRolloutConfig = (database = getDatabase()) => {
  try {
    const row = database
      .prepare('SELECT config_value FROM admin_system_config WHERE config_key = ? LIMIT 1')
      .get(WRITING_ROLLOUT_CONFIG_KEY);

    if (!row?.config_value) {
      return { ...DEFAULT_WRITING_ROLLOUT };
    }

    const parsed = JSON.parse(row.config_value);
    return normalizeWritingRolloutConfig(parsed);
  } catch (error) {
    console.warn('[WRITING_ROLLOUT] Failed to read config, using defaults:', error?.message || error);
    return { ...DEFAULT_WRITING_ROLLOUT };
  }
};

export const setWritingRolloutConfig = (config, userId = null, database = getDatabase()) => {
  const normalized = normalizeWritingRolloutConfig(config);

  database.prepare(`
    INSERT INTO admin_system_config (config_key, config_value, config_type, description, updated_by, updated_at)
    VALUES (?, ?, 'system', 'Writing rollout controls for pilot/public launch', ?, CURRENT_TIMESTAMP)
    ON CONFLICT(config_key) DO UPDATE SET
      config_value = excluded.config_value,
      config_type = excluded.config_type,
      description = excluded.description,
      updated_by = excluded.updated_by,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    WRITING_ROLLOUT_CONFIG_KEY,
    JSON.stringify(normalized),
    userId
  );

  return normalized;
};

export const canCuratorAccessWriting = (user, rolloutConfig) => {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role !== 'curator') return false;

  if (rolloutConfig.phase === 'public') return true;

  const curatorId = toInt(user.curator_id);
  if (!curatorId) return false;

  return rolloutConfig.pilot_curator_ids.includes(curatorId);
};

export const getWritingPermissions = (user, rolloutConfig) => {
  const canAccessDashboard = canCuratorAccessWriting(user, rolloutConfig);
  const isAdmin = user?.role === 'admin';

  return {
    can_access_dashboard: canAccessDashboard,
    can_manage_all: Boolean(isAdmin),
    can_publish: Boolean(canAccessDashboard),
    rollout_phase: rolloutConfig.phase,
    show_in_home_feed: rolloutConfig.show_in_home_feed,
    show_sidebar_nav: rolloutConfig.show_sidebar_nav
  };
};
