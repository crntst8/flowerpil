/**
 * Enhanced Analytics Schema Migration
 * Adds comprehensive analytics tables for event tracking, aggregation, and performance monitoring
 */

export const up = (database) => {
  console.log('Creating enhanced analytics tables...');
  
  // High-frequency event tracking table
  database.exec(`
    CREATE TABLE IF NOT EXISTS bio_analytics_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bio_profile_id INTEGER NOT NULL,
      event_type TEXT NOT NULL, -- 'view', 'click', 'scroll', 'time_spent'
      event_action TEXT, -- 'featured_link', 'profile_button', 'external_link'
      event_target TEXT, -- link ID, button type, URL
      event_data TEXT, -- JSON with additional event details
      session_id TEXT NOT NULL, -- Hashed session identifier
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      user_agent_hash TEXT, -- Hashed for privacy
      referrer_domain TEXT, -- Domain only, not full URL
      country_code TEXT, -- 2-letter ISO code
      device_type TEXT, -- 'mobile', 'desktop', 'tablet'
      browser_family TEXT, -- 'chrome', 'firefox', 'safari'
      page_path TEXT, -- Path component only
      FOREIGN KEY (bio_profile_id) REFERENCES bio_profiles(id) ON DELETE CASCADE
    )
  `);

  // Daily aggregated analytics for performance
  database.exec(`
    CREATE TABLE IF NOT EXISTS bio_analytics_daily (
      date DATE NOT NULL,
      bio_profile_id INTEGER NOT NULL,
      views INTEGER DEFAULT 0,
      unique_sessions INTEGER DEFAULT 0,
      total_clicks INTEGER DEFAULT 0,
      avg_time_on_page REAL DEFAULT 0,
      bounce_rate REAL DEFAULT 0,
      top_referrers TEXT, -- JSON array of top referrer domains
      top_countries TEXT, -- JSON array of top country codes
      device_breakdown TEXT, -- JSON object with device type counts
      browser_breakdown TEXT, -- JSON object with browser counts
      featured_link_clicks TEXT, -- JSON object with featured link performance
      profile_button_clicks TEXT, -- JSON object with profile button performance
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (date, bio_profile_id),
      FOREIGN KEY (bio_profile_id) REFERENCES bio_profiles(id) ON DELETE CASCADE
    )
  `);

  // Weekly aggregated analytics
  database.exec(`
    CREATE TABLE IF NOT EXISTS bio_analytics_weekly (
      year INTEGER NOT NULL,
      week INTEGER NOT NULL,
      bio_profile_id INTEGER NOT NULL,
      views INTEGER DEFAULT 0,
      unique_sessions INTEGER DEFAULT 0,
      total_clicks INTEGER DEFAULT 0,
      avg_time_on_page REAL DEFAULT 0,
      bounce_rate REAL DEFAULT 0,
      growth_rate REAL DEFAULT 0, -- Compared to previous week
      top_performing_links TEXT, -- JSON array
      engagement_score REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (year, week, bio_profile_id),
      FOREIGN KEY (bio_profile_id) REFERENCES bio_profiles(id) ON DELETE CASCADE
    )
  `);

  // Real-time analytics cache table
  database.exec(`
    CREATE TABLE IF NOT EXISTS bio_analytics_realtime (
      bio_profile_id INTEGER PRIMARY KEY,
      current_visitors INTEGER DEFAULT 0,
      last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
      today_views INTEGER DEFAULT 0,
      today_unique_sessions INTEGER DEFAULT 0,
      today_clicks INTEGER DEFAULT 0,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bio_profile_id) REFERENCES bio_profiles(id) ON DELETE CASCADE
    )
  `);

  // Link performance tracking
  database.exec(`
    CREATE TABLE IF NOT EXISTS bio_analytics_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bio_profile_id INTEGER NOT NULL,
      link_id TEXT NOT NULL, -- featured link ID or profile button type
      link_type TEXT NOT NULL, -- 'featured_link', 'profile_button', 'external'
      link_title TEXT,
      link_url TEXT,
      clicks_today INTEGER DEFAULT 0,
      clicks_week INTEGER DEFAULT 0,
      clicks_month INTEGER DEFAULT 0,
      clicks_total INTEGER DEFAULT 0,
      last_clicked DATETIME,
      click_rate REAL DEFAULT 0, -- Clicks / Views ratio
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(bio_profile_id, link_id, link_type),
      FOREIGN KEY (bio_profile_id) REFERENCES bio_profiles(id) ON DELETE CASCADE
    )
  `);

  // Performance metrics table
  database.exec(`
    CREATE TABLE IF NOT EXISTS bio_analytics_performance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bio_profile_id INTEGER NOT NULL,
      date DATE NOT NULL,
      avg_load_time REAL DEFAULT 0, -- milliseconds
      avg_time_to_interactive REAL DEFAULT 0,
      avg_first_contentful_paint REAL DEFAULT 0,
      bounce_rate REAL DEFAULT 0,
      avg_session_duration REAL DEFAULT 0, -- seconds
      page_exit_rate REAL DEFAULT 0,
      error_rate REAL DEFAULT 0,
      cache_hit_rate REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(bio_profile_id, date),
      FOREIGN KEY (bio_profile_id) REFERENCES bio_profiles(id) ON DELETE CASCADE
    )
  `);

  // Create optimized indexes for analytics queries
  database.exec(`
    -- Event tracking indexes
    CREATE INDEX IF NOT EXISTS idx_bio_events_profile_timestamp 
    ON bio_analytics_events(bio_profile_id, timestamp);
    
    CREATE INDEX IF NOT EXISTS idx_bio_events_session 
    ON bio_analytics_events(session_id, timestamp);
    
    CREATE INDEX IF NOT EXISTS idx_bio_events_type_timestamp 
    ON bio_analytics_events(event_type, timestamp);

    -- Daily analytics indexes
    CREATE INDEX IF NOT EXISTS idx_bio_daily_profile_date 
    ON bio_analytics_daily(bio_profile_id, date DESC);
    
    -- Weekly analytics indexes
    CREATE INDEX IF NOT EXISTS idx_bio_weekly_profile_period 
    ON bio_analytics_weekly(bio_profile_id, year DESC, week DESC);
    
    -- Link performance indexes
    CREATE INDEX IF NOT EXISTS idx_bio_links_profile_performance 
    ON bio_analytics_links(bio_profile_id, clicks_total DESC);
    
    -- Performance metrics indexes
    CREATE INDEX IF NOT EXISTS idx_bio_performance_profile_date 
    ON bio_analytics_performance(bio_profile_id, date DESC);
  `);

  // Create triggers for automatic aggregation updates
  database.exec(`
    -- Trigger to update real-time analytics on new events
    CREATE TRIGGER IF NOT EXISTS update_realtime_analytics
    AFTER INSERT ON bio_analytics_events
    BEGIN
      INSERT OR REPLACE INTO bio_analytics_realtime (
        bio_profile_id, 
        current_visitors,
        last_activity,
        today_views,
        today_unique_sessions,
        today_clicks,
        last_updated
      ) VALUES (
        NEW.bio_profile_id,
        COALESCE((
          SELECT COUNT(DISTINCT session_id)
          FROM bio_analytics_events
          WHERE bio_profile_id = NEW.bio_profile_id
          AND timestamp > datetime('now', '-30 minutes')
        ), 0),
        NEW.timestamp,
        COALESCE((
          SELECT COUNT(*)
          FROM bio_analytics_events
          WHERE bio_profile_id = NEW.bio_profile_id
          AND event_type = 'view'
          AND date(timestamp) = date('now')
        ), 0),
        COALESCE((
          SELECT COUNT(DISTINCT session_id)
          FROM bio_analytics_events
          WHERE bio_profile_id = NEW.bio_profile_id
          AND event_type = 'view'
          AND date(timestamp) = date('now')
        ), 0),
        COALESCE((
          SELECT COUNT(*)
          FROM bio_analytics_events
          WHERE bio_profile_id = NEW.bio_profile_id
          AND event_type = 'click'
          AND date(timestamp) = date('now')
        ), 0),
        datetime('now')
      );
    END;
  `);

  console.log('✅ Enhanced analytics tables created successfully');
};

export const down = (database) => {
  console.log('Dropping enhanced analytics tables...');
  
  // Drop triggers first
  database.exec('DROP TRIGGER IF EXISTS update_realtime_analytics');
  
  // Drop indexes
  const indexes = [
    'idx_bio_events_profile_timestamp',
    'idx_bio_events_session',
    'idx_bio_events_type_timestamp',
    'idx_bio_daily_profile_date',
    'idx_bio_weekly_profile_period',
    'idx_bio_links_profile_performance',
    'idx_bio_performance_profile_date'
  ];
  
  indexes.forEach(index => {
    database.exec(`DROP INDEX IF EXISTS ${index}`);
  });
  
  // Drop tables in reverse dependency order
  database.exec('DROP TABLE IF EXISTS bio_analytics_performance');
  database.exec('DROP TABLE IF EXISTS bio_analytics_links');
  database.exec('DROP TABLE IF EXISTS bio_analytics_realtime');
  database.exec('DROP TABLE IF EXISTS bio_analytics_weekly');
  database.exec('DROP TABLE IF EXISTS bio_analytics_daily');
  database.exec('DROP TABLE IF EXISTS bio_analytics_events');
  
  console.log('✅ Enhanced analytics tables dropped');
};

export default { up, down };