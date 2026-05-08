// Migration: Bio Pages System
// Date: 2025-08-09  
// Description: Complete bio page system with profiles, featured links, versioning, and analytics

export const up = (db) => {
  console.log('🔄 Running migration 009_bio_pages_system - UP');
  
  // Begin transaction for atomic migration
  db.exec('BEGIN TRANSACTION');
  
  try {
    // 1. Create bio_profiles table - Core bio page data
    console.log('  📝 Creating bio_profiles table...');
    
    db.exec(`
      CREATE TABLE bio_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        handle TEXT UNIQUE NOT NULL,
        curator_id INTEGER NOT NULL,
        display_settings TEXT,          -- JSON: field visibility toggles
        theme_settings TEXT,            -- JSON: colors, background, borders  
        seo_metadata TEXT,              -- JSON: title, description, keywords
        draft_content TEXT,             -- JSON: unpublished changes
        published_content TEXT,         -- JSON: live content snapshot
        published_at DATETIME,
        is_published INTEGER DEFAULT 0,  -- Boolean as integer (0/1)
        version_number INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        
        -- Foreign key constraint
        FOREIGN KEY (curator_id) REFERENCES curators(id) ON DELETE CASCADE,
        
        -- Handle constraints
        CHECK (length(handle) >= 3 AND length(handle) <= 30),
        CHECK (handle = lower(handle)),
        CHECK (handle GLOB '[a-z0-9-]*'),
        CHECK (handle NOT LIKE '--%' AND handle NOT LIKE '%--'),
        CHECK (handle NOT LIKE '-%' AND handle NOT LIKE '%-')
      )
    `);
    
    // 2. Create bio_featured_links table - 3 main featured containers
    console.log('  📝 Creating bio_featured_links table...');
    
    db.exec(`
      CREATE TABLE bio_featured_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bio_profile_id INTEGER NOT NULL,
        position INTEGER NOT NULL,       -- 1, 2, or 3 (user-defined order)
        link_type TEXT NOT NULL,         -- 'url' or 'curator_content'
        link_data TEXT,                  -- JSON: URL + metadata OR curator content reference
        display_settings TEXT,          -- JSON: title, description, imagery
        is_enabled INTEGER DEFAULT 1,   -- Boolean as integer
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        
        -- Foreign key constraint
        FOREIGN KEY (bio_profile_id) REFERENCES bio_profiles(id) ON DELETE CASCADE,
        
        -- Position constraints
        CHECK (position >= 1 AND position <= 3),
        CHECK (link_type IN ('url', 'curator_content')),
        
        -- Unique position per bio profile
        UNIQUE(bio_profile_id, position)
      )
    `);
    
    // 3. Create bio_versions table - Version control system  
    console.log('  📝 Creating bio_versions table...');
    
    db.exec(`
      CREATE TABLE bio_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bio_profile_id INTEGER NOT NULL,
        version_number INTEGER NOT NULL,
        content_snapshot TEXT,           -- JSON: complete content snapshot
        change_summary TEXT,             -- Human-readable change description
        created_by INTEGER,              -- FK to admin_users.id
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        
        -- Foreign key constraints
        FOREIGN KEY (bio_profile_id) REFERENCES bio_profiles(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE SET NULL,
        
        -- Unique version per bio profile
        UNIQUE(bio_profile_id, version_number)
      )
    `);
    
    // 4. Create bio_analytics_views table - Privacy-compliant page views
    console.log('  📝 Creating bio_analytics_views table...');
    
    db.exec(`
      CREATE TABLE bio_analytics_views (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bio_profile_id INTEGER NOT NULL,
        session_hash TEXT,               -- Anonymized session identifier
        view_date DATE,                  -- Date only, no timestamps
        country_code TEXT,               -- 2-letter ISO, no IP storage  
        referrer_domain TEXT,           -- Domain only, no full URLs
        user_agent_category TEXT,       -- mobile/desktop/tablet only
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        
        -- Foreign key constraint
        FOREIGN KEY (bio_profile_id) REFERENCES bio_profiles(id) ON DELETE CASCADE,
        
        -- Privacy constraints
        CHECK (length(country_code) = 2 OR country_code IS NULL),
        CHECK (user_agent_category IN ('mobile', 'desktop', 'tablet', 'bot') OR user_agent_category IS NULL)
      )
    `);
    
    // 5. Create bio_analytics_clicks table - Link performance tracking
    console.log('  📝 Creating bio_analytics_clicks table...');
    
    db.exec(`
      CREATE TABLE bio_analytics_clicks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bio_profile_id INTEGER NOT NULL,
        link_type TEXT NOT NULL,         -- 'featured_link', 'profile_button'
        link_identifier TEXT,           -- position or button type
        click_date DATE,                 -- Date only for privacy
        session_hash TEXT,               -- Same as views for correlation
        referrer_domain TEXT,           -- Domain only
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        
        -- Foreign key constraint
        FOREIGN KEY (bio_profile_id) REFERENCES bio_profiles(id) ON DELETE CASCADE,
        
        -- Link type constraints
        CHECK (link_type IN ('featured_link', 'profile_button'))
      )
    `);
    
    // 6. Create feature_flags table - Feature flag system
    console.log('  📝 Creating feature_flags table...');
    
    db.exec(`
      CREATE TABLE feature_flags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        flag_name TEXT UNIQUE NOT NULL,
        is_enabled INTEGER DEFAULT 0,
        rollout_percentage INTEGER DEFAULT 0,  -- 0-100
        environment TEXT DEFAULT 'all',        -- 'development', 'production', 'all'
        target_users TEXT,                     -- JSON array of user IDs
        conditions TEXT,                       -- JSON conditions object
        emergency_disabled INTEGER DEFAULT 0, -- Emergency kill switch
        emergency_reason TEXT,                 -- Reason for emergency disable
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER,  -- FK to admin_users.id
        
        FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE SET NULL,
        
        -- Rollout percentage constraints
        CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
        CHECK (environment IN ('development', 'production', 'all'))
      )
    `);
    
    // 7. Create performance indexes
    console.log('  📊 Creating performance indexes...');
    
    const indexes = [
      // Bio profiles indexes
      'CREATE INDEX idx_bio_profiles_handle ON bio_profiles(handle)',
      'CREATE INDEX idx_bio_profiles_curator_id ON bio_profiles(curator_id)',
      'CREATE INDEX idx_bio_profiles_published ON bio_profiles(is_published, published_at)',
      'CREATE INDEX idx_bio_profiles_updated ON bio_profiles(updated_at DESC)',
      
      // Featured links indexes
      'CREATE INDEX idx_bio_featured_links_profile_position ON bio_featured_links(bio_profile_id, position)',
      'CREATE INDEX idx_bio_featured_links_enabled ON bio_featured_links(bio_profile_id, is_enabled)',
      
      // Versions indexes  
      'CREATE INDEX idx_bio_versions_profile_version ON bio_versions(bio_profile_id, version_number DESC)',
      'CREATE INDEX idx_bio_versions_created_at ON bio_versions(created_at DESC)',
      
      // Analytics indexes (optimized for aggregation queries)
      'CREATE INDEX idx_bio_analytics_views_profile_date ON bio_analytics_views(bio_profile_id, view_date)',
      'CREATE INDEX idx_bio_analytics_views_date ON bio_analytics_views(view_date)',
      'CREATE INDEX idx_bio_analytics_clicks_profile_date ON bio_analytics_clicks(bio_profile_id, click_date)',
      'CREATE INDEX idx_bio_analytics_clicks_link_type ON bio_analytics_clicks(bio_profile_id, link_type)',
      
      // Feature flags indexes
      'CREATE INDEX idx_feature_flags_name_env ON feature_flags(flag_name, environment)',
      'CREATE INDEX idx_feature_flags_enabled ON feature_flags(is_enabled, rollout_percentage)'
    ];
    
    for (const indexSQL of indexes) {
      db.exec(indexSQL);
    }
    
    // 8. Create timestamp update triggers
    console.log('  ⚡ Creating timestamp triggers...');
    
    db.exec(`
      CREATE TRIGGER update_bio_profiles_timestamp 
      AFTER UPDATE ON bio_profiles
      BEGIN
        UPDATE bio_profiles SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END
    `);
    
    db.exec(`
      CREATE TRIGGER update_bio_featured_links_timestamp 
      AFTER UPDATE ON bio_featured_links
      BEGIN
        UPDATE bio_featured_links SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END
    `);
    
    db.exec(`
      CREATE TRIGGER update_feature_flags_timestamp 
      AFTER UPDATE ON feature_flags
      BEGIN
        UPDATE feature_flags SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END
    `);
    
    // 9. Insert default feature flags
    console.log('  🚩 Creating default feature flags...');
    
    const defaultFlags = [
      {
        name: 'bio_pages_enabled',
        description: 'Enable bio pages feature globally',
        enabled: 0,
        rollout: 0
      },
      {
        name: 'bio_editor_enabled', 
        description: 'Enable bio page editor in admin interface',
        enabled: 0,
        rollout: 0
      },
      {
        name: 'bio_public_access',
        description: 'Allow public access to published bio pages',
        enabled: 0,
        rollout: 0
      },
      {
        name: 'bio_analytics_tracking',
        description: 'Enable analytics and performance tracking',
        enabled: 0,
        rollout: 0
      },
      {
        name: 'bio_custom_themes',
        description: 'Allow custom theme creation',
        enabled: 0,
        rollout: 0
      }
    ];
    
    const insertFlag = db.prepare(`
      INSERT INTO feature_flags (flag_name, is_enabled, rollout_percentage, environment, created_by)
      VALUES (?, ?, ?, 'all', NULL)
    `);
    
    for (const flag of defaultFlags) {
      insertFlag.run(flag.name, flag.enabled, flag.rollout);
    }
    
    db.exec('COMMIT');
    console.log('✅ Migration 009_bio_pages_system completed successfully');
    
    // Verify migration results
    const tableCount = db.prepare(`
      SELECT COUNT(*) as count 
      FROM sqlite_master 
      WHERE type='table' AND name LIKE 'bio_%'
    `).get();
    
    const flagCount = db.prepare('SELECT COUNT(*) as count FROM feature_flags').get();
    
    console.log(`📊 Migration results:`);
    console.log(`   - Bio tables created: ${tableCount.count}`);
    console.log(`   - Feature flags created: ${flagCount.count}`);
    console.log(`   - Indexes created: 14`);
    console.log(`   - Triggers created: 3`);
    
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 009_bio_pages_system failed:', error);
    throw error;
  }
};

export const down = (db) => {
  console.log('🔄 Running migration 009_bio_pages_system - DOWN');
  
  db.exec('BEGIN TRANSACTION');
  
  try {
    // Drop tables in reverse dependency order
    console.log('  🔄 Dropping bio pages system...');
    
    // Drop triggers first
    const triggers = [
      'DROP TRIGGER IF EXISTS update_bio_profiles_timestamp',
      'DROP TRIGGER IF EXISTS update_bio_featured_links_timestamp',
      'DROP TRIGGER IF EXISTS update_feature_flags_timestamp'
    ];
    
    for (const dropSQL of triggers) {
      db.exec(dropSQL);
    }
    
    // Drop indexes  
    const indexes = [
      'DROP INDEX IF EXISTS idx_bio_profiles_handle',
      'DROP INDEX IF EXISTS idx_bio_profiles_curator_id',
      'DROP INDEX IF EXISTS idx_bio_profiles_published',
      'DROP INDEX IF EXISTS idx_bio_profiles_updated',
      'DROP INDEX IF EXISTS idx_bio_featured_links_profile_position',
      'DROP INDEX IF EXISTS idx_bio_featured_links_enabled',
      'DROP INDEX IF EXISTS idx_bio_versions_profile_version',
      'DROP INDEX IF EXISTS idx_bio_versions_created_at',
      'DROP INDEX IF EXISTS idx_bio_analytics_views_profile_date',
      'DROP INDEX IF EXISTS idx_bio_analytics_views_date',
      'DROP INDEX IF EXISTS idx_bio_analytics_clicks_profile_date',
      'DROP INDEX IF EXISTS idx_bio_analytics_clicks_link_type',
      'DROP INDEX IF EXISTS idx_feature_flags_name_env',
      'DROP INDEX IF EXISTS idx_feature_flags_enabled'
    ];
    
    for (const dropSQL of indexes) {
      db.exec(dropSQL);
    }
    
    // Drop tables in dependency order
    const tables = [
      'DROP TABLE IF EXISTS bio_analytics_clicks',
      'DROP TABLE IF EXISTS bio_analytics_views',
      'DROP TABLE IF EXISTS bio_versions',
      'DROP TABLE IF EXISTS bio_featured_links',
      'DROP TABLE IF EXISTS bio_profiles',
      'DROP TABLE IF EXISTS feature_flags'
    ];
    
    for (const dropSQL of tables) {
      db.exec(dropSQL);
    }
    
    db.exec('COMMIT');
    console.log('✅ Migration 009_bio_pages_system rollback completed');
    
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 009_bio_pages_system rollback failed:', error);
    throw error;
  }
};