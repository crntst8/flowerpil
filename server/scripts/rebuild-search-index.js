#!/usr/bin/env node
/**
 * Rebuild Flowerpil search index tables (FTS5 + projection helpers).
 * Safe to run during deployment or as a nightly cron task.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDatabase } from '../database/db.js';

const db = getDatabase();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '../..');
const schemaPath = path.join(projectRoot, 'schema', 'search.sql');

if (!fs.existsSync(schemaPath)) {
  throw new Error(`Search schema file not found at ${schemaPath}`);
}

const schemaSql = fs.readFileSync(schemaPath, 'utf-8');

const dropSearchTriggersSql = `
  DROP TRIGGER IF EXISTS playlists_fts_ai;
  DROP TRIGGER IF EXISTS playlists_fts_au;
  DROP TRIGGER IF EXISTS playlists_fts_ad;
  DROP TRIGGER IF EXISTS tracks_fts_ai;
  DROP TRIGGER IF EXISTS tracks_fts_au;
  DROP TRIGGER IF EXISTS tracks_fts_ad;
  DROP TRIGGER IF EXISTS search_artists_ai;
  DROP TRIGGER IF EXISTS search_artists_au;
  DROP TRIGGER IF EXISTS search_artists_ad;
  DROP TRIGGER IF EXISTS search_artist_playlists_ai;
  DROP TRIGGER IF EXISTS search_artist_playlists_ad;
  DROP TRIGGER IF EXISTS search_genres_ai;
  DROP TRIGGER IF EXISTS search_genres_au;
  DROP TRIGGER IF EXISTS search_genres_ad;
  DROP TRIGGER IF EXISTS search_genre_playlists_ai;
  DROP TRIGGER IF EXISTS search_genre_playlists_ad;
  DROP TRIGGER IF EXISTS search_curators_ai;
  DROP TRIGGER IF EXISTS search_curators_au;
  DROP TRIGGER IF EXISTS search_curators_ad;
`;

const applySearchSchema = () => {
  db.exec(dropSearchTriggersSql);
  db.exec(schemaSql);
  console.log('[search:index] search schema applied');
};

const disableSearchTriggers = () => {
  db.exec(dropSearchTriggersSql);
};

const resetSearchProjectionTables = () => {
  applySearchSchema();
  disableSearchTriggers();
  db.exec(`
    DELETE FROM search_artist_playlists;
    DELETE FROM search_artists;
    DELETE FROM artists_fts;
    DELETE FROM search_genre_playlists;
    DELETE FROM search_genres;
    DELETE FROM genres_fts;
  `);
  try {
    db.exec('DELETE FROM search_curators');
    db.exec('DELETE FROM curators_fts');
  } catch (_) {
    // Tables may not exist on first run before schema is applied
  }
  applySearchSchema();
};

const splitTokens = (raw = '') => {
  if (!raw) return [];
  return raw
    .split(/[,;/&]|feat\.|ft\.|vs\.|with|\u00d7|\u00b7/gi)
    .map(part => part.trim())
    .filter(Boolean);
};

const normalize = (value = '') => value.trim().toLowerCase();

const rebuildPlaylistsFts = () => {
  const playlists = db.prepare(`
    SELECT id, title, description, tags, curator_name
    FROM playlists
  `).all();

  const insert = db.prepare(`
    INSERT INTO playlists_fts(rowid, title, description, tags, curator_name)
    VALUES (?, ?, ?, ?, ?)
  `);

  db.prepare('DELETE FROM playlists_fts').run();

  const insertMany = db.transaction(rows => {
    rows.forEach(row => {
      insert.run(
        row.id,
        row.title ?? '',
        row.description ?? '',
        row.tags ?? '',
        row.curator_name ?? ''
      );
    });
  });

  insertMany(playlists);
  console.log(`[search:index] playlists_fts rebuilt (${playlists.length} rows)`);
};

const rebuildTracksFts = () => {
  const tracks = db.prepare(`
    SELECT
      t.id,
      t.title,
      t.artist,
      t.album,
      t.genre,
      p.title AS playlist_title,
      p.curator_name,
      t.playlist_id
    FROM tracks t
    JOIN playlists p ON p.id = t.playlist_id
  `).all();

  const insert = db.prepare(`
    INSERT INTO tracks_fts(
      rowid,
      title,
      artist_name,
      album,
      genre,
      playlist_title,
      curator_name,
      playlist_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.prepare('DELETE FROM tracks_fts').run();

  const insertMany = db.transaction(rows => {
    rows.forEach(row => {
      insert.run(
        row.id,
        row.title ?? '',
        row.artist ?? '',
        row.album ?? '',
        row.genre ?? '',
        row.playlist_title ?? '',
        row.curator_name ?? '',
        row.playlist_id
      );
    });
  });

  insertMany(tracks);
  console.log(`[search:index] tracks_fts rebuilt (${tracks.length} rows)`);
};

const rebuildArtistsIndex = () => {
  const rows = db.prepare(`
    SELECT id, playlist_id, artist
    FROM tracks
    WHERE artist IS NOT NULL
      AND TRIM(artist) != ''
  `).all();

  const trackToPlaylist = new Map();
  rows.forEach(({ id, playlist_id }) => {
    if (playlist_id) {
      trackToPlaylist.set(id, playlist_id);
    }
  });

  const artistMap = new Map();

  const playlistLookup = new Map(
    db.prepare('SELECT id, COALESCE(title, \'\') AS title FROM playlists').all()
      .map(({ id, title }) => [id, title])
  );

  rows.forEach(({ id, playlist_id, artist }) => {
    const names = splitTokens(artist);
    names.forEach(name => {
      const normalized = normalize(name);
      if (!normalized) return;
      if (!artistMap.has(normalized)) {
        artistMap.set(normalized, {
          id: null,
          name: name.trim(),
          normalized,
          trackIds: new Set(),
          playlistIds: new Set()
        });
      }
      const entry = artistMap.get(normalized);
      entry.trackIds.add(id);
      entry.playlistIds.add(playlist_id);
    });
  });

  const insertArtist = db.prepare(`
    INSERT INTO search_artists (name, normalized_name, track_count, playlist_count, last_synced_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);
  const insertArtistPlaylist = db.prepare(`
    INSERT OR IGNORE INTO search_artist_playlists (artist_id, playlist_id, track_id)
    VALUES (?, ?, ?)
  `);

  const assignIds = db.transaction(() => {
    for (const entry of artistMap.values()) {
      const info = insertArtist.run(
        entry.name,
        entry.normalized,
        entry.trackIds.size,
        entry.playlistIds.size
      );
      entry.id = info.lastInsertRowid;
    }
  });

  assignIds();

  const linkArtists = db.transaction(() => {
    for (const entry of artistMap.values()) {
      entry.trackIds.forEach(trackId => {
        const playlistId = trackToPlaylist.get(trackId);
        if (!playlistId) return;
        insertArtistPlaylist.run(entry.id, playlistId, trackId);
      });
    }
  });

  linkArtists();

  const insertArtistFts = db.prepare(`
    INSERT INTO artists_fts (rowid, name, normalized_name, playlist_titles)
    VALUES (?, ?, ?, ?)
  `);

  const populateArtistFts = db.transaction(() => {
    for (const entry of artistMap.values()) {
      const titles = Array.from(entry.playlistIds)
        .map(id => playlistLookup.get(id))
        .filter(Boolean);
      const uniqueTitles = Array.from(new Set(titles));
      const playlistTitles = uniqueTitles.join(' | ');
      insertArtistFts.run(entry.id, entry.name, entry.normalized, playlistTitles);
    }
  });

  populateArtistFts();
  console.log(`[search:index] artists indexed (${artistMap.size} unique names)`);
};

const rebuildGenresIndex = () => {
  const trackRows = db.prepare(`
    SELECT id, playlist_id, genre
    FROM tracks
    WHERE genre IS NOT NULL
      AND TRIM(genre) != ''
  `).all();

  const playlistTags = db.prepare(`
    SELECT id, tags
    FROM playlists
    WHERE tags IS NOT NULL
      AND TRIM(tags) != ''
  `).all();

  const genreMap = new Map();

  const pushGenre = (name, playlistId, trackId = null) => {
    const normalized = normalize(name);
    if (!normalized) return;
    if (!genreMap.has(normalized)) {
      genreMap.set(normalized, {
        id: null,
        name: name.trim(),
        normalized,
        trackIds: new Set(),
        playlistIds: new Set()
      });
    }
    const entry = genreMap.get(normalized);
    if (playlistId) entry.playlistIds.add(playlistId);
    if (trackId) entry.trackIds.add(trackId);
  };

  trackRows.forEach(({ id, playlist_id, genre }) => {
    splitTokens(genre).forEach(token => pushGenre(token, playlist_id, id));
  });

  playlistTags.forEach(({ id, tags }) => {
    splitTokens(tags).forEach(token => pushGenre(token, id, null));
  });

  const insertGenre = db.prepare(`
    INSERT INTO search_genres (name, normalized_name, playlist_count, track_count, last_synced_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);
  const insertGenrePlaylist = db.prepare(`
    INSERT OR IGNORE INTO search_genre_playlists (genre_id, playlist_id, track_id)
    VALUES (?, ?, COALESCE(?, -1))
  `);

  const assignIds = db.transaction(() => {
    for (const entry of genreMap.values()) {
      const info = insertGenre.run(
        entry.name,
        entry.normalized,
        entry.playlistIds.size,
        entry.trackIds.size
      );
      entry.id = info.lastInsertRowid;
    }
  });

  assignIds();

  const trackToPlaylist = new Map();
  trackRows.forEach(({ id, playlist_id }) => {
    if (playlist_id) {
      trackToPlaylist.set(id, playlist_id);
    }
  });

  const playlistLookup = new Map(
    db.prepare('SELECT id, COALESCE(title, \'\') AS title FROM playlists').all()
      .map(({ id, title }) => [id, title])
  );

  const linkGenres = db.transaction(() => {
    for (const entry of genreMap.values()) {
      if (!entry.playlistIds.size && !entry.trackIds.size) continue;
      const trackIds = entry.trackIds.size ? Array.from(entry.trackIds) : [];

      // Link via tracks
      trackIds.forEach(trackId => {
        const playlistId = trackToPlaylist.get(trackId);
        if (!playlistId) return;
        insertGenrePlaylist.run(entry.id, playlistId, trackId);
      });

      // Link tag-only playlists (no track carries this genre, but playlist is tagged)
      const trackLinkedPlaylists = new Set(trackIds.map(tid => trackToPlaylist.get(tid)).filter(Boolean));
      for (const playlistId of entry.playlistIds) {
        if (!trackLinkedPlaylists.has(playlistId)) {
          insertGenrePlaylist.run(entry.id, playlistId, -1);
        }
      }
    }
  });

  linkGenres();

  const insertGenreFts = db.prepare(`
    INSERT INTO genres_fts (rowid, name, normalized_name, playlist_titles)
    VALUES (?, ?, ?, ?)
  `);

  const populateGenreFts = db.transaction(() => {
    for (const entry of genreMap.values()) {
      const titles = Array.from(entry.playlistIds)
        .map(id => playlistLookup.get(id))
        .filter(Boolean);
      const uniqueTitles = Array.from(new Set(titles));
      const playlistTitles = uniqueTitles.join(' | ');
      insertGenreFts.run(entry.id, entry.name, entry.normalized, playlistTitles);
    }
  });

  populateGenreFts();
  console.log(`[search:index] genres indexed (${genreMap.size} unique tags)`);
};

const rebuildCuratorsIndex = () => {
  const curators = db.prepare(`
    SELECT
      c.id,
      c.name,
      LOWER(TRIM(c.name)) AS normalized_name,
      c.profile_type,
      COALESCE(c.bio, '') AS bio
    FROM curators c
    WHERE c.name IS NOT NULL AND TRIM(c.name) != ''
  `).all();

  const playlistLookup = new Map(
    db.prepare(`
      SELECT curator_id, GROUP_CONCAT(title, ' | ') AS titles, COUNT(*) AS cnt
      FROM playlists
      WHERE published = 1
      GROUP BY curator_id
    `).all().map(row => [row.curator_id, { titles: row.titles, count: row.cnt }])
  );

  const insertCurator = db.prepare(`
    INSERT INTO search_curators (curator_id, name, normalized_name, profile_type, bio, playlist_count, playlist_titles, last_synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);
  const insertCuratorFts = db.prepare(`
    INSERT INTO curators_fts (rowid, name, normalized_name, profile_type, bio, playlist_titles)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const populateCurators = db.transaction(() => {
    for (const cur of curators) {
      const plData = playlistLookup.get(cur.id) || { titles: '', count: 0 };
      const info = insertCurator.run(
        cur.id,
        cur.name,
        cur.normalized_name,
        cur.profile_type || '',
        cur.bio,
        plData.count,
        plData.titles || ''
      );
      insertCuratorFts.run(
        Number(info.lastInsertRowid),
        cur.name,
        cur.normalized_name,
        cur.profile_type || '',
        cur.bio,
        plData.titles || ''
      );
    }
  });

  populateCurators();
  console.log(`[search:index] curators indexed (${curators.length} profiles)`);
};

const rebuild = () => {
  resetSearchProjectionTables();
  rebuildPlaylistsFts();
  rebuildTracksFts();
  rebuildArtistsIndex();
  rebuildGenresIndex();
  rebuildCuratorsIndex();
  console.log('[search:index] rebuild complete');
};

rebuild();
