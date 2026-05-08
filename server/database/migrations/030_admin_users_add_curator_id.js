// Migration: Add curator_id to admin_users table
// Date: 2025-09-01
// Description: Link admin_users to curator profiles for role-based access

export const up = async (db) => {
  console.log('🔄 Running migration 030_admin_users_add_curator_id - UP');
  
  // Begin transaction for atomic migration
  db.exec('BEGIN TRANSACTION');
  
  try {
    // Add curator_id column to admin_users table
    console.log('  📝 Adding curator_id column to admin_users...');
    
    await db.exec(`
      ALTER TABLE admin_users ADD COLUMN curator_id INTEGER NULL
    `);
    
    // Create index for performance on curator_id lookups
    console.log('  📊 Creating index for curator_id...');
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_admin_users_curator_id ON admin_users(curator_id)
    `);
    
    db.exec('COMMIT');
    console.log('✅ Migration 030_admin_users_add_curator_id completed successfully');
    
    // Verify migration results
    const schemaCheck = db.prepare(`
      SELECT sql FROM sqlite_master 
      WHERE type='table' AND name='admin_users'
    `).get();
    console.log('📊 Migration results: admin_users schema updated');
    
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 030_admin_users_add_curator_id failed:', error);
    throw error;
  }
};

export const down = async (db) => {
  console.log('🔄 Running migration 030_admin_users_add_curator_id - DOWN');
  
  db.exec('BEGIN TRANSACTION');
  
  try {
    // Drop the index first
    console.log('  🔄 Dropping curator_id index...');
    db.exec('DROP INDEX IF EXISTS idx_admin_users_curator_id');
    
    // SQLite doesn't support DROP COLUMN, so we need to recreate the table
    console.log('  🔄 Recreating admin_users table without curator_id...');
    
    // Create new table without curator_id
    await db.exec(`
      CREATE TABLE admin_users_new (
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
    
    // Copy data from old table to new table
    await db.exec(`
      INSERT INTO admin_users_new 
      SELECT id, username, password_hash, role, created_at, last_login, 
             is_active, failed_login_attempts, locked_until 
      FROM admin_users
    `);
    
    // Drop old table and rename new table
    await db.exec('DROP TABLE admin_users');
    await db.exec('ALTER TABLE admin_users_new RENAME TO admin_users');
    
    // Recreate original indexes
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_admin_users_username ON admin_users(username)',
      'CREATE INDEX IF NOT EXISTS idx_admin_users_active ON admin_users(is_active)',
      'CREATE INDEX IF NOT EXISTS idx_admin_users_locked ON admin_users(locked_until)'
    ];
    
    for (const indexSQL of indexes) {
      db.exec(indexSQL);
    }
    
    db.exec('COMMIT');
    console.log('✅ Migration 030_admin_users_add_curator_id rollback completed');
    
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 030_admin_users_add_curator_id rollback failed:', error);
    throw error;
  }
};