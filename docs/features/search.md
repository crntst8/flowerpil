# Site Search

## Architecture

Site search is split into backend service logic and two frontend consumers (dropdown preview and full search page).

### Backend

- **Route:** `server/routes/search.js` (`/api/v1/search`) validates params and delegates to the search service. Also serves `/api/v1/search/suggestions` for editorial suggestion cards.
- **Service:** `server/services/siteSearchService.js` owns query normalization, intent inference, SQL candidate fetching, score aggregation, and response formatting. Exports `searchPreview()` and `searchFull()`.
- **Utilities:** `server/utils/searchUtils.js` provides `normalizeQuery()`, `tokenizeQuery()`, `buildFtsMatch()`, `computeRecencyScore()`, `computeTitleBoost()`, `computeTagBoost()`, `computeFinalScore()`, and `inferIntent()`.
- **Schema:** `schema/search.sql` defines FTS virtual tables and projection/helper tables.
- **Rebuild script:** `server/scripts/rebuild-search-index.js` applies the search schema and bulk-loads indexes.
- **Migration 103:** `server/database/migrations/103_search_curator_index_and_search_schema_sync.js` creates curator search tables for existing databases.

### Frontend

- **SearchBar dropdown:** `src/core/components/SearchBar.jsx` uses `useSearch({ mode: 'preview' })` for debounced dropdown results. Pressing Enter navigates to `/search?q=<query>`. Clicking or arrow-selecting a preview item navigates directly to `/playlist/:id`.
- **Search results page:** `src/modules/playlists/components/SearchResultsPage.jsx` at route `/search`. Reads `?q=` from URL, calls API in `mode=full`, renders ranked playlist results with match explanations and secondary curator results.
- **Hooks:** `src/core/hooks/useSearch.js` exports `useSearch` (debounced, for preview) and `useFullSearch` (one-shot, for search page).
- **ApiClient:** `src/core/api/ApiClient.js` `search(query, { mode, limit, offset })` builds the query string.

## API

### `GET /api/v1/search?q=<query>&mode=preview`

Returns grouped results for the dropdown. Response shape:

```json
{
  "success": true,
  "query": "shoegaze",
  "intent": "genre",
  "took_ms": 12.5,
  "groups": [
    {
      "type": "playlists_by_genre",
      "items": [
        {
          "id": 1,
          "title": "Dream Haze",
          "curator": "curator_name",
          "score": 3.5,
          "primary_match_type": "genre_tag",
          "match_reasons": ["genre_tag"]
        }
      ]
    },
    {
      "type": "playlists_title",
      "items": [...]
    }
  ]
}
```

### `GET /api/v1/search?q=<query>&mode=full&limit=20&offset=0`

Returns a flat ranked results array with match reasons, plus secondary curator groups. Response shape:

```json
{
  "success": true,
  "query": "shoegaze",
  "intent": "genre",
  "mode": "full",
  "took_ms": 15.2,
  "results": [
    {
      "id": 1,
      "title": "Dream Haze",
      "curator": "curator_name",
      "publish_date": "2025-06-15",
      "tags": "shoegaze, dreampop",
      "score": 3.5,
      "primary_match_type": "genre_tag",
      "match_reasons": ["genre_tag", "playlist_title"]
    }
  ],
  "secondary_groups": [
    {
      "type": "curators",
      "items": [
        {
          "curator_id": 5,
          "name": "Shoegaze Weekly",
          "profile_type": "label",
          "playlist_count": 12
        }
      ]
    }
  ],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "total": 42,
    "has_more": true
  }
}
```

### `GET /api/v1/search/suggestions?limit=4`

Returns editorial suggestion cards for the empty search state.

## Intent Inference

The service infers query intent from FTS probes:

| Intent | Trigger | Ranking effect |
|--------|---------|----------------|
| `artist` | Artist name found in `artists_fts` | Playlists containing that artist get +2.0 boost |
| `genre` | Genre name found in `genres_fts` | Playlists with genre tag or track genre get +2.0 boost |
| `song` | Track title found in `tracks_fts` | Playlists containing that track get +2.0 boost |
| `time_period` | Time-related keywords detected | Fresh playlists surfaced |
| `mixed` | No clear single intent | All sources queried with +0.5 boost |

## Ranking

Playlists are the primary entity for all intents. Score combines:
- BM25 relevance from FTS
- Recency score from `playlist_freshness` or computed from dates
- Title boost (exact/partial match)
- Tag boost (query tokens in playlist tags)
- Intent boost (+2.0 for primary intent match, +0.5 for secondary)

Curators appear only as secondary results after all primary playlist matches.

## FTS Tables

| Table | Content source | Fields |
|-------|---------------|--------|
| `playlists_fts` | Published playlists | title, description, tags, curator_name |
| `tracks_fts` | Tracks joined to playlists | title, artist_name, album, genre |
| `artists_fts` | Distinct artists from tracks | name, normalized_name |
| `genres_fts` | Genres from tracks + playlist tags | name, normalized_name |
| `curators_fts` | Curators with published playlists | name, normalized_name, bio, playlist_titles |

## Projection/Helper Tables

| Table | Purpose |
|-------|---------|
| `search_artists` | Distinct artist names for probe queries |
| `search_genres` | Distinct genre names from tracks + playlist tags |
| `search_artist_playlists` | Maps artists to playlists containing their tracks |
| `search_genre_playlists` | Maps genres to playlists (track genre or tag match; tag-only uses sentinel track_id=-1) |
| `search_curators` | Curator metadata for search results |
| `playlist_freshness` | Pre-computed recency scores per playlist |
| `search_editorials` | Admin-managed suggestion cards shown in empty search state |

## Known Limitations

- `tracks.genre` coverage is sparse for older imported playlists. Genre search accuracy depends on playlist tags for those playlists.
- `playlist_freshness` may be unpopulated if the rebuild script hasn't run; the service falls back to `published_at`/`updated_at` for recency.
- The rebuild script must be re-run after bulk playlist imports or curator metadata changes to update FTS and projection tables.

## Files

| File | Purpose |
|------|---------|
| `server/routes/search.js` | Express route handler, delegates to service |
| `server/services/siteSearchService.js` | Core search logic: candidates, ranking, response formatting |
| `server/utils/searchUtils.js` | Query normalization, intent inference, scoring utilities |
| `schema/search.sql` | FTS schema DDL |
| `server/scripts/rebuild-search-index.js` | Bulk index rebuild script |
| `server/database/migrations/103_search_curator_index_and_search_schema_sync.js` | Curator search tables migration |
| `src/core/components/SearchBar.jsx` | Dropdown search bar (preview mode) |
| `src/core/hooks/useSearch.js` | `useSearch` (preview) and `useFullSearch` (full page) hooks |
| `src/core/api/ApiClient.js` | `search()` method with mode/limit/offset |
| `src/modules/playlists/components/SearchResultsPage.jsx` | Full search results page at `/search` |
| `server/api/__tests__/search.test.js` | Backend search contract tests (13 tests) |
