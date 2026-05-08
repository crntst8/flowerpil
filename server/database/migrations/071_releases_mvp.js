import { getDatabase } from '../db.js';

/**
 * Migration 071: Releases MVP
 *
 * Hard reset of the releases system. Drops all legacy release/editorial tables
 * and creates a fresh schema for EPK-style release pages.
 *
 * New features:
 * - Password-protected release pages
 * - Action row with DSP platform icons
 * - Press assets with attribution
 * - Show integration with per-release overrides
 * - Section toggles for video/images/bio/shows
 */

export const up = (database) => {
  const db = database ?? getDatabase();

  console.log('🎵 Running migration 071_releases_mvp - UP');

  db.exec('BEGIN TRANSACTION');

  try {
    // 1. Drop legacy release tables (order matters for foreign keys)
    console.log('  🗑️  Dropping legacy release tables...');

    db.exec('DROP TABLE IF EXISTS release_tracks');
    console.log('    ✅ Dropped release_tracks');

    db.exec('DROP TABLE IF EXISTS release_custom_links');
    console.log('    ✅ Dropped release_custom_links');

    db.exec('DROP TABLE IF EXISTS releases');
    console.log('    ✅ Dropped releases');

    db.exec('DROP TABLE IF EXISTS upcoming_releases');
    console.log('    ✅ Dropped upcoming_releases');

    db.exec('DROP TABLE IF EXISTS new_music');
    console.log('    ✅ Dropped new_music');

    // Drop legacy indexes that may conflict
    const legacyIndexes = [
      'idx_releases_featured',
      'idx_releases_published',
      'idx_releases_release_date',
      'idx_releases_type_system',
      'idx_releases_curator',
      'idx_releases_attribution',
      'idx_releases_artist',
      'idx_releases_display_order',
      'idx_releases_album',
      'idx_releases_genre',
      'idx_releases_artist_album',
      'idx_upcoming_releases_curator',
      'idx_upcoming_releases_date',
      'idx_upcoming_releases_sort'
    ];

    for (const idx of legacyIndexes) {
      try {
        db.exec(`DROP INDEX IF EXISTS ${idx}`);
      } catch (error) {
        // Index may not exist, continue
      }
    }
    console.log('    ✅ Dropped legacy indexes');

    // Drop legacy triggers
    db.exec('DROP TRIGGER IF EXISTS update_releases_timestamp');
    console.log('    ✅ Dropped legacy triggers');

    // 2. Create new releases table
    console.log('  📝 Creating releases table...');
    db.exec(`
      CREATE TABLE releases (
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
        show_shows INTEGER DEFAULT 1,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (curator_id) REFERENCES curators(id) ON DELETE CASCADE
      )
    `);
    console.log('    ✅ Created releases table');

    // 3. Create release_actions table (action row links)
    console.log('  📝 Creating release_actions table...');
    db.exec(`
      CREATE TABLE release_actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        release_id INTEGER NOT NULL,
        platform_key TEXT NOT NULL,
        label TEXT,
        url TEXT NOT NULL,
        icon_mode TEXT DEFAULT 'platform',
        sort_order INTEGER DEFAULT 0,
        FOREIGN KEY (release_id) REFERENCES releases(id) ON DELETE CASCADE
      )
    `);
    console.log('    ✅ Created release_actions table');

    // 4. Create release_assets table (press images, hero, clips)
    console.log('  📝 Creating release_assets table...');
    db.exec(`
      CREATE TABLE release_assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        release_id INTEGER NOT NULL,
        asset_type TEXT NOT NULL CHECK(asset_type IN ('press_image','hero_image','clip')),
        url TEXT NOT NULL,
        attribution TEXT,
        allow_download INTEGER DEFAULT 1,
        sort_order INTEGER DEFAULT 0,
        FOREIGN KEY (release_id) REFERENCES releases(id) ON DELETE CASCADE
      )
    `);
    console.log('    ✅ Created release_assets table');

    // 5. Create release_show_overrides table
    console.log('  📝 Creating release_show_overrides table...');
    db.exec(`
      CREATE TABLE release_show_overrides (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        release_id INTEGER NOT NULL,
        show_id INTEGER NOT NULL,
        is_hidden INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        FOREIGN KEY (release_id) REFERENCES releases(id) ON DELETE CASCADE,
        FOREIGN KEY (show_id) REFERENCES upcoming_shows(id) ON DELETE CASCADE,
        UNIQUE(release_id, show_id)
      )
    `);
    console.log('    ✅ Created release_show_overrides table');

    // 6. Create indexes
    console.log('  📊 Creating indexes...');
    const indexes = [
      'CREATE INDEX idx_releases_curator ON releases(curator_id)',
      'CREATE INDEX idx_releases_published ON releases(is_published, post_date)',
      'CREATE INDEX idx_releases_date ON releases(release_date)',
      'CREATE INDEX idx_releases_sort ON releases(curator_id, sort_order)',
      'CREATE INDEX idx_release_actions_release ON release_actions(release_id, sort_order)',
      'CREATE INDEX idx_release_assets_release ON release_assets(release_id, sort_order)',
      'CREATE INDEX idx_release_show_overrides_release ON release_show_overrides(release_id)',
      'CREATE INDEX idx_release_show_overrides_show ON release_show_overrides(show_id)'
    ];

    for (const indexSQL of indexes) {
      db.exec(indexSQL);
    }
    console.log('    ✅ Created indexes');

    // 7. Create timestamp trigger
    console.log('  ⚡ Creating timestamp trigger...');
    db.exec(`
      CREATE TRIGGER update_releases_timestamp
      AFTER UPDATE ON releases
      BEGIN
        UPDATE releases SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END
    `);
    console.log('    ✅ Created timestamp trigger');

    db.exec('COMMIT');

    console.log('');
    console.log('✨ Migration 071_releases_mvp completed successfully!');
    console.log('');
    console.log('New releases schema ready:');
    console.log('  - releases: Core release metadata with password protection');
    console.log('  - release_actions: DSP platform links for action row');
    console.log('  - release_assets: Press images and hero artwork');
    console.log('  - release_show_overrides: Per-release show visibility');
    console.log('');

  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 071_releases_mvp failed:', error);
    throw error;
  }
};

export const down = (database) => {
  const db = database ?? getDatabase();

  console.log('🔄 Running migration 071_releases_mvp - DOWN');

  db.exec('BEGIN TRANSACTION');

  try {
    // Drop trigger
    console.log('  🔄 Dropping triggers...');
    db.exec('DROP TRIGGER IF EXISTS update_releases_timestamp');

    // Drop indexes
    console.log('  🔄 Dropping indexes...');
    const dropIndexes = [
      'DROP INDEX IF EXISTS idx_releases_curator',
      'DROP INDEX IF EXISTS idx_releases_published',
      'DROP INDEX IF EXISTS idx_releases_date',
      'DROP INDEX IF EXISTS idx_releases_sort',
      'DROP INDEX IF EXISTS idx_release_actions_release',
      'DROP INDEX IF EXISTS idx_release_assets_release',
      'DROP INDEX IF EXISTS idx_release_show_overrides_release',
      'DROP INDEX IF EXISTS idx_release_show_overrides_show'
    ];

    for (const dropSQL of dropIndexes) {
      db.exec(dropSQL);
    }

    // Drop tables (order matters for foreign keys)
    console.log('  🔄 Dropping tables...');
    db.exec('DROP TABLE IF EXISTS release_show_overrides');
    db.exec('DROP TABLE IF EXISTS release_assets');
    db.exec('DROP TABLE IF EXISTS release_actions');
    db.exec('DROP TABLE IF EXISTS releases');

    // Note: We don't recreate the legacy tables in down()
    // This is a hard reset - legacy data should be backed up before running
    console.log('  ⚠️  Legacy tables (releases, upcoming_releases, new_music) were not restored');
    console.log('  ⚠️  This migration is a hard reset - restore from backup if needed');

    db.exec('COMMIT');
    console.log('✅ Migration 071_releases_mvp rollback completed');

  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 071_releases_mvp rollback failed:', error);
    throw error;
  }
};
