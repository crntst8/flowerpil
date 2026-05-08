export const up = (db) => {
  console.log('Running migration 021: Artist Attribution System');
  
  // Check current schema and only add missing fields
  const tableInfo = db.prepare("PRAGMA table_info(upcoming_releases)").all();
  const existingColumns = tableInfo.map(col => col.name);
  
  if (!existingColumns.includes('artist_name')) {
    db.exec('ALTER TABLE upcoming_releases ADD COLUMN artist_name TEXT;');
    console.log('Added artist_name column');
  }
  
  if (!existingColumns.includes('attribute_to_curator')) {
    db.exec('ALTER TABLE upcoming_releases ADD COLUMN attribute_to_curator BOOLEAN DEFAULT 0;');
    console.log('Added attribute_to_curator column');
  }
  
  if (!existingColumns.includes('artist_curator_id')) {
    db.exec('ALTER TABLE upcoming_releases ADD COLUMN artist_curator_id INTEGER;');
    console.log('Added artist_curator_id column');
  }
  
  // Add index if it doesn't exist
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_upcoming_releases_artist_curator 
      ON upcoming_releases(artist_curator_id);
  `);
  
  console.log('Migration 021: Artist Attribution System completed');
};

export const down = (db) => {
  console.log('Rolling back migration 021: Artist Attribution System');
  
  // Remove artist fields from upcoming_releases table
  // Note: SQLite doesn't support DROP COLUMN, so this would require recreating the table
  // For now, we'll just log the rollback attempt
  console.log('WARNING: SQLite does not support dropping columns. Manual intervention required for full rollback.');
  
  // Drop the index we created
  db.exec(`
    DROP INDEX IF EXISTS idx_upcoming_releases_artist_curator;
  `);
};