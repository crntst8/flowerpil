// Migration: Add SoundCloud URL field to tracks
// Date: 2025-10-06
// Description: Add soundcloud_url field to tracks table for SoundCloud track links

export const up = (db) => {
  console.log('🔄 Running migration 021_soundcloud_url - UP');

  // Begin transaction for atomic migration
  db.exec('BEGIN TRANSACTION');

  try {
    // Add soundcloud_url column to tracks table
    console.log('  📝 Adding soundcloud_url column to tracks table...');

    try {
      db.exec('ALTER TABLE tracks ADD COLUMN soundcloud_url TEXT');
      console.log('  ✅ soundcloud_url column added successfully');
    } catch (error) {
      if (error.message.includes('duplicate column name')) {
        console.log('  ⚠️  soundcloud_url column already exists, skipping...');
      } else {
        throw error;
      }
    }

    // Create index for soundcloud_url for performance
    console.log('  📊 Creating index for soundcloud_url...');
    db.exec('CREATE INDEX IF NOT EXISTS idx_tracks_soundcloud_url ON tracks(soundcloud_url)');

    db.exec('COMMIT');
    console.log('✅ Migration 021_soundcloud_url completed successfully');

    // Verify migration results
    const trackCount = db.prepare('SELECT COUNT(*) as count FROM tracks WHERE soundcloud_url IS NOT NULL').get();
    console.log(`📊 Migration results: ${trackCount.count} tracks with SoundCloud URLs`);

  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 021_soundcloud_url failed:', error);
    throw error;
  }
};

export const down = (db) => {
  console.log('🔄 Running migration 021_soundcloud_url - DOWN');

  db.exec('BEGIN TRANSACTION');

  try {
    // Drop index
    console.log('  🔄 Dropping soundcloud_url index...');
    db.exec('DROP INDEX IF EXISTS idx_tracks_soundcloud_url');

    // Note: SQLite doesn't support DROP COLUMN, so we can't easily remove the column
    // The column will remain but won't be used by the application after rollback
    console.log('  ⚠️  Note: soundcloud_url column cannot be removed in SQLite (will remain unused)');

    db.exec('COMMIT');
    console.log('✅ Migration 021_soundcloud_url rollback completed');

  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 021_soundcloud_url rollback failed:', error);
    throw error;
  }
};
