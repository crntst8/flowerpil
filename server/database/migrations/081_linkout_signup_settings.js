import { getDatabase } from '../db.js';

export const up = (database) => {
  const db = database ?? getDatabase();

  db.exec('BEGIN TRANSACTION');

  try {
    try {
      db.exec('ALTER TABLE linkout_config ADD COLUMN signup_mode TEXT DEFAULT "link"');
    } catch (error) {
      if (!String(error?.message || '').includes('duplicate column name')) {
        throw error;
      }
    }

    try {
      db.exec('ALTER TABLE linkout_config ADD COLUMN target_playlist_id INTEGER');
    } catch (error) {
      if (!String(error?.message || '').includes('duplicate column name')) {
        throw error;
      }
    }

    db.exec(`
      UPDATE linkout_config
      SET signup_mode = COALESCE(signup_mode, 'link')
    `);

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
};

export const down = (database) => {
  const db = database ?? getDatabase();
  db.exec('BEGIN TRANSACTION');

  try {
    // SQLite cannot drop columns; leave as-is.
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
};
