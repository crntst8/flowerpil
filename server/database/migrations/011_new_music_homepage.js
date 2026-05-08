// Migration: NEW MUSIC Homepage Feature
// Date: 2025-08-12
// Description: Extend upcoming_releases table with columns for NEW MUSIC tab on homepage

export const up = (database) => {
  console.log('🔄 Running migration 011_new_music_homepage - UP');
  
  // Begin transaction for atomic migration
  database.exec('BEGIN TRANSACTION');
  
  try {
    console.log('  📝 Adding NEW MUSIC columns to upcoming_releases table...');
    
    // Add columns for NEW MUSIC feature
    const newMusicColumns = [
      'artist_name TEXT', // Display artist name (separate from title)
      'genres TEXT', // Comma-separated genre list
      'country_code TEXT', // ISO country code (e.g., "AU", "US")
      'country_name TEXT', // Full country name (e.g., "Australia", "United States")
      'attribution_type TEXT CHECK (attribution_type IN ("none", "curator", "flowerpil")) DEFAULT "none"', // Attribution system
      'attribution_curator_id INTEGER', // References curators(id) when attribution_type="curator"
      'featured_on_homepage INTEGER DEFAULT 0', // Controls NEW MUSIC tab visibility (boolean as integer)
      'homepage_display_order INTEGER DEFAULT 0', // Manual ordering for homepage
      'post_date DATE', // When posted (separate from release_date)
      'platform_links TEXT', // JSON with streaming platform URLs
      'is_published INTEGER DEFAULT 0' // Publication control (boolean as integer)
    ];
    
    // Add each column with error handling for existing columns
    for (const column of newMusicColumns) {
      try {
        database.exec(`ALTER TABLE upcoming_releases ADD COLUMN ${column}`);
        console.log(`    ✅ Added column: ${column.split(' ')[0]}`);
      } catch (error) {
        if (error.message.includes('duplicate column name')) {
          console.log(`    ⚠️  Column already exists: ${column.split(' ')[0]}`);
        } else {
          throw error;
        }
      }
    }
    
    // Add foreign key index for attribution_curator_id
    console.log('  📊 Creating NEW MUSIC indexes...');
    const newIndexes = [
      'CREATE INDEX IF NOT EXISTS idx_upcoming_releases_featured_homepage ON upcoming_releases(featured_on_homepage, homepage_display_order)',
      'CREATE INDEX IF NOT EXISTS idx_upcoming_releases_published ON upcoming_releases(is_published)',
      'CREATE INDEX IF NOT EXISTS idx_upcoming_releases_post_date ON upcoming_releases(post_date)',
      'CREATE INDEX IF NOT EXISTS idx_upcoming_releases_attribution ON upcoming_releases(attribution_curator_id)',
      'CREATE INDEX IF NOT EXISTS idx_upcoming_releases_homepage_order ON upcoming_releases(homepage_display_order)'
    ];
    
    for (const indexSQL of newIndexes) {
      database.exec(indexSQL);
      console.log(`    ✅ Created index: ${indexSQL.split(' ')[5]}`);
    }
    
    // Insert sample NEW MUSIC data for testing
    console.log('  🌱 Adding sample NEW MUSIC data...');
    
    // Check if we have any curators to use for attribution
    const curators = database.prepare('SELECT id, name FROM curators LIMIT 3').all();
    
    const sampleData = [
      {
        title: 'Midnight Dreams',
        artist_name: 'Luna Collective',
        genres: 'Electronic, Ambient',
        country_code: 'AU',
        country_name: 'Australia',
        release_date: '2025-08-15',
        release_type: 'Single',
        post_date: '2025-08-12',
        attribution_type: curators.length > 0 ? 'curator' : 'flowerpil',
        attribution_curator_id: curators.length > 0 ? curators[0].id : null,
        featured_on_homepage: 1,
        homepage_display_order: 1,
        is_published: 1,
        platform_links: JSON.stringify({
          spotify: 'https://open.spotify.com/track/example1',
          apple: 'https://music.apple.com/album/example1',
          bandcamp: 'https://lunacollective.bandcamp.com/track/midnight-dreams'
        })
      },
      {
        title: 'Neon Highways',
        artist_name: 'Retrosynth',
        genres: 'Synthwave, Electronic',
        country_code: 'US',
        country_name: 'United States',
        release_date: '2025-08-20',
        release_type: 'EP',
        post_date: '2025-08-12',
        attribution_type: 'flowerpil',
        attribution_curator_id: null,
        featured_on_homepage: 1,
        homepage_display_order: 2,
        is_published: 1,
        platform_links: JSON.stringify({
          spotify: 'https://open.spotify.com/album/example2',
          apple: 'https://music.apple.com/album/example2'
        })
      },
      {
        title: 'Forest Sessions',
        artist_name: 'Woodland Echoes',
        genres: 'Folk, Acoustic',
        country_code: 'CA',
        country_name: 'Canada',
        release_date: '2025-08-25',
        release_type: 'Album',
        post_date: '2025-08-12',
        attribution_type: curators.length > 1 ? 'curator' : 'none',
        attribution_curator_id: curators.length > 1 ? curators[1].id : null,
        featured_on_homepage: 1,
        homepage_display_order: 3,
        is_published: 1,
        platform_links: JSON.stringify({
          spotify: 'https://open.spotify.com/album/example3',
          apple: 'https://music.apple.com/album/example3',
          bandcamp: 'https://woodlandechoes.bandcamp.com/album/forest-sessions',
          tidal: 'https://tidal.com/album/example3'
        })
      }
    ];
    
    // Insert sample data
    const insertSample = database.prepare(`
      INSERT INTO upcoming_releases (
        curator_id, title, artist_name, genres, country_code, country_name,
        release_date, release_type, post_date, attribution_type, attribution_curator_id,
        featured_on_homepage, homepage_display_order, is_published, platform_links
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    for (const item of sampleData) {
      try {
        insertSample.run(
          item.title, item.artist_name, item.genres, item.country_code, item.country_name,
          item.release_date, item.release_type, item.post_date, item.attribution_type,
          item.attribution_curator_id, item.featured_on_homepage, item.homepage_display_order,
          item.is_published, item.platform_links
        );
        console.log(`    ✅ Added sample: ${item.artist_name} - ${item.title}`);
      } catch (error) {
        console.log(`    ⚠️  Could not add sample data: ${error.message}`);
      }
    }
    
    database.exec('COMMIT');
    console.log('✅ Migration 011_new_music_homepage completed successfully');
    
    // Verify migration results
    const newMusicCount = database.prepare('SELECT COUNT(*) as count FROM upcoming_releases WHERE featured_on_homepage = 1').get();
    console.log(`📊 NEW MUSIC entries created: ${newMusicCount.count}`);
    
  } catch (error) {
    database.exec('ROLLBACK');
    console.error('❌ Migration 011_new_music_homepage failed:', error);
    throw error;
  }
};

export const down = (database) => {
  console.log('🔄 Running migration 011_new_music_homepage - DOWN');
  
  database.exec('BEGIN TRANSACTION');
  
  try {
    // Drop NEW MUSIC indexes
    console.log('  🔄 Dropping NEW MUSIC indexes...');
    const dropIndexes = [
      'DROP INDEX IF EXISTS idx_upcoming_releases_featured_homepage',
      'DROP INDEX IF EXISTS idx_upcoming_releases_published',
      'DROP INDEX IF EXISTS idx_upcoming_releases_post_date',
      'DROP INDEX IF EXISTS idx_upcoming_releases_attribution',
      'DROP INDEX IF EXISTS idx_upcoming_releases_homepage_order'
    ];
    
    for (const dropSQL of dropIndexes) {
      database.exec(dropSQL);
    }
    
    // Note: SQLite doesn't support DROP COLUMN, so we'll mark the data as unused
    // Clear NEW MUSIC data instead of dropping columns
    console.log('  🔄 Clearing NEW MUSIC data...');
    database.exec(`
      UPDATE upcoming_releases SET 
        featured_on_homepage = 0,
        is_published = 0,
        artist_name = NULL,
        genres = NULL,
        country_code = NULL,
        country_name = NULL,
        attribution_type = 'none',
        attribution_curator_id = NULL,
        homepage_display_order = 0,
        post_date = NULL,
        platform_links = NULL
    `);
    
    database.exec('COMMIT');
    console.log('✅ Migration 011_new_music_homepage rollback completed');
    
  } catch (error) {
    database.exec('ROLLBACK');
    console.error('❌ Migration 011_new_music_homepage rollback failed:', error);
    throw error;
  }
};