import { getDatabase } from '../db.js';

/**
 * Migration 078: Add YouTube Music to OAuth Tokens Platform Constraint
 *
 * Context:
 * - Migration 070 added YouTube Music columns to tracks/playlists
 * - But the export_oauth_tokens platform CHECK constraint was not updated
 * - SQLite requires table rebuild to modify CHECK constraints
 *
 * This migration rebuilds the export_oauth_tokens table to include 'youtube_music'
 * in the platform constraint.
 */

export const up = (database) => {
  const db = database ?? getDatabase();

  console.log('🔐 Updating export_oauth_tokens to support youtube_music platform...');

  // Step 1: Create new table with updated platform constraint
  db.exec(`
    CREATE TABLE IF NOT EXISTS export_oauth_tokens_v3 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      -- Core token data
      platform TEXT NOT NULL CHECK (platform IN ('spotify', 'tidal', 'apple', 'youtube_music')),
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expires_at DATETIME,
      refresh_expires_at DATETIME,

      -- Account classification
      account_type TEXT NOT NULL CHECK (account_type IN ('flowerpil', 'curator')),
      account_label TEXT NOT NULL,
      owner_curator_id INTEGER,

      -- Operational metadata
      health_status TEXT DEFAULT 'unknown' CHECK (health_status IN ('healthy', 'expiring', 'expired', 'revoked', 'unknown')),
      last_validated_at DATETIME,
      is_active INTEGER DEFAULT 1 CHECK (is_active IN (0, 1)),

      -- Legacy compatibility
      user_info TEXT,

      -- Timestamps
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

      -- Constraints
      FOREIGN KEY (owner_curator_id) REFERENCES curators(id) ON DELETE CASCADE,
      UNIQUE(platform, account_type, account_label)
    )
  `);

  console.log('✅ Created export_oauth_tokens_v3 with youtube_music support');

  // Step 2: Copy existing data
  const existingTokens = db.prepare('SELECT * FROM export_oauth_tokens').all();

  if (existingTokens.length > 0) {
    console.log(`📦 Migrating ${existingTokens.length} existing token(s)...`);

    const insertStmt = db.prepare(`
      INSERT INTO export_oauth_tokens_v3 (
        id, platform, access_token, refresh_token, expires_at, refresh_expires_at,
        account_type, account_label, owner_curator_id,
        health_status, last_validated_at, is_active,
        user_info, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const token of existingTokens) {
      insertStmt.run(
        token.id,
        token.platform,
        token.access_token,
        token.refresh_token,
        token.expires_at,
        token.refresh_expires_at,
        token.account_type,
        token.account_label,
        token.owner_curator_id,
        token.health_status,
        token.last_validated_at,
        token.is_active,
        token.user_info,
        token.created_at,
        token.updated_at
      );
    }

    // Validate migration
    const migratedCount = db.prepare('SELECT COUNT(*) as count FROM export_oauth_tokens_v3').get().count;

    if (migratedCount !== existingTokens.length) {
      throw new Error(`Migration validation failed: expected ${existingTokens.length} tokens, got ${migratedCount}`);
    }

    console.log(`✅ Successfully migrated ${migratedCount} token(s)`);
  } else {
    console.log('ℹ️  No existing tokens to migrate');
  }

  // Step 3: Drop trigger, rename tables
  console.log('🔄 Swapping tables...');

  db.exec('DROP TRIGGER IF EXISTS update_export_oauth_tokens_timestamp');
  db.exec('DROP TABLE export_oauth_tokens');
  db.exec('ALTER TABLE export_oauth_tokens_v3 RENAME TO export_oauth_tokens');

  console.log('✅ Tables swapped');

  // Step 4: Recreate indexes
  console.log('📑 Recreating indexes...');

  db.exec('CREATE INDEX IF NOT EXISTS idx_oauth_tokens_v2_platform ON export_oauth_tokens(platform)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_oauth_tokens_v2_account_type ON export_oauth_tokens(account_type)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_oauth_tokens_v2_health ON export_oauth_tokens(health_status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_oauth_tokens_v2_active ON export_oauth_tokens(is_active) WHERE is_active = 1');
  db.exec('CREATE INDEX IF NOT EXISTS idx_oauth_tokens_v2_curator ON export_oauth_tokens(owner_curator_id) WHERE owner_curator_id IS NOT NULL');

  console.log('✅ Indexes created');

  // Step 5: Recreate trigger
  console.log('⚡ Recreating timestamp trigger...');

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS update_export_oauth_tokens_timestamp
    AFTER UPDATE ON export_oauth_tokens
    BEGIN
      UPDATE export_oauth_tokens
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = NEW.id;
    END;
  `);

  console.log('');
  console.log('✨ Migration 078 completed successfully!');
  console.log('   Platform constraint now includes: spotify, tidal, apple, youtube_music');
  console.log('');
};

export const down = (database) => {
  const db = database ?? getDatabase();

  console.log('🔄 Rolling back YouTube Music platform constraint...');

  // Note: We don't roll back to remove youtube_music support
  // as that would break any youtube_music tokens that were created
  console.log('⚠️  This migration cannot be safely rolled back if youtube_music tokens exist.');
  console.log('   Tokens with youtube_music platform would be orphaned.');

  // Check for youtube_music tokens
  const ytTokens = db.prepare(
    "SELECT COUNT(*) as count FROM export_oauth_tokens WHERE platform = 'youtube_music'"
  ).get().count;

  if (ytTokens > 0) {
    throw new Error(`Cannot rollback: ${ytTokens} youtube_music token(s) exist. Delete them first.`);
  }

  // If no youtube_music tokens, we could theoretically rebuild without the constraint
  // but it's not worth the complexity - just leave it as-is
  console.log('ℹ️  No youtube_music tokens found, but keeping expanded constraint for safety.');
  console.log('✅ Migration 078 rollback completed (no-op)');
};
