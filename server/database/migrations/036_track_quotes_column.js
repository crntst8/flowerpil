// Migration: add quote column to tracks
export const up = (db) => {
  try {
    db.exec(`ALTER TABLE tracks ADD COLUMN quote TEXT;`);
  } catch (e) {
    // ignore if column exists
  }
};

export const down = (_db) => {
  // No-op: SQLite cannot easily drop columns
};

