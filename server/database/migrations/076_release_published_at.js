// Migration: Add published_at column to releases table
// This allows the homepage feed to order by publication date rather than release date

export const up = (db) => {
  const columns = db.prepare("PRAGMA table_info(releases)").all();
  const hasColumn = columns.some(col => col.name === 'published_at');

  if (!hasColumn) {
    console.log('  Adding published_at column to releases...');

    db.prepare(`
      ALTER TABLE releases ADD COLUMN published_at TEXT
    `).run();

    // Backfill: set published_at to updated_at for already-published releases
    db.prepare(`
      UPDATE releases
      SET published_at = updated_at
      WHERE is_published = 1 AND published_at IS NULL
    `).run();

    console.log('    Done');
  }
};

export const down = () => {
  console.warn('Rollback not supported for this migration');
};
