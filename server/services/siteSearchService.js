/**
 * Site Search Service
 *
 * Provides ranked mixed results for both preview (dropdown) and full (/search page) modes.
 * Playlist-first: artist, genre, and song intents surface playlists as primary results.
 * Curators appear as secondary results after primary playlist matches.
 */

import { performance } from 'perf_hooks';
import { getDatabase } from '../database/db.js';
import logger from '../utils/logger.js';
import {
  normalizeQuery,
  tokenizeQuery,
  buildFtsMatch,
  computeRecencyScore,
  computeTitleBoost,
  computeTagBoost,
  computeFinalScore,
  inferIntent
} from '../utils/searchUtils.js';

const PREVIEW_LIMIT = 5;
const FULL_DEFAULT_LIMIT = 20;
const FULL_MAX_LIMIT = 50;
const CANDIDATE_BUFFER = 40;

const getDb = () => getDatabase();

const safeStmt = (sql) => {
  try {
    return getDb().prepare(sql);
  } catch (_) {
    return null;
  }
};

const buildStatements = () => ({
  playlists: safeStmt(`
    SELECT
      p.id, p.title, p.description, p.tags, p.curator_name,
      p.publish_date, p.published_at, p.updated_at,
      pf.latest_track_date, pf.recency_score AS computed_recency,
      bm25(playlists_fts) AS bm25_score
    FROM playlists_fts
    JOIN playlists p ON p.id = playlists_fts.rowid
    LEFT JOIN playlist_freshness pf ON pf.playlist_id = p.id
    WHERE p.published = 1
      AND playlists_fts MATCH ?
    ORDER BY bm25_score ASC
    LIMIT ?
  `),

  artistTracks: safeStmt(`
    SELECT
      p.id AS playlist_id, p.title AS playlist_title, p.tags, p.curator_name,
      p.publish_date, p.published_at,
      pf.latest_track_date, pf.recency_score AS computed_recency,
      t.id AS track_id, t.title AS track_title, t.artist AS track_artist,
      bm25(tracks_fts) AS bm25_score
    FROM tracks_fts
    JOIN tracks t ON t.id = tracks_fts.rowid
    JOIN playlists p ON p.id = t.playlist_id
    LEFT JOIN playlist_freshness pf ON pf.playlist_id = p.id
    WHERE p.published = 1
      AND tracks_fts MATCH ?
    ORDER BY bm25_score ASC, pf.latest_track_date DESC
    LIMIT ?
  `),

  genreTracks: safeStmt(`
    SELECT
      p.id AS playlist_id, p.title AS playlist_title, p.tags, p.curator_name,
      p.publish_date, p.published_at,
      pf.latest_track_date, pf.recency_score AS computed_recency,
      t.id AS track_id, t.title AS track_title, t.artist AS track_artist,
      t.genre AS track_genre,
      bm25(tracks_fts) AS bm25_score
    FROM tracks_fts
    JOIN tracks t ON t.id = tracks_fts.rowid
    JOIN playlists p ON p.id = t.playlist_id
    LEFT JOIN playlist_freshness pf ON pf.playlist_id = p.id
    WHERE p.published = 1
      AND tracks_fts MATCH ?
    ORDER BY bm25_score ASC, pf.latest_track_date DESC
    LIMIT ?
  `),

  genreTagPlaylists: safeStmt(`
    SELECT
      p.id, p.title, p.description, p.tags, p.curator_name,
      p.publish_date, p.published_at, p.updated_at,
      pf.latest_track_date, pf.recency_score AS computed_recency
    FROM search_genre_playlists sgp
    JOIN search_genres sg ON sg.id = sgp.genre_id
    JOIN playlists p ON p.id = sgp.playlist_id
    LEFT JOIN playlist_freshness pf ON pf.playlist_id = p.id
    WHERE p.published = 1
      AND sg.normalized_name = ?
    GROUP BY p.id
    LIMIT ?
  `),

  trackTitles: safeStmt(`
    SELECT
      p.id AS playlist_id, p.title AS playlist_title, p.tags, p.curator_name,
      p.publish_date, p.published_at,
      pf.latest_track_date, pf.recency_score AS computed_recency,
      t.id AS track_id, t.title AS track_title, t.artist AS track_artist,
      bm25(tracks_fts) AS bm25_score
    FROM tracks_fts
    JOIN tracks t ON t.id = tracks_fts.rowid
    JOIN playlists p ON p.id = t.playlist_id
    LEFT JOIN playlist_freshness pf ON pf.playlist_id = p.id
    WHERE p.published = 1
      AND tracks_fts MATCH ?
    ORDER BY bm25_score ASC, pf.latest_track_date DESC
    LIMIT ?
  `),

  freshest: safeStmt(`
    SELECT
      p.id, p.title, p.description, p.tags, p.curator_name,
      p.publish_date, p.published_at, p.updated_at,
      pf.latest_track_date, pf.recency_score AS computed_recency
    FROM playlists p
    LEFT JOIN playlist_freshness pf ON pf.playlist_id = p.id
    WHERE p.published = 1
    ORDER BY COALESCE(pf.recency_score, 0) DESC,
      datetime(COALESCE(pf.latest_track_date, p.published_at, p.publish_date, p.updated_at, p.created_at)) DESC
    LIMIT ?
  `),

  curatorSearch: safeStmt(`
    SELECT
      sc.curator_id, sc.name, sc.normalized_name, sc.profile_type,
      sc.bio, sc.playlist_count, sc.playlist_titles,
      bm25(curators_fts) AS bm25_score
    FROM curators_fts
    JOIN search_curators sc ON sc.id = curators_fts.rowid
    WHERE curators_fts MATCH ?
    ORDER BY bm25_score ASC
    LIMIT ?
  `),

  artistProbe: safeStmt(`
    SELECT name, normalized_name FROM artists_fts
    WHERE artists_fts MATCH ? ORDER BY bm25(artists_fts) ASC LIMIT 1
  `),

  genreProbe: safeStmt(`
    SELECT name, normalized_name FROM genres_fts
    WHERE genres_fts MATCH ? ORDER BY bm25(genres_fts) ASC LIMIT 1
  `),

  trackProbe: safeStmt(`
    SELECT track_title FROM (
      SELECT t.title AS track_title FROM tracks_fts
      JOIN tracks t ON t.id = tracks_fts.rowid
      WHERE tracks_fts MATCH ? ORDER BY bm25(tracks_fts) ASC LIMIT 1
    )
  `)
});

let _stmts = null;
const stmts = () => {
  if (!_stmts) _stmts = buildStatements();
  return _stmts;
};

const runProbe = (stmt) => (match) => {
  if (!match || !stmt) return null;
  return stmt.get(match);
};

const resolveRecency = (row) => {
  if (typeof row.computed_recency === 'number') return row.computed_recency;
  return computeRecencyScore(
    row.latest_track_date,
    row.published_at || row.publish_date || row.updated_at
  );
};

/**
 * Score and normalize a playlist row into a ranked result with match reasons.
 */
const toRankedPlaylist = (row, tokens, matchReasons, primaryMatchType, intentBoost = 0) => {
  const recency = resolveRecency(row);
  const titleBoost = computeTitleBoost(row.title || row.playlist_title, tokens);
  const tagBoost = computeTagBoost(row.tags, tokens);
  const baseScore = computeFinalScore({
    bm25: row.bm25_score ?? null,
    recency,
    titleBoost,
    tagBoost
  });

  return {
    id: row.id || row.playlist_id,
    title: row.title || row.playlist_title,
    curator: row.curator_name,
    publish_date: row.publish_date,
    published_at: row.published_at,
    latest_track_date: row.latest_track_date,
    description: row.description || null,
    tags: row.tags || null,
    recency_score: Number(recency.toFixed(4)),
    score: Number((baseScore + intentBoost).toFixed(4)),
    primary_match_type: primaryMatchType,
    match_reasons: matchReasons
  };
};

/**
 * Collect playlist candidates from all relevant sources based on intent.
 */
const collectCandidates = (query, tokens, intent, intentData) => {
  const s = stmts();
  const candidates = new Map();

  const addCandidate = (item) => {
    const id = item.id;
    const existing = candidates.get(id);
    if (!existing || item.score > existing.score) {
      candidates.set(id, item);
    } else if (existing) {
      // Merge match reasons
      const mergedReasons = [...new Set([...existing.match_reasons, ...item.match_reasons])];
      existing.match_reasons = mergedReasons;
    }
  };

  // Playlist title/description/tag matches (always run)
  const playlistMatch = buildFtsMatch(query, ['title', 'description', 'tags']);
  if (playlistMatch && s.playlists) {
    const rows = s.playlists.all(playlistMatch, CANDIDATE_BUFFER);
    for (const row of rows) {
      addCandidate(toRankedPlaylist(row, tokens, ['playlist_title'], 'playlist_title', 0));
    }
  }

  // Artist intent: track artist matches get a boost
  if ((intent === 'artist' || intent === 'mixed') && s.artistTracks) {
    const artistMatch = buildFtsMatch(query, ['artist_name']);
    if (artistMatch) {
      const rows = s.artistTracks.all(artistMatch, CANDIDATE_BUFFER);
      const seen = new Set();
      for (const row of rows) {
        if (seen.has(row.playlist_id)) continue;
        seen.add(row.playlist_id);
        const boost = intent === 'artist' ? 2.0 : 0.5;
        addCandidate(toRankedPlaylist(
          { ...row, id: row.playlist_id, title: row.playlist_title },
          tokens,
          ['artist'],
          'artist',
          boost
        ));
      }
    }
  }

  // Genre intent: track genre matches + tag-only matches via projection table
  if ((intent === 'genre' || intent === 'mixed') && s.genreTracks) {
    const genreMatch = buildFtsMatch(query, ['genre']);
    if (genreMatch) {
      const rows = s.genreTracks.all(genreMatch, CANDIDATE_BUFFER);
      const seen = new Set();
      for (const row of rows) {
        if (seen.has(row.playlist_id)) continue;
        seen.add(row.playlist_id);
        const boost = intent === 'genre' ? 2.0 : 0.5;
        addCandidate(toRankedPlaylist(
          { ...row, id: row.playlist_id, title: row.playlist_title },
          tokens,
          ['genre_track'],
          'genre_track',
          boost
        ));
      }
    }

    // Tag-only genre matches from projection table
    if (intentData?.normalized_name && s.genreTagPlaylists) {
      const tagRows = s.genreTagPlaylists.all(intentData.normalized_name, CANDIDATE_BUFFER);
      for (const row of tagRows) {
        const boost = intent === 'genre' ? 2.0 : 0.5;
        addCandidate(toRankedPlaylist(row, tokens, ['genre_tag'], 'genre_tag', boost));
      }
    }
  }

  // Song intent: track title matches
  if ((intent === 'song' || intent === 'mixed') && s.trackTitles) {
    const trackMatch = buildFtsMatch(query, ['title']);
    if (trackMatch) {
      const rows = s.trackTitles.all(trackMatch, CANDIDATE_BUFFER);
      const seen = new Set();
      for (const row of rows) {
        if (seen.has(row.playlist_id)) continue;
        seen.add(row.playlist_id);
        const boost = intent === 'song' ? 2.0 : 0.5;
        addCandidate(toRankedPlaylist(
          { ...row, id: row.playlist_id, title: row.playlist_title },
          tokens,
          ['track_title'],
          'track_title',
          boost
        ));
      }
    }
  }

  // Time period fallback
  if (intent === 'time_period' && s.freshest) {
    const rows = s.freshest.all(CANDIDATE_BUFFER);
    for (const row of rows) {
      addCandidate(toRankedPlaylist(row, tokens, ['recent'], 'recent', 0));
    }
  }

  return candidates;
};

/**
 * Fetch curator results as secondary entities.
 */
const fetchCuratorResults = (query, limit = 3) => {
  const s = stmts();
  if (!s.curatorSearch) return [];

  const match = buildFtsMatch(query, ['name', 'normalized_name', 'bio', 'playlist_titles']);
  if (!match) return [];

  try {
    return s.curatorSearch.all(match, limit).map(row => ({
      curator_id: row.curator_id,
      name: row.name,
      profile_type: row.profile_type,
      playlist_count: row.playlist_count,
      playlist_titles: row.playlist_titles
    }));
  } catch (_) {
    return [];
  }
};

/**
 * Public: search in preview mode (dropdown).
 * Returns grouped results compatible with existing dropdown UI.
 */
export const searchPreview = ({ query: rawInput }) => {
  const startedAt = performance.now();
  const query = normalizeQuery(rawInput);

  if (!query) return { success: false, error: 'Missing search query parameter `q`' };

  const tokens = tokenizeQuery(query);
  const s = stmts();

  const probes = {
    genre: runProbe(s.genreProbe),
    artist: runProbe(s.artistProbe),
    track: runProbe(s.trackProbe)
  };

  const inference = inferIntent({ query, tokens, probes });
  const intent = inference.intent;

  // Collect candidates and sort
  const candidates = collectCandidates(query, tokens, intent, inference.data);
  const ranked = Array.from(candidates.values()).sort((a, b) => b.score - a.score);

  // Group into legacy format for preview
  const groups = [];
  const addGroup = (type, items) => {
    if (items.length) groups.push({ type, items: items.slice(0, PREVIEW_LIMIT) });
  };

  // Primary playlist results grouped by match type
  const intentPlaylists = ranked.filter(r => r.primary_match_type !== 'playlist_title');
  const titlePlaylists = ranked.filter(r => r.primary_match_type === 'playlist_title');

  if (intent === 'artist') {
    addGroup('playlists_by_artist', intentPlaylists.filter(r => r.match_reasons.includes('artist')));
  } else if (intent === 'genre') {
    addGroup('playlists_by_genre', intentPlaylists.filter(r =>
      r.match_reasons.includes('genre_tag') || r.match_reasons.includes('genre_track')
    ));
  } else if (intent === 'song') {
    addGroup('playlists_by_track', intentPlaylists.filter(r => r.match_reasons.includes('track_title')));
  } else if (intent === 'time_period') {
    addGroup('recent_playlists', ranked);
  }

  addGroup('playlists_title', titlePlaylists);

  // Fallback
  if (!groups.length && s.freshest) {
    const fallbackRows = s.freshest.all(PREVIEW_LIMIT);
    const fallbackItems = fallbackRows.map(row =>
      toRankedPlaylist(row, tokens, ['recent'], 'recent', 0)
    );
    addGroup('recent_playlists', fallbackItems);
  }

  const duration = Number((performance.now() - startedAt).toFixed(2));

  try {
    logger.info('[search] preview query', { query, intent, duration, groupCount: groups.length });
  } catch (_) {}

  return {
    success: true,
    query,
    intent,
    took_ms: duration,
    groups
  };
};

/**
 * Public: search in full mode (search results page).
 * Returns a flat ranked results array with match reasons, plus secondary curator groups.
 */
export const searchFull = ({ query: rawInput, limit: rawLimit, offset: rawOffset }) => {
  const startedAt = performance.now();
  const query = normalizeQuery(rawInput);

  if (!query) return { success: false, error: 'Missing search query parameter `q`' };

  const tokens = tokenizeQuery(query);
  const s = stmts();

  const limitNum = Math.min(
    Math.max(1, parseInt(rawLimit, 10) || FULL_DEFAULT_LIMIT),
    FULL_MAX_LIMIT
  );
  const offsetNum = Math.max(0, parseInt(rawOffset, 10) || 0);

  const probes = {
    genre: runProbe(s.genreProbe),
    artist: runProbe(s.artistProbe),
    track: runProbe(s.trackProbe)
  };

  const inference = inferIntent({ query, tokens, probes });
  const intent = inference.intent;

  // Collect all candidates
  const candidates = collectCandidates(query, tokens, intent, inference.data);
  const allResults = Array.from(candidates.values()).sort((a, b) => b.score - a.score);

  // Paginate
  const paginatedResults = allResults.slice(offsetNum, offsetNum + limitNum);

  // Secondary: curator results
  const curatorResults = fetchCuratorResults(query, 5);
  const secondaryGroups = [];
  if (curatorResults.length) {
    secondaryGroups.push({ type: 'curators', items: curatorResults });
  }

  const duration = Number((performance.now() - startedAt).toFixed(2));

  try {
    logger.info('[search] full query', {
      query, intent, duration,
      totalResults: allResults.length,
      returnedResults: paginatedResults.length
    });
  } catch (_) {}

  return {
    success: true,
    query,
    intent,
    mode: 'full',
    took_ms: duration,
    results: paginatedResults,
    secondary_groups: secondaryGroups,
    pagination: {
      limit: limitNum,
      offset: offsetNum,
      total: allResults.length,
      has_more: offsetNum + limitNum < allResults.length
    }
  };
};
