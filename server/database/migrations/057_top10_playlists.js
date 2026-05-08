export async function up(db) {
  console.log('🎵 Creating top10_playlists and view_tracking tables...');

  // Create top10_playlists table
  db.exec(`
    CREATE TABLE IF NOT EXISTS top10_playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL DEFAULT 'My Top 10 of 2025',
      description TEXT,
      cover_image_url TEXT,
      tracks JSON NOT NULL DEFAULT '[]',
      is_published INTEGER DEFAULT 0,
      published_at DATETIME,
      slug TEXT UNIQUE,
      spotify_export_url TEXT,
      apple_export_url TEXT,
      tidal_export_url TEXT,
      export_requested_at DATETIME,
      export_completed_at DATETIME,
      view_count INTEGER DEFAULT 0,
      share_count INTEGER DEFAULT 0,
      featured INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Create indexes for top10_playlists
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_top10_user_id
    ON top10_playlists(user_id);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_top10_slug
    ON top10_playlists(slug);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_top10_published
    ON top10_playlists(is_published, published_at DESC);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_top10_featured
    ON top10_playlists(featured, published_at DESC);
  `);

  // Create trigger to update updated_at timestamp
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS update_top10_playlists_timestamp
    AFTER UPDATE ON top10_playlists
    BEGIN
      UPDATE top10_playlists
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = NEW.id;
    END;
  `);

  // Create view_tracking table for rate-limited view counting
  db.exec(`
    CREATE TABLE IF NOT EXISTS view_tracking (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      top10_id INTEGER NOT NULL,
      ip_hash TEXT NOT NULL,
      viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (top10_id) REFERENCES top10_playlists(id) ON DELETE CASCADE
    );
  `);

  // Create index for view tracking (composite index for efficient lookups)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_view_tracking_top10_ip
    ON view_tracking(top10_id, ip_hash, viewed_at);
  `);

  console.log('✅ top10_playlists and view_tracking tables created successfully');
}

export async function down(db) {
  console.log('🔄 Dropping top10_playlists and view_tracking tables...');

  // Drop trigger first
  db.exec('DROP TRIGGER IF EXISTS update_top10_playlists_timestamp;');

  // Drop indexes
  db.exec('DROP INDEX IF EXISTS idx_top10_user_id;');
  db.exec('DROP INDEX IF EXISTS idx_top10_slug;');
  db.exec('DROP INDEX IF EXISTS idx_top10_published;');
  db.exec('DROP INDEX IF EXISTS idx_top10_featured;');
  db.exec('DROP INDEX IF EXISTS idx_view_tracking_top10_ip;');

  // Drop tables
  db.exec('DROP TABLE IF EXISTS view_tracking;');
  db.exec('DROP TABLE IF EXISTS top10_playlists;');

  console.log('✅ top10_playlists and view_tracking tables dropped successfully');
}
