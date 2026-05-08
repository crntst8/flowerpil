/**
 * Site-Wide Analytics Schema Migration
 * Privacy-first analytics for tracking page visits, unique users, realtime activity,
 * traffic sources, exit pages, and geographic data
 */

export const up = (database) => {
  console.log('Creating site-wide analytics tables...');

  // High-frequency event tracking table
  database.exec(`
    CREATE TABLE IF NOT EXISTS site_analytics_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_hash TEXT NOT NULL,
      visitor_hash TEXT NOT NULL,
      page_path TEXT NOT NULL,
      page_type TEXT NOT NULL,
      resource_id TEXT,
      event_type TEXT NOT NULL DEFAULT 'pageview',
      referrer_domain TEXT,
      referrer_path TEXT,
      utm_source TEXT,
      utm_medium TEXT,
      utm_campaign TEXT,
      utm_term TEXT,
      utm_content TEXT,
      country_code TEXT,
      region_code TEXT,
      device_type TEXT,
      browser_family TEXT,
      os_family TEXT,
      is_bot INTEGER DEFAULT 0,
      time_on_page INTEGER,
      scroll_depth INTEGER,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Daily aggregated analytics
  database.exec(`
    CREATE TABLE IF NOT EXISTS site_analytics_daily (
      date DATE NOT NULL,
      page_type TEXT NOT NULL DEFAULT 'all',
      resource_id TEXT,
      pageviews INTEGER DEFAULT 0,
      unique_visitors INTEGER DEFAULT 0,
      unique_sessions INTEGER DEFAULT 0,
      avg_time_on_page REAL DEFAULT 0,
      avg_scroll_depth REAL DEFAULT 0,
      bounce_rate REAL DEFAULT 0,
      exit_count INTEGER DEFAULT 0,
      referrer_breakdown TEXT,
      utm_breakdown TEXT,
      country_breakdown TEXT,
      device_breakdown TEXT,
      browser_breakdown TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (date, page_type, resource_id)
    )
  `);

  // Weekly aggregated analytics
  database.exec(`
    CREATE TABLE IF NOT EXISTS site_analytics_weekly (
      year INTEGER NOT NULL,
      week INTEGER NOT NULL,
      page_type TEXT NOT NULL DEFAULT 'all',
      resource_id TEXT,
      pageviews INTEGER DEFAULT 0,
      unique_visitors INTEGER DEFAULT 0,
      unique_sessions INTEGER DEFAULT 0,
      avg_time_on_page REAL DEFAULT 0,
      growth_rate_views REAL DEFAULT 0,
      growth_rate_visitors REAL DEFAULT 0,
      top_pages TEXT,
      top_referrers TEXT,
      top_countries TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (year, week, page_type, resource_id)
    )
  `);

  // Monthly aggregated analytics
  database.exec(`
    CREATE TABLE IF NOT EXISTS site_analytics_monthly (
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      page_type TEXT NOT NULL DEFAULT 'all',
      resource_id TEXT,
      pageviews INTEGER DEFAULT 0,
      unique_visitors INTEGER DEFAULT 0,
      unique_sessions INTEGER DEFAULT 0,
      avg_time_on_page REAL DEFAULT 0,
      growth_rate_views REAL DEFAULT 0,
      growth_rate_visitors REAL DEFAULT 0,
      top_pages TEXT,
      top_referrers TEXT,
      top_countries TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (year, month, page_type, resource_id)
    )
  `);

  // Realtime tracking (live visitors)
  database.exec(`
    CREATE TABLE IF NOT EXISTS site_analytics_realtime (
      session_hash TEXT PRIMARY KEY,
      page_path TEXT NOT NULL,
      page_type TEXT,
      resource_id TEXT,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_heartbeat DATETIME DEFAULT CURRENT_TIMESTAMP,
      country_code TEXT,
      device_type TEXT,
      referrer_domain TEXT
    )
  `);

  // Exit page tracking
  database.exec(`
    CREATE TABLE IF NOT EXISTS site_analytics_exits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date DATE NOT NULL,
      page_path TEXT NOT NULL,
      exit_count INTEGER DEFAULT 0,
      avg_time_before_exit REAL DEFAULT 0,
      UNIQUE(date, page_path)
    )
  `);

  // Create optimized indexes
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_site_events_timestamp
    ON site_analytics_events(timestamp);

    CREATE INDEX IF NOT EXISTS idx_site_events_session
    ON site_analytics_events(session_hash);

    CREATE INDEX IF NOT EXISTS idx_site_events_visitor
    ON site_analytics_events(visitor_hash);

    CREATE INDEX IF NOT EXISTS idx_site_events_page
    ON site_analytics_events(page_path, timestamp);

    CREATE INDEX IF NOT EXISTS idx_site_events_type
    ON site_analytics_events(page_type, timestamp);

    CREATE INDEX IF NOT EXISTS idx_site_events_event_type
    ON site_analytics_events(event_type, timestamp);

    CREATE INDEX IF NOT EXISTS idx_site_events_date
    ON site_analytics_events(date(timestamp));

    CREATE INDEX IF NOT EXISTS idx_site_daily_date
    ON site_analytics_daily(date DESC);

    CREATE INDEX IF NOT EXISTS idx_site_daily_type_date
    ON site_analytics_daily(page_type, date DESC);

    CREATE INDEX IF NOT EXISTS idx_site_weekly_period
    ON site_analytics_weekly(year DESC, week DESC);

    CREATE INDEX IF NOT EXISTS idx_site_monthly_period
    ON site_analytics_monthly(year DESC, month DESC);

    CREATE INDEX IF NOT EXISTS idx_site_realtime_heartbeat
    ON site_analytics_realtime(last_heartbeat);

    CREATE INDEX IF NOT EXISTS idx_site_realtime_page
    ON site_analytics_realtime(page_path);

    CREATE INDEX IF NOT EXISTS idx_site_exits_date
    ON site_analytics_exits(date);

    CREATE INDEX IF NOT EXISTS idx_site_exits_page
    ON site_analytics_exits(page_path, date DESC);
  `);

  console.log('Site-wide analytics tables created successfully');
};

export const down = (database) => {
  console.log('Dropping site-wide analytics tables...');

  // Drop indexes
  const indexes = [
    'idx_site_events_timestamp',
    'idx_site_events_session',
    'idx_site_events_visitor',
    'idx_site_events_page',
    'idx_site_events_type',
    'idx_site_events_event_type',
    'idx_site_events_date',
    'idx_site_daily_date',
    'idx_site_daily_type_date',
    'idx_site_weekly_period',
    'idx_site_monthly_period',
    'idx_site_realtime_heartbeat',
    'idx_site_realtime_page',
    'idx_site_exits_date',
    'idx_site_exits_page'
  ];

  indexes.forEach(index => {
    database.exec(`DROP INDEX IF EXISTS ${index}`);
  });

  // Drop tables
  database.exec('DROP TABLE IF EXISTS site_analytics_exits');
  database.exec('DROP TABLE IF EXISTS site_analytics_realtime');
  database.exec('DROP TABLE IF EXISTS site_analytics_monthly');
  database.exec('DROP TABLE IF EXISTS site_analytics_weekly');
  database.exec('DROP TABLE IF EXISTS site_analytics_daily');
  database.exec('DROP TABLE IF EXISTS site_analytics_events');

  console.log('Site-wide analytics tables dropped');
};

export default { up, down };
