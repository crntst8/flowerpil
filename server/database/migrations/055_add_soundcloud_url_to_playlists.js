// Migration: Add SoundCloud URL field to playlists table
// Date: 2025-01-16
// Description: Add soundcloud_url field to playlists table for SoundCloud playlist links

export const up = (db) => {
  console.log('🔄 Running migration 055_add_soundcloud_url_to_playlists - UP');

  // Begin transaction for atomic migration
  db.exec('BEGIN TRANSACTION');

  try {
    // Add soundcloud_url column to playlists table
    console.log('  📝 Adding soundcloud_url column to playlists table...');

    try {
      db.exec('ALTER TABLE playlists ADD COLUMN soundcloud_url TEXT');
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
    db.exec('CREATE INDEX IF NOT EXISTS idx_playlists_soundcloud_url ON playlists(soundcloud_url)');

    db.exec('COMMIT');
    console.log('✅ Migration 055_add_soundcloud_url_to_playlists completed successfully');

    // Verify migration results
    const playlistCount = db.prepare('SELECT COUNT(*) as count FROM playlists WHERE soundcloud_url IS NOT NULL').get();
    console.log(`📊 Migration results: ${playlistCount.count} playlists with SoundCloud URLs`);

  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 055_add_soundcloud_url_to_playlists failed:', error);
    throw error;
  }
};

export const down = (db) => {
  console.log('🔄 Running migration 055_add_soundcloud_url_to_playlists - DOWN');

  db.exec('BEGIN TRANSACTION');

  try {
    // Drop index
    console.log('  🔄 Dropping soundcloud_url index...');
    db.exec('DROP INDEX IF EXISTS idx_playlists_soundcloud_url');

    // Note: SQLite doesn't support DROP COLUMN, so we can't easily remove the column
    // The column will remain but won't be used by the application after rollback
    console.log('  ⚠️  Note: soundcloud_url column cannot be removed in SQLite (will remain unused)');

    db.exec('COMMIT');
    console.log('✅ Migration 055_add_soundcloud_url_to_playlists rollback completed');

  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 055_add_soundcloud_url_to_playlists rollback failed:', error);
    throw error;
  }
};



