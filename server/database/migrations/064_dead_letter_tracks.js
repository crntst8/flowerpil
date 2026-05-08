// Migration: Dead-letter tracking for stalled linking jobs
// Adds linking_max_age_exceeded flag and supporting index for dead-letter queue

export const up = (db) => {
  console.log('Running migration 064_dead_letter_tracks - UP');

  db.exec('BEGIN TRANSACTION');

  try {
    try {
      console.log('  Adding linking_max_age_exceeded column to tracks...');
      db.exec(`ALTER TABLE tracks ADD COLUMN linking_max_age_exceeded BOOLEAN DEFAULT 0;`);
    } catch (error) {
      const message = String(error?.message || '').toLowerCase();
      if (!message.includes('duplicate column name')) {
        throw error;
      }
      console.log('  Column linking_max_age_exceeded already exists, skipping add');
    }

    console.log('  Creating dead-letter index on tracks...');
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tracks_linking_deadletter ON tracks(linking_max_age_exceeded, linking_updated_at);`);

    db.exec('COMMIT');
    console.log('Migration 064_dead_letter_tracks completed successfully');
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('Migration 064_dead_letter_tracks failed:', error);
    throw error;
  }
};

export const down = (db) => {
  console.log('Running migration 064_dead_letter_tracks - DOWN');

  db.exec('BEGIN TRANSACTION');

  try {
    db.exec('DROP INDEX IF EXISTS idx_tracks_linking_deadletter;');

    try {
      db.exec(`UPDATE tracks SET linking_max_age_exceeded = 0;`);
    } catch (error) {
      const message = String(error?.message || '').toLowerCase();
      if (!message.includes('no such column')) {
        throw error;
      }
      console.log('  Column linking_max_age_exceeded missing, nothing to reset');
    }

    db.exec('COMMIT');
    console.log('Migration 064_dead_letter_tracks rollback completed');
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('Migration 064_dead_letter_tracks rollback failed:', error);
    throw error;
  }
};
