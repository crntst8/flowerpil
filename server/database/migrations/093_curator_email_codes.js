/**
 * Migration 093: Curator Email Codes
 *
 * Creates table for storing email verification codes during open curator signup.
 * Unlike email_codes (tied to users table), this is email-based for pre-signup verification.
 */

export const up = async (db) => {
  // Create curator_email_codes table
  db.exec(`
    CREATE TABLE IF NOT EXISTS curator_email_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      attempts INTEGER DEFAULT 0,
      expires_at DATETIME NOT NULL,
      verified_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      request_ip TEXT
    );
  `);

  // Indexes for efficient lookups
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_curator_email_codes_email ON curator_email_codes(email);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_curator_email_codes_expires ON curator_email_codes(expires_at);
  `);

  console.log('[Migration 093] Created curator_email_codes table');
};

export const down = async (db) => {
  db.exec(`DROP TABLE IF EXISTS curator_email_codes;`);
  console.log('[Migration 093] Dropped curator_email_codes table');
};
