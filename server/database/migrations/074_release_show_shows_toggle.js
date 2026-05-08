// Migration: Add show_shows toggle column to releases table
// This allows curators to hide/show the tour dates section independently

export const up = (db) => {
  // Check if column already exists
  const tableInfo = db.prepare("PRAGMA table_info(releases)").all();
  const hasShowShows = tableInfo.some(col => col.name === 'show_shows');

  if (!hasShowShows) {
    db.prepare(`
      ALTER TABLE releases ADD COLUMN show_shows INTEGER DEFAULT 1
    `).run();
  }
};

export const down = (db) => {
  // SQLite doesn't support dropping columns directly
  // For rollback, we'd need to recreate the table
  console.warn('Rollback not supported for this migration');
};
