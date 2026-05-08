// Migration: Admin & Performance Tools for pil.bio
// Adds comprehensive admin operations, audit logging, performance monitoring,
// and security tracking tables for bio page management

export const up = (database) => {
  console.log('🔧 Creating admin & performance monitoring tables...');
  
  // Admin Action Audit Logging
  database.exec(`
    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_user_id INTEGER NOT NULL,
      action_type TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id INTEGER,
      details TEXT, -- JSON string with action details
      ip_address TEXT,
      user_agent_hash TEXT,
      session_id TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (admin_user_id) REFERENCES admin_users(id)
    )
  `);
  
  // Performance Metrics Collection
  database.exec(`
    CREATE TABLE IF NOT EXISTS bio_performance_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bio_profile_id INTEGER,
      metric_type TEXT NOT NULL, -- 'page_load', 'database_query', 'image_load', 'cache_hit'
      metric_value REAL NOT NULL,
      metadata TEXT, -- JSON string with additional metric data
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bio_profile_id) REFERENCES bio_profiles(id)
    )
  `);
  
  // Handle Reservations & Management
  database.exec(`
    CREATE TABLE IF NOT EXISTS bio_handle_reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      handle TEXT UNIQUE NOT NULL,
      reserved_by INTEGER, -- admin_user_id who reserved it
      reserved_for TEXT, -- email or identifier of intended user
      status TEXT DEFAULT 'reserved', -- 'reserved', 'assigned', 'released'
      reason TEXT, -- reason for reservation
      reserved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
      assigned_at DATETIME,
      notes TEXT,
      FOREIGN KEY (reserved_by) REFERENCES admin_users(id)
    )
  `);
  
  // System Performance Monitoring
  database.exec(`
    CREATE TABLE IF NOT EXISTS system_performance_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      metric_name TEXT NOT NULL,
      metric_value REAL NOT NULL,
      server_instance TEXT DEFAULT 'main',
      tags TEXT, -- JSON string with additional tags
      threshold_breached INTEGER DEFAULT 0,
      alert_sent INTEGER DEFAULT 0,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Enhanced Security Event Monitoring (extends existing security_events)
  database.exec(`
    CREATE TABLE IF NOT EXISTS security_incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_type TEXT NOT NULL, -- 'unusual_activity', 'rate_limit_breach', 'suspicious_pattern'
      severity TEXT DEFAULT 'low', -- 'low', 'medium', 'high', 'critical'
      user_identifier TEXT, -- IP, user_id, session_id, etc.
      details TEXT, -- JSON string with incident details
      ip_address TEXT,
      user_agent_hash TEXT,
      geo_location TEXT, -- Country/region if available
      resolved INTEGER DEFAULT 0,
      resolved_by INTEGER,
      resolution_notes TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (resolved_by) REFERENCES admin_users(id)
    )
  `);
  
  // Bio Page Admin Settings & Flags
  database.exec(`
    CREATE TABLE IF NOT EXISTS bio_admin_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bio_profile_id INTEGER NOT NULL,
      locked INTEGER DEFAULT 0, -- Admin lock to prevent edits
      locked_by INTEGER,
      locked_reason TEXT,
      locked_at DATETIME,
      priority_featured INTEGER DEFAULT 0, -- Featured in admin tools
      optimization_status TEXT DEFAULT 'pending', -- 'pending', 'optimized', 'needs_attention'
      performance_score REAL, -- Calculated performance score
      last_reviewed_by INTEGER,
      last_reviewed_at DATETIME,
      admin_notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(bio_profile_id),
      FOREIGN KEY (bio_profile_id) REFERENCES bio_profiles(id),
      FOREIGN KEY (locked_by) REFERENCES admin_users(id),
      FOREIGN KEY (last_reviewed_by) REFERENCES admin_users(id)
    )
  `);
  
  // User Account Management & Restrictions
  database.exec(`
    CREATE TABLE IF NOT EXISTS bio_user_restrictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_identifier TEXT NOT NULL, -- email, IP, or other identifier
      restriction_type TEXT NOT NULL, -- 'creation_limit', 'temporary_ban', 'rate_limit'
      restriction_value TEXT, -- JSON with restriction details
      reason TEXT,
      applied_by INTEGER NOT NULL,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
      active INTEGER DEFAULT 1,
      FOREIGN KEY (applied_by) REFERENCES admin_users(id)
    )
  `);
  
  // System Configuration for Admin Tools
  database.exec(`
    CREATE TABLE IF NOT EXISTS admin_system_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      config_key TEXT UNIQUE NOT NULL,
      config_value TEXT, -- JSON string with configuration
      config_type TEXT DEFAULT 'system', -- 'system', 'performance', 'security'
      description TEXT,
      updated_by INTEGER,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (updated_by) REFERENCES admin_users(id)
    )
  `);
  
  // Create Optimized Indexes for Admin Operations
  console.log('🔧 Creating performance-optimized indexes...');
  
  // Admin audit log indexes
  database.exec('CREATE INDEX IF NOT EXISTS idx_admin_audit_admin_user ON admin_audit_log(admin_user_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_admin_audit_timestamp ON admin_audit_log(timestamp)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_admin_audit_resource ON admin_audit_log(resource_type, resource_id)');
  
  // Performance metrics indexes
  database.exec('CREATE INDEX IF NOT EXISTS idx_bio_perf_profile ON bio_performance_metrics(bio_profile_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_bio_perf_type ON bio_performance_metrics(metric_type)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_bio_perf_timestamp ON bio_performance_metrics(timestamp)');
  
  // System performance indexes
  database.exec('CREATE INDEX IF NOT EXISTS idx_sys_perf_metric ON system_performance_log(metric_name)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_sys_perf_timestamp ON system_performance_log(timestamp)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_sys_perf_threshold ON system_performance_log(threshold_breached)');
  
  // Security incidents indexes
  database.exec('CREATE INDEX IF NOT EXISTS idx_security_incidents_type ON security_incidents(incident_type)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_security_incidents_severity ON security_incidents(severity)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_security_incidents_timestamp ON security_incidents(timestamp)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_security_incidents_resolved ON security_incidents(resolved)');
  
  // Bio admin settings indexes
  database.exec('CREATE INDEX IF NOT EXISTS idx_bio_admin_locked ON bio_admin_settings(locked)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_bio_admin_optimization ON bio_admin_settings(optimization_status)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_bio_admin_performance ON bio_admin_settings(performance_score)');
  
  // Insert Default Admin Configuration
  console.log('🔧 Inserting default admin configuration...');
  
  const defaultConfig = [
    {
      key: 'bio_creation_daily_limit',
      value: '{"limit": 10, "window_hours": 24}',
      type: 'system',
      description: 'Daily limit for bio page creation per user'
    },
    {
      key: 'performance_monitoring_interval',
      value: '{"interval_seconds": 300, "retention_days": 30}',
      type: 'performance',
      description: 'How often to collect performance metrics'
    },
    {
      key: 'security_alert_thresholds',
      value: '{"failed_logins": 5, "rate_limit_hits": 20, "unusual_activity_score": 80}',
      type: 'security',
      description: 'Threshold values for security alerts'
    },
    {
      key: 'handle_reservation_expiry',
      value: '{"default_days": 30, "vip_days": 90}',
      type: 'system',
      description: 'Default expiry times for handle reservations'
    },
    {
      key: 'performance_optimization_thresholds',
      value: '{"page_load_ms": 2000, "image_load_ms": 1000, "query_ms": 100}',
      type: 'performance',
      description: 'Performance thresholds for optimization alerts'
    },
    {
      key: 'hide_curator_type_sitewide',
      value: '{"enabled": false}',
      type: 'system',
      description: 'Hide curator type display sitewide (except on CuratorProfilePage)'
    }
  ];
  
  const insertConfig = database.prepare(`
    INSERT OR REPLACE INTO admin_system_config 
    (config_key, config_value, config_type, description) 
    VALUES (?, ?, ?, ?)
  `);
  
  for (const config of defaultConfig) {
    insertConfig.run(config.key, config.value, config.type, config.description);
  }
  
  console.log('✅ Admin & performance monitoring tables created successfully');
};

export const down = (database) => {
  console.log('🔧 Dropping admin & performance monitoring tables...');
  
  // Drop tables in reverse dependency order
  database.exec('DROP TABLE IF EXISTS admin_system_config');
  database.exec('DROP TABLE IF EXISTS bio_user_restrictions');
  database.exec('DROP TABLE IF EXISTS bio_admin_settings');
  database.exec('DROP TABLE IF EXISTS security_incidents');
  database.exec('DROP TABLE IF EXISTS system_performance_log');
  database.exec('DROP TABLE IF EXISTS bio_handle_reservations');
  database.exec('DROP TABLE IF EXISTS bio_performance_metrics');
  database.exec('DROP TABLE IF EXISTS admin_audit_log');
  
  console.log('✅ Admin & performance monitoring tables dropped');
};