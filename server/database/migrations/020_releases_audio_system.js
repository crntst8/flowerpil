// Migration: Audio Release System - Audio Files and Multi-track Support
// Date: 2025-08-29
// Description: Extend upcoming_releases with audio fields and add release_tracks, release_custom_links tables

export const up = (db) => {
  console.log('🔄 Running migration 020_releases_audio_system - UP');
  
  // Begin transaction for atomic migration
  db.exec('BEGIN TRANSACTION');
  
  try {
    // 1. Extend upcoming_releases table with audio file fields
    console.log('  📝 Adding audio fields to upcoming_releases...');
    const audioFields = [
      'audio_file_path TEXT',
      'download_enabled BOOLEAN DEFAULT 0',
      'preview_start_time INTEGER DEFAULT 0',
      'preview_end_time INTEGER DEFAULT 30', 
      'preview_only BOOLEAN DEFAULT 0',
      'password_hash TEXT'
    ];
    
    for (const field of audioFields) {
      try {
        db.exec(`ALTER TABLE upcoming_releases ADD COLUMN ${field}`);
      } catch (error) {
        console.log(`    ⚠️  Column might already exist: ${field.split(' ')[0]}`);
      }
    }
    
    // 2. Create release_tracks table for multi-track support
    console.log('  📝 Creating release_tracks table...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS release_tracks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        release_id INTEGER NOT NULL,
        position INTEGER NOT NULL,
        title TEXT NOT NULL,
        artist TEXT,
        duration_seconds INTEGER,
        audio_file_path TEXT,
        preview_start_time INTEGER DEFAULT 0,
        preview_end_time INTEGER DEFAULT 30,
        preview_only BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (release_id) REFERENCES upcoming_releases(id) ON DELETE CASCADE
      )
    `);
    
    // 3. Create release_custom_links table for custom action buttons
    console.log('  📝 Creating release_custom_links table...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS release_custom_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        release_id INTEGER NOT NULL,
        sort_order INTEGER DEFAULT 0,
        label TEXT NOT NULL,
        url TEXT NOT NULL,
        icon_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (release_id) REFERENCES upcoming_releases(id) ON DELETE CASCADE
      )
    `);
    
    // 4. Add publication flags (reuse existing fields as noted in plan)
    console.log('  📝 Adding is_published flag if not exists...');
    try {
      db.exec('ALTER TABLE upcoming_releases ADD COLUMN is_published BOOLEAN DEFAULT 0');
    } catch (error) {
      console.log('    ⚠️  is_published column might already exist');
    }
    
    // 5. Create performance indexes
    console.log('  📊 Creating indexes...');
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_release_tracks_release ON release_tracks(release_id)',
      'CREATE INDEX IF NOT EXISTS idx_release_tracks_position ON release_tracks(release_id, position)',
      'CREATE INDEX IF NOT EXISTS idx_release_custom_links_release ON release_custom_links(release_id)',
      'CREATE INDEX IF NOT EXISTS idx_release_custom_links_sort ON release_custom_links(release_id, sort_order)',
      'CREATE INDEX IF NOT EXISTS idx_upcoming_releases_published ON upcoming_releases(is_published)',
      'CREATE INDEX IF NOT EXISTS idx_upcoming_releases_featured ON upcoming_releases(featured_on_homepage)'
    ];
    
    for (const indexSQL of indexes) {
      db.exec(indexSQL);
    }
    
    // 6. Create timestamp update triggers
    console.log('  ⚡ Creating timestamp triggers...');
    
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_release_tracks_timestamp 
      AFTER UPDATE ON release_tracks
      BEGIN
        UPDATE release_tracks SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END
    `);
    
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_release_custom_links_timestamp 
      AFTER UPDATE ON release_custom_links
      BEGIN
        UPDATE release_custom_links SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END
    `);
    
    db.exec('COMMIT');
    console.log('✅ Migration 020_releases_audio_system completed successfully');
    
    // Verify migration results
    const releaseCount = db.prepare('SELECT COUNT(*) as count FROM upcoming_releases').get();
    const trackCount = db.prepare('SELECT COUNT(*) as count FROM release_tracks').get();
    const linkCount = db.prepare('SELECT COUNT(*) as count FROM release_custom_links').get();
    
    console.log(`📊 Migration results:`);
    console.log(`   - Upcoming releases: ${releaseCount.count}`);
    console.log(`   - Release tracks: ${trackCount.count}`);
    console.log(`   - Custom links: ${linkCount.count}`);
    
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 020_releases_audio_system failed:', error);
    throw error;
  }
};

export const down = (db) => {
  console.log('🔄 Running migration 020_releases_audio_system - DOWN');
  
  db.exec('BEGIN TRANSACTION');
  
  try {
    // Drop triggers
    console.log('  🔄 Dropping triggers...');
    db.exec('DROP TRIGGER IF EXISTS update_release_tracks_timestamp');
    db.exec('DROP TRIGGER IF EXISTS update_release_custom_links_timestamp');
    
    // Drop indexes
    console.log('  🔄 Dropping indexes...');
    const dropIndexes = [
      'DROP INDEX IF EXISTS idx_release_tracks_release',
      'DROP INDEX IF EXISTS idx_release_tracks_position',
      'DROP INDEX IF EXISTS idx_release_custom_links_release',
      'DROP INDEX IF EXISTS idx_release_custom_links_sort',
      'DROP INDEX IF EXISTS idx_upcoming_releases_published',
      'DROP INDEX IF EXISTS idx_upcoming_releases_featured'
    ];
    
    for (const dropSQL of dropIndexes) {
      db.exec(dropSQL);
    }
    
    // Drop tables in correct order (child tables first)
    console.log('  🔄 Dropping tables...');
    db.exec('DROP TABLE IF EXISTS release_custom_links');
    db.exec('DROP TABLE IF EXISTS release_tracks');
    
    // Note: We can't easily drop columns in SQLite, so we'll leave the audio columns
    // They will be ignored by the application if this migration is rolled back
    
    db.exec('COMMIT');
    console.log('✅ Migration 020_releases_audio_system rollback completed');
    
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 020_releases_audio_system rollback failed:', error);
    throw error;
  }
};