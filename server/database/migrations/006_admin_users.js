// Migration: Add admin users table for authentication
// Date: 2025-08-09
// Description: Create admin_users table for JWT-based admin authentication system

export const up = async (db) => {
  console.log('🔄 Running migration 006_admin_users - UP');
  
  // Begin transaction for atomic migration
  db.exec('BEGIN TRANSACTION');
  
  try {
    // Create admin_users table
    console.log('  📝 Creating admin_users table...');
    
    await db.exec(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'admin',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME,
        is_active INTEGER DEFAULT 1,
        failed_login_attempts INTEGER DEFAULT 0,
        locked_until DATETIME NULL
      )
    `);
    
    // Create indexes for performance
    console.log('  📊 Creating indexes for admin_users...');
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_admin_users_username ON admin_users(username)',
      'CREATE INDEX IF NOT EXISTS idx_admin_users_active ON admin_users(is_active)',
      'CREATE INDEX IF NOT EXISTS idx_admin_users_locked ON admin_users(locked_until)'
    ];
    
    for (const indexSQL of indexes) {
      db.exec(indexSQL);
    }
    
    db.exec('COMMIT');
    console.log('✅ Migration 006_admin_users completed successfully');
    
    // Verify migration results
    const adminCount = db.prepare('SELECT COUNT(*) as count FROM admin_users').get();
    console.log(`📊 Migration results: ${adminCount.count} admin users in table`);
    
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 006_admin_users failed:', error);
    throw error;
  }
};

export const down = async (db) => {
  console.log('🔄 Running migration 006_admin_users - DOWN');
  
  db.exec('BEGIN TRANSACTION');
  
  try {
    // Drop indexes first
    console.log('  🔄 Dropping admin_users indexes...');
    const dropIndexes = [
      'DROP INDEX IF EXISTS idx_admin_users_username',
      'DROP INDEX IF EXISTS idx_admin_users_active',
      'DROP INDEX IF EXISTS idx_admin_users_locked'
    ];
    
    for (const dropSQL of dropIndexes) {
      db.exec(dropSQL);
    }
    
    // Drop the table
    console.log('  🗑️  Dropping admin_users table...');
    await db.exec('DROP TABLE IF EXISTS admin_users');
    
    db.exec('COMMIT');
    console.log('✅ Migration 006_admin_users rollback completed');
    
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 006_admin_users rollback failed:', error);
    throw error;
  }
};