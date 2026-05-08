/**
 * User Behavior Priorities - Actions + Transitions tables
 * Extends site analytics with feature-level action tracking
 * and pre-aggregated feature transition data
 */

export const up = (database) => {
  console.log('Creating user behavior priority tables...');

  database.exec(`
    CREATE TABLE IF NOT EXISTS site_analytics_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_hash TEXT NOT NULL,
      visitor_hash TEXT NOT NULL,
      page_path TEXT NOT NULL,
      page_type TEXT NOT NULL,
      resource_id TEXT,
      feature_key TEXT NOT NULL,
      action_type TEXT NOT NULL,
      action_name TEXT NOT NULL,
      target_key TEXT,
      target_text TEXT,
      duration_ms INTEGER,
      value_num REAL,
      success INTEGER,
      metadata_json TEXT,
      country_code TEXT,
      device_type TEXT,
      browser_family TEXT,
      os_family TEXT,
      is_bot INTEGER DEFAULT 0,
      is_rage_click INTEGER DEFAULT 0,
      occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_site_actions_occurred_at
      ON site_analytics_actions(occurred_at);

    CREATE INDEX IF NOT EXISTS idx_site_actions_feature
      ON site_analytics_actions(feature_key, action_type, occurred_at);

    CREATE INDEX IF NOT EXISTS idx_site_actions_session
      ON site_analytics_actions(session_hash, occurred_at);

    CREATE INDEX IF NOT EXISTS idx_site_actions_page
      ON site_analytics_actions(page_path, occurred_at);

    CREATE INDEX IF NOT EXISTS idx_site_actions_target
      ON site_analytics_actions(target_key, occurred_at);
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS site_analytics_transitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_feature TEXT NOT NULL,
      to_feature TEXT NOT NULL,
      session_hash TEXT NOT NULL,
      occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_site_transitions_features
      ON site_analytics_transitions(from_feature, to_feature, occurred_at);
  `);

  console.log('User behavior priority tables created successfully');
};

export const down = (database) => {
  console.log('Dropping user behavior priority tables...');

  const indexes = [
    'idx_site_actions_occurred_at',
    'idx_site_actions_feature',
    'idx_site_actions_session',
    'idx_site_actions_page',
    'idx_site_actions_target',
    'idx_site_transitions_features'
  ];

  indexes.forEach(index => {
    database.exec(`DROP INDEX IF EXISTS ${index}`);
  });

  database.exec('DROP TABLE IF EXISTS site_analytics_transitions');
  database.exec('DROP TABLE IF EXISTS site_analytics_actions');

  console.log('User behavior priority tables dropped');
};

export default { up, down };
