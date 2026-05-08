import { getDatabase } from '../db.js';

/**
 * Migration 042: OAuth Tokens v2 - Token Management Overhaul
 *
 * Context:
 * - Current schema supports one token per platform (UNIQUE constraint)
 * - Need to support multiple accounts: Flowerpil-managed + curator-owned
 * - Need token rotation with primary/backup redundancy
 * - Need health tracking and validation history
 *
 * Strategy: Create-Copy-Rename
 * 1. Create export_oauth_tokens_v2 with enhanced schema
 * 2. Migrate existing tokens with 'flowerpil' account_type
 * 3. Validate migration
 * 4. Rename tables (old -> legacy, v2 -> current)
 *
 * Rollback: Rename tables back if issues detected
 *
 * See: llm/features/wip/dsp-automate/MIGRATION_PLAN.md
 */

const ensureTable = (db, ddl) => {
  try {
    db.exec(ddl);
  } catch (error) {
    const message = String(error?.message || '').toLowerCase();
    if (!message.includes('already exists')) {
      throw error;
    }
  }
};

export const up = (database) => {
  const db = database ?? getDatabase();

  console.log('🔐 Creating export_oauth_tokens_v2 table with enhanced token management...');

  // Step 1: Create new table with v2 schema
  ensureTable(
    db,
    `CREATE TABLE IF NOT EXISTS export_oauth_tokens_v2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      -- Core token data
      platform TEXT NOT NULL CHECK (platform IN ('spotify', 'tidal', 'apple')),
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
    )`
  );

  console.log('✅ export_oauth_tokens_v2 table created');

  // Step 2: Create indexes for new table
  console.log('📑 Creating indexes for export_oauth_tokens_v2...');

  db.exec('CREATE INDEX IF NOT EXISTS idx_oauth_tokens_v2_platform ON export_oauth_tokens_v2(platform)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_oauth_tokens_v2_account_type ON export_oauth_tokens_v2(account_type)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_oauth_tokens_v2_health ON export_oauth_tokens_v2(health_status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_oauth_tokens_v2_active ON export_oauth_tokens_v2(is_active) WHERE is_active = 1');
  db.exec('CREATE INDEX IF NOT EXISTS idx_oauth_tokens_v2_curator ON export_oauth_tokens_v2(owner_curator_id) WHERE owner_curator_id IS NOT NULL');

  console.log('✅ Indexes created');

  // Step 3: Check if old table exists and has data
  const tableExists = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name='export_oauth_tokens'
  `).get();

  if (!tableExists) {
    console.log('ℹ️  No existing export_oauth_tokens table found - fresh installation');
  } else {
    // Step 4: Migrate existing tokens
    const existingTokens = db.prepare('SELECT * FROM export_oauth_tokens').all();

    if (existingTokens.length === 0) {
      console.log('ℹ️  No existing tokens to migrate');
    } else {
      console.log(`📦 Migrating ${existingTokens.length} existing token(s)...`);

      const insertStmt = db.prepare(`
        INSERT INTO export_oauth_tokens_v2 (
          platform, access_token, refresh_token, expires_at,
          account_type, account_label, owner_curator_id,
          health_status, last_validated_at, is_active,
          user_info, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const token of existingTokens) {
        insertStmt.run(
          token.platform,
          token.access_token,
          token.refresh_token,
          token.expires_at,
          'flowerpil',                          // All existing tokens assumed to be Flowerpil-managed
          `legacy-${token.platform}`,           // Label as 'legacy-spotify', 'legacy-tidal', etc.
          null,                                 // Not curator-owned
          'unknown',                            // Health status unknown for legacy tokens
          null,                                 // No historical validation data
          1,                                    // Active by default
          token.user_info,
          token.created_at,
          token.updated_at
        );
      }

      // Step 5: Validate migration
      const migratedCount = db.prepare('SELECT COUNT(*) as count FROM export_oauth_tokens_v2').get().count;

      if (migratedCount !== existingTokens.length) {
        throw new Error(`Migration validation failed: expected ${existingTokens.length} tokens, got ${migratedCount}`);
      }

      console.log(`✅ Successfully migrated ${migratedCount} token(s)`);
    }

    // Step 6: Rename tables (moved outside token migration block)
    console.log('🔄 Renaming tables...');
    db.exec('ALTER TABLE export_oauth_tokens RENAME TO export_oauth_tokens_legacy');
    db.exec('ALTER TABLE export_oauth_tokens_v2 RENAME TO export_oauth_tokens');
    console.log('✅ Tables renamed: export_oauth_tokens_v2 -> export_oauth_tokens');
    console.log('ℹ️  Legacy table preserved as export_oauth_tokens_legacy for rollback');
  }

  // Step 7: Create/update trigger for new table
  console.log('⚡ Creating timestamp trigger...');
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS update_export_oauth_tokens_timestamp
    AFTER UPDATE ON export_oauth_tokens
    BEGIN
      UPDATE export_oauth_tokens
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = NEW.id;
    END;
  `);

  // Step 8: Add job_metadata column to export_requests if not exists
  console.log('📊 Adding job_metadata column to export_requests...');

  try {
    db.exec('ALTER TABLE export_requests ADD COLUMN job_metadata TEXT');
    console.log('✅ job_metadata column added to export_requests');
  } catch (error) {
    if (error.message.includes('duplicate column')) {
      console.log('ℹ️  job_metadata column already exists');
    } else {
      throw error;
    }
  }

  console.log('');
  console.log('✨ Migration 042 completed successfully!');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Update playlistExportRunner.js to use new token selector');
  console.log('  2. Create CLI tools for token management (scripts/dsp/)');
  console.log('  3. Implement health check service');
  console.log('  4. After validation period, drop export_oauth_tokens_legacy table');
  console.log('');
};

export const down = (database) => {
  const db = database ?? getDatabase();

  console.log('🔄 Rolling back OAuth tokens v2 migration...');

  // Check if legacy table exists
  const legacyExists = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name='export_oauth_tokens_legacy'
  `).get();

  if (legacyExists) {
    console.log('📦 Restoring from legacy table...');

    // Drop current table
    db.exec('DROP TABLE IF EXISTS export_oauth_tokens');

    // Restore legacy table
    db.exec('ALTER TABLE export_oauth_tokens_legacy RENAME TO export_oauth_tokens');

    console.log('✅ Restored export_oauth_tokens from legacy backup');
  } else {
    console.log('⚠️  No legacy table found - dropping export_oauth_tokens');
    db.exec('DROP TRIGGER IF EXISTS update_export_oauth_tokens_timestamp');
    db.exec('DROP TABLE IF EXISTS export_oauth_tokens');
  }

  // Remove job_metadata column (SQLite doesn't support DROP COLUMN easily)
  // Just document that it will remain but be unused
  console.log('ℹ️  job_metadata column remains in export_requests (unused)');

  console.log('✅ Migration 042 rolled back successfully');
};
