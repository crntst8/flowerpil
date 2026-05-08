// Migration: Create curator_referrals table
// Date: 2025-09-01
// Description: Implement referral code system for curator account creation

export const up = async (db) => {
  console.log('🔄 Running migration 032_curator_referrals - UP');
  
  // Begin transaction for atomic migration
  db.exec('BEGIN TRANSACTION');
  
  try {
    // Create curator_referrals table
    console.log('  📝 Creating curator_referrals table...');
    
    await db.exec(`
      CREATE TABLE IF NOT EXISTS curator_referrals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        curator_name TEXT NOT NULL,
        curator_type TEXT NOT NULL,
        email TEXT NOT NULL,
        issued_by_user_id INTEGER,
        issued_by_curator_id INTEGER,
        status TEXT NOT NULL DEFAULT 'unused',
        used_by_user_id INTEGER,
        used_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (issued_by_user_id) REFERENCES admin_users(id),
        FOREIGN KEY (issued_by_curator_id) REFERENCES curators(id),
        FOREIGN KEY (used_by_user_id) REFERENCES admin_users(id)
      )
    `);
    
    // Create indexes for performance
    console.log('  📊 Creating indexes for curator_referrals...');
    const indexes = [
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_referrals_code ON curator_referrals(code)',
      'CREATE INDEX IF NOT EXISTS idx_referrals_email ON curator_referrals(email)',
      'CREATE INDEX IF NOT EXISTS idx_referrals_status ON curator_referrals(status)',
      'CREATE INDEX IF NOT EXISTS idx_referrals_issued_by_user ON curator_referrals(issued_by_user_id)',
      'CREATE INDEX IF NOT EXISTS idx_referrals_issued_by_curator ON curator_referrals(issued_by_curator_id)',
      'CREATE INDEX IF NOT EXISTS idx_referrals_used_by_user ON curator_referrals(used_by_user_id)'
    ];
    
    for (const indexSQL of indexes) {
      db.exec(indexSQL);
    }
    
    db.exec('COMMIT');
    console.log('✅ Migration 032_curator_referrals completed successfully');
    
    // Verify migration results
    const referralCount = db.prepare('SELECT COUNT(*) as count FROM curator_referrals').get();
    console.log(`📊 Migration results: ${referralCount.count} referrals in table`);
    
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 032_curator_referrals failed:', error);
    throw error;
  }
};

export const down = async (db) => {
  console.log('🔄 Running migration 032_curator_referrals - DOWN');
  
  db.exec('BEGIN TRANSACTION');
  
  try {
    // Drop indexes first
    console.log('  🔄 Dropping curator_referrals indexes...');
    const dropIndexes = [
      'DROP INDEX IF EXISTS idx_referrals_code',
      'DROP INDEX IF EXISTS idx_referrals_email',
      'DROP INDEX IF EXISTS idx_referrals_status',
      'DROP INDEX IF EXISTS idx_referrals_issued_by_user',
      'DROP INDEX IF EXISTS idx_referrals_issued_by_curator',
      'DROP INDEX IF EXISTS idx_referrals_used_by_user'
    ];
    
    for (const dropSQL of dropIndexes) {
      db.exec(dropSQL);
    }
    
    // Drop the table
    console.log('  🗑️  Dropping curator_referrals table...');
    await db.exec('DROP TABLE IF EXISTS curator_referrals');
    
    db.exec('COMMIT');
    console.log('✅ Migration 032_curator_referrals rollback completed');
    
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 032_curator_referrals rollback failed:', error);
    throw error;
  }
};