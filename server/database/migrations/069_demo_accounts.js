/**
 * Demo Accounts and Activity Tracking
 * Adds demo account visibility flag to curators and a table for demo usage telemetry.
 */

import { getDatabase } from '../db.js';

export const up = () => {
  const db = getDatabase();
  console.log('Running migration 069_demo_accounts');

  db.exec('BEGIN');

  try {
    db.exec(`
      ALTER TABLE curators
      ADD COLUMN is_demo INTEGER DEFAULT 0
    `);
  } catch (error) {
    if (!String(error?.message || '').includes('duplicate column name')) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS demo_account_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      curator_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      session_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      path TEXT,
      from_path TEXT,
      duration_ms INTEGER,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(curator_id) REFERENCES curators(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES admin_users(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_demo_activity_curator_time
      ON demo_account_activity(curator_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_demo_activity_session
      ON demo_account_activity(session_id);
  `);

  db.exec('COMMIT');
};

export const down = () => {
  const db = getDatabase();
  console.log('Rolling back migration 069_demo_accounts');

  db.exec('BEGIN');
  db.exec('DROP TABLE IF EXISTS demo_account_activity');
  db.exec('COMMIT');
};
