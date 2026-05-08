import { getDatabase } from '../db.js';

export const up = (database) => {
  const db = database ?? getDatabase();

  db.exec(`
    CREATE TABLE IF NOT EXISTS qr_code_ctas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      headline TEXT NOT NULL,
      cta_link TEXT NOT NULL,
      cta_text TEXT NOT NULL,
      enabled BOOLEAN DEFAULT 0,
      target_curator_id INTEGER,
      impressions INTEGER DEFAULT 0,
      clicks INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (target_curator_id) REFERENCES curators(id)
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_qr_code_ctas_target_curator_id
    ON qr_code_ctas(target_curator_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_qr_code_ctas_enabled
    ON qr_code_ctas(enabled)
  `);
};

export const down = (database) => {
  const db = database ?? getDatabase();

  db.exec('DROP TABLE IF EXISTS qr_code_ctas');
};
