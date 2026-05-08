import { getDatabase } from '../db.js';

/**
 * Migration: Add Cross-Platform DSP Linking fields to tracks table
 * 
 * Adds fields for Apple Music and Tidal linking with confidence scoring,
 * manual override system, and job processing status tracking.
 */
export const up = () => {
  const db = getDatabase();
  
  console.log('🔄 Running migration: Cross-Platform DSP Linking fields');
  
  try {
    // Start transaction for atomic migration
    db.exec('BEGIN');
    
    // Add cross-platform linking fields to tracks table
    const alterStatements = [
      'ALTER TABLE tracks ADD COLUMN apple_music_url TEXT',
      'ALTER TABLE tracks ADD COLUMN tidal_url TEXT', 
      'ALTER TABLE tracks ADD COLUMN match_confidence_apple INTEGER',
      'ALTER TABLE tracks ADD COLUMN match_confidence_tidal INTEGER',
      'ALTER TABLE tracks ADD COLUMN match_source_apple TEXT', // 'isrc'|'metadata'|'manual'
      'ALTER TABLE tracks ADD COLUMN match_source_tidal TEXT',
      'ALTER TABLE tracks ADD COLUMN linking_status TEXT DEFAULT \'pending\'', // 'pending'|'processing'|'completed'|'failed'
      'ALTER TABLE tracks ADD COLUMN flagged_for_review BOOLEAN DEFAULT FALSE',
      'ALTER TABLE tracks ADD COLUMN linking_updated_at DATETIME',
      'ALTER TABLE tracks ADD COLUMN linking_error TEXT',
      
      // Manual override system
      'ALTER TABLE tracks ADD COLUMN manual_override_apple TEXT',
      'ALTER TABLE tracks ADD COLUMN manual_override_tidal TEXT', 
      'ALTER TABLE tracks ADD COLUMN flagged_reason TEXT'
    ];
    
    // Execute all ALTER statements
    alterStatements.forEach(statement => {
      try {
        db.exec(statement);
        console.log(`✅ ${statement}`);
      } catch (error) {
        // Ignore "duplicate column name" errors for idempotent migrations
        if (!error.message.includes('duplicate column name')) {
          throw error;
        }
        console.log(`⚠️  Column already exists: ${statement}`);
      }
    });
    
    // Create indexes for performance
    const indexStatements = [
      'CREATE INDEX IF NOT EXISTS idx_tracks_linking_status ON tracks(linking_status)',
      'CREATE INDEX IF NOT EXISTS idx_tracks_flagged_review ON tracks(flagged_for_review)',
      'CREATE INDEX IF NOT EXISTS idx_tracks_apple_confidence ON tracks(match_confidence_apple)',
      'CREATE INDEX IF NOT EXISTS idx_tracks_tidal_confidence ON tracks(match_confidence_tidal)',
      'CREATE INDEX IF NOT EXISTS idx_tracks_linking_updated ON tracks(linking_updated_at)'
    ];
    
    indexStatements.forEach(statement => {
      db.exec(statement);
      console.log(`📊 ${statement}`);
    });
    
    // Commit transaction
    db.exec('COMMIT');
    
    console.log('✅ Migration completed: Cross-Platform DSP Linking fields added');
    
    // Verify migration by checking track count and new columns
    const trackCount = db.prepare('SELECT COUNT(*) as count FROM tracks').get();
    console.log(`📊 Total tracks ready for cross-platform linking: ${trackCount.count}`);
    
  } catch (error) {
    // Rollback on error
    db.exec('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  }
};

/**
 * Rollback migration - removes cross-platform linking fields
 * Note: SQLite doesn't support DROP COLUMN, so this creates a new table
 */
export const down = () => {
  const db = getDatabase();
  
  console.log('🔄 Rolling back migration: Cross-Platform DSP Linking fields');
  
  try {
    db.exec('BEGIN');
    
    // Get original track data (exclude cross-platform fields)
    const originalColumns = [
      'id', 'playlist_id', 'position', 'title', 'artist', 'album', 'year', 
      'duration', 'spotify_id', 'apple_id', 'tidal_id', 'label', 'genre',
      'artwork_url', 'album_artwork_url', 'isrc', 'explicit', 'popularity',
      'preview_url', 'deezer_id', 'deezer_preview_url', 'preview_source',
      'preview_confidence', 'preview_updated_at', 'created_at'
    ].join(', ');
    
    // Create temporary table with original schema
    db.exec(`
      CREATE TABLE tracks_backup AS 
      SELECT ${originalColumns} FROM tracks
    `);
    
    // Drop current tracks table and rename backup
    db.exec('DROP TABLE tracks');
    db.exec('ALTER TABLE tracks_backup RENAME TO tracks');
    
    // Recreate indexes for original schema
    db.exec('CREATE INDEX IF NOT EXISTS idx_tracks_playlist_id ON tracks(playlist_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_tracks_position ON tracks(playlist_id, position)');
    
    db.exec('COMMIT');
    
    console.log('✅ Migration rollback completed');
    
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration rollback failed:', error);
    throw error;
  }
};