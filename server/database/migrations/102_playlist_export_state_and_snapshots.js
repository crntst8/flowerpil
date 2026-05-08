const addColumnIfMissing = (database, statement) => {
  try {
    database.exec(statement);
  } catch (error) {
    const message = String(error?.message || '').toLowerCase();
    if (!message.includes('duplicate column name')) {
      throw error;
    }
  }
};

const extractRemotePlaylistId = (platform, url) => {
  const value = String(url || '').trim();
  if (!value) {
    return null;
  }

  const patterns = {
    spotify: /(?:playlist\/|spotify:playlist:)([a-zA-Z0-9]+)/i,
    tidal: /playlist\/([a-f0-9-]+)/i,
    youtube_music: /[?&]list=([a-zA-Z0-9_-]+)/i,
    apple: /\/playlist\/([^/?]+)/i
  };

  const match = value.match(patterns[platform]);
  return match?.[1] || null;
};

const backfillManagedExports = (database) => {
  const rows = database.prepare(`
    SELECT
      id,
      title,
      exported_spotify_url,
      exported_apple_url,
      exported_tidal_url,
      exported_youtube_music_url
    FROM playlists
  `).all();

  const insert = database.prepare(`
    INSERT INTO playlist_dsp_exports (
      playlist_id,
      platform,
      account_type,
      owner_curator_id,
      remote_playlist_id,
      remote_playlist_url,
      remote_playlist_name,
      status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(playlist_id, platform) DO NOTHING
  `);

  const platformFields = [
    ['spotify', 'exported_spotify_url'],
    ['apple', 'exported_apple_url'],
    ['tidal', 'exported_tidal_url'],
    ['youtube_music', 'exported_youtube_music_url']
  ];

  for (const row of rows) {
    for (const [platform, field] of platformFields) {
      const remoteUrl = row[field];
      if (!remoteUrl) {
        continue;
      }

      insert.run(
        row.id,
        platform,
        'flowerpil',
        null,
        extractRemotePlaylistId(platform, remoteUrl),
        remoteUrl,
        row.title || null,
        'active'
      );
    }
  }
};

export const up = (database) => {
  console.log('Running migration 102_playlist_export_state_and_snapshots - UP');

  database.exec(`
    CREATE TABLE IF NOT EXISTS playlist_dsp_exports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playlist_id INTEGER NOT NULL,
      platform TEXT NOT NULL CHECK (platform IN ('spotify', 'apple', 'tidal', 'youtube_music')),
      account_type TEXT NOT NULL DEFAULT 'flowerpil' CHECK (account_type IN ('flowerpil', 'curator')),
      owner_curator_id INTEGER,
      remote_playlist_id TEXT,
      remote_playlist_url TEXT,
      remote_playlist_name TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      last_synced_at DATETIME,
      last_snapshot_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
      FOREIGN KEY (owner_curator_id) REFERENCES curators(id) ON DELETE SET NULL,
      UNIQUE (playlist_id, platform)
    );

    CREATE INDEX IF NOT EXISTS idx_playlist_dsp_exports_playlist
      ON playlist_dsp_exports(playlist_id, platform);
    CREATE INDEX IF NOT EXISTS idx_playlist_dsp_exports_status
      ON playlist_dsp_exports(status);
    CREATE INDEX IF NOT EXISTS idx_playlist_dsp_exports_last_synced
      ON playlist_dsp_exports(last_synced_at DESC);
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS playlist_export_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playlist_id INTEGER NOT NULL,
      platform TEXT NOT NULL CHECK (platform IN ('spotify', 'apple', 'tidal', 'youtube_music')),
      playlist_dsp_export_id INTEGER,
      mode TEXT NOT NULL CHECK (mode IN ('replace_existing', 'create_new')),
      request_id INTEGER,
      account_type TEXT NOT NULL DEFAULT 'flowerpil' CHECK (account_type IN ('flowerpil', 'curator')),
      owner_curator_id INTEGER,
      remote_playlist_id TEXT,
      remote_playlist_url TEXT,
      flowerpil_payload_json TEXT,
      remote_state_json TEXT,
      rollback_capability TEXT NOT NULL DEFAULT 'audit_only' CHECK (rollback_capability IN ('full', 'audit_only')),
      status TEXT NOT NULL DEFAULT 'created',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
      FOREIGN KEY (playlist_dsp_export_id) REFERENCES playlist_dsp_exports(id) ON DELETE SET NULL,
      FOREIGN KEY (owner_curator_id) REFERENCES curators(id) ON DELETE SET NULL,
      FOREIGN KEY (request_id) REFERENCES export_requests(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_playlist_export_snapshots_export
      ON playlist_export_snapshots(playlist_dsp_export_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_playlist_export_snapshots_request
      ON playlist_export_snapshots(request_id);
    CREATE INDEX IF NOT EXISTS idx_playlist_export_snapshots_playlist
      ON playlist_export_snapshots(playlist_id, platform, created_at DESC);
  `);

  addColumnIfMissing(
    database,
    `ALTER TABLE export_requests ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'worker' CHECK (execution_mode IN ('worker', 'inline'))`
  );
  addColumnIfMissing(
    database,
    `ALTER TABLE url_import_jobs ADD COLUMN draft_session_id TEXT`
  );

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_url_import_jobs_dedupe
      ON url_import_jobs(
        owner_curator_id,
        source_url,
        target_playlist_id,
        mode,
        append_position,
        update_metadata,
        created_at DESC
      );
  `);

  backfillManagedExports(database);

  console.log('Migration 102_playlist_export_state_and_snapshots completed');
};

export const down = (database) => {
  console.log('Running migration 102_playlist_export_state_and_snapshots - DOWN');

  database.exec('DROP INDEX IF EXISTS idx_url_import_jobs_dedupe');
  database.exec('DROP INDEX IF EXISTS idx_playlist_export_snapshots_playlist');
  database.exec('DROP INDEX IF EXISTS idx_playlist_export_snapshots_request');
  database.exec('DROP INDEX IF EXISTS idx_playlist_export_snapshots_export');
  database.exec('DROP TABLE IF EXISTS playlist_export_snapshots');
  database.exec('DROP INDEX IF EXISTS idx_playlist_dsp_exports_last_synced');
  database.exec('DROP INDEX IF EXISTS idx_playlist_dsp_exports_status');
  database.exec('DROP INDEX IF EXISTS idx_playlist_dsp_exports_playlist');
  database.exec('DROP TABLE IF EXISTS playlist_dsp_exports');

  console.log('Migration 102_playlist_export_state_and_snapshots rollback completed (columns retained)');
};

export default { up, down };
