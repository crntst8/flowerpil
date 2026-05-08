// Migration: Add security tracking tables for rate limiting and audit logging
// Date: 2025-08-09
// Description: Create tables for failed login tracking, account lockouts, security events, and CSRF tokens

export const up = async (db) => {
  console.log('🔄 Running migration 007_security_tracking - UP');
  
  // Begin transaction for atomic migration
  db.exec('BEGIN TRANSACTION');
  
  try {
    console.log('  📝 Creating security tracking tables...');
    
    await db.exec(`
-- Security tracking tables for account lockout and audit logging

-- Failed login attempts tracking
CREATE TABLE IF NOT EXISTS failed_login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_address TEXT NOT NULL,
  username TEXT,
  attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  user_agent TEXT
);

-- Account lockouts tracking
CREATE TABLE IF NOT EXISTS account_lockouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  locked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  locked_until DATETIME NOT NULL,
  attempt_count INTEGER DEFAULT 0
);

-- Security events audit log
CREATE TABLE IF NOT EXISTS security_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  user_id INTEGER,
  username TEXT,
  details TEXT,
  user_agent TEXT,
  endpoint TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- CSRF tokens for admin sessions
CREATE TABLE IF NOT EXISTS csrf_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  FOREIGN KEY (user_id) REFERENCES admin_users (id) ON DELETE CASCADE
);
    `);

    // Create indexes for performance
    console.log('  📊 Creating indexes for security tables...');
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_failed_attempts_ip_time ON failed_login_attempts(ip_address, attempted_at)',
      'CREATE INDEX IF NOT EXISTS idx_failed_attempts_username_time ON failed_login_attempts(username, attempted_at)',
      'CREATE INDEX IF NOT EXISTS idx_lockouts_username ON account_lockouts(username)',
      'CREATE INDEX IF NOT EXISTS idx_lockouts_until ON account_lockouts(locked_until)',
      'CREATE INDEX IF NOT EXISTS idx_security_events_type_time ON security_events(event_type, created_at)',
      'CREATE INDEX IF NOT EXISTS idx_security_events_ip_time ON security_events(ip_address, created_at)',
      'CREATE INDEX IF NOT EXISTS idx_security_events_user_time ON security_events(user_id, created_at)',
      'CREATE INDEX IF NOT EXISTS idx_csrf_tokens_token ON csrf_tokens(token)',
      'CREATE INDEX IF NOT EXISTS idx_csrf_tokens_user_expires ON csrf_tokens(user_id, expires_at)'
    ];
    
    for (const indexSQL of indexes) {
      db.exec(indexSQL);
    }

    db.exec('COMMIT');
    console.log('✅ Migration 007_security_tracking completed successfully');
    
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 007_security_tracking failed:', error);
    throw error;
  }
};

export const down = async (db) => {
  console.log('🔄 Running migration 007_security_tracking - DOWN');
  
  db.exec('BEGIN TRANSACTION');
  
  try {
    console.log('  🗑️  Dropping security tracking tables...');
    await db.exec(`
DROP TABLE IF EXISTS csrf_tokens;
DROP TABLE IF EXISTS security_events;
DROP TABLE IF EXISTS account_lockouts;
DROP TABLE IF EXISTS failed_login_attempts;
    `);

    db.exec('COMMIT');
    console.log('✅ Migration 007_security_tracking rollback completed');
    
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 007_security_tracking rollback failed:', error);
    throw error;
  }
};