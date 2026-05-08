// server/database/migrations/091_announcements_enhancements.js
import { getDatabase } from '../db.js';

export const up = (database) => {
  const db = database ?? getDatabase();

  // Display delay in seconds (0-60)
  db.exec(`ALTER TABLE announcements ADD COLUMN display_delay INTEGER DEFAULT 0`);

  // Timestamp for "show next visit" feature - when set, all users see it once on next visit
  db.exec(`ALTER TABLE announcements ADD COLUMN show_next_visit_after DATETIME`);

  // Track push events for analytics
  db.exec(`
    CREATE TABLE IF NOT EXISTS announcement_pushes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      announcement_id INTEGER NOT NULL,
      pushed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      pushed_by INTEGER,
      target_count INTEGER DEFAULT 0,
      FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_announcement_pushes_announcement ON announcement_pushes(announcement_id)`);
};

export const down = (database) => {
  const db = database ?? getDatabase();

  // SQLite doesn't support DROP COLUMN easily, so we'll just drop the new table
  db.exec('DROP TABLE IF EXISTS announcement_pushes');

  // For the columns, we'd need to recreate the table - leaving as-is for down migration
};
