// Migration: Writing rollout, curator ownership, and feature analytics fields
// Description: Adds curator ownership + SEO/feed fields to feature_pieces and creates feature_piece_flag_assignments

const ensureFeaturePiecesBase = async (db) => {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS feature_pieces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      subtitle TEXT,
      author_name TEXT,
      curator_id INTEGER,
      excerpt TEXT,
      metadata_type TEXT DEFAULT 'Feature',
      metadata_date TEXT,
      hero_image TEXT,
      hero_image_caption TEXT,
      seo_title TEXT,
      seo_description TEXT,
      canonical_url TEXT,
      newsletter_cta_label TEXT,
      newsletter_cta_url TEXT,
      featured_on_homepage INTEGER DEFAULT 0,
      homepage_display_order INTEGER DEFAULT 0,
      view_count INTEGER DEFAULT 0,
      last_viewed_at DATETIME,
      content_blocks TEXT NOT NULL DEFAULT '[]',
      status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
      published_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (curator_id) REFERENCES curators(id) ON DELETE SET NULL
    )
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_feature_pieces_status ON feature_pieces(status);
  `);
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_feature_pieces_slug ON feature_pieces(slug);
  `);
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_feature_pieces_published_at ON feature_pieces(status, published_at DESC);
  `);

  await db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_feature_pieces_updated_at
    AFTER UPDATE ON feature_pieces
    FOR EACH ROW
    BEGIN
      UPDATE feature_pieces SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
    END
  `);
};

const addColumnIfMissing = async (db, statement) => {
  try {
    await db.exec(statement);
  } catch (error) {
    const message = String(error?.message || '').toLowerCase();
    if (!message.includes('duplicate column name')) {
      throw error;
    }
  }
};

export const up = async (db) => {
  console.log('Running migration 099_writing_rollout_and_analytics - UP');

  await ensureFeaturePiecesBase(db);

  await addColumnIfMissing(db, 'ALTER TABLE feature_pieces ADD COLUMN curator_id INTEGER');
  await addColumnIfMissing(db, 'ALTER TABLE feature_pieces ADD COLUMN excerpt TEXT');
  await addColumnIfMissing(db, 'ALTER TABLE feature_pieces ADD COLUMN seo_title TEXT');
  await addColumnIfMissing(db, 'ALTER TABLE feature_pieces ADD COLUMN seo_description TEXT');
  await addColumnIfMissing(db, 'ALTER TABLE feature_pieces ADD COLUMN canonical_url TEXT');
  await addColumnIfMissing(db, 'ALTER TABLE feature_pieces ADD COLUMN newsletter_cta_label TEXT');
  await addColumnIfMissing(db, 'ALTER TABLE feature_pieces ADD COLUMN newsletter_cta_url TEXT');
  await addColumnIfMissing(db, 'ALTER TABLE feature_pieces ADD COLUMN featured_on_homepage INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'ALTER TABLE feature_pieces ADD COLUMN homepage_display_order INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'ALTER TABLE feature_pieces ADD COLUMN view_count INTEGER DEFAULT 0');
  await addColumnIfMissing(db, 'ALTER TABLE feature_pieces ADD COLUMN last_viewed_at DATETIME');

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_feature_pieces_curator ON feature_pieces(curator_id);
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_feature_pieces_homepage
    ON feature_pieces(featured_on_homepage, homepage_display_order);
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_feature_pieces_view_count
    ON feature_pieces(view_count DESC);
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS feature_piece_flag_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feature_piece_id INTEGER NOT NULL,
      flag_id INTEGER NOT NULL,
      assigned_by INTEGER,
      assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (feature_piece_id, flag_id),
      FOREIGN KEY (feature_piece_id) REFERENCES feature_pieces(id) ON DELETE CASCADE,
      FOREIGN KEY (flag_id) REFERENCES custom_playlist_flags(id) ON DELETE CASCADE,
      FOREIGN KEY (assigned_by) REFERENCES admin_users(id)
    );
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_feature_piece_flag_assignments_piece
    ON feature_piece_flag_assignments(feature_piece_id);
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_feature_piece_flag_assignments_flag
    ON feature_piece_flag_assignments(flag_id);
  `);

  console.log('Migration 099_writing_rollout_and_analytics completed');
};

export const down = async (db) => {
  console.log('Running migration 099_writing_rollout_and_analytics - DOWN');

  await db.exec('DROP INDEX IF EXISTS idx_feature_piece_flag_assignments_flag;');
  await db.exec('DROP INDEX IF EXISTS idx_feature_piece_flag_assignments_piece;');
  await db.exec('DROP TABLE IF EXISTS feature_piece_flag_assignments;');

  await db.exec('DROP INDEX IF EXISTS idx_feature_pieces_view_count;');
  await db.exec('DROP INDEX IF EXISTS idx_feature_pieces_homepage;');
  await db.exec('DROP INDEX IF EXISTS idx_feature_pieces_curator;');

  console.log('Migration 099_writing_rollout_and_analytics rollback completed (columns retained)');
};
