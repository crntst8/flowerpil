// Migration: Add Qobuz URL field to tracks
// Date: 2025-11-26
// Description: Add qobuz_url field to tracks table for Qobuz track links

export const up = (db) => {
  console.log('🔄 Running migration 052_qobuz_url - UP');

  // Begin transaction for atomic migration
  db.exec('BEGIN TRANSACTION');

  try {
    // Add qobuz_url column to tracks table
    console.log('  📝 Adding qobuz_url column to tracks table...');

    try {
      db.exec('ALTER TABLE tracks ADD COLUMN qobuz_url TEXT');
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
    db.exec('CREATE INDEX IF NOT EXISTS idx_tracks_qobuz_url ON tracks(qobuz_url)');

    db.exec('COMMIT');
    console.log('✅ Migration 052_qobuz_url completed successfully');

    // Verify migration results
    const trackCount = db.prepare('SELECT COUNT(*) as count FROM tracks WHERE qobuz_url IS NOT NULL').get();
    console.log(`📊 Migration results: ${trackCount.count} tracks with Qobuz URLs`);

  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 052_qobuz_url failed:', error);
    throw error;
  }
};

export const down = (db) => {
  console.log('🔄 Running migration 052_qobuz_url - DOWN');

  db.exec('BEGIN TRANSACTION');

  try {
    // Drop index
    console.log('  🔄 Dropping qobuz_url index...');
    db.exec('DROP INDEX IF EXISTS idx_tracks_qobuz_url');

    // Note: SQLite doesn't support DROP COLUMN, so we can't easily remove the column
    // The column will remain but won't be used by the application after rollback
    console.log('  ⚠️  Note: qobuz_url column cannot be removed in SQLite (will remain unused)');

    db.exec('COMMIT');
    console.log('✅ Migration 052_qobuz_url rollback completed');

  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 052_qobuz_url rollback failed:', error);
    throw error;
  }
};
