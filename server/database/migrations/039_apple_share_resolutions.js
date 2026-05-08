import { getDatabase } from '../db.js';

const ensureTable = (db, ddl) => {
  try {
    db.exec(ddl);
  } catch (error) {
    const message = String(error?.message || '').toLowerCase();
    if (!message.includes('already exists')) {
      throw error;
    }
  }
};

export const up = (database) => {
  const db = database ?? getDatabase();

  ensureTable(
    db,
    `CREATE TABLE IF NOT EXISTS apple_share_resolutions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playlist_id INTEGER NOT NULL,
      apple_library_id TEXT NOT NULL,
      apple_storefront TEXT NOT NULL DEFAULT 'us',
      playlist_title TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolving','waiting_auth','resolved','failed')),
      attempt_count INTEGER NOT NULL DEFAULT 0,
      last_attempted_at DATETIME,
      next_attempt_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_url TEXT,
      error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
    )`
  );

  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_apple_share_resolutions_playlist ON apple_share_resolutions(playlist_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_apple_share_resolutions_status ON apple_share_resolutions(status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_apple_share_resolutions_next_attempt ON apple_share_resolutions(next_attempt_at)');

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_apple_share_resolutions_updated
    AFTER UPDATE ON apple_share_resolutions
    BEGIN
      UPDATE apple_share_resolutions
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = NEW.id;
    END;
  `);
};

export const down = (database) => {
  const db = database ?? getDatabase();

  db.exec('DROP TRIGGER IF EXISTS trg_apple_share_resolutions_updated');
  db.exec('DROP TABLE IF EXISTS apple_share_resolutions');
};
