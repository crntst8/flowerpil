// Migration: Enhanced Curator Profile System
// Date: 2025-08-04
// Description: Expand curator table with comprehensive profile fields and migrate existing data

export const up = (db) => {
  console.log('🔄 Running migration 002_curator_profiles - UP');
  
  // Begin transaction for atomic migration
  db.exec('BEGIN TRANSACTION');
  
  try {
    // 1. Add comprehensive curator profile fields
    console.log('  📝 Adding curator profile fields...');
    
    const curatorFields = [
      'bio TEXT',                           // Rich text biography
      'bio_short TEXT',                     // One-line description
      'profile_image TEXT',                 // Avatar/photo URL (relative path)
      'cover_image TEXT',                   // Header/banner image (relative path)
      'location TEXT',                      // Geographic location
      'website_url TEXT',                   // Primary website
      'contact_email TEXT',                 // Contact information
      'social_links TEXT',                  // JSON array of social media
      'external_links TEXT',                // JSON array of other links
      'profile_type TEXT DEFAULT "artist"', // 'artist', 'label', 'radio', 'blogger'
      'verification_status TEXT DEFAULT "pending"', // 'pending', 'verified', 'featured'
      'profile_visibility TEXT DEFAULT "public"',   // 'public', 'private', 'draft'
      'custom_fields TEXT',                 // JSON for extensible metadata
      'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP'
    ];
    
    // Add each field individually to handle existing data
    for (const field of curatorFields) {
      try {
        db.exec(`ALTER TABLE curators ADD COLUMN ${field}`);
      } catch (error) {
        // Column might already exist, log but continue
        console.log(`    ⚠️  Column might already exist: ${field.split(' ')[0]}`);
      }
    }
    
    // 2. Update existing curator records with enhanced type mapping
    console.log('  🔄 Updating existing curator data...');
    
    const updateCurator = db.prepare(`
      UPDATE curators SET 
        profile_type = ?,
        verification_status = 'verified',
        profile_visibility = 'public'
      WHERE name = ?
    `);
    
    // Map existing curator types
    updateCurator.run('artist', 'Colby');
    updateCurator.run('label', 'Tanyua');  // brand -> label
    
    // 3. Migrate playlist curator_name to curator_id relationships
    console.log('  🔗 Linking playlists to curator records...');
    
    const getCuratorId = db.prepare('SELECT id FROM curators WHERE name = ?');
    const updatePlaylistCurator = db.prepare('UPDATE playlists SET curator_id = ? WHERE curator_name = ?');
    
    // Get all unique curator names from playlists
    const uniqueCurators = db.prepare('SELECT DISTINCT curator_name, curator_type FROM playlists WHERE curator_name IS NOT NULL').all();
    
    for (const playlist of uniqueCurators) {
      // Ensure curator exists in curators table
      const existingCurator = getCuratorId.get(playlist.curator_name);
      
      if (!existingCurator) {
        // Create curator record if it doesn't exist
        const insertCurator = db.prepare(`
          INSERT INTO curators (name, type, profile_type, verification_status, profile_visibility) 
          VALUES (?, ?, ?, 'verified', 'public')
        `);
        
        const curatorType = playlist.curator_type === 'brand' ? 'label' : playlist.curator_type;
        const result = insertCurator.run(playlist.curator_name, curatorType, curatorType);
        updatePlaylistCurator.run(result.lastInsertRowid, playlist.curator_name);
        console.log(`    ✅ Created curator: ${playlist.curator_name} (${curatorType})`);
      } else {
        // Link existing curator
        updatePlaylistCurator.run(existingCurator.id, playlist.curator_name);
        console.log(`    🔗 Linked curator: ${playlist.curator_name}`);
      }
    }
    
    // 4. Create performance indexes
    console.log('  📊 Creating curator indexes...');
    
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_curators_name ON curators(name)',
      'CREATE INDEX IF NOT EXISTS idx_curators_type ON curators(profile_type)',
      'CREATE INDEX IF NOT EXISTS idx_curators_visibility ON curators(profile_visibility)',
      'CREATE INDEX IF NOT EXISTS idx_curators_verification ON curators(verification_status)',
      'CREATE INDEX IF NOT EXISTS idx_playlists_curator_id ON playlists(curator_id)'
    ];
    
    for (const indexSQL of indexes) {
      db.exec(indexSQL);
    }
    
    // 5. Create trigger for curator updated_at timestamp
    console.log('  ⚡ Creating curator timestamp trigger...');
    
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_curators_timestamp 
      AFTER UPDATE ON curators
      BEGIN
        UPDATE curators SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END
    `);
    
    // 6. Add foreign key constraint (if not exists)
    console.log('  🔐 Adding foreign key constraints...');
    
    // Note: SQLite doesn't support adding foreign keys to existing tables
    // This will be enforced at the application level and in future schema recreations
    
    db.exec('COMMIT');
    console.log('✅ Migration 002_curator_profiles completed successfully');
    
    // Verify migration results
    const curatorCount = db.prepare('SELECT COUNT(*) as count FROM curators').get();
    const linkedPlaylists = db.prepare('SELECT COUNT(*) as count FROM playlists WHERE curator_id IS NOT NULL').get();
    
    console.log(`📊 Migration results:`);
    console.log(`   - Total curators: ${curatorCount.count}`);
    console.log(`   - Linked playlists: ${linkedPlaylists.count}`);
    
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 002_curator_profiles failed:', error);
    throw error;
  }
};

export const down = (db) => {
  console.log('🔄 Running migration 002_curator_profiles - DOWN');
  
  db.exec('BEGIN TRANSACTION');
  
  try {
    // Remove added columns (SQLite limitation: can't drop columns easily)
    // Instead, we'll clear the enhanced data and reset to basic schema
    
    console.log('  🔄 Resetting curator data to basic schema...');
    
    // Clear enhanced curator data
    db.exec(`
      UPDATE curators SET 
        bio = NULL,
        bio_short = NULL,
        profile_image = NULL,
        cover_image = NULL,
        location = NULL,
        website_url = NULL,
        contact_email = NULL,
        social_links = NULL,
        external_links = NULL,
        profile_type = type,
        verification_status = 'pending',
        profile_visibility = 'public',
        custom_fields = NULL
    `);
    
    // Clear curator_id relationships in playlists
    db.exec('UPDATE playlists SET curator_id = NULL');
    
    // Drop indexes
    const dropIndexes = [
      'DROP INDEX IF EXISTS idx_curators_name',
      'DROP INDEX IF EXISTS idx_curators_type', 
      'DROP INDEX IF EXISTS idx_curators_visibility',
      'DROP INDEX IF EXISTS idx_curators_verification',
      'DROP INDEX IF EXISTS idx_playlists_curator_id'
    ];
    
    for (const dropSQL of dropIndexes) {
      db.exec(dropSQL);
    }
    
    // Drop trigger
    db.exec('DROP TRIGGER IF EXISTS update_curators_timestamp');
    
    db.exec('COMMIT');
    console.log('✅ Migration 002_curator_profiles rollback completed');
    
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 002_curator_profiles rollback failed:', error);
    throw error;
  }
};