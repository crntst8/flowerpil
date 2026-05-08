// Migration 024: Add audio metadata fields to releases table
// Date: 2025-08-30
// Description: Adds comprehensive audio metadata fields for audio releases workflow

export const up = (db) => {
  console.log('🔄 Running migration 024_audio_metadata_fields - UP');
  
  try {
    // Add audio metadata fields to releases table
    console.log('  📝 Adding audio metadata fields...');
    db.exec(`
      ALTER TABLE releases ADD COLUMN album TEXT;
      ALTER TABLE releases ADD COLUMN genre TEXT;
      ALTER TABLE releases ADD COLUMN track_number INTEGER;
      ALTER TABLE releases ADD COLUMN total_tracks INTEGER;
      ALTER TABLE releases ADD COLUMN copyright TEXT;
      ALTER TABLE releases ADD COLUMN composer TEXT;
      ALTER TABLE releases ADD COLUMN publisher TEXT;
      ALTER TABLE releases ADD COLUMN recording_date TEXT;
      ALTER TABLE releases ADD COLUMN original_format TEXT;
      ALTER TABLE releases ADD COLUMN browser_format_path TEXT;
    `);
    
    // Add indexes for commonly queried metadata fields
    console.log('  📝 Adding metadata indexes...');
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_releases_album ON releases(album);
      CREATE INDEX IF NOT EXISTS idx_releases_genre ON releases(genre);
      CREATE INDEX IF NOT EXISTS idx_releases_artist_album ON releases(artist_name, album);
    `);
    
    console.log('✅ Successfully added audio metadata fields and indexes to releases table');
    
  } catch (error) {
    if (error.message.includes('duplicate column name')) {
      console.log('⚠️  Audio metadata columns already exist - skipping');
    } else {
      console.error('❌ Error adding audio metadata fields:', error.message);
      throw error;
    }
  }
};

export const down = (db) => {
  console.log('🔄 Running migration 024_audio_metadata_fields - DOWN');
  
  try {
    // SQLite doesn't support DROP COLUMN directly
    console.log('⚠️ SQLite downgrade would require table recreation - not implemented');
    console.log('✅ Migration 024 downgrade logged');
    
  } catch (error) {
    console.error('❌ Error in migration 024 downgrade:', error.message);
    throw error;
  }
};