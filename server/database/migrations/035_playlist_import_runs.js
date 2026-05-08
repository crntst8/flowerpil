// Migration: playlist import runs table
export const up = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS playlist_import_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id INTEGER NOT NULL,
      playlist_id INTEGER NOT NULL,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      finished_at DATETIME,
      status TEXT NOT NULL,
      stats_json TEXT,
      error TEXT,
      FOREIGN KEY (schedule_id) REFERENCES playlist_import_schedules(id) ON DELETE CASCADE,
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_import_runs_schedule ON playlist_import_runs(schedule_id);`);
};

export const down = (db) => {
  db.exec(`DROP INDEX IF EXISTS idx_import_runs_schedule;`);
  db.exec(`DROP TABLE IF EXISTS playlist_import_runs;`);
};

