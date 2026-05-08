// Migration: Add auto_referral_enabled to playlists table
// Date: 2025-09-01
// Description: Allow per-playlist auto-referral toggle for curator signup CTA

export const up = (db) => {
  console.log('Running migration 080_playlist_auto_referral - UP');

  db.exec('BEGIN TRANSACTION');

  try {
    console.log('  Adding auto_referral_enabled column to playlists table...');
    try {
      db.exec('ALTER TABLE playlists ADD COLUMN auto_referral_enabled INTEGER DEFAULT 0');
      console.log('  auto_referral_enabled column added successfully');
    } catch (error) {
      if (error.message.includes('duplicate column name')) {
        console.log('  auto_referral_enabled column already exists, skipping...');
      } else {
        throw error;
      }
    }

    db.exec('COMMIT');
    console.log('Migration 080_playlist_auto_referral completed successfully');
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('Migration 080_playlist_auto_referral failed:', error);
    throw error;
  }
};

export const down = (db) => {
  console.log('Running migration 080_playlist_auto_referral - DOWN');

  db.exec('BEGIN TRANSACTION');

  try {
    console.log('  Note: SQLite cannot drop columns; auto_referral_enabled will remain.');
    db.exec('COMMIT');
    console.log('Migration 080_playlist_auto_referral rollback completed');
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('Migration 080_playlist_auto_referral rollback failed:', error);
    throw error;
  }
};
