// Migration: playlist import schedules table
export const up = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS playlist_import_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playlist_id INTEGER NOT NULL,
      source TEXT NOT NULL DEFAULT 'spotify',
      mode TEXT NOT NULL DEFAULT 'append',
      wip_spotify_playlist_id TEXT,
      frequency TEXT NOT NULL,
      frequency_value TEXT,
      time_utc TEXT NOT NULL,
      next_run_at DATETIME,
      last_run_at DATETIME,
      status TEXT DEFAULT 'active',
      owner_curator_id INTEGER,
      lock_owner TEXT,
      lock_expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(playlist_id),
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
    );
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_import_schedules_next_run ON playlist_import_schedules(next_run_at);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_import_schedules_owner ON playlist_import_schedules(owner_curator_id);`);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_playlist_import_schedules_updated_at 
    AFTER UPDATE ON playlist_import_schedules 
    BEGIN 
      UPDATE playlist_import_schedules SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; 
    END;
  `);
};

export const down = (db) => {
  db.exec(`DROP TRIGGER IF EXISTS trg_playlist_import_schedules_updated_at;`);
  db.exec(`DROP INDEX IF EXISTS idx_import_schedules_owner;`);
  db.exec(`DROP INDEX IF EXISTS idx_import_schedules_next_run;`);
  db.exec(`DROP TABLE IF EXISTS playlist_import_schedules;`);
};

