/**
 * Migration: Add linking_progress column to top10_playlists
 * Tracks real-time progress of cross-platform linking for Top 10 playlists
 */

export const up = (db) => {
  db.exec(`
    ALTER TABLE top10_playlists
    ADD COLUMN linking_progress TEXT DEFAULT NULL;
  `);
};

export const down = (db) => {
  // SQLite doesn't support DROP COLUMN directly in older versions
  // Create new table without the column, copy data, rename
  db.exec(`
    CREATE TABLE top10_playlists_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL DEFAULT 'My Top 10 of 2025',
      description TEXT,
      cover_image_url TEXT,
      tracks TEXT NOT NULL DEFAULT '[]',
      is_published INTEGER DEFAULT 0,
      published_at TEXT,
      slug TEXT UNIQUE,
      view_count INTEGER DEFAULT 0,
      share_count INTEGER DEFAULT 0,
      featured INTEGER DEFAULT 0,
      spotify_export_url TEXT,
      apple_export_url TEXT,
      tidal_export_url TEXT,
      export_requested_at TEXT,
      export_completed_at TEXT,
      numbering_preference TEXT DEFAULT 'desc',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    INSERT INTO top10_playlists_new
    SELECT
      id, user_id, title, description, cover_image_url, tracks,
      is_published, published_at, slug, view_count, share_count, featured,
      spotify_export_url, apple_export_url, tidal_export_url,
      export_requested_at, export_completed_at, numbering_preference,
      created_at, updated_at
    FROM top10_playlists;

    DROP TABLE top10_playlists;
    ALTER TABLE top10_playlists_new RENAME TO top10_playlists;

    -- Recreate indexes
    CREATE INDEX IF NOT EXISTS idx_top10_user_id ON top10_playlists(user_id);
    CREATE INDEX IF NOT EXISTS idx_top10_slug ON top10_playlists(slug);
    CREATE INDEX IF NOT EXISTS idx_top10_published ON top10_playlists(is_published, published_at DESC);
  `);
};
