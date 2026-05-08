// server/database/migrations/090_announcements.js
import { getDatabase } from '../db.js';

export const up = (database) => {
  const db = database ?? getDatabase();

  // Core announcements table
  db.exec(`
    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      format TEXT NOT NULL,
      placement TEXT DEFAULT 'page_specific',
      target_pages TEXT,
      priority INTEGER DEFAULT 5,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Content variants for A/B testing
  db.exec(`
    CREATE TABLE IF NOT EXISTS announcement_content (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      announcement_id INTEGER NOT NULL,
      variant TEXT,
      blocks TEXT NOT NULL,
      header_style TEXT,
      FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE
    )
  `);

  // Schedule configuration
  db.exec(`
    CREATE TABLE IF NOT EXISTS announcement_schedule (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      announcement_id INTEGER UNIQUE NOT NULL,
      start_date DATETIME,
      end_date DATETIME,
      relative_trigger TEXT,
      relative_delay_days INTEGER,
      manual_override INTEGER DEFAULT 0,
      FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE
    )
  `);

  // Persistence rules
  db.exec(`
    CREATE TABLE IF NOT EXISTS announcement_persistence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      announcement_id INTEGER UNIQUE NOT NULL,
      show_mode TEXT DEFAULT 'once',
      max_show_count INTEGER,
      gap_hours INTEGER,
      FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE
    )
  `);

  // Targeting rules
  db.exec(`
    CREATE TABLE IF NOT EXISTS announcement_targets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      announcement_id INTEGER NOT NULL,
      target_type TEXT NOT NULL,
      target_value TEXT NOT NULL,
      FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE
    )
  `);

  // User view tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS announcement_views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      announcement_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      variant_shown TEXT,
      view_count INTEGER DEFAULT 1,
      first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      dismissed_at DATETIME,
      cta_clicked TEXT,
      dismissed_permanently INTEGER DEFAULT 0,
      FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE,
      UNIQUE(announcement_id, user_id)
    )
  `);

  // Curator tags for targeting
  db.exec(`
    CREATE TABLE IF NOT EXISTS curator_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      curator_id INTEGER NOT NULL,
      tag TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(curator_id, tag)
    )
  `);

  // Indexes
  db.exec(`CREATE INDEX IF NOT EXISTS idx_announcements_status ON announcements(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_announcement_views_user ON announcement_views(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_announcement_targets_type ON announcement_targets(target_type, target_value)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_curator_tags_curator ON curator_tags(curator_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_curator_tags_tag ON curator_tags(tag)`);
};

export const down = (database) => {
  const db = database ?? getDatabase();
  db.exec('DROP TABLE IF EXISTS curator_tags');
  db.exec('DROP TABLE IF EXISTS announcement_views');
  db.exec('DROP TABLE IF EXISTS announcement_targets');
  db.exec('DROP TABLE IF EXISTS announcement_persistence');
  db.exec('DROP TABLE IF EXISTS announcement_schedule');
  db.exec('DROP TABLE IF EXISTS announcement_content');
  db.exec('DROP TABLE IF EXISTS announcements');
};
