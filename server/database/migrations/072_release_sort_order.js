import { getDatabase } from '../db.js';

/**
 * Migration 072: Add sort_order to releases
 *
 * Adds manual ordering support for curator release lists.
 */
export const up = (database) => {
  const db = database ?? getDatabase();

  console.log('🔄 Running migration 072_release_sort_order - UP');
  db.exec('BEGIN TRANSACTION');

  try {
    const columns = db.prepare('PRAGMA table_info(releases)').all();
    const hasSortOrder = columns.some((column) => column.name === 'sort_order');

    if (!hasSortOrder) {
      db.exec('ALTER TABLE releases ADD COLUMN sort_order INTEGER DEFAULT 0');
      console.log('  ✅ Added releases.sort_order');
    } else {
      console.log('  ℹ️  releases.sort_order already exists');
    }

    db.exec('CREATE INDEX IF NOT EXISTS idx_releases_sort ON releases(curator_id, sort_order)');

    db.exec('COMMIT');
    console.log('✅ Migration 072_release_sort_order completed');
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 072_release_sort_order failed:', error);
    throw error;
  }
};

export const down = (database) => {
  const db = database ?? getDatabase();

  console.log('🔄 Running migration 072_release_sort_order - DOWN');
  db.exec('BEGIN TRANSACTION');

  try {
    db.exec('DROP INDEX IF EXISTS idx_releases_sort');
    console.log('  ⚠️  Column releases.sort_order not removed (SQLite limitation)');

    db.exec('COMMIT');
    console.log('✅ Migration 072_release_sort_order rollback completed');
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 072_release_sort_order rollback failed:', error);
    throw error;
  }
};
