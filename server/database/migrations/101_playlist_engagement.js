/**
 * Playlist engagement tables:
 * - playlist_loves for saved/loved playlists
 * - playlist_comments for basic threaded comments (single-level replies)
 */

export const up = (database) => {
  console.log('Creating playlist engagement tables...');

  database.exec(`
    CREATE TABLE IF NOT EXISTS playlist_loves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playlist_id INTEGER NOT NULL,
      account_id INTEGER NOT NULL,
      account_role TEXT NOT NULL CHECK (account_role IN ('user', 'curator', 'admin')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (playlist_id, account_id, account_role),
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
    );
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_playlist_loves_playlist
      ON playlist_loves(playlist_id);

    CREATE INDEX IF NOT EXISTS idx_playlist_loves_account
      ON playlist_loves(account_id, account_role, created_at DESC);
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS playlist_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playlist_id INTEGER NOT NULL,
      account_id INTEGER NOT NULL,
      account_role TEXT NOT NULL CHECK (account_role IN ('user', 'curator', 'admin')),
      parent_comment_id INTEGER,
      comment_text TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_comment_id) REFERENCES playlist_comments(id) ON DELETE CASCADE
    );
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_playlist_comments_playlist_created
      ON playlist_comments(playlist_id, created_at ASC);

    CREATE INDEX IF NOT EXISTS idx_playlist_comments_parent
      ON playlist_comments(parent_comment_id, created_at ASC);
  `);

  console.log('Playlist engagement tables created');
};

export const down = (database) => {
  console.log('Dropping playlist engagement tables...');

  database.exec('DROP INDEX IF EXISTS idx_playlist_comments_parent');
  database.exec('DROP INDEX IF EXISTS idx_playlist_comments_playlist_created');
  database.exec('DROP INDEX IF EXISTS idx_playlist_loves_account');
  database.exec('DROP INDEX IF EXISTS idx_playlist_loves_playlist');

  database.exec('DROP TABLE IF EXISTS playlist_comments');
  database.exec('DROP TABLE IF EXISTS playlist_loves');

  console.log('Playlist engagement tables dropped');
};

export default { up, down };
