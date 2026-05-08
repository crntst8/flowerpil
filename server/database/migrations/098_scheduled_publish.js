// Migration: Scheduled publish support
// Description: Adds scheduled_publish_at column to playlists for deferred publishing

export const up = async (db) => {
  console.log('Running migration 098_scheduled_publish - UP');

  try {
    await db.exec(`
      ALTER TABLE playlists ADD COLUMN scheduled_publish_at DATETIME;
    `);
  } catch (error) {
    console.log('Column playlists.scheduled_publish_at already exists, skipping');
  }

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_playlists_scheduled_publish
      ON playlists(published, scheduled_publish_at);
  `);

  console.log('Migration 098_scheduled_publish completed');
};

export const down = async (db) => {
  console.log('Running migration 098_scheduled_publish - DOWN');

  await db.exec('DROP INDEX IF EXISTS idx_playlists_scheduled_publish;');

  console.log('Migration 098_scheduled_publish rollback completed (column retained)');
};
