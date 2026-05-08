// Migration: Landing Page Links
// Date: 2025-12-10
// Description: Create landing_page_links table for custom link cards on the landing page

export const up = (db) => {
  console.log('🔄 Running migration 062_landing_page_links - UP');

  db.exec('BEGIN TRANSACTION');

  try {
    console.log('  📝 Creating landing_page_links table...');

    db.exec(`
      CREATE TABLE IF NOT EXISTS landing_page_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        subtitle TEXT,
        url TEXT NOT NULL,
        image TEXT,
        tags TEXT,
        content_tag TEXT,
        content_tag_color TEXT DEFAULT '#667eea',
        published INTEGER DEFAULT 0,
        priority INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('  ✅ landing_page_links table created successfully');

    // Add indexes for common queries
    console.log('  📝 Creating indexes...');
    db.exec('CREATE INDEX IF NOT EXISTS idx_landing_page_links_published ON landing_page_links(published)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_landing_page_links_priority ON landing_page_links(priority DESC)');
    console.log('  ✅ Indexes created successfully');

    db.exec('COMMIT');
    console.log('✅ Migration 062_landing_page_links completed successfully');

    // Verify migration results
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='landing_page_links'").all();
    if (tables.length > 0) {
      const schemaInfo = db.prepare("PRAGMA table_info(landing_page_links)").all();
      console.log(`📊 Migration results: landing_page_links table created with ${schemaInfo.length} columns`);
    }

  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 062_landing_page_links failed:', error);
    throw error;
  }
};

export const down = (db) => {
  console.log('🔄 Running migration 062_landing_page_links - DOWN');

  db.exec('BEGIN TRANSACTION');

  try {
    console.log('  📝 Dropping landing_page_links table...');
    db.exec('DROP TABLE IF EXISTS landing_page_links');
    console.log('  ✅ landing_page_links table dropped successfully');

    db.exec('COMMIT');
    console.log('✅ Migration 062_landing_page_links rollback completed');

  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 062_landing_page_links rollback failed:', error);
    throw error;
  }
};
