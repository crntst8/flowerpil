/**
 * Migration 077: Add preview_url to release_actions
 *
 * Adds a preview_url column to store audio preview URLs for platforms like Deezer
 * that provide 30-second track previews for albums/releases.
 */

export async function up(db) {
  // Add preview_url column to release_actions
  db.prepare(`
    ALTER TABLE release_actions ADD COLUMN preview_url TEXT
  `).run();

  console.log('Added preview_url column to release_actions');
}

export async function down(db) {
  // SQLite doesn't support DROP COLUMN directly, but we can note the rollback intent
  console.log('Note: preview_url column would need to be removed manually if rolling back');
}
