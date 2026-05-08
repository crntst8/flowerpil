// Migration: Add Qobuz URL field to playlists table
// Date: 2025-11-26
// Description: Add qobuz_url field to playlists table for Qobuz playlist links

export const up = (db) => {
  console.log('🔄 Running migration 053_add_qobuz_url_to_playlists - UP');

  // Begin transaction for atomic migration
  db.exec('BEGIN TRANSACTION');

  try {
    // Add qobuz_url column to playlists table
    console.log('  📝 Adding qobuz_url column to playlists table...');

    try {
      db.exec('ALTER TABLE playlists ADD COLUMN qobuz_url TEXT');
      console.log('  ✅ qobuz_url column added successfully');
    } catch (error) {
      if (error.message.includes('duplicate column name')) {
        console.log('  ⚠️  qobuz_url column already exists, skipping...');
      } else {
        throw error;
      }
    }

    // Create index for qobuz_url for performance
    console.log('  📊 Creating index for qobuz_url...');
    db.exec('CREATE INDEX IF NOT EXISTS idx_playlists_qobuz_url ON playlists(qobuz_url)');

    db.exec('COMMIT');
    console.log('✅ Migration 053_add_qobuz_url_to_playlists completed successfully');

    // Verify migration results
    const playlistCount = db.prepare('SELECT COUNT(*) as count FROM playlists WHERE qobuz_url IS NOT NULL').get();
    console.log(`📊 Migration results: ${playlistCount.count} playlists with Qobuz URLs`);

  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 053_add_qobuz_url_to_playlists failed:', error);
    throw error;
  }
};

export const down = (db) => {
  console.log('🔄 Running migration 053_add_qobuz_url_to_playlists - DOWN');

  db.exec('BEGIN TRANSACTION');

  try {
    // Drop index
    console.log('  🔄 Dropping qobuz_url index...');
    db.exec('DROP INDEX IF EXISTS idx_playlists_qobuz_url');

    // Note: SQLite doesn't support DROP COLUMN, so we can't easily remove the column
    // The column will remain but won't be used by the application after rollback
    console.log('  ⚠️  Note: qobuz_url column cannot be removed in SQLite (will remain unused)');

    db.exec('COMMIT');
    console.log('✅ Migration 053_add_qobuz_url_to_playlists rollback completed');

  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 053_add_qobuz_url_to_playlists rollback failed:', error);
    throw error;
  }
};










