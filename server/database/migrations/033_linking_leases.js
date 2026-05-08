import { getDatabase } from '../db.js';

/**
 * Migration: Add leasing fields for distributed cross-linking workers
 * - Adds linking_lease_owner (TEXT)
 * - Adds linking_lease_expires (DATETIME)
 * - Adds composite index on (linking_status, linking_lease_expires)
 */
export const up = () => {
  const db = getDatabase();

  console.log('🔄 Running migration: Add linking lease columns');

  try {
    db.exec('BEGIN');

    const alterStatements = [
      "ALTER TABLE tracks ADD COLUMN linking_lease_owner TEXT",
      "ALTER TABLE tracks ADD COLUMN linking_lease_expires DATETIME"
    ];

    alterStatements.forEach((stmt) => {
      try {
        db.exec(stmt);
        console.log(`✅ ${stmt}`);
      } catch (error) {
        if (!String(error?.message || '').includes('duplicate column name')) {
          throw error;
        }
        console.log(`⚠️  Column already exists: ${stmt}`);
      }
    });

    // Index to speed up leasing queries
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_tracks_linking_lease ON tracks(linking_status, linking_lease_expires)'
    );
    console.log('📊 Created index idx_tracks_linking_lease');

    db.exec('COMMIT');
    console.log('✅ Migration completed: Linking lease columns added');
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  }
};

/**
 * Down: Best-effort rollback (SQLite cannot DROP COLUMN)
 * - Drops index
 * - Clears lease fields to null (no-op if missing)
 */
export const down = () => {
  const db = getDatabase();
  console.log('🔄 Rolling back migration: Linking lease columns');
  try {
    db.exec('BEGIN');
    db.exec('DROP INDEX IF EXISTS idx_tracks_linking_lease');
    try {
      db.exec("UPDATE tracks SET linking_lease_owner = NULL, linking_lease_expires = NULL");
    } catch {}
    db.exec('COMMIT');
    console.log('✅ Rollback completed: Index dropped, fields cleared');
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Rollback failed:', error);
    throw error;
  }
};

