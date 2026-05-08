// Migration: Add fallback flower color index to curators table

export const up = (db) => {
  const columns = db.prepare("PRAGMA table_info(curators)").all();
  const hasColumn = columns.some(col => col.name === 'fallback_flower_color_index');

  if (!hasColumn) {
    db.prepare(`
      ALTER TABLE curators ADD COLUMN fallback_flower_color_index INTEGER
    `).run();
  }
};

export const down = () => {
  console.warn('Rollback not supported for this migration');
};
