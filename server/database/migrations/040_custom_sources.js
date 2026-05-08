// Migration: Add custom sources field to tracks
// Date: 2025-10-06
// Description: Add custom_sources field to tracks table for user-defined streaming sources

export const up = (db) => {
  console.log('🔄 Running migration 040_custom_sources - UP');

  // Begin transaction for atomic migration
  db.exec('BEGIN TRANSACTION');

  try {
    // Add custom_sources column to tracks table
    console.log('  📝 Adding custom_sources column to tracks table...');

    try {
      db.exec('ALTER TABLE tracks ADD COLUMN custom_sources TEXT');
      console.log('  ✅ custom_sources column added successfully');
    } catch (error) {
      if (error.message.includes('duplicate column name')) {
        console.log('  ⚠️  custom_sources column already exists, skipping...');
      } else {
        throw error;
      }
    }

    db.exec('COMMIT');
    console.log('✅ Migration 040_custom_sources completed successfully');

    // Verify migration results
    const trackCount = db.prepare('SELECT COUNT(*) as count FROM tracks WHERE custom_sources IS NOT NULL').get();
    console.log(`📊 Migration results: ${trackCount.count} tracks with custom sources`);

  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 040_custom_sources failed:', error);
    throw error;
  }
};

export const down = (db) => {
  console.log('🔄 Running migration 040_custom_sources - DOWN');

  db.exec('BEGIN TRANSACTION');

  try {
    // Note: SQLite doesn't support DROP COLUMN, so we can't easily remove the column
    // The column will remain but won't be used by the application after rollback
    console.log('  ⚠️  Note: custom_sources column cannot be removed in SQLite (will remain unused)');

    db.exec('COMMIT');
    console.log('✅ Migration 040_custom_sources rollback completed');

  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 040_custom_sources rollback failed:', error);
    throw error;
  }
};
