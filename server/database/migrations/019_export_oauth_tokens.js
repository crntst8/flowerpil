export async function up(db) {
  console.log('🔐 Creating export_oauth_tokens table for playlist export authentication...');

  // Create export OAuth tokens table
  db.exec(`
    CREATE TABLE IF NOT EXISTS export_oauth_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL, -- 'spotify' | 'tidal'
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expires_at DATETIME,
      user_info TEXT, -- JSON: {id, display_name, etc}
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(platform) -- Only one token per platform
    );
  `);

  // Create index for platform lookups
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_export_oauth_tokens_platform
    ON export_oauth_tokens(platform);
  `);

  // Create trigger to update updated_at timestamp
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS update_export_oauth_tokens_timestamp
    AFTER UPDATE ON export_oauth_tokens
    BEGIN
      UPDATE export_oauth_tokens
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = NEW.id;
    END;
  `);

  console.log('✅ Export OAuth tokens table created successfully');
}

export async function down(db) {
  console.log('🔄 Dropping export_oauth_tokens table...');

  // Drop trigger first
  db.exec('DROP TRIGGER IF EXISTS update_export_oauth_tokens_timestamp;');

  // Drop index
  db.exec('DROP INDEX IF EXISTS idx_export_oauth_tokens_platform;');

  // Drop table
  db.exec('DROP TABLE IF EXISTS export_oauth_tokens;');

  console.log('✅ Export OAuth tokens table dropped successfully');
}
