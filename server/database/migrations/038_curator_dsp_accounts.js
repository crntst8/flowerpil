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
    `CREATE TABLE IF NOT EXISTS curator_dsp_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      curator_id INTEGER NOT NULL,
      platform TEXT NOT NULL CHECK (platform IN ('spotify','apple','tidal')),
      email TEXT,
      uses_flowerpil_account BOOLEAN NOT NULL DEFAULT 0,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (curator_id) REFERENCES curators(id) ON DELETE CASCADE
    )`
  );

  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_curator_dsp_accounts_unique ON curator_dsp_accounts(curator_id, platform)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_curator_dsp_accounts_platform ON curator_dsp_accounts(platform)');
};

export const down = (database) => {
  const db = database ?? getDatabase();
  db.exec('DROP TABLE IF EXISTS curator_dsp_accounts');
};
