export async function up(db) {
  console.log('🔄 Creating playlist_transfer_jobs table...');

  // Create playlist_transfer_jobs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS playlist_transfer_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      -- Source information
      source_platform TEXT NOT NULL DEFAULT 'spotify' CHECK (source_platform IN ('spotify')),
      source_playlist_id TEXT NOT NULL,
      source_playlist_name TEXT,

      -- Destination configuration (JSON array: ["apple", "tidal"])
      destinations TEXT NOT NULL,

      -- Status tracking
      status TEXT NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'auth_required', 'fetching', 'processing', 'completed', 'failed', 'cancelled')
      ),

      -- Progress counters
      total_tracks INTEGER DEFAULT 0,
      tracks_processed INTEGER DEFAULT 0,
      tracks_matched INTEGER DEFAULT 0,
      tracks_failed INTEGER DEFAULT 0,

      -- Results per platform (JSON)
      -- Example: { "apple": { "playlistUrl": "...", "tracksAdded": 295, "status": "success" }, "tidal": {...} }
      results TEXT,

      -- Detailed track-by-track results (JSON array)
      -- Example: [{ "title": "...", "artist": "...", "apple": { "matched": true, "confidence": 95, "url": "...", "strategy": "isrc" } }]
      track_results TEXT,

      -- Error tracking
      last_error TEXT,
      error_count INTEGER DEFAULT 0,

      -- Configuration options
      match_threshold INTEGER DEFAULT 75,
      use_enhanced_matching BOOLEAN DEFAULT 1,

      -- Audit trail
      requested_by TEXT DEFAULT 'admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      started_at DATETIME,
      completed_at DATETIME
    );
  `);
  console.log('   ✓ Created playlist_transfer_jobs table');

  // Create indexes for performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_transfer_jobs_status
    ON playlist_transfer_jobs(status);
  `);
  console.log('   ✓ Created index: idx_transfer_jobs_status');

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_transfer_jobs_created
    ON playlist_transfer_jobs(created_at DESC);
  `);
  console.log('   ✓ Created index: idx_transfer_jobs_created');

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_transfer_jobs_source
    ON playlist_transfer_jobs(source_playlist_id);
  `);
  console.log('   ✓ Created index: idx_transfer_jobs_source');

  // Create trigger for updated_at timestamp
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS update_transfer_jobs_timestamp
    AFTER UPDATE ON playlist_transfer_jobs
    BEGIN
      UPDATE playlist_transfer_jobs
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = NEW.id;
    END;
  `);
  console.log('   ✓ Created trigger: update_transfer_jobs_timestamp');

  console.log('✅ Playlist transfer jobs table created successfully');
}

export async function down(db) {
  console.log('🔄 Dropping playlist_transfer_jobs table...');

  // Drop trigger first
  db.exec('DROP TRIGGER IF EXISTS update_transfer_jobs_timestamp;');
  console.log('   ✓ Dropped trigger: update_transfer_jobs_timestamp');

  // Drop indexes
  db.exec('DROP INDEX IF EXISTS idx_transfer_jobs_status;');
  db.exec('DROP INDEX IF EXISTS idx_transfer_jobs_created;');
  db.exec('DROP INDEX IF EXISTS idx_transfer_jobs_source;');
  console.log('   ✓ Dropped indexes');

  // Drop table
  db.exec('DROP TABLE IF EXISTS playlist_transfer_jobs;');
  console.log('   ✓ Dropped playlist_transfer_jobs table');

  console.log('✅ Playlist transfer jobs table dropped successfully');
}
