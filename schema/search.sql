-- Flowerpil Search Schema (FTS + freshness scaffolding)
-- Run this script after deploying search features to initialize the supporting tables.

BEGIN;

-- ---------------------------------------------------------------------------
-- Recency/Freshness tracking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS playlist_freshness (
  playlist_id INTEGER PRIMARY KEY,
  latest_track_date TEXT,
  latest_playlist_action TEXT,
  recency_score REAL DEFAULT 0,
  computed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_playlist_freshness_score
  ON playlist_freshness(recency_score DESC, latest_track_date DESC);

-- ---------------------------------------------------------------------------
-- Playlists full-text index
-- ---------------------------------------------------------------------------
CREATE VIRTUAL TABLE IF NOT EXISTS playlists_fts USING fts5(
  title,
  description,
  tags,
  curator_name UNINDEXED,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS playlists_fts_ai
AFTER INSERT ON playlists BEGIN
  INSERT INTO playlists_fts(rowid, title, description, tags, curator_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.title, ''),
    COALESCE(NEW.description, ''),
    COALESCE(NEW.tags, ''),
    COALESCE(NEW.curator_name, '')
  );
END;

CREATE TRIGGER IF NOT EXISTS playlists_fts_au
AFTER UPDATE ON playlists BEGIN
  DELETE FROM playlists_fts WHERE rowid = OLD.id;
  INSERT INTO playlists_fts(rowid, title, description, tags, curator_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.title, ''),
    COALESCE(NEW.description, ''),
    COALESCE(NEW.tags, ''),
    COALESCE(NEW.curator_name, '')
  );
END;

CREATE TRIGGER IF NOT EXISTS playlists_fts_ad
AFTER DELETE ON playlists BEGIN
  DELETE FROM playlists_fts WHERE rowid = OLD.id;
END;

-- ---------------------------------------------------------------------------
-- Tracks full-text index (includes denormalised playlist metadata)
-- ---------------------------------------------------------------------------
CREATE VIRTUAL TABLE IF NOT EXISTS tracks_fts USING fts5(
  title,
  artist_name,
  album,
  genre,
  playlist_title,
  curator_name,
  playlist_id UNINDEXED,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS tracks_fts_ai
AFTER INSERT ON tracks BEGIN
  INSERT INTO tracks_fts(
    rowid,
    title,
    artist_name,
    album,
    genre,
    playlist_title,
    curator_name,
    playlist_id
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.title, ''),
    COALESCE(NEW.artist, ''),
    COALESCE(NEW.album, ''),
    COALESCE(NEW.genre, ''),
    COALESCE((SELECT title FROM playlists WHERE id = NEW.playlist_id), ''),
    COALESCE((SELECT curator_name FROM playlists WHERE id = NEW.playlist_id), ''),
    NEW.playlist_id
  );
END;

CREATE TRIGGER IF NOT EXISTS tracks_fts_au
AFTER UPDATE ON tracks BEGIN
  DELETE FROM tracks_fts WHERE rowid = OLD.id;

  INSERT INTO tracks_fts(
    rowid,
    title,
    artist_name,
    album,
    genre,
    playlist_title,
    curator_name,
    playlist_id
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.title, ''),
    COALESCE(NEW.artist, ''),
    COALESCE(NEW.album, ''),
    COALESCE(NEW.genre, ''),
    COALESCE((SELECT title FROM playlists WHERE id = NEW.playlist_id), ''),
    COALESCE((SELECT curator_name FROM playlists WHERE id = NEW.playlist_id), ''),
    NEW.playlist_id
  );
END;

CREATE TRIGGER IF NOT EXISTS tracks_fts_ad
AFTER DELETE ON tracks BEGIN
  DELETE FROM tracks_fts WHERE rowid = OLD.id;
END;

-- ---------------------------------------------------------------------------
-- Artist and genre projection tables for FTS probing
-- Maintained via sync job (see server/scripts/rebuild-search-index.js)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS search_artists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  normalized_name TEXT NOT NULL UNIQUE,
  track_count INTEGER NOT NULL DEFAULT 0,
  playlist_count INTEGER NOT NULL DEFAULT 0,
  last_synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS search_artist_playlists (
  artist_id INTEGER NOT NULL,
  playlist_id INTEGER NOT NULL,
  track_id INTEGER NOT NULL,
  PRIMARY KEY (artist_id, playlist_id, track_id),
  FOREIGN KEY (artist_id) REFERENCES search_artists(id) ON DELETE CASCADE,
  FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
  FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
);

CREATE VIRTUAL TABLE IF NOT EXISTS artists_fts USING fts5(
  name,
  normalized_name,
  playlist_titles,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TABLE IF NOT EXISTS search_genres (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  normalized_name TEXT NOT NULL UNIQUE,
  playlist_count INTEGER NOT NULL DEFAULT 0,
  track_count INTEGER NOT NULL DEFAULT 0,
  last_synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS search_genre_playlists (
  genre_id INTEGER NOT NULL,
  playlist_id INTEGER NOT NULL,
  track_id INTEGER NOT NULL,
  PRIMARY KEY (genre_id, playlist_id, track_id),
  FOREIGN KEY (genre_id) REFERENCES search_genres(id) ON DELETE CASCADE,
  FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
  FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
);

CREATE VIRTUAL TABLE IF NOT EXISTS genres_fts USING fts5(
  name,
  normalized_name,
  playlist_titles,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TABLE IF NOT EXISTS search_editorials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  preset_query TEXT,
  target_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_search_editorials_active_sort
  ON search_editorials(active, sort_order ASC, updated_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_search_editorials_updated
AFTER UPDATE ON search_editorials
BEGIN
  UPDATE search_editorials
  SET updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.id;
END;

-- ---------------------------------------------------------------------------
-- Curator search projection
-- Maintained via sync job (see server/scripts/rebuild-search-index.js)
-- ---------------------------------------------------------------------------
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

CREATE VIRTUAL TABLE IF NOT EXISTS curators_fts USING fts5(
  name,
  normalized_name,
  profile_type,
  bio,
  playlist_titles,
  tokenize = 'unicode61 remove_diacritics 2'
);

-- Artist/genre/curator FTS projections are refreshed by rebuild-search-index.js.
-- ---------------------------------------------------------------------------
-- Batch rebuild helpers (idempotent)
-- Execute as needed after running sync scripts
-- ---------------------------------------------------------------------------
DELETE FROM playlists_fts;
INSERT INTO playlists_fts(rowid, title, description, tags, curator_name)
SELECT
  id,
  COALESCE(title, ''),
  COALESCE(description, ''),
  COALESCE(tags, ''),
  COALESCE(curator_name, '')
FROM playlists;

DELETE FROM tracks_fts;
INSERT INTO tracks_fts(
  rowid,
  title,
  artist_name,
  album,
  genre,
  playlist_title,
  curator_name,
  playlist_id
)
SELECT
  t.id,
  COALESCE(t.title, ''),
  COALESCE(t.artist, ''),
  COALESCE(t.album, ''),
  COALESCE(t.genre, ''),
  COALESCE(p.title, ''),
  COALESCE(p.curator_name, ''),
  t.playlist_id
FROM tracks t
JOIN playlists p ON p.id = t.playlist_id;

COMMIT;
