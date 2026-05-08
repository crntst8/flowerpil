// Migration: Add comprehensive audit logging system
// Date: 2025-08-09
// Description: Create audit_logs table for tracking all administrative actions with complete change history

export const up = async (db) => {
  console.log('🔄 Running migration 008_audit_logging - UP');
  
  // Begin transaction for atomic migration
  db.exec('BEGIN TRANSACTION');
  
  try {
    console.log('  📝 Creating audit_logs table...');
    
    await db.exec(`
-- Comprehensive audit logging table for administrative actions
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id INTEGER,
  old_values TEXT,
  new_values TEXT,
  ip_address TEXT NOT NULL,
  user_agent TEXT,
  endpoint TEXT,
  method TEXT,
  status_code INTEGER,
  error_message TEXT,
  session_id TEXT,
  request_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  -- Foreign key to admin_users
  FOREIGN KEY (user_id) REFERENCES admin_users (id) ON DELETE CASCADE
);
    `);

    // Create indexes for performance and querying
    console.log('  📊 Creating indexes for audit_logs...');
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_audit_logs_user_time ON audit_logs(user_id, created_at)',
      'CREATE INDEX IF NOT EXISTS idx_audit_logs_action_time ON audit_logs(action, created_at)',
      'CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id)',
      'CREATE INDEX IF NOT EXISTS idx_audit_logs_ip_time ON audit_logs(ip_address, created_at)',
      'CREATE INDEX IF NOT EXISTS idx_audit_logs_session ON audit_logs(session_id)',
      'CREATE INDEX IF NOT EXISTS idx_audit_logs_status ON audit_logs(status_code, created_at)'
    ];
    
    for (const indexSQL of indexes) {
      db.exec(indexSQL);
    }

    db.exec('COMMIT');
    console.log('✅ Migration 008_audit_logging completed successfully');
    
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 008_audit_logging failed:', error);
    throw error;
  }
};

export const down = async (db) => {
  console.log('🔄 Running migration 008_audit_logging - DOWN');
  
  db.exec('BEGIN TRANSACTION');
  
  try {
    console.log('  🗑️  Dropping audit_logs table...');
    await db.exec(`
DROP TABLE IF EXISTS audit_logs;
    `);

    db.exec('COMMIT');
    console.log('✅ Migration 008_audit_logging rollback completed');
    
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 008_audit_logging rollback failed:', error);
    throw error;
  }
};