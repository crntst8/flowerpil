// Migration: Error Reports System
// Date: 2025-01-XX
// Description: Create error_reports table for capturing and tracking system errors with auto-remediation

export const up = (db) => {
  console.log('🔄 Running migration 054_error_reports - UP');

  // Begin transaction for atomic migration
  db.exec('BEGIN TRANSACTION');

  try {
    console.log('  📝 Creating error_reports table...');
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS error_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        error_type TEXT NOT NULL,
        classification TEXT,
        severity TEXT NOT NULL,
        error_message TEXT NOT NULL,
        error_stack TEXT,
        context_data TEXT,
        suggested_fix TEXT,
        fix_applied BOOLEAN DEFAULT 0,
        fix_result TEXT,
        resolved BOOLEAN DEFAULT 0,
        occurrences INTEGER DEFAULT 1,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('  📊 Creating indexes for error_reports...');
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_error_severity ON error_reports(severity, resolved)',
      'CREATE INDEX IF NOT EXISTS idx_error_class ON error_reports(classification)',
      'CREATE INDEX IF NOT EXISTS idx_error_resolved ON error_reports(resolved, last_seen_at)'
    ];
    
    for (const indexSQL of indexes) {
      db.exec(indexSQL);
    }

    db.exec('COMMIT');
    console.log('✅ Migration 054_error_reports completed successfully');
    
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 054_error_reports failed:', error);
    throw error;
  }
};

export const down = (db) => {
  console.log('🔄 Running migration 054_error_reports - DOWN');

  db.exec('BEGIN TRANSACTION');

  try {
    console.log('  🔄 Dropping indexes...');
    db.exec('DROP INDEX IF EXISTS idx_error_severity');
    db.exec('DROP INDEX IF EXISTS idx_error_class');
    db.exec('DROP INDEX IF EXISTS idx_error_resolved');

    console.log('  🔄 Dropping error_reports table...');
    db.exec('DROP TABLE IF EXISTS error_reports');

    db.exec('COMMIT');
    console.log('✅ Migration 054_error_reports rollback completed');

  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 054_error_reports rollback failed:', error);
    throw error;
  }
};







