// Migration: Add show_in_url field to new_music_posts
// Date: 2025-08-26  
// Description: Add show_in_url field to control static URL page visibility

export const up = (database) => {
  console.log('🔄 Running migration 013_add_show_in_url_field - UP');
  
  database.exec('BEGIN TRANSACTION');
  
  try {
    console.log('  📝 Adding show_in_url column to new_music_posts...');
    
    // Add show_in_url field (defaults to 1/true)
    database.exec(`
      ALTER TABLE new_music_posts 
      ADD COLUMN show_in_url INTEGER DEFAULT 1
    `);
    
    console.log('  📊 Creating index for show_in_url...');
    database.exec('CREATE INDEX idx_new_music_posts_show_in_url ON new_music_posts(show_in_url)');
    
    database.exec('COMMIT');
    console.log('✅ Migration 013_add_show_in_url_field completed successfully');
    
  } catch (error) {
    database.exec('ROLLBACK');
    console.error('❌ Migration 013_add_show_in_url_field failed:', error);
    throw error;
  }
};

export const down = (database) => {
  console.log('🔄 Running migration 013_add_show_in_url_field - DOWN');
  
  database.exec('BEGIN TRANSACTION');
  
  try {
    console.log('  🔄 Dropping show_in_url column and index...');
    database.exec('DROP INDEX IF EXISTS idx_new_music_posts_show_in_url');
    
    // SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
    database.exec(`
      CREATE TABLE new_music_posts_temp AS 
      SELECT id, title, artist_name, release_type, release_date, genres, country_code, country_name,
             description, artwork_url, platform_links, attribution_type, attribution_curator_id,
             featured_on_homepage, homepage_display_order, post_date, is_published,
             featured_url, featured_kind, featured_duration_sec, pre_order_url, pre_save_url,
             info_url, isrc, deezer_id, deezer_preview_url, preview_source, preview_confidence,
             preview_updated_at, created_at, updated_at
      FROM new_music_posts
    `);
    
    database.exec('DROP TABLE new_music_posts');
    database.exec('ALTER TABLE new_music_posts_temp RENAME TO new_music_posts');
    
    // Recreate original indexes
    const indexes = [
      'CREATE INDEX idx_new_music_posts_featured_homepage ON new_music_posts(featured_on_homepage, homepage_display_order)',
      'CREATE INDEX idx_new_music_posts_published ON new_music_posts(is_published)',
      'CREATE INDEX idx_new_music_posts_post_date ON new_music_posts(post_date)',
      'CREATE INDEX idx_new_music_posts_attribution ON new_music_posts(attribution_curator_id)',
      'CREATE INDEX idx_new_music_posts_homepage_order ON new_music_posts(homepage_display_order)',
      'CREATE INDEX idx_new_music_posts_release_date ON new_music_posts(release_date)',
      'CREATE INDEX idx_new_music_posts_artist ON new_music_posts(artist_name)',
      'CREATE INDEX idx_new_music_posts_genre ON new_music_posts(genres)'
    ];
    
    for (const indexSQL of indexes) {
      database.exec(indexSQL);
    }
    
    database.exec('COMMIT');
    console.log('✅ Migration 013_add_show_in_url_field rollback completed');
    
  } catch (error) {
    database.exec('ROLLBACK');
    console.error('❌ Migration 013_add_show_in_url_field rollback failed:', error);
    throw error;
  }
};