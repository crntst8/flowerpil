import { getDatabase } from '../db.js';

export const up = (database) => {
  const db = database ?? getDatabase();

  // Create end_scroll_config table
  db.exec(`
    CREATE TABLE IF NOT EXISTS end_scroll_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playlist_id INTEGER,
      tag_id INTEGER,
      enabled BOOLEAN DEFAULT 1,
      cta_text TEXT DEFAULT 'Explore More Playlists',
      variant_a_cta TEXT,
      variant_b_cta TEXT,
      ab_testing_enabled BOOLEAN DEFAULT 0,
      manual_playlist_ids TEXT,
      sort_order TEXT DEFAULT 'recent',
      max_playlists INTEGER DEFAULT 10,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES custom_playlist_flags(id) ON DELETE CASCADE
    )
  `);

  // Create indexes for end_scroll_config
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_end_scroll_playlist
    ON end_scroll_config(playlist_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_end_scroll_tag
    ON end_scroll_config(tag_id)
  `);

  // Create end_scroll_analytics table
  db.exec(`
    CREATE TABLE IF NOT EXISTS end_scroll_analytics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playlist_id INTEGER NOT NULL,
      variant TEXT NOT NULL,
      event_type TEXT NOT NULL,
      clicked_playlist_id INTEGER,
      user_fingerprint TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (playlist_id) REFERENCES playlists(id),
      FOREIGN KEY (clicked_playlist_id) REFERENCES playlists(id)
    )
  `);

  // Create indexes for end_scroll_analytics
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_end_scroll_analytics_variant
    ON end_scroll_analytics(variant)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_end_scroll_analytics_playlist
    ON end_scroll_analytics(playlist_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_end_scroll_analytics_created_at
    ON end_scroll_analytics(created_at)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_end_scroll_analytics_event_type
    ON end_scroll_analytics(event_type)
  `);
};

export const down = (database) => {
  const db = database ?? getDatabase();

  db.exec('DROP TABLE IF EXISTS end_scroll_analytics');
  db.exec('DROP TABLE IF EXISTS end_scroll_config');
};
