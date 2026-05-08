import { getDatabase } from '../db.js';

/**
 * Migration 079: YouTube Cross-Link Staging System
 *
 * Creates infrastructure for YouTube-specific dry run cross-linking with:
 * - Staging table to hold dry run results for review
 * - Manual override column for YouTube on tracks
 * - System config for future playlist auto-linking
 */

export const up = (database) => {
  const db = database ?? getDatabase();

  console.log('Creating YouTube cross-link staging table...');

  db.exec(`
    CREATE TABLE IF NOT EXISTS youtube_crosslink_staging (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      track_id INTEGER NOT NULL,
      playlist_id INTEGER,
      -- Track metadata snapshot
      artist TEXT,
      title TEXT,
      album TEXT,
      isrc TEXT,
      duration_ms INTEGER,
      -- YouTube match result
      youtube_video_id TEXT,
      youtube_url TEXT,
      youtube_title TEXT,
      youtube_artist TEXT,
      youtube_duration_ms INTEGER,
      match_confidence INTEGER,
      match_source TEXT,
      -- Review status: pending, approved, rejected, overridden
      status TEXT DEFAULT 'pending',
      override_video_id TEXT,
      override_url TEXT,
      override_reason TEXT,
      -- Job tracking
      job_id TEXT,
      -- Timestamps
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      reviewed_at DATETIME,
      applied_at DATETIME,
      FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
    )
  `);
  console.log('  Created youtube_crosslink_staging table');

  console.log('Creating indexes for staging table...');

  db.exec('CREATE INDEX IF NOT EXISTS idx_yt_staging_job ON youtube_crosslink_staging(job_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_yt_staging_status ON youtube_crosslink_staging(status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_yt_staging_track ON youtube_crosslink_staging(track_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_yt_staging_playlist ON youtube_crosslink_staging(playlist_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_yt_staging_applied ON youtube_crosslink_staging(applied_at)');
  console.log('  Created staging table indexes');

  console.log('Adding manual_override_youtube column to tracks...');

  try {
    db.exec('ALTER TABLE tracks ADD COLUMN manual_override_youtube TEXT');
    console.log('  Added tracks.manual_override_youtube');
  } catch (error) {
    if (error.message.includes('duplicate column')) {
      console.log('  tracks.manual_override_youtube already exists');
    } else {
      throw error;
    }
  }

  console.log('Adding YouTube auto-link config...');

  try {
    db.prepare(`
      INSERT OR IGNORE INTO admin_system_config (config_key, config_value, config_type, description)
      VALUES (?, ?, ?, ?)
    `).run(
      'youtube_auto_link_enabled',
      'false',
      'system',
      'Enable automatic YouTube Music linking for new playlists'
    );
    console.log('  Added youtube_auto_link_enabled config');
  } catch (error) {
    console.log('  Could not add config:', error.message);
  }

  console.log('');
  console.log('Migration 079 completed successfully!');
  console.log('');
  console.log('YouTube cross-link staging system ready:');
  console.log('  - youtube_crosslink_staging table for dry run results');
  console.log('  - tracks.manual_override_youtube for manual corrections');
  console.log('  - youtube_auto_link_enabled config for future playlists');
  console.log('');
};

export const down = (database) => {
  const db = database ?? getDatabase();

  console.log('Rolling back YouTube cross-link staging...');

  db.exec('DROP TABLE IF EXISTS youtube_crosslink_staging');
  console.log('  Dropped youtube_crosslink_staging table');

  const sqliteVersion = db.prepare('SELECT sqlite_version() as version').get().version;
  const [major, minor] = sqliteVersion.split('.').map(Number);
  const supportsDropColumn = major > 3 || (major === 3 && minor >= 35);

  if (supportsDropColumn) {
    try {
      db.exec('ALTER TABLE tracks DROP COLUMN manual_override_youtube');
      console.log('  Dropped tracks.manual_override_youtube');
    } catch (error) {
      console.log('  Could not drop manual_override_youtube:', error.message);
    }
  } else {
    console.log('  SQLite version does not support DROP COLUMN');
  }

  try {
    db.prepare('DELETE FROM admin_system_config WHERE config_key = ?').run('youtube_auto_link_enabled');
    console.log('  Removed youtube_auto_link_enabled config');
  } catch (error) {
    console.log('  Could not remove config:', error.message);
  }

  console.log('Migration 079 rolled back');
};
