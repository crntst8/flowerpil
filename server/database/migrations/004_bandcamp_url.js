// Migration: Add Bandcamp URL field to tracks
// Date: 2025-08-06
// Description: Add bandcamp_url field to tracks table for Bandcamp track links

export const up = (db) => {
  console.log('🔄 Running migration 004_bandcamp_url - UP');
  
  // Begin transaction for atomic migration
  db.exec('BEGIN TRANSACTION');
  
  try {
    // Add bandcamp_url column to tracks table
    console.log('  📝 Adding bandcamp_url column to tracks table...');
    
    try {
      db.exec('ALTER TABLE tracks ADD COLUMN bandcamp_url TEXT');
      console.log('  ✅ bandcamp_url column added successfully');
    } catch (error) {
      if (error.message.includes('duplicate column name')) {
        console.log('  ⚠️  bandcamp_url column already exists, skipping...');
      } else {
        throw error;
      }
    }
    
    // Create index for bandcamp_url for performance
    console.log('  📊 Creating index for bandcamp_url...');
    db.exec('CREATE INDEX IF NOT EXISTS idx_tracks_bandcamp_url ON tracks(bandcamp_url)');
    
    db.exec('COMMIT');
    console.log('✅ Migration 004_bandcamp_url completed successfully');
    
    // Verify migration results
    const trackCount = db.prepare('SELECT COUNT(*) as count FROM tracks WHERE bandcamp_url IS NOT NULL').get();
    console.log(`📊 Migration results: ${trackCount.count} tracks with Bandcamp URLs`);
    
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 004_bandcamp_url failed:', error);
    throw error;
  }
};

export const down = (db) => {
  console.log('🔄 Running migration 004_bandcamp_url - DOWN');
  
  db.exec('BEGIN TRANSACTION');
  
  try {
    // Drop index
    console.log('  🔄 Dropping bandcamp_url index...');
    db.exec('DROP INDEX IF EXISTS idx_tracks_bandcamp_url');
    
    // Note: SQLite doesn't support DROP COLUMN, so we can't easily remove the column
    // The column will remain but won't be used by the application after rollback
    console.log('  ⚠️  Note: bandcamp_url column cannot be removed in SQLite (will remain unused)');
    
    db.exec('COMMIT');
    console.log('✅ Migration 004_bandcamp_url rollback completed');
    
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 004_bandcamp_url rollback failed:', error);
    throw error;
  }
};