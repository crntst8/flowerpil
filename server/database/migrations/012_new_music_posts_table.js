// Fixed version of 012_new_music_posts_table.js migration
// This creates the table without trying to migrate data from non-existent columns

export const up = (database) => {
  console.log('🔄 Running migration 012_new_music_posts_table - UP (FIXED)');

  // Begin transaction for atomic migration
  database.exec('BEGIN TRANSACTION');

  try {
    console.log('  📝 Creating new_music_posts table...');

    // Create dedicated new_music_posts table
    database.exec(`
      CREATE TABLE new_music_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        artist_name TEXT NOT NULL,
        release_type TEXT CHECK (release_type IN ('Album','EP','Live Recording','Remix','Single')) NOT NULL,
        release_date DATE NOT NULL,
        genres TEXT,
        country_code TEXT,
        country_name TEXT,
        description TEXT,
        artwork_url TEXT,
        platform_links TEXT, -- JSON with streaming platform URLs
        attribution_type TEXT CHECK (attribution_type IN ('none', 'curator', 'flowerpil')) DEFAULT 'none',
        attribution_curator_id INTEGER, -- References curators(id) when attribution_type='curator'
        featured_on_homepage INTEGER DEFAULT 1, -- Controls NEW MUSIC tab visibility
        homepage_display_order INTEGER DEFAULT 0, -- Manual ordering for homepage
        post_date DATE NOT NULL,
        is_published INTEGER DEFAULT 0, -- Publication control
        featured_url TEXT, -- Preview URL (audio/video)
        featured_kind TEXT CHECK (featured_kind IN ('SingleDSP','AudioUpload','MusicVideo')),
        featured_duration_sec INTEGER,
        pre_order_url TEXT,
        pre_save_url TEXT,
        info_url TEXT,
        isrc TEXT, -- International Standard Recording Code
        deezer_id TEXT, -- For Deezer preview integration
        deezer_preview_url TEXT,
        preview_source TEXT,
        preview_confidence INTEGER,
        preview_updated_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (attribution_curator_id) REFERENCES curators(id) ON DELETE SET NULL
      )
    `);

    console.log('  📊 Creating indexes for performance...');

    // Create indexes for better query performance
    const indexes = [
      'CREATE INDEX idx_new_music_featured ON new_music_posts(featured_on_homepage)',
      'CREATE INDEX idx_new_music_published ON new_music_posts(is_published)',
      'CREATE INDEX idx_new_music_release_date ON new_music_posts(release_date)',
      'CREATE INDEX idx_new_music_display_order ON new_music_posts(homepage_display_order)',
      'CREATE INDEX idx_new_music_attribution ON new_music_posts(attribution_type, attribution_curator_id)',
      'CREATE INDEX idx_new_music_artist ON new_music_posts(artist_name)',
      'CREATE INDEX idx_new_music_post_date ON new_music_posts(post_date)'
    ];

    for (const indexSQL of indexes) {
      database.exec(indexSQL);
    }

    // Skip data migration for fresh database setup
    console.log('  ⚠️  Skipping data migration - fresh database setup');

    database.exec('COMMIT');
    console.log('✅ Migration 012_new_music_posts_table completed successfully');

    // Verify migration results
    const newTableCount = database.prepare('SELECT COUNT(*) as count FROM new_music_posts').get();
    console.log(`📊 new_music_posts table created with ${newTableCount.count} entries`);

  } catch (error) {
    database.exec('ROLLBACK');
    console.error('❌ Migration 012_new_music_posts_table failed:', error);
    throw error;
  }
};

export const down = (database) => {
  console.log('🔄 Running migration 012_new_music_posts_table - DOWN');

  database.exec('BEGIN TRANSACTION');

  try {
    // Drop indexes first
    console.log('  🔄 Dropping indexes...');
    const indexes = [
      'DROP INDEX IF EXISTS idx_new_music_featured',
      'DROP INDEX IF EXISTS idx_new_music_published',
      'DROP INDEX IF EXISTS idx_new_music_release_date',
      'DROP INDEX IF EXISTS idx_new_music_display_order',
      'DROP INDEX IF EXISTS idx_new_music_attribution',
      'DROP INDEX IF EXISTS idx_new_music_artist',
      'DROP INDEX IF EXISTS idx_new_music_post_date'
    ];

    for (const dropSQL of indexes) {
      database.exec(dropSQL);
    }

    // Drop the table
    console.log('  🔄 Dropping new_music_posts table...');
    database.exec('DROP TABLE IF EXISTS new_music_posts');

    database.exec('COMMIT');
    console.log('✅ Migration 012_new_music_posts_table rollback completed');

  } catch (error) {
    database.exec('ROLLBACK');
    console.error('❌ Migration 012_new_music_posts_table rollback failed:', error);
    throw error;
  }
};
