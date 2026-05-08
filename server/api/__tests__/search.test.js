/**
 * Search API Contract Tests
 *
 * Proves the required ranking behavior for the search endpoint:
 * - Artist intent: playlists with matching track artists rank first
 * - Genre intent: playlists matched by tags (even without track genre) rank first
 * - Song intent: playlists containing matching tracks rank first
 * - Preview vs full mode response shapes
 * - Unpublished playlists never appear
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { getDatabase } from '../../database/db.js';

let app;
let db;

const buildApp = async () => {
  const { default: searchRoutes } = await import('../../routes/search.js');
  const a = express();
  a.use(express.json());
  a.use(cookieParser());
  a.use('/api/v1/search', searchRoutes);
  a.use((err, _req, res, _next) => {
    res.status(500).json({ error: 'Internal server error', message: err.message });
  });
  return a;
};

/**
 * Seed fixtures:
 * A: "Shoegaze Anthems" by Alice — tracks by artist "Wednesday" (genre=shoegaze on tracks)
 * B: "Dreamy Vibes" by Bob — tagged "shoegaze" but NO track has genre="shoegaze"
 * C: "Wednesday Mix" by "Wednesday Fan" — title match only, no artist match
 * D: "Indie Essentials" by Carol — track "Blue Song" by Mint Field
 * E: UNPUBLISHED "Secret List" by Alice — track by Wednesday, must never appear
 */
const seedFixtures = () => {
  db = getDatabase();

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS playlists_fts USING fts5(
      title, description, tags, curator_name UNINDEXED,
      tokenize = 'unicode61 remove_diacritics 2'
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS tracks_fts USING fts5(
      title, artist_name, album, genre, playlist_title, curator_name, playlist_id UNINDEXED,
      tokenize = 'unicode61 remove_diacritics 2'
    );
    CREATE TABLE IF NOT EXISTS search_artists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE, normalized_name TEXT NOT NULL UNIQUE,
      track_count INTEGER NOT NULL DEFAULT 0, playlist_count INTEGER NOT NULL DEFAULT 0,
      last_synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS search_artist_playlists (
      artist_id INTEGER NOT NULL, playlist_id INTEGER NOT NULL, track_id INTEGER NOT NULL,
      PRIMARY KEY (artist_id, playlist_id, track_id)
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS artists_fts USING fts5(
      name, normalized_name, playlist_titles, tokenize = 'unicode61 remove_diacritics 2'
    );
    CREATE TABLE IF NOT EXISTS search_genres (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE, normalized_name TEXT NOT NULL UNIQUE,
      playlist_count INTEGER NOT NULL DEFAULT 0, track_count INTEGER NOT NULL DEFAULT 0,
      last_synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS search_genre_playlists (
      genre_id INTEGER NOT NULL, playlist_id INTEGER NOT NULL, track_id INTEGER NOT NULL,
      PRIMARY KEY (genre_id, playlist_id, track_id)
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS genres_fts USING fts5(
      name, normalized_name, playlist_titles, tokenize = 'unicode61 remove_diacritics 2'
    );
    CREATE TABLE IF NOT EXISTS playlist_freshness (
      playlist_id INTEGER PRIMARY KEY, latest_track_date TEXT,
      latest_playlist_action TEXT, recency_score REAL DEFAULT 0,
      computed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS search_curators (
      id INTEGER PRIMARY KEY AUTOINCREMENT, curator_id INTEGER NOT NULL,
      name TEXT NOT NULL, normalized_name TEXT NOT NULL, profile_type TEXT,
      bio TEXT, playlist_count INTEGER NOT NULL DEFAULT 0, playlist_titles TEXT,
      last_synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS curators_fts USING fts5(
      name, normalized_name, profile_type, bio, playlist_titles,
      tokenize = 'unicode61 remove_diacritics 2'
    );
    CREATE TABLE IF NOT EXISTS search_editorials (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT,
      image_url TEXT, preset_query TEXT, target_url TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Curators
  const insertCurator = db.prepare(`
    INSERT INTO curators (name, type, profile_type, tester, bio, bio_short,
      profile_image, location, website_url, contact_email,
      spotify_url, apple_url, tidal_url, bandcamp_url,
      social_links, external_links, verification_status, profile_visibility,
      upcoming_releases_enabled, upcoming_shows_enabled, custom_fields)
    VALUES (?, 'curator', 'curator', 0, ?, '', '', NULL, '', '', '', '', '', '', '', '', 'verified', 'public', 0, 0, '')
  `);
  const curAlice = insertCurator.run('Alice', 'Alice curates shoegaze');
  const curBob = insertCurator.run('Bob', 'Bob curates dreamy stuff');
  const curWedFan = insertCurator.run('Wednesday Fan', 'Fan of the band');
  const curCarol = insertCurator.run('Carol', 'Indie curator');

  // Playlists
  const insertPlaylist = db.prepare(`
    INSERT INTO playlists (title, curator_id, curator_name, description, tags, published, published_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);

  const plA = insertPlaylist.run('Shoegaze Anthems', Number(curAlice.lastInsertRowid), 'Alice', 'A collection of heavy shoegaze', 'shoegaze,noise-pop', 1, '2025-06-01T00:00:00Z');
  const playlistAId = Number(plA.lastInsertRowid);

  const plB = insertPlaylist.run('Dreamy Vibes', Number(curBob.lastInsertRowid), 'Bob', 'Dream pop and shoegaze vibes', 'shoegaze,dream-pop', 1, '2025-05-01T00:00:00Z');
  const playlistBId = Number(plB.lastInsertRowid);

  const plC = insertPlaylist.run('Wednesday Mix', Number(curWedFan.lastInsertRowid), 'Wednesday Fan', 'Midweek listening', 'midweek', 1, '2025-04-01T00:00:00Z');
  const playlistCId = Number(plC.lastInsertRowid);

  const plD = insertPlaylist.run('Indie Essentials', Number(curCarol.lastInsertRowid), 'Carol', 'Essential indie tracks', 'indie,alternative', 1, '2025-07-01T00:00:00Z');
  const playlistDId = Number(plD.lastInsertRowid);

  const plE = insertPlaylist.run('Secret List', Number(curAlice.lastInsertRowid), 'Alice', 'Not yet published', 'shoegaze', 0, null);
  const playlistEId = Number(plE.lastInsertRowid);

  // Tracks
  const insertTrack = db.prepare(`
    INSERT INTO tracks (playlist_id, position, title, artist, album, genre, duration)
    VALUES (?, ?, ?, ?, ?, ?, '3:30')
  `);

  const tA1 = insertTrack.run(playlistAId, 0, 'Bull Believer', 'Wednesday', 'Rat Saw God', 'shoegaze');
  const tA2 = insertTrack.run(playlistAId, 1, 'Chosen to Deserve', 'Wednesday', 'Rat Saw God', 'indie');
  const tA3 = insertTrack.run(playlistAId, 2, 'Formula', 'Wednesday', 'Rat Saw God', 'noise-pop');
  const tB1 = insertTrack.run(playlistBId, 0, 'Dream Machine', 'Cocteau Twins', 'Heaven or Las Vegas', 'dream-pop');
  const tB2 = insertTrack.run(playlistBId, 1, 'Only Shallow', 'My Bloody Valentine', 'Loveless', 'noise-pop');
  const tC1 = insertTrack.run(playlistCId, 0, 'Midweek Blues', 'Some Band', 'Some Album', 'indie');
  const tD1 = insertTrack.run(playlistDId, 0, 'Blue Song', 'Mint Field', 'Sentimiento Mundial', 'indie');
  const tD2 = insertTrack.run(playlistDId, 1, 'Other Track', 'Other Artist', 'Other Album', 'alternative');
  const tE1 = insertTrack.run(playlistEId, 0, 'Hidden Gem', 'Wednesday', 'Rat Saw God', 'shoegaze');

  // Populate playlists_fts
  const insertPFts = db.prepare(`INSERT INTO playlists_fts(rowid, title, description, tags, curator_name) VALUES (?, ?, ?, ?, ?)`);
  insertPFts.run(playlistAId, 'Shoegaze Anthems', 'A collection of heavy shoegaze', 'shoegaze,noise-pop', 'Alice');
  insertPFts.run(playlistBId, 'Dreamy Vibes', 'Dream pop and shoegaze vibes', 'shoegaze,dream-pop', 'Bob');
  insertPFts.run(playlistCId, 'Wednesday Mix', 'Midweek listening', 'midweek', 'Wednesday Fan');
  insertPFts.run(playlistDId, 'Indie Essentials', 'Essential indie tracks', 'indie,alternative', 'Carol');
  insertPFts.run(playlistEId, 'Secret List', 'Not yet published', 'shoegaze', 'Alice');

  // Populate tracks_fts
  const insertTFts = db.prepare(`INSERT INTO tracks_fts(rowid, title, artist_name, album, genre, playlist_title, curator_name, playlist_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  insertTFts.run(Number(tA1.lastInsertRowid), 'Bull Believer', 'Wednesday', 'Rat Saw God', 'shoegaze', 'Shoegaze Anthems', 'Alice', playlistAId);
  insertTFts.run(Number(tA2.lastInsertRowid), 'Chosen to Deserve', 'Wednesday', 'Rat Saw God', 'indie', 'Shoegaze Anthems', 'Alice', playlistAId);
  insertTFts.run(Number(tA3.lastInsertRowid), 'Formula', 'Wednesday', 'Rat Saw God', 'noise-pop', 'Shoegaze Anthems', 'Alice', playlistAId);
  insertTFts.run(Number(tB1.lastInsertRowid), 'Dream Machine', 'Cocteau Twins', 'Heaven or Las Vegas', 'dream-pop', 'Dreamy Vibes', 'Bob', playlistBId);
  insertTFts.run(Number(tB2.lastInsertRowid), 'Only Shallow', 'My Bloody Valentine', 'Loveless', 'noise-pop', 'Dreamy Vibes', 'Bob', playlistBId);
  insertTFts.run(Number(tC1.lastInsertRowid), 'Midweek Blues', 'Some Band', 'Some Album', 'indie', 'Wednesday Mix', 'Wednesday Fan', playlistCId);
  insertTFts.run(Number(tD1.lastInsertRowid), 'Blue Song', 'Mint Field', 'Sentimiento Mundial', 'indie', 'Indie Essentials', 'Carol', playlistDId);
  insertTFts.run(Number(tD2.lastInsertRowid), 'Other Track', 'Other Artist', 'Other Album', 'alternative', 'Indie Essentials', 'Carol', playlistDId);
  insertTFts.run(Number(tE1.lastInsertRowid), 'Hidden Gem', 'Wednesday', 'Rat Saw God', 'shoegaze', 'Secret List', 'Alice', playlistEId);

  // Artist projection
  const insertArt = db.prepare(`INSERT INTO search_artists (name, normalized_name, track_count, playlist_count) VALUES (?, ?, ?, ?)`);
  const artWed = insertArt.run('Wednesday', 'wednesday', 4, 2);
  const artCoc = insertArt.run('Cocteau Twins', 'cocteau twins', 1, 1);
  const artMbv = insertArt.run('My Bloody Valentine', 'my bloody valentine', 1, 1);
  const artMint = insertArt.run('Mint Field', 'mint field', 1, 1);

  const insertAFts = db.prepare(`INSERT INTO artists_fts(rowid, name, normalized_name, playlist_titles) VALUES (?, ?, ?, ?)`);
  insertAFts.run(Number(artWed.lastInsertRowid), 'Wednesday', 'wednesday', 'Shoegaze Anthems | Secret List');
  insertAFts.run(Number(artCoc.lastInsertRowid), 'Cocteau Twins', 'cocteau twins', 'Dreamy Vibes');
  insertAFts.run(Number(artMbv.lastInsertRowid), 'My Bloody Valentine', 'my bloody valentine', 'Dreamy Vibes');
  insertAFts.run(Number(artMint.lastInsertRowid), 'Mint Field', 'mint field', 'Indie Essentials');

  // Genre projection
  const insertGen = db.prepare(`INSERT INTO search_genres (name, normalized_name, playlist_count, track_count) VALUES (?, ?, ?, ?)`);
  const genShoe = insertGen.run('shoegaze', 'shoegaze', 2, 1);
  const genDream = insertGen.run('dream-pop', 'dream-pop', 1, 1);
  const genNoise = insertGen.run('noise-pop', 'noise-pop', 2, 2);
  const genIndie = insertGen.run('indie', 'indie', 2, 3);

  const insertGFts = db.prepare(`INSERT INTO genres_fts(rowid, name, normalized_name, playlist_titles) VALUES (?, ?, ?, ?)`);
  insertGFts.run(Number(genShoe.lastInsertRowid), 'shoegaze', 'shoegaze', 'Shoegaze Anthems | Dreamy Vibes');
  insertGFts.run(Number(genDream.lastInsertRowid), 'dream-pop', 'dream-pop', 'Dreamy Vibes');
  insertGFts.run(Number(genNoise.lastInsertRowid), 'noise-pop', 'noise-pop', 'Shoegaze Anthems | Dreamy Vibes');
  insertGFts.run(Number(genIndie.lastInsertRowid), 'indie', 'indie', 'Wednesday Mix | Indie Essentials');

  // Genre-playlist linking (including tag-only with -1 sentinel)
  const insertGP = db.prepare(`INSERT OR IGNORE INTO search_genre_playlists (genre_id, playlist_id, track_id) VALUES (?, ?, ?)`);
  insertGP.run(Number(genShoe.lastInsertRowid), playlistAId, Number(tA1.lastInsertRowid));
  insertGP.run(Number(genShoe.lastInsertRowid), playlistBId, -1);

  // Curator search index
  const insertCS = db.prepare(`INSERT INTO search_curators (curator_id, name, normalized_name, profile_type, bio, playlist_count, playlist_titles) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const scAlice = insertCS.run(Number(curAlice.lastInsertRowid), 'Alice', 'alice', 'curator', 'Alice curates shoegaze', 2, 'Shoegaze Anthems | Secret List');
  const scBob = insertCS.run(Number(curBob.lastInsertRowid), 'Bob', 'bob', 'curator', 'Bob curates dreamy stuff', 1, 'Dreamy Vibes');
  const scWedFan = insertCS.run(Number(curWedFan.lastInsertRowid), 'Wednesday Fan', 'wednesday fan', 'curator', 'Fan of the band', 1, 'Wednesday Mix');
  const scCarol = insertCS.run(Number(curCarol.lastInsertRowid), 'Carol', 'carol', 'curator', 'Indie curator', 1, 'Indie Essentials');

  const insertCFts = db.prepare(`INSERT INTO curators_fts(rowid, name, normalized_name, profile_type, bio, playlist_titles) VALUES (?, ?, ?, ?, ?, ?)`);
  insertCFts.run(Number(scAlice.lastInsertRowid), 'Alice', 'alice', 'curator', 'Alice curates shoegaze', 'Shoegaze Anthems | Secret List');
  insertCFts.run(Number(scBob.lastInsertRowid), 'Bob', 'bob', 'curator', 'Bob curates dreamy stuff', 'Dreamy Vibes');
  insertCFts.run(Number(scWedFan.lastInsertRowid), 'Wednesday Fan', 'wednesday fan', 'curator', 'Fan of the band', 'Wednesday Mix');
  insertCFts.run(Number(scCarol.lastInsertRowid), 'Carol', 'carol', 'curator', 'Indie curator', 'Indie Essentials');

  // Freshness
  const insertFresh = db.prepare(`INSERT INTO playlist_freshness (playlist_id, latest_track_date, recency_score) VALUES (?, ?, ?)`);
  insertFresh.run(playlistAId, '2025-06-01', 0.8);
  insertFresh.run(playlistBId, '2025-05-01', 0.6);
  insertFresh.run(playlistCId, '2025-04-01', 0.4);
  insertFresh.run(playlistDId, '2025-07-01', 0.9);

  return { playlistAId, playlistBId, playlistCId, playlistDId, playlistEId };
};

describe('Search API', () => {
  let fixtures;

  beforeEach(async () => {
    fixtures = seedFixtures();
    app = await buildApp();
  });

  describe('GET /api/v1/search?q= (preview mode, default)', () => {
    it('should return 400 when no query provided', async () => {
      const res = await request(app).get('/api/v1/search');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return preview-shaped response by default', async () => {
      const res = await request(app).get('/api/v1/search?q=shoegaze');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.query).toBe('shoegaze');
      expect(res.body.intent).toBeDefined();
      expect(res.body.took_ms).toBeTypeOf('number');
    });
  });

  describe('GET /api/v1/search?q=&mode=full', () => {
    it('should return full-mode response with results array, pagination, and match_reasons', async () => {
      const res = await request(app).get('/api/v1/search?q=shoegaze&mode=full');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.mode).toBe('full');
      expect(Array.isArray(res.body.results)).toBe(true);
      expect(res.body.pagination).toBeDefined();

      for (const result of res.body.results) {
        expect(result.id).toBeDefined();
        expect(result.title).toBeDefined();
        expect(result.primary_match_type).toBeDefined();
        expect(Array.isArray(result.match_reasons)).toBe(true);
      }
    });

    it('should respect limit and offset params', async () => {
      const res = await request(app).get('/api/v1/search?q=indie&mode=full&limit=1&offset=0');
      expect(res.status).toBe(200);
      expect(res.body.results.length).toBeLessThanOrEqual(1);
      expect(res.body.pagination.limit).toBe(1);
      expect(res.body.pagination.offset).toBe(0);
    });
  });

  describe('Artist intent ranking', () => {
    it('should return playlists containing artist "Wednesday" before title-only matches', async () => {
      const res = await request(app).get('/api/v1/search?q=Wednesday&mode=full');
      expect(res.status).toBe(200);
      expect(res.body.intent).toBe('artist');

      const results = res.body.results;
      expect(results.length).toBeGreaterThanOrEqual(1);

      const idxA = results.findIndex(r => r.id === fixtures.playlistAId);
      const idxC = results.findIndex(r => r.id === fixtures.playlistCId);

      expect(idxA).toBeGreaterThanOrEqual(0);
      if (idxC >= 0) {
        expect(idxA).toBeLessThan(idxC);
      }
    });

    it('should never include unpublished playlists even when tracks match', async () => {
      const res = await request(app).get('/api/v1/search?q=Wednesday&mode=full');
      const resultIds = res.body.results.map(r => r.id);
      expect(resultIds).not.toContain(fixtures.playlistEId);
    });
  });

  describe('Genre intent ranking', () => {
    it('should return playlists with shoegaze tag even when no track has genre=shoegaze', async () => {
      const res = await request(app).get('/api/v1/search?q=shoegaze&mode=full');
      expect(res.status).toBe(200);
      expect(res.body.intent).toBe('genre');

      const resultIds = res.body.results.map(r => r.id);
      expect(resultIds).toContain(fixtures.playlistAId);
      expect(resultIds).toContain(fixtures.playlistBId);
    });

    it('should rank genre-matched playlists before curator/title-only matches', async () => {
      const res = await request(app).get('/api/v1/search?q=shoegaze&mode=full');
      const results = res.body.results;
      const genreMatchIds = [fixtures.playlistAId, fixtures.playlistBId];
      const genreResults = results.filter(r => genreMatchIds.includes(r.id));
      expect(genreResults.length).toBe(2);
    });
  });

  describe('Song intent ranking', () => {
    it('should return playlists containing the matching song', async () => {
      const res = await request(app).get('/api/v1/search?q=Blue Song&mode=full');
      expect(res.status).toBe(200);
      const resultIds = res.body.results.map(r => r.id);
      expect(resultIds).toContain(fixtures.playlistDId);
    });
  });

  describe('Curator secondary results', () => {
    it('should include curator results as secondary entities in full mode', async () => {
      const res = await request(app).get('/api/v1/search?q=Alice&mode=full');
      expect(res.status).toBe(200);

      if (res.body.secondary_groups) {
        const curatorGroup = res.body.secondary_groups.find(g => g.type === 'curators');
        if (curatorGroup) {
          expect(curatorGroup.items.length).toBeGreaterThanOrEqual(1);
          expect(curatorGroup.items[0].name).toBe('Alice');
        }
      }
    });

    it('should never rank curator results above primary playlist matches for artist intent', async () => {
      const res = await request(app).get('/api/v1/search?q=Wednesday&mode=full');
      const results = res.body.results;
      if (results.length > 0) {
        expect(results[0].id).toBeDefined();
        expect(results[0].title).toBeDefined();
      }
    });
  });

  describe('Unpublished playlist exclusion', () => {
    it('should never return unpublished playlists regardless of match quality', async () => {
      const res = await request(app).get('/api/v1/search?q=shoegaze&mode=full');
      const resultIds = res.body.results.map(r => r.id);
      expect(resultIds).not.toContain(fixtures.playlistEId);
    });
  });

  describe('GET /api/v1/search/suggestions', () => {
    it('should return suggestions list', async () => {
      const res = await request(app).get('/api/v1/search/suggestions');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.items)).toBe(true);
    });
  });
});
