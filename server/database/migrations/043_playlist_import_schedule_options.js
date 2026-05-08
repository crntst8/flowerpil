// Migration: add advanced schedule options for playlist imports
export const up = (db) => {
  db.exec(`
    ALTER TABLE playlist_import_schedules
      ADD COLUMN append_position TEXT NOT NULL DEFAULT 'top'
  `);

  db.exec(`
    ALTER TABLE playlist_import_schedules
      ADD COLUMN update_source_title INTEGER NOT NULL DEFAULT 0
  `);
};

export const down = (db) => {
  db.exec(`
    ALTER TABLE playlist_import_schedules
      DROP COLUMN update_source_title
  `);

  db.exec(`
    ALTER TABLE playlist_import_schedules
      DROP COLUMN append_position
  `);
};
