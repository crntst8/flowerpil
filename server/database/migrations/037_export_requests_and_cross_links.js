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
    `CREATE TABLE IF NOT EXISTS export_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playlist_id INTEGER NOT NULL,
      requested_by TEXT NOT NULL DEFAULT 'curator' CHECK (requested_by IN ('curator','system')),
      destinations TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','auth_required','in_progress','completed','failed','confirmed')),
      results TEXT,
      last_error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
    )`
  );

  db.exec('CREATE INDEX IF NOT EXISTS idx_export_requests_playlist_id ON export_requests(playlist_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_export_requests_status ON export_requests(status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_export_requests_created_at ON export_requests(created_at DESC)');

  ensureTable(
    db,
    `CREATE TABLE IF NOT EXISTS cross_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      track_id INTEGER NOT NULL,
      platform TEXT NOT NULL,
      url TEXT NOT NULL,
      confidence REAL,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
    )`
  );

  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_cross_links_track_platform ON cross_links(track_id, platform)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_cross_links_platform ON cross_links(platform)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_cross_links_confidence ON cross_links(confidence)');
};

export const down = (database) => {
  const db = database ?? getDatabase();

  db.exec('DROP TABLE IF EXISTS cross_links');
  db.exec('DROP TABLE IF EXISTS export_requests');
};
