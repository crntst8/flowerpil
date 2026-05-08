// Migration: spotify_imports table for curator Spotify import email collection
export const up = (db) => {
  console.log('Creating spotify_imports table...');

  db.exec(`
    CREATE TABLE IF NOT EXISTS spotify_imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      curator_id INTEGER NOT NULL,
      spotify_email TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'not_added' CHECK (status IN ('not_added', 'added')),
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (curator_id) REFERENCES curators(id) ON DELETE CASCADE
    )
  `);

  console.log('Creating indexes...');

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_spotify_imports_curator_id
    ON spotify_imports(curator_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_spotify_imports_status
    ON spotify_imports(status)
  `);

  console.log('Creating update trigger...');

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_spotify_imports_updated_at
    AFTER UPDATE ON spotify_imports
    FOR EACH ROW
    BEGIN
      UPDATE spotify_imports SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
    END
  `);

  console.log('spotify_imports table created successfully');
};

export const down = (db) => {
  console.log('Rolling back spotify_imports table...');
  db.exec(`DROP TRIGGER IF EXISTS trg_spotify_imports_updated_at`);
  db.exec(`DROP INDEX IF EXISTS idx_spotify_imports_status`);
  db.exec(`DROP INDEX IF EXISTS idx_spotify_imports_curator_id`);
  db.exec(`DROP TABLE IF EXISTS spotify_imports`);
  console.log('spotify_imports table rolled back');
};
