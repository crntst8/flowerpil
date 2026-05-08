// Migration: Upcoming Releases and Shows for Curator Profiles
// Date: 2025-08-06
// Description: Add upcoming_releases, upcoming_shows, and show_guests tables with section configuration

export const up = (db) => {
  console.log('🔄 Running migration 003_upcoming_releases_and_shows - UP');
  
  // Begin transaction for atomic migration
  db.exec('BEGIN TRANSACTION');
  
  try {
    // 1. Create upcoming_releases table
    console.log('  📝 Creating upcoming_releases table...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS upcoming_releases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        curator_id INTEGER NOT NULL,
        sort_order INTEGER DEFAULT 0,
        title TEXT NOT NULL,
        artwork_url TEXT,
        release_date DATE NOT NULL,
        release_type TEXT CHECK (release_type IN ('Album','EP','Live Recording','Remix','Single')),
        pre_order_url TEXT,
        pre_save_url TEXT,
        info_url TEXT,
        featured_kind TEXT CHECK (featured_kind IN ('SingleDSP','AudioUpload','MusicVideo')),
        featured_url TEXT,
        featured_duration_sec INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (curator_id) REFERENCES curators(id) ON DELETE CASCADE
      )
    `);
    
    // 2. Create upcoming_shows table
    console.log('  📝 Creating upcoming_shows table...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS upcoming_shows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        curator_id INTEGER NOT NULL,
        sort_order INTEGER DEFAULT 0,
        show_date DATE NOT NULL,
        city TEXT NOT NULL,
        country TEXT NOT NULL,
        venue TEXT NOT NULL,
        ticket_url TEXT,
        info_url TEXT,
        sale_indicator TEXT CHECK (sale_indicator IN ('ON_SALE','FIFTY_SOLD','SOLD_OUT')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (curator_id) REFERENCES curators(id) ON DELETE CASCADE
      )
    `);
    
    // 3. Create show_guests table for supporting acts
    console.log('  📝 Creating show_guests table...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS show_guests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        show_id INTEGER NOT NULL,
        sort_order INTEGER DEFAULT 0,
        name TEXT NOT NULL,
        FOREIGN KEY (show_id) REFERENCES upcoming_shows(id) ON DELETE CASCADE
      )
    `);
    
    // 4. Add section configuration columns to curators table
    console.log('  📝 Adding section configuration to curators...');
    const sectionConfigFields = [
      'upcoming_releases_enabled BOOLEAN DEFAULT 1',
      'upcoming_releases_display_order INTEGER DEFAULT 1', 
      'upcoming_releases_open_on_load BOOLEAN DEFAULT 1',
      'upcoming_shows_enabled BOOLEAN DEFAULT 1',
      'upcoming_shows_display_order INTEGER DEFAULT 2',
      'upcoming_shows_open_on_load BOOLEAN DEFAULT 0'
    ];
    
    for (const field of sectionConfigFields) {
      try {
        db.exec(`ALTER TABLE curators ADD COLUMN ${field}`);
      } catch (error) {
        console.log(`    ⚠️  Column might already exist: ${field.split(' ')[0]}`);
      }
    }
    
    // 5. Create performance indexes
    console.log('  📊 Creating indexes...');
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_upcoming_releases_curator ON upcoming_releases(curator_id)',
      'CREATE INDEX IF NOT EXISTS idx_upcoming_releases_date ON upcoming_releases(release_date)',
      'CREATE INDEX IF NOT EXISTS idx_upcoming_releases_sort ON upcoming_releases(curator_id, sort_order)',
      'CREATE INDEX IF NOT EXISTS idx_upcoming_shows_curator ON upcoming_shows(curator_id)',
      'CREATE INDEX IF NOT EXISTS idx_upcoming_shows_date ON upcoming_shows(show_date)',
      'CREATE INDEX IF NOT EXISTS idx_upcoming_shows_sort ON upcoming_shows(curator_id, sort_order)',
      'CREATE INDEX IF NOT EXISTS idx_show_guests_show ON show_guests(show_id)',
      'CREATE INDEX IF NOT EXISTS idx_show_guests_sort ON show_guests(show_id, sort_order)'
    ];
    
    for (const indexSQL of indexes) {
      db.exec(indexSQL);
    }
    
    // 6. Create timestamp update triggers
    console.log('  ⚡ Creating timestamp triggers...');
    
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_releases_timestamp 
      AFTER UPDATE ON upcoming_releases
      BEGIN
        UPDATE upcoming_releases SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END
    `);
    
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_shows_timestamp 
      AFTER UPDATE ON upcoming_shows
      BEGIN
        UPDATE upcoming_shows SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END
    `);
    
    // 7. Insert sample data for existing curators (optional)
    console.log('  🌱 Adding sample data for existing curators...');
    
    // Get all existing curators
    const curators = db.prepare('SELECT id, name FROM curators').all();
    
    for (const curator of curators) {
      // Add a sample upcoming release
      if (curator.name === 'The Examples') {
        db.exec(`
          INSERT INTO upcoming_releases (
            curator_id, title, release_date, release_type, 
            pre_order_url, pre_save_url, featured_kind, featured_url
          ) VALUES (
            ${curator.id}, 
            'BANANA MAN',
            '2025-10-11',
            'Single',
            'https://example.com/preorder',
            'https://example.com/presave',
            'SingleDSP',
            'https://example.com/embed'
          )
        `);
        
        // Add sample upcoming shows
        const showResult = db.prepare(`
          INSERT INTO upcoming_shows (
            curator_id, show_date, city, country, venue, 
            ticket_url, info_url, sale_indicator
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          curator.id, '2025-10-11', 'Brisbane', 'Australia', 
          'THE TIVOLI', 'https://example.com/tickets', 
          'https://example.com/info', 'FIFTY_SOLD'
        );
        
        // Add supporting acts
        const guests = ['SUPPORT ACT 1', 'SUPPORT ACT 2', 'SUPPORT ACT 3'];
        guests.forEach((guest, index) => {
          db.prepare(`
            INSERT INTO show_guests (show_id, sort_order, name) VALUES (?, ?, ?)
          `).run(showResult.lastInsertRowid, index, guest);
        });
      }
    }
    
    db.exec('COMMIT');
    console.log('✅ Migration 003_upcoming_releases_and_shows completed successfully');
    
    // Verify migration results
    const releaseCount = db.prepare('SELECT COUNT(*) as count FROM upcoming_releases').get();
    const showCount = db.prepare('SELECT COUNT(*) as count FROM upcoming_shows').get();
    const guestCount = db.prepare('SELECT COUNT(*) as count FROM show_guests').get();
    
    console.log(`📊 Migration results:`);
    console.log(`   - Upcoming releases: ${releaseCount.count}`);
    console.log(`   - Upcoming shows: ${showCount.count}`);
    console.log(`   - Show guests: ${guestCount.count}`);
    
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 003_upcoming_releases_and_shows failed:', error);
    throw error;
  }
};

export const down = (db) => {
  console.log('🔄 Running migration 003_upcoming_releases_and_shows - DOWN');
  
  db.exec('BEGIN TRANSACTION');
  
  try {
    // Drop triggers
    console.log('  🔄 Dropping triggers...');
    db.exec('DROP TRIGGER IF EXISTS update_releases_timestamp');
    db.exec('DROP TRIGGER IF EXISTS update_shows_timestamp');
    
    // Drop indexes
    console.log('  🔄 Dropping indexes...');
    const dropIndexes = [
      'DROP INDEX IF EXISTS idx_upcoming_releases_curator',
      'DROP INDEX IF EXISTS idx_upcoming_releases_date',
      'DROP INDEX IF EXISTS idx_upcoming_releases_sort',
      'DROP INDEX IF EXISTS idx_upcoming_shows_curator',
      'DROP INDEX IF EXISTS idx_upcoming_shows_date', 
      'DROP INDEX IF EXISTS idx_upcoming_shows_sort',
      'DROP INDEX IF EXISTS idx_show_guests_show',
      'DROP INDEX IF EXISTS idx_show_guests_sort'
    ];
    
    for (const dropSQL of dropIndexes) {
      db.exec(dropSQL);
    }
    
    // Drop tables in correct order (child tables first)
    console.log('  🔄 Dropping tables...');
    db.exec('DROP TABLE IF EXISTS show_guests');
    db.exec('DROP TABLE IF EXISTS upcoming_shows');
    db.exec('DROP TABLE IF EXISTS upcoming_releases');
    
    // Note: We can't easily drop columns in SQLite, so we'll leave the curator config columns
    // They will be ignored by the application if this migration is rolled back
    
    db.exec('COMMIT');
    console.log('✅ Migration 003_upcoming_releases_and_shows rollback completed');
    
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Migration 003_upcoming_releases_and_shows rollback failed:', error);
    throw error;
  }
};