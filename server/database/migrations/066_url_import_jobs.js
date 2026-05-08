export async function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS url_import_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_curator_id INTEGER NOT NULL,
      target_playlist_id INTEGER,
      kind TEXT NOT NULL CHECK (kind IN ('playlist','track')),
      source_platform TEXT NOT NULL,
      source_url TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'append' CHECK (mode IN ('append','replace')),
      append_position TEXT NOT NULL DEFAULT 'bottom' CHECK (append_position IN ('top','bottom')),
      update_metadata BOOLEAN NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending','resolving','matching','saving','completed','failed','cancelled')
      ),
      total_items INTEGER DEFAULT 0,
      processed_items INTEGER DEFAULT 0,
      result_json TEXT,
      last_error TEXT,
      error_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      started_at DATETIME,
      completed_at DATETIME,
      FOREIGN KEY (owner_curator_id) REFERENCES curators(id) ON DELETE CASCADE,
      FOREIGN KEY (target_playlist_id) REFERENCES playlists(id) ON DELETE SET NULL
    );
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_url_import_jobs_owner ON url_import_jobs(owner_curator_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_url_import_jobs_status ON url_import_jobs(status);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_url_import_jobs_created ON url_import_jobs(created_at DESC);`);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS update_url_import_jobs_timestamp
    AFTER UPDATE ON url_import_jobs
    BEGIN
      UPDATE url_import_jobs
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = NEW.id;
    END;
  `);
}

export async function down(db) {
  db.exec('DROP TRIGGER IF EXISTS update_url_import_jobs_timestamp;');
  db.exec('DROP INDEX IF EXISTS idx_url_import_jobs_created;');
  db.exec('DROP INDEX IF EXISTS idx_url_import_jobs_status;');
  db.exec('DROP INDEX IF EXISTS idx_url_import_jobs_owner;');
  db.exec('DROP TABLE IF EXISTS url_import_jobs;');
}

