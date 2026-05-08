// Migration: Meta pixel tables and consent records
// Description: Adds Meta OAuth approval flag, Meta account tables, ads table, event queue, and consent records

export const up = async (db) => {
  console.log('Running migration 097_meta_pixel_tables - UP');

  try {
    await db.exec(`
      ALTER TABLE curators ADD COLUMN meta_oauth_approved INTEGER DEFAULT 0;
    `);
  } catch (error) {
    console.log('Column curators.meta_oauth_approved already exists, skipping');
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS curator_meta_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      curator_id INTEGER NOT NULL,
      meta_user_id TEXT NOT NULL,
      business_id TEXT,
      ad_account_id TEXT,
      page_id TEXT,
      pixel_id TEXT,
      token_id INTEGER NOT NULL,
      is_active INTEGER DEFAULT 1,
      last_synced_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (curator_id) REFERENCES curators(id) ON DELETE CASCADE,
      FOREIGN KEY (token_id) REFERENCES export_oauth_tokens(id) ON DELETE CASCADE
    );
  `);

  await db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_meta_accounts_active
      ON curator_meta_accounts(curator_id, is_active)
      WHERE is_active = 1;
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS meta_ads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      curator_id INTEGER NOT NULL,
      playlist_id INTEGER NOT NULL,
      ad_account_id TEXT NOT NULL,
      campaign_id TEXT NOT NULL,
      adset_id TEXT NOT NULL,
      ad_id TEXT NOT NULL,
      creative_id TEXT,
      status TEXT DEFAULT 'unknown',
      budget_cents INTEGER,
      metadata_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (curator_id) REFERENCES curators(id) ON DELETE CASCADE,
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS meta_event_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pixel_id TEXT NOT NULL,
      event_name TEXT NOT NULL,
      event_time INTEGER NOT NULL,
      event_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      attempt_count INTEGER DEFAULT 0,
      next_attempt_at DATETIME,
      last_error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_meta_event_queue_status
      ON meta_event_queue(status, next_attempt_at);
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS consent_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      session_id TEXT NOT NULL,
      consent_type TEXT NOT NULL,
      status TEXT NOT NULL,
      policy_version TEXT NOT NULL,
      source TEXT,
      last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_consent_records_user
      ON consent_records(user_id, consent_type);
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_consent_records_session
      ON consent_records(session_id, consent_type);
  `);

  console.log('Migration 097_meta_pixel_tables completed');
};

export const down = async (db) => {
  console.log('Running migration 097_meta_pixel_tables - DOWN');

  await db.exec('DROP TABLE IF EXISTS meta_event_queue;');
  await db.exec('DROP TABLE IF EXISTS meta_ads;');
  await db.exec('DROP TABLE IF EXISTS curator_meta_accounts;');
  await db.exec('DROP TABLE IF EXISTS consent_records;');

  console.log('Migration 097_meta_pixel_tables rollback completed (meta_oauth_approved retained)');
};
