/**
 * Migration 103: Add curator search index tables and sync search schema
 *
 * Adds search_curators and curators_fts for curator-inclusive search results.
 * These tables are populated by rebuild-search-index.js.
 */

export function up(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS search_curators (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      curator_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      profile_type TEXT,
      bio TEXT,
      playlist_count INTEGER NOT NULL DEFAULT 0,
      playlist_titles TEXT,
      last_synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Check if curators_fts already exists before creating
  const existing = database.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'curators_fts'"
  ).get();

  if (!existing) {
    database.exec(`
      CREATE VIRTUAL TABLE curators_fts USING fts5(
        name,
        normalized_name,
        profile_type,
        bio,
        playlist_titles,
        tokenize = 'unicode61 remove_diacritics 2'
      );
    `);
  }
}

export function down(database) {
  database.exec(`
    DROP TABLE IF EXISTS curators_fts;
    DROP TABLE IF EXISTS search_curators;
  `);
}
