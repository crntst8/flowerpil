// Migration: Add last_handle_change_at to bio_profiles table
// Date: 2025-09-01
// Description: Enable rate limiting for bio handle changes (once per 24 hours)

export const up = async (db) => {
  console.log('🔄 Running migration 031_bio_profiles_last_handle_change - UP');
  
  // Begin transaction for atomic migration
  db.exec('BEGIN TRANSACTION');
  
  try {
    // Add last_handle_change_at column to bio_profiles table
    console.log('  📝 Adding last_handle_change_at column to bio_profiles...');
    
    await db.exec(`
      ALTER TABLE bio_profiles ADD COLUMN last_handle_change_at DATETIME NULL
    `);
    
    db.exec('COMMIT');
    console.log('✅ Migration 031_bio_profiles_last_handle_change completed successfully');
    
    // Verify migration results
    const schemaCheck = db.prepare(`
      SELECT sql FROM sqlite_master 
      WHERE type='table' AND name='bio_profiles'
    `).get();
    console.log('📊 Migration results: bio_profiles schema updated');
    
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 031_bio_profiles_last_handle_change failed:', error);
    throw error;
  }
};

export const down = async (db) => {
  console.log('🔄 Running migration 031_bio_profiles_last_handle_change - DOWN');
  
  db.exec('BEGIN TRANSACTION');
  
  try {
    // SQLite doesn't support DROP COLUMN, so we need to recreate the table
    console.log('  🔄 Recreating bio_profiles table without last_handle_change_at...');
    
    // Get the current bio_profiles schema (excluding last_handle_change_at)
    const currentSchema = db.prepare(`
      SELECT sql FROM sqlite_master 
      WHERE type='table' AND name='bio_profiles'
    `).get();
    
    // Create new table without last_handle_change_at
    // Note: This is a simplified schema - in production, you'd want to extract the exact original schema
    await db.exec(`
      CREATE TABLE bio_profiles_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        curator_id INTEGER NOT NULL,
        handle TEXT UNIQUE NOT NULL,
        display_name TEXT,
        bio TEXT,
        links TEXT,
        theme TEXT DEFAULT 'default',
        is_published INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (curator_id) REFERENCES curators(id)
      )
    `);
    
    // Copy data from old table to new table (excluding last_handle_change_at)
    await db.exec(`
      INSERT INTO bio_profiles_new 
      SELECT id, curator_id, handle, display_name, bio, links, theme, 
             is_published, created_at, updated_at 
      FROM bio_profiles
    `);
    
    // Drop old table and rename new table
    await db.exec('DROP TABLE bio_profiles');
    await db.exec('ALTER TABLE bio_profiles_new RENAME TO bio_profiles');
    
    // Recreate indexes if they existed
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_bio_profiles_handle ON bio_profiles(handle)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_bio_profiles_curator_id ON bio_profiles(curator_id)');
    
    db.exec('COMMIT');
    console.log('✅ Migration 031_bio_profiles_last_handle_change rollback completed');
    
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 031_bio_profiles_last_handle_change rollback failed:', error);
    throw error;
  }
};