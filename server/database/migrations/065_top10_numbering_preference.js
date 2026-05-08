export async function up(db) {
  console.log('🔢 Adding numbering_preference column to top10_playlists table...');

  // SQLite doesn't support ADD COLUMN with CHECK constraint directly
  // We need to:
  // 1. Add the column
  // 2. Set default values
  // 3. Add constraint via table recreation (if needed in future)

  // Add numbering_preference column
  db.exec(`
    ALTER TABLE top10_playlists
    ADD COLUMN numbering_preference TEXT DEFAULT 'desc' NOT NULL;
  `);

  // Update any existing rows to have the default value
  db.exec(`
    UPDATE top10_playlists
    SET numbering_preference = 'desc'
    WHERE numbering_preference IS NULL;
  `);

  console.log('✅ numbering_preference column added successfully');
  console.log('   Valid values: desc (10→1), asc (1→10), none (no numbers)');
  console.log('   Default: desc');
}

export async function down(db) {
  console.log('🔄 Removing numbering_preference column from top10_playlists table...');

  // SQLite doesn't support DROP COLUMN directly in older versions
  // For newer SQLite versions (3.35.0+), we can use:
  try {
    db.exec(`
      ALTER TABLE top10_playlists
      DROP COLUMN numbering_preference;
    `);
    console.log('✅ numbering_preference column dropped successfully');
  } catch (error) {
    // If DROP COLUMN not supported, we would need table recreation
    // For now, log the error and continue
    console.log('⚠️  Could not drop column (older SQLite version)');
    console.log('   Column will remain but is not used');
  }
}
