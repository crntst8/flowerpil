// Migration: Add DSP links to curators
// Date: 2025-08-08
// Description: Add spotify_url, apple_url, tidal_url fields to curators table for streaming platform links

export const up = (db) => {
  console.log('🔄 Running migration 005_curator_dsp_links - UP');
  
  // Begin transaction for atomic migration
  db.exec('BEGIN TRANSACTION');
  
  try {
    // Add DSP URL columns to curators table
    console.log('  📝 Adding DSP URL columns to curators table...');
    
    const dspFields = [
      'spotify_url TEXT',
      'apple_url TEXT', 
      'tidal_url TEXT',
      'bandcamp_url TEXT'
    ];
    
    for (const field of dspFields) {
      try {
        db.exec(`ALTER TABLE curators ADD COLUMN ${field}`);
        console.log(`  ✅ Added ${field.split(' ')[0]} column`);
      } catch (error) {
        if (error.message.includes('duplicate column name')) {
          console.log(`  ⚠️  ${field.split(' ')[0]} column already exists, skipping...`);
        } else {
          throw error;
        }
      }
    }
    
    // Create indexes for DSP URLs for performance
    console.log('  📊 Creating indexes for DSP URLs...');
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_curators_spotify_url ON curators(spotify_url)',
      'CREATE INDEX IF NOT EXISTS idx_curators_apple_url ON curators(apple_url)',
      'CREATE INDEX IF NOT EXISTS idx_curators_tidal_url ON curators(tidal_url)',
      'CREATE INDEX IF NOT EXISTS idx_curators_bandcamp_url ON curators(bandcamp_url)'
    ];
    
    for (const indexSQL of indexes) {
      db.exec(indexSQL);
    }
    
    db.exec('COMMIT');
    console.log('✅ Migration 005_curator_dsp_links completed successfully');
    
    // Verify migration results
    const curatorCount = db.prepare('SELECT COUNT(*) as count FROM curators WHERE spotify_url IS NOT NULL OR apple_url IS NOT NULL OR tidal_url IS NOT NULL OR bandcamp_url IS NOT NULL').get();
    console.log(`📊 Migration results: ${curatorCount.count} curators with DSP URLs`);
    
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 005_curator_dsp_links failed:', error);
    throw error;
  }
};

export const down = (db) => {
  console.log('🔄 Running migration 005_curator_dsp_links - DOWN');
  
  db.exec('BEGIN TRANSACTION');
  
  try {
    // Drop indexes
    console.log('  🔄 Dropping DSP URL indexes...');
    const dropIndexes = [
      'DROP INDEX IF EXISTS idx_curators_spotify_url',
      'DROP INDEX IF EXISTS idx_curators_apple_url', 
      'DROP INDEX IF EXISTS idx_curators_tidal_url',
      'DROP INDEX IF EXISTS idx_curators_bandcamp_url'
    ];
    
    for (const dropSQL of dropIndexes) {
      db.exec(dropSQL);
    }
    
    // Note: SQLite doesn't support DROP COLUMN, so we can't easily remove the columns
    // The columns will remain but won't be used by the application after rollback
    console.log('  ⚠️  Note: DSP URL columns cannot be removed in SQLite (will remain unused)');
    
    db.exec('COMMIT');
    console.log('✅ Migration 005_curator_dsp_links rollback completed');
    
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 005_curator_dsp_links rollback failed:', error);
    throw error;
  }
};