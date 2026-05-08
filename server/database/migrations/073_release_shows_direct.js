import { getDatabase } from '../db.js';

/**
 * Migration 073: Release Shows Direct
 *
 * Restructures shows for releases:
 * - Drops release_show_overrides (legacy linking to upcoming_shows)
 * - Drops show_shows column from releases
 * - Creates release_shows table for direct per-release show entries
 *
 * Shows are now entered directly on releases (manual, list import, or CSV).
 * Future: shows can be stored and reused, but for now they're per-release.
 */

export const up = (database) => {
  const db = database ?? getDatabase();

  console.log('Running migration 073_release_shows_direct - UP');

  db.exec('BEGIN TRANSACTION');

  try {
    // 1. Drop legacy release_show_overrides table
    console.log('  Dropping release_show_overrides table...');
    db.exec('DROP TABLE IF EXISTS release_show_overrides');
    db.exec('DROP INDEX IF EXISTS idx_release_show_overrides_release');
    db.exec('DROP INDEX IF EXISTS idx_release_show_overrides_show');
    console.log('    Dropped release_show_overrides');

    // 2. Remove show_shows column from releases
    // SQLite doesn't support DROP COLUMN directly, need to recreate table
    console.log('  Removing show_shows column from releases...');

    // Check if column exists
    const tableInfo = db.prepare("PRAGMA table_info(releases)").all();
    const hasShowShows = tableInfo.some(col => col.name === 'show_shows');

    if (hasShowShows) {
      // Create new table without show_shows
      db.exec(`
        CREATE TABLE releases_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          curator_id INTEGER NOT NULL,
          artist_name TEXT NOT NULL,
          title TEXT NOT NULL,
          release_type TEXT CHECK(release_type IN ('single','double-single','EP','album','live album','remix','remaster')) DEFAULT 'single',
          release_date TEXT,
          post_date TEXT,
          genres TEXT,
          description TEXT,
          video_url TEXT,
          artwork_url TEXT,
          is_published INTEGER DEFAULT 0,
          password_hash TEXT,
          artist_bio_topline TEXT,
          artist_bio_subtext TEXT,
          artist_bio_image_url TEXT,
          show_video INTEGER DEFAULT 1,
          show_images INTEGER DEFAULT 1,
          show_about INTEGER DEFAULT 1,
          sort_order INTEGER DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (curator_id) REFERENCES curators(id) ON DELETE CASCADE
        )
      `);

      // Copy data
      db.exec(`
        INSERT INTO releases_new (
          id, curator_id, artist_name, title, release_type, release_date, post_date,
          genres, description, video_url, artwork_url, is_published, password_hash,
          artist_bio_topline, artist_bio_subtext, artist_bio_image_url,
          show_video, show_images, show_about, sort_order, created_at, updated_at
        )
        SELECT
          id, curator_id, artist_name, title, release_type, release_date, post_date,
          genres, description, video_url, artwork_url, is_published, password_hash,
          artist_bio_topline, artist_bio_subtext, artist_bio_image_url,
          show_video, show_images, show_about, sort_order, created_at, updated_at
        FROM releases
      `);

      // Drop old table and rename new
      db.exec('DROP TABLE releases');
      db.exec('ALTER TABLE releases_new RENAME TO releases');

      // Recreate indexes
      db.exec('CREATE INDEX idx_releases_curator ON releases(curator_id)');
      db.exec('CREATE INDEX idx_releases_published ON releases(is_published, post_date)');
      db.exec('CREATE INDEX idx_releases_date ON releases(release_date)');
      db.exec('CREATE INDEX idx_releases_sort ON releases(curator_id, sort_order)');

      // Recreate trigger
      db.exec(`
        CREATE TRIGGER update_releases_timestamp
        AFTER UPDATE ON releases
        BEGIN
          UPDATE releases SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
        END
      `);

      console.log('    Removed show_shows column');
    } else {
      console.log('    show_shows column not present, skipping');
    }

    // 3. Create release_shows table for direct per-release shows
    console.log('  Creating release_shows table...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS release_shows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        release_id INTEGER NOT NULL,
        show_date TEXT NOT NULL,
        venue TEXT,
        city TEXT,
        country TEXT,
        ticket_url TEXT,
        notes TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (release_id) REFERENCES releases(id) ON DELETE CASCADE
      )
    `);
    console.log('    Created release_shows table');

    // 4. Create indexes
    console.log('  Creating indexes...');
    db.exec('CREATE INDEX IF NOT EXISTS idx_release_shows_release ON release_shows(release_id, sort_order)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_release_shows_date ON release_shows(show_date)');
    console.log('    Created indexes');

    db.exec('COMMIT');

    console.log('');
    console.log('Migration 073_release_shows_direct completed successfully!');
    console.log('');
    console.log('Changes:');
    console.log('  - Dropped release_show_overrides table');
    console.log('  - Removed show_shows column from releases');
    console.log('  - Created release_shows table for direct show entries');
    console.log('');

  } catch (error) {
    db.exec('ROLLBACK');
    console.error('Migration 073_release_shows_direct failed:', error);
    throw error;
  }
};

export const down = (database) => {
  const db = database ?? getDatabase();

  console.log('Running migration 073_release_shows_direct - DOWN');

  db.exec('BEGIN TRANSACTION');

  try {
    // Drop new table
    console.log('  Dropping release_shows table...');
    db.exec('DROP TABLE IF EXISTS release_shows');
    db.exec('DROP INDEX IF EXISTS idx_release_shows_release');
    db.exec('DROP INDEX IF EXISTS idx_release_shows_date');

    // Note: We don't restore show_shows or release_show_overrides
    // This is a forward-only migration for the new design
    console.log('  Note: show_shows column and release_show_overrides table not restored');

    db.exec('COMMIT');
    console.log('Migration 073_release_shows_direct rollback completed');

  } catch (error) {
    db.exec('ROLLBACK');
    console.error('Migration 073_release_shows_direct rollback failed:', error);
    throw error;
  }
};
