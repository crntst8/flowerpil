import { getDatabase } from '../db.js';

export const up = (database) => {
  const db = database ?? getDatabase();

  // Add A/B variant columns to qr_code_ctas
  db.exec(`
    ALTER TABLE qr_code_ctas ADD COLUMN variant_a_headline TEXT;
  `);

  db.exec(`
    ALTER TABLE qr_code_ctas ADD COLUMN variant_a_link TEXT;
  `);

  db.exec(`
    ALTER TABLE qr_code_ctas ADD COLUMN variant_a_cta_text TEXT;
  `);

  db.exec(`
    ALTER TABLE qr_code_ctas ADD COLUMN variant_b_headline TEXT;
  `);

  db.exec(`
    ALTER TABLE qr_code_ctas ADD COLUMN variant_b_link TEXT;
  `);

  db.exec(`
    ALTER TABLE qr_code_ctas ADD COLUMN variant_b_cta_text TEXT;
  `);

  db.exec(`
    ALTER TABLE qr_code_ctas ADD COLUMN assignment_counter INTEGER DEFAULT 0;
  `);

  // Migrate existing data: copy current fields to variant_a
  db.exec(`
    UPDATE qr_code_ctas
    SET variant_a_headline = headline,
        variant_a_link = cta_link,
        variant_a_cta_text = cta_text,
        variant_b_headline = headline,
        variant_b_link = cta_link,
        variant_b_cta_text = cta_text
    WHERE variant_a_headline IS NULL
  `);

  // Create qr_cta_analytics table for event tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS qr_cta_analytics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cta_id INTEGER NOT NULL,
      variant TEXT NOT NULL,
      event_type TEXT NOT NULL,
      time_to_action INTEGER,
      playlist_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cta_id) REFERENCES qr_code_ctas(id) ON DELETE CASCADE
    )
  `);

  // Create indexes for analytics queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_qr_cta_analytics_cta_id
    ON qr_cta_analytics(cta_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_qr_cta_analytics_variant
    ON qr_cta_analytics(variant)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_qr_cta_analytics_event_type
    ON qr_cta_analytics(event_type)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_qr_cta_analytics_created_at
    ON qr_cta_analytics(created_at)
  `);
};

export const down = (database) => {
  const db = database ?? getDatabase();

  db.exec('DROP TABLE IF EXISTS qr_cta_analytics');

  // Note: SQLite doesn't support DROP COLUMN directly in older versions
  // The variant columns will remain but be unused if rolled back
};
