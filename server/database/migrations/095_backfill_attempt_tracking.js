// Migration: Add backfill attempt tracking fields to tracks table
// Description: Track failed linking/preview attempts to prevent infinite retry loops

export const up = async (db) => {
  console.log('Running migration 095_backfill_attempt_tracking - UP');

  // Add cross-link failure tracking
  await db.exec(`
    ALTER TABLE tracks ADD COLUMN linking_attempts INTEGER DEFAULT 0;
  `);
  await db.exec(`
    ALTER TABLE tracks ADD COLUMN linking_last_attempt DATETIME;
  `);

  // Add preview failure tracking
  await db.exec(`
    ALTER TABLE tracks ADD COLUMN preview_attempts INTEGER DEFAULT 0;
  `);
  await db.exec(`
    ALTER TABLE tracks ADD COLUMN preview_last_attempt DATETIME;
  `);

  console.log('Migration 095_backfill_attempt_tracking completed');
};

export const down = async (db) => {
  console.log('Running migration 095_backfill_attempt_tracking - DOWN');
  // SQLite doesn't support DROP COLUMN easily, so we leave this empty
  // These columns are safe to leave in place
  console.log('Migration 095_backfill_attempt_tracking rollback skipped (SQLite limitation)');
};
