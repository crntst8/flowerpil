export async function up(db) {
  console.log('🗑️  Dropping deprecated lists and list_items tables...');

  // Drop list_items table first (has foreign key to lists)
  db.exec('DROP TABLE IF EXISTS list_items;');
  console.log('   ✓ Dropped list_items table');

  // Drop lists table
  db.exec('DROP TABLE IF EXISTS lists;');
  console.log('   ✓ Dropped lists table');

  console.log('✅ Deprecated lists tables dropped successfully');
}

export async function down(db) {
  console.log('🔄 Recreating lists and list_items tables...');

  // Recreate lists table (basic structure for rollback)
  db.exec(`
    CREATE TABLE IF NOT EXISTS lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Recreate list_items table
  db.exec(`
    CREATE TABLE IF NOT EXISTS list_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      list_id INTEGER NOT NULL,
      track_id INTEGER,
      position INTEGER NOT NULL,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
    );
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_lists_user_id
    ON lists(user_id);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_list_items_list_id
    ON list_items(list_id);
  `);

  console.log('✅ Lists tables recreated successfully');
}
