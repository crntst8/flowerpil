import { getDatabase } from '../db.js';

/**
 * Migration 096: Add Meta to OAuth Tokens Platform Constraint
 *
 * SQLite requires table rebuilds to update CHECK constraints.
 * This migration rebuilds the export_oauth_tokens table to include 'meta'.
 */

export const up = (database) => {
  const db = database ?? getDatabase();

  console.log('Updating export_oauth_tokens to support meta platform...');

  db.exec(`
    CREATE TABLE IF NOT EXISTS export_oauth_tokens_v4 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      -- Core token data
      platform TEXT NOT NULL CHECK (platform IN ('spotify', 'tidal', 'apple', 'youtube_music', 'meta')),
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

  const existingTokens = db.prepare('SELECT * FROM export_oauth_tokens').all();

  if (existingTokens.length > 0) {
    console.log(`Migrating ${existingTokens.length} existing token(s)...`);

    const insertStmt = db.prepare(`
      INSERT INTO export_oauth_tokens_v4 (
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

    const migratedCount = db.prepare('SELECT COUNT(*) as count FROM export_oauth_tokens_v4').get().count;

    if (migratedCount !== existingTokens.length) {
      throw new Error(`Migration validation failed: expected ${existingTokens.length} tokens, got ${migratedCount}`);
    }

    console.log(`Migrated ${migratedCount} token(s)`);
  } else {
    console.log('No existing tokens to migrate');
  }

  db.exec('DROP TRIGGER IF EXISTS update_export_oauth_tokens_timestamp');
  db.exec('DROP TABLE export_oauth_tokens');
  db.exec('ALTER TABLE export_oauth_tokens_v4 RENAME TO export_oauth_tokens');

  db.exec('CREATE INDEX IF NOT EXISTS idx_oauth_tokens_v2_platform ON export_oauth_tokens(platform)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_oauth_tokens_v2_account_type ON export_oauth_tokens(account_type)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_oauth_tokens_v2_health ON export_oauth_tokens(health_status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_oauth_tokens_v2_active ON export_oauth_tokens(is_active) WHERE is_active = 1');
  db.exec('CREATE INDEX IF NOT EXISTS idx_oauth_tokens_v2_curator ON export_oauth_tokens(owner_curator_id) WHERE owner_curator_id IS NOT NULL');

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS update_export_oauth_tokens_timestamp
    AFTER UPDATE ON export_oauth_tokens
    BEGIN
      UPDATE export_oauth_tokens
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = NEW.id;
    END;
  `);

  console.log('Migration 096_meta_oauth_constraint completed');
};

export const down = (database) => {
  const db = database ?? getDatabase();

  console.log('Rolling back Meta platform constraint...');

  const metaTokens = db.prepare(
    "SELECT COUNT(*) as count FROM export_oauth_tokens WHERE platform = 'meta'"
  ).get().count;

  if (metaTokens > 0) {
    throw new Error(`Cannot rollback: ${metaTokens} meta token(s) exist. Delete them first.`);
  }

  console.log('No meta tokens found, keeping expanded constraint for safety.');
};
