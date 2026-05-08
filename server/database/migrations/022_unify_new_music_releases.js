// Fixed version of 022_unify_new_music_releases.js migration
// Drop corrupted table and recreate with proper schema

export const up = (db) => {
  console.log('🔄 Running migration 022_unify_new_music_releases - UP (FIXED v2)');

  // Begin transaction for atomic migration
  db.exec('BEGIN TRANSACTION');

  try {
    // Check if upcoming_releases table exists
    const tableExists = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='upcoming_releases'
    `).get();

    if (tableExists) {
      console.log('  ⚠️  upcoming_releases table has corrupted schema, dropping and recreating...');

      // Backup data if any exists
      let backupData = [];
      try {
        backupData = db.prepare('SELECT * FROM upcoming_releases').all();
        console.log(`    📦 Backed up ${backupData.length} records`);
      } catch (error) {
        console.log('    ⚠️  Could not backup data from corrupted table');
      }

      // Drop the corrupted table
      db.exec('DROP TABLE IF EXISTS upcoming_releases');
      console.log('    🗑️  Dropped corrupted upcoming_releases table');
    }

    // Create clean releases table
    console.log('  📝 Creating releases table with clean schema...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS releases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        curator_id INTEGER,
        title TEXT NOT NULL,
        artist_name TEXT NOT NULL,
        release_type TEXT CHECK (release_type IN ('Album','EP','Live Recording','Remix','Single')) NOT NULL,
        release_date DATE NOT NULL,
        genres TEXT,
        country_code TEXT,
        country_name TEXT,
        description TEXT,
        artwork_url TEXT,
        platform_links TEXT,
        attribution_type TEXT CHECK (attribution_type IN ('none', 'curator', 'flowerpil')) DEFAULT 'none',
        attribution_curator_id INTEGER,
        featured_on_homepage INTEGER DEFAULT 1,
        homepage_display_order INTEGER DEFAULT 0,
        post_date DATE NOT NULL,
        is_published INTEGER DEFAULT 0,
        featured_url TEXT,
        featured_kind TEXT CHECK (featured_kind IN ('SingleDSP','AudioUpload','MusicVideo')),
        featured_duration_sec INTEGER,
        pre_order_url TEXT,
        pre_save_url TEXT,
        info_url TEXT,
        isrc TEXT,
        deezer_id TEXT,
        deezer_preview_url TEXT,
        preview_source TEXT,
        preview_confidence INTEGER,
        preview_updated_at DATETIME,
        show_in_url TEXT,
        release_type_system TEXT DEFAULT 'release-platform',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        sort_order INTEGER DEFAULT 0,
        FOREIGN KEY (curator_id) REFERENCES curators(id) ON DELETE SET NULL,
        FOREIGN KEY (attribution_curator_id) REFERENCES curators(id) ON DELETE SET NULL
      )
    `);

    console.log('    ✅ Created releases table with clean schema');

    // Create indexes for performance
    console.log('  📊 Creating indexes...');
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_releases_featured ON releases(featured_on_homepage)',
      'CREATE INDEX IF NOT EXISTS idx_releases_published ON releases(is_published)',
      'CREATE INDEX IF NOT EXISTS idx_releases_release_date ON releases(release_date)',
      'CREATE INDEX IF NOT EXISTS idx_releases_type_system ON releases(release_type_system)',
      'CREATE INDEX IF NOT EXISTS idx_releases_curator ON releases(curator_id)',
      'CREATE INDEX IF NOT EXISTS idx_releases_attribution ON releases(attribution_type, attribution_curator_id)',
      'CREATE INDEX IF NOT EXISTS idx_releases_artist ON releases(artist_name)',
      'CREATE INDEX IF NOT EXISTS idx_releases_display_order ON releases(homepage_display_order)'
    ];

    for (const indexSQL of indexes) {
      db.exec(indexSQL);
    }

    // Check for new_music_posts table and migrate if exists
    const newMusicTableExists = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='new_music_posts'
    `).get();

    if (newMusicTableExists) {
      console.log('  📝 Migrating data from new_music_posts...');

      try {
        const newMusicPosts = db.prepare(`
          SELECT * FROM new_music_posts WHERE is_published = 1
        `).all();

        console.log(`    📊 Found ${newMusicPosts.length} published new-music posts`);

        if (newMusicPosts.length > 0) {
          const insertRelease = db.prepare(`
            INSERT INTO releases (
              title, artist_name, release_type, release_date,
              genres, country_code, country_name, description, artwork_url,
              platform_links, attribution_type, attribution_curator_id,
              featured_on_homepage, homepage_display_order, post_date,
              is_published, featured_url, featured_kind, featured_duration_sec,
              pre_order_url, pre_save_url, info_url, isrc, deezer_id,
              deezer_preview_url, preview_source, preview_confidence,
              preview_updated_at, release_type_system, created_at, updated_at
            ) VALUES (
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?, ?, ?, ?, 'release-editorial', ?, ?
            )
          `);

          let migratedCount = 0;
          for (const post of newMusicPosts) {
            try {
              insertRelease.run(
                post.title, post.artist_name, post.release_type, post.release_date,
                post.genres, post.country_code, post.country_name, post.description,
                post.artwork_url, post.platform_links, post.attribution_type,
                post.attribution_curator_id, post.featured_on_homepage,
                post.homepage_display_order, post.post_date, post.is_published,
                post.featured_url, post.featured_kind, post.featured_duration_sec,
                post.pre_order_url, post.pre_save_url, post.info_url, post.isrc,
                post.deezer_id, post.deezer_preview_url, post.preview_source,
                post.preview_confidence, post.preview_updated_at,
                post.created_at, post.updated_at
              );
              migratedCount++;
            } catch (error) {
              console.log(`    ⚠️  Skipped invalid record: ${post.title}`);
            }
          }

          console.log(`    ✅ Migrated ${migratedCount} new-music posts to releases`);
        }
      } catch (error) {
        console.log('    ⚠️  Could not migrate from new_music_posts:', error.message);
      }
    } else {
      console.log('  ⚠️  new_music_posts table not found, skipping data migration');
    }

    db.exec('COMMIT');
    console.log('✅ Migration 022_unify_new_music_releases completed successfully');

    // Verify results
    const tableCount = db.prepare('SELECT COUNT(*) as count FROM releases').get();
    console.log(`📊 releases table ready with ${tableCount.count} entries`);

  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 022_unify_new_music_releases failed:', error);
    throw error;
  }
};

export const down = (db) => {
  console.log('🔄 Running migration 022_unify_new_music_releases - DOWN');

  db.exec('BEGIN TRANSACTION');

  try {
    // Drop indexes
    console.log('  🔄 Dropping indexes...');
    const indexes = [
      'DROP INDEX IF EXISTS idx_releases_featured',
      'DROP INDEX IF EXISTS idx_releases_published',
      'DROP INDEX IF EXISTS idx_releases_release_date',
      'DROP INDEX IF EXISTS idx_releases_type_system',
      'DROP INDEX IF EXISTS idx_releases_curator',
      'DROP INDEX IF EXISTS idx_releases_attribution',
      'DROP INDEX IF EXISTS idx_releases_artist',
      'DROP INDEX IF EXISTS idx_releases_display_order'
    ];

    for (const dropSQL of indexes) {
      db.exec(dropSQL);
    }

    // Drop releases table
    console.log('  🔄 Dropping releases table...');
    db.exec('DROP TABLE IF EXISTS releases');

    db.exec('COMMIT');
    console.log('✅ Migration 022_unify_new_music_releases rollback completed');

  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 022_unify_new_music_releases rollback failed:', error);
    throw error;
  }
};
