import { getDatabase } from '../db.js';

/**
 * Migration: Add retry tracking for cross-platform linking
 * - Adds linking_retry_count (INTEGER DEFAULT 0)
 * - Adds linking_last_retry_at (DATETIME)
 *
 * Purpose: Enable automatic retry of rate-limited (429) and transient failures
 * with max retry limit (default 3 attempts)
 */
export const up = () => {
  const db = getDatabase();

  console.log('🔄 Running migration: Add linking retry tracking columns');

  try {
    db.exec('BEGIN');

    const alterStatements = [
      "ALTER TABLE tracks ADD COLUMN linking_retry_count INTEGER DEFAULT 0",
      "ALTER TABLE tracks ADD COLUMN linking_last_retry_at DATETIME"
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

    // Initialize retry count to 0 for existing tracks
    db.exec("UPDATE tracks SET linking_retry_count = 0 WHERE linking_retry_count IS NULL");
    console.log('✅ Initialized retry count for existing tracks');

    db.exec('COMMIT');
    console.log('✅ Migration completed: Linking retry tracking columns added');
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  }
};

/**
 * Down: Best-effort rollback (SQLite cannot DROP COLUMN)
 * - Clears retry fields to null/0 (no-op if missing)
 */
export const down = () => {
  const db = getDatabase();
  console.log('🔄 Rolling back migration: Linking retry tracking columns');
  try {
    db.exec('BEGIN');
    try {
      db.exec("UPDATE tracks SET linking_retry_count = 0, linking_last_retry_at = NULL");
    } catch {}
    db.exec('COMMIT');
    console.log('✅ Rollback completed: Retry fields cleared');
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Rollback failed:', error);
    throw error;
  }
};
