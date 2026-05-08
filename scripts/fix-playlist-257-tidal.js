#!/usr/bin/env node
/**
 * Fix Tidal linking for playlist 257 by populating ISRCs from Spotify
 * and then re-running the Tidal search.
 */

import { getDatabase, getQueries } from '../server/database/db.js';
import SpotifyService from '../server/services/spotifyService.js';
import { searchTidalByTrack } from '../server/services/tidalService.js';

const PLAYLIST_ID = 257;

async function main() {
  const db = getDatabase();
  const queries = getQueries();
  const spotifyService = new SpotifyService();

  // Get tracks for playlist 257
  const tracks = queries.getTracksByPlaylistId.all(PLAYLIST_ID);
  console.log(`Found ${tracks.length} tracks for playlist ${PLAYLIST_ID}`);

  for (const track of tracks) {
    console.log(`\n--- Processing: ${track.artist} - ${track.title} ---`);

    // Step 1: Get ISRC from Spotify if we have spotify_id but no ISRC
    if (track.spotify_id && !track.isrc) {
      console.log(`  Fetching ISRC from Spotify for track ID: ${track.spotify_id}`);
      try {
        const token = await spotifyService.getClientCredentialsToken();
        const response = await spotifyService.makeRateLimitedRequest({
          method: 'get',
          url: `${spotifyService.baseURL}/tracks/${track.spotify_id}`,
          headers: { 'Authorization': `Bearer ${token}` }
        });

        const isrc = response.data?.external_ids?.isrc;
        if (isrc) {
          console.log(`  Found ISRC: ${isrc}`);
          db.prepare('UPDATE tracks SET isrc = ? WHERE id = ?').run(isrc, track.id);
          track.isrc = isrc;
        } else {
          console.log(`  No ISRC found in Spotify response`);
        }
      } catch (error) {
        console.error(`  Error fetching from Spotify: ${error.message}`);
      }
    } else if (track.isrc) {
      console.log(`  Already has ISRC: ${track.isrc}`);
    } else {
      console.log(`  No Spotify ID to fetch ISRC from`);
    }

    // Step 2: Search Tidal by ISRC if we now have one
    if (track.isrc && !track.tidal_id) {
      console.log(`  Searching Tidal by ISRC: ${track.isrc}`);
      try {
        const tidalResult = await searchTidalByTrack({ isrc: track.isrc, artist: track.artist, title: track.title });
        if (tidalResult && tidalResult.url) {
          console.log(`  Found on Tidal: ${tidalResult.url}`);

          // Extract tidal_id from URL
          const tidalIdMatch = tidalResult.url.match(/\/track\/(\d+)/);
          const tidalId = tidalIdMatch ? tidalIdMatch[1] : null;

          db.prepare(`
            UPDATE tracks SET
              tidal_id = ?,
              tidal_url = ?,
              match_confidence_tidal = ?,
              match_source_tidal = ?,
              linking_updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(tidalId, tidalResult.url, tidalResult.confidence, tidalResult.source, track.id);

          console.log(`  Updated track with Tidal link!`);
        } else {
          console.log(`  No Tidal match found`);
        }
      } catch (error) {
        console.error(`  Error searching Tidal: ${error.message}`);
      }

      // Rate limit delay
      await new Promise(resolve => setTimeout(resolve, 200));
    } else if (track.tidal_id) {
      console.log(`  Already has Tidal ID: ${track.tidal_id}`);
    }
  }

  // Check final stats
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN isrc IS NOT NULL THEN 1 ELSE 0 END) as has_isrc,
      SUM(CASE WHEN tidal_id IS NOT NULL THEN 1 ELSE 0 END) as has_tidal
    FROM tracks WHERE playlist_id = ?
  `).get(PLAYLIST_ID);

  console.log(`\n=== Final Stats ===`);
  console.log(`Total tracks: ${stats.total}`);
  console.log(`With ISRC: ${stats.has_isrc}`);
  console.log(`With Tidal: ${stats.has_tidal}`);
}

main().catch(console.error);
