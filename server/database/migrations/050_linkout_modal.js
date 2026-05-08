import { getDatabase } from '../db.js';

export const up = (database) => {
  const db = database ?? getDatabase();

  // Create linkout_config table
  db.exec(`
    CREATE TABLE IF NOT EXISTS linkout_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      variant_a_headline TEXT NOT NULL,
      variant_a_link TEXT NOT NULL,
      variant_b_headline TEXT NOT NULL,
      variant_b_link TEXT NOT NULL,
      enabled BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Insert default config
  const existing = db.prepare('SELECT COUNT(*) as count FROM linkout_config').get();
  if (existing.count === 0) {
    db.prepare(`
      INSERT INTO linkout_config (
        variant_a_headline,
        variant_a_link,
        variant_b_headline,
        variant_b_link,
        enabled
      ) VALUES (?, ?, ?, ?, ?)
    `).run(
      'want to know when we publish new playlists?',
      'https://instagram.com/flowerpil',
      'find new music every week',
      'https://instagram.com/flowerpil',
      0
    );
  }

  // Create linkout_analytics table
  db.exec(`
    CREATE TABLE IF NOT EXISTS linkout_analytics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      variant TEXT NOT NULL,
      event_type TEXT NOT NULL,
      time_to_action INTEGER,
      user_fingerprint TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create indexes for analytics queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_linkout_analytics_event_type
    ON linkout_analytics(event_type)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_linkout_analytics_variant
    ON linkout_analytics(variant)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_linkout_analytics_created_at
    ON linkout_analytics(created_at)
  `);
};

export const down = (database) => {
  const db = database ?? getDatabase();

  db.exec('DROP TABLE IF EXISTS linkout_analytics');
  db.exec('DROP TABLE IF EXISTS linkout_config');
};
