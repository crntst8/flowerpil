// Migration: Performance indexes for exports and linking lookups
// Adds composite indexes to speed up token lookups and export status queries.

export const up = (db) => {
  console.log('Running migration 063_performance_indexes - UP');

  db.exec('BEGIN TRANSACTION');

  try {
    console.log('  Creating composite index on export_oauth_tokens (platform, account_type, owner_curator_id, is_active)...');
    db.exec(`CREATE INDEX IF NOT EXISTS idx_export_tokens_lookup ON export_oauth_tokens(platform, account_type, owner_curator_id, is_active);`);

    console.log('  Ensuring linking status index on tracks...');
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tracks_linking_status ON tracks(linking_status);`);

    console.log('  Creating composite index on export_requests (status, playlist_id)...');
    db.exec(`CREATE INDEX IF NOT EXISTS idx_export_requests_status_playlist ON export_requests(status, playlist_id);`);

    db.exec('COMMIT');
    console.log('Migration 063_performance_indexes completed successfully');
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('Migration 063_performance_indexes failed:', error);
    throw error;
  }
};

export const down = (db) => {
  console.log('Running migration 063_performance_indexes - DOWN');

  db.exec('BEGIN TRANSACTION');

  try {
    db.exec('DROP INDEX IF EXISTS idx_export_tokens_lookup;');
    db.exec('DROP INDEX IF EXISTS idx_export_requests_status_playlist;');
    // idx_tracks_linking_status is left intact because it exists in earlier migrations

    db.exec('COMMIT');
    console.log('Migration 063_performance_indexes rollback completed');
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('Migration 063_performance_indexes rollback failed:', error);
    throw error;
  }
};
